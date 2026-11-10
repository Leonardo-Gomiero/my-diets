import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import NotFound from './pages/NotFound.jsx';

function LoginRoute() {
  const { status, session, profile } = useAuth();

  if (session) {
    return <Navigate to={profile?.role === 'ADMIN' ? '/admin' : '/student'} replace />;
  }

  if (status === 'loading' || status === 'authenticating') {
    return (
      <AuthLayout>
        <p role="status" aria-live="polite">Checking your session…</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Login />
    </AuthLayout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LoginRoute />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedRoute allowedRole="ADMIN" />}>
        <Route
          path="/admin"
          element={
            <MainLayout>
              <Dashboard />
            </MainLayout>
          }
        />
      </Route>
      <Route element={<ProtectedRoute allowedRole="STUDENT" />}>
        <Route
          path="/student"
          element={
            <MainLayout>
              <Dashboard />
            </MainLayout>
          }
        />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route
          path="/dashboard"
          element={<RoleHomeRedirect />}
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function RoleHomeRedirect() {
  const { profile } = useAuth();
  return (
    <Navigate to={profile?.role === 'ADMIN' ? '/admin' : '/student'} replace />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
