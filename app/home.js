// The front door: the home page (the landing; the library is app/library-page.js; the kits list is app/kit-list.js). Everything here is drawn from the catalogue; no asset file is loaded to list it.
import { landingPage } from './home-landing.js';
import { stateFromQuery, queryFromState, hashFromState } from './browse.js';

/** Home: the landing page (app/home-landing.js). */
export function homePage(app, query = {}) {
  // an old link to the front page with a search or filters in it: the library shows those now
  if (queryFromState(stateFromQuery(query))) { location.replace(hashFromState(stateFromQuery(query))); return () => {}; }
  return landingPage(app);
}
