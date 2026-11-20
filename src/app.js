/**
 * app.js - Builds the Express application:  const app = express()
 *
 * THE MIDDLEWARE PIPELINE (Express runs these top to bottom for every request; each one
 * either sends the response or calls next() to pass the request on):
 *
 *   1. securityHeaders   CSP, X-Frame-Options, nosniff ... (like helmet)
 *   2. requestLogger     "GET /api/services 200 4ms"      (like morgan)
 *   3. cookieParser      Cookie header -> req.cookies
 *   4. responseHelpers   adds res.ok(data, status)
 *   -  /api/health       health check for the hosting platform (before auth: no DB session lookup)
 *   5. authenticate      session cookie -> req.user (or null for guests)
 *   6. /api              the API router: body parsing + feature routers + JSON 404
 *   7. /admin            server-side guard: non-admins are redirected to /login
 *   8. express.static    real files from client/dist (JS, CSS, images, fonts)
 *   9. spaFallback       any other page URL -> index.html (React Router takes over)
 *  10. errorHandler      (err, req, res, next) - every error ends here as JSON
 *
 * createApp() only BUILDS the app; bootstrap.js starts it with app.listen().
 * Keeping them apart lets the tests start the same app on a random port.
 */
import express from 'express';
import { securityHeaders } from './middleware/securityHeaders.js';
import { requestLogger } from './middleware/requestLogger.js';
import { cookieParser } from './middleware/cookies.js';
import { responseHelpers } from './middleware/responseHelpers.js';
import { authenticate, adminPageGuard } from './middleware/auth.js';
import { asyncHandler } from './middleware/asyncHandler.js';
import { staticFiles, spaFallback } from './middleware/staticFiles.js';
import { errorHandler } from './middleware/errorHandler.js';
import { buildApiRouter } from './routes/index.js';
import { health } from './controllers/health.controller.js';
import { config } from './config/index.js';

export function createApp() {
  const app = express();

  // ---- App settings (must come BEFORE the first app.use(): Express reads them when it creates its router) ----
  app.disable('x-powered-by');   // do not advertise "X-Powered-By: Express" to attackers
  app.set('etag', false);        // API JSON is never cached (Cache-Control: no-store); static files keep their ETags
  // Simple query strings: ?a=1&b=2 -> { a: '1', b: '2' } (no nested objects; last value wins).
  // Express passes null when the URL has no "?", hence the `|| ''`.
  app.set('query parser', (str) => Object.fromEntries(new URLSearchParams(str || '')));
  // Deployed behind Render's proxy (or with TRUST_PROXY=true): trust exactly ONE proxy hop,
  // so req.ip is the real visitor (per-IP rate limiting works) and req.secure reflects https.
  // Trusting more hops than really exist would let a visitor fake their IP with a header.
  if (config.trustProxy) app.set('trust proxy', 1);

  // ---- Middleware pipeline (order matters) ----
  app.use(securityHeaders);
  app.use(requestLogger);
  app.use(cookieParser);
  app.use(responseHelpers);
  app.get('/api/health', asyncHandler(health));
  app.use(asyncHandler(authenticate));
  app.use('/api', buildApiRouter());
  app.use('/admin', adminPageGuard);
  app.use(staticFiles);
  app.use(spaFallback);

  // ---- Error handling: MUST be registered last, and MUST have 4 parameters ----
  app.use(errorHandler);

  return app;
}
