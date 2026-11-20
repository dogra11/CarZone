/**
 * auth.routes.js - express.Router() mounted at /api/auth
 * (register, login, logout, me, password reset, change password).
 *
 * Middleware run left to right on each route, e.g. for login:
 *   authLimiter (rate limit per IP) -> validateBody (422 on bad input) -> controller
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { config } from '../config/index.js';
import { schemas } from '../utils/shared.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as ctrl from '../controllers/auth.controller.js';

export const authLimiter = rateLimit({
  name: 'auth',
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  message: 'Too many attempts from this device. Please wait a few minutes and try again.',
});

const router = express.Router();
router.post('/register', authLimiter, validateBody(schemas.register), asyncHandler(ctrl.register));
router.post('/login', authLimiter, validateBody(schemas.login), asyncHandler(ctrl.login));
router.post('/logout', asyncHandler(ctrl.logout));
router.get('/me', asyncHandler(ctrl.me));
router.post('/forgot-password', authLimiter, validateBody(schemas.forgotPassword), asyncHandler(ctrl.forgotPassword));
router.post('/reset-password', authLimiter, validateBody(schemas.resetPassword), asyncHandler(ctrl.resetPassword));
router.put('/password', requireAuth, validateBody(schemas.changePassword), asyncHandler(ctrl.changePassword));

export default router;
