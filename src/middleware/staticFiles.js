/**
 * staticFiles.js - Serves the built React app (client/dist) with express.static(),
 * plus the "SPA fallback".
 *
 * express.static (built into Express) streams real files - JS, CSS, images, fonts -
 * and already handles ETags, 304 Not Modified, HEAD requests and path-traversal
 * protection ("/../server.js" can never escape client/dist).
 *
 * CACHE HEADERS
 *   - app.js, app.css, index.html : "no-cache" -> the browser keeps a copy but re-checks
 *     it with the ETag every time, so a rebuild shows up immediately (file names are
 *     not content-hashed).
 *   - images, fonts, icons        : cached for 1 day (they rarely change).
 *
 * SPA FALLBACK: React Router URLs such as /dashboard/bookings are not files. For any
 * GET without a file extension we return index.html and the React router in the
 * browser decides which page to show (including its own 404 page). Missing files with
 * an extension (e.g. /assets/missing.png) get a real 404. /api URLs never reach this
 * point: the API router ends with its own JSON 404.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from '../config/index.js';

const LONG_CACHE_DIRS = ['images', 'fonts', 'icons'].map((d) => path.join(config.publicDir, 'assets', d) + path.sep);

export const staticFiles = express.static(config.publicDir, {
  index: false,       // "/" is handled by the SPA fallback below (one place serves index.html)
  redirect: false,    // "/assets" (a folder) is a page URL for us, not a redirect to "/assets/"
  dotfiles: 'ignore',
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const longCache = LONG_CACHE_DIRS.some((dir) => filePath.startsWith(dir));
    res.setHeader('Cache-Control', longCache ? 'public, max-age=86400' : 'no-cache');
  },
});

const indexFile = path.join(config.publicDir, 'index.html');

export function spaFallback(req, res, next) {
  const isAsset = path.extname(req.path) !== '';
  if ((req.method === 'GET' || req.method === 'HEAD') && !isAsset) {
    if (!fs.existsSync(indexFile)) {
      return res.status(503).send('<h1>Frontend not built</h1><p>Run <code>npm run build:client</code> to create client/dist.</p>');
    }
    // res.sendFile needs an absolute path; read errors are passed to next(err) by Express.
    return res.sendFile(indexFile, { headers: { 'Cache-Control': 'no-cache' } });
  }
  res.status(404).type('text/plain').send('Not found');
}
