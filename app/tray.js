// The bag tray (docs/playground-tray-workbench.md, section 2): the bag always on screen at the right edge, filling up as
// the creator adds things. Two sizes:
//   'full'  the library (1024 px and wider): "Your bag", the count, Download; a short live scene of the bag that opens
//           the playground (app/bag-scene.js); then the list: picture, name, type, change dot, and the bag list's icon
//           buttons (Surprise me, Open in the playground, Duplicate, Remove: app/row-tools.js). A row
//           opens that thing's page with its bag item. An empty bag says what to do in one sentence.
//   'slim'  the asset pages (1280 px and wider): the count, Download, then the pictures with their change dots; the
//           thing on the page is marked; "+N more" when they do not fit.
// Narrower than that, app/css/tray.css hides it (the header's Bag button stays). It follows the bag live, also a change
// made in another tab (app/bag.js reloads on the storage event and tells its listeners).
//
//   const t = bagTray({ size: 'full' });   app.append(t.node);   ...   t.stop();
import { el, saveBlob } from './ui.js';
import { bag, lookOf } from './bag.js';
import { assetById, spriteNow, loadSprite, loadSound } from './catalog.js';
import { soundById } from './audio.js';
import { labelFor } from '../catalog/schema.js';
import { cleanParams } from '../engine/sprite.js';
import { renderThemedFrame, defaultTheme } from '../engine/theme.js';
import { artStyleOf, stylesOf, pixelsOf } from '../engine/styles.js';
import { changesOf } from './bag-edit.js';
import { packageFiles } from './bundle.js';
import { zip } from './zip.js';
import { packageWords } from './changes.js';
import { icon, ICON } from './asset-shell.js';
import { bagScene } from './bag-scene.js';
import { surpriseButton, duplicateButton, removeButton, playLink } from './row-tools.js';

const DOWN = 'M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10';
export const EMPTY = 'Press + on anything and it lands here.';
const things = (n) => (n === 1 ? 'thing' : 'things');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A bag item's page, opened on that item (its settings are read from the bag). */
export const itemHref = (item) => `#/${item.kind}/${item.id}?bag=${encodeURIComponent(item.key)}`;

/** The asset an item is of, when it is here already (a sprite's program, a sound's patch), else null. */
const assetNow = (item) => (item.kind === 'sprite' ? spriteNow(item.id) : soundById[item.id] ?? null);

/** Does an item look other than its catalogue picture? (its own settings, its own look, or a bag look that is not the plain one) */
function drawnOwnWay(item, plainBag) {
  const s = item.settings ?? {};
  return !plainBag || !!lookOf(s) || !!s.artStyle || Object.keys(s.params ?? {}).length > 0;
}

/** A sprite as the bag shows it: the first frame of its preview, in its settings and look. */
function spriteStill(sprite, settings, theme) {
  const s = settings ?? {}, p = cleanParams(sprite, s.params ?? {});
  const style = artStyleOf(sprite, s.artStyle), first = stylesOf(sprite)[0];
  const record = lookOf(s) ? undefined : s.lookParams;
  const look = lookOf(s) ? null : theme;
  const g = style === first && style === 'pixel' ? renderThemedFrame(sprite, sprite.preview, 0, p, look ?? theme, { record }) : pixelsOf(renderThemedFrame(sprite, sprite.preview, 0, p, look ?? theme, { style, record }), style);
  const cv = document.createElement('canvas');
  cv.width = g.w; cv.height = g.h;
  cv.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
  return cv;
}

/**
 * size: 'full' (the library) or 'slim' (an asset page). current: { kind, id, key? }, the thing on the page (marked).
 * Returns { node, stop() }.
 */
export function bagTray({ size = 'full', current = null } = {}) {
  const full = size === 'full';
  const countN = el('b', { class: 'num' }, '0');
  const countWord = el('span', {}, ' things');
  const status = el('p', { class: 'tray-status', role: 'status' });
  const dl = el('button', { type: 'button', class: 'btn btn-sm btn-secondary tray-dl', title: 'Download everything in your bag as one package', onclick: () => download() }, icon(DOWN), el('span', {}, 'Download'));
  const list = el('ul', { class: 'tray-list', 'aria-label': 'What is in your bag' });
  const empty = el('p', { class: 'tray-empty' }, full ? EMPTY : 'Empty');
  const more = el('p', { class: 'tray-more', hidden: true });
  const scene = full ? bagScene({ max: 7 }) : null;
  const node = el('aside', { class: `tray tray-${size}`, 'aria-label': 'Your bag' },
    el('div', { class: 'tray-head' },
      el('h2', { class: full ? 'tray-title' : 'tray-title sr' }, 'Your bag'),
      el('p', { class: 'tray-count' }, countN, countWord),
      dl),
    status,
    scene ? scene.node : null,
    list, empty, more);

  // ---- Download: the bag's own package, as the bag page makes it
  let busy = false;
  const say = (text) => { status.textContent = text; };
  async function download() {
    if (busy || !bag.count()) return;
    busy = true; dl.disabled = true;
    bag.fillLooks();
    const items = bag.items();
    say(items.some((i) => i.kind === 'music') ? 'Putting your package together. Music takes a few seconds…' : 'Putting your package together…');
    try {
      const files = await packageFiles({ items, theme: bag.theme(), scale: 1, onProgress: say });
      saveBlob(zip(files), 'loadout-package.zip');
      say(`Downloaded loadout-package.zip: ${packageWords(files.map((f) => f.name))}.`);
    } catch (e) {
      console.warn(e);
      say(`The download did not start: ${e.message}. Try again.`);
    }
    busy = false; dl.disabled = !bag.count();
  }

  // ---- the rows
  const rows = new Map();       // key -> { li, sig }
  let plainBag = true, theme = bag.theme(), themeKey = '', gone = false;
  const want = new Set();       // sprite ids whose program is being brought to draw their picture or their dot

  function picture(item, row) {
    const box = el('span', { class: 'tray-pic tile', 'aria-hidden': 'true' });
    if (item.kind !== 'sprite') {
      box.classList.add('is-sound');
      box.append(icon(item.kind === 'music' ? ICON.note : ICON.speaker, { size: full ? 18 : 20 }));
      return box;
    }
    const sprite = spriteNow(item.id);
    if (sprite && drawnOwnWay(item, plainBag)) {
      try { box.append(spriteStill(sprite, item.settings, theme)); return box; } catch (e) { console.warn('tray picture:', e); }
    }
    if (row?.thumb) box.append(el('img', { src: row.thumb, alt: '', loading: 'lazy', decoding: 'async' }));
    if (!sprite && drawnOwnWay(item, plainBag)) bring(item.id);
    return box;
  }
  function bring(id) {
    if (want.has(id)) return;
    want.add(id);
    loadSprite(id).then(() => { if (!gone) draw(); }).catch(() => {});
  }
  function changed(item) {
    const asset = assetNow(item);
    if (!asset) {
      if (item.kind === 'sprite' && Object.keys(item.settings?.params ?? {}).length) bring(item.id);
      return 0;
    }
    try { return changesOf(item, asset); } catch { return 0; }
  }
  function rowOf(item) {
    const row = assetById(item.id);
    const name = row?.name ?? item.id;
    const n = changed(item);
    const sig = JSON.stringify([item.settings, themeKey, !!assetNow(item), name]);
    const old = rows.get(item.key);
    if (old && old.sig === sig) return old.li;
    const dot = n ? el('span', { class: 'dot', title: `${n} ${n === 1 ? 'change' : 'changes'}` }) : null;
    const pic = picture(item, row);
    if (dot && !full) pic.append(dot);
    const label = `${name}${n ? ', changed' : ''}`;
    const link = full
      ? el('a', { class: 'tray-row', href: itemHref(item), title: `Open ${name}` }, pic,
        el('span', { class: 'tray-words' }, el('span', { class: 'tray-name' }, name), el('span', { class: 'tray-type' }, labelFor('type', row?.type) || (item.kind === 'music' ? 'Music' : 'Sound'))),
        dot ? el('span', { class: 'tray-dot' }, dot, el('span', { class: 'sr' }, ', changed')) : null)
      : el('a', { class: 'tray-row', href: itemHref(item), title: name, 'aria-label': label }, pic);
    // the same icon buttons as the bag's list; Surprise me brings the asset first when it is not here yet
    const assetFor = () => assetNow(item) ?? (item.kind === 'sprite' ? loadSprite(item.id) : loadSound(item.id));
    const out = full ? removeButton(`Take ${name} out of your bag`, () => takeOut(item.key)) : null;
    if (out) out.classList.add('tray-x');
    const li = el('li', { 'data-key': item.key, 'data-id': item.id, 'data-kind': item.kind }, link,
      full ? el('span', { class: 'tray-acts' }, surpriseButton(item, assetFor, name), playLink(item, name), duplicateButton(item, name), out) : null);
    rows.set(item.key, { li, sig });
    return li;
  }
  function takeOut(key) {
    const li = rows.get(key)?.li;
    const next = li?.nextElementSibling ?? li?.previousElementSibling;
    bag.remove(key);
    // the focus stays in the list, on the row that took its place
    (next?.querySelector('.tray-x') ?? dl).focus();
  }
  function mark() {
    markOnly();
    fit();
  }
  function markOnly() {
    for (const li of list.children) {
      const yes = !!current && li.dataset.kind === current.kind && li.dataset.id === current.id && (!current.key || li.dataset.key === current.key || !bag.has(current.key));
      if (yes) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
    }
  }

  // ---- slim: as many pictures as fit, then "+N more"
  function fit() {
    if (full) return;
    const lis = [...list.children];
    for (const li of lis) li.hidden = false;
    more.hidden = true;
    if (!lis.length || !node.clientHeight) return;
    const room = node.getBoundingClientRect().bottom - list.getBoundingClientRect().top;
    const step = lis[0].getBoundingClientRect().height + 6;
    let fits = Math.max(0, Math.floor((room + 6) / step));
    if (fits < lis.length) fits = Math.max(1, Math.floor((room + 6 - 28) / step));      // room for the "+N more" line
    if (fits >= lis.length) return;
    // the thing on the page stays in sight: it takes the last place shown when it would be among the hidden ones
    const shown = new Set(lis.slice(0, fits));
    const here = lis.find((li) => li.getAttribute('aria-current') === 'true');
    if (here && !shown.has(here) && fits > 0) { shown.delete(lis[fits - 1]); shown.add(here); }
    lis.forEach((li) => { li.hidden = !shown.has(li); });
    more.textContent = `+${lis.length - fits} more`;
    more.hidden = false;
  }

  function draw() {
    if (gone) return;
    const items = bag.items();
    theme = bag.theme();
    themeKey = JSON.stringify(theme);
    plainBag = same(theme, defaultTheme());
    const n = items.length;
    countN.textContent = String(n);
    countWord.textContent = ` ${things(n)}`;
    dl.disabled = busy || !n;
    if (!n && !busy) say('');
    const lis = items.map(rowOf);
    for (const key of [...rows.keys()]) if (!items.some((i) => i.key === key)) rows.delete(key);
    // the rows in bag order; ones already there stay where they are (a new one appears at once at the end)
    const at = new Set(lis);
    for (const child of [...list.children]) if (!at.has(child)) child.remove();
    lis.forEach((li, i) => { if (list.children[i] !== li) list.insertBefore(li, list.children[i] ?? null); });
    empty.hidden = n > 0;
    mark();
  }

  // ---- full: the panel starts under the header and stays while the page scrolls (the header scrolls away above it)
  let topRaf = 0;
  const placeTop = () => {
    topRaf = 0;
    const head = node.parentElement?.querySelector(':scope > header.top');
    const top = Math.max(0, Math.round(head ? head.getBoundingClientRect().bottom : 0));
    if (node.style.top !== `${top}px`) node.style.top = `${top}px`;
  };
  const onScroll = () => { if (!topRaf) topRaf = requestAnimationFrame(placeTop); };
  if (full) { addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); }

  const off = bag.onChange(() => draw());
  const ro = new ResizeObserver(() => { fit(); if (full) placeTop(); });
  ro.observe(node);
  draw();
  return {
    node,
    /** Call once the tray is in the page: it finds its place under the header. */
    placed() { if (full) { placeTop(); const head = node.parentElement?.querySelector(':scope > header.top'); if (head) ro.observe(head); } fit(); },
    /** The thing on the page changed (its bag item was made): mark it. */
    setCurrent(c) { current = c; mark(); },
    stop() { gone = true; off(); ro.disconnect(); if (scene) scene.stop(); removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); cancelAnimationFrame(topRaf); },
  };
}
