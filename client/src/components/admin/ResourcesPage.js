import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../icons';
import { categoryOf } from '../../lib';
import { api, errorText, isExpired, isVerified, needsPin } from './adminApi';

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  {
    key: 'unverified',
    label: 'Unverified',
    test: (r) => !isVerified(r),
    banner: 'These are live but marked unconfirmed. The public list shows them with a "Call first" warning. Call the provider, then turn Verified on.'
  },
  {
    key: 'nopin',
    label: 'No map pin',
    test: needsPin,
    banner: "These have a street address but no coordinates, so they're in the list but not on the map. Open one and use Look up address."
  }
];

const CSV_COLUMNS = [
  'id', 'slug', 'name', 'organization', 'type', 'description', 'address', 'city', 'state', 'zip_code',
  'latitude', 'longitude', 'phone', 'website', 'hours', 'services', 'eligibility', 'verified', 'source', 'updated_at'
];

const csvCell = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const downloadCsv = (rows) => {
  const lines = [CSV_COLUMNS.join(','), ...rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(','))];
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `checkpointkc-resources-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const matches = (r, q) =>
  !q || [r.name, r.organization, r.address, r.zip_code, r.services, r.hours]
    .some((v) => String(v || '').toLowerCase().includes(q));

/** Every resource on the map and in the list, with the two queues that need a person. */
const ResourcesPage = ({ go, onExpired, flash }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.resources()
      .then((list) => setRows([...list].sort((a, b) => a.name.localeCompare(b.name))))
      .catch((err) => (isExpired(err) ? onExpired() : setError(errorText(err, 'Could not load resources.'))));
  }, [onExpired]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, rows ? rows.filter(f.test).length : 0])),
    [rows]
  );
  const active = FILTERS.find((f) => f.key === filter);
  const q = query.trim().toLowerCase();
  const shown = rows ? rows.filter((r) => active.test(r) && matches(r, q)) : [];

  const open = (e, path) => {
    e.preventDefault();
    go(path);
  };

  return (
    <>
      <header className="adm-head">
        <div>
          <h2>Resources</h2>
          <p>Everything on the map and in the list, in one place</p>
        </div>
        <div className="adm-head-actions">
          <button className="adm-btn" onClick={() => downloadCsv(shown)} disabled={!rows}>
            <Icon name="download" size={15} /> Export CSV
          </button>
          <a className="adm-btn adm-btn-primary" href="/admin/resources/new" onClick={(e) => open(e, '/admin/resources/new')}>
            <Icon name="plus" size={15} /> Add resource
          </a>
        </div>
      </header>

      {flash && <div className="adm-flash" role="status"><Icon name="check" size={15} /> {flash}</div>}

      <div className="adm-toolbar">
        <label className="adm-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            placeholder="Search name, address, ZIP, service"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search resources"
          />
        </label>
        <div className="adm-segments" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? 'active' : ''}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}{f.key !== 'all' && rows ? ` · ${counts[f.key]}` : ''}
            </button>
          ))}
        </div>
        <span className="adm-count">{rows ? `Showing ${shown.length} of ${rows.length}` : ''}</span>
      </div>

      {active.banner && counts[filter] > 0 && (
        <div className="adm-banner"><Icon name="alert" size={15} /> {active.banner}</div>
      )}

      {error && <p className="adm-error">{error}</p>}
      {!rows && !error && <p className="adm-empty">Loading…</p>}

      {rows && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="adm-hide-sm">Organization</th>
                <th>Category</th>
                <th className="adm-hide-sm">Hours</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const cat = categoryOf(r.type);
                return (
                  <tr key={r.id} onClick={() => go(`/admin/resources/${r.id}`)}>
                    <td>
                      <div className="adm-name-cell">
                        <span className="adm-cat-icon" style={{ background: cat.color }}>
                          <Icon name={cat.key} size={15} />
                        </span>
                        <div>
                          <a href={`/admin/resources/${r.id}`} onClick={(e) => { e.stopPropagation(); open(e, `/admin/resources/${r.id}`); }}>
                            {r.name}
                          </a>
                          {needsPin(r)
                            ? <div className="adm-sub adm-sub-warn"><Icon name="pin" size={12} /> No map pin. Won't appear on the map</div>
                            : <div className="adm-sub">{[r.address, r.zip_code].filter(Boolean).join(' · ')}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="adm-hide-sm adm-muted">{r.organization}</td>
                    <td><span className="adm-cat" style={{ color: cat.color }}>{cat.label}</span></td>
                    <td className="adm-hide-sm adm-muted adm-hours">{r.hours}</td>
                    <td>
                      {isVerified(r)
                        ? <span className="adm-status adm-status-ok"><Icon name="check" size={13} /> Verified</span>
                        : <span className="adm-status adm-status-warn">Call first</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="adm-empty">
              <strong>Nothing matches that</strong>
              <span>Clear the search, or switch back to All.</span>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default ResourcesPage;
