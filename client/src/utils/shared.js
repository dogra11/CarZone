/**
 * utils/shared.js - Re-exports the validation rules and constants that are SHARED with
 * the Node.js backend (root folder /shared). Client and server validate with the same code.
 */
export * from '../../../shared/constants.js';
export { validate, validateField, schemas, luhnValid } from '../../../shared/validation.js';
