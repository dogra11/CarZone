/**
 * health.controller.js - GET /api/health, used by the hosting platform (Render's
 * healthCheckPath in render.yaml) and by uptime monitors.
 *
 *   200 { status: 'ok', db: 'up' }    -> the web process runs AND the database answers
 *   503 { status: 'ok', db: 'down' }  -> the web process runs but the database does not
 *
 * "status" describes this Node process (it answered, so it is alive); "db" describes the
 * database. 503 = "Service Unavailable" tells the platform not to send users here yet;
 * Render keeps the previous version live if a NEW deploy never becomes healthy.
 * The answer is tiny and contains no secrets, so it is safe to expose publicly.
 */
import { pingDatabase } from '../db/connection.js';

export async function health(req, res) {
  const dbUp = await pingDatabase();
  res.set('Cache-Control', 'no-store');
  res.status(dbUp ? 200 : 503).json({
    status: 'ok',
    db: dbUp ? 'up' : 'down',
    uptimeSeconds: Math.round(process.uptime()),
  });
}
