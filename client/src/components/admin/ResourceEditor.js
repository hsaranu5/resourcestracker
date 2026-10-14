import React, { useEffect, useMemo, useState } from 'react';
import Icon from '../../icons';
import { CATEGORIES } from '../../lib';
import { OpenBadge, VerifiedWarning } from '../ResourceList';
import { api, errorText, isExpired, formatWhen, ADDRESS_PLACEHOLDERS, isPlaceholderAddress } from './adminApi';

const EMPTY = {
  name: '', organization: '', type: '', description: '', address: '', city: 'Kansas City', state: 'MO',
  zip_code: '', latitude: '', longitude: '', phone: '', website: '', hours: '', source: '',
  services: '', eligibility: '', verified: 0
};

const FIELD_LABELS = {
  name: 'name', organization: 'organization', type: 'category', description: 'description', address: 'address',
  city: 'city', state: 'state', zip_code: 'ZIP', latitude: 'map pin', longitude: 'map pin', phone: 'phone',
  website: 'website', hours: 'hours', source: 'source', services: 'services', eligibility: 'eligibility',
  verified: 'verified'
};

const toForm = (row) =>
  Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row[k] == null ? EMPTY[k] === 0 ? 0 : '' : row[k]]));

const placeKey = (f) => [f.address, f.city, f.state, f.zip_code].map((v) => String(v).trim().toLowerCase()).join('|');

const changedFields = (before, after) => {
  if (!before || !after) return [];
  const names = Object.keys(FIELD_LABELS)
    .filter((k) => String(before[k] ?? '') !== String(after[k] ?? ''))
    .map((k) => FIELD_LABELS[k]);
  return [...new Set(names)];
};

/** Services are stored ';'-separated; edited as chips. */
const ServicesInput = ({ value, onChange }) => {
  const [draft, setDraft] = useState('');
  const list = value.split(';').map((s) => s.trim()).filter(Boolean);
  const add = () => {
    const next = draft.replace(/;/g, ',').trim();
    if (next && !list.some((s) => s.toLowerCase() === next.toLowerCase())) onChange([...list, next].join(';'));
    setDraft('');
  };
  return (
    <div className="adm-tags">
      {list.map((s) => (
        <span key={s} className="adm-tag">
          {s}
          <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(list.filter((x) => x !== s).join(';'))}>
            <Icon name="close" size={11} />
          </button>
        </span>
      ))}
      <input
        id="r-services"
        value={draft}
        placeholder={list.length ? 'Add another' : 'Type a service and press Enter'}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
          if (e.key === 'Backspace' && !draft && list.length) onChange(list.slice(0, -1).join(';'));
        }}
        onBlur={add}
      />
    </div>
  );
};

const Field = ({ id, label, hint, children, wide }) => (
  <div className={`adm-field${wide ? ' adm-field-wide' : ''}`}>
    <label htmlFor={id}>{label}</label>
    {children}
    {hint && <p className="adm-hint">{hint}</p>}
  </div>
);

/**
 * Add or edit one resource. Saving goes live immediately, so the form leans
 * on the "Verified" switch: anything not confirmed with the provider shows the
 * public "Call first" warning.
 *
 * From the Import screen (ImportPage's ImportReview) it opens already filled
 * in: `prefill` for a new place, `overrides` laid over an existing row for a
 * workbook's changes, and `importContext` for the header, the workbook's notes
 * and Skip. Leaving then only asks for confirmation if the person typed
 * something, since the filled-in values alone are not their unsaved work.
 */
const ResourceEditor = ({ id, go, onExpired, onSaved, prefill, overrides, importContext }) => {
  const isNew = !id;
  const firstForm = isNew ? (prefill ? toForm({ ...EMPTY, ...prefill }) : EMPTY) : null;
  const [form, setForm] = useState(firstForm);
  const [original, setOriginal] = useState(isNew ? EMPTY : null);
  const [shown, setShown] = useState(firstForm);
  const [pinFor, setPinFor] = useState(null);
  const [manualPin, setManualPin] = useState(false);
  const [lookup, setLookup] = useState({ busy: false, message: '', error: false });
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleError = (err, fallback) => (isExpired(err) ? onExpired() : setError(errorText(err, fallback)));

  useEffect(() => {
    if (isNew) return;
    api.resource(id)
      .then((row) => {
        const f = toForm(row);
        const start = overrides ? { ...f, ...overrides } : f;
        setForm(start);
        setShown(start);
        setOriginal(f);
        setPinFor(placeKey(f));
      })
      .catch((err) => handleError(err, 'Could not load this resource.'));
    api.history(id).then(setHistory).catch(() => setHistory([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = useMemo(() => form && original && JSON.stringify(form) !== JSON.stringify(original), [form, original]);
  const typed = useMemo(() => form && shown && JSON.stringify(form) !== JSON.stringify(shown), [form, shown]);

  useEffect(() => {
    if (!typed) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [typed]);

  if (!form) {
    return error ? <p className="adm-error">{error}</p> : <p className="adm-empty">Loading…</p>;
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e && e.target ? e.target.value : e });
  const hasPin = form.latitude !== '' && form.longitude !== '';
  const phoneOnly = isPlaceholderAddress(form.address);
  const pinStale = hasPin && pinFor !== null && pinFor !== placeKey(form);

  const leave = (to = importContext ? '/admin/import' : '/admin/resources') => {
    if (typed && !window.confirm('Leave without saving? Your changes will be lost.')) return;
    go(to);
  };

  const skip = () => {
    if (typed && !window.confirm('Skip without saving? Your changes will be lost.')) return;
    importContext.onSkip();
  };

  const lookUp = async () => {
    setLookup({ busy: true, message: '', error: false });
    try {
      const hit = await api.geocode({ address: form.address, city: form.city, state: form.state, zip: form.zip_code });
      setForm((f) => ({ ...f, latitude: hit.latitude, longitude: hit.longitude }));
      setPinFor(placeKey(form));
      setLookup({ busy: false, message: `Found: ${hit.label}`, error: false });
    } catch (err) {
      if (isExpired(err)) return onExpired();
      setLookup({ busy: false, message: errorText(err, 'Lookup failed.'), error: true });
    }
  };

  const clearPin = () => {
    setForm({ ...form, latitude: '', longitude: '' });
    setPinFor(null);
    setLookup({ busy: false, message: '', error: false });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = isNew ? await api.createResource(form) : await api.updateResource(id, form);
      setOriginal(form); // clears the unsaved-changes guard before navigating
      setShown(form);
      onSaved(`Saved "${saved.name}". It's live now.`, saved);
    } catch (err) {
      handleError(err, 'Could not save. Try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${original.name}"? It disappears from the map and list right away. The change history keeps a copy.`)) return;
    try {
      await api.deleteResource(id);
      onSaved(`Deleted "${original.name}".`);
    } catch (err) {
      handleError(err, 'Could not delete. Try again.');
    }
  };

  return (
    <form onSubmit={save} className="adm-editor" noValidate>
      <header className="adm-head adm-head-sticky">
        <button type="button" className="adm-btn" onClick={() => leave()}>
          <Icon name="back" size={15} /> {importContext ? 'Import' : 'Resources'}
        </button>
        <div className="adm-head-title">
          <h2>{isNew ? (prefill ? `Add "${prefill.name}"` : 'Add a resource') : original.name || 'Edit resource'}</h2>
          <p>{importContext ? importContext.where : "It goes live as soon as you save. Leave Verified off if you haven't spoken to the provider."}</p>
        </div>
        <div className="adm-head-actions">
          {importContext?.onSkip
            ? <button type="button" className="adm-btn" onClick={skip}>Skip</button>
            : <button type="button" className="adm-btn" onClick={() => leave()}>Cancel</button>}
          <button type="submit" className="adm-btn adm-btn-primary" disabled={saving || (!isNew && !dirty)}>
            {saving ? 'Saving…' : importContext?.hasNext ? 'Save and next' : isNew ? 'Save resource' : 'Save changes'}
          </button>
        </div>
      </header>

      {importContext?.flash && <div className="adm-flash" role="status"><Icon name="check" size={15} /> {importContext.flash}</div>}
      {error && <div className="adm-banner adm-banner-error" role="alert"><Icon name="alert" size={15} /> {error}</div>}
      {importContext?.notes.length > 0 && (
        <div className="adm-info adm-import-notes">
          <Icon name="info" size={15} />
          <dl>
            {importContext.notes.map((n, i) => (
              <div key={i} className={n.warn ? 'adm-import-warn' : ''}>
                {n.label && <dt>{n.label}</dt>}
                <dd>
                  {n.text}
                  {n.href && <> <a className="adm-link" href={n.href} onClick={(e) => { e.preventDefault(); leave(n.href); }}>Open it</a></>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="adm-editor-grid">
        <div className="adm-editor-main">
          <section>
            <h3>The basics</h3>
            <div className="adm-card adm-fields">
              <Field id="r-name" label="Name *" wide>
                <input id="r-name" value={form.name} onChange={set('name')} required maxLength={200} />
              </Field>
              <Field id="r-org" label="Organization">
                <input id="r-org" value={form.organization} onChange={set('organization')} maxLength={200} />
              </Field>
              <Field id="r-src" label="Source" hint="Where this came from, e.g. KCPL Street Sheet Fall 2026, or a phone call.">
                <input id="r-src" value={form.source} onChange={set('source')} maxLength={300} />
              </Field>
              <Field id="r-desc" label="Description" wide>
                <textarea
                  id="r-desc"
                  value={form.description}
                  onChange={set('description')}
                  placeholder="What someone gets if they show up. Plain language."
                  maxLength={2000}
                />
              </Field>
            </div>
          </section>

          <section>
            <h3>Category *</h3>
            <div className="adm-card">
              <div className="adm-chips" role="radiogroup" aria-label="Category">
                {CATEGORIES.map((c) => (
                  <button
                    type="button"
                    key={c.key}
                    role="radio"
                    aria-checked={form.type === c.key}
                    className={`adm-chip${form.type === c.key ? ' active' : ''}`}
                    style={form.type === c.key ? { background: c.color, borderColor: c.color } : undefined}
                    onClick={() => setForm({ ...form, type: c.key })}
                  >
                    <Icon name={c.key} size={14} /> {c.label}
                  </button>
                ))}
              </div>
              <Field id="r-services" label="Services offered" wide>
                <ServicesInput value={form.services} onChange={set('services')} />
              </Field>
            </div>
          </section>

          <section>
            <h3>Where</h3>
            <div className="adm-card adm-fields adm-fields-where">
              <Field id="r-addr" label="Street address *" wide>
                <input id="r-addr" value={form.address} onChange={set('address')} maxLength={300} />
                <div className="adm-quick">
                  No street address?{' '}
                  {ADDRESS_PLACEHOLDERS.map((p) => (
                    <button type="button" key={p} className="adm-link" onClick={() => setForm({ ...form, address: p, latitude: '', longitude: '' })}>
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
              <Field id="r-city" label="City">
                <input id="r-city" value={form.city} onChange={set('city')} maxLength={100} />
              </Field>
              <Field id="r-state" label="State">
                <input id="r-state" value={form.state} onChange={set('state')} maxLength={2} />
              </Field>
              <Field id="r-zip" label="ZIP">
                <input id="r-zip" value={form.zip_code} onChange={set('zip_code')} inputMode="numeric" maxLength={10} />
              </Field>

              <div className="adm-pin adm-field-wide">
                {phoneOnly ? (
                  <p><strong>No map pin needed.</strong> Listings without a street address show in the list, not on the map.</p>
                ) : (
                  <>
                    <div className="adm-pin-row">
                      <div>
                        {hasPin
                          ? <strong>Map pin: {Number(form.latitude).toFixed(5)}, {Number(form.longitude).toFixed(5)}</strong>
                          : <strong>No map pin yet</strong>}
                        <p>
                          {pinStale
                            ? 'You changed the address. Look it up again so the pin matches.'
                            : hasPin
                              ? 'Shown on the map at this point.'
                              : "Without a pin it shows in the list but not on the map."}
                        </p>
                      </div>
                      <div className="adm-pin-actions">
                        <button type="button" className={`adm-btn${!hasPin || pinStale ? ' adm-btn-primary' : ''}`} onClick={lookUp} disabled={lookup.busy || !form.address.trim()}>
                          <Icon name="pin" size={14} /> {lookup.busy ? 'Looking up…' : 'Look up address'}
                        </button>
                        <button type="button" className="adm-btn" onClick={() => setManualPin(!manualPin)}>Set manually</button>
                        {hasPin && <button type="button" className="adm-link" onClick={clearPin}>Remove pin</button>}
                      </div>
                    </div>
                    {lookup.message && <p className={lookup.error ? 'adm-error' : 'adm-hint'}>{lookup.message}</p>}
                    {manualPin && (
                      <div className="adm-pin-manual">
                        <Field id="r-lat" label="Latitude">
                          <input id="r-lat" value={form.latitude} onChange={(e) => { set('latitude')(e); setPinFor(placeKey(form)); }} inputMode="decimal" placeholder="39.0997" />
                        </Field>
                        <Field id="r-lng" label="Longitude">
                          <input id="r-lng" value={form.longitude} onChange={(e) => { set('longitude')(e); setPinFor(placeKey(form)); }} inputMode="decimal" placeholder="-94.5786" />
                        </Field>
                        <p className="adm-hint">In Google Maps, right-click the building and click the numbers at the top to copy them.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3>When and how to reach them</h3>
            <div className="adm-card adm-fields">
              <Field id="r-hours" label="Hours" wide hint='Write days and times as they appear on the door, with semicolons between blocks, e.g. "Mon-Fri 9am - 1pm; Sat 10am - 12pm". This drives the "Open now" badge.'>
                <input id="r-hours" value={form.hours} onChange={set('hours')} maxLength={500} />
              </Field>
              <Field id="r-phone" label="Phone">
                <input id="r-phone" value={form.phone} onChange={set('phone')} inputMode="tel" maxLength={100} />
              </Field>
              <Field id="r-web" label="Website" hint="Starts with https://">
                <input id="r-web" value={form.website} onChange={set('website')} inputMode="url" placeholder="https://" maxLength={500} />
              </Field>
              <Field id="r-elig" label="Who it's for" wide hint="e.g. Men 18+, Wyandotte County residents, no ID needed.">
                <input id="r-elig" value={form.eligibility} onChange={set('eligibility')} maxLength={500} />
              </Field>
            </div>
          </section>
        </div>

        <aside className="adm-editor-side">
          <h3>How it will look</h3>
          <div className="adm-card adm-preview">
            <strong>{form.name || 'Name'}</strong>
            {form.organization && <span className="adm-muted">{form.organization}</span>}
            <div className="adm-preview-badges">
              <OpenBadge hours={form.hours} />
              <VerifiedWarning verified={form.verified} />
            </div>
            <span className="adm-muted"><Icon name="pin" size={12} /> {form.address || 'Address'}</span>
            {form.hours && <span className="adm-muted"><Icon name="clock" size={12} /> {form.hours}</span>}
          </div>

          <h3>Before it goes live</h3>
          <div className="adm-card">
            <label className="adm-switch">
              <input
                type="checkbox"
                checked={form.verified === 1}
                onChange={(e) => setForm({ ...form, verified: e.target.checked ? 1 : 0 })}
              />
              <span className="adm-switch-track" aria-hidden="true" />
              <span>
                <strong>{form.verified === 1 ? 'Verified' : 'Not verified yet'}</strong>
                <span className="adm-hint">
                  {form.verified === 1
                    ? 'Someone confirmed this with the provider recently.'
                    : 'Shows a "Call first" warning until someone confirms it with the provider.'}
                </span>
              </span>
            </label>
          </div>

          {!isNew && (
            <>
              <h3>Change history</h3>
              <div className="adm-card adm-history">
                {history.length === 0 && <p className="adm-hint">No changes recorded since history started.</p>}
                {history.map((h) => {
                  const fields = changedFields(h.before, h.after);
                  return (
                    <div key={h.id} className="adm-history-item">
                      <strong>{h.action === 'create' ? 'Added' : h.action === 'delete' ? 'Deleted' : 'Edited'}</strong>
                      {fields.length > 0 && <span> {fields.join(', ')}</span>}
                      <div className="adm-hint">{h.changed_by} · {formatWhen(h.changed_at)}</div>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="adm-btn adm-btn-danger" onClick={remove}>Delete this resource</button>
            </>
          )}
        </aside>
      </div>
    </form>
  );
};

export default ResourceEditor;
