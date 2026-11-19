// What an asset goes with, shown on its own page: the sounds a sprite uses, the sprites that use a
// sound, the bundles it is in, and other assets like it. All of it comes from the catalogue
// (app/catalog.js), so a newly added asset gets these with no extra work.
import { el } from './ui.js';
import { assetById, bundlesOf, spritesUsing, soundsOf } from './catalog.js';
import { similarAssets } from './browse.js';

const line = (key, label, rows, href) => (rows.length
  ? el('p', { class: 'rel', 'data-rel': key }, el('span', { class: 'rel-label' }, label), rows.map((r, i) => [i ? ', ' : ' ', el('a', { href: href(r) }, r.name)]))
  : null);

/**
 * The "goes with" lines for one asset, each a list of links:
 *   a sprite   "Sounds it uses"      a sound or track   "Used by" (the sprites that play it)
 *   all        "In these kits"
 * Returns one element, or null when there is nothing to say.
 */
export function goesWith(id) {
  const row = assetById(id);
  if (!row) return null;
  const lines = [
    row.kind === 'sprite'
      ? line('sounds', 'Sounds it uses', soundsOf(id), (r) => `#/${r.kind}/${r.id}`)
      : line('sprites', 'Used by', spritesUsing(id), (r) => `#/sprite/${r.id}`),
    line('bundles', 'In these kits', bundlesOf(id), (b) => `#/bundle/${b.id}`),
  ].filter(Boolean);
  return lines.length ? el('section', { class: 'related', 'aria-label': 'Goes with' }, lines) : null;
}

/** "More like this" for the foot of an asset page: one row of cards, filled in when the search is ready. */
export function moreLikeThis(id) {
  const box = similarAssets(id, { count: 4 });
  box.classList.replace('similar', 'more-like');      // the page's own section, laid out by the page (style.css)
  return box;
}
