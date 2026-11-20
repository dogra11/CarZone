/**
 * hooks/useApi.js - DATA FETCHING with useEffect.
 *
 *   const { data, loading, error, reload } = useApi('/api/services');
 *
 * - Runs the GET request when the component mounts and whenever the URL changes.
 * - `cancelled` ignores responses that arrive after the component has unmounted or the
 *   URL changed (prevents race conditions and "state update on unmounted component").
 * - reload() fetches again, e.g. after a successful edit.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api.js';

export function useApi(url, { skip = false } = {}) {
  const [state, setState] = useState({ data: null, loading: !skip, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (skip || !url) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api.get(url)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (!cancelled) setState({ data: null, loading: false, error }); });
    return () => { cancelled = true; };
  }, [url, skip, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) };
}
