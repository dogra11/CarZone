/**
 * unit.test.js - Pure-function tests: pricing, coupons maths, validation, signatures,
 * rate limiting and CSV export. No server or database needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBill, calculateOrderTotals, computeDiscount } from '../src/services/pricing.service.js';
import { validate, schemas, luhnValid } from '../shared/validation.js';
import { verifyPaymentSignature, verifyWebhookSignature } from '../src/services/payments/razorpay.gateway.js';
import { rateLimit } from '../src/middleware/rateLimit.js';
import { toCsv } from '../src/utils/csv.js';
import { mysqlToSqlite } from './support/mysql2-sqlite-shim.js';

test('wash bill: base + add-ons + pickup - coupon + 18% GST (integer paise)', () => {
  const coupon = { code: 'WELCOME15', discountType: 'percent', discountValue: 15, maxDiscountPaise: 30000 };
  const b = calculateBill({ basePricePaise: 119900, addons: [{ pricePaise: 14900 }], pickupDrop: true, coupon, pickupFeePaise: 19900, gstPercent: 18 });
  assert.equal(b.subtotalPaise, 154700);
  assert.equal(b.discountPaise, 23205);              // 15% = 23205 (< 300 cap)
  assert.equal(b.taxPaise, Math.round((154700 - 23205) * 0.18));
  assert.equal(b.totalPaise, 154700 - 23205 + b.taxPaise);
});

test('coupon caps and flat discounts never exceed the subtotal', () => {
  assert.equal(computeDiscount({ discountType: 'percent', discountValue: 50, maxDiscountPaise: 50000 }, 1000000), 50000);
  assert.equal(computeDiscount({ discountType: 'flat', discountValue: 99900 }, 50000), 50000);
  assert.equal(computeDiscount(null, 50000), 0);
});

test('store totals: GST-inclusive, free shipping threshold, fitment fee', () => {
  const items = [{ unitPricePaise: 59900, mrpPaise: 119900, quantity: 1 }];
  const small = calculateOrderTotals({ items, freeShippingAbovePaise: 99900, shippingFeePaise: 7900, fitmentFeePaise: 29900, gstPercent: 18 });
  assert.equal(small.shippingPaise, 7900);
  assert.equal(small.totalPaise, 59900 + 7900);
  assert.equal(small.savingsPaise, 60000);
  const big = calculateOrderTotals({ items: [{ unitPricePaise: 649900, quantity: 1 }], fitment: true, freeShippingAbovePaise: 99900, shippingFeePaise: 7900, fitmentFeePaise: 29900, gstPercent: 18 });
  assert.equal(big.shippingPaise, 0);
  assert.equal(big.totalPaise, 649900 + 29900);
  assert.equal(big.gstIncludedPaise, Math.round((679800 * 18) / 118));
});

test('shared validation: Luhn, phone, registration number, password', () => {
  assert.ok(luhnValid('4111111111111111'));
  assert.ok(!luhnValid('4111111111111112'));
  const r = validate(schemas.register, { name: 'A', email: 'bad', phone: '12345', password: 'short' });
  assert.equal(r.valid, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['email', 'name', 'password', 'phone']);
  assert.equal(validate(schemas.vehicle, { vehicleType: 'suv', brand: 'Tata', model: 'Nexon', registrationNo: 'mh 12 ab 1234' }).values.registrationNo, 'MH12AB1234');
});

test('Razorpay checkout signature: known vector passes, tampering fails', () => {
  const secret = 'rzp_test_secret_123';
  const good = { orderId: 'order_NXa1b2c3d4', paymentId: 'pay_NXz9y8x7w6', signature: '8a109987bece1c133d7d140a574c6221a09255303ea4d368d4846c1b9d0eb08d' };
  assert.equal(verifyPaymentSignature(good, secret), true);
  assert.equal(verifyPaymentSignature({ ...good, paymentId: 'pay_other' }, secret), false);
  assert.equal(verifyPaymentSignature({ ...good, signature: 'deadbeef' }, secret), false);
  assert.equal(verifyPaymentSignature(good, 'wrong_secret'), false);
});

test('Razorpay webhook signature over the raw body', () => {
  const body = '{"event":"payment.captured"}';
  assert.equal(verifyWebhookSignature(body, 'a71d5b6534e6da8d37f516016cf676e1907ac08405736468b7d40bf568273f2e', 'whsec_demo'), true);
  assert.equal(verifyWebhookSignature(`${body} `, 'a71d5b6534e6da8d37f516016cf676e1907ac08405736468b7d40bf568273f2e', 'whsec_demo'), false);
});

test('rate limiter blocks after max requests (Express middleware: passes a 429 to next)', () => {
  const limiter = rateLimit({ windowMs: 60000, max: 3, name: 't' });
  const req = { ip: '1.2.3.4' };
  const headers = {};
  const res = { set(k, v) { headers[k] = v; return this; } };
  const errors = [];
  for (let i = 0; i < 3; i++) limiter(req, res, (err) => errors.push(err));
  assert.deepEqual(errors, [undefined, undefined, undefined]);
  limiter(req, res, (err) => errors.push(err));
  assert.equal(errors[3].status, 429);
  assert.match(errors[3].message, /Too many/);
  assert.equal(headers['X-RateLimit-Remaining'], '0');
  assert.ok(Number(headers['Retry-After']) > 0);
});

test('CSV export escapes quotes, commas and formula injection', () => {
  const csv = toCsv([{ key: 'a', label: 'A' }], [{ a: 'x, "y"' }, { a: '=SUM(1)' }]);
  assert.ok(csv.includes('"x, ""y"""'));
  assert.ok(csv.includes("'=SUM(1)"));
});

test('test shim converts the MySQL schema dialect', () => {
  const out = mysqlToSqlite("CREATE TABLE t (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, d DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
  assert.match(out, /INTEGER PRIMARY KEY AUTOINCREMENT/);
  assert.doesNotMatch(out, /ENGINE/);
});
