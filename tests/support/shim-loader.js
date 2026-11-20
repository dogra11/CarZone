/**
 * tests/support/shim-loader.js - TEST-ONLY Node module-resolution hook.
 *
 *   mysql2 / mysql2/promise  ->  ./mysql2-sqlite-shim.js   (MySQL replaced by node:sqlite)
 *   express                  ->  ./express-shim/index.js   (Express 4 subset, offline testing)
 *
 * Only active when Node is started with `--import ./tests/support/register-shim.js`
 * (npm test, npm run start:test-db). `npm start` uses the real packages from node_modules.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'mysql2/promise' || specifier === 'mysql2') {
    return { url: new URL('./mysql2-sqlite-shim.js', import.meta.url).href, shortCircuit: true };
  }
  if (specifier === 'express') {
    return { url: new URL('./express-shim/index.js', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
