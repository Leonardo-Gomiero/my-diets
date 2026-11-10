import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiArrowRight, FiLock, FiMail } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './Login.css';

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      signIn(email, password);
      navigate(location.state?.from?.pathname || '/dashboard', {
        replace: true,
      });
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login">
      <span className="eyebrow login__eyebrow">WELCOME BACK</span>
      <h1>Good to see you.</h1>
      <p className="login__intro">
        Sign in to pick up where you left off.
      </p>

      <form className="login-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Email address</span>
          <span className="form-field__control">
            <FiMail aria-hidden="true" />
            <input
              autoComplete="email"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </span>
        </label>

        <label className="form-field">
          <span>Password</span>
          <span className="form-field__control">
            <FiLock aria-hidden="true" />
            <input
              autoComplete="current-password"
              type="password"
              name="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </span>
        </label>

        {error && (
          <p className="login__error" role="alert">
            {error}
          </p>
        )}

        <Button className="login__submit" type="submit" disabled={isSubmitting}>
          <span>{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
          {!isSubmitting && <FiArrowRight aria-hidden="true" />}
        </Button>
      </form>

      <p className="login__demo-note">
        Demo sign-in: enter any valid email and a password.
      </p>
    </div>
  );
}
