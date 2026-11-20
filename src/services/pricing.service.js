/**
 * pricing.service.js - The billing engine. calculateBill() prices every WASH booking and
 * calculateOrderTotals() every STORE order. One place = consistent totals everywhere
 * (live quotes, real bookings/orders, seed data and tests).
 *
 * PRICE CALCULATION (all values are integer paise):
 *   base       = price of the service for the chosen vehicle type
 *   addons     = sum of the selected add-on prices
 *   pickup     = pickup & drop fee (only if chosen)
 *   subtotal   = base + addons + pickup
 *   discount   = coupon discount on the subtotal (see computeDiscount)
 *   taxable    = subtotal - discount
 *   GST        = taxable x GST% , rounded to the nearest paisa (the ONLY rounding step)
 *   total      = taxable + GST
 */
import { config } from '../config/index.js';
import { percentOf } from '../utils/money.js';

/**
 * COUPON DISCOUNT LOGIC
 *  - 'percent' coupons: subtotal x value%, floored to whole paise, then capped at max_discount.
 *  - 'flat' coupons: a fixed amount in paise.
 *  - The discount can never be more than the subtotal (the bill never goes negative).
 * Eligibility (dates, limits, minimum order) is checked separately in coupon.service.js.
 */
export function computeDiscount(coupon, subtotalPaise) {
  if (!coupon) return 0;
  let discount = coupon.discountType === 'percent'
    ? Math.floor((subtotalPaise * coupon.discountValue) / 100)
    : coupon.discountValue;
  if (coupon.maxDiscountPaise) discount = Math.min(discount, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(discount, subtotalPaise));
}

/** Pure function: same inputs always give the same bill. Easy to unit-test. */
export function calculateBill({ basePricePaise, addons = [], pickupDrop = false, coupon = null,
  pickupFeePaise = config.business.pickupFeePaise, gstPercent = config.business.gstPercent }) {
  const addonsPaise = addons.reduce((sum, a) => sum + a.pricePaise, 0);
  const pickup = pickupDrop ? pickupFeePaise : 0;
  const subtotalPaise = basePricePaise + addonsPaise + pickup;
  const discountPaise = computeDiscount(coupon, subtotalPaise);
  const taxablePaise = subtotalPaise - discountPaise;
  const taxPaise = percentOf(taxablePaise, gstPercent);

  return {
    basePricePaise,
    addonsPaise,
    pickupFeePaise: pickup,
    subtotalPaise,
    discountPaise,
    taxablePaise,
    gstPercent,
    taxPaise,
    totalPaise: taxablePaise + taxPaise,
    couponCode: coupon ? coupon.code : null,
  };
}

/**
 * STORE ORDER TOTALS (accessories). Indian product prices (MRP / selling price) already
 * INCLUDE GST, so GST is not added again - we only report how much GST is included.
 *   subtotal  = sum(selling price x quantity)
 *   discount  = coupon discount on the subtotal (same computeDiscount as wash bookings)
 *   shipping  = free when (subtotal - discount) >= FREE_SHIPPING_ABOVE, otherwise SHIPPING_FEE
 *   fitment   = flat FITMENT_FEE when the customer books installation at a CarZone centre
 *   total     = subtotal - discount + shipping + fitment
 *   gstIncluded = (total - shipping) x 18/118   (GST portion inside GST-inclusive prices)
 */
export function calculateOrderTotals({ items, coupon = null, fitment = false,
  freeShippingAbovePaise = config.business.freeShippingAbovePaise, shippingFeePaise = config.business.shippingFeePaise,
  fitmentFeePaise = config.business.fitmentFeePaise, gstPercent = config.business.gstPercent }) {
  const subtotalPaise = items.reduce((sum, i) => sum + i.unitPricePaise * i.quantity, 0);
  const mrpTotalPaise = items.reduce((sum, i) => sum + (i.mrpPaise ?? i.unitPricePaise) * i.quantity, 0);
  const discountPaise = computeDiscount(coupon, subtotalPaise);
  const afterDiscount = subtotalPaise - discountPaise;
  const shippingPaise = subtotalPaise === 0 || afterDiscount >= freeShippingAbovePaise ? 0 : shippingFeePaise;
  const fitmentPaise = fitment ? fitmentFeePaise : 0;
  const totalPaise = afterDiscount + shippingPaise + fitmentPaise;
  const gstIncludedPaise = Math.round(((totalPaise - shippingPaise) * gstPercent) / (100 + gstPercent));
  return {
    subtotalPaise, mrpTotalPaise, savingsPaise: mrpTotalPaise - subtotalPaise, discountPaise, shippingPaise, fitmentPaise,
    totalPaise, gstIncludedPaise, couponCode: coupon ? coupon.code : null,
    freeShippingAbovePaise, amountForFreeShippingPaise: Math.max(0, freeShippingAbovePaise - afterDiscount),
  };
}
