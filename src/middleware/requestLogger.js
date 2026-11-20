/**
 * requestLogger.js - Express middleware that prints "METHOD /path STATUS time" for
 * every request (what the "morgan" package does). It registers a listener for the
 * response's 'finish' event and immediately calls next().
 */
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export function requestLogger(req, res, next) {
  if (config.logRequests) {
    const startedAt = Date.now();
    res.on('finish', () => {
      // The hosting platform calls /api/health every few seconds; only log it when unhealthy.
      if (req.originalUrl === '/api/health' && res.statusCode === 200) return;
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
  }
  next();
}
