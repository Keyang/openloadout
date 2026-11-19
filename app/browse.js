// Finding things: what sits behind the results view (app/home.js) and anything else that lists assets.
//
//   the address bar     stateFromQuery, queryFromState, hashFromState, sameState
//   filters             FILTER_GROUPS, filtersFor, viewCounts, optionsFor, roleTree, activeFilters
//   the style that stays  createStyleMemory, styleMemory   ("View" and "Game type" are remembered across visits)
//   results             pickResults, resultLine, shelfTitle
//   search              finder (one shared search over the catalogue), onSearchChange
//   smarter search      smart, setSmartSearch, onSmartChange, smartDownload, smartNote   (the visitor's choice; a big download)
//   for other pages     similarAssets(id) -> an element listing similar assets as cards
//
// Everything above "search" is plain data in, plain data out, and runs in Node for the unit tests; nothing in
// this file touches the page when it is loaded (pieces that draw load app/cards.js when they are first called).
import {
  KINDS, VIEWS, ROLE_TREE, ROLE_TOPS, SPRITE_TYPES, AUDIO_TYPES, THEMES, GAME_TYPES, TYPE_LABELS, THEME_LABELS, GAME_TYPE_LABELS, VIEW_LABELS, labelFor,
} from '../catalog/schema.js';
import { createSearch } from '../search/client.js';
import { matchesFilters } from '../search/core.js';
import { loadCatalog, assetById } from './catalog.js';

// ---- the address bar ------------------------------------------------------------------------

/** The filters, in the order the page shows them. `param` is the name in the address bar; `sticky` ones are remembered. */
export const FILTER_GROUPS = [
  { key: 'kind', param: 'kind', label: 'Kind' },
  { key: 'role', param: 'role', label: 'Used for' },
  { key: 'type', param: 'type', label: 'Type' },
  { key: 'themes', param: 'theme', label: 'Theme' },
  { key: 'gameTypes', param: 'game', label: 'Game type', sticky: true },
  { key: 'view', param: 'view', label: 'View', sticky: true, note: 'Sounds and music have no view, so they always stay.' },
  { key: 'bundle', param: 'bundle', label: 'Bundle' },
];
const ADDRESS_ORDER = ['kind', 'type', 'role', 'themes', 'gameTypes', 'view', 'bundle'];
const GROUP = Object.fromEntries(FILTER_GROUPS.map((g) => [g.key, g]));
export const STYLE_KEYS = FILTER_GROUPS.filter((g) => g.sticky).map((g) => g.key);
/** The longest search the site takes. The search box has the same limit, so what is typed is what is searched. */
export const Q_MAX = 120;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ROLE = /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)?$/;
const STYLE_VIEWS = VIEWS.filter((v) => v !== 'none');      // "no view" is not a style someone picks
const OK = {
  kind: (v) => KINDS.includes(v),
  view: (v) => STYLE_VIEWS.includes(v),
  role: (v) => ROLE.test(v),
  type: (v) => ID.test(v), themes: (v) => ID.test(v), gameTypes: (v) => ID.test(v), bundle: (v) => ID.test(v),
};
const clean = (key, v) => (typeof v === 'string' && OK[key](v) ? v : null);

const emptyState = () => ({ q: '', kind: null, type: null, role: null, themes: null, gameTypes: null, view: null, bundle: null });

/** The search and filters an address asks for. `query`: the text after "?", or its parsed { name: value }. Unknown values are dropped. */
export function stateFromQuery(query) {
  const get = typeof query === 'string' ? ((p) => new URLSearchParams(query).get(p)) : ((p) => (query ? query[p] : null));
  const state = emptyState();
  const q = get('q');
  if (typeof q === 'string') state.q = q.slice(0, Q_MAX);
  for (const g of FILTER_GROUPS) state[g.key] = clean(g.key, get(g.param));
  return state;
}

/** The same thing as address-bar text: "q=money&kind=sound". Always in the same order; empty when nothing is set. */
export function queryFromState(state) {
  const out = new URLSearchParams();
  if (state.q && state.q.trim()) out.set('q', state.q);
  for (const key of ADDRESS_ORDER) if (state[key]) out.set(GROUP[key].param, state[key]);
  return out.toString();
}

export const hashFromState = (state) => { const text = queryFromState(state); return text ? `#/browse?${text}` : '#/browse'; };
export const sameState = (a, b) => queryFromState(a) === queryFromState(b);

// ---- filters --------------------------------------------------------------------------------

/**
 * The filters as the search library takes them (Contract 5). A chosen view keeps everything that has
 * no view of its own (sounds, music, icons), so one style choice can stay on while browsing every kind.
 */
export function filtersFor(state) {
  const f = {};
  for (const g of FILTER_GROUPS) {
    const v = state[g.key];
    if (v) f[g.key] = g.key === 'view' ? [v, 'none', null] : v;
  }
  return f;
}

/**
 * The number to show next to each view: how many of `assets` choosing it would leave, counted the way
 * filtersFor filters (the view's own sprites plus everything that has no view). A view is only listed
 * when at least one asset really has it. `assets`: catalogue rows (all of them, or a search's results).
 */
export function viewCounts(assets, state) {
  const others = filtersFor({ ...state, view: null });
  const own = {};
  let free = 0;
  for (const a of assets) {
    if (!a || !matchesFilters(a, others)) continue;
    if (a.view == null || a.view === 'none') free++; else own[a.view] = (own[a.view] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(own).map(([view, n]) => [view, n + free]));
}

const KIND_LABEL = { sprite: 'Sprites', sound: 'Sounds', music: 'Music' };
const words = (s) => String(s).replace(/-/g, ' ');
const roleLabel = (id) => words(labelFor('role', id));
const ORDER = { kind: KINDS, type: [...new Set([...SPRITE_TYPES, ...AUDIO_TYPES])], themes: THEMES, gameTypes: GAME_TYPES, view: STYLE_VIEWS };
const NAMED = { type: TYPE_LABELS, themes: THEME_LABELS, gameTypes: GAME_TYPE_LABELS, view: VIEW_LABELS };
// a value the schema names keeps its name; one it does not know yet is shown as plain words
const optionLabel = (key, value) => (key === 'kind' ? KIND_LABEL[value] ?? value : NAMED[key] && value in NAMED[key] ? labelFor(key, value) : words(labelFor(key, value)));

/**
 * The choices one filter offers: [{ value, label, count, on }], in a fixed order, only values the catalogue holds.
 * `counts` is what search.counts() gave; a chosen value stays listed at 0 so it can be switched off.
 */
export function optionsFor(key, counts, state, bundles = []) {
  const have = { ...(counts && counts[key]) };
  if (key === 'view') delete have.none;
  const chosen = state[key];
  if (chosen && !(chosen in have)) have[chosen] = 0;
  const known = key === 'bundle' ? bundles.map((b) => b.id) : ORDER[key] ?? [];
  const values = [...known.filter((v) => v in have), ...Object.keys(have).filter((v) => !known.includes(v)).sort()];
  const name = key === 'bundle' ? (v) => bundles.find((b) => b.id === v)?.name ?? words(v) : (v) => optionLabel(key, v);
  return values.map((value) => ({ value, label: name(value), count: have[value], on: value === chosen }));
}

/**
 * Roles as a short tree under the shared top levels (a chest sprite and its creak sit together):
 * [{ id, label, count, on, open, children: [{ id, label, count, on }] }]. A branch is open when it or one of its leaves is chosen.
 */
export function roleTree(roleCounts = {}, selected = null) {
  const have = { ...roleCounts };
  if (selected) {
    const top = selected.split('/')[0];
    if (!(top in have)) have[top] = 0;
    if (!(selected in have)) have[selected] = 0;
  }
  const tops = Object.keys(have).filter((id) => !id.includes('/'));
  const ordered = [...ROLE_TOPS.filter((t) => tops.includes(t)), ...tops.filter((t) => !ROLE_TOPS.includes(t)).sort()];
  return ordered.map((top) => {
    const known = ROLE_TREE[top] ? [...new Set([...ROLE_TREE[top].sprite, ...ROLE_TREE[top].sound])].map((leaf) => `${top}/${leaf}`) : [];
    const leaves = Object.keys(have).filter((id) => id.startsWith(top + '/'));
    const children = [...known.filter((id) => leaves.includes(id)), ...leaves.filter((id) => !known.includes(id)).sort()]
      .map((id) => ({ id, label: roleLabel(id), count: have[id], on: id === selected }));
    return { id: top, label: roleLabel(top), count: have[top], on: top === selected, open: !!selected && (selected === top || selected.startsWith(top + '/')), children };
  });
}

/** The filters in use, as chips: [{ key, value, label, sticky }]. The remembered style choices come first. */
export function activeFilters(state, bundles = []) {
  const label = (key, v) => {
    if (key === 'role') { const [top, leaf] = v.split('/'); return leaf ? `${roleLabel(top)}: ${roleLabel(v)}` : roleLabel(top); }
    if (key === 'bundle') return bundles.find((b) => b.id === v)?.name ?? words(v);
    return optionLabel(key, v);
  };
  const order = [...STYLE_KEYS, ...FILTER_GROUPS.map((g) => g.key).filter((k) => !STYLE_KEYS.includes(k))];
  return order.filter((key) => state[key]).map((key) => ({ key, value: state[key], label: label(key, state[key]), sticky: !!GROUP[key].sticky }));
}

// ---- the style filter that stays --------------------------------------------------------------

export const STYLE_KEY = 'loadout-style-v1';

/**
 * Remembers the visitor's "View" and "Game type" in `storage` (anything with getItem / setItem), because
 * assets that do not match each other are the main complaint about asset libraries.
 *   get()            -> { view, gameTypes }
 *   apply(state)     -> state with the remembered style filled in where the address does not name one;
 *                       a style the address does name becomes the remembered one
 *   remember(state)  store the state's style        forget(key)  drop one of the two
 */
export function createStyleMemory(storage) {
  let kept = { view: null, gameTypes: null };
  try {
    const raw = JSON.parse(storage.getItem(STYLE_KEY));
    if (raw && typeof raw === 'object') kept = { view: clean('view', raw.view), gameTypes: clean('gameTypes', raw.gameTypes) };
  } catch { /* nothing remembered, or storage is blocked: start clean */ }
  const save = () => { try { storage.setItem(STYLE_KEY, JSON.stringify(kept)); } catch { /* kept for this visit only */ } };
  return {
    get: () => ({ ...kept }),
    remember(state) { kept = { view: clean('view', state.view), gameTypes: clean('gameTypes', state.gameTypes) }; save(); },
    forget(key) { if (key in kept) { kept[key] = null; save(); } },
    apply(state) {
      const out = { ...state };
      let changed = false;
      for (const key of STYLE_KEYS) {
        if (out[key]) { if (kept[key] !== out[key]) { kept[key] = out[key]; changed = true; } } else out[key] = kept[key];
      }
      if (changed) save();
      return out;
    },
  };
}

/** The browser's storage, or one that lasts for this visit when the browser's is blocked. */
function browserStorage() {
  try { const s = globalThis.localStorage; s.getItem(STYLE_KEY); return s; } catch { /* private window */ }
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
}
let memory = null;
/** The one style memory every list on the site shares. */
export const styleMemory = () => (memory ??= createStyleMemory(browserStorage()));

// ---- which results to show ------------------------------------------------------------------

/**
 * The ids to show, best first. `ranked` is the best ordering known so far (with smarter search on it also
 * holds things matched by meaning); `direct` is what the typed words match, which is there at once.
 * Nothing found by the words alone is ever dropped: it follows the ranked ones.
 */
export function pickResults({ ranked = [], direct = [] }) {
  const seen = new Set(), out = [];
  for (const id of [...ranked, ...direct]) if (!seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}

const QUOTE_MAX = 40;
const quoted = (q) => `"${q.length > QUOTE_MAX ? q.slice(0, QUOTE_MAX) + '…' : q}"`;

/** The plain line above the results. A long search is quoted short. */
export function resultLine(n, state) {
  const q = String(state.q ?? '').trim();
  if (n > 0) return `${n} result${n === 1 ? '' : 's'}${q ? ` for ${quoted(q)}` : ''}`;
  if (q) return `Nothing matches ${quoted(q)}`;
  return FILTER_GROUPS.some((g) => state[g.key]) ? 'Nothing matches these filters' : 'Nothing here yet';
}

/** The heading above the list on the front page. It only says "Everything" when nothing is held back. */
export function shelfTitle(state) {
  if (String(state.q ?? '').trim() || FILTER_GROUPS.some((g) => !g.sticky && state[g.key])) return 'Results';
  return STYLE_KEYS.some((key) => state[key]) ? 'Everything that fits your game' : 'Everything';
}

// ---- a stand-in catalogue, for tests ----------------------------------------------------------

/**
 * Test-only: on a developer's own machine, "?catalog=<file>.json" before the "#" swaps in another catalogue
 * (tests/fixtures/search/catalog.json is a 490-entry stand-in). Returns the file, or null: always null on a
 * real site, and for anything but a plain path inside the project.
 */
export function standInCatalog(loc = globalThis.location) {
  if (!loc || !['localhost', '127.0.0.1', '[::1]'].includes(loc.hostname)) return null;
  const file = new URLSearchParams(loc.search || '').get('catalog');
  return file && /^[\w-]+(\/[\w-][\w.-]*)*\.json$/.test(file) && !file.includes('..') ? file : null;
}

// ---- search -----------------------------------------------------------------------------------
// One search for the whole site (Contract 5). It answers at once from the catalogue, gets better without
// a word when the search file has loaded, and can also match by meaning when the visitor switches
// "Smarter search" on (a large download, so it is their choice and it is remembered).

export const SMART_KEY = 'loadout-smart-search';
/** state: 'off' | 'loading' | 'ready' | 'failed'. bytes: the size of the download (0 until known, or when this copy of the site has none); got: how much has arrived. */
export const smart = { on: false, state: 'off', bytes: 0, got: 0, sized: false };      // sized: the size has been looked up

const setup = { dbUrl: 'generated/search.sqlite', vendorBase: 'vendor/' };
/** Where the search file and the vendor folder are (app.js sets these for a stand-in catalogue). */
export function configureSearch(options) { Object.assign(setup, options); }

const call = (set) => { for (const fn of [...set]) { try { fn(); } catch (e) { console.error(e); } } };
const watchers = new Set(), smartWatchers = new Set();
const tell = () => call(watchers);
const tellSmart = () => call(smartWatchers);
/** Call fn() whenever search results may have changed for the same words (a better level arrived, the switch moved). */
export function onSearchChange(fn) { watchers.add(fn); return () => watchers.delete(fn); }
/** Call fn() whenever `smart` changes: the switch, its state, the size, how much has arrived. */
export function onSmartChange(fn) { smartWatchers.add(fn); return () => smartWatchers.delete(fn); }

/**
 * What switching smarter search on downloads, from the build's list of vendor files (vendor/manifest.json):
 * { bytes, files: [{ url, bytes }] }. The search file and its reader are left out: every visitor has those already.
 * Nothing (bytes 0) when this copy of the site was built without the part that understands descriptions.
 */
export function smartDownload(manifest, base = setup.vendorBase) {
  const listed = manifest && manifest.meaning !== false && Array.isArray(manifest.files) ? manifest.files : [];
  const files = listed.filter((f) => f && /^(transformers|ort|models)\//.test(f.to) && Number.isFinite(f.bytes)).map((f) => ({ url: base + f.to, bytes: f.bytes }));
  return { bytes: files.reduce((sum, f) => sum + f.bytes, 0), files };
}

const megabytes = (bytes) => Math.round(bytes / 1e6);
/** The one line under the switch. */
export function smartNote({ state, bytes = 0, got = 0 }) {
  if (state === 'loading') return bytes > 0 && got < bytes ? `Downloading: ${megabytes(got)} of ${megabytes(bytes)} MB` : 'Getting smarter search ready…';
  if (state === 'ready') return 'On. Describe what you need in your own words.';
  if (state === 'failed') return 'Smarter search could not be loaded, so it is switched off. Normal search still works.';
  return `Understands descriptions like "something for when the player dies".${bytes > 0 ? ` Downloads about ${megabytes(bytes)} MB once.` : ''}`;
}

let catalog = null, full = null, wordsOnly = null, starting = null, round = 0, download = null;

/** The download's size and files, read once from vendor/manifest.json. Also fills in smart.bytes. */
function sizeUp() {
  download ??= fetch(setup.vendorBase + 'manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((manifest) => {
    const d = smartDownload(manifest);
    smart.bytes = d.bytes;
    smart.sized = true;
    tellSmart();
    return d;
  });
  return download;
}

/**
 * Fetch the files once here, counting what arrives, so the page can say "12 of 39 MB". The browser keeps them,
 * and the search then starts from that copy. (The search library does not report its own progress.)
 */
async function fetchCounted(files, still) {
  let got = 0, shown = -1;
  await Promise.all(files.map(async (f) => {
    const r = await fetch(f.url);
    if (!r.ok) throw new Error(`${f.url}: ${r.status}`);
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!still()) { reader.cancel().catch(() => {}); return; }
      got += value.length;
      smart.got = got;
      if (megabytes(got) !== shown) { shown = megabytes(got); tellSmart(); }       // say so once per megabyte, not per piece
    }
  }));
}

// Final review (fault 5): the search index file (generated/search.sqlite, about half a megabyte, and its reader) is
// fetched only when something needs it: words typed into a search, "More like this", or smarter search. Until then
// the catalogue answers (Contract 5: every level answers), so a page that only lists things never waits for it.
let indexed = null;
function start() {
  if (!starting) {
    starting = (async () => {
      catalog = await loadCatalog();
      let wanted = false;
      try { wanted = browserStorage().getItem(SMART_KEY) === 'on'; } catch { /* off */ }
      full = await createSearch({ catalog, dbUrl: null, meaning: 'off' });
      sizeUp();
      // chosen on an earlier visit: the browser has the files already, so there is nothing to count
      if (wanted) wantIndex().then(() => switchSmart(true, { save: false, count: false }));
    })();
  }
  return starting;
}
/** The search with the index file, made the first time something needs it; it then answers everything. */
function wantIndex() {
  indexed ??= start().then(async () => {
    const s = await createSearch({ catalog, dbUrl: setup.dbUrl, vendorBase: setup.vendorBase, meaning: 'off' });
    full = s;
    s.onLevel(tell);
    return s;
  });
  return indexed;
}

const remember = (on) => { try { browserStorage().setItem(SMART_KEY, on ? 'on' : 'off'); } catch { /* this visit only */ } };

async function switchSmart(on, { save = true, count = true } = {}) {
  const mine = ++round, still = () => mine === round;
  smart.on = on;
  smart.got = 0;
  if (save) remember(on);
  if (!on) {
    full.disableMeaning();
    wordsOnly = null;
    smart.state = 'off';
    tellSmart(); tell();
    return;
  }
  smart.state = 'loading';
  tellSmart();
  let ok = false;
  try {
    const d = await sizeUp();
    if (!still()) return;
    if (d.bytes > 0) {
      if (count) await fetchCounted(d.files, still);
      if (!still()) return;
      smart.got = d.bytes;
      tellSmart();
      ok = await full.enableMeaning();
    }
  } catch (e) { console.warn('Loadout: smarter search did not load.', e); }
  if (!still()) return;          // the switch moved again meanwhile
  if (ok) smart.state = 'ready';
  else {
    // it cannot work here: switch it back off and remember that, so the next visit does not try again
    full.disableMeaning();
    wordsOnly = null;
    smart.on = false;
    smart.state = 'failed';
    remember(false);
  }
  tellSmart(); tell();
}

/** Switch "Smarter search" on or off, and remember the choice. Resolves when it is ready, or has failed. */
export async function setSmartSearch(on) { await wantIndex(); return switchSmart(!!on); }

const ids = (rows) => rows.map((r) => r.id);
const everything = () => catalog.assets.length + 1;

/** The site's search. Every call waits only for the catalogue. */
export const finder = {
  ready: () => start(),
  /**
   * Ids whose words match, best first, at once. With nothing typed: every asset, in catalogue order.
   * index: false answers from the catalogue alone and does not fetch the index (a check that is not a search).
   */
  async direct(q, { index = true } = {}) {
    await start();
    if (index && String(q ?? '').trim()) await wantIndex();
    if (full.level !== 'meaning') return ids(await full.search(q, { limit: everything() }));
    wordsOnly ??= await createSearch({ catalog, dbUrl: null, meaning: 'off' });
    return ids(await wordsOnly.search(q, { limit: everything() }));
  },
  /** True when ranked() can add to direct(): only while smarter search is running. */
  deeper: () => !!full && full.level === 'meaning',
  /** The best ordering there is; may take a moment while smarter search reads the words. */
  async ranked(q) { await start(); return ids(await full.search(q, { limit: everything() })); },
  /** How many assets each filter value would give, among `among` (ids) or everything. */
  async counts(filters, among = null) { await start(); return full.counts(filters, { ids: among }); },
  async similar(id, n = 6) { await wantIndex(); return full.similar(id, n); },
};

// ---- for other pages --------------------------------------------------------------------------

/**
 * An element listing assets similar to this one, as cards. One line on any page:
 *   main.append(similarAssets(asset.id))
 * It fills itself in when the search is ready and stays hidden if there is nothing to show.
 */
export function similarAssets(id, { count = 6, title = 'More like this' } = {}) {
  const heading = document.createElement('h2');
  heading.className = 'shelf';
  heading.textContent = title;
  const list = document.createElement('ul');
  list.className = 'gallery similar-list';
  const box = document.createElement('section');
  box.className = 'similar';
  box.hidden = true;
  box.append(heading, list);
  (async () => {
    const [{ cardFor }, found] = await Promise.all([import('./cards.js'), finder.similar(id, count)]);
    const rows = found.map(assetById).filter((row) => row && row.id !== id).slice(0, count);
    for (const row of rows) { const li = document.createElement('li'); li.append(cardFor(row).node); list.append(li); }
    box.hidden = rows.length === 0;
  })().catch((e) => console.warn('Loadout: similar assets could not be listed.', e));
  return box;
}
