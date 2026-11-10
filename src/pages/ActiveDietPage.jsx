import { useEffect, useState } from 'react';
import { FiRefreshCw, FiSun } from 'react-icons/fi';
import Button from '../components/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getActiveDiet } from '../services/activeDietService.js';
import { whatsappUrl } from '../utils/contactLinks.js';
import './ActiveDietPage.css';

const NUTRIENTS = [
  ['target_calories', 'Calorias', 'kcal'],
  ['target_protein', 'Proteínas', 'g'],
  ['target_carbohydrates', 'Carboidratos', 'g'],
  ['target_fats', 'Gorduras', 'g'],
];

function formatValue(value) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

function formatTime(value) {
  if (!value) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
}

function NutritionValues({ values }) {
  const provided = NUTRIENTS.filter(([field]) => values[field] !== null && values[field] !== undefined);
  if (!provided.length) return null;

  return (
    <dl className="active-diet__nutrition">
      {provided.map(([field, label, unit]) => (
        <div key={field}>
          <dt>{label}</dt>
          <dd>{formatValue(values[field])} {unit}</dd>
        </div>
      ))}
    </dl>
  );
}

function ActiveDiet({ diet }) {
  return (
    <article className="active-diet__plan">
      <header className="active-diet__plan-heading">
        <div>
          <span className="active-diet__eyebrow">PLANO ALIMENTAR ATIVO · VERSÃO {diet.version}</span>
          <h2>{diet.title}</h2>
        </div>
        <span className="active-diet__status">Ativa</span>
      </header>

      <NutritionValues values={diet} />
      {diet.notes && (
        <section className="active-diet__notes" aria-labelledby="diet-notes-heading">
          <h3 id="diet-notes-heading">Observações gerais</h3>
          <p>{diet.notes}</p>
        </section>
      )}

      <section className="active-diet__meals" aria-labelledby="meals-heading">
        <div className="active-diet__section-heading">
          <span className="active-diet__section-icon" aria-hidden="true"><FiSun /></span>
          <div>
            <h3 id="meals-heading">Suas refeições</h3>
            <p>Consulte as opções e informações de cada refeição.</p>
          </div>
        </div>
        {diet.meals.map((meal) => (
          <section className="active-diet__meal" key={meal.id}>
            <header className="active-diet__meal-heading">
              <div>
                <span className="active-diet__meal-label">
                  Refeição {meal.order_index + 1}
                </span>
                <h4>{meal.name}</h4>
              </div>
              {formatTime(meal.scheduled_time) && (
                <time className="active-diet__time" dateTime={meal.scheduled_time}>
                  {formatTime(meal.scheduled_time)}
                </time>
              )}
            </header>
            <NutritionValues values={{ target_calories: meal.target_calories }} />
            {meal.notes && <p className="active-diet__meal-notes">{meal.notes}</p>}
            <div className="active-diet__groups">
              {meal.food_groups.map((group) => (
                <section className="active-diet__group" key={group.id}>
                  <h5>{group.name}</h5>
                  <ul>
                    {group.food_options.map((option) => (
                      <li className="active-diet__option" key={option.id}>
                        <div className="active-diet__option-heading">
                          <span className="active-diet__option-label">{option.label}</span>
                          <span className="active-diet__quantity">
                            {formatValue(option.quantity)} {option.unit}
                          </span>
                        </div>
                        <p className="active-diet__food-name">{option.food_name}</p>
                        <NutritionValues values={option} />
                        {option.notes && <p className="active-diet__option-notes">{option.notes}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        ))}
      </section>
    </article>
  );
}

export default function ActiveDietPage() {
  const { session, profile } = useAuth();
  const [diet, setDiet] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError('');

    getActiveDiet({
      accessToken: session?.access_token,
      signal: controller.signal,
    })
      .then((result) => {
        setDiet(result);
        setStatus(result ? 'success' : 'empty');
      })
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setError(requestError.message);
        setStatus('error');
      });

    return () => controller.abort();
  }, [session?.access_token, attempt]);

  return (
    <section className="active-diet" aria-labelledby="active-diet-title">
      <header className="active-diet__heading">
        <span className="active-diet__eyebrow">ÁREA DO PACIENTE</span>
        <h1 id="active-diet-title">
          {profile?.full_name ? `Olá, ${profile.full_name}` : 'Minha dieta'}
        </h1>
        <p>Consulte seu plano alimentar atual.</p>
      </header>

      {profile?.nutritionist && (
        <aside className="active-diet__nutritionist" aria-label="Contato do nutricionista">
          <div>
            <span>Seu nutricionista</span>
            <strong>{profile.nutritionist.full_name}</strong>
          </div>
          {profile.nutritionist.whatsapp && whatsappUrl(profile.nutritionist.whatsapp) ? (
            <a
              href={whatsappUrl(profile.nutritionist.whatsapp)}
              target="_blank"
              rel="noreferrer"
              aria-label={`Conversar com ${profile.nutritionist.full_name} pelo WhatsApp`}
            >
              WhatsApp: {profile.nutritionist.whatsapp}
            </a>
          ) : (
            <span className="active-diet__nutritionist-unavailable">
              WhatsApp não informado
            </span>
          )}
        </aside>
      )}

      {status === 'loading' && (
        <div className="active-diet__message" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          Carregando sua dieta…
        </div>
      )}

      {status === 'error' && (
        <div className="active-diet__message active-diet__message--error" role="alert">
          <p>Não foi possível carregar sua dieta. {error}</p>
          <Button
            type="button"
            variant="quiet"
            onClick={() => setAttempt((number) => number + 1)}
          >
            <FiRefreshCw aria-hidden="true" />
            Tentar novamente
          </Button>
        </div>
      )}

      {status === 'empty' && (
        <div className="active-diet__message active-diet__message--empty">
          <span className="active-diet__empty-icon" aria-hidden="true"><FiSun /></span>
          <h2>Você ainda não tem uma dieta ativa</h2>
          <p>Entre em contato com seu nutricionista para saber mais.</p>
        </div>
      )}

      {status === 'success' && diet && <ActiveDiet diet={diet} />}
    </section>
  );
}
