import { useCallback, useEffect, useState } from 'react';
import { FiArrowLeft, FiPlus, FiRefreshCw } from 'react-icons/fi';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { activateDiet, getDietHistory } from '../services/dietService.js';
import './DietHistoryPage.css';

const STATUS_LABELS = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativa',
  ARCHIVED: 'Arquivada',
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}

export default function DietHistoryPage() {
  const { patientId } = useParams();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [diets, setDiets] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activatingId, setActivatingId] = useState('');
  const [reloadCount, setReloadCount] = useState(0);

  const loadHistory = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const history = await getDietHistory(patientId, { accessToken });
      setDiets(history);
      setStatus('success');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }, [accessToken, patientId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, reloadCount]);

  async function handleActivate(diet) {
    const activeDiet = diets.find((item) => item.status === 'ACTIVE');
    const confirmation = activeDiet
      ? `Ativar a versão ${diet.version}? A versão ativa atual será arquivada na mesma operação.`
      : `Ativar a versão ${diet.version}? Ela ficará disponível para o paciente.`;
    if (!window.confirm(confirmation)) return;

    setActivatingId(diet.id);
    setError('');
    setSuccess('');
    try {
      await activateDiet(patientId, diet.id, { accessToken });
      setSuccess(
        `Versão ${diet.version} ativada. ${activeDiet ? 'A versão anterior foi arquivada.' : ''}`,
      );
      setReloadCount((count) => count + 1);
    } catch (activationError) {
      await loadHistory();
      setError(activationError.message);
    } finally {
      setActivatingId('');
    }
  }

  return (
    <section className="diet-history" aria-labelledby="diet-history-title">
      <Link className="diet-history__back" to="/admin">
        <FiArrowLeft aria-hidden="true" />
        Voltar aos pacientes
      </Link>
      <header className="diet-history__heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO · VERSÕES</span>
          <h1 id="diet-history-title">Histórico de dietas</h1>
          <p>Consulte as versões e escolha um rascunho ou uma dieta arquivada para ativar.</p>
        </div>
        <Link
          className="button button--primary diet-history__new"
          to={`/admin/patients/${encodeURIComponent(patientId)}/diet`}
        >
          <FiPlus aria-hidden="true" />
          Nova dieta
        </Link>
      </header>

      {success && <p className="diet-history__success" role="status">{success}</p>}

      {status === 'loading' && (
        <div className="diet-history__state" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          Carregando histórico…
        </div>
      )}

      {status === 'error' && (
        <div className="diet-history__state diet-history__state--error" role="alert">
          <p>Não foi possível carregar o histórico. {error}</p>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setReloadCount((count) => count + 1)}
          >
            <FiRefreshCw aria-hidden="true" />
            Tentar novamente
          </Button>
        </div>
      )}

      {error && status !== 'error' && (
        <p className="diet-history__error" role="alert">{error}</p>
      )}

      {status === 'success' && diets.length === 0 && (
        <div className="diet-history__state diet-history__state--empty">
          <h2>Nenhuma versão de dieta</h2>
          <p>Crie um rascunho para começar o histórico deste paciente.</p>
        </div>
      )}

      {status === 'success' && diets.length > 0 && (
        <ol className="diet-history__list" aria-label="Versões da dieta, da mais recente à mais antiga">
          {diets.map((diet) => (
            <li className="diet-history__item" key={diet.id}>
              <div className="diet-history__details">
                <div className="diet-history__title-row">
                  <h2>{diet.title}</h2>
                  <span className={`diet-history__badge diet-history__badge--${diet.status.toLowerCase()}`}>
                    {STATUS_LABELS[diet.status] ?? 'Status desconhecido'}
                  </span>
                </div>
                <p className="diet-history__meta">
                  Versão {diet.version} <span aria-hidden="true">·</span> Criada em {formatDate(diet.created_at)}
                </p>
              </div>
              {diet.status !== 'ACTIVE' && (
                <Button
                  type="button"
                  onClick={() => handleActivate(diet)}
                  disabled={Boolean(activatingId)}
                  aria-label={`${diet.status === 'ARCHIVED' ? 'Reativar' : 'Ativar'} versão ${diet.version}`}
                >
                  {activatingId === diet.id
                    ? 'Ativando…'
                    : diet.status === 'ARCHIVED'
                      ? 'Reativar versão'
                      : 'Ativar rascunho'}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
