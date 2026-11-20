/**
 * customer.controller.js - Customer dashboard summary, profile, vehicles and addresses.
 */
import * as users from '../services/user.service.js';
import * as vehicles from '../services/vehicle.service.js';
import * as addresses from '../services/address.service.js';
import { customerSummary } from '../services/booking.service.js';
import { listActiveOffers } from '../services/coupon.service.js';
import { idParam } from '../middleware/validate.js';

export async function dashboard(req, res) {
  res.ok({ ...(await customerSummary(req.user.id)), offers: await listActiveOffers() });
}

export const getProfile = async (req, res) => res.ok(await users.getUser(req.user.id));
export const updateProfile = async (req, res) => res.ok({ user: await users.updateProfile(req.user.id, req.valid), message: 'Profile updated' });

export const listVehicles = async (req, res) => res.ok(await vehicles.listVehicles(req.user.id));
export const addVehicle = async (req, res) => res.ok({ vehicle: await vehicles.addVehicle(req.user.id, req.valid), message: 'Vehicle saved' }, 201);
export const updateVehicle = async (req, res) => res.ok({ vehicle: await vehicles.updateVehicle(req.user.id, idParam(req), req.valid), message: 'Vehicle updated' });
export async function deleteVehicle(req, res) {
  await vehicles.deleteVehicle(req.user.id, idParam(req));
  res.ok({ message: 'Vehicle removed' });
}

export const listAddresses = async (req, res) => res.ok(await addresses.listAddresses(req.user.id));
export const addAddress = async (req, res) => res.ok({ address: await addresses.saveAddress(req.user.id, req.valid), message: 'Address saved' }, 201);
export const updateAddress = async (req, res) => res.ok({ address: await addresses.saveAddress(req.user.id, req.valid, idParam(req)), message: 'Address updated' });
export async function deleteAddress(req, res) {
  await addresses.deleteAddress(req.user.id, idParam(req));
  res.ok({ message: 'Address removed' });
}
