/**
 * csv.js - Builds RFC 4180 CSV text for report exports.
 *
 * Cells containing commas, quotes or new lines are wrapped in quotes, and cells that
 * start with = + - @ are prefixed with ' to stop "CSV injection" when opened in Excel.
 */
function cell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** columns: [{ key, label }], rows: array of objects */
export function toCsv(columns, rows) {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(','));
  // ﻿ (byte-order mark) makes Excel open the ₹ symbol and other UTF-8 text correctly.
  return '﻿' + [header, ...body].join('\r\n') + '\r\n';
}
