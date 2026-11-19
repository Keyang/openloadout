// The front door: the home page (the landing; the library is app/library-page.js) and the old list of bundles. Everything here is drawn from the catalogue; no asset file is loaded to list it.
import { labelFor, BUNDLE_LEVELS } from '../catalog/schema.js';
import { el, header } from './ui.js';
import { currentCatalog } from './catalog.js';
import { bundleCard } from './cards.js';
import { landingPage } from './home-landing.js';
import { stateFromQuery, queryFromState, hashFromState } from './browse.js';

/** Home: the landing page (app/home-landing.js). */
export function homePage(app, query = {}) {
  // an old link to the front page with a search or filters in it: the library shows those now
  if (queryFromState(stateFromQuery(query))) { location.replace(hashFromState(stateFromQuery(query))); return () => {}; }
  return landingPage(app);
}

/** #/bundles: every bundle, game kits first. */
export function bundlesPage(app) {
  document.title = 'Bundles · Loadout';
  const { bundles } = currentCatalog();
  const levels = [...BUNDLE_LEVELS].reverse();               // kit, character, object
  const groups = [...levels.map((level) => [`${labelFor('level', level)}s`, bundles.filter((b) => b.level === level)]),
    ['Other bundles', bundles.filter((b) => !levels.includes(b.level))]].filter(([, list]) => list.length);
  app.replaceChildren(header('bundles'), el('main', { class: 'home' },
    el('h1', { class: 'small' }, 'Bundles'),
    el('p', { class: 'lede' }, 'Sprites, sounds and music that belong together. Open a bundle to restyle everything in it at once, try it out, and download it or add it to your bag.'),
    groups.length ? groups.map(([title, list]) => [
      groups.length > 1 ? el('h2', { class: 'shelf' }, title) : null,
      el('ul', { class: 'gallery kits' }, list.map((b) => el('li', {}, bundleCard(b).node)))])
      : el('p', { class: 'empty' }, 'There are no bundles yet.')));
  return () => {};
}
