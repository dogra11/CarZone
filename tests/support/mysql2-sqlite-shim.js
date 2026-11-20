/**
 * tests/support/mysql2-sqlite-shim.js - TEST-ONLY stand-in for the `mysql2/promise` package.
 *
 * The real app talks to MySQL through mysql2. The automated tests (and the UI checks
 * used while developing) must run on a machine without a MySQL server, so this file
 * implements the small subset of the mysql2/promise API that CarZone uses, on top of
 * Node's built-in SQLite (node:sqlite, Node 22.5+):
 *
 *   createPool(cfg) -> { execute, query, getConnection, end }
 *   connection      -> { execute, query, beginTransaction, commit, rollback, release }
 *   execute(sql, params) resolves to [rows, fields] for SELECT, or
 *                         [{ affectedRows, insertId }, undefined] for writes.
 *
 *   createConnection(cfg) -> { query, end }  (only what `npm run db:setup` needs: run the
 *                            whole database/carzone_db.sql script, then count rows)
 *
 * Test switches (environment variables):
 *   SHIM_DB_DOWN=1  every query fails with ECONNREFUSED (simulates a database outage,
 *                   used by the /api/health test)
 *
 * It is wired in ONLY by tests/support/register-shim.js (a Node module-resolution hook);
 * the shipped application always imports the real mysql2 package.
 *
 * Translations (kept deliberately tiny because the app SQL is written to be portable):
 *   - runtime SQL : "FOR UPDATE" removed (SQLite locks the whole DB in a transaction),
 *                   "INSERT IGNORE" -> "INSERT OR IGNORE"
 *   - schema/seed : MySQL DDL & date expressions converted once when the test DB is built
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Relative dates are computed in JavaScript (local time), exactly like the app does, so the
// test database agrees with the server even if the C library's time zone data differs.
const pad = (n) => String(n).padStart(2, '0');
function localDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + Number(offsetDays));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** MySQL schema/seed -> SQLite (only the constructs used in database/*.sql). */
export function mysqlToSqlite(sql) {
  return sql
    .replace(/^\s*(CREATE DATABASE|DROP DATABASE|USE|SET)\b[^;]*;/gim, '')
    .replace(/START TRANSACTION;/g, 'BEGIN;')
    .replace(/\bINT\s+NOT NULL AUTO_INCREMENT PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/\)\s*ENGINE=InnoDB[^;]*;/g, ');')
    .replace(/DEFAULT CURRENT_TIMESTAMP/g, "DEFAULT (datetime('now','localtime'))")
    .replace(/CHAR_LENGTH\(/g, 'length(')
    .replace(/TIMESTAMP\(DATE_ADD\(CURDATE\(\), INTERVAL (-?\d+) DAY\), '(\d\d:\d\d:\d\d)'\)/g, (m, days, time) => `'${localDate(days)} ${time}'`)
    .replace(/DATE_ADD\(CURDATE\(\), INTERVAL (-?\d+) DAY\)/g, (m, days) => `'${localDate(days)}'`);
}

const translate = (sql) => sql.replace(/\s+FOR UPDATE\b/gi, '').replace(/\bINSERT IGNORE\b/gi, 'INSERT OR IGNORE');

function openDb() {
  const file = process.env.SHIM_DB_FILE || path.join(os.tmpdir(), 'carzone-shim.sqlite');
  if (process.env.SHIM_RESET === '1') for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  const db = new DatabaseSync(file);
  db.function('regexp', (pattern, value) => (new RegExp(pattern).test(String(value)) ? 1 : 0));
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const hasTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!hasTables) {
    db.exec(mysqlToSqlite(fs.readFileSync(path.join(ROOT, 'database', 'schema.sql'), 'utf8')));
    db.exec(mysqlToSqlite(fs.readFileSync(path.join(ROOT, 'database', 'seed.sql'), 'utf8')));
  }
  return db;
}

function makeError(err) {
  const e = new Error(err.message);
  if (/UNIQUE constraint failed/.test(err.message)) e.code = 'ER_DUP_ENTRY';
  else if (/CHECK constraint failed/.test(err.message)) e.code = 'ER_CHECK_CONSTRAINT_VIOLATED';
  else if (/FOREIGN KEY constraint failed/.test(err.message)) e.code = 'ER_ROW_IS_REFERENCED_2';
  else e.code = 'ER_SHIM';
  return e;
}

function exec(db, cache, sql, params = []) {
  if (process.env.SHIM_DB_DOWN === '1') {
    throw Object.assign(new Error('connect ECONNREFUSED (shim: SHIM_DB_DOWN=1)'), { code: 'ECONNREFUSED' });
  }
  const text = translate(sql);
  let stmt = cache.get(text);
  if (!stmt) { stmt = db.prepare(text); cache.set(text, stmt); }
  for (const p of params) {
    // Same strictness as mysql2: undefined is a programming error.
    if (p === undefined) throw new TypeError('Bind parameters must not contain undefined. To pass SQL NULL specify JS null');
  }
  try {
    if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(text)) return [stmt.all(...params), []];
    const r = stmt.run(...params);
    return [{ affectedRows: Number(r.changes), insertId: Number(r.lastInsertRowid) }, undefined];
  } catch (err) {
    throw makeError(err);
  }
}

export function createPool() {
  const db = openDb();
  const cache = new Map();
  let lock = Promise.resolve();   // one transaction at a time (SQLite has one writer)

  const runner = {
    execute: async (sql, params) => exec(db, cache, sql, params),
    query: async (sql, params) => exec(db, cache, sql, params),
  };

  return {
    ...runner,
    async getConnection() {
      let release;
      const previous = lock;
      lock = new Promise((r) => { release = r; });
      await previous;
      return {
        ...runner,
        beginTransaction: async () => db.exec('BEGIN IMMEDIATE'),
        commit: async () => db.exec('COMMIT'),
        rollback: async () => { if (db.isTransaction ?? true) { try { db.exec('ROLLBACK'); } catch { /* none open */ } } },
        release: () => release(),
      };
    },
    end: async () => db.close(),
  };
}

/**
 * Minimal single connection for src/db/setup.js. A multi-statement script containing
 * DROP DATABASE recreates the SQLite file (like dropping the MySQL database) and is run
 * through mysqlToSqlite(); USE/SET are no-ops; VERSION() returns a fake server version.
 */
export async function createConnection(cfg = {}) {
  const file = process.env.SHIM_DB_FILE || path.join(os.tmpdir(), 'carzone-shim.sqlite');
  let db = new DatabaseSync(file);
  return {
    async query(sql) {
      if (process.env.SHIM_DB_DOWN === '1') throw Object.assign(new Error('connect ECONNREFUSED (shim)'), { code: 'ECONNREFUSED' });
      if (/^\s*(USE|SET)\b/i.test(sql)) return [{ affectedRows: 0 }, undefined];
      if (/^\s*SELECT\s+VERSION\(\)/i.test(sql)) return [[{ version: '8.0.11-sqlite-test-shim' }], []];
      if (/;\s*\S/.test(sql.replace(/--[^\n]*/g, ''))) {
        if (!cfg.multipleStatements) throw new Error('shim: multi-statement query needs multipleStatements: true');
        if (/DROP DATABASE/i.test(sql)) {
          db.close();
          for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
          db = new DatabaseSync(file);
          db.function('regexp', (pattern, value) => (new RegExp(pattern).test(String(value)) ? 1 : 0));
        }
        try { db.exec(mysqlToSqlite(sql)); } catch (err) { throw makeError(err); }
        return [[], undefined];
      }
      return exec(db, new Map(), sql, []);
    },
    async end() { db.close(); },
  };
}

export default { createPool, createConnection };
