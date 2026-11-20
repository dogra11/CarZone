/**
 * db/connection.js - MySQL connection pool (mysql2) and small query helpers.
 *
 * - A CONNECTION POOL keeps up to 10 open connections and lends them to requests,
 *   which is much faster than opening a new connection per query.
 * - Every helper uses PREPARED STATEMENTS (pool.execute with "?" placeholders): user
 *   input travels separately from the SQL text, so SQL injection is impossible.
 * - transaction(fn) borrows ONE connection, runs BEGIN ... COMMIT around fn and rolls
 *   back if anything throws. AsyncLocalStorage remembers "the current transaction's
 *   connection", so service code simply calls one()/all()/run() and those queries
 *   automatically join the open transaction - no connection object to pass around.
 * - The same code talks to a local MySQL 8 or to TiDB Cloud (MySQL-compatible): only the
 *   connection settings differ (TLS via `ssl`, see config/database.js).
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

let pool = null;
const txStore = new AsyncLocalStorage();

/**
 * The database session time zone as a UTC offset ('+05:30'), taken from Node's own clock.
 * The app writes local times computed in JavaScript (utils/dates.js), and columns with
 * DEFAULT CURRENT_TIMESTAMP are filled by the database. Cloud databases run in UTC, so we
 * tell each new connection to use the same offset as Node (on Render: TZ=Asia/Kolkata).
 * On a local PC MySQL already uses the PC's time zone, so nothing changes there.
 */
export function sessionTimeZone(date = new Date()) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.name,
      ssl: config.db.ssl,     // undefined locally; { minVersion: 'TLSv1.2', rejectUnauthorized: true } for TiDB
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 20000,  // cloud databases can take a few seconds to wake up
      enableKeepAlive: true,  // TCP keep-alive so idle pooled connections are not silently dropped
      charset: 'utf8mb4',
      dateStrings: true,      // DATE/DATETIME come back as 'YYYY-MM-DD[ HH:MM:SS]' strings (no time-zone surprises)
      decimalNumbers: true,   // SUM()/AVG() come back as numbers, not strings
    });
    // Runs once for every NEW physical connection, before it is handed to any query.
    if (typeof pool.on === 'function') {
      pool.on('connection', (conn) => {
        conn.query(`SET time_zone = '${sessionTimeZone()}'`, () => { /* non-fatal: keep the server default */ });
      });
    }
  }
  return pool;
}

/**
 * Health-check helper: resolves true if the database answers "SELECT 1" within timeoutMs.
 * Never throws, so GET /api/health can always answer.
 */
export async function pingDatabase(timeoutMs = 3000) {
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DB ping timeout')), timeoutMs); });
    await Promise.race([getPool().query('SELECT 1 AS ok'), timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Runs a statement on the transaction connection if one is open, else on the pool. */
async function execute(sql, params) {
  const runner = txStore.getStore() || getPool();
  const [result] = await runner.execute(sql, params);
  return result;
}

/** First row or undefined. Example: await one('SELECT * FROM users WHERE id = ?', id) */
export const one = async (sql, ...params) => (await execute(sql, params))[0];
/** All rows as an array. */
export const all = async (sql, ...params) => execute(sql, params);
/** INSERT/UPDATE/DELETE. Returns { changes, lastInsertRowid }. */
export async function run(sql, ...params) {
  const r = await execute(sql, params);
  return { changes: r.affectedRows, lastInsertRowid: r.insertId };
}

/**
 * Runs fn() inside a database TRANSACTION (all-or-nothing).
 * Inside, use "SELECT ... FOR UPDATE" to lock rows (stock, slots, bookings) so two
 * customers can never buy the last item or the last slot at the same moment.
 * Nested calls simply join the outer transaction.
 */
export async function transaction(fn) {
  if (txStore.getStore()) return fn();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await txStore.run(conn, fn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
