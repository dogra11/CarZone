/**
 * pages/admin/FinanceSections.jsx - Offers & coupons, payments (every attempt incl.
 * failures, with gateway IDs), refunds (process -> provider refund for Razorpay, manual for
 * COD) and the report centre (JSON preview, CSV export, printable page).
 */
import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApi } from '../../hooks/useApi.js';
import { money, formatDateShort, formatDateTime, methodLabel, isoDate, shiftDays } from '../../utils/format.js';
import { PAYMENT_STATUSES, STORE_PAYMENT_METHODS, REPORT_TYPES, schemas } from '../../utils/shared.js';
import { PanelHead } from '../../components/AppShell.jsx';
import DataTable from '../../components/DataTable.jsx';
import { PillBadge } from '../../components/StatusBadge.jsx';
import FormModal from '../../components/FormModal.jsx';
import Modal from '../../components/Modal.jsx';
import { AsyncView } from '../../components/EmptyState.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import { api, qs, rupees, useAction, useDebounced, Select, SearchBox } from './helpers.jsx';

const targetLink = (x) => (x.purpose === 'booking' ? `/bookings/${x.bookingId}` : `/orders/${x.orderId}`);
const STATUS_TEXT = { created: 'Created', pending: 'Pending', success: 'Success', failed: 'Failed', cancelled: 'Cancelled', refund_pending: 'Refund pending', refunded: 'Refunded' };

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------
export function Offers() {
  const q = useApi('/api/admin/coupons');
  const services = useApi('/api/admin/services');
  const [editing, setEditing] = useState(null);
  const run = useAction();
  const toast = useToast();
  const today = isoDate(new Date());
  const state = (c) => {
    if (!c.isActive) return <span className="badge badge-muted">Inactive</span>;
    if (c.validUntil < today) return <span className="badge badge-danger">Expired</span>;
    if (c.validFrom > today) return <span className="badge badge-blue">Scheduled</span>;
    if (c.usageLimit && c.usedCount >= c.usageLimit) return <span className="badge badge-warning">Used up</span>;
    return <span className="badge badge-success">Live</span>;
  };
  const fields = [
    { name: 'code', label: 'Code', placeholder: 'SUMMER20' },
    { name: 'title', label: 'Title', placeholder: 'Summer special - 20% off' },
    { name: 'description', label: 'Description', type: 'textarea', rows: 2, span: 2 },
    { name: 'appliesTo', label: 'Valid on', type: 'select', options: [{ value: 'both', label: 'Car wash + store' }, { value: 'wash', label: 'Car wash bookings only' }, { value: 'store', label: 'Accessory orders only' }] },
    { name: 'serviceId', label: 'Only for service (wash)', type: 'select', options: [{ value: '', label: 'Any service' }, ...(services.data || []).map((s) => ({ value: s.id, label: s.name }))] },
    { name: 'discountType', label: 'Discount type', type: 'select', options: [{ value: 'percent', label: 'Percentage (%)' }, { value: 'flat', label: 'Flat amount (₹)' }] },
    { name: 'discountValue', label: 'Discount value', type: 'number', min: 1, hint: 'Percent (1-90) or rupees' },
    { name: 'maxDiscount', label: 'Max discount (₹, optional)', type: 'number', min: 1, step: '0.01' },
    { name: 'minOrder', label: 'Minimum order (₹)', type: 'number', min: 0, step: '0.01' },
    { name: 'validFrom', label: 'Valid from', type: 'date' },
    { name: 'validUntil', label: 'Valid until', type: 'date' },
    { name: 'usageLimit', label: 'Total uses (optional)', type: 'number', min: 1 },
    { name: 'perUserLimit', label: 'Uses per customer', type: 'number', min: 1 },
    { name: 'isActive', label: 'Status', type: 'switch', text: 'Active', span: 2 },
  ];
  return (
    <>
      <PanelHead title="Offers & coupons" subtitle="One coupon engine for wash bookings and store orders."><button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> New offer</button></PanelHead>
      <AsyncView query={q}>{(list) => (
        <DataTable rows={list} empty={{ icon: 'tag', title: 'No offers yet' }} columns={[
          { label: 'Code', render: (c) => <><span className="code-chip">{c.code}</span><span className="cell-sub">{c.title}</span></> },
          { label: 'Discount', render: (c) => <><span className="strong">{c.discountType === 'percent' ? `${c.discountValue}%` : money(c.discountValue, { compact: true })}</span>
            <span className="cell-sub">{c.maxDiscountPaise ? `max ${money(c.maxDiscountPaise, { compact: true })} ` : ''}{c.minOrderPaise ? `min ${money(c.minOrderPaise, { compact: true })}` : ''}</span></> },
          { label: 'Valid on', render: (c) => <><span className={`badge ${c.appliesTo === 'store' ? 'badge-gold' : c.appliesTo === 'wash' ? 'badge-blue' : 'badge-violet'} no-dot`}>{c.appliesTo === 'both' ? 'Wash + store' : c.appliesTo === 'wash' ? 'Car wash' : 'Store'}</span>{c.serviceName && <span className="cell-sub">{c.serviceName}</span>}</> },
          { label: 'Validity', render: (c) => `${formatDateShort(c.validFrom)} - ${formatDateShort(c.validUntil)}` },
          { label: 'Usage', num: true, render: (c) => <>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ''}<span className="cell-sub">{c.perUserLimit} per user</span></> },
          { label: 'Status', render: state },
          { label: '', render: (c) => <div className="actions"><button className="btn btn-dark btn-sm" aria-label="Edit" onClick={() => setEditing(c)}><Icon name="edit" size="sm" /></button>
            <button className="btn btn-danger btn-sm" aria-label="Delete" onClick={() => run({ title: `Delete ${c.code}?`, message: 'Used coupons cannot be deleted - deactivate them instead.', confirmText: 'Delete', danger: true, request: () => api.del(`/api/admin/coupons/${c.id}`), done: q.reload })}><Icon name="trash" size="sm" /></button></div> },
        ]} />
      )}</AsyncView>
      {editing && <FormModal size="lg" title={editing.id ? `Edit ${editing.code}` : 'New offer'} fields={fields} schema={schemas.adminCoupon}
        initial={editing.id ? { ...editing, discountValue: editing.discountType === 'flat' ? editing.discountValue / 100 : editing.discountValue, maxDiscount: rupees(editing.maxDiscountPaise), minOrder: rupees(editing.minOrderPaise), serviceId: editing.serviceId || '', usageLimit: editing.usageLimit || '' }
          : { discountType: 'percent', perUserLimit: 1, minOrder: 0, isActive: true, validFrom: today, appliesTo: 'both', serviceId: '' }}
        transform={(v) => ({ ...v, code: String(v.code || '').toUpperCase() })} onClose={() => setEditing(null)}
        onSubmit={async (data) => { const r = editing.id ? await api.put(`/api/admin/coupons/${editing.id}`, data) : await api.post('/api/admin/coupons', data); toast.success(r.message); q.reload(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
function PaymentDialog({ id, onClose }) {
  const q = useApi(`/api/admin/payments/${id}`);
  const p = q.data;
  return (
    <Modal title={p ? `Transaction ${p.paymentRef}` : 'Transaction'} size="lg" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Close</button>}>
      <AsyncView query={q}>{() => (
        <>
          <div className="flex flex-wrap mb-3"><PillBadge value={p.status} /><span className="badge badge-muted no-dot">{p.gateway}</span><b style={{ marginLeft: 'auto' }}>{money(p.amountPaise)} {p.currency}</b></div>
          <div className="grid grid-2">
            <dl className="kv"><dt>For</dt><dd><Link className="link mono" to={targetLink(p)}>{p.targetCode}</Link> ({p.purpose})</dd><dt>Customer</dt><dd>{p.customerName}<br /><span className="text-small text-muted">{p.customerEmail}</span></dd>
              <dt>Method</dt><dd>{p.methodLabel || '-'}{p.methodDetail && <><br /><span className="text-small text-muted">{p.methodDetail}</span></>}</dd><dt>Attempts</dt><dd>{p.attempts}</dd></dl>
            <dl className="kv"><dt>Gateway order</dt><dd className="mono">{p.gatewayOrderId || '-'}</dd><dt>Gateway payment</dt><dd className="mono">{p.gatewayPaymentId || '-'}</dd>
              <dt>Created</dt><dd>{formatDateTime(p.createdAt)}</dd><dt>Verified</dt><dd>{p.verifiedAt ? formatDateTime(p.verifiedAt) : '-'}</dd>
              {p.expiresAt && <><dt>Expires</dt><dd>{formatDateTime(p.expiresAt)}</dd></>}</dl>
          </div>
          {p.failureReason && <div className="alert alert-danger mt-2"><Icon name="x-circle" /><p>{p.failureReason}</p></div>}
          {p.refund && <div className={`alert ${p.refund.status === 'processed' ? 'alert-success' : 'alert-warning'} mt-2`}><Icon name="refresh" />
            <p><b>Refund {money(p.refund.amountPaise)} ({p.refund.percent}%)</b> · {p.refund.status}{p.refund.ref ? ` · ${p.refund.ref}` : ''}{p.refund.manual ? ' · manual (cash/bank)' : ''}</p></div>}
          <p className="text-small text-muted mt-3 mb-0"><Icon name="lock" size="sm" /> Card numbers and CVV are never stored - only the masked detail shown above.</p>
        </>
      )}</AsyncView>
    </Modal>
  );
}

export function Payments() {
  const [f, setF] = useState({ status: '', method: '', gateway: '', purpose: '', search: '' });
  const search = useDebounced(f.search);
  const q = useApi(`/api/admin/payments${qs({ ...f, search })}`);
  const [viewing, setViewing] = useState(null);
  return (
    <>
      <PanelHead title="Payments" subtitle="Every payment attempt (successful, failed, pending) across bookings and orders.">
        <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['', 'All statuses'], ...PAYMENT_STATUSES.filter((s) => s !== 'created').map((s) => [s, STATUS_TEXT[s]])]} />
        <Select label="Method" value={f.method} onChange={(v) => setF({ ...f, method: v })} options={[['', 'All methods'], ...STORE_PAYMENT_METHODS.map((m) => [m, methodLabel(m)])]} />
        <Select label="Gateway" value={f.gateway} onChange={(v) => setF({ ...f, gateway: v })} options={[['', 'All gateways'], ['simulated', 'Simulated'], ['razorpay', 'Razorpay'], ['cod', 'Cash on delivery']]} />
        <Select label="Purpose" value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} options={[['', 'Wash + store'], ['booking', 'Wash bookings'], ['order', 'Store orders']]} />
        <SearchBox placeholder="Reference, code, customer" value={f.search} onChange={(v) => setF({ ...f, search: v })} />
      </PanelHead>
      <AsyncView query={q}>{(list) => {
        const ok = list.filter((p) => ['success', 'refund_pending', 'refunded'].includes(p.status));
        const failed = list.filter((p) => p.status === 'failed');
        return (
          <>
            <div className="summary-strip">
              <div><span>Attempts</span><b>{list.length}</b></div><div><span>Successful</span><b>{ok.length}</b></div><div><span>Failed</span><b>{failed.length}</b></div>
              <div><span>Success rate</span><b>{ok.length + failed.length ? `${Math.round((ok.length / (ok.length + failed.length)) * 100)}%` : '-'}</b></div>
              <div><span>Collected</span><b>{money(ok.reduce((s, p) => s + p.amountPaise, 0))}</b></div>
            </div>
            <DataTable rows={list} empty={{ icon: 'credit-card', title: 'No payments match these filters' }} columns={[
              { label: 'Date', render: (p) => formatDateTime(p.createdAt) },
              { label: 'Reference', render: (p) => <><span className="mono">{p.paymentRef}</span><span className="cell-sub">{p.gateway}</span></> },
              { label: 'For', render: (p) => <><Link className="link mono" to={targetLink(p)}>{p.targetCode}</Link><span className="cell-sub">{p.purpose === 'booking' ? 'Car wash' : 'Store'}</span></> },
              { label: 'Customer', render: (p) => <>{p.customerName}<span className="cell-sub">{p.customerEmail}</span></> },
              { label: 'Method', render: (p) => <>{p.methodLabel || '-'}<span className="cell-sub">{p.methodDetail || ''}</span></> },
              { label: 'Status', render: (p) => <><PillBadge value={p.status} />{p.failureReason && <span className="cell-sub">{p.failureReason}</span>}</> },
              { label: 'Amount', num: true, render: (p) => <span className="strong">{money(p.amountPaise)}</span> },
              { label: '', render: (p) => <button className="btn btn-dark btn-sm" onClick={() => setViewing(p.id)}>Details</button> },
            ]} />
          </>
        );
      }}</AsyncView>
      {viewing && <PaymentDialog id={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------
export function Refunds({ refreshCounts }) {
  const [status, setStatus] = useState('');
  const q = useApi(`/api/admin/refunds${qs({ status })}`);
  const run = useAction();
  return (
    <>
      <PanelHead title="Refunds" subtitle="Created automatically for cancellations, approved returns and duplicate payments. Online refunds go back through the gateway; COD refunds are paid manually.">
        <Select label="Status" value={status} onChange={setStatus} options={[['', 'All refunds'], ['pending', 'Pending'], ['processed', 'Processed']]} />
      </PanelHead>
      <AsyncView query={q}>{(list) => {
        const pending = list.filter((r) => r.status === 'pending');
        return (
          <>
            <div className="summary-strip">
              <div><span>Pending</span><b>{pending.length}</b></div><div><span>Pending amount</span><b>{money(pending.reduce((s, r) => s + r.amountPaise, 0))}</b></div>
              <div><span>Processed</span><b>{list.length - pending.length}</b></div><div><span>Refunded total</span><b>{money(list.filter((r) => r.status === 'processed').reduce((s, r) => s + r.amountPaise, 0))}</b></div>
            </div>
            <DataTable rows={list} empty={{ icon: 'refresh', title: 'No refunds yet' }} columns={[
              { label: 'For', render: (r) => <><Link className="link mono" to={targetLink(r)}>{r.targetCode}</Link><span className="cell-sub">{formatDateTime(r.createdAt)}</span></> },
              { label: 'Customer', render: (r) => <>{r.customerName}<span className="cell-sub">{r.customerEmail}</span></> },
              { label: 'Original payment', render: (r) => <>{money(r.paidPaise)}<span className="cell-sub">{methodLabel(r.method)} · {r.methodDetail || ''} · {r.gateway}</span></> },
              { label: 'Reason', render: (r) => <><span className="strong">{r.percent}%</span><span className="cell-sub">{r.reason}</span></> },
              { label: 'Refund', num: true, render: (r) => <span className="strong">{money(r.amountPaise)}</span> },
              { label: 'Status', render: (r) => <><PillBadge value={r.status} />{r.manual && <span className="cell-sub">Manual (cash/bank)</span>}{r.refundRef && <span className="cell-sub mono">{r.refundRef}</span>}</> },
              { label: '', render: (r) => r.status === 'pending' && <button className="btn btn-success btn-sm" onClick={() => run({
                title: `Process refund for ${r.targetCode}?`,
                message: r.manual ? `Confirm that ${money(r.amountPaise)} was paid back to the customer in cash / bank transfer.` : `${money(r.amountPaise)} will be returned to the customer's ${methodLabel(r.method)} via ${r.gateway === 'razorpay' ? 'Razorpay' : 'the payment simulator'}.`,
                confirmText: 'Process refund', request: () => api.post(`/api/admin/refunds/${r.id}/process`), done: () => { q.reload(); refreshCounts(); },
              })}><Icon name="check" size="sm" /> Process</button> },
            ]} />
          </>
        );
      }}</AsyncView>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
const REPORT_META = {
  bookings: ['Bookings', 'calendar'], revenue: ['Revenue', 'rupee'], customers: ['Customers', 'users'], services: ['Popular services', 'sparkles'],
  payments: ['Payments', 'credit-card'], sales: ['Sales by product', 'package'], categories: ['Sales by category', 'grid'], orders: ['Orders', 'cart'], inventory: ['Inventory', 'layers'],
};

export function Reports() {
  const [s, setS] = useState({ type: 'revenue', from: shiftDays(-30), to: shiftDays(30) });
  const url = (format) => `/api/admin/reports/${s.type}?from=${s.from}&to=${s.to}&format=${format}`;
  const q = useApi(url('json'));
  return (
    <>
      <PanelHead title="Reports" subtitle="Car wash, store, payment and inventory reports for any period - export as CSV or print / save as PDF." />
      <div className="report-cards choice-grid">{REPORT_TYPES.map((t) => (
        <label className="choice" key={t}><input type="radio" name="reportType" checked={s.type === t} onChange={() => setS({ ...s, type: t })} />
          <span className="choice-box"><Icon name={REPORT_META[t]?.[1] || 'file-text'} /><span className="choice-title">{REPORT_META[t]?.[0] || t}</span></span></label>))}</div>
      <div className="card card-sm mb-3"><div className="flex flex-wrap" style={{ alignItems: 'flex-end' }}>
        <div className="field"><label htmlFor="r-from">From</label><input className="input" type="date" id="r-from" value={s.from} onChange={(e) => e.target.value && setS({ ...s, from: e.target.value })} /></div>
        <div className="field"><label htmlFor="r-to">To</label><input className="input" type="date" id="r-to" value={s.to} onChange={(e) => e.target.value && setS({ ...s, to: e.target.value })} /></div>
        <div className="flex flex-wrap" style={{ marginLeft: 'auto' }}>
          <a className="btn btn-gold btn-sm" href={url('csv')} download><Icon name="download" size="sm" /> Export CSV</a>
          <a className="btn btn-dark btn-sm" href={url('html')} target="_blank" rel="noopener noreferrer"><Icon name="printer" size="sm" /> Print / PDF</a>
        </div>
      </div></div>
      <AsyncView query={q}>{(r) => (
        <>
          <div className="summary-strip">{r.summary.map((x) => <div key={x.label}><span>{x.label}</span><b>{x.value}</b></div>)}</div>
          <DataTable rows={r.rows} rowKey={(row) => JSON.stringify(row)} empty={{ icon: 'file-text', title: 'No records in this period', text: 'Try a wider date range.' }}
            columns={r.columns.map((c) => ({ label: c.label, num: c.money, render: (row) => (c.money ? money(row[c.key] || 0) : String(row[c.key] ?? '-')) }))} />
        </>
      )}</AsyncView>
    </>
  );
}
