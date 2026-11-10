import { Link } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">404 · PÁGINA NÃO ENCONTRADA</span>
      <h1>Esta página não está no cardápio.</h1>
      <p>A página que você procura pode ter mudado de endereço ou não existir mais.</p>
      <Link to="/">Voltar para entrar</Link>
    </main>
  );
}
