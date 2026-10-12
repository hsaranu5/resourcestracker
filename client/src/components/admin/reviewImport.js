import { useCallback, useEffect, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';

/**
 * Review workbooks (data/review/*.xlsx) into rows the Import screen can add.
 *
 * A workbook has a "New places" tab (one resource per row) and a "Changes" tab
 * (one field of one existing resource per row), each with a Decision column
 * the team fills in and a Recommendation column from whoever built it.
 * Columns are found by their header text, so reordering them in Excel is fine.
 *
 * The loaded workbook and what has been done with each row are kept in
 * localStorage, so an import can be finished across sittings. Nothing about
 * it is server state: rows that already went in are recognised again by
 * comparing against the live catalogue (see placeMatch / changeState).
 */

const STORAGE_KEY = 'checkpointkc-import';

const text = (value) => (value == null ? '' : String(value).trim());
export const simplify = (value) => text(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const PLACE_COLUMNS = {
  decision: 'decision', recommendation: 'recommendation', name: 'name', organization: 'organization',
  type: 'category', address: 'street address', city: 'city', state: 'state', zip_code: 'zip',
  phone: 'phone', hours: 'hours', services: 'services', eligibility: 'who it s for',
  description: 'description', website: 'website', source: 'source', note: 'note'
};

const CHANGE_COLUMNS = {
  decision: 'decision', recommendation: 'recommendation', id: 'id', resource: 'resource', field: 'field',
  was: 'current value', value: 'new value', source: 'source', note: 'note'
};

// The Field column's wording → the resources column it changes.
const CHANGE_FIELDS = {
  name: 'name', organization: 'organization', category: 'type', address: 'address', 'street address': 'address',
  city: 'city', state: 'state', zip: 'zip_code', phone: 'phone', hours: 'hours', services: 'services',
  'who it s for': 'eligibility', eligibility: 'eligibility', description: 'description', website: 'website'
};

/** Fields that move the building; changing one makes the old map pin wrong. */
export const PLACE_FIELDS = ['address', 'city', 'state', 'zip_code'];

const PLACE_TEXT = ['name', 'organization', 'type', 'address', 'city', 'state', 'zip_code', 'phone', 'hours',
  'services', 'eligibility', 'description', 'website', 'source'];

/** Header row → { field: column index }. Exact header match first, then prefix. */
const columnsOf = (header, wanted) => {
  const names = header.map(simplify);
  return Object.fromEntries(Object.entries(wanted).map(([field, label]) => {
    let i = names.indexOf(label);
    if (i < 0) i = names.findIndex((n) => n.startsWith(label));
    return [field, i];
  }));
};

const readRows = (sheet, wanted, required) => {
  if (!sheet || sheet.data.length < 2) return [];
  const cols = columnsOf(sheet.data[0], wanted);
  const missing = required.filter((f) => cols[f] < 0);
  if (missing.length) {
    throw new Error(`The "${sheet.sheet}" tab has no ${missing.map((f) => `"${wanted[f]}"`).join(' or ')} column.`);
  }
  return sheet.data
    .map((cells, i) => ({
      sheetRow: i + 1,
      cell: Object.fromEntries(Object.entries(cols).map(([f, c]) => [f, c < 0 ? '' : text(cells[c])]))
    }))
    .slice(1);
};

const verdict = (cell) => ({
  decision: simplify(cell.decision), // 'approve' | 'reject' | ''
  recommendation: text(cell.recommendation) || 'Optional'
});

/** What a row starts as: the team's Decision if they made one, else the recommendation. */
const startsSelected = ({ decision, recommendation }) =>
  decision ? decision === 'approve' : simplify(recommendation) === 'approve';

export const parseWorkbook = async (file) => {
  let sheets;
  try {
    sheets = await readXlsxFile(file);
  } catch (err) {
    throw new Error("That file couldn't be read. Choose an .xlsx review workbook.");
  }
  const tab = (name) => sheets.find((s) => simplify(s.sheet) === name);
  const placesTab = tab('new places');
  const changesTab = tab('changes');
  if (!placesTab && !changesTab) {
    throw new Error('That workbook has no "New places" or "Changes" tab, so there is nothing to import.');
  }

  const places = readRows(placesTab, PLACE_COLUMNS, ['name'])
    .filter(({ cell }) => cell.name)
    .map(({ sheetRow, cell }) => {
      const v = verdict(cell);
      const fields = Object.fromEntries(PLACE_TEXT.map((k) => [k, cell[k]]));
      fields.type = fields.type.toLowerCase();
      fields.state = fields.state.toUpperCase();
      return { key: `p${sheetRow}`, sheetRow, ...v, note: cell.note, fields, selected: startsSelected(v), status: 'pending' };
    });

  const changes = readRows(changesTab, CHANGE_COLUMNS, ['id', 'field', 'value'])
    .filter(({ cell }) => cell.id && cell.field)
    .map(({ sheetRow, cell }) => {
      const v = verdict(cell);
      const field = CHANGE_FIELDS[simplify(cell.field)] || null;
      return {
        key: `c${sheetRow}`, sheetRow, ...v, note: cell.note, source: cell.source,
        resourceId: Number(cell.id), resourceName: cell.resource, label: cell.field, field,
        was: cell.was, value: cell.value,
        selected: Boolean(field) && startsSelected(v), status: 'pending'
      };
    });

  return { fileName: file.name, loadedAt: new Date().toISOString(), places, changes };
};

// --- Comparing with the live catalogue ---------------------------------------

/** The live resource a new place already is, by name. */
export const placeMatch = (place, live) => {
  if (!live) return null;
  const name = simplify(place.fields.name);
  return live.find((r) => simplify(r.name) === name) || null;
};

const same = (a, b) => text(a) === text(b);

/**
 * Where a change stands against the live data:
 *   missing   no resource has that ID
 *   mismatch  the ID now belongs to a differently named resource; don't touch it
 *   applied   the live value is already the new one
 *   moved     the live value is neither the workbook's old one nor the new one
 *   ready
 * A Name change in the same workbook counts as a match, so the other changes
 * to that resource still apply after the rename.
 */
export const changeState = (change, liveById, changes) => {
  if (!liveById) return { state: 'loading' };
  if (!change.field) return { state: 'unsupported' };
  const row = liveById.get(change.resourceId);
  if (!row) return { state: 'missing' };
  const names = [change.resourceName, ...changes
    .filter((c) => c.resourceId === change.resourceId && c.field === 'name')
    .map((c) => c.value)].map(simplify);
  if (change.resourceName && !names.includes(simplify(row.name))) return { state: 'mismatch', row };
  if (same(row[change.field], change.value)) return { state: 'applied', row };
  if (change.was && !same(row[change.field], change.was)) return { state: 'moved', row };
  return { state: 'ready', row };
};

/** A live row with these workbook changes laid over it, ready to PUT. */
export const withChanges = (row, list) => {
  const next = { ...row };
  list.forEach((c) => { next[c.field] = c.value; });
  if (list.some((c) => PLACE_FIELDS.includes(c.field))) {
    next.latitude = '';
    next.longitude = '';
  }
  return next;
};

// --- The batch, kept across reloads ------------------------------------------

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
};

export const useImportBatch = () => {
  const [batch, setBatch] = useState(load);

  useEffect(() => {
    try {
      if (batch) localStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private mode or full storage: the import still works, it just won't survive a reload.
    }
  }, [batch]);

  /** Patch rows by key. `patch` is an object, or a function of the row. */
  const update = useCallback((keys, patch) => {
    const wanted = new Set(Array.isArray(keys) ? keys : [keys]);
    const apply = (item) => (wanted.has(item.key) ? { ...item, ...(typeof patch === 'function' ? patch(item) : patch) } : item);
    setBatch((b) => b && { ...b, places: b.places.map(apply), changes: b.changes.map(apply) });
  }, []);

  return { batch, setBatch, update };
};
