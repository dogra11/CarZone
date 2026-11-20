/**
 * address.service.js - Customer delivery addresses (CRUD). One address can be the default.
 */
import { one, all, run, transaction } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { nowSql } from '../utils/dates.js';

export const mapAddress = (r) => ({
  id: r.id, label: r.label, fullName: r.full_name, phone: r.phone, line1: r.line1, line2: r.line2,
  city: r.city, state: r.state, pincode: r.pincode, isDefault: Boolean(r.is_default),
});

export const listAddresses = async (userId) =>
  (await all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id', userId)).map(mapAddress);

export async function getAddress(userId, id) {
  const row = await one('SELECT * FROM addresses WHERE id = ? AND user_id = ?', id, userId);
  if (!row) throw AppError.notFound('Address not found');
  return mapAddress(row);
}

export async function saveAddress(userId, a, id = null) {
  if (id) await getAddress(userId, id);
  const count = (await one('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', userId)).n;
  const makeDefault = a.isDefault || count === 0;
  const savedId = await transaction(async () => {
    if (makeDefault) await run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', userId);
    if (id) {
      await run('UPDATE addresses SET label = ?, full_name = ?, phone = ?, line1 = ?, line2 = ?, city = ?, state = ?, pincode = ?, is_default = ? WHERE id = ? AND user_id = ?',
        a.label, a.fullName, a.phone, a.line1, a.line2 ?? null, a.city, a.state, a.pincode, makeDefault ? 1 : 0, id, userId);
      return id;
    }
    return (await run('INSERT INTO addresses (user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      userId, a.label, a.fullName, a.phone, a.line1, a.line2 ?? null, a.city, a.state, a.pincode, makeDefault ? 1 : 0, nowSql())).lastInsertRowid;
  });
  return getAddress(userId, savedId);
}

export async function deleteAddress(userId, id) {
  const a = await getAddress(userId, id);
  await run('DELETE FROM addresses WHERE id = ? AND user_id = ?', id, userId);
  if (a.isDefault) {
    const next = await one('SELECT id FROM addresses WHERE user_id = ? ORDER BY id LIMIT 1', userId);
    if (next) await run('UPDATE addresses SET is_default = 1 WHERE id = ?', next.id);
  }
}
