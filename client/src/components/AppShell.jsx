/**
 * components/AppShell.jsx - Sidebar + top bar layout used by the customer dashboard
 * and the admin panel. Each sidebar item is a route (/dashboard/orders, /admin/products...);
 * the parent page decides which section component to render for the current URL.
 */
import { useState } from 'react';
import { Link, NavLink, useNavigate } from '../router/index.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import Img, { AVATAR_FALLBACK } from './Img.jsx';

export default function AppShell({ base, items, active, roleLabel, topActions, counts = {}, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const groups = [];
  for (const item of items) {
    let g = groups.find((x) => x.name === (item.group || ''));
    if (!g) groups.push((g = { name: item.group || '', items: [] }));
    g.items.push(item);
  }
  const current = items.find((i) => i.id === active) || items[0];

  const doLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand />
        <nav className="side-nav">
          {groups.map((g) => (
            <div key={g.name || 'main'} style={{ display: 'contents' }}>
              {g.name && <div className="side-label">{g.name}</div>}
              {g.items.map((i) => (
                <NavLink key={i.id} to={i.id === items[0].id ? base : `${base}/${i.id}`} end onClick={() => setOpen(false)}
                  className={i.id === current.id ? 'active' : ''}>
                  <Icon name={i.icon} /><span>{i.label}</span>
                  {counts[i.id] ? <span className="count">{counts[i.id]}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-user">
          <Img src={user.avatar} fallback={AVATAR_FALLBACK} alt="" />
          <div><b>{user.name}</b><small>{roleLabel}</small></div>
          <button className="btn btn-dark btn-icon" title="Log out" aria-label="Log out" onClick={doLogout}><Icon name="log-out" size="sm" /></button>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <button className="btn btn-dark btn-icon side-toggle" aria-label="Menu" onClick={() => setOpen((o) => !o)}><Icon name="menu" /></button>
          <div><div className="crumb">{roleLabel}</div><h1>{current.label}</h1></div>
          <div className="top-actions">{topActions}<Link className="btn btn-ghost btn-sm" to="/"><Icon name="home" size="sm" /><span>Website</span></Link></div>
        </header>
        <main className="app-content" key={current.id}>{children}</main>
      </div>
    </div>
  );
}

export function PanelHead({ title, subtitle, children }) {
  return (
    <div className="panel-head">
      <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      {children && <div className="panel-tools">{children}</div>}
    </div>
  );
}
