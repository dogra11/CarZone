/**
 * pages/Shop.jsx - Accessories store listing.
 *
 * Filters: search, category, "Select your car" (make -> model), price range, minimum
 * rating, in-stock only, sorting. Filters live in React state; every change rebuilds the
 * query string and useApi() re-fetches /api/store/products (the SERVER does the filtering
 * with parameterised SQL). The chosen car is remembered in localStorage.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from '../router/index.jsx';
import { useApi } from '../hooks/useApi.js';
import { useReveal } from '../hooks/useReveal.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { PRODUCT_SORTS } from '../utils/shared.js';
import PublicLayout from '../components/PublicLayout.jsx';
import ProductCard from '../components/ProductCard.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Skeleton } from '../components/Loader.jsx';
import Img from '../components/Img.jsx';
import Icon from '../components/Icon.jsx';

const CAR_KEY = 'carzone_my_car';

export default function Shop() {
  useDocumentTitle('Car accessories shop');
  const [params] = useSearchParams();
  const saved = (() => { try { return JSON.parse(localStorage.getItem(CAR_KEY)) || {}; } catch { return {}; } })();
  const [f, setF] = useState({
    search: params.get('search') || '', category: params.get('category') || '', make: params.get('make') || saved.make || '',
    modelId: params.get('make') ? '' : (saved.modelId || ''), minPrice: '', maxPrice: '', minRating: '', inStock: false, sort: 'relevance',
  });
  const [search, setSearch] = useState(f.search);
  const categories = useApi('/api/store/categories');
  const models = useApi('/api/store/car-models');

  // Debounce the search box so we do not query on every keystroke.
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, search })), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { localStorage.setItem(CAR_KEY, JSON.stringify({ make: f.make, modelId: f.modelId })); }, [f.make, f.modelId]);
  useEffect(() => { setF((x) => ({ ...x, category: params.get('category') || x.category })); }, [params]);

  const qs = new URLSearchParams(Object.entries({
    search: f.search, category: f.category, carModelId: f.modelId, minPrice: f.minPrice, maxPrice: f.maxPrice, minRating: f.minRating,
    inStock: f.inStock ? '1' : '', sort: f.sort,
  }).filter(([, v]) => v !== '' && v !== null)).toString();
  const products = useApi(`/api/store/products?${qs}`);
  useReveal([products.data]);

  const makes = useMemo(() => [...new Set((models.data || []).map((m) => m.make))], [models.data]);
  const makeModels = (models.data || []).filter((m) => m.make === f.make);
  const selectedModel = (models.data || []).find((m) => String(m.id) === String(f.modelId));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const currentCat = (categories.data || []).find((c) => c.slug === f.category);

  return (
    <PublicLayout>
      <main>
        <section className="page-hero with-image">
          <Img className="page-hero-bg" src={currentCat ? currentCat.image : '/assets/images/store-hero.jpg'} alt="" />
          <div className="container">
            <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/">Home</Link><span>/</span><span>Shop</span>{currentCat && <><span>/</span><span>{currentCat.name}</span></>}</nav>
            <span className="eyebrow">Accessories store</span>
            <h1>{currentCat ? currentCat.name : <>Upgrade your drive, <span className="text-metal">fitted right.</span></>}</h1>
            <p className="lead mb-0">{currentCat ? currentCat.description : 'Select your car to see only accessories that fit - plus universal essentials. Free shipping above ₹999.'}</p>
          </div>
        </section>
        <section className="section" style={{ paddingTop: 36 }}>
          <div className="container shop-layout">
            <aside className="filters-panel card card-sm">
              <div className="my-car">
                <span className="label"><Icon name="car" size="sm" /> Select your car</span>
                <select className="select mt-1" aria-label="Car make" value={f.make} onChange={(e) => setF((x) => ({ ...x, make: e.target.value, modelId: '' }))}>
                  <option value="">All makes</option>{makes.map((m) => <option key={m}>{m}</option>)}
                </select>
                <select className="select mt-1" aria-label="Car model" value={f.modelId} disabled={!f.make} onChange={set('modelId')}>
                  <option value="">{f.make ? 'Choose model' : 'Choose a make first'}</option>{makeModels.map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
                </select>
                {selectedModel && <p className="text-small text-gold mt-1 mb-0"><Icon name="check-circle" size="sm" /> Showing parts for {selectedModel.make} {selectedModel.model} + universal items</p>}
              </div>
              <hr className="divider" />
              <span className="label">Category</span>
              <div className="filter-list mt-1">
                <button className={!f.category ? 'active' : ''} onClick={() => setF((x) => ({ ...x, category: '' }))}>All accessories</button>
                {(categories.data || []).map((c) => (
                  <button key={c.slug} className={f.category === c.slug ? 'active' : ''} onClick={() => setF((x) => ({ ...x, category: c.slug }))}>{c.name}<span>{c.productCount}</span></button>
                ))}
              </div>
              <hr className="divider" />
              <span className="label">Price (₹)</span>
              <div className="flex mt-1"><input className="input" type="number" min="0" placeholder="Min" aria-label="Minimum price" value={f.minPrice} onChange={set('minPrice')} />
                <input className="input" type="number" min="0" placeholder="Max" aria-label="Maximum price" value={f.maxPrice} onChange={set('maxPrice')} /></div>
              <span className="label mt-2" style={{ display: 'block' }}>Rating</span>
              <select className="select mt-1" aria-label="Minimum rating" value={f.minRating} onChange={set('minRating')}>
                <option value="">Any rating</option><option value="4">4 stars & up</option><option value="3">3 stars & up</option>
              </select>
              <label className="checkbox mt-2"><input type="checkbox" checked={f.inStock} onChange={set('inStock')} /> In stock only</label>
              <button className="btn btn-ghost btn-sm btn-block mt-2" onClick={() => { setSearch(''); setF({ search: '', category: '', make: '', modelId: '', minPrice: '', maxPrice: '', minRating: '', inStock: false, sort: 'relevance' }); }}>Reset filters</button>
            </aside>
            <div>
              <div className="toolbar">
                <div className="input-icon" style={{ flex: 1 }}><Icon name="search" size="sm" /><input className="input" type="search" placeholder="Search seat covers, dash cams, wax..." aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <select className="select" aria-label="Sort" value={f.sort} onChange={set('sort')}>{Object.entries(PRODUCT_SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </div>
              {products.data && <p className="text-small text-muted" aria-live="polite">{products.data.length} product{products.data.length === 1 ? '' : 's'}</p>}
              <div className="grid grid-3 product-grid">
                {products.loading && !products.data ? <Skeleton count={6} className="skeleton-card" />
                  : products.error ? <div style={{ gridColumn: '1/-1' }}><ErrorState error={products.error} onRetry={products.reload} /></div>
                    : products.data?.length ? products.data.map((p) => <ProductCard key={p.id} product={p} />)
                      : <div style={{ gridColumn: '1/-1' }}><EmptyState icon="search" title="No accessories match" text="Try another category, a wider price range or clear your car selection." /></div>}
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
