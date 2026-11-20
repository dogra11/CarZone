/**
 * validate.js - Validation middleware (Express style: (req, res, next)).
 *
 * validateBody(schemas.booking) checks req.body with the SAME rules the React forms use
 * (shared/validation.js). Clean values are stored on req.valid; if anything is wrong,
 * next(err) sends a 422 response listing every field error so the form can highlight them.
 */
import { validate } from '../utils/shared.js';
import { AppError } from '../utils/AppError.js';

export const validateBody = (schema) => (req, res, next) => {
  const { valid, errors, values } = validate(schema, req.body);
  if (!valid) return next(AppError.unprocessable('Please correct the highlighted fields', errors));
  req.valid = values;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const { valid, errors, values } = validate(schema, req.query);
  if (!valid) return next(AppError.unprocessable('Invalid query parameters', errors));
  req.validQuery = values;
  next();
};

/** Parses :id style URL parameters (req.params) as positive integers. */
export function idParam(req, name = 'id') {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n < 1) throw AppError.badRequest(`Invalid ${name}`);
  return n;
}
