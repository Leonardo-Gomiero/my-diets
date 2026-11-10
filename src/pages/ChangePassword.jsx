import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiLock } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import './ChangePassword.css';

const MIN_PASSWORD_LENGTH = 12;

export default function ChangePassword() {
  const {
    session,
    completePasswordChange,
    finishPasswordChange,
    signOut,
  } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres na nova senha.`);
      return;
    }

    if (password !== confirmation) {
      setError('As senhas não coincidem.');
      return;
    }

    setIsSubmitting(true);
    try {
      const profile = await completePasswordChange(password);
      setPassword('');
      setConfirmation('');
      setSuccess('Senha atualizada. Seu acesso foi confirmado.');
      window.setTimeout(() => {
        finishPasswordChange(profile);
        navigate(profile.role === 'ADMIN' ? '/admin' : '/student', {
          replace: true,
        });
      }, 900);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignOut() {
    setError('');
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (signOutError) {
      setError(signOutError.message);
    }
  }

  return (
    <section className="password-change">
      <span className="eyebrow password-change__eyebrow">SEGURANÇA DA CONTA</span>
      <h1>Crie sua nova senha</h1>
      <p className="password-change__intro">
        Por segurança, atualize a senha temporária antes de continuar.
      </p>
      <p className="password-change__account">
        Conta: {session?.user?.email ?? 'aluno'}
      </p>

      <form className="password-change__form" onSubmit={handleSubmit}>
        <label className="form-field" htmlFor="new-password">
          <span>Nova senha</span>
          <span className="form-field__control">
            <FiLock aria-hidden="true" />
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby="password-requirements"
              required
            />
          </span>
        </label>

        <p id="password-requirements" className="password-change__hint">
          Use de {MIN_PASSWORD_LENGTH} a 128 caracteres.
        </p>

        <label className="form-field" htmlFor="confirm-password">
          <span>Confirme a nova senha</span>
          <span className="form-field__control">
            <FiLock aria-hidden="true" />
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={128}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </span>
        </label>

        {error && (
          <p className="password-change__message password-change__message--error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="password-change__message" role="status" aria-live="polite">
            {success}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting || Boolean(success)}>
          {isSubmitting ? 'Atualizando…' : 'Atualizar senha'}
        </Button>
      </form>

      <Button
        className="password-change__signout"
        variant="quiet"
        type="button"
        onClick={handleSignOut}
        disabled={isSubmitting || Boolean(success)}
      >
        Sair da conta
      </Button>
    </section>
  );
}
