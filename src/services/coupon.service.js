/**
 * coupon.service.js - ONE coupon engine for both businesses (wash bookings + store orders).
 *
 * COUPON RULES (checked in this order, each with a clear message for the customer):
 *   exists & active -> scope matches (applies_to = wash / store / both)
 *   -> valid_from <= today <= valid_until -> total usage limit not reached
 *   -> customer has not used it per_user_limit times -> (wash) applies to this service
 *   -> subtotal >= minimum order value.
 * Redemption happens inside the booking/order transaction and is released again if
 * that booking/order is cancelled, so used_count always equals the live redemptions.
 */
import { one, all, run } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { todayISO, nowSql } from '../utils/dates.js';
import { formatINR } from '../utils/money.js';

export const mapCoupon = (r) => ({
  id: r.id,
  code: r.code,
  title: r.title,
  description: r.description,
  discountType: r.discount_type,
  discountValue: r.discount_value,          // percent number, or paise for flat coupons
  maxDiscountPaise: r.max_discount_paise,
  minOrderPaise: r.min_order_paise,
  validFrom: r.valid_from,
  validUntil: r.valid_until,
  usageLimit: r.usage_limit,
  perUserLimit: r.per_user_limit,
  usedCount: r.used_count,
  serviceId: r.service_id,
  serviceName: r.service_name ?? null,
  appliesTo: r.applies_to,
  isActive: Boolean(r.is_active),
});

const COUPON_SELECT = 'SELECT c.*, s.name AS service_name FROM coupons c LEFT JOIN services s ON s.id = c.service_id';

/** Offers shown on the website: active, within dates and not used up. scope: '' | 'wash' | 'store' */
export async function listActiveOffers(scope = '') {
  const today = todayISO();
  return (await all(
    `${COUPON_SELECT} WHERE c.is_active = 1 AND c.valid_from <= ? AND c.valid_until >= ?
       AND (c.usage_limit IS NULL OR c.used_count < c.usage_limit)
       AND (? = '' OR c.applies_to = ? OR c.applies_to = 'both')
     ORDER BY c.valid_until`,
    today, today, scope, scope,
  )).map(mapCoupon);
}

/** Returns the coupon if this user may apply it to this order, otherwise throws 422. */
export async function validateCoupon(code, { userId, scope, serviceId = null, subtotalPaise }) {
  const fail = (msg) => { throw AppError.unprocessable(msg, { couponCode: msg }); };
  const row = await one(`${COUPON_SELECT} WHERE c.code = ?`, String(code).toUpperCase());
  if (!row || !row.is_active) fail('This coupon code is not valid');
  if (row.applies_to !== 'both' && row.applies_to !== scope) {
    fail(scope === 'store' ? 'This coupon is valid only on car wash bookings' : 'This coupon is valid only in the accessories store');
  }

  const today = todayISO();
  if (row.valid_from > today) fail(`This coupon starts on ${row.valid_from}`);
  if (row.valid_until < today) fail('This coupon has expired');
  if (row.usage_limit !== null && row.used_count >= row.usage_limit) fail('This coupon has reached its usage limit');

  const usedByUser = (await one('SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?', row.id, userId)).n;
  if (usedByUser >= row.per_user_limit) fail('You have already used this coupon');
  if (row.service_id && row.service_id !== serviceId) fail(`This coupon is valid only on ${row.service_name}`);
  if (subtotalPaise < row.min_order_paise) fail(`Add ${formatINR(row.min_order_paise - subtotalPaise)} more to use this coupon (minimum order ${formatINR(row.min_order_paise)})`);

  return mapCoupon(row);
}

/**
 * Records a coupon use for a booking OR an order (target = { bookingId } | { orderId }).
 * The UPDATE re-checks the limit atomically, so the coupon can never be over-used.
 */
export async function redeemCoupon(coupon, userId, target, discountPaise) {
  const { changes } = await run(
    'UPDATE coupons SET used_count = used_count + 1 WHERE id = ? AND (usage_limit IS NULL OR used_count < usage_limit)',
    coupon.id,
  );
  if (!changes) throw AppError.conflict('This coupon has just reached its usage limit');
  await run(
    'INSERT INTO coupon_redemptions (coupon_id, user_id, booking_id, order_id, discount_paise, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    coupon.id, userId, target.bookingId ?? null, target.orderId ?? null, discountPaise, nowSql(),
  );
}

/** Gives the coupon use back when a booking/order is cancelled. */
export async function releaseCoupon(target) {
  const r = target.bookingId
    ? await one('SELECT * FROM coupon_redemptions WHERE booking_id = ?', target.bookingId)
    : await one('SELECT * FROM coupon_redemptions WHERE order_id = ?', target.orderId);
  if (!r) return;
  await run('DELETE FROM coupon_redemptions WHERE id = ?', r.id);
  await run('UPDATE coupons SET used_count = used_count - 1 WHERE id = ? AND used_count > 0', r.coupon_id);
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------
export const listCoupons = async () => (await all(`${COUPON_SELECT} ORDER BY c.created_at DESC, c.id DESC`)).map(mapCoupon);

async function getCoupon(id) {
  const row = await one(`${COUPON_SELECT} WHERE c.id = ?`, id);
  if (!row) throw AppError.notFound('Coupon not found');
  return mapCoupon(row);
}

/** Converts admin form values into DB values and checks cross-field rules. */
async function toDbCoupon(c) {
  const errors = {};
  if (c.discountType === 'percent' && c.discountValue > 90) errors.discountValue = 'Percentage cannot exceed 90';
  if (c.validUntil < c.validFrom) errors.validUntil = 'End date must be after the start date';
  if (c.serviceId && !(await one('SELECT id FROM services WHERE id = ?', c.serviceId))) errors.serviceId = 'Unknown service';
  if (c.serviceId && c.appliesTo !== 'wash') errors.serviceId = 'A service-specific coupon must apply to wash bookings only';
  if (Object.keys(errors).length) throw AppError.unprocessable('Please correct the highlighted fields', errors);
  return [
    c.code, c.title, c.description, c.discountType,
    c.discountType === 'percent' ? c.discountValue : c.discountValue * 100, // flat values arrive in rupees
    c.maxDiscount ?? null, c.minOrder ?? 0, c.validFrom, c.validUntil, c.usageLimit ?? null,
    c.perUserLimit, c.serviceId ?? null, c.appliesTo, c.isActive ? 1 : 0,
  ];
}

export async function createCoupon(c) {
  if (await one('SELECT id FROM coupons WHERE code = ?', c.code)) throw AppError.conflict('This coupon code already exists');
  const { lastInsertRowid } = await run(
    `INSERT INTO coupons (code, title, description, discount_type, discount_value, max_discount_paise, min_order_paise,
                          valid_from, valid_until, usage_limit, per_user_limit, service_id, applies_to, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ...(await toDbCoupon(c)), nowSql(),
  );
  return getCoupon(lastInsertRowid);
}

export async function updateCoupon(id, c) {
  const existing = await getCoupon(id);
  if (await one('SELECT id FROM coupons WHERE code = ? AND id <> ?', c.code, id)) throw AppError.conflict('This coupon code already exists');
  if (c.usageLimit && c.usageLimit < existing.usedCount) {
    throw AppError.unprocessable('Usage limit cannot be lower than the times already used', { usageLimit: `Already used ${existing.usedCount} times` });
  }
  await run(
    `UPDATE coupons SET code = ?, title = ?, description = ?, discount_type = ?, discount_value = ?, max_discount_paise = ?,
            min_order_paise = ?, valid_from = ?, valid_until = ?, usage_limit = ?, per_user_limit = ?, service_id = ?, applies_to = ?, is_active = ?
      WHERE id = ?`,
    ...(await toDbCoupon(c)), id,
  );
  return getCoupon(id);
}

export async function deleteCoupon(id) {
  const c = await getCoupon(id);
  if (c.usedCount > 0 || await one('SELECT id FROM coupon_redemptions WHERE coupon_id = ? LIMIT 1', id)) {
    throw AppError.conflict('This coupon has been used. Deactivate it instead of deleting it.');
  }
  await run('UPDATE bookings SET coupon_id = NULL WHERE coupon_id = ?', id);
  await run('UPDATE orders SET coupon_id = NULL WHERE coupon_id = ?', id);
  await run('DELETE FROM coupons WHERE id = ?', id);
}
