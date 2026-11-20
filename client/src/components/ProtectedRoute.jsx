/**
 * components/ProtectedRoute.jsx - ROLE-BASED ROUTE GUARD.
 *
 *   <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
 *
 * - While the session is being checked -> full-page loader.
 * - Guest -> redirect to /login?next=<this page> (they come back after logging in).
 * - Wrong role -> redirect to their own home (admin -> /admin, customer -> /dashboard).
 * This only improves the user experience; the SERVER enforces the same rules on
 * every API call, so hiding a page is never the only protection.
 */
import { Navigate, useLocation } from '../router/index.jsx';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { Loader } from './Loader.jsx';

export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loader text="Checking your session..." fullPage />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} />;
  return children;
}
