import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_HOME = {
  ADMIN: '/admin',
  STUDENT: '/student',
};

export default function ProtectedRoute({ allowedRole }) {
  const { status, session, profile } = useAuth();
  const location = useLocation();

  if (status === 'loading' || status === 'authenticating') {
    return (
      <div role="status" aria-live="polite">
        Checking your session…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRole && profile?.role !== allowedRole) {
    return <Navigate to={ROLE_HOME[profile?.role] ?? '/login'} replace />;
  }

  return <Outlet />;
}
