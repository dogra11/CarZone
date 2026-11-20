# CarZone – Interview & Viva Guide

## 1. 60-second pitch
"CarZone is a full-stack platform for a car-care business that both **washes cars** and **sells
accessories**. Customers book a wash with live slot availability and pay online, or shop
accessories filtered by their exact car model, with cart, checkout, COD and order tracking.
The front end is React 19, the back end is a Node.js + Express REST API with a layered
architecture, and data is in MySQL 8. I paid special attention to correctness: prices and payment amounts are always computed
on the server, payments are verified with HMAC signatures and idempotency keys, stock can never
be oversold because I use `SELECT … FOR UPDATE` inside transactions, and there are 61 automated
tests. It runs as a free public demo on Render with a TiDB Cloud (MySQL-compatible) database."

## 2. Points to highlight
* Two businesses, **one shared engine** for coupons, payments, slots and reports.
* Shared validation code between React and Node.
* Gateway abstraction — simulator for the demo, Razorpay test mode with real signature checks.
* Inventory ledger (`stock_movements`) — stock is always explainable.
* Snapshot columns on bookings/orders so invoices never change.
* Own mini-router on the front end; a clean Express middleware pipeline on the back end
  (routers per feature, async wrapper, one central error handler) — I can explain every line.

## 3. Viva questions and answers

### React
1. **What is the virtual DOM?** — An in-memory tree of React elements. On state change React
   renders a new tree, diffs it with the previous one (reconciliation) and applies only the
   minimal real DOM changes.
2. **Props vs state?** — Props are inputs passed by the parent (read-only); state is data owned
   by a component that changes over time (`useState`). Changing state re-renders the component.
3. **Which hooks did you use?** — `useState`, `useEffect` (fetching, timers, polling),
   `useContext` (auth/cart), `useMemo`, `useCallback`, `useRef` (idempotency key, poll timer),
   `useId` (label/input ids) and custom hooks `useApi`, `useForm`.
4. **How does `useEffect` data fetching work in `useApi`?** — The effect runs when the URL
   changes, sets loading, calls `fetch`, and stores data or error. A `cancelled` flag in the
   cleanup function ignores responses from an outdated request (avoids race conditions).
5. **Why Context API?** — The logged-in user and the cart count are needed by the navbar,
   pages and route guards; Context avoids prop drilling. Everything else stays local.
6. **How do protected routes work?** — `ProtectedRoute` reads `useAuth()`; while loading it shows
   a loader; guests are redirected to `/login?next=<page>`; wrong role goes to its home. The
   server checks roles again — the UI guard is only for user experience.
7. **How does your router work?** — It keeps `window.location` in state, `navigate()` uses
   `history.pushState`, `popstate` handles back/forward, and `Routes` renders the first matching
   `Route` (`:params`, `/*`). The server returns `index.html` for unknown paths (SPA fallback).
8. **Keys in lists?** — A stable `key` (database id) lets React match items between renders.

### Node.js / API
9. **Why a layered architecture?** — Routes → controllers (HTTP) → services (rules) → DB.
   Services can be tested and reused (e.g. `restoreStock` is used by cancel and return).
10. **How is authentication done?** — scrypt hash + salt; on login a random token is created,
    its SHA-256 stored in `sessions`, and the cookie holds `token.HMAC(token)`; HttpOnly +
    SameSite=Strict. Logout deletes the row (instant revocation, unlike plain JWT).
11. **How do you validate input?** — One schema file shared by client and server; the server
    always re-validates (`validateBody`).

### Express.js
E1. **What is Express?** — A small web framework on top of Node's `http` module. It adds
    routing (`app.get('/path', handler)`), a middleware pipeline, and helpers such as
    `req.params`, `req.query`, `res.json()`, `res.status()`, `res.cookie()`, `res.sendFile()`.
E2. **What is middleware?** — A function `(req, res, next)` that runs during a request. It can
    read/modify `req`/`res`, end the response, or call `next()` to pass control on. CarZone's
    pipeline: security headers → logger → cookies → authenticate → `/api` router (JSON body
    parsing, feature routers, 404) → admin page guard → static files → SPA fallback → error handler.
E3. **`app.use` vs `app.get`?** — `app.use(path?, fn)` runs for **every HTTP method** and for every
    URL that **starts with** the path (used for middleware and mounting routers).
    `app.get(path, fn)` runs only for **GET** (and HEAD) requests whose path **matches fully**,
    e.g. `/api/services/:slug`.
E4. **What does `next()` do?** — Moves to the next matching middleware/route. `next(err)` skips
    all normal middleware and jumps to the error-handling middleware. Not calling `next()` and
    not sending a response leaves the request hanging.
E5. **What is error-handling middleware?** — A middleware with **four** parameters
    `(err, req, res, next)`, registered **last**. Express calls it only when an error was passed
    to `next(err)` or thrown. Mine (`errorHandler.js`) maps `AppError` to its status, bad JSON to
    400, too-large bodies to 413, MySQL constraint errors to 409 and everything else to a
    logged 500 — always as `{ ok: false, error: { message, fields? } }`.
E6. **What is `express.Router()`?** — A mini-application with its own routes and middleware.
    Each feature has one (`auth.routes.js`, `admin.routes.js`...) mounted with
    `api.use('/auth', authRoutes)`. `adminRouter.use(requireRole('admin'))` protects every admin
    endpoint in one line.
E7. **What does `express.json()` do?** — Built-in body parser: reads the request stream, parses
    JSON into `req.body`, enforces a size limit (`100kb` here → 413) and rejects invalid JSON (400).
    For the Razorpay webhook I use `express.raw()` instead, because the HMAC signature must be
    checked on the **exact bytes**; that route is registered before `express.json()` since a
    body stream can only be read once.
E8. **How are static files served?** — `express.static('client/dist')` streams the React build
    (JS, CSS, images, fonts) with ETags and `Cache-Control` (`no-cache` for app.js/app.css so a
    rebuild shows immediately, 1 day for images/fonts). Any other page URL gets `index.html`
    (SPA fallback) so React Router can render `/shop/...` on refresh; unknown `/api` URLs still
    return a JSON 404 because the API router ends with its own `notFound` middleware.
E9. **Why do you need the async wrapper (`asyncHandler`)?** — Express 4 catches errors thrown
    synchronously, but not rejected Promises from `async` functions. Without the wrapper a failed
    `await` (e.g. a DB error) would never reach the error handler and the browser would wait
    forever. `asyncHandler(fn)` = `(req,res,next) => Promise.resolve(fn(req,res,next)).catch(next)`.
E10. **How does your role-based auth middleware work?** — `authenticate` sets `req.user` from the
    session cookie for every request. `requireAuth` returns 401 for guests. `requireRole('admin')`
    is a *middleware factory*: it returns a `(req, res, next)` function that allows only the given
    roles (403 otherwise). Routes stack them: `router.post('/bookings', requireRole('customer'),
    validateBody(schemas.booking), asyncHandler(booking.create))`.
E11. **Express vs plain Node `http`?** — With plain `http` you get one callback per request and
    must parse URLs, match routes, read bodies, set headers and handle errors yourself. Express
    gives routing with `:params`, composable middleware, body parsers, static files and
    consistent error handling — less code and a structure every Node developer knows.
E12. **How do CORS and security headers work here?** — The React app is served by the same
    Express server (same origin), so no CORS is needed and none is enabled: browsers block other
    websites from reading the API. If a separate front-end domain were used I would add the
    `cors` middleware with an allow-list. `securityHeaders` (like helmet) sets a strict
    Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and I disable
    `X-Powered-By: Express` so attackers do not learn the framework.
E13. **How is the login rate limiter written?** — A middleware factory
    `rateLimit({ windowMs, max })` keeps a counter per IP in a `Map`; past the limit it calls
    `next(AppError 429)` with a `Retry-After` header. It is applied only to the auth/contact routes.

### E-commerce
12. **How do you prevent overselling?** — In one transaction: lock product rows with
    `SELECT … FOR UPDATE`, then `UPDATE … SET stock = stock - q WHERE id = ? AND stock >= q`.
    If any update affects 0 rows the whole transaction rolls back.
13. **Guest cart?** — Stored in `localStorage`; on login `CartContext` posts it to
    `/api/cart/merge`, quantities are capped by stock, then the local copy is cleared.
14. **Order life cycle?** — pending_payment → placed → packed → shipped → out_for_delivery →
    delivered; cancel allowed until packed; return within 7 days → return_requested → returned.
    Each change is written to `order_status_history`.
15. **Why store price snapshots in `order_items`?** — Product prices change; invoices and
    refunds must use the price actually paid.
16. **GST handling?** — Wash bills add 18 % on top; store prices are GST-inclusive, so the GST
    part is `total × 18 / 118`. All in integer paise to avoid float errors.
17. **How does compatibility filtering work?** — `product_compatibility` links products to
    `car_models`; the query returns products that are universal OR linked to the chosen model.

### Payments
18. **Why verify on the server?** — Anything from the browser can be faked. Only the server,
    knowing the secret, can check `HMAC_SHA256(order_id|payment_id, key_secret)` (Razorpay) or
    the hashed OTP (simulator) before marking the order paid.
19. **What is HMAC?** — A hash keyed with a secret; it proves the message came from someone who
    knows the secret and was not altered. Compared with `crypto.timingSafeEqual` to avoid
    timing attacks.
20. **What is idempotency?** — Repeating the same request has the same effect as doing it once.
    Each attempt sends an idempotency key (UNIQUE in `payments`); a retried create returns the
    same payment and a repeated verify returns the stored result without charging twice.
21. **What about PCI-DSS?** — We never store card numbers or CVV — only a masked detail. With
    Razorpay, card data goes straight to Razorpay's Checkout, keeping us out of PCI scope.
22. **Webhooks?** — Server-to-server notifications from the gateway (e.g. `payment.captured`),
    verified with `X-Razorpay-Signature` over the raw body. They make the system correct even if
    the customer closes the browser before our verify call.
23. **Amount tampering?** — `POST /api/payments` rejects any `amount` field; the amount always
    comes from the booking/order row.

### MySQL
24. **What is a transaction / ACID?** — A group of statements that succeed or fail together
    (Atomicity), keep constraints valid (Consistency), do not see each other's partial work
    (Isolation) and survive crashes once committed (Durability).
25. **`SELECT … FOR UPDATE`?** — Takes an exclusive row lock until commit, so a second
    transaction trying to lock the same product waits instead of reading stale stock.
26. **Isolation level?** — InnoDB default REPEATABLE READ; locking reads give us the latest
    committed row and serialize competing checkouts.
27. **Indexes?** — B-tree structures that speed up lookups (e.g. `bookings(booking_date,
    time_slot_id)` for slot availability, `orders(user_id)` for "My orders"). Too many indexes
    slow down writes, so I indexed only foreign keys and frequent filters.
28. **Normalisation?** — Master data is in 3NF (prices per vehicle in a separate table,
    many-to-many via junction tables); transactional tables keep deliberate snapshots.
29. **Connection pooling?** — Opening a MySQL connection is slow; `mysql2.createPool` keeps
    reusable connections and queues requests when all are busy.
30. **How do you avoid SQL injection?** — `pool.execute(sql, params)` with `?` placeholders
    (prepared statements); user input is never concatenated into SQL.

### Deployment (Render + TiDB Cloud)
31. **How is the app configured for different environments?** — Following the 12-factor rule
    "store config in the environment": the same code runs everywhere and only environment
    variables change (`DB_HOST`, `DB_SSL`, `NODE_ENV`, `SESSION_SECRET`…). Locally they come
    from `.env`, on Render from the dashboard / `render.yaml`. `src/config/index.js` reads them
    once, gives safe defaults and freezes the object.
32. **`DATABASE_URL` vs separate `DB_*` variables?** — Two ways to give the same information.
    A URL (`mysql://user:pass@host:4000/carzone_db?ssl=true`) is one value to copy; I parse it
    with Node's `URL` class and `decodeURIComponent`, so special characters in the password
    must be URL-encoded (`@` → `%40`). If both are set, `DATABASE_URL` wins.
33. **Why TLS to the database, and what do the options mean?** — TiDB Cloud is reached over
    the public internet, so the connection must be encrypted (it refuses plain connections).
    `ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }`: no outdated TLS versions, and
    the server certificate MUST be valid for that host name — this stops a man-in-the-middle
    from pretending to be the database. Turning `rejectUnauthorized` off would encrypt but
    trust anyone. Node already trusts Let's Encrypt (TiDB's CA), so no CA file is needed.
34. **Why `app.set('trust proxy', 1)`?** — On Render the browser talks HTTPS to Render's proxy,
    which forwards plain HTTP to my app. Without trust proxy, `req.ip` is the proxy's address for
    every visitor, so my per-IP login rate limiter would put everyone in one bucket, and
    `req.secure` would be false. With `1`, Express trusts exactly one hop and reads the real
    IP/protocol from `X-Forwarded-For` / `X-Forwarded-Proto`. Trusting more hops than exist
    would let a visitor fake their IP with a header — the deploy tests check that.
35. **What changes for cookies in production?** — The session cookie gets `Secure` (sent only
    over HTTPS) on top of `HttpOnly` (no JavaScript access) and `SameSite=Strict` (CSRF
    protection). Locally the site is plain `http://localhost`, where a Secure cookie would be
    dropped, so it is on only in production (override: `COOKIE_SECURE`). HSTS is sent only on
    HTTPS requests.
36. **Why must `SESSION_SECRET` come from the environment in production?** — It signs the login
    cookies (HMAC). If it leaked, anyone could forge a session. Locally the app generates one and
    stores it in the database for convenience; in production the server refuses to start without
    a 32+ character secret, and Render generates it (`generateValue: true`).
37. **Why do secrets stay out of Git?** — A repository is copied to many places (forks, laptops,
    CI) and Git history keeps everything forever — deleting a password in a later commit does
    not remove it. So `.env` is in `.gitignore`, only `.env.example` files with empty values are
    committed, and real values are typed into the hosting dashboard (`sync: false`).
38. **What is a health check?** — `GET /api/health` runs `SELECT 1` with a 3-second timeout and
    answers `200 {status:'ok', db:'up'}` or `503 … db:'down'`. Render calls it to decide whether a
    new deploy is healthy (otherwise it keeps the old version live) and to detect a broken
    instance. It is mounted before authentication and is not logged when healthy, to keep logs
    readable.
39. **Why `0.0.0.0` and `process.env.PORT`?** — In a container `localhost` is reachable only from
    inside the container, so the platform's proxy could not connect; `0.0.0.0` listens on all
    interfaces. The platform decides the port and passes it in `PORT` (Render uses 10000).
    Locally the defaults stay `localhost:3000`.
40. **What is a cold start?** — Free Render instances sleep after 15 minutes without traffic.
    The next visitor wakes it: Node starts, connects to TiDB and only then answers — about a
    minute. That is why I open the link a minute before an interview. Paid plans stay awake.
41. **Anything that does NOT work on a free cloud instance?** — The disk is ephemeral (wiped on
    restart/redeploy), so nothing may be stored in files: all data is in TiDB, and admin
    "images" are paths to bundled files, not uploads. The rate-limit counters are in memory, so
    a restart resets them. Payments use the simulator (or Razorpay test keys) — no real money.
42. **Is TiDB really MySQL?** — It is a distributed SQL database that speaks the MySQL protocol,
    so `mysql2` and the same SQL work. Differences I handled: TLS is mandatory; AUTO_INCREMENT
    ids are cached per server and not in insertion order by default, so I added the TiDB-only
    option `/*T![auto_id_cache] AUTO_ID_CACHE=1 */` (a comment for MySQL) because some queries use
    `ORDER BY id DESC` to find the latest payment; CHECK constraints are enforced only if
    enabled, which is fine because the app validates everything first; no triggers or stored
    procedures are used. The same `carzone_db.sql` runs on both.

## 4. Demo script (5 minutes)
1. Landing → Shop → select "Hyundai Creta" → product page → add to cart (guest).
2. Login as rohan → cart merged → checkout with GEAR10 → pay by card, OTP 123456 → track order.
3. Book a wash → pay with UPI `success@upi` (watch it poll) → cancel → refund pending.
4. Admin → Overview charts → Orders: mark packed/shipped → Refunds: process → Reports: CSV.
5. (Live link) Open `/api/health` to show the health check, then show `render.yaml`.

## 5. Resume line
> **CarZone – Car Wash & Accessories Platform (React, Node.js, Express, MySQL)** — Built a full-stack
> booking + e-commerce platform with an Express REST API (feature routers, auth/role middleware,
> central error handling), with live slot inventory, car-model-based product filtering,
> transactional stock control (`SELECT … FOR UPDATE`), a payment-gateway abstraction with
> Razorpay HMAC verification and idempotent payments, role-based admin analytics and CSV/PDF
> reports; 61 automated tests.
