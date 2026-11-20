// The one place the site reads the built catalogue (generated/catalog.json, Contract 4).
// Pages list and filter from the catalogue, and load an asset's own file only to draw or play it.
// There is no other list of assets: a file the build found is on the site, everywhere.
//
// Assets made on a visit (window.loadout.make, Contract 11) are handed over with addRuntimeAsset(row, definition).
// From then until the page is left they answer assetById, loadSprite and loadSound like catalogue assets, so the
// asset pages, the bag, the playground and the export need no code of their own for them. The built catalogue
// itself (currentCatalog()) is never changed; allAssets() is the catalogue's rows followed by theirs.
//
// Studio sprites in the bag (docs/studio.md section 6; Contract 14 rule 4; studio item S8) are handed over the same way,
// with the definition { data }: addStudioSprite(definition) checks it (engine/data-sprite.js, never strict), makes its
// row (`studio: true`, `madeIn: 'studio'`) and registers it, and loadSprite(id) gives dataSprite(data). It is data drawn
// by framework code, so it needs no worker. app/bag.js followStudio keeps them the ones the bag holds. The checker is
// large and loaded on demand, so a registration takes a moment: loadCatalog() and loadSprite() wait for the ones under way.
//
// A sprite made on a visit is data too (build item B11, docs/data-sprites.md section 5): app/api-core.js hands it over
// with addRuntimeAsset(row, { data, sprite }) and a row with `madeIn: 'visit'`. It is part of the library of this visit
// (allAssets), but its bag items are { data } like a studio sprite's and keep its id (libraryHas, takenFor), and while it
// is registered the bag's copies of it are drawn as it (addStudioSprite leaves it in place). A bag item of that id with
// another definition is never drawn as it: addStudioSprite does not register it (`held`), and the bag gives it a free id.
import { framesInClip } from '../engine/data-frames.js';

/** Makes a data sprite draw any frame number inside its clip (engine/data-frames.js); handed on for the bag and older callers. */
export { framesInClip };
export const CATALOG_URL = 'generated/catalog.json';

let catalog = null, loading = null;
const studioBusy = new Set();     // studio registrations under way (promises)
/** Resolves once no studio sprite is being registered (app/bag.js starts them when it loads and whenever the bag changes). */
export function studioSettled() {
  return studioBusy.size ? Promise.allSettled([...studioBusy]).then(() => studioSettled()) : Promise.resolve();
}
const sprites = new Map(), patches = new Map();      // the library's own files, loading or loaded, by id
const arrived = new Map();      // library sprite programs that have finished loading, by id
// assets made on this visit (and studio sprites): id -> { row, definition, program (a promise of the program or patch),
// now (the program, once it is there) }. Kept apart from the library's: once the catalogue holds an id, the id is the
// library's everywhere (assetById, loadSprite, spriteNow, loadSound), whatever was registered under it before.
const made = new Map();
/** The asset made on this visit that answers for id right now, or null (none, or the catalogue holds the id). */
const madeNow = (id) => { const m = made.get(id); return m && assetById(id) === m.row ? m : null; };
const watchers = new Set();

/**
 * Load the catalogue once. Resolves to { version, assets: [...], bundles: [...] }.
 * `url`: where the catalogue is (the usual place when left out). The first call decides; later calls,
 * whatever they pass, get the same catalogue.
 */
export function loadCatalog(url) {
  // (studio sprites the bag holds are known by the time it resolves: it waits for registrations under way)
  if (catalog) return studioSettled().then(() => catalog);
  if (!loading) {
    const from = url || CATALOG_URL;
    loading = fetch(from).then((r) => {
      if (!r.ok) throw new Error(`The catalogue is missing (${from}: ${r.status}). Run "npm run build" first.`);
      return r.json();
    }).then((c) => { catalog = c; return c; });
  }
  return loading.then((c) => studioSettled().then(() => c));
}

/** The loaded catalogue, or null before loadCatalog() has finished. */
export const currentCatalog = () => catalog;
/** An asset's row by id: the catalogue's, or that of an asset made on this visit. null when there is none. */
export const assetById = (id) => (catalog ? catalog.assets.find((a) => a.id === id) : null) ?? made.get(id)?.row ?? null;
/**
 * Every asset of the library right now: the catalogue's rows, then the ones made on this visit. A studio sprite the bag
 * holds (addStudioSprite) is left out: it is drawn by id (assetById) but is not part of the library, so code that checks
 * an id against the library (window.loadout.studio, the studio page) never finds a draft's own bag row (studioAssets()).
 */
export const allAssets = () => [...(catalog ? catalog.assets : []), ...runtimeAssets().filter((row) => !row.studio)];
/** The rows of the studio sprites the bag holds (addStudioSprite), in the order they came. */
export const studioAssets = () => runtimeAssets().filter((row) => row.studio);
/**
 * Does the library hold this id: the catalogue, or an asset made on this visit (not a studio sprite from the bag, and not a
 * sprite made on this visit as data, B11: that one's bag items are { data } like a studio sprite's and carry its id)?
 * False before the catalogue has loaded, for an id only it holds.
 */
export const libraryHas = (id) => { const row = assetById(id); return !!row && !row.studio && !(row.madeIn === 'visit' && isStudioData(made.get(id)?.definition)); };
/**
 * Does an asset outside the bag hold this id against the data sprite `data` (what the bag asks before a data item keeps an
 * id)? The library's ids, and a sprite made on this visit as data unless `data` is its own definition. Arguments: id, data.
 */
export const takenFor = (id, data) => {
  if (libraryHas(id)) return true;
  const m = madeNow(id);
  return !!m && m.row.madeIn === 'visit' && isStudioData(m.definition) && JSON.stringify(m.definition.data) !== JSON.stringify(data);
};
export const bundleById = (id) => (catalog ? catalog.bundles.find((b) => b.id === id) ?? null : null);
export const assetsOfBundle = (bundle) => [...bundle.sprites, ...bundle.sounds, ...bundle.music].map(assetById).filter(Boolean);

// ---- how assets are tied together, from the catalogue alone -------------------------------------

/** The bundles an asset is in, as bundle rows. */
export const bundlesOf = (id) => (assetById(id)?.bundles ?? []).map(bundleById).filter(Boolean);
/** The sprites whose animations play this sound, as catalogue rows. */
export const spritesUsing = (soundId) => allAssets().filter((a) => a.kind === 'sprite' && (a.tech?.soundIds ?? []).includes(soundId));
/** The sounds a sprite's animations play, as catalogue rows (a sound that is not on the site is left out). */
export const soundsOf = (spriteId) => (assetById(spriteId)?.tech?.soundIds ?? []).map(assetById).filter((a) => a && a.kind !== 'sprite');

// ---- assets made on this visit -----------------------------------------------------------------

/** The rows of the assets made on this visit, in the order they were made. */
export const runtimeAssets = () => [...made.values()].map((m) => m.row).filter((row) => !(catalog && catalog.assets.some((a) => a.id === row.id)));

/**
 * Take in an asset made on this visit. row: its catalogue-shaped row ({ id, kind, name, ..., runtime: true });
 * definition: what its own file would hold, a sprite program (what defineSprite returned) or a sound patch; or, for a
 * sprite made in the studio, { data } (its studio definition, already checked; `sprite`: its dataSprite, when made).
 * The same id again replaces the earlier one. An id the catalogue uses is refused (it throws).
 */
export function addRuntimeAsset(row, definition) {
  if (!row || typeof row.id !== 'string' || !row.id) throw new Error('addRuntimeAsset: the row needs an id');
  if (!['sprite', 'sound', 'music'].includes(row.kind)) throw new Error(`addRuntimeAsset: "${row.id}" needs a kind: sprite, sound or music`);
  if (!definition || typeof definition !== 'object') throw new Error(`addRuntimeAsset: "${row.id}" needs its definition (a sprite program or a patch)`);
  if (catalog && catalog.assets.some((a) => a.id === row.id)) throw new Error(`"${row.id}" is already an asset in the catalogue`);
  forget(row.id);
  const data = row.kind === 'sprite' && isStudioData(definition);
  const entry = { row, definition: data ? { data: definition.data } : definition, program: null, now: null };
  // a studio sprite's own sprite, when handed over, draws any frame number too (framesInClip: frame -1 and `frames` of the sprite page's clock)
  if (data) { if (definition.sprite) { const sp = framesInClip(definition.sprite); entry.program = Promise.resolve(sp); entry.now = sp; } }      // else made by loadSprite
  else if (row.kind === 'sprite') { entry.program = Promise.resolve(definition); entry.now = definition; }
  else entry.program = Promise.resolve(definition);
  made.set(row.id, entry);
  tell({ added: row.id });
}

// ---- studio sprites (see the top) ----------------------------------------------------------------------------------

/** Is this definition a studio sprite's ({ data }) rather than a sprite program? */
const isStudioData = (d) => !!d && typeof d === 'object' && d.data !== undefined && typeof d.render !== 'function';
const studioTurn = new Map();     // id -> the number of its latest registration or removal: an older one that ends later is dropped
let studioCount = 0;
const listOf = (v) => (Array.isArray(v) ? [...v] : []);

/** A catalogue row for a studio sprite (Contract 4: derived from the sprite, as the build does for a file). */
function studioRow(sprite, S, stylesOf) {
  const p = S.defaultParams(sprite);
  const soundIds = [...new Set(Object.values(sprite.sounds ?? {}).flat().map((c) => c.sound))].sort();
  const clips = Object.entries(sprite.clips).map(([name, c]) => ({ name, label: c.label, frames: c.frames, loop: c.loop, fps: S.clipFps(sprite, name, p) }));
  const preview = clips.find((c) => c.name === sprite.preview) ?? clips[0];
  const m = sprite.meta && typeof sprite.meta === 'object' ? sprite.meta : {};
  return {
    id: sprite.id, kind: 'sprite', name: String(sprite.name), description: String(sprite.blurb ?? ''),
    type: m.type ?? null, role: m.role ?? null, themes: listOf(m.themes), gameTypes: listOf(m.gameTypes), view: m.view ?? null, words: listOf(m.words), license: m.license ?? null,
    styles: stylesOf(sprite), bundles: [], src: null,
    tech: { frame: [sprite.size[0], sprite.size[1]], pivot: [sprite.pivot[0], sprite.pivot[1]], grounded: sprite.grounded !== false, clips, controls: Object.keys(sprite.params).length, parts: Object.keys(sprite.parts ?? {}), sounds: soundIds.length, soundIds },
    thumb: null, strip: null, stripClip: preview?.name ?? null, stripFrames: preview?.frames ?? 0, stripFps: preview?.fps ?? 0,
    runtime: true, ok: true, studio: true, madeIn: 'studio',
  };
}

/**
 * Take in a sprite made in the studio: check its definition (engine/data-sprite.js, never strict), make its row and
 * register it (addRuntimeAsset). Resolves to { ok, id, errors, warnings }; never rejects. The same id again replaces it;
 * a catalogue id is refused. Arguments: definition (a loadout-sprite, as the bag holds it); opts.visit: true when the bag
 * holds it as a sprite made with window.loadout on an earlier visit, 'link' when it came in a bag link made by whoever
 * shared it (its row says so: `madeBefore`, and madeNote).
 */
export function addStudioSprite(definition, { visit = false } = {}) {
  const want = definition && typeof definition === 'object' && typeof definition.id === 'string' ? definition.id : null;
  const turn = ++studioCount;
  if (want) studioTurn.set(want, turn);
  const job = (async () => {
    try {
      const [D, S, St, P] = await Promise.all([import('../engine/data-sprite.js'), import('../engine/sprite.js'), import('../engine/styles.js'), import('../engine/pieces.js')]);
      // a version 2 definition (a sprite made on a visit, B11) may name pieces: they are loaded first, as for a library file
      if (definition && typeof definition === 'object' && definition.version === 2) {
        const got = await P.sitePieces().loadFor(definition);
        if (!got.ok) return { ok: false, id: want, errors: got.errors, warnings: [] };
      }
      const r = D.makeDataSprite(definition);
      if (!r.ok) return { ok: false, id: want, errors: r.errors, warnings: r.warnings };
      if (want && studioTurn.get(want) !== turn) return { ok: true, id: want, errors: [], warnings: r.warnings, superseded: true };
      // a sprite made on this visit as data (window.loadout.make.sprite) holds its id: the bag's items of it (its very
      // definition) are drawn as it; another definition is not registered under its id (`held`: app/bag.js gives it a free
      // id), so the bag never draws one sprite and downloads another (build item B11b)
      const holder = want ? made.get(want) : null;
      if (holder?.row?.madeIn === 'visit' && isStudioData(holder.definition)) {
        if (JSON.stringify(holder.definition.data) === JSON.stringify(r.sprite.definition)) return { ok: true, id: want, errors: [], warnings: r.warnings, superseded: true };
        return { ok: false, held: true, id: want, errors: [`"${want}" is the id of a sprite made on this visit with another definition; the bag gives this one an id of its own`], warnings: r.warnings };
      }
      const sprite = r.sprite;
      addRuntimeAsset({ ...studioRow(sprite, S, St.stylesOf), ...(visit === true || visit === 'link' ? { madeBefore: visit } : {}) }, { data: JSON.parse(JSON.stringify(sprite.definition)), sprite });
      return { ok: true, id: sprite.id, errors: [], warnings: r.warnings };
    } catch (e) {
      return { ok: false, id: want, errors: [String(e?.message ?? e)], warnings: [] };
    }
  })();
  studioBusy.add(job);
  job.finally(() => studioBusy.delete(job));
  return job;
}

/** Forget a studio sprite (it left the bag). Returns false when there is none with that id; anything else is never removed. */
export function removeStudioSprite(id) {
  studioTurn.set(id, ++studioCount);      // a registration of it still under way is dropped
  if (!made.get(id)?.row?.studio) return false;
  return removeRuntimeAsset(id);
}

function forget(id) {
  if (!made.has(id)) return false;
  made.delete(id);      // (the library's own file of that id, if one was loaded, stays: it is kept apart)
  return true;
}

/** Forget an asset made on this visit. Returns false when there is none with that id (a catalogue asset is never removed). */
export function removeRuntimeAsset(id) {
  if (!forget(id)) return false;
  tell({ removed: id });
  return true;
}

/**
 * What to say on the page of an asset made on this visit: { draft, text }, or null for a catalogue asset.
 * draft: it does not pass the quality bar yet, so the page offers no "Add to bag".
 */
export function madeNote(id) {
  const row = made.get(id)?.row;
  if (!row || assetById(id) !== row) return null;
  if (row.studio && row.madeBefore === 'link') return { draft: false, text: 'Made with window.loadout by whoever shared the bag link, and kept in your bag. It is drawn from its definition, which is data, not code.' };
  if (row.studio && row.madeBefore) return { draft: false, text: 'Made with window.loadout on an earlier visit and kept in your bag. It is drawn from its definition, which is data, not code.' };
  if (row.studio) return { draft: false, text: 'Made in the studio and kept in your bag. It is drawn from its definition, which is data, not code.' };
  if (row.ok === false) return { draft: true, text: `Made on this visit. It does not pass the quality bar yet, so it cannot go in the bag. To fix: ${(row.errors ?? []).join(' ')}` };
  return { draft: false, text: 'Made on this visit. It is not part of the catalogue: put it in your bag to keep it.' };
}

/** Call fn({ added: id }) or fn({ removed: id }) whenever an asset made on this visit arrives or goes. Returns a function that stops it. */
export function onCatalogChange(fn) { watchers.add(fn); return () => watchers.delete(fn); }
function tell(what) { for (const fn of [...watchers]) { try { fn(what); } catch (e) { console.error('catalogue listener:', e); } } }

// ---- an asset's own file ---------------------------------------------------------------------

/**
 * A sprite's own program (what defineSprite returned). Loaded on demand and kept.
 * Once the catalogue is in, an id it does not list as a sprite is refused without asking for a file.
 */
export function loadSprite(id) {
  // a studio sprite still being registered is waited for; once registered it is dataSprite(data), made here when not given
  if (!made.has(id) && studioBusy.size && !(catalog && catalog.assets.some((a) => a.id === id))) return studioSettled().then(() => loadSprite(id));
  const mine = madeNow(id);      // (null once the catalogue holds the id: then the library's file is loaded below)
  if (mine && mine.row.kind === 'sprite' && isStudioData(mine.definition)) {
    if (!mine.program) {
      const p = import('../engine/data-sprite.js').then((m) => { const s = framesInClip(m.dataSprite(mine.definition.data)); mine.now = s; return s; });
      p.catch(() => { if (mine.program === p) mine.program = null; });
      mine.program = p;
    }
    return mine.program;
  }
  // a sprite program handed over with addRuntimeAsset(row, program) (tests do; since B11 the site hands over data only)
  if (mine && mine.row.kind === 'sprite') return Promise.resolve(typeof mine.definition.whenReady === 'function' ? mine.definition.whenReady() : null).then(() => mine.definition);
  if (!sprites.has(id)) {
    if (catalog && assetById(id)?.kind !== 'sprite') return Promise.reject(new Error(`"${id}" is not a sprite on this site`));
    // a data sprite (src sprites/<id>.json; docs/data-sprites.md, build item B9) is fetched and drawn by framework code, never imported
    const src = assetById(id)?.src;
    const p = (typeof src === 'string' && src.endsWith('.json') ? loadDataFile(src) : import(`../sprites/${id}.js`).then((m) => m.default))
      .then((s) => { arrived.set(id, s); return s; });
    p.catch(() => { sprites.delete(id); });      // a later call may try again
    sprites.set(id, p);
  }
  return sprites.get(id);
}

/**
 * A library data sprite from its file (src, e.g. sprites/coin.json): the text fetched and read through
 * catalog/sprite-schema.js parseSpriteJson (Contract 15 rule 6: the 128 KB, nesting and __proto__ wall before anything
 * else runs on it), the pieces it names loaded into the site's store, then engine/data-sprite.js dataSprite, drawing any
 * frame number (framesInClip). Rejects with an Error that starts with src. Also used by app/api-worker.js (loadout.check
 * on a library data sprite), which hands it the file's full address.
 */
export async function loadDataFile(src) {
  const r = await fetch(src);
  if (!r.ok) throw new Error(`${src}: ${r.status}`);
  const text = await r.text();
  const [D, P, S] = await Promise.all([import('../engine/data-sprite.js'), import('../engine/pieces.js'), import('../catalog/sprite-schema.js')]);
  const parsed = S.parseSpriteJson(text);
  if (!parsed.ok) throw new Error(`${src}: ${parsed.errors.join('; ')}`);
  const got = await P.sitePieces().loadFor(parsed.value);
  if (!got.ok) throw new Error(`${src}: ${got.errors.join('; ')}`);
  return framesInClip(D.dataSprite(parsed.value));
}

/** A sprite's program if it has already been loaded, otherwise null. Never waits. */
export const spriteNow = (id) => { const m = madeNow(id); return m ? (m.row.kind === 'sprite' ? m.now : null) : arrived.get(id) ?? null; };

/** Load several sprites. Resolves to { id: program } with the ones that loaded; one that cannot be loaded is left out. */
export async function loadSprites(ids) {
  const out = {};
  await Promise.all([...new Set(ids)].map(async (id) => {
    try { out[id] = await loadSprite(id); } catch (e) { console.warn(`Loadout: the sprite "${id}" could not be loaded.`, e); }
  }));
  return Object.fromEntries(ids.filter((id) => out[id]).map((id) => [id, out[id]]));
}

/** A sound's or music track's patch. Loaded on demand and kept. */
export async function loadSound(id) {
  const mine = madeNow(id);
  if (mine && mine.row.kind !== 'sprite') return mine.program;
  if (!patches.has(id)) patches.set(id, fetch(`sounds/${id}.json`).then((r) => { if (!r.ok) throw new Error(`sounds/${id}.json: ${r.status}`); return r.json(); }));
  return patches.get(id);
}

/** Load whatever kind of asset a catalogue row describes: a sprite program or a patch. */
export const loadAsset = (row) => (row.kind === 'sprite' ? loadSprite(row.id) : loadSound(row.id));
