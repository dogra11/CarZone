/**
 * pages/Home.jsx - Landing page presenting BOTH businesses: hero with "Book a wash" and
 * "Shop accessories" CTAs, highlights, featured services, deals of the day, shop by car
 * brand (text chips - no logos), shop by category, offers, gallery, testimonials, FAQ,
 * contact form and map (OpenStreetMap with an offline fallback card).
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from '../router/index.jsx';
import { api } from '../services/api.js';
import { useApi } from '../hooks/useApi.js';
import { useMeta } from '../hooks/useMeta.js';
import { useForm } from '../hooks/useForm.js';
import { useReveal } from '../hooks/useReveal.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { schemas, CAR_MAKES } from '../utils/shared.js';
import { formatDateShort } from '../utils/format.js';
import PublicLayout from '../components/PublicLayout.jsx';
import ServiceCard from '../components/ServiceCard.jsx';
import ProductCard from '../components/ProductCard.jsx';
import OfferCard from '../components/OfferCard.jsx';
import FormField from '../components/FormField.jsx';
import EmptyState, { ErrorState } from '../components/EmptyState.jsx';
import { Skeleton } from '../components/Loader.jsx';
import { useToast } from '../components/Toast.jsx';
import Stars from '../components/Stars.jsx';
import Icon from '../components/Icon.jsx';
import Img, { AVATAR_FALLBACK } from '../components/Img.jsx';

/** Renders a grid from a useApi() query with skeleton / error / empty states. */
function Section({ query, empty, render, skeleton = 3 }) {
  if (query.loading) return <Skeleton count={skeleton} />;
  if (query.error) return <div style={{ gridColumn: '1/-1' }}><ErrorState error={query.error} onRetry={query.reload} /></div>;
  if (!query.data?.length) return <div style={{ gridColumn: '1/-1' }}>{empty}</div>;
  return render(query.data);
}

const FAQ = [
  ['How long does a wash or detailing take?', 'A Basic Exterior Wash takes about 45 minutes, a Premium Wash about 75 minutes and Full Detailing around 6 hours. Ceramic coating needs a full day so the coating can cure. The exact duration is shown on every service.'],
  ['How are wash prices calculated?', 'Each service has a price per vehicle type. Add-ons and the optional pickup & drop fee are added, any coupon discount is applied and 18% GST is calculated on the final amount. You see the full breakdown before paying.'],
  ['Will an accessory fit my car?', 'Use "Select your car" in the shop. You will only see products that fit your make and model, plus universal products. Every product page lists the compatible models.'],
  ['Can you install what I buy?', 'Yes. Products marked "Fitment available" can be installed at the CarZone centre - choose a fitment slot at checkout for a flat fee.'],
  ['What is the delivery, cancellation and return policy?', 'Shipping is free above Rs 999. Orders can be cancelled until they are shipped (stock is released and paid orders are refunded in full). Delivered items can be returned within 7 days.'],
  ['Which payment methods do you accept?', 'Cards (with 3-D Secure OTP), UPI, net banking, wallets and - for store orders - cash on delivery. Every successful payment gets a GST invoice with the transaction ID.'],
];

function MapBox({ company }) {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    if (!company || !navigator.onLine) return undefined;
    let done = false;
    const timer = setTimeout(() => { done = true; }, 4000);
    // The map needs internet: probe OpenStreetMap first, keep the fallback card if offline.
    fetch('https://www.openstreetmap.org/favicon.ico', { mode: 'no-cors', cache: 'no-store' })
      .then(() => { if (!done) setOnline(true); })
      .catch(() => {});
    return () => { done = true; clearTimeout(timer); };
  }, [company]);
  const lat = company?.latitude ?? 18.5603;
  const lon = company?.longitude ?? 73.7879;
  const bbox = [lon - 0.012, lat - 0.007, lon + 0.012, lat + 0.007].join(',');
  return (
    <div className="map-box">
      <div className="map-fallback">
        <Img src="/assets/images/map-fallback.jpg" alt="Stylised map of Baner, Pune showing the CarZone centre" />
        <div className="card card-glass card-sm map-card">
          <div className="flex between flex-wrap">
            <div><b>CarZone Wash &amp; Accessories Centre</b><div className="text-small text-muted">Baner-Balewadi Road, Pune</div></div>
            <a className="btn btn-dark btn-sm" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`} target="_blank" rel="noopener noreferrer">Open map</a>
          </div>
        </div>
      </div>
      {online && <iframe title="CarZone location on OpenStreetMap" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`} />}
    </div>
  );
}

export default function Home() {
  useDocumentTitle('');
  const toast = useToast();
  const meta = useMeta();
  const { hash } = useLocation();
  const services = useApi('/api/services');
  const deals = useApi('/api/store/products?deal=1');
  const categories = useApi('/api/store/categories');
  const offers = useApi('/api/offers');
  const reviews = useApi('/api/reviews/featured');
  const form = useForm(schemas.contact, { name: '', email: '', phone: '', subject: '', message: '' });
  useReveal([services.data, deals.data, categories.data, offers.data, reviews.data]);

  // Scroll to #offers / #contact when the URL hash changes (navbar links).
  useEffect(() => {
    if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, [hash]);

  const sendMessage = form.handleSubmit(async (data) => {
    const r = await api.post('/api/contact', data);
    toast.success(r.message, 'Message sent');
    form.reset();
  });

  return (
    <PublicLayout>
      <main>
        <section className="hero" id="top">
          <div className="hero-bg"><Img src="/assets/images/hero.jpg" alt="Luxury car under studio lights in the CarZone detailing bay" fetchpriority="high" /></div>
          <div className="container">
            <div className="hero-content">
              <span className="eyebrow">Wash · Detailing · Accessories · Pune</span>
              <h1>Everything your car needs,<br /><em className="text-metal">in one zone.</em></h1>
              <p className="lead">Premium foam washes, ceramic coatings and full detailing - plus 70+ accessories that fit Indian cars, with installation at our centre. Book or shop in under a minute.</p>
              <div className="hero-actions">
                <Link className="btn btn-primary btn-lg" to="/book">Book a wash <Icon name="arrow-right" size="sm" /></Link>
                <Link className="btn btn-gold btn-lg" to="/shop"><Icon name="cart" size="sm" /> Shop accessories</Link>
              </div>
              <div className="hero-stats">
                <div><b>4.9<span className="text-gold">&#9733;</span></b><span>Customer rating</span></div>
                <div><b>12,000+</b><span>Cars detailed</span></div>
                <div><b>70+</b><span>Accessories</span></div>
                <div><b>35</b><span>Car models covered</span></div>
              </div>
            </div>
          </div>
          <div className="hero-badge"><div className="card card-glass">
            <div className="flex"><span className="badge badge-success">Open today</span><span className="text-small text-muted">8 AM - 6 PM</span></div>
            <p className="mt-1 mb-0 text-small">Free shipping above ₹999 · Fitment at our centre · Free cancellation up to 24 h before a wash.</p>
          </div></div>
        </section>

        <section className="feature-strip" id="highlights">
          <div className="container"><div className="grid grid-4">
            {[['award', 'Certified detailers', 'Trained on premium paints and coatings.'], ['truck', 'Pickup & delivery', 'Doorstep car pickup and fast shipping.'],
              ['shield', 'Fits your car', 'Compatibility checked for 35 Indian models.'], ['rupee', 'Transparent bills', 'GST invoices for every wash and order.']].map(([ic, h, p]) => (
              <div className="feature" key={h}><div className="f-icon"><Icon name={ic} /></div><div><h4>{h}</h4><p>{p}</p></div></div>
            ))}
          </div></div>
        </section>

        <section className="section" id="services">
          <div className="container">
            <div className="flex between flex-wrap" style={{ alignItems: 'flex-end', marginBottom: 44 }}>
              <div className="section-head mb-0 reveal"><span className="eyebrow">Car wash &amp; detailing</span><h2>Crafted care for every <span className="text-metal">surface</span></h2>
                <p className="mb-0">From a quick exterior refresh to multi-year ceramic protection - priced for your vehicle type.</p></div>
              <Link className="btn btn-ghost reveal" to="/services">All 9 services</Link>
            </div>
            <div className="grid grid-3">
              <Section query={services} empty={<EmptyState icon="sparkles" title="Services coming soon" />}
                render={(list) => [...list].sort((a, b) => b.isFeatured - a.isFeatured).slice(0, 3).map((s) => <ServiceCard key={s.id} service={s} />)} />
            </div>
          </div>
        </section>

        <section className="section store-band" id="deals">
          <div className="container">
            <div className="flex between flex-wrap" style={{ alignItems: 'flex-end', marginBottom: 36 }}>
              <div className="section-head mb-0 reveal"><span className="eyebrow">Accessories store</span><h2>Deals of the day</h2>
                <p className="mb-0">Hand-picked accessories at their best price this week.</p></div>
              <Link className="btn btn-ghost reveal" to="/shop">Visit the shop</Link>
            </div>
            <div className="grid grid-4">
              <Section query={deals} skeleton={4} empty={<EmptyState icon="tag" title="No deals today" />} render={(list) => list.slice(0, 8).map((p) => <ProductCard key={p.id} product={p} />)} />
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} id="shop-by">
          <div className="container">
            <div className="section-head reveal"><span className="eyebrow">Shop by car brand</span><h2>Accessories that fit your car</h2></div>
            <div className="chips brand-chips reveal">
              {Object.keys(CAR_MAKES).map((make) => <Link key={make} className="chip" to={`/shop?make=${encodeURIComponent(make)}`}>{make}</Link>)}
            </div>
            <div className="section-head mt-4 reveal"><span className="eyebrow">Shop by category</span></div>
            <div className="category-grid">
              <Section query={categories} skeleton={4} empty={null} render={(list) => list.map((c) => (
                <Link key={c.id} className="category-tile reveal" to={`/shop?category=${c.slug}`}>
                  <Img src={c.image} alt="" loading="lazy" />
                  <div><b>{c.name}</b><span>{c.productCount} products</span></div>
                </Link>
              ))} />
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="section-head center reveal"><span className="eyebrow">How it works</span><h2>Book or shop in four steps</h2></div>
            <div className="grid grid-4 steps">
              {[['car', 'Pick your car', 'Choose your vehicle once - prices and compatible accessories adapt.'], ['sparkles', 'Choose service or product', 'Add extras like headlight restoration or fitment.'],
                ['calendar', 'Select a slot', 'Live availability for washes and accessory fitment.'], ['shield', 'Pay securely', 'Card OTP, UPI, net banking, wallets or COD - with a GST invoice.']].map(([ic, h, p], i) => (
                <div key={h} className={`card step-card reveal reveal-delay-${i}`}><div className="step-num">0{i + 1}</div><Icon name={ic} size="lg" /><h4>{h}</h4><p className="text-small mb-0">{p}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="offers" style={{ background: 'linear-gradient(180deg,transparent,rgba(201,169,97,0.04),transparent)' }}>
          <div className="container">
            <div className="section-head reveal"><span className="eyebrow">Offers</span><h2>Exclusive savings this season</h2><p>One coupon engine for washes and the store - tap a code to copy it.</p></div>
            <div className="grid grid-3">
              <Section query={offers} empty={<EmptyState icon="gift" title="No live offers right now" />} render={(list) => list.slice(0, 6).map((o) => <OfferCard key={o.id} coupon={o} />)} />
            </div>
          </div>
        </section>

        <section className="section" id="gallery">
          <div className="container">
            <div className="section-head center reveal"><span className="eyebrow">Gallery</span><h2>Inside the CarZone centre</h2></div>
            <div className="gallery reveal">
              {[['gallery-1', 'Paint correction bay'], ['gallery-2', 'Snow foam pre-wash'], ['gallery-3', 'Ceramic water beading'], ['gallery-4', 'Mirror finish on an SUV'], ['gallery-5', 'Interior detailing'], ['gallery-6', 'Superbike shine']].map(([f, cap]) => (
                <figure key={f}><Img src={`/assets/images/gallery/${f}.jpg`} alt={cap} loading="lazy" /><figcaption>{cap}</figcaption></figure>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="testimonials">
          <div className="container">
            <div className="section-head center reveal"><span className="eyebrow">Testimonials</span><h2>Loved by car owners across Pune</h2></div>
            <div className="grid grid-3">
              <Section query={reviews} empty={<EmptyState icon="star" title="Be our first reviewer" />} render={(list) => list.slice(0, 6).map((r) => (
                <article className="card testimonial reveal" key={r.id}>
                  <Icon name="quote" className="quote-icon" /><Stars rating={r.rating} />
                  <blockquote>"{r.comment}"</blockquote>
                  <div className="who"><Img className="avatar" src={r.avatar} fallback={AVATAR_FALLBACK} alt="" />
                    <div><b>{r.customerName}</b><small>{r.serviceName} · {r.vehicle} · {formatDateShort(r.createdAt)}</small></div></div>
                </article>
              ))} />
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container" style={{ maxWidth: 860 }}>
            <div className="section-head center reveal"><span className="eyebrow">FAQ</span><h2>Questions, answered</h2></div>
            <div className="accordion reveal">
              {FAQ.map(([q, a], i) => (
                <details key={q} open={i === 0}><summary>{q}<Icon name="chevron-down" /></summary><div className="acc-body"><p>{a}</p></div></details>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="contact">
          <div className="container">
            <div className="section-head reveal"><span className="eyebrow">Contact</span><h2>Visit the centre or send us a note</h2></div>
            <div className="contact-grid">
              <div className="card reveal">
                <form onSubmit={sendMessage} noValidate>
                  <div className="form-grid">
                    <FormField label="Full name" autoComplete="name" placeholder="Your name" {...form.field('name')} />
                    <FormField label="Email" type="email" autoComplete="email" placeholder="you@example.com" {...form.field('email')} />
                    <FormField label="Mobile (optional)" type="tel" placeholder="98xxxxxxxx" {...form.field('phone')} />
                    <FormField label="Subject" placeholder="How can we help?" {...form.field('subject')} />
                    <FormField label="Message" type="textarea" span={2} placeholder="Tell us about your car and what you need" {...form.field('message')} />
                  </div>
                  <button className={`btn btn-primary mt-3 ${form.submitting ? 'is-loading' : ''}`} type="submit">Send message</button>
                </form>
              </div>
              <div className="reveal">
                <div className="contact-info">
                  <div className="row"><div className="f-icon"><Icon name="map-pin" /></div><div><b>Centre address</b><span>{meta?.company.address || 'Baner, Pune'}</span></div></div>
                  <div className="row"><div className="f-icon"><Icon name="phone" /></div><div><b>Call or WhatsApp</b><span>{meta?.company.phone}</span></div></div>
                  <div className="row"><div className="f-icon"><Icon name="clock" /></div><div><b>Opening hours</b><span>Monday - Sunday, 8:00 AM - 6:00 PM</span></div></div>
                </div>
                <MapBox company={meta?.company} />
              </div>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container"><div className="cta-banner reveal">
            <div><h2>Ready for that just-detailed feeling?</h2><p>Book a slot today, or kit out your car from the accessories store.</p></div>
            <div className="flex flex-wrap"><Link className="btn btn-primary btn-lg" to="/book">Book your slot</Link><Link className="btn btn-ghost btn-lg" to="/shop">Shop now</Link></div>
          </div></div>
        </section>
      </main>
    </PublicLayout>
  );
}
