/**
 * shared/validation.js - Form validation rules used on BOTH sides of the app.
 *
 * The React forms run these rules to give instant feedback while typing, and the
 * server runs the very same rules again (never trust the client!). Because both
 * sides import this one file, client-side and server-side validation can never drift.
 *
 * A "schema" is an object of { fieldName: spec }. validate(schema, input) returns
 * { valid, errors: {field: message}, values: {field: cleanedValue} }.
 */
import { VEHICLE_TYPES, PAYMENT_METHODS, STORE_PAYMENT_METHODS, BOOKING_STATUSES, ORDER_STATUSES, INDIAN_STATES } from './constants.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[6-9]\d{9}$/;                       // Indian 10-digit mobile
const REG_RE = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/;      // e.g. MH12AB1234
const BH_REG_RE = /^\d{2}BH\d{4}[A-Z]{1,2}$/;           // Bharat series e.g. 22BH1234AA
const PIN_RE = /^[1-9]\d{5}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const CODE_RE = /^[A-Z0-9]{3,20}$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/;

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

/** Luhn checksum - the standard check-digit test every real card number passes. */
export function luhnValid(cardNumber) {
  const digits = String(cardNumber).replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Checks one value against one spec. Returns { value } or { error }. */
function checkField(spec, raw) {
  const label = spec.label || 'This field';
  if (isEmpty(raw)) {
    if (spec.required) return { error: `${label} is required` };
    return { value: spec.default };
  }

  switch (spec.type || 'string') {
    case 'string': {
      const v = String(raw).trim();
      if (spec.min && v.length < spec.min) return { error: `${label} must be at least ${spec.min} characters` };
      if (spec.max && v.length > spec.max) return { error: `${label} must be at most ${spec.max} characters` };
      if (spec.pattern && !spec.pattern.test(v)) return { error: spec.message || `${label} is not valid` };
      return { value: v };
    }
    case 'email': {
      const v = String(raw).trim().toLowerCase();
      if (v.length > 120 || !EMAIL_RE.test(v)) return { error: 'Enter a valid email address' };
      return { value: v };
    }
    case 'phone': {
      const v = String(raw).replace(/[\s-]/g, '').replace(/^(\+91|0)/, '');
      if (!PHONE_RE.test(v)) return { error: 'Enter a valid 10-digit Indian mobile number' };
      return { value: v };
    }
    case 'password': {
      const v = String(raw);
      if (v.length < 8 || v.length > 64) return { error: 'Password must be 8-64 characters' };
      if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return { error: 'Password needs at least one letter and one number' };
      return { value: v };
    }
    case 'int': {
      const n = Number(raw);
      if (!Number.isInteger(n)) return { error: `${label} must be a whole number` };
      if (spec.min !== undefined && n < spec.min) return { error: `${label} must be at least ${spec.min}` };
      if (spec.max !== undefined && n > spec.max) return { error: `${label} must be at most ${spec.max}` };
      return { value: n };
    }
    case 'money': {
      // Forms work in rupees (e.g. 499.50); the app stores integer paise (49950).
      const n = Number(raw);
      if (!Number.isFinite(n) || !/^\d+(\.\d{1,2})?$/.test(String(raw).trim())) return { error: `${label} must be an amount like 499 or 499.50` };
      if (spec.min !== undefined && n < spec.min) return { error: `${label} must be at least ₹${spec.min}` };
      if (spec.max !== undefined && n > spec.max) return { error: `${label} must be at most ₹${spec.max}` };
      return { value: Math.round(n * 100) };
    }
    case 'bool': {
      if (raw === true || raw === 'true' || raw === 'on' || raw === 1 || raw === '1') return { value: true };
      if (raw === false || raw === 'false' || raw === 0 || raw === '0') return { value: false };
      return { error: `${label} must be true or false` };
    }
    case 'date': {
      const v = String(raw).trim();
      const d = new Date(`${v}T00:00:00Z`);
      if (!DATE_RE.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return { error: `${label} must be a valid date` };
      return { value: v };
    }
    case 'time': {
      const v = String(raw).trim();
      if (!TIME_RE.test(v)) return { error: `${label} must be a time like 09:30` };
      return { value: v };
    }
    case 'enum': {
      const v = String(raw).trim();
      if (!spec.values.includes(v)) return { error: `${label} must be one of: ${spec.values.join(', ')}` };
      return { value: v };
    }
    case 'intArray': {
      if (!Array.isArray(raw)) return { error: `${label} must be a list` };
      const nums = raw.map(Number);
      if (nums.some((n) => !Number.isInteger(n) || n < 1)) return { error: `${label} contains an invalid id` };
      if (spec.max && nums.length > spec.max) return { error: `${label} can have at most ${spec.max} items` };
      return { value: [...new Set(nums)] };
    }
    case 'stringArray': {
      if (!Array.isArray(raw)) return { error: `${label} must be a list` };
      const items = raw.map((s) => String(s).trim()).filter(Boolean);
      if (spec.max && items.length > spec.max) return { error: `${label} can have at most ${spec.max} items` };
      if (items.some((s) => s.length > (spec.itemMax || 120))) return { error: `${label} items are too long` };
      return { value: items };
    }
    case 'regno': {
      const v = String(raw).toUpperCase().replace(/[\s-]/g, '');
      if (!REG_RE.test(v) && !BH_REG_RE.test(v)) return { error: 'Enter a valid registration number, e.g. MH12AB1234' };
      return { value: v };
    }
    case 'pincode': {
      const v = String(raw).trim();
      if (!PIN_RE.test(v)) return { error: 'Enter a valid 6-digit PIN code' };
      return { value: v };
    }
    case 'code': {
      const v = String(raw).trim().toUpperCase();
      if (!CODE_RE.test(v)) return { error: `${label} must be 3-20 letters/numbers` };
      return { value: v };
    }
    case 'upi': {
      const v = String(raw).trim().toLowerCase();
      if (!UPI_RE.test(v)) return { error: 'Enter a valid UPI ID, e.g. name@okbank' };
      return { value: v };
    }
    case 'card': {
      const v = String(raw).replace(/[\s-]/g, '');
      if (!/^\d{13,19}$/.test(v) || !luhnValid(v)) return { error: 'Enter a valid card number' };
      return { value: v };
    }
    case 'expiry': {
      const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(String(raw).trim());
      if (!m) return { error: 'Expiry must be MM/YY' };
      const now = new Date();
      const exp = new Date(2000 + Number(m[2]), Number(m[1]), 1); // first day of the month AFTER expiry
      if (exp <= now) return { error: 'This card has expired' };
      return { value: `${m[1]}/${m[2]}` };
    }
    case 'cvv': {
      const v = String(raw).trim();
      if (!/^\d{3,4}$/.test(v)) return { error: 'CVV must be 3 or 4 digits' };
      return { value: v };
    }
    default:
      return { error: `${label}: unknown validation type` };
  }
}

/** Validates an input object against a schema. Unknown fields are ignored (never trusted). */
export function validate(schema, input = {}) {
  const errors = {};
  const values = {};
  for (const [field, spec] of Object.entries(schema)) {
    const result = checkField(spec, input ? input[field] : undefined);
    if (result.error) errors[field] = result.error;
    else if (result.value !== undefined) values[field] = result.value;
  }
  return { valid: Object.keys(errors).length === 0, errors, values };
}

/** Validates a single field - handy for "validate on blur" in forms. */
export function validateField(schema, field, value) {
  const result = checkField(schema[field], value);
  return result.error || null;
}

// ---------------------------------------------------------------------------
// Schemas used by forms (browser) and controllers (server)
// ---------------------------------------------------------------------------
const name = { label: 'Name', type: 'string', required: true, min: 2, max: 80, pattern: /^[A-Za-z][A-Za-z .'-]*$/, message: 'Name can contain letters, spaces, dots and hyphens' };

export const schemas = {
  register: {
    name,
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Mobile number', type: 'phone', required: true },
    password: { label: 'Password', type: 'password', required: true },
  },
  login: {
    email: { label: 'Email', type: 'email', required: true },
    password: { label: 'Password', type: 'string', required: true, max: 64 },
    remember: { label: 'Remember me', type: 'bool', default: false },
  },
  forgotPassword: {
    email: { label: 'Email', type: 'email', required: true },
  },
  resetPassword: {
    token: { label: 'Reset token', type: 'string', required: true, min: 20, max: 200 },
    password: { label: 'New password', type: 'password', required: true },
  },
  changePassword: {
    currentPassword: { label: 'Current password', type: 'string', required: true, max: 64 },
    newPassword: { label: 'New password', type: 'password', required: true },
  },
  profile: {
    name,
    phone: { label: 'Mobile number', type: 'phone', required: true },
    address: { label: 'Address', type: 'string', max: 200 },
    city: { label: 'City', type: 'string', max: 60 },
    pincode: { label: 'PIN code', type: 'pincode' },
  },
  vehicle: {
    vehicleType: { label: 'Vehicle type', type: 'enum', values: VEHICLE_TYPES, required: true },
    brand: { label: 'Brand', type: 'string', required: true, min: 2, max: 40 },
    model: { label: 'Model', type: 'string', required: true, min: 1, max: 40 },
    registrationNo: { label: 'Registration number', type: 'regno', required: true },
    color: { label: 'Colour', type: 'string', max: 30 },
  },
  quote: {
    serviceId: { label: 'Service', type: 'int', required: true, min: 1 },
    vehicleType: { label: 'Vehicle type', type: 'enum', values: VEHICLE_TYPES, required: true },
    addonIds: { label: 'Add-ons', type: 'intArray', max: 10, default: [] },
    pickupDrop: { label: 'Pickup & drop', type: 'bool', default: false },
    couponCode: { label: 'Coupon code', type: 'code' },
  },
  booking: {
    serviceId: { label: 'Service', type: 'int', required: true, min: 1 },
    vehicleType: { label: 'Vehicle type', type: 'enum', values: VEHICLE_TYPES, required: true },
    vehicleId: { label: 'Saved vehicle', type: 'int', min: 1 },
    brand: { label: 'Brand', type: 'string', required: true, min: 2, max: 40 },
    model: { label: 'Model', type: 'string', required: true, min: 1, max: 40 },
    registrationNo: { label: 'Registration number', type: 'regno', required: true },
    saveVehicle: { label: 'Save vehicle', type: 'bool', default: false },
    addonIds: { label: 'Add-ons', type: 'intArray', max: 10, default: [] },
    bookingDate: { label: 'Date', type: 'date', required: true },
    timeSlotId: { label: 'Time slot', type: 'int', required: true, min: 1 },
    pickupDrop: { label: 'Pickup & drop', type: 'bool', default: false },
    address: { label: 'Address', type: 'string', required: true, min: 10, max: 200 },
    instructions: { label: 'Special instructions', type: 'string', max: 500 },
    couponCode: { label: 'Coupon code', type: 'code' },
    payAtCentre: { label: 'Pay at the centre', type: 'bool', default: false },
  },
  reschedule: {
    bookingDate: { label: 'New date', type: 'date', required: true },
    timeSlotId: { label: 'New time slot', type: 'int', required: true, min: 1 },
  },
  cancel: {
    reason: { label: 'Reason', type: 'string', required: true, min: 3, max: 300 },
  },
  // ---- Payments (shared by bookings and orders) ----
  paymentCreate: {
    purpose: { label: 'Purpose', type: 'enum', values: ['booking', 'order'], required: true },
    targetId: { label: 'Booking / order', type: 'int', required: true, min: 1 },
    idempotencyKey: { label: 'Idempotency key', type: 'string', required: true, min: 8, max: 80, pattern: /^[A-Za-z0-9_-]+$/ },
  },
  paymentSimulate: {
    method: { label: 'Payment method', type: 'enum', values: PAYMENT_METHODS, required: true },
  },
  otp: { otp: { label: 'OTP', type: 'string', required: true, pattern: /^\d{6}$/, message: 'Enter the 6-digit OTP' } },
  cardDetails: {
    cardName: { label: 'Name on card', type: 'string', required: true, min: 2, max: 60 },
    cardNumber: { label: 'Card number', type: 'card', required: true },
    expiry: { label: 'Expiry', type: 'expiry', required: true },
    cvv: { label: 'CVV', type: 'cvv', required: true },
  },
  upiDetails: { upiId: { label: 'UPI ID', type: 'upi', required: true } },
  netbankingDetails: { bank: { label: 'Bank', type: 'string', required: true, max: 60 } },
  walletDetails: { wallet: { label: 'Wallet', type: 'string', required: true, max: 60 } },
  review: {
    bookingId: { label: 'Booking', type: 'int', required: true, min: 1 },
    rating: { label: 'Rating', type: 'int', required: true, min: 1, max: 5 },
    title: { label: 'Title', type: 'string', required: true, min: 3, max: 80 },
    comment: { label: 'Review', type: 'string', required: true, min: 10, max: 1000 },
  },
  contact: {
    name,
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Mobile number', type: 'phone' },
    subject: { label: 'Subject', type: 'string', required: true, min: 3, max: 120 },
    message: { label: 'Message', type: 'string', required: true, min: 10, max: 2000 },
  },

  // ---- Store ----
  address: {
    label: { label: 'Label', type: 'string', required: true, min: 2, max: 20 },
    fullName: { ...name, label: 'Full name' },
    phone: { label: 'Mobile number', type: 'phone', required: true },
    line1: { label: 'Address line 1', type: 'string', required: true, min: 5, max: 120 },
    line2: { label: 'Address line 2', type: 'string', max: 120 },
    city: { label: 'City', type: 'string', required: true, min: 2, max: 60 },
    state: { label: 'State', type: 'enum', values: INDIAN_STATES, required: true },
    pincode: { label: 'PIN code', type: 'pincode', required: true },
    isDefault: { label: 'Default address', type: 'bool', default: false },
  },
  cartItem: {
    quantity: { label: 'Quantity', type: 'int', required: true, min: 0, max: 10 },
  },
  orderQuote: {
    couponCode: { label: 'Coupon code', type: 'code' },
    fitment: { label: 'Fitment', type: 'bool', default: false },
  },
  checkout: {
    addressId: { label: 'Delivery address', type: 'int', required: true, min: 1 },
    paymentMethod: { label: 'Payment method', type: 'enum', values: STORE_PAYMENT_METHODS, required: true },
    couponCode: { label: 'Coupon code', type: 'code' },
    fitment: { label: 'Fitment', type: 'bool', default: false },
    fitmentDate: { label: 'Fitment date', type: 'date' },
    fitmentSlotId: { label: 'Fitment slot', type: 'int', min: 1 },
  },
  productReview: {
    rating: { label: 'Rating', type: 'int', required: true, min: 1, max: 5 },
    title: { label: 'Title', type: 'string', required: true, min: 3, max: 80 },
    comment: { label: 'Review', type: 'string', required: true, min: 10, max: 1000 },
  },

  // ---- Admin forms ----
  adminUser: {
    name,
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Mobile number', type: 'phone', required: true },
    role: { label: 'Role', type: 'enum', values: ['customer', 'admin'], required: true },
    password: { label: 'Password', type: 'password', required: true },
  },
  adminUserUpdate: {
    name,
    phone: { label: 'Mobile number', type: 'phone', required: true },
    role: { label: 'Role', type: 'enum', values: ['customer', 'admin'], required: true },
    isActive: { label: 'Active', type: 'bool', required: true },
  },
  adminService: {
    name: { label: 'Service name', type: 'string', required: true, min: 3, max: 60 },
    category: { label: 'Category', type: 'string', required: true, min: 3, max: 40 },
    tagline: { label: 'Tagline', type: 'string', required: true, min: 5, max: 120 },
    description: { label: 'Description', type: 'string', required: true, min: 20, max: 1500 },
    benefits: { label: 'Benefits', type: 'stringArray', required: true, max: 8 },
    durationMinutes: { label: 'Duration', type: 'int', required: true, min: 15, max: 720 },
    image: { label: 'Image path', type: 'string', required: true, max: 200, pattern: /^\/assets\/images\/[\w/.-]+\.(jpg|jpeg|png|webp|svg)$/, message: 'Image must be a path like /assets/images/services/foam-wash.jpg' },
    pickupAvailable: { label: 'Pickup available', type: 'bool', default: false },
    isActive: { label: 'Active', type: 'bool', default: true },
    isFeatured: { label: 'Featured', type: 'bool', default: false },
    addonIds: { label: 'Add-ons', type: 'intArray', max: 12, default: [] },
  },
  adminAddon: {
    name: { label: 'Add-on name', type: 'string', required: true, min: 3, max: 60 },
    description: { label: 'Description', type: 'string', required: true, min: 5, max: 200 },
    price: { label: 'Price', type: 'money', required: true, min: 0, max: 50000 },
    durationMinutes: { label: 'Extra time', type: 'int', required: true, min: 0, max: 240 },
    isActive: { label: 'Active', type: 'bool', default: true },
  },
  adminCoupon: {
    code: { label: 'Code', type: 'code', required: true },
    title: { label: 'Title', type: 'string', required: true, min: 3, max: 60 },
    description: { label: 'Description', type: 'string', required: true, min: 5, max: 200 },
    discountType: { label: 'Discount type', type: 'enum', values: ['percent', 'flat'], required: true },
    discountValue: { label: 'Discount value', type: 'int', required: true, min: 1, max: 100000 }, // percent (1-90) or flat rupees
    maxDiscount: { label: 'Max discount', type: 'money', min: 1, max: 100000 },
    minOrder: { label: 'Minimum order', type: 'money', min: 0, max: 500000, default: 0 },
    validFrom: { label: 'Valid from', type: 'date', required: true },
    validUntil: { label: 'Valid until', type: 'date', required: true },
    usageLimit: { label: 'Total usage limit', type: 'int', min: 1, max: 100000 },
    perUserLimit: { label: 'Per-user limit', type: 'int', required: true, min: 1, max: 100 },
    serviceId: { label: 'Applicable service', type: 'int', min: 1 },
    appliesTo: { label: 'Applies to', type: 'enum', values: ['wash', 'store', 'both'], required: true },
    isActive: { label: 'Active', type: 'bool', default: true },
  },
  adminProduct: {
    name: { label: 'Product name', type: 'string', required: true, min: 3, max: 100 },
    sku: { label: 'SKU', type: 'string', required: true, min: 3, max: 30, pattern: /^[A-Z0-9-]+$/, message: 'SKU: capital letters, numbers and dashes' },
    categoryId: { label: 'Category', type: 'int', required: true, min: 1 },
    brand: { label: 'Brand', type: 'string', required: true, min: 2, max: 40 },
    description: { label: 'Description', type: 'string', required: true, min: 20, max: 2000 },
    features: { label: 'Key features', type: 'stringArray', required: true, max: 10 },
    price: { label: 'Selling price', type: 'money', required: true, min: 1, max: 500000 },
    mrp: { label: 'MRP', type: 'money', required: true, min: 1, max: 500000 },
    warranty: { label: 'Warranty', type: 'string', required: true, max: 60 },
    image: { label: 'Main image', type: 'string', required: true, max: 200, pattern: /^\/assets\/images\/[\w/.-]+\.(jpg|jpeg|png|webp|svg)$/, message: 'Image must be a path like /assets/images/products/xyz-1.jpg' },
    isUniversal: { label: 'Universal fit', type: 'bool', default: true },
    compatibleModelIds: { label: 'Compatible models', type: 'intArray', max: 60, default: [] },
    fitmentAvailable: { label: 'Fitment available', type: 'bool', default: false },
    isActive: { label: 'Active', type: 'bool', default: true },
    isFeatured: { label: 'Featured', type: 'bool', default: false },
    isDeal: { label: 'Deal of the day', type: 'bool', default: false },
  },
  adminCategory: {
    name: { label: 'Category name', type: 'string', required: true, min: 3, max: 40 },
    description: { label: 'Description', type: 'string', required: true, min: 5, max: 200 },
    image: { label: 'Banner image', type: 'string', required: true, max: 200, pattern: /^\/assets\/images\/[\w/.-]+\.(jpg|jpeg|png|webp|svg)$/, message: 'Image must be a path under /assets/images/' },
    isActive: { label: 'Active', type: 'bool', default: true },
  },
  stockAdjust: {
    change: { label: 'Stock change', type: 'int', required: true, min: -1000, max: 1000 },
    note: { label: 'Note', type: 'string', required: true, min: 3, max: 120 },
  },
  adminOrderStatus: {
    status: { label: 'Status', type: 'enum', values: ORDER_STATUSES, required: true },
    note: { label: 'Note', type: 'string', max: 300 },
  },
  adminSlot: {
    label: { label: 'Label', type: 'string', required: true, min: 3, max: 40 },
    startTime: { label: 'Start time', type: 'time', required: true },
    endTime: { label: 'End time', type: 'time', required: true },
    capacity: { label: 'Capacity', type: 'int', required: true, min: 1, max: 50 },
    isActive: { label: 'Active', type: 'bool', default: true },
  },
  adminSlotDay: {
    date: { label: 'Date', type: 'date', required: true },
    timeSlotId: { label: 'Time slot', type: 'int', required: true, min: 1 },
    capacity: { label: 'Capacity', type: 'int', required: true, min: 0, max: 50 },
    isBlocked: { label: 'Blocked', type: 'bool', default: false },
  },
  adminBookingStatus: {
    status: { label: 'Status', type: 'enum', values: BOOKING_STATUSES, required: true },
    note: { label: 'Note', type: 'string', max: 300 },
  },
  adminReview: {
    status: { label: 'Status', type: 'enum', values: ['pending', 'approved', 'rejected'], required: true },
    adminReply: { label: 'Reply', type: 'string', max: 500 },
  },
  adminMessage: {
    status: { label: 'Status', type: 'enum', values: ['new', 'read', 'resolved'], required: true },
  },
};
