/**
 * AppError.js - An Error that carries an HTTP status code.
 *
 * Services throw AppError for "expected" problems (bad input, not found, slot full...).
 * The central error handler turns it into a clean JSON response. Any other Error is
 * treated as a bug and returned as a generic 500 without leaking details.
 */
export class AppError extends Error {
  constructor(status, message, fields = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.fields = fields; // optional { fieldName: message } for form errors
  }

  static badRequest(msg, fields) { return new AppError(400, msg, fields); }
  static unauthorized(msg = 'Please log in to continue') { return new AppError(401, msg); }
  static forbidden(msg = 'You do not have permission to do that') { return new AppError(403, msg); }
  static notFound(msg = 'Not found') { return new AppError(404, msg); }
  static conflict(msg) { return new AppError(409, msg); }
  static unprocessable(msg, fields) { return new AppError(422, msg, fields); }
  static tooMany(msg) { return new AppError(429, msg); }
}
