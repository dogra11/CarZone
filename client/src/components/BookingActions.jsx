/**
 * components/BookingActions.jsx - Action buttons for a wash booking and their dialogs:
 * cancel (with a refund preview that mirrors the server policy), reschedule (with live
 * slot availability) and review. Buttons appear only if booking.actions allows them -
 * the server re-checks every rule anyway.
 */
import { useEffect, useState } from 'react';
import { Link } from '../router/index.jsx';
import { api } from '../services/api.js';
import { useMeta } from '../hooks/useMeta.js';
import { useForm } from '../hooks/useForm.js';
import { useToast } from './Toast.jsx';
import { money, formatDate, slotText, time12 } from '../utils/format.js';
import { schemas } from '../utils/shared.js';
import Modal from './Modal.jsx';
import FormField from './FormField.jsx';
import Icon from './Icon.jsx';
import { Loader } from './Loader.jsx';

function CancelDialog({ booking: b, onClose, onDone }) {
  const meta = useMeta();
  const toast = useToast();
  const form = useForm(schemas.cancel, { reason: '' });
  let preview = null;
  if (meta && b.paymentStatus === 'paid') {
    const hours = (new Date(`${b.bookingDate}T${b.slot.startTime}:00`) - Date.now()) / 3600000;
    const percent = hours >= meta.rules.freeCancelHours ? 100 : meta.rules.lateCancelRefundPercent;
    preview = { percent, amount: Math.round((b.bill.totalPaise * percent) / 100) };
  }
  const submit = form.handleSubmit(async (data) => {
    const r = await api.post(`/api/bookings/${b.id}/cancel`, data);
    toast.success(r.message, 'Booking cancelled');
    onDone(r.booking);
    onClose();
  });
  return (
    <Modal title={`Cancel booking ${b.code}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Keep booking</button><button className={`btn btn-danger ${form.submitting ? 'is-loading' : ''}`} type="submit" form="cancel-form">Cancel booking</button></>}>
      {preview ? (
        <div className={`alert ${preview.percent === 100 ? 'alert-success' : 'alert-warning'}`}><Icon name={preview.percent === 100 ? 'check-circle' : 'alert'} />
          <p><b>{preview.percent}% refund - {money(preview.amount)}</b><br />{preview.percent === 100
            ? `You are cancelling more than ${meta.rules.freeCancelHours} hours before the slot.`
            : `Your slot is less than ${meta.rules.freeCancelHours} hours away, so a late-cancellation refund applies.`} Refunds reach the original payment method in 5-7 working days.</p></div>
      ) : <div className="alert alert-info"><Icon name="info" /><p>No payment was made, so nothing needs to be refunded. Your slot will be released.</p></div>}
      <form id="cancel-form" className="mt-3" onSubmit={submit} noValidate>
        <FormField label="Reason for cancelling" type="textarea" rows={3} placeholder="e.g. Plans changed" {...form.field('reason')} />
      </form>
    </Modal>
  );
}

function RescheduleDialog({ booking: b, onClose, onDone }) {
  const meta = useMeta();
  const toast = useToast();
  const [date, setDate] = useState(b.bookingDate);
  const [slots, setSlots] = useState(null);
  const [slotId, setSlotId] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setSlots(null);
    api.get(`/api/slots?date=${date}`).then((d) => { if (!cancelled) setSlots(d.slots); }).catch((e) => !cancelled && setSlots({ error: e.message }));
    return () => { cancelled = true; };
  }, [date]);
  const confirm = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/bookings/${b.id}/reschedule`, { bookingDate: date, timeSlotId: slotId });
      toast.success(r.message, 'Booking rescheduled');
      onDone(r.booking);
      onClose();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Reschedule ${b.code}`} size="lg" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Close</button><button className={`btn btn-primary ${busy ? 'is-loading' : ''}`} disabled={!slotId || busy} onClick={confirm}>Confirm new slot</button></>}>
      <p className="text-small">Currently booked for <b>{formatDate(b.bookingDate)}</b>, {slotText(b.slot)}. Reschedules used: {b.rescheduleCount} of {meta?.rules.maxReschedules ?? 2}.</p>
      <FormField label="New date" type="date" value={date} min={meta?.today} max={meta?.lastBookableDate} onChange={(e) => { setDate(e.target.value); setSlotId(null); }} className="mb-2" />
      {!slots ? <Loader text="Checking availability..." /> : slots.error ? <div className="alert alert-danger"><Icon name="alert" /><p>{slots.error}</p></div> : (
        <div className="slot-grid">{slots.map((s) => {
          const current = date === b.bookingDate && s.id === b.slot.id;
          return (
            <label className="choice" key={s.id}><input type="radio" name="slot" disabled={!s.available || current} checked={slotId === s.id} onChange={() => setSlotId(s.id)} />
              <span className="choice-box"><span className="check-mark"><Icon name="check" /></span><span className="choice-title">{time12(s.startTime)}</span>
                <span className="choice-sub">{s.label}</span><span className={`slot-left ${s.remaining <= 1 ? 'low' : ''}`}>{current ? 'Current slot' : s.isBlocked ? 'Closed' : s.isPast ? 'Started' : s.remaining ? `${s.remaining} left` : 'Full'}</span></span></label>
          );
        })}</div>
      )}
    </Modal>
  );
}

/** Star rating + title + comment. Used for wash bookings and for products. */
export function ReviewDialog({ title, url, extra = {}, onClose, onDone }) {
  const toast = useToast();
  const schema = url === '/api/reviews' ? schemas.review : schemas.productReview;
  const form = useForm(schema, { rating: '', title: '', comment: '', ...extra });
  const submit = form.handleSubmit(async (data) => {
    const r = await api.post(url, data);
    toast.success(r.message, 'Review submitted');
    onDone?.(r.review);
    onClose();
  });
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Later</button><button className={`btn btn-gold ${form.submitting ? 'is-loading' : ''}`} type="submit" form="review-form">Submit review</button></>}>
      <form id="review-form" onSubmit={submit} noValidate className="stack">
        <FormField label="Your rating" error={form.errors.rating}>
          <div className="star-input">{[5, 4, 3, 2, 1].map((n) => (
            <span key={n} style={{ display: 'contents' }}>
              <input type="radio" name="rating" id={`r${n}`} value={n} checked={String(form.values.rating) === String(n)} onChange={() => form.setValue('rating', n)} />
              <label htmlFor={`r${n}`} title={`${n} star${n > 1 ? 's' : ''}`}><Icon name="star-fill" /></label>
            </span>))}
          </div>
        </FormField>
        <FormField label="Headline" placeholder="e.g. Spotless finish" {...form.field('title')} />
        <FormField label="Your review" type="textarea" placeholder="What did you like? Anything to improve?" {...form.field('comment')} />
      </form>
    </Modal>
  );
}

export default function BookingActions({ booking: b, onChanged, showView = true }) {
  const [dialog, setDialog] = useState(null);
  const a = b.actions;
  return (
    <>
      {a.pay && <Link className="btn btn-primary btn-sm" to={`/pay/booking/${b.id}`}><Icon name="credit-card" size="sm" /> Pay {money(b.bill.totalPaise)}</Link>}
      {a.reschedule && <button className="btn btn-dark btn-sm" onClick={() => setDialog('reschedule')}><Icon name="refresh" size="sm" /> Reschedule</button>}
      {a.review && <button className="btn btn-gold btn-sm" onClick={() => setDialog('review')}><Icon name="star" size="sm" /> Rate service</button>}
      {a.invoice && <a className="btn btn-dark btn-sm" href={`/api/bookings/${b.id}/invoice`} target="_blank" rel="noopener noreferrer"><Icon name="receipt" size="sm" /> Invoice</a>}
      {a.cancel && <button className="btn btn-danger btn-sm" onClick={() => setDialog('cancel')}><Icon name="x" size="sm" /> Cancel</button>}
      {showView && <Link className="btn btn-ghost btn-sm" to={`/bookings/${b.id}`}>Details <Icon name="arrow-right" size="sm" /></Link>}
      {dialog === 'cancel' && <CancelDialog booking={b} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === 'reschedule' && <RescheduleDialog booking={b} onClose={() => setDialog(null)} onDone={onChanged} />}
      {dialog === 'review' && <ReviewDialog title={`Rate your ${b.service.name}`} url="/api/reviews" extra={{ bookingId: b.id }} onClose={() => setDialog(null)} onDone={onChanged} />}
    </>
  );
}
