/**
 * user.service.js - Customer profile and admin user management (async MySQL queries).
 */
import { one, all, run, transaction } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword } from './password.service.js';
import { nowSql } from '../utils/dates.js';

/** Converts a DB row into the safe shape sent to the browser (never the hash/salt). */
export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    address: row.address,
    city: row.city,
    pincode: row.pincode,
    avatar: row.avatar,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

export async function getUser(id) {
  const row = await one('SELECT * FROM users WHERE id = ?', id);
  if (!row) throw AppError.notFound('User not found');
  return publicUser(row);
}

export async function updateProfile(userId, { name, phone, address = null, city = null, pincode = null }) {
  await run(
    'UPDATE users SET name = ?, phone = ?, address = ?, city = ?, pincode = ?, updated_at = ? WHERE id = ?',
    name, phone, address, city, pincode, nowSql(), userId,
  );
  return getUser(userId);
}

// ---------------------------------------------------------------------------
// Admin: user management
// ---------------------------------------------------------------------------
export async function listUsers({ search = '', role = '' } = {}) {
  const like = `%${search}%`;
  return (await all(
    `SELECT u.*,
            (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id) AS booking_count,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) AS order_count,
            (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p
              WHERE p.user_id = u.id AND p.status IN ('success', 'refund_pending', 'refunded')) AS paid_paise
       FROM users u
      WHERE (? = '' OR u.role = ?)
        AND (u.name LIKE ? OR u.email LIKE ? OR IFNULL(u.phone, '') LIKE ?)
      ORDER BY u.created_at DESC`,
    role, role, like, like, like,
  )).map((r) => ({ ...publicUser(r), bookingCount: r.booking_count, orderCount: r.order_count, paidPaise: r.paid_paise }));
}

export async function createUser({ name, email, phone, role, password }) {
  if (await one('SELECT id FROM users WHERE email = ?', email)) throw AppError.conflict('A user with this email already exists');
  const { hash, salt } = await hashPassword(password);
  const { lastInsertRowid } = await run(
    'INSERT INTO users (name, email, phone, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    name, email, phone, hash, salt, role, nowSql(), nowSql(),
  );
  return getUser(lastInsertRowid);
}

export async function updateUser(adminId, userId, { name, phone, role, isActive }) {
  await getUser(userId);
  if (userId === adminId && (role !== 'admin' || !isActive)) {
    throw AppError.conflict('You cannot remove your own admin role or deactivate yourself');
  }
  await transaction(async () => {
    await run(
      'UPDATE users SET name = ?, phone = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?',
      name, phone, role, isActive ? 1 : 0, nowSql(), userId,
    );
    if (!isActive) await run('DELETE FROM sessions WHERE user_id = ?', userId); // log a deactivated user out
  });
  return getUser(userId);
}

/** Hard delete is allowed only when the user has no bookings; otherwise deactivate. */
export async function deleteUser(adminId, userId) {
  await getUser(userId);
  if (userId === adminId) throw AppError.conflict('You cannot delete your own account');
  if (await one('SELECT id FROM bookings WHERE user_id = ? LIMIT 1', userId) || await one('SELECT id FROM orders WHERE user_id = ? LIMIT 1', userId)) {
    throw AppError.conflict('This user has booking or order history. Deactivate the account instead of deleting it.');
  }
  await run('DELETE FROM users WHERE id = ?', userId);
}
