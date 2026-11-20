/**
 * product.service.js - Accessories catalogue, compatibility, inventory and product reviews.
 *
 * COMPATIBILITY: a product either fits every car (is_universal = 1) or is linked to
 * specific Indian car models in product_compatibility. "Select your car" in the shop
 * therefore shows: universal products + products linked to that car model.
 *
 * INVENTORY: products.stock is the live count. Every change also writes a row in
 * stock_movements (opening, order, cancel, return, adjustment), so stock can always be
 * audited: products.stock = SUM(stock_movements.qty_change).
 */
import { one, all, run, transaction } from '../db/connection.js';
import { config } from '../config/index.js';
import { AppError } from '../utils/AppError.js';
import { nowSql } from '../utils/dates.js';

const RATING = `(SELECT AVG(pr.rating) FROM product_reviews pr WHERE pr.product_id = p.id AND pr.status = 'approved')`;
const RATING_COUNT = `(SELECT COUNT(*) FROM product_reviews pr WHERE pr.product_id = p.id AND pr.status = 'approved')`;
const SOLD = `(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = p.id AND o.status NOT IN ('cancelled', 'returned', 'pending_payment'))`;

const PRODUCT_SELECT = `
  SELECT p.*, c.slug AS category_slug, c.name AS category_name,
         ${RATING} AS avg_rating, ${RATING_COUNT} AS review_count, ${SOLD} AS sold_count
    FROM products p JOIN product_categories c ON c.id = p.category_id`;

export function mapProduct(r) {
  const images = JSON.parse(r.images);
  return {
    id: r.id,
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    categoryId: r.category_id,
    categorySlug: r.category_slug,
    categoryName: r.category_name,
    brand: r.brand,
    description: r.description,
    features: JSON.parse(r.features),
    specs: JSON.parse(r.specs),
    images,
    image: images[0] || null,
    pricePaise: r.price_paise,
    mrpPaise: r.mrp_paise,
    discountPercent: r.mrp_paise > r.price_paise ? Math.round(((r.mrp_paise - r.price_paise) / r.mrp_paise) * 100) : 0,
    stock: r.stock,
    inStock: r.stock > 0,
    lowStock: r.stock > 0 && r.stock <= config.business.lowStockThreshold,
    isUniversal: Boolean(r.is_universal),
    fitmentAvailable: Boolean(r.fitment_available),
    warranty: r.warranty,
    isActive: Boolean(r.is_active),
    isFeatured: Boolean(r.is_featured),
    isDeal: Boolean(r.is_deal),
    rating: r.avg_rating ? Math.round(r.avg_rating * 10) / 10 : null,
    reviewCount: r.review_count || 0,
    soldCount: r.sold_count || 0,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Public catalogue
// ---------------------------------------------------------------------------
export async function listCategories({ includeInactive = false } = {}) {
  return (await all(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
       FROM product_categories c WHERE (? = 1 OR c.is_active = 1) ORDER BY c.sort_order, c.name`,
    includeInactive ? 1 : 0,
  )).map((c) => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, image: c.image, icon: c.icon, isActive: Boolean(c.is_active), productCount: c.product_count }));
}

export async function listCarModels() {
  return all('SELECT id, make, model, body_type AS bodyType FROM car_models ORDER BY make, model');
}

const SORTS = {
  relevance: 'is_featured DESC, is_deal DESC, sold_count DESC, name',
  price_asc: 'price_paise ASC',
  price_desc: 'price_paise DESC',
  rating: 'avg_rating IS NULL, avg_rating DESC, review_count DESC',
  discount: '(mrp_paise - price_paise) * 1.0 / mrp_paise DESC',
  newest: 'created_at DESC, id DESC',
};

/**
 * Shop listing with filters. Every filter is a "?" parameter; only the ORDER BY comes
 * from a fixed whitelist (SORTS), so user input never becomes SQL text.
 */
export async function listProducts(f = {}) {
  const where = ['p.is_active = 1'];
  const params = [];
  if (f.search) {
    where.push('(p.name LIKE ? OR p.brand LIKE ? OR p.sku LIKE ? OR p.description LIKE ?)');
    const like = `%${f.search}%`;
    params.push(like, like, like, like);
  }
  if (f.category) { where.push('c.slug = ?'); params.push(f.category); }
  if (f.carModelId) {
    where.push('(p.is_universal = 1 OR EXISTS (SELECT 1 FROM product_compatibility pc WHERE pc.product_id = p.id AND pc.car_model_id = ?))');
    params.push(f.carModelId);
  }
  if (f.minPrice) { where.push('p.price_paise >= ?'); params.push(Math.round(f.minPrice * 100)); }
  if (f.maxPrice) { where.push('p.price_paise <= ?'); params.push(Math.round(f.maxPrice * 100)); }
  if (f.inStock) where.push('p.stock > 0');
  if (f.featured) where.push('p.is_featured = 1');
  if (f.deal) where.push('p.is_deal = 1');

  let sql = `SELECT * FROM (${PRODUCT_SELECT} WHERE ${where.join(' AND ')}) AS t`;
  if (f.minRating) { sql += ' WHERE avg_rating >= ?'; params.push(f.minRating); }
  sql += ` ORDER BY ${SORTS[f.sort] || SORTS.relevance}`;
  return (await all(sql, ...params)).map(mapProduct);
}

export async function getProduct(idOrSlug, { includeInactive = false } = {}) {
  const row = typeof idOrSlug === 'number'
    ? await one(`${PRODUCT_SELECT} WHERE p.id = ?`, idOrSlug)
    : await one(`${PRODUCT_SELECT} WHERE p.slug = ?`, idOrSlug);
  if (!row || (!includeInactive && !row.is_active)) throw AppError.notFound('Product not found');
  const product = mapProduct(row);
  product.compatibleModels = await all(
    `SELECT m.id, m.make, m.model FROM product_compatibility pc JOIN car_models m ON m.id = pc.car_model_id
      WHERE pc.product_id = ? ORDER BY m.make, m.model`, row.id,
  );
  return product;
}

/** Product page: product + approved reviews + related products from the same category. */
export async function getProductPage(slug) {
  const product = await getProduct(slug);
  product.reviews = (await all(
    `SELECT pr.*, u.name AS customer_name, u.avatar FROM product_reviews pr JOIN users u ON u.id = pr.user_id
      WHERE pr.product_id = ? AND pr.status = 'approved' ORDER BY pr.created_at DESC LIMIT 20`, product.id,
  )).map(mapProductReview);
  product.related = (await all(`${PRODUCT_SELECT} WHERE p.category_id = ? AND p.id <> ? AND p.is_active = 1 ORDER BY p.is_featured DESC, p.id LIMIT 4`, product.categoryId, product.id)).map(mapProduct);
  return product;
}

// ---------------------------------------------------------------------------
// Product reviews (verified buyers only)
// ---------------------------------------------------------------------------
function mapProductReview(r) {
  return {
    id: r.id, kind: 'product', productId: r.product_id, productName: r.product_name ?? null, productSlug: r.product_slug ?? null,
    orderId: r.order_id, rating: r.rating, title: r.title, comment: r.comment, status: r.status,
    customerName: r.customer_name, avatar: r.avatar ?? null, createdAt: r.created_at, verified: true,
  };
}

/** Has this user received (delivered) an order containing the product? Returns the order id. */
export async function verifiedPurchaseOrderId(userId, productId) {
  const row = await one(
    `SELECT o.id FROM orders o JOIN order_items i ON i.order_id = o.id
      WHERE o.user_id = ? AND i.product_id = ? AND o.status IN ('delivered', 'return_requested', 'returned')
      ORDER BY o.id DESC LIMIT 1`, userId, productId,
  );
  return row?.id ?? null;
}

export async function createProductReview(user, productId, { rating, title, comment }) {
  await getProduct(productId, { includeInactive: true });
  const orderId = await verifiedPurchaseOrderId(user.id, productId);
  if (!orderId) throw AppError.forbidden('Only verified buyers can review this product (after delivery).');
  if (await one('SELECT id FROM product_reviews WHERE product_id = ? AND user_id = ?', productId, user.id)) {
    throw AppError.conflict('You have already reviewed this product');
  }
  const { lastInsertRowid } = await run(
    "INSERT INTO product_reviews (product_id, user_id, order_id, rating, title, comment, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    productId, user.id, orderId, rating, title, comment, nowSql(),
  );
  return mapProductReview({ ...(await one('SELECT * FROM product_reviews WHERE id = ?', lastInsertRowid)), customer_name: user.name });
}

const PR_SELECT = `SELECT pr.*, u.name AS customer_name, u.avatar, p.name AS product_name, p.slug AS product_slug
                     FROM product_reviews pr JOIN users u ON u.id = pr.user_id JOIN products p ON p.id = pr.product_id`;

export const listMyProductReviews = async (userId) =>
  (await all(`${PR_SELECT} WHERE pr.user_id = ? ORDER BY pr.created_at DESC`, userId)).map(mapProductReview);

export const adminListProductReviews = async ({ status = '' } = {}) =>
  (await all(`${PR_SELECT} WHERE (? = '' OR pr.status = ?) ORDER BY pr.status = 'pending' DESC, pr.created_at DESC`, status, status)).map(mapProductReview);

export async function moderateProductReview(id, status) {
  const { changes } = await run('UPDATE product_reviews SET status = ?, moderated_at = ? WHERE id = ?', status, nowSql(), id);
  if (!changes) throw AppError.notFound('Review not found');
  return mapProductReview(await one(`${PR_SELECT} WHERE pr.id = ?`, id));
}

export async function deleteProductReview(id) {
  const { changes } = await run('DELETE FROM product_reviews WHERE id = ?', id);
  if (!changes) throw AppError.notFound('Review not found');
}

// ---------------------------------------------------------------------------
// Stock helpers (used inside order transactions)
// ---------------------------------------------------------------------------
/**
 * STOCK GUARD: decreases stock only if enough is left - one atomic UPDATE with the
 * condition "stock >= ?". Combined with SELECT ... FOR UPDATE in the order transaction
 * this makes overselling impossible, even with many customers checking out at once.
 */
export async function takeStock(productId, quantity, reference, userId) {
  const { changes } = await run('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?', quantity, nowSql(), productId, quantity);
  if (!changes) {
    const p = await one('SELECT name, stock FROM products WHERE id = ?', productId);
    throw AppError.conflict(p.stock > 0 ? `Only ${p.stock} left of "${p.name}". Please reduce the quantity.` : `"${p.name}" just went out of stock.`);
  }
  await run("INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (?, ?, 'order', ?, ?, ?)",
    productId, -quantity, reference, userId ?? null, nowSql());
}

/** Puts stock back (cancellation or approved return). */
export async function restoreStock(productId, quantity, reason, reference, userId) {
  await run('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?', quantity, nowSql(), productId);
  await run('INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    productId, quantity, reason, reference, userId ?? null, nowSql());
}

// ---------------------------------------------------------------------------
// Admin: products, categories, inventory
// ---------------------------------------------------------------------------
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function adminListProducts({ search = '', category = '', stock = '' } = {}) {
  const like = `%${search}%`;
  const low = config.business.lowStockThreshold;
  return (await all(
    `${PRODUCT_SELECT}
      WHERE (p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ?) AND (? = '' OR c.slug = ?)
        AND (? = '' OR (? = 'out' AND p.stock = 0) OR (? = 'low' AND p.stock > 0 AND p.stock <= ?))
      ORDER BY c.sort_order, p.name`,
    like, like, like, category, category, stock, stock, stock, low,
  )).map(mapProduct);
}

async function validateProduct(input, id = 0) {
  const errors = {};
  if (input.mrp < input.price) errors.mrp = 'MRP must be at least the selling price';
  if (!(await one('SELECT id FROM product_categories WHERE id = ?', input.categoryId))) errors.categoryId = 'Choose a category';
  if (await one('SELECT id FROM products WHERE sku = ? AND id <> ?', input.sku, id)) errors.sku = 'This SKU is already used';
  if (!input.isUniversal && !input.compatibleModelIds.length) errors.compatibleModelIds = 'Pick compatible models or mark the product universal';
  if (Object.keys(errors).length) throw AppError.unprocessable('Please correct the highlighted fields', errors);
}

async function saveCompatibility(productId, input) {
  await run('DELETE FROM product_compatibility WHERE product_id = ?', productId);
  if (input.isUniversal) return;
  for (const modelId of input.compatibleModelIds) {
    if (!(await one('SELECT id FROM car_models WHERE id = ?', modelId))) throw AppError.unprocessable(`Unknown car model #${modelId}`);
    await run('INSERT INTO product_compatibility (product_id, car_model_id) VALUES (?, ?)', productId, modelId);
  }
}

export async function createProduct(input, adminId, openingStock = 0) {
  await validateProduct(input);
  let slug = slugify(input.name);
  if (await one('SELECT id FROM products WHERE slug = ?', slug)) slug = `${slug}-${input.sku.toLowerCase()}`;
  const id = await transaction(async () => {
    const { lastInsertRowid } = await run(
      `INSERT INTO products (sku, slug, name, category_id, brand, description, features, specs, images, price_paise, mrp_paise, stock,
                             is_universal, fitment_available, warranty, is_active, is_featured, is_deal, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.sku, slug, input.name, input.categoryId, input.brand, input.description, JSON.stringify(input.features), JSON.stringify([input.image]),
      input.price, input.mrp, input.isUniversal ? 1 : 0, input.fitmentAvailable ? 1 : 0, input.warranty,
      input.isActive ? 1 : 0, input.isFeatured ? 1 : 0, input.isDeal ? 1 : 0, nowSql(), nowSql(),
    );
    await saveCompatibility(lastInsertRowid, input);
    if (openingStock > 0) {
      await run('UPDATE products SET stock = ? WHERE id = ?', openingStock, lastInsertRowid);
      await run("INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (?, ?, 'opening', 'Opening stock', ?, ?)",
        lastInsertRowid, openingStock, adminId, nowSql());
    }
    return lastInsertRowid;
  });
  return getProduct(id, { includeInactive: true });
}

export async function updateProduct(id, input) {
  const existing = await getProduct(id, { includeInactive: true });
  await validateProduct(input, id);
  const images = [input.image, ...existing.images.filter((img) => img !== input.image).slice(0, 3)];
  await transaction(async () => {
    await run(
      `UPDATE products SET sku = ?, name = ?, category_id = ?, brand = ?, description = ?, features = ?, images = ?, price_paise = ?, mrp_paise = ?,
              is_universal = ?, fitment_available = ?, warranty = ?, is_active = ?, is_featured = ?, is_deal = ?, updated_at = ?
        WHERE id = ?`,
      input.sku, input.name, input.categoryId, input.brand, input.description, JSON.stringify(input.features), JSON.stringify(images),
      input.price, input.mrp, input.isUniversal ? 1 : 0, input.fitmentAvailable ? 1 : 0, input.warranty,
      input.isActive ? 1 : 0, input.isFeatured ? 1 : 0, input.isDeal ? 1 : 0, nowSql(), id,
    );
    await saveCompatibility(id, input);
  });
  return getProduct(id, { includeInactive: true });
}

export async function deleteProduct(id) {
  await getProduct(id, { includeInactive: true });
  if (await one('SELECT id FROM order_items WHERE product_id = ? LIMIT 1', id)) {
    throw AppError.conflict('This product appears in orders. Deactivate it instead of deleting it.');
  }
  await run('DELETE FROM products WHERE id = ?', id);
}

/** Manual stock correction (new delivery, damaged goods...). Locks the row first. */
export async function adjustStock(id, { change, note }, adminId) {
  if (change === 0) throw AppError.unprocessable('Enter a non-zero change', { change: 'Cannot be 0' });
  await transaction(async () => {
    const p = await one('SELECT stock FROM products WHERE id = ? FOR UPDATE', id);
    if (!p) throw AppError.notFound('Product not found');
    if (p.stock + change < 0) throw AppError.unprocessable(`Stock cannot go below zero (current ${p.stock})`, { change: `At least -${p.stock}` });
    await run('UPDATE products SET stock = stock + ?, updated_at = ? WHERE id = ?', change, nowSql(), id);
    await run("INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (?, ?, 'adjustment', ?, ?, ?)",
      id, change, note, adminId, nowSql());
  });
  return getProduct(id, { includeInactive: true });
}

export async function stockMovements(productId) {
  return all(
    `SELECT m.id, m.qty_change AS qtyChange, m.reason, m.reference, m.created_at AS createdAt, u.name AS createdBy
       FROM stock_movements m LEFT JOIN users u ON u.id = m.created_by WHERE m.product_id = ? ORDER BY m.id DESC LIMIT 50`, productId,
  );
}

export async function lowStockProducts() {
  return (await all(`${PRODUCT_SELECT} WHERE p.is_active = 1 AND p.stock <= ? ORDER BY p.stock, p.name`, config.business.lowStockThreshold)).map(mapProduct);
}

export async function createCategory(c) {
  const slug = slugify(c.name);
  if (await one('SELECT id FROM product_categories WHERE slug = ? OR name = ?', slug, c.name)) throw AppError.conflict('A category with this name already exists');
  const max = (await one('SELECT COALESCE(MAX(sort_order), 0) AS m FROM product_categories')).m;
  await run('INSERT INTO product_categories (slug, name, description, image, icon, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)',
    slug, c.name, c.description, c.image, 'tag', max + 1, c.isActive ? 1 : 0);
  return (await listCategories({ includeInactive: true })).find((x) => x.slug === slug);
}

export async function updateCategory(id, c) {
  if (!(await one('SELECT id FROM product_categories WHERE id = ?', id))) throw AppError.notFound('Category not found');
  if (await one('SELECT id FROM product_categories WHERE name = ? AND id <> ?', c.name, id)) throw AppError.conflict('Another category uses this name');
  await run('UPDATE product_categories SET name = ?, description = ?, image = ?, is_active = ? WHERE id = ?', c.name, c.description, c.image, c.isActive ? 1 : 0, id);
  return (await listCategories({ includeInactive: true })).find((x) => x.id === id);
}

export async function deleteCategory(id) {
  if (!(await one('SELECT id FROM product_categories WHERE id = ?', id))) throw AppError.notFound('Category not found');
  if (await one('SELECT id FROM products WHERE category_id = ? LIMIT 1', id)) throw AppError.conflict('This category still has products. Move or delete them first.');
  await run('DELETE FROM product_categories WHERE id = ?', id);
}
