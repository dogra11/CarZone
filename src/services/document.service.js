/**
 * document.service.js - Server-rendered printable documents: wash and store tax INVOICES and
 * the printable REPORT. They are standalone HTML pages with print-friendly CSS, so
 * "Print -> Save as PDF" in any browser produces a clean PDF (no PDF library needed).
 * All dynamic text goes through escapeHtml() to prevent script injection.
 */
import { config } from '../config/index.js';
import { escapeHtml as e } from '../utils/html.js';
import { formatINR } from '../utils/money.js';
import { newInvoiceNumber } from '../utils/ids.js';
import { PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from '../utils/shared.js';

const BASE_CSS = `
  *{box-sizing:border-box} body{margin:0;background:#e9ecf1;font-family:"Segoe UI",Arial,sans-serif;color:#141820;font-size:13px}
  .sheet{max-width:860px;margin:24px auto;background:#fff;padding:44px 48px;box-shadow:0 10px 40px rgba(0,0,0,.12);border-top:6px solid #0b0d12}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;border-bottom:1px solid #e3e6ec;padding-bottom:22px}
  .brand{display:flex;gap:12px;align-items:center} .brand img{width:46px;height:46px}
  .brand b{font-size:20px;letter-spacing:.04em} .brand small{display:block;color:#6b7280;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
  h1{margin:0;font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:#0b0d12;text-align:right}
  .muted{color:#6b7280} .gold{color:#a8842f} .right{text-align:right}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:22px 0}
  .label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;margin-top:8px} th{background:#0b0d12;color:#fff;text-align:left;font-weight:600;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:9px 10px}
  td{padding:9px 10px;border-bottom:1px solid #eceef2;vertical-align:top} tr:nth-child(even) td{background:#fafbfc}
  .totals{margin-left:auto;width:330px;margin-top:14px} .totals td{border:none;padding:5px 10px;background:none!important}
  .totals .grand td{border-top:2px solid #0b0d12;font-size:16px;font-weight:700;padding-top:10px}
  .stamp{display:inline-block;padding:4px 12px;border:2px solid #1f9d55;color:#1f9d55;border-radius:4px;font-weight:700;letter-spacing:.12em;font-size:11px;text-transform:uppercase}
  .stamp.warn{border-color:#c0392b;color:#c0392b}
  .foot{margin-top:30px;padding-top:16px;border-top:1px solid #e3e6ec;font-size:11px;color:#6b7280;display:flex;justify-content:space-between;gap:20px}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:20px 0}
  .summary div{border:1px solid #e3e6ec;border-radius:6px;padding:10px 12px} .summary b{display:block;font-size:15px;margin-top:4px}
  .toolbar{max-width:860px;margin:18px auto 0;display:flex;justify-content:flex-end;gap:10px}
  .toolbar button,.toolbar a{background:#0b0d12;color:#fff;border:0;padding:10px 18px;border-radius:6px;font:600 13px "Segoe UI",Arial;cursor:pointer;text-decoration:none}
  .toolbar a{background:#fff;color:#0b0d12;border:1px solid #c9ced6}
  @media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;padding:0;border-top:none}.toolbar{display:none}}
`;

function page(title, body, backHref) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(title)}</title><link rel="icon" href="/assets/images/favicon.svg"><style>${BASE_CSS}</style></head>
<body>
<div class="toolbar"><a href="${e(backHref)}">Back</a><button type="button" data-print>Print / Save as PDF</button></div>
<div class="sheet">${body}</div>
<script src="/js/print.js"></script>
</body></html>`;
}

function header(rightHtml) {
  const c = config.company;
  return `<div class="top">
    <div><div class="brand"><img src="/assets/images/logo-mark.svg" alt=""><div><b>Car<span style="color:#1f6fe0">Zone</span></b><small>Wash &middot; Detailing &middot; Accessories</small></div></div>
      <p class="muted" style="margin:12px 0 0;line-height:1.6">${e(c.legalName)}<br>${e(c.address)}<br>${e(c.phone)} &middot; ${e(c.email)}<br>GSTIN: ${e(c.gstin)}</p></div>
    <div>${rightHtml}</div></div>`;
}

/** Payment receipt lines printed on every invoice (our ref + gateway transaction id). */
function receiptRows(p) {
  return `<tr><td class="muted">Paid via ${e(PAYMENT_METHOD_LABELS[p.method] || p.method)}</td><td class="right muted">${e(p.methodDetail || '')}</td></tr>
      <tr><td class="muted">Payment ref</td><td class="right muted">${e(p.paymentRef)}</td></tr>
      <tr><td class="muted">Transaction ID</td><td class="right muted">${e(p.transactionRef || p.gatewayPaymentId || '-')}</td></tr>`;
}

/** Tax invoice for a paid booking (booking = getBookingDetail() result). */
export function renderInvoiceHtml(booking) {
  const paid = booking.payments.find((p) => ['success', 'refund_pending', 'refunded'].includes(p.status));
  const b = booking.bill;
  const cgst = Math.floor(b.taxPaise / 2);           // GST is split equally into CGST + SGST
  const sgst = b.taxPaise - cgst;
  const halfRate = (config.business.gstPercent / 2).toString();

  const items = [
    { name: `${booking.service.name} (${VEHICLE_TYPE_LABELS[booking.vehicle.type]})`, sac: '998714', amount: b.basePricePaise },
    ...booking.addons.map((a) => ({ name: `Add-on: ${a.name}`, sac: '998714', amount: a.pricePaise })),
    ...(b.pickupFeePaise ? [{ name: 'Pickup & drop service', sac: '996511', amount: b.pickupFeePaise }] : []),
  ];

  let stamp = '<span class="stamp">Paid</span>';
  if (booking.refund) {
    stamp = `<span class="stamp warn">${booking.refund.status === 'processed' ? 'Refunded' : 'Refund pending'} ${booking.refund.percent}%</span>`;
  }

  const body = `
    ${header(`<h1>Tax invoice</h1><p class="right" style="line-height:1.7;margin:10px 0 0">
      <span class="muted">Invoice no.</span> <b>${e(newInvoiceNumber(booking.id))}</b><br>
      <span class="muted">Invoice date</span> <b>${e((paid?.createdAt || booking.createdAt).slice(0, 10))}</b><br>
      <span class="muted">Booking ID</span> <b>${e(booking.code)}</b><br>${stamp}</p>`)}
    <div class="grid">
      <div><div class="label">Billed to</div><b>${e(booking.customer.name)}</b><br>${e(booking.customer.email)}<br>${e(booking.customer.phone || '')}<br>${e(booking.address)}</div>
      <div><div class="label">Service details</div>
        <b>${e(booking.vehicle.brand)} ${e(booking.vehicle.model)}</b> &middot; ${e(booking.vehicle.registrationNo)}<br>
        ${e(booking.bookingDate)} &middot; ${e(booking.slot.label)} (${e(booking.slot.startTime)}-${e(booking.slot.endTime)})<br>
        ${booking.pickupDrop ? 'Pickup &amp; drop included' : 'Drive-in at studio'}<br>
        Status: ${e(booking.statusLabel)}</div>
    </div>
    <table><thead><tr><th>#</th><th>Description</th><th>SAC</th><th class="right">Amount</th></tr></thead><tbody>
      ${items.map((it, i) => `<tr><td>${i + 1}</td><td>${e(it.name)}</td><td>${it.sac}</td><td class="right">${formatINR(it.amount)}</td></tr>`).join('')}
    </tbody></table>
    <table class="totals"><tbody>
      <tr><td>Subtotal</td><td class="right">${formatINR(b.subtotalPaise)}</td></tr>
      ${b.discountPaise ? `<tr><td>Discount ${b.couponCode ? `(${e(b.couponCode)})` : ''}</td><td class="right">- ${formatINR(b.discountPaise)}</td></tr>` : ''}
      <tr><td>Taxable value</td><td class="right">${formatINR(b.taxablePaise)}</td></tr>
      <tr><td>CGST @ ${halfRate}%</td><td class="right">${formatINR(cgst)}</td></tr>
      <tr><td>SGST @ ${halfRate}%</td><td class="right">${formatINR(sgst)}</td></tr>
      <tr class="grand"><td>Total</td><td class="right">${formatINR(b.totalPaise)}</td></tr>
      ${paid ? receiptRows(paid) : ''}
      ${booking.refund ? `<tr><td class="gold">Refund (${booking.refund.percent}%)</td><td class="right gold">${formatINR(booking.refund.amountPaise)}</td></tr>` : ''}
    </tbody></table>
    <div class="foot"><span>Thank you for choosing CarZone. This is a computer-generated invoice and does not need a signature.</span><span>${e(config.company.name)}</span></div>`;

  return page(`Invoice ${booking.code} - CarZone`, body, `/bookings/${booking.id}`);
}

/** Printable version of any report from report.service.js */
export function renderReportHtml(report) {
  const fmt = (col, v) => (col.money ? formatINR(v || 0) : e(v ?? ''));
  const body = `
    ${header(`<h1>${e(report.title)}</h1><p class="right muted" style="line-height:1.7;margin:10px 0 0">
      Period: <b>${e(report.from)}</b> to <b>${e(report.to)}</b><br>Generated: ${e(report.generatedAt)}</p>`)}
    <div class="summary">${report.summary.map((s) => `<div><span class="label">${e(s.label)}</span><b>${e(s.value)}</b></div>`).join('')}</div>
    <table><thead><tr>${report.columns.map((c) => `<th${c.money ? ' class="right"' : ''}>${e(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${report.rows.length
      ? report.rows.map((r) => `<tr>${report.columns.map((c) => `<td${c.money ? ' class="right"' : ''}>${fmt(c, r[c.key])}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${report.columns.length}" class="muted">No records in this period.</td></tr>`}</tbody></table>
    <div class="foot"><span>CarZone admin report &middot; confidential</span><span>${report.rows.length} row(s)</span></div>`;
  return page(`${report.title} - CarZone`, body, '/admin/reports');
}

/** Tax invoice for a store order (prices are GST-inclusive, so GST is shown as "included"). */
export function renderOrderInvoiceHtml(order) {
  const t = order.totals;
  const paid = order.payments.find((p) => ['success', 'refund_pending', 'refunded'].includes(p.status));
  const cod = order.payments.find((p) => p.gateway === 'cod');
  const cgst = Math.floor(t.gstIncludedPaise / 2);
  const sgst = t.gstIncludedPaise - cgst;
  const halfRate = (config.business.gstPercent / 2).toString();
  const s = order.shipping;
  let stamp = paid ? '<span class="stamp">Paid</span>' : '<span class="stamp warn">Cash on delivery</span>';
  if (['cancelled', 'returned'].includes(order.status)) stamp = `<span class="stamp warn">${e(order.statusLabel)}</span>`;

  const body = `
    ${header(`<h1>Tax invoice</h1><p class="right" style="line-height:1.7;margin:10px 0 0">
      <span class="muted">Invoice no.</span> <b>${e(`INV-S${String(order.id).padStart(6, '0')}`)}</b><br>
      <span class="muted">Order date</span> <b>${e(order.createdAt.slice(0, 10))}</b><br>
      <span class="muted">Order ID</span> <b>${e(order.code)}</b><br>${stamp}</p>`)}
    <div class="grid">
      <div><div class="label">Ship to</div><b>${e(s.name)}</b><br>${e(s.line1)}${s.line2 ? `, ${e(s.line2)}` : ''}<br>${e(s.city)}, ${e(s.state)} ${e(s.pincode)}<br>${e(s.phone)}</div>
      <div><div class="label">Billed to</div><b>${e(order.customer.name)}</b><br>${e(order.customer.email)}<br>Status: ${e(order.statusLabel)}
        ${order.fitment ? `<br>Fitment: ${e(order.fitment.date)} ${e(order.fitment.startTime)} at CarZone centre` : ''}</div>
    </div>
    <table><thead><tr><th>#</th><th>Item</th><th>SKU</th><th class="right">Qty</th><th class="right">Unit price</th><th class="right">Amount</th></tr></thead><tbody>
      ${order.items.map((it, i) => `<tr><td>${i + 1}</td><td>${e(it.name)}</td><td>${e(it.sku)}</td><td class="right">${it.quantity}</td><td class="right">${formatINR(it.unitPricePaise)}</td><td class="right">${formatINR(it.lineTotalPaise)}</td></tr>`).join('')}
    </tbody></table>
    <table class="totals"><tbody>
      <tr><td>Subtotal</td><td class="right">${formatINR(t.subtotalPaise)}</td></tr>
      ${t.discountPaise ? `<tr><td>Discount ${t.couponCode ? `(${e(t.couponCode)})` : ''}</td><td class="right">- ${formatINR(t.discountPaise)}</td></tr>` : ''}
      <tr><td>Shipping</td><td class="right">${t.shippingPaise ? formatINR(t.shippingPaise) : 'Free'}</td></tr>
      ${t.fitmentPaise ? `<tr><td>Fitment at CarZone centre</td><td class="right">${formatINR(t.fitmentPaise)}</td></tr>` : ''}
      <tr class="grand"><td>Total</td><td class="right">${formatINR(t.totalPaise)}</td></tr>
      <tr><td class="muted">Includes CGST @ ${halfRate}%</td><td class="right muted">${formatINR(cgst)}</td></tr>
      <tr><td class="muted">Includes SGST @ ${halfRate}%</td><td class="right muted">${formatINR(sgst)}</td></tr>
      ${paid ? receiptRows(paid) : cod ? `<tr><td class="muted">Payment</td><td class="right muted">Cash on delivery (${e(cod.paymentRef)})</td></tr>` : ''}
      ${paid?.refund ? `<tr><td class="gold">Refund (${paid.refund.percent}%) - ${e(paid.refund.status)}</td><td class="right gold">${formatINR(paid.refund.amountPaise)}</td></tr>` : ''}
    </tbody></table>
    <div class="foot"><span>Thank you for shopping at CarZone. Prices include GST. This is a computer-generated invoice.</span><span>${e(config.company.name)}</span></div>`;
  return page(`Invoice ${order.code} - CarZone`, body, `/orders/${order.id}`);
}
