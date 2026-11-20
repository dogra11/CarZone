/**
 * public.routes.js - express.Router() (mounted on /api) with the endpoints anyone can
 * call without logging in: wash catalogue, availability, offers, testimonials, site
 * metadata, contact form and the store catalogue.
 * (The Razorpay webhook needs the raw request body, so it is registered in routes/index.js
 * BEFORE express.json() runs.)
 */
import express from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { schemas } from '../utils/shared.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as catalog from '../controllers/catalog.controller.js';
import * as contact from '../controllers/contact.controller.js';
import * as store from '../controllers/store.controller.js';

const contactLimiter = rateLimit({ name: 'contact', windowMs: 10 * 60 * 1000, max: 10 });
const router = express.Router();

// (GET /api/health lives in app.js - it must work before authentication; see health.controller.js)
router.get('/meta', asyncHandler(catalog.meta));
router.get('/services', asyncHandler(catalog.listServices));
router.get('/services/:slug', asyncHandler(catalog.getService));
router.get('/slots', validateQuery({ date: { label: 'Date', type: 'date', required: true } }), asyncHandler(catalog.availability));
router.get('/offers', asyncHandler(catalog.offers));
router.get('/reviews/featured', asyncHandler(catalog.testimonials));
router.post('/contact', contactLimiter, validateBody(schemas.contact), asyncHandler(contact.submit));

// Accessories store catalogue (public browsing)
router.get('/store/categories', asyncHandler(store.categories));
router.get('/store/car-models', asyncHandler(store.carModels));
router.get('/store/products', asyncHandler(store.listProducts));
router.get('/store/products/:slug', asyncHandler(store.getProduct));

export default router;
