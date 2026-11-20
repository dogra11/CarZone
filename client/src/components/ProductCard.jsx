/**
 * components/ProductCard.jsx - Product tile for the shop, landing page and wishlist.
 * Shows price vs MRP with discount %, rating, stock badge and an "Add to cart" button.
 */
import { useState } from 'react';
import { Link } from '../router/index.jsx';
import { money } from '../utils/format.js';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from './Toast.jsx';
import Icon from './Icon.jsx';
import Img from './Img.jsx';

export default function ProductCard({ product: p, onRemove }) {
  const { add } = useCart();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const addToCart = async () => {
    setBusy(true);
    try {
      await add(p.id, 1);
      toast.success(`${p.name} added to your cart.`, 'Added to cart');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="product-card reveal">
      <Link className="product-media" to={`/shop/${p.slug}`}>
        <Img src={p.image} alt={p.name} loading="lazy" />
        {p.discountPercent > 0 && <span className="badge badge-gold no-dot discount-tag">{p.discountPercent}% OFF</span>}
        {p.isDeal && <span className="badge badge-blue no-dot deal-tag"><Icon name="zap" size="sm" /> Deal</span>}
      </Link>
      <div className="product-body">
        <div className="product-brand">{p.brand} · {p.categoryName}</div>
        <h4><Link to={`/shop/${p.slug}`}>{p.name}</Link></h4>
        <div className="product-meta">
          {p.rating ? <span className="text-gold"><Icon name="star-fill" size="sm" /> {p.rating} <span className="text-muted">({p.reviewCount})</span></span> : <span className="text-muted">New</span>}
          <span>{p.isUniversal ? 'Universal fit' : 'Model-specific'}</span>
        </div>
        <div className="product-price">
          <b>{money(p.pricePaise, { compact: true })}</b>
          {p.mrpPaise > p.pricePaise && <s>{money(p.mrpPaise, { compact: true })}</s>}
        </div>
        <div className="product-foot">
          {p.inStock
            ? <span className={`stock ${p.lowStock ? 'low' : ''}`}>{p.lowStock ? `Only ${p.stock} left` : 'In stock'}</span>
            : <span className="stock out">Out of stock</span>}
          {onRemove
            ? <button className="btn btn-ghost btn-sm" onClick={() => onRemove(p)}><Icon name="trash" size="sm" /></button>
            : null}
          <button className="btn btn-primary btn-sm" disabled={!p.inStock || busy} onClick={addToCart}>
            <Icon name="plus" size="sm" /> {busy ? 'Adding' : 'Add'}
          </button>
        </div>
      </div>
    </article>
  );
}
