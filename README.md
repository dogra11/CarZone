# CarZone – Car Wash, Detailing & Accessories

A full-stack web platform for a premium car-care business in Pune: customers **book car
washes / detailing** (live slots, add-ons, pickup & drop, coupons, GST billing, online
payment, cancel / reschedule / refund, invoices, reviews) **and shop car accessories**
(72 products, filter by car make & model, wishlist, cart, checkout, COD or online payment,
order tracking, returns, optional fitment at the CarZone centre). Admins run everything
from one panel: bookings, slots, services, products & stock, orders, coupons, payments,
refunds, reviews, users, messages, analytics and reports.

Final-year project — **React 19** front end, **Node.js + Express** REST API, **MySQL 8** database
(also runs on **TiDB Cloud**, MySQL-compatible). Deployable for free as a public demo on
**Render** — see [section 12](#12-live-demo--deployment) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## 1. Tech stack and key decisions

| Layer | Choice | Why |
|---|---|---|
| Front end | React 19 (function components + hooks, Context API) | Component reuse, declarative UI |
| Routing | Own ~120-line router (`client/src/router/`) | Shows how client-side routing works (History API); no extra dependency |
| Build | Vite (development) / esbuild (offline production build in `client/dist`) | Fast; the shipped `dist` means no build step is needed to run the project |
| Back end | Node.js (ES modules) + **Express 4** (`express.Router()` per feature, middleware pipeline, central error middleware) | The industry-standard Node web framework; small, explicit and easy to explain |
| Database | MySQL 8 via `mysql2/promise` (connection pool, prepared statements, transactions, `SELECT … FOR UPDATE`) | Industry-standard relational DB |
| Auth | scrypt password hashing + server-side sessions in MySQL + HMAC-signed HttpOnly cookie | Secure, no JWT pitfalls |
| Payments | Gateway abstraction: built-in **simulator** (default) or **Razorpay test mode** | Realistic payment flow with server-side verification |
| Validation | One shared rule set in `/shared` used by **both** React and Node | Same messages on client and server |
| Images | Original artwork generated with Python/Pillow | No copyright issues, works offline |

The server has exactly two runtime dependencies: **`express`** and **`mysql2`**. Cookies, security
headers, rate limiting and request logging are small hand-written Express middleware (no
cookie-parser / helmet / morgan needed).

---

## 2. Folder structure

```
CarZone/
├── server.js                 Entry point (npm start)
├── package.json              Server scripts; dependencies: express + mysql2
├── .env.example              Copy to .env and set DB_PASSWORD
├── .env.production.example   The variables for Render + TiDB Cloud (reference only)
├── render.yaml               Render Blueprint: free web service, health check, env vars
├── shared/                   Validation rules + constants used by BOTH client and server
├── src/                      Node.js back end
│   ├── app.js                Builds the Express app: the middleware pipeline (order matters)
│   ├── bootstrap.js          DB check -> session secret -> app.listen()
│   ├── config/               .env loader + typed config (business rules), database.js (DB_* /
│   │                         DATABASE_URL / TLS settings)
│   ├── db/                   mysql2 pool, transactions, init check, db:setup script, error hints
│   ├── middleware/           Express middleware: auth/roles, express.json/raw, cookies, security
│   │                         headers, rate limit, validation, express.static + SPA fallback,
│   │                         asyncHandler, error handler
│   ├── routes/               express.Router() per feature: public / auth / customer / admin
│   ├── controllers/          Thin HTTP layer (admin/ sub-folder for the admin panel)
│   ├── services/             Business logic (bookings, orders, pricing, stock, payments/...)
│   └── utils/                Money, dates, ids, CSV, HTML escaping, logger
├── client/                   React front end
│   ├── package.json          react, react-dom, vite, @vitejs/plugin-react
│   ├── vite.config.js        Dev server :5173, proxies /api to :3000
│   ├── index.html
│   ├── build/esbuild.mjs     Offline production build -> client/dist
│   ├── public/assets/        Images, fonts, SVG icon sprite, print helper
│   ├── dist/                 PREBUILT production bundle served by Node
│   └── src/
│       ├── main.jsx, App.jsx Providers + route table
│       ├── router/           Tiny router: Routes, Route, Link, NavLink, useNavigate, useParams...
│       ├── context/          AuthContext, CartContext
│       ├── hooks/            useApi, useForm, useMeta, useReveal, useCopy, useDocumentTitle
│       ├── services/api.js   fetch wrapper
│       ├── components/       Navbar, Footer, ServiceCard, ProductCard, Modal, Toast, Loader,
│       │                     EmptyState, StatusBadge, ProtectedRoute, FormField, FormModal,
│       │                     DataTable, StatCard, Chart (SVG), PaymentCheckout, AppShell ...
│       ├── pages/            Home, Services, Shop, ProductDetail, Cart, Checkout, Book, Pay,
│       │                     Confirmation, BookingDetails, OrderDetails, auth/, dashboard/, admin/
│       ├── utils/            format.js, shared.js (re-exports /shared)
│       └── styles/           base, components, pages, dashboard, store CSS
├── database/
│   ├── carzone_db.sql        ONE file for MySQL Workbench (schema + demo data)
│   ├── schema.sql            Tables only
│   └── seed.sql              Demo data only
├── scripts/                  build-seed.js (generates seed.sql), image + icon generators, catalogue JSON
├── tests/                    node:test suites (61 tests)
│   └── support/              TEST-ONLY shims (never used by the app): mysql2 -> SQLite,
│                             express-shim/ (Express 4 subset for offline testing)
└── docs/                     SYNOPSIS, ARCHITECTURE, DATABASE, API, INTERVIEW_GUIDE, DEPLOYMENT
```

---

## 3. Prerequisites

* **Node.js 18.18+** (22 LTS recommended) — https://nodejs.org
* **MySQL Server 8.0+** and **MySQL Workbench** — https://dev.mysql.com/downloads/installer/
* Internet only for `npm install` (one-time; downloads **express** and **mysql2**). The app itself runs offline.

---

## 4. Setup on Windows with VS Code (step by step)

1. **Install MySQL 8** with the MySQL Installer ("Developer Default" or Server + Workbench).
   Remember the **root password** you choose. Keep the default port **3306**.
2. **Install Node.js 22 LTS** (tick "Add to PATH"). Check: `node -v` in a new terminal.
3. **Create the database**: open MySQL Workbench → connect to *Local instance* →
   *File › Open SQL Script…* → choose `database/carzone_db.sql` → click the ⚡ (Execute) button.
   This creates `carzone_db` with all 32 tables and the demo data.
   *(Alternative after step 5: `npm run db:setup` runs the same file from Node.)*
4. Open the `CarZone` folder in **VS Code** (*File › Open Folder*) and open a terminal (Ctrl + `).
5. Create your config file:
   ```
   copy .env.example .env
   ```
   Open `.env` and set `DB_PASSWORD=` to your MySQL root password.
6. Install the server dependencies (express + mysql2):
   ```
   npm install
   ```
7. Start the app:
   ```
   npm start
   ```
8. Open **http://localhost:3000** (admin panel: http://localhost:3000/admin).

macOS / Linux: same steps, use `cp .env.example .env`.

---

## 5. Running modes

**(a) Normal / demo (recommended)** — `npm start`. Node serves the API **and** the prebuilt
React bundle in `client/dist`. No front-end build needed. `npm run dev` restarts on changes.

**(b) React development with hot reload**
```
npm start                      # terminal 1: API on :3000
cd client
npm install                    # first time only (needs internet)
npm run dev                    # terminal 2: Vite on http://localhost:5173 (proxies /api to :3000)
```
To produce a new production bundle: `cd client && npm run build` (Vite) — or, offline,
`npm run build:client` from the project root (esbuild). Both write `client/dist`.

**Tests** (Node 22.5+): `npm test` — 61 tests (see section 10).

---

## 6. Configuration (`.env`)

| Key | Default | Meaning |
|---|---|---|
| `PORT`, `HOST` | 3000, localhost | Web server (`HOST` defaults to `0.0.0.0` when `NODE_ENV=production`) |
| `NODE_ENV` | development | `production` = Secure cookies, trust proxy, `0.0.0.0`, `SESSION_SECRET` required |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | localhost, 3306, root, *(empty)*, carzone_db | MySQL connection (TiDB Cloud: port 4000) |
| `DB_SSL`, `DB_SSL_CA` | false, *(empty)* | TLS to the database (`true` for TiDB Cloud); optional CA file path |
| `DATABASE_URL` | *(empty)* | Alternative to the `DB_*` keys: `mysql://user:pass@host:4000/carzone_db?ssl=true` |
| `SESSION_SECRET` | *(auto)* | Cookie signing key; generated and stored in `app_settings` if empty. **Required (32+ chars) in production** |
| `COOKIE_SECURE`, `TRUST_PROXY` | false (true in production) | HTTPS-only cookie; trust the proxy's `X-Forwarded-*` headers |
| `PUBLIC_URL` | *(empty)* | Public address for log messages (Render sets `RENDER_EXTERNAL_URL` itself) |
| `DEMO_MODE` | true | Shows the password-reset link on screen (no email server) — keep `true` for the public demo too |
| `GST_PERCENT`, `PICKUP_FEE_RUPEES` | 18, 199 | Wash billing |
| `FREE_CANCEL_HOURS`, `LATE_CANCEL_REFUND_PERCENT` | 24, 50 | Wash refund policy |
| `MAX_RESCHEDULES`, `BOOKING_WINDOW_DAYS` | 2, 30 | Booking rules |
| `FREE_SHIPPING_ABOVE_RUPEES`, `SHIPPING_FEE_RUPEES` | 999, 79 | Store shipping |
| `FITMENT_FEE_RUPEES`, `RETURN_WINDOW_DAYS`, `LOW_STOCK_THRESHOLD` | 299, 7, 5 | Store rules |
| `PAYMENT_EXPIRY_MINUTES` | 15 | Unpaid payment sessions expire |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | *(empty)* | Set to use Razorpay test mode instead of the simulator |

---

## 7. Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | **admin@carzone.in** | **Admin@123** |
| Customer | **rohan@example.com** | **Customer@123** |
| Customers | priya, arjun, sneha, karan, ananya, imran `@example.com` | Customer@123 |

The login page has one-click "Demo customer / Demo admin" buttons.

---

## 8. Demo walkthrough (for the viva)

1. **Landing page** → *Book a wash* and *Shop accessories*.
2. **Shop** → *Select your car* (e.g. Hyundai › Creta) → only compatible + universal items show.
   Open a product → gallery, specs, compatibility, reviews → *Add to cart* (works as a guest;
   the cart is merged into your account when you log in).
3. **Checkout** (as rohan) → address, optional **fitment** slot, coupon `GEAR10`, payment method.
4. **Payment simulator** — test values (also shown on the payment screen):

   | Method | Success | Failure |
   |---|---|---|
   | Card | `4111 1111 1111 1111`, any future expiry, any CVV, OTP **123456** | wrong OTP, or card `4000 0000 0000 0002` |
   | UPI | `success@upi` (pending → auto-approved in a few seconds) or *Scan QR* | `failure@upi` |
   | Net banking | pick a bank → *Approve* on the simulated bank page | *Decline* |
   | Wallet | instant success | — |
   | COD | store orders only; settled when the admin marks *Delivered* | — |

5. **Order tracking** → timeline Placed → Packed → Shipped → Out for delivery → Delivered;
   cancel before shipping (stock restored, refund created) or return within 7 days of delivery.
6. **Book a wash** → vehicle → service + add-ons → date & live slot → pickup → review →
   pay → confirmation with booking ID and GST invoice. Cancel / reschedule from the dashboard.
7. **Admin** (admin@carzone.in) → Overview (wash vs store revenue), Orders (*Mark packed* …),
   Products & stock (adjust stock, movement ledger), Payments (filters, transaction detail),
   Refunds (*Process*), Reports (9 types, CSV + printable PDF).

---

## 9. Razorpay test mode (optional)

1. Sign up at https://dashboard.razorpay.com → switch to **Test mode** →
   *Account & Settings › API Keys* → *Generate test key*.
2. Put the values in `.env`: `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET=...`.
   (Optional webhook: *Settings › Webhooks* → URL `https://<public-url>/api/payments/webhook/razorpay`,
   event `payment.captured` / `payment.failed`, and copy the secret to `RAZORPAY_WEBHOOK_SECRET`.)
3. Restart `npm start`. The payment page now opens **Razorpay Checkout**. Use Razorpay's test
   card `4111 1111 1111 1111` (any future expiry / CVV / OTP) or UPI `success@razorpay` /
   `failure@razorpay`.
4. The server creates the Razorpay order (`POST /v1/orders`), verifies
   `HMAC_SHA256(order_id|payment_id, key_secret)` with a timing-safe compare, and issues refunds
   with `POST /v1/payments/:id/refund` when an admin processes a refund.

No Razorpay npm package is used — just `fetch` + Node `crypto`.

---

## 10. Tests

`npm test` runs 61 tests with the built-in `node:test` runner: unit tests (billing, GST,
coupons, Luhn, Razorpay signatures with known vectors, rate limiter, CSV), auth (register,
lockout, reset, role guard), car wash (booking → card OTP → confirmed, idempotent verify,
amount tampering rejected, UPI polling, expiry, cancel → refund, reschedule, full slot 409),
store (cart/wishlist/merge, checkout, **stock oversell guard**, COD flow, cancel/return with
stock restore, verified-buyer reviews), admin (analytics, all 9 reports, CRUD, workflows) and
deployment (`DATABASE_URL` parsing incl. special characters, TLS options, `SESSION_SECRET`
rule, Secure cookies + trust proxy in production, `/api/health` up/down, `db:setup`).

Tests do not need a MySQL server: `tests/support/mysql2-sqlite-shim.js` is injected **only
for tests** (via `--import ./tests/support/register-shim.js`) and maps the `mysql2/promise`
API onto Node's built-in SQLite, converting the MySQL schema on the fly. The application
itself always uses the real `mysql2` driver. (`npm run start:test-db` runs the app on the
shim for a quick look without MySQL.)

The same hook can also map `express` to `tests/support/express-shim/` — a **test-only**
implementation of the small subset of the Express 4 API this project uses. It exists only
so the suite could run on a machine with no internet access; it follows real Express
semantics (route order, `:params`, mount prefixes, 4-argument error middleware) and is
stricter where possible. On your PC, `npm install` + `npm start` always use the real
Express package. (The shims are never imported by `src/`.)

---

## 11. Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `ER_ACCESS_DENIED_ERROR` | Wrong MySQL user/password | Set `DB_USER` / `DB_PASSWORD` in `.env` |
| `ECONNREFUSED 127.0.0.1:3306` | MySQL service not running / other port | Start "MySQL80" in *Services* (Win+R → `services.msc`) or fix `DB_PORT` |
| `ER_BAD_DB_ERROR: Unknown database 'carzone_db'` | SQL script not run | Run `database/carzone_db.sql` in Workbench or `npm run db:setup` |
| `ER_NO_SUCH_TABLE` | Database created but empty | Re-run `carzone_db.sql` |
| `ER_NOT_SUPPORTED_AUTH_MODE` / caching_sha2 errors | Very old client/driver settings | Use mysql2 3.x (installed by `npm install`); or `ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY 'yourpass';` |
| `EADDRINUSE :3000` | Port already in use | Close the other app or set `PORT=3001` in `.env` |
| `Cannot find package 'express'` or `'mysql2'` | Dependencies not installed | Run `npm install` in the project folder (it installs express + mysql2) |
| `npm install` fails / `ETIMEDOUT` | No internet or proxy blocks npm | Connect to the internet once (or `npm config set proxy ...`), then `npm install` again |
| API returns HTML instead of JSON | Calling a wrong URL | Every unknown `/api/...` URL returns JSON `404 Route not found`; check the method and path in `docs/API.md` |
| `415 Requests must be sent as JSON` | POST/PUT sent as a form | Send `Content-Type: application/json` with a JSON body |
| Request hangs forever in your own new route | An `async` handler without `asyncHandler()` | Wrap it: `router.get('/x', asyncHandler(fn))` (Express 4 does not catch rejected Promises) |
| Blank page / "Front-end build missing" | `client/dist` deleted | `npm run build:client` |
| Map not showing | Offline | A fallback map image is shown automatically |
| Problems on Render / TiDB Cloud | — | See [docs/DEPLOYMENT.md › H. Troubleshooting](docs/DEPLOYMENT.md#h-troubleshooting) |

---

## 12. Live demo / Deployment

The project can run publicly for free: **Render** (Node web service) + **TiDB Cloud Starter**
(serverless, MySQL-compatible database). The click-by-click guide for Windows is in
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** (GitHub Desktop → TiDB → load the database →
Render Blueprint → test → share with recruiters).

* `render.yaml` describes the service: `npm install`, `npm start`, health check `/api/health`.
* `client/dist` is committed, so Render does not build React.
* New variables for the cloud: `NODE_ENV=production`, `DB_SSL=true` (TiDB requires TLS),
  `DB_PORT=4000`, `SESSION_SECRET` (generated by Render), optional `DATABASE_URL`,
  `COOKIE_SECURE`, `TRUST_PROXY`, `TZ=Asia/Kolkata`. See section 6 and `.env.production.example`.
* `GET /api/health` → `200 {"status":"ok","db":"up"}` or `503 … "db":"down"`.
* `DEMO_MODE=true` stays on: there is no mail server, so password-reset links are shown on screen.
* Locally nothing changes: `npm start` still uses `http://localhost:3000` and your local MySQL.

Live link: *add your `https://….onrender.com` link here after deploying.*

---

## 13. Documentation

* `PROJECT_EXPLANATION.md` — complete walkthrough of the code, flows and payment sequence diagram
* `docs/SYNOPSIS.md` — project synopsis
* `docs/ARCHITECTURE.md` — layers, request lifecycle, front-end structure
* `docs/DATABASE.md` — every MySQL table, relationships, transactions, indexes
* `docs/API.md` — every endpoint
* `docs/INTERVIEW_GUIDE.md` — talking points, viva Q&A (incl. deployment), resume line
* `docs/DEPLOYMENT.md` — free public deployment: GitHub Desktop, TiDB Cloud Starter, Render
