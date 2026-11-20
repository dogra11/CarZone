/**
 * store.controller.js - Accessories store: catalogue (public), cart, wishlist,
 * checkout and the customer's orders.
 * Express handlers: errors thrown here reach errorHandler via asyncHandler() in the routes.
 * Invoices are sent as HTML with res.send(); res.set() adds the download header.
 */
import * as products from '../services/product.service.js';
import * as cart from '../services/cart.service.js';
import * as orders from '../services/order.service.js';
import { renderOrderInvoiceHtml } from '../services/document.service.js';
import { idParam } from '../middleware/validate.js';
import { AppError } from '../utils/AppError.js';

// ---- Catalogue (public) ----
export const categories = async (req, res) => res.ok(await products.listCategories());
export const carModels = async (req, res) => res.ok(await products.listCarModels());

export async function listProducts(req, res) {
  const q = req.query;
  const num = (v) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  res.ok(await products.listProducts({
    search: (q.search || '').slice(0, 80), category: q.category || '', carModelId: num(q.carModelId),
    minPrice: num(q.minPrice), maxPrice: num(q.maxPrice), minRating: num(q.minRating),
    inStock: q.inStock === '1', featured: q.featured === '1', deal: q.deal === '1', sort: q.sort,
  }));
}

export const getProduct = async (req, res) => res.ok(await products.getProductPage(req.params.slug));

// ---- Cart & wishlist ----
export const getCart = async (req, res) => res.ok(await cart.getCart(req.user.id));
export async function addToCart(req, res) {
  const quantity = Number(req.body.quantity ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw AppError.unprocessable('Quantity must be 1-10');
  res.ok({ cart: await cart.addToCart(req.user.id, idParam(req, 'productId'), quantity), message: 'Added to cart' });
}
export const setCartQuantity = async (req, res) => res.ok({ cart: await cart.setQuantity(req.user.id, idParam(req, 'productId'), req.valid.quantity) });
export const removeFromCart = async (req, res) => res.ok({ cart: await cart.setQuantity(req.user.id, idParam(req, 'productId'), 0), message: 'Removed from cart' });
export async function mergeCart(req, res) {
  if (!Array.isArray(req.body.items)) throw AppError.unprocessable('items must be a list');
  res.ok({ cart: await cart.mergeCart(req.user.id, req.body.items) });
}

export const wishlist = async (req, res) => res.ok(await cart.listWishlist(req.user.id));
export const addToWishlist = async (req, res) => res.ok({ wishlist: await cart.addToWishlist(req.user.id, idParam(req, 'productId')), message: 'Saved to wishlist' });
export const removeFromWishlist = async (req, res) => res.ok({ wishlist: await cart.removeFromWishlist(req.user.id, idParam(req, 'productId')), message: 'Removed from wishlist' });

// ---- Checkout & orders ----
export const quote = async (req, res) => res.ok(await orders.quoteOrder(req.user.id, req.valid));

export async function placeOrder(req, res) {
  const order = await orders.placeOrder(req.user, req.valid);
  const message = order.status === 'placed' ? `Order ${order.code} placed - pay cash on delivery.` : `Order ${order.code} created. Complete the payment to place it.`;
  res.ok({ order, message }, 201);
}

export const listMine = async (req, res) => res.ok(await orders.listOrdersForUser(req.user.id));
export const getOne = async (req, res) => res.ok(await orders.getOrderDetail(idParam(req), req.user));

export async function cancel(req, res) {
  const order = await orders.cancelOrder(idParam(req), req.user, req.valid.reason);
  res.ok({ order, message: `Order ${order.code} cancelled. Stock released${order.payments.some((p) => p.refund) ? ' and refund initiated' : ''}.` });
}

export async function requestReturn(req, res) {
  const order = await orders.requestReturn(idParam(req), req.user, req.valid.reason);
  res.ok({ order, message: `Return requested for ${order.code}. We will arrange a pickup.` });
}

export async function invoice(req, res) {
  const order = await orders.getOrderDetail(idParam(req), req.user);
  if (!order.actions.invoice) throw AppError.conflict('An invoice is available once the order is placed');
  if (req.query.download === '1') res.set('Content-Disposition', `attachment; filename="CarZone-Invoice-${order.code}.html"`);
  res.send(renderOrderInvoiceHtml(order));
}
