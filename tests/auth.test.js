/**
 * auth.test.js - Registration, login/logout, role guards, lockout, password reset
 * and the SPA/static serving rules.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, CUSTOMER, ADMIN } from './support/helpers.js';

let srv;
before(async () => { srv = await startTestServer('auth'); });
after(async () => { await srv.close(); });

test('register -> me -> logout', async () => {
  const c = client(srv.url);
  const bad = await c.post('/api/auth/register', { name: 'X', email: 'nope', phone: '1', password: 'x' });
  assert.equal(bad.status, 422);
  assert.ok(bad.error.fields.email);
  const r = await c.post('/api/auth/register', { name: 'Test Driver', email: 'driver@example.com', phone: '9812345678', password: 'Drive1234' });
  assert.equal(r.status, 201);
  assert.equal(r.data.redirect, '/dashboard');
  assert.equal((await c.get('/api/auth/me')).data.user.email, 'driver@example.com');
  const dup = await client(srv.url).post('/api/auth/register', { name: 'Test Driver', email: 'driver@example.com', phone: '9812345678', password: 'Drive1234' });
  assert.equal(dup.status, 409);
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/auth/me')).data.user, null);
});

test('login with wrong password fails; admin lands on /admin', async () => {
  const c = client(srv.url);
  assert.equal((await c.post('/api/auth/login', { email: CUSTOMER[0], password: 'Wrong1234' })).status, 401);
  const r = await c.post('/api/auth/login', { email: ADMIN[0], password: ADMIN[1] });
  assert.equal(r.data.redirect, '/admin');
});

test('role guard: guests 401, customers 403 on admin APIs, admins allowed', async () => {
  assert.equal((await client(srv.url).get('/api/admin/analytics')).status, 401);
  const cust = client(srv.url);
  await cust.login(...CUSTOMER);
  assert.equal((await cust.get('/api/admin/analytics')).status, 403);
  const page = await cust.get('/admin/products', { raw: true });
  assert.equal(page.status, 302);                               // server-side admin page guard
  const admin = client(srv.url);
  await admin.login(...ADMIN);
  assert.equal((await admin.get('/api/admin/analytics')).status, 200);
  assert.equal((await admin.post('/api/bookings', {})).status, 403); // admins cannot book as customers
});

test('account lockout after repeated failures', async () => {
  const c = client(srv.url);
  let last;
  for (let i = 0; i < 5; i++) last = await c.post('/api/auth/login', { email: 'imran@example.com', password: 'Wrong1234' });
  assert.equal(last.status, 423);
  assert.equal((await c.post('/api/auth/login', { email: 'imran@example.com', password: 'Customer@123' })).status, 423);
});

test('password reset: demo link, single use, old sessions revoked', async () => {
  const old = client(srv.url);
  await old.login('priya@example.com', 'Customer@123');
  const c = client(srv.url);
  const f = await c.post('/api/auth/forgot-password', { email: 'priya@example.com' });
  const token = new URL(f.data.demoResetLink, 'http://x').searchParams.get('token');
  assert.ok(token);
  assert.equal((await c.post('/api/auth/reset-password', { token, password: 'NewPass123' })).status, 200);
  assert.equal((await c.post('/api/auth/reset-password', { token, password: 'NewPass123' })).status, 400);
  assert.equal((await old.get('/api/me/profile')).status, 401);
  await c.login('priya@example.com', 'NewPass123');
  const unknown = await c.post('/api/auth/forgot-password', { email: 'nobody@example.com' });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.data.demoResetLink, null);
});

test('change password + profile update', async () => {
  const c = client(srv.url);
  await c.login('arjun@example.com', 'Customer@123');
  assert.equal((await c.put('/api/auth/password', { currentPassword: 'bad', newPassword: 'Another123' })).status, 422);
  assert.equal((await c.put('/api/auth/password', { currentPassword: 'Customer@123', newPassword: 'Another123' })).status, 200);
  const p = await c.put('/api/me/profile', { name: 'Arjun Patil', phone: '9890123456', city: 'Pune', pincode: '411057', address: 'Wakad' });
  assert.equal(p.data.user.city, 'Pune');
});

test('SPA fallback, security headers, JSON-only API and 404s', async () => {
  const c = client(srv.url);
  const page = await c.get('/shop/some-route', { raw: true });
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await c.get('/assets/does-not-exist.png', { raw: true })).status, 404);
  assert.equal((await c.get('/api/nope')).status, 404);
  const form = await c.post('/api/contact', 'name=x', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(form.status, 415);
  assert.equal((await c.post('/api/contact', { name: 'Meera Joshi', email: 'm@example.com', subject: 'Hello there', message: 'Do you do fleet washing?' })).status, 201);
});
