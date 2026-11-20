-- =====================================================================
-- CarZone - Car Wash, Detailing & Accessories
-- database/schema.sql : complete relational schema for MySQL 8.0.16+ and TiDB
--                       (TiDB Cloud Starter, MySQL-compatible) - the SAME file runs on both.
--
-- Conventions
--   * InnoDB tables (transactions + foreign keys), utf8mb4 character set.
--   * Money is stored as INT paise (1 rupee = 100 paise) -> exact maths, no float errors.
--   * Dates are DATE, timestamps DATETIME. The app always passes local times as
--     parameters, so queries stay portable and time-zone independent.
--   * Status columns are VARCHAR + CHECK (easy to extend, readable in reports).
--   * CHECK constraints and FOREIGN KEYs keep data consistent even if the code has a bug.
--     (MySQL rule: a column used in a CHECK cannot have ON DELETE CASCADE/SET NULL,
--      so those foreign keys use RESTRICT.)
--
-- TiDB portability notes (reviewed for TiDB Cloud Starter)
--   * Only portable features are used: InnoDB-style tables, FOREIGN KEYs (TiDB 6.6+),
--     utf8mb4_unicode_ci, CHECK constraints, plain indexes. No triggers, stored
--     procedures/functions, events, SPATIAL or FULLTEXT indexes.
--   * CHECK constraints: MySQL enforces them; TiDB parses them and enforces them only when
--     tidb_enable_check_constraint=ON. The app validates everything itself anyway.
--   * "/*T![auto_id_cache] AUTO_ID_CACHE=1 */" is a TiDB-only table option written as a
--     comment: MySQL ignores it. By default TiDB hands out AUTO_INCREMENT ids in cached
--     batches per server, so ids are unique but NOT in insertion order. Some queries pick
--     "the latest row" with ORDER BY id DESC (e.g. the latest payment of a booking);
--     AUTO_ID_CACHE=1 (TiDB "MySQL compatibility mode") keeps ids increasing in insertion
--     order like MySQL. Ids may still have gaps on both databases - nothing relies on
--     consecutive ids; the sample data uses explicit ids, which is fine.
-- =====================================================================

CREATE DATABASE IF NOT EXISTS carzone_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE carzone_db;

-- Key/value settings generated at runtime (e.g. the session-signing secret).
CREATE TABLE app_settings (
  setting_key    VARCHAR(64)  NOT NULL PRIMARY KEY,
  setting_value  VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Users & authentication
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(80)  NOT NULL,
  email          VARCHAR(120) NOT NULL UNIQUE,
  phone          VARCHAR(10)  NULL,
  password_hash  VARCHAR(128) NOT NULL,                 -- scrypt hash (hex)
  password_salt  VARCHAR(32)  NOT NULL,                 -- random per-user salt (hex)
  role           VARCHAR(10)  NOT NULL DEFAULT 'customer',
  address        VARCHAR(200) NULL,
  city           VARCHAR(60)  NULL,
  pincode        VARCHAR(6)   NULL,
  avatar         VARCHAR(200) NULL,
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  failed_logins  INT          NOT NULL DEFAULT 0,
  locked_until   DATETIME     NULL,
  last_login_at  DATETIME     NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_users_role CHECK (role IN ('customer', 'admin')),
  CONSTRAINT chk_users_name CHECK (CHAR_LENGTH(name) BETWEEN 2 AND 80),
  CONSTRAINT chk_users_phone CHECK (phone IS NULL OR CHAR_LENGTH(phone) = 10),
  CONSTRAINT chk_users_pin CHECK (pincode IS NULL OR CHAR_LENGTH(pincode) = 6),
  CONSTRAINT chk_users_active CHECK (is_active IN (0, 1)),
  CONSTRAINT chk_users_failed CHECK (failed_logins >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

-- Server-side sessions. Only a SHA-256 HASH of the cookie token is stored.
CREATE TABLE sessions (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  token_hash  VARCHAR(64)  NOT NULL UNIQUE,
  expires_at  DATETIME     NOT NULL,
  ip          VARCHAR(64)  NULL,
  user_agent  VARCHAR(200) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Password-reset tokens: hashed, single-use and time-limited.
CREATE TABLE password_resets (
  id          INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT         NOT NULL,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  DATETIME    NOT NULL,
  used_at     DATETIME    NULL,
  created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_password_resets_user ON password_resets(user_id);

-- Customer's saved vehicles (for wash bookings).
CREATE TABLE vehicles (
  id               INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id          INT         NOT NULL,
  vehicle_type     VARCHAR(12) NOT NULL,
  brand            VARCHAR(40) NOT NULL,
  model            VARCHAR(40) NOT NULL,
  registration_no  VARCHAR(12) NOT NULL,
  color            VARCHAR(30) NULL,
  created_at       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_vehicles_user_reg UNIQUE (user_id, registration_no),
  CONSTRAINT fk_vehicles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_vehicles_type CHECK (vehicle_type IN ('hatchback', 'sedan', 'suv', 'luxury', 'bike'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

-- Customer delivery addresses (for store orders).
CREATE TABLE addresses (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  label       VARCHAR(20)  NOT NULL DEFAULT 'Home',
  full_name   VARCHAR(80)  NOT NULL,
  phone       VARCHAR(10)  NOT NULL,
  line1       VARCHAR(120) NOT NULL,
  line2       VARCHAR(120) NULL,
  city        VARCHAR(60)  NOT NULL,
  state       VARCHAR(40)  NOT NULL,
  pincode     VARCHAR(6)   NOT NULL,
  is_default  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_addresses_phone CHECK (CHAR_LENGTH(phone) = 10),
  CONSTRAINT chk_addresses_pin CHECK (CHAR_LENGTH(pincode) = 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_addresses_user ON addresses(user_id);

-- =====================================================================
-- WASH & DETAILING
-- =====================================================================
CREATE TABLE services (
  id                INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug              VARCHAR(80)   NOT NULL UNIQUE,
  name              VARCHAR(60)   NOT NULL UNIQUE,
  category          VARCHAR(40)   NOT NULL,
  tagline           VARCHAR(120)  NOT NULL,
  description       TEXT          NOT NULL,
  benefits          TEXT          NOT NULL,              -- JSON array of strings
  duration_minutes  INT           NOT NULL,
  image             VARCHAR(200)  NOT NULL,
  pickup_available  TINYINT(1)    NOT NULL DEFAULT 0,
  is_active         TINYINT(1)    NOT NULL DEFAULT 1,     -- availability
  is_featured       TINYINT(1)    NOT NULL DEFAULT 0,
  sort_order        INT           NOT NULL DEFAULT 0,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_services_json CHECK (JSON_VALID(benefits)),
  CONSTRAINT chk_services_duration CHECK (duration_minutes BETWEEN 15 AND 720)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

-- Price of each service for each vehicle type (a missing row = not offered).
CREATE TABLE service_prices (
  service_id    INT         NOT NULL,
  vehicle_type  VARCHAR(12) NOT NULL,
  price_paise   INT         NOT NULL,
  PRIMARY KEY (service_id, vehicle_type),
  CONSTRAINT fk_prices_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  CONSTRAINT chk_prices_type CHECK (vehicle_type IN ('hatchback', 'sedan', 'suv', 'luxury', 'bike')),
  CONSTRAINT chk_prices_positive CHECK (price_paise > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE addons (
  id                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(60)  NOT NULL UNIQUE,
  description       VARCHAR(200) NOT NULL,
  price_paise       INT          NOT NULL,
  duration_minutes  INT          NOT NULL DEFAULT 0,
  is_active         TINYINT(1)   NOT NULL DEFAULT 1,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_addons_price CHECK (price_paise >= 0),
  CONSTRAINT chk_addons_duration CHECK (duration_minutes >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

CREATE TABLE service_addons (
  service_id  INT NOT NULL,
  addon_id    INT NOT NULL,
  PRIMARY KEY (service_id, addon_id),
  CONSTRAINT fk_sa_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  CONSTRAINT fk_sa_addon FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily recurring slots with a default capacity (number of bays). Shared by wash
-- bookings AND store "fitment at CarZone centre" appointments.
CREATE TABLE time_slots (
  id          INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  label       VARCHAR(40) NOT NULL,
  start_time  VARCHAR(5)  NOT NULL UNIQUE,              -- 'HH:MM'
  end_time    VARCHAR(5)  NOT NULL,
  capacity    INT         NOT NULL,
  is_active   TINYINT(1)  NOT NULL DEFAULT 1,
  CONSTRAINT chk_slots_start CHECK (start_time REGEXP '^[0-2][0-9]:[0-5][0-9]$'),
  CONSTRAINT chk_slots_end CHECK (end_time REGEXP '^[0-2][0-9]:[0-5][0-9]$'),
  CONSTRAINT chk_slots_order CHECK (end_time > start_time),
  CONSTRAINT chk_slots_capacity CHECK (capacity BETWEEN 1 AND 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

-- One row per (date, slot) that has bookings or an admin override. booked_count is
-- changed in the SAME transaction as the booking/fitment, so it always matches them.
CREATE TABLE slot_inventory (
  id                 INT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slot_date          DATE       NOT NULL,
  time_slot_id       INT        NOT NULL,
  booked_count       INT        NOT NULL DEFAULT 0,
  capacity_override  INT        NULL,
  is_blocked         TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT uq_slot_day UNIQUE (slot_date, time_slot_id),
  CONSTRAINT fk_inventory_slot FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
  CONSTRAINT chk_inventory_booked CHECK (booked_count >= 0),
  CONSTRAINT chk_inventory_override CHECK (capacity_override IS NULL OR capacity_override BETWEEN 0 AND 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_slot_inventory_date ON slot_inventory(slot_date);

-- Offers / coupons - one engine for both businesses (applies_to: wash / store / both).
CREATE TABLE coupons (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code                VARCHAR(20)  NOT NULL UNIQUE,
  title               VARCHAR(60)  NOT NULL,
  description         VARCHAR(200) NOT NULL,
  discount_type       VARCHAR(10)  NOT NULL,
  discount_value      INT          NOT NULL,              -- percent (1-90) OR flat paise
  max_discount_paise  INT          NULL,
  min_order_paise     INT          NOT NULL DEFAULT 0,
  valid_from          DATE         NOT NULL,
  valid_until         DATE         NOT NULL,
  usage_limit         INT          NULL,
  per_user_limit      INT          NOT NULL DEFAULT 1,
  used_count          INT          NOT NULL DEFAULT 0,
  service_id          INT          NULL,                  -- wash coupons only: NULL = any service
  applies_to          VARCHAR(5)   NOT NULL DEFAULT 'both',
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coupons_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
  CONSTRAINT chk_coupons_type CHECK (discount_type IN ('percent', 'flat')),
  CONSTRAINT chk_coupons_value CHECK (discount_value > 0 AND (discount_type <> 'percent' OR discount_value <= 90)),
  CONSTRAINT chk_coupons_dates CHECK (valid_until >= valid_from),
  CONSTRAINT chk_coupons_usage CHECK (usage_limit IS NULL OR used_count <= usage_limit),
  CONSTRAINT chk_coupons_used CHECK (used_count >= 0 AND per_user_limit > 0 AND min_order_paise >= 0),
  CONSTRAINT chk_coupons_scope CHECK (applies_to IN ('wash', 'store', 'both'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

CREATE TABLE bookings (
  id                 INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_code       VARCHAR(12)  NOT NULL UNIQUE,
  user_id            INT          NOT NULL,
  service_id         INT          NOT NULL,
  vehicle_id         INT          NULL,
  vehicle_type       VARCHAR(12)  NOT NULL,
  vehicle_brand      VARCHAR(40)  NOT NULL,
  vehicle_model      VARCHAR(40)  NOT NULL,
  vehicle_reg        VARCHAR(12)  NOT NULL,
  booking_date       DATE         NOT NULL,
  time_slot_id       INT          NOT NULL,
  pickup_drop        TINYINT(1)   NOT NULL DEFAULT 0,
  address            VARCHAR(200) NOT NULL,
  instructions       VARCHAR(500) NULL,
  status             VARCHAR(16)  NOT NULL DEFAULT 'pending_payment',
  -- Bill snapshot (prices may change later; the booking keeps what the customer agreed to)
  base_price_paise   INT          NOT NULL,
  addons_paise       INT          NOT NULL DEFAULT 0,
  pickup_fee_paise   INT          NOT NULL DEFAULT 0,
  discount_paise     INT          NOT NULL DEFAULT 0,
  tax_paise          INT          NOT NULL DEFAULT 0,
  total_paise        INT          NOT NULL,
  coupon_id          INT          NULL,
  coupon_code        VARCHAR(20)  NULL,
  reschedule_count   INT          NOT NULL DEFAULT 0,
  cancel_reason      VARCHAR(300) NULL,
  cancelled_by       VARCHAR(10)  NULL,
  cancelled_at       DATETIME     NULL,
  completed_at       DATETIME     NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_slot FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL,
  CONSTRAINT chk_bookings_status CHECK (status IN ('pending_payment', 'confirmed', 'rescheduled', 'in_progress', 'completed', 'cancelled')),
  CONSTRAINT chk_bookings_type CHECK (vehicle_type IN ('hatchback', 'sedan', 'suv', 'luxury', 'bike')),
  CONSTRAINT chk_bookings_cancelled_by CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'admin')),
  CONSTRAINT chk_bookings_money CHECK (base_price_paise > 0 AND addons_paise >= 0 AND pickup_fee_paise >= 0 AND discount_paise >= 0 AND tax_paise >= 0),
  CONSTRAINT chk_bookings_discount CHECK (discount_paise <= base_price_paise + addons_paise + pickup_fee_paise),
  -- The bill must always add up exactly:
  CONSTRAINT chk_bookings_total CHECK (total_paise = base_price_paise + addons_paise + pickup_fee_paise - discount_paise + tax_paise)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_slot ON bookings(booking_date, time_slot_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_service ON bookings(service_id);

CREATE TABLE booking_addons (
  booking_id   INT         NOT NULL,
  addon_id     INT         NOT NULL,
  addon_name   VARCHAR(60) NOT NULL,
  price_paise  INT         NOT NULL,
  PRIMARY KEY (booking_id, addon_id),
  CONSTRAINT fk_ba_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_ba_addon FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE RESTRICT,
  CONSTRAINT chk_ba_price CHECK (price_paise >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE booking_status_history (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id   INT          NOT NULL,
  from_status  VARCHAR(16)  NULL,
  to_status    VARCHAR(16)  NOT NULL,
  note         VARCHAR(300) NULL,
  changed_by   INT          NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bh_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_bh_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_history_booking ON booking_status_history(booking_id);
CREATE INDEX idx_history_created ON booking_status_history(created_at);

CREATE TABLE reviews (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  booking_id    INT          NOT NULL UNIQUE,            -- one review per booking
  user_id       INT          NOT NULL,
  service_id    INT          NOT NULL,
  rating        INT          NOT NULL,
  title         VARCHAR(80)  NOT NULL,
  comment       TEXT         NOT NULL,
  status        VARCHAR(10)  NOT NULL DEFAULT 'pending',
  admin_reply   VARCHAR(500) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at  DATETIME     NULL,
  CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_service FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reviews_status CHECK (status IN ('pending', 'approved', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_reviews_service ON reviews(service_id, status);

CREATE TABLE contact_messages (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80)  NOT NULL,
  email       VARCHAR(120) NOT NULL,
  phone       VARCHAR(10)  NULL,
  subject     VARCHAR(120) NOT NULL,
  message     TEXT         NOT NULL,
  status      VARCHAR(10)  NOT NULL DEFAULT 'new',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_messages_status CHECK (status IN ('new', 'read', 'resolved'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

-- =====================================================================
-- ACCESSORIES STORE (e-commerce)
-- =====================================================================

-- Indian car makes/models for "fits my car" compatibility (names only, no logos).
CREATE TABLE car_models (
  id         INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  make       VARCHAR(30) NOT NULL,
  model      VARCHAR(30) NOT NULL,
  body_type  VARCHAR(10) NOT NULL,
  CONSTRAINT uq_car_models UNIQUE (make, model),
  CONSTRAINT chk_car_models_body CHECK (body_type IN ('hatchback', 'sedan', 'suv', 'muv', 'ev'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

CREATE TABLE product_categories (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug         VARCHAR(60)  NOT NULL UNIQUE,
  name         VARCHAR(40)  NOT NULL UNIQUE,
  description  VARCHAR(200) NOT NULL,
  image        VARCHAR(200) NOT NULL,
  icon         VARCHAR(30)  NOT NULL DEFAULT 'tag',
  sort_order   INT          NOT NULL DEFAULT 0,
  is_active    TINYINT(1)   NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;

CREATE TABLE products (
  id                 INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku                VARCHAR(30)  NOT NULL UNIQUE,
  slug               VARCHAR(120) NOT NULL UNIQUE,
  name               VARCHAR(100) NOT NULL,
  category_id        INT          NOT NULL,
  brand              VARCHAR(40)  NOT NULL,              -- fictional accessory brands only
  description        TEXT         NOT NULL,
  features           TEXT         NOT NULL,              -- JSON array
  specs              TEXT         NOT NULL,              -- JSON object
  images             TEXT         NOT NULL,              -- JSON array of image paths
  price_paise        INT          NOT NULL,              -- selling price, GST inclusive (Indian MRP convention)
  mrp_paise          INT          NOT NULL,
  stock              INT          NOT NULL DEFAULT 0,    -- never negative (CHECK + guarded UPDATE)
  is_universal       TINYINT(1)   NOT NULL DEFAULT 0,
  fitment_available  TINYINT(1)   NOT NULL DEFAULT 0,
  warranty           VARCHAR(60)  NOT NULL DEFAULT 'No warranty',
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  is_featured        TINYINT(1)   NOT NULL DEFAULT 0,
  is_deal            TINYINT(1)   NOT NULL DEFAULT 0,    -- "deal of the day"
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE RESTRICT,
  CONSTRAINT chk_products_json CHECK (JSON_VALID(features) AND JSON_VALID(specs) AND JSON_VALID(images)),
  CONSTRAINT chk_products_price CHECK (price_paise > 0 AND mrp_paise >= price_paise),
  CONSTRAINT chk_products_stock CHECK (stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(is_active, is_featured);

CREATE TABLE product_compatibility (
  product_id    INT NOT NULL,
  car_model_id  INT NOT NULL,
  PRIMARY KEY (product_id, car_model_id),
  CONSTRAINT fk_compat_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_compat_model FOREIGN KEY (car_model_id) REFERENCES car_models(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE INDEX idx_compat_model ON product_compatibility(car_model_id);

-- Stock ledger: products.stock always equals SUM(qty_change) of its movements.
CREATE TABLE stock_movements (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id  INT          NOT NULL,
  qty_change  INT          NOT NULL,
  reason      VARCHAR(12)  NOT NULL,
  reference   VARCHAR(120) NULL,
  created_by  INT          NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_movements_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_movements_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_movements_change CHECK (qty_change <> 0),
  CONSTRAINT chk_movements_reason CHECK (reason IN ('opening', 'order', 'cancel', 'return', 'adjustment'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);

CREATE TABLE wishlist_items (
  user_id     INT      NOT NULL,
  product_id  INT      NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A logged-in customer's cart lives in the database (guests use localStorage).
CREATE TABLE cart_items (
  user_id     INT      NOT NULL,
  product_id  INT      NOT NULL,
  quantity    INT      NOT NULL,
  added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, product_id),
  CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT chk_cart_qty CHECK (quantity BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE orders (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_code          VARCHAR(12)  NOT NULL UNIQUE,
  user_id             INT          NOT NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending_payment',
  payment_method      VARCHAR(12)  NOT NULL,             -- method chosen at checkout
  -- Shipping address snapshot
  ship_name           VARCHAR(80)  NOT NULL,
  ship_phone          VARCHAR(10)  NOT NULL,
  ship_line1          VARCHAR(120) NOT NULL,
  ship_line2          VARCHAR(120) NULL,
  ship_city           VARCHAR(60)  NOT NULL,
  ship_state          VARCHAR(40)  NOT NULL,
  ship_pincode        VARCHAR(6)   NOT NULL,
  -- Money (paise). Product prices include GST; gst_included_paise is shown on the invoice.
  subtotal_paise      INT          NOT NULL,
  discount_paise      INT          NOT NULL DEFAULT 0,
  shipping_paise      INT          NOT NULL DEFAULT 0,
  fitment_paise       INT          NOT NULL DEFAULT 0,
  total_paise         INT          NOT NULL,
  gst_included_paise  INT          NOT NULL DEFAULT 0,
  coupon_id           INT          NULL,
  coupon_code         VARCHAR(20)  NULL,
  -- Optional "fitment at CarZone centre": uses a seat in the same time-slot inventory.
  fitment_date        DATE         NULL,
  fitment_slot_id     INT          NULL,
  cancel_reason       VARCHAR(300) NULL,
  return_reason       VARCHAR(300) NULL,
  delivered_at        DATETIME     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_slot FOREIGN KEY (fitment_slot_id) REFERENCES time_slots(id) ON DELETE RESTRICT,
  CONSTRAINT chk_orders_status CHECK (status IN ('pending_payment', 'placed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'return_requested', 'returned')),
  CONSTRAINT chk_orders_method CHECK (payment_method IN ('card', 'upi', 'netbanking', 'wallet', 'cod')),
  CONSTRAINT chk_orders_money CHECK (subtotal_paise > 0 AND discount_paise >= 0 AND shipping_paise >= 0 AND fitment_paise >= 0 AND gst_included_paise >= 0),
  CONSTRAINT chk_orders_discount CHECK (discount_paise <= subtotal_paise),
  CONSTRAINT chk_orders_total CHECK (total_paise = subtotal_paise - discount_paise + shipping_paise + fitment_paise),
  CONSTRAINT chk_orders_fitment CHECK ((fitment_date IS NULL) = (fitment_slot_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_fitment ON orders(fitment_date, fitment_slot_id);

CREATE TABLE order_items (
  id                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id          INT          NOT NULL,
  product_id        INT          NOT NULL,
  product_name      VARCHAR(100) NOT NULL,              -- snapshot at purchase time
  sku               VARCHAR(30)  NOT NULL,
  unit_price_paise  INT          NOT NULL,
  mrp_paise         INT          NOT NULL,
  quantity          INT          NOT NULL,
  line_total_paise  INT          NOT NULL,
  CONSTRAINT uq_order_product UNIQUE (order_id, product_id),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT chk_items_qty CHECK (quantity BETWEEN 1 AND 10 AND unit_price_paise > 0),
  CONSTRAINT chk_items_total CHECK (line_total_paise = unit_price_paise * quantity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE order_status_history (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id     INT          NOT NULL,
  from_status  VARCHAR(20)  NULL,
  to_status    VARCHAR(20)  NOT NULL,
  note         VARCHAR(300) NULL,
  changed_by   INT          NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oh_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_oh_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_order_history_order ON order_status_history(order_id);
CREATE INDEX idx_order_history_created ON order_status_history(created_at);

-- Product reviews: only verified buyers (a delivered order containing the product).
CREATE TABLE product_reviews (
  id            INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id    INT         NOT NULL,
  user_id       INT         NOT NULL,
  order_id      INT         NOT NULL,
  rating        INT         NOT NULL,
  title         VARCHAR(80) NOT NULL,
  comment       TEXT        NOT NULL,
  status        VARCHAR(10) NOT NULL DEFAULT 'pending',
  created_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at  DATETIME    NULL,
  CONSTRAINT uq_product_review UNIQUE (product_id, user_id),
  CONSTRAINT fk_pr_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT chk_pr_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_pr_status CHECK (status IN ('pending', 'approved', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_product_reviews_product ON product_reviews(product_id, status);

-- One row per coupon use (a wash booking OR a store order); enforces per-user limits.
CREATE TABLE coupon_redemptions (
  id              INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  coupon_id       INT      NOT NULL,
  user_id         INT      NOT NULL,
  booking_id      INT      NULL UNIQUE,
  order_id        INT      NULL UNIQUE,
  discount_paise  INT      NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cr_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cr_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT chk_cr_target CHECK ((booking_id IS NULL AND order_id IS NOT NULL) OR (booking_id IS NOT NULL AND order_id IS NULL)),
  CONSTRAINT chk_cr_discount CHECK (discount_paise >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_redemptions_coupon_user ON coupon_redemptions(coupon_id, user_id);

-- =====================================================================
-- PAYMENTS (shared by wash bookings and store orders)
-- Lifecycle: created -> pending -> success | failed | cancelled
--            success -> refund_pending -> refunded
-- =====================================================================
CREATE TABLE payments (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_ref         VARCHAR(20)  NOT NULL UNIQUE,      -- our reference, e.g. PAY-7K2M9Q4T
  purpose             VARCHAR(8)   NOT NULL,
  booking_id          INT          NULL,
  order_id            INT          NULL,
  user_id             INT          NOT NULL,
  gateway             VARCHAR(10)  NOT NULL,
  gateway_order_id    VARCHAR(60)  NULL UNIQUE,
  gateway_payment_id  VARCHAR(60)  NULL UNIQUE,
  amount_paise        INT          NOT NULL,             -- ALWAYS copied from the booking/order on the server
  currency            CHAR(3)      NOT NULL DEFAULT 'INR',
  method              VARCHAR(12)  NULL,
  method_detail       VARCHAR(60)  NULL,                 -- masked only ("Visa **** 1111"); never full card/CVV
  status              VARCHAR(16)  NOT NULL DEFAULT 'created',
  failure_reason      VARCHAR(200) NULL,
  attempts            INT          NOT NULL DEFAULT 0,
  idempotency_key     VARCHAR(80)  NULL UNIQUE,          -- same key = same payment (double-click safe)
  otp_hash            VARCHAR(64)  NULL,                 -- simulated 3-D Secure OTP (hashed)
  pending_until       DATETIME     NULL,                 -- simulated UPI approval time
  expires_at          DATETIME     NOT NULL,
  verified_at         DATETIME     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT chk_payments_target CHECK ((purpose = 'booking' AND booking_id IS NOT NULL AND order_id IS NULL)
                                     OR (purpose = 'order' AND order_id IS NOT NULL AND booking_id IS NULL)),
  CONSTRAINT chk_payments_gateway CHECK (gateway IN ('simulated', 'razorpay', 'cod')),
  CONSTRAINT chk_payments_amount CHECK (amount_paise > 0),
  CONSTRAINT chk_payments_currency CHECK (currency = 'INR'),
  CONSTRAINT chk_payments_method CHECK (method IS NULL OR method IN ('card', 'upi', 'netbanking', 'wallet', 'cod')),
  CONSTRAINT chk_payments_status CHECK (status IN ('created', 'pending', 'success', 'failed', 'cancelled', 'refund_pending', 'refunded')),
  CONSTRAINT chk_payments_attempts CHECK (attempts >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created ON payments(created_at);

-- A refund always belongs to one successful payment (one refund per payment).
CREATE TABLE refunds (
  id                 INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_id         INT          NOT NULL UNIQUE,
  amount_paise       INT          NOT NULL,
  refund_percent     INT          NOT NULL,
  status             VARCHAR(10)  NOT NULL DEFAULT 'pending',
  reason             VARCHAR(200) NOT NULL,
  manual             TINYINT(1)   NOT NULL DEFAULT 0,      -- e.g. COD cash returned by hand
  gateway_refund_id  VARCHAR(60)  NULL,
  refund_ref         VARCHAR(20)  NULL UNIQUE,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at       DATETIME     NULL,
  processed_by       INT          NULL,
  CONSTRAINT fk_refunds_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_admin FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_refunds_amount CHECK (amount_paise > 0 AND refund_percent BETWEEN 1 AND 100),
  CONSTRAINT chk_refunds_status CHECK (status IN ('pending', 'processed')),
  CONSTRAINT chk_refunds_processed CHECK (status = 'pending' OR processed_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE=1 */;
CREATE INDEX idx_refunds_status ON refunds(status);
