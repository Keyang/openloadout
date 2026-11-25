// The bag (architecture.md, Contract 6): the assets a visitor has collected,
// each with its own settings, plus one theme (Contract 7) applied to all of
// them on export. Kept in the browser's storage; the whole bag also travels
// in one link. No DOM here: createBag runs in Node for the unit tests.
//
// An asset made on a visit (window.loadout.make, Contract 11) is not in the catalogue, so its bag item carries
// its whole definition: { data } (a sprite's loadout-sprite definition, version 2: kept like a studio sprite's, below)
// or { patch } (a sound or a track). That is what brings it back after a reload, and what a shared link has to hold.
// A sprite made with make.sprite is told apart by its `made` token (madeToken: a short hash of the make call that gave
// the definition the item holds; build item B11b). Its items share its id only with items of that token that hold the
// very same definition; make.sprite changes only the items of its token (app/api-core.js). Two different definitions
// never share an id in one bag: the one that comes second gets a free id, and a numbered made item loses its token.
// Catalogue items have no definition. An item kept from before sprites were data holds { source } (module text): it is
// kept as it is, never run, and shown as made with an older version of Loadout (app/api.js; build item B11, DQ2).
//
// looks (Contract 7, "The record"): while the bag's look changes shapes, each sprite item keeps what that look made
// of it (`settings.lookParams`, from shapeRecord), so the bag draws and downloads the same pictures on every visit,
// also after the rule behind "Also change shapes" changes. It is made when the item comes in or the shapes part of the
// look changes (another number behind "Surprise me", shapes on or off), and kept when only colours change.
//
// Studio sprites (docs/studio.md 2.3, 5 journey d, 6; Contract 14 rules 6, 7, 9; studio item S8): a sprite made in the
// studio is data, so its item is { kind: 'sprite', id, settings, definition: { data } } and it is drawn by framework
// code (engine/data-sprite.js dataSprite), with no worker and without the quality bar. The data is checked by
// validateDataSprite (never strict) when it goes in (add, updateDefinition, a link); that checker is large, so it is
// loaded on demand (loadStudioCheck) and, until it has arrived, and for what is read back from storage, only the
// plain-data wall applies here: the site checks the whole definition again before it draws or exports it (app/catalog.js
// addStudioSprite, app/bundle.js). The item's id is its definition's id, never one another item or a library asset
// holds. Such an item follows later edits of its studio draft (Keyang's Q1): window.loadout.studio calls
// updateDefinition(key, { data }) when the draft is saved; `draft` names the draft, and keepCopy(key) keeps a frozen copy
// that follows nothing. In a link it is the entry { d: data }, and a link that holds one is deflated (app/deflate.js),
// unless it holds more than MAX_LINK_STUDIO; a link carries at most MAX_LINK_ITEMS items (see there).
import { defaultTheme, normalizeTheme, shapeRecord, THEME_PRESETS } from '../engine/theme.js';
import { spriteNow, takenFor, loadCatalog, addStudioSprite, removeStudioSprite } from './catalog.js';
import { deflateRaw, deflateRawAsync, inflateRaw } from './deflate.js';
import { plainData } from '../catalog/plain-data.js';      // the plain-data wall of Contract 14 rule 6 (studio-schema's, without the rigs)

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
/**
 * The most studio sprites one deflated link carries. Copies of one definition deflate to almost nothing, so without this a
 * short link could bring hundreds of sprites into a bag and the site's storage; a deflated link with more is not opened
 * (peekLink null). A bag with more writes its link plainly (toLink), as long as what it holds, so it still opens.
 */
export const MAX_LINK_STUDIO = 16;
/**
 * The most items one link carries, deflated or plain (the library holds about 360 assets). A short deflated link can
 * hold hundreds of thousands of copies of one item, which would fill the browser's storage and freeze the bag page, so a
 * link with more is not opened (peekLink null), and linkProblem says a bag that big makes no link.
 */
export const MAX_LINK_ITEMS = 1000;

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

// ---- studio sprites: data (see the top) ----------------------------------------------------------------------

/** The most a studio definition may be as JSON text, in UTF-8 bytes (catalog/studio-schema.js STUDIO_LIMITS.jsonBytes). */
export const STUDIO_JSON_BYTES = 64 * 1024;
/** The most a version 2 definition may be as JSON text (catalog/sprite-schema.js SPRITE_LIMITS.jsonBytes): a sprite made on a visit (B11). */
export const DATA_JSON_BYTES = 128 * 1024;
/** The most bytes a deflated link may inflate to: MAX_LINK_STUDIO data sprites at their largest, and room for the rest. */
export const LINK_INFLATE = MAX_LINK_STUDIO * DATA_JSON_BYTES + 512 * 1024;
const STUDIO_FORMAT = 'loadout-sprite';
const SPRITE_ID = /^[a-z][a-z0-9-]{0,39}$/;
const DRAFT_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MADE_TOKEN = /^[a-z0-9]{6,16}$/;      // what madeToken writes (and nothing a link could make more of)
/** Is v a made token (madeToken)? */
const isToken = (v) => typeof v === 'string' && MADE_TOKEN.test(v);

/**
 * The `made` token of a make.sprite call (B11b): a short hash (53-bit cyrb53, base 36, 11 characters) of the JSON text of
 * the definition the call made. The same definition gives the same token. It is identity, not a secret: whoever holds
 * the definition can write it. Arguments: data (the cleaned definition).
 */
export function madeToken(data) {
  const text = JSON.stringify(data) ?? '';
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36).padStart(11, '0');
}

let studioCheck = null, studioLoading = null;
/**
 * Loads the bag's checker of data sprites and resolves to it: engine/data-sprite.js validateDataSprite for version 1 (the
 * studio's), catalog/sprite-schema.js validateSprite for version 2 (a sprite made on a visit, B11; pieces checked for their
 * form only, app/catalog.js loads them before drawing). Safe to call again.
 */
export function loadStudioCheck() {
  studioLoading ??= Promise.all([import('../engine/data-sprite.js'), import('../catalog/sprite-schema.js')]).then(([m, v2]) => { studioCheck = (d) => (d.version === 2 ? v2.validateSprite(d) : m.validateDataSprite(d)); return studioCheck; }, (e) => { studioLoading = null; throw e; });
  return studioLoading;
}
/** Has the studio checker arrived? Until then the bag keeps studio data behind the plain-data wall only. */
export const studioCheckLoaded = () => !!studioCheck;

/**
 * A studio definition as the bag keeps it: { ok, value } or { ok: false, error }. The plain-data wall (JSON only, at most
 * 64 KB, format loadout-sprite, a sprite id), then, when `full` and the checker has arrived, validateDataSprite (never strict).
 */
function checkStudio(data, full) {
  // (version 2, a sprite made on a visit: the wall of catalog/sprite-schema.js, 128 KB and 20 levels)
  const most = isObj(data) && data.version === 2 ? DATA_JSON_BYTES : STUDIO_JSON_BYTES;
  const wall = isObj(data) ? plainData(data, most === DATA_JSON_BYTES ? { jsonBytes: DATA_JSON_BYTES, nesting: 20, nodes: 80_000 } : undefined) : null;
  const copy = wall && !wall.errors.length ? wall.value : undefined;
  if (!isObj(copy)) return { ok: false, error: wall?.errors[0] ? `it is not plain studio data (${wall.errors[0]})` : 'it is not plain studio data (a JSON object)' };
  if (new TextEncoder().encode(JSON.stringify(copy)).length > most) return { ok: false, error: `it is over ${most / 1024} KB of JSON` };
  if (copy.format !== STUDIO_FORMAT) return { ok: false, error: `its format is not "${STUDIO_FORMAT}"` };
  if (typeof copy.id !== 'string' || !SPRITE_ID.test(copy.id)) return { ok: false, error: 'its id is not lowercase letters, digits and dashes' };
  if (!full || !studioCheck) return { ok: true, value: copy };
  let v;
  try { v = studioCheck(copy); } catch (e) { return { ok: false, error: `it could not be checked (${e?.message ?? e})` }; }
  return v && v.ok ? { ok: true, value: v.value } : { ok: false, error: (v?.errors ?? [])[0] ?? 'it does not pass the studio checks' };
}

/**
 * The definition of an asset made on a visit, as plain data: sprite { source } or, made in the studio, { data };
 * sound and music { patch }. null for anything else. A studio definition is checked as checkStudio says; opts.full: false
 * keeps it to the plain-data wall (what is read back from storage: the site checks it all before drawing it).
 */
export function cleanDefinition(kind, definition, { full = true } = {}) {
  if (!isObj(definition)) return null;
  if (kind === 'sprite' && definition.data !== undefined) { const c = checkStudio(definition.data, full); return c.ok ? { data: c.value } : null; }
  if (kind === 'sprite') return typeof definition.source === 'string' && definition.source.trim() && definition.source.length <= MAX_SOURCE ? { source: definition.source } : null;
  if (!isObj(definition.patch)) return null;
  try { return { patch: clone(definition.patch) }; } catch { return null; }
}

/** Is this raw item a studio sprite (its definition is { data })? */
const studioRaw = (raw) => isObj(raw) && raw.kind === 'sprite' && isObj(raw.definition) && raw.definition.data !== undefined;

// full: check a studio definition with the checker when it has arrived (see cleanDefinition); false for storage
function cleanItem(raw, full = false) {
  if (!isObj(raw) || !KINDS.includes(raw.kind) || typeof raw.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(raw.id)) return null;
  const item = { kind: raw.kind, id: raw.id, settings: cleanSettings(raw.kind, raw.settings) };
  const definition = cleanDefinition(raw.kind, raw.definition, { full });
  // a studio sprite whose data does not pass is left out: it never turns into a library item of the same id
  if (studioRaw(raw) && !definition) return null;
  if (definition) item.definition = definition;
  // a studio sprite: its id is its definition's; it follows its draft (`draft`), or is a copy that follows nothing (`frozen`)
  if (definition?.data) {
    item.id = definition.data.id;
    if (raw.frozen === true) item.frozen = true;
    else if (typeof raw.draft === 'string' && DRAFT_ID.test(raw.draft)) item.draft = raw.draft;
    // made with window.loadout.make.sprite (B11b): the token of the make call (a claim: the bag checks it, see freeId)
    else if (isToken(raw.made)) item.made = raw.made;
  }
  // where a made item came from, kept so the bag page can say whom to ask when it turns out broken
  if (definition && raw.from === 'link') item.from = 'link';
  return item;
}

// ---- links: base64url of compact JSON ---------------------------------------------
// A link that holds a studio sprite is 'z.' and the base64url of the JSON deflated (app/deflate.js).

const bytesToB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64ToBytes = (text) => {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const toB64 = (text) => bytesToB64(new TextEncoder().encode(text));
const fromB64 = (text) => new TextDecoder('utf-8', { fatal: true }).decode(b64ToBytes(text));
const DEFLATED = 'z.';
/** The JSON text a link's value holds: plain base64url, or 'z.' and deflated base64url. Throws when it is neither. */
const linkText = (p) => (p.startsWith(DEFLATED) ? new TextDecoder('utf-8', { fatal: true }).decode(inflateRaw(b64ToBytes(p.slice(DEFLATED.length)), LINK_INFLATE)) : fromB64(p));
/** Is this link entry a studio sprite's (its fourth entry is { d: data })? */
const studioEntry = (r) => Array.isArray(r) && isObj(r[3]) && r[3].d !== undefined;
const LETTER = { sprite: 's', sound: 'a', music: 'm' };
const KIND_OF = { s: 'sprite', a: 'sound', m: 'music' };
const sameAs = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The `load=` value from a full address, a '#/bag?...' hash, or the value itself. */
function payloadOf(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const t = text.trim();
  const q = t.indexOf('?');
  if (q >= 0) return new URLSearchParams(t.slice(q + 1)).get('load');
  return /^(z\.)?[A-Za-z0-9_-]+$/.test(t) && !t.startsWith('#') ? t : null;
}

/**
 * A bag kept in `storage` (anything with getItem / setItem).
 * opts.now: the clock for addedAt (tests pass a fixed one).
 */
// opts.kept: false when `storage` lives only as long as the page (memory standing in for storage the browser refused).
// opts.spriteOf(id): a sprite's program if it is loaded, else null: the bag records what its look made of a sprite with it.
// opts.taken(id, data): true when an asset outside the bag (the library) holds that id against the definition `data`: a
// studio sprite then gets another (app/catalog.js takenFor: a sprite made on this visit as data does not hold its id against itself).
export function createBag(storage, { now = () => Date.now(), standard = null, kept = true, spriteOf = null, taken = null } = {}) {
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

  /**
   * An id for a studio sprite that no other bag item (but the one with selfKey) and no library asset holds: wanted, or
   * its current id when that is wanted with a number (exactly as numbered() writes it), or wanted-2, wanted-3 ...
   */
  // data: the definition the id is for (taken(id, data): an asset made on this visit as data holds its id only against
  // other definitions, so its own bag items keep it). made: the item's `made` token, or null: an item of a made sprite
  // shares its id with the other items of that make (as items of a library asset do), never with any other item. The
  // token is only a claim (it comes from storage and links too), so an item shares the id only with items of the same
  // token that hold this very definition (sameMade). upTo: look only at the items before this index (settleIds: of the
  // items holding one id, the first keeps it and a later one with another definition is renumbered).
  function freeId(wanted, selfKey = null, current = null, data = undefined, made = null, upTo = null) {
    const pool = upTo === null ? state.items : state.items.slice(0, upTo);
    const used = (id) => pool.some((x) => x.key !== selfKey && x.id === id && !(made && sameMade(x, data, id, made))) || (() => { try { return !!(taken && taken(id, data)); } catch { return false; } })();
    if (!used(wanted)) return wanted;
    const m = typeof current === 'string' ? /-(\d+)$/.exec(current) : null;
    if (m && Number(m[1]) >= 2 && current === numbered(wanted, Number(m[1])) && !used(current)) return current;
    for (let n = 2; ; n++) {
      const id = numbered(wanted, n);
      if (!used(id)) return id;
    }
  }
  /** Is bag item x an item of the make `made` whose definition is `data`, under the id `id` (its token is made, its definition, id aside, is data)? */
  const sameMade = (x, data, id, made) => {
    if (!made || x.made !== made || !isObj(x.definition?.data) || !isObj(data)) return false;
    const d = { ...data };
    d.id = id;      // (the key keeps its place, so the same definition writes the same JSON)
    return sameAs(x.definition.data, d);
  };
  /** wanted with the number n, cut to fit 40 characters: wanted-n. */
  const numbered = (wanted, n) => `${wanted.slice(0, 40 - `-${n}`.length).replace(/-+$/, '')}-${n}`;

  function put(raw, addedAt) {
    const it = cleanItem(raw, true);
    if (!it && studioRaw(raw)) throw new Error(`a studio sprite goes in the bag only when it passes the studio checks, and this one does not: ${checkStudio(raw.definition.data, true).error}`);
    if (!it) throw new Error(`the bag holds sprites, sounds and music; got ${JSON.stringify(raw && { kind: raw.kind, id: raw.id })}`);
    // an asset made on this visit goes in with its definition, whoever adds it (a card, its page, a copy of a bag row);
    // a sprite's is data, and the item carries the token of the make call (`made`), as does one handed in with that very
    // definition
    let visit = null;
    try { visit = definitionOf && it.kind === 'sprite' ? definitionOf(it.kind, it.id) : null; } catch { visit = null; }
    if (!it.definition && definitionOf) {
      let d = null;
      try { d = cleanDefinition(it.kind, definitionOf(it.kind, it.id)); } catch { d = null; }
      if (d) { it.definition = d; if (d.data && isToken(visit?.made)) it.made = visit.made; }
    } else if (it.definition?.data && !it.made && !it.frozen && !it.draft) {
      // (or, after a reload, the very definition an item of that make holds: it takes that item's token)
      if (isToken(visit?.made) && sameAs(cleanDefinition('sprite', { data: visit.data })?.data, it.definition.data)) it.made = visit.made;
      else { const x = state.items.find((y) => y.made && y.id === it.id && sameAs(y.definition?.data, it.definition.data)); if (x) it.made = x.made; }
    }
    if (it.definition?.data) {      // studio: an id of its own
      const wanted = it.id;
      it.id = freeId(it.id, null, null, it.definition.data, it.made ?? null);
      it.definition.data.id = it.id;
      // a made sprite's item that cannot share the id (another definition holds it) is a sprite of its own, numbered as a studio sprite is
      if (it.made && it.id !== wanted) delete it.made;
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

  /** What a link holds, as the JSON it is made of: the items with their definitions, and the bag's theme. */
  function linkData() {
    const def = (it) => (it.definition.data ? { d: it.definition.data, ...(it.made ? { m: it.made } : {}) } : it.kind === 'sprite' ? { s: it.definition.source } : { p: it.definition.patch });
    const data = { v: 1, i: state.items.map((it) => (it.definition ? [LETTER[it.kind], it.id, compact(it), def(it)] : [LETTER[it.kind], it.id, compact(it)])) };
    if (!sameAs(state.theme, defaultTheme())) data.t = state.theme;
    return data;
  }
  // deflated: a bag that holds a studio sprite, and no more than a deflated link carries (a bigger one is written plainly)
  const deflates = () => { const n = state.items.filter((i) => i.definition?.data).length; return n > 0 && n <= MAX_LINK_STUDIO; };
  /** Load the studio checker first when a link holds a studio sprite (a checker that cannot load leaves the plain-data wall). */
  async function checkerFor(text) {
    const data = decodeLink(text);
    if (data && data.i.some(studioEntry)) await loadStudioCheck().catch(() => {});
  }

  /** The JSON a link holds (plain or deflated), or null when it is not a bag link. */
  function decodeLink(text) {
    let data, deflated = false;
    try {
      const p = payloadOf(text);
      if (!p) return null;
      deflated = p.startsWith(DEFLATED);
      data = JSON.parse(linkText(p));
    } catch { return null; }
    // a link carries at most MAX_LINK_ITEMS items; a deflated one holds a studio sprite (the site deflates no other) and
    // at most MAX_LINK_STUDIO of them (see there). Any other is not a bag link this site opens.
    if (!isObj(data) || !Array.isArray(data.i) || data.i.length > MAX_LINK_ITEMS) return null;
    const studio = data.i.filter(studioEntry).length;
    return deflated && (!studio || studio > MAX_LINK_STUDIO) ? null : data;
  }
  /** The items and theme a link holds, or null when it is not a bag link. */
  function parseLink(text) {
    const data = decodeLink(text);
    if (!data) return null;
    // a fourth entry is the definition of an asset made on a visit: { s: source } or { p: patch }, or made in the
    // studio: { d: data }, which is checked again here (with the checker when it has arrived: fromLinkAsync waits for it);
    // { d: data, m: token } is a sprite made with make.sprite (`made`)
    const list = data.i.map((r) => (Array.isArray(r) ? cleanItem({ kind: KIND_OF[r[0]], id: r[1], settings: r[2], definition: isObj(r[3]) ? (r[3].d !== undefined ? { data: r[3].d } : { source: r[3].s, patch: r[3].p }) : null, made: isObj(r[3]) ? r[3].m : undefined }, true) : null)).filter(Boolean);
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
    /** A copy of an item, put right after it (the Duplicate button). Returns the copy's key, or null when the key is not in the bag. */
    duplicate(key) {
      const i = state.items.findIndex((x) => x.key === key);
      if (i < 0) return null;
      const it = state.items[i];
      const k = put({ kind: it.kind, id: it.id, settings: clone(it.settings), definition: it.definition ? clone(it.definition) : undefined }, now());
      state.items.splice(i + 1, 0, state.items.pop());
      changed();
      return k;
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
    // made: how many of them were made on a visit and come with their definition; old: how many of those are sprites kept
    // as source text from before sprites were data (B11), which never run and are shown as made with an older version.
    // Both are left out when there are none. Nothing in a link is a program any more, so nothing asks to run.
    peekLink(text) {
      const got = parseLink(text);
      if (!got) return null;
      const made = got.list.filter((i) => i.definition).length;
      // studio: how many are studio sprites, which are data (nothing of them runs); left out when there are none
      const studio = got.list.filter((i) => i.definition?.data).length;
      const old = got.list.filter((i) => i.definition && i.kind === 'sprite' && !i.definition.data).length;
      return made ? { count: got.list.length, made, ...(old ? { old } : {}), ...(studio ? { studio } : {}) } : { count: got.list.length };
    },
    /** peekLink, once the studio checker has arrived when the link holds a studio sprite (so it counts only what passes). */
    async peekLinkAsync(text) { await checkerFor(text); return api.peekLink(text); },
    /** fromLink, once the studio checker has arrived when the link holds a studio sprite: each one is checked whole on the way in. */
    async fromLinkAsync(text, opts) { await checkerFor(text); return api.fromLink(text, opts); },
    /**
     * Tell the bag each asset's standard settings, so links can leave them out:
     * fn(kind, id, settings) -> { params, cues?, artStyle? (a sprite's first art style) } or null when unknown.
     */
    setStandard(fn) { standardOf = typeof fn === 'function' ? fn : null; },
    /**
     * Tell the bag where the definitions of assets made on this visit are, so every add() stores one:
     * fn(kind, id) -> { data, made } (a sprite and its make call's token) | { patch }, or null for a catalogue asset.
     */
    setDefinitions(fn) { definitionOf = typeof fn === 'function' ? fn : null; },
    /** An asset made on this visit was made again: give every bag item of it the new definition. Returns how many changed. */
    redefine(id, definition) {
      let n = 0;
      for (const it of state.items) {
        if (it.id !== id || it.definition?.data) continue;      // a studio sprite follows its draft instead (updateDefinition)
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

    /**
     * The whole bag as an address hash: '#/bag?load=...'. A bag that holds a studio sprite (at most MAX_LINK_STUDIO) makes
     * a deflated link ('load=z....', written here by the plain-JS writer; toLinkAsync uses the browser's CompressionStream).
     */
    toLink() {
      const text = JSON.stringify(linkData());
      return '#/bag?load=' + (deflates() ? DEFLATED + bytesToB64(deflateRaw(new TextEncoder().encode(text))) : toB64(text));
    },
    /** toLink, deflated with the browser's CompressionStream when the bag holds a studio sprite (the same link as toLink otherwise). */
    async toLinkAsync() {
      if (!deflates()) return api.toLink();
      return '#/bag?load=' + DEFLATED + bytesToB64(await deflateRawAsync(new TextEncoder().encode(JSON.stringify(linkData()))));
    },

    // ---- studio sprites (see the top) ----
    /** How many items are studio sprites (their definition is { data }). */
    studioCount: () => state.items.filter((i) => i.definition?.data).length,
    /**
     * A studio sprite's draft was saved: give its item the new definition (checked first), keeping its key and settings.
     * Returns false when the key is not in the bag or is not a studio sprite that follows its draft (a frozen copy);
     * throws when the definition does not pass the studio checks (the item is then unchanged). Arguments: key, definition
     * ({ data }, or { data, made } from make.sprite: the new call's token, taken only by an item of a made sprite).
     */
    updateDefinition(key, definition) {
      const it = state.items.find((i) => i.key === key);
      if (!it || it.kind !== 'sprite' || !it.definition?.data || it.frozen) return false;
      const c = checkStudio(isObj(definition) ? definition.data : undefined, true);
      if (!c.ok) throw new Error(`a studio sprite goes in the bag only when it passes the studio checks, and this one does not: ${c.error}`);
      const data = c.value;
      const made = it.made ? (isToken(definition.made) ? definition.made : it.made) : null;      // a studio sprite never takes a token
      // a made sprite was made again (app/api-core.js make.sprite): every item of that make under that id takes the new
      // version and token at once, so none is renumbered for holding the old one meanwhile
      if (it.made && data.id === it.id) {
        const group = state.items.filter((x) => x.made === it.made && x.id === it.id);
        let held = false;
        try { held = !!(taken && taken(it.id, data)); } catch { held = false; }
        if (!held && !state.items.some((x) => x.id === it.id && !group.includes(x))) {
          let n = 0;
          for (const x of group) {
            if (sameAs(x.definition.data, data) && x.made === made) continue;
            if (!sameAs(x.definition.data, data)) delete x.settings.lookParams;      // looks: recorded again once the new program is loaded (fillLooks)
            x.definition = { data: clone(data) };
            x.made = made;
            n++;
          }
          if (n) changed();
          return true;
        }
      }
      data.id = freeId(data.id, it.key, it.id, data, made);
      if (it.made && data.id !== it.id) delete it.made;      // under another id it is a sprite of its own
      else if (it.made && made !== it.made) { it.made = made; if (sameAs(it.definition.data, data)) { changed(); return true; } }
      if (it.id === data.id && sameAs(it.definition.data, data)) return true;
      it.id = data.id;
      it.definition = { data };
      delete it.settings.lookParams;      // looks: recorded again once the new program is loaded (fillLooks)
      changed();
      return true;
    },
    /**
     * Give every studio sprite an id no library asset and no other item holds (taken() may only know the library once
     * the catalogue has loaded: one that came in before then may hold a library id). Of the items holding one id, the
     * first keeps it and each later one with another definition gets a free id. Returns how many were renamed.
     */
    settleIds() {
      let n = 0;
      for (const [i, it] of state.items.entries()) {
        if (!it.definition?.data) continue;
        // (an item yields only to the items before it, so the second of two definitions is the one numbered)
        const id = freeId(it.id, it.key, null, it.definition.data, it.made ?? null, i);
        if (id === it.id) continue;
        delete it.made;      // renumbered: another definition holds the id, so this is a sprite of its own
        it.id = id;
        it.definition.data.id = id;
        delete it.settings.lookParams;      // looks: recorded again under the new id (fillLooks)
        n++;
      }
      if (n) changed();
      return n;
    },
    /** Keep a frozen copy of a studio sprite beside it: a new item, with an id of its own, that follows no draft. Returns its key, or null. */
    keepCopy(key) {
      const it = state.items.find((i) => i.key === key);
      if (!it || !it.definition?.data) return null;
      const { key: _k, addedAt: _a, draft: _d, ...rest } = clone(it);
      const k = put({ ...rest, frozen: true }, now());
      changed();
      return k;
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

/**
 * Keep the site's studio sprites (app/catalog.js addStudioSprite) the ones a bag holds, now and after every change: each
 * one is checked whole and registered, a changed one again, one taken out is forgotten. Returns a function that stops it.
 * Arguments: b (a bag from createBag).
 */
export function followStudio(b) {
  const shown = new Map();        // id -> the JSON of the definition registered under it
  const sync = () => {
    // visit: id -> true for a sprite made with window.loadout on an earlier visit here, 'link' when every item of it came
    // in a bag link (whoever shared the link made it). Of items holding one id (before the bag has settled them) the first
    // is the one registered: it is the one that keeps the id (settleIds), so what is drawn is what is downloaded.
    const want = new Map(), visit = new Map();
    for (const it of b.items()) {
      if (it.kind !== 'sprite' || !it.definition?.data) continue;
      const text = JSON.stringify(it.definition.data);
      if (want.has(it.id) && want.get(it.id) !== text) continue;
      want.set(it.id, text);
      if (it.made) visit.set(it.id, it.from === 'link' && visit.get(it.id) !== true ? 'link' : true);
    }
    for (const [id, text] of want) {
      const was = `${visit.get(id) ?? false} ${text}`;
      if (shown.get(id) === was) continue;
      shown.set(id, was);
      // (a sprite made on an earlier visit is registered the same way; its page says where it came from)
      // (one whose id a sprite made on this visit holds is `held`: the bag gives it a free id next, settleStudioIds)
      addStudioSprite(JSON.parse(text), { visit: visit.get(id) ?? false }).then((r) => { if (!r.ok && !r.held) console.warn(`Loadout: the studio sprite "${id}" in the bag cannot be drawn: ${r.errors[0]}`); });
    }
    for (const id of [...shown.keys()]) if (!want.has(id)) { shown.delete(id); removeStudioSprite(id); }
    if (want.size && !studioCheck) loadStudioCheck().catch(() => {});
  };
  sync();
  return b.onChange(sync);
}

/**
 * Words for why a bag makes no link, or null when its link is fine: over LINK_LIMIT characters, or more items than a link
 * carries (MAX_LINK_ITEMS). They say what travels in the link: a studio sprite's definition (data), or the
 * source of something made on a visit. Arguments: b (a bag), link (its link, or the link's length), opts.instead (the
 * last sentence, what to do instead; the bag page's Download when left out).
 */
export function linkProblem(b, link, { instead = null } = {}) {
  const length = typeof link === 'string' ? link.length : Number(link) || 0;
  const studio = b.studioCount(), made = b.madeCount() - studio;
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`;
  const then = instead ?? `Download the package instead: it holds everything, ${studio && made ? 'the studio sprites\' files and the sources too' : studio ? `${studio === 1 ? 'the studio sprite\'s file' : 'each studio sprite\'s file'} too` : made ? 'the source too' : 'every file'}.`;
  const count = b.count();
  if (count > MAX_LINK_ITEMS) return `This bag is too big for a link: it holds ${count.toLocaleString('en')} things, and a link carries at most ${MAX_LINK_ITEMS.toLocaleString('en')}, so no link was made. ${then}`;
  if (length <= LINK_LIMIT) return null;
  const parts = [studio ? `${n(studio, 'sprite', 'sprites')} made in the studio` : '', made ? `${n(made, 'thing', 'things')} made on a visit` : ''].filter(Boolean);
  const alone = studio + made === 1;
  const what = parts.length ? `it holds ${parts.join(' and ')}, which travel${alone ? 's' : ''} with ${alone ? 'its' : 'their'} whole ${studio && made ? 'definition and source' : studio ? 'definition' : 'source'}, and ` : '';
  return `This bag is too long for a link: ${what}the link would be ${length.toLocaleString('en')} characters long. Chat and mail apps cut links over ${LINK_LIMIT.toLocaleString('en')} characters short, so no link was made. ${then}`;
}

/**
 * Keep the ids of a bag's studio sprites clear of the library's: once ready() has resolved (the catalogue is in, so the
 * bag's taken() knows the library), and after every later change, settleIds. ready is called only when the bag holds a
 * studio sprite, and again after a failure. Returns a function that stops it. Arguments: b (a bag), ready (() => promise).
 */
export function settleStudioIds(b, ready) {
  let phase = 'waiting';      // 'waiting' -> 'asked' -> 'done'
  const go = () => {
    if (phase === 'done') { b.settleIds(); return; }
    if (phase !== 'waiting' || !b.studioCount()) return;
    phase = 'asked';
    let p;
    try { p = Promise.resolve(ready()); } catch (e) { p = Promise.reject(e); }
    p.then(() => { phase = 'done'; b.settleIds(); }, () => { phase = 'waiting'; });
  };
  const stop = b.onChange(go);
  go();
  return stop;
}

/** The site's one shared bag. */
const where = pickStorage(typeof window === 'undefined' ? undefined : window);
// a studio sprite never takes an id a library asset (or one made on a visit) holds: known once the catalogue is in, so
// one that came in before then (a link, an early add, storage) is given another id when it arrives (settleStudioIds)
export const bag = createBag(where.storage, { kept: where.kept, spriteOf: spriteNow, taken: takenFor });
if (typeof window !== 'undefined') { followStudio(bag); settleStudioIds(bag, () => loadCatalog()); }

// Another tab changed the bag: pick it up here too.
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === BAG_KEY) bag.reload(); });
