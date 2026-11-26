// Loadout website. It starts from the catalogue (generated/catalog.json, written by the build) and routes
// between the home page, the results view, the asset pages, bundles, the bag and the playground.
// An asset's own file is loaded only by the page that draws or plays it.
import { el, header } from './ui.js';
import { startArtStyle, siteStyle } from './art-style.js';
import { usePlaceholders } from './home-live.js';
import { loadCatalog, assetById, loadSprite } from './catalog.js';
import { loadSounds, soundById, stopAll, isMusic } from './audio.js';
import { homePage } from './home.js';
// the library (app/library-page.js) and the kits list (app/kit-list.js) are loaded when visited: the home page does not wait for their 30-odd modules
import { kitAddress } from './kit-page.js';
import { leaving, arrived } from './back.js';
import { standInCatalog, configureSearch } from './browse.js';
import { restoreRuntime, madePending } from './api.js';      // W5-A: installs window.loadout (Contract 11); loads nothing else until it is used

const app = document.getElementById('app');
let teardown = () => {};
// dist/index.html carries the landing already drawn (tools/lib/dist-prerender.mjs; its inline script marks the page "deep"
// and hides it when the address is another page). It stays on screen while the scripts and the catalogue load, and the live
// landing replaces it in place.
let predrawn = document.documentElement.classList.contains('deep') ? null : app.querySelector(':scope > main[data-prerendered]');

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(query)) };
}

function notFound(what) {
  document.title = 'Not here · Loadout';       // not the title of the page they came from
  // one way on: the library. The header's link under the bar stays only when it is a way back (to results, the bag, a
  // kit); with nowhere to go back to it would be a second link to the library in other words, so it goes.
  const top = header('');
  const back = top.querySelector('.back-link');
  if (back && back.getAttribute('href') === '#/browse') back.remove();
  app.replaceChildren(top, el('main', { class: 'v2 home notice' },
    el('h1', { class: 'h2' }, `That ${what} is not here`),
    el('p', { class: 'lede' }, 'The link may be old or mistyped. Everything Loadout has is in the library.'),
    el('p', {}, el('a', { class: 'btn btn-primary', href: '#/browse' }, 'Browse the library'))));
  return () => {};
}

// the header stays while a page loads (the one index.html drew, or the last page's), so the frame never goes blank
const waiting = () => {
  const top = app.querySelector('header.top');
  app.replaceChildren(...(top ? [top] : []), el('main', { class: 'v2 home' }, el('p', { class: 'lede' }, 'Loading…')));
};

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
/** Does this address open a page that waits for the sound library? */
const needsSounds = ({ parts: [a, b] }) => !LISTS.has(a ?? '') && !(a === 'music' && !b);
/** A slow or metered connection (where the browser says so): nothing is fetched ahead of need. */
const slowLink = () => { const c = navigator.connection; return !!c && (c.saveData === true || /(^|-)(2g|3g)$/.test(c.effectiveType ?? '')); };

/**
 * While the sound library is on its way, the page's own code (and a sprite's program, with the rig it is drawn on)
 * is fetched alongside it instead of after it. Nothing runs yet: the page opens as usual once the sounds are in.
 */
const PAGE_FILES = { sprite: './sprite-page.js', sound: './sound-page.js', music: './music-page.js', bag: './bag-page.js', bundle: './bundle-page.js', play: './play-page.js' };
function warmUp(a, b) {
  const file = a === 'sound' && soundById[b] && isMusic(soundById[b]) ? PAGE_FILES.music : PAGE_FILES[a];
  if (file) import(file).catch(() => {});                    // a failure shows when the page itself opens
  if (a === 'sprite' && kindOf(b) === 'sprite') loadSprite(b).catch(() => {});
}

/** Go to another address without leaving the old one in the Back history. */
function moveTo(hash) { location.replace(hash); }

const kindOf = (id) => assetById(id)?.kind ?? null;
const openSprite = (id, query) => lazyPage('./sprite-page.js', async (m, still) => {
  const sprite = await loadSprite(id);         // the sprite's own program, loaded only now
  return still() ? m.spritePage(app, sprite, query) : null;
}, 'sprite');

function route(moved) {
  // the way back from an asset page: where the visitor was is noted while that page is still on screen (app/back.js)
  if (moved && moved.oldURL) leaving(new URL(moved.oldURL).hash, location.hash);
  teardown();
  teardown = () => {};
  stopAll();
  // the live landing over the pre-drawn one: the visitor stays where they had scrolled to
  const y = window.scrollY;
  if (!predrawn) { window.scrollTo(0, 0); usePlaceholders(null); }      // the pre-drawn pictures serve the first landing only
  const { parts, query } = parseHash();
  const [a, b] = parts;
  const here = location.hash;
  // W5-A: something made on an earlier visit that the bag holds is checked again off the page, after the page has drawn; its own page waits for that
  if (b && madePending(b)) { waiting(); restoreRuntime(true).then(() => { if (location.hash === here) route(); }); return; }
  if (needsSounds({ parts }) && !soundsIn) {
    waiting();
    warmUp(a, b);
    sounds().then(() => { if (location.hash === here) route(); });
    return;
  }
  const old = kitAddress(parts);
  if (!a) teardown = homePage(app, query);
  else if (a === 'browse') lazyPage('./library-page.js', (m) => m.browsePage(app, query), 'library');
  else if ((a === 'sprites' || a === 'sounds' || a === 'music') && !b) moveTo(`#/browse?kind=${a === 'sprites' ? 'sprite' : a === 'sounds' ? 'sound' : 'music'}`);
  else if (old) moveTo(old);
  else if (a === 'bundles') lazyPage('./kit-list.js', (m) => m.bundlesPage(app), 'kits list');
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
  else if (a === 'studio') lazyPage('./studio-page.js', (m, still) => m.studioPage(app, b, query, still), 'studio');
  else if (kindOf(a) === 'sprite' && !b) openSprite(a, query);      // links from before sounds were added
  else teardown = notFound('page');
  if (predrawn) { predrawn = null; window.scrollTo(0, a ? 0 : y); }
  arrived();          // back on the list they left: its place on the page is put back
}

if (!predrawn) waiting();
// a first page that needs the sound library asks for it now, alongside the catalogue, not after it
if (needsSounds(parseHash())) sounds();
// ==== W2-G: the catalogue's address ====
// Test-only: on a developer's machine "?catalog=<file>.json" swaps in a stand-in catalogue (standInCatalog: localhost only).
const standIn = standInCatalog();
if (standIn) configureSearch({ dbUrl: new URL('generated/search.sqlite', new URL(standIn, location.href)).href });
const catalogue = loadCatalog(standIn);      // nothing named: the usual generated/catalog.json
// ==== end W2-G ====

try {
  await catalogue;
  window.addEventListener('hashchange', route);
  startArtStyle();      // the site's art style from the last visit, before the first page draws
  // the pre-drawn pictures are pixel art: a live sprite shows its own until it draws (app/home-live.js); not in another style
  if (predrawn && siteStyle() === 'pixel') usePlaceholders(new Map([...predrawn.querySelectorAll('canvas[data-ph]')].filter((c) => c.style.backgroundImage).map((c) => [c.dataset.ph, c.style.backgroundImage])));
  window.addEventListener('loadout:artstyle', () => { const y = window.scrollY; route(); window.scrollTo(0, y); });      // the header toggle: the page draws again in the chosen style
  route();
  setTimeout(() => restoreRuntime(), 0);      // W5-A: after the first page is up, what the bag holds from an earlier visit is checked again (in workers, never here)
  // fetch the sound library in a quiet moment, so the first asset page opens at once; not on a slow or metered
  // connection, where it would hold up the pictures on screen (an asset page then fetches it when it opens)
  if (!slowLink()) { if (window.requestIdleCallback) window.requestIdleCallback(() => sounds()); else setTimeout(sounds, 400); }
} catch (e) {
  // For whoever runs the site: the catalogue (generated/catalog.json) is written by "npm run build". A visitor cannot fix that, so the page does not ask them to.
  console.error('Loadout could not start: the catalogue did not load. If this is your copy of the site, run "npm run build" and publish the generated/ folder.', e);
  app.replaceChildren(el('main', { class: 'v2 home notice' },
    el('h1', { class: 'h2' }, 'Something went wrong'),
    el('p', { class: 'lede' }, 'This page could not load its list of assets. Please try again later.'),
    el('p', {}, el('button', { type: 'button', class: 'btn btn-primary', onclick: () => location.reload() }, 'Try again'))));
}
