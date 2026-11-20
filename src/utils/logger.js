/**
 * logger.js - Minimal console logger with timestamps and levels.
 */
const stamp = () => new Date().toLocaleTimeString('en-IN', { hour12: false });

export const logger = {
  info: (...args) => console.log(`[${stamp()}] INFO `, ...args),
  warn: (...args) => console.warn(`[${stamp()}] WARN `, ...args),
  error: (...args) => console.error(`[${stamp()}] ERROR`, ...args),
};
