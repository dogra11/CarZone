/**
 * asyncHandler.js - Lets async route handlers report errors to Express.
 *
 * WHY IS THIS NEEDED?
 * Express 4 catches errors that are THROWN synchronously inside a handler, but it does
 * not look at the Promise an async function returns. If an `await` fails, the Promise
 * rejects, Express never hears about it, and the browser waits until it times out.
 *
 * asyncHandler(fn) wraps a handler and forwards any rejection to next(err), so the
 * central error middleware (errorHandler.js) can send the usual JSON error response:
 *
 *   router.get('/bookings/:id', requireAuth, asyncHandler(booking.getOne));
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
