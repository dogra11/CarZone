/**
 * server.js - Entry point. Run with:  npm start
 *
 * Starts the CarZone Express server (REST API + the built React app) on http://localhost:3000.
 * Deployed (NODE_ENV=production, e.g. on Render) it listens on 0.0.0.0:$PORT instead.
 * bootstrap.js checks MySQL first, then calls app.listen(); this file prints the URL and
 * handles Ctrl+C (graceful shutdown: stop accepting requests, then close the DB pool).
 * Prerequisites: `npm install` (express + mysql2) and the MySQL database created by
 * database/carzone_db.sql (see README).
 */
import { logger } from './src/utils/logger.js';

try {
  // Imported dynamically so a missing `npm install` produces the friendly hint below.
  const { startServer } = await import('./src/bootstrap.js');
  const { url, publicUrl, listening, close } = await startServer();
  const { config } = await import('./src/config/index.js');
  console.log(`
  ===========================================================
     CarZone - Car Wash, Detailing & Accessories
     Website : ${publicUrl}
     Admin   : ${publicUrl}/admin
     Health  : ${publicUrl}/api/health${config.isProduction ? `
     Mode    : production (listening on ${listening}, local check: ${url})` : `
     Stop    : press Ctrl + C`}
  ===========================================================
  `);

  const shutdown = async () => {
    logger.info('Shutting down...');
    await close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (err) {
  if (err.code === 'EADDRINUSE') {
    logger.error('Port is already in use. Close the other program or set a different PORT in .env');
  } else if (err.code === 'CONFIG_INVALID') {
    logger.error(err.message);
    logger.error('See docs/DEPLOYMENT.md > Troubleshooting.');
  } else if (err.code === 'ERR_MODULE_NOT_FOUND') {
    logger.error(`${err.message}\nRun "npm install" in the project folder (installs express and mysql2).`);
  } else {
    logger.error(err.message);
    logger.error('See README > Troubleshooting (or docs/DEPLOYMENT.md when deployed) for help.');
  }
  process.exit(1);
}
