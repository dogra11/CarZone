/**
 * booking.controller.js - Customer wash-booking endpoints: quote, create, list, view,
 * cancel, reschedule and invoice.
 * Express handlers: errors thrown here reach errorHandler via asyncHandler() in the routes.
 * Invoices are sent as HTML with res.send(); res.set() adds the download header.
 */
import * as bookings from '../services/booking.service.js';
import { renderInvoiceHtml } from '../services/document.service.js';
import { idParam } from '../middleware/validate.js';
import { AppError } from '../utils/AppError.js';

export const quote = async (req, res) => res.ok(await bookings.quote(req.user.id, req.valid));

export async function create(req, res) {
  const booking = await bookings.createBooking(req.user, req.valid);
  res.ok({ booking, message: `Booking ${booking.code} created. Complete the payment to confirm your slot.` }, 201);
}

export async function listMine(req, res) {
  const scope = ['upcoming', 'past', 'all'].includes(req.query.scope) ? req.query.scope : 'all';
  res.ok(await bookings.listBookingsForUser(req.user.id, scope));
}

export const getOne = async (req, res) => res.ok(await bookings.getBookingDetail(idParam(req), req.user));

export async function cancel(req, res) {
  const booking = await bookings.cancelBooking(idParam(req), req.user, req.valid.reason);
  const refundText = booking.refund ? ` A refund of ${booking.refund.percent}% has been initiated.` : '';
  res.ok({ booking, message: `Booking ${booking.code} cancelled.${refundText}` });
}

export async function reschedule(req, res) {
  const booking = await bookings.rescheduleBooking(idParam(req), req.user, req.valid);
  res.ok({ booking, message: `Booking moved to ${booking.bookingDate}, ${booking.slot.label}` });
}

/** Printable HTML invoice (with payment receipt). ?download=1 sends it as a file. */
export async function invoice(req, res) {
  const booking = await bookings.getBookingDetail(idParam(req), req.user);
  if (!booking.actions.invoice) throw AppError.conflict('An invoice is available once the booking has been paid');
  if (req.query.download === '1') res.set('Content-Disposition', `attachment; filename="CarZone-Invoice-${booking.code}.html"`);
  res.send(renderInvoiceHtml(booking));
}
