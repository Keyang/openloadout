// Loadout website. It starts from the catalogue (generated/catalog.json, written by the build) and routes
// between the home page, the results view, the asset pages, bundles, the bag and the playground.
// An asset's own file is loaded only by the page that draws or plays it.
import { el, header } from './ui.js';
import { loadCatalog, assetById, loadSprite } from './catalog.js';
import { loadSounds, soundById, stopAll, isMusic } from './audio.js';
import { homePage, browsePage, bundlesPage } from './home.js';
import { kitAddress } from './kit-page.js';
import { standInCatalog, configureSearch } from './browse.js';

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
function lazyPage(file, open, what) {
  const mine = Symbol('visit');
  lazyPage.current = mine;
  teardown = () => { lazyPage.current = null; };
  const still = () => lazyPage.current === mine;
  import(file).then(async (m) => {
    if (!still()) return;                      // left before the page's code arrived: do not draw over where they went
    const stop = await open(m, still);
    if (lazyPage.current === mine) teardown = stop || (() => {}); else if (stop) stop();   // the visitor already left
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
  else if (a === 'bag') lazyPage('./bag-page.js', (m) => m.bagPage(app, query), 'bag');
  else if (a === 'bundle') lazyPage('./bundle-page.js', (m) => m.bundlePage(app, b, query), 'bundle page');
  else if (a === 'play') lazyPage('./play-page.js', (m) => m.playPage(app, query), 'playground');
  else if (kindOf(a) === 'sprite' && !b) openSprite(a, query);      // links from before sounds were added
  else teardown = notFound('page');
}

waiting();
// Test-only: on a developer's machine "?catalog=<file>.json" swaps in a stand-in catalogue (see standInCatalog).
// app/catalog.js reads one fixed address, so its request is pointed at the stand-in for this one call.
const standIn = standInCatalog();
let catalogue;
if (standIn) {
  const real = window.fetch;
  window.fetch = (url, ...rest) => real(url === 'generated/catalog.json' ? standIn : url, ...rest);
  catalogue = loadCatalog();
  window.fetch = real;
  configureSearch({ dbUrl: new URL('generated/search.sqlite', new URL(standIn, location.href)).href });
} else catalogue = loadCatalog();

try {
  await catalogue;
  window.addEventListener('hashchange', route);
  route();
  // fetch the sound library in a quiet moment, so the first asset page opens at once
  if (window.requestIdleCallback) window.requestIdleCallback(() => sounds()); else setTimeout(sounds, 400);
} catch (e) {
  console.error(e);
  app.replaceChildren(el('main', { class: 'home' },
    el('h1', { class: 'small' }, 'The library has not been built yet'),
    el('p', { class: 'lede' }, 'This copy of Loadout is missing its catalogue, the list of every sprite, sound and track (generated/catalog.json).'),
    el('p', { class: 'lede' }, 'In the project folder, run "npm run build", then reload this page.')));
}
