/**
 * admin.test.js - Every admin CRUD, the booking/order workflows, moderation,
 * analytics and all report formats (JSON / CSV / printable HTML).
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, ADMIN, isoDate } from './support/helpers.js';
import { REPORT_TYPES } from '../shared/constants.js';

let srv;
let a;
before(async () => {
  srv = await startTestServer('admin');
  a = client(srv.url);
  await a.login(...ADMIN);
});
after(async () => { await srv.close(); });

test('analytics combine wash and store', async () => {
  const d = (await a.get('/api/admin/analytics')).data;
  assert.ok(d.totals.washRevenuePaise > 0);
  assert.ok(d.totals.storeRevenuePaise > 0);
  assert.equal(d.totals.netRevenuePaise, d.totals.washRevenuePaise + d.totals.storeRevenuePaise);
  assert.equal(d.revenueByDay.length, 14);
  assert.ok(d.topProducts.length > 0 && d.topServices.length > 0);
  assert.ok(d.lowStock.some((p) => p.stock === 0), 'out-of-stock GPS tracker is flagged');
  assert.ok(d.recentActivity.length > 0);
  assert.ok(d.totals.paymentSuccessRate > 0);
});

test('reports: every type in JSON, CSV and HTML', async () => {
  const from = isoDate(-60);
  const to = isoDate(30);
  for (const type of REPORT_TYPES) {
    const j = await a.get(`/api/admin/reports/${type}?from=${from}&to=${to}`);
    assert.equal(j.status, 200, type);
    assert.ok(j.data.columns.length && j.data.summary.length, type);
    const csv = await a.get(`/api/admin/reports/${type}?from=${from}&to=${to}&format=csv`, { raw: true });
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.ok(csv.text.split('\n').length >= 2, type);
    const html = await a.get(`/api/admin/reports/${type}?from=${from}&to=${to}&format=html`, { raw: true });
    assert.match(html.text, /Print \/ Save as PDF/);
  }
  assert.equal((await a.get('/api/admin/reports/nope')).status, 404);
});

test('users CRUD', async () => {
  const u = await a.post('/api/admin/users', { name: 'New Staff', email: 'staff@carzone.in', phone: '9811111111', role: 'admin', password: 'Staff1234' });
  assert.equal(u.status, 201);
  const upd = await a.put(`/api/admin/users/${u.data.user.id}`, { name: 'New Staff', phone: '9811111111', role: 'customer', isActive: false });
  assert.equal(upd.data.user.isActive, false);
  assert.ok((await a.get('/api/admin/users?search=staff')).data.length >= 1);
  assert.equal((await a.del(`/api/admin/users/${u.data.user.id}`)).status, 200);
  assert.equal((await a.del('/api/admin/users/2')).status, 409, 'users with history cannot be deleted');
});

test('services, add-ons, coupons and slots CRUD', async () => {
  const addon = await a.post('/api/admin/addons', { name: 'Seat Shampoo', description: 'Deep shampoo of fabric seats', price: '499', durationMinutes: 20, isActive: true });
  assert.equal(addon.status, 201);
  assert.equal((await a.put(`/api/admin/addons/${addon.data.addon.id}`, { name: 'Seat Shampoo', description: 'Deep shampoo of fabric seats', price: '549', durationMinutes: 20, isActive: true })).data.addon.pricePaise, 54900);
  const svc = await a.post('/api/admin/services', {
    name: 'Headlight Care', category: 'Exterior', tagline: 'Crystal clear headlights', description: 'Restores hazy headlights with sanding and UV coat.',
    benefits: ['Clearer beam', 'UV coat'], durationMinutes: 60, image: '/assets/images/services/premium-wash.jpg', addonIds: [addon.data.addon.id],
    prices: { hatchback: '699', sedan: '799', suv: '', luxury: '999' }, pickupAvailable: true, isActive: true,
  });
  assert.equal(svc.status, 201);
  assert.equal(svc.data.service.prices.suv, undefined);
  const id = svc.data.service.id;
  assert.equal((await a.patch(`/api/admin/services/${id}/active`, { isActive: false })).data.service.isActive, false);
  assert.equal((await a.del(`/api/admin/services/${id}`)).status, 200);
  assert.equal((await a.del(`/api/admin/addons/${addon.data.addon.id}`)).status, 200);
  assert.equal((await a.del('/api/admin/services/1')).status, 409);

  const coupon = await a.post('/api/admin/coupons', { code: 'TESTSTORE', title: 'Test', description: 'Store test coupon', discountType: 'flat', discountValue: 100, minOrder: '500', validFrom: isoDate(0), validUntil: isoDate(10), perUserLimit: 1, appliesTo: 'store', isActive: true });
  assert.equal(coupon.status, 201);
  assert.equal(coupon.data.coupon.discountValue, 10000);
  assert.equal((await a.put(`/api/admin/coupons/${coupon.data.coupon.id}`, { code: 'TESTSTORE', title: 'Test 2', description: 'Store test coupon', discountType: 'percent', discountValue: 5, validFrom: isoDate(0), validUntil: isoDate(10), perUserLimit: 1, appliesTo: 'both', isActive: true })).data.coupon.appliesTo, 'both');
  assert.equal((await a.post('/api/admin/coupons', { code: 'BADSCOPE', title: 'Bad', description: 'Bad coupon', discountType: 'flat', discountValue: 100, validFrom: isoDate(0), validUntil: isoDate(1), perUserLimit: 1, serviceId: 1, appliesTo: 'store' })).status, 422);
  assert.equal((await a.del(`/api/admin/coupons/${coupon.data.coupon.id}`)).status, 200);

  const slot = await a.post('/api/admin/slots', { label: 'Night', startTime: '18:00', endTime: '19:30', capacity: 2, isActive: true });
  assert.equal(slot.status, 201);
  assert.equal((await a.put(`/api/admin/slots/${slot.data.slot.id}`, { label: 'Night', startTime: '18:00', endTime: '19:30', capacity: 3, isActive: true })).data.slot.capacity, 3);
  const day = await a.put('/api/admin/slots/day', { date: isoDate(2), timeSlotId: slot.data.slot.id, capacity: 1, isBlocked: true });
  assert.equal(day.data.slot.isBlocked, true);
  assert.equal((await a.get(`/api/admin/slots/day?date=${isoDate(2)}`)).data.slots.length, 7);
  assert.equal((await a.del(`/api/admin/slots/${slot.data.slot.id}`)).status, 200);
});

test('products, categories and inventory', async () => {
  const cat = await a.post('/api/admin/categories', { name: 'Tyres & Wheels', description: 'Alloy wheels and tyre accessories', image: '/assets/images/categories/utility.jpg', isActive: true });
  assert.equal(cat.status, 201);
  const models = (await a.get('/api/admin/car-models')).data;
  const product = await a.post('/api/admin/products', {
    name: 'Alloy Wheel Cleaner Brush', sku: 'CZ-TST-001', categoryId: cat.data.category.id, brand: 'ShineCraft',
    description: 'Soft bristle brush that reaches between alloy spokes safely.', features: ['Soft bristles', 'Long handle'],
    price: '399', mrp: '599', warranty: 'No warranty', image: '/assets/images/products/microfibre-cloth-pack-set-of-6-1.jpg',
    isUniversal: false, compatibleModelIds: [models[0].id], openingStock: 12,
  });
  assert.equal(product.status, 201);
  const pid = product.data.product.id;
  assert.equal(product.data.product.stock, 12);
  assert.equal((await a.post('/api/admin/products', { ...product.data.product, sku: 'CZ-TST-002', price: '700', mrp: '600', categoryId: cat.data.category.id, features: ['x'], image: '/assets/images/x.jpg', isUniversal: true, description: 'A long enough description text here.' })).status, 422);
  const adj = await a.patch(`/api/admin/products/${pid}/stock`, { change: -5, note: 'Damaged in transit' });
  assert.equal(adj.data.product.stock, 7);
  assert.equal((await a.patch(`/api/admin/products/${pid}/stock`, { change: -50, note: 'Too much' })).status, 422);
  const detail = await a.get(`/api/admin/products/${pid}`);
  assert.equal(detail.data.movements.length, 2);
  assert.equal((await a.get('/api/admin/products?stock=out')).data.some((p) => p.sku === 'CZ-SAF-004'), true);
  assert.ok((await a.get('/api/admin/products/low-stock')).data.length >= 2);
  assert.equal((await a.del(`/api/admin/categories/${cat.data.category.id}`)).status, 409, 'category with products');
  assert.equal((await a.del(`/api/admin/products/${pid}`)).status, 200);
  assert.equal((await a.put(`/api/admin/categories/${cat.data.category.id}`, { name: 'Wheels', description: 'Wheel accessories here', image: '/assets/images/categories/utility.jpg', isActive: false })).data.category.isActive, false);
  assert.equal((await a.del(`/api/admin/categories/${cat.data.category.id}`)).status, 200);
});

test('booking workflow, orders, payments, moderation and messages', async () => {
  const bookings = (await a.get('/api/admin/bookings?status=confirmed')).data;
  const today = (await a.get('/api/admin/bookings?status=in_progress')).data[0];
  assert.equal((await a.patch(`/api/admin/bookings/${today.id}/status`, { status: 'completed' })).data.booking.status, 'completed');
  assert.equal((await a.patch(`/api/admin/bookings/${bookings[0].id}/status`, { status: 'completed' })).status, 409);
  const cancelled = await a.patch(`/api/admin/bookings/${bookings[0].id}/status`, { status: 'cancelled', note: 'Machine breakdown' });
  assert.equal(cancelled.data.booking.refund.percent, 100);

  const orders = (await a.get('/api/admin/orders')).data;
  assert.equal(orders.length, 16);
  const rr = orders.find((o) => o.status === 'return_requested');
  assert.equal((await a.patch(`/api/admin/orders/${rr.id}/status`, { status: 'delivered', note: 'Item used - return rejected' })).data.order.status, 'delivered');
  const placed = orders.find((o) => o.status === 'placed');
  assert.equal((await a.get(`/api/admin/orders/${placed.id}`)).data.fitment !== null, true);

  const pays = (await a.get('/api/admin/payments?status=failed')).data;
  assert.ok(pays.length >= 2);
  assert.equal((await a.get(`/api/admin/payments/${pays[0].id}`)).data.status, 'failed');
  assert.ok((await a.get('/api/admin/payments?gateway=cod')).data.length >= 3);

  const pending = (await a.get('/api/admin/reviews?status=pending')).data[0];
  assert.equal((await a.patch(`/api/admin/reviews/${pending.id}`, { status: 'approved', adminReply: 'Thanks!' })).data.review.status, 'approved');
  const prPending = (await a.get('/api/admin/product-reviews?status=pending')).data[0];
  assert.equal((await a.patch(`/api/admin/product-reviews/${prPending.id}`, { status: 'approved' })).data.review.status, 'approved');
  assert.equal((await a.del(`/api/admin/product-reviews/${prPending.id}`)).status, 200);
  assert.equal((await a.del(`/api/admin/reviews/${pending.id}`)).status, 200);

  const msg = (await a.get('/api/admin/messages')).data[0];
  assert.equal((await a.patch(`/api/admin/messages/${msg.id}`, { status: 'resolved' })).data.message.status, 'resolved');
  assert.equal((await a.del(`/api/admin/messages/${msg.id}`)).status, 200);
});
