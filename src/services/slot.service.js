/**
 * slot.service.js - Time slots and availability (capacity management).
 *
 * HOW SLOT AVAILABILITY WORKS
 *  - time_slots holds the daily slots (09:30-11:00 ...) and a default capacity
 *    (how many vehicles the centre can handle at once).
 *  - slot_inventory holds one row per (date, slot) with booked_count, plus optional
 *    admin overrides: a different capacity for that day, or "blocked".
 *  - The same seats are used by wash bookings AND store "fitment" appointments.
 *  - remaining = effective capacity - booked_count.
 *
 * WHY IT IS SAFE: reserveSlot() increases booked_count with ONE conditional UPDATE
 * ("... WHERE booked_count < capacity") inside the booking/order transaction. In MySQL
 * the UPDATE locks the row, so if two customers race for the last seat only one UPDATE
 * changes a row; the other gets "slot full". Overbooking is impossible.
 */
import { one, all, run } from '../db/connection.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { todayISO, addDaysISO, slotDateTime } from '../utils/dates.js';

const MIN_LEAD_MINUTES = 30; // a slot starting in less than 30 minutes can no longer be booked

const mapSlot = (r) => ({
  id: r.id,
  label: r.label,
  startTime: r.start_time,
  endTime: r.end_time,
  capacity: r.capacity,
  isActive: Boolean(r.is_active),
});

export async function listSlotDefinitions({ includeInactive = false } = {}) {
  return (await all('SELECT * FROM time_slots WHERE (? = 1 OR is_active = 1) ORDER BY start_time', includeInactive ? 1 : 0)).map(mapSlot);
}

export async function getSlot(id) {
  const row = await one('SELECT * FROM time_slots WHERE id = ?', id);
  if (!row) throw AppError.notFound('Time slot not found');
  return mapSlot(row);
}

/** Checks that a date is inside the bookable window (today .. today + BOOKING_WINDOW_DAYS). */
export function assertBookableDate(date, field = 'bookingDate') {
  const today = todayISO();
  const last = addDaysISO(today, config.business.bookingWindowDays);
  if (date < today) throw AppError.unprocessable('Please choose today or a future date', { [field]: 'Date is in the past' });
  if (date > last) throw AppError.unprocessable(`Bookings open only ${config.business.bookingWindowDays} days in advance`, { [field]: 'Date is too far ahead' });
}

/** Per-slot availability for one date (booking wizard, reschedule dialog, fitment picker). */
export async function getAvailability(date) {
  assertBookableDate(date);
  const rows = await all(
    `SELECT t.*, COALESCE(i.booked_count, 0) AS booked, i.capacity_override, COALESCE(i.is_blocked, 0) AS blocked
       FROM time_slots t
       LEFT JOIN slot_inventory i ON i.time_slot_id = t.id AND i.slot_date = ?
      WHERE t.is_active = 1
      ORDER BY t.start_time`,
    date,
  );
  const cutoff = Date.now() + MIN_LEAD_MINUTES * 60000;
  return rows.map((r) => {
    const capacity = r.capacity_override ?? r.capacity;
    const remaining = Math.max(0, capacity - r.booked);
    const isPast = slotDateTime(date, r.start_time).getTime() < cutoff;
    return { ...mapSlot(r), capacity, booked: r.booked, remaining, isBlocked: Boolean(r.blocked), isPast, available: !r.blocked && !isPast && remaining > 0 };
  });
}

/**
 * Takes one seat in a slot. MUST be called inside a transaction (booking, reschedule,
 * or store order with fitment). Throws 409 if the slot is full, blocked or started.
 */
export async function reserveSlot(date, timeSlotId, field = 'bookingDate') {
  const slot = await one('SELECT * FROM time_slots WHERE id = ? AND is_active = 1', timeSlotId);
  if (!slot) throw AppError.unprocessable('Please choose a valid time slot', { timeSlotId: 'Invalid time slot' });
  assertBookableDate(date, field);
  if (slotDateTime(date, slot.start_time).getTime() < Date.now() + MIN_LEAD_MINUTES * 60000) {
    throw AppError.conflict('This time slot has already started. Please pick a later slot.');
  }

  await run('INSERT IGNORE INTO slot_inventory (slot_date, time_slot_id, booked_count, is_blocked) VALUES (?, ?, 0, 0)', date, timeSlotId);
  const { changes } = await run(
    `UPDATE slot_inventory
        SET booked_count = booked_count + 1
      WHERE slot_date = ? AND time_slot_id = ? AND is_blocked = 0
        AND booked_count < COALESCE(capacity_override, (SELECT capacity FROM time_slots WHERE id = ?))`,
    date, timeSlotId, timeSlotId,
  );
  if (!changes) throw AppError.conflict('Sorry, this time slot is fully booked. Please choose another slot.');
  return mapSlot(slot);
}

/** Frees one seat (cancellation, or the old slot of a reschedule). */
export async function releaseSlot(date, timeSlotId) {
  await run('UPDATE slot_inventory SET booked_count = booked_count - 1 WHERE slot_date = ? AND time_slot_id = ? AND booked_count > 0', date, timeSlotId);
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export async function createSlot(s) {
  if (s.endTime <= s.startTime) throw AppError.unprocessable('End time must be after start time', { endTime: 'Must be after start time' });
  if (await one('SELECT id FROM time_slots WHERE start_time = ?', s.startTime)) throw AppError.conflict('A slot already starts at this time');
  const { lastInsertRowid } = await run(
    'INSERT INTO time_slots (label, start_time, end_time, capacity, is_active) VALUES (?, ?, ?, ?, ?)',
    s.label, s.startTime, s.endTime, s.capacity, s.isActive ? 1 : 0,
  );
  return getSlot(lastInsertRowid);
}

export async function updateSlot(id, s) {
  await getSlot(id);
  if (s.endTime <= s.startTime) throw AppError.unprocessable('End time must be after start time', { endTime: 'Must be after start time' });
  if (await one('SELECT id FROM time_slots WHERE start_time = ? AND id <> ?', s.startTime, id)) throw AppError.conflict('A slot already starts at this time');
  // Lowering capacity never cancels existing bookings: it only stops NEW bookings.
  await run('UPDATE time_slots SET label = ?, start_time = ?, end_time = ?, capacity = ?, is_active = ? WHERE id = ?',
    s.label, s.startTime, s.endTime, s.capacity, s.isActive ? 1 : 0, id);
  return getSlot(id);
}

export async function deleteSlot(id) {
  await getSlot(id);
  if (await one('SELECT id FROM bookings WHERE time_slot_id = ? LIMIT 1', id) || await one('SELECT id FROM orders WHERE fitment_slot_id = ? LIMIT 1', id)) {
    throw AppError.conflict('This slot has bookings. Deactivate it instead of deleting it.');
  }
  await run('DELETE FROM slot_inventory WHERE time_slot_id = ?', id);
  await run('DELETE FROM time_slots WHERE id = ?', id);
}

/** Admin view of one day: every slot with bookings, capacity and block status. */
export async function getDayInventory(date) {
  return (await all(
    `SELECT t.*, COALESCE(i.booked_count, 0) AS booked, i.capacity_override, COALESCE(i.is_blocked, 0) AS blocked
       FROM time_slots t LEFT JOIN slot_inventory i ON i.time_slot_id = t.id AND i.slot_date = ?
      ORDER BY t.start_time`,
    date,
  )).map((r) => ({
    ...mapSlot(r),
    defaultCapacity: r.capacity,
    capacity: r.capacity_override ?? r.capacity,
    capacityOverride: r.capacity_override,
    booked: r.booked,
    isBlocked: Boolean(r.blocked),
  }));
}

/** Override capacity or block a slot for one specific date (e.g. a public holiday). */
export async function setDayOverride({ date, timeSlotId, capacity, isBlocked }) {
  const slot = await getSlot(timeSlotId);
  await run('INSERT IGNORE INTO slot_inventory (slot_date, time_slot_id, booked_count, is_blocked) VALUES (?, ?, 0, 0)', date, timeSlotId);
  const { booked_count: booked } = await one('SELECT booked_count FROM slot_inventory WHERE slot_date = ? AND time_slot_id = ?', date, timeSlotId);
  if (capacity < booked) {
    throw AppError.unprocessable(`Capacity cannot be below the ${booked} existing booking(s)`, { capacity: `At least ${booked}` });
  }
  await run('UPDATE slot_inventory SET capacity_override = ?, is_blocked = ? WHERE slot_date = ? AND time_slot_id = ?',
    capacity === slot.capacity ? null : capacity, isBlocked ? 1 : 0, date, timeSlotId);
  return (await getDayInventory(date)).find((s) => s.id === timeSlotId);
}
