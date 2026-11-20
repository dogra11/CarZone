/*
 * print.js - Wires the "Print / Save as PDF" button on server-rendered invoices
 * and reports (inline onclick handlers are blocked by our Content-Security-Policy).
 */
document.addEventListener('click', function (event) {
  if (event.target.closest('[data-print]')) window.print();
});
