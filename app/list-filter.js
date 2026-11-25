// Search and quick filters for the bag's lists: the tray beside the library, the bag page and the playground's list.
// A search box (name, type or id; every word has to match) and one chip per type in the bag (All, Character 3, Music 1,
// ...). Only what is shown changes: nothing leaves the bag. A list shorter than MIN things shows none of it, and then
// shows everything.
//
//   const f = listFilter({ label, onChange });      f.node goes above the list
//   f.setItems(infos)        infos: [{ name, type }] for every row; draws the chips, hides itself for a short list
//   f.test(info) -> bool     is this row shown?
//   f.result(shown)          after the rows are shown or hidden: says when nothing matches
import { el } from './ui.js';
import { assetById } from './catalog.js';
import { labelFor } from '../catalog/schema.js';

export const MIN = 5;

/** A bag item's type in words, as the lists show it: "Character", "Sound effect", "Music". */
export function typeOf(item) {
  const t = labelFor('type', assetById(item.id)?.type);
  return t || (item.kind === 'music' ? 'Music' : item.kind === 'sound' ? 'Sound effect' : 'Sprite');
}

const words = (s) => s.toLowerCase().split(/\s+/).filter(Boolean);
const LENS = 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM10.3 10.3 13.5 13.5';
function lens() {
  const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round' })) n.setAttribute(k, v);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', LENS); n.append(p);
  return n;
}

export function listFilter({ label = 'Search your bag', onChange = () => {} } = {}) {
  let q = '', type = null, on = false, chipSig = '';
  const input = el('input', { type: 'search', placeholder: label, 'aria-label': label, autocomplete: 'off', spellcheck: 'false' });
  const chips = el('div', { class: 'chips list-find-types', role: 'group', 'aria-label': 'Show only' });
  const none = el('p', { class: 'list-find-none', hidden: true }, 'Nothing in your bag matches. ',
    el('button', { type: 'button', class: 'link', onclick: () => { clear(); input.focus(); } }, 'Show everything'));
  const node = el('div', { class: 'list-find', role: 'search', hidden: true }, el('div', { class: 'list-find-box' }, lens(), input), chips, none);

  const changed = () => { syncChips(); onChange(); };
  input.addEventListener('input', () => { q = input.value; onChange(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); e.stopPropagation(); input.value = ''; q = ''; onChange(); } });
  function clear() { input.value = ''; q = ''; type = null; changed(); }
  function syncChips() { for (const b of chips.children) b.setAttribute('aria-pressed', String((b.dataset.type || null) === type)); }

  return {
    node,
    setItems(infos) {
      on = infos.length >= MIN;
      node.hidden = !on;
      const counts = new Map();
      for (const i of infos) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
      if (type && !counts.has(type)) type = null;      // the last one of that type was taken out
      const sig = JSON.stringify([...counts]);
      if (sig !== chipSig) {
        chipSig = sig;
        const had = chips.contains(document.activeElement) ? document.activeElement.dataset.type ?? '' : null;
        const chip = (t, n) => el('button', { type: 'button', class: 'chip', 'data-type': t ?? '', onclick: () => { type = t; changed(); } }, t ?? 'All', el('span', { class: 'list-find-n' }, String(n)));
        chips.replaceChildren(chip(null, infos.length), ...[...counts].map(([t, n]) => chip(t, n)));
        if (had !== null) chips.querySelector(`[data-type="${CSS.escape(had)}"]`)?.focus();
      }
      syncChips();
    },
    test(info) {
      if (!on) return true;
      if (type && info.type !== type) return false;
      const hay = `${info.name} ${info.type} ${info.id ?? ''}`.toLowerCase();
      return words(q).every((w) => hay.includes(w));
    },
    result(shown) { none.hidden = !on || shown > 0; },
    active: () => on && (!!type || !!q.trim()),
  };
}
