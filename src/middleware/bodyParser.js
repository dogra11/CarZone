/**
 * bodyParser.js - Request-body middleware for the /api routes, built on Express's
 * own parsers (express.json and express.raw - no extra package needed).
 *
 *  - requireJsonContentType : a write request WITH a body must say
 *                             "Content-Type: application/json", otherwise 415.
 *                             This also helps against CSRF: a plain HTML form on another
 *                             site cannot send JSON.
 *  - jsonBody               : express.json() parses the body into req.body (limit 100 KB,
 *                             bigger bodies get 413), then we make sure it is an object.
 *  - rawWebhookBody         : express.raw() keeps the EXACT bytes as a Buffer in req.body.
 *                             Used only by the Razorpay webhook, because its HMAC signature
 *                             is calculated over the raw bytes, not over re-serialised JSON.
 *
 * Errors from express.json (bad JSON, too large) are turned into our usual JSON error
 * shape by errorHandler.js.
 */
import express from 'express';
import { AppError } from '../utils/AppError.js';

export const BODY_LIMIT = '100kb';

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/** True when the request actually carries body bytes. */
function hasBody(req) {
  return req.get('transfer-encoding') !== undefined || Number(req.get('content-length')) > 0;
}

export function requireJsonContentType(req, res, next) {
  if (!WRITE_METHODS.includes(req.method) || !hasBody(req)) return next();
  const type = (req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return next(new AppError(415, 'Requests must be sent as JSON'));
  next();
}

/** express.json() accepts arrays too; every CarZone endpoint expects a JSON object. */
export function requireObjectBody(req, res, next) {
  if (Array.isArray(req.body)) return next(AppError.badRequest('Malformed JSON body'));
  next();
}

/** Use as: router.use(...jsonBody) - three middleware functions in order. */
export const jsonBody = [
  requireJsonContentType,
  express.json({ limit: BODY_LIMIT }),   // strict mode (default): only objects/arrays allowed
  requireObjectBody,
];

/** Use on the webhook route only: req.body becomes a Buffer with the exact bytes received. */
export const rawWebhookBody = [
  requireJsonContentType,
  express.raw({ type: 'application/json', limit: BODY_LIMIT }),
];
