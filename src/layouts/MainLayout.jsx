import { FiActivity, FiLogOut, FiUser } from 'react-icons/fi';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/Button.jsx';
import './MainLayout.css';

export default function MainLayout({ children }) {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [logoutError, setLogoutError] = useState('');

  async function handleSignOut() {
    setLogoutError('');
    try {
      await signOut();
    } catch {
      setLogoutError('Não foi possível encerrar a sessão. Tente novamente.');
    } finally {
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="main-layout">
      <header className="topbar">
        <Link
          className="brand"
          to={
            profile.role === 'SUPERADMIN'
              ? '/admin'
              : profile.role === 'ADMIN'
                ? '/nutritionist'
                : '/student'
          }
        >
          <span className="brand__icon">
            <FiActivity aria-hidden="true" />
          </span>
          <span>my diets</span>
        </Link>
        <div className="topbar__account">
          <span className="topbar__email">
            {profile.role === 'SUPERADMIN'
              ? profile.admin_login
              : session.user.email}
          </span>
          {profile.role === 'ADMIN' && (
            <Link className="topbar__profile" to="/nutritionist/profile">
              <FiUser aria-hidden="true" />
              <span>Meu perfil</span>
            </Link>
          )}
          <Button
            className="topbar__logout"
            variant="quiet"
            onClick={handleSignOut}
            aria-label="Sair"
          >
            <FiLogOut aria-hidden="true" />
            <span>Sair</span>
          </Button>
        </div>
      </header>
      {logoutError && (
        <p role="alert" className="login__error">
          {logoutError}
        </p>
      )}
      <main className="main-content">{children}</main>
      <footer className="main-footer">Feito para o seu dia a dia.</footer>
    </div>
  );
}
