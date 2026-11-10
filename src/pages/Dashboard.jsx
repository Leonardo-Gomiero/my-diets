import { useEffect, useState } from 'react';
import { FiActivity, FiArrowUpRight, FiMapPin, FiUsers } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { getUsers } from '../services/apiService.js';
import { formatLocation } from '../utils/formatters.js';
import './Dashboard.css';

export default function Dashboard() {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsers() {
      setStatus('loading');
      setError('');

      try {
        const results = await getUsers({ signal: controller.signal });
        setUsers(results);
        setStatus('success');
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        setError(requestError.message);
        setStatus('error');
      }
    }

    loadUsers();
    return () => controller.abort();
  }, [requestNumber]);

  return (
    <section className="dashboard">
      <div className="dashboard__heading">
        <div>
          <span className="eyebrow dashboard__eyebrow">SEU RESUMO</span>
          <h1>Um novo começo, todos os dias.</h1>
          <p>Uma inspiração para continuar cultivando hábitos saudáveis.</p>
        </div>
        <div className="dashboard__date">
          {new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }).format(new Date())}
        </div>
      </div>

      <div className="dashboard__welcome">
        <div className="dashboard__welcome-icon">
          <FiActivity aria-hidden="true" />
        </div>
        <div>
          <h2>Progresso, não perfeição.</h2>
          <p>
            Sua jornada de bem-estar é única. Continue cuidando de você.
          </p>
        </div>
      </div>

      <div className="dashboard__section-heading">
        <div className="dashboard__section-title">
          <span className="dashboard__section-icon">
            <FiUsers aria-hidden="true" />
          </span>
          <div>
            <h2>Inspiração da comunidade</h2>
            <p>Algumas pessoas do nosso diretório de exemplo</p>
          </div>
        </div>
        {status === 'success' && (
          <span className="dashboard__count">
            {users.length} {users.length === 1 ? 'pessoa' : 'pessoas'}
          </span>
        )}
      </div>

      {status === 'loading' && (
        <div className="dashboard__message" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          Carregando pessoas da comunidade…
        </div>
      )}

      {status === 'error' && (
        <div className="dashboard__message dashboard__message--error" role="alert">
          <p>Não foi possível carregar a comunidade agora. {error}</p>
          <Button variant="quiet" onClick={() => setRequestNumber((count) => count + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}

      {status === 'success' && (
        <div className="member-grid">
          {users.map((user) => (
            <article className="member-card" key={user.id}>
              <div className="member-card__avatar" aria-hidden="true">
                {user.name.charAt(0)}
              </div>
              <div className="member-card__info">
                <h3>{user.name}</h3>
                <p>{user.company.name}</p>
              </div>
              <div className="member-card__location">
                <FiMapPin aria-hidden="true" />
                <span>{formatLocation(user.address.city)}</span>
              </div>
              <a
                className="member-card__link"
                href={`mailto:${user.email}`}
                aria-label={`Entrar em contato com ${user.name}`}
              >
                <FiArrowUpRight aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
