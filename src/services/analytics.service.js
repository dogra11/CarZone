/**
 * analytics.service.js - Numbers for the admin dashboard (both businesses).
 *
 * DASHBOARD ANALYTICS are computed live with SQL aggregates (COUNT, SUM, GROUP BY),
 * so they are always in sync with the data - no separate statistics table.
 *   Revenue = successful payments (success / refund_pending / refunded) minus processed refunds,
 *   split into WASH (purpose = 'booking') and STORE (purpose = 'order').
 */
import { one, all } from '../db/connection.js';
import { config } from '../config/index.js';
import { todayISO, addDaysISO, dateRange } from '../utils/dates.js';
import { mapProduct } from './product.service.js';

const PAID = "('success', 'refund_pending', 'refunded')";

export async function getDashboardAnalytics() {
  const today = todayISO();
  const from14 = addDaysISO(today, -13);

  const users = await one(
    "SELECT COUNT(*) AS customers, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_30d FROM users WHERE role = 'customer'",
    `${addDaysISO(today, -29)} 00:00:00`,
  );
  const b = await one(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS pending_payment,
            SUM(CASE WHEN status IN ('confirmed', 'rescheduled') THEN 1 ELSE 0 END) AS upcoming,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            SUM(CASE WHEN booking_date = ? AND status <> 'cancelled' THEN 1 ELSE 0 END) AS today
       FROM bookings`,
    today,
  );
  const o = await one(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status IN ('placed', 'packed') THEN 1 ELSE 0 END) AS to_ship,
            SUM(CASE WHEN status IN ('shipped', 'out_for_delivery') THEN 1 ELSE 0 END) AS in_transit,
            SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
            SUM(CASE WHEN status = 'return_requested' THEN 1 ELSE 0 END) AS return_requests,
            SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) AS awaiting_payment
       FROM orders`,
  );
  const money = await all(
    `SELECT p.purpose,
            COALESCE(SUM(CASE WHEN p.status IN ${PAID} THEN p.amount_paise END), 0) AS collected,
            COALESCE(SUM(CASE WHEN r.status = 'processed' THEN r.amount_paise END), 0) AS refunded
       FROM payments p LEFT JOIN refunds r ON r.payment_id = p.id GROUP BY p.purpose`,
  );
  const m = (purpose, k) => money.find((x) => x.purpose === purpose)?.[k] || 0;
  const pay = await one(
    `SELECT SUM(CASE WHEN status IN ${PAID} THEN 1 ELSE 0 END) AS ok, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM payments WHERE gateway <> 'cod'`,
  );
  const rating = await one("SELECT AVG(rating) AS avg, COUNT(*) AS n FROM reviews WHERE status = 'approved'");

  // Revenue per day (last 14 days) for each business; refunds shown separately.
  const daily = await all(
    `SELECT SUBSTR(COALESCE(verified_at, created_at), 1, 10) AS day, purpose, SUM(amount_paise) AS v
       FROM payments WHERE status IN ${PAID} AND COALESCE(verified_at, created_at) >= ?
      GROUP BY SUBSTR(COALESCE(verified_at, created_at), 1, 10), purpose`,
    `${from14} 00:00:00`,
  );
  const revenueByDay = dateRange(from14, today).map((day) => ({
    date: day,
    washPaise: daily.find((r) => r.day === day && r.purpose === 'booking')?.v || 0,
    storePaise: daily.find((r) => r.day === day && r.purpose === 'order')?.v || 0,
  }));

  const bookingsByStatus = await all('SELECT status, COUNT(*) AS count FROM bookings GROUP BY status ORDER BY count DESC');
  const ordersByStatus = await all('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC');

  const topServices = (await all(
    `SELECT s.id, s.name, COUNT(b.id) AS bookings,
            COALESCE(SUM(CASE WHEN b.status <> 'pending_payment' THEN b.total_paise END), 0) AS revenue_paise
       FROM services s LEFT JOIN bookings b ON b.service_id = s.id AND b.status <> 'cancelled'
      GROUP BY s.id, s.name ORDER BY bookings DESC, revenue_paise DESC LIMIT 5`,
  )).map((r) => ({ id: r.id, name: r.name, bookings: r.bookings, revenuePaise: r.revenue_paise }));

  const topProducts = (await all(
    `SELECT p.id, p.name, p.slug, SUM(i.quantity) AS units, SUM(i.line_total_paise) AS revenue_paise
       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
      WHERE o.status NOT IN ('cancelled', 'returned', 'pending_payment')
      GROUP BY p.id, p.name, p.slug ORDER BY units DESC, revenue_paise DESC LIMIT 5`,
  )).map((r) => ({ id: r.id, name: r.name, slug: r.slug, units: r.units, revenuePaise: r.revenue_paise }));

  const paymentMethods = (await all(
    `SELECT method, COUNT(*) AS count, SUM(amount_paise) AS amount_paise FROM payments
      WHERE status IN ${PAID} AND method IS NOT NULL GROUP BY method ORDER BY count DESC`,
  )).map((r) => ({ method: r.method, count: r.count, amountPaise: r.amount_paise }));

  const lowStock = (await all(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name, NULL AS avg_rating, 0 AS review_count, 0 AS sold_count
       FROM products p JOIN product_categories c ON c.id = p.category_id
      WHERE p.is_active = 1 AND p.stock <= ? ORDER BY p.stock, p.name LIMIT 8`, config.business.lowStockThreshold,
  )).map(mapProduct);

  // RECENT ACTIVITY: one UNION query merges five event sources into one timeline.
  const recentActivity = await all(
    `SELECT * FROM (
        SELECT h.created_at AS happened_at, 'booking' AS kind, bk.booking_code AS ref, h.to_status AS status, h.note AS text, u.name AS actor, NULL AS amount
          FROM booking_status_history h JOIN bookings bk ON bk.id = h.booking_id JOIN users u ON u.id = bk.user_id
        UNION ALL
        SELECT h.created_at, 'order', od.order_code, h.to_status, h.note, u.name, NULL
          FROM order_status_history h JOIN orders od ON od.id = h.order_id JOIN users u ON u.id = od.user_id
        UNION ALL
        SELECT p.updated_at, 'payment', p.payment_ref, p.status, p.method_detail, u.name, p.amount_paise
          FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status IN ('success', 'failed')
        UNION ALL
        SELECT created_at, 'user', email, 'registered', 'New customer account', name, NULL
          FROM users WHERE role = 'customer'
        UNION ALL
        SELECT rv.created_at, 'review', s.name, rv.status, CONCAT(rv.rating, '/5 - ', rv.title), u.name, NULL
          FROM reviews rv JOIN users u ON u.id = rv.user_id JOIN services s ON s.id = rv.service_id
      ) AS activity ORDER BY happened_at DESC LIMIT 14`,
  );

  const washNet = m('booking', 'collected') - m('booking', 'refunded');
  const storeNet = m('order', 'collected') - m('order', 'refunded');
  return {
    totals: {
      customers: users.customers,
      newCustomers30d: users.new_30d || 0,
      bookings: b.total,
      pendingPayment: b.pending_payment || 0,
      upcoming: b.upcoming || 0,
      inProgress: b.in_progress || 0,
      completed: b.completed || 0,
      cancelled: b.cancelled || 0,
      todayBookings: b.today || 0,
      orders: o.total,
      ordersToShip: o.to_ship || 0,
      ordersInTransit: o.in_transit || 0,
      ordersDelivered: o.delivered || 0,
      returnRequests: o.return_requests || 0,
      ordersAwaitingPayment: o.awaiting_payment || 0,
      washRevenuePaise: washNet,
      storeRevenuePaise: storeNet,
      netRevenuePaise: washNet + storeNet,
      refundedPaise: m('booking', 'refunded') + m('order', 'refunded'),
      paymentSuccessRate: (pay.ok || 0) + (pay.failed || 0) ? Math.round(((pay.ok || 0) / ((pay.ok || 0) + (pay.failed || 0))) * 100) : null,
      avgRating: rating.avg ? Math.round(rating.avg * 10) / 10 : null,
      approvedReviews: rating.n,
      pendingReviews: (await one("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'")).n,
      pendingProductReviews: (await one("SELECT COUNT(*) AS n FROM product_reviews WHERE status = 'pending'")).n,
      pendingRefunds: (await one("SELECT COUNT(*) AS n FROM refunds WHERE status = 'pending'")).n,
      newMessages: (await one("SELECT COUNT(*) AS n FROM contact_messages WHERE status = 'new'")).n,
      lowStockCount: (await one('SELECT COUNT(*) AS n FROM products WHERE is_active = 1 AND stock <= ?', config.business.lowStockThreshold)).n,
    },
    revenueByDay,
    bookingsByStatus,
    ordersByStatus,
    topServices,
    topProducts,
    paymentMethods,
    lowStock,
    recentActivity: recentActivity.map((a) => ({ ...a, at: a.happened_at })),
  };
}
