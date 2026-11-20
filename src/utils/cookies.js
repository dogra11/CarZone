/**
 * cookies.js - Parses the Cookie request header into an object: "a=1; b=2" -> { a: '1', b: '2' }.
 * Used by middleware/cookies.js. (Setting cookies is done with Express's res.cookie().)
 */
export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (!key) continue;
    try { out[key] = decodeURIComponent(part.slice(eq + 1).trim()); } catch { out[key] = part.slice(eq + 1).trim(); }
  }
  return out;
}
