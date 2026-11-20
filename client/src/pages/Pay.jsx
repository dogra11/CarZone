/**
 * pages/Pay.jsx - Payment page for a wash booking (/pay/booking/:id) or a store order
 * (/pay/order/:id). It shows WHAT is being paid for and hands the actual payment to
 * <PaymentCheckout>. The amount shown comes from the server record; the server decides
 * the amount again when the payment session is created.
 */
import { Link, useNavigate, useParams } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, formatDate, slotText, vehicleLabel } from '../utils/format.js';
import PublicLayout from '../components/PublicLayout.jsx';
import PaymentCheckout from '../components/PaymentCheckout.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import Icon from '../components/Icon.jsx';
import Img from '../components/Img.jsx';

export default function Pay() {
  const { purpose, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isBooking = purpose === 'booking';
  const q = useApi(isBooking ? `/api/bookings/${id}` : purpose === 'order' ? `/api/orders/${id}` : null, { skip: !['booking', 'order'].includes(purpose) });
  useDocumentTitle('Secure payment');
  const t = q.data;
  const amount = t ? (isBooking ? t.bill.totalPaise : t.totals.totalPaise) : 0;
  const payable = t && t.actions.pay;

  let body;
  if (!['booking', 'order'].includes(purpose)) body = <EmptyState icon="search" title="Nothing to pay for" action={<Link className="btn btn-primary" to="/dashboard">Go to dashboard</Link>} />;
  else if (q.loading) body = <Loader text="Preparing secure checkout..." />;
  else if (q.error) body = q.error.status === 404 ? <EmptyState icon="search" title="Not found" text="It may belong to another account." action={<Link className="btn btn-primary" to="/dashboard">Go to dashboard</Link>} /> : <ErrorState error={q.error} onRetry={q.reload} />;
  else if (!payable) {
    body = (
      <EmptyState icon={t.status === 'cancelled' ? 'x-circle' : 'check-circle'} title={t.status === 'cancelled' ? `This ${purpose} was cancelled` : 'Nothing to pay'}
        text={t.status === 'cancelled' ? 'Cancelled bookings and orders cannot be paid.' : `${t.code} is already paid or does not need an online payment.`}
        action={<Link className="btn btn-primary" to={isBooking ? `/bookings/${t.id}` : `/orders/${t.id}`}>View details</Link>} />
    );
  } else {
    body = (
      <div className="pay-layout">
        <div className="card">
          <div className="flex between flex-wrap mb-3"><h3 className="mb-0"><Icon name="lock" /> Secure payment</h3><span className="badge badge-success"><Icon name="shield" size="sm" /> 256-bit TLS</span></div>
          <PaymentCheckout purpose={purpose} targetId={t.id} amountPaise={amount} customer={user}
            onSuccess={() => setTimeout(() => navigate(`/confirmation/${purpose}/${t.id}`, { replace: true }), 900)} />
        </div>
        <aside className="card card-glass sticky">
          <span className="eyebrow">{isBooking ? 'Wash booking' : 'Store order'}</span>
          <div className="booking-code" style={{ fontSize: '1.3rem', margin: '6px 0 14px' }}>{t.code}</div>
          {isBooking ? (
            <>
              <div className="service-thumb"><Img src={t.service.image} alt="" /><div><b>{t.service.name}</b><div className="text-small text-muted">{t.vehicle.brand} {t.vehicle.model} · {vehicleLabel(t.vehicle.type)}</div></div></div>
              <dl className="kv mt-2"><dt>Date</dt><dd>{formatDate(t.bookingDate)}</dd><dt>Time</dt><dd>{slotText(t.slot)}</dd></dl>
              <div className="bill-lines">
                <div className="bill-line"><span>Subtotal</span><span>{money(t.bill.subtotalPaise)}</span></div>
                {t.bill.discountPaise > 0 && <div className="bill-line discount"><span>Discount ({t.bill.couponCode})</span><span>- {money(t.bill.discountPaise)}</span></div>}
                <div className="bill-line"><span>GST</span><span>{money(t.bill.taxPaise)}</span></div>
                <div className="bill-line total"><span>Amount payable</span><span>{money(amount)}</span></div>
              </div>
            </>
          ) : (
            <>
              <div className="mini-items">{t.items.map((i) => (
                <div className="mini-item" key={i.productId}><Img src={i.image} alt="" /><div><b>{i.name}</b><small>Qty {i.quantity}</small></div><span>{money(i.lineTotalPaise)}</span></div>))}</div>
              <div className="bill-lines">
                <div className="bill-line"><span>Items</span><span>{money(t.totals.subtotalPaise)}</span></div>
                {t.totals.discountPaise > 0 && <div className="bill-line discount"><span>Discount ({t.totals.couponCode})</span><span>- {money(t.totals.discountPaise)}</span></div>}
                {t.totals.fitmentPaise > 0 && <div className="bill-line"><span>Fitment</span><span>{money(t.totals.fitmentPaise)}</span></div>}
                <div className="bill-line"><span>Shipping</span><span>{t.totals.shippingPaise ? money(t.totals.shippingPaise) : 'Free'}</span></div>
                <div className="bill-line total"><span>Amount payable</span><span>{money(amount)}</span></div>
                <div className="text-small text-muted">Includes GST of {money(t.totals.gstIncludedPaise)}</div>
              </div>
            </>
          )}
          <p className="text-small text-muted mt-3 mb-0"><Icon name="info" size="sm" /> Card numbers and CVV are never stored by CarZone.</p>
        </aside>
      </div>
    );
  }

  return (
    <PublicLayout solid glow>
      <main className="container" style={{ paddingTop: 'calc(var(--header-h) + 36px)', paddingBottom: 60 }}>
        <div className="section-head mb-3"><span className="eyebrow">Checkout</span><h1 style={{ fontSize: 'clamp(1.9rem,4vw,2.6rem)' }}>Complete your payment</h1></div>
        {body}
      </main>
    </PublicLayout>
  );
}
