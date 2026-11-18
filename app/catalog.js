// The one place the site reads the built catalogue (generated/catalog.json, Contract 4).
// Pages list and filter from the catalogue, and load an asset's own file only to draw or play it.
// There is no other list of assets: a file the build found is on the site, everywhere.
//
// Assets made on a visit (window.loadout.make, Contract 11) are handed over with addRuntimeAsset(row, definition).
// From then until the page is left they answer assetById, loadSprite and loadSound like catalogue assets, so the
// asset pages, the bag, the playground and the export need no code of their own for them. The built catalogue
// itself (currentCatalog()) is never changed; allAssets() is the catalogue's rows followed by theirs.
export const CATALOG_URL = 'generated/catalog.json';

let catalog = null, loading = null;
const sprites = new Map(), patches = new Map();
const arrived = new Map();      // sprite programs that have finished loading, by id
const made = new Map();         // assets made on this visit: id -> { row, definition }
const watchers = new Set();

/**
 * Load the catalogue once. Resolves to { version, assets: [...], bundles: [...] }.
 * `url`: where the catalogue is (the usual place when left out). The first call decides; later calls,
 * whatever they pass, get the same catalogue.
 */
export function loadCatalog(url) {
  if (catalog) return Promise.resolve(catalog);
  if (!loading) {
    const from = url || CATALOG_URL;
    loading = fetch(from).then((r) => {
      if (!r.ok) throw new Error(`The catalogue is missing (${from}: ${r.status}). Run "npm run build" first.`);
      return r.json();
    }).then((c) => { catalog = c; return c; });
  }
  return loading;
}

/** The loaded catalogue, or null before loadCatalog() has finished. */
export const currentCatalog = () => catalog;
/** An asset's row by id: the catalogue's, or that of an asset made on this visit. null when there is none. */
export const assetById = (id) => (catalog ? catalog.assets.find((a) => a.id === id) : null) ?? made.get(id)?.row ?? null;
/** Every asset there is right now: the catalogue's rows, then the ones made on this visit. */
export const allAssets = () => [...(catalog ? catalog.assets : []), ...runtimeAssets()];
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
 * definition: what its own file would hold, a sprite program (what defineSprite returned) or a sound patch.
 * The same id again replaces the earlier one. An id the catalogue uses is refused (it throws).
 */
export function addRuntimeAsset(row, definition) {
  if (!row || typeof row.id !== 'string' || !row.id) throw new Error('addRuntimeAsset: the row needs an id');
  if (!['sprite', 'sound', 'music'].includes(row.kind)) throw new Error(`addRuntimeAsset: "${row.id}" needs a kind: sprite, sound or music`);
  if (!definition || typeof definition !== 'object') throw new Error(`addRuntimeAsset: "${row.id}" needs its definition (a sprite program or a patch)`);
  if (catalog && catalog.assets.some((a) => a.id === row.id)) throw new Error(`"${row.id}" is already an asset in the catalogue`);
  forget(row.id);
  made.set(row.id, { row, definition });
  if (row.kind === 'sprite') { sprites.set(row.id, Promise.resolve(definition)); arrived.set(row.id, definition); }
  else patches.set(row.id, Promise.resolve(definition));
  tell({ added: row.id });
}

function forget(id) {
  if (!made.has(id)) return false;
  made.delete(id);
  sprites.delete(id); arrived.delete(id); patches.delete(id);
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
  // a sprite made on this visit is drawn in a worker: each time it is asked for, what the bag will draw of it is brought first
  const mine = made.get(id);
  if (mine && mine.row.kind === 'sprite' && assetById(id) === mine.row) return Promise.resolve(typeof mine.definition.whenReady === 'function' ? mine.definition.whenReady() : null).then(() => mine.definition);
  if (!sprites.has(id)) {
    if (catalog && assetById(id)?.kind !== 'sprite') return Promise.reject(new Error(`"${id}" is not a sprite on this site`));
    const p = import(`../sprites/${id}.js`).then((m) => { arrived.set(id, m.default); return m.default; });
    p.catch(() => { sprites.delete(id); });      // a later call may try again
    sprites.set(id, p);
  }
  return sprites.get(id);
}

/** A sprite's program if it has already been loaded, otherwise null. Never waits. */
export const spriteNow = (id) => arrived.get(id) ?? null;

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
  if (!patches.has(id)) patches.set(id, fetch(`sounds/${id}.json`).then((r) => { if (!r.ok) throw new Error(`sounds/${id}.json: ${r.status}`); return r.json(); }));
  return patches.get(id);
}

/** Load whatever kind of asset a catalogue row describes: a sprite program or a patch. */
export const loadAsset = (row) => (row.kind === 'sprite' ? loadSprite(row.id) : loadSound(row.id));
