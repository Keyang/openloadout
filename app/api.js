// window.loadout: the framework and the site's high-level actions, for an agent that drives the live page
// (docs/architecture.md, Contract 11; the guide is docs/framework-api.md).
//
//   const fw = await loadout.framework;                 // every framework module: fw.sprite.defineSprite, fw.fx.ring, ...
//   const api = await loadout.api;                      // generated/api.json: what exists, with descriptions
//   await loadout.assets.search('money', { kind: 'sprite' })
//   await loadout.make.sprite(definition)               // a loadout-sprite v2 definition (data) -> { id, ok, errors, warnings }
//   await loadout.render('coin', { clip: 'spin', scale: 4 })   // -> { ok, png: 'data:image/png;base64,...' }
//   await loadout.call('make_sound', { patch })         // the same actions by their tool name (what an MCP server does)
//
// This is the small file every visitor loads. It puts `loadout` on the window with every action in place, and
// loads nothing else: the first call of any action, or the first look at `framework` or `api`, brings
// app/api-core.js (the whole of it), which brings what that action needs. A visitor who never touches
// `loadout`, and whose bag holds nothing made on a visit, pays for this file alone.
//
// CALLS names the same actions as ACTIONS in app/api-actions.js; a unit test fails when the two disagree.

/** Where each action is on window.loadout. */
export const CALLS = [
  'assets.list', 'assets.get', 'assets.search', 'assets.similar', 'assets.remove',
  'make.sprite', 'make.sound', 'check', 'render',
  'bag.add', 'bag.items', 'bag.remove', 'bag.update', 'bag.clear', 'bag.link', 'bag.setLook', 'bag.download',
  'go',
  'studio.starts', 'studio.create', 'studio.list', 'studio.get', 'studio.set', 'studio.validate', 'studio.bake', 'studio.render', 'studio.advice', 'studio.toBag', 'studio.file', 'studio.remove',
];

let loading = null, real = null, inner = null;
/** Bring app/api-core.js and build the real object, once. */
function load() {
  loading ??= import('./api-core.js').then((m) => { real = m.createLoadout({ window }); inner = m.internalsOf(real); return real; }, (e) => { loading = null; throw e; });
  return loading;
}
// an action never throws, not even when the rest of loadout cannot be loaded
const refuse = (e) => ({ ok: false, errors: [`Loadout could not finish loading (${String((e && e.message) || e)}). Reload the page and try again.`] });
const later = (call) => (...args) => load().then((L) => call.split('.').reduce((o, k) => o[k], L)(...args), refuse);

function install(win) {
  const loadout = {};
  for (const call of CALLS) {
    const [group, member] = call.split('.');
    if (member) (loadout[group] ??= {})[member] = later(call); else loadout[group] = later(call);
  }
  loadout.call = later('call');
  // Each is a promise of itself until it has arrived, so `await loadout.framework` is right at any time.
  for (const name of ['framework', 'api']) Object.defineProperty(loadout, name, { enumerable: true, get: () => (real ? real[name] : load().then((L) => L[name])) });
  for (const group of ['assets', 'make', 'bag', 'studio']) Object.freeze(loadout[group]);
  win.loadout = Object.freeze(loadout);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.loadout) install(window);

// ---- what the bag holds that was made on a visit ----------------------------------------------------------------
// Such an item carries its definition, which came from storage or from a link and is not trusted. A sprite's is data
// ({ data }, a loadout-sprite definition: checked and drawn by the bag and app/catalog.js, never run). A sound's
// ({ patch }) is checked again after the site has drawn its pages: restoreRuntime() has each one run through the
// quality bar in the background. Until that is done the item is "checking"; one that fails "needs re-making" and is
// neither drawn nor exported. A sprite item that holds source text ({ source }: route 2 before build item B11) is never
// run again: it "needs re-making", made with an older version of Loadout (docs/data-sprites.md section 10, DQ2).

/** Why a bag item made from sprite source text is not shown: what the bag page and loadout.bag.items() say of it. */
export const OLDER_VERSION = 'It was made with an older version of Loadout, which took sprites as program text. Loadout now takes sprites as data only, so it can no longer be opened. Ask whoever made it for a new link, or make it again.';
/** The one line the bag page shows on such an item (Keyang's DQ2), where it says why an item needs re-making: the state's `say`. */
export const OLDER_LINE = 'This was made with an older version of Loadout; ask for a new link.';
/** Is this a sprite item kept from before sprites were data (its definition is source text)? */
const olderItem = (item) => item.kind === 'sprite' && typeof item.definition.source === 'string' && item.definition.data === undefined;

const BAG_KEY = 'loadout-bag-v1';
/** Does the stored bag hold anything made on a visit? Read as text, so that finding out loads nothing. */
function storedBagHoldsMade() {
  try { return (window.localStorage.getItem(BAG_KEY) ?? '').includes('"definition"'); } catch { return false; }
}

/**
 * Go through what the bag holds from a link or an earlier visit: each made item is checked again, off the page.
 * Resolves when every one is settled. Never rejects. `sure`: the caller knows the bag holds such items
 * (otherwise the stored bag is looked at, and nothing is loaded when it holds none).
 */
export function restoreRuntime(sure = false) {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!inner && !sure && !storedBagHoldsMade()) return Promise.resolve();
  return load().then(() => inner.restore(), (e) => { console.warn('Loadout: what the bag holds from an earlier visit could not be gone through.', e); });
}

/**
 * Where a bag item made on a visit stands: { state: 'ready' | 'checking' | 'needs re-making', name?, reason? }.
 * null for a catalogue item. Only a "ready" item is drawn or exported.
 */
export function madeItemState(item) {
  if (!item || !item.definition || item.definition.data) return null;      // a sprite that is data (Contracts 14, 15): nothing to check off the page
  if (olderItem(item)) return { state: 'needs re-making', name: item.id, reason: OLDER_VERSION, say: OLDER_LINE };
  return inner ? inner.state(item) : { state: 'checking' };
}

/** Is this id something made on a visit that the bag holds and that has not been checked again yet? Its page waits for that. */
export function madePending(id) {
  if (typeof id !== 'string' || !id) return false;
  const known = inner ? inner.pending(id) : null;
  if (known !== null) return known;
  try { const text = window.localStorage.getItem(BAG_KEY) ?? ''; return text.includes('"definition"') && text.includes(`"id":${JSON.stringify(id)}`); } catch { return false; }
}
