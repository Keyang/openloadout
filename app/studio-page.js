// The studio, #/studio and #/studio/<draft>?mode=rig|animate|frames|sprite&clip=walk&frame=3 (docs/studio.md section 5;
// docs/architecture.md Contract 14; build plan item S9). Make a sprite from a starting body: change its bones and
// shapes, pose key frames, set frames, speed, looping and the anchor, name and colour it; it is kept on this computer as
// you go and downloads as a file for the library or a sheet. The pieces are in app/studio/: drafts.js (keeping, through app/studio-store.js), keep.js (checking a change, following the bag),
// history.js (undo), edit.js (every change, pure), draw.js (pictures and files), stage.js (the picture), panes.js (the
// four tabs), editor.js (the editing page), home.js (the first page). Styles: app/css/studio.css.
import { el, header } from './ui.js';
import { pickStorage } from './bag.js';
import { createDrafts } from './studio/drafts.js';
import { homePage } from './studio/home.js';
import { editorPage } from './studio/editor.js';

/**
 * Opens the studio: its first page, or one draft for editing. Returns the page's teardown.
 * Arguments: app (the page's root), draft (the draft's name from the address, or undefined), query (the address's settings), still (false once the visitor has left).
 */
export function studioPage(app, draft, query = {}, still = () => true) {
  if (!still()) return () => {};
  const { drafts, kept, studio } = placeOf();
  // saved drafts that cannot be read whole: the first page says so, and nothing is opened or saved over them
  if (!draft || drafts.problem()) return homePage(app, { drafts, kept, query });
  let id = null;
  try { id = decodeURIComponent(draft); } catch { id = null; }      // a badly written address is a draft that is not here
  const entry = id === null ? null : drafts.get(id);
  if (!entry) {
    document.title = 'Not here · Studio · Loadout';
    app.replaceChildren(header(''), el('main', { class: 'v2 home notice' },
      el('h1', { class: 'h2' }, 'That draft is not here'),
      el('p', { class: 'lede' }, 'Drafts are kept in the browser they were made in. It may have been removed, or made on another computer.'),
      el('p', {}, el('a', { class: 'btn btn-primary', href: '#/studio' }, 'Go to the studio'))));
    return () => {};
  }
  return editorPage(app, { id, entry, drafts, kept, query, studio });
}

// Where the drafts live, chosen once for the page's lifetime: every visit to #/studio... uses the same storage and the
// same drafts, so without the browser's storage (a private window, blocked site data) a draft made here is still here
// after a change of address, until the tab closes.
let place = null;
function placeOf() {
  if (place) return place;
  const where = pickStorage(typeof window === 'undefined' ? undefined : window);
  place = { kept: where.kept, drafts: createDrafts(where.storage), studio: studioFor(where) };
  return place;
}

/**
 * What 'Put in my bag' calls: { ready (can it be called now), toBag (window.loadout.studio.toBag's answer) }. When the
 * browser keeps the drafts this is window.loadout.studio, which reads the same localStorage. Without storage,
 * window.loadout.studio keeps its own drafts in memory and cannot see this page's, so the page uses its own
 * window.loadout.studio (app/api-studio.js createStudio) over the page's memory, the same code on the same drafts.
 */
function studioFor(where) {
  if (where.kept) {
    return {
      ready: () => typeof window.loadout?.studio?.toBag === 'function',
      toBag: (id) => window.loadout.studio.toBag(id),
    };
  }
  let own = null;
  return {
    ready: () => typeof window.loadout?.studio?.toBag === 'function',
    toBag: async (id) => {
      const m = await import('./api-studio.js');
      own ??= m.createStudio({ window, storage: where.storage, kept: false });
      const r = await own.toBag(id);
      // the footer already says the draft is not kept; that warning is written for agents
      return r && Array.isArray(r.warnings) ? { ...r, warnings: r.warnings.filter((w) => w !== m.NOT_KEPT) } : r;
    },
  };
}
