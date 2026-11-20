/**
 * admin.routes.js - express.Router() for everything under /api/admin.
 *
 * router.use(requireRole('admin')) is the FIRST middleware of this router, so it runs
 * before every route below and protects the whole admin API at once (401 for guests,
 * 403 for customers). Each controller is async, so it is wrapped in asyncHandler()
 * to forward database errors to the central error middleware.
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { schemas, REPORT_TYPES } from '../utils/shared.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import * as users from '../controllers/admin/users.controller.js';
import * as bookings from '../controllers/admin/bookings.controller.js';
import * as catalog from '../controllers/admin/catalog.controller.js';
import * as finance from '../controllers/admin/finance.controller.js';
import * as feedback from '../controllers/admin/feedback.controller.js';
import * as insights from '../controllers/admin/insights.controller.js';
import * as store from '../controllers/admin/store.controller.js';

const router = express.Router();
router.use(requireRole('admin'));

// Analytics & reports
router.get('/analytics', asyncHandler(insights.analytics));
router.get('/reports/:type', validateQuery({
  from: { label: 'From', type: 'date' },
  to: { label: 'To', type: 'date' },
  format: { label: 'Format', type: 'enum', values: ['json', 'csv', 'html'] },
}), (req, res, next) => {
  if (!REPORT_TYPES.includes(req.params.type)) return res.status(404).json({ ok: false, error: { message: 'Unknown report type' } });
  next();
}, asyncHandler(insights.report));

// Users
router.get('/users', asyncHandler(users.list));
router.post('/users', validateBody(schemas.adminUser), asyncHandler(users.create));
router.get('/users/:id', asyncHandler(users.getOne));
router.put('/users/:id', validateBody(schemas.adminUserUpdate), asyncHandler(users.update));
router.delete('/users/:id', asyncHandler(users.remove));

// Bookings
router.get('/bookings', asyncHandler(bookings.list));
router.get('/bookings/:id', asyncHandler(bookings.getOne));
router.patch('/bookings/:id/status', validateBody(schemas.adminBookingStatus), asyncHandler(bookings.updateStatus));

// Services, add-ons, offers, time slots
router.get('/services', asyncHandler(catalog.listServices));
router.post('/services', validateBody(schemas.adminService), asyncHandler(catalog.createService));
router.put('/services/:id', validateBody(schemas.adminService), asyncHandler(catalog.updateService));
router.patch('/services/:id/active', asyncHandler(catalog.setServiceActive));
router.delete('/services/:id', asyncHandler(catalog.deleteService));

router.get('/addons', asyncHandler(catalog.listAddons));
router.post('/addons', validateBody(schemas.adminAddon), asyncHandler(catalog.createAddon));
router.put('/addons/:id', validateBody(schemas.adminAddon), asyncHandler(catalog.updateAddon));
router.delete('/addons/:id', asyncHandler(catalog.deleteAddon));

router.get('/coupons', asyncHandler(catalog.listCoupons));
router.post('/coupons', validateBody(schemas.adminCoupon), asyncHandler(catalog.createCoupon));
router.put('/coupons/:id', validateBody(schemas.adminCoupon), asyncHandler(catalog.updateCoupon));
router.delete('/coupons/:id', asyncHandler(catalog.deleteCoupon));

router.get('/slots', asyncHandler(catalog.listSlots));
router.get('/slots/day', validateQuery({ date: { label: 'Date', type: 'date', required: true } }), asyncHandler(catalog.dayInventory));
router.put('/slots/day', validateBody(schemas.adminSlotDay), asyncHandler(catalog.setDayOverride));
router.post('/slots', validateBody(schemas.adminSlot), asyncHandler(catalog.createSlot));
router.put('/slots/:id', validateBody(schemas.adminSlot), asyncHandler(catalog.updateSlot));
router.delete('/slots/:id', asyncHandler(catalog.deleteSlot));

// Accessories store: products, inventory, categories, orders, product reviews
router.get('/products', asyncHandler(store.listProducts));
router.get('/products/low-stock', asyncHandler(store.lowStock));
router.post('/products', validateBody(schemas.adminProduct), asyncHandler(store.createProduct));
router.get('/products/:id', asyncHandler(store.getProduct));
router.put('/products/:id', validateBody(schemas.adminProduct), asyncHandler(store.updateProduct));
router.delete('/products/:id', asyncHandler(store.deleteProduct));
router.patch('/products/:id/stock', validateBody(schemas.stockAdjust), asyncHandler(store.adjustStock));
router.get('/car-models', asyncHandler(store.carModels));
router.get('/categories', asyncHandler(store.listCategories));
router.post('/categories', validateBody(schemas.adminCategory), asyncHandler(store.createCategory));
router.put('/categories/:id', validateBody(schemas.adminCategory), asyncHandler(store.updateCategory));
router.delete('/categories/:id', asyncHandler(store.deleteCategory));
router.get('/orders', asyncHandler(store.listOrders));
router.get('/orders/:id', asyncHandler(store.getOrder));
router.patch('/orders/:id/status', validateBody(schemas.adminOrderStatus), asyncHandler(store.updateOrderStatus));
router.get('/product-reviews', asyncHandler(store.listProductReviews));
router.patch('/product-reviews/:id', validateBody({ status: schemas.adminReview.status }), asyncHandler(store.moderateProductReview));
router.delete('/product-reviews/:id', asyncHandler(store.deleteProductReview));

// Payments & refunds
router.get('/payments', asyncHandler(finance.listPayments));
router.get('/payments/:id', asyncHandler(finance.getPayment));
router.get('/refunds', asyncHandler(finance.listRefunds));
router.post('/refunds/:id/process', asyncHandler(finance.processRefund));

// Reviews & contact messages
router.get('/reviews', asyncHandler(feedback.listReviews));
router.patch('/reviews/:id', validateBody(schemas.adminReview), asyncHandler(feedback.moderateReview));
router.delete('/reviews/:id', asyncHandler(feedback.deleteReview));
router.get('/messages', asyncHandler(feedback.listMessages));
router.patch('/messages/:id', validateBody(schemas.adminMessage), asyncHandler(feedback.updateMessage));
router.delete('/messages/:id', asyncHandler(feedback.deleteMessage));

export default router;
