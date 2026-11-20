/**
 * errorHandler.js - The central Express ERROR-HANDLING middleware + the API 404 handler.
 *
 * Express recognises an error handler by its FOUR parameters: (err, req, res, next).
 * Normal middleware is skipped once an error happens; Express jumps straight here when
 *   - a handler calls next(err), or
 *   - a handler throws synchronously, or
 *   - an async handler wrapped in asyncHandler() rejects.
 *
 * Every error becomes the same JSON shape:   { ok: false, error: { message, fields? } }
 *
 *   AppError               -> its own status + message (expected problems: 401, 404, 422...)
 *   express.json() errors  -> 400 "Malformed JSON body" / 413 "Request body is too large"
 *   MySQL constraint codes -> 409 "This change conflicts with existing data."
 *   anything else          -> logged on the server, generic 500 (no internal details leak)
 */
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const DB_CONFLICT_CODES = ['ER_DUP_ENTRY', 'ER_CHECK_CONSTRAINT_VIOLATED', 'ER_ROW_IS_REFERENCED_2', 'ER_NO_REFERENCED_ROW_2'];

// eslint-disable-next-line no-unused-vars -- Express needs all 4 parameters to treat this as an error handler
export function errorHandler(err, req, res, next) {
  // If the response is already being streamed we cannot send JSON any more:
  // hand over to Express's default handler, which closes the connection.
  if (res.headersSent) return next(err);

  let status = 500;
  let message = 'Something went wrong on our side. Please try again.';
  let fields;

  if (err instanceof AppError) {
    ({ status, message, fields } = err);
  } else if (err?.type === 'entity.parse.failed') {
    // Thrown by express.json() when the body is not valid JSON
    status = 400;
    message = 'Malformed JSON body';
  } else if (err?.type === 'entity.too.large') {
    // Thrown by express.json()/express.raw() when the body is over the size limit
    status = 413;
    message = 'Request body is too large';
  } else if (err?.expose && err.status >= 400 && err.status < 500) {
    // Other client errors raised by Express's body parsers (e.g. unsupported charset)
    status = err.status;
    message = err.message;
  } else if (DB_CONFLICT_CODES.includes(err?.code)) {
    // A database rule blocked an inconsistent write - report it as a conflict, not a crash.
    status = 409;
    message = 'This change conflicts with existing data.';
    logger.warn(`${req.method} ${req.originalUrl} - ${err.message}`);
  } else {
    logger.error(`${req.method} ${req.originalUrl}`, err);
  }

  res.set('Cache-Control', 'no-store');
  res.status(status).json({ ok: false, error: { message, ...(fields ? { fields } : {}) } });
}

/** Last middleware of the /api router: no route matched -> JSON 404 (never the React page). */
export function notFound(req, res, next) {
  next(AppError.notFound(`Route not found: ${req.method} ${req.path}`));
}
