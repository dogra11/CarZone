/**
 * pages/admin/StoreSections.jsx - Accessories store management: products (CRUD,
 * compatibility, stock adjustments with a movement ledger), categories and orders
 * (status workflow PLACED -> PACKED -> SHIPPED -> OUT_FOR_DELIVERY -> DELIVERED, returns).
 */
import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApi } from '../../hooks/useApi.js';
import { money, formatDateShort, formatDateTime, slotText, formatDate } from '../../utils/format.js';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, schemas } from '../../utils/shared.js';
import { PanelHead } from '../../components/AppShell.jsx';
import DataTable from '../../components/DataTable.jsx';
import { OrderBadge, PillBadge } from '../../components/StatusBadge.jsx';
import FormModal from '../../components/FormModal.jsx';
import Modal from '../../components/Modal.jsx';
import { AsyncView } from '../../components/EmptyState.jsx';
import { Loader } from '../../components/Loader.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import Img from '../../components/Img.jsx';
import { OrderTracker } from '../OrderDetails.jsx';
import { api, qs, rupees, useAction, useDebounced, Select, SearchBox, ActiveBadge } from './helpers.jsx';

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
function stockBadge(p) {
  if (p.stock === 0) return <span className="badge badge-danger">Out of stock</span>;
  if (p.lowStock) return <span className="badge badge-warning">Low · {p.stock}</span>;
  return <span className="badge badge-success">{p.stock} in stock</span>;
}

/** Loads the full product (compatibility list) before opening the edit form. */
function ProductEditor({ id, categories, models, onClose, onSaved }) {
  const q = useApi(id ? `/api/admin/products/${id}` : null, { skip: !id });
  const toast = useToast();
  if (id && !q.data) return <Modal title="Loading product" onClose={onClose}>{q.error ? <p>{q.error.message}</p> : <Loader />}</Modal>;
  const p = q.data;
  const fields = [
    { name: 'name', label: 'Product name', span: 2 },
    { name: 'sku', label: 'SKU', placeholder: 'CZ-INT-099' },
    { name: 'brand', label: 'Brand' },
    { name: 'categoryId', label: 'Category', type: 'select', options: categories.map((c) => ({ value: c.id, label: c.name })) },
    { name: 'warranty', label: 'Warranty', placeholder: '6 months' },
    { name: 'price', label: 'Selling price (₹, incl. GST)', type: 'number', min: 1, step: '0.01' },
    { name: 'mrp', label: 'MRP (₹)', type: 'number', min: 1, step: '0.01' },
    ...(id ? [] : [{ name: 'openingStock', label: 'Opening stock', type: 'number', min: 0, max: 10000 }]),
    { name: 'image', label: 'Main image path', span: id ? 2 : 1, placeholder: '/assets/images/products/xyz-1.jpg', hint: 'Put the file in client/public/assets/images/products/' },
    { name: 'description', label: 'Description', type: 'textarea', span: 2 },
    { name: 'features', label: 'Key features (one per line)', type: 'textarea', rows: 4, span: 2 },
    { name: 'isUniversal', label: 'Fit', type: 'switch', text: 'Universal fit (fits all cars)' },
    { name: 'fitmentAvailable', label: 'Fitment', type: 'switch', text: 'Fitment at CarZone centre' },
    { name: 'compatibleModelIds', label: 'Compatible models (when not universal)', type: 'checkboxes', options: models.map((m) => ({ value: m.id, label: `${m.make} ${m.model}` })) },
    { name: 'isActive', label: 'Status', type: 'switch', text: 'Visible in shop' },
    { name: 'isFeatured', label: 'Featured', type: 'switch', text: 'Featured product' },
    { name: 'isDeal', label: 'Deal', type: 'switch', text: 'Deal of the day', span: 2 },
  ];
  const initial = p ? {
    ...p, price: rupees(p.pricePaise), mrp: rupees(p.mrpPaise), features: p.features.join('\n'), compatibleModelIds: p.compatibleModels.map((m) => m.id),
  } : { categoryId: categories[0]?.id, isUniversal: true, isActive: true, warranty: '6 months', openingStock: 10, compatibleModelIds: [], image: '/assets/images/products/' };
  return (
    <FormModal size="lg" title={p ? `Edit ${p.name}` : 'New product'} fields={fields} schema={schemas.adminProduct} initial={initial}
      submitText={p ? 'Save changes' : 'Create product'} onClose={onClose}
      transform={(v) => ({ ...v, features: String(v.features || '').split('\n').map((s) => s.trim()).filter(Boolean), sku: String(v.sku || '').toUpperCase(), compatibleModelIds: v.isUniversal ? [] : v.compatibleModelIds })}
      onSubmit={async (data) => { const r = p ? await api.put(`/api/admin/products/${p.id}`, data) : await api.post('/api/admin/products', data); toast.success(r.message); onSaved(); }} />
  );
}

function StockDialog({ product, onClose, onSaved }) {
  const q = useApi(`/api/admin/products/${product.id}`);
  const toast = useToast();
  const [adjusting, setAdjusting] = useState(false);
  return (
    <>
      <Modal title={`Inventory · ${product.name}`} size="lg" onClose={onClose}
        footer={<><button className="btn btn-ghost" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => setAdjusting(true)}><Icon name="plus" size="sm" /> Adjust stock</button></>}>
        <div className="flex flex-wrap mb-3"><span className="mono">{product.sku}</span>{stockBadge(q.data || product)}</div>
        <AsyncView query={q}>{(p) => (
          <DataTable rows={p.movements} empty={{ icon: 'package', title: 'No stock movements' }} columns={[
            { label: 'Date', render: (m) => formatDateTime(m.createdAt) },
            { label: 'Change', num: true, render: (m) => <b className={m.qtyChange < 0 ? 'text-danger' : 'text-success'}>{m.qtyChange > 0 ? `+${m.qtyChange}` : m.qtyChange}</b> },
            { label: 'Reason', render: (m) => <span className="badge badge-muted">{m.reason}</span> },
            { label: 'Reference', render: (m) => <>{m.reference}<span className="cell-sub">{m.createdBy || 'system'}</span></> },
          ]} />
        )}</AsyncView>
      </Modal>
      {adjusting && <FormModal title="Adjust stock" schema={schemas.stockAdjust} initial={{ change: '', note: '' }}
        intro={<p className="text-small text-muted">Use a positive number for a new delivery and a negative number for damaged / lost units. Stock can never go below zero.</p>}
        fields={[{ name: 'change', label: 'Change (+/- units)', type: 'number', min: -1000, max: 1000 }, { name: 'note', label: 'Note', placeholder: 'Supplier delivery #4512' }]}
        onClose={() => setAdjusting(false)}
        onSubmit={async (data) => { const r = await api.patch(`/api/admin/products/${product.id}/stock`, data); toast.success(r.message); q.reload(); onSaved(); }} />}
    </>
  );
}

export function Products() {
  const [f, setF] = useState({ search: '', category: '', stock: '' });
  const search = useDebounced(f.search);
  const q = useApi(`/api/admin/products${qs({ search, category: f.category, stock: f.stock })}`);
  const categories = useApi('/api/admin/categories');
  const models = useApi('/api/admin/car-models');
  const [editing, setEditing] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const run = useAction();
  return (
    <>
      <PanelHead title="Products & inventory" subtitle="Catalogue, prices, compatibility and stock levels.">
        <Select label="Category" value={f.category} onChange={(v) => setF({ ...f, category: v })} options={[['', 'All categories'], ...(categories.data || []).map((c) => [c.slug, c.name])]} />
        <Select label="Stock" value={f.stock} onChange={(v) => setF({ ...f, stock: v })} options={[['', 'All stock levels'], ['low', 'Low stock'], ['out', 'Out of stock']]} />
        <SearchBox placeholder="Name, SKU or brand" value={f.search} onChange={(v) => setF({ ...f, search: v })} />
        <button className="btn btn-primary btn-sm" disabled={!categories.data || !models.data} onClick={() => setEditing({})}><Icon name="plus" size="sm" /> New product</button>
      </PanelHead>
      <AsyncView query={q}>{(list) => (
        <>
          <div className="summary-strip">
            <div><span>Products</span><b>{list.length}</b></div>
            <div><span>Units in stock</span><b>{list.reduce((s, p) => s + p.stock, 0)}</b></div>
            <div><span>Low stock</span><b>{list.filter((p) => p.lowStock).length}</b></div>
            <div><span>Out of stock</span><b>{list.filter((p) => p.stock === 0).length}</b></div>
            <div><span>Stock value (MRP)</span><b>{money(list.reduce((s, p) => s + p.stock * p.mrpPaise, 0), { compact: true })}</b></div>
          </div>
          <DataTable rows={list} empty={{ icon: 'package', title: 'No products match these filters' }} columns={[
            { label: 'Product', render: (p) => <div className="cell-media"><Img src={p.image} alt="" /><div><span className="strong">{p.name}</span><span className="cell-sub"><span className="mono">{p.sku}</span> · {p.brand}</span></div></div> },
            { label: 'Category', render: (p) => p.categoryName },
            { label: 'Price', num: true, render: (p) => <><b>{money(p.pricePaise)}</b><span className="cell-sub">MRP {money(p.mrpPaise)} · {p.discountPercent}% off</span></> },
            { label: 'Stock', render: (p) => stockBadge(p) },
            { label: 'Sold', num: true, render: (p) => p.soldCount },
            { label: 'Status', render: (p) => <><ActiveBadge active={p.isActive} on="Live" off="Hidden" />{p.isDeal && <span className="badge badge-gold no-dot">Deal</span>}</> },
            { label: '', render: (p) => <div className="actions">
              <button className="btn btn-dark btn-sm" onClick={() => setStockFor(p)}><Icon name="package" size="sm" /> Stock</button>
              <button className="btn btn-dark btn-sm" aria-label="Edit" disabled={!categories.data || !models.data} onClick={() => setEditing(p)}><Icon name="edit" size="sm" /></button>
              <button className="btn btn-danger btn-sm" aria-label="Delete" onClick={() => run({ title: `Delete ${p.name}?`, message: 'Products that were ordered cannot be deleted - hide them instead.', confirmText: 'Delete', danger: true, request: () => api.del(`/api/admin/products/${p.id}`), done: q.reload })}><Icon name="trash" size="sm" /></button></div> },
          ]} />
        </>
      )}</AsyncView>
      {editing && <ProductEditor id={editing.id} categories={categories.data} models={models.data} onClose={() => setEditing(null)} onSaved={q.reload} />}
      {stockFor && <StockDialog product={stockFor} onClose={() => setStockFor(null)} onSaved={q.reload} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
export function Categories() {
  const q = useApi('/api/admin/categories');
  const [editing, setEditing] = useState(null);
  const run = useAction();
  const toast = useToast();
  return (
    <>
      <PanelHead title="Categories" subtitle="Shop categories with banner images."><button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> New category</button></PanelHead>
      <AsyncView query={q}>{(list) => (
        <DataTable rows={list} empty={{ icon: 'grid', title: 'No categories' }} columns={[
          { label: 'Category', render: (c) => <div className="cell-media"><Img src={c.image} alt="" /><div><span className="strong">{c.name}</span><span className="cell-sub">{c.description}</span></div></div> },
          { label: 'Slug', render: (c) => <span className="mono text-small">{c.slug}</span> },
          { label: 'Products', num: true, render: (c) => c.productCount },
          { label: 'Status', render: (c) => <ActiveBadge active={c.isActive} /> },
          { label: '', render: (c) => <div className="actions"><button className="btn btn-dark btn-sm" aria-label="Edit" onClick={() => setEditing(c)}><Icon name="edit" size="sm" /></button>
            <button className="btn btn-danger btn-sm" aria-label="Delete" onClick={() => run({ title: `Delete ${c.name}?`, message: 'Categories that still contain products cannot be deleted.', confirmText: 'Delete', danger: true, request: () => api.del(`/api/admin/categories/${c.id}`), done: q.reload })}><Icon name="trash" size="sm" /></button></div> },
        ]} />
      )}</AsyncView>
      {editing && <FormModal title={editing.id ? `Edit ${editing.name}` : 'New category'} schema={schemas.adminCategory}
        fields={[{ name: 'name', label: 'Name', span: 2 }, { name: 'description', label: 'Description', type: 'textarea', rows: 2, span: 2 },
          { name: 'image', label: 'Banner image path', span: 2, placeholder: '/assets/images/categories/interior.jpg' }, { name: 'isActive', label: 'Status', type: 'switch', text: 'Visible in shop', span: 2 }]}
        initial={editing.id ? editing : { isActive: true, image: '/assets/images/categories/' }} onClose={() => setEditing(null)}
        onSubmit={async (data) => { const r = editing.id ? await api.put(`/api/admin/categories/${editing.id}`, data) : await api.post('/api/admin/categories', data); toast.success(r.message); q.reload(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const NEXT = {
  pending_payment: ['cancelled'], placed: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'], shipped: ['out_for_delivery'],
  out_for_delivery: ['delivered'], delivered: [], return_requested: ['returned', 'delivered'], returned: [], cancelled: [],
};
const NEXT_LABEL = { packed: 'Mark packed', shipped: 'Mark shipped', out_for_delivery: 'Out for delivery', delivered: 'Mark delivered', cancelled: 'Cancel order', returned: 'Approve return' };
const labelFor = (from, to) => (from === 'return_requested' && to === 'delivered' ? 'Reject return' : NEXT_LABEL[to]);

function OrderDialog({ id, onClose, onChanged }) {
  const q = useApi(`/api/admin/orders/${id}`);
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const setStatus = async (status) => {
    setBusy(status);
    try {
      const r = await api.patch(`/api/admin/orders/${id}/status`, { status, ...(note ? { note } : {}) });
      toast.success(r.message, 'Order updated'); onChanged(); q.reload(); setBusy(''); setNote('');
    } catch (err) { toast.error(err.message); setBusy(''); }
  };
  const o = q.data;
  return (
    <Modal title={o ? `Order ${o.code}` : 'Order'} size="lg" onClose={onClose}
      footer={o && <><Link className="btn btn-ghost" to={`/orders/${o.id}`}>Open full page</Link>
        {o.actions.invoice && <a className="btn btn-dark" href={`/api/orders/${o.id}/invoice`} target="_blank" rel="noopener noreferrer"><Icon name="receipt" size="sm" /> Invoice</a>}
        <button className="btn btn-primary" onClick={onClose}>Done</button></>}>
      <AsyncView query={q}>{() => (
        <>
          <div className="flex flex-wrap mb-2"><OrderBadge status={o.status} /><PillBadge value={o.paymentMethod === 'cod' && o.paymentStatus !== 'success' ? 'cod' : o.paymentStatus} /><span className="text-small text-muted">{o.paymentMethodLabel}</span></div>
          {o.status !== 'pending_payment' && <OrderTracker order={o} />}
          <div className="grid grid-2 mt-3">
            <dl className="kv"><dt>Customer</dt><dd>{o.customer.name}</dd><dt>Email</dt><dd>{o.customer.email}</dd><dt>Ship to</dt><dd>{o.shipping.name}, {o.shipping.phone}<br />{o.shipping.line1}{o.shipping.line2 ? `, ${o.shipping.line2}` : ''}, {o.shipping.city}, {o.shipping.state} {o.shipping.pincode}</dd></dl>
            <dl className="kv"><dt>Total</dt><dd><b>{money(o.totals.totalPaise)}</b></dd><dt>Coupon</dt><dd>{o.totals.couponCode || '-'}</dd><dt>Placed</dt><dd>{formatDateTime(o.createdAt)}</dd>
              {o.fitment && <><dt>Fitment</dt><dd>{formatDate(o.fitment.date)}, {slotText(o.fitment)}</dd></>}</dl>
          </div>
          <div className="mini-items mt-2">{o.items.map((i) => <div className="mini-item" key={i.productId}><Img src={i.image} alt="" /><div><b>{i.name}</b><small className="mono">{i.sku} · Qty {i.quantity}</small></div><span>{money(i.lineTotalPaise)}</span></div>)}</div>
          {o.cancelReason && <div className="alert alert-danger mt-2"><Icon name="x-circle" /><p>Cancelled: {o.cancelReason}</p></div>}
          {o.returnReason && <div className="alert alert-warning mt-2"><Icon name="refresh" /><p>Return reason: {o.returnReason}</p></div>}
          {NEXT[o.status].length > 0 && (
            <>
              <div className="field mt-3"><label htmlFor="order-note">Note for the timeline (courier / AWB, reason...)</label>
                <input className="input" id="order-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Shipped via BlueDart AWB 7781200" /></div>
              <div className="flex flex-wrap mt-2">{NEXT[o.status].map((s) => (
                <button key={s} className={`btn btn-sm ${s === 'cancelled' ? 'btn-danger' : s === 'delivered' && o.status !== 'return_requested' ? 'btn-success' : 'btn-primary'} ${busy === s ? 'is-loading' : ''}`} disabled={!!busy} onClick={() => setStatus(s)}>{labelFor(o.status, s)}</button>))}</div>
              {['cancelled', 'returned'].some((s) => NEXT[o.status].includes(s)) && <p className="text-small text-muted mt-2 mb-0">Cancelling or approving a return puts the items back in stock and creates a refund for online payments.</p>}
            </>
          )}
        </>
      )}</AsyncView>
    </Modal>
  );
}

export function Orders({ refreshCounts }) {
  const [f, setF] = useState({ status: '', search: '' });
  const search = useDebounced(f.search);
  const q = useApi(`/api/admin/orders${qs({ status: f.status, search })}`);
  const [viewing, setViewing] = useState(null);
  const run = useAction();
  const reload = () => { q.reload(); refreshCounts(); };
  return (
    <>
      <PanelHead title="Orders" subtitle="Pack, ship and deliver accessory orders; handle cancellations and returns.">
        <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[['', 'All statuses'], ...ORDER_STATUSES.map((s) => [s, ORDER_STATUS_LABELS[s]])]} />
        <SearchBox placeholder="Order code, customer, city" value={f.search} onChange={(v) => setF({ ...f, search: v })} />
      </PanelHead>
      <AsyncView query={q}>{(list) => (
        <>
          <p className="text-small text-muted">{list.length} order(s)</p>
          <DataTable rows={list} empty={{ icon: 'package', title: 'No orders match these filters' }} columns={[
            { label: 'Order', render: (o) => <><span className="mono strong">{o.code}</span><span className="cell-sub">{formatDateShort(o.createdAt)}</span></> },
            { label: 'Customer', render: (o) => <>{o.customer.name}<span className="cell-sub">{o.shipping.city}, {o.shipping.pincode}</span></> },
            { label: 'Items', num: true, render: (o) => <>{o.itemCount}{o.fitment && <span className="cell-sub">+ fitment</span>}</> },
            { label: 'Payment', render: (o) => <>{o.paymentMethodLabel}<span className="cell-sub"><PillBadge value={o.paymentMethod === 'cod' && o.paymentStatus !== 'success' ? 'cod' : o.paymentStatus} /></span></> },
            { label: 'Status', render: (o) => <OrderBadge status={o.status} /> },
            { label: 'Total', num: true, render: (o) => <span className="strong">{money(o.totals.totalPaise)}</span> },
            { label: '', render: (o) => <div className="actions">
              {NEXT[o.status].filter((s) => !['cancelled', 'returned'].includes(s) && o.status !== 'return_requested').map((s) => (
                <button key={s} className="btn btn-primary btn-sm" onClick={() => run({ skipConfirm: true, request: () => api.patch(`/api/admin/orders/${o.id}/status`, { status: s }), done: reload })}>{NEXT_LABEL[s]}</button>))}
              <button className="btn btn-dark btn-sm" onClick={() => setViewing(o.id)}>View</button></div> },
          ]} />
        </>
      )}</AsyncView>
      {viewing && <OrderDialog id={viewing} onClose={() => setViewing(null)} onChanged={reload} />}
    </>
  );
}
