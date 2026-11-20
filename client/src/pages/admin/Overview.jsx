/**
 * pages/admin/Overview.jsx - Combined business analytics for the car wash AND the store:
 * KPI cards, wash vs store revenue chart, bookings/orders by status, top services,
 * top products, payment methods, low-stock alerts and the recent activity feed.
 */
import { Link } from '../../router/index.jsx';
import { useApi } from '../../hooks/useApi.js';
import { money, timeAgo, statusLabel, methodLabel, formatDateShort } from '../../utils/format.js';
import { ORDER_STATUS_LABELS } from '../../utils/shared.js';
import { PanelHead } from '../../components/AppShell.jsx';
import StatCard from '../../components/StatCard.jsx';
import { BarChart, DonutChart, BarList } from '../../components/Chart.jsx';
import { AsyncView } from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import Img from '../../components/Img.jsx';
import { shortINR } from './helpers.jsx';

const BOOKING_COLORS = { pending_payment: '#f2b33d', confirmed: '#2f8cff', rescheduled: '#8c6eff', in_progress: '#c9a961', completed: '#2fbf71', cancelled: '#ff5c5c' };
const ORDER_COLORS = { pending_payment: '#f2b33d', placed: '#2f8cff', packed: '#8c6eff', shipped: '#5aa6ff', out_for_delivery: '#c9a961', delivered: '#2fbf71', cancelled: '#ff5c5c', return_requested: '#ff9f43', returned: '#8a8f98' };

function Activity({ a }) {
  const map = {
    booking: [a.status === 'cancelled' ? 'x-circle' : a.status === 'completed' ? 'check-circle' : 'calendar', a.status === 'cancelled' ? 'red' : a.status === 'completed' ? 'green' : ''],
    order: [a.status === 'cancelled' ? 'x-circle' : 'package', a.status === 'cancelled' ? 'red' : a.status === 'delivered' ? 'green' : ''],
    payment: ['credit-card', a.status === 'failed' ? 'red' : 'green'],
    user: ['user', 'gold'],
    review: ['star', 'gold'],
  };
  const [ic, cls] = map[a.kind] || ['activity', ''];
  let text;
  if (a.kind === 'booking') text = <><b>{a.actor}</b> - booking <span className="mono">{a.ref}</span> {statusLabel(a.status).toLowerCase()}{a.text && <><br /><span className="text-muted">{a.text}</span></>}</>;
  else if (a.kind === 'order') text = <><b>{a.actor}</b> - order <span className="mono">{a.ref}</span> {(ORDER_STATUS_LABELS[a.status] || a.status).toLowerCase()}{a.text && <><br /><span className="text-muted">{a.text}</span></>}</>;
  else if (a.kind === 'payment') text = <><b>{a.actor}</b> - payment {a.status} {money(a.amount)}<br /><span className="text-muted">{a.text || ''} · {a.ref}</span></>;
  else if (a.kind === 'user') text = <><b>{a.actor}</b> created an account<br /><span className="text-muted">{a.ref}</span></>;
  else text = <><b>{a.actor}</b> reviewed {a.ref}<br /><span className="text-muted">{a.text} ({a.status})</span></>;
  return <li><div className={`a-icon ${cls}`}><Icon name={ic} /></div><div className="a-text">{text}</div><span className="a-time">{timeAgo(a.at)}</span></li>;
}

export default function Overview() {
  const q = useApi('/api/admin/analytics');
  return (
    <AsyncView query={q}>{(d) => {
      const t = d.totals;
      return (
        <>
          <PanelHead title="Business overview" subtitle={`Car wash + accessories store · ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}`}>
            <Link className="btn btn-dark btn-sm" to="/admin/reports"><Icon name="file-text" size="sm" /> Reports</Link>
          </PanelHead>
          <div className="stat-grid">
            <StatCard tone="gold" icon="rupee" label="Net revenue" value={money(t.netRevenuePaise, { compact: true })} sub={`${money(t.refundedPaise, { compact: true })} refunded`} />
            <StatCard icon="droplet" label="Car wash revenue" value={money(t.washRevenuePaise, { compact: true })} sub={`${t.bookings} bookings · ${t.todayBookings} today`} />
            <StatCard tone="green" icon="store" label="Store revenue" value={money(t.storeRevenuePaise, { compact: true })} sub={`${t.orders} orders · ${t.ordersToShip} to ship`} />
            <StatCard icon="users" label="Customers" value={t.customers} sub={`+${t.newCustomers30d} in the last 30 days`} />
            <StatCard tone="red" icon="clock" label="Awaiting payment" value={t.pendingPayment + t.ordersAwaitingPayment} sub={`${t.pendingPayment} bookings · ${t.ordersAwaitingPayment} orders`} />
            <StatCard icon="credit-card" label="Payment success" value={t.paymentSuccessRate === null ? '-' : `${t.paymentSuccessRate}%`} sub={<Link className="link" to="/admin/payments">View payments</Link>} />
            <StatCard tone="red" icon="package" label="Low stock" value={t.lowStockCount} sub={<Link className="link" to="/admin/products">Manage inventory</Link>} />
            <StatCard tone="gold" icon="star" label="Average rating" value={t.avgRating ?? '-'} sub={`${t.pendingReviews + t.pendingProductReviews} reviews to moderate`} />
          </div>
          <div className="dash-grid">
            <div className="card">
              <div className="card-title"><h3>Revenue - last 14 days</h3><span className="text-small text-muted"><span style={{ color: '#5aa6ff' }}>&#9632;</span> Car wash &nbsp; <span className="text-gold">&#9632;</span> Store</span></div>
              <BarChart data={d.revenueByDay.map((r) => ({ label: formatDateShort(r.date), value: r.washPaise / 100, value2: r.storePaise / 100 }))}
                format={(v) => `₹${Math.round(v).toLocaleString('en-IN')}`} seriesLabels={['Car wash', 'Store']} />
            </div>
            <div className="card">
              <h3>Revenue split</h3>
              <DonutChart center={shortINR(t.netRevenuePaise)} segments={[
                { label: 'Car wash', value: t.washRevenuePaise, color: '#2f8cff', display: money(t.washRevenuePaise, { compact: true }) },
                { label: 'Accessories store', value: t.storeRevenuePaise, color: '#c9a961', display: money(t.storeRevenuePaise, { compact: true }) },
              ]} />
            </div>
          </div>
          <div className="grid grid-2 mt-3">
            <div className="card"><h3>Bookings by status</h3><DonutChart center={String(t.bookings)} segments={d.bookingsByStatus.map((s) => ({ label: statusLabel(s.status), value: s.count, color: BOOKING_COLORS[s.status] }))} /></div>
            <div className="card"><h3>Orders by status</h3><DonutChart center={String(t.orders)} segments={d.ordersByStatus.map((s) => ({ label: ORDER_STATUS_LABELS[s.status], value: s.count, color: ORDER_COLORS[s.status] }))} /></div>
          </div>
          <div className="grid grid-3 mt-3">
            <div className="card"><h3>Top services</h3><BarList rows={d.topServices.map((s) => ({ label: s.name, value: s.bookings, note: `${s.bookings} bookings · ${money(s.revenuePaise, { compact: true })}` }))} /></div>
            <div className="card"><h3>Top products</h3><BarList gold rows={d.topProducts.map((p) => ({ label: p.name, value: p.units, note: `${p.units} sold · ${money(p.revenuePaise, { compact: true })}` }))} /></div>
            <div className="card"><h3>Payment methods</h3><BarList rows={d.paymentMethods.map((m) => ({ label: methodLabel(m.method), value: m.count, note: `${m.count} · ${money(m.amountPaise, { compact: true })}` }))} /></div>
          </div>
          <div className="dash-grid mt-3">
            <div className="card"><h3>Recent activity</h3><ul className="activity mt-2">{d.recentActivity.length ? d.recentActivity.map((a, i) => <Activity key={i} a={a} />) : <li>No activity yet.</li>}</ul></div>
            <div className="card">
              <div className="card-title"><h3>Low-stock alerts</h3><Link className="link text-small" to="/admin/products">Inventory</Link></div>
              {d.lowStock.length ? d.lowStock.map((p) => (
                <div key={p.id} className="mini-item"><Img src={p.image} alt="" /><div><b>{p.name}</b><small className="mono">{p.sku}</small></div>
                  <span className={`badge ${p.stock === 0 ? 'badge-danger' : 'badge-warning'}`}>{p.stock === 0 ? 'Out of stock' : `${p.stock} left`}</span></div>
              )) : <p className="text-muted mb-0">All products are well stocked.</p>}
            </div>
          </div>
        </>
      );
    }}</AsyncView>
  );
}
