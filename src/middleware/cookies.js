/**
 * cookies.js (middleware) - Fills req.cookies from the "Cookie" request header.
 *
 * Express does not parse cookies by itself. Instead of adding the cookie-parser package
 * we use our own 10-line parser (utils/cookies.js). The session cookie is protected by
 * our own HMAC signature (see auth.service.js), so Express "signed cookies" are not needed.
 * Cookies are WRITTEN with Express's built-in res.cookie() / res.clearCookie().
 */
import { parseCookies } from '../utils/cookies.js';

export function cookieParser(req, res, next) {
  req.cookies = parseCookies(req.get('cookie') || '');
  next();
}
