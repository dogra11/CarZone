/**
 * utils/format.js - Formatting helpers: money (paise -> ₹), dates, times and labels.
 */
import { VEHICLE_TYPE_LABELS, BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from './shared.js';

/** 123450 paise -> "₹1,234.50" ("₹1,234" when compact and whole) */
export function money(paise, { compact = false } = {}) {
  const rupees = Number(paise || 0) / 100;
  const decimals = compact && Number.isInteger(rupees) ? 0 : 2;
  return '₹' + rupees.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const toDate = (v) => (v instanceof Date ? v : new Date(String(v).length === 10 ? `${v}T00:00:00` : String(v).replace(' ', 'T')));

export const formatDate = (v) => toDate(v).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const formatDateShort = (v) => toDate(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const formatDateTime = (v) => toDate(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** '13:30' -> '1:30 PM' */
export function time12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const slotText = (slot) => `${time12(slot.startTime)} - ${time12(slot.endTime)}`;

export function timeAgo(v) {
  const s = Math.round((Date.now() - toDate(v).getTime()) / 1000);
  if (s < 0) return formatDateTime(v);
  if (s < 60) return 'just now';
  for (const [size, name] of [[2592000, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]) {
    if (s >= size) { const n = Math.floor(s / size); return `${n} ${name}${n > 1 ? 's' : ''} ago`; }
  }
  return 'just now';
}

export function duration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr${h > 1 ? 's' : ''}`;
}

/** Local YYYY-MM-DD (not UTC - a booking date is a local calendar day). */
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shiftDays = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return isoDate(d); };

export const vehicleLabel = (t) => VEHICLE_TYPE_LABELS[t] || t;
export const statusLabel = (s) => BOOKING_STATUS_LABELS[s] || s;
export const methodLabel = (m) => PAYMENT_METHOD_LABELS[m] || m;
export const firstName = (name = '') => name.split(' ')[0];
