// The one place the site reads the built catalogue (generated/catalog.json, Contract 4).
// Pages list and filter from the catalogue, and load an asset's own file only to draw or play it.
let catalog = null, loading = null;
const sprites = new Map(), patches = new Map();

/** Load the catalogue once. Resolves to { version, assets: [...], bundles: [...] }. */
export function loadCatalog() {
  if (catalog) return Promise.resolve(catalog);
  if (!loading) {
    loading = fetch('generated/catalog.json').then((r) => {
      if (!r.ok) throw new Error(`The catalogue is missing (generated/catalog.json: ${r.status}). Run "npm run build" first.`);
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

/** A sprite's own program (what defineSprite returned). Loaded on demand and kept. */
export async function loadSprite(id) {
  if (!sprites.has(id)) sprites.set(id, import(`../sprites/${id}.js`).then((m) => m.default));
  return sprites.get(id);
}

/** A sound's or music track's patch. Loaded on demand and kept. */
export async function loadSound(id) {
  if (!patches.has(id)) patches.set(id, fetch(`sounds/${id}.json`).then((r) => { if (!r.ok) throw new Error(`sounds/${id}.json: ${r.status}`); return r.json(); }));
  return patches.get(id);
}

/** Load whatever kind of asset a catalogue row describes: a sprite program or a patch. */
export const loadAsset = (row) => (row.kind === 'sprite' ? loadSprite(row.id) : loadSound(row.id));
