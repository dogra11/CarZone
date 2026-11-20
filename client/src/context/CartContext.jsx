/**
 * context/CartContext.jsx - Shopping cart state for the whole app (React Context).
 *
 * - Guests: items live in localStorage ({ productId, quantity } only - never prices).
 * - Customers: the cart lives in the database (GET/PUT /api/cart...).
 * - On login the guest cart is MERGED into the database cart (POST /api/cart/merge)
 *   and localStorage is cleared, so nothing a guest added is lost.
 * Components call: const { count, add, setQuantity, remove, cart, refresh } = useCart();
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

const CartContext = createContext(null);
const KEY = 'carzone_guest_cart';

const readGuest = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const writeGuest = (items) => localStorage.setItem(KEY, JSON.stringify(items));

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(null);           // server cart (customers)
  const [guest, setGuest] = useState(readGuest);    // guest cart (localStorage)
  const isCustomer = user?.role === 'customer';

  const refresh = useCallback(async () => {
    if (!isCustomer) return;
    setCart(await api.get('/api/cart'));
  }, [isCustomer]);

  // When a customer logs in: merge the guest cart, then load the server cart.
  useEffect(() => {
    if (!isCustomer) { setCart(null); return; }
    const pending = readGuest();
    (pending.length ? api.post('/api/cart/merge', { items: pending }).then((r) => r.cart) : api.get('/api/cart'))
      .then((c) => { setCart(c); if (pending.length) { writeGuest([]); setGuest([]); } })
      .catch(() => setCart(null));
  }, [isCustomer]);

  const add = useCallback(async (productId, quantity = 1) => {
    if (isCustomer) {
      const r = await api.post(`/api/cart/items/${productId}`, { quantity });
      setCart(r.cart);
      return;
    }
    const items = readGuest();
    const found = items.find((i) => i.productId === productId);
    if (found) found.quantity = Math.min(10, found.quantity + quantity);
    else items.push({ productId, quantity });
    writeGuest(items);
    setGuest(items);
  }, [isCustomer]);

  const setQuantity = useCallback(async (productId, quantity) => {
    if (isCustomer) {
      setCart((await api.put(`/api/cart/items/${productId}`, { quantity })).cart);
      return;
    }
    const items = readGuest().map((i) => (i.productId === productId ? { ...i, quantity } : i)).filter((i) => i.quantity > 0);
    writeGuest(items);
    setGuest(items);
  }, [isCustomer]);

  const remove = useCallback((productId) => setQuantity(productId, 0), [setQuantity]);

  const count = isCustomer ? (cart?.itemCount || 0) : guest.reduce((s, i) => s + i.quantity, 0);
  const value = useMemo(() => ({ cart, guest, count, isCustomer, add, setQuantity, remove, refresh }), [cart, guest, count, isCustomer, add, setQuantity, remove, refresh]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
