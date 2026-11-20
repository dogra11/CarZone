/** components/Stars.jsx - Read-only star rating. */
import Icon from './Icon.jsx';

export default function Stars({ rating, max = 5 }) {
  return (
    <span className="stars" aria-label={`${rating} out of ${max} stars`}>
      {Array.from({ length: max }, (_, i) => <Icon key={i} name="star-fill" className={i < Math.round(rating) ? '' : 'off'} />)}
    </span>
  );
}
