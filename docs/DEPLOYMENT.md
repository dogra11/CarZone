# CarZone – Free public deployment (Render + TiDB Cloud)

This guide puts CarZone on the internet with a link such as
`https://carzone-xxxx.onrender.com` that you can share with recruiters. It costs nothing
and is written for **Windows** (VS Code, PowerShell, GitHub Desktop).

```
 Browser ──HTTPS──► Render (free web service: Node.js + Express + the built React app)
                          │  mysql2 over TLS (port 4000)
                          ▼
                    TiDB Cloud Starter (free, serverless, MySQL-compatible database)
```

* **GitHub** stores the code. Render downloads it from there.
* **TiDB Cloud Starter** is the database. It speaks the MySQL protocol, so the same
  `mysql2` code and the same `database/carzone_db.sql` work. It **requires TLS** (encrypted
  connections), uses port **4000**, and user names look like `xxxxxxxxxxxxxxx.root`.
* **Render** runs `npm install` and then `npm start`. The React front end is already built
  (`client/dist` is in the repository), so Render does not need to build React.

Your local setup does not change. `npm start` on your PC still uses
`http://localhost:3000` and your local MySQL.

> Website buttons and menus change from time to time. If a name below is slightly
> different, look for the closest match. The steps stay the same.

**Time needed:** about 45 minutes the first time.
**You need:** a GitHub account, an e-mail address, and the project working on your PC (README §4).

---

## A. Upload the project to GitHub (GitHub Desktop)

Use **GitHub Desktop** rather than the "Upload files" page on github.com. The web page
accepts only about 100 files per upload, and CarZone has about 580 files (including `client/dist`).

1. Install GitHub Desktop from <https://desktop.github.com> and sign in with your GitHub
   account (**File → Options → Accounts → Sign in**).
2. **File → Add local repository…** → **Choose…** → select the `CarZone` folder → **Add repository**.
   - If it says *"This directory does not appear to be a Git repository"*, click
     **create a repository** → keep the name `CarZone` → **Git ignore: None** (the project
     already has a `.gitignore`) → **Create repository**.
3. Look at the **Changes** list on the left before committing. Check these points:
   - ✅ `client/dist/...` files **are** listed. Render needs them.
   - ✅ `render.yaml`, `.env.example` and `.env.production.example` are listed.
   - ❌ **`.env` must NOT be listed.** It holds your passwords. `.gitignore` already excludes
     it. If you ever see it, right-click it → **Ignore file** and do not commit it.
   - ❌ `node_modules` must not be listed either.
4. Bottom-left: Summary `Initial commit` → **Commit to main**.
5. Click **Publish repository** (top bar).
   - Name: `CarZone`.
   - **Keep this code private**: untick it to make the repo public, so recruiters can read
     your code. Render can deploy private repositories too.
   - Click **Publish repository**.
6. Open the repository on github.com (**Repository → View on GitHub**). Check that
   `render.yaml` and the `client/dist` folder are there and that `.env` is **not**.

> **Never upload `.env` or any real password.** Git keeps every old version forever. If a
> password was ever pushed, deleting the file later does not help. Change that password at once.

---

## B. Create the free TiDB Cloud Starter database

1. Open <https://tidbcloud.com> → **Sign Up**. Google, GitHub or e-mail all work. No credit card is needed for the free Starter instances.
2. After logging in you are on **My TiDB** (the clusters/instances list). Click
   **Create Instance** (older screens say **Create Cluster**).
3. Choose the plan **Starter** (free). If PostgreSQL is offered as well, choose the
   **MySQL-compatible** option.
4. **Cloud provider: AWS.** **Region:** pick **Mumbai (ap-south-1)** if it is in the list. If not,
   pick **Singapore (ap-southeast-1)**. Both are close to India and to Render's Singapore region.
5. Name: `carzone`. Click **Create**. It is ready in under a minute.
6. Open the instance and click **Connect** (top-right). In the dialog:
   1. **Connection Type: Public**.
   2. **Connect With: General**. This shows the plain values. The Node.js tab is fine too.
   3. Click **Generate Password**. **Copy it now** into a safe place such as a password
      manager. It is shown only once. (If you lose it, use **Reset Password**.)
   4. Write down these values:

      | TiDB shows | You will use it as | Example |
      |---|---|---|
      | HOST | `DB_HOST` | `gateway01.ap-south-1.prod.aws.tidbcloud.com` |
      | PORT | `DB_PORT` | `4000` |
      | USERNAME | `DB_USER` | `2aBcDeFgHiJkLmN.root` (the prefix before `.root` is part of it) |
      | PASSWORD | `DB_PASSWORD` | the generated password |
      | DATABASE | `DB_NAME` | use **`carzone_db`** (our script creates it) |

7. **Firewall:** a new Starter instance allows connections from any IP address by default
   (rule `Allow_all_public_connections` under **Settings → Networking**). Leave it as it is.
   Render's free servers do not have a fixed IP address.
8. **CA certificate:** not needed for the app. Node.js already trusts TiDB's certificate
   authority (Let's Encrypt / ISRG Root X1). Only MySQL Workbench may ask for it (step C2).

---

## C. Load the tables and demo data into TiDB

Pick **one** of the three ways. Each one runs `database/carzone_db.sql`, the same file you use
with your local MySQL. It runs unchanged on MySQL 8 and on TiDB.

> ⚠️ The script **drops and recreates** `carzone_db`. Running it again resets all data to the
> demo data. That is handy before an interview, because the demo bookings are dated relative
> to the day you load them.

### C1. `npm run db:setup` from your PC (recommended)

This uses the same connection code as the app. The command below does **not** change your
`.env` file, so your local MySQL setup stays as it is.

1. VS Code → open the `CarZone` folder → **Terminal → New Terminal** (PowerShell).
2. Paste this line, replacing the four parts in CAPITALS with your TiDB values:

   ```powershell
   $env:DATABASE_URL="mysql://USERNAME:PASSWORD@HOST:4000/carzone_db?ssl=true"; npm run db:setup; Remove-Item Env:DATABASE_URL
   ```

   Example:
   `mysql://2aBcDeFgHiJkLmN.root:Xy12AbCd34@gateway01.ap-south-1.prod.aws.tidbcloud.com:4000/carzone_db?ssl=true`

   If the password contains special characters, URL-encode them in this line:
   `@`→`%40`, `#`→`%23`, `/`→`%2F`, `:`→`%3A`, `%`→`%25`, `?`→`%3F`, `&`→`%26`.
3. Expected output:

   ```
   CarZone database setup - this DROPS and recreates "carzone_db".
   [1/4] Connecting to 2aBcDeFgHiJkLmN.root@gateway01....tidbcloud.com:4000/carzone_db (TLS on, from DATABASE_URL) ...
   [2/4] Connected. Server version 8.0.11-TiDB-v8.x.x (TiDB).
   [3/4] Running database/carzone_db.sql (... KB, tables + sample data). This can take up to a minute ...
         done in 25.3 s
   [4/4] Verified: users=8, services=..., products=72, bookings=22, orders=16
   ```

   If it fails, it prints the error and a **Hint** line. See section H.

*Alternative:* put the values into `.env` instead (`DB_HOST`, `DB_PORT=4000`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME=carzone_db`, `DB_SSL=true`), run `npm run db:setup`, and then put your
local MySQL values back. Values set in the terminal (as above) always win over `.env`.

### C2. MySQL Workbench

1. **Database → Manage Connections… → New**.
   - Connection Name: `TiDB CarZone`.
   - Hostname: your HOST. Port: `4000`. Username: your full `xxxx.root` user name.
   - Password: **Store in Vault…** → paste the TiDB password.
2. **SSL** tab → **Use SSL: Require**.
   (Stricter option: **Require and Verify CA**. Download `isrgrootx1.pem` from
   <https://letsencrypt.org/certs/isrgrootx1.pem> and choose it as **SSL CA File**.)
3. **Test Connection**. If Workbench warns about an *incompatible/nonstandard server
   version*, click **Continue Anyway**. TiDB reports itself as `8.0.11-TiDB-…`.
4. Optional, to avoid time-outs: **Edit → Preferences → SQL Editor →
   DBMS connection read timeout = 600**.
5. Open the connection → **File → Open SQL Script…** → `database/carzone_db.sql` →
   click the ⚡ **Execute** button. Wait until the Output panel shows only green ticks.

### C3. TiDB Cloud SQL Editor (in the browser, nothing to install)

1. In TiDB Cloud open your instance → **SQL Editor** in the left menu.
2. Open `database/carzone_db.sql` in VS Code → **Ctrl+A**, **Ctrl+C** → paste it into the editor.
3. Select everything (**Ctrl+A**) and click **Run**.
4. If the editor refuses a script this long or stops part-way, run `database/schema.sql`
   first and then `database/seed.sql` (together they are the same as `carzone_db.sql`).
   If it stopped in the middle, start again from the top. The script begins with `DROP DATABASE`.

> **Time zone note.** The demo data uses `CURDATE()`. `npm run db:setup` uses your PC's
> time zone. TiDB itself runs in UTC, so with C2/C3 the demo dates can be one day off if you
> load them between midnight and 5:30 am IST. Nothing breaks either way.

---

## D. Deploy on Render

### D1. With the Blueprint (`render.yaml`) – recommended

1. Open <https://render.com> → **Get Started** → **GitHub** → authorise Render.
2. In the dashboard click **New → Blueprint**.
3. Find your `CarZone` repository → **Connect**.
   - Not listed? Click **Configure account** (or **Configure GitHub**) and give Render access
     to the repository. Then come back.
4. **Blueprint Name:** `carzone`. **Branch:** `main`. Leave **Blueprint Path** empty
   (`render.yaml` is in the root).
5. Render lists what it will create: one **web service `carzone` (Free)**. It asks for the
   values marked `sync: false`. Fill them in:

   | Key | Value |
   |---|---|
   | `DB_HOST` | your TiDB HOST |
   | `DB_PORT` | `4000` |
   | `DB_USER` | your full `xxxx.root` user name |
   | `DB_PASSWORD` | your TiDB password |
   | `DB_NAME` | `carzone_db` |

   The other variables come from `render.yaml`: `NODE_ENV=production`, `NODE_VERSION=22`,
   `TZ=Asia/Kolkata`, `DEMO_MODE=true`, `DB_SSL=true`, and `SESSION_SECRET`, which Render
   generates as a random value.
6. Click **Deploy Blueprint**.
7. Open the service **carzone** → **Logs**. A good deploy shows:
   `npm install` → **Build successful** → the CarZone banner with
   `Mode : production (listening on 0.0.0.0:10000 …)` → **Your service is live**.
8. Your link is at the top of the service page, under the name:
   **`https://carzone-xxxx.onrender.com`**. Click it.

### D2. Without the Blueprint (New → Web Service)

1. **New → Web Service** → choose the `CarZone` repository → **Connect**.
2. Settings:
   - Name `carzone`. Region **Singapore**. Branch `main`. Language/Runtime **Node**.
   - Build Command `npm install`. Start Command `npm start`.
   - Instance Type: **Free**.
3. **Environment Variables → Add Environment Variable**, one row each:

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `TZ` | `Asia/Kolkata` |
   | `DEMO_MODE` | `true` |
   | `DB_SSL` | `true` |
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | from step B6 (`4000`, `carzone_db`) |
   | `SESSION_SECRET` | click **Generate** if offered. Otherwise run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` in VS Code and paste the result (64 characters). |

   Do **not** add `PORT` or `HOST`. Render sets `PORT` itself, and production already
   listens on `0.0.0.0`.
4. **Advanced → Health Check Path:** `/api/health`.
5. **Deploy Web Service**. Then follow steps D1.7–D1.8.

*Instead of the five `DB_*` rows you may add one `DATABASE_URL` row
(`mysql://USER:PASSWORD@HOST:4000/carzone_db?ssl=true`). It wins over the `DB_*` values.*

---

## E. Test the live site

1. Open `https://carzone-xxxx.onrender.com/api/health`. You should see
   `{"status":"ok","db":"up",...}`.
2. Open the home page. Log in with the demo accounts below (also one-click buttons on the login page):

   | Role | Email | Password |
   |---|---|---|
   | Admin | `admin@carzone.in` | `Admin@123` |
   | Customer | `rohan@example.com` | `Customer@123` |

3. A quick check of all features:
   - Customer: shop → add to cart → checkout → pay by card `4111 1111 1111 1111`, any future
     expiry, CVV `123`, OTP `123456` → order confirmed.
   - Customer: book a wash → pay with UPI `success@upi` → see the confirmation.
   - Forgot password → the reset link appears **on screen** (`DEMO_MODE=true`, no e-mail).
   - Admin: overview charts, orders, refunds, reports (CSV).
4. Reload the page after logging in. You should stay logged in. If not, see H.

---

## F. Optional: Razorpay test mode

By default payments use the built-in **simulator**. No money is ever involved. To show the
real Razorpay Checkout in **test mode**:

1. <https://dashboard.razorpay.com> → switch to **Test Mode** → **Account & Settings → API Keys →
   Generate Test Key**.
2. Render → service → **Environment** → add `RAZORPAY_KEY_ID` (`rzp_test_…`) and
   `RAZORPAY_KEY_SECRET` → **Save, rebuild and deploy**.
3. Optional webhook: Razorpay **Webhooks → Add** → URL
   `https://carzone-xxxx.onrender.com/api/payments/webhook/razorpay`. Choose a secret and add the
   same value on Render as `RAZORPAY_WEBHOOK_SECRET`.

Never use live keys (`rzp_live_…`) in a demo.

---

## G. Free-tier notes (read before sharing the link)

Checked in November 2026. Providers can change their free plans at any time.

* **Sleeping:** a free Render service **spins down after 15 minutes without visitors**. The next
  visit wakes it, which takes **about a minute** (Render shows a loading page). **Open the link
  a minute before an interview** and keep the tab open.
* **Restarts:** Render may restart a free service at any time. Logins survive, because sessions
  are stored in the database. The in-memory login rate-limit counters reset.
* **Hours:** a Render workspace gets 750 free instance hours per month. That is enough for one
  service running all month, because sleeping time does not count.
* **Ephemeral disk:** Render's free filesystem is wiped on every restart, redeploy or spin-down.
  CarZone does **not** store anything in files. All data is in TiDB, and the admin "image"
  fields are paths to images that ship with the app in `client/dist`. So nothing is lost.
  (If you later add real image uploads, they would **vanish on restart**. Store them in object
  storage such as Cloudinary or S3, not on the Render disk.)
* **TiDB free quota:** each free Starter instance (up to 5 per organisation) includes a
  monthly allowance: about 5 GiB row storage and 50 million Request Units at the time of
  writing. CarZone uses a tiny fraction. When a quota is used up, the database can be
  throttled until the next month.
* **Demo data ages:** sample bookings are dated relative to the day you loaded them. Re-run
  step C1 before an important demo to refresh them. This resets all data.
* **E-mail:** there is no mail server, so `DEMO_MODE=true` shows reset links on screen. Keep it on.

---

## H. Troubleshooting

Look in Render → service → **Logs** first. CarZone prints a plain-English hint for most problems.

| Symptom / message | Cause | Fix |
|---|---|---|
| **Build failed** (`npm install` error) | Usually a broken `package.json`, or a missing `client/dist` | Run `npm install` and `npm start` on your PC. Check that `client/dist` is on GitHub. Check that `NODE_VERSION` is `22`. Then **Manual Deploy → Clear build cache & deploy**. |
| `ER_ACCESS_DENIED_ERROR` / *Access denied for user* | Wrong `DB_USER`/`DB_PASSWORD` | Use the **full** user name with its prefix (`xxxx.root`). Regenerate the password in TiDB **Connect**. Update it on Render. |
| *Connections using insecure transport are prohibited* | TLS off | Set `DB_SSL=true` (or `?ssl=true` in `DATABASE_URL`). |
| TLS/SSL errors (*certificate*, *handshake*, *self-signed*) | Wrong host name, or a bad `DB_SSL_CA` | Copy `DB_HOST` exactly from TiDB. Remove `DB_SSL_CA` (not needed for TiDB). Never turn off certificate checking. |
| `ECONNREFUSED` | `DB_HOST` still `localhost`, or wrong port | Set the TiDB host and `DB_PORT=4000`. |
| `ETIMEDOUT` / `ENOTFOUND` | Typo in host, wrong port, or a firewall rule | Check host and port `4000`. In TiDB → **Settings → Networking**, keep public access allowed (`Allow_all_public_connections`). |
| `ER_BAD_DB_ERROR` / *Tables are missing* | Database not loaded, or wrong `DB_NAME` | Do section C. Set `DB_NAME=carzone_db`. |
| **502 / 503** in the browser for a minute | The service is waking up or deploying | Wait about 60 s and reload. |
| 503 continuing, `/api/health` shows `"db":"down"` | The app runs but cannot reach TiDB | Check the DB variables, the TiDB instance status and the TiDB quota. |
| Deploy stuck on *health check failing* | The app crashed at start-up (see Logs) or the DB is unreachable | Read the first **ERROR** line in Logs and fix that variable. The health check path must be `/api/health`. |
| `Production configuration error: SESSION_SECRET is missing` | No secret in production | Render → Environment → add `SESSION_SECRET` (32+ random characters, or **Generate**). The Blueprint creates it automatically. |
| *SESSION_SECRET is too short* | Fewer than 32 characters | Use a longer random value. |
| **Login does not stick** (you are logged out after reload) | The cookie is `Secure`, so the browser sends it over **https** only | Use the `https://…onrender.com` link (not `http://`). Locally, only set `NODE_ENV=production` together with `COOKIE_SECURE=false`. |
| Too many login attempts for everyone | The proxy is not trusted | Keep `NODE_ENV=production` (or set `TRUST_PROXY=true`). |
| *Port scan timeout* / *no open ports detected* | The app listens on the wrong port or interface | Do **not** set `PORT` or `HOST` on Render. Production uses Render's `PORT` and `0.0.0.0`. |
| `EADDRINUSE` on your PC | Port 3000 is busy | Close the other app or set `PORT=3001` in `.env`. |
| Dates or times look 5½ hours off | Time zone not set | Add `TZ=Asia/Kolkata` on Render (the Blueprint sets it). |

---

## I. Updating the live site

1. Change code on your PC → test with `npm start` (and `npm test`).
2. If you changed React code: run `npm run build:client` so that `client/dist` is rebuilt.
3. GitHub Desktop → write a summary → **Commit to main** → **Push origin**.
4. Render notices the push and **deploys automatically** (service → **Events**). The old version
   stays live until the new one passes the health check.
5. If you changed `database/*.sql`, reload the database (section C). This resets the data.
6. To change a setting only (for example Razorpay keys): Render → **Environment** → edit →
   **Save, rebuild and deploy**.

---

## J. Share with recruiters

Copy, fill in your link and GitHub URL, and paste into an e-mail or LinkedIn message:

```
CarZone – Car Wash, Detailing & Accessories platform (React, Node.js/Express, MySQL/TiDB)

Live demo : https://carzone-xxxx.onrender.com
Source    : https://github.com/<your-username>/CarZone

Demo logins
  Customer : rohan@example.com / Customer@123
  Admin    : admin@carzone.in  / Admin@123

Notes
  • Hosted on a free plan: the first visit may take about a minute to wake the server.
  • Payments are simulated (test mode) – no real money. Test card 4111 1111 1111 1111,
    any future expiry, CVV 123, OTP 123456; or UPI success@upi.
  • Password-reset links are shown on screen (demo mode, no e-mail server).
```

---

### Reference: environment variables

| Variable | Local default | Render value | Purpose |
|---|---|---|---|
| `NODE_ENV` | *(unset)* | `production` | Production defaults below |
| `PORT` | `3000` | *(set by Render)* | Port to listen on |
| `HOST` | `localhost` | *(unset → `0.0.0.0`)* | Network interface |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | `localhost` `3306` `root` *(empty)* `carzone_db` | TiDB values, port `4000` | Database |
| `DB_SSL` | `false` | `true` | TLS 1.2+ with certificate verification |
| `DB_SSL_CA` | *(empty)* | *(empty)* | Optional CA file (not needed for TiDB) |
| `DATABASE_URL` | *(empty)* | optional | One-line alternative to the `DB_*` values |
| `SESSION_SECRET` | auto-generated | **required**, 32+ chars | Signs login cookies |
| `COOKIE_SECURE` | `false` | `true` (default in production) | Cookie only over HTTPS |
| `TRUST_PROXY` | `false` | `true` (default in production) | Real client IP/https from Render's proxy |
| `DEMO_MODE` | `true` | `true` | Reset links on screen |
| `TZ` | your PC | `Asia/Kolkata` | Local dates and slots |
| `NODE_VERSION` | – | `22` | Node.js version on Render |
| `PUBLIC_URL` | *(empty)* | *(Render sets `RENDER_EXTERNAL_URL`)* | Public link in log messages |
