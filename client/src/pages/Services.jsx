/**
 * pages/Services.jsx - Wash & detailing catalogue. Data is loaded once (useApi); filtering
 * by category, vehicle type and search happens instantly in React state.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useReveal } from '../hooks/useReveal.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS } from '../utils/shared.js';
import PublicLayout from '../components/PublicLayout.jsx';
import ServiceCard from '../components/ServiceCard.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Skeleton } from '../components/Loader.jsx';
import Img from '../components/Img.jsx';
import Icon from '../components/Icon.jsx';
import { Link } from '../router/index.jsx';

export default function Services() {
  useDocumentTitle('Car wash & detailing services');
  const [params] = useSearchParams();
  const query = useApi('/api/services');
  const [category, setCategory] = useState('All');
  const [vehicle, setVehicle] = useState(params.get('vehicle') || '');
  const [search, setSearch] = useState('');

  const list = useMemo(() => (query.data || []).filter((s) => (category === 'All' || s.category === category)
    && (!vehicle || s.prices[vehicle] !== undefined)
    && (!search || `${s.name} ${s.tagline} ${s.category}`.toLowerCase().includes(search.toLowerCase()))), [query.data, category, vehicle, search]);
  useReveal([list]);
  const categories = ['All', ...new Set((query.data || []).map((s) => s.category))];

  return (
    <PublicLayout>
      <main>
        <section className="page-hero with-image">
          <Img className="page-hero-bg" src="/assets/images/gallery/gallery-4.jpg" alt="" />
          <div className="container">
            <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Car wash</span></nav>
            <span className="eyebrow">Wash &amp; detailing</span>
            <h1>Every service, <span className="text-metal">one transparent price.</span></h1>
            <p className="lead mb-0">Choose your vehicle type to see the exact price. Every package can be customised with add-ons during booking.</p>
          </div>
        </section>
        <section className="section" style={{ paddingTop: 44 }}>
          <div className="container">
            <div className="toolbar">
              <div className="chips" role="tablist" aria-label="Filter by category">
                {categories.map((c) => <button key={c} className={`chip ${c === category ? 'active' : ''}`} onClick={() => setCategory(c)}>{c}</button>)}
              </div>
              <div className="filters">
                <select className="select" aria-label="Vehicle type" value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
                  <option value="">All vehicle types</option>
                  {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>)}
                </select>
                <div className="input-icon"><Icon name="search" size="sm" /><input className="input" type="search" placeholder="Search services" aria-label="Search services" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              </div>
            </div>
            {query.data && <p className="text-small text-muted" aria-live="polite">{list.length} service{list.length === 1 ? '' : 's'}{vehicle ? ` for ${VEHICLE_TYPE_LABELS[vehicle]}` : ''}</p>}
            <div className="grid grid-3">
              {query.loading ? <Skeleton count={6} /> : query.error ? <div style={{ gridColumn: '1/-1' }}><ErrorState error={query.error} onRetry={query.reload} /></div>
                : list.length ? list.map((s) => <ServiceCard key={s.id} service={s} vehicleType={vehicle} />)
                  : <div style={{ gridColumn: '1/-1' }}><EmptyState icon="search" title="No services match your filters" text="Try another category or clear the search."
                    action={<button className="btn btn-ghost btn-sm" onClick={() => { setCategory('All'); setVehicle(''); setSearch(''); }}>Clear filters</button>} /></div>}
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
