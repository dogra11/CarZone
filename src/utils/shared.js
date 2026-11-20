/**
 * shared.js - Re-exports the browser/server shared modules from the root shared/ folder
 * (also bundled into the React client), so backend files can import them with a short, stable path.
 */
export * from '../../shared/constants.js';
export { validate, schemas, luhnValid } from '../../shared/validation.js';
