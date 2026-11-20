/**
 * catalog.service.js - Services (packages), their per-vehicle prices and add-ons.
 *
 * Price model: each service has one price PER VEHICLE TYPE in service_prices
 * (a hatchback wash costs less than an SUV wash). A missing row means the service
 * is not offered for that vehicle type (e.g. Ceramic Coating is not offered for bikes).
 */
import { one, all, run, transaction } from '../db/connection.js';
import { nowSql } from '../utils/dates.js';
import { AppError } from '../utils/AppError.js';
import { VEHICLE_TYPES } from '../utils/shared.js';

const mapAddon = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  pricePaise: r.price_paise,
  durationMinutes: r.duration_minutes,
  isActive: Boolean(r.is_active),
});

function mapService(r, prices, addons) {
  const priceValues = Object.values(prices);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    tagline: r.tagline,
    description: r.description,
    benefits: JSON.parse(r.benefits),
    durationMinutes: r.duration_minutes,
    image: r.image,
    pickupAvailable: Boolean(r.pickup_available),
    isActive: Boolean(r.is_active),
    isFeatured: Boolean(r.is_featured),
    sortOrder: r.sort_order,
    prices,                                           // { hatchback: 49900, sedan: 59900, ... }
    minPricePaise: priceValues.length ? Math.min(...priceValues) : 0,
    addons,
    rating: r.avg_rating ? Math.round(r.avg_rating * 10) / 10 : null,
    reviewCount: r.review_count || 0,
    bookingCount: r.booking_count || 0,
  };
}

const SERVICE_SELECT = `
  SELECT s.*,
         (SELECT AVG(rating) FROM reviews rv WHERE rv.service_id = s.id AND rv.status = 'approved') AS avg_rating,
         (SELECT COUNT(*)    FROM reviews rv WHERE rv.service_id = s.id AND rv.status = 'approved') AS review_count,
         (SELECT COUNT(*)    FROM bookings b WHERE b.service_id = s.id AND b.status <> 'cancelled') AS booking_count
    FROM services s`;

async function pricesFor(serviceId) {
  const prices = {};
  for (const p of await all('SELECT vehicle_type, price_paise FROM service_prices WHERE service_id = ?', serviceId)) {
    prices[p.vehicle_type] = p.price_paise;
  }
  return prices;
}

async function addonsFor(serviceId, includeInactive) {
  return (await all(
    `SELECT a.* FROM addons a JOIN service_addons sa ON sa.addon_id = a.id
      WHERE sa.service_id = ? AND (? = 1 OR a.is_active = 1) ORDER BY a.price_paise`,
    serviceId, includeInactive ? 1 : 0,
  )).map(mapAddon);
}

export async function listServices({ includeInactive = false } = {}) {
  const rows = await all(`${SERVICE_SELECT} WHERE (? = 1 OR s.is_active = 1) ORDER BY s.sort_order, s.name`, includeInactive ? 1 : 0);
  return Promise.all(rows.map(async (r) => mapService(r, await pricesFor(r.id), await addonsFor(r.id, includeInactive))));
}

export async function getService(idOrSlug, { includeInactive = false } = {}) {
  const row = typeof idOrSlug === 'number'
    ? await one(`${SERVICE_SELECT} WHERE s.id = ?`, idOrSlug)
    : await one(`${SERVICE_SELECT} WHERE s.slug = ?`, idOrSlug);
  if (!row || (!includeInactive && !row.is_active)) throw AppError.notFound('Service not found');
  return mapService(row, await pricesFor(row.id), await addonsFor(row.id, includeInactive));
}

/**
 * Loads everything the pricing engine needs and checks the combination is allowed:
 * active service, offered for this vehicle type, add-ons belong to the service.
 */
export async function getPricingInputs(serviceId, vehicleType, addonIds = []) {
  const service = await one('SELECT * FROM services WHERE id = ? AND is_active = 1', serviceId);
  if (!service) throw AppError.unprocessable('This service is not available', { serviceId: 'Choose an available service' });

  const price = await one('SELECT price_paise FROM service_prices WHERE service_id = ? AND vehicle_type = ?', serviceId, vehicleType);
  if (!price) throw AppError.unprocessable(`${service.name} is not offered for this vehicle type`, { vehicleType: 'Not offered for this vehicle type' });

  const allowed = await addonsFor(serviceId, false);
  const addons = addonIds.map((id) => {
    const a = allowed.find((x) => x.id === id);
    if (!a) throw AppError.unprocessable('One of the selected add-ons is not available for this service', { addonIds: 'Invalid add-on' });
    return a;
  });

  return { service, basePricePaise: price.price_paise, addons };
}

// ---------------------------------------------------------------------------
// Admin: services
// ---------------------------------------------------------------------------
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Validates the { hatchback: "499", sedan: "" ... } price map coming from the admin form. */
function parsePrices(prices) {
  const out = {};
  const errors = {};
  for (const type of VEHICLE_TYPES) {
    const raw = prices?.[type];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 200000 || !/^\d+(\.\d{1,2})?$/.test(String(raw))) {
      errors[`price_${type}`] = 'Enter a valid price';
    } else {
      out[type] = Math.round(n * 100);
    }
  }
  if (Object.keys(errors).length) throw AppError.unprocessable('Please correct the prices', errors);
  if (!Object.keys(out).length) throw AppError.unprocessable('Enter a price for at least one vehicle type', { prices: 'At least one price is required' });
  return out;
}

async function saveServiceChildren(serviceId, prices, addonIds) {
  await run('DELETE FROM service_prices WHERE service_id = ?', serviceId);
  for (const [type, paise] of Object.entries(prices)) {
    await run('INSERT INTO service_prices (service_id, vehicle_type, price_paise) VALUES (?, ?, ?)', serviceId, type, paise);
  }
  await run('DELETE FROM service_addons WHERE service_id = ?', serviceId);
  for (const addonId of addonIds) {
    if (!(await one('SELECT id FROM addons WHERE id = ?', addonId))) throw AppError.unprocessable(`Add-on #${addonId} does not exist`);
    await run('INSERT INTO service_addons (service_id, addon_id) VALUES (?, ?)', serviceId, addonId);
  }
}

export async function createService(input, rawPrices) {
  const prices = parsePrices(rawPrices);
  const slug = slugify(input.name);
  if (await one('SELECT id FROM services WHERE slug = ? OR name = ?', slug, input.name)) throw AppError.conflict('A service with this name already exists');
  const id = await transaction(async () => {
    const maxOrder = (await one('SELECT COALESCE(MAX(sort_order), 0) AS m FROM services')).m;
    const { lastInsertRowid } = await run(
      `INSERT INTO services (slug, name, category, tagline, description, benefits, duration_minutes, image,
                             pickup_available, is_active, is_featured, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      slug, input.name, input.category, input.tagline, input.description, JSON.stringify(input.benefits),
      input.durationMinutes, input.image, input.pickupAvailable ? 1 : 0, input.isActive ? 1 : 0, input.isFeatured ? 1 : 0, maxOrder + 1, nowSql(), nowSql(),
    );
    await saveServiceChildren(lastInsertRowid, prices, input.addonIds);
    return lastInsertRowid;
  });
  return getService(id, { includeInactive: true });
}

export async function updateService(id, input, rawPrices) {
  await getService(id, { includeInactive: true });
  const prices = parsePrices(rawPrices);
  if (await one('SELECT id FROM services WHERE name = ? AND id <> ?', input.name, id)) throw AppError.conflict('Another service already uses this name');
  await transaction(async () => {
    await run(
      `UPDATE services SET name = ?, category = ?, tagline = ?, description = ?, benefits = ?, duration_minutes = ?,
              image = ?, pickup_available = ?, is_active = ?, is_featured = ?, updated_at = ?
        WHERE id = ?`,
      input.name, input.category, input.tagline, input.description, JSON.stringify(input.benefits), input.durationMinutes,
      input.image, input.pickupAvailable ? 1 : 0, input.isActive ? 1 : 0, input.isFeatured ? 1 : 0, nowSql(), id,
    );
    await saveServiceChildren(id, prices, input.addonIds);
  });
  return getService(id, { includeInactive: true });
}

export async function setServiceActive(id, isActive) {
  await getService(id, { includeInactive: true });
  await run('UPDATE services SET is_active = ?, updated_at = ? WHERE id = ?', isActive ? 1 : 0, nowSql(), id);
  return getService(id, { includeInactive: true });
}

export async function deleteService(id) {
  await getService(id, { includeInactive: true });
  if (await one('SELECT id FROM bookings WHERE service_id = ? LIMIT 1', id)) {
    throw AppError.conflict('This service has bookings. Mark it unavailable instead of deleting it.');
  }
  await run('DELETE FROM services WHERE id = ?', id);
}

// ---------------------------------------------------------------------------
// Admin: add-ons
// ---------------------------------------------------------------------------
export async function listAddons() {
  return (await all(
    `SELECT a.*, (SELECT COUNT(*) FROM service_addons sa WHERE sa.addon_id = a.id) AS service_count,
            (SELECT GROUP_CONCAT(service_id) FROM service_addons sa WHERE sa.addon_id = a.id) AS service_ids
       FROM addons a ORDER BY a.name`,
  )).map((r) => ({ ...mapAddon(r), serviceCount: r.service_count, serviceIds: r.service_ids ? r.service_ids.split(',').map(Number) : [] }));
}

async function getAddon(id) {
  const row = await one('SELECT * FROM addons WHERE id = ?', id);
  if (!row) throw AppError.notFound('Add-on not found');
  return mapAddon(row);
}

export async function createAddon(a) {
  if (await one('SELECT id FROM addons WHERE name = ?', a.name)) throw AppError.conflict('An add-on with this name already exists');
  const { lastInsertRowid } = await run(
    'INSERT INTO addons (name, description, price_paise, duration_minutes, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    a.name, a.description, a.price, a.durationMinutes, a.isActive ? 1 : 0, nowSql(),
  );
  return getAddon(lastInsertRowid);
}

export async function updateAddon(id, a) {
  await getAddon(id);
  if (await one('SELECT id FROM addons WHERE name = ? AND id <> ?', a.name, id)) throw AppError.conflict('Another add-on already uses this name');
  await run(
    'UPDATE addons SET name = ?, description = ?, price_paise = ?, duration_minutes = ?, is_active = ? WHERE id = ?',
    a.name, a.description, a.price, a.durationMinutes, a.isActive ? 1 : 0, id,
  );
  return getAddon(id);
}

export async function deleteAddon(id) {
  await getAddon(id);
  if (await one('SELECT 1 AS used FROM booking_addons WHERE addon_id = ? LIMIT 1', id)) {
    throw AppError.conflict('This add-on appears in past bookings. Deactivate it instead of deleting it.');
  }
  await run('DELETE FROM addons WHERE id = ?', id);
}
