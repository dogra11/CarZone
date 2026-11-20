/**
 * html.js - Escapes text before it is placed inside server-rendered HTML
 * (invoices and printable reports). This prevents XSS (script injection).
 */
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => MAP[ch]);
}
