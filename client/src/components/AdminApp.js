import React, { useCallback, useEffect, useState } from 'react';
import Icon from '../icons';
import OrgAuth from './OrgAuth';
import AddPostForm from './AddPostForm';
import ResourcesPage from './admin/ResourcesPage';
import ResourceEditor from './admin/ResourceEditor';
import TeamPage from './admin/TeamPage';
import { api, can, ROLES } from './admin/adminApi';
import './admin/admin.css';

/**
 * The admin area, at /admin — deliberately not a tab.
 *
 * The public app is used mostly on library and shelter terminals, and the two
 * audiences should never share a screen: a visitor sees no evidence this area
 * exists, and someone who signs in here is not one click away from handing a
 * live session to whoever sits down next. The same reasoning already drives
 * OrgAuth's "remember this device" defaulting to off.
 *
 * What each person sees follows their role on the allowlist (server/schema.sql):
 * publishers get Publish, editors also get Resources, admins also get Team.
 * The server enforces the same rules; hiding a screen here is only courtesy.
 */

const NAV = [
  { path: '/admin/resources', label: 'Resources', icon: 'pin', role: 'editor' },
  { path: '/admin/publish', label: 'Publish', icon: 'megaphone', role: 'publisher' },
  { path: '/admin/team', label: 'Team', icon: 'users', role: 'admin' }
];

const routeFor = (path, session) => {
  const p = path.replace(/\/+$/, '');
  if (can(session, 'editor')) {
    if (p === '/admin/resources/new') return { page: 'editor', id: null, nav: '/admin/resources' };
    const edit = p.match(/^\/admin\/resources\/(\d+)$/);
    if (edit) return { page: 'editor', id: edit[1], nav: '/admin/resources' };
  }
  const hit = NAV.find((n) => n.path === p);
  if (hit && can(session, hit.role)) return { page: hit.path.split('/')[2], nav: hit.path };
  // /admin itself, or a page this role can't open: the first one it can.
  const home = NAV.find((n) => can(session, n.role));
  return { page: home.path.split('/')[2], nav: home.path, redirect: home.path };
};

const AdminApp = () => {
  const [session, setSession] = useState(undefined); // undefined: checking; null: signed out
  const [path, setPath] = useState(window.location.pathname);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    api.me().then(setSession).catch(() => setSession(null));
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((to, { replace = false } = {}) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);

  const onExpired = useCallback(() => setSession(null), []);

  const signOut = async () => {
    await api.logout().catch(() => {});
    setSession(null);
  };

  const route = session ? routeFor(path, session) : null;
  const redirect = route?.redirect;
  useEffect(() => {
    if (redirect && redirect !== path) go(redirect, { replace: true });
  }, [redirect, path, go]);

  // Confirmations fade on their own rather than piling up.
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  if (session === undefined) {
    return <div className="adm-gate"><p className="adm-empty">Checking sign-in…</p></div>;
  }

  if (!session) {
    return (
      <div className="adm-gate">
        <div className="adm-gate-card">
          <h1>CheckpointKC <span>Admin</span></h1>
          <OrgAuth
            title="Sign in"
            onSignedIn={() => api.me().then(setSession).catch(() => setSession(null))}
            onCancel={() => { window.location.href = '/'; }}
          />
          <a className="adm-link" href="/">← Back to the public site</a>
        </div>
      </div>
    );
  }

  const role = ROLES.find((r) => r.value === session.role) || ROLES[0];
  const saved = (message) => { setFlash(message); go('/admin/resources'); };

  return (
    <div className="adm">
      <aside className="adm-nav">
        <a className="adm-brand" href="/admin" onClick={(e) => { e.preventDefault(); go('/admin'); }}>
          <img src="/logo192.png" alt="" width="28" height="28" />
          <span>CheckpointKC<small>Admin</small></span>
        </a>
        <nav aria-label="Admin sections">
          {NAV.filter((n) => can(session, n.role)).map((n) => (
            <a
              key={n.path}
              href={n.path}
              className={route.nav === n.path ? 'active' : ''}
              aria-current={route.nav === n.path ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); go(n.path); }}
            >
              <Icon name={n.icon} size={16} /> {n.label}
            </a>
          ))}
        </nav>
        <div className="adm-me">
          <div>
            <strong>{session.organization}</strong>
            <span>{session.email}</span>
            <span>{role.label}</span>
          </div>
          <button className="adm-btn" onClick={signOut}><Icon name="logout" size={14} /> Sign out</button>
          <a className="adm-link" href="/">Public site</a>
        </div>
      </aside>

      <main className="adm-main">
        {route.page === 'resources' && <ResourcesPage go={go} onExpired={onExpired} flash={flash} />}
        {route.page === 'editor' && (
          <ResourceEditor key={route.id || 'new'} id={route.id} go={go} onExpired={onExpired} onSaved={saved} />
        )}
        {route.page === 'team' && <TeamPage session={session} onExpired={onExpired} />}
        {route.page === 'publish' && (
          <div className="adm-publish">
            <header className="adm-head">
              <div>
                <h2>Publish</h2>
                <p>An event, or a closure or alert that would save someone a wasted trip</p>
              </div>
            </header>
            <AddPostForm />
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminApp;
