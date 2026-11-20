/**
 * wash.test.js - Wash bookings end to end: catalogue, slots, quotes + coupons, booking
 * creation, the gateway-style payment lifecycle (OTP, UPI polling, net banking,
 * idempotency, amount tampering, expiry), cancellation + refunds, rescheduling,
 * reviews, invoices and seed-data consistency.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, CUSTOMER, ADMIN, isoDate, payWithCard } from './support/helpers.js';
import { calculateBill } from '../src/services/pricing.service.js';
import { all, one, run } from '../src/db/connection.js';

let srv;
let c;
let admin;
before(async () => {
  srv = await startTestServer('wash');
  c = client(srv.url);
  await c.login(...CUSTOMER);
  admin = client(srv.url);
  await admin.login(...ADMIN);
});
after(async () => { await srv.close(); });

const bookingInput = (extra = {}) => ({
  serviceId: 2, vehicleType: 'sedan', brand: 'Honda', model: 'City', registrationNo: 'MH12ZZ9999',
  addonIds: [1], bookingDate: isoDate(5), timeSlotId: 4, pickupDrop: true, address: 'Flat 802, Skyline Residency, Baner, Pune', ...extra,
});

test('seed data is internally consistent (amounts, slots, coupons, stock, payments)', async () => {
  for (const b of await all('SELECT * FROM bookings')) {
    const addons = await all('SELECT price_paise AS pricePaise FROM booking_addons WHERE booking_id = ?', b.id);
    const coupon = b.coupon_id ? await one('SELECT * FROM coupons WHERE id = ?', b.coupon_id) : null;
    const bill = calculateBill({
      basePricePaise: (await one('SELECT price_paise FROM service_prices WHERE service_id = ? AND vehicle_type = ?', b.service_id, b.vehicle_type)).price_paise,
      addons, pickupDrop: Boolean(b.pickup_drop),
      coupon: coupon && { code: coupon.code, discountType: coupon.discount_type, discountValue: coupon.discount_value, maxDiscountPaise: coupon.max_discount_paise },
    });
    assert.equal(b.total_paise, bill.totalPaise, `booking ${b.booking_code}`);
  }
  const slots = await all(`SELECT i.slot_date, i.time_slot_id, i.booked_count,
      (SELECT COUNT(*) FROM bookings b WHERE b.booking_date = i.slot_date AND b.time_slot_id = i.time_slot_id AND b.status <> 'cancelled')
    + (SELECT COUNT(*) FROM orders o WHERE o.fitment_date = i.slot_date AND o.fitment_slot_id = i.time_slot_id AND o.status <> 'cancelled') AS actual
      FROM slot_inventory i`);
  for (const s of slots) assert.equal(s.booked_count, s.actual, `slot ${s.slot_date}/${s.time_slot_id}`);
  for (const cp of await all('SELECT id, used_count, (SELECT COUNT(*) FROM coupon_redemptions r WHERE r.coupon_id = c.id) AS n FROM coupons c')) {
    assert.equal(cp.used_count, cp.n);
  }
  const ledger = await all('SELECT p.id FROM products p WHERE p.stock <> (SELECT COALESCE(SUM(qty_change), 0) FROM stock_movements m WHERE m.product_id = p.id)');
  assert.equal(ledger.length, 0);
  const paidMismatch = await all("SELECT b.id FROM bookings b WHERE b.status IN ('confirmed','rescheduled','in_progress','completed') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.booking_id = b.id AND p.status = 'success')");
  assert.equal(paidMismatch.length, 0);
  assert.ok((await one("SELECT COUNT(*) AS n FROM payments WHERE status = 'failed'")).n >= 2);
});

test('services, service detail, slots and offers are public', async () => {
  const guest = client(srv.url);
  const services = await guest.get('/api/services');
  assert.equal(services.data.length, 9);
  assert.equal((await guest.get('/api/services/ceramic-coating')).data.prices.bike, undefined);
  const slots = await guest.get(`/api/slots?date=${isoDate(3)}`);
  assert.equal(slots.data.slots.length, 6);
  assert.equal((await guest.get(`/api/slots?date=${isoDate(-1)}`)).status, 422);
  assert.ok((await guest.get('/api/offers?scope=store')).data.every((o) => o.appliesTo !== 'wash'));
});

test('quote applies wash coupons and rejects store-only coupons', async () => {
  const ok = await c.post('/api/bookings/quote', { serviceId: 2, vehicleType: 'suv', addonIds: [1], pickupDrop: true, couponCode: 'MONSOON25' });
  assert.equal(ok.data.coupon.valid, true);
  assert.ok(ok.data.bill.discountPaise > 0);
  const store = await c.post('/api/bookings/quote', { serviceId: 2, vehicleType: 'suv', couponCode: 'GEAR10' });
  assert.equal(store.data.coupon.valid, false);
  assert.match(store.data.coupon.message, /accessories store/);
  const expired = await c.post('/api/bookings/quote', { serviceId: 2, vehicleType: 'suv', couponCode: 'DIWALI30' });
  assert.equal(expired.data.coupon.message, 'This coupon has expired');
});

test('booking -> card payment with 3-D Secure OTP -> confirmed, invoice with receipt', async () => {
  const r = await c.post('/api/bookings', bookingInput({ saveVehicle: true }));
  assert.equal(r.status, 201);
  const b = r.data.booking;
  assert.equal(b.status, 'pending_payment');
  const inv = await one('SELECT booked_count FROM slot_inventory WHERE slot_date = ? AND time_slot_id = 4', isoDate(5));
  assert.ok(inv.booked_count >= 1);

  const key = `idem-${Date.now()}`;
  const p1 = await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: key });
  const p2 = await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: key });
  assert.equal(p1.data.payment.id, p2.data.payment.id, 'same idempotency key -> same payment');
  assert.equal(p1.data.payment.amountPaise, b.bill.totalPaise, 'amount comes from the server');

  const start = await c.post(`/api/payments/${p1.data.payment.id}/simulate`, { method: 'card', details: { cardName: 'Rohan', cardNumber: '4111111111111111', expiry: '12/30', cvv: '123' } });
  assert.equal(start.data.nextAction, 'otp');
  assert.equal(start.data.payment.methodDetail, 'Visa **** 1111');
  const v = await c.post(`/api/payments/${p1.data.payment.id}/verify`, { otp: start.data.demoOtp });
  assert.equal(v.data.payment.status, 'success');
  const replay = await c.post(`/api/payments/${p1.data.payment.id}/verify`, { otp: '000000' });
  assert.equal(replay.data.payment.status, 'success', 'verify replay is idempotent');
  assert.equal((await one("SELECT COUNT(*) AS n FROM booking_status_history WHERE booking_id = ? AND to_status = 'confirmed'", b.id)).n, 1);

  const detail = await c.get(`/api/bookings/${b.id}`);
  assert.equal(detail.data.status, 'confirmed');
  const html = await c.get(`/api/bookings/${b.id}/invoice`, { raw: true });
  assert.match(html.text, /Tax invoice/);
  assert.match(html.text, /PAY-/);
  assert.equal((await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: `again-${Date.now()}` })).status, 409);
});

test('wrong OTP fails, declined card fails, amount tampering is rejected, retry works', async () => {
  const b = (await c.post('/api/bookings', bookingInput({ registrationNo: 'MH12ZZ8888', timeSlotId: 5 }))).data.booking;
  assert.equal((await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: `t-${Date.now()}`, amount: 100 })).status, 400);
  const pr = await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: `w-${Date.now()}` });
  assert.equal(pr.status, 201, JSON.stringify(pr.body));
  const p = pr.data.payment;
  const sim = await c.post(`/api/payments/${p.id}/simulate`, { method: 'card', details: { cardName: 'Rohan Sharma', cardNumber: '4111111111111111', expiry: '12/30', cvv: '123' } });
  assert.equal(sim.data?.nextAction, 'otp', JSON.stringify(sim.body));
  const wrong = await c.post(`/api/payments/${p.id}/verify`, { otp: '999999' });
  assert.equal(wrong.status, 200, JSON.stringify(wrong.body));
  assert.equal(wrong.data.payment.status, 'failed');
  assert.match(wrong.data.payment.failureReason, /OTP/);

  const p2 = (await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: `d-${Date.now()}` })).data.payment;
  const declined = await c.post(`/api/payments/${p2.id}/simulate`, { method: 'card', details: { cardName: 'Rohan Sharma', cardNumber: '4000 0000 0000 0002', expiry: '12/30', cvv: '123' } });
  assert.equal(declined.data.nextAction, 'failed');
  assert.equal((await c.get(`/api/bookings/${b.id}`)).data.status, 'pending_payment');

  const paid = await payWithCard(c, 'booking', b.id);
  assert.equal(paid.status, 'success');
});

test('UPI: pending -> polled -> success; failure@upi declined; net banking approve', async () => {
  const b = (await c.post('/api/bookings', bookingInput({ registrationNo: 'MH12ZZ7777', timeSlotId: 3 }))).data.booking;
  const p = (await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: `u-${Date.now()}` })).data.payment;
  const start = await c.post(`/api/payments/${p.id}/simulate`, { method: 'upi', details: { upiId: 'rohan@okhdfc' } });
  assert.equal(start.data.nextAction, 'poll');
  assert.equal((await c.get(`/api/payments/${p.id}/status`)).data.payment.status, 'pending');
  await run('UPDATE payments SET pending_until = ? WHERE id = ?', '2000-01-01 00:00:00', p.id);   // fast-forward the approval wait
  assert.equal((await c.get(`/api/payments/${p.id}/status`)).data.payment.status, 'success');
  assert.equal((await c.get(`/api/bookings/${b.id}`)).data.status, 'confirmed');

  const b2 = (await c.post('/api/bookings', bookingInput({ registrationNo: 'MH12ZZ6666', timeSlotId: 2 }))).data.booking;
  const f = (await c.post('/api/payments', { purpose: 'booking', targetId: b2.id, idempotencyKey: `f-${Date.now()}` })).data.payment;
  await c.post(`/api/payments/${f.id}/simulate`, { method: 'upi', details: { upiId: 'failure@upi' } });
  await run('UPDATE payments SET pending_until = ? WHERE id = ?', '2000-01-01 00:00:00', f.id);
  assert.equal((await c.get(`/api/payments/${f.id}/status`)).data.payment.status, 'failed');

  const nb = (await c.post('/api/payments', { purpose: 'booking', targetId: b2.id, idempotencyKey: `n-${Date.now()}` })).data.payment;
  assert.equal((await c.post(`/api/payments/${nb.id}/simulate`, { method: 'netbanking', details: { bank: 'HDFC Bank' } })).data.nextAction, 'bank');
  assert.equal((await c.post(`/api/payments/${nb.id}/verify`, { bankDecision: 'approve' })).data.payment.status, 'success');
});

test('expired payment sessions fail and other users cannot see a payment', async () => {
  const br = await c.post('/api/bookings', bookingInput({ registrationNo: 'MH12ZZ5555', timeSlotId: 6, bookingDate: isoDate(6) }));
  assert.equal(br.status, 201, JSON.stringify(br.body));
  const b = br.data.booking;
  const p = (await c.post('/api/payments', { purpose: 'booking', targetId: b.id, idempotencyKey: `e-${Date.now()}` })).data.payment;
  await run('UPDATE payments SET expires_at = ? WHERE id = ?', '2000-01-01 00:00:00', p.id);
  const s = await c.get(`/api/payments/${p.id}/status`);
  assert.equal(s.data.payment.status, 'failed');
  const other = client(srv.url);
  await other.login('ananya@example.com', 'Customer@123');
  assert.equal((await other.get(`/api/payments/${p.id}/status`)).status, 404);
  assert.equal((await other.get(`/api/bookings/${b.id}`)).status, 404);
});

test('cancel paid booking -> refund pending -> admin processes -> refunded; slot released', async () => {
  const b = (await c.post('/api/bookings', bookingInput({ registrationNo: 'MH12ZZ4444', timeSlotId: 1, bookingDate: isoDate(9) }))).data.booking;
  await payWithCard(c, 'booking', b.id);
  const before = (await one('SELECT booked_count FROM slot_inventory WHERE slot_date = ? AND time_slot_id = 1', isoDate(9))).booked_count;
  const r = await c.post(`/api/bookings/${b.id}/cancel`, { reason: 'Travelling that day' });
  assert.equal(r.data.booking.status, 'cancelled');
  assert.equal(r.data.booking.refund.percent, 100);
  assert.equal((await one('SELECT booked_count FROM slot_inventory WHERE slot_date = ? AND time_slot_id = 1', isoDate(9))).booked_count, before - 1);
  const refunds = await admin.get('/api/admin/refunds?status=pending');
  const refund = refunds.data.find((x) => x.targetCode === b.code);
  const processed = await admin.post(`/api/admin/refunds/${refund.id}/process`);
  assert.equal(processed.data.refund.status, 'processed');
  assert.equal((await admin.post(`/api/admin/refunds/${refund.id}/process`)).status, 409);
  assert.equal((await c.get(`/api/bookings/${b.id}`)).data.paymentStatus, 'refunded');
});

test('reschedule moves the seat; review only after completion', async () => {
  const b = (await c.post('/api/bookings', bookingInput({ registrationNo: 'MH12ZZ3333', timeSlotId: 2, bookingDate: isoDate(10) }))).data.booking;
  await payWithCard(c, 'booking', b.id);
  const r = await c.post(`/api/bookings/${b.id}/reschedule`, { bookingDate: isoDate(11), timeSlotId: 3 });
  assert.equal(r.data.booking.status, 'rescheduled');
  assert.equal(r.data.booking.bookingDate, isoDate(11));
  assert.equal((await c.post('/api/reviews', { bookingId: b.id, rating: 5, title: 'Great', comment: 'Lovely service overall' })).status, 409);
  const completed = (await c.get('/api/bookings?scope=past')).data.find((x) => x.actions.review);
  const review = await c.post('/api/reviews', { bookingId: completed.id, rating: 5, title: 'Spotless', comment: 'The bike looks brand new again.' });
  assert.equal(review.status, 201);
  assert.equal(review.data.review.status, 'pending');
});

test('full slot is refused with 409', async () => {
  const date = isoDate(12);
  await run('INSERT INTO slot_inventory (slot_date, time_slot_id, booked_count, capacity_override, is_blocked) VALUES (?, 1, 0, 0, 0)', date);
  const r = await c.post('/api/bookings', bookingInput({ registrationNo: 'MH12ZZ2222', timeSlotId: 1, bookingDate: date }));
  assert.equal(r.status, 409);
});
