/**
 * payments/razorpay.gateway.js - Real Razorpay integration (TEST mode), no npm package.
 *
 * Used automatically when RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are set in .env.
 *   1. createOrder  -> POST https://api.razorpay.com/v1/orders (HTTP Basic auth key:secret).
 *   2. The browser opens Razorpay Checkout (checkout.js) with that order id.
 *   3. Razorpay returns razorpay_order_id, razorpay_payment_id, razorpay_signature.
 *   4. verifySignature: HMAC-SHA256(order_id + "|" + payment_id, key_secret) must equal
 *      the signature - compared with crypto.timingSafeEqual. Only then do we confirm.
 *   5. Webhooks (payment.captured / payment.failed) are verified the same way with the
 *      webhook secret over the RAW request body (X-Razorpay-Signature header).
 *   6. refund -> POST /v1/payments/:id/refund
 */
import crypto from 'node:crypto';
import { config } from '../../config/index.js';
import { AppError } from '../../utils/AppError.js';

const API = 'https://api.razorpay.com/v1';

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Checkout signature check (pure function - unit tested with known vectors). */
export function verifyPaymentSignature({ orderId, paymentId, signature }, secret) {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

/** Webhook signature check over the raw body (pure function - unit tested). */
export function verifyWebhookSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

async function call(path, body) {
  const { keyId, keySecret } = config.razorpay;
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AppError(502, 'The payment gateway could not be reached. Please try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AppError(502, `Payment gateway error: ${data?.error?.description || res.status}`);
  return data;
}

export const RazorpayGateway = {
  name: 'razorpay',

  async createOrder(payment) {
    const order = await call('/orders', { amount: payment.amount_paise, currency: 'INR', receipt: payment.payment_ref, notes: { purpose: payment.purpose } });
    return { gatewayOrderId: order.id };
  },

  async refund(payment, amountPaise) {
    const r = await call(`/payments/${payment.gateway_payment_id}/refund`, { amount: amountPaise, notes: { payment_ref: payment.payment_ref } });
    return { gatewayRefundId: r.id };
  },

  async getStatus(payment) {
    if (!payment.gateway_payment_id) return { status: payment.status };
    const p = await call(`/payments/${payment.gateway_payment_id}`);
    return { status: p.status === 'captured' ? 'success' : p.status === 'failed' ? 'failed' : 'pending' };
  },

  verify: (fields) => verifyPaymentSignature(fields, config.razorpay.keySecret),
};
