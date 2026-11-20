/**
 * admin/store.controller.js - Admin side of the accessories store: products,
 * categories, inventory (stock adjustments + ledger), orders and product reviews.
 */
import * as products from '../../services/product.service.js';
import * as orders from '../../services/order.service.js';
import { idParam } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';

// ---- Products & inventory ----
export const listProducts = async (req, res) =>
  res.ok(await products.adminListProducts({ search: req.query.search || '', category: req.query.category || '', stock: req.query.stock || '' }));
export const getProduct = async (req, res) => res.ok({ ...(await products.getProduct(idParam(req), { includeInactive: true })), movements: await products.stockMovements(idParam(req)) });
export async function createProduct(req, res) {
  const opening = Number(req.body.openingStock ?? 0);
  if (!Number.isInteger(opening) || opening < 0 || opening > 10000) throw AppError.unprocessable('Opening stock must be 0-10000', { openingStock: '0-10000' });
  res.ok({ product: await products.createProduct(req.valid, req.user.id, opening), message: 'Product created' }, 201);
}
export const updateProduct = async (req, res) => res.ok({ product: await products.updateProduct(idParam(req), req.valid), message: 'Product updated' });
export async function deleteProduct(req, res) { await products.deleteProduct(idParam(req)); res.ok({ message: 'Product deleted' }); }
export async function adjustStock(req, res) {
  const product = await products.adjustStock(idParam(req), req.valid, req.user.id);
  res.ok({ product, message: `Stock for ${product.sku} is now ${product.stock}` });
}
export const lowStock = async (req, res) => res.ok(await products.lowStockProducts());
export const carModels = async (req, res) => res.ok(await products.listCarModels());

// ---- Categories ----
export const listCategories = async (req, res) => res.ok(await products.listCategories({ includeInactive: true }));
export const createCategory = async (req, res) => res.ok({ category: await products.createCategory(req.valid), message: 'Category created' }, 201);
export const updateCategory = async (req, res) => res.ok({ category: await products.updateCategory(idParam(req), req.valid), message: 'Category updated' });
export async function deleteCategory(req, res) { await products.deleteCategory(idParam(req)); res.ok({ message: 'Category deleted' }); }

// ---- Orders ----
export const listOrders = async (req, res) => res.ok(await orders.adminListOrders({ status: req.query.status || '', search: req.query.search || '' }));
export const getOrder = async (req, res) => res.ok(await orders.getOrderDetail(idParam(req), req.user));
export async function updateOrderStatus(req, res) {
  const order = await orders.adminUpdateOrderStatus(idParam(req), req.user, req.valid);
  res.ok({ order, message: `Order ${order.code} is now ${order.statusLabel.toLowerCase()}` });
}

// ---- Product reviews ----
export const listProductReviews = async (req, res) => res.ok(await products.adminListProductReviews({ status: req.query.status || '' }));
export const moderateProductReview = async (req, res) => res.ok({ review: await products.moderateProductReview(idParam(req), req.valid.status), message: `Review ${req.valid.status}` });
export async function deleteProductReview(req, res) { await products.deleteProductReview(idParam(req)); res.ok({ message: 'Review deleted' }); }
