/**
 * order.service.js - Store checkout, order status flow, cancellation and returns.
 *
 * CHECKOUT (placeOrder) - ONE transaction:
 *   1. Read the cart and the chosen address (must belong to the customer).
 *   2. Lock every product row (SELECT ... FOR UPDATE) and take stock with a guarded
 *      UPDATE "stock = stock - qty WHERE stock >= qty"  -> overselling is impossible.
 *   3. Validate the coupon (scope 'store') and calculate totals on the server.
 *   4. Optional fitment: reserve a seat in the shared wash-bay time slots.
 *   5. Insert the order, its items, stock movements, coupon redemption and history.
 *   6. COD -> status 'placed' + a pending COD payment. Online -> 'pending_payment';
 *      the browser then pays through the payment module, which moves it to 'placed'.
 *   7. Empty the cart.
 * If any step fails, everything rolls back (no stock is lost, no half-created order).
 *
 * STATUS FLOW
 *   pending_payment -> placed -> packed -> shipped -> out_for_delivery -> delivered
 *   pending_payment / placed / packed -> cancelled   (stock restored, refund if paid)
 *   delivered -> return_requested -> returned        (stock restored, refund)
 *                                 -> delivered       (return rejected)
 */
import { one, all, run, transaction } from '../db/connection.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { nowSql, addDaysISO, todayISO } from '../utils/dates.js';
import { randomCode } from '../utils/ids.js';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../utils/shared.js';
import { calculateOrderTotals } from './pricing.service.js';
import { validateCoupon, redeemCoupon, releaseCoupon } from './coupon.service.js';
import { reserveSlot, releaseSlot } from './slot.service.js';
import { takeStock, restoreStock, verifiedPurchaseOrderId } from './product.service.js';
import { getAddress } from './address.service.js';
import { clearCart } from './cart.service.js';
import { addOrderHistory } from './history.service.js';
import { createCodPayment, settleCod, cancelOpenPayments, successfulPayment, createRefund, mapPayment, PAYMENT_SELECT } from './payments/payment.service.js';

const CANCELLABLE = ['pending_payment', 'placed', 'packed'];
const TRANSITIONS = {
  pending_payment: ['cancelled'],
  placed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: [],
  return_requested: ['returned', 'delivered'],
  returned: [],
  cancelled: [],
};

// ---------------------------------------------------------------------------
// Quote (checkout page preview)
// ---------------------------------------------------------------------------
async function cartLines(userId, { lock = false } = {}) {
  return all(
    `SELECT ci.product_id, ci.quantity, p.name, p.sku, p.price_paise, p.mrp_paise, p.stock, p.is_active, p.fitment_available
       FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.user_id = ? ORDER BY ci.product_id${lock ? ' FOR UPDATE' : ''}`,
    userId,
  );
}

export async function quoteOrder(userId, { couponCode, fitment = false }) {
  const lines = await cartLines(userId);
  if (!lines.length) throw AppError.unprocessable('Your cart is empty');
  const items = lines.map((l) => ({ unitPricePaise: l.price_paise, mrpPaise: l.mrp_paise, quantity: l.quantity }));
  const base = calculateOrderTotals({ items });
  let coupon = null;
  let couponResult = null;
  if (couponCode) {
    try {
      coupon = await validateCoupon(couponCode, { userId, scope: 'store', subtotalPaise: base.subtotalPaise });
      couponResult = { code: coupon.code, valid: true, message: `${coupon.code} applied - ${coupon.title}` };
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      couponResult = { code: couponCode, valid: false, message: err.message };
    }
  }
  const fitmentAllowed = lines.some((l) => l.fitment_available);
  return { totals: calculateOrderTotals({ items, coupon, fitment: fitment && fitmentAllowed }), coupon: couponResult, fitmentAllowed };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------
async function uniqueOrderCode() {
  for (;;) {
    const code = `CZO-${randomCode(6)}`;
    if (!(await one('SELECT id FROM orders WHERE order_code = ?', code))) return code;
  }
}

export async function placeOrder(user, input) {
  const address = await getAddress(user.id, input.addressId);
  const orderId = await transaction(async () => {
    const lines = await cartLines(user.id, { lock: true });
    if (!lines.length) throw AppError.unprocessable('Your cart is empty');
    for (const l of lines) if (!l.is_active) throw AppError.conflict(`"${l.name}" is no longer available. Please remove it from your cart.`);

    // Lock product rows in a fixed order (by id) so concurrent checkouts cannot deadlock.
    for (const l of lines) await one('SELECT id FROM products WHERE id = ? FOR UPDATE', l.product_id);

    const items = lines.map((l) => ({ unitPricePaise: l.price_paise, mrpPaise: l.mrp_paise, quantity: l.quantity }));
    const subtotalPaise = calculateOrderTotals({ items }).subtotalPaise;
    const coupon = input.couponCode ? await validateCoupon(input.couponCode, { userId: user.id, scope: 'store', subtotalPaise }) : null;

    let fitment = false;
    if (input.fitment) {
      if (!lines.some((l) => l.fitment_available)) throw AppError.unprocessable('None of the items in your cart can be fitted at our centre');
      if (!input.fitmentDate || !input.fitmentSlotId) throw AppError.unprocessable('Choose a date and slot for fitment', { fitmentDate: 'Required for fitment' });
      if (input.fitmentDate < addDaysISO(todayISO(), 2)) throw AppError.unprocessable('Fitment can be booked from 2 days after the order (delivery time)', { fitmentDate: 'Choose a later date' });
      await reserveSlot(input.fitmentDate, input.fitmentSlotId, 'fitmentDate');
      fitment = true;
    }
    const totals = calculateOrderTotals({ items, coupon, fitment });
    const code = await uniqueOrderCode();
    const isCod = input.paymentMethod === 'cod';

    const { lastInsertRowid: id } = await run(
      `INSERT INTO orders (order_code, user_id, status, payment_method, ship_name, ship_phone, ship_line1, ship_line2, ship_city, ship_state, ship_pincode,
                           subtotal_paise, discount_paise, shipping_paise, fitment_paise, total_paise, gst_included_paise, coupon_id, coupon_code,
                           fitment_date, fitment_slot_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, user.id, isCod ? 'placed' : 'pending_payment', input.paymentMethod, address.fullName, address.phone, address.line1, address.line2 ?? null,
      address.city, address.state, address.pincode, totals.subtotalPaise, totals.discountPaise, totals.shippingPaise, totals.fitmentPaise,
      totals.totalPaise, totals.gstIncludedPaise, coupon?.id ?? null, coupon?.code ?? null,
      fitment ? input.fitmentDate : null, fitment ? input.fitmentSlotId : null, nowSql(), nowSql(),
    );

    for (const l of lines) {
      await takeStock(l.product_id, l.quantity, `Order ${code}`, user.id);      // STOCK GUARD
      await run(
        'INSERT INTO order_items (order_id, product_id, product_name, sku, unit_price_paise, mrp_paise, quantity, line_total_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id, l.product_id, l.name, l.sku, l.price_paise, l.mrp_paise, l.quantity, l.price_paise * l.quantity,
      );
    }
    if (coupon) await redeemCoupon(coupon, user.id, { orderId: id }, totals.discountPaise);
    await addOrderHistory(id, null, isCod ? 'placed' : 'pending_payment', isCod ? 'Order placed - cash on delivery' : 'Order created - awaiting payment', user.id);
    if (isCod) await createCodPayment(id, user.id, totals.totalPaise);
    await clearCart(user.id);
    return id;
  });
  return getOrderDetail(orderId, user);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
const ORDER_SELECT = `
  SELECT o.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
         t.label AS slot_label, t.start_time, t.end_time,
         (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS line_count,
         (SELECT COALESCE(SUM(i.quantity), 0) FROM order_items i WHERE i.order_id = o.id) AS item_count,
         (SELECT p.status FROM payments p WHERE p.order_id = o.id AND p.status <> 'created' ORDER BY p.id DESC LIMIT 1) AS payment_status,
         (SELECT i.product_id FROM order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS first_product_id
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN time_slots t ON t.id = o.fitment_slot_id`;

function actionsFor(o) {
  const deliveredAt = o.delivered_at ? o.delivered_at.slice(0, 10) : null;
  return {
    pay: o.status === 'pending_payment',
    cancel: CANCELLABLE.includes(o.status),
    return: o.status === 'delivered' && deliveredAt && addDaysISO(deliveredAt, config.business.returnWindowDays) >= todayISO(),
    invoice: !['pending_payment', 'cancelled'].includes(o.status) && o.payment_status !== null,
  };
}

function mapOrder(o) {
  return {
    id: o.id,
    code: o.order_code,
    status: o.status,
    statusLabel: ORDER_STATUS_LABELS[o.status],
    paymentMethod: o.payment_method,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[o.payment_method],
    paymentStatus: o.payment_status || 'created',
    shipping: { name: o.ship_name, phone: o.ship_phone, line1: o.ship_line1, line2: o.ship_line2, city: o.ship_city, state: o.ship_state, pincode: o.ship_pincode },
    totals: {
      subtotalPaise: o.subtotal_paise, discountPaise: o.discount_paise, shippingPaise: o.shipping_paise, fitmentPaise: o.fitment_paise,
      totalPaise: o.total_paise, gstIncludedPaise: o.gst_included_paise, couponCode: o.coupon_code,
    },
    fitment: o.fitment_date ? { date: o.fitment_date, slotId: o.fitment_slot_id, label: o.slot_label, startTime: o.start_time, endTime: o.end_time } : null,
    itemCount: o.item_count,
    lineCount: o.line_count,
    cancelReason: o.cancel_reason,
    returnReason: o.return_reason,
    deliveredAt: o.delivered_at,
    createdAt: o.created_at,
    customer: { id: o.user_id, name: o.customer_name, email: o.customer_email, phone: o.customer_phone },
    actions: actionsFor(o),
  };
}

async function loadOrder(id, user) {
  const o = await one(`${ORDER_SELECT} WHERE o.id = ?`, id);
  if (!o || (user.role !== 'admin' && o.user_id !== user.id)) throw AppError.notFound('Order not found');
  return o;
}

export async function getOrderDetail(id, user) {
  const raw = await loadOrder(id, user);
  const order = mapOrder(raw);
  order.items = await Promise.all((await all(
    `SELECT i.*, p.slug, p.images FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = ? ORDER BY i.id`, id,
  )).map(async (i) => ({
    productId: i.product_id, name: i.product_name, sku: i.sku, slug: i.slug, image: JSON.parse(i.images)[0] || null,
    unitPricePaise: i.unit_price_paise, mrpPaise: i.mrp_paise, quantity: i.quantity, lineTotalPaise: i.line_total_paise,
    canReview: user.role !== 'admin' && ['delivered', 'return_requested', 'returned'].includes(raw.status)
      && !(await one('SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ?', i.product_id, raw.user_id))
      && Boolean(await verifiedPurchaseOrderId(raw.user_id, i.product_id)),
  })));
  order.history = await all(
    `SELECT h.from_status AS fromStatus, h.to_status AS toStatus, h.note, h.created_at AS createdAt, u.name AS changedBy, u.role AS changedByRole
       FROM order_status_history h LEFT JOIN users u ON u.id = h.changed_by WHERE h.order_id = ? ORDER BY h.id`, id,
  );
  order.payments = (await all(`${PAYMENT_SELECT} WHERE p.order_id = ? AND p.status <> 'created' ORDER BY p.id`, id)).map(mapPayment);
  return order;
}

export async function listOrdersForUser(userId) {
  const rows = await all(`${ORDER_SELECT} WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC`, userId);
  return Promise.all(rows.map(async (o) => ({ ...mapOrder(o), preview: await firstItem(o.id) })));
}

async function firstItem(orderId) {
  const i = await one('SELECT i.product_name, p.images FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = ? ORDER BY i.id LIMIT 1', orderId);
  return i ? { name: i.product_name, image: JSON.parse(i.images)[0] || null } : null;
}

export async function adminListOrders({ status = '', search = '' } = {}) {
  const like = `%${search}%`;
  return (await all(
    `${ORDER_SELECT} WHERE (? = '' OR o.status = ?) AND (o.order_code LIKE ? OR u.name LIKE ? OR u.email LIKE ? OR o.ship_city LIKE ?)
      ORDER BY o.created_at DESC, o.id DESC`,
    status, status, like, like, like, like,
  )).map(mapOrder);
}

// ---------------------------------------------------------------------------
// Cancel / return / admin status
// ---------------------------------------------------------------------------
/** Restores stock for every item of an order (cancel or approved return). */
async function restoreOrderStock(order, reason, userId) {
  const items = await all('SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id', order.id);
  for (const i of items) {
    await one('SELECT id FROM products WHERE id = ? FOR UPDATE', i.product_id);
    await restoreStock(i.product_id, i.quantity, reason, `Order ${order.order_code}`, userId);
  }
}

export async function cancelOrder(id, user, reason) {
  const byAdmin = user.role === 'admin';
  await transaction(async () => {
    await one('SELECT id FROM orders WHERE id = ? FOR UPDATE', id);
    const o = await loadOrder(id, user);
    if (!CANCELLABLE.includes(o.status)) {
      throw AppError.conflict(o.status === 'cancelled' ? 'This order is already cancelled' : 'This order has already been shipped and can no longer be cancelled. You can request a return after delivery.');
    }
    await run("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?", reason, nowSql(), id);
    await restoreOrderStock(o, 'cancel', user.id);
    await releaseCoupon({ orderId: id });
    if (o.fitment_date) await releaseSlot(o.fitment_date, o.fitment_slot_id);
    await cancelOpenPayments({ orderId: id });            // unpaid attempts + pending COD
    let note = `Cancelled by ${byAdmin ? 'CarZone' : 'customer'}: ${reason}`;
    const paid = await successfulPayment({ orderId: id });
    if (paid) {
      await createRefund(paid.id, { percent: 100, reason: 'Order cancelled before shipping - full refund' });
      note += ' - full refund initiated';
    }
    await addOrderHistory(id, o.status, 'cancelled', note, user.id);
  });
  return getOrderDetail(id, user);
}

export async function requestReturn(id, user, reason) {
  const o = await loadOrder(id, user);
  if (!actionsFor(o).return) {
    throw AppError.conflict(o.status === 'delivered' ? `The ${config.business.returnWindowDays}-day return window has closed` : 'Only delivered orders can be returned');
  }
  await transaction(async () => {
    await run("UPDATE orders SET status = 'return_requested', return_reason = ?, updated_at = ? WHERE id = ?", reason, nowSql(), id);
    await addOrderHistory(id, 'delivered', 'return_requested', `Return requested: ${reason}`, user.id);
  });
  return getOrderDetail(id, user);
}

export async function adminUpdateOrderStatus(id, admin, { status, note }) {
  const o = await loadOrder(id, admin);
  if (!TRANSITIONS[o.status].includes(status)) {
    throw AppError.conflict(`Cannot change an order from "${ORDER_STATUS_LABELS[o.status]}" to "${ORDER_STATUS_LABELS[status]}"`);
  }
  if (status === 'cancelled') return cancelOrder(id, admin, note || 'Cancelled by CarZone');

  await transaction(async () => {
    await one('SELECT id FROM orders WHERE id = ? FOR UPDATE', id);
    if (status === 'delivered' && o.status === 'out_for_delivery') {
      await run("UPDATE orders SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ?", nowSql(), nowSql(), id);
      await settleCod(id);                                    // COD cash collected on delivery
    } else if (status === 'delivered') {                      // return rejected
      await run("UPDATE orders SET status = 'delivered', updated_at = ? WHERE id = ?", nowSql(), id);
    } else {
      await run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', status, nowSql(), id);
    }

    let defaultNote = {
      packed: 'Items packed at the CarZone warehouse', shipped: 'Handed over to the courier', out_for_delivery: 'Out for delivery today',
      delivered: o.status === 'return_requested' ? 'Return request rejected' : 'Delivered to the customer', returned: 'Return received and approved',
    }[status];
    if (status === 'returned') {
      await restoreOrderStock(o, 'return', admin.id);
      const paid = await successfulPayment({ orderId: id });
      if (paid) {
        await createRefund(paid.id, { percent: 100, reason: 'Return approved - full refund', manual: paid.gateway === 'cod' });
        defaultNote += paid.gateway === 'cod' ? ' - cash refund to be paid manually' : ' - refund initiated';
      }
    }
    await addOrderHistory(id, o.status, status, note || defaultNote, admin.id);
  });
  return getOrderDetail(id, admin);
}
