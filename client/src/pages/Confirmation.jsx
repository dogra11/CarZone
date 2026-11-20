/**
 * pages/Confirmation.jsx - "You're all set" screen after paying (or after placing a COD
 * order). Shows the booking / order ID and links to details and the GST invoice.
 */
import { Link, useParams } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { money, formatDate, slotText, vehicleLabel } from '../utils/format.js';
import PublicLayout from '../components/PublicLayout.jsx';
import { ErrorState } from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import Icon from '../components/Icon.jsx';

export default function Confirmation() {
  const { purpose, id } = useParams();
  const isBooking = purpose === 'booking';
  const q = useApi(isBooking ? `/api/bookings/${id}` : `/api/orders/${id}`);
  useDocumentTitle('Confirmation');
  const t = q.data;

  let body = <Loader />;
  if (q.error) body = <ErrorState error={q.error} onRetry={q.reload} />;
  else if (t) {
    const done = isBooking ? t.paymentStatus === 'paid' : t.status !== 'pending_payment' && t.status !== 'cancelled';
    const cod = !isBooking && t.paymentMethod === 'cod';
    const detailUrl = isBooking ? `/bookings/${t.id}` : `/orders/${t.id}`;
    const invoiceUrl = isBooking ? `/api/bookings/${t.id}/invoice` : `/api/orders/${t.id}/invoice`;
    body = (
      <div className="confirm-wrap">
        <div className="success-mark"><Icon name={done ? 'check' : 'clock'} /></div>
        <span className="eyebrow">{isBooking ? (done ? 'Booking confirmed' : 'Booking reserved') : (done ? 'Order placed' : 'Awaiting payment')}</span>
        <h1 style={{ fontSize: 'clamp(2rem,4vw,2.8rem)' }}>{done ? 'You are all set!' : 'Almost there'}</h1>
        <p className="lead" style={{ margin: '0 auto' }}>
          {!done ? 'Complete the payment to confirm it.' : isBooking ? 'Your slot is confirmed. Everything is saved in your dashboard - see you soon.'
            : cod ? 'Your order is confirmed. Please keep the exact amount ready - pay in cash or UPI when it is delivered.' : 'Payment received. We will pack and ship your order shortly.'}
        </p>
        <div className="booking-code">{t.code}</div>
        <div className="card" style={{ textAlign: 'left' }}>
          {isBooking ? (
            <div className="grid grid-2">
              <dl className="kv"><dt>Service</dt><dd>{t.service.name}</dd><dt>Vehicle</dt><dd>{t.vehicle.brand} {t.vehicle.model}</dd><dt>Type</dt><dd>{vehicleLabel(t.vehicle.type)}</dd></dl>
              <dl className="kv"><dt>Date</dt><dd>{formatDate(t.bookingDate)}</dd><dt>Time</dt><dd>{slotText(t.slot)}</dd><dt>{done ? 'Paid' : 'Amount due'}</dt><dd><b>{money(t.bill.totalPaise)}</b></dd></dl>
            </div>
          ) : (
            <div className="grid grid-2">
              <dl className="kv"><dt>Items</dt><dd>{t.items.length} product(s), {t.items.reduce((n, i) => n + i.quantity, 0)} unit(s)</dd><dt>Payment</dt><dd>{t.paymentMethodLabel}</dd><dt>Total</dt><dd><b>{money(t.totals.totalPaise)}</b></dd></dl>
              <dl className="kv"><dt>Deliver to</dt><dd>{t.shipping.name}, {t.shipping.city} {t.shipping.pincode}</dd>
                {t.fitment && <><dt>Fitment</dt><dd>{formatDate(t.fitment.date)}, {slotText(t.fitment)}</dd></>}</dl>
            </div>
          )}
          {isBooking && t.pickupDrop && <div className="alert alert-info mt-3"><Icon name="truck" /><p>Our driver will call 15 minutes before pickup at: {t.address}</p></div>}
        </div>
        <div className="flex flex-wrap mt-4" style={{ justifyContent: 'center' }}>
          {done && t.actions.invoice && <a className="btn btn-gold" href={invoiceUrl} target="_blank" rel="noopener noreferrer"><Icon name="receipt" size="sm" /> View invoice</a>}
          {!done && t.actions.pay && <Link className="btn btn-primary" to={`/pay/${purpose}/${t.id}`}><Icon name="credit-card" size="sm" /> Pay now</Link>}
          <Link className="btn btn-ghost" to={detailUrl}>{isBooking ? 'Booking details' : 'Track order'}</Link>
          <Link className="btn btn-ghost" to={isBooking ? '/dashboard/bookings' : '/shop'}>{isBooking ? 'My bookings' : 'Continue shopping'}</Link>
        </div>
      </div>
    );
  }
  return <PublicLayout solid glow><main className="container" style={{ paddingTop: 'calc(var(--header-h) + 40px)', paddingBottom: 70 }}>{body}</main></PublicLayout>;
}
