import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AuthLayout from './layouts/AuthLayout.jsx';
import MainLayout from './layouts/MainLayout.jsx';
import ActiveDietPage from './pages/ActiveDietPage.jsx';
import PatientsPage from './pages/PatientsPage.jsx';
import DietEditorPage from './pages/DietEditorPage.jsx';
import DietsPage from './pages/DietsPage.jsx';
import NutritionistProfilePage from './pages/NutritionistProfilePage.jsx';
import Login from './pages/Login.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import NotFound from './pages/NotFound.jsx';
import AdminNutritionistsPage from './pages/AdminNutritionistsPage.jsx';

function roleHome(role) {
  if (role === 'SUPERADMIN') return '/admin';
  return role === 'ADMIN' ? '/nutritionist' : '/student';
}

function LegacyNutritionistRoute({ to }) {
  const params = useParams();
  const destination = Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value)),
    to,
  );
  return <Navigate to={destination} replace />;
}

function LoginRoute() {
  const { status, session, profile, mustChangePassword } = useAuth();

  if (session) {
    if (mustChangePassword || status === 'password_change_required') {
      return <Navigate to="/change-password" replace />;
    }
    return <Navigate to={roleHome(profile?.role)} replace />;
  }

  if (status === 'loading' || status === 'authenticating') {
    return (
      <AuthLayout>
        <p role="status" aria-live="polite">Verificando sua sessão…</p>
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
      <Route path="/change-password" element={<PasswordChangeRoute />} />
      <Route element={<ProtectedRoute allowedRole="SUPERADMIN" />}>
        <Route
          path="/admin"
          element={
            <MainLayout>
              <AdminNutritionistsPage />
            </MainLayout>
          }
        />
      </Route>
      <Route element={<ProtectedRoute allowedRole="ADMIN" />}>
        <Route
          path="/admin/profile"
          element={<LegacyNutritionistRoute to="/nutritionist/profile" />}
        />
        <Route
          path="/admin/patients/:patientId/diets"
          element={
            <LegacyNutritionistRoute to="/nutritionist/patients/:patientId/diets" />
          }
        />
        <Route
          path="/admin/patients/:patientId/diet"
          element={
            <LegacyNutritionistRoute to="/nutritionist/patients/:patientId/diet" />
          }
        />
        <Route
          path="/admin/patients/:patientId/diets/:dietId/edit"
          element={
            <LegacyNutritionistRoute to="/nutritionist/patients/:patientId/diets/:dietId/edit" />
          }
        />
        <Route
          path="/nutritionist/profile"
          element={
            <MainLayout>
              <NutritionistProfilePage />
            </MainLayout>
          }
        />
        <Route
          path="/nutritionist/patients/:patientId/diets"
          element={
            <MainLayout>
              <DietsPage />
            </MainLayout>
          }
        />
        <Route
          path="/nutritionist/patients/:patientId/diet"
          element={
            <MainLayout>
              <DietEditorPage />
            </MainLayout>
          }
        />
        <Route
          path="/nutritionist/patients/:patientId/diets/:dietId/edit"
          element={
            <MainLayout>
              <DietEditorPage />
            </MainLayout>
          }
        />
        <Route
          path="/nutritionist"
          element={
            <MainLayout>
              <PatientsPage />
            </MainLayout>
          }
        />
      </Route>
      <Route element={<ProtectedRoute allowedRole="STUDENT" />}>
        <Route
          path="/student"
          element={
            <MainLayout>
              <ActiveDietPage />
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

function PasswordChangeRoute() {
  const { status, session, mustChangePassword, profile } = useAuth();

  if (status === 'loading' || status === 'authenticating') {
    return <p role="status">Verificando sua sessão…</p>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!mustChangePassword || status !== 'password_change_required') {
    return (
      <Navigate
        to={roleHome(profile?.role)}
        replace
      />
    );
  }

  return (
    <AuthLayout>
      <ChangePassword />
    </AuthLayout>
  );
}

function RoleHomeRedirect() {
  const { profile } = useAuth();
  return (
    <Navigate to={roleHome(profile?.role)} replace />
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
