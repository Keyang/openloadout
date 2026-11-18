// The bag (architecture.md, Contract 6): the assets a visitor has collected,
// each with its own settings, plus one theme (Contract 7) applied to all of
// them on export. Kept in the browser's storage; the whole bag also travels
// in one link. No DOM here: createBag runs in Node for the unit tests.
import { defaultTheme, normalizeTheme } from '../engine/theme.js';

export const BAG_KEY = 'loadout-bag-v1';
export const KINDS = ['sprite', 'sound', 'music'];

/** Storage that lives only as long as the page (used when the browser's storage is unavailable). */
export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

/** A plain-data copy of a cue list, keeping only what a download uses. */
function cleanCues(cues) {
  if (!isObj(cues)) return null;
  const out = {};
  for (const [clip, list] of Object.entries(cues)) {
    if (!Array.isArray(list)) continue;
    out[clip] = list.filter((c) => isObj(c) && typeof c.sound === 'string').map((c) => {
      const cue = {
        sound: c.sound,
        frame: Number.isFinite(Number(c.frame)) ? Math.max(0, Math.round(Number(c.frame))) : 0,
        preset: typeof c.preset === 'string' && c.preset ? c.preset : null,
        params: isObj(c.params) ? clone(c.params) : null,
        volume: Number.isFinite(Number(c.volume)) ? Math.max(0, Math.min(1, Number(c.volume))) : 1,
      };
      // when: the settings this sound plays at (Contract 3), { control: [values] }
      if (isObj(c.when) && Object.keys(c.when).length && Object.values(c.when).every(Array.isArray)) cue.when = clone(c.when);
      return cue;
    });
  }
  return out;
}

/**
 * Settings by kind, as plain data:
 *   sprite { params, cues, scale }   sound { params, style, seed }   music { params, style }
 * Unknown fields are dropped, so whatever a page hands over cannot bloat the bag or its link.
 */
export function cleanSettings(kind, settings) {
  const s = isObj(settings) ? settings : {};
  const params = isObj(s.params) ? clone(s.params) : {};
  const style = typeof s.style === 'string' && s.style ? s.style : null;
  if (kind === 'sprite') {
    const scale = [1, 2, 3, 4, 6, 8].includes(Number(s.scale)) ? Number(s.scale) : 1;
    return { params, cues: cleanCues(s.cues), scale };
  }
  if (kind === 'sound') return { params, style, seed: Number.isFinite(Number(s.seed)) && Number(s.seed) >= 1 ? Math.round(Number(s.seed)) : 1 };
  return { params, style };
}

function cleanItem(raw) {
  if (!isObj(raw) || !KINDS.includes(raw.kind) || typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(raw.id)) return null;
  return { kind: raw.kind, id: raw.id, settings: cleanSettings(raw.kind, raw.settings) };
}

// ---- links: base64url of compact JSON ---------------------------------------------

const toB64 = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (text) => {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
const LETTER = { sprite: 's', sound: 'a', music: 'm' };
const KIND_OF = { s: 'sprite', a: 'sound', m: 'music' };
const sameAs = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The `load=` value from a full address, a '#/bag?...' hash, or the value itself. */
function payloadOf(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const t = text.trim();
  const q = t.indexOf('?');
  if (q >= 0) return new URLSearchParams(t.slice(q + 1)).get('load');
  return /^[A-Za-z0-9_-]+$/.test(t) && !t.startsWith('#') ? t : null;
}

/**
 * A bag kept in `storage` (anything with getItem / setItem).
 * opts.now: the clock for addedAt (tests pass a fixed one).
 */
export function createBag(storage, { now = () => Date.now(), standard = null } = {}) {
  let state = load();
  let standardOf = standard;
  const listeners = new Set();

  function load() {
    const empty = { items: [], theme: defaultTheme(), next: 1 };
    let raw;
    try { raw = JSON.parse(storage.getItem(BAG_KEY)); } catch { return empty; }
    if (!isObj(raw) || !Array.isArray(raw.items)) return empty;
    const items = [], seen = new Set();
    let next = Number.isInteger(raw.next) && raw.next > 0 ? raw.next : 1;
    for (const r of raw.items) {
      const it = cleanItem(r);
      if (!it) continue;
      let key = typeof r.key === 'string' && r.key && !seen.has(r.key) ? r.key : null;
      if (!key) key = 'i' + next++;
      seen.add(key);
      const n = Number(key.slice(1));
      if (key[0] === 'i' && Number.isInteger(n) && n >= next) next = n + 1;
      items.push({ key, ...it, addedAt: Number.isFinite(r.addedAt) ? r.addedAt : 0 });
    }
    return { items, theme: isObj(raw.theme) ? normalizeTheme(raw.theme) : defaultTheme(), next };
  }

  function save() {
    try { storage.setItem(BAG_KEY, JSON.stringify({ version: 1, ...state })); } catch { /* private window or full: the bag lives on in memory */ }
  }

  function changed() {
    save();
    for (const fn of [...listeners]) {
      try { fn(api); } catch (e) { console.error('bag listener:', e); }
    }
  }

  const newKey = () => 'i' + state.next++;
  const copy = (it) => clone(it);

  function put(raw, addedAt) {
    const it = cleanItem(raw);
    if (!it) throw new Error(`the bag holds sprites, sounds and music; got ${JSON.stringify(raw && { kind: raw.kind, id: raw.id })}`);
    const item = { key: newKey(), ...it, addedAt };
    state.items.push(item);
    return item.key;
  }

  /** Settings as they go in a link: values that equal the asset's standard ones are left out. */
  function compact(it) {
    let base = null;
    try { base = standardOf ? standardOf(it.kind, it.id, it.settings) : null; } catch { base = null; }
    if (!isObj(base)) return it.settings;
    const s = clone(it.settings);
    if (isObj(base.params)) for (const [k, v] of Object.entries(s.params)) if (k in base.params && sameAs(base.params[k], v)) delete s.params[k];
    if (it.kind === 'sprite' && s.cues && base.cues !== undefined && sameAs(cleanCues(base.cues), s.cues)) s.cues = null;
    return s;
  }

  /** The items and theme a link holds, or null when it is not a bag link. */
  function parseLink(text) {
    let data;
    try {
      const p = payloadOf(text);
      if (!p) return null;
      data = JSON.parse(fromB64(p));
    } catch { return null; }
    if (!isObj(data) || !Array.isArray(data.i)) return null;
    const list = data.i.map((r) => (Array.isArray(r) ? cleanItem({ kind: KIND_OF[r[0]], id: r[1], settings: r[2] }) : null)).filter(Boolean);
    if (list.length !== data.i.length && !list.length) return null;
    return { list, theme: isObj(data.t) ? normalizeTheme(data.t) : defaultTheme() };
  }

  const api = {
    /** Add an asset with its settings. Returns the new item's key. */
    add(item) {
      const key = put(item, now());
      changed();
      return key;
    },
    items: () => state.items.map(copy),
    get(key) { const it = state.items.find((i) => i.key === key); return it ? copy(it) : null; },
    has: (key) => state.items.some((i) => i.key === key),
    count: () => state.items.length,
    /** Replace one item's settings. Returns false when the key is not in the bag. */
    update(key, settings) {
      const it = state.items.find((i) => i.key === key);
      if (!it) return false;
      it.settings = cleanSettings(it.kind, settings);
      changed();
      return true;
    },
    remove(key) {
      const i = state.items.findIndex((x) => x.key === key);
      if (i < 0) return false;
      state.items.splice(i, 1);
      changed();
      return true;
    },
    clear() {
      if (!state.items.length) return;
      state.items = [];
      changed();
    },
    /** The bag-wide theme (Contract 7), always complete. */
    theme: () => clone(state.theme),
    setTheme(theme) {
      state.theme = normalizeTheme(isObj(theme) ? theme : {});
      changed();
    },
    /** Call fn(bag) after every change. Returns a function that stops it. */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** What a link holds, without loading it: { count } or null when it is not a bag link. */
    peekLink(text) { const got = parseLink(text); return got ? { count: got.list.length } : null; },
    /**
     * Tell the bag each asset's standard settings, so links can leave them out:
     * fn(kind, id, settings) -> { params, cues? } or null when unknown.
     */
    setStandard(fn) { standardOf = typeof fn === 'function' ? fn : null; },
    /** Read the storage again (another tab changed it). */
    reload() { state = load(); for (const fn of [...listeners]) { try { fn(api); } catch (e) { console.error('bag listener:', e); } } },

    /** The whole bag as an address hash: '#/bag?load=...'. */
    toLink() {
      const data = { v: 1, i: state.items.map((it) => [LETTER[it.kind], it.id, compact(it)]) };
      if (!sameAs(state.theme, defaultTheme())) data.t = state.theme;
      return '#/bag?load=' + toB64(JSON.stringify(data));
    },
    /**
     * Load a bag from a link made by toLink (a full address, the hash, or just its value).
     * mode 'replace' (default) swaps the bag and its theme; 'add' appends the items and keeps the theme.
     * Returns how many items it loaded, or null when the link is not a bag (the bag is then unchanged).
     */
    fromLink(text, { mode = 'replace' } = {}) {
      const got = parseLink(text);
      if (!got) return null;
      const { list } = got;
      if (mode !== 'add') { state.items = []; state.theme = got.theme; }
      const t = now();
      for (const it of list) put(it, t);
      changed();
      return list.length;
    },
  };
  return api;
}

/** The browser's storage when it works, otherwise memory (private windows, blocked storage, Node). */
function siteStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return memoryStorage();
    const s = window.localStorage, probe = BAG_KEY + '-probe';
    s.setItem(probe, '1'); s.removeItem(probe);
    return s;
  } catch { return memoryStorage(); }
}

/** The site's one shared bag. */
export const bag = createBag(siteStorage());

// Another tab changed the bag: pick it up here too.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === BAG_KEY) bag.reload(); });
