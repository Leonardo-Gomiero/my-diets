import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ROLE_HOME = {
  ADMIN: '/admin',
  STUDENT: '/student',
};

export default function ProtectedRoute({ allowedRole }) {
  const { status, session, profile, mustChangePassword } = useAuth();
  const location = useLocation();

  if (status === 'loading' || status === 'authenticating') {
    return (
      <div role="status" aria-live="polite">
        Verificando sua sessão…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (mustChangePassword || status === 'password_change_required') {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRole && profile?.role !== allowedRole) {
    return <Navigate to={ROLE_HOME[profile?.role] ?? '/login'} replace />;
  }

  return <Outlet />;
}
