/**
 * review.service.js - Wash service ratings & reviews.
 *
 * Rules: only the customer who owns a COMPLETED booking can review it, once.
 * New reviews are 'pending' until an admin approves them (moderation), and only
 * approved reviews appear on the website.
 */
import { one, all, run } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { nowSql } from '../utils/dates.js';

const REVIEW_SELECT = `
  SELECT rv.*, u.name AS customer_name, u.avatar, u.city, s.name AS service_name, s.slug AS service_slug,
         b.booking_code, b.vehicle_brand, b.vehicle_model
    FROM reviews rv
    JOIN users u ON u.id = rv.user_id
    JOIN services s ON s.id = rv.service_id
    JOIN bookings b ON b.id = rv.booking_id`;

const mapReview = (r) => ({
  id: r.id,
  kind: 'service',
  bookingId: r.booking_id,
  bookingCode: r.booking_code,
  rating: r.rating,
  title: r.title,
  comment: r.comment,
  status: r.status,
  adminReply: r.admin_reply,
  customerName: r.customer_name,
  customerCity: r.city,
  avatar: r.avatar,
  serviceId: r.service_id,
  serviceName: r.service_name,
  serviceSlug: r.service_slug,
  vehicle: `${r.vehicle_brand} ${r.vehicle_model}`,
  createdAt: r.created_at,
});

export async function createReview(user, { bookingId, rating, title, comment }) {
  const booking = await one('SELECT * FROM bookings WHERE id = ? AND user_id = ?', bookingId, user.id);
  if (!booking) throw AppError.notFound('Booking not found');
  if (booking.status !== 'completed') throw AppError.conflict('You can review a service only after it is completed');
  if (await one('SELECT id FROM reviews WHERE booking_id = ?', bookingId)) throw AppError.conflict('You have already reviewed this booking');

  const { lastInsertRowid } = await run(
    "INSERT INTO reviews (booking_id, user_id, service_id, rating, title, comment, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    bookingId, user.id, booking.service_id, rating, title, comment, nowSql(),
  );
  return mapReview(await one(`${REVIEW_SELECT} WHERE rv.id = ?`, lastInsertRowid));
}

export const listMyReviews = async (userId) =>
  (await all(`${REVIEW_SELECT} WHERE rv.user_id = ? ORDER BY rv.created_at DESC`, userId)).map(mapReview);

export const listServiceReviews = async (serviceId) =>
  (await all(`${REVIEW_SELECT} WHERE rv.service_id = ? AND rv.status = 'approved' ORDER BY rv.created_at DESC LIMIT 20`, serviceId)).map(mapReview);

/** Testimonials for the landing page: best recent approved reviews. (LIMIT is a fixed number, not user input.) */
export const featuredReviews = async () =>
  (await all(`${REVIEW_SELECT} WHERE rv.status = 'approved' AND rv.rating >= 4 ORDER BY rv.rating DESC, rv.created_at DESC LIMIT 6`)).map(mapReview);

export const adminListReviews = async ({ status = '' } = {}) =>
  (await all(`${REVIEW_SELECT} WHERE (? = '' OR rv.status = ?) ORDER BY rv.status = 'pending' DESC, rv.created_at DESC`, status, status)).map(mapReview);

export async function moderateReview(id, { status, adminReply }) {
  if (!(await one('SELECT id FROM reviews WHERE id = ?', id))) throw AppError.notFound('Review not found');
  await run('UPDATE reviews SET status = ?, admin_reply = ?, moderated_at = ? WHERE id = ?', status, adminReply ?? null, nowSql(), id);
  return mapReview(await one(`${REVIEW_SELECT} WHERE rv.id = ?`, id));
}

export async function deleteReview(id) {
  const { changes } = await run('DELETE FROM reviews WHERE id = ?', id);
  if (!changes) throw AppError.notFound('Review not found');
}
