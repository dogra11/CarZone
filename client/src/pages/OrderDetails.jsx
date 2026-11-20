/**
 * pages/OrderDetails.jsx - Order tracking page: the PLACED -> PACKED -> SHIPPED ->
 * OUT FOR DELIVERY -> DELIVERED tracker, items (with "Write a review" for verified
 * buyers), delivery address, fitment appointment, payments, refunds and actions.
 */
import { useState } from 'react';
import { Link, useParams } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, formatDate, formatDateTime, slotText } from '../utils/format.js';
import { ORDER_FLOW, ORDER_STATUS_LABELS } from '../utils/shared.js';
import PublicLayout from '../components/PublicLayout.jsx';
import { OrderBadge, PillBadge } from '../components/StatusBadge.jsx';
import OrderActions from '../components/OrderActions.jsx';
import { ReviewDialog } from '../components/BookingActions.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import Icon from '../components/Icon.jsx';
import Img from '../components/Img.jsx';
import { PaymentsTable, Timeline } from './BookingDetails.jsx';

const FLOW_ICONS = { placed: 'receipt', packed: 'package', shipped: 'truck', out_for_delivery: 'map-pin', delivered: 'check-circle' };

/** Horizontal tracker: steps up to the current status are "done". */
export function OrderTracker({ order }) {
  const reached = new Set(order.history.map((h) => h.toStatus));
  const idx = ORDER_FLOW.indexOf(order.status);
  const stoppedAt = order.status === 'cancelled' ? Math.max(...ORDER_FLOW.map((s, i) => (reached.has(s) ? i : -1))) : -2;
  return (
    <div className={`tracker ${order.status === 'cancelled' ? 'is-cancelled' : ''}`}>
      {ORDER_FLOW.map((s, i) => {
        const done = idx >= i || ['return_requested', 'returned'].includes(order.status) || (stoppedAt >= i);
        const when = order.history.find((h) => h.toStatus === s);
        return (
          <div key={s} className={`track-step ${done ? 'done' : ''} ${idx === i ? 'current' : ''}`}>
            <span className="track-dot"><Icon name={FLOW_ICONS[s]} size="sm" /></span>
            <b>{ORDER_STATUS_LABELS[s]}</b>
            <small>{when ? formatDateTime(when.createdAt) : ''}</small>
          </div>
        );
      })}
    </div>
  );
}

export default function OrderDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useApi(`/api/orders/${id}`);
  const [reviewing, setReviewing] = useState(null);
  const o = q.data;
  useDocumentTitle(o ? `Order ${o.code}` : 'Order');
  const isAdmin = user.role === 'admin';

  let body = <Loader text="Loading order..." />;
  if (q.error) {
    body = q.error.status === 404
      ? <EmptyState icon="search" title="Order not found" text="It may belong to another account." action={<Link className="btn btn-primary" to="/dashboard/orders">My orders</Link>} />
      : <ErrorState error={q.error} onRetry={q.reload} />;
  } else if (o) {
    const t = o.totals;
    const refunds = o.payments.filter((p) => p.refund);
    body = (
      <>
        <nav className="breadcrumbs"><Link to={isAdmin ? '/admin/orders' : '/dashboard/orders'}>{isAdmin ? 'Admin' : 'My orders'}</Link><span>/</span><span>Order {o.code}</span></nav>
        <div className="flex between flex-wrap mb-3" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="flex flex-wrap mb-2"><OrderBadge status={o.status} /><PillBadge value={o.paymentMethod === 'cod' && o.paymentStatus !== 'success' ? 'cod' : o.paymentStatus} /></div>
            <h1 style={{ fontSize: 'clamp(1.8rem,3.4vw,2.5rem)', margin: 0 }}>Order <span className="text-metal">{o.code}</span></h1>
            <p className="text-muted mb-0">Placed {formatDateTime(o.createdAt)} · {o.paymentMethodLabel}</p>
          </div>
          <div className="flex flex-wrap">
            {isAdmin ? (o.actions.invoice && <a className="btn btn-dark btn-sm" href={`/api/orders/${o.id}/invoice`} target="_blank" rel="noopener noreferrer"><Icon name="receipt" size="sm" /> Invoice</a>)
              : <OrderActions order={o} showView={false} onChanged={q.reload} />}
          </div>
        </div>
        <div className="detail-layout">
          <div className="stack">
            <div className="card">
              <h3>Tracking</h3>
              {o.status === 'pending_payment' ? <div className="alert alert-warning"><Icon name="clock" /><p>Waiting for payment. The order is processed once it is paid.</p></div> : <OrderTracker order={o} />}
              {o.status === 'cancelled' && <div className="alert alert-danger mt-3"><Icon name="x-circle" /><p><b>Order cancelled.</b> {o.cancelReason}</p></div>}
              {['return_requested', 'returned'].includes(o.status) && <div className="alert alert-warning mt-3"><Icon name="refresh" /><p><b>{ORDER_STATUS_LABELS[o.status]}.</b> {o.returnReason}</p></div>}
            </div>
            <div className="card">
              <h3>Items</h3>
              <div className="order-items">{o.items.map((i) => (
                <div className="cart-item" key={i.productId}>
                  <Link to={`/shop/${i.slug}`}><Img src={i.image} alt={i.name} /></Link>
                  <div>
                    <Link className="cart-name" to={`/shop/${i.slug}`}>{i.name}</Link>
                    <div className="text-small text-muted">SKU {i.sku} · {money(i.unitPricePaise)} × {i.quantity}</div>
                    {i.canReview && <button className="btn btn-gold btn-sm mt-1" onClick={() => setReviewing(i)}><Icon name="star" size="sm" /> Write a review</button>}
                  </div>
                  <div className="cart-price"><b>{money(i.lineTotalPaise)}</b></div>
                </div>))}
              </div>
            </div>
            <div className="card"><h3>Order history</h3><Timeline history={o.history} label={(s) => ORDER_STATUS_LABELS[s] || s} failStates={['cancelled', 'returned']} goldState="delivered" /></div>
            <div className="card"><h3>Payments</h3><PaymentsTable payments={o.payments} /></div>
          </div>
          <aside className="stack sticky">
            <div className="card card-glass"><span className="eyebrow">Summary</span>
              <div className="bill-lines">
                <div className="bill-line"><span>Items ({o.itemCount})</span><span>{money(t.subtotalPaise)}</span></div>
                {t.discountPaise > 0 && <div className="bill-line discount"><span>Discount ({t.couponCode})</span><span>- {money(t.discountPaise)}</span></div>}
                {t.fitmentPaise > 0 && <div className="bill-line"><span>Fitment at CarZone</span><span>{money(t.fitmentPaise)}</span></div>}
                <div className="bill-line"><span>Shipping</span><span>{t.shippingPaise ? money(t.shippingPaise) : 'Free'}</span></div>
                <div className="bill-line total"><span>Total</span><span>{money(t.totalPaise)}</span></div>
                <div className="text-small text-muted">Prices include GST of {money(t.gstIncludedPaise)}</div>
              </div>
            </div>
            <div className="card card-sm"><h4><Icon name="map-pin" size="sm" /> Delivery address</h4>
              <p className="mb-0 text-small"><b>{o.shipping.name}</b> · {o.shipping.phone}<br />{o.shipping.line1}{o.shipping.line2 ? `, ${o.shipping.line2}` : ''}<br />{o.shipping.city}, {o.shipping.state} {o.shipping.pincode}</p>
              {isAdmin && <p className="mt-2 mb-0 text-small text-muted">Customer: {o.customer.name} · {o.customer.email}</p>}
            </div>
            {o.fitment && <div className="card card-sm"><h4><Icon name="settings" size="sm" /> Fitment appointment</h4><p className="mb-0 text-small">{formatDate(o.fitment.date)}<br />{slotText(o.fitment)} at the CarZone centre</p></div>}
            {refunds.map((p) => (
              <div key={p.id} className={`alert ${p.refund.status === 'processed' ? 'alert-success' : 'alert-warning'}`}><Icon name={p.refund.status === 'processed' ? 'check-circle' : 'clock'} />
                <p><b>Refund {money(p.refund.amountPaise)}</b><br />{p.refund.status === 'processed' ? `Refunded (ref ${p.refund.ref})` : p.refund.manual ? 'Pending - cash/bank refund by our team' : 'Pending - processed within 5-7 working days'}</p></div>))}
          </aside>
        </div>
        {reviewing && <ReviewDialog title={`Review ${reviewing.name}`} url={`/api/store/products/${reviewing.productId}/reviews`} onClose={() => setReviewing(null)} onDone={q.reload} />}
      </>
    );
  }
  return <PublicLayout solid glow><main className="container" style={{ paddingTop: 'calc(var(--header-h) + 30px)', paddingBottom: 60 }}>{body}</main></PublicLayout>;
}
