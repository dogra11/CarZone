/**
 * config/index.js - Central application configuration (CarZone).
 *
 * Every setting has a safe default, so the project runs without any .env file.
 * Business rules (GST, pickup fee, cancellation policy...) live here so they can be
 * explained and changed in ONE place. Money values are converted to integer paise.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.js';
import { resolveDbConfig } from './database.js';

// (fileURLToPath instead of import.meta.dirname keeps Node 18 support.)
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnvFile(path.join(ROOT_DIR, '.env'));

const env = process.env;
const num = (key, fallback) => {
  const n = Number(env[key]);
  return env[key] !== undefined && env[key] !== '' && Number.isFinite(n) ? n : fallback;
};
const bool = (key, fallback) => (env[key] === undefined || env[key] === '' ? fallback : env[key] === 'true');

// NODE_ENV=production is set by the hosting platform (see render.yaml). It switches on the
// "deployed" defaults below; a local `npm start` keeps the friendly development defaults.
const isProduction = env.NODE_ENV === 'production';

export const MIN_SESSION_SECRET_LENGTH = 32;

export const config = Object.freeze({
  env: env.NODE_ENV || 'development',
  isProduction,
  // Hosting platforms (Render, Railway, Heroku...) tell the app which port to use via PORT.
  port: num('PORT', 3000),
  // localhost = only this PC can open the site (safe default for development).
  // 0.0.0.0   = listen on every network interface - required inside a cloud container,
  //             otherwise the platform's proxy cannot reach the app.
  host: env.HOST || (isProduction ? '0.0.0.0' : 'localhost'),
  // Public address used in log messages (e.g. the demo password-reset link).
  // Render sets RENDER_EXTERNAL_URL automatically (https://<name>.onrender.com).
  publicUrl: (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  // Behind a reverse proxy / load balancer (Render, Nginx...) the TCP connection comes from
  // the proxy. trust proxy makes Express read the real client IP and https from the
  // X-Forwarded-For / X-Forwarded-Proto headers (needed for per-IP rate limiting).
  trustProxy: bool('TRUST_PROXY', isProduction),
  // Secure cookies are only sent over https. On by default in production (Render serves
  // https); a local http test of the production build can set COOKIE_SECURE=false.
  cookieSecure: bool('COOKIE_SECURE', isProduction),
  rootDir: ROOT_DIR,
  // The React app is built into client/dist and served from there (see staticFiles.js).
  publicDir: path.join(ROOT_DIR, 'client', 'dist'),
  databaseDir: path.join(ROOT_DIR, 'database'),
  // DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME or one DATABASE_URL, plus DB_SSL / DB_SSL_CA
  // for TLS (TiDB Cloud). See config/database.js.
  db: Object.freeze(resolveDbConfig(env, ROOT_DIR)),
  sessionSecret: env.SESSION_SECRET || '',
  sessionTtlHours: num('SESSION_TTL_HOURS', 12),
  rememberMeDays: num('REMEMBER_ME_DAYS', 30),
  demoMode: bool('DEMO_MODE', true),
  resetTokenTtlMinutes: num('RESET_TOKEN_TTL_MINUTES', 15),
  loginMaxAttempts: num('LOGIN_MAX_ATTEMPTS', 5),
  lockoutMinutes: num('LOCKOUT_MINUTES', 15),
  authRateLimitMax: num('AUTH_RATE_LIMIT_MAX', 30),
  authRateLimitWindowMs: num('AUTH_RATE_LIMIT_WINDOW_MINUTES', 10) * 60 * 1000,
  logRequests: bool('LOG_REQUESTS', true),

  // ---- Business rules ----
  business: Object.freeze({
    gstPercent: num('GST_PERCENT', 18),
    pickupFeePaise: Math.round(num('PICKUP_FEE_RUPEES', 199) * 100),
    freeCancelHours: num('FREE_CANCEL_HOURS', 24),
    lateCancelRefundPercent: num('LATE_CANCEL_REFUND_PERCENT', 50),
    maxReschedules: num('MAX_RESCHEDULES', 2),
    minHoursBeforeReschedule: num('MIN_HOURS_BEFORE_RESCHEDULE', 2),
    bookingWindowDays: num('BOOKING_WINDOW_DAYS', 30),
    // Accessories store (product prices are GST-inclusive, as on Indian MRPs)
    freeShippingAbovePaise: Math.round(num('FREE_SHIPPING_ABOVE_RUPEES', 999) * 100),
    shippingFeePaise: Math.round(num('SHIPPING_FEE_RUPEES', 79) * 100),
    fitmentFeePaise: Math.round(num('FITMENT_FEE_RUPEES', 299) * 100),
    returnWindowDays: num('RETURN_WINDOW_DAYS', 7),
    lowStockThreshold: num('LOW_STOCK_THRESHOLD', 5),
    paymentExpiryMinutes: num('PAYMENT_EXPIRY_MINUTES', 15),
  }),

  // Payment gateway: Razorpay (test mode) is used automatically when both keys are set,
  // otherwise the built-in simulated gateway.
  razorpay: Object.freeze({
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  }),

  // Company details printed on invoices and the contact section.
  company: Object.freeze({
    name: 'CarZone Wash & Accessories Centre',
    legalName: 'CarZone Automotive Pvt. Ltd.',
    address: 'Plot 14, Baner-Balewadi Road, Baner, Pune, Maharashtra 411045',
    phone: '+91 98220 14514',
    email: 'hello@carzone.in',
    gstin: '27AAKCA1234F1Z5',
    latitude: 18.5603,
    longitude: 73.7879,
  }),
});

/**
 * Fail-fast checks for a deployed (production) server, run by bootstrap.js BEFORE the
 * database is touched. Locally (NODE_ENV not "production") nothing is required: the session
 * secret is generated automatically and stored in the app_settings table.
 *
 * Why is SESSION_SECRET mandatory in production? It signs the login cookies. If it were
 * generated and kept only in the database, anyone with database access could forge
 * sessions, and a fresh database would silently log everybody out. A deployed app must
 * get its secrets from the environment (Render: generateValue: true in render.yaml).
 */
export function assertProductionConfig(cfg = config) {
  if (!cfg.isProduction) return;
  const problems = [];
  if (!cfg.sessionSecret) {
    problems.push(`SESSION_SECRET is missing. Set it to a random string of at least ${MIN_SESSION_SECRET_LENGTH} characters (Render: Environment > Add > "Generate").`);
  } else if (cfg.sessionSecret.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(`SESSION_SECRET is too short (${cfg.sessionSecret.length} characters). Use at least ${MIN_SESSION_SECRET_LENGTH} random characters.`);
  }
  if (problems.length) {
    const err = new Error(`Production configuration error:\n  - ${problems.join('\n  - ')}`);
    err.code = 'CONFIG_INVALID';
    throw err;
  }
}
