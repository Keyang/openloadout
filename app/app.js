// Loadout website: routes between the catalogue, sprite pages, sound pages, music pages and kits.
import { byId as spriteById } from '../sprites/index.js';
import { kitById } from '../kits/index.js';
import { el, header } from './ui.js';
import { loadSounds, soundById, stopAll, isMusic } from './audio.js';
import { catalogue, kitsPage } from './home.js';
import { spritePage } from './sprite-page.js';
import { soundPage } from './sound-page.js';
import { musicPage } from './music-page.js';
import { kitPage } from './kit-page.js';

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

function route() {
  teardown();
  stopAll();
  window.scrollTo(0, 0);
  const { parts, query } = parseHash();
  const [a, b] = parts;
  if (!a) teardown = catalogue(app, 'all', query);
  else if ((a === 'sprites' || a === 'sounds' || a === 'music') && !b) teardown = catalogue(app, a, query);
  else if (a === 'music') teardown = soundById[b] && isMusic(soundById[b]) ? musicPage(app, soundById[b], query) : notFound('track');
  else if (a === 'kits') teardown = kitsPage(app);
  else if (a === 'sprite') teardown = spriteById[b] ? spritePage(app, spriteById[b], query) : notFound('sprite');
  else if (a === 'sound') teardown = !soundById[b] ? notFound('sound') : isMusic(soundById[b]) ? musicPage(app, soundById[b], query) : soundPage(app, soundById[b], query);
  else if (a === 'kit') teardown = kitById[b] ? kitPage(app, kitById[b]) : notFound('kit');
  else if (spriteById[a]) teardown = spritePage(app, spriteById[a], query);      // links from before sounds were added
  else teardown = notFound('page');
}

app.replaceChildren(el('main', { class: 'home' }, el('p', { class: 'lede' }, 'Loading sprites, sounds and music…')));
try {
  await loadSounds();
} catch (e) {
  console.error(e);   // sprites still work without the sound library
}
window.addEventListener('hashchange', route);
route();
