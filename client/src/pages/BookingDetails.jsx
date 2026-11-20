/**
 * pages/BookingDetails.jsx - Everything about one wash booking: status timeline, bill,
 * payment attempts (with transaction IDs), refund status and the allowed actions.
 * Customers see their own bookings; admins can open any booking (read-only here).
 */
import { Link, useParams } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, formatDate, formatDateTime, slotText, vehicleLabel, statusLabel, methodLabel, duration } from '../utils/format.js';
import PublicLayout from '../components/PublicLayout.jsx';
import StatusBadge, { PillBadge } from '../components/StatusBadge.jsx';
import BookingActions from '../components/BookingActions.jsx';
import DataTable from '../components/DataTable.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import Icon from '../components/Icon.jsx';

export function PaymentsTable({ payments }) {
  return (
    <DataTable rows={payments} empty={{ icon: 'credit-card', title: 'No payment attempts yet' }} columns={[
      { label: 'Date', render: (p) => formatDateTime(p.createdAt) },
      { label: 'Method', render: (p) => <>{methodLabel(p.method) || '-'}<span className="cell-sub">{p.methodDetail || ''}</span></> },
      { label: 'Transaction', render: (p) => <><span className="mono">{p.paymentRef}</span><span className="cell-sub mono">{p.transactionRef || p.gatewayPaymentId || ''}</span></> },
      { label: 'Status', render: (p) => <><PillBadge value={p.status} />{p.failureReason && <span className="cell-sub">{p.failureReason}</span>}</> },
      { label: 'Amount', num: true, render: (p) => money(p.amountPaise) },
    ]} />
  );
}

export function Timeline({ history, label, failStates = ['cancelled'], goldState = 'completed' }) {
  return (
    <ul className="timeline">{history.map((h, i) => (
      <li key={i} className={failStates.includes(h.toStatus) ? 'cancel' : h.toStatus === goldState ? 'gold' : 'done'}>
        <span className="dot" /><b>{label(h.toStatus)}</b>
        <small>{formatDateTime(h.createdAt)}{h.changedBy ? ` · by ${h.changedByRole === 'admin' ? 'CarZone team' : h.changedBy}` : ''}</small>
        {h.note && <p>{h.note}</p>}
      </li>))}
    </ul>
  );
}

export default function BookingDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useApi(`/api/bookings/${id}`);
  const b = q.data;
  useDocumentTitle(b ? `Booking ${b.code}` : 'Booking');
  const isAdmin = user.role === 'admin';

  let body = <Loader text="Loading booking..." />;
  if (q.error) {
    body = q.error.status === 404
      ? <EmptyState icon="search" title="Booking not found" text="It may belong to another account." action={<Link className="btn btn-primary" to="/dashboard">Go to dashboard</Link>} />
      : <ErrorState error={q.error} onRetry={q.reload} />;
  } else if (b) {
    const bill = b.bill;
    body = (
      <>
        <nav className="breadcrumbs"><Link to={isAdmin ? '/admin/bookings' : '/dashboard/bookings'}>{isAdmin ? 'Admin' : 'Dashboard'}</Link><span>/</span><span>Booking {b.code}</span></nav>
        <div className="flex between flex-wrap mb-3" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="flex flex-wrap mb-2"><StatusBadge status={b.status} /><PillBadge value={b.paymentStatus} /></div>
            <h1 style={{ fontSize: 'clamp(1.8rem,3.4vw,2.5rem)', margin: 0 }}>{b.service.name}</h1>
            <p className="text-muted mb-0">Booking <span className="mono text-gold">{b.code}</span> · created {formatDateTime(b.createdAt)}</p>
          </div>
          <div className="flex flex-wrap">
            {isAdmin ? (b.actions.invoice && <a className="btn btn-dark btn-sm" href={`/api/bookings/${b.id}/invoice`} target="_blank" rel="noopener noreferrer"><Icon name="receipt" size="sm" /> Invoice</a>)
              : <BookingActions booking={b} showView={false} onChanged={q.reload} />}
          </div>
        </div>
        <div className="detail-layout">
          <div className="stack">
            <div className="grid grid-2">
              <div className="card card-sm"><h4><Icon name="calendar" size="sm" /> Schedule</h4>
                <dl className="kv"><dt>Date</dt><dd>{formatDate(b.bookingDate)}</dd><dt>Time</dt><dd>{slotText(b.slot)}</dd>
                  <dt>Duration</dt><dd>{duration(b.service.durationMinutes)}</dd><dt>Rescheduled</dt><dd>{b.rescheduleCount} time(s)</dd></dl></div>
              <div className="card card-sm"><h4><Icon name={b.vehicle.type === 'bike' ? 'bike' : 'car'} size="sm" /> Vehicle</h4>
                <dl className="kv"><dt>Vehicle</dt><dd>{b.vehicle.brand} {b.vehicle.model}</dd><dt>Type</dt><dd>{vehicleLabel(b.vehicle.type)}</dd>
                  <dt>Registration</dt><dd><span className="plate">{b.vehicle.registrationNo}</span></dd></dl></div>
            </div>
            <div className="card card-sm"><h4><Icon name="map-pin" size="sm" /> {b.pickupDrop ? 'Pickup & drop address' : 'Customer address'}</h4>
              <p className="mb-0">{b.address}</p>
              {b.instructions && <p className="mt-2 mb-0 text-small"><b>Instructions:</b> {b.instructions}</p>}
              {isAdmin && <p className="mt-2 mb-0 text-small text-muted">Customer: {b.customer.name} · {b.customer.email} · {b.customer.phone || ''}</p>}
            </div>
            <div className="card"><h3>Status timeline</h3><Timeline history={b.history} label={statusLabel} /></div>
            <div className="card"><h3>Payments</h3><PaymentsTable payments={b.payments} /></div>
          </div>
          <aside className="stack sticky">
            <div className="card card-glass"><span className="eyebrow">Bill</span>
              <div className="bill-lines">
                <div className="bill-line"><span>{b.service.name}</span><span>{money(bill.basePricePaise)}</span></div>
                {b.addons.map((a) => <div className="bill-line" key={a.id}><span>+ {a.name}</span><span>{money(a.pricePaise)}</span></div>)}
                {bill.pickupFeePaise > 0 && <div className="bill-line"><span>Pickup &amp; drop</span><span>{money(bill.pickupFeePaise)}</span></div>}
                {bill.discountPaise > 0 && <div className="bill-line discount"><span>Discount ({bill.couponCode})</span><span>- {money(bill.discountPaise)}</span></div>}
                <div className="bill-line"><span>GST</span><span>{money(bill.taxPaise)}</span></div>
                <div className="bill-line total"><span>Total</span><span>{money(bill.totalPaise)}</span></div>
              </div>
            </div>
            {b.status === 'cancelled' && (
              <div className="card card-sm"><h4><Icon name="x-circle" size="sm" /> Cancellation</h4>
                <p className="text-small mb-1">Cancelled by {b.cancelledBy} on {formatDateTime(b.cancelledAt)}</p><p className="text-small text-muted">{b.cancelReason}</p>
                {b.refund ? (
                  <div className={`alert ${b.refund.status === 'processed' ? 'alert-success' : 'alert-warning'}`}><Icon name={b.refund.status === 'processed' ? 'check-circle' : 'clock'} />
                    <p><b>{b.refund.percent}% refund - {money(b.refund.amountPaise)}</b><br />{b.refund.status === 'processed' ? `Refunded (ref ${b.refund.ref})` : 'Refund pending - processed within 5-7 working days'}</p></div>
                ) : <p className="text-small mb-0">No payment was made, so no refund applies.</p>}
              </div>
            )}
            {b.review && <div className="card card-sm"><h4><Icon name="star" size="sm" /> Review</h4><p className="mb-0 text-small">{b.review.rating}/5 · <PillBadge value={b.review.status} /></p></div>}
          </aside>
        </div>
      </>
    );
  }
  return <PublicLayout solid glow><main className="container" style={{ paddingTop: 'calc(var(--header-h) + 30px)', paddingBottom: 60 }}>{body}</main></PublicLayout>;
}
