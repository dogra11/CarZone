/**
 * payments/payment.service.js - Payment LIFECYCLE shared by wash bookings and store orders.
 *
 *   created ──start──> pending ──verify OK──> success ──refund──> refund_pending ──> refunded
 *      │                  │
 *      └──── expired / declined / wrong OTP / bad signature ──> failed   (customer can retry)
 *
 * Golden rules (each one is an interview talking point):
 *  1. AMOUNT FROM THE SERVER: the amount is copied from the booking/order row. A request
 *     that tries to send an amount is rejected (tamper protection).
 *  2. IDEMPOTENCY: the browser sends an idempotency key per checkout attempt. Repeating
 *     the call (double click, network retry) returns the SAME payment row; verifying an
 *     already-successful payment just returns it - nothing is charged or confirmed twice.
 *  3. SERVER-SIDE VERIFICATION: a booking/order is confirmed only after the server has
 *     verified the payment (OTP for the simulator, HMAC signature for Razorpay), inside a
 *     transaction that locks the payment and the booking/order rows (SELECT ... FOR UPDATE).
 *  4. PCI: card number and CVV are validated in memory and thrown away; only a masked
 *     "Visa **** 1111" is stored.
 */
import crypto from 'node:crypto';
import { one, all, run, transaction } from '../../db/connection.js';
import { config } from '../../config/index.js';
import { AppError } from '../../utils/AppError.js';
import { nowSql } from '../../utils/dates.js';
import { randomCode } from '../../utils/ids.js';
import { percentOf } from '../../utils/money.js';
import { PAYMENT_METHOD_LABELS } from '../../utils/shared.js';
import { addHistory, addOrderHistory } from '../history.service.js';
import { activeGateway, gatewayFor, razorpayEnabled } from './index.js';
import { SimulatedGateway, DEMO_OTP, UPI_APPROVAL_SECONDS, hashOtp } from './simulated.gateway.js';
import { verifyWebhookSignature } from './razorpay.gateway.js';

const OPEN = ['created', 'pending'];

export function mapPayment(r) {
  return {
    id: r.id,
    paymentRef: r.payment_ref,
    purpose: r.purpose,
    bookingId: r.booking_id,
    orderId: r.order_id,
    targetCode: r.target_code ?? null,
    customerName: r.customer_name ?? null,
    customerEmail: r.customer_email ?? null,
    gateway: r.gateway,
    gatewayOrderId: r.gateway_order_id,
    gatewayPaymentId: r.gateway_payment_id,
    amountPaise: r.amount_paise,
    currency: r.currency,
    method: r.method,
    methodLabel: r.method ? PAYMENT_METHOD_LABELS[r.method] : null,
    methodDetail: r.method_detail,
    status: r.status,
    failureReason: r.failure_reason,
    attempts: r.attempts,
    expiresAt: r.expires_at,
    verifiedAt: r.verified_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    refund: r.refund_id ? { id: r.refund_id, status: r.refund_status, amountPaise: r.refund_amount, percent: r.refund_percent, ref: r.refund_ref, manual: Boolean(r.refund_manual) } : null,
  };
}

export const PAYMENT_SELECT = `
  SELECT p.*, COALESCE(b.booking_code, o.order_code) AS target_code, u.name AS customer_name, u.email AS customer_email,
         r.id AS refund_id, r.status AS refund_status, r.amount_paise AS refund_amount, r.refund_percent, r.refund_ref, r.manual AS refund_manual
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN orders o ON o.id = p.order_id
    LEFT JOIN refunds r ON r.payment_id = p.id`;

const getRow = (id) => one(`${PAYMENT_SELECT} WHERE p.id = ?`, id);

async function loadTarget(purpose, id, { lock = false } = {}) {
  const forUpdate = lock ? ' FOR UPDATE' : '';
  const row = purpose === 'booking'
    ? await one(`SELECT id, user_id, status, total_paise, booking_code AS code FROM bookings WHERE id = ?${forUpdate}`, id)
    : await one(`SELECT id, user_id, status, total_paise, order_code AS code, payment_method FROM orders WHERE id = ?${forUpdate}`, id);
  if (!row) throw AppError.notFound(purpose === 'booking' ? 'Booking not found' : 'Order not found');
  return row;
}

/** Owner check + automatic expiry of stale sessions. */
async function loadOwned(user, paymentId) {
  const p = await getRow(paymentId);
  if (!p || (user.role !== 'admin' && p.user_id !== user.id)) throw AppError.notFound('Payment not found');
  if (OPEN.includes(p.status) && p.gateway !== 'cod' && p.expires_at < nowSql()) {
    await markFailed(p.id, 'Payment session expired - please try again');
    return getRow(paymentId);
  }
  return p;
}

// ---------------------------------------------------------------------------
// 1. Create (one per checkout attempt, idempotent)
// ---------------------------------------------------------------------------
export async function createPayment(user, { purpose, targetId, idempotencyKey }, rawBody = {}) {
  if (['amount', 'amountPaise', 'amount_paise'].some((k) => k in rawBody)) {
    throw AppError.badRequest('The amount is calculated by the server and cannot be sent by the client');
  }

  const existing = await one('SELECT * FROM payments WHERE idempotency_key = ?', idempotencyKey);
  if (existing) {
    if (existing.user_id !== user.id || existing.purpose !== purpose || (existing.booking_id ?? existing.order_id) !== targetId) {
      throw AppError.conflict('This idempotency key was already used for a different payment');
    }
    return paymentResponse(await getRow(existing.id));
  }

  const target = await loadTarget(purpose, targetId);
  if (target.user_id !== user.id) throw AppError.notFound(purpose === 'booking' ? 'Booking not found' : 'Order not found');
  if (target.status !== 'pending_payment') {
    throw AppError.conflict(target.status === 'cancelled' ? `This ${purpose} was cancelled` : `This ${purpose} has already been paid`);
  }

  const gateway = activeGateway();
  const id = await transaction(async () => {
    // Close any older open attempt for the same booking/order (only one live session).
    const col = purpose === 'booking' ? 'booking_id' : 'order_id';
    await run(`UPDATE payments SET status = 'cancelled', failure_reason = 'Superseded by a new payment attempt', updated_at = ? WHERE ${col} = ? AND status IN ('created', 'pending')`, nowSql(), targetId);
    const ref = `PAY-${randomCode(8)}`;
    const { lastInsertRowid } = await run(
      `INSERT INTO payments (payment_ref, purpose, booking_id, order_id, user_id, gateway, amount_paise, currency, status, idempotency_key, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', 'created', ?, ?, ?, ?)`,
      ref, purpose, purpose === 'booking' ? targetId : null, purpose === 'order' ? targetId : null, user.id, gateway.name,
      target.total_paise, idempotencyKey, nowSql(config.business.paymentExpiryMinutes), nowSql(), nowSql(),
    );
    return lastInsertRowid;
  });

  // Ask the gateway for an order id (network call for Razorpay - outside the DB transaction).
  const row = await one('SELECT * FROM payments WHERE id = ?', id);
  const { gatewayOrderId } = await gateway.createOrder(row);
  await run('UPDATE payments SET gateway_order_id = ?, updated_at = ? WHERE id = ?', gatewayOrderId, nowSql(), id);
  return paymentResponse(await getRow(id));
}

function paymentResponse(row) {
  const payment = mapPayment(row);
  if (row.gateway === 'razorpay') {
    payment.checkout = { keyId: config.razorpay.keyId, orderId: row.gateway_order_id, amount: row.amount_paise, currency: 'INR', name: 'CarZone', description: `${row.purpose === 'booking' ? 'Wash booking' : 'Store order'} ${row.target_code}` };
  }
  return payment;
}

// ---------------------------------------------------------------------------
// 2. Simulated gateway: start (card -> OTP, UPI -> poll, net banking -> bank page)
// ---------------------------------------------------------------------------
export async function startSimulatedPayment(user, paymentId, method, details) {
  const p = await loadOwned(user, paymentId);
  if (p.gateway !== 'simulated') throw AppError.badRequest('This payment uses Razorpay Checkout');
  if (p.status === 'success') return { payment: mapPayment(p), nextAction: 'done' };
  if (!OPEN.includes(p.status)) throw AppError.conflict(p.failure_reason || 'This payment session is closed. Please start a new payment.');

  const decision = SimulatedGateway.start(method, details);
  await run('UPDATE payments SET method = ?, method_detail = ?, attempts = attempts + 1, updated_at = ? WHERE id = ?', method, decision.detail, nowSql(), p.id);

  if (decision.outcome === 'failed') {
    await markFailed(p.id, decision.failureReason);
    return { payment: mapPayment(await getRow(p.id)), nextAction: 'failed' };
  }
  if (decision.outcome === 'success') {
    await confirmSuccess(p.id, SimulatedGateway.newPaymentId());
    return { payment: mapPayment(await getRow(p.id)), nextAction: 'done' };
  }
  if (decision.outcome === 'otp') {
    await run("UPDATE payments SET status = 'pending', otp_hash = ?, updated_at = ? WHERE id = ?", hashOtp(p.payment_ref, DEMO_OTP), nowSql(), p.id);
    return { payment: mapPayment(await getRow(p.id)), nextAction: 'otp', demoOtp: DEMO_OTP };
  }
  if (decision.outcome === 'poll') {
    await run("UPDATE payments SET status = 'pending', pending_until = ?, updated_at = ? WHERE id = ?", nowSql(UPI_APPROVAL_SECONDS / 60), nowSql(), p.id);
    return { payment: mapPayment(await getRow(p.id)), nextAction: 'poll', pollAfterMs: 1500 };
  }
  await run("UPDATE payments SET status = 'pending', updated_at = ? WHERE id = ?", nowSql(), p.id);
  return { payment: mapPayment(await getRow(p.id)), nextAction: 'bank' };
}

// ---------------------------------------------------------------------------
// 3. Verify (OTP / bank decision / Razorpay signature). Replays are idempotent.
// ---------------------------------------------------------------------------
export async function verifyPayment(user, paymentId, body = {}) {
  const p = await loadOwned(user, paymentId);
  if (p.status === 'success') return mapPayment(p);                      // replay -> same answer
  if (!OPEN.includes(p.status)) throw AppError.conflict(p.failure_reason || 'This payment session is closed. Please start a new payment.');

  if (p.gateway === 'razorpay') {
    const fields = { orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature };
    if (fields.orderId !== p.gateway_order_id || !gatewayFor('razorpay').verify(fields)) {
      await markFailed(p.id, 'Payment signature verification failed');
      throw AppError.badRequest('Payment verification failed. If money was debited it will be refunded automatically.');
    }
    await run('UPDATE payments SET method_detail = COALESCE(method_detail, ?), updated_at = ? WHERE id = ?', 'Razorpay Checkout', nowSql(), p.id);
    await confirmSuccess(p.id, fields.paymentId);
    return mapPayment(await getRow(p.id));
  }

  if (p.otp_hash) {
    const given = Buffer.from(hashOtp(p.payment_ref, String(body.otp || '')));
    const expected = Buffer.from(p.otp_hash);
    if (!crypto.timingSafeEqual(given, expected)) {
      await markFailed(p.id, 'Incorrect OTP - 3-D Secure authentication failed');
      return mapPayment(await getRow(p.id));
    }
  } else if (p.method === 'netbanking') {
    if (body.bankDecision !== 'approve') {
      await markFailed(p.id, 'Payment declined on the bank page');
      return mapPayment(await getRow(p.id));
    }
  } else {
    throw AppError.badRequest('Nothing to verify for this payment');
  }
  await confirmSuccess(p.id, SimulatedGateway.newPaymentId());
  return mapPayment(await getRow(p.id));
}

/** 4. Status polling (UPI collect requests resolve here after the approval delay). */
export async function getPaymentStatus(user, paymentId) {
  const p = await loadOwned(user, paymentId);
  if (p.gateway === 'simulated' && p.status === 'pending' && p.method === 'upi' && p.pending_until && p.pending_until <= nowSql()) {
    const result = SimulatedGateway.resolveUpi(p);
    if (result.success) await confirmSuccess(p.id, SimulatedGateway.newPaymentId());
    else await markFailed(p.id, result.failureReason);
    return mapPayment(await getRow(p.id));
  }
  return mapPayment(p);
}

// ---------------------------------------------------------------------------
// Internal state changes
// ---------------------------------------------------------------------------
export async function markFailed(paymentId, reason) {
  await run(`UPDATE payments SET status = 'failed', failure_reason = ?, otp_hash = NULL, updated_at = ? WHERE id = ? AND status IN ('created', 'pending')`, reason, nowSql(), paymentId);
}

/**
 * Marks a payment successful and confirms its booking/order - in ONE transaction with
 * row locks. Safe to call twice (second call does nothing). If the booking/order is no
 * longer awaiting payment (e.g. cancelled meanwhile), the money is auto-refunded.
 */
export async function confirmSuccess(paymentId, gatewayPaymentId) {
  return transaction(async () => {
    const p = await one('SELECT * FROM payments WHERE id = ? FOR UPDATE', paymentId);
    if (p.status === 'success' || p.status === 'refund_pending' || p.status === 'refunded') return;
    if (!OPEN.includes(p.status)) throw AppError.conflict('This payment can no longer be completed');

    const target = await loadTarget(p.purpose, p.booking_id ?? p.order_id, { lock: true });
    await run(
      "UPDATE payments SET status = 'success', gateway_payment_id = ?, verified_at = ?, otp_hash = NULL, failure_reason = NULL, updated_at = ? WHERE id = ?",
      gatewayPaymentId, nowSql(), nowSql(), p.id,
    );

    if (target.status !== 'pending_payment') {
      await createRefund(p.id, { percent: 100, reason: 'Duplicate or late payment - automatic full refund' });
      return;
    }
    const label = PAYMENT_METHOD_LABELS[p.method] || 'online payment';
    if (p.purpose === 'booking') {
      await run("UPDATE bookings SET status = 'confirmed', updated_at = ? WHERE id = ?", nowSql(), target.id);
      await addHistory(target.id, 'pending_payment', 'confirmed', `Payment ${p.payment_ref} received via ${label}`, p.user_id);
    } else {
      await run("UPDATE orders SET status = 'placed', updated_at = ? WHERE id = ?", nowSql(), target.id);
      await addOrderHistory(target.id, 'pending_payment', 'placed', `Payment ${p.payment_ref} received via ${label}`, p.user_id);
    }
  });
}

/** COD: a payment row is created with the order (status pending until delivery). */
export async function createCodPayment(orderId, userId, amountPaise) {
  await run(
    `INSERT INTO payments (payment_ref, purpose, order_id, user_id, gateway, amount_paise, currency, method, method_detail, status, attempts, expires_at, created_at, updated_at)
     VALUES (?, 'order', ?, ?, 'cod', ?, 'INR', 'cod', 'Cash on delivery', 'pending', 0, ?, ?, ?)`,
    `PAY-${randomCode(8)}`, orderId, userId, amountPaise, nowSql(60 * 24 * 30), nowSql(), nowSql(),
  );
}

/** COD cash collected when the order is delivered. */
export async function settleCod(orderId) {
  await run(
    "UPDATE payments SET status = 'success', gateway_payment_id = ?, verified_at = ?, updated_at = ? WHERE order_id = ? AND gateway = 'cod' AND status = 'pending'",
    `cod_${randomCode(12)}`, nowSql(), nowSql(), orderId,
  );
}

/** On cancellation: close unpaid attempts (and pending COD). */
export async function cancelOpenPayments(target) {
  const col = target.bookingId ? 'booking_id' : 'order_id';
  await run(`UPDATE payments SET status = 'cancelled', failure_reason = 'Cancelled with the ${target.bookingId ? 'booking' : 'order'}', updated_at = ? WHERE ${col} = ? AND status IN ('created', 'pending')`,
    nowSql(), target.bookingId ?? target.orderId);
}

export async function successfulPayment(target) {
  const col = target.bookingId ? 'booking_id' : 'order_id';
  return one(`SELECT * FROM payments WHERE ${col} = ? AND status = 'success' ORDER BY id DESC LIMIT 1`, target.bookingId ?? target.orderId);
}

// ---------------------------------------------------------------------------
// Refunds: success -> refund_pending -> refunded
// ---------------------------------------------------------------------------
/** Must be called inside the caller's transaction (cancellation / return approval). */
export async function createRefund(paymentId, { percent, reason, manual = false }) {
  const p = await one('SELECT * FROM payments WHERE id = ?', paymentId);
  const amountPaise = percentOf(p.amount_paise, percent);
  await run(
    "INSERT INTO refunds (payment_id, amount_paise, refund_percent, status, reason, manual, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)",
    p.id, amountPaise, percent, reason, manual ? 1 : 0, nowSql(),
  );
  await run("UPDATE payments SET status = 'refund_pending', updated_at = ? WHERE id = ?", nowSql(), p.id);
  return { amountPaise, percent };
}

/** Admin processes a pending refund (calls the gateway's refund API when it is Razorpay). */
export async function processRefund(refundId, admin) {
  const r = await one('SELECT r.*, p.gateway, p.gateway_payment_id, p.payment_ref, p.booking_id, p.order_id FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE r.id = ?', refundId);
  if (!r) throw AppError.notFound('Refund not found');
  if (r.status !== 'pending') throw AppError.conflict('This refund has already been processed');

  let gatewayRefundId = null;
  if (!r.manual && r.gateway !== 'cod') {
    const payment = await one('SELECT * FROM payments WHERE id = ?', r.payment_id);
    ({ gatewayRefundId } = await gatewayFor(r.gateway).refund(payment, r.amount_paise));
  }

  await transaction(async () => {
    const locked = await one('SELECT status FROM refunds WHERE id = ? FOR UPDATE', refundId);
    if (locked.status !== 'pending') throw AppError.conflict('This refund has already been processed');
    const ref = `RFD-${randomCode(8)}`;
    await run("UPDATE refunds SET status = 'processed', processed_at = ?, processed_by = ?, refund_ref = ?, gateway_refund_id = ? WHERE id = ?",
      nowSql(), admin.id, ref, gatewayRefundId, refundId);
    await run("UPDATE payments SET status = 'refunded', updated_at = ? WHERE id = ?", nowSql(), r.payment_id);
    const note = `Refund ${ref} of ${(r.amount_paise / 100).toFixed(2)} INR processed${r.manual ? ' manually (cash)' : ' to the original payment method'}`;
    if (r.booking_id) await addHistory(r.booking_id, 'cancelled', 'cancelled', note, admin.id);
    else {
      const o = await one('SELECT status FROM orders WHERE id = ?', r.order_id);
      await addOrderHistory(r.order_id, o.status, o.status, note, admin.id);
    }
  });
  return (await listRefunds({ id: refundId }))[0];
}

const REFUND_SELECT = `
  SELECT r.*, p.payment_ref, p.purpose, p.booking_id, p.order_id, p.method, p.method_detail, p.gateway, p.amount_paise AS paid_paise,
         COALESCE(b.booking_code, o.order_code) AS target_code, u.name AS customer_name, u.email AS customer_email
    FROM refunds r
    JOIN payments p ON p.id = r.payment_id
    JOIN users u ON u.id = p.user_id
    LEFT JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN orders o ON o.id = p.order_id`;

export async function listRefunds({ status = '', id = 0 } = {}) {
  return (await all(`${REFUND_SELECT} WHERE (? = '' OR r.status = ?) AND (? = 0 OR r.id = ?) ORDER BY r.status = 'pending' DESC, r.created_at DESC`, status, status, id, id))
    .map((r) => ({
      id: r.id, paymentRef: r.payment_ref, purpose: r.purpose, bookingId: r.booking_id, orderId: r.order_id, targetCode: r.target_code,
      customerName: r.customer_name, customerEmail: r.customer_email, method: r.method, methodDetail: r.method_detail, gateway: r.gateway,
      paidPaise: r.paid_paise, amountPaise: r.amount_paise, percent: r.refund_percent, status: r.status, reason: r.reason,
      manual: Boolean(r.manual), refundRef: r.refund_ref, gatewayRefundId: r.gateway_refund_id, createdAt: r.created_at, processedAt: r.processed_at,
    }));
}

// ---------------------------------------------------------------------------
// Lists & webhook
// ---------------------------------------------------------------------------
export const listPaymentsForUser = async (userId) =>
  (await all(`${PAYMENT_SELECT} WHERE p.user_id = ? AND p.status <> 'created' ORDER BY p.created_at DESC, p.id DESC`, userId)).map(mapPayment);

export async function adminListPayments({ status = '', method = '', gateway = '', purpose = '', search = '' } = {}) {
  const like = `%${search}%`;
  return (await all(
    `${PAYMENT_SELECT}
      WHERE (? = '' OR p.status = ?) AND (? = '' OR p.method = ?) AND (? = '' OR p.gateway = ?) AND (? = '' OR p.purpose = ?)
        AND (p.payment_ref LIKE ? OR IFNULL(p.gateway_payment_id, '') LIKE ? OR IFNULL(b.booking_code, '') LIKE ? OR IFNULL(o.order_code, '') LIKE ? OR u.name LIKE ? OR u.email LIKE ?)
      ORDER BY p.created_at DESC, p.id DESC`,
    status, status, method, method, gateway, gateway, purpose, purpose, like, like, like, like, like, like,
  )).map(mapPayment);
}

export async function getPaymentDetail(id) {
  const p = await getRow(id);
  if (!p) throw AppError.notFound('Payment not found');
  return mapPayment(p);
}

/**
 * WEBHOOK: Razorpay calls this server-to-server. We trust it only if the
 * X-Razorpay-Signature header matches HMAC-SHA256(raw body, webhook secret).
 * The same idempotent confirmSuccess() is used, so a webhook arriving after the
 * browser's verify call changes nothing.
 */
export async function handleRazorpayWebhook(rawBody, signature) {
  if (!razorpayEnabled() || !config.razorpay.webhookSecret) throw AppError.notFound('Webhooks are not configured');
  if (!verifyWebhookSignature(rawBody, signature, config.razorpay.webhookSecret)) throw AppError.badRequest('Invalid webhook signature');
  const event = JSON.parse(rawBody);
  const entity = event?.payload?.payment?.entity;
  if (!entity?.order_id) return { handled: false };
  const p = await one('SELECT * FROM payments WHERE gateway_order_id = ?', entity.order_id);
  if (!p) return { handled: false };
  if (event.event === 'payment.captured') await confirmSuccess(p.id, entity.id);
  if (event.event === 'payment.failed') await markFailed(p.id, entity.error_description || 'Payment failed at the gateway');
  return { handled: true };
}
