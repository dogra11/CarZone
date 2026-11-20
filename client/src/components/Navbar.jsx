/**
 * components/Navbar.jsx - Site header. Becomes solid after scrolling, shows the cart count
 * (CartContext), Login or the user menu (AuthContext), and collapses into a mobile drawer.
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from '../router/index.jsx';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useToast } from './Toast.jsx';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import Img, { AVATAR_FALLBACK } from './Img.jsx';

const LINKS = [['/', 'Home'], ['/services', 'Car wash'], ['/shop', 'Shop'], ['/#offers', 'Offers'], ['/#faq', 'FAQ'], ['/#contact', 'Contact']];

export default function Navbar({ solid = false }) {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const doLogout = async () => {
    await logout();
    toast.success('You have been logged out. See you soon!', 'Logged out');
    navigate('/login');
  };

  const isAdmin = user?.role === 'admin';
  return (
    <>
      <header className={`site-header ${solid || scrolled || mobileOpen ? 'scrolled' : ''}`}>
        <div className="container nav">
          <Brand />
          <ul className="nav-links">
            {LINKS.map(([to, label]) => (
              <li key={to}>{to.includes('#') ? <Link to={to}>{label}</Link> : <NavLink to={to} end={to === '/'}>{label}</NavLink>}</li>
            ))}
          </ul>
          <div className="nav-actions">
            {!user || user.role === 'customer' ? (
              <Link className="cart-btn" to="/cart" aria-label={`Cart, ${count} items`}><Icon name="cart" />{count > 0 && <span className="cart-count">{count}</span>}</Link>
            ) : null}
            {user ? (
              <div className="user-menu">
                <button className="user-chip" aria-haspopup="true" aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>
                  <Img src={user.avatar} fallback={AVATAR_FALLBACK} /><span>{user.name.split(' ')[0]}</span><Icon name="chevron-down" size="sm" />
                </button>
                <div className={`dropdown ${menuOpen ? 'open' : ''}`}>
                  <div className="dropdown-head"><b>{user.name}</b><small>{user.email}</small></div>
                  <Link to={homeFor(user)}><Icon name="grid" /> {isAdmin ? 'Admin panel' : 'My dashboard'}</Link>
                  {isAdmin ? <Link to="/admin/bookings"><Icon name="calendar" /> Manage bookings</Link> : (
                    <>
                      <Link to="/dashboard/bookings"><Icon name="calendar" /> My bookings</Link>
                      <Link to="/dashboard/orders"><Icon name="package" /> My orders</Link>
                      <Link to="/dashboard/profile"><Icon name="user" /> Profile</Link>
                    </>
                  )}
                  <button onClick={doLogout}><Icon name="log-out" /> Log out</button>
                </div>
              </div>
            ) : <Link className="btn btn-ghost btn-sm hide-mobile" to="/login"><Icon name="log-in" size="sm" /> Login</Link>}
            {!isAdmin && <Link className="btn btn-primary btn-sm hide-mobile" to="/book">Book a wash</Link>}
            <button className="nav-toggle" aria-label={mobileOpen ? 'Close menu' : 'Open menu'} onClick={() => setMobileOpen((o) => !o)}><Icon name={mobileOpen ? 'x' : 'menu'} /></button>
          </div>
        </div>
      </header>
      <nav className={`mobile-nav ${mobileOpen ? 'open' : ''}`} aria-hidden={!mobileOpen}>
        {LINKS.map(([to, label]) => <Link key={to} to={to} onClick={() => setMobileOpen(false)}>{label}</Link>)}
        {user ? (
          <>
            <Link to={homeFor(user)}>{isAdmin ? 'Admin panel' : 'My dashboard'}</Link>
            <a href="#logout" onClick={(e) => { e.preventDefault(); doLogout(); }}>Log out</a>
          </>
        ) : (
          <><Link to="/login">Login</Link><Link to="/register">Create account</Link></>
        )}
        {!isAdmin && <Link className="btn btn-primary mt-2" to="/book">Book a wash</Link>}
      </nav>
    </>
  );
}
