/**
 * responseHelpers.js - Adds res.ok(data, status) to every response object.
 *
 * Every successful API call answers with the same envelope:  { ok: true, data }
 * Errors use { ok: false, error: { message, fields? } } (see errorHandler.js).
 * Adding a small helper to `res` inside a middleware is a common Express pattern;
 * underneath it is plain Express: res.status(201).json({...}).
 */
export function responseHelpers(req, res, next) {
  res.ok = (data, status = 200) => res.status(status).json({ ok: true, data });
  next();
}

/** API responses contain personal data (bookings, orders...), so browsers must never cache them. */
export function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
