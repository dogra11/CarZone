/** admin/feedback.controller.js - Wash review moderation and contact-form messages. */
import * as reviews from '../../services/review.service.js';
import * as contact from '../../services/contact.service.js';
import { idParam } from '../../middleware/validate.js';

export const listReviews = async (req, res) => res.ok(await reviews.adminListReviews({ status: req.query.status || '' }));
export const moderateReview = async (req, res) => res.ok({ review: await reviews.moderateReview(idParam(req), req.valid), message: `Review ${req.valid.status}` });
export async function deleteReview(req, res) { await reviews.deleteReview(idParam(req)); res.ok({ message: 'Review deleted' }); }

export const listMessages = async (req, res) => res.ok(await contact.listMessages({ status: req.query.status || '' }));
export const updateMessage = async (req, res) => res.ok({ message: await contact.updateMessageStatus(idParam(req), req.valid.status) });
export async function deleteMessage(req, res) { await contact.deleteMessage(idParam(req)); res.ok({ message: 'Message deleted' }); }
