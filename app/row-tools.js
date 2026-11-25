// What a row of the bag's list can do to its item, as small icon buttons with no words (each named for a screen reader
// and with a tooltip): Play (a sound or a track), Surprise me (a random version of it, at once), Open its page,
// Duplicate (a copy right after it) and Remove. The bag page and the playground draw the same list, so both use these
// (docs/site-design.md, section 5).
//
//   surpriseButton(item, asset, name, { onDone })   the magic button; changes the item in the bag
//   duplicateButton(item, name, { onDone })         puts a copy after the item. onDone(newKey)
//   removeButton(label, onclick)  pageLink(href, name)  playLink(item, name)  playButton(name)  setPlaying(btn, ...)
import { bag } from './bag.js';
import { spriteModel, soundModel } from './panel-model.js';
import { standardOf } from './bag-edit.js';
import { makeMagic } from './magic.js';
import { el } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
// 16-unit pictures, drawn with a line (filled ones say so)
const ICONS = {
  copy: 'M5.5 5.5h7v7h-7zM3.5 10.5v-7h7',
  game: 'M5 5h6a3 3 0 0 1 2.9 3.8l-.7 2.6a1.4 1.4 0 0 1-2.4.6L9.5 10.5h-3l-1.3 1.5a1.4 1.4 0 0 1-2.4-.6l-.7-2.6A3 3 0 0 1 5 5ZM5.5 7v2.5M4.25 8.25h2.5M10.5 7.6v.01M11.8 9v.01',
  open: 'M9 3h4v4M13 3 7.5 8.5M11.5 10v3h-9V4.5h3',
  remove: 'M2.5 4.5h11M6 4.5V2.8h4v1.7M4 4.5l.7 8.7h6.6l.7-8.7M6.7 7v3.8M9.3 7v3.8',
  play: { d: 'M5 3.2v9.6L12.6 8z', fill: true },
  stop: { d: 'M4.5 4.5h7v7h-7z', fill: true },
  busy: 'M8 2.5a5.5 5.5 0 1 1-5.5 5.5',
};
function icon(name) {
  const def = ICONS[name], d = typeof def === 'string' ? def : def.d, fill = typeof def !== 'string';
  const n = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', class: `row-glyph is-${name}`, fill: fill ? 'currentColor' : 'none', stroke: fill ? 'none' : 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) n.setAttribute(k, v);
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); n.append(p);
  return n;
}
const iconBtn = (name, label, attrs = {}) => el('button', { type: 'button', class: `row-icon ${attrs.class ?? ''}`.trim(), 'aria-label': label, title: attrs.title ?? label, onclick: attrs.onclick }, icon(name));

/** Give a bag item a random version of itself (the same as the panel's Surprise me). Returns false when the item is gone. */
export function surpriseItem(key, asset) {
  const item = bag.get(key);
  if (!item || !asset) return false;
  const model = item.kind === 'sprite' ? spriteModel(asset) : soundModel(asset);
  return bag.update(key, model.surprise({ ...standardOf(item.kind, asset), ...item.settings }));
}

/**
 * "Surprise me" for one row: the magic button as a star alone, named after the thing. asset: the sprite or patch, or a
 * function that gives it (or a promise of it), for a list that has not loaded every asset it shows (the tray).
 */
export function surpriseButton(item, asset, name, { onDone = () => {} } = {}) {
  const run = async () => {
    let a = asset;
    try { if (typeof a === 'function') a = await a(); } catch (e) { console.warn(`surprise ${item.id}:`, e); return; }
    if (surpriseItem(item.key, a)) onDone();
  };
  const b = makeMagic(el('button', { type: 'button', class: 'btn row-surprise', 'aria-label': `Surprise me: ${name}`, title: 'Surprise me', onclick: run }));
  b.classList.add('is-icon');
  return b;
}

export function duplicateButton(item, name, { onDone = () => {} } = {}) {
  return iconBtn('copy', `Duplicate ${name}`, { class: 'row-duplicate', title: 'Duplicate', onclick: () => { const key = bag.duplicate(item.key); if (key) onDone(key); } });
}

export const removeButton = (label, onclick) => iconBtn('remove', label, { class: 'row-remove', title: 'Remove', onclick });

/** The playground, opened with this item picked (marked in the scene, its card shown). */
export const playLink = (item, name) => el('a', { class: 'row-icon row-play', href: `#/play?pick=${encodeURIComponent(item.key)}`, 'aria-label': `Try ${name} in the playground`, title: 'Open in the playground' }, icon('game'));

/** The way to the item's own page (a link: it carries the item's settings). */
export const pageLink = (href, name, attrs = {}) => el('a', { class: 'bag-act row-icon', href, 'aria-label': `Open the page of ${name}`, title: 'Open its page', ...attrs }, icon('open'));

/** Play for a sound or a track; setPlaying() turns it into Stop, or a waiting circle while a track gets ready. */
export function playButton(name) {
  const b = el('button', { type: 'button', class: 'row-icon play' });
  setPlaying(b, 'play', name);
  return b;
}
export function setPlaying(btn, state, name) {
  // (while a track gets ready, a press stops it: it is named Stop, and its tooltip says why it waits)
  // the picture is changed in place, not replaced: the press that changed it is still on its way up through the row,
  // which asks whether it came from a button
  const want = icon(state), have = btn.querySelector('svg');
  if (!have) btn.append(want);
  else {
    for (const a of ['class', 'fill', 'stroke']) have.setAttribute(a, want.getAttribute(a));
    have.firstElementChild.setAttribute('d', want.firstElementChild.getAttribute('d'));
  }
  btn.setAttribute('aria-label', `${state === 'play' ? 'Play' : 'Stop'} ${name}`);
  btn.title = state === 'play' ? 'Play' : state === 'stop' ? 'Stop' : 'Getting the track ready…';
  btn.classList.toggle('is-on', state !== 'play');
}
