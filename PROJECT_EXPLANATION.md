# CarZone – Project Explanation

This document explains **how the whole project works**, in the order you would explain it
in a viva: the big picture, the request flow, the main modules, the database, and the most
important flows (booking, shopping, payment) with the exact files involved.

---

## 1. What the system does

CarZone combines two businesses on one platform:

1. **Car wash & detailing** — 9 services (basic wash … ceramic coating, bike wash) with
   per-vehicle prices, add-ons, live time slots (capacity = wash bays), doorstep pickup,
   coupons, 18 % GST bill, online payment, cancel with refund policy, reschedule,
   invoice, reviews.
2. **Accessories store** — 9 categories, 72 products (fictional brands), compatibility with
   35 Indian car models, wishlist, cart (guest cart merged on login), checkout with
   addresses, coupons, free-shipping threshold, GST-inclusive prices, card / UPI / net banking /
   wallet / **COD**, order tracking, cancel before shipping, returns after delivery,
   verified-buyer reviews and optional **fitment at the CarZone centre** (books a wash bay slot).

Three roles: **guest** (browse, guest cart), **customer**, **admin**.

---

## 2. Architecture in one picture

```
 Browser (React SPA)                         Node.js + Express server                MySQL 8
 ───────────────────                         ────────────────────────                ───────
 pages/  ──uses──> components/               server.js -> bootstrap.js (app.listen)
 context/ (Auth, Cart)                       app.js  Express middleware pipeline:
 hooks/useApi ──fetch JSON──> /api/* ──────>   securityHeaders -> requestLogger -> cookies
                                               -> authenticate (session cookie -> req.user)
                                               -> express.json() (inside the /api router)
                                               -> express.Router()s (public|auth|customer|admin)
                                               -> controllers/* (HTTP only)
                                               -> services/*   (business rules) ──mysql2──> carzone_db
                                               -> errorHandler(err,req,res,next) JSON  (32 tables)
 GET /shop, /admin ... ────────────────────>  express.static(client/dist) + SPA fallback (index.html)
```

* **Controllers** never contain SQL; **services** never touch `req`/`res`. This separation
  keeps business rules testable.
* `shared/validation.js` is imported by **both** sides, so the React form and the API reject
  exactly the same input with the same message.

---

## 3. Request lifecycle (example: `POST /api/orders`)

1. `app.js` (Express): `securityHeaders` → `requestLogger` → `cookieParser` (fills `req.cookies`)
   → `responseHelpers` (adds `res.ok`).
2. `middleware/auth.js › authenticate` (wrapped in `asyncHandler`) reads the `as_session` cookie,
   checks its HMAC signature, loads the session row and the user → `req.user`.
3. `app.use('/api', apiRouter)`: the API router sets `Cache-Control: no-store`, rejects non-JSON
   writes (415) and runs **`express.json({ limit: '100kb' })`** → `req.body`.
   (Only the Razorpay webhook uses `express.raw()` instead, to keep the exact bytes for its
   HMAC signature.)
4. `routes/customer.routes.js` (an `express.Router()`): `customerOnly` → `validateBody(schemas.checkout)`
   → `asyncHandler(store.placeOrder)`.
5. `controllers/store.controller.js › placeOrder` calls `services/order.service.js › placeOrder`.
6. The service runs **one MySQL transaction** (see §7.2) and returns the order.
7. The controller sends `{ ok: true, data: {...} }` with `res.ok(...)` (= `res.status(201).json(...)`).
   If anything throws, `asyncHandler` passes the error to `next(err)`, Express skips all normal
   middleware and runs the 4-argument **error middleware** `errorHandler.js`, which answers
   `{ ok: false, error: { message, fields } }` (e.g. MySQL `ER_DUP_ENTRY` → 409, bad JSON → 400).

---

## 4. Back-end modules (src/)

| File | Responsibility |
|---|---|
| `app.js` | Creates the Express app (`express()`), app settings, middleware order, error middleware last |
| `bootstrap.js` | Checks the MySQL pool/tables, loads the session secret, then `app.listen()` |
| `routes/index.js` | The `/api` router: no-store, webhook (`express.raw`), `express.json`, feature routers, JSON 404 |
| `routes/*.routes.js` | One `express.Router()` per feature (auth, public, customer, admin) |
| `middleware/asyncHandler.js` | Forwards rejected Promises from async handlers to `next(err)` |
| `middleware/auth.js` | `authenticate`, `requireAuth`, `requireRole(...roles)`, `adminPageGuard` |
| `middleware/errorHandler.js` | Central `(err, req, res, next)` handler + API `notFound` |
| `middleware/staticFiles.js` | `express.static(client/dist)` with cache headers + SPA fallback |
| `db/connection.js` | `mysql2` pool; `one/all/run` helpers with `?` placeholders; `transaction(fn)` using `AsyncLocalStorage` so nested service calls share the same connection |
| `db/init.js` | Startup check with friendly hints for common MySQL errors |
| `services/auth.service.js` | register, login (lockout after 5 failures), sessions, password reset tokens (hashed) |
| `services/password.service.js` | scrypt hashing with per-user salt + `timingSafeEqual` |
| `services/pricing.service.js` | `calculateBill` (wash, GST added) and `calculateOrderTotals` (store, GST-inclusive) — all integer paise |
| `services/coupon.service.js` | One coupon engine: scope `wash` / `store` / `both`, validity, usage limits, per-user limits, min order, max discount |
| `services/slot.service.js` | Slot inventory; atomic `UPDATE … SET booked = booked + 1 WHERE booked < capacity` |
| `services/booking.service.js` | Quote, create, cancel with refund policy, reschedule, admin status workflow |
| `services/product.service.js` | Catalogue filters, compatibility, stock take/restore with ledger, product reviews |
| `services/cart.service.js` | DB cart per user, guest-cart merge, wishlist |
| `services/order.service.js` | Quote, place order, cancel, return, admin transitions |
| `services/payments/*` | Gateway interface, simulator, Razorpay, payment lifecycle, refunds, webhook |
| `services/analytics.service.js` | Dashboard numbers (wash vs store revenue, top lists, activity feed) |
| `services/report.service.js` | 9 reports in one shape `{ title, columns, rows, summary }` → JSON / CSV / printable HTML |
| `services/document.service.js` | GST invoices (booking and order) and printable reports |

## 5. Front-end modules (client/src/)

| Folder | What it contains |
|---|---|
| `router/index.jsx` | `BrowserRouter` (listens to `popstate`, `navigate()` uses `history.pushState`), `Routes/Route` with `:params` and `/*`, `Link`, `NavLink`, `Navigate`, hooks |
| `context/AuthContext.jsx` | Current user, `login/register/logout`, loaded once from `/api/auth/me` |
| `context/CartContext.jsx` | Cart for guests (localStorage) and customers (API); merges on login |
| `components/ProtectedRoute.jsx` | Redirects guests to `/login?next=…`; wrong role → home of their role |
| `hooks/useApi.js` | `useEffect` data fetching with loading / error / reload and cancellation |
| `hooks/useForm.js` | Form state + shared validation + server field errors |
| `components/PaymentCheckout.jsx` | Gateway-style checkout UI (card + OTP, UPI polling, bank page, wallet, Razorpay) |
| `pages/admin/*` | Admin panel split by area: Overview, WashSections, StoreSections, FinanceSections, PeopleSections |

---

## 6. Database (summary — full detail in docs/DATABASE.md)

32 InnoDB tables, utf8mb4. Core groups:

* **Users & auth**: `users`, `sessions`, `password_resets`, `app_settings`
* **Wash**: `services`, `service_prices`, `addons`, `service_addons`, `time_slots`, `slot_inventory`, `vehicles`, `bookings`, `booking_addons`, `booking_status_history`, `reviews`
* **Store**: `product_categories`, `products`, `car_models`, `product_compatibility`, `stock_movements`, `cart_items`, `wishlist_items`, `addresses`, `orders`, `order_items`, `order_status_history`, `product_reviews`
* **Shared**: `coupons`, `coupon_redemptions`, `payments`, `refunds`, `contact_messages`

Money is stored as **integer paise** (`INT`), never floating point.

---

## 7. Key flows

### 7.1 Wash booking
`pages/Book.jsx` (5 steps) → every change calls `POST /api/bookings/quote` (server computes the
bill) → `POST /api/bookings` → `booking.service.createBooking`, in a transaction:
validate service/vehicle/add-ons → `reserveSlot()` (atomic conditional update; 409 if full) →
compute bill → redeem coupon → insert booking + add-ons + history (`pending_payment`) → the
browser goes to `/pay/booking/:id`.

### 7.2 Store checkout and the stock guard
`POST /api/orders` → `order.service.placeOrder` in **one transaction**:
1. `SELECT id FROM products WHERE id = ? FOR UPDATE` for each cart line — locks the rows, always in product-id order to avoid deadlocks.
2. For every item: `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`.
   If `affectedRows = 0` the item sold out → throw → **ROLLBACK** (nothing is half-saved).
3. Insert `stock_movements` (reason `order`), the order, items, history; redeem coupon;
   optional fitment slot reservation; clear the cart.
4. COD → status `placed`; online → `pending_payment` until payment is verified.

Cancel (before shipping) and approved returns call `restoreStock()` and create a refund.

### 7.3 Payment (gateway pattern)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (PaymentCheckout.jsx)
    participant S as CarZone API (payment.service.js)
    participant G as Gateway (Simulator or Razorpay)
    participant DB as MySQL
    B->>S: POST /api/payments {purpose, targetId, idempotencyKey}
    S->>DB: amount = booking/order total (server decides, client amount rejected)
    S->>G: createOrder(amount paise, INR)
    G-->>S: gateway order id
    S->>DB: INSERT payments (status CREATED, idempotency_key UNIQUE)
    S-->>B: payment session (ref, expiry, Razorpay key/order if enabled)
    alt Simulator
        B->>S: POST /payments/:id/simulate {method, card/upi/bank}
        S-->>B: nextAction = otp | poll | bank | done | failed (status PENDING)
        B->>S: POST /payments/:id/verify {otp | bankDecision}  (UPI: GET /status polling)
    else Razorpay
        B->>G: Razorpay Checkout (checkout.js)
        G-->>B: razorpay_order_id, razorpay_payment_id, razorpay_signature
        B->>S: POST /payments/:id/verify {ids, signature}
        S->>S: HMAC_SHA256(order_id|payment_id, secret) + timingSafeEqual
    end
    S->>DB: BEGIN; SELECT payment FOR UPDATE; status SUCCESS; booking -> confirmed / order -> placed; COMMIT
    S-->>B: payment SUCCESS (repeat calls return the same result = idempotent)
    G--)S: (optional) webhook payment.captured, X-Razorpay-Signature over raw body
```

Statuses: `created → pending → success | failed | cancelled`, then `refund_pending → refunded`.
A second successful payment for an already-paid target is refunded automatically.
**Card numbers and CVV are never stored** — only a masked detail like `Visa **** 1111`.

### 7.4 Refunds
Cancelling a paid booking applies the policy (100 % ≥ 24 h before the slot, else 50 %); cancelling
a paid order or approving a return refunds 100 %. A `refunds` row is created with status
`pending` and the payment becomes `refund_pending`. The admin clicks **Process** →
Razorpay refund API (when Razorpay) or simulated → `processed`, payment `refunded`.
COD refunds are flagged **manual** (cash / bank transfer).

### 7.5 Authentication & roles
Passwords: scrypt + random salt. Login creates a random session token; only its SHA-256 hash
is stored. The cookie value is `token.HMAC(token)` — `HttpOnly`, `SameSite=Strict`.
Roles are enforced three times: React `ProtectedRoute`, server `adminPageGuard` for `/admin`
pages and `requireRole('admin')` on every `/api/admin` route.

---

## 8. Security checklist
Prepared statements (no SQL injection) · output escaping in invoices · CSP and security headers ·
rate limiting on auth and contact · account lockout · hashed reset tokens · server-side
price/amount calculation · HMAC payment verification · idempotency keys · no card data stored ·
role checks on every admin endpoint · in production: Secure cookies, trust proxy (real client
IP for rate limiting), HSTS on HTTPS, TLS to the database, `SESSION_SECRET` required at start-up
(see docs/DEPLOYMENT.md).

## 9. Testing
61 automated tests (`npm test`) — see README §10. Front end verified with a Playwright
walkthrough (guest, customer purchase + booking + payments + cancellations, every admin
section, mobile and tablet), zero console errors and zero failed requests after the move to Express.
