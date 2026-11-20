/**
 * components/ServiceCard.jsx - Card for one service (image, category, rating, price, Book).
 * Props: service (from /api/services), vehicleType (optional: show that exact price).
 */
import { Link } from '../router/index.jsx';
import { money, duration } from '../utils/format.js';
import Icon from './Icon.jsx';
import Img from './Img.jsx';

export default function ServiceCard({ service: s, vehicleType = '' }) {
  const price = vehicleType ? s.prices[vehicleType] : s.minPricePaise;
  const offered = !vehicleType || price !== undefined;
  return (
    <article className="service-card reveal">
      <Link className="service-media" to={`/services/${s.slug}`}>
        <Img src={s.image} alt={s.name} loading="lazy" />
        <span className="badge badge-blue">{s.category}</span>
        {s.isFeatured && <span className="badge badge-gold featured-tag no-dot"><Icon name="crown" size="sm" /> Signature</span>}
      </Link>
      <div className="service-body">
        <h3>{s.name}</h3>
        <p>{s.tagline}</p>
        <div className="service-meta">
          <span><Icon name="clock" size="sm" /> {duration(s.durationMinutes)}</span>
          {s.rating && <span><Icon name="star-fill" size="sm" className="text-gold" /> {s.rating} ({s.reviewCount})</span>}
          {s.pickupAvailable && <span><Icon name="truck" size="sm" /> Pickup</span>}
        </div>
        <div className="service-foot">
          <div className="price-from"><small>{vehicleType ? 'Price' : 'Starting at'}</small>
            <b>{offered ? money(price, { compact: true }) : <span className="text-muted text-small">Not for this vehicle</span>}</b></div>
          <Link className="btn btn-primary btn-sm" to={`/book?service=${s.slug}${vehicleType ? `&vehicle=${vehicleType}` : ''}`}>Book <Icon name="arrow-right" size="sm" /></Link>
        </div>
      </div>
    </article>
  );
}
