/**
 * vehicle.service.js - CRUD for a customer's saved vehicles.
 * Every query includes "user_id = ?" so a customer can only touch their own vehicles.
 */
import { one, all, run } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { nowSql } from '../utils/dates.js';

const mapVehicle = (r) => ({
  id: r.id,
  vehicleType: r.vehicle_type,
  brand: r.brand,
  model: r.model,
  registrationNo: r.registration_no,
  color: r.color,
  createdAt: r.created_at,
});

export const listVehicles = async (userId) =>
  (await all('SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at DESC, id DESC', userId)).map(mapVehicle);

export async function getVehicle(userId, id) {
  const row = await one('SELECT * FROM vehicles WHERE id = ? AND user_id = ?', id, userId);
  if (!row) throw AppError.notFound('Vehicle not found');
  return mapVehicle(row);
}

async function assertUniqueReg(userId, reg, exceptId = 0) {
  if (await one('SELECT id FROM vehicles WHERE user_id = ? AND registration_no = ? AND id <> ?', userId, reg, exceptId)) {
    throw AppError.conflict('You already saved a vehicle with this registration number');
  }
}

export async function addVehicle(userId, v) {
  await assertUniqueReg(userId, v.registrationNo);
  const { lastInsertRowid } = await run(
    'INSERT INTO vehicles (user_id, vehicle_type, brand, model, registration_no, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    userId, v.vehicleType, v.brand, v.model, v.registrationNo, v.color ?? null, nowSql(),
  );
  return getVehicle(userId, lastInsertRowid);
}

export async function updateVehicle(userId, id, v) {
  await getVehicle(userId, id);
  await assertUniqueReg(userId, v.registrationNo, id);
  await run(
    'UPDATE vehicles SET vehicle_type = ?, brand = ?, model = ?, registration_no = ?, color = ? WHERE id = ? AND user_id = ?',
    v.vehicleType, v.brand, v.model, v.registrationNo, v.color ?? null, id, userId,
  );
  return getVehicle(userId, id);
}

export async function deleteVehicle(userId, id) {
  await getVehicle(userId, id);
  // bookings.vehicle_id is ON DELETE SET NULL, and each booking keeps its own vehicle snapshot.
  await run('DELETE FROM vehicles WHERE id = ? AND user_id = ?', id, userId);
}
