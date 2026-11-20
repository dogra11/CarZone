/**
 * tests/support/helpers.js - Starts a real CarZone HTTP server for a test file and
 * offers a tiny HTTP client with a cookie jar (like a browser).
 *
 * The server runs on a random port against a fresh test database built by the
 * SQLite-backed mysql2 shim (see register-shim.js), seeded from database/seed.sql.
 */
import path from 'node:path';
import os from 'node:os';

export async function startTestServer(name) {
  process.env.SHIM_DB_FILE = path.join(os.tmpdir(), `carzone-test-${name}-${process.pid}.sqlite`);
  process.env.SHIM_RESET = '1';
  process.env.LOG_REQUESTS = 'false';
  process.env.AUTH_RATE_LIMIT_MAX = '1000';
  const { startServer } = await import('../../src/bootstrap.js');
  const { url, close } = await startServer({ port: 0, host: '127.0.0.1' });
  return { url, close };
}

/** Minimal client: remembers the session cookie like a browser does. */
export function client(base) {
  let cookie = '';
  async function request(method, url, body, { raw = false, headers = {} } = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
      redirect: 'manual',
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    if (raw) return { status: res.status, headers: res.headers, text: await res.text() };
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json, data: json?.data, error: json?.error };
  }
  return {
    get: (u, o) => request('GET', u, undefined, o),
    post: (u, b = {}, o) => request('POST', u, b, o),
    put: (u, b = {}, o) => request('PUT', u, b, o),
    patch: (u, b = {}, o) => request('PATCH', u, b, o),
    del: (u, o) => request('DELETE', u, undefined, o),
    async login(email, password) {
      const r = await request('POST', '/api/auth/login', { email, password });
      if (r.status !== 200) throw new Error(`login failed for ${email}: ${JSON.stringify(r.body)}`);
      return r.data.user;
    },
  };
}

export const CUSTOMER = ['rohan@example.com', 'Customer@123'];
export const ADMIN = ['admin@carzone.in', 'Admin@123'];

export function isoDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pays for a booking/order through the simulated gateway with the success card + OTP. */
export async function payWithCard(c, purpose, targetId, key = `k${Date.now()}${Math.random().toString(36).slice(2, 8)}`) {
  const created = await c.post('/api/payments', { purpose, targetId, idempotencyKey: key });
  if (created.status !== 201) throw new Error(JSON.stringify(created.body));
  const id = created.data.payment.id;
  const started = await c.post(`/api/payments/${id}/simulate`, { method: 'card', details: { cardName: 'Test User', cardNumber: '4111 1111 1111 1111', expiry: '12/30', cvv: '123' } });
  const verified = await c.post(`/api/payments/${id}/verify`, { otp: started.data.demoOtp });
  return verified.data.payment;
}
