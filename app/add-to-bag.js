// The "Add to bag" button an asset page shows (sprite, sound or music).
// When the page was opened from the bag ("Change"), its address carries the
// item's key as `bag=<key>`, and the button updates that item instead.
import { el } from './ui.js';
import { bag } from './bag.js';

/** The bag key carried in the current address (read once, when the page opens: pages rewrite their address as you edit). */
function keyFromAddress() {
  const h = typeof location === 'undefined' ? '' : location.hash;
  const q = h.indexOf('?');
  return q < 0 ? null : new URLSearchParams(h.slice(q + 1)).get('bag');
}

/**
 * A page's own address with the bag key kept on it, so that after an edit and a reload the
 * page still updates the item it was opened for. Pages call it where they rewrite their address:
 * history.replaceState(null, '', keepBag(link(), query))
 * (Not for "Copy link": a shared link must not point into someone else's bag.)
 */
export function keepBag(hash, query) {
  const key = query && query.bag;
  if (!key) return hash;
  return `${hash}${hash.includes('?') ? '&' : '?'}bag=${encodeURIComponent(key)}`;
}

/**
 * kind: 'sprite' | 'sound' | 'music'; id: the asset's id;
 * getSettings(): the page's current settings (sprite { params, cues, scale }, sound { params, style, seed }, music { params, style });
 * query (optional): the page's parsed address query; `query.bag` is the item to update.
 * Returns one element: the button, a line that confirms what happened, and a "Go to bag" link.
 */
export function addToBag(kind, id, getSettings, query) {
  const key = (query && query.bag) || keyFromAddress();
  const updating = () => { const it = key ? bag.get(key) : null; return !!it && it.id === id && it.kind === kind; };

  const btn = el('button', { type: 'button', class: 'btn add-btn' });
  const note = el('span', { class: 'add-note', role: 'status' });
  const go = el('a', { class: 'ghost go-bag', href: '#/bag', hidden: true }, 'Go to bag');
  const box = el('div', { class: 'add-to-bag' }, btn, note, go);
  const sync = () => { btn.textContent = updating() ? 'Update in bag' : 'Add to bag'; };

  btn.addEventListener('click', () => {
    let settings;
    try { settings = getSettings(); } catch (e) { note.textContent = `That could not be added: ${e.message}.`; return; }
    if (updating()) {
      bag.update(key, settings);
      note.textContent = 'Updated in your bag.';
    } else {
      // each press adds a new item, so two versions of one asset can sit in the bag side by side
      bag.add({ kind, id, settings });
      note.textContent = `Added to your bag. It now holds ${bag.count()} item${bag.count() === 1 ? '' : 's'}.`;
    }
    go.hidden = false;
    sync();
  });
  sync();
  return box;
}
