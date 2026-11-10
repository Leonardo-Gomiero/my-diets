import { FiActivity, FiLogOut } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Button from '../components/Button.jsx';
import './MainLayout.css';

export default function MainLayout({ children }) {
  const { session, signOut } = useAuth();

  return (
    <div className="main-layout">
      <header className="topbar">
        <Link className="brand" to="/dashboard">
          <span className="brand__icon">
            <FiActivity aria-hidden="true" />
          </span>
          <span>my diets</span>
        </Link>
        <div className="topbar__account">
          <span className="topbar__email">{session.email}</span>
          <Button
            className="topbar__logout"
            variant="quiet"
            onClick={signOut}
            aria-label="Sign out"
          >
            <FiLogOut aria-hidden="true" />
            <span>Sign out</span>
          </Button>
        </div>
      </header>
      <main className="main-content">{children}</main>
      <footer className="main-footer">Made for your everyday wellbeing.</footer>
    </div>
  );
}
