/**
 * booking.service.js - The heart of the app: quotes, booking creation, cancellation,
 * rescheduling, status changes and booking look-ups.
 *
 * BOOKING CREATION (createBooking) - one database transaction does ALL of this:
 *   1. Validate service / vehicle type / add-ons            (catalog.service)
 *   2. Calculate the bill and validate the coupon           (pricing + coupon services)
 *   3. Reserve a seat in the chosen time slot               (slot.service, atomic UPDATE)
 *   4. Insert the booking, its add-ons, coupon redemption and first history entry
 * If any step fails (slot full, coupon used up...), the whole transaction rolls back,
 * so we never get a booking without a slot or a slot count without a booking.
 * The booking starts as 'pending_payment' and becomes 'confirmed' only after the payment
 * module has verified a payment (services/payments/payment.service.js).
 */
import { one, all, run, transaction } from '../db/connection.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { newBookingCode } from '../utils/ids.js';
import { nowSql, todayISO, slotDateTime, hoursUntil } from '../utils/dates.js';
import { percentOf } from '../utils/money.js';
import { BOOKING_STATUS_LABELS } from '../utils/shared.js';
import { getPricingInputs } from './catalog.service.js';
import { calculateBill } from './pricing.service.js';
import { validateCoupon, redeemCoupon, releaseCoupon } from './coupon.service.js';
import { reserveSlot, releaseSlot } from './slot.service.js';
import { addHistory } from './history.service.js';
import { createRefund, successfulPayment, cancelOpenPayments } from './payments/payment.service.js';

const ACTIVE_STATUSES = ['pending_payment', 'confirmed', 'rescheduled', 'in_progress'];

// ---------------------------------------------------------------------------
// Quote (live price shown in the booking wizard)
// ---------------------------------------------------------------------------
/**
 * Calculates the bill without saving anything. An invalid coupon does NOT fail the
 * quote: the bill is returned without discount plus a message explaining why.
 */
export async function quote(userId, { serviceId, vehicleType, addonIds = [], pickupDrop = false, couponCode }) {
  const { service, basePricePaise, addons } = await getPricingInputs(serviceId, vehicleType, addonIds);
  if (pickupDrop && !service.pickup_available) {
    throw AppError.unprocessable('Pickup & drop is not available for this service', { pickupDrop: 'Not available' });
  }
  const subtotalPaise = calculateBill({ basePricePaise, addons, pickupDrop }).subtotalPaise;

  let coupon = null;
  let couponResult = null;
  if (couponCode) {
    try {
      coupon = await validateCoupon(couponCode, { userId, scope: 'wash', serviceId, subtotalPaise });
      couponResult = { code: coupon.code, valid: true, message: `${coupon.code} applied - ${coupon.title}` };
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      couponResult = { code: couponCode, valid: false, message: err.message };
    }
  }

  const bill = calculateBill({ basePricePaise, addons, pickupDrop, coupon });
  return { bill, addons, coupon: couponResult, serviceName: service.name };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createBooking(user, input) {
  return transaction(async () => {
    // 1. Vehicle: either a saved vehicle (must belong to this customer) or typed-in details.
    let vehicle = { id: null, type: input.vehicleType, brand: input.brand, model: input.model, reg: input.registrationNo };
    if (input.vehicleId) {
      const v = await one('SELECT * FROM vehicles WHERE id = ? AND user_id = ?', input.vehicleId, user.id);
      if (!v) throw AppError.unprocessable('Saved vehicle not found', { vehicleId: 'Choose one of your vehicles' });
      vehicle = { id: v.id, type: v.vehicle_type, brand: v.brand, model: v.model, reg: v.registration_no };
    } else if (input.saveVehicle) {
      const existing = await one('SELECT id FROM vehicles WHERE user_id = ? AND registration_no = ?', user.id, vehicle.reg);
      vehicle.id = existing
        ? existing.id
        : (await run('INSERT INTO vehicles (user_id, vehicle_type, brand, model, registration_no, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          user.id, vehicle.type, vehicle.brand, vehicle.model, vehicle.reg, nowSql())).lastInsertRowid;
    }

    // 2. Price + coupon. Here an invalid coupon IS an error (the customer must remove it).
    const { service, basePricePaise, addons } = await getPricingInputs(input.serviceId, vehicle.type, input.addonIds);
    if (input.pickupDrop && !service.pickup_available) {
      throw AppError.unprocessable('Pickup & drop is not available for this service', { pickupDrop: 'Not available' });
    }
    const subtotalPaise = calculateBill({ basePricePaise, addons, pickupDrop: input.pickupDrop }).subtotalPaise;
    const coupon = input.couponCode
      ? await validateCoupon(input.couponCode, { userId: user.id, scope: 'wash', serviceId: service.id, subtotalPaise })
      : null;
    const bill = calculateBill({ basePricePaise, addons, pickupDrop: input.pickupDrop, coupon });

    // 3. Capacity: atomically take one seat in the slot (throws 409 if full).
    await reserveSlot(input.bookingDate, input.timeSlotId);

    // 4. Save the booking with a snapshot of the bill.
    const code = await uniqueBookingCode();
    const { lastInsertRowid: bookingId } = await run(
      `INSERT INTO bookings (booking_code, user_id, service_id, vehicle_id, vehicle_type, vehicle_brand, vehicle_model, vehicle_reg,
                             booking_date, time_slot_id, pickup_drop, address, instructions, status,
                             base_price_paise, addons_paise, pickup_fee_paise, discount_paise, tax_paise, total_paise,
                             coupon_id, coupon_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, user.id, service.id, vehicle.id, vehicle.type, vehicle.brand, vehicle.model, vehicle.reg,
      input.bookingDate, input.timeSlotId, input.pickupDrop ? 1 : 0, input.address, input.instructions ?? null,
      bill.basePricePaise, bill.addonsPaise, bill.pickupFeePaise, bill.discountPaise, bill.taxPaise, bill.totalPaise,
      coupon?.id ?? null, coupon?.code ?? null, nowSql(), nowSql(),
    );
    for (const a of addons) {
      await run('INSERT INTO booking_addons (booking_id, addon_id, addon_name, price_paise) VALUES (?, ?, ?, ?)', bookingId, a.id, a.name, a.pricePaise);
    }
    if (coupon) await redeemCoupon(coupon, user.id, { bookingId }, bill.discountPaise);
    await addHistory(bookingId, null, 'pending_payment', 'Booking created - awaiting payment', user.id);

    return getBookingDetail(bookingId, user);
  });
}

async function uniqueBookingCode() {
  for (;;) {
    const code = newBookingCode();
    if (!(await one('SELECT id FROM bookings WHERE booking_code = ?', code))) return code;
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
const BOOKING_SELECT = `
  SELECT b.*, s.name AS service_name, s.slug AS service_slug, s.image AS service_image, s.duration_minutes,
         t.label AS slot_label, t.start_time, t.end_time,
         u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
         (SELECT p.status FROM payments p WHERE p.booking_id = b.id AND p.status <> 'created' ORDER BY p.id DESC LIMIT 1) AS last_payment_status,
         (SELECT p.id FROM payments p WHERE p.booking_id = b.id AND p.status IN ('success', 'refund_pending', 'refunded') ORDER BY p.id DESC LIMIT 1) AS paid_payment_id,
         r.status AS refund_status, r.amount_paise AS refund_paise, r.refund_percent, r.refund_ref,
         rv.id AS review_id, rv.rating AS review_rating, rv.status AS review_status
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    JOIN time_slots t ON t.id = b.time_slot_id
    JOIN users u ON u.id = b.user_id
    LEFT JOIN refunds r ON r.payment_id IN (SELECT p2.id FROM payments p2 WHERE p2.booking_id = b.id)
    LEFT JOIN reviews rv ON rv.booking_id = b.id`;

function paymentStatusOf(r) {
  if (r.refund_status === 'processed') return r.refund_percent === 100 ? 'refunded' : 'partially_refunded';
  if (r.refund_status === 'pending') return 'refund_pending';
  if (r.paid_payment_id) return 'paid';
  if (r.last_payment_status === 'failed') return 'failed';
  return 'unpaid';
}

/** Which buttons the customer may see. The server re-checks every rule on submit. */
function allowedActions(r) {
  const start = slotDateTime(r.booking_date, r.start_time);
  const hoursLeft = hoursUntil(start);
  return {
    pay: r.status === 'pending_payment',
    cancel: ['pending_payment', 'confirmed', 'rescheduled'].includes(r.status) && hoursLeft > 0,
    reschedule: ['confirmed', 'rescheduled'].includes(r.status)
      && r.reschedule_count < config.business.maxReschedules
      && hoursLeft >= config.business.minHoursBeforeReschedule,
    review: r.status === 'completed' && !r.review_id,
    invoice: Boolean(r.paid_payment_id),
  };
}

export function mapBooking(r) {
  const subtotal = r.base_price_paise + r.addons_paise + r.pickup_fee_paise;
  return {
    id: r.id,
    code: r.booking_code,
    status: r.status,
    statusLabel: BOOKING_STATUS_LABELS[r.status],
    service: { id: r.service_id, name: r.service_name, slug: r.service_slug, image: r.service_image, durationMinutes: r.duration_minutes },
    vehicle: { id: r.vehicle_id, type: r.vehicle_type, brand: r.vehicle_brand, model: r.vehicle_model, registrationNo: r.vehicle_reg },
    bookingDate: r.booking_date,
    slot: { id: r.time_slot_id, label: r.slot_label, startTime: r.start_time, endTime: r.end_time },
    pickupDrop: Boolean(r.pickup_drop),
    address: r.address,
    instructions: r.instructions,
    bill: {
      basePricePaise: r.base_price_paise,
      addonsPaise: r.addons_paise,
      pickupFeePaise: r.pickup_fee_paise,
      subtotalPaise: subtotal,
      discountPaise: r.discount_paise,
      taxablePaise: subtotal - r.discount_paise,
      taxPaise: r.tax_paise,
      totalPaise: r.total_paise,
      couponCode: r.coupon_code,
    },
    paymentStatus: paymentStatusOf(r),
    refund: r.refund_status ? { status: r.refund_status, amountPaise: r.refund_paise, percent: r.refund_percent, ref: r.refund_ref } : null,
    review: r.review_id ? { id: r.review_id, rating: r.review_rating, status: r.review_status } : null,
    rescheduleCount: r.reschedule_count,
    cancelReason: r.cancel_reason,
    cancelledBy: r.cancelled_by,
    cancelledAt: r.cancelled_at,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    customer: { id: r.user_id, name: r.customer_name, email: r.customer_email, phone: r.customer_phone },
    actions: allowedActions(r),
  };
}

/** Loads one booking; customers may only see their own, admins may see any. */
async function loadRow(id, user) {
  const r = await one(`${BOOKING_SELECT} WHERE b.id = ?`, id);
  if (!r || (user.role !== 'admin' && r.user_id !== user.id)) throw AppError.notFound('Booking not found');
  return r;
}

export async function getBookingDetail(id, user) {
  const booking = mapBooking(await loadRow(id, user));
  booking.addons = await all('SELECT addon_id AS id, addon_name AS name, price_paise AS pricePaise FROM booking_addons WHERE booking_id = ?', id);
  booking.payments = await all(
    `SELECT id, payment_ref AS paymentRef, gateway, method, method_detail AS methodDetail, amount_paise AS amountPaise, status,
            gateway_payment_id AS transactionRef, failure_reason AS failureReason, created_at AS createdAt, verified_at AS verifiedAt
       FROM payments WHERE booking_id = ? AND status <> 'created' ORDER BY id`, id,
  );
  booking.history = await all(
    `SELECT h.from_status AS fromStatus, h.to_status AS toStatus, h.note, h.created_at AS createdAt, u.name AS changedBy, u.role AS changedByRole
       FROM booking_status_history h LEFT JOIN users u ON u.id = h.changed_by
      WHERE h.booking_id = ? ORDER BY h.id`, id,
  );
  return booking;
}

/** scope: 'upcoming' | 'past' | 'all' */
export async function listBookingsForUser(userId, scope = 'all') {
  const today = todayISO();
  let where = 'b.user_id = ?';
  const params = [userId];
  if (scope === 'upcoming') {
    where += " AND b.status IN ('pending_payment','confirmed','rescheduled','in_progress') AND b.booking_date >= ?";
    params.push(today);
  } else if (scope === 'past') {
    where += " AND (b.status IN ('completed','cancelled') OR b.booking_date < ?)";
    params.push(today);
  }
  const order = scope === 'upcoming' ? 'b.booking_date ASC, t.start_time ASC' : 'b.booking_date DESC, t.start_time DESC';
  return (await all(`${BOOKING_SELECT} WHERE ${where} ORDER BY ${order}`, ...params)).map(mapBooking);
}

export async function adminListBookings({ status = '', date = '', search = '', from = '', to = '' } = {}) {
  const like = `%${search}%`;
  return (await all(
    `${BOOKING_SELECT}
      WHERE (? = '' OR b.status = ?)
        AND (? = '' OR b.booking_date = ?)
        AND (? = '' OR b.booking_date >= ?)
        AND (? = '' OR b.booking_date <= ?)
        AND (b.booking_code LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR b.vehicle_reg LIKE ? OR s.name LIKE ?)
      ORDER BY b.booking_date DESC, t.start_time DESC`,
    status, status, date, date, from, from, to, to, like, like, like, like, like,
  )).map(mapBooking);
}

// ---------------------------------------------------------------------------
// Cancel (with refund)
// ---------------------------------------------------------------------------
/**
 * CANCELLATION & REFUND WORKFLOW
 *   - Customers can cancel pending/confirmed/rescheduled bookings before the slot starts.
 *   - Admins can also cancel an in-progress booking.
 *   - In one transaction: status -> cancelled, slot seat released, coupon use released,
 *     and - if the booking was paid - a refund record is created as 'pending'.
 *   - Refund amount follows refundPolicy(): 100% if cancelled >= FREE_CANCEL_HOURS before
 *     the slot (or by the admin), otherwise LATE_CANCEL_REFUND_PERCENT.
 *   - An admin then "processes" the refund (refund.service.processRefund).
 */
export async function cancelBooking(id, user, reason) {
  const byAdmin = user.role === 'admin';
  await transaction(async () => {
    await one('SELECT id FROM bookings WHERE id = ? FOR UPDATE', id);      // lock the booking row
    const r = await loadRow(id, user);
    const allowed = byAdmin ? ACTIVE_STATUSES : ['pending_payment', 'confirmed', 'rescheduled'];
    if (!allowed.includes(r.status)) throw AppError.conflict(`A booking that is ${BOOKING_STATUS_LABELS[r.status].toLowerCase()} cannot be cancelled`);
    if (!byAdmin && hoursUntil(slotDateTime(r.booking_date, r.start_time)) <= 0) {
      throw AppError.conflict('This slot has already started. Please contact the centre.');
    }

    await run(
      `UPDATE bookings SET status = 'cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = ?, updated_at = ? WHERE id = ?`,
      reason, byAdmin ? 'admin' : 'customer', nowSql(), nowSql(), id,
    );
    await releaseSlot(r.booking_date, r.time_slot_id);
    await releaseCoupon({ bookingId: id });
    await cancelOpenPayments({ bookingId: id });

    let note = `Cancelled by ${byAdmin ? 'CarZone' : 'customer'}: ${reason}`;
    const payment = await successfulPayment({ bookingId: id });
    if (payment) {
      const policy = refundPolicy(r, byAdmin);
      await createRefund(payment.id, policy);
      note += ` - refund of ${policy.percent}% (${(percentOf(payment.amount_paise, policy.percent) / 100).toFixed(2)} INR) initiated`;
    }
    await addHistory(id, r.status, 'cancelled', note, user.id);
  });
  return getBookingDetail(id, user);
}

/**
 * REFUND POLICY for wash bookings
 *   - Cancelled by the centre (admin)                    -> 100% refund
 *   - Cancelled by customer >= FREE_CANCEL_HOURS before   -> 100% refund
 *   - Cancelled by customer later than that               -> LATE_CANCEL_REFUND_PERCENT
 */
export function refundPolicy(bookingRow, byAdmin) {
  const { freeCancelHours, lateCancelRefundPercent } = config.business;
  if (byAdmin) return { percent: 100, reason: 'Cancelled by CarZone - full refund' };
  const hours = hoursUntil(slotDateTime(bookingRow.booking_date, bookingRow.start_time));
  if (hours >= freeCancelHours) return { percent: 100, reason: `Cancelled ${freeCancelHours}+ hours before the slot - full refund` };
  return { percent: lateCancelRefundPercent, reason: `Late cancellation (under ${freeCancelHours} hours) - ${lateCancelRefundPercent}% refund` };
}

// ---------------------------------------------------------------------------
// Reschedule
// ---------------------------------------------------------------------------
export async function rescheduleBooking(id, user, { bookingDate, timeSlotId }) {
  await transaction(async () => {
    await one('SELECT id FROM bookings WHERE id = ? FOR UPDATE', id);
    const r = await loadRow(id, user);
    const actions = allowedActions(r);
    if (!actions.reschedule) {
      if (r.reschedule_count >= config.business.maxReschedules) throw AppError.conflict(`A booking can be rescheduled at most ${config.business.maxReschedules} times`);
      if (!['confirmed', 'rescheduled'].includes(r.status)) throw AppError.conflict('Only confirmed bookings can be rescheduled');
      throw AppError.conflict(`Rescheduling closes ${config.business.minHoursBeforeReschedule} hours before the slot`);
    }
    if (bookingDate === r.booking_date && timeSlotId === r.time_slot_id) {
      throw AppError.unprocessable('Please choose a different date or time slot', { timeSlotId: 'Same as current slot' });
    }

    const newSlot = await reserveSlot(bookingDate, timeSlotId);   // take the new seat first...
    await releaseSlot(r.booking_date, r.time_slot_id);              // ...then free the old one
    await run(
      `UPDATE bookings SET booking_date = ?, time_slot_id = ?, status = 'rescheduled', reschedule_count = reschedule_count + 1, updated_at = ? WHERE id = ?`,
      bookingDate, timeSlotId, nowSql(), id,
    );
    await addHistory(id, r.status, 'rescheduled', `Moved from ${r.booking_date} ${r.start_time} to ${bookingDate} ${newSlot.startTime}`, user.id);
  });
  return getBookingDetail(id, user);
}

// ---------------------------------------------------------------------------
// Admin status workflow
// ---------------------------------------------------------------------------
const TRANSITIONS = {
  pending_payment: ['cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  rescheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function adminUpdateStatus(id, admin, { status, note }) {
  const r = await loadRow(id, admin);
  if (!TRANSITIONS[r.status].includes(status)) {
    throw AppError.conflict(`Cannot change a booking from "${BOOKING_STATUS_LABELS[r.status]}" to "${BOOKING_STATUS_LABELS[status]}"`);
  }
  if (status === 'cancelled') return cancelBooking(id, admin, note || 'Cancelled by the studio');
  if (status === 'in_progress' && r.booking_date > todayISO()) {
    throw AppError.conflict('A booking can be started only on or after its booking date');
  }

  await transaction(async () => {
    await run(
      `UPDATE bookings SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END, updated_at = ? WHERE id = ?`,
      status, status, nowSql(), nowSql(), id,
    );
    const defaultNote = status === 'in_progress' ? 'Vehicle received - service started' : 'Service completed - vehicle ready';
    await addHistory(id, r.status, status, note || defaultNote, admin.id);
  });
  return getBookingDetail(id, admin);
}

// ---------------------------------------------------------------------------
// Customer dashboard summary
// ---------------------------------------------------------------------------
export async function customerSummary(userId) {
  const today = todayISO();
  const counts = await one(
    `SELECT
        SUM(CASE WHEN status IN ('pending_payment','confirmed','rescheduled','in_progress') AND booking_date >= ? THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS awaiting_payment,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
        COUNT(*) AS total
       FROM bookings WHERE user_id = ?`,
    today, userId,
  );
  const paid = (await one("SELECT COALESCE(SUM(amount_paise), 0) AS v FROM payments WHERE user_id = ? AND status IN ('success', 'refund_pending', 'refunded')", userId)).v;
  const refunded = (await one(
    "SELECT COALESCE(SUM(r.amount_paise), 0) AS v FROM refunds r JOIN payments p ON p.id = r.payment_id WHERE p.user_id = ? AND r.status = 'processed'",
    userId,
  )).v;
  const orders = await one("SELECT COUNT(*) AS n, SUM(CASE WHEN status IN ('placed','packed','shipped','out_for_delivery') THEN 1 ELSE 0 END) AS active FROM orders WHERE user_id = ?", userId);
  const reviewsDue = (await one(
    "SELECT COUNT(*) AS n FROM bookings b LEFT JOIN reviews rv ON rv.booking_id = b.id WHERE b.user_id = ? AND b.status = 'completed' AND rv.id IS NULL",
    userId,
  )).n;
  return {
    upcoming: counts.upcoming || 0,
    completed: counts.completed || 0,
    awaitingPayment: counts.awaiting_payment || 0,
    cancelled: counts.cancelled || 0,
    totalBookings: counts.total || 0,
    totalSpentPaise: paid - refunded,
    reviewsDue,
    totalOrders: orders.n || 0,
    activeOrders: orders.active || 0,
    nextBooking: (await listBookingsForUser(userId, 'upcoming')).find((b) => b.status !== 'pending_payment') || null,
  };
}
