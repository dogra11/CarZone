# CarZone – Architecture

## 1. Layers

```
┌──────────────────────── Browser ────────────────────────┐
│ React 19 SPA (client/dist)                               │
│  App.jsx routes → pages → components                     │
│  Context: AuthContext, CartContext, Toast, Confirm       │
│  hooks/useApi → services/api.js (fetch, JSON, cookies)   │
└───────────────▲──────────────────────────┬───────────────┘
                │ HTML/JS/CSS/images       │ JSON /api/*
┌───────────────┴──────────────────────────▼───────────────┐
│ Node.js + Express 4 server (src/)                         │
│  app.js: express() + middleware pipeline                  │
│  middleware: securityHeaders → requestLogger → cookies →  │
│              authenticate → express.json → Router →       │
│              [rateLimit, validate, requireAuth/           │
│              requireRole] → asyncHandler(controller)      │
│              → errorHandler(err, req, res, next)          │
│  controllers/  HTTP in/out only                           │
│  services/     business rules, transactions               │
│  services/payments/  gateway interface:                   │
│      SimulatedGateway | RazorpayGateway                   │
│  db/connection.js  mysql2 pool + AsyncLocalStorage tx     │
└───────────────────────────┬──────────────────────────────┘
                            │ prepared statements
                    ┌───────▼────────┐
                    │ MySQL 8 InnoDB │  carzone_db (32 tables)
                    └────────────────┘
```

`/shared` (validation + constants) is imported by both the React bundle and Node.

## 2. Request lifecycle through Express

**Start-up.** `server.js` → `bootstrap.js`: checks the MySQL pool and tables
(`SELECT COUNT(*) FROM users`, friendly hint on failure), loads or creates the session secret,
builds the app with `createApp()` and calls `app.listen(port, host)`.

**Every request** then flows through the middleware registered in `app.js`, **in order**.
Each middleware is a function `(req, res, next)`: it either sends the response or calls
`next()` to hand the request to the next one.

```
request
  │
  ├─ 1. securityHeaders      CSP, X-Frame-Options, nosniff, Referrer-Policy ...   (app.use)
  ├─ 2. requestLogger        logs "METHOD url STATUS ms" when the response finishes
  ├─ 3. cookieParser         Cookie header → req.cookies
  ├─ 4. responseHelpers      adds res.ok(data, status)
  ├─    GET /api/health      health check (SELECT 1) → 200 db:up / 503 db:down, before auth
  ├─ 5. authenticate         session cookie → req.user (null for guests)    [asyncHandler]
  │
  ├─ 6. app.use('/api', apiRouter)                                   routes/index.js
  │      ├─ noStore                     Cache-Control: no-store
  │      ├─ POST /payments/webhook/razorpay → express.raw() → controller (raw bytes for HMAC)
  │      ├─ requireJsonContentType      415 for non-JSON writes
  │      ├─ express.json({ limit: '100kb' })   → req.body  (400 bad JSON, 413 too large)
  │      ├─ requireObjectBody           arrays rejected (400)
  │      ├─ /auth   authRouter          rateLimit → validateBody → controller
  │      ├─ /admin  adminRouter         router.use(requireRole('admin')) protects all routes
  │      ├─ publicRouter                catalogue, slots, offers, contact, store
  │      ├─ customerRouter              requireAuth / requireRole('customer') per route
  │      └─ notFound                    → next(AppError 404) "Route not found: GET /x"
  │
  ├─ 7. app.use('/admin', adminPageGuard)   non-admins → 302 /login?next=…(&denied=1)
  ├─ 8. express.static(client/dist)         JS, CSS, images, fonts (ETag, cache headers)
  ├─ 9. spaFallback                         extension-less GET → index.html (React routes);
  │                                         missing asset files → 404 "Not found"
  │
  └─ 10. errorHandler(err, req, res, next)  reached only via next(err) / throw:
                                            AppError → its status, express.json errors → 400/413,
                                            MySQL constraint → 409, anything else → 500 (logged)
```

Key Express ideas used here:
* **`app.use` vs `app.get`** — `use` matches every method and any path that *starts with*
  the prefix (middleware, routers); `get/post/...` match one method and the *whole* path.
* **`express.Router()`** — a mini-app with its own middleware and routes, mounted under a
  prefix; inside it `req.path` is relative (`/bookings/5`) and `req.baseUrl` is `/api`.
* **Order matters** — the webhook is registered before `express.json()` because a request
  body stream can be read only once; the error handler is registered last.
* **`asyncHandler`** — Express 4 does not catch rejected Promises; the wrapper turns them
  into `next(err)` so the error middleware always answers.
* **Error middleware** — Express recognises it by its 4 parameters and skips it when
  there is no error; ordinary middleware is skipped once there is an error.

## 3. Front-end structure
* **Routing** — `router/index.jsx` (own implementation): `BrowserRouter` keeps `location` in
  state and listens to `popstate`; `navigate()` calls `history.pushState`; `Routes` returns the
  first `Route` whose pattern matches (`:param` and trailing `/*`). Same API as
  react-router-dom (`Link`, `NavLink`, `useParams`, `useSearchParams`, `Navigate`).
* **State** — server data via `useApi` (local component state); global state only where needed:
  `AuthContext` (user), `CartContext` (cart count/items), `ToastProvider`, `ConfirmProvider`.
* **Protected routes** — `<ProtectedRoute role="customer|admin">` waits for the auth check,
  redirects guests to `/login?next=…` and other roles to their own home.
* **Forms** — `useForm(schema)` + `<FormField>`; errors from the shared rules or from the
  server (`err.fields`). `<FormModal>` generates admin CRUD forms from a field list.
* **Dashboards** — `<AppShell>` (sidebar + top bar). The URL (`/dashboard/orders`,
  `/admin/products`) chooses a section component.
* **Styling** — plain CSS with custom properties (dark luxury theme: black/charcoal, metallic
  gray, electric blue `#2f8cff`, subtle gold `#c9a961`), Montserrat + DM Sans, SVG icon sprite.
* **Build** — Vite for development (`client/vite.config.js`, proxy `/api`), esbuild script
  for an offline production bundle (`client/build/esbuild.mjs`) → `client/dist`.

## 4. Payment gateway abstraction
`services/payments/index.js` picks the gateway: Razorpay when `RAZORPAY_KEY_ID` and
`RAZORPAY_KEY_SECRET` are set, otherwise the simulator. Both implement the
same interface — `createOrder(payment)`, verification (`verify(fields)` = HMAC signature check
for Razorpay; OTP / bank decision for the simulator), `refund(payment, amountPaise)` and
`getStatus(payment)`. `payment.service.js` owns the lifecycle and database rows, so the rest of the
app never knows which gateway is active.

## 5. Security
| Threat | Defence |
|---|---|
| SQL injection | Prepared statements only |
| XSS | React escapes output; invoices use `escapeHtml`; CSP header |
| CSRF | `SameSite=Strict` cookie + JSON-only API |
| Session theft | HttpOnly cookie, token stored hashed, HMAC-signed value, expiry |
| Brute force | Rate limit on auth routes + account lockout |
| Price tampering | Server computes every bill/total; payment amount taken from DB |
| Fake payment success | Server-side OTP hash check / Razorpay HMAC signature with `timingSafeEqual` |
| Double charge | Idempotency keys; row lock on confirm; duplicate success auto-refunded |
| Overselling | `FOR UPDATE` + guarded stock update inside a transaction |
| Card data | Never stored (only masked detail) — PCI-DSS scope minimised |

## 6. Testing
* `tests/*.test.js` with `node:test`; `tests/support/helpers.js` starts the real server on a
  random port and drives it with `fetch` (cookie jar included).
* `tests/support/express-shim/` (test only) is an Express 4-compatible implementation of
  exactly the API subset the app uses (`express()`, `Router`, `json`, `raw`, `static`,
  `res.cookie/json/send/redirect/sendFile`, error middleware by arity). It was needed because
  the development machine had no internet access to install Express. It is mapped with the same
  resolve hook as the mysql2 shim and only when Node is started with
  `--import ./tests/support/register-shim.js`; `npm start` always uses the real `express`.
* `tests/support/mysql2-sqlite-shim.js` (test only) implements the subset of the
  `mysql2/promise` API used by the app on top of `node:sqlite`, translating the MySQL DDL,
  `INSERT IGNORE`, `FOR UPDATE` and MySQL error codes. It is loaded through a Node module
  resolve hook, so no application file changes between tests and production.
