/**
 * pages/auth/ForgotPassword.jsx - Requests a reset link. The server always answers the
 * same way (so it never reveals which emails exist). In DEMO_MODE it also returns the
 * link, because no email server is configured for a college demo.
 */
import { useState } from 'react';
import { Link } from '../../router/index.jsx';
import { api } from '../../services/api.js';
import { useForm } from '../../hooks/useForm.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { schemas } from '../../utils/shared.js';
import FormField from '../../components/FormField.jsx';
import Icon from '../../components/Icon.jsx';
import AuthLayout from './AuthLayout.jsx';

export default function ForgotPassword() {
  useDocumentTitle('Forgot password');
  const [result, setResult] = useState(null);
  const form = useForm(schemas.forgotPassword, { email: '' });
  const submit = form.handleSubmit(async (data) => setResult(await api.post('/api/auth/forgot-password', data)));
  return (
    <AuthLayout quote="Locked out? It happens. We will have you back in a minute." cite="CarZone support">
      <span className="eyebrow">Account recovery</span>
      <h1>Forgot your password?</h1>
      <p className="text-muted">Enter your email and we will send you a reset link.</p>
      {result ? (
        <div className="stack mt-3">
          <div className="alert alert-success"><Icon name="mail" /><p>{result.message}</p></div>
          {result.demoResetLink && (
            <div className="alert alert-info"><Icon name="info" /><p><b>Demo mode:</b> no email server is configured, so here is the link that would be emailed:<br />
              <Link className="link" to={result.demoResetLink}>Open reset link</Link></p></div>)}
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <FormField label="Email" type="email" autoComplete="email" placeholder="you@example.com" {...form.field('email')} />
          <button className={`btn btn-primary btn-lg btn-block ${form.submitting ? 'is-loading' : ''}`} disabled={form.submitting} type="submit">Send reset link</button>
        </form>
      )}
      <p className="auth-foot"><Link to="/login">Back to log in</Link></p>
    </AuthLayout>
  );
}
