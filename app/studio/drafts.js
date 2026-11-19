// The studio's drafts on this computer (docs/studio.md section 5, "Autosave"; Contract 14 rule 9; item S9).
// One localStorage entry, `loadout-studio-v1`: { drafts: { <draft>: { definition, savedAt, bagKey? } } }, at most 40 drafts
// and 2 MB. Everything read back is checked by the validator before it is drawn (Contract 11), and a broken draft is
// left out and counted, never drawn. A save that fails (storage full, blocked) says so in plain words: it is never
// swallowed. The same entry is what window.loadout.studio (app/api-studio.js) reads, so drafts made here are its drafts.
// Pure: the storage is handed in (the page passes localStorage or memory), so it runs in the browser and in Node.
import { validateDataSprite } from '../../engine/data-sprite.js';

/** The localStorage key of the studio's drafts (docs/studio.md section 5). */
export const STUDIO_KEY = 'loadout-studio-v1';

/** The most drafts one browser keeps. */
export const MAX_DRAFTS = 40;

/** The most characters the whole entry may take (2 MB). */
export const MAX_STORE_BYTES = 2 * 1024 * 1024;

/** How long after the last change a draft is saved, in milliseconds. */
export const SAVE_DELAY = 500;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const DRAFT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const BAG_KEY_CHARS = 200;

/** Plain lowercase words joined by dashes, at most 40 characters, starting with a letter; '' when nothing is left. */
export function slugOf(text) {
  const s = String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^[^a-z]+/, '').replace(/-+$/, '').slice(0, 40).replace(/-+$/, '');
  return DRAFT_ID.test(s) ? s : '';
}

/**
 * A draft id made from a name that none of `taken` has: "moss-newt", then "moss-newt-2", "moss-newt-3" ...; "draft" for a
 * name with no letters. Arguments: name (any text), taken (ids already used).
 */
export function draftIdFor(name, taken = []) {
  const used = new Set(taken);
  const base = (slugOf(name) || 'draft').slice(0, 36).replace(/-+$/, '');
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * The drafts kept in a storage: { list, get, put, remove, ids, broken }. list() gives [{ id, name, savedAt, definition }],
 * newest first, valid ones only; get(id) gives { definition, savedAt, bagKey? } or null; put(id, definition, { bagKey })
 * and remove(id) give { ok, error? } with the error in plain words; broken() counts stored drafts that could not be read.
 * Arguments: storage ({ getItem, setItem, removeItem }), opts { now (the clock), check (a validator returning { ok, value }; default validateDataSprite) }.
 */
export function createDrafts(storage, { now = () => Date.now(), check = (d) => validateDataSprite(d) } = {}) {
  const cache = new Map();          // text of a definition -> its checked value, so a list is not validated twice
  let bad = 0;

  function readAll() {
    let text = null;
    try { text = storage.getItem(STUDIO_KEY); } catch { return {}; }
    if (typeof text !== 'string') return {};
    let raw;
    try { raw = JSON.parse(text, (k, v) => (k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v)); } catch { return {}; }
    if (!isObj(raw) || !isObj(raw.drafts)) return {};
    const out = {};
    for (const [id, d] of Object.entries(raw.drafts)) out[id] = d;
    return out;
  }

  function checked(id, d) {
    if (!DRAFT_ID.test(id) || !isObj(d) || !isObj(d.definition)) return null;
    const key = JSON.stringify(d.definition);
    let value = cache.get(key);
    if (value === undefined) {
      let v;
      try { v = check(d.definition); } catch { v = { ok: false }; }
      value = v?.ok ? v.value : null;
      cache.set(key, value);
    }
    if (!value) return null;
    return { definition: JSON.parse(JSON.stringify(value)), savedAt: Number.isFinite(d.savedAt) ? d.savedAt : 0, ...(typeof d.bagKey === 'string' && d.bagKey.length <= BAG_KEY_CHARS ? { bagKey: d.bagKey } : {}) };
  }

  function writeAll(all) {
    const text = JSON.stringify({ drafts: all });
    if (text.length > MAX_STORE_BYTES) return { ok: false, error: 'Your drafts could not be saved: together they would pass the 2 MB this browser keeps for the studio. Remove a draft you no longer need, or download this one as a file.' };
    try { storage.setItem(STUDIO_KEY, text); } catch (e) {
      const full = /quota|full/i.test(`${e?.name} ${e?.message}`);
      return { ok: false, error: full ? 'Your draft could not be saved: this browser\'s storage is full. Download the file to keep it, or remove a draft you no longer need.' : 'Your draft could not be saved: this browser is not letting the site keep anything. Download the file to keep it.' };
    }
    return { ok: true };
  }

  return {
    /** Every draft that reads back as a valid definition, newest first: [{ id, name, savedAt, definition }]. */
    list() {
      bad = 0;
      const out = [];
      for (const [id, d] of Object.entries(readAll())) {
        const c = checked(id, d);
        if (c) out.push({ id, name: c.definition.name, savedAt: c.savedAt, definition: c.definition, ...(c.bagKey ? { bagKey: c.bagKey } : {}) });
        else bad++;
      }
      return out.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
    },
    /** One draft, checked: { definition, savedAt, bagKey? }, or null when there is none or it does not read back. */
    get(id) {
      const all = readAll();
      return Object.hasOwn(all, id) ? checked(id, all[id]) : null;
    },
    /** The ids of every stored draft, readable or not (for a new id that does not clash). */
    ids: () => Object.keys(readAll()),
    /** How many stored drafts the last list() could not read. */
    broken: () => bad,
    /** Save a draft: { ok, error? }. The definition is checked first; a bagKey given (or kept from before) stays with it. */
    put(id, definition, { bagKey } = {}) {
      if (!DRAFT_ID.test(String(id))) return { ok: false, error: 'That draft has no usable name.' };
      let v;
      try { v = check(definition); } catch { v = { ok: false, errors: ['it could not be read'] }; }
      if (!v?.ok) return { ok: false, error: `This draft could not be saved because it is not complete: ${(v?.errors ?? [])[0] ?? 'it could not be read'}.` };
      const all = readAll();
      if (!Object.hasOwn(all, id) && Object.keys(all).length >= MAX_DRAFTS) return { ok: false, error: `Your draft could not be saved: this browser keeps at most ${MAX_DRAFTS} drafts. Remove one you no longer need, or download this one as a file.` };
      const keep = typeof bagKey === 'string' ? bagKey : isObj(all[id]) && typeof all[id].bagKey === 'string' ? all[id].bagKey : undefined;
      all[id] = { definition: v.value, savedAt: now(), ...(keep && keep.length <= BAG_KEY_CHARS ? { bagKey: keep } : {}) };
      return writeAll(all);
    },
    /** Remove a draft: { ok, error? }. */
    remove(id) {
      const all = readAll();
      if (!Object.hasOwn(all, id)) return { ok: true };
      delete all[id];
      return writeAll(all);
    },
  };
}

/**
 * Saves a little after the last change: schedule(def) (re)starts the wait, flush() saves what waits at once and returns
 * what save() said (null when nothing waited), pending() says whether something waits.
 * Arguments: { save (def) => { ok, error? }, delay (ms, default SAVE_DELAY), setTimer, clearTimer (default the window's) }.
 */
export function createSaver({ save, delay = SAVE_DELAY, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
  let waiting = null, timer = null;
  const run = () => {
    timer = null;
    if (waiting === null) return null;
    const d = waiting;
    waiting = null;
    return save(d);
  };
  return {
    schedule(def) {
      waiting = def;
      if (timer !== null) clearTimer(timer);
      timer = setTimer(run, delay);
    },
    flush() {
      if (timer !== null) { clearTimer(timer); timer = null; }
      return run();
    },
    pending: () => waiting !== null,
  };
}
