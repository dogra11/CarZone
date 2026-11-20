/**
 * config.test.js - Deployment configuration: DATABASE_URL parsing, the TLS (ssl) option
 * for mysql2, the SESSION_SECRET rule, development defaults, GET /api/health (up and
 * down) and `npm run db:setup` (against the SQLite test shim).
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDatabaseUrl, buildSslOptions, resolveDbConfig, describeDb } from '../src/config/database.js';
import { assertProductionConfig, MIN_SESSION_SECRET_LENGTH } from '../src/config/index.js';
import { sessionTimeZone } from '../src/db/connection.js';
import { startTestServer } from './support/helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TLS = { minVersion: 'TLSv1.2', rejectUnauthorized: true };

/** Runs node in a child process with a controlled environment (the parent's .env cannot leak in). */
function runNode(args, env, { shim = true } = {}) {
  const base = { PATH: process.env.PATH, HOME: process.env.HOME, SYSTEMROOT: process.env.SYSTEMROOT, LOG_REQUESTS: 'false' };
  const pre = shim ? ['--disable-warning=ExperimentalWarning', '--import', './tests/support/register-shim.js'] : [];
  return spawnSync(process.execPath, [...pre, ...args], { cwd: ROOT, env: { ...base, ...env }, encoding: 'utf8', timeout: 30000 });
}

// ---------------------------------------------------------------- DATABASE_URL
test('DATABASE_URL: host, port, user, database and ?ssl=true are parsed', () => {
  const db = parseDatabaseUrl('mysql://4Abc123.root:secret@gateway01.ap-south-1.prod.aws.tidbcloud.com:4000/carzone_db?ssl=true');
  assert.deepEqual(db, {
    host: 'gateway01.ap-south-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '4Abc123.root',
    password: 'secret',
    database: 'carzone_db',
    ssl: true,
  });
});

test('DATABASE_URL: URL-encoded special characters in the password are decoded', () => {
  // Password p@ss:w/rd#1%?& written URL-encoded
  const db = parseDatabaseUrl('mysql://user%2Badmin:p%40ss%3Aw%2Frd%231%25%3F%26@db.example.com/shop');
  assert.equal(db.user, 'user+admin');
  assert.equal(db.password, 'p@ss:w/rd#1%?&');
  assert.equal(db.port, undefined);       // no port in the URL -> default chosen later
  assert.equal(db.ssl, undefined);        // not mentioned -> DB_SSL decides
  assert.equal(db.database, 'shop');
});

test('DATABASE_URL: ssl=false, invalid URLs and other protocols', () => {
  assert.equal(parseDatabaseUrl('mysql://u:p@h/db?ssl=false').ssl, false);
  assert.equal(parseDatabaseUrl('mysql://u:p@h/db?sslmode=verify_identity').ssl, true);
  assert.throws(() => parseDatabaseUrl('not a url'), /not a valid URL/);
  assert.throws(() => parseDatabaseUrl('postgres://u:p@h/db'), /must start with mysql:\/\//);
});

test('resolveDbConfig: local defaults when nothing is set (plain MySQL, no TLS)', () => {
  const db = resolveDbConfig({}, ROOT);
  assert.equal(db.host, 'localhost');
  assert.equal(db.port, 3306);
  assert.equal(db.user, 'root');
  assert.equal(db.password, '');
  assert.equal(db.name, 'carzone_db');
  assert.equal(db.ssl, undefined);
});

test('resolveDbConfig: DB_* variables + DB_SSL=true -> mysql2 ssl option', () => {
  const db = resolveDbConfig({ DB_HOST: 'h.tidbcloud.com', DB_PORT: '4000', DB_USER: 'x.root', DB_PASSWORD: 'pw', DB_NAME: 'carzone_db', DB_SSL: 'true' }, ROOT);
  assert.equal(db.port, 4000);
  assert.deepEqual(db.ssl, TLS);
  assert.equal(resolveDbConfig({ DB_SSL: 'false' }, ROOT).ssl, undefined);
});

test('resolveDbConfig: DATABASE_URL wins over DB_*; TLS from the URL or DB_SSL', () => {
  const env = { DATABASE_URL: 'mysql://a.root:x%40y@tidb.host:4000/demo?ssl=true', DB_HOST: 'ignored', DB_USER: 'ignored', DB_PASSWORD: 'ignored' };
  const db = resolveDbConfig(env, ROOT);
  assert.equal(db.host, 'tidb.host');
  assert.equal(db.user, 'a.root');
  assert.equal(db.password, 'x@y');
  assert.equal(db.name, 'demo');
  assert.deepEqual(db.ssl, TLS);
  assert.equal(db.source, 'DATABASE_URL');
  // URL without ?ssl but DB_SSL=true -> TLS on; URL without port -> 3306 unless DB_PORT is set
  const db2 = resolveDbConfig({ DATABASE_URL: 'mysql://u:p@h/db', DB_SSL: 'true', DB_PORT: '4000' }, ROOT);
  assert.deepEqual(db2.ssl, TLS);
  assert.equal(db2.port, 4000);
  // describeDb never leaks the password
  assert.ok(!describeDb(db).includes('x@y'));
});

test('DB_SSL_CA: the CA file is read (relative to the project) and implies TLS; missing file = clear error', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cz-ca-'));
  const ca = path.join(dir, 'ca.pem');
  fs.writeFileSync(ca, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n');
  assert.deepEqual(buildSslOptions({ enabled: true, caFile: ca }), { ...TLS, ca: fs.readFileSync(ca, 'utf8') });
  assert.equal(resolveDbConfig({ DB_SSL_CA: path.relative(ROOT, ca) }, ROOT).ssl.ca, fs.readFileSync(ca, 'utf8'));
  assert.throws(() => buildSslOptions({ enabled: true, caFile: path.join(dir, 'nope.pem') }), /DB_SSL_CA: cannot read/);
  assert.equal(buildSslOptions({ enabled: false }), undefined);
});

// ---------------------------------------------------------------- secrets / defaults
test('SESSION_SECRET: required (>= 32 chars) in production, optional in development', () => {
  assert.doesNotThrow(() => assertProductionConfig({ isProduction: false, sessionSecret: '' }));
  assert.throws(() => assertProductionConfig({ isProduction: true, sessionSecret: '' }), /SESSION_SECRET is missing/);
  assert.throws(() => assertProductionConfig({ isProduction: true, sessionSecret: 'short' }), /too short/);
  assert.doesNotThrow(() => assertProductionConfig({ isProduction: true, sessionSecret: 'x'.repeat(MIN_SESSION_SECRET_LENGTH) }));
});

test('npm start in production without SESSION_SECRET stops with a clear error (exit code 1)', () => {
  const r = runNode(['server.js'], { NODE_ENV: 'production', SESSION_SECRET: '', PORT: '0', HOST: '127.0.0.1', SHIM_DB_FILE: path.join(os.tmpdir(), `cz-nosecret-${process.pid}.sqlite`) });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SESSION_SECRET is missing/);
  const short = runNode(['server.js'], { NODE_ENV: 'production', SESSION_SECRET: 'abc', PORT: '0', HOST: '127.0.0.1' });
  assert.equal(short.status, 1);
  assert.match(short.stderr, /SESSION_SECRET is too short/);
});

test('config defaults: development stays on localhost/http; production flips them; env overrides win', () => {
  const read = (env) => {
    const r = runNode(['--input-type=module', '-e',
      "const { config } = await import('./src/config/index.js'); console.log(JSON.stringify({ host: config.host, port: config.port, cookieSecure: config.cookieSecure, trustProxy: config.trustProxy }));"],
    { HOST: '', PORT: '', COOKIE_SECURE: '', TRUST_PROXY: '', NODE_ENV: '', ...env }, { shim: false });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  assert.deepEqual(read({}), { host: 'localhost', port: 3000, cookieSecure: false, trustProxy: false });
  assert.deepEqual(read({ NODE_ENV: 'production', PORT: '10000' }), { host: '0.0.0.0', port: 10000, cookieSecure: true, trustProxy: true });
  assert.deepEqual(read({ NODE_ENV: 'production', COOKIE_SECURE: 'false', HOST: '127.0.0.1' }), { host: '127.0.0.1', port: 3000, cookieSecure: false, trustProxy: true });
  assert.deepEqual(read({ TRUST_PROXY: 'true', COOKIE_SECURE: 'true' }), { host: 'localhost', port: 3000, cookieSecure: true, trustProxy: true });
});

test('database session time zone follows Node (TZ=Asia/Kolkata -> +05:30)', () => {
  assert.match(sessionTimeZone(), /^[+-]\d\d:\d\d$/);
  const r = runNode(['--input-type=module', '-e', "const { sessionTimeZone } = await import('./src/db/connection.js'); console.log(sessionTimeZone());"], { TZ: 'Asia/Kolkata' });
  assert.equal(r.stdout.trim(), '+05:30');
});

// ---------------------------------------------------------------- health check
let srv;
before(async () => { srv = await startTestServer('config'); });
after(async () => { delete process.env.SHIM_DB_DOWN; await srv.close(); });

test('GET /api/health: 200 {status:ok, db:up}; 503 {db:down} while the database is unreachable', async () => {
  const up = await fetch(`${srv.url}/api/health`);
  assert.equal(up.status, 200);
  assert.equal(up.headers.get('cache-control'), 'no-store');
  const upBody = await up.json();
  assert.equal(upBody.status, 'ok');
  assert.equal(upBody.db, 'up');

  process.env.SHIM_DB_DOWN = '1';                 // test shim: every query now fails with ECONNREFUSED
  try {
    const down = await fetch(`${srv.url}/api/health`);
    assert.equal(down.status, 503);
    const downBody = await down.json();
    assert.equal(downBody.status, 'ok');
    assert.equal(downBody.db, 'down');
  } finally {
    delete process.env.SHIM_DB_DOWN;
  }
  assert.equal((await fetch(`${srv.url}/api/health`)).status, 200);   // recovers by itself
});

test('development: no Secure cookie flag, no HSTS, X-Forwarded-* ignored (no proxy trusted)', async () => {
  const res = await fetch(`${srv.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ email: 'rohan@example.com', password: 'Customer@123' }),
  });
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.headers.get('set-cookie'), /Secure/);
  assert.equal(res.headers.get('strict-transport-security'), null);
});

// ---------------------------------------------------------------- npm run db:setup
test('db:setup runs the whole carzone_db.sql script and prints progress (SQLite shim)', () => {
  const file = path.join(os.tmpdir(), `cz-setup-${process.pid}.sqlite`);
  const r = runNode(['src/db/setup.js'], { SHIM_DB_FILE: file, DB_SSL: 'true', DB_PORT: '4000', DB_HOST: 'example.tidbcloud.com', DB_USER: 'abc.root' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\[1\/4\] Connecting to abc\.root@example\.tidbcloud\.com:4000\/carzone_db \(TLS on/);
  assert.match(r.stdout, /\[3\/4\] Running database\/carzone_db\.sql/);
  assert.match(r.stdout, /\[4\/4\] Verified: users=8, services=\d+, products=\d+, bookings=\d+, orders=\d+/);

  const bad = runNode(['src/db/setup.js'], { SHIM_DB_FILE: file, SHIM_DB_DOWN: '1' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /FAILED while connecting|FAILED while reading/);
  assert.match(bad.stderr, /Hint {2}: Cannot reach the database/);
  fs.rmSync(file, { force: true });
});
