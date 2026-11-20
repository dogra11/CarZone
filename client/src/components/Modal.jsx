/**
 * components/Modal.jsx - Accessible modal dialog + a promise-based confirm dialog.
 *
 *   {open && <Modal title="Edit" onClose={...} footer={<button/>}>...</Modal>}
 *   const confirm = useConfirm();  if (await confirm({ title, message, danger: true })) {...}
 *
 * The modal is rendered with a React PORTAL into document.body, closes on Esc /
 * backdrop click / X, locks page scrolling and moves keyboard focus inside.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

export default function Modal({ title, children, footer, onClose, size = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
    (first || ref.current?.querySelector('.modal-close'))?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header"><h3>{title}</h3><button className="modal-close" aria-label="Close" onClick={onClose}><Icon name="x" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

const ConfirmContext = createContext(null);

/** Provides confirm() anywhere in the app; renders a single shared confirm dialog. */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback((options) => new Promise((resolve) => setState({ ...options, resolve })), []);
  const close = (answer) => { state.resolve(answer); setState(null); };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title || 'Are you sure?'} onClose={() => close(false)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>{state.confirmText || 'Confirm'}</button>
          </>}>
          <p className="mb-0">{state.message}</p>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
