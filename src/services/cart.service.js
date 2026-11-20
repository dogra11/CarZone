/**
 * cart.service.js - Shopping cart and wishlist.
 *
 * CART DESIGN
 *  - Logged-in customers: the cart is stored in cart_items (one row per product), so it
 *    follows them across devices.
 *  - Guests: the React app keeps the cart in localStorage. Right after login it calls
 *    POST /api/cart/merge, which adds the guest items into the database cart
 *    (quantities are capped by stock and the 10-per-item limit).
 *  - Prices are NEVER stored in the cart: totals are always recalculated from the
 *    current product prices, and stock is re-checked again at checkout.
 */
import { one, all, run } from '../db/connection.js';
import { AppError } from '../utils/AppError.js';
import { nowSql } from '../utils/dates.js';
import { mapProduct } from './product.service.js';
import { calculateOrderTotals } from './pricing.service.js';

const MAX_PER_ITEM = 10;

const CART_SELECT = `
  SELECT ci.quantity, ci.added_at, p.*, c.slug AS category_slug, c.name AS category_name, NULL AS avg_rating, 0 AS review_count, 0 AS sold_count
    FROM cart_items ci JOIN products p ON p.id = ci.product_id JOIN product_categories c ON c.id = p.category_id`;

export async function getCart(userId) {
  const rows = await all(`${CART_SELECT} WHERE ci.user_id = ? ORDER BY ci.added_at, p.id`, userId);
  const items = rows.map((r) => {
    const product = mapProduct(r);
    const available = product.isActive && product.stock >= r.quantity;
    return {
      productId: product.id, quantity: r.quantity, product, available,
      issue: !product.isActive ? 'No longer available' : product.stock === 0 ? 'Out of stock' : product.stock < r.quantity ? `Only ${product.stock} left` : null,
      lineTotalPaise: product.pricePaise * r.quantity,
    };
  });
  const totals = calculateOrderTotals({ items: items.map((i) => ({ unitPricePaise: i.product.pricePaise, mrpPaise: i.product.mrpPaise, quantity: i.quantity })) });
  return { items, itemCount: items.reduce((s, i) => s + i.quantity, 0), totals, hasFitmentItems: items.some((i) => i.product.fitmentAvailable) };
}

async function loadSellable(productId) {
  const p = await one('SELECT id, name, stock, is_active FROM products WHERE id = ?', productId);
  if (!p || !p.is_active) throw AppError.notFound('Product not found');
  return p;
}

/** Sets the quantity of one product (0 removes it). */
export async function setQuantity(userId, productId, quantity) {
  if (quantity === 0) {
    await run('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', userId, productId);
    return getCart(userId);
  }
  const p = await loadSellable(productId);
  if (p.stock === 0) throw AppError.conflict(`"${p.name}" is out of stock`);
  if (quantity > p.stock) throw AppError.unprocessable(`Only ${p.stock} left of "${p.name}"`, { quantity: `Max ${p.stock}` });
  const exists = await one('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?', userId, productId);
  if (exists) await run('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?', quantity, userId, productId);
  else await run('INSERT INTO cart_items (user_id, product_id, quantity, added_at) VALUES (?, ?, ?, ?)', userId, productId, quantity, nowSql());
  return getCart(userId);
}

/** Adds to whatever is already in the cart (used by "Add to cart"). */
export async function addToCart(userId, productId, quantity = 1) {
  const existing = await one('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?', userId, productId);
  const wanted = (existing?.quantity || 0) + quantity;
  if (wanted > MAX_PER_ITEM) throw AppError.unprocessable(`You can buy at most ${MAX_PER_ITEM} of one item`);
  return setQuantity(userId, productId, wanted);
}

/** Merges a guest (localStorage) cart into the customer's database cart after login. */
export async function mergeCart(userId, items = []) {
  for (const item of items.slice(0, 50)) {
    const productId = Number(item?.productId);
    const qty = Number(item?.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(qty) || qty < 1) continue;
    const p = await one('SELECT stock, is_active FROM products WHERE id = ?', productId);
    if (!p || !p.is_active || p.stock === 0) continue;
    const existing = await one('SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?', userId, productId);
    const merged = Math.min(MAX_PER_ITEM, p.stock, (existing?.quantity || 0) + qty);
    if (existing) await run('UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?', merged, userId, productId);
    else await run('INSERT INTO cart_items (user_id, product_id, quantity, added_at) VALUES (?, ?, ?, ?)', userId, productId, merged, nowSql());
  }
  return getCart(userId);
}

export async function clearCart(userId) {
  await run('DELETE FROM cart_items WHERE user_id = ?', userId);
}

// ---------------------------------------------------------------------------
// Wishlist
// ---------------------------------------------------------------------------
export async function listWishlist(userId) {
  return (await all(
    `SELECT p.*, c.slug AS category_slug, c.name AS category_name, NULL AS avg_rating, 0 AS review_count, 0 AS sold_count
       FROM wishlist_items w JOIN products p ON p.id = w.product_id JOIN product_categories c ON c.id = p.category_id
      WHERE w.user_id = ? ORDER BY w.created_at DESC`, userId,
  )).map(mapProduct);
}

export async function addToWishlist(userId, productId) {
  await loadSellable(productId);
  await run('INSERT IGNORE INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?)', userId, productId, nowSql());
  return listWishlist(userId);
}

export async function removeFromWishlist(userId, productId) {
  await run('DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?', userId, productId);
  return listWishlist(userId);
}
