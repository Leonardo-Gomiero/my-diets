import { Link } from 'react-router-dom';
import { FiActivity } from 'react-icons/fi';
import './AuthLayout.css';

export default function AuthLayout({ children }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel" aria-label="Sign in">
        <Link className="brand brand--auth" to="/" aria-label="My Diets home">
          <span className="brand__icon">
            <FiActivity aria-hidden="true" />
          </span>
          <span>my diets</span>
        </Link>
        {children}
        <p className="auth-panel__footnote">
          A little more mindful, one day at a time.
        </p>
      </section>
      <aside className="auth-aside" aria-label="Welcome">
        <div className="auth-aside__content">
          <span className="eyebrow">YOUR WELLNESS, IN FOCUS</span>
          <h2>Small steps make a big difference.</h2>
          <p>
            Keep your goals close, celebrate your progress, and make space for
            better habits.
          </p>
          <div className="auth-aside__quote">
            <span aria-hidden="true">“</span>
            <p>Consistency is built one thoughtful choice at a time.</p>
          </div>
        </div>
        <span className="auth-aside__decoration" aria-hidden="true" />
      </aside>
    </main>
  );
}
