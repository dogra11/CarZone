/**
 * pages/dashboard/CustomerDashboard.jsx - The customer area (/dashboard/*).
 * The URL decides the section (/dashboard/orders -> <Orders/>). Each section is a small
 * component that loads its own data with useApi() and shows loading / empty / error states.
 */
import { useState } from 'react';
import { Link, useParams } from '../../router/index.jsx';
import { api } from '../../services/api.js';
import { useApi } from '../../hooks/useApi.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useForm } from '../../hooks/useForm.js';
import { useCopy } from '../../hooks/useCopy.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { money, formatDate, formatDateShort, formatDateTime, slotText, vehicleLabel, firstName } from '../../utils/format.js';
import { VEHICLE_TYPES, schemas } from '../../utils/shared.js';
import AppShell, { PanelHead } from '../../components/AppShell.jsx';
import StatusBadge, { OrderBadge, PillBadge } from '../../components/StatusBadge.jsx';
import BookingActions from '../../components/BookingActions.jsx';
import OrderActions from '../../components/OrderActions.jsx';
import DataTable from '../../components/DataTable.jsx';
import StatCard from '../../components/StatCard.jsx';
import OfferCard from '../../components/OfferCard.jsx';
import ProductCard from '../../components/ProductCard.jsx';
import FormModal from '../../components/FormModal.jsx';
import FormField from '../../components/FormField.jsx';
import Stars from '../../components/Stars.jsx';
import EmptyState, { AsyncView } from '../../components/EmptyState.jsx';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/Modal.jsx';
import Icon from '../../components/Icon.jsx';
import Img from '../../components/Img.jsx';
import { ADDRESS_FIELDS } from '../Checkout.jsx';

const ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'bookings', label: 'Upcoming bookings', icon: 'calendar', group: 'Car wash' },
  { id: 'history', label: 'Booking history', icon: 'clock', group: 'Car wash' },
  { id: 'vehicles', label: 'My vehicles', icon: 'car', group: 'Car wash' },
  { id: 'orders', label: 'My orders', icon: 'package', group: 'Shop' },
  { id: 'wishlist', label: 'Wishlist', icon: 'heart', group: 'Shop' },
  { id: 'addresses', label: 'Addresses', icon: 'map-pin', group: 'Shop' },
  { id: 'payments', label: 'Payments', icon: 'credit-card', group: 'Account' },
  { id: 'offers', label: 'Offers', icon: 'gift', group: 'Account' },
  { id: 'reviews', label: 'My reviews', icon: 'star', group: 'Account' },
  { id: 'profile', label: 'Profile & security', icon: 'settings', group: 'Account' },
];

const NEW_BOOKING = <Link className="btn btn-primary btn-sm" to="/book"><Icon name="plus" size="sm" /> New booking</Link>;

export function BookingCard({ booking: b, onChanged }) {
  return (
    <article className="booking-card">
      <Img src={b.service.image} alt="" />
      <div>
        <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 6 }}><StatusBadge status={b.status} /><PillBadge value={b.paymentStatus} /><span className="text-small text-muted mono">{b.code}</span></div>
        <h4>{b.service.name}</h4>
        <div className="meta">
          <span><Icon name="calendar" size="sm" /> {formatDate(b.bookingDate)}</span>
          <span><Icon name="clock" size="sm" /> {slotText(b.slot)}</span>
          <span><Icon name={b.vehicle.type === 'bike' ? 'bike' : 'car'} size="sm" /> {b.vehicle.brand} {b.vehicle.model}</span>
          {b.pickupDrop && <span><Icon name="truck" size="sm" /> Pickup</span>}
        </div>
      </div>
      <div className="side"><span className="amount">{money(b.bill.totalPaise)}</span><div className="btn-row"><BookingActions booking={b} onChanged={onChanged} /></div></div>
    </article>
  );
}

function OrderCard({ order: o, onChanged }) {
  return (
    <article className="booking-card">
      <Img src={o.preview?.image} alt="" />
      <div>
        <div className="flex flex-wrap" style={{ gap: 8, marginBottom: 6 }}><OrderBadge status={o.status} /><span className="text-small text-muted mono">{o.code}</span></div>
        <h4>{o.preview?.name}{o.lineCount > 1 ? ` + ${o.lineCount - 1} more` : ''}</h4>
        <div className="meta">
          <span><Icon name="calendar" size="sm" /> {formatDateTime(o.createdAt)}</span>
          <span><Icon name="package" size="sm" /> {o.itemCount} item(s)</span>
          <span><Icon name="credit-card" size="sm" /> {o.paymentMethodLabel}</span>
          {o.fitment && <span><Icon name="settings" size="sm" /> Fitment {formatDateShort(o.fitment.date)}</span>}
        </div>
      </div>
      <div className="side"><span className="amount">{money(o.totals.totalPaise)}</span><div className="btn-row"><OrderActions order={o} onChanged={onChanged} /></div></div>
    </article>
  );
}

function Overview() {
  const { user } = useAuth();
  const q = useApi('/api/me/dashboard');
  const upcoming = useApi('/api/bookings?scope=upcoming');
  const orders = useApi('/api/orders');
  const copy = useCopy();
  return (
    <AsyncView query={q}>{(d) => {
      const next = d.nextBooking;
      return (
        <>
          <div className="welcome-banner">
            <img src="/assets/images/dashboard-banner.jpg" alt="" />
            <span className="eyebrow">Welcome back</span>
            <h2>Hello, {firstName(user.name)}. Ready for your next shine?</h2>
            <p>{d.upcoming ? `You have ${d.upcoming} upcoming booking${d.upcoming > 1 ? 's' : ''}.` : 'No upcoming bookings - your car deserves some care.'} {d.activeOrders ? `${d.activeOrders} order${d.activeOrders > 1 ? 's are' : ' is'} on the way.` : ''}</p>
            <div className="flex flex-wrap"><Link className="btn btn-primary" to="/book"><Icon name="plus" size="sm" /> Book a wash</Link><Link className="btn btn-ghost" to="/shop"><Icon name="store" size="sm" /> Shop accessories</Link></div>
          </div>
          <div className="stat-grid">
            <StatCard icon="calendar" label="Upcoming" value={d.upcoming} sub={`${d.awaitingPayment} awaiting payment`} />
            <StatCard icon="package" label="Orders" value={d.totalOrders} sub={`${d.activeOrders} in transit`} tone="green" />
            <StatCard icon="rupee" label="Total spent" value={money(d.totalSpentPaise, { compact: true })} sub="Wash + shop, after refunds" tone="gold" />
            <StatCard icon="star" label="Reviews due" value={d.reviewsDue} sub={d.reviewsDue ? <Link className="link" to="/dashboard/history">Rate your service</Link> : 'All caught up'} tone="red" />
          </div>
          <div className="dash-grid">
            <div className="stack">
              <div className="card">
                <div className="card-title"><h3>Upcoming bookings</h3><Link className="link text-small" to="/dashboard/bookings">See all</Link></div>
                <div className="booking-list">{upcoming.data?.length ? upcoming.data.slice(0, 3).map((b) => <BookingCard key={b.id} booking={b} onChanged={() => { upcoming.reload(); q.reload(); }} />)
                  : <EmptyState icon="calendar" title="Nothing scheduled" text="Book a wash or detailing session in under a minute." action={<Link className="btn btn-primary btn-sm" to="/book">Book now</Link>} />}</div>
              </div>
              <div className="card">
                <div className="card-title"><h3>Recent orders</h3><Link className="link text-small" to="/dashboard/orders">See all</Link></div>
                <div className="booking-list">{orders.data?.length ? orders.data.slice(0, 2).map((o) => <OrderCard key={o.id} order={o} onChanged={orders.reload} />)
                  : <EmptyState icon="package" title="No orders yet" text="Seat covers, dashcams, care kits and more." action={<Link className="btn btn-primary btn-sm" to="/shop">Visit the shop</Link>} />}</div>
              </div>
            </div>
            <div className="stack">
              <div className="card">
                <h3>Next appointment</h3>
                {next ? (
                  <>
                    <div className="next-booking mt-2">
                      <div className="date-box"><small>{new Date(`${next.bookingDate}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</small><b>{new Date(`${next.bookingDate}T00:00:00`).getDate()}</b></div>
                      <div><b>{next.service.name}</b><div className="text-small text-muted">{slotText(next.slot)}<br />{next.vehicle.brand} {next.vehicle.model} · <StatusBadge status={next.status} /></div></div>
                    </div>
                    <Link className="btn btn-dark btn-sm mt-2" to={`/bookings/${next.id}`}>Manage booking</Link>
                  </>
                ) : <p className="text-muted mb-0 mt-1">No confirmed appointment yet.</p>}
              </div>
              <div className="card">
                <div className="card-title"><h3>Offers for you</h3><Link className="link text-small" to="/dashboard/offers">All offers</Link></div>
                {d.offers.length ? d.offers.slice(0, 3).map((o) => (
                  <div key={o.code} className="flex between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <div><b>{o.title}</b><div className="text-small text-muted">{o.description}</div></div>
                    <button className="code-chip" onClick={() => copy(o.code)}>{o.code}</button>
                  </div>)) : <p className="text-muted mb-0">No offers right now.</p>}
              </div>
            </div>
          </div>
        </>
      );
    }}</AsyncView>
  );
}

function Bookings() {
  const q = useApi('/api/bookings?scope=upcoming');
  return (
    <>
      <PanelHead title="Upcoming bookings" subtitle="Pay, reschedule or cancel your upcoming services.">{NEW_BOOKING}</PanelHead>
      <AsyncView query={q}>{(list) => (
        <div className="booking-list">{list.length ? list.map((b) => <BookingCard key={b.id} booking={b} onChanged={q.reload} />)
          : <EmptyState icon="calendar" title="No upcoming bookings" text="Your next shine is just a few clicks away." action={<Link className="btn btn-primary" to="/book">Book a service</Link>} />}</div>
      )}</AsyncView>
    </>
  );
}

function History() {
  const q = useApi('/api/bookings?scope=all');
  const [filter, setFilter] = useState('');
  return (
    <>
      <PanelHead title="Booking history" subtitle="Every booking with its status, bill and invoice.">
        <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="confirmed">Confirmed</option><option value="pending_payment">Awaiting payment</option>
        </select>
      </PanelHead>
      <AsyncView query={q}>{(list) => (
        <DataTable rows={list.filter((b) => !filter || b.status === filter)} empty={{ icon: 'clock', title: 'No bookings yet' }} columns={[
          { label: 'Booking', render: (b) => <Link className="link mono" to={`/bookings/${b.id}`}>{b.code}</Link> },
          { label: 'Service', render: (b) => b.service.name },
          { label: 'Date', render: (b) => <>{formatDateShort(b.bookingDate)}<span className="cell-sub">{slotText(b.slot)}</span></> },
          { label: 'Vehicle', render: (b) => <>{b.vehicle.brand} {b.vehicle.model}<span className="cell-sub">{b.vehicle.registrationNo}</span></> },
          { label: 'Status', render: (b) => <StatusBadge status={b.status} /> },
          { label: 'Payment', render: (b) => <><PillBadge value={b.paymentStatus} />{b.refund && <span className="cell-sub">{b.refund.percent}% = {money(b.refund.amountPaise)}</span>}</> },
          { label: 'Amount', num: true, render: (b) => <b>{money(b.bill.totalPaise)}</b> },
          { label: '', render: (b) => <div className="actions"><BookingActions booking={b} onChanged={q.reload} showView={false} /></div> },
        ]} />
      )}</AsyncView>
    </>
  );
}

function Orders() {
  const q = useApi('/api/orders');
  return (
    <>
      <PanelHead title="My orders" subtitle="Track deliveries, download invoices, cancel or return items."><Link className="btn btn-primary btn-sm" to="/shop"><Icon name="store" size="sm" /> Shop</Link></PanelHead>
      <AsyncView query={q}>{(list) => (
        <div className="booking-list">{list.length ? list.map((o) => <OrderCard key={o.id} order={o} onChanged={q.reload} />)
          : <EmptyState icon="package" title="No orders yet" text="Find accessories that fit your car." action={<Link className="btn btn-primary" to="/shop">Visit the shop</Link>} />}</div>
      )}</AsyncView>
    </>
  );
}

function Wishlist() {
  const q = useApi('/api/me/wishlist');
  const toast = useToast();
  const remove = async (p) => { const r = await api.del(`/api/me/wishlist/${p.id}`); toast.success(r.message); q.setData(r.wishlist); };
  return (
    <>
      <PanelHead title="Wishlist" subtitle="Products you saved for later." />
      <AsyncView query={q}>{(list) => (list.length
        ? <div className="grid grid-3 product-grid">{list.map((p) => <ProductCard key={p.id} product={p} onRemove={remove} />)}</div>
        : <EmptyState icon="heart" title="Your wishlist is empty" text="Tap the heart on any product to save it here." action={<Link className="btn btn-primary" to="/shop">Browse products</Link>} />)}</AsyncView>
    </>
  );
}

function Addresses() {
  const q = useApi('/api/me/addresses');
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const save = async (data) => {
    const r = editing.id ? await api.put(`/api/me/addresses/${editing.id}`, data) : await api.post('/api/me/addresses', data);
    toast.success(r.message); q.reload();
  };
  const remove = async (a) => {
    if (!(await confirm({ title: 'Remove address?', message: `${a.label}: ${a.line1}, ${a.city}`, confirmText: 'Remove', danger: true }))) return;
    try { const r = await api.del(`/api/me/addresses/${a.id}`); toast.success(r.message); q.reload(); } catch (err) { toast.error(err.message); }
  };
  return (
    <>
      <PanelHead title="Delivery addresses" subtitle="Used at checkout for accessory orders."><button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> Add address</button></PanelHead>
      <AsyncView query={q}>{(list) => (list.length ? (
        <div className="grid grid-3">{list.map((a) => (
          <div className="card card-sm" key={a.id}>
            <div className="flex between"><b>{a.label}</b>{a.isDefault && <span className="badge badge-blue">Default</span>}</div>
            <p className="text-small mt-1 mb-2">{a.fullName} · {a.phone}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.city}, {a.state} {a.pincode}</p>
            <div className="flex"><button className="btn btn-dark btn-sm" onClick={() => setEditing(a)}><Icon name="edit" size="sm" /> Edit</button>
              <button className="btn btn-danger btn-sm" aria-label="Remove address" onClick={() => remove(a)}><Icon name="trash" size="sm" /></button></div>
          </div>))}</div>
      ) : <EmptyState icon="map-pin" title="No saved addresses" text="Add one now or during checkout." />)}</AsyncView>
      {editing && <FormModal title={editing.id ? 'Edit address' : 'Add address'} fields={ADDRESS_FIELDS} schema={schemas.address}
        initial={editing.id ? editing : { label: 'Home', state: 'Maharashtra', isDefault: false }} onClose={() => setEditing(null)} onSubmit={save} />}
    </>
  );
}

function Vehicles() {
  const q = useApi('/api/me/vehicles');
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const fields = [
    { name: 'vehicleType', label: 'Vehicle type', type: 'select', options: VEHICLE_TYPES.map((t) => ({ value: t, label: vehicleLabel(t) })) },
    { name: 'registrationNo', label: 'Registration number', placeholder: 'MH12AB1234' },
    { name: 'brand', label: 'Brand', placeholder: 'Hyundai' }, { name: 'model', label: 'Model', placeholder: 'Creta' },
    { name: 'color', label: 'Colour (optional)', span: 2 },
  ];
  const save = async (data) => {
    const r = editing.id ? await api.put(`/api/me/vehicles/${editing.id}`, data) : await api.post('/api/me/vehicles', data);
    toast.success(r.message); q.reload();
  };
  const remove = async (v) => {
    if (!(await confirm({ title: 'Remove vehicle?', message: `${v.brand} ${v.model} (${v.registrationNo}) will be removed. Past bookings are kept.`, confirmText: 'Remove', danger: true }))) return;
    try { const r = await api.del(`/api/me/vehicles/${v.id}`); toast.success(r.message); q.reload(); } catch (err) { toast.error(err.message); }
  };
  return (
    <>
      <PanelHead title="My vehicles" subtitle="Saved vehicles make booking faster."><button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> Add vehicle</button></PanelHead>
      <AsyncView query={q}>{(list) => (list.length ? (
        <div className="grid grid-3">{list.map((v) => (
          <div className="card card-sm" key={v.id}>
            <div className="vehicle-card"><div className="v-icon"><Icon name={v.vehicleType === 'bike' ? 'bike' : 'car'} /></div>
              <div><b>{v.brand} {v.model}</b><div className="text-small text-muted">{vehicleLabel(v.vehicleType)}{v.color ? ` · ${v.color}` : ''}</div><span className="plate mt-1">{v.registrationNo}</span></div></div>
            <div className="flex mt-2"><Link className="btn btn-primary btn-sm" to={`/book?vehicle=${v.vehicleType}`}>Book</Link>
              <button className="btn btn-dark btn-sm" onClick={() => setEditing(v)}><Icon name="edit" size="sm" /> Edit</button>
              <button className="btn btn-danger btn-sm" aria-label="Remove vehicle" onClick={() => remove(v)}><Icon name="trash" size="sm" /></button></div>
          </div>))}</div>
      ) : <EmptyState icon="car" title="No saved vehicles" text="Add your car or bike to book faster." />)}</AsyncView>
      {editing && <FormModal title={editing.id ? 'Edit vehicle' : 'Add vehicle'} fields={fields} schema={schemas.vehicle}
        initial={editing.id ? { ...editing, color: editing.color || '' } : { vehicleType: 'sedan' }} onClose={() => setEditing(null)} onSubmit={save}
        transform={(v) => ({ ...v, registrationNo: (v.registrationNo || '').toUpperCase() })} />}
    </>
  );
}

function Payments() {
  const q = useApi('/api/payments');
  return (
    <>
      <PanelHead title="Payments" subtitle="Every payment attempt with its transaction reference and refund status." />
      <AsyncView query={q}>{(list) => (
        <DataTable rows={list} empty={{ icon: 'credit-card', title: 'No payments yet' }} columns={[
          { label: 'Date', render: (p) => formatDateTime(p.createdAt) },
          { label: 'For', render: (p) => <Link className="link mono" to={p.purpose === 'booking' ? `/bookings/${p.bookingId}` : `/orders/${p.orderId}`}>{p.targetCode}</Link> },
          { label: 'Method', render: (p) => <>{p.methodLabel || '-'}<span className="cell-sub">{p.methodDetail || ''}</span></> },
          { label: 'Reference', render: (p) => <><span className="mono">{p.paymentRef}</span><span className="cell-sub mono">{p.gatewayPaymentId || ''}</span></> },
          { label: 'Status', render: (p) => <><PillBadge value={p.status} />{p.failureReason && <span className="cell-sub">{p.failureReason}</span>}{p.refund && <span className="cell-sub">Refund {money(p.refund.amountPaise)} · {p.refund.status}</span>}</> },
          { label: 'Amount', num: true, render: (p) => <b>{money(p.amountPaise)}</b> },
        ]} />
      )}</AsyncView>
    </>
  );
}

function Offers() {
  const q = useApi('/api/offers');
  return (
    <>
      <PanelHead title="Offers" subtitle="Tap a code to copy it, then apply it at booking or checkout." />
      <AsyncView query={q}>{(list) => (list.length ? <div className="grid grid-3">{list.map((o) => <OfferCard key={o.code} coupon={o} />)}</div>
        : <EmptyState icon="gift" title="No active offers" text="Check back soon for seasonal offers." />)}</AsyncView>
    </>
  );
}

function Reviews() {
  const q = useApi('/api/reviews/mine');
  return (
    <>
      <PanelHead title="My reviews" subtitle="Service reviews and verified-buyer product reviews. Reviews appear publicly after moderation." />
      <AsyncView query={q}>{(list) => (list.length ? (
        <div className="grid grid-2">{list.map((r) => (
          <div className="card card-sm" key={`${r.kind}-${r.id}`}>
            <div className="flex between"><Stars rating={r.rating} /><PillBadge value={r.status} /></div>
            <h4 className="mt-2 mb-1">{r.title}</h4>
            <p className="text-small text-muted mb-1">{r.kind === 'product' ? <>Product · <Link className="link" to={`/shop/${r.productSlug}`}>{r.productName}</Link></> : <>Service · {r.serviceName || ''} <span className="mono">{r.bookingCode}</span></>}</p>
            <p className="text-small mb-0">{r.comment}</p>
            {r.adminReply && <p className="text-small mt-2 mb-0" style={{ color: 'var(--gold-2)' }}><b>CarZone:</b> {r.adminReply}</p>}
          </div>))}</div>
      ) : <EmptyState icon="star" title="No reviews yet" text="After a completed service or a delivered order you can leave a review." />)}</AsyncView>
    </>
  );
}

function Profile() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const profile = useForm(schemas.profile, { name: user.name, phone: user.phone || '', address: user.address || '', city: user.city || '', pincode: user.pincode || '' });
  const pw = useForm(schemas.changePassword, { currentPassword: '', newPassword: '' });
  const saveProfile = profile.handleSubmit(async (data) => { const r = await api.put('/api/me/profile', data); setUser(r.user); toast.success(r.message); });
  const savePw = pw.handleSubmit(async (data) => { const r = await api.put('/api/auth/password', data); toast.success(r.message); pw.reset(); });
  return (
    <>
      <PanelHead title="Profile & security" subtitle={`Signed in as ${user.email}`} />
      <div className="grid grid-2">
        <form className="card" onSubmit={saveProfile} noValidate>
          <h3>Personal details</h3>
          <div className="form-grid">
            <FormField label="Full name" span={2} {...profile.field('name')} />
            <FormField label="Mobile number" {...profile.field('phone')} />
            <FormField label="PIN code" {...profile.field('pincode')} />
            <FormField label="Address" span={2} {...profile.field('address')} />
            <FormField label="City" {...profile.field('city')} />
          </div>
          <button className={`btn btn-primary mt-3 ${profile.submitting ? 'is-loading' : ''}`} type="submit">Save profile</button>
        </form>
        <form className="card" onSubmit={savePw} noValidate>
          <h3>Change password</h3>
          <div className="stack">
            <FormField label="Current password" type="password" autoComplete="current-password" {...pw.field('currentPassword')} />
            <FormField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters with a letter and a number." {...pw.field('newPassword')} />
          </div>
          <button className={`btn btn-dark mt-3 ${pw.submitting ? 'is-loading' : ''}`} type="submit"><Icon name="lock" size="sm" /> Update password</button>
          <p className="text-small text-muted mt-3 mb-0">Changing your password signs you out on all other devices.</p>
        </form>
      </div>
    </>
  );
}

const SECTIONS = { overview: Overview, bookings: Bookings, history: History, vehicles: Vehicles, orders: Orders, wishlist: Wishlist, addresses: Addresses, payments: Payments, offers: Offers, reviews: Reviews, profile: Profile };

export default function CustomerDashboard() {
  const params = useParams();
  const section = SECTIONS[params['*']] ? params['*'] : 'overview';
  const { count } = useCart();
  useDocumentTitle(`${ITEMS.find((i) => i.id === section).label} - My CarZone`);
  const Section = SECTIONS[section];
  return (
    <AppShell base="/dashboard" items={ITEMS} active={section} roleLabel="Customer account"
      topActions={<Link className="btn btn-dark btn-sm" to="/cart"><Icon name="cart" size="sm" /><span>Cart{count ? ` (${count})` : ''}</span></Link>}>
      <Section />
    </AppShell>
  );
}
