/**
 * auth.service.js - Registration, login, sessions, logout and password reset.
 *
 * SESSION DESIGN
 *   cookie value = <random token>.<HMAC-SHA256(token, secret)>
 *   - The HMAC signature lets us reject forged/tampered cookies instantly.
 *   - The database stores only sha256(token); logout deletes the row, so the
 *     cookie stops working immediately (unlike a pure JWT, which cannot be revoked).
 *
 * LOGIN PROTECTION
 *   - After LOGIN_MAX_ATTEMPTS wrong passwords the account is locked for LOCKOUT_MINUTES.
 *   - Error messages never reveal whether the email exists ("Invalid email or password").
 *
 * PASSWORD RESET (demo mode)
 *   - A random token is created, its SHA-256 hash is stored with an expiry time.
 *   - Real apps e-mail the link; in DEMO_MODE we print it in the terminal and return it
 *     to the page so the flow can be demonstrated without a mail server.
 *   - Tokens are single-use; using one also logs the user out everywhere.
 */
import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { one, run, transaction } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { nowSql } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { hashPassword, verifyPassword, sha256 } from './password.service.js';
import { publicUser } from './user.service.js';

export const SESSION_COOKIE = 'as_session';

let secretCache = null;
/** Loads the signing secret once (from .env or the app_settings table). */
export async function loadSessionSecret() {
  secretCache = config.sessionSecret || (await one("SELECT setting_value FROM app_settings WHERE setting_key = 'session_secret'")).setting_value;
}

function sessionSecret() {
  if (!secretCache) throw new Error('Session secret not loaded');
  return secretCache;
}

const sign = (token) => crypto.createHmac('sha256', sessionSecret()).update(token).digest('base64url');

/** Creates a session row and returns { cookieValue, maxAgeSeconds }. */
export async function createSession(userId, { remember = false, ip = null, userAgent = null } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const maxAgeSeconds = remember ? config.rememberMeDays * 86400 : config.sessionTtlHours * 3600;
  await run(
    'INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)',
    userId, sha256(token), nowSql(maxAgeSeconds / 60), ip, userAgent ? String(userAgent).slice(0, 200) : null,
  );
  return { cookieValue: `${token}.${sign(token)}`, maxAgeSeconds };
}

/** Verifies the signed cookie and returns { user, sessionId } or null. */
export async function getUserFromSessionCookie(cookieValue) {
  const dot = cookieValue.lastIndexOf('.');
  if (dot < 1) return null;
  const token = cookieValue.slice(0, dot);
  const given = Buffer.from(cookieValue.slice(dot + 1));
  const expected = Buffer.from(sign(token));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  const row = await one(
    `SELECT s.id AS session_id, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.is_active = 1`,
    sha256(token), nowSql(),
  );
  return row ? { user: publicUser(row), sessionId: row.session_id } : null;
}

export async function destroySession(sessionId) {
  if (sessionId) await run('DELETE FROM sessions WHERE id = ?', sessionId);
}

export async function register({ name, email, phone, password }) {
  if (await one('SELECT id FROM users WHERE email = ?', email)) {
    throw AppError.conflict('An account with this email already exists. Try logging in.');
  }
  const { hash, salt } = await hashPassword(password);
  const { lastInsertRowid } = await run(
    "INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'customer', ?, ?)",
    name, email, phone, hash, salt, nowSql(), nowSql(),
  );
  return publicUser(await one('SELECT * FROM users WHERE id = ?', lastInsertRowid));
}

export async function login({ email, password }) {
  const user = await one('SELECT * FROM users WHERE email = ?', email);
  const invalid = AppError.unauthorized('Invalid email or password');

  if (!user) {
    // Still run a hash so the response time does not reveal that the email is unknown.
    await hashPassword(password);
    throw invalid;
  }
  if (!user.is_active) throw AppError.forbidden('This account has been deactivated. Please contact support.');

  if (user.locked_until && user.locked_until > nowSql()) {
    const minutes = Math.ceil((new Date(user.locked_until.replace(' ', 'T')) - Date.now()) / 60000);
    throw new AppError(423, `Too many failed attempts. Account locked for ${minutes} more minute(s).`);
  }

  const ok = await verifyPassword(password, user.password_hash, user.password_salt);
  if (!ok) {
    const failures = user.failed_logins + 1;
    if (failures >= config.loginMaxAttempts) {
      await run('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?', nowSql(config.lockoutMinutes), user.id);
      throw new AppError(423, `Too many failed attempts. Account locked for ${config.lockoutMinutes} minutes.`);
    }
    await run('UPDATE users SET failed_logins = ? WHERE id = ?', failures, user.id);
    throw invalid;
  }

  await run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', nowSql(), user.id);
  return publicUser({ ...user, last_login_at: nowSql() });
}

/** Step 1 of password reset. Always "succeeds" so attackers cannot discover emails. */
export async function requestPasswordReset(email) {
  const user = await one('SELECT id, name, email, is_active FROM users WHERE email = ?', email);
  if (!user || !user.is_active) return { demoResetLink: null };

  const token = crypto.randomBytes(32).toString('base64url');
  await run(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    user.id, sha256(token), nowSql(config.resetTokenTtlMinutes),
  );
  const link = `/reset-password?token=${token}`;
  const base = config.publicUrl || `http://${['0.0.0.0', '::'].includes(config.host) ? 'localhost' : config.host}:${config.port}`;
  logger.info(`[DEMO E-MAIL] Password reset link for ${user.email}: ${base}${link} (valid ${config.resetTokenTtlMinutes} min)`);
  return { demoResetLink: config.demoMode ? link : null };
}

/** Step 2 of password reset: check the token, set the new password, log out everywhere. */
export async function resetPassword({ token, password }) {
  const row = await one(
    'SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?',
    sha256(token), nowSql(),
  );
  if (!row) throw AppError.badRequest('This reset link is invalid or has expired. Please request a new one.');

  const { hash, salt } = await hashPassword(password);
  await transaction(async () => {
    await run('UPDATE users SET password_hash = ?, password_salt = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', hash, salt, nowSql(), row.user_id);
    await run('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL', nowSql(), row.user_id);
    await run('DELETE FROM sessions WHERE user_id = ?', row.user_id);
  });
}

export async function changePassword(userId, currentSessionId, { currentPassword, newPassword }) {
  const user = await one('SELECT * FROM users WHERE id = ?', userId);
  if (!(await verifyPassword(currentPassword, user.password_hash, user.password_salt))) {
    throw AppError.unprocessable('Current password is incorrect', { currentPassword: 'Current password is incorrect' });
  }
  const { hash, salt } = await hashPassword(newPassword);
  await transaction(async () => {
    await run('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?', hash, salt, nowSql(), userId);
    // Sign out every OTHER device; keep the current session alive.
    await run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', userId, currentSessionId);
  });
}
