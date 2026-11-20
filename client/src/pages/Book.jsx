/**
 * pages/Book.jsx - The 5-step wash booking wizard.
 *   1 Vehicle -> 2 Service & add-ons -> 3 Date & slot -> 4 Pickup & address -> 5 Review
 *
 * - All choices live in one `state` object (useState).
 * - Every change triggers POST /api/bookings/quote, so the bill on screen is always
 *   calculated by the same server-side pricing engine that saves the booking.
 * - Slots come from GET /api/slots?date=..., showing live remaining capacity.
 * - "Confirm & pay" creates the booking (pending payment) and opens the payment page.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from '../router/index.jsx';
import { api } from '../services/api.js';
import { useApi } from '../hooks/useApi.js';
import { useMeta } from '../hooks/useMeta.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, duration, time12, formatDate, isoDate, vehicleLabel } from '../utils/format.js';
import { VEHICLE_TYPES, VEHICLE_BRANDS, validate, schemas } from '../utils/shared.js';
import PublicLayout from '../components/PublicLayout.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import Img from '../components/Img.jsx';

const STEPS = ['Vehicle', 'Service', 'Date & slot', 'Details', 'Review'];
const STEP_FIELDS = { 1: ['vehicleType', 'brand', 'model', 'registrationNo'], 2: ['serviceId'], 3: ['bookingDate', 'timeSlotId'], 4: ['address', 'instructions'] };
const FIELD_STEP = { vehicleType: 1, brand: 1, model: 1, registrationNo: 1, vehicleId: 1, serviceId: 2, addonIds: 2, bookingDate: 3, timeSlotId: 3, pickupDrop: 4, address: 4, instructions: 4, couponCode: 5 };
const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

export default function Book() {
  useDocumentTitle('Book a wash');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const meta = useMeta();
  const services = useApi('/api/services');
  const vehicles = useApi('/api/me/vehicles');
  const offers = useApi('/api/offers?scope=wash');

  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [s, setS] = useState({
    vehicleId: null, vehicleType: params.get('vehicle') || '', brand: '', model: '', registrationNo: '', saveVehicle: true,
    serviceId: null, addonIds: [], bookingDate: '', timeSlotId: null, pickupDrop: false,
    address: [user?.address, user?.city, user?.pincode].filter(Boolean).join(', '), instructions: '', couponCode: '',
  });
  const [couponInput, setCouponInput] = useState('');
  const [quote, setQuote] = useState(null);
  const [slots, setSlots] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (patch) => setS((x) => ({ ...x, ...patch }));

  const service = useMemo(() => services.data?.find((x) => x.id === s.serviceId), [services.data, s.serviceId]);

  // Defaults once data arrives: first saved vehicle, pre-selected service from ?service=
  useEffect(() => {
    if (!services.data || !vehicles.data) return;
    setS((x) => {
      if (x.vehicleType) return x;
      const pre = services.data.find((sv) => sv.slug === params.get('service'));
      const v = vehicles.data.find((x) => x.vehicleType !== 'bike') || vehicles.data[0];
      const type = v ? v.vehicleType : (pre && pre.prices.sedan === undefined ? Object.keys(pre.prices)[0] : 'sedan');
      return { ...x, vehicleId: v?.id ?? null, vehicleType: type, serviceId: pre && pre.prices[type] !== undefined ? pre.id : null };
    });
  }, [services.data, vehicles.data, params]);

  // Live quote - PRICE CALCULATION happens on the server.
  useEffect(() => {
    if (!s.serviceId || !s.vehicleType) { setQuote(null); return undefined; }
    const t = setTimeout(() => {
      api.post('/api/bookings/quote', { serviceId: s.serviceId, vehicleType: s.vehicleType, addonIds: s.addonIds, pickupDrop: s.pickupDrop, ...(s.couponCode ? { couponCode: s.couponCode } : {}) })
        .then((q) => { setQuote(q); if (q.coupon && !q.coupon.valid) set({ couponCode: '' }); })
        .catch((err) => setQuote({ error: err.message }));
    }, 200);
    return () => clearTimeout(t);
  }, [s.serviceId, s.vehicleType, s.addonIds, s.pickupDrop, s.couponCode]);

  // Live slot availability for the chosen date.
  useEffect(() => {
    if (!s.bookingDate) return undefined;
    let cancelled = false;
    setSlots(null);
    api.get(`/api/slots?date=${s.bookingDate}`).then((d) => !cancelled && setSlots(d.slots)).catch((e) => !cancelled && setSlots({ error: e.message }));
    return () => { cancelled = true; };
  }, [s.bookingDate]);

  const chosenVehicle = vehicles.data?.find((v) => v.id === s.vehicleId);
  const payload = () => ({
    ...pick(s, ['serviceId', 'addonIds', 'bookingDate', 'timeSlotId', 'pickupDrop', 'address', 'instructions']),
    ...(s.couponCode ? { couponCode: s.couponCode } : {}),
    ...(chosenVehicle
      ? { vehicleId: chosenVehicle.id, vehicleType: chosenVehicle.vehicleType, brand: chosenVehicle.brand, model: chosenVehicle.model, registrationNo: chosenVehicle.registrationNo }
      : { vehicleType: s.vehicleType, brand: s.brand, model: s.model, registrationNo: s.registrationNo, saveVehicle: s.saveVehicle }),
  });

  const next = () => {
    const keys = STEP_FIELDS[step];
    const r = validate(pick(schemas.booking, keys), payload());
    setErrors(r.errors);
    if (!r.valid) { toast.warning(Object.values(r.errors)[0], 'Almost there'); return; }
    if (step === 2 && !s.bookingDate) set({ bookingDate: meta?.today || isoDate(new Date()) });
    setStep(step + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setVehicleType = (type) => {
    const keep = service && service.prices[type] !== undefined;
    set({ vehicleType: type, ...(keep ? {} : { serviceId: null, addonIds: [] }) });
  };

  /** BOOKING CREATION: validate everything again, then POST /api/bookings. */
  const confirm = async () => {
    const data = payload();
    const r = validate(schemas.booking, data);
    if (!r.valid) {
      setErrors(r.errors);
      setStep(Math.min(...Object.keys(r.errors).map((f) => FIELD_STEP[f] || 5)));
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/api/bookings', data);
      toast.success(res.message, `Booking ${res.booking.code} reserved`);
      navigate(`/pay/booking/${res.booking.id}`);
    } catch (err) {
      if (err.fields) { setErrors(err.fields); setStep(Math.min(...Object.keys(err.fields).map((f) => FIELD_STEP[f] || 5))); }
      if (err.status === 409) set({ timeSlotId: null, bookingDate: s.bookingDate });
      toast.error(err.message, 'Booking not created');
      setSubmitting(false);
    }
  };

  if (services.loading || vehicles.loading) return <PublicLayout solid glow><main className="container" style={{ paddingTop: 140 }}><Loader /></main></PublicLayout>;
  if (services.error) return <PublicLayout solid glow><main className="container" style={{ paddingTop: 140 }}><EmptyState icon="alert" title="Booking is unavailable" text={services.error.message} /></main></PublicLayout>;

  const brands = VEHICLE_BRANDS[s.vehicleType] || {};
  const dates = Array.from({ length: 14 }, (_, i) => { const d = new Date(`${meta?.today || isoDate(new Date())}T00:00:00`); d.setDate(d.getDate() + i); return d; });
  const b = quote?.bill;

  return (
    <PublicLayout solid glow>
      <main className="container" style={{ paddingTop: 'calc(var(--header-h) + 36px)', paddingBottom: 60 }}>
        <div className="section-head mb-3"><span className="eyebrow">Online booking</span><h1 style={{ fontSize: 'clamp(2rem,4vw,2.8rem)' }}>Book your <span className="text-metal">CarZone</span> wash</h1></div>
        <div className="stepper">{STEPS.map((label, i) => (
          <div key={label} className={`s ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}><span className="n">{i + 1}</span>{label}</div>))}</div>
        <div className="wizard">
          <div className="card wizard-panel active">
            {step === 1 && (
              <>
                <h3>Which vehicle are we pampering?</h3>
                {vehicles.data.length > 0 && (
                  <><span className="label">Your saved vehicles</span>
                    <div className="vehicle-saved mt-1">
                      {vehicles.data.map((v) => (
                        <label className="choice" key={v.id}><input type="radio" name="veh" checked={s.vehicleId === v.id} onChange={() => { set({ vehicleId: v.id }); setVehicleType(v.vehicleType); }} />
                          <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><span className="choice-title">{v.brand} {v.model}</span>
                            <span className="choice-sub">{vehicleLabel(v.vehicleType)}</span><span className="plate" style={{ width: 'fit-content' }}>{v.registrationNo}</span></span></label>))}
                      <label className="choice"><input type="radio" name="veh" checked={!s.vehicleId} onChange={() => set({ vehicleId: null })} />
                        <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><Icon name="plus" /><span className="choice-title">Another vehicle</span><span className="choice-sub">Enter details below</span></span></label>
                    </div></>
                )}
                {!s.vehicleId && (
                  <>
                    <FormField label="Vehicle type" error={errors.vehicleType}>
                      <div className="choice-grid mt-1">{VEHICLE_TYPES.map((t) => (
                        <label className="choice" key={t}><input type="radio" name="vtype" checked={s.vehicleType === t} onChange={() => setVehicleType(t)} />
                          <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><Icon name={t === 'bike' ? 'bike' : 'car'} size="lg" /><span className="choice-title">{vehicleLabel(t)}</span></span></label>))}</div>
                    </FormField>
                    <div className="form-grid mt-3">
                      <FormField label="Brand" list="brand-list" placeholder="e.g. Hyundai" value={s.brand} error={errors.brand} onChange={(e) => set({ brand: e.target.value })} />
                      <FormField label="Model" list="model-list" placeholder="e.g. Creta" value={s.model} error={errors.model} onChange={(e) => set({ model: e.target.value })} />
                      <FormField label="Registration number" placeholder="MH12AB1234" value={s.registrationNo} error={errors.registrationNo} onChange={(e) => set({ registrationNo: e.target.value.toUpperCase() })} />
                      <div className="field" style={{ justifyContent: 'flex-end' }}><label className="checkbox"><input type="checkbox" checked={s.saveVehicle} onChange={(e) => set({ saveVehicle: e.target.checked })} /> Save this vehicle to my account</label></div>
                    </div>
                    <datalist id="brand-list">{Object.keys(brands).map((x) => <option key={x} value={x} />)}</datalist>
                    <datalist id="model-list">{(brands[s.brand] || []).map((x) => <option key={x} value={x} />)}</datalist>
                  </>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <h3>Choose your service</h3>
                <FormField error={errors.serviceId}>
                  <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>
                    {services.data.map((sv) => {
                      const price = sv.prices[s.vehicleType];
                      return (
                        <label className="choice" key={sv.id}><input type="radio" name="svc" disabled={price === undefined} checked={s.serviceId === sv.id} onChange={() => set({ serviceId: sv.id, addonIds: [] })} />
                          <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><span className="choice-title">{sv.name}</span>
                            <span className="choice-sub">{sv.category} · {duration(sv.durationMinutes)}</span>
                            <span className="choice-price">{price === undefined ? <span className="text-small text-muted">Not for {vehicleLabel(s.vehicleType)}</span> : money(price, { compact: true })}</span></span></label>
                      );
                    })}
                  </div>
                </FormField>
                {service?.addons.length > 0 && (
                  <div className="mt-4"><h4>Enhance with add-ons</h4>
                    <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>{service.addons.map((a) => (
                      <label className="choice" key={a.id}><input type="checkbox" checked={s.addonIds.includes(a.id)}
                        onChange={(e) => set({ addonIds: e.target.checked ? [...s.addonIds, a.id] : s.addonIds.filter((x) => x !== a.id) })} />
                        <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><span className="choice-title" style={{ paddingRight: 26 }}>{a.name}</span>
                          <span className="choice-sub">{a.description}</span><span className="choice-price">+{money(a.pricePaise, { compact: true })}</span></span></label>))}</div>
                  </div>
                )}
              </>
            )}
            {step === 3 && (
              <>
                <h3>Pick a date and time</h3>
                <div className="flex between flex-wrap mb-2"><span className="text-small text-muted">Live availability - slots update as customers book.</span>
                  <label className="flex text-small text-muted">Other date <input className="input" type="date" style={{ width: 'auto', padding: '8px 12px' }} min={meta?.today} max={meta?.lastBookableDate} value={s.bookingDate}
                    onChange={(e) => e.target.value && set({ bookingDate: e.target.value, timeSlotId: null })} /></label></div>
                <div className="date-strip">{dates.map((d, i) => {
                  const iso = isoDate(d);
                  return (
                    <button key={iso} type="button" className={`date-pill ${s.bookingDate === iso ? 'active' : ''}`} onClick={() => set({ bookingDate: iso, timeSlotId: null })}>
                      <small>{i === 0 ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</small><b>{d.getDate()}</b><small>{d.toLocaleDateString('en-IN', { month: 'short' })}</small></button>
                  );
                })}</div>
                <FormField error={errors.timeSlotId || errors.bookingDate}>
                  {!slots ? <Loader text="Checking live availability..." /> : slots.error ? <div className="alert alert-danger"><Icon name="alert" /><p>{slots.error}</p></div>
                    : !slots.some((x) => x.available) ? <EmptyState icon="calendar" title="Fully booked" text={`No slots left on ${formatDate(s.bookingDate)}. Please choose another date.`} />
                      : <div className="slot-grid">{slots.map((x) => (
                        <label className="choice" key={x.id}><input type="radio" name="slot" disabled={!x.available} checked={s.timeSlotId === x.id} onChange={() => set({ timeSlotId: x.id })} />
                          <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><span className="choice-title">{time12(x.startTime)}</span>
                            <span className="choice-sub">{x.label} · until {time12(x.endTime)}</span>
                            <span className={`slot-left ${x.remaining === 0 ? 'none' : x.remaining <= 1 ? 'low' : ''}`}>{x.isBlocked ? 'Closed' : x.isPast ? 'Already started' : x.remaining ? `${x.remaining} of ${x.capacity} bays free` : 'Fully booked'}</span></span></label>))}</div>}
                </FormField>
              </>
            )}
            {step === 4 && (
              <>
                <h3>Pickup &amp; instructions</h3>
                <div className="card card-sm mb-3" style={{ background: 'var(--bg-2)' }}>
                  <label className="switch"><input type="checkbox" disabled={!service?.pickupAvailable} checked={s.pickupDrop} onChange={(e) => set({ pickupDrop: e.target.checked })} /><span className="track" />
                    <span><b>Doorstep pickup &amp; drop</b><br /><span className="text-small text-muted">{service?.pickupAvailable ? `Our driver collects and returns your vehicle (+${money(meta?.rules.pickupFeePaise ?? 19900, { compact: true })}).` : 'Not available for this service - please drop the vehicle at the centre.'}</span></span></label>
                </div>
                <div className="form-grid">
                  <FormField label="Address" type="textarea" rows={3} span={2} hint="Used for pickup, or as your contact address." value={s.address} error={errors.address} onChange={(e) => set({ address: e.target.value })} />
                  <FormField label="Special instructions (optional)" type="textarea" rows={3} span={2} value={s.instructions} error={errors.instructions} onChange={(e) => set({ instructions: e.target.value })} />
                </div>
              </>
            )}
            {step === 5 && service && (
              <>
                <h3>Review &amp; confirm</h3>
                <div className="review-summary">
                  <div className="row"><span>Vehicle</span><b>{chosenVehicle ? `${chosenVehicle.brand} ${chosenVehicle.model} (${chosenVehicle.registrationNo})` : `${s.brand} ${s.model} (${s.registrationNo})`} · {vehicleLabel(s.vehicleType)}</b></div>
                  <div className="row"><span>Service</span><b>{service.name} ({duration(service.durationMinutes)})</b></div>
                  <div className="row"><span>Add-ons</span><b>{service.addons.filter((a) => s.addonIds.includes(a.id)).map((a) => a.name).join(', ') || 'None'}</b></div>
                  <div className="row"><span>Date &amp; time</span><b>{formatDate(s.bookingDate)}, {time12(slots?.find?.((x) => x.id === s.timeSlotId)?.startTime || '00:00')}</b></div>
                  <div className="row"><span>Pickup &amp; drop</span><b>{s.pickupDrop ? 'Yes - doorstep pickup' : 'No - I will visit the centre'}</b></div>
                  <div className="row"><span>Address</span><b>{s.address}</b></div>
                </div>
                <div className="alert alert-info mt-3"><Icon name="info" /><p>Your slot is held as soon as you confirm; pay on the next screen to confirm it. Free cancellation up to {meta?.rules.freeCancelHours ?? 24} hours before the slot.</p></div>
              </>
            )}
            <div className="wizard-nav">
              {step === 1 ? <Link className="btn btn-ghost" to="/services">Back to services</Link> : <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Back</button>}
              {step < 5 ? <button className="btn btn-primary" onClick={next}>Continue</button>
                : <button className={`btn btn-primary btn-lg ${submitting ? 'is-loading' : ''}`} disabled={submitting} onClick={confirm}>Confirm &amp; pay {b ? money(b.totalPaise) : ''}</button>}
            </div>
          </div>
          <aside className="sticky">
            <div className="card card-glass summary-card">
              <span className="eyebrow">Your booking</span>
              {!service ? <p className="text-muted text-small">Select a vehicle and service to see your price.</p> : (
                <div className="service-thumb"><Img src={service.image} alt="" /><div><b>{service.name}</b><div className="text-small text-muted">{vehicleLabel(s.vehicleType)} · {duration(service.durationMinutes)}</div></div></div>)}
              {quote?.error && <div className="alert alert-danger"><Icon name="alert" /><p>{quote.error}</p></div>}
              {b && (
                <div className="bill-lines">
                  <div className="bill-line"><span>{service?.name}</span><span>{money(b.basePricePaise)}</span></div>
                  {quote.addons.map((a) => <div className="bill-line" key={a.id}><span>+ {a.name}</span><span>{money(a.pricePaise)}</span></div>)}
                  {b.pickupFeePaise > 0 && <div className="bill-line"><span>Pickup &amp; drop</span><span>{money(b.pickupFeePaise)}</span></div>}
                  {b.discountPaise > 0 && <div className="bill-line discount"><span>Discount ({b.couponCode})</span><span>- {money(b.discountPaise)}</span></div>}
                  <div className="bill-line"><span>GST ({b.gstPercent}%)</span><span>{money(b.taxPaise)}</span></div>
                  <div className="bill-line total"><span>Total</span><span>{money(b.totalPaise)}</span></div>
                </div>
              )}
              <hr className="divider" />
              <label className="label" htmlFor="coupon">Coupon code</label>
              <div className="coupon-row mt-1">
                <input id="coupon" className="input" placeholder="WELCOME15" value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} />
                <button className="btn btn-dark" onClick={() => (service ? set({ couponCode: couponInput.trim() }) : toast.info('Choose a service first, then apply the coupon.'))}>Apply</button>
              </div>
              {quote?.coupon && <div className={`coupon-msg ${quote.coupon.valid ? 'ok' : 'bad'}`}>{quote.coupon.message}</div>}
              {offers.data?.length > 0 && <div className="text-small text-muted mt-2">Available: {offers.data.slice(0, 4).map((o) => (
                <button key={o.code} type="button" className="code-chip" style={{ padding: '3px 8px', fontSize: '0.75rem', margin: '3px 2px' }} onClick={() => { setCouponInput(o.code); if (service) set({ couponCode: o.code }); }}>{o.code}</button>))}</div>}
            </div>
          </aside>
        </div>
      </main>
    </PublicLayout>
  );
}
