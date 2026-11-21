/**
 * report.service.js - Business reports for both businesses.
 *   Wash  : bookings, services
 *   Store : sales (by product), categories, orders, inventory
 *   Shared: revenue, customers, payments (success rate, method split, refunds)
 *
 * REPORT GENERATION: each report is a parameterised SQL query for a date range, returned
 * in one common shape { title, columns, rows, summary }. The same object is rendered as
 * JSON (admin table), CSV (Excel download) or printable HTML (Save as PDF).
 * Money columns are marked { money: true } and exported in rupees with 2 decimals.
 */
import { all } from '../db/connection.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { formatINR } from '../utils/money.js';
import { dateRange, nowSql } from '../utils/dates.js';
import { BOOKING_STATUS_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, VEHICLE_TYPE_LABELS } from '../utils/shared.js';

const PAID = "('success', 'refund_pending', 'refunded')";
const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const dayStart = (d) => `${d} 00:00:00`;
const dayEnd = (d) => `${d} 23:59:59`;

async function bookingsReport(from, to) {
  const rows = (await all(
    `SELECT b.booking_code, b.booking_date, t.label AS slot, u.name AS customer, u.email, s.name AS service,
            b.vehicle_type, CONCAT(b.vehicle_brand, ' ', b.vehicle_model) AS vehicle, b.vehicle_reg, b.status,
            b.coupon_code, b.discount_paise, b.tax_paise, b.total_paise
       FROM bookings b JOIN users u ON u.id = b.user_id JOIN services s ON s.id = b.service_id JOIN time_slots t ON t.id = b.time_slot_id
      WHERE b.booking_date BETWEEN ? AND ? ORDER BY b.booking_date, t.start_time`, from, to,
  )).map((r) => ({ ...r, status: BOOKING_STATUS_LABELS[r.status], vehicle_type: VEHICLE_TYPE_LABELS[r.vehicle_type] }));
  const live = rows.filter((r) => r.status !== BOOKING_STATUS_LABELS.cancelled);
  return {
    title: 'Wash bookings report',
    columns: [
      { key: 'booking_code', label: 'Booking ID' }, { key: 'booking_date', label: 'Date' }, { key: 'slot', label: 'Slot' },
      { key: 'customer', label: 'Customer' }, { key: 'email', label: 'Email' }, { key: 'service', label: 'Service' },
      { key: 'vehicle_type', label: 'Vehicle type' }, { key: 'vehicle', label: 'Vehicle' }, { key: 'vehicle_reg', label: 'Reg. no' },
      { key: 'status', label: 'Status' }, { key: 'coupon_code', label: 'Coupon' },
      { key: 'discount_paise', label: 'Discount', money: true }, { key: 'tax_paise', label: 'GST', money: true }, { key: 'total_paise', label: 'Total', money: true },
    ],
    rows,
    summary: [
      { label: 'Bookings', value: String(rows.length) },
      { label: 'Active / completed', value: String(live.length) },
      { label: 'Cancelled', value: String(rows.length - live.length) },
      { label: 'Booked value (excl. cancelled)', value: formatINR(sum(live, 'total_paise')) },
    ],
  };
}

async function revenueReport(from, to) {
  const pays = await all(
    `SELECT SUBSTR(COALESCE(verified_at, created_at), 1, 10) AS day, purpose, COUNT(*) AS n, SUM(amount_paise) AS v
       FROM payments WHERE status IN ${PAID} AND COALESCE(verified_at, created_at) BETWEEN ? AND ?
      GROUP BY SUBSTR(COALESCE(verified_at, created_at), 1, 10), purpose`, dayStart(from), dayEnd(to),
  );
  const refunds = await all(
    `SELECT SUBSTR(processed_at, 1, 10) AS day, SUM(amount_paise) AS v FROM refunds
      WHERE status = 'processed' AND processed_at BETWEEN ? AND ? GROUP BY SUBSTR(processed_at, 1, 10)`, dayStart(from), dayEnd(to),
  );
  const rows = dateRange(from, to).map((day) => {
    const wash = pays.find((x) => x.day === day && x.purpose === 'booking');
    const store = pays.find((x) => x.day === day && x.purpose === 'order');
    const refunded = refunds.find((x) => x.day === day)?.v || 0;
    const w = wash?.v || 0;
    const s = store?.v || 0;
    return { day, payments: (wash?.n || 0) + (store?.n || 0), wash_paise: w, store_paise: s, refunded_paise: refunded, net_paise: w + s - refunded };
  }).filter((r) => r.payments || r.refunded_paise);
  return {
    title: 'Revenue report (wash + store)',
    columns: [
      { key: 'day', label: 'Date' }, { key: 'payments', label: 'Payments' }, { key: 'wash_paise', label: 'Wash', money: true },
      { key: 'store_paise', label: 'Store', money: true }, { key: 'refunded_paise', label: 'Refunded', money: true }, { key: 'net_paise', label: 'Net revenue', money: true },
    ],
    rows,
    summary: [
      { label: 'Wash collected', value: formatINR(sum(rows, 'wash_paise')) },
      { label: 'Store collected', value: formatINR(sum(rows, 'store_paise')) },
      { label: 'Refunded', value: formatINR(sum(rows, 'refunded_paise')) },
      { label: 'Net revenue', value: formatINR(sum(rows, 'net_paise')) },
    ],
  };
}

async function customersReport(from, to) {
  const rows = await all(
    `SELECT u.name, u.email, u.phone, u.city, SUBSTR(u.created_at, 1, 10) AS joined,
            (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.booking_date BETWEEN ? AND ?) AS bookings,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND o.created_at BETWEEN ? AND ?) AS orders,
            (SELECT COALESCE(SUM(p.amount_paise), 0) FROM payments p WHERE p.user_id = u.id AND p.status IN ${PAID} AND p.created_at BETWEEN ? AND ?)
          - (SELECT COALESCE(SUM(r.amount_paise), 0) FROM refunds r JOIN payments p ON p.id = r.payment_id
              WHERE p.user_id = u.id AND r.status = 'processed' AND p.created_at BETWEEN ? AND ?) AS spent_paise
       FROM users u WHERE u.role = 'customer' ORDER BY spent_paise DESC, u.name`,
    from, to, dayStart(from), dayEnd(to), dayStart(from), dayEnd(to), dayStart(from), dayEnd(to),
  );
  return {
    title: 'Customers report',
    columns: [
      { key: 'name', label: 'Customer' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'city', label: 'City' },
      { key: 'joined', label: 'Joined' }, { key: 'bookings', label: 'Wash bookings' }, { key: 'orders', label: 'Store orders' },
      { key: 'spent_paise', label: 'Net spend', money: true },
    ],
    rows,
    summary: [
      { label: 'Customers', value: String(rows.length) },
      { label: 'Active in period', value: String(rows.filter((r) => r.bookings || r.orders).length) },
      { label: 'Total net spend', value: formatINR(sum(rows, 'spent_paise')) },
    ],
  };
}

async function servicesReport(from, to) {
  const rows = await all(
    `SELECT s.name AS service, s.category,
            SUM(CASE WHEN b.status <> 'cancelled' THEN 1 ELSE 0 END) AS bookings,
            SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            COALESCE(SUM(CASE WHEN b.status NOT IN ('cancelled', 'pending_payment') THEN b.total_paise END), 0) AS revenue_paise,
            (SELECT ROUND(AVG(rating), 1) FROM reviews rv WHERE rv.service_id = s.id AND rv.status = 'approved') AS avg_rating
       FROM services s LEFT JOIN bookings b ON b.service_id = s.id AND b.booking_date BETWEEN ? AND ?
      GROUP BY s.id, s.name, s.category ORDER BY bookings DESC, revenue_paise DESC`, from, to,
  );
  const total = sum(rows, 'bookings') || 1;
  for (const r of rows) { r.bookings = Number(r.bookings) || 0; r.share = `${Math.round((r.bookings / total) * 100)}%`; }
  return {
    title: 'Popular services report',
    columns: [
      { key: 'service', label: 'Service' }, { key: 'category', label: 'Category' }, { key: 'bookings', label: 'Bookings' },
      { key: 'share', label: 'Share' }, { key: 'completed', label: 'Completed' }, { key: 'cancelled', label: 'Cancelled' },
      { key: 'revenue_paise', label: 'Revenue', money: true }, { key: 'avg_rating', label: 'Avg rating' },
    ],
    rows,
    summary: [
      { label: 'Most popular', value: rows[0]?.bookings ? rows[0].service : '-' },
      { label: 'Total bookings', value: String(sum(rows, 'bookings')) },
      { label: 'Revenue (paid bookings)', value: formatINR(sum(rows, 'revenue_paise')) },
    ],
  };
}

async function paymentsReport(from, to) {
  const rows = (await all(
    `SELECT p.payment_ref, p.created_at, p.purpose, COALESCE(b.booking_code, o.order_code) AS reference, u.name AS customer,
            p.gateway, p.method, p.method_detail, p.amount_paise, p.status, p.failure_reason,
            COALESCE(r.amount_paise, 0) AS refund_paise
       FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN bookings b ON b.id = p.booking_id
       LEFT JOIN orders o ON o.id = p.order_id LEFT JOIN refunds r ON r.payment_id = p.id
      WHERE p.status <> 'created' AND p.created_at BETWEEN ? AND ? ORDER BY p.created_at`, dayStart(from), dayEnd(to),
  )).map((r) => ({ ...r, purpose: r.purpose === 'booking' ? 'Wash' : 'Store', method: PAYMENT_METHOD_LABELS[r.method] || '-' }));
  const ok = rows.filter((r) => ['success', 'refund_pending', 'refunded'].includes(r.status));
  const failed = rows.filter((r) => r.status === 'failed');
  const methods = {};
  for (const r of ok) methods[r.method] = (methods[r.method] || 0) + 1;
  return {
    title: 'Payments report',
    columns: [
      { key: 'payment_ref', label: 'Payment ref' }, { key: 'created_at', label: 'Date & time' }, { key: 'purpose', label: 'For' },
      { key: 'reference', label: 'Booking / order' }, { key: 'customer', label: 'Customer' }, { key: 'gateway', label: 'Gateway' },
      { key: 'method', label: 'Method' }, { key: 'method_detail', label: 'Detail' }, { key: 'amount_paise', label: 'Amount', money: true },
      { key: 'status', label: 'Status' }, { key: 'refund_paise', label: 'Refund', money: true }, { key: 'failure_reason', label: 'Failure reason' },
    ],
    rows,
    summary: [
      { label: 'Success rate', value: ok.length + failed.length ? `${Math.round((ok.length / (ok.length + failed.length)) * 100)}%` : '-' },
      { label: 'Successful / failed', value: `${ok.length} / ${failed.length}` },
      { label: 'Method split', value: Object.entries(methods).map(([k, v]) => `${k} ${v}`).join(', ') || '-' },
      { label: 'Collected', value: formatINR(sum(ok, 'amount_paise')) },
      { label: 'Refunds', value: formatINR(sum(rows, 'refund_paise')) },
    ],
  };
}

async function salesReport(from, to) {
  const rows = await all(
    `SELECT p.sku, p.name AS product, c.name AS category, p.brand, SUM(i.quantity) AS units, SUM(i.line_total_paise) AS revenue_paise,
            COUNT(DISTINCT o.id) AS orders, p.stock
       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id JOIN product_categories c ON c.id = p.category_id
      WHERE o.status NOT IN ('cancelled', 'returned', 'pending_payment') AND o.created_at BETWEEN ? AND ?
      GROUP BY p.id, p.sku, p.name, c.name, p.brand, p.stock ORDER BY units DESC, revenue_paise DESC`, dayStart(from), dayEnd(to),
  );
  return {
    title: 'Sales by product',
    columns: [
      { key: 'sku', label: 'SKU' }, { key: 'product', label: 'Product' }, { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' },
      { key: 'orders', label: 'Orders' }, { key: 'units', label: 'Units sold' }, { key: 'revenue_paise', label: 'Revenue', money: true }, { key: 'stock', label: 'Stock left' },
    ],
    rows,
    summary: [
      { label: 'Products sold', value: String(rows.length) },
      { label: 'Units sold', value: String(sum(rows, 'units')) },
      { label: 'Best seller', value: rows[0]?.product || '-' },
      { label: 'Sales value', value: formatINR(sum(rows, 'revenue_paise')) },
    ],
  };
}

async function categoriesReport(from, to) {
  const rows = await all(
    `SELECT c.name AS category,
            (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS products,
            COALESCE(SUM(i.quantity), 0) AS units, COALESCE(SUM(i.line_total_paise), 0) AS revenue_paise
       FROM product_categories c
       LEFT JOIN products p ON p.category_id = c.id
       LEFT JOIN (SELECT oi.product_id, oi.quantity, oi.line_total_paise
                    FROM order_items oi JOIN orders o ON o.id = oi.order_id
                   WHERE o.status NOT IN ('cancelled', 'returned', 'pending_payment') AND o.created_at BETWEEN ? AND ?) i
              ON i.product_id = p.id
      GROUP BY c.id, c.name ORDER BY revenue_paise DESC`, dayStart(from), dayEnd(to),
  );
  const total = sum(rows, 'revenue_paise') || 1;
  for (const r of rows) r.share = `${Math.round((r.revenue_paise / total) * 100)}%`;
  return {
    title: 'Sales by category',
    columns: [{ key: 'category', label: 'Category' }, { key: 'products', label: 'Active products' }, { key: 'units', label: 'Units sold' },
      { key: 'revenue_paise', label: 'Revenue', money: true }, { key: 'share', label: 'Share' }],
    rows,
    summary: [{ label: 'Top category', value: rows[0]?.revenue_paise ? rows[0].category : '-' }, { label: 'Units sold', value: String(sum(rows, 'units')) },
      { label: 'Sales value', value: formatINR(sum(rows, 'revenue_paise')) }],
  };
}

async function ordersReport(from, to) {
  const rows = (await all(
    `SELECT o.order_code, o.created_at, u.name AS customer, o.ship_city, o.status, o.payment_method,
            (SELECT SUM(i.quantity) FROM order_items i WHERE i.order_id = o.id) AS items,
            o.subtotal_paise, o.discount_paise, o.shipping_paise, o.fitment_paise, o.total_paise
       FROM orders o JOIN users u ON u.id = o.user_id WHERE o.created_at BETWEEN ? AND ? ORDER BY o.created_at`, dayStart(from), dayEnd(to),
  )).map((r) => ({ ...r, status: ORDER_STATUS_LABELS[r.status], payment_method: PAYMENT_METHOD_LABELS[r.payment_method] }));
  const live = rows.filter((r) => ![ORDER_STATUS_LABELS.cancelled, ORDER_STATUS_LABELS.returned].includes(r.status));
  return {
    title: 'Store orders report',
    columns: [
      { key: 'order_code', label: 'Order ID' }, { key: 'created_at', label: 'Placed at' }, { key: 'customer', label: 'Customer' }, { key: 'ship_city', label: 'City' },
      { key: 'status', label: 'Status' }, { key: 'payment_method', label: 'Payment' }, { key: 'items', label: 'Items' },
      { key: 'subtotal_paise', label: 'Subtotal', money: true }, { key: 'discount_paise', label: 'Discount', money: true },
      { key: 'shipping_paise', label: 'Shipping', money: true }, { key: 'fitment_paise', label: 'Fitment', money: true }, { key: 'total_paise', label: 'Total', money: true },
    ],
    rows,
    summary: [{ label: 'Orders', value: String(rows.length) }, { label: 'Cancelled / returned', value: String(rows.length - live.length) },
      { label: 'Average order value', value: live.length ? formatINR(Math.round(sum(live, 'total_paise') / live.length)) : '-' },
      { label: 'Order value (live)', value: formatINR(sum(live, 'total_paise')) }],
  };
}

async function inventoryReport() {
  const rows = (await all(
    `SELECT p.sku, p.name AS product, c.name AS category, p.price_paise, p.stock,
            (SELECT COALESCE(SUM(m.qty_change), 0) FROM stock_movements m WHERE m.product_id = p.id) AS ledger_stock,
            p.price_paise * p.stock AS stock_value_paise, p.is_active
       FROM products p JOIN product_categories c ON c.id = p.category_id ORDER BY p.stock, p.name`,
  )).map((r) => ({ ...r, state: r.stock === 0 ? 'Out of stock' : r.stock <= config.business.lowStockThreshold ? 'Low stock' : 'OK', is_active: r.is_active ? 'Yes' : 'No' }));
  return {
    title: 'Inventory report',
    columns: [
      { key: 'sku', label: 'SKU' }, { key: 'product', label: 'Product' }, { key: 'category', label: 'Category' }, { key: 'price_paise', label: 'Price', money: true },
      { key: 'stock', label: 'Stock' }, { key: 'ledger_stock', label: 'Ledger stock' }, { key: 'state', label: 'State' },
      { key: 'stock_value_paise', label: 'Stock value', money: true }, { key: 'is_active', label: 'Active' },
    ],
    rows,
    summary: [{ label: 'Products', value: String(rows.length) }, { label: 'Low stock', value: String(rows.filter((r) => r.state === 'Low stock').length) },
      { label: 'Out of stock', value: String(rows.filter((r) => r.state === 'Out of stock').length) }, { label: 'Stock value', value: formatINR(sum(rows, 'stock_value_paise')) }],
  };
}

const BUILDERS = {
  bookings: bookingsReport, revenue: revenueReport, customers: customersReport, services: servicesReport, payments: paymentsReport,
  sales: salesReport, categories: categoriesReport, orders: ordersReport, inventory: inventoryReport,
};

export async function getReport(type, from, to) {
  const build = BUILDERS[type];
  if (!build) throw AppError.notFound('Unknown report type');
  if (from > to) throw AppError.unprocessable('"From" date must be before "To" date', { from: 'Must be before To' });
  const report = await build(from, to);
  return { type, from, to, generatedAt: nowSql(), ...report };
}

/** Rows ready for CSV: money columns converted from paise to rupees ("1234.50"). */
export function reportRowsForExport(report) {
  return report.rows.map((r) => {
    const out = { ...r };
    for (const c of report.columns) if (c.money) out[c.key] = (Number(r[c.key] || 0) / 100).toFixed(2);
    return out;
  });
}
