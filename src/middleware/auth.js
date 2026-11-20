/**
 * auth.js - Authentication & role-based access control (RBAC) as Express middleware.
 *
 * An Express middleware is just a function (req, res, next). It can:
 *   - end the request (send a response / redirect), or
 *   - call next()     -> continue with the next middleware/handler, or
 *   - call next(err)  -> skip everything and jump to the error handler.
 *
 * AUTH FLOW (simple version):
 *  1. On login the server creates a random session token, stores its SHA-256 hash in
 *     the "sessions" table and sends the token to the browser in a signed, HttpOnly cookie.
 *  2. authenticate() runs for EVERY request (app.use): it reads that cookie, checks the
 *     HMAC signature, looks the session up and sets req.user (or null for guests).
 *  3. requireAuth blocks guests (401). requireRole('admin') blocks users with the
 *     wrong role (403). Routes stack them:
 *        router.get('/bookings', requireRole('customer'), asyncHandler(booking.listMine))
 *     or protect a whole router at once:  adminRouter.use(requireRole('admin'))
 */
import { AppError } from '../utils/AppError.js';
import { getUserFromSessionCookie, SESSION_COOKIE } from '../services/auth.service.js';

/** async because it queries the database - mount it wrapped in asyncHandler(). */
export async function authenticate(req, res, next) {
  req.user = null;
  const cookie = req.cookies[SESSION_COOKIE];
  if (cookie) {
    const session = await getUserFromSessionCookie(cookie);
    if (session) {
      req.user = session.user;
      req.sessionId = session.sessionId;
    }
  }
  next();
}

/** Any logged-in user may continue; guests get 401. */
export function requireAuth(req, res, next) {
  if (!req.user) return next(AppError.unauthorized());
  next();
}

/**
 * Middleware FACTORY: requireRole('admin') returns a middleware that allows the request
 * only if the logged-in user has one of the given roles (401 for guests, 403 otherwise).
 */
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) return next(AppError.forbidden('This area is restricted to ' + roles.join(' / ') + ' accounts'));
  next();
};

/**
 * Server-side guard for the admin screens (/admin/...), mounted with app.use('/admin', ...).
 * The React app also has a <ProtectedRoute role="admin">, and every admin API checks the
 * role, but this extra layer stops a non-admin from even downloading the admin page
 * (defence in depth). Inside a mounted middleware req.path is relative to '/admin'.
 */
export function adminPageGuard(req, res, next) {
  if (req.user?.role === 'admin') return next();
  const target = req.path === '/' ? '/admin' : `/admin${req.path}`;
  res.redirect(`/login?next=${encodeURIComponent(target)}${req.user ? '&denied=1' : ''}`);
}
