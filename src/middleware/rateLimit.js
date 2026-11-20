/**
 * rateLimit.js - Simple in-memory rate limiter (fixed window per client IP), written as
 * an Express middleware factory: rateLimit({...}) returns (req, res, next).
 *
 * Used on login/register/forgot-password/contact so a bot cannot try thousands of
 * passwords per minute. Together with the per-account lockout in auth.service.js
 * this gives two layers of brute-force protection.
 * req.ip is Express's client address. Behind a reverse proxy (Render) every request arrives
 * FROM the proxy, so without app.set('trust proxy', 1) all visitors would share ONE bucket
 * (one IP) and lock each other out. app.js enables it in production / with TRUST_PROXY=true.
 * The counters live in memory: a restart (or a sleeping free instance) resets them, and
 * several server instances would each count separately (fine for one small instance).
 */
import { AppError } from '../utils/AppError.js';

export function rateLimit({ windowMs, max, name = 'default', message = 'Too many requests. Please wait a few minutes and try again.' }) {
  const hits = new Map(); // key -> { count, resetAt }

  const limiter = (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${req.ip}`;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(AppError.tooMany(message));
    }

    // Occasional clean-up so the Map does not grow forever.
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    next();
  };
  limiter.reset = () => hits.clear();
  return limiter;
}
