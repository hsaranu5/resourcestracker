import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../icons';
import { categoryOf } from '../../lib';
import ResourceEditor from './ResourceEditor';
import { api, errorText, isExpired, isPlaceholderAddress, formatWhen } from './adminApi';
import { parseWorkbook, placeMatch, changeState, withChanges, simplify } from './reviewImport';

/** The live catalogue, for spotting rows that already went in. */
const useLive = (onExpired) => {
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const reload = useCallback(
    () => api.resources()
      .then(setLive)
      .catch((err) => (isExpired(err) ? onExpired() : setError(errorText(err, 'Could not load the current resources.')))),
    [onExpired]
  );
  useEffect(() => { reload(); }, [reload]);
  const byId = useMemo(() => live && new Map(live.map((r) => [r.id, r])), [live]);
  return { live, byId, reload, error };
};

const placeView = (place, live) => {
  if (place.status === 'added') return { done: 'Added', id: place.resourceId };
  if (!live) return { loading: true };
  const match = placeMatch(place, live);
  if (match) return { done: 'Already listed', id: match.id };
  return { error: place.status === 'error' ? place.error : '' };
};

// A change whose live value moved since the workbook was made isn't applied in
// bulk: it would quietly undo someone's newer edit. It opens for review instead.
const changeView = (change, byId, changes) => {
  if (change.status === 'applied') return { done: 'Applied', id: change.resourceId };
  const { state, row } = changeState(change, byId, changes);
  switch (state) {
    case 'loading': return { loading: true };
    case 'applied': return { done: 'Already applied', id: change.resourceId, row };
    case 'missing': return { blocked: `No resource has ID ${change.resourceId}` };
    case 'mismatch': return { blocked: `ID ${change.resourceId} is "${row.name}" now`, row };
    case 'unsupported': return { blocked: `"${change.label}" can't be changed from here` };
    case 'moved': return { review: 'Edited since the workbook. Open it to compare', row };
    default: return { row, error: change.status === 'error' ? change.error : '' };
  }
};

const canRun = (view) => !view.done && !view.blocked && !view.loading && !view.review;

/** The team's Decision when there is one (solid), else the recommendation (outlined). */
const Verdict = ({ item }) => {
  if (item.decision === 'approve' || item.decision === 'reject') {
    const ok = item.decision === 'approve';
    return (
      <span className={`adm-verdict adm-verdict-decided adm-verdict-${ok ? 'ok' : 'no'}`} title="The team's decision in the workbook">
        {ok ? 'Approved' : 'Rejected'}
      </span>
    );
  }
  const tone = { approve: 'ok', 'call first': 'warn' }[simplify(item.recommendation)] || 'muted';
  return <span className={`adm-verdict adm-verdict-${tone}`} title="Recommendation">{item.recommendation}</span>;
};

const Status = ({ view, open }) => {
  if (view.done) {
    return (
      <a className="adm-status adm-status-ok" href={`/admin/resources/${view.id}`} onClick={(e) => open(e, `/admin/resources/${view.id}`)}>
        <Icon name="check" size={13} /> {view.done}
      </a>
    );
  }
  if (view.blocked) return <span className="adm-import-blocked">{view.blocked}</span>;
  if (view.review) return <span className="adm-status adm-status-warn">{view.review}</span>;
  if (view.error) return <span className="adm-error">{view.error}</span>;
  return null;
};

/**
 * Add or update many resources at once from a review workbook: a list of
 * every row with checkboxes for the bulk action, and each row opening the
 * resource editor already filled in (ImportReview) for the ones that need a
 * person.
 */
const ImportPage = ({ batch, setBatch, update, go, onExpired, flash }) => {
  const { live, byId, reload, error: liveError } = useLive(onExpired);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [progress, setProgress] = useState(null); // { done, total }
  const [result, setResult] = useState(null);
  const stop = useRef(false);
  const fileInput = useRef(null);

  const tab = batch?.tab || (batch && !batch.places.length ? 'changes' : 'places');
  const items = useMemo(() => (batch ? batch[tab] : []), [batch, tab]);
  const views = useMemo(
    () => new Map(items.map((it) => [it.key, tab === 'places' ? placeView(it, live) : changeView(it, byId, batch.changes)])),
    [items, tab, live, byId, batch]
  );

  const filters = ['All', ...new Set(items.map((it) => it.recommendation))];
  const shown = items.filter((it) => filter === 'All' || it.recommendation === filter);
  const runnable = shown.filter((it) => canRun(views.get(it.key)));
  const chosen = runnable.filter((it) => it.selected);
  const allChosen = runnable.length > 0 && chosen.length === runnable.length;

  const selectAll = useRef(null);
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = chosen.length > 0 && !allChosen;
  });

  const open = (e, path) => {
    e.preventDefault();
    e.stopPropagation();
    go(path);
  };

  const choose = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const unfinished = batch && [...batch.places, ...batch.changes].some((it) => it.status === 'pending' && it.selected);
    if (unfinished && !window.confirm(`Replace ${batch.fileName}? Rows you haven't added yet will need that file loaded again.`)) return;
    setError('');
    setResult(null);
    try {
      setBatch(await parseWorkbook(file));
      setFilter('All');
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = () => {
    if (!window.confirm(`Close ${batch.fileName}? Anything already added stays live.`)) return;
    setBatch(null);
    setResult(null);
  };

  const setTab = (next) => {
    setBatch((b) => ({ ...b, tab: next }));
    setFilter('All');
    setResult(null);
  };

  const addPlaces = async (list) => {
    let added = 0;
    let failed = 0;
    let needPin = 0;
    for (let i = 0; i < list.length && !stop.current; i += 1) {
      const place = list[i];
      try {
        const saved = await api.createResource({ ...place.fields, verified: 0 });
        update(place.key, { status: 'added', resourceId: saved.id, error: '' });
        added += 1;
        if (!isPlaceholderAddress(saved.address)) needPin += 1;
      } catch (err) {
        if (isExpired(err)) return onExpired();
        update(place.key, { status: 'error', error: errorText(err, "Couldn't add this one.") });
        failed += 1;
      }
      setProgress({ done: i + 1, total: list.length });
    }
    return { added, failed, needPin };
  };

  // One save per resource, with all of its selected changes, against a fresh
  // copy so nothing edited in the meantime is overwritten.
  const applyChanges = async (list) => {
    const groups = new Map();
    list.forEach((c) => groups.set(c.resourceId, [...(groups.get(c.resourceId) || []), c]));
    let added = 0;
    let failed = 0;
    let done = 0;
    for (const [id, group] of groups) {
      if (stop.current) break;
      try {
        const fresh = await api.resource(id);
        const freshById = new Map([[fresh.id, fresh]]);
        const states = group.map((c) => [c, changeState(c, freshById, batch.changes).state]);
        const ready = states.filter(([, s]) => s === 'ready').map(([c]) => c);
        const stale = states.filter(([, s]) => s !== 'ready' && s !== 'applied').map(([c]) => c);
        if (ready.length) await api.updateResource(id, withChanges(fresh, ready));
        update(states.filter(([, s]) => s === 'ready' || s === 'applied').map(([c]) => c.key), { status: 'applied', error: '' });
        if (stale.length) update(stale.map((c) => c.key), { status: 'error', error: 'Changed while you were here. Open it to check.' });
        added += group.length - stale.length;
        failed += stale.length;
      } catch (err) {
        if (isExpired(err)) return onExpired();
        update(group.map((c) => c.key), { status: 'error', error: errorText(err, "Couldn't save this one.") });
        failed += group.length;
      }
      done += group.length;
      setProgress({ done, total: list.length });
    }
    return { added, failed, needPin: 0 };
  };

  const run = async () => {
    const n = chosen.length;
    const ask = tab === 'places'
      ? `Add ${n} ${n === 1 ? 'place' : 'places'}? They go live right away, marked "Call first" until someone verifies them.`
      : `Apply ${n} ${n === 1 ? 'change' : 'changes'}? They go live right away.`;
    if (!window.confirm(ask)) return;
    stop.current = false;
    setResult(null);
    setProgress({ done: 0, total: n });
    const outcome = await (tab === 'places' ? addPlaces(chosen) : applyChanges(chosen));
    setProgress(null);
    if (!outcome) return;
    await reload();
    setResult({ ...outcome, tab, stopped: stop.current });
  };

  const toggle = (it) => update(it.key, { selected: !it.selected });
  const toggleAll = () => update(runnable.map((it) => it.key), { selected: !allChosen });

  const reviewPath = (it) => (tab === 'places' ? `/admin/import/new/${it.key}` : `/admin/import/change/${it.resourceId}`);
  const rowClick = (it, view) => {
    if (view.done) go(`/admin/resources/${view.id}`);
    else if (!view.blocked && !view.loading) go(reviewPath(it));
  };

  const summary = result && (() => {
    const verb = result.tab === 'places' ? 'Added' : 'Applied';
    const parts = [`${verb} ${result.added}.`];
    if (result.failed) parts.push(`${result.failed} didn't go through; they're marked below.`);
    if (result.stopped) parts.push('Stopped before the end.');
    return parts.join(' ');
  })();

  return (
    <>
      <header className="adm-head">
        <div>
          <h2>Import</h2>
          <p>Add or update many resources at once from a review workbook</p>
        </div>
        <div className="adm-head-actions">
          {batch && <button className="adm-btn" onClick={remove} disabled={!!progress}>Close workbook</button>}
          <button className={`adm-btn${batch ? '' : ' adm-btn-primary'}`} onClick={() => fileInput.current.click()} disabled={!!progress}>
            <Icon name="upload" size={15} /> {batch ? 'Load another' : 'Load workbook'}
          </button>
          <input ref={fileInput} type="file" accept=".xlsx" className="adm-sr" tabIndex={-1} onChange={choose} aria-label="Review workbook" />
        </div>
      </header>

      {flash && <div className="adm-flash" role="status"><Icon name="check" size={15} /> {flash}</div>}
      {error && <div className="adm-banner adm-banner-error" role="alert"><Icon name="alert" size={15} /> {error}</div>}
      {liveError && <p className="adm-error">{liveError}</p>}

      {!batch && (
        <div className="adm-card adm-import-empty">
          <Icon name="upload" size={22} />
          <strong>Load a review workbook</strong>
          <p>
            The .xlsx files in data/review. Rows on its New places and Changes tabs are listed here to add in one go,
            or to open one at a time already filled in. A Decision of Approve or Reject in the workbook is respected;
            rows left blank start selected only if they're recommended Approve.
          </p>
          <button className="adm-btn adm-btn-primary" onClick={() => fileInput.current.click()}>
            <Icon name="upload" size={15} /> Choose a file
          </button>
        </div>
      )}

      {batch && (
        <>
          <p className="adm-import-file">
            <strong>{batch.fileName}</strong> · loaded {formatWhen(batch.loadedAt)}
          </p>

          <div className="adm-toolbar">
            <div className="adm-segments" role="group" aria-label="Workbook tab">
              {[['places', 'New places'], ['changes', 'Changes']].map(([key, label]) => (
                <button key={key} className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => setTab(key)} disabled={!!progress}>
                  {label} · {batch[key].length}
                </button>
              ))}
            </div>
            {filters.length > 2 && (
              <div className="adm-segments" role="group" aria-label="Recommendation">
                {filters.map((f) => (
                  <button key={f} className={filter === f ? 'active' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {f}{f !== 'All' ? ` · ${items.filter((it) => it.recommendation === f).length}` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          {result && (
            <div className={result.failed ? 'adm-banner' : 'adm-flash'} role="status">
              <Icon name={result.failed ? 'alert' : 'check'} size={15} />
              <span>
                {summary}
                {result.needPin > 0 && (
                  <>
                    {' '}{result.needPin} {result.needPin === 1 ? 'has' : 'have'} a street address but no map pin yet.{' '}
                    <a className="adm-link" href="/admin/resources?filter=nopin" onClick={(e) => open(e, '/admin/resources?filter=nopin')}>
                      Look up map pins
                    </a>
                  </>
                )}
              </span>
            </div>
          )}

          <div className="adm-import-bar">
            <label className="adm-check">
              <input ref={selectAll} type="checkbox" checked={allChosen} onChange={toggleAll} disabled={!runnable.length || !!progress} />
              Select all
            </label>
            <span className="adm-count">
              {progress
                ? `${tab === 'places' ? 'Adding' : 'Applying'} ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
                : `${chosen.length} selected · ${runnable.length} not done yet`}
            </span>
            {progress ? (
              <button className="adm-btn" onClick={() => { stop.current = true; }}>Stop</button>
            ) : (
              <button className="adm-btn adm-btn-primary" onClick={run} disabled={!chosen.length || !live}>
                {tab === 'places'
                  ? `Add ${chosen.length} ${chosen.length === 1 ? 'place' : 'places'}`
                  : `Apply ${chosen.length} ${chosen.length === 1 ? 'change' : 'changes'}`}
              </button>
            )}
          </div>

          <div className="adm-table-wrap">
            <table className="adm-table adm-import">
              <thead>
                <tr>
                  <th className="adm-import-check"><span className="adm-sr">Selected</span></th>
                  <th>{tab === 'places' ? 'Name' : 'Resource'}</th>
                  {tab === 'places' ? <th>Category</th> : <th>Change</th>}
                  {tab === 'places' && <th className="adm-hide-sm">Hours</th>}
                  <th>Workbook</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((it) => {
                  const view = views.get(it.key);
                  const runs = canRun(view);
                  return (
                    <tr key={it.key} className={view.done || view.blocked ? 'adm-import-done' : ''} onClick={() => rowClick(it, view)}>
                      <td className="adm-import-check" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={runs && it.selected}
                          disabled={!runs || !!progress}
                          onChange={() => toggle(it)}
                          aria-label={`Select ${tab === 'places' ? it.fields.name : `${it.resourceName}: ${it.label}`}`}
                        />
                      </td>
                      {tab === 'places' ? <PlaceCells place={it} view={view} open={open} path={reviewPath(it)} /> : <ChangeCells change={it} view={view} />}
                      <td><Verdict item={it} /></td>
                      <td><Status view={view} open={open} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && (
              <div className="adm-empty">
                <strong>Nothing on this tab</strong>
                <span>{tab === 'places' ? 'The workbook has no new places.' : 'The workbook has no changes.'}</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

const PlaceCells = ({ place, view, open, path }) => {
  const f = place.fields;
  const cat = categoryOf(f.type);
  const where = [f.address, f.city, f.zip_code].filter(Boolean).join(', ');
  return (
    <>
      <td>
        <div className="adm-name-cell">
          <span className="adm-cat-icon" style={{ background: cat.color }}><Icon name={cat.key} size={15} /></span>
          <div>
            {view.done
              ? <span className="adm-import-name">{f.name}</span>
              : <a href={path} onClick={(e) => open(e, path)}>{f.name}</a>}
            <div className="adm-sub">{where}</div>
            {place.note && <div className="adm-sub adm-import-note">{place.note}</div>}
          </div>
        </div>
      </td>
      <td><span className="adm-cat" style={{ color: cat.color }}>{cat.label || 'No category'}</span></td>
      <td className="adm-hide-sm adm-muted adm-hours">{f.hours}</td>
    </>
  );
};

const ChangeCells = ({ change, view }) => {
  const now = view.row ? view.row[change.field] : change.was;
  return (
    <>
      <td>
        <span className="adm-import-name">{change.resourceName || `ID ${change.resourceId}`}</span>
        <div className="adm-sub">{change.label}</div>
        {change.note && <div className="adm-sub adm-import-note">{change.note}</div>}
      </td>
      <td className="adm-diff">
        {now ? <del>{now}</del> : <span className="adm-muted">(blank)</span>}
        <ins>{change.value || '(blank)'}</ins>
      </td>
    </>
  );
};

/**
 * One workbook row in the resource editor, already filled in: a new place as
 * an unsaved resource, or an existing resource with its changes laid over.
 * Saving moves on to the next row still to do.
 */
export const ImportReview = ({ batch, update, kind, itemKey, go, onExpired, flash, setFlash }) => {
  const { live, byId, error } = useLive(onExpired);

  const back = (
    <button className="adm-btn" onClick={() => go('/admin/import')}><Icon name="back" size={15} /> Import</button>
  );
  const notice = (title, body) => (
    <>
      <header className="adm-head">{back}</header>
      <div className="adm-empty"><strong>{title}</strong><span>{body}</span></div>
    </>
  );

  if (!batch) return notice('No workbook loaded', 'Load one on the Import page first.');
  if (error) return <p className="adm-error">{error}</p>;
  if (!live) return <p className="adm-empty">Loading…</p>;

  if (kind === 'place') {
    const index = batch.places.findIndex((p) => p.key === itemKey);
    const place = batch.places[index];
    if (!place) return notice('That row is gone', 'It may be from a workbook that has since been replaced.');

    const toDo = (p) => p.status !== 'added' && !placeMatch(p, live);
    const next = batch.places.slice(index + 1).find(toDo);
    const nextPath = next ? `/admin/import/new/${next.key}` : '/admin/import';
    const match = place.status !== 'added' && placeMatch(place, live);

    const notes = [
      { label: 'Workbook', text: place.decision ? `${place.decision === 'approve' ? 'Approved' : 'Rejected'} by the team` : `Recommends ${place.recommendation}` },
      place.note && { label: 'Note', text: place.note },
      match && { warn: true, text: `Already listed as "${match.name}". Saving adds a second copy.`, href: `/admin/resources/${match.id}` },
      place.status === 'added' && { warn: true, text: 'Already added from this workbook. Saving adds it again.', href: `/admin/resources/${place.resourceId}` }
    ].filter(Boolean);

    return (
      <ResourceEditor
        key={`import-${place.key}`}
        prefill={{ ...place.fields, verified: 0 }}
        go={go}
        onExpired={onExpired}
        importContext={{
          where: `New place ${index + 1} of ${batch.places.length} · ${batch.fileName}, row ${place.sheetRow}`,
          notes,
          flash,
          hasNext: Boolean(next),
          onSkip: next ? () => go(nextPath) : null
        }}
        onSaved={(message, saved) => {
          update(place.key, { status: 'added', resourceId: saved.id, error: '' });
          setFlash(message);
          go(nextPath);
        }}
      />
    );
  }

  const id = Number(itemKey);
  const states = batch.changes
    .filter((c) => c.resourceId === id)
    .map((c) => ({ c, s: changeState(c, byId, batch.changes) }));
  const prefillable = ({ c, s }) => c.status !== 'applied' && c.decision !== 'reject' && (s.state === 'ready' || s.state === 'moved');
  const filled = states.filter(prefillable).map(({ c }) => c);
  const row = byId.get(id);

  if (!states.length) return notice('That row is gone', 'It may be from a workbook that has since been replaced.');
  if (!row) return notice(`No resource has ID ${id}`, 'It may have been deleted. Nothing was changed.');
  if (states[0].s.state === 'mismatch') {
    return notice(
      `ID ${id} is "${row.name}" now`,
      `The workbook expected "${states[0].c.resourceName}", so its changes were not filled in. Find the right listing on Resources and edit it there.`
    );
  }

  const ids = [...new Set(batch.changes.map((c) => c.resourceId))];
  const nextId = ids.slice(ids.indexOf(id) + 1).find((other) =>
    batch.changes.some((c) => c.resourceId === other && prefillable({ c, s: changeState(c, byId, batch.changes) })));
  const nextPath = nextId ? `/admin/import/change/${nextId}` : '/admin/import';

  const notes = states.map(({ c, s }) => {
    const why = [
      c.decision ? `${c.decision === 'approve' ? 'Approved' : 'Rejected'} by the team` : `Recommends ${c.recommendation}`,
      c.status === 'applied' || s.state === 'applied' ? 'already applied' : null,
      c.decision === 'reject' ? 'not filled in' : null,
      s.state === 'moved' ? `edited since the workbook, which expected "${c.was}"` : null
    ].filter(Boolean).join('; ');
    return { label: c.label, text: `${c.value || '(blank)'}  (${why})${c.note ? ` ${c.note}` : ''}`, warn: s.state === 'moved' };
  });

  return (
    <ResourceEditor
      key={`import-change-${id}`}
      id={String(id)}
      overrides={withChanges({}, filled)}
      go={go}
      onExpired={onExpired}
      importContext={{
        where: `${filled.length} ${filled.length === 1 ? 'change' : 'changes'} filled in from ${batch.fileName}`,
        notes,
        flash,
        hasNext: Boolean(nextId),
        onSkip: nextId ? () => go(nextPath) : null
      }}
      onSaved={(message) => {
        update(filled.map((c) => c.key), { status: 'applied', error: '' });
        setFlash(message);
        go(nextPath);
      }}
    />
  );
};

export default ImportPage;
