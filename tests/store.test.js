/**
 * store.test.js - Accessories store: catalogue filters, wishlist, cart (incl. guest
 * merge), checkout (online + COD), STOCK GUARD against overselling, cancellation with
 * stock restore and refund, delivery, returns, verified-buyer reviews and invoices.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, CUSTOMER, ADMIN, isoDate, payWithCard } from './support/helpers.js';
import { one, run } from '../src/db/connection.js';

let srv;
let c;
let admin;
let addressId;
before(async () => {
  srv = await startTestServer('store');
  c = client(srv.url);
  await c.login(...CUSTOMER);
  admin = client(srv.url);
  await admin.login(...ADMIN);
  addressId = (await c.get('/api/me/addresses')).data[0].id;
});
after(async () => { await srv.close(); });

const productBySku = (sku) => one('SELECT * FROM products WHERE sku = ?', sku);
const stockOf = async (sku) => (await productBySku(sku)).stock;

test('catalogue: categories, compatibility filter, sorting, product page', async () => {
  const g = client(srv.url);
  assert.equal((await g.get('/api/store/categories')).data.length, 9);
  const models = (await g.get('/api/store/car-models')).data;
  const swift = models.find((m) => m.make === 'Maruti Suzuki' && m.model === 'Swift');
  const list = (await g.get(`/api/store/products?carModelId=${swift.id}`)).data;
  assert.ok(list.length > 0);
  assert.ok(list.every((p) => p.isUniversal || p.slug), 'only universal or compatible products');
  assert.ok(!list.some((p) => p.sku === 'CZ-INT-001'), 'Creta seat covers do not fit a Swift');
  const sorted = (await g.get('/api/store/products?category=lighting&sort=price_asc')).data;
  assert.ok(sorted.every((p, i) => i === 0 || sorted[i - 1].pricePaise <= p.pricePaise));
  const page = await g.get('/api/store/products/premium-leatherette-seat-covers-black-tan');
  assert.ok(page.data.compatibleModels.length >= 4);
  assert.ok(page.data.reviews.length >= 1);
  assert.ok(page.data.related.length >= 1);
  assert.equal((await g.get('/api/store/products?search=dash%20cam&inStock=1')).data.length >= 1, true);
});

test('wishlist add/remove and cart add/update/remove/merge', async () => {
  const p = await productBySku('CZ-CAR-001');
  assert.equal((await c.post(`/api/me/wishlist/${p.id}`)).data.wishlist.length >= 1, true);
  assert.equal((await c.del(`/api/me/wishlist/${p.id}`)).data.wishlist.some((x) => x.id === p.id), false);
  const added = await c.post(`/api/cart/items/${p.id}`, { quantity: 2 });
  assert.equal(added.data.cart.itemCount, 2);
  assert.equal((await c.put(`/api/cart/items/${p.id}`, { quantity: 3 })).data.cart.items[0].quantity, 3);
  assert.equal((await c.put(`/api/cart/items/${p.id}`, { quantity: 999 })).status, 422);
  const merged = await c.post('/api/cart/merge', { items: [{ productId: p.id, quantity: 2 }, { productId: 99999, quantity: 1 }] });
  assert.equal(merged.data.cart.items[0].quantity, 5);
  assert.equal((await c.del(`/api/cart/items/${p.id}`)).data.cart.itemCount, 0);
});

test('checkout online: stock taken, coupon applied, pay -> placed, invoice', async () => {
  const p = await productBySku('CZ-ELC-004');
  const before = p.stock;
  await c.post(`/api/cart/items/${p.id}`, { quantity: 1 });
  const q = await c.post('/api/orders/quote', { couponCode: 'GEAR10' });
  assert.equal(q.data.coupon.valid, true);
  const washOnly = await c.post('/api/orders/quote', { couponCode: 'SHINE200' });
  assert.equal(washOnly.data.coupon.valid, false);
  const o = await c.post('/api/orders', { addressId, paymentMethod: 'card', couponCode: 'GEAR10' });
  assert.equal(o.status, 201);
  assert.equal(o.data.order.status, 'pending_payment');
  assert.equal(o.data.order.totals.discountPaise, Math.min(Math.floor((p.price_paise * 10) / 100), 50000));
  assert.equal(await stockOf('CZ-ELC-004'), before - 1);
  assert.equal((await c.get('/api/cart')).data.itemCount, 0, 'cart emptied');
  const paid = await payWithCard(c, 'order', o.data.order.id);
  assert.equal(paid.status, 'success');
  const detail = await c.get(`/api/orders/${o.data.order.id}`);
  assert.equal(detail.data.status, 'placed');
  assert.match((await c.get(`/api/orders/${o.data.order.id}/invoice`, { raw: true })).text, /Includes CGST/);
});

test('STOCK GUARD: cannot buy more than is in stock, even if the cart said so', async () => {
  const p = await productBySku('CZ-LGT-003');            // fog lamps, low stock
  await c.put(`/api/cart/items/${p.id}`, { quantity: p.stock });
  await run('UPDATE products SET stock = 1 WHERE id = ?', p.id);   // someone else bought them meanwhile
  await run("INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (?, ?, 'adjustment', 'test', 1, '2026-01-01 00:00:00')", p.id, 1 - p.stock);
  const o = await c.post('/api/orders', { addressId, paymentMethod: 'cod' });
  assert.equal(o.status, 409);
  assert.match(o.error.message, /Only 1 left/);
  assert.equal(await stockOf('CZ-LGT-003'), 1, 'rolled back - nothing taken');
  await c.del(`/api/cart/items/${p.id}`);
});

test('COD order -> admin flow to delivered -> COD settled -> return -> stock restored + manual refund', async () => {
  const p = await productBySku('CZ-UTL-005');
  const start = p.stock;
  await c.post(`/api/cart/items/${p.id}`, { quantity: 2 });
  const o = (await c.post('/api/orders', { addressId, paymentMethod: 'cod' })).data.order;
  assert.equal(o.status, 'placed');
  assert.equal(o.payments[0].status, 'pending');
  assert.equal((await admin.patch(`/api/admin/orders/${o.id}/status`, { status: 'delivered' })).status, 409, 'cannot skip steps');
  for (const s of ['packed', 'shipped', 'out_for_delivery', 'delivered']) {
    assert.equal((await admin.patch(`/api/admin/orders/${o.id}/status`, { status: s })).status, 200, s);
  }
  const delivered = await c.get(`/api/orders/${o.id}`);
  assert.equal(delivered.data.payments[0].status, 'success');
  assert.equal(delivered.data.items[0].canReview, true);
  const rv = await c.post(`/api/store/products/${p.id}/reviews`, { rating: 5, title: 'Strong magnet', comment: 'Holds my phone firmly on bumpy roads.' });
  assert.equal(rv.status, 201);
  assert.equal((await c.post(`/api/orders/${o.id}/cancel`, { reason: 'Changed mind' })).status, 409, 'delivered orders cannot be cancelled');
  assert.equal((await c.post(`/api/orders/${o.id}/return`, { reason: 'Does not fit my vent' })).data.order.status, 'return_requested');
  const returned = await admin.patch(`/api/admin/orders/${o.id}/status`, { status: 'returned' });
  assert.equal(returned.data.order.status, 'returned');
  assert.equal(await stockOf('CZ-UTL-005'), start);
  const refund = (await admin.get('/api/admin/refunds?status=pending')).data.find((r) => r.targetCode === o.code);
  assert.equal(refund.manual, true);
});

test('cancel paid order before shipping -> stock restored + refund pending; slot released for fitment', async () => {
  const p = await productBySku('CZ-ELC-006');               // fitment available
  const start = p.stock;
  await c.post(`/api/cart/items/${p.id}`, { quantity: 1 });
  const q = await c.post('/api/orders/quote', { fitment: true });
  assert.equal(q.data.fitmentAllowed, true);
  const date = isoDate(4);
  const o = (await c.post('/api/orders', { addressId, paymentMethod: 'upi', fitment: true, fitmentDate: date, fitmentSlotId: 5 })).data.order;
  assert.equal(o.fitment.date, date);
  assert.equal(o.totals.fitmentPaise, 29900);
  const seats = (await one('SELECT booked_count FROM slot_inventory WHERE slot_date = ? AND time_slot_id = 5', date)).booked_count;
  await payWithCard(c, 'order', o.id);
  const cancelled = await c.post(`/api/orders/${o.id}/cancel`, { reason: 'Bought elsewhere' });
  assert.equal(cancelled.data.order.status, 'cancelled');
  assert.equal(await stockOf('CZ-ELC-006'), start);
  assert.equal((await one('SELECT booked_count FROM slot_inventory WHERE slot_date = ? AND time_slot_id = 5', date)).booked_count, seats - 1);
  assert.equal(cancelled.data.order.payments.find((x) => x.status === 'refund_pending').refund.amountPaise, o.totals.totalPaise);
});

test('only verified buyers can review products', async () => {
  const p = await productBySku('CZ-BIK-002');
  const r = await c.post(`/api/store/products/${p.id}/reviews`, { rating: 4, title: 'Nice', comment: 'Seems like a good cover.' });
  assert.equal(r.status, 403);
});

test('empty cart checkout and other users orders are rejected', async () => {
  assert.equal((await c.post('/api/orders', { addressId, paymentMethod: 'cod' })).status, 422);
  const other = client(srv.url);
  await other.login('ananya@example.com', 'Customer@123');
  const mine = (await c.get('/api/orders')).data[0];
  assert.equal((await other.get(`/api/orders/${mine.id}`)).status, 404);
  assert.equal((await other.post('/api/orders', { addressId, paymentMethod: 'cod' })).status, 404, 'cannot use someone else address');
});

test('addresses CRUD', async () => {
  const a = await c.post('/api/me/addresses', { label: 'Office', fullName: 'Rohan Sharma', phone: '9876543210', line1: 'Tech Park, Hinjewadi Phase 2', city: 'Pune', state: 'Maharashtra', pincode: '411057' });
  assert.equal(a.status, 201);
  assert.equal((await c.put(`/api/me/addresses/${a.data.address.id}`, { ...a.data.address, label: 'Work', isDefault: true })).data.address.isDefault, true);
  assert.equal((await c.del(`/api/me/addresses/${a.data.address.id}`)).status, 200);
});
