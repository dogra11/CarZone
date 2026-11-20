/**
 * db/init.js - Start-up checks for the MySQL database.
 *
 * The tables and sample data are created by running database/carzone_db.sql
 * (MySQL Workbench) or `npm run db:setup`. At start-up we only:
 *   1. check that we can connect and that the tables exist (clear error otherwise);
 *   2. make sure a random session-signing secret exists in app_settings, so logins
 *      survive server restarts without anyone configuring a secret.
 */
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { describeDb } from '../config/database.js';
import { one, run } from './connection.js';
import { dbErrorHint } from './errors.js';

export async function initDatabase() {
  try {
    await one('SELECT COUNT(*) AS n FROM users');
  } catch (err) {
    const hint = dbErrorHint(err);
    // describeDb() never prints the password.
    throw new Error(`${hint || 'Database error'} (${err.code || err.message})\n  Database: ${describeDb(config.db)}`);
  }
  if (!(await one("SELECT setting_value FROM app_settings WHERE setting_key = 'session_secret'"))) {
    await run("INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('session_secret', ?)", crypto.randomBytes(32).toString('hex'));
  }
}
