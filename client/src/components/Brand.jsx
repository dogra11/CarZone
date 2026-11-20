/** components/Brand.jsx - CarZone logo + wordmark, linking to the home page. */
import { Link } from '../router/index.jsx';

export default function Brand({ tagline = true }) {
  return (
    <Link className="brand" to="/" aria-label="CarZone home">
      <img src="/assets/images/logo-mark.svg" alt="" width="40" height="40" />
      <div>
        <div className="brand-name">Car<span>Zone</span></div>
        {tagline && <span className="brand-tag">Wash · Detailing · Accessories</span>}
      </div>
    </Link>
  );
}
