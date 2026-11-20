/**
 * review.controller.js - Customers review completed wash bookings and delivered products.
 */
import * as reviews from '../services/review.service.js';
import * as products from '../services/product.service.js';
import { idParam } from '../middleware/validate.js';

export async function create(req, res) {
  const review = await reviews.createReview(req.user, req.valid);
  res.ok({ review, message: 'Thank you! Your review will appear after a quick moderation check.' }, 201);
}

export async function listMine(req, res) {
  const [service, product] = await Promise.all([reviews.listMyReviews(req.user.id), products.listMyProductReviews(req.user.id)]);
  res.ok([...service, ...product].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
}

export async function createProductReview(req, res) {
  const review = await products.createProductReview(req.user, idParam(req), req.valid);
  res.ok({ review, message: 'Thanks for your review! It will be published after moderation.' }, 201);
}
