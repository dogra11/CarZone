/**
 * scripts/build-seed.js - Generates database/seed.sql (the sample data).
 *
 * Why generate instead of hand-typing? Every booking amount in the seed is calculated
 * by the REAL pricing engine (src/services/pricing.service.js) and every coupon is
 * checked against its minimum order, so the sample data is guaranteed to match what
 * the app itself would compute. Slot counts are derived from the bookings too.
 *
 * Dates are written as MySQL expressions relative to the day the SQL is executed
 * (e.g. DATE_ADD(CURDATE(), INTERVAL 2 DAY)), so the demo always has upcoming AND past
 * bookings/orders no matter when you load it. Stock levels are derived from the orders.
 *
 * Output: database/seed.sql and database/carzone_db.sql (schema + seed, for MySQL Workbench).
 * Run:  npm run db:build-seed
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateBill, calculateOrderTotals } from '../src/services/pricing.service.js';
import { CAR_MODELS } from '../shared/constants.js';
import { hashPassword } from '../src/services/password.service.js';
import { config } from '../src/config/index.js';

const out = [];
const sql = (line) => out.push(line);
/** SQL literal. Text must not contain backslashes (MySQL would treat them as escapes). */
const q = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (String(v).includes('\\')) throw new Error(`Backslash not allowed in seed text: ${v}`);
  return `'${String(v).replace(/'/g, "''")}'`;
};
/** MySQL date relative to the day the script is run, e.g. DATE_ADD(CURDATE(), INTERVAL -3 DAY) */
const day = (offset) => `DATE_ADD(CURDATE(), INTERVAL ${offset} DAY)`;
/** MySQL local timestamp: offset days from today at HH:MM */
const ts = (offset, hhmm) => `TIMESTAMP(DATE_ADD(CURDATE(), INTERVAL ${offset} DAY), '${hhmm}:00')`;
const rupees = (r) => Math.round(r * 100);

// Deterministic pseudo-random generator so the file is stable between runs.
let seed = 20261119;
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const code = (n) => Array.from({ length: n }, () => ALPHA[Math.floor(rand() * ALPHA.length)]).join('');

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const users = [
  { name: 'Vikram Rao', email: 'admin@carzone.in', phone: '9822014514', role: 'admin', password: 'Admin@123', city: 'Pune', address: 'CarZone Centre, Baner', pincode: '411045', joined: -200, avatar: 'avatar-admin.jpg' },
  { name: 'Rohan Sharma', email: 'rohan@example.com', phone: '9876543210', password: 'Customer@123', city: 'Pune', address: 'Flat 802, Skyline Residency, Baner Road, Baner', pincode: '411045', joined: -120, avatar: 'avatar-1.jpg' },
  { name: 'Priya Kulkarni', email: 'priya@example.com', phone: '9823012345', password: 'Customer@123', city: 'Pune', address: '14 Paud Road, near Vanaz Metro, Kothrud', pincode: '411038', joined: -95, avatar: 'avatar-2.jpg' },
  { name: 'Arjun Patil', email: 'arjun@example.com', phone: '9890123456', password: 'Customer@123', city: 'Pune', address: 'B-204, Kalpataru Splendour, Wakad', pincode: '411057', joined: -80, avatar: 'avatar-3.jpg' },
  { name: 'Sneha Iyer', email: 'sneha@example.com', phone: '9765432109', password: 'Customer@123', city: 'Pune', address: '5 ITI Road, Aundh', pincode: '411007', joined: -70, avatar: 'avatar-4.jpg' },
  { name: 'Karan Malhotra', email: 'karan@example.com', phone: '9822098765', password: 'Customer@123', city: 'Pune', address: 'Lane 6, North Main Road, Koregaon Park', pincode: '411001', joined: -60, avatar: 'avatar-5.jpg' },
  { name: 'Ananya Deshmukh', email: 'ananya@example.com', phone: '9881122334', password: 'Customer@123', city: 'Pune', address: 'Phase 1, Blue Ridge Township, Hinjewadi', pincode: '411057', joined: -45, avatar: 'avatar-6.jpg' },
  { name: 'Imran Shaikh', email: 'imran@example.com', phone: '9970011223', password: 'Customer@123', city: 'Pune', address: '22 Datta Mandir Road, Viman Nagar', pincode: '411014', joined: -20, avatar: 'avatar-7.jpg' },
];

// ---------------------------------------------------------------------------
// Vehicles  [userIndex(1-based id), type, brand, model, reg, color]
// ---------------------------------------------------------------------------
const vehicles = [
  [2, 'suv', 'Hyundai', 'Creta', 'MH12AB1234', 'Polar White'],
  [2, 'bike', 'Royal Enfield', 'Classic 350', 'MH12XY4321', 'Stealth Black'],
  [3, 'sedan', 'Honda', 'City', 'MH12CD5678', 'Radiant Red'],
  [4, 'hatchback', 'Maruti Suzuki', 'Swift', 'MH14EF9012', 'Luster Blue'],
  [5, 'luxury', 'Toyota', 'Fortuner', 'MH12GH3456', 'Grey Metallic'],
  [6, 'luxury', 'Toyota', 'Innova Hycross', 'MH12KM7777', 'Attitude Black'],
  [6, 'suv', 'Mahindra', 'Thar', 'MH12TH0909', 'Deep Forest'],
  [7, 'suv', 'Tata', 'Nexon', 'MH14JK2468', 'Flame Red'],
  [8, 'sedan', 'Hyundai', 'Verna', 'MH12LM1357', 'Titan Grey'],
  [8, 'bike', 'KTM', 'Duke 390', 'MH12DK3900', 'Electronic Orange'],
];

// ---------------------------------------------------------------------------
// Services: prices in rupees per vehicle type (null = not offered)
// ---------------------------------------------------------------------------
const services = [
  { slug: 'basic-exterior-wash', name: 'Basic Exterior Wash', category: 'Exterior', duration: 45, pickup: 1, featured: 0,
    tagline: 'A quick, spotless rinse-and-dry for everyday shine.',
    description: 'Our express exterior wash removes road dust, grime and bird droppings using pH-neutral shampoo and a two-bucket method that protects your paint. Finished with a spot-free rinse and plush microfibre dry, it is the perfect weekly refresh for a daily driver.',
    benefits: ['pH-neutral shampoo, safe on all paints', 'Two-bucket wash to prevent swirl marks', 'Spot-free deionised water rinse', 'Microfibre hand dry and glass wipe'],
    prices: { hatchback: 399, sedan: 499, suv: 599, luxury: 799 }, addons: [1, 7, 6, 2] },
  { slug: 'premium-wash', name: 'Premium Wash', category: 'Wash', duration: 75, pickup: 1, featured: 1,
    tagline: 'Exterior and interior refresh with a gloss finish.',
    description: 'The Premium Wash combines a thorough exterior hand wash with an interior vacuum, dashboard wipe-down and glass polish. A spray sealant adds a glossy, water-beading layer that keeps your car cleaner for longer.',
    benefits: ['Full exterior hand wash and dry', 'Interior vacuum and dashboard detailing', 'Spray sealant for gloss and water beading', 'Tyre and trim dressing'],
    prices: { hatchback: 799, sedan: 999, suv: 1199, luxury: 1499 }, addons: [1, 2, 7, 6, 8] },
  { slug: 'interior-cleaning', name: 'Interior Deep Cleaning', category: 'Interior', duration: 120, pickup: 1, featured: 0,
    tagline: 'Showroom-fresh cabin, seats to roof liner.',
    description: 'A complete cabin reset: deep vacuuming, steam cleaning of seats and carpets, stain treatment, AC vent cleaning and a germ-killing sanitisation. Ideal after long road trips, monsoon months or before selling your car.',
    benefits: ['Steam cleaning of seats and carpets', 'Stain and spill treatment', 'AC vent and console detailing', 'Anti-bacterial cabin sanitisation'],
    prices: { hatchback: 1299, sedan: 1499, suv: 1799, luxury: 2299 }, addons: [3, 4, 8, 10] },
  { slug: 'foam-wash', name: 'Snow Foam Wash', category: 'Wash', duration: 60, pickup: 1, featured: 1,
    tagline: 'Thick snow foam that lifts dirt before it touches paint.',
    description: 'A touch-less pre-wash with thick snow foam loosens and lifts dirt so it rinses away before any mitt touches your paint. Followed by a gentle contact wash, wheel cleaning and a streak-free dry - the safest wash for dark and premium paints.',
    benefits: ['Touch-less snow foam pre-wash', 'Minimises swirl marks and scratches', 'Wheel and arch cleaning', 'Streak-free blower and microfibre dry'],
    prices: { hatchback: 599, sedan: 699, suv: 899, luxury: 1199 }, addons: [1, 6, 7, 2] },
  { slug: 'ceramic-coating', name: 'Ceramic Coating', category: 'Protection', duration: 480, pickup: 0, featured: 1,
    tagline: 'Years of hydrophobic, mirror-like paint protection.',
    description: 'A professional 9H nano-ceramic coating bonded to your paint after a full decontamination and one-step machine polish. It delivers deep gloss, strong UV and chemical resistance and a self-cleaning hydrophobic effect. Includes a 2-year warranty card.',
    benefits: ['9H nano-ceramic layer with 2-year warranty', 'Paint decontamination and machine polish', 'UV, bird-dropping and chemical resistance', 'Extreme water beading and easy cleaning'],
    prices: { hatchback: 14999, sedan: 17999, suv: 21999, luxury: 29999 }, addons: [5, 2, 7] },
  { slug: 'wax-polishing', name: 'Wax Polishing', category: 'Paint care', duration: 150, pickup: 1, featured: 0,
    tagline: 'Hand-applied carnauba wax for a warm, deep glow.',
    description: 'After a careful wash and clay-bar treatment, premium carnauba wax is applied by hand and buffed to a deep, warm glow. Wax hides light swirls, adds protection for up to three months and makes every colour look richer.',
    benefits: ['Clay-bar paint decontamination', 'Premium carnauba hand wax', 'Hides light swirls and dullness', 'Up to 3 months of protection'],
    prices: { hatchback: 1999, sedan: 2399, suv: 2799, luxury: 3499 }, addons: [5, 1, 2] },
  { slug: 'engine-cleaning', name: 'Engine Bay Cleaning', category: 'Engine', duration: 60, pickup: 1, featured: 0,
    tagline: 'Safe degreasing for a clean, healthy engine bay.',
    description: 'Electrical parts are covered, then a safe water-based degreaser and soft brushes remove oil, dust and grime from the engine bay. Plastics and hoses are dressed with a protectant so the bay looks new and leaks are easier to spot.',
    benefits: ['Sensitive electrics protected first', 'Water-based, non-corrosive degreaser', 'Hose and plastic protectant dressing', 'Easier to spot leaks early'],
    prices: { hatchback: 699, sedan: 799, suv: 999, luxury: 1299 }, addons: [6, 1] },
  { slug: 'full-detailing', name: 'Full Detailing', category: 'Detailing', duration: 360, pickup: 1, featured: 1,
    tagline: 'The complete inside-out restoration package.',
    description: 'Our signature package: snow foam wash, clay-bar decontamination, machine polish, paint sealant, complete interior deep clean, leather and trim care, engine bay detailing and glass treatment. Your car leaves looking as close to showroom-new as it can.',
    benefits: ['Exterior foam wash, clay bar and machine polish', 'Paint sealant with 6-month protection', 'Complete interior deep clean', 'Engine bay and glass detailing'],
    prices: { hatchback: 4999, sedan: 5999, suv: 7499, luxury: 9999 }, addons: [3, 4, 5, 2] },
  { slug: 'bike-wash', name: 'Bike Wash & Shine', category: 'Two-wheeler', duration: 40, pickup: 1, featured: 0,
    tagline: 'Foam wash, chain care and a polished finish for bikes.',
    description: 'A complete two-wheeler treatment: foam wash, degreasing of the swing-arm and engine area, careful drying and a polish on the tank and chrome. Add chain cleaning and lubrication for a smoother, quieter ride.',
    benefits: ['Foam wash safe for decals and chrome', 'Engine and swing-arm degreasing', 'Tank and chrome polish', 'Tyre dressing for a fresh look'],
    prices: { bike: 299 }, addons: [9, 1] },
];

// Add-ons: [name, description, rupees, minutes]
const addons = [
  ['Tyre Dressing & Shine', 'Water-based dressing for a rich satin-black tyre finish.', 149, 10],
  ['Rain-Repellent Glass Coating', 'Hydrophobic windshield coating for clear vision in the monsoon.', 349, 15],
  ['Odour Removal & Sanitisation', 'Ozone treatment that eliminates odours and 99% of germs.', 399, 20],
  ['Leather Conditioning', 'Cleans and nourishes leather seats to prevent cracking.', 599, 25],
  ['Headlight Restoration', 'Removes yellowing and haze for brighter, safer headlights.', 799, 30],
  ['Underbody Wash', 'High-pressure underbody rinse to remove mud and road salt.', 299, 15],
  ['Alloy Wheel Deep Clean', 'Iron-fallout remover and brush clean for every spoke.', 249, 15],
  ['Dashboard UV Protectant', 'Matte UV protectant that stops dashboard fading and cracking.', 199, 10],
  ['Chain Cleaning & Lubrication', 'Degrease and lube the drive chain for a smooth, quiet ride.', 149, 10],
  ['Pet Hair Removal', 'Specialised tools to lift stubborn pet hair from fabric.', 349, 20],
];

const slots = [
  ['Early bird', '08:00', '09:30', 3],
  ['Morning', '09:30', '11:00', 4],
  ['Late morning', '11:00', '12:30', 4],
  ['Afternoon', '13:30', '15:00', 4],
  ['Late afternoon', '15:00', '16:30', 4],
  ['Evening', '16:30', '18:00', 3],
];

// Coupons: discountValue = percent, or RUPEES for flat (converted to paise below)
const coupons = [
  { scope: 'both', code: 'WELCOME15', title: 'Welcome offer - 15% off', description: '15% off your booking (up to Rs 300) on orders above Rs 499.', type: 'percent', value: 15, max: 300, min: 499, from: -60, until: 90, limit: 500, perUser: 1, service: null },
  { scope: 'wash', code: 'SHINE200', title: 'Flat Rs 200 off', description: 'Flat Rs 200 off on any booking above Rs 1,499. Use it twice!', type: 'flat', value: 200, max: null, min: 1499, from: -30, until: 45, limit: 200, perUser: 2, service: null },
  { scope: 'wash', code: 'CERAMIC10', title: 'Ceramic coating - 10% off', description: '10% off Ceramic Coating (up to Rs 2,500) on orders above Rs 10,000.', type: 'percent', value: 10, max: 2500, min: 10000, from: -45, until: 60, limit: 50, perUser: 1, service: 5 },
  { scope: 'both', code: 'MONSOON25', title: 'Monsoon special - 25% off', description: '25% off (up to Rs 500) on bookings above Rs 999. Limited period.', type: 'percent', value: 25, max: 500, min: 999, from: -10, until: 20, limit: 100, perUser: 1, service: null },
  { scope: 'wash', code: 'FOAM99', title: 'Rs 99 off Snow Foam Wash', description: 'Flat Rs 99 off every Snow Foam Wash. Valid up to 3 times per customer.', type: 'flat', value: 99, max: null, min: 599, from: -5, until: 30, limit: null, perUser: 3, service: 4 },
  { scope: 'store', code: 'GEAR10', title: 'Accessories - 10% off', description: '10% off accessories (up to Rs 500) on orders above Rs 999.', type: 'percent', value: 10, max: 500, min: 999, from: -40, until: 60, limit: 400, perUser: 2, service: null },
  { scope: 'store', code: 'DRIVE250', title: 'Flat Rs 250 off accessories', description: 'Flat Rs 250 off store orders above Rs 2,499.', type: 'flat', value: 250, max: null, min: 2499, from: -40, until: 45, limit: 300, perUser: 1, service: null },
  { scope: 'both', code: 'DIWALI30', title: 'Festive 30% off (expired)', description: 'Festive season offer - 30% off up to Rs 750.', type: 'percent', value: 30, max: 750, min: 999, from: -60, until: -20, limit: 300, perUser: 1, service: null },
];

// ---------------------------------------------------------------------------
// Bookings. d = day offset from today, slot = 1-6, created = day offset of creation.
// pay: method for the successful payment (null = unpaid). failed: earlier failed attempt.
// ---------------------------------------------------------------------------
const bookings = [
  { user: 2, vehicle: 1, service: 2, d: -40, slot: 2, created: -42, status: 'completed', addons: [1, 7], pickup: 0, pay: 'card', review: [5, 'Paint looks brand new', 'Booked the premium wash for my Creta and the finish was outstanding. Water beads off like crazy and the cabin smells fresh. Staff explained everything they did.', 'approved'] },
  { user: 3, vehicle: 3, service: 3, d: -35, slot: 3, created: -37, status: 'completed', addons: [3], pickup: 1, coupon: 'WELCOME15', pay: 'upi', review: [5, 'Pickup and drop made it effortless', 'They picked up my City from home and returned it spotless. The seats had coffee stains that are now completely gone. Worth every rupee.', 'approved'] },
  { user: 4, vehicle: 4, service: 4, d: -28, slot: 1, created: -29, status: 'completed', addons: [1], pickup: 0, pay: 'wallet', review: [4, 'Great foam wash, quick service', 'Early bird slot was perfect before office. Thick foam, no scratches on my blue Swift. Would love a loyalty card!', 'approved'] },
  { user: 5, vehicle: 5, service: 5, d: -25, slot: 1, created: -30, status: 'completed', addons: [5], pickup: 0, coupon: 'CERAMIC10', pay: 'netbanking', review: [5, 'Mirror finish on my Fortuner', 'The ceramic coating has transformed the grey paint. Rain just slides off. Very professional team and they sent progress photos too.', 'approved'] },
  { user: 6, vehicle: 6, service: 8, d: -20, slot: 2, created: -24, status: 'completed', addons: [3, 4], pickup: 1, coupon: 'SHINE200', pay: 'card', review: [5, 'Best detailing studio in Pune', 'Full detailing on the Innova Hycross - interiors, leather and paint all look showroom fresh. Pickup was on time and communication was excellent.', 'approved'] },
  { user: 7, vehicle: 8, service: 6, d: -14, slot: 4, created: -16, status: 'completed', addons: [1], pickup: 0, pay: 'upi', review: [4, 'Deep glossy shine', 'Wax polish brought back the Flame Red colour on my Nexon. Took a little longer than quoted, but the result is fantastic.', 'approved'] },
  { user: 8, vehicle: 10, service: 9, d: -12, slot: 5, created: -13, status: 'completed', addons: [9], pickup: 0, pay: 'upi', review: [4, 'Chain feels super smooth', 'Quick and careful bike wash. Chain lube made a noticeable difference on my Duke. Will be back every month.', 'pending'] },
  { user: 2, vehicle: 2, service: 9, d: -9, slot: 6, created: -10, status: 'completed', addons: [9, 1], pickup: 0, pay: 'wallet' },
  { user: 3, vehicle: 3, service: 7, d: -7, slot: 2, created: -9, status: 'completed', addons: [6], pickup: 0, pay: 'card', review: [4, 'Engine bay looks factory new', 'Was nervous about washing the engine but they covered all electricals. Clean, safe and no issues afterwards.', 'approved'] },
  { user: 8, vehicle: 9, service: 1, d: -5, slot: 3, created: -6, status: 'completed', addons: [7], pickup: 0, pay: 'upi' },
  { user: 6, vehicle: 7, service: 4, d: -3, slot: 4, created: -6, status: 'cancelled', addons: [], pickup: 0, pay: 'card',
    cancel: { by: 'customer', at: [-3, '07:10'], reason: 'Going out of town unexpectedly', percent: 50, processed: [-2, '11:30'] } },
  { user: 4, vehicle: 4, service: 2, d: -2, slot: 2, created: -4, status: 'completed', addons: [], pickup: 1, pay: 'card', failed: { method: 'upi', detail: 'fail@carzone', reason: 'UPI collect request declined (simulated)' } },
  { user: 5, vehicle: 5, service: 2, d: 0, slot: 2, created: -3, status: 'in_progress', addons: [2], pickup: 0, pay: 'card' },
  { user: 2, vehicle: 1, service: 8, d: 2, slot: 2, created: -1, status: 'confirmed', addons: [3, 5], pickup: 1, coupon: 'WELCOME15', pay: 'card' },
  { user: 2, vehicle: 1, service: 4, d: 5, slot: 3, created: -1, status: 'pending_payment', addons: [1], pickup: 0, coupon: 'FOAM99', pay: null, failed: { method: 'card', detail: 'Visa **** 0002', reason: 'Card declined by the issuing bank (simulated)' } },
  { user: 3, vehicle: 3, service: 5, d: 4, slot: 1, created: -2, status: 'confirmed', addons: [2], pickup: 0, pay: 'netbanking' },
  { user: 4, vehicle: 4, service: 1, d: 1, slot: 5, created: -3, status: 'rescheduled', addons: [6], pickup: 1, pay: 'upi', rescheduledFrom: { d: 0, slot: 2, at: [-1, '18:20'] } },
  { user: 8, vehicle: 9, service: 3, d: 3, slot: 4, created: -4, status: 'cancelled', addons: [8], pickup: 0, pay: 'upi',
    cancel: { by: 'customer', at: [-1, '20:05'], reason: 'Car will be at the service centre that day', percent: 100, processed: null } },
  { user: 6, vehicle: 6, service: 5, d: 6, slot: 1, created: -2, status: 'confirmed', addons: [5, 7], pickup: 0, pay: 'card' },
  { user: 7, vehicle: 8, service: 2, d: 8, slot: 3, created: -1, status: 'pending_payment', addons: [], pickup: 1, coupon: 'MONSOON25', pay: null },
  { user: 5, vehicle: 5, service: 7, d: 10, slot: 2, created: -1, status: 'cancelled', addons: [], pickup: 0, pay: null,
    cancel: { by: 'customer', at: [0, '00:30'], reason: 'Booked by mistake', percent: null } },
  { user: 3, vehicle: 3, service: 6, d: 12, slot: 4, created: -1, status: 'confirmed', addons: [1, 2], pickup: 0, coupon: 'SHINE200', pay: 'upi' },
];

const PAY_DETAIL = { card: 'Visa **** 1111', upi: null, netbanking: 'HDFC Bank', wallet: 'Paytm', cod: 'Cash on delivery' };

// ---------------------------------------------------------------------------
// Store: catalogue (scripts/data/store-catalog.json) and orders
// items: [productIndex(1-based), qty]; d = day the order was placed.
// ---------------------------------------------------------------------------
const catalog = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'store-catalog.json'), 'utf8'));
const P = (sku) => catalog.products.findIndex((p) => p.sku === sku) + 1;
const orders = [
  { user: 2, d: -30, items: [[P('CZ-INT-001'), 1], [P('CZ-INT-004'), 1]], pay: 'card', status: 'delivered', deliveredDay: -26, reviews: [[P('CZ-INT-001'), 5, 'Perfect fit on my Creta', 'Seat covers look factory-fitted. The tan inserts make the cabin feel premium.', 'approved'], [P('CZ-INT-004'), 4, 'Good grip', 'Comfortable and easy to fit. Slightly tight at first but settled in.', 'approved']] },
  { user: 3, d: -25, items: [[P('CZ-EXT-004'), 1], [P('CZ-CAR-004'), 2]], pay: 'upi', coupon: 'GEAR10', status: 'delivered', deliveredDay: -21, reviews: [[P('CZ-EXT-004'), 5, 'Chrome looks classy', 'The garnish fits the City perfectly. Got it fitted at the CarZone centre.', 'approved']] },
  { user: 4, d: -21, items: [[P('CZ-LGT-001'), 1], [P('CZ-UTL-005'), 1]], pay: 'cod', status: 'delivered', deliveredDay: -18, reviews: [[P('CZ-LGT-001'), 4, 'Much brighter at night', 'Huge improvement over the stock halogens on my Swift. Clean cut-off line.', 'approved']] },
  { user: 5, d: -18, items: [[P('CZ-ELC-003'), 1], [P('CZ-ELC-006'), 1]], pay: 'netbanking', coupon: 'DRIVE250', status: 'delivered', deliveredDay: -15, fitment: { d: -14, slot: 3 }, reviews: [[P('CZ-ELC-003'), 5, 'Crystal clear 4K footage', 'Number plates are readable even at night. Fitment team hid all the wires.', 'approved'], [P('CZ-ELC-006'), 5, 'Parking is stress-free now', 'Accurate beeps and the display is easy to read.', 'approved']] },
  { user: 6, d: -14, items: [[P('CZ-UTL-002'), 1], [P('CZ-UTL-003'), 1]], pay: 'card', status: 'delivered', deliveredDay: -10, reviews: [[P('CZ-UTL-002'), 4, 'Solid basket for the Thar', 'Took it on a Konkan trip fully loaded - no rattles.', 'pending']] },
  { user: 7, d: -10, items: [[P('CZ-LGT-005'), 1], [P('CZ-CMF-004'), 2]], pay: 'wallet', status: 'delivered', deliveredDay: -7, reviews: [[P('CZ-LGT-005'), 5, 'Love the mood lighting', 'App control works well and the music sync is fun.', 'approved']] },
  { user: 8, d: -12, items: [[P('CZ-ELC-001'), 1]], pay: 'card', status: 'returned', deliveredDay: -9, returnReason: 'Screen has a dead pixel line', returnedDay: -7 },
  { user: 2, d: -6, items: [[P('CZ-EXT-001'), 1]], pay: 'upi', status: 'return_requested', deliveredDay: -3, returnReason: 'Size is slightly loose on my car' },
  { user: 3, d: -3, items: [[P('CZ-CAR-002'), 1], [P('CZ-CAR-003'), 1], [P('CZ-CAR-010'), 1]], pay: 'card', status: 'out_for_delivery' },
  { user: 4, d: -3, items: [[P('CZ-CAR-006'), 1], [P('CZ-UTL-007'), 1]], pay: 'upi', coupon: 'WELCOME15', status: 'shipped' },
  { user: 5, d: -1, items: [[P('CZ-SAF-001'), 1], [P('CZ-SAF-002'), 1]], pay: 'cod', status: 'packed' },
  { user: 6, d: 0, items: [[P('CZ-SAF-003'), 1], [P('CZ-SAF-004'), 2]], pay: 'card', status: 'placed', fitment: { d: 3, slot: 2 } },
  { user: 7, d: -6, items: [[P('CZ-CMF-001'), 1], [P('CZ-CMF-002'), 1]], pay: 'card', coupon: 'GEAR10', status: 'cancelled', cancelDay: -5, cancelReason: 'Ordered by mistake' },
  { user: 8, d: -5, items: [[P('CZ-BIK-001'), 1]], pay: 'cod', status: 'cancelled', cancelDay: -5, cancelReason: 'Found a better size locally' },
  { user: 2, d: 0, items: [[P('CZ-ELC-002'), 1]], pay: 'upi', status: 'pending_payment', failed: { method: 'upi', detail: 'failure@upi', reason: 'UPI request declined by the payer' } },
  { user: 6, d: -9, items: [[P('CZ-CAR-005'), 2]], pay: 'cod', status: 'delivered', deliveredDay: -6, reviews: [[P('CZ-CAR-005'), 5, 'Pro results at home', 'Removed most swirls from my Thar in an afternoon. Great kit.', 'approved']] },
];
const ADDRESS_STATES = 'Maharashtra';

// ---------------------------------------------------------------------------
// Build SQL (MySQL 8 dialect)
// ---------------------------------------------------------------------------
async function build() {
  sql('-- =====================================================================');
  sql('-- CarZone sample data (GENERATED by scripts/build-seed.js - do not edit by hand)');
  sql('-- MySQL 8. Amounts come from the real pricing engine; dates are relative to the day');
  sql('-- this script is executed; product stock = opening stock - items in live orders.');
  sql('-- Default logins:  admin@carzone.in / Admin@123   |   rohan@example.com / Customer@123');
  sql('-- =====================================================================');
  sql('USE carzone_db;');
  sql('START TRANSACTION;');
  sql('');

  sql('-- Users (passwords hashed with scrypt + per-user salt, verified by src/services/password.service.js)');
  const hashes = {};
  for (const pw of new Set(users.map((u) => u.password))) {
    hashes[pw] = await hashPassword(pw, (pw === 'Admin@123' ? 'a1' : 'c2').repeat(16));
  }
  users.forEach((u, i) => {
    const h = hashes[u.password];
    sql(`INSERT INTO users (id, name, email, phone, password_hash, password_salt, role, address, city, pincode, avatar, last_login_at, created_at, updated_at) VALUES (${i + 1}, ${q(u.name)}, ${q(u.email)}, ${q(u.phone)}, ${q(h.hash)}, ${q(h.salt)}, ${q(u.role || 'customer')}, ${q(u.address)}, ${q(u.city)}, ${q(u.pincode)}, ${q('/assets/images/avatars/' + u.avatar)}, ${ts(-1, '19:45')}, ${ts(u.joined, '11:00')}, ${ts(u.joined, '11:00')});`);
  });

  sql('\n-- Saved vehicles and delivery addresses');
  vehicles.forEach((v, i) => {
    sql(`INSERT INTO vehicles (id, user_id, vehicle_type, brand, model, registration_no, color, created_at) VALUES (${i + 1}, ${v[0]}, ${q(v[1])}, ${q(v[2])}, ${q(v[3])}, ${q(v[4])}, ${q(v[5])}, ${ts(users[v[0] - 1].joined, '11:10')});`);
  });
  users.forEach((u, i) => {
    if (u.role === 'admin') return;
    sql(`INSERT INTO addresses (id, user_id, label, full_name, phone, line1, line2, city, state, pincode, is_default, created_at) VALUES (${i}, ${i + 1}, 'Home', ${q(u.name)}, ${q(u.phone)}, ${q(u.address)}, NULL, ${q(u.city)}, ${q(ADDRESS_STATES)}, ${q(u.pincode)}, 1, ${ts(u.joined, '11:20')});`);
  });

  sql('\n-- Wash add-ons');
  addons.forEach((a, i) => {
    sql(`INSERT INTO addons (id, name, description, price_paise, duration_minutes, created_at) VALUES (${i + 1}, ${q(a[0])}, ${q(a[1])}, ${rupees(a[2])}, ${a[3]}, ${ts(-200, '09:00')});`);
  });

  sql('\n-- Wash services, per-vehicle prices and allowed add-ons');
  services.forEach((s, i) => {
    const id = i + 1;
    sql(`INSERT INTO services (id, slug, name, category, tagline, description, benefits, duration_minutes, image, pickup_available, is_featured, sort_order, created_at, updated_at) VALUES (${id}, ${q(s.slug)}, ${q(s.name)}, ${q(s.category)}, ${q(s.tagline)}, ${q(s.description)}, ${q(JSON.stringify(s.benefits))}, ${s.duration}, ${q(`/assets/images/services/${s.slug}.jpg`)}, ${s.pickup}, ${s.featured}, ${id}, ${ts(-200, '09:00')}, ${ts(-200, '09:00')});`);
    for (const [type, price] of Object.entries(s.prices)) sql(`INSERT INTO service_prices (service_id, vehicle_type, price_paise) VALUES (${id}, ${q(type)}, ${rupees(price)});`);
    for (const a of s.addons) sql(`INSERT INTO service_addons (service_id, addon_id) VALUES (${id}, ${a});`);
  });

  sql('\n-- Daily time slots (shared by wash bookings and accessory fitment)');
  slots.forEach((s, i) => sql(`INSERT INTO time_slots (id, label, start_time, end_time, capacity) VALUES (${i + 1}, ${q(s[0])}, ${q(s[1])}, ${q(s[2])}, ${s[3]});`));

  // Coupon usage = redemptions of bookings/orders that are not cancelled.
  const usedCount = Object.fromEntries(coupons.map((c) => [c.code, 0]));
  for (const b of bookings) if (b.coupon && b.status !== 'cancelled') usedCount[b.coupon]++;
  for (const o of orders) if (o.coupon && o.status !== 'cancelled') usedCount[o.coupon]++;

  sql('\n-- Offers / coupons (applies_to: wash, store or both)');
  coupons.forEach((c, i) => {
    const value = c.type === 'flat' ? rupees(c.value) : c.value;
    sql(`INSERT INTO coupons (id, code, title, description, discount_type, discount_value, max_discount_paise, min_order_paise, valid_from, valid_until, usage_limit, per_user_limit, used_count, service_id, applies_to, created_at) VALUES (${i + 1}, ${q(c.code)}, ${q(c.title)}, ${q(c.description)}, ${q(c.type)}, ${value}, ${c.max ? rupees(c.max) : 'NULL'}, ${rupees(c.min)}, ${day(c.from)}, ${day(c.until)}, ${q(c.limit)}, ${c.perUser}, ${usedCount[c.code]}, ${q(c.service)}, ${q(c.scope)}, ${ts(c.from, '09:00')});`);
  });
  const coupMap = Object.fromEntries(coupons.map((c, i) => [c.code, { ...c, id: i + 1 }]));
  const couponObj = (code) => {
    const c = coupMap[code];
    return { code: c.code, discountType: c.type, discountValue: c.type === 'flat' ? rupees(c.value) : c.value, maxDiscountPaise: c.max ? rupees(c.max) : null };
  };

  // ---- payments helpers (unified payments table) ----
  let paymentId = 0;
  const payRows = [];
  const refundRows = [];
  const addPayment = ({ purpose, targetId, userId, gateway = 'simulated', method, detail, amount, status, failure = null, at, verifiedAt = null }) => {
    paymentId++;
    payRows.push(`INSERT INTO payments (id, payment_ref, purpose, booking_id, order_id, user_id, gateway, gateway_order_id, gateway_payment_id, amount_paise, currency, method, method_detail, status, failure_reason, attempts, expires_at, verified_at, created_at, updated_at) VALUES (${paymentId}, ${q(`PAY-${code(8)}`)}, ${q(purpose)}, ${purpose === 'booking' ? targetId : 'NULL'}, ${purpose === 'order' ? targetId : 'NULL'}, ${userId}, ${q(gateway)}, ${gateway === 'cod' ? 'NULL' : q(`sim_order_${code(14)}`)}, ${['success', 'refund_pending', 'refunded'].includes(status) ? q(`${gateway === 'cod' ? 'cod' : 'sim_pay'}_${code(14)}`) : 'NULL'}, ${amount}, 'INR', ${q(method)}, ${q(detail)}, ${q(status)}, ${q(failure)}, ${gateway === 'cod' ? 0 : 1}, ${at}, ${verifiedAt || 'NULL'}, ${at}, ${verifiedAt || at});`);
    return paymentId;
  };
  const addRefund = ({ paymentId: pid, amount, percent, reason, processedAt = null, manual = 0, createdAt }) => {
    refundRows.push(`INSERT INTO refunds (payment_id, amount_paise, refund_percent, status, reason, manual, gateway_refund_id, refund_ref, created_at, processed_at, processed_by) VALUES (${pid}, ${amount}, ${percent}, ${q(processedAt ? 'processed' : 'pending')}, ${q(reason)}, ${manual}, ${processedAt && !manual ? q(`sim_rfnd_${code(14)}`) : 'NULL'}, ${processedAt ? q(`RFD-${code(8)}`) : 'NULL'}, ${createdAt}, ${processedAt || 'NULL'}, ${processedAt ? 1 : 'NULL'});`);
  };

  sql('\n-- Wash bookings (bill columns calculated by pricing.service.js calculateBill)');
  const inventory = new Map();
  const later = [];
  const hold = (d, slot) => { const key = `${d}|${slot}`; inventory.set(key, (inventory.get(key) || 0) + 1); };

  bookings.forEach((b, i) => {
    const id = i + 1;
    const svc = services[b.service - 1];
    const veh = vehicles[b.vehicle - 1];
    if (veh[0] !== b.user) throw new Error(`Booking ${id}: vehicle does not belong to user`);
    const price = svc.prices[veh[1]];
    if (!price) throw new Error(`Booking ${id}: ${svc.name} not offered for ${veh[1]}`);
    for (const a of b.addons) if (!svc.addons.includes(a)) throw new Error(`Booking ${id}: add-on ${a} not allowed`);
    if (b.pickup && !svc.pickup) throw new Error(`Booking ${id}: pickup not allowed`);

    const addonObjs = b.addons.map((a) => ({ id: a, name: addons[a - 1][0], pricePaise: rupees(addons[a - 1][2]) }));
    let coupon = null;
    if (b.coupon) {
      const c = coupMap[b.coupon];
      coupon = couponObj(b.coupon);
      const sub = calculateBill({ basePricePaise: rupees(price), addons: addonObjs, pickupDrop: Boolean(b.pickup) }).subtotalPaise;
      if (sub < rupees(c.min) || c.scope === 'store' || (c.service && c.service !== b.service)) throw new Error(`Booking ${id}: coupon not applicable`);
    }
    const bill = calculateBill({ basePricePaise: rupees(price), addons: addonObjs, pickupDrop: Boolean(b.pickup), coupon });
    const startTime = slots[b.slot - 1][1];
    const endTime = slots[b.slot - 1][2];
    const createdAt = ts(b.created, '10:15');
    const user = users[b.user - 1];
    const cancelledAt = b.cancel ? ts(...b.cancel.at) : null;
    const completedAt = b.status === 'completed' ? ts(b.d, endTime) : null;

    sql(`INSERT INTO bookings (id, booking_code, user_id, service_id, vehicle_id, vehicle_type, vehicle_brand, vehicle_model, vehicle_reg, booking_date, time_slot_id, pickup_drop, address, instructions, status, base_price_paise, addons_paise, pickup_fee_paise, discount_paise, tax_paise, total_paise, coupon_id, coupon_code, reschedule_count, cancel_reason, cancelled_by, cancelled_at, completed_at, created_at, updated_at) VALUES (${id}, ${q(`CZW-${code(6)}`)}, ${b.user}, ${b.service}, ${b.vehicle}, ${q(veh[1])}, ${q(veh[2])}, ${q(veh[3])}, ${q(veh[4])}, ${day(b.d)}, ${b.slot}, ${b.pickup}, ${q(`${user.address}, ${user.city} ${user.pincode}`)}, ${q(b.pickup ? 'Please call 15 minutes before pickup.' : null)}, ${q(b.status)}, ${bill.basePricePaise}, ${bill.addonsPaise}, ${bill.pickupFeePaise}, ${bill.discountPaise}, ${bill.taxPaise}, ${bill.totalPaise}, ${coupon ? coupMap[b.coupon].id : 'NULL'}, ${q(b.coupon || null)}, ${b.rescheduledFrom ? 1 : 0}, ${q(b.cancel?.reason || null)}, ${q(b.cancel?.by || null)}, ${cancelledAt || 'NULL'}, ${completedAt || 'NULL'}, ${createdAt}, ${cancelledAt || completedAt || createdAt});`);

    for (const a of addonObjs) later.push(`INSERT INTO booking_addons (booking_id, addon_id, addon_name, price_paise) VALUES (${id}, ${a.id}, ${q(a.name)}, ${a.pricePaise});`);
    if (b.coupon && b.status !== 'cancelled') later.push(`INSERT INTO coupon_redemptions (coupon_id, user_id, booking_id, order_id, discount_paise, created_at) VALUES (${coupMap[b.coupon].id}, ${b.user}, ${id}, NULL, ${bill.discountPaise}, ${createdAt});`);
    if (b.status !== 'cancelled') hold(b.d, b.slot);

    const hist = (from, to, note, by, at) => later.push(`INSERT INTO booking_status_history (booking_id, from_status, to_status, note, changed_by, created_at) VALUES (${id}, ${q(from)}, ${q(to)}, ${q(note)}, ${by}, ${at});`);
    hist(null, 'pending_payment', 'Booking created - awaiting payment', b.user, createdAt);
    if (b.failed) addPayment({ purpose: 'booking', targetId: id, userId: b.user, method: b.failed.method, detail: b.failed.detail, amount: bill.totalPaise, status: 'failed', failure: b.failed.reason, at: ts(b.created, '10:18') });
    let successId = null;
    if (b.pay) {
      const detail = b.pay === 'upi' ? `${user.email.split('@')[0]}@okhdfcbank` : PAY_DETAIL[b.pay];
      const status = b.cancel ? (b.cancel.processed ? 'refunded' : 'refund_pending') : 'success';
      successId = addPayment({ purpose: 'booking', targetId: id, userId: b.user, method: b.pay, detail, amount: bill.totalPaise, status, at: ts(b.created, '10:20'), verifiedAt: ts(b.created, '10:21') });
      hist('pending_payment', 'confirmed', `Payment received via ${({ card: 'Credit / Debit card', upi: 'UPI', netbanking: 'Net banking', wallet: 'Wallet' })[b.pay]}`, b.user, ts(b.created, '10:21'));
    }
    if (b.rescheduledFrom) hist('confirmed', 'rescheduled', `Moved from slot ${slots[b.rescheduledFrom.slot - 1][1]} to ${startTime}`, b.user, ts(...b.rescheduledFrom.at));
    if (['in_progress', 'completed'].includes(b.status)) hist('confirmed', 'in_progress', 'Vehicle received - service started', 1, ts(b.d, startTime));
    if (b.status === 'completed') hist('in_progress', 'completed', 'Service completed - vehicle ready', 1, ts(b.d, endTime));
    if (b.cancel) {
      let note = `Cancelled by customer: ${b.cancel.reason}`;
      if (b.pay) {
        const amount = Math.round((bill.totalPaise * b.cancel.percent) / 100);
        note += ` - refund of ${b.cancel.percent}% (${(amount / 100).toFixed(2)} INR) initiated`;
        const reason = b.cancel.percent === 100
          ? `Cancelled ${config.business.freeCancelHours}+ hours before the slot - full refund`
          : `Late cancellation (under ${config.business.freeCancelHours} hours) - ${config.business.lateCancelRefundPercent}% refund`;
        const processedAt = b.cancel.processed ? ts(...b.cancel.processed) : null;
        addRefund({ paymentId: successId, amount, percent: b.cancel.percent, reason, processedAt, createdAt: cancelledAt });
        if (processedAt) later.push(`INSERT INTO booking_status_history (booking_id, from_status, to_status, note, changed_by, created_at) VALUES (${id}, 'cancelled', 'cancelled', ${q(`Refund of ${(amount / 100).toFixed(2)} INR processed to the original payment method`)}, 1, ${processedAt});`);
      }
      hist(b.pay ? 'confirmed' : 'pending_payment', 'cancelled', note, b.user, cancelledAt);
    }
    if (b.review) {
      const [rating, title, comment, status] = b.review;
      later.push(`INSERT INTO reviews (booking_id, user_id, service_id, rating, title, comment, status, admin_reply, created_at, moderated_at) VALUES (${id}, ${b.user}, ${b.service}, ${rating}, ${q(title)}, ${q(comment)}, ${q(status)}, ${q(status === 'approved' && rating === 5 ? 'Thank you for trusting CarZone - see you at your next visit!' : null)}, ${ts(b.d + 1, '18:30')}, ${status === 'approved' ? ts(b.d + 2, '10:00') : 'NULL'});`);
    }
  });
  sql('\n-- Wash booking add-ons, coupon redemptions, status history and reviews');
  later.forEach((l) => sql(l));
  later.length = 0;

  // ------------------------------------------------------------------- STORE
  sql('\n-- Indian car models (names only) for accessory compatibility');
  CAR_MODELS.forEach((m, i) => sql(`INSERT INTO car_models (id, make, model, body_type) VALUES (${i + 1}, ${q(m.make)}, ${q(m.model)}, ${q(m.bodyType)});`));
  const modelId = (full) => {
    const idx = CAR_MODELS.findIndex((m) => `${m.make} ${m.model}` === full);
    if (idx < 0) throw new Error(`Unknown car model ${full}`);
    return idx + 1;
  };

  sql('\n-- Accessory categories');
  catalog.categories.forEach((c, i) => sql(`INSERT INTO product_categories (id, slug, name, description, image, icon, sort_order) VALUES (${i + 1}, ${q(c.slug)}, ${q(c.name)}, ${q(c.description)}, ${q(`/assets/images/categories/${c.slug}.jpg`)}, ${q(c.icon)}, ${i + 1});`));
  const catId = (slug) => catalog.categories.findIndex((c) => c.slug === slug) + 1;

  // Stock = opening - quantities in orders that still hold stock (not cancelled / returned).
  const sold = {};
  for (const o of orders) if (!['cancelled', 'returned'].includes(o.status)) for (const [p, qty] of o.items) sold[p] = (sold[p] || 0) + qty;

  sql('\n-- Products (prices GST-inclusive). stock = opening stock - units in live orders');
  catalog.products.forEach((p, i) => {
    const id = i + 1;
    const stock = p.opening - (sold[id] || 0);
    if (stock < 0) throw new Error(`Oversold ${p.sku}`);
    const images = [1, 2].map((n) => `/assets/images/products/${p.slug}-${n}.jpg`);
    sql(`INSERT INTO products (id, sku, slug, name, category_id, brand, description, features, specs, images, price_paise, mrp_paise, stock, is_universal, fitment_available, warranty, is_active, is_featured, is_deal, created_at, updated_at) VALUES (${id}, ${q(p.sku)}, ${q(p.slug)}, ${q(p.name)}, ${catId(p.category)}, ${q(p.brand)}, ${q(p.description)}, ${q(JSON.stringify(p.features))}, ${q(JSON.stringify(p.specs))}, ${q(JSON.stringify(images))}, ${rupees(p.price)}, ${rupees(p.mrp)}, ${stock}, ${p.compat === 'Universal' ? 1 : 0}, ${p.fitment}, ${q(p.warranty)}, 1, ${p.featured}, ${p.deal}, ${ts(-60 + (i % 20), '09:00')}, ${ts(-60 + (i % 20), '09:00')});`);
    if (p.compat !== 'Universal') for (const m of p.compat) later.push(`INSERT INTO product_compatibility (product_id, car_model_id) VALUES (${id}, ${modelId(m)});`);
    later.push(`INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (${id}, ${p.opening}, 'opening', 'Opening stock', 1, ${ts(-60 + (i % 20), '09:00')});`);
  });
  sql('\n-- Compatibility and opening stock ledger');
  later.forEach((l) => sql(l));
  later.length = 0;

  sql('\n-- Store orders (totals from pricing.service.js calculateOrderTotals)');
  const FLOW = ['placed', 'packed', 'shipped', 'out_for_delivery', 'delivered'];
  orders.forEach((o, i) => {
    const id = i + 1;
    const user = users[o.user - 1];
    const lines = o.items.map(([pi, qty]) => ({ p: catalog.products[pi - 1], id: pi, qty }));
    const items = lines.map((l) => ({ unitPricePaise: rupees(l.p.price), mrpPaise: rupees(l.p.mrp), quantity: l.qty }));
    let coupon = null;
    if (o.coupon) {
      const c = coupMap[o.coupon];
      const sub = calculateOrderTotals({ items }).subtotalPaise;
      if (c.scope === 'wash' || sub < rupees(c.min)) throw new Error(`Order ${id}: coupon not applicable`);
      coupon = couponObj(o.coupon);
    }
    if (o.fitment && !lines.some((l) => l.p.fitment)) throw new Error(`Order ${id}: no fitment items`);
    const t = calculateOrderTotals({ items, coupon, fitment: Boolean(o.fitment) });
    const createdAt = ts(o.d, '10:20');
    const isCod = o.pay === 'cod';
    sql(`INSERT INTO orders (id, order_code, user_id, status, payment_method, ship_name, ship_phone, ship_line1, ship_line2, ship_city, ship_state, ship_pincode, subtotal_paise, discount_paise, shipping_paise, fitment_paise, total_paise, gst_included_paise, coupon_id, coupon_code, fitment_date, fitment_slot_id, cancel_reason, return_reason, delivered_at, created_at, updated_at) VALUES (${id}, ${q(`CZO-${code(6)}`)}, ${o.user}, ${q(o.status)}, ${q(o.pay)}, ${q(user.name)}, ${q(user.phone)}, ${q(user.address)}, NULL, ${q(user.city)}, ${q(ADDRESS_STATES)}, ${q(user.pincode)}, ${t.subtotalPaise}, ${t.discountPaise}, ${t.shippingPaise}, ${t.fitmentPaise}, ${t.totalPaise}, ${t.gstIncludedPaise}, ${coupon ? coupMap[o.coupon].id : 'NULL'}, ${q(o.coupon || null)}, ${o.fitment ? day(o.fitment.d) : 'NULL'}, ${o.fitment ? o.fitment.slot : 'NULL'}, ${q(o.cancelReason || null)}, ${q(o.returnReason || null)}, ${o.deliveredDay !== undefined ? ts(o.deliveredDay, '14:00') : 'NULL'}, ${createdAt}, ${createdAt});`);
    lines.forEach((l) => {
      later.push(`INSERT INTO order_items (order_id, product_id, product_name, sku, unit_price_paise, mrp_paise, quantity, line_total_paise) VALUES (${id}, ${l.id}, ${q(l.p.name)}, ${q(l.p.sku)}, ${rupees(l.p.price)}, ${rupees(l.p.mrp)}, ${l.qty}, ${rupees(l.p.price) * l.qty});`);
      later.push(`INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (${l.id}, ${-l.qty}, 'order', ${q(`Order #${id}`)}, ${o.user}, ${createdAt});`);
      if (o.status === 'cancelled') later.push(`INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (${l.id}, ${l.qty}, 'cancel', ${q(`Order #${id}`)}, ${o.user}, ${ts(o.cancelDay, '12:00')});`);
      if (o.status === 'returned') later.push(`INSERT INTO stock_movements (product_id, qty_change, reason, reference, created_by, created_at) VALUES (${l.id}, ${l.qty}, 'return', ${q(`Order #${id}`)}, 1, ${ts(o.returnedDay, '16:00')});`);
    });
    if (o.coupon && o.status !== 'cancelled') later.push(`INSERT INTO coupon_redemptions (coupon_id, user_id, booking_id, order_id, discount_paise, created_at) VALUES (${coupMap[o.coupon].id}, ${o.user}, NULL, ${id}, ${t.discountPaise}, ${createdAt});`);
    if (o.fitment && o.status !== 'cancelled') hold(o.fitment.d, o.fitment.slot);

    const hist = (from, to, note, by, at) => later.push(`INSERT INTO order_status_history (order_id, from_status, to_status, note, changed_by, created_at) VALUES (${id}, ${q(from)}, ${q(to)}, ${q(note)}, ${by}, ${at});`);
    // Payment rows + the first status entries
    if (isCod) {
      hist(null, 'placed', 'Order placed - cash on delivery', o.user, createdAt);
      const delivered = ['delivered', 'return_requested', 'returned'].includes(o.status);
      const status = o.status === 'cancelled' ? 'cancelled' : delivered ? 'success' : 'pending';
      const pid = addPayment({ purpose: 'order', targetId: id, userId: o.user, gateway: 'cod', method: 'cod', detail: 'Cash on delivery', amount: t.totalPaise, status, at: createdAt, verifiedAt: delivered ? ts(o.deliveredDay, '14:00') : null });
      if (o.status === 'cancelled') payRows.push(`UPDATE payments SET failure_reason = 'Cancelled with the order', updated_at = ${ts(o.cancelDay, '12:00')} WHERE id = ${pid};`);
    } else {
      hist(null, 'pending_payment', 'Order created - awaiting payment', o.user, createdAt);
      if (o.failed) addPayment({ purpose: 'order', targetId: id, userId: o.user, method: o.failed.method, detail: o.failed.detail, amount: t.totalPaise, status: 'failed', failure: o.failed.reason, at: ts(o.d, '10:22') });
      if (o.status !== 'pending_payment') {
        const detail = o.pay === 'upi' ? `${user.email.split('@')[0]}@okicici` : PAY_DETAIL[o.pay];
        const status = o.status === 'returned' ? 'refunded' : o.status === 'cancelled' ? 'refund_pending' : 'success';
        const pid = addPayment({ purpose: 'order', targetId: id, userId: o.user, method: o.pay, detail, amount: t.totalPaise, status, at: ts(o.d, '10:22'), verifiedAt: ts(o.d, '10:23') });
        hist('pending_payment', 'placed', `Payment received via ${({ card: 'Credit / Debit card', upi: 'UPI', netbanking: 'Net banking', wallet: 'Wallet' })[o.pay]}`, o.user, ts(o.d, '10:23'));
        if (o.status === 'cancelled') addRefund({ paymentId: pid, amount: t.totalPaise, percent: 100, reason: 'Order cancelled before shipping - full refund', createdAt: ts(o.cancelDay, '12:00') });
        if (o.status === 'returned') addRefund({ paymentId: pid, amount: t.totalPaise, percent: 100, reason: 'Return approved - full refund', processedAt: ts(o.returnedDay, '17:00'), createdAt: ts(o.returnedDay, '16:00') });
      }
    }
    // Fulfilment steps up to the current status
    const reached = o.status === 'cancelled' ? 0 : ['return_requested', 'returned'].includes(o.status) ? FLOW.length : FLOW.indexOf(o.status) + 1;
    const stepAt = {
      packed: ts(o.d, '17:00'), shipped: ts(o.d + 1, '11:00'),
      out_for_delivery: ts(o.deliveredDay ?? Math.min(o.d + 2, 0), '08:30'), delivered: ts(o.deliveredDay ?? 0, '14:00'),
    };
    const notes = { packed: 'Items packed at the CarZone warehouse', shipped: 'Handed over to the courier', out_for_delivery: 'Out for delivery today', delivered: 'Delivered to the customer' };
    for (let s = 1; s < reached; s++) hist(FLOW[s - 1], FLOW[s], notes[FLOW[s]], 1, stepAt[FLOW[s]]);
    if (o.fitment && reached >= 1) hist('placed', 'placed', `Fitment booked at CarZone centre (${slots[o.fitment.slot - 1][1]})`, o.user, ts(o.d, '10:25'));
    if (o.status === 'cancelled') {
      hist(isCod ? 'placed' : 'placed', 'cancelled', `Cancelled by customer: ${o.cancelReason}${isCod ? '' : ' - full refund initiated'}`, o.user, ts(o.cancelDay, '12:00'));
    }
    if (['return_requested', 'returned'].includes(o.status)) hist('delivered', 'return_requested', `Return requested: ${o.returnReason}`, o.user, ts(o.deliveredDay + 1, '10:00'));
    if (o.status === 'returned') hist('return_requested', 'returned', 'Return received and approved - refund initiated', 1, ts(o.returnedDay, '16:00'));
    for (const [pi, rating, title, comment, status] of o.reviews || []) {
      later.push(`INSERT INTO product_reviews (product_id, user_id, order_id, rating, title, comment, status, created_at, moderated_at) VALUES (${pi}, ${o.user}, ${id}, ${rating}, ${q(title)}, ${q(comment)}, ${q(status)}, ${ts(o.deliveredDay + 2, '19:00')}, ${status === 'approved' ? ts(o.deliveredDay + 3, '10:00') : 'NULL'});`);
    }
  });
  sql('\n-- Order items, stock ledger, coupon redemptions, order history and product reviews');
  later.forEach((l) => sql(l));

  sql('\n-- Payments (wash + store) and refunds');
  payRows.forEach((l) => sql(l));
  refundRows.forEach((l) => sql(l));

  sql('\n-- Slot inventory: booked_count = live wash bookings + store fitment appointments in that slot');
  for (const [key, count] of inventory) {
    const [d, slot] = key.split('|').map(Number);
    sql(`INSERT INTO slot_inventory (slot_date, time_slot_id, booked_count, is_blocked) VALUES (${day(d)}, ${slot}, ${count}, 0);`);
  }
  sql('-- Example admin override: the Evening slot 7 days from now is blocked for staff training');
  sql(`INSERT INTO slot_inventory (slot_date, time_slot_id, booked_count, is_blocked) VALUES (${day(7)}, 6, 0, 1);`);

  sql('\n-- Contact form messages');
  sql(`INSERT INTO contact_messages (name, email, phone, subject, message, status, created_at) VALUES ('Meera Joshi', 'meera.joshi@example.com', '9822334455', 'Corporate fleet washing', 'We have 12 company cars at our Baner office. Do you offer monthly fleet packages with on-site washing?', 'new', ${ts(-1, '16:40')});`);
  sql(`INSERT INTO contact_messages (name, email, phone, subject, message, status, created_at) VALUES ('Siddharth Rane', 'sid.rane@example.com', NULL, 'Android stereo for Ertiga', 'Do you stock a 9 inch stereo that fits the Ertiga, and can you install it the same day?', 'read', ${ts(-4, '12:05')});`);
  sql(`INSERT INTO contact_messages (name, email, phone, subject, message, status, created_at) VALUES ('Neha Gupta', 'neha.g@example.com', '9811122233', 'Gift voucher', 'Can I buy a full detailing gift voucher for my father''s birthday?', 'resolved', ${ts(-9, '09:30')});`);

  sql('\nCOMMIT;');

  const seed = out.join('\n') + '\n';
  fs.writeFileSync(path.join(config.databaseDir, 'seed.sql'), seed);
  const schema = fs.readFileSync(path.join(config.databaseDir, 'schema.sql'), 'utf8');
  fs.writeFileSync(path.join(config.databaseDir, 'carzone_db.sql'),
    `-- =====================================================================\n-- carzone_db.sql - ONE script for MySQL Workbench: drops and recreates the\n-- carzone_db database, creates all tables (schema.sql) and loads the sample data\n-- (seed.sql). Generated by scripts/build-seed.js.\n-- Runs unchanged on MySQL 8 and on TiDB Cloud Starter (MySQL-compatible).\n-- MySQL Workbench: File > Open SQL Script > select this file > Execute (lightning icon).\n-- Or from the project folder: npm run db:setup  (uses the connection settings in .env)\n-- =====================================================================\nDROP DATABASE IF EXISTS carzone_db;\n\n${schema}\n${seed}`);
  console.log(`Wrote database/seed.sql and database/carzone_db.sql (${bookings.length} bookings, ${orders.length} orders, ${catalog.products.length} products, ${paymentId} payments)`);
}

await build();
