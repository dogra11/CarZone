/**
 * pages/ServiceDetail.jsx - One wash service: image, description, benefits, price per
 * vehicle type, add-ons and approved reviews. The URL slug comes from useParams().
 */
import { Link, useParams } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useReveal } from '../hooks/useReveal.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { money, duration, formatDate, vehicleLabel } from '../utils/format.js';
import { VEHICLE_TYPES } from '../utils/shared.js';
import PublicLayout from '../components/PublicLayout.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Loader } from '../components/Loader.jsx';
import Stars from '../components/Stars.jsx';
import Icon from '../components/Icon.jsx';
import Img, { AVATAR_FALLBACK } from '../components/Img.jsx';

export default function ServiceDetail() {
  const { slug } = useParams();
  const q = useApi(`/api/services/${encodeURIComponent(slug)}`);
  const s = q.data;
  useDocumentTitle(s?.name || 'Service');
  useReveal([s]);

  let body;
  if (q.loading) body = <Loader text="Loading service..." />;
  else if (q.error) body = q.error.status === 404 ? <EmptyState icon="search" title="Service not found" action={<Link className="btn btn-primary" to="/services">Browse services</Link>} /> : <ErrorState error={q.error} onRetry={q.reload} />;
  else body = (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><Link to="/services">Car wash</Link><span>/</span><span>{s.name}</span></nav>
      <div className="detail-layout">
        <div>
          <div className="detail-hero-img reveal"><Img src={s.image} alt={s.name} /></div>
          <div className="mt-4 reveal">
            <div className="flex flex-wrap mb-2"><span className="badge badge-blue">{s.category}</span>{s.isFeatured && <span className="badge badge-gold no-dot"><Icon name="crown" size="sm" /> Signature service</span>}<span className="badge badge-success">Available for booking</span></div>
            <h1 style={{ fontSize: 'clamp(2rem,4vw,3rem)' }}>{s.name}</h1>
            <p className="lead">{s.tagline}</p>
            <div className="flex flex-wrap text-muted text-small mb-3" style={{ gap: 22 }}>
              <span className="flex"><Icon name="clock" size="sm" /> {duration(s.durationMinutes)}</span>
              {s.rating && <span className="flex"><Stars rating={s.rating} /> {s.rating} from {s.reviewCount} review{s.reviewCount > 1 ? 's' : ''}</span>}
              <span className="flex"><Icon name="truck" size="sm" /> {s.pickupAvailable ? 'Pickup & drop available' : 'Centre drop-off only'}</span>
            </div>
            <p>{s.description}</p>
          </div>
          <div className="card mt-3 reveal"><h3>What's included</h3><ul className="check-list mb-0">{s.benefits.map((b) => <li key={b}><Icon name="check-circle" />{b}</li>)}</ul></div>
          <div className="card mt-3 reveal">
            <div className="card-title"><h3>Optional add-ons</h3><span className="text-small text-muted">Select during booking</span></div>
            {s.addons.length ? <div className="addon-list">{s.addons.map((a) => (
              <div className="addon-item" key={a.id}><div><b>{a.name}</b><small>{a.description}</small></div><b className="text-blue">+{money(a.pricePaise, { compact: true })}</b></div>))}</div>
              : <p className="mb-0 text-muted">No add-ons for this service.</p>}
          </div>
          <div className="card mt-3 reveal">
            <div className="card-title"><h3>Customer reviews</h3>{s.rating && <span className="flex"><Stars rating={s.rating} /> <b>{s.rating}</b></span>}</div>
            {s.reviews.length ? s.reviews.map((r) => (
              <div className="review-item" key={r.id}>
                <div className="flex between flex-wrap"><div className="flex"><Img className="avatar" src={r.avatar} fallback={AVATAR_FALLBACK} alt="" />
                  <div><b>{r.customerName}</b><div className="text-small text-muted">{r.vehicle} · {formatDate(r.createdAt)}</div></div></div><Stars rating={r.rating} /></div>
                <h4 className="mt-2 mb-0">{r.title}</h4><p className="mb-0 mt-1">{r.comment}</p>
                {r.adminReply && <div className="review-reply"><b className="text-gold">CarZone replied:</b> {r.adminReply}</div>}
              </div>)) : <EmptyState icon="star" title="No reviews yet" text="Book this service and be the first to share your experience." />}
          </div>
        </div>
        <aside className="sticky">
          <div className="card card-glass">
            <span className="eyebrow">Pricing</span><h3>Price by vehicle type</h3>
            <div className="price-table mt-2">{VEHICLE_TYPES.map((t) => (
              <div key={t} className={`price-row ${s.prices[t] === undefined ? 'na' : ''}`}><span>{vehicleLabel(t)}</span><b>{s.prices[t] === undefined ? 'Not offered' : money(s.prices[t], { compact: true })}</b></div>))}</div>
            <p className="text-small text-muted mt-2">Prices exclude 18% GST. Pickup &amp; drop adds a flat fee.</p>
            <Link className="btn btn-primary btn-block btn-lg mt-2" to={`/book?service=${s.slug}`}>Book this service <Icon name="arrow-right" size="sm" /></Link>
            <Link className="btn btn-ghost btn-block mt-2" to="/shop?category=car-care">Shop car care products</Link>
          </div>
        </aside>
      </div>
    </>
  );

  return <PublicLayout solid glow><main className="container" style={{ paddingTop: 'calc(var(--header-h) + 36px)', paddingBottom: 60 }}>{body}</main></PublicLayout>;
}
