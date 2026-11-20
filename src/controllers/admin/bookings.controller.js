/** admin/bookings.controller.js - Admin booking list, detail and status workflow. */
import * as bookings from '../../services/booking.service.js';
import { idParam } from '../../middleware/validate.js';

export async function list(req, res) {
  const { status = '', date = '', search = '', from = '', to = '' } = req.query;
  res.ok(await bookings.adminListBookings({ status, date, search, from, to }));
}
export const getOne = async (req, res) => res.ok(await bookings.getBookingDetail(idParam(req), req.user));
export async function updateStatus(req, res) {
  const booking = await bookings.adminUpdateStatus(idParam(req), req.user, req.valid);
  res.ok({ booking, message: `Booking ${booking.code} is now ${booking.statusLabel.toLowerCase()}` });
}
