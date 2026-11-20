/**
 * pages/Cart.jsx - Shopping cart for guests (localStorage) and customers (database).
 * Guests see their items (product details looked up from the catalogue) and are asked to
 * log in at checkout - the guest cart is merged into their account automatically.
 */
import { useMemo } from 'react';
import { Link, useNavigate } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../hooks/useMeta.js';
import { money } from '../utils/format.js';
import PublicLayout from '../components/PublicLayout.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import { useToast } from '../components/Toast.jsx';
import Icon from '../components/Icon.jsx';
import Img from '../components/Img.jsx';

export default function Cart() {
  useDocumentTitle('Your cart');
  const { cart, guest, isCustomer, setQuantity, remove } = useCart();
  const { user } = useAuth();
  const meta = useMeta();
  const toast = useToast();
  const navigate = useNavigate();
  const catalogue = useApi('/api/store/products', { skip: isCustomer });

  // Build one list of { product, quantity } for both cart types.
  const items = useMemo(() => {
    if (isCustomer) return cart?.items || null;
    if (!catalogue.data) return null;
    return guest.map((g) => ({ productId: g.productId, quantity: g.quantity, product: catalogue.data.find((p) => p.id === g.productId) })).filter((i) => i.product);
  }, [isCustomer, cart, guest, catalogue.data]);

  const subtotal = (items || []).reduce((s, i) => s + i.product.pricePaise * i.quantity, 0);
  const mrp = (items || []).reduce((s, i) => s + i.product.mrpPaise * i.quantity, 0);
  const freeAbove = meta?.rules.freeShippingAbovePaise ?? 99900;
  const shipping = subtotal === 0 || subtotal >= freeAbove ? 0 : (meta?.rules.shippingFeePaise ?? 7900);

  const change = async (id, q) => { try { await setQuantity(id, q); } catch (err) { toast.error(err.message); } };
  const checkout = () => {
    if (user?.role === 'admin') { toast.warning('Admin accounts cannot place orders.'); return; }
    navigate(user ? '/checkout' : '/login?next=/checkout');
  };

  let body;
  if (!items) body = <Loader text="Loading your cart..." />;
  else if (!items.length) body = <EmptyState icon="cart" title="Your cart is empty" text="Find accessories that fit your car - from seat covers to dash cams." action={<Link className="btn btn-primary" to="/shop">Start shopping</Link>} />;
  else body = (
    <div className="cart-layout">
      <div className="stack">
        {items.map((i) => (
          <div className="cart-item card card-sm" key={i.productId}>
            <Link to={`/shop/${i.product.slug}`}><Img src={i.product.image} alt="" /></Link>
            <div>
              <div className="product-brand">{i.product.brand}</div>
              <h4 className="mb-0"><Link to={`/shop/${i.product.slug}`}>{i.product.name}</Link></h4>
              <div className="text-small text-muted">{i.product.isUniversal ? 'Universal fit' : 'Model-specific fit'} · {i.product.warranty}</div>
              {i.issue && <div className="text-small" style={{ color: '#ff8a8a' }}><Icon name="alert" size="sm" /> {i.issue}</div>}
              <div className="flex mt-1">
                <div className="qty-stepper small">
                  <button onClick={() => change(i.productId, Math.max(1, i.quantity - 1))} aria-label="Decrease">−</button><span>{i.quantity}</span>
                  <button onClick={() => change(i.productId, Math.min(10, i.quantity + 1))} aria-label="Increase">+</button>
                </div>
                <button className="btn btn-link text-small" onClick={() => remove(i.productId)}>Remove</button>
              </div>
            </div>
            <div className="cart-price"><b>{money(i.product.pricePaise * i.quantity)}</b>{i.product.mrpPaise > i.product.pricePaise && <s>{money(i.product.mrpPaise * i.quantity)}</s>}</div>
          </div>
        ))}
      </div>
      <aside className="sticky">
        <div className="card card-glass">
          <span className="eyebrow">Order summary</span>
          <div className="bill-lines">
            <div className="bill-line"><span>MRP total</span><span>{money(mrp)}</span></div>
            <div className="bill-line discount"><span>You save</span><span>- {money(mrp - subtotal)}</span></div>
            <div className="bill-line"><span>Subtotal</span><span>{money(subtotal)}</span></div>
            <div className="bill-line"><span>Shipping</span><span>{shipping ? money(shipping) : 'Free'}</span></div>
            <div className="bill-line total"><span>Estimated total</span><span>{money(subtotal + shipping)}</span></div>
          </div>
          {shipping > 0 && <p className="text-small text-gold mt-2">Add {money(freeAbove - subtotal)} more for free shipping.</p>}
          <p className="text-small text-muted">Prices include GST. Coupons and fitment are applied at checkout.</p>
          <button className="btn btn-primary btn-lg btn-block mt-2" onClick={checkout}>{user ? 'Proceed to checkout' : 'Log in to checkout'} <Icon name="arrow-right" size="sm" /></button>
          <Link className="btn btn-ghost btn-block mt-2" to="/shop">Continue shopping</Link>
        </div>
      </aside>
    </div>
  );

  return (
    <PublicLayout solid glow>
      <main className="container" style={{ paddingTop: 'calc(var(--header-h) + 36px)', paddingBottom: 60 }}>
        <div className="section-head mb-3"><span className="eyebrow">Shopping cart</span><h1 style={{ fontSize: 'clamp(2rem,4vw,2.8rem)' }}>Your cart</h1>
          {!isCustomer && items?.length > 0 && <p className="text-muted mb-0">You are shopping as a guest - your cart is saved on this device and will be moved to your account when you log in.</p>}</div>
        {body}
      </main>
    </PublicLayout>
  );
}
