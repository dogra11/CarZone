/** components/OfferCard.jsx - Ticket-style coupon card with a click-to-copy code. */
import { money, formatDateShort } from '../utils/format.js';
import { useCopy } from '../hooks/useCopy.js';
import Icon from './Icon.jsx';

export default function OfferCard({ coupon: c }) {
  const copy = useCopy();
  const conditions = [
    c.minOrderPaise ? `Min. order ${money(c.minOrderPaise, { compact: true })}` : 'No minimum order',
    c.maxDiscountPaise ? `Max ${money(c.maxDiscountPaise, { compact: true })} off` : null,
    c.serviceName ? `Only on ${c.serviceName}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <article className="offer-card reveal">
      <span className="badge badge-gold no-dot"><Icon name="tag" size="sm" /> {c.title}</span>
      <div className="offer-value">{c.discountType === 'percent' ? `${c.discountValue}%` : money(c.discountValue, { compact: true })} <small>OFF</small></div>
      <p>{c.description}</p>
      <p className="text-small text-muted">{conditions}</p>
      <div className="offer-foot">
        <button className="code-chip" title="Copy code" onClick={() => copy(c.code)}>{c.code} <Icon name="copy" size="sm" /></button>
        <small className="text-muted">Valid till {formatDateShort(c.validUntil)}</small>
      </div>
    </article>
  );
}
