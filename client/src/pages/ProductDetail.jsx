/**
 * pages/ProductDetail.jsx - One accessory: image gallery, price vs MRP, stock badge,
 * "fits my car" check, quantity + add to cart, wishlist, features, specifications,
 * compatible models, verified-buyer reviews and related products.
 */
import { useState } from 'react';
import { Link, useParams } from '../router/index.jsx';
import { api } from '../services/api.js';
import { useApi } from '../hooks/useApi.js';
import { useReveal } from '../hooks/useReveal.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { money, formatDate } from '../utils/format.js';
import PublicLayout from '../components/PublicLayout.jsx';
import ProductCard from '../components/ProductCard.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import { useToast } from '../components/Toast.jsx';
import Stars from '../components/Stars.jsx';
import Icon from '../components/Icon.jsx';
import Img, { AVATAR_FALLBACK } from '../components/Img.jsx';

export default function ProductDetail() {
  const { slug } = useParams();
  const q = useApi(`/api/store/products/${encodeURIComponent(slug)}`);
  const p = q.data;
  const { user } = useAuth();
  const { add } = useCart();
  const toast = useToast();
  const [img, setImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  useDocumentTitle(p?.name || 'Product');
  useReveal([p]);

  const myCar = (() => { try { return JSON.parse(localStorage.getItem('carzone_my_car')) || {}; } catch { return {}; } })();
  const fits = p && (p.isUniversal || p.compatibleModels.some((m) => String(m.id) === String(myCar.modelId)));

  const addToCart = async () => {
    setBusy(true);
    try { await add(p.id, qty); toast.success(`${qty} x ${p.name} added to your cart.`, 'Added to cart'); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const wishlist = async () => {
    if (!user) { toast.info('Log in to save items to your wishlist.'); return; }
    try { await api.post(`/api/me/wishlist/${p.id}`); toast.success('Saved to your wishlist.', 'Wishlist'); } catch (err) { toast.error(err.message); }
  };

  let body;
  if (q.loading) body = <Loader text="Loading product..." />;
  else if (q.error) body = q.error.status === 404 ? <EmptyState icon="search" title="Product not found" action={<Link className="btn btn-primary" to="/shop">Back to shop</Link>} /> : <ErrorState error={q.error} onRetry={q.reload} />;
  else body = (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><Link to="/shop">Shop</Link><span>/</span><Link to={`/shop?category=${p.categorySlug}`}>{p.categoryName}</Link><span>/</span><span>{p.name}</span></nav>
      <div className="product-layout">
        <div className="gallery-box reveal">
          <div className="gallery-main"><Img src={p.images[img]} alt={p.name} />{p.discountPercent > 0 && <span className="badge badge-gold no-dot discount-tag">{p.discountPercent}% OFF</span>}</div>
          <div className="gallery-thumbs">{p.images.map((src, i) => (
            <button key={src} className={i === img ? 'active' : ''} onClick={() => setImg(i)} aria-label={`Image ${i + 1}`}><Img src={src} alt="" /></button>))}</div>
        </div>
        <div className="reveal">
          <div className="product-brand">{p.brand} · SKU {p.sku}</div>
          <h1 style={{ fontSize: 'clamp(1.7rem,3.2vw,2.5rem)' }}>{p.name}</h1>
          <div className="flex flex-wrap mb-2">
            {p.rating ? <span className="flex"><Stars rating={p.rating} /> <b>{p.rating}</b> <span className="text-muted">({p.reviewCount} verified reviews)</span></span> : <span className="text-muted">No reviews yet</span>}
            {p.soldCount > 0 && <span className="text-muted text-small">· {p.soldCount} sold</span>}
          </div>
          <div className="price-big"><b>{money(p.pricePaise)}</b>{p.mrpPaise > p.pricePaise && <><s>MRP {money(p.mrpPaise)}</s><span className="text-gold">Save {money(p.mrpPaise - p.pricePaise)}</span></>}</div>
          <p className="text-small text-muted">Inclusive of all taxes · Free shipping above ₹999</p>
          <div className="flex flex-wrap mt-2">
            {p.inStock ? <span className={`badge ${p.lowStock ? 'badge-warning' : 'badge-success'}`}>{p.lowStock ? `Only ${p.stock} left` : 'In stock'}</span> : <span className="badge badge-danger">Out of stock</span>}
            <span className="badge badge-muted no-dot"><Icon name="shield" size="sm" /> {p.warranty}</span>
            {p.fitmentAvailable && <span className="badge badge-blue no-dot"><Icon name="settings" size="sm" /> Fitment at CarZone centre</span>}
          </div>
          {myCar.modelId && (
            <div className={`alert mt-3 ${fits ? 'alert-success' : 'alert-warning'}`}><Icon name={fits ? 'check-circle' : 'alert'} />
              <p>{fits ? (p.isUniversal ? 'Universal fit - works with your car.' : 'Fits your selected car.') : 'This product is not listed for your selected car.'}</p></div>
          )}
          <p className="mt-3">{p.description}</p>
          <div className="buy-row mt-3">
            <div className="qty-stepper" aria-label="Quantity">
              <button onClick={() => setQty((x) => Math.max(1, x - 1))} aria-label="Decrease">−</button><span>{qty}</span>
              <button onClick={() => setQty((x) => Math.min(10, p.stock, x + 1))} aria-label="Increase">+</button>
            </div>
            <button className={`btn btn-primary btn-lg ${busy ? 'is-loading' : ''}`} disabled={!p.inStock || busy} onClick={addToCart}><Icon name="cart" size="sm" /> Add to cart</button>
            {user?.role !== 'admin' && <button className="btn btn-ghost btn-lg" onClick={wishlist} aria-label="Save to wishlist"><Icon name="heart" size="sm" /></button>}
          </div>
          <div className="card card-sm mt-3"><h4>Key features</h4><ul className="check-list mb-0">{p.features.map((x) => <li key={x}><Icon name="check-circle" />{x}</li>)}</ul></div>
        </div>
      </div>
      <div className="grid grid-2 mt-4" style={{ alignItems: 'start' }}>
        <div className="card reveal"><h3>Specifications</h3>
          <dl className="spec-table">{Object.entries(p.specs).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div>
        <div className="card reveal"><h3>Compatibility</h3>
          {p.isUniversal ? <p className="mb-0"><Icon name="check-circle" size="sm" /> Universal - fits most cars{p.categorySlug === 'bike-accessories' ? ' and two-wheelers' : ''}.</p>
            : <div className="chips">{p.compatibleModels.map((m) => <span key={m.id} className="chip">{m.make} {m.model}</span>)}</div>}
        </div>
      </div>
      <div className="card mt-3 reveal">
        <div className="card-title"><h3>Verified buyer reviews</h3>{p.rating && <span className="flex"><Stars rating={p.rating} /> <b>{p.rating}</b></span>}</div>
        {p.reviews.length ? p.reviews.map((r) => (
          <div className="review-item" key={r.id}>
            <div className="flex between flex-wrap"><div className="flex"><Img className="avatar" src={r.avatar} fallback={AVATAR_FALLBACK} alt="" />
              <div><b>{r.customerName}</b> <span className="badge badge-success no-dot">Verified buyer</span><div className="text-small text-muted">{formatDate(r.createdAt)}</div></div></div><Stars rating={r.rating} /></div>
            <h4 className="mt-2 mb-0">{r.title}</h4><p className="mb-0 mt-1">{r.comment}</p>
          </div>)) : <EmptyState icon="star" title="No reviews yet" text="Only customers who received this product can review it." />}
      </div>
      {p.related.length > 0 && (
        <div className="mt-4"><h3>You may also like</h3><div className="grid grid-4 mt-2">{p.related.map((r) => <ProductCard key={r.id} product={r} />)}</div></div>
      )}
    </>
  );
  return <PublicLayout solid glow><main className="container" style={{ paddingTop: 'calc(var(--header-h) + 36px)', paddingBottom: 60 }}>{body}</main></PublicLayout>;
}
