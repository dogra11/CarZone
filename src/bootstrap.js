/**
 * bootstrap.js - Graceful start-up of CarZone:
 *   0. in production, fail fast if required secrets are missing (SESSION_SECRET),
 *   1. check the MySQL connection pool and the tables (clear error message if not ready),
 *   2. load the session-signing secret,
 *   3. build the Express app and start listening with app.listen().
 * Exported as a function so automated tests can start a server on a random port (port 0).
 */
import { config, assertProductionConfig } from './config/index.js';
import { initDatabase } from './db/init.js';
import { closePool } from './db/connection.js';
import { createApp } from './app.js';
import { loadSessionSecret } from './services/auth.service.js';

export async function startServer({ port = config.port, host = config.host } = {}) {
  assertProductionConfig();      // throws "SESSION_SECRET is missing" etc. before touching the DB
  await initDatabase();          // throws a friendly error if MySQL is not reachable
  await loadSessionSecret();

  const app = createApp();
  // app.listen() creates a Node http.Server for the Express app and returns it.
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, host, () => resolve(s));
    s.once('error', reject);     // e.g. EADDRINUSE (port already in use)
  });
  const address = server.address();
  // 0.0.0.0 / :: mean "every network interface" - not something you can type in a browser,
  // so the friendly local URL uses localhost instead.
  const allInterfaces = ['0.0.0.0', '::'].includes(host);
  const url = `http://${allInterfaces ? 'localhost' : host}:${address.port}`;
  // On Render this is https://<name>.onrender.com (from RENDER_EXTERNAL_URL or PUBLIC_URL).
  const publicUrl = config.publicUrl || url;
  const listening = `${host}:${address.port}`;   // what the socket is actually bound to
  // server.js prints the URL banner; tests use the returned url.

  const close = () => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(async () => { await closePool(); resolve(); });
  });
  return { app, server, url, publicUrl, listening, close };
}
