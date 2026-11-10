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
          <span className="eyebrow dashboard__eyebrow">YOUR OVERVIEW</span>
          <h1>A fresh start, every day.</h1>
          <p>Here’s a little inspiration to keep building healthy habits.</p>
        </div>
        <div className="dashboard__date">
          {new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}
        </div>
      </div>

      <div className="dashboard__welcome">
        <div className="dashboard__welcome-icon">
          <FiActivity aria-hidden="true" />
        </div>
        <div>
          <h2>Progress, not perfection.</h2>
          <p>
            Your wellness journey is uniquely yours. Keep showing up for
            yourself.
          </p>
        </div>
      </div>

      <div className="dashboard__section-heading">
        <div className="dashboard__section-title">
          <span className="dashboard__section-icon">
            <FiUsers aria-hidden="true" />
          </span>
          <div>
            <h2>Community inspiration</h2>
            <p>A few people from our sample directory</p>
          </div>
        </div>
        {status === 'success' && (
          <span className="dashboard__count">{users.length} members</span>
        )}
      </div>

      {status === 'loading' && (
        <div className="dashboard__message" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          Loading community members…
        </div>
      )}

      {status === 'error' && (
        <div className="dashboard__message dashboard__message--error" role="alert">
          <p>We couldn’t load the community right now. {error}</p>
          <Button variant="quiet" onClick={() => setRequestNumber((count) => count + 1)}>
            Try again
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
                aria-label={`Contact ${user.name}`}
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
