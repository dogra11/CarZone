/**
 * services/api.js - One small wrapper around fetch() used by the whole React app.
 *
 * - Sends/receives JSON; the browser adds the HttpOnly session cookie automatically.
 * - Unwraps the server's { ok, data } envelope and returns just `data`.
 * - Throws ApiError with .status, .message and .fields (server-side field errors,
 *   which forms show next to the matching inputs).
 */
export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

async function request(method, url, body) {
  const options = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new ApiError(0, 'Cannot reach the CarZone server. Please check that it is running.');
  }

  let payload = null;
  try { payload = await response.json(); } catch { /* not JSON */ }

  if (!response.ok || !payload || payload.ok !== true) {
    throw new ApiError(response.status, payload?.error?.message || `Request failed (${response.status})`, payload?.error?.fields);
  }
  return payload.data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
