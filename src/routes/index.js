/**
 * routes/index.js - Builds the complete /api router (an express.Router()).
 *
 * ORDER MATTERS - Express runs middleware in the order it was registered:
 *   1. noStore             : API answers are never cached by the browser
 *   2. Razorpay webhook    : uses express.raw() to keep the exact body bytes for its
 *                            HMAC signature check, so it must come BEFORE express.json()
 *                            (a request body stream can only be read once)
 *   3. jsonBody            : 415 for non-JSON writes, express.json() (100 KB), object check
 *   4. feature routers     : /auth, /admin, then public and customer routes
 *   5. notFound            : nothing matched -> JSON 404 (unknown /api URLs never get the React page)
 */
import express from 'express';
import { jsonBody, rawWebhookBody } from '../middleware/bodyParser.js';
import { noStore } from '../middleware/responseHelpers.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { notFound } from '../middleware/errorHandler.js';
import * as payment from '../controllers/payment.controller.js';
import authRoutes from './auth.routes.js';
import publicRoutes from './public.routes.js';
import customerRoutes from './customer.routes.js';
import adminRoutes from './admin.routes.js';

export function buildApiRouter() {
  const api = express.Router();
  api.use(noStore);

  // Razorpay webhook (server-to-server; authenticity is proven by the HMAC signature)
  api.post('/payments/webhook/razorpay', ...rawWebhookBody, asyncHandler(payment.razorpayWebhook));

  api.use(...jsonBody);
  api.use('/auth', authRoutes);
  api.use('/admin', adminRoutes);
  api.use(publicRoutes);
  api.use(customerRoutes);
  api.use(notFound);
  return api;
}
