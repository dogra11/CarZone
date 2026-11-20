/**
 * pages/auth/Login.jsx - Login form. On success the server sets an HttpOnly session
 * cookie (JavaScript never sees the token); AuthContext stores the returned user and we
 * redirect to ?next= (if safe and allowed for the role) or to the role's home page.
 */
import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from '../../router/index.jsx';
import { useAuth, homeFor } from '../../context/AuthContext.jsx';
import { useForm } from '../../hooks/useForm.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useToast } from '../../components/Toast.jsx';
import { schemas } from '../../utils/shared.js';
import FormField from '../../components/FormField.jsx';
import AuthLayout, { PasswordField, safeNext } from './AuthLayout.jsx';

export default function Login() {
  useDocumentTitle('Log in');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const denied = params.get('denied');
  const form = useForm(schemas.login, { email: '', password: '', remember: true });

  useEffect(() => {
    if (denied) toast.warning('That area needs an admin account. Log in with an admin account to continue.', 'Access restricted');
  }, [denied]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (u) => {
    const next = safeNext(params.get('next'), homeFor(u));
    // Admins only go to /admin pages; customers never do.
    const allowed = u.role === 'admin' ? next.startsWith('/admin') || next.startsWith('/bookings') || next.startsWith('/orders') : !next.startsWith('/admin');
    navigate(allowed ? next : homeFor(u), { replace: true });
  };

  const submit = form.handleSubmit(async (data) => {
    const res = await login(data);
    toast.success(res.message, 'Logged in');
    go(res.user);
  });

  if (user && !denied) return <Navigate to={homeFor(user)} replace />;

  const demo = (email, password) => { form.setValues({ email, password, remember: true }); };

  return (
    <AuthLayout quote="Book a showroom-grade wash and shop genuine-fit accessories - all in one account." cite="CarZone Pune">
      <span className="eyebrow">Welcome back</span>
      <h1>Log in to CarZone</h1>
      <p className="text-muted">Manage bookings, orders, payments and invoices.</p>
      <form onSubmit={submit} noValidate>
        <FormField label="Email" type="email" autoComplete="email" placeholder="you@example.com" {...form.field('email')} />
        <PasswordField label="Password" placeholder="Your password" {...form.field('password')} />
        <div className="flex between">
          <label className="checkbox"><input type="checkbox" checked={Boolean(form.values.remember)} onChange={(e) => form.setValue('remember', e.target.checked)} /> Remember me</label>
          <Link className="link text-small" to="/forgot-password">Forgot password?</Link>
        </div>
        <button className={`btn btn-primary btn-lg btn-block ${form.submitting ? 'is-loading' : ''}`} disabled={form.submitting} type="submit">Log in</button>
      </form>
      <div className="demo-logins">
        <button type="button" onClick={() => demo('rohan@example.com', 'Customer@123')}><b>Demo customer</b>rohan@example.com</button>
        <button type="button" onClick={() => demo('admin@carzone.in', 'Admin@123')}><b>Demo admin</b>admin@carzone.in</button>
      </div>
      <p className="auth-foot">New to CarZone? <Link to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Create an account</Link></p>
    </AuthLayout>
  );
}
