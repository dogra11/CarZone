/**
 * components/Toast.jsx - Toast notifications via a Context provider.
 *
 *   const toast = useToast();
 *   toast.success('Booking confirmed');  toast.error(err.message, 'Payment failed');
 *
 * ToastProvider (in main.jsx) keeps the list of toasts in state and renders them in a
 * fixed corner region (aria-live so screen readers announce them). Each toast removes
 * itself after a few seconds.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';

const ToastContext = createContext(null);
const ICONS = { success: 'check-circle', error: 'x-circle', warning: 'alert', info: 'info' };
const TITLES = { success: 'Success', error: 'Something went wrong', warning: 'Heads up', info: 'Note' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback((type, message, title) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-4), { id, type, message, title: title || TITLES[type] }]);
    setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4800);
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m, t) => show('success', m, t),
    error: (m, t) => show('error', m, t),
    warning: (m, t) => show('warning', m, t),
    info: (m, t) => show('info', m, t),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <Icon name={ICONS[t.type]} />
            <div><div className="toast-title">{t.title}</div><div className="toast-msg">{t.message}</div></div>
            <button className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="x" size="sm" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
