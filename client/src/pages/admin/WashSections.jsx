/**
 * pages/admin/WashSections.jsx - Car-wash operations: bookings (status workflow),
 * time slots (+ per-day capacity), services with per-vehicle prices, and add-ons.
 */
import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApi } from '../../hooks/useApi.js';
import { money, duration, vehicleLabel, statusLabel, formatDate, formatDateShort, formatDateTime, slotText, time12, isoDate } from '../../utils/format.js';
import { BOOKING_STATUSES, VEHICLE_TYPES, schemas } from '../../utils/shared.js';
import { PanelHead } from '../../components/AppShell.jsx';
import DataTable from '../../components/DataTable.jsx';
import StatusBadge, { PillBadge } from '../../components/StatusBadge.jsx';
import FormModal from '../../components/FormModal.jsx';
import Modal from '../../components/Modal.jsx';
import { AsyncView } from '../../components/EmptyState.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import Img from '../../components/Img.jsx';
import { api, qs, rupees, useAction, useDebounced, Select, SearchBox, ActiveBadge } from './helpers.jsx';

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
const NEXT = { pending_payment: ['cancelled'], confirmed: ['in_progress', 'cancelled'], rescheduled: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] };
const NEXT_LABEL = { in_progress: 'Start service', completed: 'Mark completed', cancelled: 'Cancel' };

function BookingDialog({ id, onClose, onChanged }) {
  const q = useApi(`/api/admin/bookings/${id}`);
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const setStatus = async (status) => {
    setBusy(status);
    try {
      const r = await api.patch(`/api/admin/bookings/${id}/status`, { status, ...(note ? { note } : {}) });
      toast.success(r.message, 'Status updated');
      onChanged(); onClose();
    } catch (err) { toast.error(err.message); setBusy(''); }
  };
  const b = q.data;
  return (
    <Modal title={b ? `Booking ${b.code}` : 'Booking'} size="lg" onClose={onClose}
      footer={b && <><Link className="btn btn-ghost" to={`/bookings/${b.id}`}>Full timeline</Link>
        {b.actions.invoice && <a className="btn btn-dark" href={`/api/bookings/${b.id}/invoice`} target="_blank" rel="noopener noreferrer"><Icon name="receipt" size="sm" /> Invoice</a>}
        <button className="btn btn-primary" onClick={onClose}>Done</button></>}>
      <AsyncView query={q}>{() => (
        <>
          <div className="flex flex-wrap mb-2"><StatusBadge status={b.status} /><PillBadge value={b.paymentStatus} /></div>
          <div className="grid grid-2">
            <dl className="kv"><dt>Customer</dt><dd>{b.customer.name}</dd><dt>Email</dt><dd>{b.customer.email}</dd><dt>Phone</dt><dd>{b.customer.phone || '-'}</dd>
              <dt>Service</dt><dd>{b.service.name}</dd><dt>Vehicle</dt><dd>{b.vehicle.brand} {b.vehicle.model} ({vehicleLabel(b.vehicle.type)})</dd><dt>Reg. no</dt><dd><span className="plate">{b.vehicle.registrationNo}</span></dd></dl>
            <dl className="kv"><dt>Date</dt><dd>{formatDate(b.bookingDate)}</dd><dt>Slot</dt><dd>{slotText(b.slot)}</dd><dt>Pickup</dt><dd>{b.pickupDrop ? 'Yes' : 'No'}</dd>
              <dt>Total</dt><dd><b>{money(b.bill.totalPaise)}</b></dd><dt>Coupon</dt><dd>{b.bill.couponCode || '-'}</dd><dt>Created</dt><dd>{formatDateTime(b.createdAt)}</dd></dl>
          </div>
          <p className="text-small mt-2"><b>Address:</b> {b.address}{b.instructions && <><br /><b>Instructions:</b> {b.instructions}</>}</p>
          {b.cancelReason && <div className="alert alert-danger"><Icon name="x-circle" /><p>Cancelled by {b.cancelledBy}: {b.cancelReason}{b.refund ? ` - refund ${b.refund.percent}% ${money(b.refund.amountPaise)} (${b.refund.status})` : ''}</p></div>}
          {NEXT[b.status].length > 0 && (
            <>
              <div className="field mt-3"><label htmlFor="status-note">Note for the timeline (used as the reason when cancelling)</label>
                <input className="input" id="status-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Vehicle received at bay 2" /></div>
              <div className="flex flex-wrap mt-2">{NEXT[b.status].map((s) => (
                <button key={s} className={`btn btn-sm ${s === 'cancelled' ? 'btn-danger' : s === 'completed' ? 'btn-success' : 'btn-primary'} ${busy === s ? 'is-loading' : ''}`} disabled={!!busy} onClick={() => setStatus(s)}>{NEXT_LABEL[s]}</button>))}</div>
            </>
          )}
        </>
      )}</AsyncView>
    </Modal>
  );
}

export function Bookings({ refreshCounts }) {
  const [f, setF] = useState({ status: '', date: '', search: '' });
  const search = useDebounced(f.search);
  const q = useApi(`/api/admin/bookings${qs({ status: f.status, date: f.date, search })}`);
  const [viewing, setViewing] = useState(null);
  const run = useAction();
  const reload = () => { q.reload(); refreshCounts(); };
  const quick = (b, s) => (s === 'cancelled' ? setViewing(b.id)
    : run({ skipConfirm: true, request: () => api.patch(`/api/admin/bookings/${b.id}/status`, { status: s }), done: reload }));
  return (
    <>
      <PanelHead title="Bookings" subtitle="Track every booking and move it through the service workflow.">
        <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['', 'All statuses'], ...BOOKING_STATUSES.map((s) => [s, statusLabel(s)])]} />
        <input className="input" type="date" aria-label="Booking date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <SearchBox placeholder="Code, customer, reg. no" value={f.search} onChange={(v) => setF({ ...f, search: v })} />
      </PanelHead>
      <AsyncView query={q}>{(list) => (
        <>
          <p className="text-small text-muted">{list.length} booking(s)</p>
          <DataTable rows={list} empty={{ icon: 'calendar', title: 'No bookings match these filters' }} columns={[
            { label: 'Booking', render: (b) => <><span className="mono strong">{b.code}</span><span className="cell-sub">{formatDateShort(b.createdAt)}</span></> },
            { label: 'Customer', render: (b) => <>{b.customer.name}<span className="cell-sub">{b.customer.phone || b.customer.email}</span></> },
            { label: 'Service', render: (b) => <>{b.service.name}<span className="cell-sub">{b.vehicle.brand} {b.vehicle.model} · {b.vehicle.registrationNo}</span></> },
            { label: 'Schedule', render: (b) => <>{formatDateShort(b.bookingDate)}<span className="cell-sub">{slotText(b.slot)}{b.pickupDrop ? ' · pickup' : ''}</span></> },
            { label: 'Status', render: (b) => <><StatusBadge status={b.status} /><span className="cell-sub"><PillBadge value={b.paymentStatus} /></span></> },
            { label: 'Amount', num: true, render: (b) => <span className="strong">{money(b.bill.totalPaise)}</span> },
            { label: '', render: (b) => <div className="actions">{NEXT[b.status].filter((s) => s !== 'cancelled').map((s) => (
              <button key={s} className={`btn btn-sm ${s === 'completed' ? 'btn-success' : 'btn-primary'}`} onClick={() => quick(b, s)}>{NEXT_LABEL[s]}</button>))}
              <button className="btn btn-dark btn-sm" onClick={() => setViewing(b.id)}>View</button></div> },
          ]} />
        </>
      )}</AsyncView>
      {viewing && <BookingDialog id={viewing} onClose={() => setViewing(null)} onChanged={reload} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Time slots
// ---------------------------------------------------------------------------
const SLOT_FIELDS = [
  { name: 'label', label: 'Label', placeholder: 'e.g. Morning', span: 2 },
  { name: 'startTime', label: 'Start time', type: 'time' },
  { name: 'endTime', label: 'End time', type: 'time' },
  { name: 'capacity', label: 'Default capacity (vehicles)', type: 'number', min: 1, max: 50 },
  { name: 'isActive', label: 'Status', type: 'switch', text: 'Active' },
];

export function Slots() {
  const q = useApi('/api/admin/slots');
  const [date, setDate] = useState(isoDate(new Date()));
  const day = useApi(`/api/admin/slots/day?date=${date}`);
  const [editing, setEditing] = useState(null);
  const [dayEdit, setDayEdit] = useState(null);
  const run = useAction();
  const toast = useToast();
  return (
    <>
      <PanelHead title="Time slots" subtitle="Daily slot templates. Capacity = vehicles the studio can take in that slot (shared by washes and accessory fitments).">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> New slot</button>
      </PanelHead>
      <AsyncView query={q}>{(slots) => (
        <DataTable rows={slots} empty={{ icon: 'clock', title: 'No time slots defined' }} columns={[
          { label: 'Slot', render: (s) => <span className="strong">{s.label}</span> },
          { label: 'Time', render: (s) => `${time12(s.startTime)} - ${time12(s.endTime)}` },
          { label: 'Capacity', num: true, render: (s) => s.capacity },
          { label: 'Status', render: (s) => <ActiveBadge active={s.isActive} /> },
          { label: '', render: (s) => <div className="actions"><button className="btn btn-dark btn-sm" aria-label="Edit" onClick={() => setEditing(s)}><Icon name="edit" size="sm" /></button>
            <button className="btn btn-danger btn-sm" aria-label="Delete" onClick={() => run({ title: `Delete ${s.label}?`, message: 'Slots with bookings cannot be deleted - deactivate them instead.', confirmText: 'Delete', danger: true, request: () => api.del(`/api/admin/slots/${s.id}`), done: q.reload })}><Icon name="trash" size="sm" /></button></div> },
        ]} />
      )}</AsyncView>
      <PanelHead title="Day view" subtitle="Live bookings per slot for a specific date."><input className="input" type="date" aria-label="Day" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></PanelHead>
      <AsyncView query={day}>{({ slots }) => (
        <div className="inventory-grid">{slots.map((s) => (
          <div key={s.id} className={`card card-sm inventory-card ${s.isBlocked ? 'blocked' : ''}`}>
            <div className="flex between"><b>{time12(s.startTime)} - {time12(s.endTime)}</b>{s.isBlocked ? <span className="badge badge-danger">Blocked</span> : !s.isActive && <span className="badge badge-muted">Inactive</span>}</div>
            <div className="text-small text-muted">{s.label}</div>
            <div className="meter"><i style={{ width: `${s.capacity ? Math.min(100, (s.booked / s.capacity) * 100) : 100}%` }} /></div>
            <div className="flex between text-small"><span>{s.booked} booked / {s.capacity} capacity</span>{s.capacityOverride !== null && <span className="badge badge-gold no-dot">Override</span>}</div>
            <button className="btn btn-dark btn-sm mt-2" onClick={() => setDayEdit(s)}><Icon name="settings" size="sm" /> Adjust this day</button>
          </div>))}</div>
      )}</AsyncView>
      {editing && <FormModal title={editing.id ? `Edit ${editing.label}` : 'New time slot'} fields={SLOT_FIELDS} schema={schemas.adminSlot}
        initial={editing.id ? editing : { capacity: 4, isActive: true }} onClose={() => setEditing(null)}
        onSubmit={async (data) => { const r = editing.id ? await api.put(`/api/admin/slots/${editing.id}`, data) : await api.post('/api/admin/slots', data); toast.success(r.message); q.reload(); day.reload(); }} />}
      {dayEdit && <FormModal title={`${dayEdit.label} on ${formatDate(date)}`} schema={schemas.adminSlotDay}
        intro={<p className="text-small text-muted">Default capacity is {dayEdit.defaultCapacity}. {dayEdit.booked} vehicle(s) already booked - capacity cannot go below that.</p>}
        fields={[{ name: 'capacity', label: 'Capacity for this day', type: 'number', min: 0, max: 50 }, { name: 'isBlocked', label: 'Block slot', type: 'switch', text: 'Stop new bookings for this slot on this day' }]}
        initial={{ capacity: dayEdit.capacity, isBlocked: dayEdit.isBlocked, date, timeSlotId: dayEdit.id }} onClose={() => setDayEdit(null)}
        onSubmit={async (data) => { const r = await api.put('/api/admin/slots/day', data); toast.success(r.message); day.reload(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Services & add-ons
// ---------------------------------------------------------------------------
const SERVICE_IMAGES = ['basic-exterior-wash', 'premium-wash', 'interior-cleaning', 'foam-wash', 'ceramic-coating', 'wax-polishing', 'engine-cleaning', 'full-detailing', 'bike-wash']
  .map((s) => `/assets/images/services/${s}.jpg`).concat([1, 2, 3, 4, 5, 6].map((n) => `/assets/images/gallery/gallery-${n}.jpg`));

function toServicePayload(data) {
  const prices = {};
  const out = { ...data };
  for (const t of VEHICLE_TYPES) { prices[t] = out[`price_${t}`]; delete out[`price_${t}`]; }
  return { ...out, benefits: String(out.benefits || '').split('\n').map((s) => s.trim()).filter(Boolean), prices };
}

export function Services() {
  const q = useApi('/api/admin/services');
  const addons = useApi('/api/admin/addons');
  const [editing, setEditing] = useState(null);
  const run = useAction();
  const toast = useToast();
  const fields = [
    { name: 'name', label: 'Service name' },
    { name: 'category', label: 'Category', placeholder: 'e.g. Wash, Interior, Protection' },
    { name: 'tagline', label: 'Tagline', span: 2 },
    { name: 'description', label: 'Description', type: 'textarea', span: 2 },
    { name: 'benefits', label: 'Benefits (one per line)', type: 'textarea', rows: 4, span: 2 },
    { name: 'durationMinutes', label: 'Duration (minutes)', type: 'number', min: 15, max: 720 },
    { name: 'image', label: 'Image', type: 'select', options: SERVICE_IMAGES.map((p) => ({ value: p, label: p.replace('/assets/images/', '') })), hint: 'Add new photos to client/public/assets/images/services/' },
    ...VEHICLE_TYPES.map((t) => ({ name: `price_${t}`, label: `Price - ${vehicleLabel(t)} (₹)`, type: 'number', min: 0, step: '0.01', placeholder: 'Blank = not offered' })),
    { name: 'addonIds', label: 'Allowed add-ons', type: 'checkboxes', options: (addons.data || []).map((a) => ({ value: a.id, label: `${a.name} (${money(a.pricePaise, { compact: true })})` })) },
    { name: 'pickupAvailable', label: 'Pickup & drop', type: 'switch', text: 'Offer doorstep pickup' },
    { name: 'isFeatured', label: 'Featured', type: 'switch', text: 'Show as signature service' },
    { name: 'isActive', label: 'Availability', type: 'switch', text: 'Available for booking', span: 2 },
  ];
  const toggle = (s, isActive) => run({ skipConfirm: true, request: () => api.patch(`/api/admin/services/${s.id}/active`, { isActive }), done: q.reload });
  return (
    <>
      <PanelHead title="Services & prices" subtitle="Packages, availability, per-vehicle prices and allowed add-ons.">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> New service</button>
      </PanelHead>
      <AsyncView query={q}>{(list) => (
        <DataTable rows={list} empty={{ icon: 'sparkles', title: 'No services yet' }} columns={[
          { label: 'Service', render: (s) => <div className="cell-media"><Img src={s.image} alt="" /><div><span className="strong">{s.name}</span><span className="cell-sub">{s.category} · {duration(s.durationMinutes)}</span></div></div> },
          { label: 'Prices', render: (s) => VEHICLE_TYPES.filter((t) => s.prices[t]).map((t) => <span key={t} className="cell-sub">{vehicleLabel(t)}: <b className="text-blue">{money(s.prices[t], { compact: true })}</b></span>) },
          { label: 'Add-ons', num: true, render: (s) => s.addons.length },
          { label: 'Bookings', num: true, render: (s) => s.bookingCount },
          { label: 'Rating', num: true, render: (s) => (s.rating ? `${s.rating} ★` : '-') },
          { label: 'Available', render: (s) => <><label className="switch"><input type="checkbox" aria-label={`${s.name} available`} checked={s.isActive} onChange={(e) => toggle(s, e.target.checked)} /><span className="track" /></label>{s.isFeatured && <span className="badge badge-gold no-dot">Featured</span>}</> },
          { label: '', render: (s) => <div className="actions"><button className="btn btn-dark btn-sm" onClick={() => setEditing(s)}><Icon name="edit" size="sm" /> Edit</button>
            <button className="btn btn-danger btn-sm" aria-label="Delete" onClick={() => run({ title: `Delete ${s.name}?`, message: 'Services with bookings cannot be deleted - switch off availability instead.', confirmText: 'Delete', danger: true, request: () => api.del(`/api/admin/services/${s.id}`), done: q.reload })}><Icon name="trash" size="sm" /></button></div> },
        ]} />
      )}</AsyncView>
      {editing && <FormModal size="lg" title={editing.id ? `Edit ${editing.name}` : 'New service'} fields={fields} schema={schemas.adminService} transform={toServicePayload}
        submitText={editing.id ? 'Save changes' : 'Create service'}
        initial={editing.id ? { ...editing, benefits: editing.benefits.join('\n'), addonIds: editing.addons.map((a) => a.id), ...Object.fromEntries(VEHICLE_TYPES.map((t) => [`price_${t}`, rupees(editing.prices[t])])) }
          : { isActive: true, durationMinutes: 60, image: SERVICE_IMAGES[0], addonIds: [] }}
        onClose={() => setEditing(null)}
        onSubmit={async (data) => { const r = editing.id ? await api.put(`/api/admin/services/${editing.id}`, data) : await api.post('/api/admin/services', data); toast.success(r.message); q.reload(); }} />}
    </>
  );
}

const ADDON_FIELDS = [
  { name: 'name', label: 'Add-on name', span: 2 },
  { name: 'description', label: 'Description', type: 'textarea', rows: 2, span: 2 },
  { name: 'price', label: 'Price (₹)', type: 'number', min: 0, step: '0.01' },
  { name: 'durationMinutes', label: 'Extra time (minutes)', type: 'number', min: 0 },
  { name: 'isActive', label: 'Status', type: 'switch', text: 'Active', span: 2 },
];

export function Addons() {
  const q = useApi('/api/admin/addons');
  const services = useApi('/api/admin/services');
  const [editing, setEditing] = useState(null);
  const run = useAction();
  const toast = useToast();
  const names = (ids) => ids.map((id) => services.data?.find((s) => s.id === id)?.name).filter(Boolean).join(', ');
  return (
    <>
      <PanelHead title="Add-ons" subtitle="Extras customers can add to a service. Link add-ons to services from the service editor.">
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> New add-on</button>
      </PanelHead>
      <AsyncView query={q}>{(list) => (
        <DataTable rows={list} empty={{ icon: 'layers', title: 'No add-ons yet' }} columns={[
          { label: 'Add-on', render: (a) => <><span className="strong">{a.name}</span><span className="cell-sub">{a.description}</span></> },
          { label: 'Used in', render: (a) => <span className="text-small">{names(a.serviceIds) || 'Not linked'}</span> },
          { label: 'Time', num: true, render: (a) => `${a.durationMinutes} min` },
          { label: 'Price', num: true, render: (a) => <span className="strong">{money(a.pricePaise)}</span> },
          { label: 'Status', render: (a) => <ActiveBadge active={a.isActive} /> },
          { label: '', render: (a) => <div className="actions"><button className="btn btn-dark btn-sm" aria-label="Edit" onClick={() => setEditing(a)}><Icon name="edit" size="sm" /></button>
            <button className="btn btn-danger btn-sm" aria-label="Delete" onClick={() => run({ title: `Delete ${a.name}?`, message: 'Add-ons used in past bookings cannot be deleted - deactivate them instead.', confirmText: 'Delete', danger: true, request: () => api.del(`/api/admin/addons/${a.id}`), done: q.reload })}><Icon name="trash" size="sm" /></button></div> },
        ]} />
      )}</AsyncView>
      {editing && <FormModal title={editing.id ? `Edit ${editing.name}` : 'New add-on'} fields={ADDON_FIELDS} schema={schemas.adminAddon}
        initial={editing.id ? { ...editing, price: rupees(editing.pricePaise) } : { isActive: true, durationMinutes: 10 }} onClose={() => setEditing(null)}
        onSubmit={async (data) => { const r = editing.id ? await api.put(`/api/admin/addons/${editing.id}`, data) : await api.post('/api/admin/addons', data); toast.success(r.message); q.reload(); }} />}
    </>
  );
}
