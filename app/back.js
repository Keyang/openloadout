// The way back from an asset page. When a visitor opens a sprite, a sound or a track from a list (search
// results, the front page, their bag, a bundle, the playground), this remembers where they were: the address
// with its search and filters, and the place on the page. The header then shows "Back to results" (or to the
// bag, the bundle, the playground), and going back, by that link or the browser's own Back, puts the list where
// it was. Kept for the tab only (sessionStorage), so a reload of the asset page still knows the way.
import { bundleById } from './catalog.js';

const KEY = 'loadout-came-from';
const ASSET = new Set(['sprite', 'sound', 'music']);
const LIST = { '': 'home', browse: 'results', bag: 'bag', bundle: 'bundle', play: 'play', bundles: 'bundles' };

const partsOf = (hash) => String(hash || '').replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
const tidy = (hash) => (hash && hash !== '#' ? hash : '#/');
const isAsset = (hash) => ASSET.has(partsOf(hash)[0]);

function read() {
  try { const r = JSON.parse(sessionStorage.getItem(KEY)); return r && typeof r.hash === 'string' && r.hash.startsWith('#/') ? r : null; } catch { return null; }
}
function write(record) {
  try { if (record) sessionStorage.setItem(KEY, JSON.stringify(record)); else sessionStorage.removeItem(KEY); } catch { /* no storage: no way back is offered */ }
}

/**
 * Called by the router at every move, while the page being left is still on screen.
 * from: the address being left (null on the first page of a visit); to: the address being opened.
 */
export function leaving(from, to) {
  if (from == null || !isAsset(to) || isAsset(from)) return;        // between asset pages the way back stays the same
  const kind = LIST[partsOf(from)[0] ?? ''];
  if (!kind) return;
  const id = partsOf(to)[1];
  // where the card they pressed sits on the screen: a list is put back by that, which holds even if the page above it changed
  const place = kind === 'results' && id ? document.querySelector(`ul.results > li[data-id="${CSS.escape(id)}"]`) : null;
  write({ hash: tidy(from), kind, y: Math.round(window.scrollY), id: place ? id : null, top: place ? Math.round(place.getBoundingClientRect().top) : null });
}

/**
 * Called by the router when a page has been opened. Back on the list the visitor left: its place on the page
 * is put back (the list may still be filling in, so this waits a moment for it). Any other page that is not
 * an asset page ends the trail.
 */
export function arrived(hash = location.hash) {
  const record = read();
  if (!record || isAsset(hash)) return;
  write(null);
  if (tidy(hash) !== record.hash) return;
  let tries = 0, held = 0;
  const put = () => {
    if (tidy(location.hash) !== record.hash) return;                // moved on meanwhile
    const place = record.id ? document.querySelector(`ul.results > li[data-id="${CSS.escape(record.id)}"]`) : null;
    if (place) {
      window.scrollBy(0, place.getBoundingClientRect().top - record.top);
      // the list above may still settle (cards being made, pictures arriving): hold the card where it was for a moment
      if (++held < 20) requestAnimationFrame(put);
      return;
    }
    const room = document.documentElement.scrollHeight - window.innerHeight;
    if (!record.id && room >= record.y - 1) { window.scrollTo(0, record.y); return; }
    if (++tries < 180) requestAnimationFrame(put); else if (!record.id) window.scrollTo(0, record.y);
  };
  requestAnimationFrame(put);
}

/** The link an asset page shows at its top: { href, label }, or null on any other page. */
export function wayBack(hash = location.hash) {
  if (!isAsset(hash)) return null;
  const record = read();
  if (!record) return { href: '#/browse', label: 'Browse everything' };
  const bundle = record.kind === 'bundle' ? bundleById(partsOf(record.hash)[1]) : null;
  const label = record.kind === 'bag' ? 'Back to your bag' : record.kind === 'play' ? 'Back to the playground' : record.kind === 'bundles' ? 'Back to bundles'
    : record.kind === 'bundle' ? `Back to ${bundle ? bundle.name : 'the bundle'}` : record.kind === 'home' ? 'Back to the start' : 'Back to results';
  return { href: record.hash, label };
}
