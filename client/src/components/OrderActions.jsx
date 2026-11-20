/**
 * components/OrderActions.jsx - Buttons for a store order: pay, cancel (before shipping),
 * request a return (within the return window after delivery), invoice and details.
 */
import { useState } from 'react';
import { Link } from '../router/index.jsx';
import { api } from '../services/api.js';
import { useForm } from '../hooks/useForm.js';
import { useToast } from './Toast.jsx';
import { money } from '../utils/format.js';
import { schemas } from '../utils/shared.js';
import Modal from './Modal.jsx';
import FormField from './FormField.jsx';
import Icon from './Icon.jsx';

function ReasonDialog({ order, kind, onClose, onDone }) {
  const toast = useToast();
  const form = useForm(schemas.cancel, { reason: '' });
  const isCancel = kind === 'cancel';
  const submit = form.handleSubmit(async (data) => {
    const r = await api.post(`/api/orders/${order.id}/${isCancel ? 'cancel' : 'return'}`, data);
    toast.success(r.message, isCancel ? 'Order cancelled' : 'Return requested');
    onDone(r.order);
    onClose();
  });
  return (
    <Modal title={`${isCancel ? 'Cancel' : 'Return'} order ${order.code}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Back</button><button className={`btn btn-danger ${form.submitting ? 'is-loading' : ''}`} type="submit" form="reason-form">{isCancel ? 'Cancel order' : 'Request return'}</button></>}>
      <div className="alert alert-info"><Icon name="info" /><p>{isCancel
        ? `Items go back to stock immediately.${order.paymentStatus === 'success' ? ` A full refund of ${money(order.totals.totalPaise)} will be initiated.` : ''}`
        : 'Our courier will pick the item up. Once it is received, the refund is initiated to your original payment method (cash refunds for COD).'}</p></div>
      <form id="reason-form" className="mt-3" onSubmit={submit} noValidate>
        <FormField label="Reason" type="textarea" rows={3} {...form.field('reason')} />
      </form>
    </Modal>
  );
}

export default function OrderActions({ order: o, onChanged, showView = true }) {
  const [dialog, setDialog] = useState(null);
  const a = o.actions;
  return (
    <>
      {a.pay && <Link className="btn btn-primary btn-sm" to={`/pay/order/${o.id}`}><Icon name="credit-card" size="sm" /> Pay {money(o.totals.totalPaise)}</Link>}
      {a.invoice && <a className="btn btn-dark btn-sm" href={`/api/orders/${o.id}/invoice`} target="_blank" rel="noopener noreferrer"><Icon name="receipt" size="sm" /> Invoice</a>}
      {a.return && <button className="btn btn-dark btn-sm" onClick={() => setDialog('return')}><Icon name="refresh" size="sm" /> Return</button>}
      {a.cancel && <button className="btn btn-danger btn-sm" onClick={() => setDialog('cancel')}><Icon name="x" size="sm" /> Cancel</button>}
      {showView && <Link className="btn btn-ghost btn-sm" to={`/orders/${o.id}`}>Track <Icon name="arrow-right" size="sm" /></Link>}
      {dialog && <ReasonDialog order={o} kind={dialog} onClose={() => setDialog(null)} onDone={onChanged} />}
    </>
  );
}
