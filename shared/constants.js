/**
 * shared/constants.js - Values shared by the React client AND the Node.js server.
 *
 * This file is plain ES-module JavaScript with no browser or Node-specific code,
 * so the Node server imports it (src/utils/shared.js) and the React client imports it
 * too (client/src/utils/shared.js). One source of truth = no mismatched dropdowns.
 */

export const VEHICLE_TYPES = ['hatchback', 'sedan', 'suv', 'luxury', 'bike'];

export const VEHICLE_TYPE_LABELS = {
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV / MUV',
  luxury: 'Luxury / Premium',
  bike: 'Two-wheeler',
};

// Indian car makes and models (plain text only - no manufacturer logos are used anywhere).
// Used by the store's "Select your car" compatibility filter and the booking wizard.
export const CAR_MODELS = [
  ['Maruti Suzuki', 'Swift', 'hatchback'], ['Maruti Suzuki', 'Baleno', 'hatchback'], ['Maruti Suzuki', 'Brezza', 'suv'],
  ['Maruti Suzuki', 'Dzire', 'sedan'], ['Maruti Suzuki', 'Ertiga', 'muv'], ['Maruti Suzuki', 'Grand Vitara', 'suv'],
  ['Hyundai', 'Creta', 'suv'], ['Hyundai', 'Venue', 'suv'], ['Hyundai', 'i20', 'hatchback'], ['Hyundai', 'Verna', 'sedan'],
  ['Tata', 'Nexon', 'suv'], ['Tata', 'Punch', 'suv'], ['Tata', 'Harrier', 'suv'], ['Tata', 'Safari', 'suv'], ['Tata', 'Altroz', 'hatchback'], ['Tata', 'Tiago', 'hatchback'],
  ['Mahindra', 'Thar', 'suv'], ['Mahindra', 'XUV700', 'suv'], ['Mahindra', 'Scorpio-N', 'suv'], ['Mahindra', 'XUV 3XO', 'suv'],
  ['Kia', 'Seltos', 'suv'], ['Kia', 'Sonet', 'suv'], ['Kia', 'Carens', 'muv'],
  ['Toyota', 'Innova Hycross', 'muv'], ['Toyota', 'Fortuner', 'suv'], ['Toyota', 'Glanza', 'hatchback'],
  ['Honda', 'City', 'sedan'], ['Honda', 'Amaze', 'sedan'], ['Honda', 'Elevate', 'suv'],
  ['MG', 'Hector', 'suv'], ['MG', 'ZS EV', 'ev'], ['MG', 'Comet EV', 'ev'],
  ['Skoda', 'Kushaq', 'suv'], ['Volkswagen', 'Taigun', 'suv'], ['Renault', 'Kiger', 'suv'],
].map(([make, model, bodyType]) => ({ make, model, bodyType }));

/** { make: [models] } - e.g. for the make -> model dropdowns. */
export const CAR_MAKES = CAR_MODELS.reduce((acc, c) => { (acc[c.make] ||= []).push(c.model); return acc; }, {});

// Booking-wizard suggestions per vehicle type (customers may still type any brand/model).
export const VEHICLE_BRANDS = {
  hatchback: { 'Maruti Suzuki': ['Swift', 'Baleno'], Hyundai: ['i20'], Tata: ['Altroz', 'Tiago'], Toyota: ['Glanza'], MG: ['Comet EV'] },
  sedan: { 'Maruti Suzuki': ['Dzire'], Hyundai: ['Verna'], Honda: ['City', 'Amaze'] },
  suv: { 'Maruti Suzuki': ['Brezza', 'Grand Vitara', 'Ertiga'], Hyundai: ['Creta', 'Venue'], Tata: ['Nexon', 'Punch', 'Harrier', 'Safari'], Mahindra: ['Thar', 'XUV700', 'Scorpio-N', 'XUV 3XO'], Kia: ['Seltos', 'Sonet', 'Carens'], Honda: ['Elevate'], MG: ['Hector', 'ZS EV'], Skoda: ['Kushaq'], Volkswagen: ['Taigun'], Renault: ['Kiger'] },
  luxury: { Toyota: ['Fortuner', 'Innova Hycross'], Mahindra: ['XUV700'], Tata: ['Safari'], MG: ['Hector'] },
  bike: { 'Royal Enfield': ['Classic 350', 'Himalayan 450'], Bajaj: ['Pulsar NS200', 'Dominar 400'], KTM: ['Duke 390'], Honda: ['Activa 6G', 'CB350'], TVS: ['Apache RTR 160'] },
};

export const BOOKING_STATUSES = ['pending_payment', 'confirmed', 'rescheduled', 'in_progress', 'completed', 'cancelled'];

export const BOOKING_STATUS_LABELS = {
  pending_payment: 'Pending payment',
  confirmed: 'Confirmed',
  rescheduled: 'Rescheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Online methods (wash bookings and store orders). Cash on delivery is store-only.
export const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'wallet'];
export const STORE_PAYMENT_METHODS = [...PAYMENT_METHODS, 'cod'];

export const PAYMENT_METHOD_LABELS = {
  card: 'Credit / Debit card',
  upi: 'UPI',
  netbanking: 'Net banking',
  wallet: 'Wallet',
  cod: 'Cash on delivery',
};

export const PAYMENT_STATUSES = ['created', 'pending', 'success', 'failed', 'cancelled', 'refund_pending', 'refunded'];

export const ORDER_STATUSES = ['pending_payment', 'placed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned'];
export const ORDER_STATUS_LABELS = {
  pending_payment: 'Awaiting payment', placed: 'Placed', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', cancelled: 'Cancelled', return_requested: 'Return requested', returned: 'Returned',
};
/** The happy path shown as a tracking timeline. */
export const ORDER_FLOW = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];

export const INDIAN_STATES = ['Andhra Pradesh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];

export const PRODUCT_SORTS = { relevance: 'Featured', price_asc: 'Price: low to high', price_desc: 'Price: high to low', rating: 'Top rated', discount: 'Biggest discount', newest: 'Newest' };

export const NETBANKING_BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank'];
export const WALLETS = ['Paytm', 'PhonePe', 'Amazon Pay'];

// Test values for the payment simulator (documented in README "Demo walkthrough").
export const TEST_PAYMENT_VALUES = {
  successCard: '4111 1111 1111 1111',
  failCard: '4000 0000 0000 0002',
  otp: '123456',
  successUpi: 'success@upi',
  failUpi: 'failure@upi',
};

export const REPORT_TYPES = ['bookings', 'revenue', 'customers', 'services', 'payments', 'sales', 'categories', 'orders', 'inventory'];
