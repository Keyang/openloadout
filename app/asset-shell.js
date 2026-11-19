// The frame of an asset page (docs/site-design.md, section 5, "Asset"): two columns that fill the window. On the left
// the asset itself: its name, its line, what it goes with (its kits, the sounds it uses), its live picture or its play
// button, and whatever the page puts under that; on the right the editing panel (app/panel.js). Nothing on the page
// scrolls on a desktop window; on a phone the left column stays pinned and the panel scrolls under it (app/css/asset.css).
// "More like this" opens from the panel's menu, over the left column.
import { el } from './ui.js';
import { goesWith, moreLikeThis } from './related.js';
import { assetById } from './catalog.js';

const NS = 'http://www.w3.org/2000/svg';
/** A small drawn icon (16 units square), in the text colour. `fill`: a solid shape, not a line. */
export function icon(d, { size = 16, fill = false } = {}) {
  const n = document.createElementNS(NS, 'svg');
  n.setAttribute('viewBox', '0 0 16 16'); n.setAttribute('width', size); n.setAttribute('height', size); n.setAttribute('aria-hidden', 'true');
  n.setAttribute('fill', fill ? 'currentColor' : 'none');
  if (!fill) { n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '1.5'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round'); }
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); n.append(p);
  return n;
}
export const ICON = {
  play: 'M4.5 2.5v11l9-5.5z', pause: 'M4 2.5h3v11H4zM9 2.5h3v11H9z', stop: 'M3.5 3.5h9v9h-9z',
  close: 'M3.5 3.5l9 9M12.5 3.5l-9 9',
  speaker: 'M2.5 6v4h2.5l3.5 3V3L5 6zM10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.5 6.5 0 0 1 0 9',
  note: 'M6 12V3.5l6-1.5v8.5M6 12a1.8 1.8 0 1 1-3.6 0A1.8 1.8 0 0 1 6 12Zm6-1.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z',
};
/** Put one icon in a button, in place of whatever it showed. */
export const setIcon = (btn, name, opts = { fill: true }) => { btn.replaceChildren(icon(ICON[name], opts)); };

/**
 * assetShell({ kind, id, name, line, made, stage, under, panel }) -> { main, openMore(), close() }
 *   kind     'sprite' | 'sound' | 'music'
 *   id       the asset's id (what it goes with and "More like this" are looked up by it)
 *   name     its name (the page's heading); line: its one line of description
 *   made     the note of an asset made on this visit (catalog.js madeNote), or null
 *   edit     the page's edit session: the note "put it in your bag to keep it" goes once it is in the bag
 *   stage    the picture or the play button: one element; it takes the height that is left
 *   under    elements under it (a sprite's animations and frames)
 *   panel    the editing panel (editPanel(...)); its node is the right-hand column
 * `main` goes in the page after the header. openMore is what the panel's "More like this" does.
 */
export function assetShell({ kind, id, name, line = '', made = null, edit = null, stage, under = [], panel }) {
  const madeNode = made ? el('p', { class: 'made-here' }, made.text) : null;
  // (a draft's note says what to fix and stays; the other only asks for what has then been done)
  const syncMade = () => { if (madeNode && !made.draft && edit) madeNode.hidden = edit.inBag(); };
  const offMade = madeNode && edit ? edit.onChange(syncMade) : null;
  syncMade();
  const related = goesWith(id);      // the sounds it uses or the sprites that use it, and its kits: links, from the catalogue
  const head = el('div', { class: 'rx-head' },
    el('h1', {}, name),
    line ? el('p', { class: 'blurb' }, line) : null,
    madeNode,
    related);

  // "More like this": a sheet over the left column, opened from the panel's menu. Its cards are found when it is first opened.
  let more = null, opener = null;
  const closeBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: () => closeMore() }, icon(ICON.close));
  const row = assetById(id);
  const libraryHref = row ? `#/browse?kind=${row.kind}${row.type ? `&type=${encodeURIComponent(row.type)}` : ''}` : '#/browse';
  const sheet = el('div', { class: 'rx-more', role: 'dialog', 'aria-label': 'More like this', hidden: true },
    closeBtn, el('p', { class: 'rx-more-foot' }, el('a', { class: 'link', href: libraryHref }, 'See everything like it in the library')));
  function openMore() {
    if (!more) { more = moreLikeThis(id); closeBtn.after(more); }
    opener = document.activeElement;
    sheet.hidden = false;
    closeBtn.focus();
  }
  function closeMore() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (opener && opener.isConnected) opener.focus();
  }
  const onKey = (e) => { if (e.key === 'Escape' && !sheet.hidden) closeMore(); };
  document.addEventListener('keydown', onKey);

  const left = el('section', { class: 'rx-stage', 'aria-label': `${name}, live` }, head, stage, under, sheet);
  const main = el('main', { class: `v2 rx rx-${kind}` }, left, panel.node);
  return { main, openMore, closeMore, close() { document.removeEventListener('keydown', onKey); if (offMade) offMade(); } };
}
