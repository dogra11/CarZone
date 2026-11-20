/**
 * admin/catalog.controller.js - Admin CRUD for wash services (with prices), add-ons,
 * coupons/offers and time slots.
 */
import * as catalog from '../../services/catalog.service.js';
import * as coupons from '../../services/coupon.service.js';
import * as slots from '../../services/slot.service.js';
import { idParam } from '../../middleware/validate.js';
import { AppError } from '../../utils/AppError.js';

const done = (message) => ({ message });

// ---- Services ----
export const listServices = async (req, res) => res.ok(await catalog.listServices({ includeInactive: true }));
export const createService = async (req, res) => res.ok({ service: await catalog.createService(req.valid, req.body.prices), message: 'Service created' }, 201);
export const updateService = async (req, res) => res.ok({ service: await catalog.updateService(idParam(req), req.valid, req.body.prices), message: 'Service updated' });
export async function setServiceActive(req, res) {
  if (typeof req.body.isActive !== 'boolean') throw AppError.unprocessable('isActive must be true or false');
  const service = await catalog.setServiceActive(idParam(req), req.body.isActive);
  res.ok({ service, message: `${service.name} is now ${service.isActive ? 'available' : 'unavailable'}` });
}
export async function deleteService(req, res) { await catalog.deleteService(idParam(req)); res.ok(done('Service deleted')); }

// ---- Add-ons ----
export const listAddons = async (req, res) => res.ok(await catalog.listAddons());
export const createAddon = async (req, res) => res.ok({ addon: await catalog.createAddon(req.valid), message: 'Add-on created' }, 201);
export const updateAddon = async (req, res) => res.ok({ addon: await catalog.updateAddon(idParam(req), req.valid), message: 'Add-on updated' });
export async function deleteAddon(req, res) { await catalog.deleteAddon(idParam(req)); res.ok(done('Add-on deleted')); }

// ---- Coupons / offers (wash, store or both) ----
export const listCoupons = async (req, res) => res.ok(await coupons.listCoupons());
export const createCoupon = async (req, res) => res.ok({ coupon: await coupons.createCoupon(req.valid), message: 'Offer created' }, 201);
export const updateCoupon = async (req, res) => res.ok({ coupon: await coupons.updateCoupon(idParam(req), req.valid), message: 'Offer updated' });
export async function deleteCoupon(req, res) { await coupons.deleteCoupon(idParam(req)); res.ok(done('Offer deleted')); }

// ---- Time slots ----
export const listSlots = async (req, res) => res.ok(await slots.listSlotDefinitions({ includeInactive: true }));
export const createSlot = async (req, res) => res.ok({ slot: await slots.createSlot(req.valid), message: 'Time slot created' }, 201);
export const updateSlot = async (req, res) => res.ok({ slot: await slots.updateSlot(idParam(req), req.valid), message: 'Time slot updated' });
export async function deleteSlot(req, res) { await slots.deleteSlot(idParam(req)); res.ok(done('Time slot deleted')); }
export const dayInventory = async (req, res) => res.ok({ date: req.validQuery.date, slots: await slots.getDayInventory(req.validQuery.date) });
export const setDayOverride = async (req, res) => res.ok({ slot: await slots.setDayOverride(req.valid), message: 'Slot updated for this date' });
