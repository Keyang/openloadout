// Loadout website. It starts from the catalogue (generated/catalog.json, written by the build) and routes
// between the home page, the results view, the asset pages, bundles, the bag and the playground.
// An asset's own file is loaded only by the page that draws or plays it.
import { el, header } from './ui.js';
import { loadCatalog, assetById, loadSprite } from './catalog.js';
import { loadSounds, soundById, stopAll, isMusic } from './audio.js';
import { homePage, browsePage, bundlesPage } from './home.js';
import { kitAddress } from './kit-page.js';
import { standInCatalog, configureSearch } from './browse.js';
import { restoreRuntime } from './api.js';      // W5-A: installs window.loadout (Contract 11); loads nothing else until it is used

const app = document.getElementById('app');
let teardown = () => {};

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(query)) };
}

function notFound(what) {
  app.replaceChildren(header(''), el('main', { class: 'home' },
    el('h1', { class: 'small' }, `That ${what} is not here`),
    el('p', { class: 'lede' }, 'The link may be old or mistyped. Everything that exists is on the front page.'),
    el('p', {}, el('a', { class: 'btn', href: '#/' }, 'See everything'))));
  return () => {};
}

const waiting = () => app.replaceChildren(el('main', { class: 'home' }, el('p', { class: 'lede' }, 'Loading…')));

// Pages that are loaded only when visited. The page function returns its teardown, or a promise of it.
// open(module, still): still() is false once the visitor has moved on; a page that waits for something checks it before drawing.
// W2-G: a page that waits inside itself (bag, bundle, playground) is handed still() as its last argument, to check before it draws;
// still() stays right for the page's whole life (it turns false when the page is left, also after it has opened).
function lazyPage(file, open, what) {
  const mine = Symbol('visit');
  lazyPage.current = mine;
  teardown = () => { lazyPage.current = null; };
  const still = () => lazyPage.current === mine;
  import(file).then(async (m) => {
    if (!still()) return;                      // left before the page's code arrived: do not draw over where they went
    const stop = await open(m, still);
    if (lazyPage.current === mine) teardown = () => { lazyPage.current = null; if (stop) stop(); }; else if (stop) stop();   // the visitor already left
  }).catch((e) => { console.error(e); if (lazyPage.current === mine) teardown = notFound(what); });
}

// Every page but the lists needs the sound library (one file). The lists do not wait for it.
let soundsIn = false, soundsWanted = null;
const LISTS = new Set(['', 'browse', 'bundles', 'sprites', 'sounds', 'kits', 'kit']);
function sounds() {
  soundsWanted ??= loadSounds().catch((e) => { console.error(e); }).then(() => { soundsIn = true; });   // sprites still work without sounds
  return soundsWanted;
}

/** Go to another address without leaving the old one in the Back history. */
function moveTo(hash) { location.replace(hash); }

const kindOf = (id) => assetById(id)?.kind ?? null;
const openSprite = (id, query) => lazyPage('./sprite-page.js', async (m, still) => {
  const sprite = await loadSprite(id);         // the sprite's own program, loaded only now
  return still() ? m.spritePage(app, sprite, query) : null;
}, 'sprite');

function route() {
  teardown();
  teardown = () => {};
  stopAll();
  window.scrollTo(0, 0);
  const { parts, query } = parseHash();
  const [a, b] = parts;
  const here = location.hash;
  if (!LISTS.has(a ?? '') && !(a === 'music' && !b) && !soundsIn) {
    waiting();
    sounds().then(() => { if (location.hash === here) route(); });
    return;
  }
  const old = kitAddress(parts);
  if (!a) teardown = homePage(app, query);
  else if (a === 'browse') teardown = browsePage(app, query);
  else if ((a === 'sprites' || a === 'sounds' || a === 'music') && !b) moveTo(`#/browse?kind=${a === 'sprites' ? 'sprite' : a === 'sounds' ? 'sound' : 'music'}`);
  else if (old) moveTo(old);
  else if (a === 'bundles') teardown = bundlesPage(app);
  else if (a === 'music') { if (soundById[b] && isMusic(soundById[b])) lazyPage('./music-page.js', (m) => m.musicPage(app, soundById[b], query), 'track'); else teardown = notFound('track'); }
  else if (a === 'sprite') { if (kindOf(b) === 'sprite') openSprite(b, query); else teardown = notFound('sprite'); }
  else if (a === 'sound') {
    if (!soundById[b]) teardown = notFound('sound');
    else if (isMusic(soundById[b])) lazyPage('./music-page.js', (m) => m.musicPage(app, soundById[b], query), 'track');
    else lazyPage('./sound-page.js', (m) => m.soundPage(app, soundById[b], query), 'sound');
  }
  else if (a === 'bag') lazyPage('./bag-page.js', (m, still) => m.bagPage(app, query, still), 'bag');
  else if (a === 'bundle') lazyPage('./bundle-page.js', (m, still) => m.bundlePage(app, b, query, still), 'bundle page');
  else if (a === 'play') lazyPage('./play-page.js', (m, still) => m.playPage(app, query, still), 'playground');
  else if (kindOf(a) === 'sprite' && !b) openSprite(a, query);      // links from before sounds were added
  else teardown = notFound('page');
}

waiting();
// ==== W2-G: the catalogue's address ====
// Test-only: on a developer's machine "?catalog=<file>.json" swaps in a stand-in catalogue (standInCatalog: localhost only).
const standIn = standInCatalog();
if (standIn) configureSearch({ dbUrl: new URL('generated/search.sqlite', new URL(standIn, location.href)).href });
const catalogue = loadCatalog(standIn);      // nothing named: the usual generated/catalog.json
// ==== end W2-G ====

try {
  await catalogue;
  await restoreRuntime();      // W5-A: assets made on an earlier visit that are in the bag are known again before the first page is drawn
  window.addEventListener('hashchange', route);
  route();
  // fetch the sound library in a quiet moment, so the first asset page opens at once
  if (window.requestIdleCallback) window.requestIdleCallback(() => sounds()); else setTimeout(sounds, 400);
} catch (e) {
  // For whoever runs the site: the catalogue (generated/catalog.json) is written by "npm run build". A visitor cannot fix that, so the page does not ask them to.
  console.error('Loadout could not start: the catalogue did not load. If this is your copy of the site, run "npm run build" and publish the generated/ folder.', e);
  app.replaceChildren(el('main', { class: 'home' },
    el('h1', { class: 'small' }, 'Something went wrong'),
    el('p', { class: 'lede' }, 'This page could not load its list of assets. Please try again later.'),
    el('p', {}, el('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'Try again'))));
}
