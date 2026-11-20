/**
 * hooks/useMeta.js - Company details and business rules (GST, pickup fee, refund policy).
 * Fetched once and cached in a module variable, so every component shares one request.
 */
import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

let cache = null;
let pending = null;

export function loadMeta() {
  if (cache) return Promise.resolve(cache);
  pending = pending || api.get('/api/meta').then((m) => { cache = m; return m; }).finally(() => { pending = null; });
  return pending;
}

export function useMeta() {
  const [meta, setMeta] = useState(cache);
  useEffect(() => {
    if (!cache) loadMeta().then(setMeta).catch(() => setMeta(null));
  }, []);
  return meta;
}
