// The "Add to my bag" button an asset page shows (sprite, sound or music). Once the asset is in the bag
// the page says "In your bag" and the button reads "Update": it then changes that item instead of adding another.
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
 * Returns one element: "In your bag" (once it is), the button, a line that confirms what happened, and a "Go to bag" link.
 * The wording is the same everywhere on the site: "Add to my bag", then "In your bag" with "Update".
 */
export function addToBag(kind, id, getSettings, query) {
  let key = (query && query.bag) || keyFromAddress();      // the bag item this page stands for: the one it was opened from, or the one it just added
  const updating = () => { const it = key ? bag.get(key) : null; return !!it && it.id === id && it.kind === kind; };

  const there = el('span', { class: 'in-bag', hidden: true }, 'In your bag');
  const btn = el('button', { type: 'button', class: 'btn add-btn' });
  const note = el('span', { class: 'add-note', role: 'status' });
  const go = el('a', { class: 'ghost go-bag', href: '#/bag', hidden: true }, 'Go to bag');
  const box = el('div', { class: 'add-to-bag' }, there, btn, note, go);
  const sync = () => { const yes = updating(); there.hidden = !yes; btn.textContent = yes ? 'Update' : 'Add to my bag'; };

  btn.addEventListener('click', () => {
    let settings;
    try { settings = getSettings(); } catch (e) { note.textContent = `That could not be added: ${e.message}.`; return; }
    if (updating()) {
      bag.update(key, settings);
      note.textContent = 'Updated in your bag.';
    } else {
      // from now on this page stands for that item (a second version is made from the bag: "Add another copy")
      key = bag.add({ kind, id, settings });
      note.textContent = `Added to your bag. It now holds ${bag.count()} item${bag.count() === 1 ? '' : 's'}.`;
    }
    // a browser that keeps nothing (private window, blocked site data) is said where the adding happens
    if (!bag.kept()) note.textContent += ' This browser is not keeping your bag: it will be gone when you reload or close the page. Download it or copy its link from your bag before you leave.';
    go.hidden = false;
    sync();
  });
  sync();
  return box;
}
