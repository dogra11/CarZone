/**
 * history.service.js - Writes status timelines for bookings and orders.
 * Every status change goes through here, which also powers the admin activity feed.
 */
import { run } from '../db/connection.js';
import { nowSql } from '../utils/dates.js';

export async function addHistory(bookingId, fromStatus, toStatus, note, changedBy) {
  await run(
    'INSERT INTO booking_status_history (booking_id, from_status, to_status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    bookingId, fromStatus, toStatus, note ?? null, changedBy ?? null, nowSql(),
  );
}

export async function addOrderHistory(orderId, fromStatus, toStatus, note, changedBy) {
  await run(
    'INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    orderId, fromStatus, toStatus, note ?? null, changedBy ?? null, nowSql(),
  );
}
