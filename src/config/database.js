/**
 * config/database.js - Works out HOW to connect to MySQL / TiDB from environment variables.
 *
 * Two ways to configure the database (12-factor style: config lives in the environment,
 * never in the code):
 *
 *   1. Separate variables (local MySQL default, also used by render.yaml):
 *        DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL, DB_SSL_CA
 *   2. One connection URL (handy when a provider gives you a single string):
 *        DATABASE_URL=mysql://user:pass@host:4000/carzone_db?ssl=true
 *      If DATABASE_URL is set it wins over DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.
 *
 * TLS (encryption between the app and the database):
 *   Cloud databases such as TiDB Cloud Starter travel over the public internet, so they
 *   REQUIRE TLS. DB_SSL=true (or ?ssl=true in the URL) gives mysql2:
 *        ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
 *   - minVersion TLSv1.2     : refuse old, broken protocol versions
 *   - rejectUnauthorized true: verify the server certificate, so nobody can pretend to be
 *                              the database (man-in-the-middle). Never turn this off.
 *   Node.js already trusts the public certificate authorities (TiDB uses Let's Encrypt), so
 *   no CA file is needed. DB_SSL_CA=path/to/ca.pem is only for private/self-signed CAs.
 *
 * Everything here is a PURE function of `env`, so it is easy to unit-test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';

const TRUE_VALUES = ['true', '1', 'yes', 'on', 'required', 'require'];
const isTrue = (v) => TRUE_VALUES.includes(String(v ?? '').trim().toLowerCase());

/**
 * Parses mysql://user:password@host:port/database?ssl=true
 * User name and password are percent-decoded, so a password such as "p@ss:w/rd#1"
 * must be written URL-encoded in the URL: p%40ss%3Aw%2Frd%231
 */
export function parseDatabaseUrl(urlString) {
  let url;
  try {
    url = new URL(String(urlString).trim());
  } catch {
    throw new Error('DATABASE_URL is not a valid URL. Expected mysql://USER:PASSWORD@HOST:PORT/DATABASE?ssl=true');
  }
  if (!['mysql:', 'mysql2:', 'tidb:'].includes(url.protocol)) {
    throw new Error(`DATABASE_URL must start with mysql:// (got "${url.protocol}//")`);
  }
  if (!url.hostname) throw new Error('DATABASE_URL has no host name');

  const decode = (s) => {
    try { return decodeURIComponent(s); } catch { return s; }   // tolerate a stray "%"
  };
  const sslParam = url.searchParams.get('ssl') ?? url.searchParams.get('sslmode') ?? url.searchParams.get('ssl-mode');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    user: decode(url.username),
    password: decode(url.password),
    database: decode(url.pathname.replace(/^\//, '')) || undefined,
    // undefined = "the URL does not say" (DB_SSL may still switch TLS on)
    ssl: sslParam === null ? undefined : isTrue(sslParam) || /^(verify|verify_identity|verify-full|verify_ca)$/i.test(sslParam),
  };
}

/**
 * Builds the mysql2 `ssl` option. Returns undefined when TLS is off (plain local MySQL).
 * caFile: optional path (absolute, or relative to the project folder) of a PEM CA bundle.
 */
export function buildSslOptions({ enabled, caFile, rootDir = process.cwd() }) {
  if (!enabled && !caFile) return undefined;
  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (caFile) {
    const file = path.isAbsolute(caFile) ? caFile : path.join(rootDir, caFile);
    try {
      ssl.ca = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`DB_SSL_CA: cannot read the CA certificate file "${file}" (${err.code || err.message})`);
    }
  }
  return ssl;
}

/** Final database settings from the environment (DATABASE_URL first, then DB_* variables). */
export function resolveDbConfig(env = process.env, rootDir = process.cwd()) {
  const fromUrl = env.DATABASE_URL ? parseDatabaseUrl(env.DATABASE_URL) : {};
  const numOr = (v, fallback) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

  // Values pasted into a dashboard often carry a stray space - trim everything but the password.
  const t = (v) => (typeof v === 'string' ? v.trim() : v);
  const host = fromUrl.host || t(env.DB_HOST) || 'localhost';
  // TLS is on if EITHER the URL (?ssl=true) OR DB_SSL=true asks for it (the safer choice).
  const sslEnabled = fromUrl.ssl === true || isTrue(env.DB_SSL);
  return {
    host,
    port: fromUrl.port ?? numOr(t(env.DB_PORT), 3306),
    user: env.DATABASE_URL ? fromUrl.user : t(env.DB_USER) || 'root',
    password: env.DATABASE_URL ? fromUrl.password : env.DB_PASSWORD || '',
    name: fromUrl.database || t(env.DB_NAME) || 'carzone_db',
    ssl: buildSslOptions({ enabled: sslEnabled, caFile: env.DB_SSL_CA, rootDir }),
    source: env.DATABASE_URL ? 'DATABASE_URL' : 'DB_* variables',
  };
}

/** Short description for logs - NEVER includes the password. */
export function describeDb(db) {
  return `${db.user}@${db.host}:${db.port}/${db.name} (TLS ${db.ssl ? 'on' : 'off'}, from ${db.source})`;
}
