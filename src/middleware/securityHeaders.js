/**
 * securityHeaders.js - Express middleware that adds protective HTTP headers to every
 * response (what the "helmet" package does). It is the FIRST app.use() in app.js, so
 * even error responses and static files carry these headers.
 *
 * The Content-Security-Policy only allows scripts from our own server, so injected
 * <script> tags or inline onclick="" handlers can never run. The only outside sites
 * allowed are OpenStreetMap (contact map) and Razorpay Checkout (when test keys are set).
 *
 * HSTS (Strict-Transport-Security) is added only when the request arrived over HTTPS
 * (req.secure - behind Render's proxy this needs app.set('trust proxy', 1)). It tells the
 * browser to use https for this site from now on. Plain http://localhost never gets it.
 *
 * CORS: no Access-Control-Allow-Origin header is sent, so browsers block other websites
 * from reading our API responses. The React app is served from the same origin, so it
 * does not need CORS at all.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.razorpay.com",
  "font-src 'self'",
  "connect-src 'self' https://www.openstreetmap.org https://api.razorpay.com https://lumberjack.razorpay.com",
  'frame-src https://www.openstreetmap.org https://api.razorpay.com https://checkout.razorpay.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');   // 180 days
  next();
}
