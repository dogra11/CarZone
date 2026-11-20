/**
 * pages/admin/helpers.jsx - Small helpers shared by the admin sections.
 */
import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../components/Toast.jsx';
import { useConfirm } from '../../components/Modal.jsx';

/** Paise -> rupee string for edit forms ('' when empty). */
export const rupees = (paise) => (paise === undefined || paise === null ? '' : String(paise / 100));

/** Delays a fast-changing value (search box) so we do not call the API on every key press. */
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Builds "?a=1&b=2" from an object, skipping empty values. */
export const qs = (obj) => {
  const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Returns run(options): asks for confirmation, calls the API, toasts the result, reloads. */
export function useAction() {
  const toast = useToast();
  const confirm = useConfirm();
  return async ({ title, message, confirmText = 'Confirm', danger = false, request, done, skipConfirm = false }) => {
    if (!skipConfirm && !(await confirm({ title, message, confirmText, danger }))) return;
    try {
      const r = await request();
      toast.success(r?.message || 'Done');
      done?.(r);
    } catch (err) {
      toast.error(err.message);
    }
  };
}

export function Select({ value, onChange, options, label }) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder }) {
  return <input className="input" type="search" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function ActiveBadge({ active, on = 'Active', off = 'Inactive' }) {
  return <span className={`badge ${active ? 'badge-success' : 'badge-muted'}`}>{active ? on : off}</span>;
}

export { api };

/** Short Indian-style amount for chart centres: 241847.45 rupees -> "₹2.42L". */
export function shortINR(paise) {
  const r = paise / 100;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)}Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(2)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(1)}K`;
  return `₹${Math.round(r)}`;
}
