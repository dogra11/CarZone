/** components/StatusBadge.jsx - Coloured badges for booking, payment, review and message states. */
import { statusLabel } from '../utils/format.js';
import { ORDER_STATUS_LABELS } from '../utils/shared.js';

const BOOKING_STYLE = { pending_payment: 'warning', confirmed: 'blue', rescheduled: 'violet', in_progress: 'gold', completed: 'success', cancelled: 'danger' };

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${BOOKING_STYLE[status] || 'muted'}`}>{statusLabel(status)}</span>;
}

const PILL = {
  paid: ['success', 'Paid'], success: ['success', 'Success'], unpaid: ['muted', 'Unpaid'], failed: ['danger', 'Failed'],
  refund_pending: ['warning', 'Refund pending'], refunded: ['gold', 'Refunded'], partially_refunded: ['gold', 'Partly refunded'],
  pending: ['warning', 'Pending'], processed: ['success', 'Processed'], approved: ['success', 'Approved'], rejected: ['danger', 'Rejected'],
  created: ['muted', 'Created'], cancelled: ['muted', 'Cancelled'], cod: ['blue', 'Cash on delivery'], pay_at_centre: ['blue', 'Pay at centre'],
  new: ['blue', 'New'], read: ['muted', 'Read'], resolved: ['success', 'Resolved'], active: ['success', 'Active'], inactive: ['muted', 'Inactive'],
};

export function PillBadge({ value }) {
  const [style, label] = PILL[value] || ['muted', value];
  return <span className={`badge badge-${style}`}>{label}</span>;
}

const ORDER_STYLE = {
  pending_payment: 'warning', placed: 'blue', packed: 'violet', shipped: 'blue', out_for_delivery: 'gold', delivered: 'success',
  cancelled: 'danger', return_requested: 'warning', returned: 'muted',
};

/** Badge for store order statuses (PLACED -> PACKED -> SHIPPED -> OUT_FOR_DELIVERY -> DELIVERED). */
export function OrderBadge({ status }) {
  return <span className={`badge badge-${ORDER_STYLE[status] || 'muted'}`}>{ORDER_STATUS_LABELS[status] || status}</span>;
}
