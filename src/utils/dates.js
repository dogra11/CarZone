/**
 * dates.js - Date/time helpers that work in the server's LOCAL time zone.
 *
 * A car-wash works on local wall-clock time (a "10:00 slot" means 10 AM in Pune),
 * so we store dates as 'YYYY-MM-DD' and timestamps as 'YYYY-MM-DD HH:MM:SS' local
 * time - the same format SQLite produces with datetime('now','localtime').
 */
const pad = (n) => String(n).padStart(2, '0');

export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDaysISO(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Current local timestamp in SQLite format. Optional offset in minutes. */
export function nowSql(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  return `${toISODate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Converts a booking date + 'HH:MM' slot time into a JS Date (local time). */
export function slotDateTime(isoDate, hhmm) {
  return new Date(`${isoDate}T${hhmm}:00`);
}

/** Hours from now until a given Date (negative if it is in the past). */
export function hoursUntil(date) {
  return (date.getTime() - Date.now()) / 3600000;
}

/** Inclusive list of ISO dates between two ISO dates. */
export function dateRange(fromISO, toISO) {
  const out = [];
  for (let d = fromISO; d <= toISO; d = addDaysISO(d, 1)) out.push(d);
  return out;
}
