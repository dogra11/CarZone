/**
 * customer.routes.js - express.Router() (mounted on /api) with the endpoints for
 * logged-in customers: dashboard, profile, vehicles, addresses, wash bookings, cart,
 * wishlist, orders, payments and reviews.
 *
 * ROLE-BASED ACCESS: creating bookings, paying and reviewing need the 'customer'
 * role. Viewing a booking/invoice needs any login - the service layer then checks
 * ownership (customers see only their own bookings; admins see all).
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { schemas } from '../utils/shared.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as customer from '../controllers/customer.controller.js';
import * as booking from '../controllers/booking.controller.js';
import * as payment from '../controllers/payment.controller.js';
import * as review from '../controllers/review.controller.js';
import * as store from '../controllers/store.controller.js';

const router = express.Router();
const customerOnly = requireRole('customer');

// Dashboard, profile & vehicles  (/api/me/...)
router.get('/me/dashboard', customerOnly, asyncHandler(customer.dashboard));
router.get('/me/profile', requireAuth, asyncHandler(customer.getProfile));
router.put('/me/profile', requireAuth, validateBody(schemas.profile), asyncHandler(customer.updateProfile));
router.get('/me/vehicles', customerOnly, asyncHandler(customer.listVehicles));
router.post('/me/vehicles', customerOnly, validateBody(schemas.vehicle), asyncHandler(customer.addVehicle));
router.put('/me/vehicles/:id', customerOnly, validateBody(schemas.vehicle), asyncHandler(customer.updateVehicle));
router.delete('/me/vehicles/:id', customerOnly, asyncHandler(customer.deleteVehicle));

// Bookings
router.post('/bookings/quote', customerOnly, validateBody(schemas.quote), asyncHandler(booking.quote));
router.post('/bookings', customerOnly, validateBody(schemas.booking), asyncHandler(booking.create));
router.get('/bookings', customerOnly, asyncHandler(booking.listMine));
router.get('/bookings/:id', requireAuth, asyncHandler(booking.getOne));
router.post('/bookings/:id/cancel', requireAuth, validateBody(schemas.cancel), asyncHandler(booking.cancel));
router.post('/bookings/:id/reschedule', customerOnly, validateBody(schemas.reschedule), asyncHandler(booking.reschedule));
router.get('/bookings/:id/invoice', requireAuth, asyncHandler(booking.invoice));

// Addresses (store deliveries)
router.get('/me/addresses', customerOnly, asyncHandler(customer.listAddresses));
router.post('/me/addresses', customerOnly, validateBody(schemas.address), asyncHandler(customer.addAddress));
router.put('/me/addresses/:id', customerOnly, validateBody(schemas.address), asyncHandler(customer.updateAddress));
router.delete('/me/addresses/:id', customerOnly, asyncHandler(customer.deleteAddress));

// Cart & wishlist
router.get('/cart', customerOnly, asyncHandler(store.getCart));
router.post('/cart/merge', customerOnly, asyncHandler(store.mergeCart));
router.post('/cart/items/:productId', customerOnly, asyncHandler(store.addToCart));
router.put('/cart/items/:productId', customerOnly, validateBody(schemas.cartItem), asyncHandler(store.setCartQuantity));
router.delete('/cart/items/:productId', customerOnly, asyncHandler(store.removeFromCart));
router.get('/me/wishlist', customerOnly, asyncHandler(store.wishlist));
router.post('/me/wishlist/:productId', customerOnly, asyncHandler(store.addToWishlist));
router.delete('/me/wishlist/:productId', customerOnly, asyncHandler(store.removeFromWishlist));

// Checkout & orders
router.post('/orders/quote', customerOnly, validateBody(schemas.orderQuote), asyncHandler(store.quote));
router.post('/orders', customerOnly, validateBody(schemas.checkout), asyncHandler(store.placeOrder));
router.get('/orders', customerOnly, asyncHandler(store.listMine));
router.get('/orders/:id', requireAuth, asyncHandler(store.getOne));
router.post('/orders/:id/cancel', requireAuth, validateBody(schemas.cancel), asyncHandler(store.cancel));
router.post('/orders/:id/return', customerOnly, validateBody(schemas.cancel), asyncHandler(store.requestReturn));
router.get('/orders/:id/invoice', requireAuth, asyncHandler(store.invoice));

// Payments (shared by bookings and orders)
router.post('/payments', customerOnly, validateBody(schemas.paymentCreate), asyncHandler(payment.create));
router.get('/payments', customerOnly, asyncHandler(payment.listMine));
router.post('/payments/:id/simulate', customerOnly, validateBody(schemas.paymentSimulate), asyncHandler(payment.simulate));
router.post('/payments/:id/verify', customerOnly, asyncHandler(payment.verify));
router.get('/payments/:id/status', customerOnly, asyncHandler(payment.status));

// Reviews (wash bookings + verified product purchases)
router.post('/reviews', customerOnly, validateBody(schemas.review), asyncHandler(review.create));
router.get('/reviews/mine', customerOnly, asyncHandler(review.listMine));
router.post('/store/products/:id/reviews', customerOnly, validateBody(schemas.productReview), asyncHandler(review.createProductReview));

export default router;
