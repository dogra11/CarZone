/**
 * router/index.jsx - Our own small client-side router (about 120 lines).
 *
 * DELIBERATE DECISION: instead of the react-router-dom package we use this tiny router
 * with the SAME component names (BrowserRouter, Routes, Route, Link, NavLink, Navigate,
 * useNavigate, useParams, useLocation, useSearchParams). Reasons:
 *   - zero extra dependencies: the prebuilt app works offline with only React;
 *   - it is short enough to explain completely in a viva (History API + React context).
 *
 * How it works:
 *   1. BrowserRouter keeps the current URL in React state and listens to the browser's
 *      back/forward buttons ("popstate").
 *   2. navigate('/x') calls history.pushState() and updates that state -> re-render.
 *   3. <Routes> picks the FIRST <Route> whose path pattern matches the URL and renders
 *      its element. ":name" segments become params, a trailing "/*" matches the rest.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, Children, isValidElement } from 'react';

const RouterContext = createContext(null);
const ParamsContext = createContext({});

const readLocation = () => ({ pathname: window.location.pathname, search: window.location.search, hash: window.location.hash });

export function BrowserRouter({ children }) {
  const [location, setLocation] = useState(readLocation);

  useEffect(() => {
    const onPop = () => setLocation(readLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    if (typeof to === 'number') { window.history.go(to); return; }
    if (to === window.location.pathname + window.location.search + window.location.hash) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', to);
    setLocation(readLocation());
    if (!to.includes('#')) window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ location, navigate }), [location, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

/** Matches "/services/:slug" against "/services/foam-wash" -> { slug: 'foam-wash' } (or null). */
export function matchPath(pattern, pathname) {
  const clean = (p) => p.replace(/\/+$/, '') || '/';
  const pat = clean(pattern);
  const path = clean(pathname);
  if (pat === '*') return {};
  const wildcard = pat.endsWith('/*');
  const patParts = (wildcard ? pat.slice(0, -2) : pat).split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (wildcard ? pathParts.length < patParts.length : pathParts.length !== patParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(':')) params[patParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    else if (patParts[i] !== pathParts[i]) return null;
  }
  if (wildcard) params['*'] = pathParts.slice(patParts.length).join('/');
  return params;
}

/** Declarative route config element - <Routes> reads its props, it never renders itself. */
export function Route() {
  return null;
}

export function Routes({ children }) {
  const { location } = useContext(RouterContext);
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    const params = matchPath(child.props.path, location.pathname);
    if (params) return <ParamsContext.Provider value={params}>{child.props.element}</ParamsContext.Provider>;
  }
  return null;
}

export function useNavigate() {
  return useContext(RouterContext).navigate;
}

export function useLocation() {
  return useContext(RouterContext).location;
}

export function useParams() {
  return useContext(ParamsContext);
}

export function useSearchParams() {
  const { search } = useLocation();
  return [useMemo(() => new URLSearchParams(search), [search])];
}

/** <Link to="/services"> - a normal <a> that navigates without reloading the page. */
export function Link({ to, replace, onClick, children, ...rest }) {
  const navigate = useNavigate();
  const handleClick = (e) => {
    onClick?.(e);
    // Let the browser handle new-tab clicks, modifier keys and external targets.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || rest.target) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handleClick} {...rest}>{children}</a>;
}

/** Like Link, but adds the "active" class when the URL matches (used in menus). */
export function NavLink({ to, end = false, className = '', ...rest }) {
  const { pathname } = useLocation();
  const target = to.split(/[?#]/)[0];
  const active = end ? pathname === target : pathname === target || pathname.startsWith(`${target.replace(/\/$/, '')}/`);
  return <Link to={to} className={`${className} ${active ? 'active' : ''}`.trim()} {...rest} />;
}

/** Redirect while rendering, e.g. <Navigate to="/login" replace /> */
export function Navigate({ to, replace = true }) {
  const navigate = useNavigate();
  useEffect(() => { navigate(to, { replace }); }, [to, replace, navigate]);
  return null;
}
