/**
 * env.js - A tiny ".env" file loader (our own replacement for the "dotenv" package).
 *
 * It reads KEY=VALUE lines from the project's .env file (if it exists) and copies
 * them into process.env. Values that are already set in the real environment win,
 * so you can still override anything from the terminal.
 */
import fs from 'node:fs';

export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Strip optional surrounding quotes: KEY="value" or KEY='value'
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}
