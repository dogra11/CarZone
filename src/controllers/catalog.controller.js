/**
 * catalog.controller.js - Public, read-only endpoints: wash services, availability,
 * offers, testimonials and site metadata (company details + business rules).
 */
import { config } from '../config/index.js';
import * as catalog from '../services/catalog.service.js';
import * as slots from '../services/slot.service.js';
import * as coupons from '../services/coupon.service.js';
import * as reviews from '../services/review.service.js';
import { razorpayEnabled } from '../services/payments/index.js';
import { todayISO, addDaysISO } from '../utils/dates.js';

export function meta(req, res) {
  const b = config.business;
  res.ok({
    company: config.company,
    rules: {
      gstPercent: b.gstPercent, pickupFeePaise: b.pickupFeePaise, freeCancelHours: b.freeCancelHours,
      lateCancelRefundPercent: b.lateCancelRefundPercent, maxReschedules: b.maxReschedules,
      minHoursBeforeReschedule: b.minHoursBeforeReschedule, bookingWindowDays: b.bookingWindowDays,
      freeShippingAbovePaise: b.freeShippingAbovePaise, shippingFeePaise: b.shippingFeePaise, fitmentFeePaise: b.fitmentFeePaise,
      returnWindowDays: b.returnWindowDays, paymentExpiryMinutes: b.paymentExpiryMinutes,
    },
    paymentGateway: razorpayEnabled() ? 'razorpay' : 'simulated',
    today: todayISO(),
    lastBookableDate: addDaysISO(todayISO(), b.bookingWindowDays),
    demoMode: config.demoMode,
  });
}

export const listServices = async (req, res) => res.ok(await catalog.listServices());

export async function getService(req, res) {
  const service = await catalog.getService(req.params.slug);
  res.ok({ ...service, reviews: await reviews.listServiceReviews(service.id) });
}

export async function availability(req, res) {
  res.ok({ date: req.validQuery.date, slots: await slots.getAvailability(req.validQuery.date) });
}

export const offers = async (req, res) => res.ok(await coupons.listActiveOffers(['wash', 'store'].includes(req.query.scope) ? req.query.scope : ''));
export const testimonials = async (req, res) => res.ok(await reviews.featuredReviews());
