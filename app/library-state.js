// The library page (#/browse, app/library-page.js) and its cards (app/cards.js): the parts that are plain data in,
// plain data out. Nothing here touches the page, so Node tests it (tests/unit/library-state.test.mjs).
//
//   the address     extrasFromQuery, libraryHash     (the Kits tab and the sort, beside the search and filters of app/browse.js)
//   results         SORTS, sortRows, kitsMatching, tabCounts
//   list rows       rowFacts, lengthWords, rowCrop
//   cards           tileScale, dotColour, versionSettings, versionInBag
//   remembered      createLayoutMemory (grid or list, per visitor)
import { queryFromState } from './browse.js';

// ---- the address ------------------------------------------------------------------------------

/** The ways to order results. "featured" is the library's own order, or the search's when words are typed. */
export const SORTS = [
  { id: 'featured', label: 'Featured', typed: 'Best match' },
  { id: 'name', label: 'Name, A to Z' },
  { id: 'controls', label: 'Most controls' },
  { id: 'length', label: 'Longest first' },
];
const SORT_IDS = SORTS.map((s) => s.id);

/** What the address says beside the search and filters: { kits (the Kits tab), sort }. `query`: the text after "?", or its parsed form. */
export function extrasFromQuery(query) {
  const get = typeof query === 'string' ? ((p) => new URLSearchParams(query).get(p)) : ((p) => (query ? query[p] : null));
  const sort = get('sort');
  return { kits: get('kind') === 'kits', sort: SORT_IDS.includes(sort) ? sort : 'featured' };
}

/** The library's address for a search, its filters, the tab and the sort. With nothing new chosen it is the address the site always had. */
export function libraryHash(state, { kits = false, sort = 'featured' } = {}) {
  const out = new URLSearchParams(queryFromState(kits ? { ...state, kind: null } : state));
  if (kits) {
    // "kind" keeps its usual place, after the search
    const rest = [...out.entries()].filter(([k]) => k !== 'q');
    for (const [k] of rest) out.delete(k);
    out.set('kind', 'kits');
    for (const [k, v] of rest) out.set(k, v);
  }
  if (sort && sort !== 'featured' && SORT_IDS.includes(sort)) out.set('sort', sort);
  const text = out.toString();
  return text ? `#/browse?${text}` : '#/browse';
}

// ---- results ----------------------------------------------------------------------------------

// Featured: what a game is built around first (who plays, who they meet, the world), sounds and music after the pictures.
const TYPE_ORDER = ['character', 'creature', 'prop', 'pickup', 'tileset', 'projectile', 'effect', 'background', 'ui', 'icon', 'sfx', 'jingle', 'ambience', 'music'];
const typeRank = (r) => { const i = TYPE_ORDER.indexOf(r.type); return i < 0 ? TYPE_ORDER.length : i; };
const byName = (a, b) => String(a.name).localeCompare(String(b.name));
const controls = (r) => r.tech?.controls ?? 0;
const seconds = (r) => (Number.isFinite(r.tech?.seconds) ? r.tech.seconds : -1);

/**
 * Catalogue rows in the chosen order (a new list). `typed`: words are being searched, so "featured" keeps the
 * order the search gave (best match first).
 */
export function sortRows(rows, sort = 'featured', { typed = false } = {}) {
  const list = [...rows];
  if (sort === 'name') return list.sort(byName);
  if (sort === 'controls') return list.sort((a, b) => controls(b) - controls(a) || byName(a, b));
  if (sort === 'length') return list.sort((a, b) => seconds(b) - seconds(a) || byName(a, b));
  if (typed) return list;
  return list.sort((a, b) => typeRank(a) - typeRank(b) || controls(b) - controls(a) || byName(a, b));
}

/** The kits whose name or line holds every word typed (all of them when nothing is typed). */
export function kitsMatching(bundles, q) {
  const words = String(q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return bundles.filter((b) => { const hay = `${b.name ?? ''} ${b.blurb ?? ''}`.toLowerCase(); return words.every((w) => hay.includes(w)); });
}

/** The number on each kind tab, from the search's own counts (a kind's number does not shrink because that kind is chosen). */
export function tabCounts(counts, kits) {
  const k = (counts && counts.kind) || {};
  const n = { sprite: k.sprite ?? 0, sound: k.sound ?? 0, music: k.music ?? 0 };
  return { all: n.sprite + n.sound + n.music, ...n, kits };
}

// ---- list rows ----------------------------------------------------------------------------------

/** A length for people: "0.4 s", "12 s", and "…, loops" for something that goes round. */
export function lengthWords(s, loop = false) {
  if (!Number.isFinite(s)) return '';
  const text = s < 10 ? `${Number(s.toFixed(2))} s` : `${Math.round(s)} s`;
  return loop ? `${text}, loops` : text;
}

/** The extra facts a list row shows, as text ('' where the asset has none): animations (a sprite), controls, length (a sound, a track). */
export function rowFacts(row) {
  const t = row.tech ?? {};
  return {
    animations: row.kind === 'sprite' && Array.isArray(t.clips) ? String(t.clips.length) : '',
    controls: t.controls != null ? String(t.controls) : '',
    length: row.kind === 'sprite' ? '' : lengthWords(t.seconds),
  };
}

/**
 * A sprite bigger than a list row's 64px tile is shown at its real size as a close-up around where it stands,
 * never shrunk: { x, y } is where its picture's corner goes. null when it fits.
 */
export function rowCrop(row, box = 64) {
  const [w, h] = row.tech?.frame ?? [box, box];
  if (w <= box && h <= box) return null;
  const [px, py] = row.tech?.pivot ?? [w / 2, h / 2];
  const x = Math.max(box - w, Math.min(0, box / 2 - px));
  const y = Math.max(box - h, Math.min(0, (row.tech?.grounded ? box - 4 : box / 2) - py));
  return { x: Math.round(x), y: Math.round(y) };
}

// ---- cards --------------------------------------------------------------------------------------

/**
 * How many times bigger a pixel picture is shown on a tile with `room` pixels for it: a whole number up to 3, or a
 * whole-number fraction (1/2, 1/3) when even its real size does not fit. Never anything in between, so it stays sharp.
 */
export function tileScale(fw, fh, room = 136) {
  const m = Math.max(fw, fh);
  if (m <= room) return Math.max(1, Math.min(3, Math.floor(room / m)));
  const most = room * 1.3;          // a little over is fine: the tile has a margin
  return m <= most ? 1 : 1 / Math.ceil(m / most);
}

const HEX = /^#[0-9a-f]{6}$/i;
const QUIET_DOTS = ['#8f97a8', '#c9b79a', '#5d6475'];
/** The colour of a version's dot: the first colour the version sets, or one of three quiet ones (by its place) when it sets none. */
export function dotColour(version, i = 0) {
  for (const v of Object.values((version && version.params) || {})) if (typeof v === 'string' && HEX.test(v)) return v.toLowerCase();
  return QUIET_DOTS[((i % 3) + 3) % 3];
}

/** What a ready-made version puts in the bag (app/versions.js): a sprite's controls, a sound's style and controls. */
export function versionSettings(kind, version) {
  const params = { ...((version && version.params) || {}) };
  return kind === 'sprite' ? { params } : { params, style: (version && version.style) || null };
}

const sameParams = (a = {}, b = {}) => {
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
};
/** Is this version of the asset in the bag as it was added from a card? `items`: bag.items(). */
export function versionInBag(items, kind, id, version) {
  const want = versionSettings(kind, version);
  return items.some((it) => it.kind === kind && it.id === id && sameParams(it.settings?.params, want.params)
    && (kind === 'sprite' || (it.settings?.style ?? null) === want.style));
}

// ---- remembered: grid or list -------------------------------------------------------------------

export const LAYOUT_KEY = 'loadout-library-layout';
export const LAYOUTS = ['grid', 'list'];

/** Remembers the visitor's grid or list in `storage` (anything with getItem / setItem). Blocked storage: kept for this visit. */
export function createLayoutMemory(storage) {
  let layout = 'grid';
  try { const v = storage.getItem(LAYOUT_KEY); if (LAYOUTS.includes(v)) layout = v; } catch { /* nothing remembered */ }
  return {
    get: () => layout,
    set(v) { if (!LAYOUTS.includes(v)) return; layout = v; try { storage.setItem(LAYOUT_KEY, v); } catch { /* this visit only */ } },
  };
}
