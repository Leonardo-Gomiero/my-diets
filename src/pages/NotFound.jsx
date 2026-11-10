import { Link } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  return (
    <main className="not-found">
      <span className="eyebrow">404 · PAGE NOT FOUND</span>
      <h1>This page isn’t on the menu.</h1>
      <p>The page you’re looking for may have moved or no longer exists.</p>
      <Link to="/">Back to sign in</Link>
    </main>
  );
}
