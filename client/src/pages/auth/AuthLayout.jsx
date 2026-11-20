/**
 * pages/auth/AuthLayout.jsx - Split-screen layout shared by the four auth pages, plus a
 * password input with a show/hide button and the safe "next" redirect helper.
 */
import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import Brand from '../../components/Brand.jsx';
import FormField from '../../components/FormField.jsx';
import Icon from '../../components/Icon.jsx';

export default function AuthLayout({ quote, cite, children }) {
  return (
    <div className="auth-page">
      <div className="auth-visual">
        <img src="/assets/images/auth-side.jpg" alt="" />
        <blockquote>{quote}<cite>{cite}</cite></blockquote>
      </div>
      <div className="auth-panel">
        <div className="auth-box">
          <Link to="/" aria-label="CarZone home"><Brand /></Link>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PasswordField(props) {
  const [show, setShow] = useState(false);
  const { label, error, hint, ...input } = props;
  return (
    <FormField label={label} error={error} hint={hint}>
      <div className="input-group">
        <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" {...input} />
        <button type="button" className="input-addon password-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}><Icon name={show ? 'eye-off' : 'eye'} size="sm" /></button>
      </div>
    </FormField>
  );
}

/** Password strength meter (length + character variety). */
export function Strength({ value = '' }) {
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const colors = ['var(--danger)', 'var(--danger)', 'var(--warning)', 'var(--blue)', 'var(--success)'];
  return <div className="strength" aria-hidden="true"><i style={{ width: `${score * 25}%`, background: colors[score] }} /></div>;
}

/** Only same-site relative redirects are allowed (prevents "open redirect" attacks). */
export function safeNext(next, fallback) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
