// Advanced editing on a sprite's page, the parts that are plain data (build item B18; docs/data-sprites.md section 6,
// "Advanced mode on a sprite page"; Contract 15 rule 7; DQ5: it edits a copy). app/sprite-advanced.js puts these on the
// page. Pure: no DOM, no storage, so it runs in Node too (tests/unit/sprite-advanced.test.mjs).
//   - which sprites get Advanced: a library sprite whose file is data (sprites/<id>.json); not one that is still code,
//     not a studio sprite, not one made on this visit;
//   - the visitor's sliders as the copy's defaults (a control's `default`, a colour slot's `default`);
//   - which studio draft is the copy to go on with (a version 2 sprite draft whose made.from is "library:<id>");
//   - the page's address while Advanced is open: #/sprite/<id>?<the page's settings>&edit=advanced&copy=<draft>&pane=<tab>
//     &aclip=<the editor's clip>. The page's own `clip` stays the page's.

/** The address word that opens Advanced (`edit=advanced`). */
export const ADVANCED = 'advanced';

/** The address keys Advanced adds to a sprite page's address, which leaving takes away again (aclip: the editor's clip, apart from the page's own clip). */
export const ADVANCED_KEYS = Object.freeze(['edit', 'copy', 'pane', 'aclip']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
const DRAFT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const clone = (v) => JSON.parse(JSON.stringify(v));

/** Whether a catalogue row is a library sprite whose file is data (sprites/<id>.json), the only kind Advanced opens. Arguments: row. */
export function libraryDataRow(row) {
  return isObj(row) && row.kind === 'sprite' && !row.studio && row.madeIn !== 'visit' && typeof row.src === 'string' && row.src.endsWith('.json');
}

/** Whether a page address's settings ask for Advanced (`edit=advanced`). Arguments: query (the address's settings as an object). */
export const isAdvancedQuery = (query) => isObj(query) && query.edit === ADVANCED;

/** A value that a control of the definition takes as its default, or undefined. */
function fitting(c, v) {
  const kind = c.kind ?? 'range';
  if (kind === 'range' || kind === 'slider') {
    const lo = Number.isFinite(c.min) ? c.min : 0, hi = Number.isFinite(c.max) ? c.max : 1;
    return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
  }
  if (kind === 'choice') {
    const values = (Array.isArray(c.options) ? c.options : []).map((o) => (isObj(o) ? o.value : o));
    return values.includes(v) ? v : undefined;
  }
  if (kind === 'toggle') return typeof v === 'boolean' ? v : undefined;
  return undefined;
}

/**
 * The definition with the visitor's settings as its defaults ("The visitor's sliders become the copy's defaults"):
 * { def (a new object; the one given is not changed), moved (the keys whose default changed) }. A slider, a choice and
 * an on/off take their value as `default`; a colour slot (a palette slot with its own colour) takes its colour. The
 * standard speed, unknown keys and values that do not fit are left out. With `check` (def -> { ok }), a set of defaults
 * the check refuses is tried one by one and only those it takes are kept. Arguments: def, params, { check }.
 */
export function withSliderDefaults(def, params, { check } = {}) {
  const base = clone(def);
  const wanted = [];
  if (isObj(params)) {
    (Array.isArray(base.controls) ? base.controls : []).forEach((c, i) => {
      if (!isObj(c) || c.standard !== undefined || typeof c.key !== 'string' || !Object.hasOwn(params, c.key)) return;
      const v = fitting(c, params[c.key]);
      if (v !== undefined && v !== c.default) wanted.push({ key: c.key, at: ['controls', i], value: v });
    });
    (Array.isArray(base.palette) ? base.palette : []).forEach((s, i) => {
      if (!isObj(s) || s.derive !== undefined || typeof s.id !== 'string' || !Object.hasOwn(params, s.id)) return;
      const v = params[s.id];
      if (typeof v === 'string' && HEX.test(v) && v.toLowerCase() !== String(s.default ?? '').toLowerCase()) wanted.push({ key: s.id, at: ['palette', i], value: v.toLowerCase() });
    });
  }
  const apply = (d, list) => { const out = clone(d); for (const w of list) out[w.at[0]][w.at[1]].default = w.value; return out; };
  const passes = (d) => { if (!check) return true; try { return !!check(d)?.ok; } catch { return false; } };
  const all = apply(base, wanted);
  if (!wanted.length || passes(all)) return { def: all, moved: wanted.map((w) => w.key) };
  let def2 = base;
  const moved = [];
  for (const w of wanted) {
    const next = apply(def2, [w]);
    if (passes(next)) { def2 = next; moved.push(w.key); }
  }
  return { def: def2, moved };
}

/** Whether a studio draft's definition is a version 2 sprite (the only kind the version 2 editor opens). Arguments: def. */
export const isV2Sprite = (def) => isObj(def) && def.format === 'loadout-sprite' && def.version === 2;

/**
 * The studio draft that is the copy of a library sprite to go on with: `wanted` (the address's copy) when it is a copy of
 * that sprite, else the newest such copy, else null. A copy is a version 2 sprite draft whose made.from is
 * "library:<id>": a version 1 draft never is (the old studio's Hero start says library:knight too). Arguments: list
 * (app/studio/drafts.js list(): newest first, each { id, definition }), id (the library sprite), wanted.
 */
export function findCopy(list, id, wanted) {
  const from = `library:${id}`;
  const copies = (Array.isArray(list) ? list : []).filter((d) => isObj(d) && typeof d.id === 'string' && isV2Sprite(d.definition) && isObj(d.definition.made) && d.definition.made.from === from);
  if (typeof wanted === 'string' && copies.some((d) => d.id === wanted)) return wanted;
  return copies.length ? copies[0].id : null;
}

/** The parts of a studio editor's address (#/studio/<draft>?mode=...&clip=...): { draft, mode, clip }, or null for any other address. Arguments: url. */
export function studioAddressParts(url) {
  const m = /^#\/studio\/([^/?]+)(?:\?(.*))?$/.exec(String(url ?? ''));
  if (!m) return null;
  let draft;
  try { draft = decodeURIComponent(m[1]); } catch { return null; }
  if (!DRAFT_ID.test(draft)) return null;
  const q = new URLSearchParams(m[2] ?? '');
  return { draft, mode: q.get('mode'), clip: q.get('clip') };
}

/**
 * A sprite page's address with Advanced open: the page's own settings (and its bag item, and its own clip) as `hash` has
 * them, and edit=advanced, copy=<draft>, pane=<tab> and aclip=<the editor's clip> when given. An address of another page
 * gives the sprite's path. Arguments: hash (the address now), { id (the sprite), copy (the draft), pane, clip (the editor's) }.
 */
export function advancedAddress(hash, { id, copy, pane, clip }) {
  const [path, qs = ''] = String(hash ?? '').split('?');
  const own = path === `#/sprite/${id}`;
  const q = new URLSearchParams(own ? qs : '');
  q.set('edit', ADVANCED);
  if (copy) q.set('copy', copy);
  if (pane) q.set('pane', pane);
  if (clip) q.set('aclip', clip);
  return `#/sprite/${id}?${q}`;
}

/** A sprite page's address with Advanced closed: the same address without edit, copy, pane and aclip. Arguments: hash. */
export function simpleAddress(hash) {
  const [path, qs = ''] = String(hash ?? '').split('?');
  const q = new URLSearchParams(qs);
  for (const k of ADVANCED_KEYS) q.delete(k);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
