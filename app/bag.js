// The bag (architecture.md, Contract 6): the assets a visitor has collected,
// each with its own settings, plus one theme (Contract 7) applied to all of
// them on export. Kept in the browser's storage; the whole bag also travels
// in one link. No DOM here: createBag runs in Node for the unit tests.
//
// An asset made on a visit (window.loadout.make, Contract 11) is not in the catalogue, so its bag item carries
// its whole definition: { source } (a sprite's module text) or { patch } (a sound or a track). That is what
// brings it back after a reload, and what a shared link has to hold. Catalogue items have no definition.
//
// looks (Contract 7, "The record"): while the bag's look changes shapes, each sprite item keeps what that look made
// of it (`settings.lookParams`, from shapeRecord), so the bag draws and downloads the same pictures on every visit,
// also after the rule behind "Also change shapes" changes. It is made when the item comes in or the shapes part of the
// look changes (another number behind "Surprise me", shapes on or off), and kept when only colours change.
import { defaultTheme, normalizeTheme, shapeRecord, THEME_PRESETS } from '../engine/theme.js';
import { spriteNow } from './catalog.js';

export const BAG_KEY = 'loadout-bag-v1';
export const KINDS = ['sprite', 'sound', 'music'];
/** The most a sprite's source text may be, in characters (the largest file in sprites/ is a tenth of this). */
export const MAX_SOURCE = 400_000;
/**
 * The longest bag link the site hands out, in characters. A link is made of the bag's items, and an item made on
 * a visit brings its whole source. Browsers open far longer addresses, but chat and mail apps cut long ones short,
 * and a cut link opens as "damaged". Over this the bag page says so and points at the download instead.
 */
export const LINK_LIMIT = 8000;

/** Storage that lives only as long as the page (used when the browser's storage is unavailable). */
export function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));
const STYLE_ID = /^[a-z][a-z0-9-]{0,39}$/;     // a drawing style's id, as engine/styles.js names them

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
 *   sprite { params, cues, scale, artStyle?, look? }   sound { params, style, seed, look? }   music { params, style, look? }
 * `look` is the id of a named look (engine/theme.js THEME_PRESETS) that this one item wears whatever the bag's look is.
 * It is there only when one was chosen: an item without it follows the bag's look and is stored exactly as before.
 * A sprite's `artStyle` is the id of the art style it is drawn and exported in (Contract 12). It is there only when
 * one was chosen: the page leaves it out for the sprite's first style, so an item without it is stored exactly as before.
 * (`style` is something else: the name of one of a sound's named styles. A sprite item has none.)
 * Unknown fields are dropped, so whatever a page hands over cannot bloat the bag or its link.
 */
const LOOK_ID = /^[a-z][a-z0-9-]{0,39}$/;
export function cleanSettings(kind, settings) {
  const s = isObj(settings) ? settings : {};
  const params = isObj(s.params) ? clone(s.params) : {};
  const style = typeof s.style === 'string' && s.style ? s.style : null;
  const look = typeof s.look === 'string' && LOOK_ID.test(s.look) ? s.look : null;      // the item's own look (see lookOf): only when one was chosen
  if (kind === 'sprite') {
    const scale = [1, 2, 3, 4, 6, 8].includes(Number(s.scale)) ? Number(s.scale) : 1;
    const out = { params, cues: cleanCues(s.cues), scale };
    if (typeof s.artStyle === 'string' && STYLE_ID.test(s.artStyle)) out.artStyle = s.artStyle;
    const record = cleanRecord(s.lookParams);      // looks: what the bag's look made of its shapes (see the top)
    if (record && !look) out.lookParams = record;      // (an item with a look of its own does not follow the bag's)
    if (look) out.look = look;
    return out;
  }
  if (kind === 'sound') return { params, style, seed: Number.isFinite(Number(s.seed)) && Number(s.seed) >= 1 ? Math.round(Number(s.seed)) : 1, ...(look ? { look } : {}) };
  return { params, style, ...(look ? { look } : {}) };
}

/**
 * An item's own look: the id of a named look (THEME_PRESETS) its settings carry, or null when they carry none or one
 * this site does not know. null means the item follows the bag's look.
 */
export function lookOf(settings) {
  const id = isObj(settings) && typeof settings.look === 'string' ? settings.look : null;
  return id && THEME_PRESETS.some((p) => p.id === id) ? id : null;
}
/**
 * The look one item is drawn, played and exported with (a complete theme): its own named look when it has one
 * ("original" holds it as it was made, whatever the bag wears), otherwise the bag's look.
 *   settings   the item's settings        bagTheme   the bag's theme (bag.theme()), or nothing for the plain look
 */
export function themeFor(settings, bagTheme) {
  const id = lookOf(settings);
  return normalizeTheme(id ? THEME_PRESETS.find((p) => p.id === id).theme : isObj(bagTheme) ? bagTheme : {});
}

/** A look's record of a sprite's shapes as plain data ({ control: number | text | true/false }), or null when it is anything else. */
function cleanRecord(r) {
  if (!isObj(r)) return null;
  const entries = Object.entries(r);
  if (entries.length > 200) return null;
  const ok = ([k, v]) => /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(k) && ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 200));
  return entries.every(ok) ? Object.fromEntries(entries) : null;
}

/** The definition of an asset made on a visit, as plain data: sprite { source }, sound and music { patch }. null for anything else. */
export function cleanDefinition(kind, definition) {
  if (!isObj(definition)) return null;
  if (kind === 'sprite') return typeof definition.source === 'string' && definition.source.trim() && definition.source.length <= MAX_SOURCE ? { source: definition.source } : null;
  if (!isObj(definition.patch)) return null;
  try { return { patch: clone(definition.patch) }; } catch { return null; }
}

function cleanItem(raw) {
  if (!isObj(raw) || !KINDS.includes(raw.kind) || typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(raw.id)) return null;
  const item = { kind: raw.kind, id: raw.id, settings: cleanSettings(raw.kind, raw.settings) };
  const definition = cleanDefinition(raw.kind, raw.definition);
  if (definition) item.definition = definition;
  // where a made item came from, kept so the bag page can say whom to ask when it turns out broken
  if (definition && raw.from === 'link') item.from = 'link';
  return item;
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
// opts.kept: false when `storage` lives only as long as the page (memory standing in for storage the browser refused).
// opts.spriteOf(id): a sprite's program if it is loaded, else null: the bag records what its look made of a sprite with it.
export function createBag(storage, { now = () => Date.now(), standard = null, kept = true, spriteOf = null } = {}) {
  let state = load();
  let standardOf = standard;
  let definitionOf = null;
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
    const theme = isObj(raw.theme) ? normalizeTheme(raw.theme) : defaultTheme();
    if (!theme.shapes) for (const it of items) if (it.kind === 'sprite') delete it.settings.lookParams;   // looks: a record only lives with shapes
    return { items, theme, next };
  }

  // ---- looks: the record of what the bag's look made of each sprite (see the top) ----
  const shapesOf = (t) => (t.shapes ? `seed ${t.seed}` : '');
  /** Record one item, if it is a sprite with no record and its program is loaded. Returns true when it changed. */
  function record(it) {
    if (it.kind !== 'sprite') return false;
    if (!state.theme.shapes || it.settings.look) { const had = 'lookParams' in it.settings; delete it.settings.lookParams; return had; }
    if (it.settings.lookParams || !spriteOf) return false;
    let sprite = null;
    try { sprite = spriteOf(it.id); } catch { sprite = null; }
    if (!sprite || !sprite.params) return false;
    try { it.settings.lookParams = shapeRecord(sprite, it.settings.params, state.theme); return true; } catch { return false; }
  }

  // saved: did the last change reach the storage? When the browser refuses (its storage for the site is full) the bag
  // lives on in memory for this visit, and whoever shows or fills it can find out and say so (Contract 11: a failed
  // save is reported, never swallowed).
  let saved = true;
  function save() {
    try { storage.setItem(BAG_KEY, JSON.stringify({ version: 1, ...state })); saved = true; } catch { saved = false; }
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
    // an asset made on this visit goes in with its definition, whoever adds it (a card, its page, a copy of a bag row)
    if (!it.definition && definitionOf) {
      let d = null;
      try { d = cleanDefinition(it.kind, definitionOf(it.kind, it.id)); } catch { d = null; }
      if (d) it.definition = d;
    }
    record(it);      // looks
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
    if (it.kind === 'sprite' && s.artStyle !== undefined && s.artStyle === base.artStyle) delete s.artStyle;
    return s;
  }

  /**
   * An item from a link made whole again: a link leaves out each control that equals the asset's standard settings
   * (compact), and for a sound or a track those are its version's (its named style's), not the plain defaults. They are
   * put back here, so the opened bag holds what the shared one held (J9.1, R3). Unknown assets are left as they came.
   */
  function expand(it) {
    if (it.kind === 'sprite' || !standardOf) return it;
    let base = null;
    try { base = standardOf(it.kind, it.id, it.settings); } catch { base = null; }
    if (!isObj(base) || !isObj(base.params)) return it;
    return { ...it, settings: { ...it.settings, params: { ...clone(base.params), ...it.settings.params } } };
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
    // a fourth entry is the definition of an asset made on a visit: { s: source } or { p: patch }
    const list = data.i.map((r) => (Array.isArray(r) ? cleanItem({ kind: KIND_OF[r[0]], id: r[1], settings: r[2], definition: isObj(r[3]) ? { source: r[3].s, patch: r[3].p } : null }) : null)).filter(Boolean);
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
      const old = it.settings;
      it.settings = cleanSettings(it.kind, settings);
      // looks: the record stays while the item's own settings stay; other settings are recorded again
      if (it.kind === 'sprite') {
        if (!sameAs(old.params, it.settings.params)) delete it.settings.lookParams;
        else if (old.lookParams) it.settings.lookParams = old.lookParams;
        record(it);
      }
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
      const before = shapesOf(state.theme);
      state.theme = normalizeTheme(isObj(theme) ? theme : {});
      // looks: another shapes part of the look is recorded again; a change of colours keeps what was recorded
      if (shapesOf(state.theme) !== before) for (const it of state.items) if (it.kind === 'sprite') delete it.settings.lookParams;
      for (const it of state.items) record(it);
      changed();
    },
    /**
     * Record what the look made of every sprite that has no record yet (its program was not loaded when it came in).
     * Saves, without telling the listeners: what is drawn does not change. Returns how many were recorded.
     */
    fillLooks() {
      let n = 0;
      for (const it of state.items) if (record(it)) n++;
      if (n) save();
      return n;
    },
    /** Call fn(bag) after every change. Returns a function that stops it. */
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** What a link holds, without loading it: { count } or null when it is not a bag link. */
    // made: how many of them were made on a visit and come with their definition; code: how many of those are sprites,
    // whose definition is a program that runs when the bag is opened. Both are left out when there are none.
    peekLink(text) {
      const got = parseLink(text);
      if (!got) return null;
      const made = got.list.filter((i) => i.definition).length;
      return made ? { count: got.list.length, made, code: got.list.filter((i) => i.definition && i.kind === 'sprite').length } : { count: got.list.length };
    },
    /**
     * Tell the bag each asset's standard settings, so links can leave them out:
     * fn(kind, id, settings) -> { params, cues?, artStyle? (a sprite's first art style) } or null when unknown.
     */
    setStandard(fn) { standardOf = typeof fn === 'function' ? fn : null; },
    /**
     * Tell the bag where the definitions of assets made on this visit are, so every add() stores one:
     * fn(kind, id) -> { source } | { patch }, or null for a catalogue asset.
     */
    setDefinitions(fn) { definitionOf = typeof fn === 'function' ? fn : null; },
    /** An asset made on this visit was made again: give every bag item of it the new definition. Returns how many changed. */
    redefine(id, definition) {
      let n = 0;
      for (const it of state.items) {
        if (it.id !== id) continue;
        const d = cleanDefinition(it.kind, definition);
        if (!d || sameAs(d, it.definition)) continue;
        it.definition = d;
        n++;
      }
      if (n) changed();
      return n;
    },
    /** false when the last change could not be written to the browser's storage: the bag then holds it for this visit only. */
    saved: () => saved,
    /**
     * Does the browser keep this bag for the next visit? false when its storage is refused (a private window, site data
     * blocked: the bag then lives in memory, and every save "works" but nothing lasts) or the last save failed.
     * Pages that add to the bag or show it say so in plain words (NOT_KEPT) while it is false.
     */
    kept: () => kept && saved,
    /** Tell every listener to look again, though nothing in the bag changed (what is known about its items did). */
    touch() { for (const fn of [...listeners]) { try { fn(api); } catch (e) { console.error('bag listener:', e); } } },
    /** How many items were made on a visit (they carry their definition). */
    madeCount: () => state.items.filter((i) => i.definition).length,
    /** Read the storage again (another tab changed it). */
    reload() { state = load(); for (const fn of [...listeners]) { try { fn(api); } catch (e) { console.error('bag listener:', e); } } },

    /** The whole bag as an address hash: '#/bag?load=...'. */
    toLink() {
      const data = { v: 1, i: state.items.map((it) => (it.definition ? [LETTER[it.kind], it.id, compact(it), it.kind === 'sprite' ? { s: it.definition.source } : { p: it.definition.patch }] : [LETTER[it.kind], it.id, compact(it)])) };
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
      // looks: records made under another look than the bag's own are left behind, and made again here
      const foreign = shapesOf(got.theme) !== shapesOf(state.theme);
      const t = now();
      for (const raw of list) {
        const it = expand(raw);
        if (foreign && it.settings) delete it.settings.lookParams;
        put(it.definition ? { ...it, from: 'link' } : it, t);
      }
      changed();
      return list.length;
    },
  };
  return api;
}

/**
 * Where the bag lives: { storage, kept }. The browser's storage when it can be read (kept: true), otherwise memory that
 * lasts as long as the page (kept: false: private windows, blocked site data, Node). win: the window, or undefined.
 */
export function pickStorage(win) {
  // Usable means readable. Writing is not tried here: when the browser's storage for the site is full a write fails,
  // but the bag already stored is still there to read, and each failed save is reported (saved()).
  try {
    const store = win && win.localStorage;
    if (!store) return { storage: memoryStorage(), kept: false };
    store.getItem(BAG_KEY);
    return { storage: store, kept: true };
  } catch { return { storage: memoryStorage(), kept: false }; }
}

/** What the site says, wherever things are added and on the bag page, while the browser is not keeping the bag. */
export const NOT_KEPT = 'This browser is not keeping your bag (a private window, or saving for sites is switched off), so it will be gone when you reload or close the page. Download it before you leave, or copy the link to your bag and open that later.';

/** The site's one shared bag. */
const where = pickStorage(typeof window === 'undefined' ? undefined : window);
export const bag = createBag(where.storage, { kept: where.kept, spriteOf: spriteNow });

// Another tab changed the bag: pick it up here too.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === BAG_KEY) bag.reload(); });
