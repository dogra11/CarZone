/**
 * pages/admin/PeopleSections.jsx - Users, review moderation (service reviews and
 * verified-buyer product reviews) and the contact-form inbox.
 */
import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { useApi } from '../../hooks/useApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { money, formatDateShort, formatDateTime, timeAgo } from '../../utils/format.js';
import { schemas } from '../../utils/shared.js';
import { PanelHead } from '../../components/AppShell.jsx';
import DataTable from '../../components/DataTable.jsx';
import { PillBadge } from '../../components/StatusBadge.jsx';
import FormModal from '../../components/FormModal.jsx';
import EmptyState, { AsyncView } from '../../components/EmptyState.jsx';
import Stars from '../../components/Stars.jsx';
import { useToast } from '../../components/Toast.jsx';
import Icon from '../../components/Icon.jsx';
import Img, { AVATAR_FALLBACK } from '../../components/Img.jsx';
import { api, qs, useAction, useDebounced, Select, SearchBox, ActiveBadge } from './helpers.jsx';

const ROLE_OPTIONS = [{ value: 'customer', label: 'Customer' }, { value: 'admin', label: 'Admin' }];

export function Users() {
  const { user: me } = useAuth();
  const [f, setF] = useState({ role: '', search: '' });
  const search = useDebounced(f.search);
  const q = useApi(`/api/admin/users${qs({ role: f.role, search })}`);
  const [editing, setEditing] = useState(null);
  const run = useAction();
  const toast = useToast();
  return (
    <>
      <PanelHead title="Users" subtitle="Customers and administrators.">
        <Select label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[['', 'All roles'], ['customer', 'Customers'], ['admin', 'Admins']]} />
        <SearchBox placeholder="Name, email or phone" value={f.search} onChange={(v) => setF({ ...f, search: v })} />
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({})}><Icon name="plus" size="sm" /> Add user</button>
      </PanelHead>
      <AsyncView query={q}>{(list) => (
        <DataTable rows={list} empty={{ icon: 'users', title: 'No users found' }} columns={[
          { label: 'User', render: (u) => <div className="cell-media"><Img className="avatar" src={u.avatar} fallback={AVATAR_FALLBACK} alt="" /><div><span className="strong">{u.name}</span><span className="cell-sub">{u.email}</span></div></div> },
          { label: 'Phone', render: (u) => u.phone || '-' },
          { label: 'Role', render: (u) => <span className={`badge ${u.role === 'admin' ? 'badge-gold' : 'badge-blue'}`}>{u.role}</span> },
          { label: 'Status', render: (u) => <ActiveBadge active={u.isActive} /> },
          { label: 'Bookings', num: true, render: (u) => u.bookingCount },
          { label: 'Orders', num: true, render: (u) => u.orderCount },
          { label: 'Paid', num: true, render: (u) => money(u.paidPaise, { compact: true }) },
          { label: 'Joined', render: (u) => <>{formatDateShort(u.createdAt)}<span className="cell-sub">{u.lastLoginAt ? `seen ${timeAgo(u.lastLoginAt)}` : 'never logged in'}</span></> },
          { label: '', render: (u) => <div className="actions"><button className="btn btn-dark btn-sm" aria-label="Edit" onClick={() => setEditing(u)}><Icon name="edit" size="sm" /></button>
            {u.id !== me.id && <button className="btn btn-danger btn-sm" aria-label="Delete" onClick={() => run({ title: `Delete ${u.name}?`, message: 'Users with bookings or orders cannot be deleted - deactivate them instead. This cannot be undone.', confirmText: 'Delete user', danger: true, request: () => api.del(`/api/admin/users/${u.id}`), done: q.reload })}><Icon name="trash" size="sm" /></button>}</div> },
        ]} />
      )}</AsyncView>
      {editing && (editing.id ? (
        <FormModal title={`Edit ${editing.name}`} schema={schemas.adminUserUpdate} initial={editing} onClose={() => setEditing(null)}
          intro={<p className="text-small text-muted">{editing.email} · email cannot be changed here.</p>}
          fields={[{ name: 'name', label: 'Full name', span: 2 }, { name: 'phone', label: 'Mobile' }, { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS },
            { name: 'isActive', label: 'Account status', type: 'switch', text: 'Active (inactive users cannot log in)', span: 2 }]}
          onSubmit={async (data) => { const r = await api.put(`/api/admin/users/${editing.id}`, data); toast.success(r.message); q.reload(); }} />
      ) : (
        <FormModal title="Add user" schema={schemas.adminUser} initial={{ role: 'customer' }} submitText="Create user" onClose={() => setEditing(null)}
          fields={[{ name: 'name', label: 'Full name', span: 2 }, { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Mobile' },
            { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS }, { name: 'password', label: 'Temporary password', type: 'password', hint: '8+ characters with letters and numbers' }]}
          onSubmit={async (data) => { const r = await api.post('/api/admin/users', data); toast.success(r.message); q.reload(); }} />
      ))}
    </>
  );
}

function ReviewCard({ r, onModerate, onReply, onDelete }) {
  return (
    <div className="card card-sm">
      <div className="flex between flex-wrap">
        <div className="flex"><Img className="avatar" src={r.avatar} fallback={AVATAR_FALLBACK} alt="" />
          <div><b>{r.customerName}</b><div className="text-small text-muted">{r.kind === 'product'
            ? <>Product · <Link className="link" to={`/shop/${r.productSlug}`}>{r.productName}</Link> · verified buyer</>
            : <>{r.serviceName} · <span className="mono">{r.bookingCode}</span></>}</div></div></div>
        <PillBadge value={r.status} />
      </div>
      <div className="mt-2"><Stars rating={r.rating} /></div>
      <h4 className="mt-1 mb-0">{r.title}</h4><p className="text-small mt-1">{r.comment}</p>
      {r.adminReply && <div className="review-reply"><b className="text-gold">Reply:</b> {r.adminReply}</div>}
      <div className="flex flex-wrap mt-2">
        {r.status !== 'approved' && <button className="btn btn-success btn-sm" onClick={() => onModerate(r, 'approved')}><Icon name="check" size="sm" /> Approve</button>}
        {r.status !== 'rejected' && <button className="btn btn-danger btn-sm" onClick={() => onModerate(r, 'rejected')}>Reject</button>}
        {onReply && <button className="btn btn-dark btn-sm" onClick={() => onReply(r)}><Icon name="message" size="sm" /> Reply</button>}
        <button className="btn btn-ghost btn-sm" aria-label="Delete review" onClick={() => onDelete(r)}><Icon name="trash" size="sm" /></button>
        <span className="text-small text-muted" style={{ marginLeft: 'auto' }}>{formatDateTime(r.createdAt)}</span>
      </div>
    </div>
  );
}

export function Reviews({ refreshCounts }) {
  const [kind, setKind] = useState('service');
  const [status, setStatus] = useState('');
  const base = kind === 'service' ? '/api/admin/reviews' : '/api/admin/product-reviews';
  const q = useApi(`${base}${qs({ status })}`);
  const [replying, setReplying] = useState(null);
  const run = useAction();
  const toast = useToast();
  const reload = () => { q.reload(); refreshCounts(); };
  const moderate = (r, to) => run({ skipConfirm: true, request: () => api.patch(`${base}/${r.id}`, kind === 'service' ? { status: to, ...(r.adminReply ? { adminReply: r.adminReply } : {}) } : { status: to }), done: reload });
  const remove = (r) => run({ title: 'Delete this review?', message: 'The customer will be able to review again. This cannot be undone.', confirmText: 'Delete', danger: true, request: () => api.del(`${base}/${r.id}`), done: reload });
  return (
    <>
      <PanelHead title="Reviews" subtitle="Only approved reviews are shown on the website.">
        <div className="seg">{[['service', 'Service reviews'], ['product', 'Product reviews']].map(([k, l]) => (
          <button key={k} className={`btn btn-sm ${kind === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setKind(k)}>{l}</button>))}</div>
        <Select label="Status" value={status} onChange={setStatus} options={[['', 'All reviews'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']]} />
      </PanelHead>
      <AsyncView query={q}>{(list) => (list.length ? (
        <div className="grid grid-2">{list.map((r) => <ReviewCard key={r.id} r={r} onModerate={moderate} onDelete={remove} onReply={kind === 'service' ? setReplying : null} />)}</div>
      ) : <EmptyState icon="star" title="No reviews in this view" />)}</AsyncView>
      {replying && <FormModal title={`Reply to ${replying.customerName}`} schema={schemas.adminReview} submitText="Save reply"
        initial={{ adminReply: replying.adminReply || '', status: replying.status === 'pending' ? 'approved' : replying.status }} onClose={() => setReplying(null)}
        fields={[{ name: 'adminReply', label: 'Public reply', type: 'textarea', span: 2 }, { name: 'status', label: 'Status', type: 'select', span: 2, options: [{ value: 'approved', label: 'Approved (visible)' }, { value: 'pending', label: 'Pending' }, { value: 'rejected', label: 'Rejected (hidden)' }] }]}
        onSubmit={async (data) => { const r = await api.patch(`/api/admin/reviews/${replying.id}`, data); toast.success(r.message); reload(); }} />}
    </>
  );
}

export function Messages({ refreshCounts }) {
  const [status, setStatus] = useState('');
  const q = useApi(`/api/admin/messages${qs({ status })}`);
  const run = useAction();
  const reload = () => { q.reload(); refreshCounts(); };
  const setTo = (m, to) => run({ skipConfirm: true, request: async () => { await api.patch(`/api/admin/messages/${m.id}`, { status: to }); return { message: `Message marked ${to}` }; }, done: reload });
  return (
    <>
      <PanelHead title="Messages" subtitle="Enquiries from the website contact form.">
        <Select label="Status" value={status} onChange={setStatus} options={[['', 'All messages'], ['new', 'New'], ['read', 'Read'], ['resolved', 'Resolved']]} />
      </PanelHead>
      <AsyncView query={q}>{(list) => (list.length ? (
        <div className="stack">{list.map((m) => (
          <div className="card card-sm" key={m.id}>
            <div className="flex between flex-wrap"><div><b>{m.subject}</b><div className="text-small text-muted">{m.name} · <a className="link" href={`mailto:${m.email}`}>{m.email}</a>{m.phone ? ` · ${m.phone}` : ''}</div></div>
              <div className="flex"><PillBadge value={m.status} /><span className="text-small text-muted">{formatDateTime(m.createdAt)}</span></div></div>
            <p className="mt-2 mb-2">{m.message}</p>
            <div className="flex flex-wrap">
              {m.status === 'new' && <button className="btn btn-dark btn-sm" onClick={() => setTo(m, 'read')}>Mark read</button>}
              {m.status !== 'resolved' && <button className="btn btn-success btn-sm" onClick={() => setTo(m, 'resolved')}><Icon name="check" size="sm" /> Resolve</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => run({ title: 'Delete this message?', message: 'This cannot be undone.', confirmText: 'Delete', danger: true, request: () => api.del(`/api/admin/messages/${m.id}`), done: reload })}><Icon name="trash" size="sm" /> Delete</button>
            </div>
          </div>))}</div>
      ) : <EmptyState icon="mail" title="Inbox zero" text="No messages in this view." />)}</AsyncView>
    </>
  );
}
