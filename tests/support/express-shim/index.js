/**
 * tests/support/express-shim/index.js - TEST-ONLY stand-in for the `express` package (v4).
 *
 * !! NOT PART OF THE APPLICATION !!  The shipped app imports the real `express` from
 * node_modules (`npm install`). This file exists only because the automated tests and
 * the UI checks had to run on a machine with no internet access, where Express could not
 * be installed. It is wired in by tests/support/shim-loader.js (a Node module-resolution
 * hook) exactly like the mysql2 -> SQLite shim, and only when Node is started with
 * `--import ./tests/support/register-shim.js` (npm test / npm run start:test-db).
 *
 * It implements ONLY the subset of the Express 4 API that CarZone uses, following the
 * behaviour of express 4.21 / router / body-parser 1.20 / serve-static 1.16 / send 0.19 /
 * cookie 0.7:
 *   express(), app.set/get/enable/disable ('trust proxy' as true/false/hop count),
 *   app.use/get/post/put/patch/delete/listen,
 *   express.Router() (mounting, :params, next('route'), next('router')),
 *   middleware (req, res, next) + error middleware (err, req, res, next) chosen by arity,
 *   req.params/query/body/cookies/ip/protocol/secure/path/baseUrl/originalUrl/get(),
 *   res.status/json/send/set/get/append/type/cookie/clearCookie/redirect/location/sendFile,
 *   express.json, express.raw, express.static.
 *
 * Where real Express would silently accept something questionable, this shim THROWS
 * instead (unknown option names for static/json/raw/cookie, deprecated signatures such as
 * res.redirect(url, status) or clearCookie with maxAge), so mistakes surface in tests.
 * Not implemented: sub-apps, app.param, app.route, view rendering, Range requests,
 * automatic OPTIONS responses, req.is/accepts, res.format/download/attachment/vary.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import querystring from 'node:querystring';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const STATUS_TEXT = http.STATUS_CODES;

// ----------------------------------------------------------------------------------
// Path matching (path-to-regexp 0.1.x semantics, ":param" segments only)
// ----------------------------------------------------------------------------------
function compile(routePath, { end, caseSensitive = false, strict = false }) {
  if (typeof routePath !== 'string') throw new TypeError('shim: only string paths are supported');
  if (!end && (routePath === '/' || routePath === '')) return { fastSlash: true, keys: [] };
  const keys = [];
  let p = strict ? routePath : routePath.replace(/\/+$/, '');
  if (/[*()?+]/.test(p.replace(/:\w+/g, ''))) throw new Error(`shim: unsupported path pattern "${routePath}"`);
  p = p.replace(/[.\\[\]{}^$|]/g, '\\$&').replace(/\/:(\w+)/g, (_, key) => { keys.push(key); return '\\/(?:([^\\/]+?))'; });
  const tail = strict ? '' : '\\/?';
  const regexp = new RegExp(`^${p}${tail}${end ? '$' : '(?=\\/|$)'}`, caseSensitive ? '' : 'i');
  return { regexp, keys };
}

function decodeParam(val) {
  try { return decodeURIComponent(val); } catch (err) {
    const e = new Error(`Failed to decode param '${val}'`);
    e.status = e.statusCode = 400;
    throw e;
  }
}

class Layer {
  constructor(routePath, options, fn) {
    if (typeof fn !== 'function') throw new TypeError(`shim: middleware must be a function, got ${Object.prototype.toString.call(fn)}`);
    this.handle = fn;
    this.name = fn.name || '<anonymous>';
    Object.assign(this, compile(routePath, options));
    this.route = undefined;
  }

  match(pathname) {
    if (this.fastSlash) { this.params = {}; this.path = ''; return true; }
    const m = this.regexp.exec(pathname);
    if (!m) { this.params = undefined; this.path = undefined; return false; }
    this.params = {};
    this.path = m[0];
    this.keys.forEach((k, i) => { if (m[i + 1] !== undefined) this.params[k] = decodeParam(m[i + 1]); });
    return true;
  }

  handleError(err, req, res, next) {
    if (this.handle.length !== 4) return next(err);          // normal middleware is skipped on error
    try { this.handle(err, req, res, next); } catch (e) { next(e); }
  }

  handleRequest(req, res, next) {
    if (this.handle.length > 3) return next();                // error middleware is skipped without error
    try { this.handle(req, res, next); } catch (e) { next(e); }
  }
}

class Route {
  constructor(routePath) { this.path = routePath; this.stack = []; this.methods = {}; }

  handlesMethod(method) {
    let name = method.toLowerCase();
    if (name === 'head' && !this.methods.head) name = 'get';
    return Boolean(this.methods[name]);
  }

  addHandlers(method, handlers) {
    for (const fn of handlers.flat(Infinity)) {
      if (typeof fn !== 'function') {
        throw new TypeError(`Route.${method}() requires a callback function but got a ${Object.prototype.toString.call(fn)}`);
      }
      const layer = new Layer('/', { end: false }, fn);
      layer.method = method;
      this.methods[method] = true;
      this.stack.push(layer);
    }
  }

  dispatch(req, res, done) {
    let idx = 0;
    let method = req.method.toLowerCase();
    if (method === 'head' && !this.methods.head) method = 'get';
    req.route = this;
    const next = (err) => {
      if (err === 'route') return done();
      if (err === 'router') return done(err);
      let layer;
      while ((layer = this.stack[idx++])) if (layer.method === method) break;
      if (!layer) return done(err);
      if (err) layer.handleError(err, req, res, next);
      else layer.handleRequest(req, res, next);
    };
    next();
  }
}

// ----------------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------------
function createRouter(options = {}) {
  const opts = { caseSensitive: Boolean(options.caseSensitive), strict: Boolean(options.strict) };
  function router(req, res, next) { router.handle(req, res, next); }
  router.stack = [];
  router.__isShimRouter = true;

  router.use = function use(...args) {
    let mount = '/';
    if (typeof args[0] === 'string') mount = args.shift();
    const fns = args.flat(Infinity);
    if (fns.length === 0) throw new TypeError('Router.use() requires a middleware function');
    for (const fn of fns) {
      if (typeof fn !== 'function') throw new TypeError(`Router.use() requires a middleware function but got a ${Object.prototype.toString.call(fn)}`);
      this.stack.push(new Layer(mount, { ...opts, end: false }, fn));
    }
    return this;
  };

  router.route = function route(routePath) {
    const r = new Route(routePath);
    const layer = new Layer(routePath, { ...opts, end: true }, (req, res, next) => r.dispatch(req, res, next));
    layer.route = r;
    this.stack.push(layer);
    return r;
  };

  for (const m of METHODS) {
    router[m] = function routeMethod(routePath, ...handlers) {
      this.route(routePath).addHandlers(m, handlers);
      return this;
    };
  }

  router.handle = function handle(req, res, out) {
    let idx = 0;
    let removed = '';
    let slashAdded = false;
    const parentUrl = req.baseUrl || '';
    const parentParams = req.params;
    const parentNext = req.next;

    const done = (err) => {
      req.baseUrl = parentUrl;
      req.params = parentParams;
      req.next = parentNext;
      out(err);
    };
    req.next = next;

    function next(err) {
      let layerError = err === 'route' ? null : err;
      if (slashAdded) { req.url = req.url.slice(1); slashAdded = false; }
      if (removed.length !== 0) { req.baseUrl = parentUrl; req.url = removed + req.url; removed = ''; }
      if (layerError === 'router') return setImmediate(done, null);
      if (idx >= router.stack.length) return setImmediate(done, layerError);

      const pathname = req.url.split('?')[0];
      let layer;
      let match = false;
      while (!match && idx < router.stack.length) {
        layer = router.stack[idx++];
        try { match = layer.match(pathname); } catch (e) { layerError = layerError || e; match = false; continue; }
        if (!match) continue;
        if (!layer.route) continue;
        if (layerError) { match = false; continue; }         // routes never handle errors
        if (!layer.route.handlesMethod(req.method)) match = false;
      }
      if (!match) return done(layerError);

      req.params = { ...layer.params };
      if (layer.route) return layer.handleRequest(req, res, next);

      // Middleware / mounted router: strip the matched prefix from req.url
      const layerPath = layer.path;
      if (layerPath.length !== 0) {
        const c = pathname[layerPath.length];
        if (c && c !== '/' && c !== '.') return next(layerError);
        removed = layerPath;
        req.url = req.url.slice(removed.length);
        if (req.url[0] !== '/') { req.url = '/' + req.url; slashAdded = true; }
        req.baseUrl = parentUrl + (removed.endsWith('/') ? removed.slice(0, -1) : removed);
      }
      if (layerError) layer.handleError(layerError, req, res, next);
      else layer.handleRequest(req, res, next);
    }
    next();
  };
  return router;
}

// ----------------------------------------------------------------------------------
// Request / response prototypes
// ----------------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json', '.map': 'application/json', '.txt': 'text/plain', '.md': 'text/markdown', '.csv': 'text/csv',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.xml': 'application/xml',
};
const SHORT_TYPES = { html: 'text/html', text: 'text/plain', txt: 'text/plain', json: 'application/json', js: 'application/javascript', css: 'text/css', csv: 'text/csv', bin: 'application/octet-stream', xml: 'application/xml' };
const lookupMime = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
const charsetFor = (type) => (/^text\/|^application\/(javascript|json)/.test(type) ? 'UTF-8' : null);
function setCharset(type, charset) {
  const base = type.split(';')[0].trim();
  const params = type.split(';').slice(1).map((s) => s.trim()).filter((s) => s && !/^charset=/i.test(s));
  return [base, ...params, `charset=${charset}`].join('; ');
}

const request = Object.create(http.IncomingMessage.prototype);
request.get = request.header = function get(name) {
  if (typeof name !== 'string') throw new TypeError('name must be a string to req.get');
  const lc = name.toLowerCase();
  if (lc === 'referer' || lc === 'referrer') return this.headers.referrer || this.headers.referer;
  return this.headers[lc];
};
Object.defineProperty(request, 'path', { configurable: true, enumerable: true, get() { return this.url.split('?')[0]; } });
// 'trust proxy' (express 4 / proxy-addr): only booleans and hop counts are supported here.
function compileTrust(val) {
  if (val === true) return () => true;
  if (val === false || val === undefined) return () => false;
  if (typeof val === 'number') return (addr, i) => i < val;
  throw new Error(`shim: unsupported 'trust proxy' value ${JSON.stringify(val)} (use true/false or a hop count)`);
}
const trustFn = (req) => req.app?.get?.('trust proxy fn') || (() => false);
Object.defineProperty(request, 'ip', {
  configurable: true,
  enumerable: true,
  get() {
    // proxy-addr: [socket address, ...X-Forwarded-For from right to left]; walk while trusted.
    const forwarded = String(this.headers['x-forwarded-for'] || '').split(',').map((a) => a.trim()).filter(Boolean).reverse();
    const addrs = [this.socket?.remoteAddress, ...forwarded];
    const trust = trustFn(this);
    for (let i = 0; i < addrs.length - 1; i++) if (!trust(addrs[i], i)) return addrs[i];
    return addrs[addrs.length - 1];
  },
});
Object.defineProperty(request, 'protocol', {
  configurable: true,
  enumerable: true,
  get() {
    const proto = this.socket?.encrypted ? 'https' : 'http';
    if (!trustFn(this)(this.socket?.remoteAddress, 0)) return proto;
    const header = String(this.headers['x-forwarded-proto'] || proto);
    return header.split(',')[0].trim();
  },
});
Object.defineProperty(request, 'secure', { configurable: true, enumerable: true, get() { return this.protocol === 'https'; } });
Object.defineProperty(request, 'hostname', { configurable: true, enumerable: true, get() { return (this.headers.host || '').replace(/:\d+$/, '') || undefined; } });

function freshness(reqHeaders, resHeaders) {
  const modifiedSince = reqHeaders['if-modified-since'];
  const noneMatch = reqHeaders['if-none-match'];
  if (!modifiedSince && !noneMatch) return false;
  if (/(?:^|,)\s*?no-cache\s*?(?:,|$)/.test(reqHeaders['cache-control'] || '')) return false;
  if (noneMatch && noneMatch !== '*') {
    const etag = resHeaders.etag;
    if (!etag) return false;
    const tokens = noneMatch.split(',').map((t) => t.trim());
    if (!tokens.some((t) => t === etag || t === `W/${etag}` || `W/${t}` === etag)) return false;
  }
  if (modifiedSince) {
    const lastModified = resHeaders['last-modified'];
    if (!lastModified || !(Date.parse(lastModified) <= Date.parse(modifiedSince))) return false;
  }
  return true;
}

const response = Object.create(http.ServerResponse.prototype);
response.status = function status(code) {
  if (!Number.isInteger(code) || code < 100 || code > 999) throw new RangeError(`Invalid status code: ${code}`);
  this.statusCode = code;
  return this;
};
response.set = response.header = function set(field, val) {
  if (typeof field === 'object' && field !== null) {
    for (const key of Object.keys(field)) this.set(key, field[key]);
    return this;
  }
  let value = Array.isArray(val) ? val.map(String) : String(val);
  if (field.toLowerCase() === 'content-type') {
    if (Array.isArray(value)) throw new TypeError('Content-Type cannot be set to an Array');
    if (!/;\s*charset\s*=/.test(value)) {
      const charset = charsetFor(value.split(';')[0]);
      if (charset) value += '; charset=' + charset.toLowerCase();
    }
  }
  this.setHeader(field, value);   // throws ERR_HTTP_HEADERS_SENT after the response started, like Express
  return this;
};
response.get = function get(field) { return this.getHeader(field); };
response.append = function append(field, val) {
  const prev = this.get(field);
  let value = val;
  if (prev) value = [].concat(prev, val);
  return this.set(field, value);
};
response.type = response.contentType = function type(t) {
  const ct = t.indexOf('/') === -1 ? (SHORT_TYPES[t.replace(/^\./, '')] || lookupMime('x.' + t)) : t;
  return this.set('Content-Type', ct);
};
response.send = function send(body) {
  let chunk = body;
  let encoding;
  const req = this.req;
  if (typeof chunk === 'number' || arguments.length > 1) throw new TypeError('shim: res.send(status) / res.send(body, status) are deprecated - use res.status(code).send(body)');
  if (chunk === null || chunk === undefined) chunk = '';
  if (typeof chunk === 'boolean' || (typeof chunk === 'object' && !Buffer.isBuffer(chunk))) return this.json(chunk);
  if (typeof chunk === 'string') {
    encoding = 'utf8';
    if (!this.get('Content-Type')) this.type('html');
    this.set('Content-Type', setCharset(String(this.get('Content-Type')), 'utf-8'));
  } else if (!this.get('Content-Type')) {
    this.type('bin');
  }

  const app = this.app;
  let len = typeof chunk === 'string' ? Buffer.byteLength(chunk, encoding) : chunk.length;
  this.set('Content-Length', len);

  const etagFn = app?.get('etag fn');
  if (etagFn && len > 0 && (req.method === 'GET' || req.method === 'HEAD') && !this.get('ETag')) {
    this.set('ETag', etagFn(chunk, encoding));
  }
  if ((this.statusCode >= 200 && this.statusCode < 300) || this.statusCode === 304) {
    if ((req.method === 'GET' || req.method === 'HEAD') && freshness(req.headers, { etag: this.get('ETag'), 'last-modified': this.get('Last-Modified') })) {
      this.statusCode = 304;
    }
  }
  if (this.statusCode === 204 || this.statusCode === 304) {
    this.removeHeader('Content-Type');
    this.removeHeader('Content-Length');
    this.removeHeader('Transfer-Encoding');
    chunk = '';
  }
  if (req.method === 'HEAD') this.end();
  else this.end(chunk, encoding);
  return this;
};
response.json = function json(obj) {
  if (arguments.length > 1) throw new TypeError('shim: res.json(obj, status) is deprecated - use res.status(code).json(obj)');
  const app = this.app;
  const body = JSON.stringify(obj, app?.get('json replacer'), app?.get('json spaces'));
  if (!this.get('Content-Type')) this.set('Content-Type', 'application/json');
  return this.send(body === undefined ? '' : body);
};

// --- cookies (express res.cookie + cookie@0.7 serialize) ---
const COOKIE_OPTIONS = ['maxAge', 'expires', 'path', 'domain', 'httpOnly', 'secure', 'sameSite', 'signed', 'encode', 'priority', 'partitioned'];
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
function serializeCookie(name, val, opt) {
  if (!COOKIE_NAME.test(name)) throw new TypeError('argument name is invalid');
  const value = (opt.encode || encodeURIComponent)(val);
  let str = `${name}=${value}`;
  if (opt.maxAge != null) {
    const maxAge = opt.maxAge - 0;
    if (Number.isNaN(maxAge) || !Number.isFinite(maxAge)) throw new TypeError('option maxAge is invalid');
    str += '; Max-Age=' + Math.floor(maxAge);
  }
  if (opt.domain) str += '; Domain=' + opt.domain;
  if (opt.path) str += '; Path=' + opt.path;
  if (opt.expires) {
    if (!(opt.expires instanceof Date) || Number.isNaN(opt.expires.valueOf())) throw new TypeError('option expires is invalid');
    str += '; Expires=' + opt.expires.toUTCString();
  }
  if (opt.httpOnly) str += '; HttpOnly';
  if (opt.secure) str += '; Secure';
  if (opt.partitioned) str += '; Partitioned';
  if (opt.priority) str += '; Priority=' + ({ low: 'Low', medium: 'Medium', high: 'High' }[String(opt.priority).toLowerCase()] || (() => { throw new TypeError('option priority is invalid'); })());
  if (opt.sameSite) {
    const s = typeof opt.sameSite === 'string' ? opt.sameSite.toLowerCase() : opt.sameSite;
    const map = { true: 'Strict', lax: 'Lax', strict: 'Strict', none: 'None' };
    if (!map[s]) throw new TypeError('option sameSite is invalid');
    str += '; SameSite=' + map[s];
  }
  return str;
}
response.cookie = function cookie(name, value, options = {}) {
  const unknown = Object.keys(options).filter((k) => !COOKIE_OPTIONS.includes(k));
  if (unknown.length) throw new TypeError(`shim: unknown res.cookie option(s): ${unknown.join(', ')}`);
  const opts = { ...options };
  if (opts.signed && !this.req.secret) throw new Error('cookieParser("secret") required for signed cookies');
  if (opts.signed) throw new Error('shim: signed cookies are not implemented');
  const val = typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value);
  if (opts.maxAge != null) {
    const maxAge = opts.maxAge - 0;
    if (!Number.isNaN(maxAge)) {
      opts.expires = new Date(Date.now() + maxAge);
      opts.maxAge = Math.floor(maxAge / 1000);
    }
  }
  if (opts.path == null) opts.path = '/';
  return this.append('Set-Cookie', serializeCookie(name, String(val), opts));
};
response.clearCookie = function clearCookie(name, options) {
  if (options && (options.maxAge || options.expires)) {
    throw new TypeError('shim: passing maxAge/expires to res.clearCookie is deprecated in Express 4.21');
  }
  return this.cookie(name, '', { expires: new Date(1), path: '/', ...options });
};

// --- redirects ---
const ENCODE_CHARS = /(?:[^\x21\x25\x26-\x3B\x3D\x3F-\x5B\x5D\x5F\x61-\x7A\x7E]|%(?:[^0-9A-Fa-f]|[0-9A-Fa-f][^0-9A-Fa-f]|$))+/g;
const encodeUrl = (url) => String(url).replace(ENCODE_CHARS, (s) => encodeURI(s));
response.location = function location(url) {
  const loc = url === 'back' ? (this.req.get('Referrer') || '/') : url;
  return this.set('Location', encodeUrl(loc));
};
response.redirect = function redirect(...args) {
  let status = 302;
  let address = args[0];
  if (args.length === 2) {
    if (typeof args[0] !== 'number') throw new TypeError('shim: res.redirect(url, status) is deprecated - use res.redirect(status, url)');
    [status, address] = args;
  }
  this.location(address);
  address = this.get('Location');
  const body = `${STATUS_TEXT[status]}. Redirecting to ${address}`;
  this.statusCode = status;
  this.set('Content-Type', 'text/plain; charset=utf-8');
  this.set('Content-Length', Buffer.byteLength(body));
  if (this.req.method === 'HEAD') this.end(); else this.end(body);
};

// --- file sending (express res.sendFile / send@0.19) ---
function httpError(status, message, props = {}) {
  const err = new Error(message || STATUS_TEXT[status]);
  err.status = err.statusCode = status;
  err.expose = status < 500;
  return Object.assign(err, props);
}

/**
 * Serves one file the way the `send` module does. onError(err) is called for any
 * failure before headers are written; onDirectory() when the path is a folder.
 */
function sendFileStream(req, res, filePath, { etag = true, lastModified = true, cacheControl = true, maxAge = 0, immutable = false, beforeHeaders, onError, onDirectory, onEnd }) {
  fs.stat(filePath, (err, stat) => {
    if (err) {
      const status = ['ENOENT', 'ENAMETOOLONG', 'ENOTDIR'].includes(err.code) ? 404 : 500;
      return onError(httpError(status, null, { code: err.code, syscall: err.syscall, path: err.path }));
    }
    if (stat.isDirectory()) return onDirectory ? onDirectory() : onError(httpError(404, null, { code: 'EISDIR' }));
    if (res.headersSent) return onError(httpError(500, "Can't set headers after they are sent."));

    beforeHeaders?.(res, filePath, stat);
    if (!res.getHeader('Accept-Ranges')) res.setHeader('Accept-Ranges', 'bytes');
    if (cacheControl && !res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', `public, max-age=${Math.floor(maxAge / 1000)}${immutable ? ', immutable' : ''}`);
    }
    if (lastModified && !res.getHeader('Last-Modified')) res.setHeader('Last-Modified', stat.mtime.toUTCString());
    if (etag && !res.getHeader('ETag')) res.setHeader('ETag', `W/"${stat.size.toString(16)}-${stat.mtime.getTime().toString(16)}"`);
    if (!res.getHeader('Content-Type')) {
      const type = lookupMime(filePath);
      const charset = charsetFor(type);
      res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
    }
    const cachable = (res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 304;
    if (cachable && freshness(req.headers, { etag: res.getHeader('ETag'), 'last-modified': res.getHeader('Last-Modified') })) {
      for (const h of res.getHeaderNames()) if (h.startsWith('content-') && h !== 'content-location') res.removeHeader(h);
      res.statusCode = 304;
      res.end();
      return onEnd?.();
    }
    res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') { res.end(); return onEnd?.(); }
    const stream = fs.createReadStream(filePath);
    stream.on('error', (e) => { res.destroy(e); });
    stream.on('end', () => onEnd?.());
    stream.pipe(res);
  });
}

const SENDFILE_OPTIONS = ['maxAge', 'root', 'lastModified', 'headers', 'dotfiles', 'acceptRanges', 'cacheControl', 'immutable', 'etag'];
response.sendFile = function sendFile(filePath, options, callback) {
  let opts = options || {};
  let done = callback;
  if (typeof options === 'function') { done = options; opts = {}; }
  if (!filePath) throw new TypeError('path argument is required to res.sendFile');
  if (typeof filePath !== 'string') throw new TypeError('path must be a string to res.sendFile');
  if (!opts.root && !path.isAbsolute(filePath)) throw new TypeError('path must be absolute or specify root to res.sendFile');
  const unknown = Object.keys(opts).filter((k) => !SENDFILE_OPTIONS.includes(k));
  if (unknown.length) throw new TypeError(`shim: unknown res.sendFile option(s): ${unknown.join(', ')}`);
  const full = opts.root ? path.join(opts.root, filePath) : filePath;
  const req = this.req;
  const next = req.next;
  const finish = (err) => {
    if (done) return done(err);
    if (err && err.code === 'EISDIR') return next();
    if (err && err.code !== 'ECONNABORTED' && err.syscall !== 'write') next(err);
  };
  sendFileStream(req, this, full, {
    etag: opts.etag !== false,
    lastModified: opts.lastModified !== false,
    cacheControl: opts.cacheControl !== false,
    maxAge: typeof opts.maxAge === 'number' ? opts.maxAge : 0,
    immutable: Boolean(opts.immutable),
    beforeHeaders: (res) => { for (const [k, v] of Object.entries(opts.headers || {})) res.setHeader(k, v); },
    onError: (err) => finish(err),
    onEnd: () => { if (done) done(); },
  });
};

// ----------------------------------------------------------------------------------
// Body parsers (body-parser 1.20 semantics)
// ----------------------------------------------------------------------------------
function parseBytes(limit) {
  if (typeof limit === 'number') return limit;
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(String(limit));
  if (!m) throw new TypeError(`shim: invalid limit "${limit}"`);
  return Math.floor(Number(m[1]) * { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }[(m[2] || 'b').toLowerCase()]);
}
const hasBody = (req) => req.headers['transfer-encoding'] !== undefined || !Number.isNaN(Number.parseInt(req.headers['content-length'], 10));

function typeMatcher(type) {
  const types = [].concat(type);
  return (req) => {
    const ct = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ct) return false;
    return types.some((t) => {
      if (typeof t === 'function') return Boolean(t(req));
      const want = String(t).toLowerCase();
      if (want === '*/*') return true;
      if (want.startsWith('+')) return ct.endsWith(want);
      if (want.endsWith('/*')) return ct.startsWith(want.slice(0, -1));
      if (want.startsWith('*/')) return ct.endsWith(want.slice(1));
      return ct === want;
    });
  };
}

function readBody(req, limit, callback) {
  const chunks = [];
  let received = 0;
  let tooLarge = false;
  const length = Number.parseInt(req.headers['content-length'], 10);
  if (!Number.isNaN(length) && length > limit) tooLarge = true;
  req.on('data', (c) => {
    received += c.length;
    if (received > limit) tooLarge = true;
    if (!tooLarge) chunks.push(c);
  });
  req.on('end', () => {
    if (tooLarge) return callback(httpError(413, 'request entity too large', { type: 'entity.too.large', expected: length, length, limit }));
    callback(null, Buffer.concat(chunks));
  });
  req.on('error', (err) => callback(httpError(400, err.message, { type: 'request.aborted' })));
}

function makeBodyParser(kind, options = {}, allowed) {
  const unknown = Object.keys(options).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new TypeError(`shim: unknown express.${kind}() option(s): ${unknown.join(', ')}`);
  const limit = parseBytes(options.limit ?? '100kb');
  const shouldParse = typeMatcher(options.type ?? (kind === 'json' ? 'application/json' : 'application/octet-stream'));
  const strict = options.strict !== false;
  if (options.inflate === false) { /* no compressed bodies are ever sent in tests */ }

  return function bodyParser(req, res, next) {
    if (req._body) return next();
    req.body = req.body || {};
    if (!hasBody(req)) return next();
    if (!shouldParse(req)) return next();
    const charsetMatch = /;\s*charset\s*=\s*"?([^";]+)/i.exec(req.headers['content-type'] || '');
    const charset = (charsetMatch?.[1] || 'utf-8').toLowerCase();
    if (kind === 'json' && !charset.startsWith('utf-')) {
      return next(httpError(415, `unsupported charset "${charset.toUpperCase()}"`, { charset, type: 'charset.unsupported' }));
    }
    readBody(req, limit, (err, buf) => {
      if (err) return next(err);
      if (typeof options.verify === 'function') {
        try { options.verify(req, res, buf, 'utf-8'); } catch (e) { return next(httpError(403, e.message, { body: buf.toString(), type: e.type || 'entity.verify.failed' })); }
      }
      if (kind === 'raw') { req._body = true; req.body = buf; return next(); }
      const text = buf.toString('utf8');
      if (text.length === 0) { req._body = true; req.body = {}; return next(); }
      try {
        if (strict) {
          const first = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d])/.exec(text)?.[1];
          if (first !== '{' && first !== '[') throw new SyntaxError(`Unexpected token ${first} in JSON at position 0`);
        }
        req.body = JSON.parse(text, options.reviver);
        req._body = true;
        next();
      } catch (e) {
        next(httpError(400, e.message, { body: text, type: 'entity.parse.failed' }));
      }
    });
  };
}

// ----------------------------------------------------------------------------------
// express.static (serve-static 1.16 semantics, without directory listings)
// ----------------------------------------------------------------------------------
const STATIC_OPTIONS = ['acceptRanges', 'cacheControl', 'dotfiles', 'etag', 'extensions', 'fallthrough', 'immutable', 'index', 'lastModified', 'maxAge', 'redirect', 'setHeaders'];
function serveStatic(root, options = {}) {
  if (!root) throw new TypeError('root path required');
  if (typeof root !== 'string') throw new TypeError('root path must be a string');
  const unknown = Object.keys(options).filter((k) => !STATIC_OPTIONS.includes(k));
  if (unknown.length) throw new TypeError(`shim: unknown express.static option(s): ${unknown.join(', ')}`);
  if (options.setHeaders && typeof options.setHeaders !== 'function') throw new TypeError('option setHeaders must be function');
  if (options.extensions) throw new Error('shim: express.static "extensions" option is not implemented');
  const fallthrough = options.fallthrough !== false;
  const redirect = options.redirect !== false;
  const index = options.index === undefined ? ['index.html'] : (options.index === false ? [] : [].concat(options.index));
  const dotfiles = options.dotfiles || 'ignore';
  const rootDir = path.resolve(root);

  return function serveStaticMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (fallthrough) return next();
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.setHeader('Content-Length', '0');
      return res.end();
    }
    const forwardError = !fallthrough;
    const onError = (err) => {
      if (forwardError || !(err.statusCode < 500)) return next(err);
      next();
    };

    let pathname = req.url.split('?')[0];
    const original = req.originalUrl.split('?')[0];
    if (pathname === '/' && !original.endsWith('/')) pathname = '';

    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return onError(httpError(400)); }
    if (decoded.includes('\0')) return onError(httpError(400));
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(path.normalize('.' + path.sep + decoded))) return onError(httpError(403));
    const parts = path.normalize('.' + path.sep + decoded).split(path.sep);
    if (parts.some((p) => p.length > 1 && p[0] === '.')) {
      if (dotfiles === 'deny') return onError(httpError(403));
      if (dotfiles === 'ignore') return onError(httpError(404));
    }
    const full = path.normalize(path.join(rootDir, decoded));

    const serveIndex = (dir, i = 0) => {
      if (i >= index.length) return onError(httpError(404));
      const candidate = path.join(dir, index[i]);
      fs.stat(candidate, (err, stat) => {
        if (err || stat.isDirectory()) return serveIndex(dir, i + 1);
        serve(candidate);
      });
    };
    const onDirectory = () => {
      if (redirect && !decoded.endsWith('/')) {
        const loc = encodeUrl(original + '/' + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?').slice(1).join('?') : ''));
        const body = `Redirecting to ${loc}`;
        res.statusCode = 301;
        res.setHeader('Content-Type', 'text/html; charset=UTF-8');
        res.setHeader('Content-Length', Buffer.byteLength(body));
        res.setHeader('Location', loc);
        return res.end(body);
      }
      if (decoded.endsWith('/') && index.length) return serveIndex(full);
      onError(httpError(404));
    };
    const serve = (file) => sendFileStream(req, res, file, {
      etag: options.etag !== false,
      lastModified: options.lastModified !== false,
      cacheControl: options.cacheControl !== false,
      maxAge: typeof options.maxAge === 'number' ? options.maxAge : 0,
      immutable: Boolean(options.immutable),
      beforeHeaders: options.setHeaders,
      onError,
      onDirectory,
    });
    if (decoded.endsWith('/') && index.length) return serveIndex(full);
    if (decoded === '' || decoded.endsWith('/')) return onDirectory();
    serve(full);
  };
}

// ----------------------------------------------------------------------------------
// express() application
// ----------------------------------------------------------------------------------
function weakEtag(body, encoding) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, encoding);
  const hash = crypto.createHash('sha1').update(buf).digest('base64').substring(0, 27);
  return `W/"${buf.length.toString(16)}-${hash}"`;
}

function compileQueryParser(val) {
  if (typeof val === 'function') return val;
  if (val === true || val === 'simple') return querystring.parse;
  if (val === false) return undefined;
  if (val === 'extended') return querystring.parse;   // shim approximation of qs (no nested objects)
  throw new TypeError(`unknown value for query parser function: ${val}`);
}

function finalHandler(req, res, env) {
  return (err) => {
    let status = 404;
    let msg = `Cannot ${req.method} ${encodeUrl(req.originalUrl.split('?')[0])}`;
    if (err) {
      status = err.status >= 400 && err.status < 600 ? err.status : (err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500);
      msg = env === 'production' ? STATUS_TEXT[status] : (err.stack || String(err));
      if (env !== 'test') console.error(err.stack || err);
    }
    if (res.headersSent) { req.socket?.destroy(); return; }
    const body = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${String(msg).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)}</pre>\n</body>\n</html>\n`;
    for (const h of ['Content-Encoding', 'Content-Language', 'Content-Range']) res.removeHeader(h);
    res.statusCode = status;
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body));
    if (req.method === 'HEAD') res.end(); else res.end(body);
  };
}

function express() {
  const app = function app(req, res, next) { app.handle(req, res, next); };
  const settings = {};
  let router;   // created lazily on first use/route, like Express's app.lazyrouter()
  app.settings = settings;
  app.request = Object.create(request, { app: { configurable: true, enumerable: true, writable: true, value: app } });
  app.response = Object.create(response, { app: { configurable: true, enumerable: true, writable: true, value: app } });

  app.set = function set(setting, val) {
    if (arguments.length === 1) return settings[setting];
    settings[setting] = val;
    if (setting === 'etag') settings['etag fn'] = val === false ? undefined : weakEtag;
    if (setting === 'query parser') settings['query parser fn'] = compileQueryParser(val);
    if (setting === 'trust proxy') settings['trust proxy fn'] = compileTrust(val);
    return this;
  };
  app.enable = (s) => app.set(s, true);
  app.disable = (s) => app.set(s, false);
  app.enabled = (s) => Boolean(app.set(s));
  app.disabled = (s) => !app.set(s);

  app.set('x-powered-by', true);
  app.set('etag', 'weak');
  app.set('env', process.env.NODE_ENV || 'development');
  app.set('query parser', 'extended');
  app.set('json spaces', undefined);
  app.set('trust proxy', false);

  // Built-in first middleware (Express's "query" + "expressInit"). Like real Express, the
  // query parser is captured when the router is created, and receives null without "?".
  const lazyRouter = () => {
    if (router) return router;
    router = createRouter({ caseSensitive: app.enabled('case sensitive routing'), strict: app.enabled('strict routing') });
    const parse = app.get('query parser fn');
    router.use(function query(req, res, next) {
      if (!req.query) {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : null;
        req.query = parse ? parse(qs) : {};
      }
      next();
    });
    router.use(function expressInit(req, res, next) {
    if (app.enabled('x-powered-by')) res.setHeader('X-Powered-By', 'Express');
    req.res = res;
    res.req = req;
    req.next = next;
    Object.setPrototypeOf(req, app.request);
    Object.setPrototypeOf(res, app.response);
    res.locals = res.locals || Object.create(null);
    next();
    });
    return router;
  };

  app.get = function get(...args) {
    if (args.length === 1 && typeof args[0] === 'string') return app.set(args[0]);
    lazyRouter().get(...args);
    return app;
  };
  for (const m of METHODS.filter((x) => x !== 'get')) app[m] = (...args) => { lazyRouter()[m](...args); return app; };
  app.use = (...args) => {
    const fns = args.filter((a) => typeof a !== 'string').flat(Infinity);
    if (fns.length === 0) throw new TypeError('app.use() requires a middleware function');
    lazyRouter().use(...args);
    return app;
  };
  app.handle = (req, res, callback) => {
    req.originalUrl = req.originalUrl || req.url;
    req.baseUrl = req.baseUrl || '';
    const done = callback || finalHandler(req, res, app.get('env'));
    if (!router) return done();
    router.handle(req, res, done);
  };
  app.listen = (...args) => {
    const server = http.createServer(app);
    return server.listen(...args);
  };
  return app;
}

express.Router = createRouter;
express.json = (options) => makeBodyParser('json', options, ['inflate', 'limit', 'reviver', 'strict', 'type', 'verify']);
express.raw = (options) => makeBodyParser('raw', options, ['inflate', 'limit', 'type', 'verify']);
express.static = serveStatic;
express.request = request;
express.response = response;
express.__isTestShim = true;

export default express;
