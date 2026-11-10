import { useCallback, useEffect, useState } from 'react';
import { FiArrowLeft, FiCopy, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  activateDiet,
  deleteDiet,
  duplicateDiet,
  getDietHistory,
} from '../services/dietService.js';
import './DietsPage.css';

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

export default function DietsPage() {
  const { patientId } = useParams();
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const [diets, setDiets] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState(null);
  const [reloadCount, setReloadCount] = useState(0);

  const loadDiets = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      const patientDiets = await getDietHistory(patientId, { accessToken });
      setDiets(patientDiets);
      setStatus('success');
    } catch (loadError) {
      setError(loadError.message);
      setStatus('error');
    }
  }, [accessToken, patientId]);

  useEffect(() => {
    loadDiets();
  }, [loadDiets, reloadCount]);

  async function handleActivate(diet) {
    const activeDiet = diets.find((item) => item.status === 'ACTIVE');
    const confirmation = activeDiet
      ? `Ativar a versão ${diet.version}? A versão ativa atual será arquivada na mesma operação.`
      : `Ativar a versão ${diet.version}? Ela ficará disponível para o paciente.`;
    if (!window.confirm(confirmation)) return;

    setProcessing({ dietId: diet.id, action: 'activate' });
    setError('');
    setSuccess('');
    try {
      await activateDiet(patientId, diet.id, { accessToken });
      setSuccess(
        `Versão ${diet.version} ativada. ${activeDiet ? 'A versão anterior foi arquivada.' : ''}`,
      );
      setReloadCount((count) => count + 1);
    } catch (activationError) {
      await loadDiets();
      setError(activationError.message);
    } finally {
      setProcessing(null);
    }
  }

  async function handleDuplicate(diet) {
    setProcessing({ dietId: diet.id, action: 'duplicate' });
    setError('');
    setSuccess('');
    try {
      const copy = await duplicateDiet(diet.id, { accessToken });
      setSuccess(`Versão ${copy.version} criada como rascunho. Ative-a quando quiser disponibilizá-la ao paciente.`);
      setReloadCount((count) => count + 1);
    } catch (duplicateError) {
      setError(duplicateError.message);
    } finally {
      setProcessing(null);
    }
  }

  async function handleDelete(diet) {
    const activeWarning = diet.status === 'ACTIVE'
      ? ' Esta dieta está ativa e o paciente ficará sem uma dieta ativa.'
      : '';
    if (!window.confirm(
      `Excluir permanentemente "${diet.title}" (versão ${diet.version})? Esta ação não pode ser desfeita.${activeWarning}`,
    )) return;

    setProcessing({ dietId: diet.id, action: 'delete' });
    setError('');
    setSuccess('');
    try {
      await deleteDiet(diet.id, { accessToken });
      setSuccess(`Versão ${diet.version} excluída.`);
      setReloadCount((count) => count + 1);
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setProcessing(null);
    }
  }

  return (
    <section className="diets-page" aria-labelledby="diets-page-title">
      <Link className="diets-page__back" to="/admin">
        <FiArrowLeft aria-hidden="true" />
        Voltar aos pacientes
      </Link>
      <header className="diets-page__heading">
        <div>
          <span className="eyebrow">ADMINISTRAÇÃO · DIETAS</span>
          <h1 id="diets-page-title">Dietas</h1>
          <p>Consulte as versões, crie novas dietas e escolha qual ficará ativa para o paciente.</p>
        </div>
        <Link
          className="button button--primary diets-page__new"
          to={`/admin/patients/${encodeURIComponent(patientId)}/diet`}
        >
          <FiPlus aria-hidden="true" />
          Nova dieta
        </Link>
      </header>

      {success && <p className="diets-page__success" role="status">{success}</p>}

      {status === 'loading' && (
        <div className="diets-page__state" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          Carregando dietas…
        </div>
      )}

      {status === 'error' && (
        <div className="diets-page__state diets-page__state--error" role="alert">
          <p>Não foi possível carregar as dietas. {error}</p>
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
        <p className="diets-page__error" role="alert">{error}</p>
      )}

      {status === 'success' && diets.length === 0 && (
        <div className="diets-page__state diets-page__state--empty">
          <h2>Nenhuma dieta cadastrada</h2>
          <p>Crie uma dieta para começar o acompanhamento deste paciente.</p>
        </div>
      )}

      {status === 'success' && diets.length > 0 && (
        <ol className="diets-page__list" aria-label="Dietas da mais recente à mais antiga">
          {diets.map((diet) => (
            <li className="diets-page__item" key={diet.id}>
              <div className="diets-page__details">
                <div className="diets-page__title-row">
                  <h2>{diet.title}</h2>
                  <span className={`diets-page__badge diets-page__badge--${diet.status.toLowerCase()}`}>
                    {STATUS_LABELS[diet.status] ?? 'Status desconhecido'}
                  </span>
                </div>
                <p className="diets-page__meta">
                  Versão {diet.version} <span aria-hidden="true">·</span> Criada em {formatDate(diet.created_at)}
                </p>
              </div>
              <div className="diets-page__actions">
                <Link
                  className="button button--quiet"
                  to={`/admin/patients/${encodeURIComponent(patientId)}/diets/${encodeURIComponent(diet.id)}/edit`}
                  aria-label={`Editar versão ${diet.version}`}
                >
                  Editar
                </Link>
                {diet.status === 'ACTIVE' ? (
                  <Button
                    type="button"
                    disabled
                    aria-label={`Versão ${diet.version} ativada`}
                  >
                    Ativado
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleActivate(diet)}
                    disabled={Boolean(processing)}
                    aria-label={`Ativar versão ${diet.version}`}
                  >
                    {processing?.dietId === diet.id && processing.action === 'activate'
                      ? 'Ativando…'
                      : 'Ativar'}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => handleDuplicate(diet)}
                  disabled={Boolean(processing)}
                  aria-label={`Duplicar versão ${diet.version}`}
                >
                  <FiCopy aria-hidden="true" />
                  {processing?.dietId === diet.id && processing.action === 'duplicate'
                    ? 'Duplicando…'
                    : 'Duplicar'}
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => handleDelete(diet)}
                  disabled={Boolean(processing)}
                  aria-label={`Excluir versão ${diet.version}`}
                >
                  <FiTrash2 aria-hidden="true" />
                  {processing?.dietId === diet.id && processing.action === 'delete'
                    ? 'Excluindo…'
                    : 'Excluir'}
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
