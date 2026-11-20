/**
 * db/setup.js - `npm run db:setup`: creates the database and loads the sample data by
 * executing database/carzone_db.sql through mysql2 (alternative to MySQL Workbench).
 *
 * Works with a local MySQL 8 AND with TiDB Cloud Starter: it uses exactly the same
 * settings as the app (.env: DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME or DATABASE_URL,
 * plus DB_SSL=true for TiDB).
 *
 * WARNING: it DROPS and recreates the database, deleting existing data.
 *
 * How: the whole script is sent in ONE call with multipleStatements: true (that option is
 * deliberately enabled only here - never in the app's pool, where it would make SQL
 * injection more dangerous).
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { describeDb } from '../config/database.js';
import { dbErrorHint } from './errors.js';
import { sessionTimeZone } from './connection.js';

const DEFAULT_NAME = 'carzone_db';
const file = path.join(config.databaseDir, 'carzone_db.sql');
const db = config.db;
const step = (n, text) => console.log(`[${n}/4] ${text}`);

function fail(err, during) {
  const hint = dbErrorHint(err, db);
  console.error(`\nFAILED while ${during}.`);
  console.error(`  Error : ${err.code ? `${err.code} - ` : ''}${err.sqlMessage || err.message}`);
  if (err.sql && err.sql.length < 300) console.error(`  SQL   : ${err.sql}`);
  if (hint) console.error(`  Hint  : ${hint}`);
  console.error('  The script starts with DROP DATABASE, so it is safe to fix the problem and run it again.');
  process.exitCode = 1;
}

// The SQL file always says carzone_db; a different DB_NAME is substituted (letters, digits, _ only).
if (!/^[A-Za-z0-9_]{1,64}$/.test(db.name)) {
  console.error(`DB_NAME "${db.name}" is not allowed - use only letters, digits and underscores.`);
  process.exit(1);
}
let script = fs.readFileSync(file, 'utf8');
if (db.name !== DEFAULT_NAME) script = script.replace(/\bcarzone_db\b/g, db.name);

console.log(`CarZone database setup - this DROPS and recreates "${db.name}".`);
step(1, `Connecting to ${describeDb(db)} ...`);

let conn;
try {
  conn = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    ssl: db.ssl,
    multipleStatements: true,
    connectTimeout: 20000,
    charset: 'utf8mb4',
  });
} catch (err) {
  fail(err, 'connecting');
}

if (conn) {
  let during = 'reading the server version';
  try {
    const [[{ version }]] = await conn.query('SELECT VERSION() AS version');
    const isTiDB = /tidb/i.test(version);
    step(2, `Connected. Server version ${version}${isTiDB ? ' (TiDB)' : ''}.`);

    // CURDATE() in the seed (relative demo dates) must mean "today" on THIS computer,
    // even when the cloud database itself runs in UTC.
    during = 'setting the session time zone';
    await conn.query(`SET time_zone = '${sessionTimeZone()}'`);

    during = 'running database/carzone_db.sql';
    step(3, `Running database/carzone_db.sql (${Math.round(script.length / 1024)} KB, tables + sample data). This can take up to a minute on a cloud database ...`);
    const started = Date.now();
    await conn.query(script);
    console.log(`      done in ${((Date.now() - started) / 1000).toFixed(1)} s`);

    during = 'checking the loaded data';
    await conn.query(`USE \`${db.name}\``);
    const counts = [];
    for (const table of ['users', 'services', 'products', 'bookings', 'orders']) {
      const [[row]] = await conn.query(`SELECT COUNT(*) AS n FROM ${table}`);
      counts.push(`${table}=${row.n}`);
    }
    step(4, `Verified: ${counts.join(', ')}`);
    console.log(`\nDatabase "${db.name}" is ready. Demo logins: admin@carzone.in / Admin@123, rohan@example.com / Customer@123`);
  } catch (err) {
    fail(err, during);
  } finally {
    await conn.end().catch(() => {});
  }
}
