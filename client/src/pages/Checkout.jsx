/**
 * pages/Checkout.jsx - Store checkout: delivery address, coupon, optional fitment slot
 * at the CarZone centre, payment method (online or cash on delivery) and a live summary
 * calculated by the SERVER (POST /api/orders/quote).
 * "Place order" calls POST /api/orders - stock is reserved in that transaction. COD orders
 * are placed immediately; online orders continue to the payment page.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from '../router/index.jsx';
import { api } from '../services/api.js';
import { useApi } from '../hooks/useApi.js';
import { useMeta } from '../hooks/useMeta.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useCart } from '../context/CartContext.jsx';
import { money, time12, shiftDays } from '../utils/format.js';
import { schemas, INDIAN_STATES, PAYMENT_METHOD_LABELS } from '../utils/shared.js';
import PublicLayout from '../components/PublicLayout.jsx';
import FormModal from '../components/FormModal.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import Img from '../components/Img.jsx';

export const ADDRESS_FIELDS = [
  { name: 'label', label: 'Label', placeholder: 'Home / Office' },
  { name: 'fullName', label: 'Full name' },
  { name: 'phone', label: 'Mobile number' },
  { name: 'pincode', label: 'PIN code' },
  { name: 'line1', label: 'Address line 1', span: 2, placeholder: 'Flat, building, street' },
  { name: 'line2', label: 'Address line 2 (optional)', span: 2, placeholder: 'Area, landmark' },
  { name: 'city', label: 'City' },
  { name: 'state', label: 'State', type: 'select', options: INDIAN_STATES.map((s) => ({ value: s, label: s })) },
  { name: 'isDefault', label: 'Default', type: 'switch', text: 'Make this my default address', span: 2 },
];

export default function Checkout() {
  useDocumentTitle('Checkout');
  const navigate = useNavigate();
  const toast = useToast();
  const meta = useMeta();
  const { cart, refresh } = useCart();
  const addresses = useApi('/api/me/addresses');
  const [addressId, setAddressId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState('');
  const [fitment, setFitment] = useState(false);
  const [fitDate, setFitDate] = useState(shiftDays(3));
  const [slots, setSlots] = useState(null);
  const [slotId, setSlotId] = useState(null);
  const [method, setMethod] = useState('upi');
  const [quote, setQuote] = useState(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (addresses.data?.length && !addressId) setAddressId((addresses.data.find((a) => a.isDefault) || addresses.data[0]).id);
  }, [addresses.data, addressId]);

  // Server-side quote whenever coupon / fitment changes (PRICE CALCULATION on the server).
  useEffect(() => {
    if (!cart?.items?.length) return;
    api.post('/api/orders/quote', { ...(coupon ? { couponCode: coupon } : {}), fitment })
      .then((q) => { setQuote(q); if (q.coupon && !q.coupon.valid) setCoupon(''); })
      .catch((err) => toast.error(err.message));
  }, [coupon, fitment, cart, toast]);

  useEffect(() => {
    if (!fitment) return;
    setSlots(null);
    setSlotId(null);
    api.get(`/api/slots?date=${fitDate}`).then((d) => setSlots(d.slots)).catch((e) => setSlots({ error: e.message }));
  }, [fitment, fitDate]);

  const placeOrder = async () => {
    if (!addressId) { toast.warning('Please add a delivery address.'); return; }
    if (fitment && !slotId) { toast.warning('Choose a fitment slot or turn fitment off.'); return; }
    setPlacing(true);
    try {
      const r = await api.post('/api/orders', {
        addressId, paymentMethod: method, ...(coupon ? { couponCode: coupon } : {}),
        fitment, ...(fitment ? { fitmentDate: fitDate, fitmentSlotId: slotId } : {}),
      });
      await refresh();
      toast.success(r.message, `Order ${r.order.code}`);
      navigate(r.order.status === 'placed' ? `/confirmation/order/${r.order.id}` : `/pay/order/${r.order.id}`);
    } catch (err) {
      toast.error(err.message, 'Order not placed');
      setPlacing(false);
    }
  };

  let body;
  if (!cart) body = <Loader text="Loading your cart..." />;
  else if (!cart.items.length) body = <EmptyState icon="cart" title="Your cart is empty" action={<Link className="btn btn-primary" to="/shop">Go to the shop</Link>} />;
  else if (addresses.error) body = <ErrorState error={addresses.error} onRetry={addresses.reload} />;
  else {
    const t = quote?.totals;
    body = (
      <div className="wizard">
        <div className="stack">
          <div className="card">
            <div className="card-title"><h3>1. Delivery address</h3><button className="btn btn-ghost btn-sm" onClick={() => setAddOpen(true)}><Icon name="plus" size="sm" /> New address</button></div>
            {!addresses.data ? <Loader /> : addresses.data.length === 0 ? <EmptyState icon="map-pin" title="No saved address" text="Add where we should deliver your order." action={<button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>Add address</button>} /> : (
              <div className="vehicle-saved">{addresses.data.map((a) => (
                <label className="choice" key={a.id}><input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                  <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><span className="choice-title">{a.label}{a.isDefault ? ' · default' : ''}</span>
                    <span className="choice-sub">{a.fullName}, {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.pincode}</span></span></label>))}</div>
            )}
          </div>
          {quote?.fitmentAllowed && (
            <div className="card">
              <h3>2. Fitment at CarZone centre <span className="badge badge-blue no-dot">Optional</span></h3>
              <label className="switch"><input type="checkbox" checked={fitment} onChange={(e) => setFitment(e.target.checked)} /><span className="track" />
                <span><b>Install my accessories at the centre</b><br /><span className="text-small text-muted">Flat {money(meta?.rules.fitmentFeePaise ?? 29900, { compact: true })} - uses the same live slots as our wash bays.</span></span></label>
              {fitment && (
                <div className="mt-3">
                  <FormField label="Fitment date" type="date" value={fitDate} min={shiftDays(2)} max={meta?.lastBookableDate} onChange={(e) => setFitDate(e.target.value)} />
                  {!slots ? <Loader text="Checking slots..." /> : slots.error ? <div className="alert alert-danger"><Icon name="alert" /><p>{slots.error}</p></div> : (
                    <div className="slot-grid mt-2">{slots.map((s) => (
                      <label className="choice" key={s.id}><input type="radio" name="fitslot" disabled={!s.available} checked={slotId === s.id} onChange={() => setSlotId(s.id)} />
                        <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><span className="choice-title">{time12(s.startTime)}</span>
                          <span className={`slot-left ${s.remaining <= 1 ? 'low' : ''}`}>{s.isBlocked ? 'Closed' : s.remaining ? `${s.remaining} bays free` : 'Full'}</span></span></label>))}</div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="card">
            <h3>{quote?.fitmentAllowed ? '3' : '2'}. Payment method</h3>
            <div className="choice-grid">{['upi', 'card', 'netbanking', 'wallet', 'cod'].map((m) => (
              <label className="choice" key={m}><input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><Icon name={{ upi: 'smartphone', card: 'credit-card', netbanking: 'bank', wallet: 'wallet', cod: 'rupee' }[m]} />
                  <span className="choice-title">{PAYMENT_METHOD_LABELS[m]}</span>{m === 'cod' && <span className="choice-sub">Pay when it arrives</span>}</span></label>))}</div>
            <p className="text-small text-muted mt-2 mb-0">{method === 'cod' ? 'Your order is placed immediately - pay the courier in cash or UPI on delivery.' : 'You will complete a secure payment on the next screen. The order is placed once the payment is verified.'}</p>
          </div>
        </div>
        <aside className="sticky">
          <div className="card card-glass summary-card">
            <span className="eyebrow">Order summary</span>
            <div className="mini-items">{cart.items.map((i) => (
              <div key={i.productId} className="flex"><Img src={i.product.image} alt="" /><span className="text-small">{i.quantity} x {i.product.name}</span><b className="text-small" style={{ marginLeft: 'auto' }}>{money(i.lineTotalPaise)}</b></div>))}</div>
            <hr className="divider" />
            {t ? (
              <div className="bill-lines">
                <div className="bill-line"><span>Subtotal</span><span>{money(t.subtotalPaise)}</span></div>
                {t.discountPaise > 0 && <div className="bill-line discount"><span>Coupon ({t.couponCode})</span><span>- {money(t.discountPaise)}</span></div>}
                <div className="bill-line"><span>Shipping</span><span>{t.shippingPaise ? money(t.shippingPaise) : 'Free'}</span></div>
                {t.fitmentPaise > 0 && <div className="bill-line"><span>Fitment</span><span>{money(t.fitmentPaise)}</span></div>}
                <div className="bill-line total"><span>Total</span><span>{money(t.totalPaise)}</span></div>
                <div className="bill-line text-small"><span>Includes GST</span><span>{money(t.gstIncludedPaise)}</span></div>
              </div>
            ) : <Loader />}
            <hr className="divider" />
            <label className="label" htmlFor="coupon">Coupon code</label>
            <div className="coupon-row mt-1">
              <input id="coupon" className="input" placeholder="GEAR10" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} />
              <button className="btn btn-dark" onClick={() => setCoupon(couponInput.trim())}>Apply</button>
            </div>
            {quote?.coupon && <div className={`coupon-msg ${quote.coupon.valid ? 'ok' : 'bad'}`}>{quote.coupon.message}</div>}
            <button className={`btn btn-primary btn-lg btn-block mt-3 ${placing ? 'is-loading' : ''}`} disabled={placing || !t} onClick={placeOrder}>
              {method === 'cod' ? 'Place order (COD)' : `Continue to pay ${t ? money(t.totalPaise) : ''}`}
            </button>
          </div>
        </aside>
        {addOpen && <FormModal title="Add delivery address" fields={ADDRESS_FIELDS} schema={schemas.address} initial={{ label: 'Home', state: 'Maharashtra', isDefault: false }}
          onClose={() => setAddOpen(false)} onSubmit={async (data) => { const r = await api.post('/api/me/addresses', data); toast.success(r.message); setAddressId(r.address.id); addresses.reload(); }} />}
      </div>
    );
  }
  return (
    <PublicLayout solid glow>
      <main className="container" style={{ paddingTop: 'calc(var(--header-h) + 36px)', paddingBottom: 60 }}>
        <div className="section-head mb-3"><span className="eyebrow">Secure checkout</span><h1 style={{ fontSize: 'clamp(2rem,4vw,2.8rem)' }}>Checkout</h1></div>
        {body}
      </main>
    </PublicLayout>
  );
}
