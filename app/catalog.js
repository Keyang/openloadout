// The one place the site reads the built catalogue (generated/catalog.json, Contract 4).
// Pages list and filter from the catalogue, and load an asset's own file only to draw or play it.
// There is no other list of assets: a file the build found is on the site, everywhere.
export const CATALOG_URL = 'generated/catalog.json';

let catalog = null, loading = null;
const sprites = new Map(), patches = new Map();
const arrived = new Map();      // sprite programs that have finished loading, by id

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
export const assetById = (id) => (catalog ? catalog.assets.find((a) => a.id === id) ?? null : null);
export const bundleById = (id) => (catalog ? catalog.bundles.find((b) => b.id === id) ?? null : null);
export const assetsOfBundle = (bundle) => [...bundle.sprites, ...bundle.sounds, ...bundle.music].map(assetById).filter(Boolean);

// ---- how assets are tied together, from the catalogue alone -------------------------------------

/** The bundles an asset is in, as bundle rows. */
export const bundlesOf = (id) => (assetById(id)?.bundles ?? []).map(bundleById).filter(Boolean);
/** The sprites whose animations play this sound, as catalogue rows. */
export const spritesUsing = (soundId) => (catalog ? catalog.assets.filter((a) => a.kind === 'sprite' && (a.tech?.soundIds ?? []).includes(soundId)) : []);
/** The sounds a sprite's animations play, as catalogue rows (a sound that is not on the site is left out). */
export const soundsOf = (spriteId) => (assetById(spriteId)?.tech?.soundIds ?? []).map(assetById).filter((a) => a && a.kind !== 'sprite');

// ---- an asset's own file ---------------------------------------------------------------------

/**
 * A sprite's own program (what defineSprite returned). Loaded on demand and kept.
 * Once the catalogue is in, an id it does not list as a sprite is refused without asking for a file.
 */
export function loadSprite(id) {
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
