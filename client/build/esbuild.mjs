/**
 * build/esbuild.mjs - OFFLINE production build of the React app (no `npm install` needed).
 *
 * Vite is the normal tool (`npm run build`), but it must be downloaded from npm.
 * This script produces the same kind of output with esbuild, using React and esbuild
 * from any node_modules folder it can find (client/node_modules or the global one):
 *
 *   src/main.jsx  --esbuild-->  dist/assets/app.js  (React bundled in, minified)
 *   src/styles/*  --esbuild-->  dist/assets/app.css
 *   public/*      --copied-->   dist/*               (images, fonts, icons)
 *   index.html    --rewritten-> dist/index.html      (points at the bundles)
 *
 * Run from the project root:  npm run build:client
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(CLIENT, 'dist');

// Places where react / react-dom / esbuild may be installed.
const searchPaths = [path.join(CLIENT, 'node_modules'), '/opt/npm-tools/node_modules'];
try { searchPaths.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()); } catch { /* npm not on PATH */ }
const existing = searchPaths.filter((p) => fs.existsSync(p));

async function loadEsbuild() {
  for (const dir of existing) {
    try {
      const req = createRequire(path.join(dir, 'noop.js'));
      return await import(pathToFileURL(req.resolve('esbuild')).href);
    } catch { /* try next */ }
  }
  throw new Error('esbuild not found. Run "cd client && npm install" (or use "npm run build" with Vite).');
}

const esbuild = await loadEsbuild();
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(CLIENT, 'public'), DIST, { recursive: true });

await esbuild.build({
  entryPoints: { app: path.join(CLIENT, 'src', 'main.jsx') },
  bundle: true,
  minify: true,
  sourcemap: false,
  format: 'esm',
  target: ['es2022'],
  jsx: 'automatic',
  outdir: path.join(DIST, 'assets'),
  nodePaths: existing,
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false' },
  external: ['/assets/*'],          // fonts/images referenced from CSS are served as-is
  loader: { '.js': 'jsx' },
  logLevel: 'info',
});

const html = fs.readFileSync(path.join(CLIENT, 'index.html'), 'utf8')
  .replace('<script type="module" src="/src/main.jsx"></script>', '<script type="module" src="/assets/app.js"></script>')
  .replace('</head>', '  <link rel="stylesheet" href="/assets/app.css" />\n  </head>');
fs.writeFileSync(path.join(DIST, 'index.html'), html);
console.log('React app built into client/dist');
