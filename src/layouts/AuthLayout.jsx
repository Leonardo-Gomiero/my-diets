import { Link } from 'react-router-dom';
import { FiActivity } from 'react-icons/fi';
import './AuthLayout.css';

export default function AuthLayout({ children }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel" aria-label="Entrar">
        <Link className="brand brand--auth" to="/" aria-label="Página inicial My Diets">
          <span className="brand__icon">
            <FiActivity aria-hidden="true" />
          </span>
          <span>my diets</span>
        </Link>
        {children}
        <p className="auth-panel__footnote">
          Mais atenção e cuidado, um dia de cada vez.
        </p>
      </section>
      <aside className="auth-aside" aria-label="Boas-vindas">
        <div className="auth-aside__content">
          <span className="eyebrow">SEU BEM-ESTAR EM FOCO</span>
          <h2>Pequenos passos fazem a diferença.</h2>
          <p>
            Mantenha seus objetivos por perto, celebre seu progresso e abra
            espaço para hábitos mais saudáveis.
          </p>
          <div className="auth-aside__quote">
            <span aria-hidden="true">“</span>
            <p>A constância se constrói com escolhas conscientes, uma de cada vez.</p>
          </div>
        </div>
        <span className="auth-aside__decoration" aria-hidden="true" />
      </aside>
    </main>
  );
}
