/**
 * ids.js - Human-friendly reference numbers.
 *
 * Booking codes look like "CZW-7K2M9Q". They use crypto-random characters from an
 * alphabet without look-alikes (no 0/O, 1/I) so customers can read them over the phone.
 */
import crypto from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const newBookingCode = () => `CZW-${randomCode(6)}`;
export const newTransactionRef = () => `TXN${Date.now().toString(36).toUpperCase()}${randomCode(4)}`;
export const newRefundRef = () => `RFD${Date.now().toString(36).toUpperCase()}${randomCode(4)}`;
export const newInvoiceNumber = (bookingId) => `INV-${String(bookingId).padStart(6, '0')}`;
