/** pages/auth/ResetPassword.jsx - Sets a new password using the one-time token from the link. */
import { Link, useNavigate, useSearchParams } from '../../router/index.jsx';
import { api } from '../../services/api.js';
import { useForm } from '../../hooks/useForm.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useToast } from '../../components/Toast.jsx';
import { schemas } from '../../utils/shared.js';
import EmptyState from '../../components/EmptyState.jsx';
import AuthLayout, { PasswordField, Strength } from './AuthLayout.jsx';

export default function ResetPassword() {
  useDocumentTitle('Reset password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const token = params.get('token') || '';
  const form = useForm(schemas.resetPassword, { token, password: '', confirmPassword: '' });
  const submit = form.handleSubmit(async ({ confirmPassword, ...data }) => {
    if (confirmPassword !== data.password) { form.setErrors({ confirmPassword: 'Passwords do not match' }); return; }
    const res = await api.post('/api/auth/reset-password', data);
    toast.success(res.message, 'Password updated');
    navigate('/login', { replace: true });
  });
  return (
    <AuthLayout quote="A fresh start - just like a fresh coat of ceramic." cite="CarZone support">
      <span className="eyebrow">Account recovery</span>
      <h1>Choose a new password</h1>
      {!token ? <EmptyState icon="lock" title="Reset link missing" text="Please use the link from your email." action={<Link className="btn btn-primary" to="/forgot-password">Request a new link</Link>} /> : (
        <form onSubmit={submit} noValidate>
          <PasswordField label="New password" autoComplete="new-password" {...form.field('password')} />
          <Strength value={form.values.password} />
          <PasswordField label="Confirm new password" autoComplete="new-password" {...form.field('confirmPassword')} />
          {form.errors.token && <div className="alert alert-danger"><p>{form.errors.token}</p></div>}
          <button className={`btn btn-primary btn-lg btn-block ${form.submitting ? 'is-loading' : ''}`} disabled={form.submitting} type="submit">Update password</button>
        </form>
      )}
      <p className="auth-foot"><Link to="/login">Back to log in</Link></p>
    </AuthLayout>
  );
}
