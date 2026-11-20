/**
 * deploy.test.js - The app in PRODUCTION mode (as on Render): Secure session cookies,
 * trust proxy (real client IP + https from X-Forwarded-* headers), HSTS, health check.
 *
 * node --test runs every test file in its own process, so setting NODE_ENV here does not
 * affect the other test files. The environment is set BEFORE the app's config is
 * imported (dynamic import inside startTestServer), because config is read once.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.SESSION_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.COOKIE_SECURE = '';   // '' = use the production default (true), ignore any .env value
process.env.TRUST_PROXY = '';     // '' = use the production default (true)
process.env.HOST = '';            // '' = use the production default (0.0.0.0)
process.env.PUBLIC_URL = 'https://carzone-demo.onrender.com/';

const { startTestServer, client, CUSTOMER } = await import('./support/helpers.js');
let srv;
before(async () => { srv = await startTestServer('deploy'); });
after(async () => { await srv.close(); });

test('production config: bind 0.0.0.0, trust proxy, secure cookies, public URL', async () => {
  const { config } = await import('../src/config/index.js');
  assert.equal(config.isProduction, true);
  assert.equal(config.host, '0.0.0.0');
  assert.equal(config.trustProxy, true);
  assert.equal(config.cookieSecure, true);
  assert.equal(config.publicUrl, 'https://carzone-demo.onrender.com');   // trailing slash removed
});

test('login sets an HttpOnly + SameSite=Strict + Secure cookie; logout clears it with the same flags', async () => {
  const res = await fetch(`${srv.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CUSTOMER[0], password: CUSTOMER[1] }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^as_session=/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; SameSite=Strict/);

  const out = await fetch(`${srv.url}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie.split(';')[0] },
    body: '{}',
  });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /^as_session=;.*; Secure/);
});

test('the session cookie still works on the server side (Secure only affects the browser)', async () => {
  const c = client(srv.url);
  await c.login(...CUSTOMER);
  assert.equal((await c.get('/api/auth/me')).data.user.email, CUSTOMER[0]);
});

test('trust proxy: each X-Forwarded-For client gets its own rate-limit bucket', async () => {
  const attempt = (ip) => fetch(`${srv.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'Wrong1234' }),
  });
  const a1 = await attempt('203.0.113.10');
  const a2 = await attempt('203.0.113.10');
  const b1 = await attempt('198.51.100.20');
  const remaining = (r) => Number(r.headers.get('x-ratelimit-remaining'));
  assert.equal(remaining(a2), remaining(a1) - 1);    // same visitor -> same bucket
  assert.equal(remaining(b1), remaining(a1));        // different visitor -> fresh bucket
  // Only ONE hop is trusted: a spoofed left-most entry cannot choose the bucket.
  const spoof1 = await attempt('1.2.3.4, 192.0.2.77');
  const spoof2 = await attempt('5.6.7.8, 192.0.2.77');
  assert.equal(remaining(spoof2), remaining(spoof1) - 1);
});

test('HSTS only for requests that came in over https (X-Forwarded-Proto from the proxy)', async () => {
  const viaHttps = await fetch(`${srv.url}/api/services`, { headers: { 'X-Forwarded-Proto': 'https' } });
  assert.match(viaHttps.headers.get('strict-transport-security') || '', /max-age=\d+/);
  const plain = await fetch(`${srv.url}/api/services`);
  assert.equal(plain.headers.get('strict-transport-security'), null);
});

test('GET /api/health answers 200 in production too', async () => {
  const r = await fetch(`${srv.url}/api/health`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.db, 'up');
});
