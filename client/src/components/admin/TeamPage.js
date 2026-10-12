import React, { useEffect, useState } from 'react';
import Icon from '../../icons';
import { api, errorText, isExpired, formatWhen, ROLES } from './adminApi';

const EMPTY = { org_name: '', email: '', role: 'publisher' };

const initials = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/**
 * Who can sign in, and what they can do. This list is the whole account
 * system: there are no passwords, and removing someone ends their access at
 * once.
 */
const TeamPage = ({ session, onExpired }) => {
  const [members, setMembers] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const handleError = (err, fallback) => (isExpired(err) ? onExpired() : setError(errorText(err, fallback)));

  const load = () => api.team().then(setMembers).catch((err) => handleError(err, 'Could not load the team.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const row = await api.addMember(draft);
      setNotice(`Added ${row.email}. They can sign in at checkpointkc.com/admin with that address.`);
      setDraft(EMPTY);
      setAdding(false);
      load();
    } catch (err) {
      handleError(err, 'Could not add them.');
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (m, role) => {
    setError('');
    try {
      await api.updateMember(m.id, { role });
      setNotice(`${m.email} is now ${ROLES.find((r) => r.value === role).label.toLowerCase()}.`);
      load();
    } catch (err) {
      handleError(err, 'Could not change their role.');
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.email} (${m.org_name})? They're signed out immediately and can't sign in again unless re-added.`)) return;
    setError('');
    try {
      await api.removeMember(m.id);
      setNotice(`Removed ${m.email}.`);
      load();
    } catch (err) {
      handleError(err, 'Could not remove them.');
    }
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h2>Team</h2>
          <p>Who can sign in to this admin area, and what they can change</p>
        </div>
        {!adding && (
          <div className="adm-head-actions">
            <button className="adm-btn adm-btn-primary" onClick={() => { setAdding(true); setNotice(''); }}>
              <Icon name="plus" size={15} /> Add someone
            </button>
          </div>
        )}
      </header>

      <div className="adm-info">
        <Icon name="info" size={16} />
        <p>
          <strong>There are no passwords.</strong> Someone on this list enters their email, gets a 6-digit code, and
          that signs them in. Removing them here ends their access at once. Nobody ever needs the database password.
        </p>
      </div>

      {notice && <div className="adm-flash" role="status"><Icon name="check" size={15} /> {notice}</div>}
      {error && <div className="adm-banner adm-banner-error" role="alert"><Icon name="alert" size={15} /> {error}</div>}

      {adding && (
        <form className="adm-card adm-add" onSubmit={add}>
          <div className="adm-add-head">
            <h3>Add someone</h3>
            <button type="button" className="adm-icon-btn" aria-label="Close" onClick={() => { setAdding(false); setDraft(EMPTY); }}>
              <Icon name="close" size={15} />
            </button>
          </div>
          <div className="adm-fields">
            <div className="adm-field">
              <label htmlFor="t-org">Organization</label>
              <input id="t-org" value={draft.org_name} onChange={(e) => setDraft({ ...draft, org_name: e.target.value })} required maxLength={200} />
            </div>
            <div className="adm-field">
              <label htmlFor="t-email">Email address</label>
              <input id="t-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} required />
            </div>
            <fieldset className="adm-field adm-field-wide adm-roles">
              <legend>What can they do?</legend>
              {ROLES.map((r) => (
                <label key={r.value} className={`adm-role${draft.role === r.value ? ' active' : ''}`}>
                  <input type="radio" name="role" value={r.value} checked={draft.role === r.value} onChange={() => setDraft({ ...draft, role: r.value })} />
                  <span><strong>{r.label}</strong><span className="adm-hint">{r.hint}</span></span>
                </label>
              ))}
            </fieldset>
          </div>
          <p className="adm-hint">
            Use an inbox the person actually checks: whoever can read it can sign in. Give the lowest role that does the job.
          </p>
          <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
        </form>
      )}

      {!members && !error && <p className="adm-empty">Loading…</p>}
      {members && (
        <div className="adm-table-wrap">
          <table className="adm-table adm-team">
            <thead>
              <tr>
                <th>Organization</th>
                <th className="adm-hide-sm">Email</th>
                <th>Role</th>
                <th className="adm-hide-sm">Last active</th>
                <th><span className="adm-sr">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.email === session.email;
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="adm-name-cell">
                        <span className="adm-avatar">{initials(m.org_name)}</span>
                        <div>
                          <strong>{m.org_name}</strong>
                          <div className="adm-sub adm-show-sm">{m.email}</div>
                          {self && <div className="adm-sub">That's you</div>}
                        </div>
                      </div>
                    </td>
                    <td className="adm-hide-sm adm-muted">{m.email}</td>
                    <td>
                      <select
                        value={m.role}
                        disabled={self}
                        title={self ? "You can't change your own role" : undefined}
                        onChange={(e) => changeRole(m, e.target.value)}
                        aria-label={`Role for ${m.email}`}
                      >
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </td>
                    <td className="adm-hide-sm adm-muted">{m.last_seen ? formatWhen(m.last_seen) : 'Not signed in recently'}</td>
                    <td>
                      {!self && (
                        <button className="adm-link adm-link-danger" onClick={() => remove(m)}>Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default TeamPage;
