/** pages/NotFound.jsx - 404 page for unknown client-side routes. */
import { Link } from '../router/index.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import Brand from '../components/Brand.jsx';
import Icon from '../components/Icon.jsx';

export default function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <main className="notfound">
      <div>
        <Link to="/"><Brand /></Link>
        <div className="big">404</div>
        <h1>This lane is a dead end</h1>
        <p className="text-muted">The page you are looking for does not exist or has moved.</p>
        <div className="flex flex-wrap mt-3" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" to="/"><Icon name="home" size="sm" /> Back to home</Link>
          <Link className="btn btn-ghost" to="/shop">Browse the shop</Link>
        </div>
      </div>
    </main>
  );
}
