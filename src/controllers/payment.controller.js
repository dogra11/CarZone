/**
 * payment.controller.js - Gateway-style payment endpoints (shared by bookings and orders).
 *
 *   POST /api/payments                  create a payment session (idempotent)
 *   POST /api/payments/:id/simulate     simulator: submit card / UPI / bank / wallet details
 *   POST /api/payments/:id/verify       OTP, bank decision or Razorpay signature
 *   GET  /api/payments/:id/status       polling (UPI approval)
 *   POST /api/payments/webhook/razorpay server-to-server webhook (signature checked)
 *
 * Express note: the webhook route uses express.raw() (see routes/index.js), so there
 * req.body is a Buffer with the exact bytes Razorpay sent - the HMAC signature is
 * checked over those bytes. All other routes get a parsed object from express.json().
 */
import * as payments from '../services/payments/payment.service.js';
import { idParam } from '../middleware/validate.js';

export async function create(req, res) {
  const payment = await payments.createPayment(req.user, req.valid, req.body);
  res.ok({ payment }, 201);
}

export async function simulate(req, res) {
  const result = await payments.startSimulatedPayment(req.user, idParam(req), req.valid.method, req.body.details || {});
  res.ok(result);
}

export async function verify(req, res) {
  const payment = await payments.verifyPayment(req.user, idParam(req), req.body);
  const message = payment.status === 'success' ? `Payment successful (${payment.paymentRef}).` : `Payment failed: ${payment.failureReason}`;
  res.ok({ payment, message });
}

export const status = async (req, res) => res.ok({ payment: await payments.getPaymentStatus(req.user, idParam(req)) });

export const listMine = async (req, res) => res.ok(await payments.listPaymentsForUser(req.user.id));

export async function razorpayWebhook(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  res.ok(await payments.handleRazorpayWebhook(rawBody, req.get('x-razorpay-signature')));
}
