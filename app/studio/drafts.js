// The studio's drafts on this computer (docs/studio.md section 5, "Autosave"; Contract 14 rule 9; item S9), in everyday
// words for the studio page. Reading and writing the entry `loadout-studio-v1` ({ version: 1, drafts: { <draft>:
// { definition, savedAt, bagKey? } } }) is app/studio-store.js's, the one owner that window.loadout.studio
// (app/api-studio.js) uses too, so the page keeps its promises:
//   - a store that cannot be read whole (damaged, not { drafts }, unreadable storage) is never saved over: problem() says
//     so, every save is refused, and the page offers to download what is there and, only then, to start afresh;
//   - one draft is changed per save, against what storage holds at that moment; whatever the page does not use (entries
//     that are no draft, fields a later version adds) is carried through untouched;
//   - a save that fails (storage full) is said in plain words, and the change waits in memory, shown on top, until the
//     next save that works writes it.
// Everything read back is checked by the validator before it is drawn (Contract 11); a broken draft is left out and
// counted, never drawn. Pure: the storage is handed in (the page passes localStorage or memory), so it runs in Node too.
import { validateDataSprite } from '../../engine/data-sprite.js';
import { createDraftStore, StoreRefused, STUDIO_KEY as STORE_KEY } from '../studio-store.js';

/** The localStorage key of the studio's drafts (docs/studio.md section 5). */
export const STUDIO_KEY = STORE_KEY;

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
 * The drafts kept in a storage: { list, get, put, remove, ids, broken, problem, pending, savedText, startAfresh }.
 * list() gives [{ id, name, savedAt, definition, bagKey? }], newest first, valid ones only; get(id) gives { definition,
 * savedAt, bagKey? } or null; put(id, definition, { bagKey }) (bagKey null forgets it) and remove(id) give { ok, error? }
 * with the error in everyday words; broken() counts stored drafts that could not be read; problem() is null, or why the
 * store cannot be used (then nothing is saved); pending() says a failed save waits; savedText() is what storage holds, to
 * download; startAfresh() clears a store that cannot be read whole (and only such a store): { ok, error? }.
 * Arguments: storage ({ getItem, setItem, removeItem }), opts { now (the clock), check (a validator returning { ok, value }; default validateDataSprite) }.
 */
export function createDrafts(storage, { now = () => Date.now(), check = (d) => validateDataSprite(d) } = {}) {
  const store = createDraftStore(storage, { limits: { drafts: MAX_DRAFTS, storeChars: MAX_STORE_BYTES } });
  const cache = new Map();          // text of a definition -> its checked value, so a list is not validated twice
  let bad = 0;

  /** What the store holds now: { entries, whole }. */
  function readAll() {
    let r;
    try { r = store.read(); } catch { return { entries: {}, whole: false }; }
    return { entries: r.entries, whole: r.whole };
  }

  function checked(id, d) {
    if (!DRAFT_ID.test(id) || !isObj(d) || !isObj(d.definition)) return null;
    let key;
    try { key = JSON.stringify(d.definition); } catch { return null; }
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

  /** Change one entry through the store: { ok, error? } in everyday words. */
  function commit(id, change) {
    let w;
    try { w = store.commit(id, change); } catch (e) {
      if (e instanceof Refused) return { ok: false, error: e.message };
      if (!(e instanceof StoreRefused)) return { ok: false, error: `Your draft could not be saved: ${String(e?.message ?? e).slice(0, 200)}.` };
      return { ok: false, error: readAll().whole ? TOO_BIG : UNREADABLE };
    }
    if (!w.saved) return { ok: false, error: FULL };
    return { ok: true };
  }

  return {
    /** Every draft that reads back as a valid definition, newest first: [{ id, name, savedAt, definition, bagKey? }]. */
    list() {
      bad = 0;
      const out = [];
      for (const [id, d] of Object.entries(readAll().entries)) {
        const c = checked(id, d);
        if (c) out.push({ id, name: c.definition.name, savedAt: c.savedAt, definition: c.definition, ...(c.bagKey ? { bagKey: c.bagKey } : {}) });
        else if (DRAFT_ID.test(id)) bad++;
      }
      return out.sort((a, b) => b.savedAt - a.savedAt || a.id.localeCompare(b.id));
    },
    /** One draft, checked: { definition, savedAt, bagKey? }, or null when there is none or it does not read back. */
    get(id) {
      const { entries } = readAll();
      return typeof id === 'string' && Object.hasOwn(entries, id) ? checked(id, entries[id]) : null;
    },
    /** The ids of every stored entry, readable or not (for a new id that does not clash). */
    ids: () => Object.keys(readAll().entries),
    /** How many stored drafts the last list() could not read. */
    broken: () => bad,
    /** Null, or why the saved drafts cannot be used, in everyday words: then nothing is saved over them. */
    problem: () => (readAll().whole ? null : UNREADABLE),
    /** Whether a failed save waits in memory for the next save that works. */
    pending: () => store.pending(),
    /** What storage holds under the studio's key, as it is (for downloading before starting afresh); '' when nothing. */
    savedText() {
      try { const t = storage.getItem(STUDIO_KEY); return typeof t === 'string' ? t : ''; } catch { return ''; }
    },
    /** Clear saved drafts that cannot be read whole, so the studio can save again: { ok, error? }. A readable store is never cleared. */
    startAfresh() {
      if (readAll().whole) return { ok: false, error: 'Your saved drafts can be read, so they were left as they are.' };
      try { storage.removeItem(STUDIO_KEY); } catch { return { ok: false, error: 'This browser did not let the saved drafts be cleared.' }; }
      return { ok: true };
    },
    /** Save a draft: { ok, error? }. The definition is checked first; a bagKey given (or kept from before) stays with it; bagKey null forgets it. */
    put(id, definition, { bagKey } = {}) {
      if (!DRAFT_ID.test(String(id))) return { ok: false, error: 'That draft has no usable name.' };
      let v;
      try { v = check(definition); } catch { v = { ok: false, errors: ['it could not be read'] }; }
      if (!v?.ok) return { ok: false, error: `This draft could not be saved because it is not complete: ${(v?.errors ?? [])[0] ?? 'it could not be read'}.` };
      const savedAt = now();
      return commit(id, (was) => {
        if (was === undefined && Object.keys(readAll().entries).length >= MAX_DRAFTS) throw new Refused(`Your draft could not be saved: this browser keeps at most ${MAX_DRAFTS} drafts. Remove one you no longer need, or download this one as a file.`);
        const entry = { ...(isObj(was) ? was : {}), definition: v.value, savedAt };
        if (typeof bagKey === 'string' && bagKey.length <= BAG_KEY_CHARS) entry.bagKey = bagKey;
        else if (bagKey === null) delete entry.bagKey;
        return entry;
      });
    },
    /** Remove a draft: { ok, error? }. */
    remove(id) {
      if (!readAll().whole) return { ok: false, error: UNREADABLE };
      if (!Object.hasOwn(readAll().entries, id)) return { ok: true };
      return commit(id, () => undefined);
    },
  };
}

/** A save the page itself refuses (too many drafts); its message is for a person. */
class Refused extends Error {}
const UNREADABLE = 'Your saved drafts could not be read whole (another tab or an older visit may have left them damaged), so the studio will not save over them: that would lose them. Download what is saved, then start afresh.';
const TOO_BIG = 'Your drafts could not be saved: together they would pass the 2 MB this browser keeps for the studio. Remove a draft you no longer need, or download this one as a file.';
const FULL = 'Your draft could not be saved: this browser\'s storage for the site is full. It is kept while this tab is open; download the file to keep it.';

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
