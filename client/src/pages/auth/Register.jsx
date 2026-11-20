/** pages/auth/Register.jsx - Customer sign-up with shared validation + password strength. */
import { Link, Navigate, useNavigate, useSearchParams } from '../../router/index.jsx';
import { useAuth, homeFor } from '../../context/AuthContext.jsx';
import { useForm } from '../../hooks/useForm.js';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';
import { useToast } from '../../components/Toast.jsx';
import { schemas } from '../../utils/shared.js';
import FormField from '../../components/FormField.jsx';
import AuthLayout, { PasswordField, Strength, safeNext } from './AuthLayout.jsx';

export default function Register() {
  useDocumentTitle('Create account');
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const form = useForm(schemas.register, { name: '', email: '', phone: '', password: '', confirmPassword: '' });

  const submit = form.handleSubmit(async ({ confirmPassword, ...data }) => {
    if (confirmPassword !== data.password) {
      form.setErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }
    const res = await register(data);
    toast.success(res.message, 'Welcome to CarZone');
    const next = safeNext(params.get('next'), '/dashboard');
    navigate(next.startsWith('/admin') ? '/dashboard' : next, { replace: true });
  });

  if (user) return <Navigate to={homeFor(user)} replace />;

  return (
    <AuthLayout quote="Join thousands of Pune drivers who keep their cars showroom-fresh." cite="CarZone members">
      <span className="eyebrow">Create account</span>
      <h1>Join CarZone</h1>
      <p className="text-muted">Book washes, shop accessories and track everything in one place.</p>
      <form onSubmit={submit} noValidate>
        <FormField label="Full name" autoComplete="name" placeholder="Rohan Sharma" {...form.field('name')} />
        <div className="form-grid">
          <FormField label="Email" type="email" autoComplete="email" placeholder="you@example.com" {...form.field('email')} />
          <FormField label="Mobile number" type="tel" autoComplete="tel" placeholder="98XXXXXXXX" {...form.field('phone')} />
        </div>
        <PasswordField label="Password" autoComplete="new-password" hint="At least 8 characters with a letter and a number." {...form.field('password')} />
        <Strength value={form.values.password} />
        <PasswordField label="Confirm password" autoComplete="new-password" {...form.field('confirmPassword')} />
        <button className={`btn btn-primary btn-lg btn-block ${form.submitting ? 'is-loading' : ''}`} disabled={form.submitting} type="submit">Create account</button>
      </form>
      <p className="auth-foot">Already have an account? <Link to="/login">Log in</Link></p>
    </AuthLayout>
  );
}
