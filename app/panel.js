// The editing panel (docs/site-design.md, sections 3 to 5): the right-hand column of an asset page, and the same thing
// beside the bag's list and the playground's scene. For one asset (a sprite, a sound or a track) and its edit session
// (app/editing.js) it shows, top to bottom:
//   Start from a version   the asset's ready-made versions as tiles, Surprise me, Start over
//   Fine-tune              its controls in tabs; every control with the change dot and its own Reset; a control that
//                          does nothing at the current settings is hidden (and a tab left with nothing to show); a
//                          colour is named in words beside its swatches
//   the footer             the saved state (or the warning that the browser is not keeping the bag), "Add to my bag" while
//                          it is not there, the pixel size (sprites), Download, and a small menu: Copy link, More like this,
//                          Remove from bag
// Everything the visitor does here goes through the session, so it is saved as it happens; the page listens to the
// session (edit.onChange) to redraw its picture or play its sound.
//
//   const panel = editPanel({ kind, asset, edit, ... })      -> { node, sync(), say(text), showTab(id), tab(), close() }
//
//   kind            'sprite' | 'sound' | 'music'
//   asset           the sprite's program, or the sound's or track's patch
//   edit            createEdit(...) from app/editing.js
//   name            what to call it (default: asset.name)
//   model           the controls' model (default: spriteModel(asset) or soundModel(asset), app/panel-model.js)
//   tabs            extra tabs the page fills itself: [{ id, label, node, changed?: () => boolean }]. One whose id is a
//                   tab the kind already has a place for ('sounds', 'look' on a sprite) takes that place; others go last
//   versions        how many version tiles (default 12; 0 for none)
//   versionPicture  (version, params) => HTMLCanvasElement | null: the picture on a version's tile (default: a sprite
//                   is drawn; a sound has none)
//   sizes           the pixel sizes offered, sprites only (default [1, 2, 4]); sizeNote(scale) -> the text beside them
//   onDownload      async () => text to say when done ("Downloaded ..."); the Download button is left out without it
//   downloadLabel   the button's words (default 'Download')
//   onCopyLink      async () => text to say. moreHref: where "More like this" goes, or onMore: () => void, what it does.
//                   Each is left out of the menu when not given
//   onAct           (what) => void, after the visitor acts here: 'version' | 'surprise' | 'startover' | 'control' | 'size' | 'add' | 'remove'
//   onTab           (id) => void, when a Fine-tune tab is shown (also the first one, when the panel is made): a page's own
//                   tab that is costly to draw (a row of pictures) waits for this
import { renderPixels } from '../engine/sprite.js';
import { colorName } from '../engine/color.js';
import { el } from './ui.js';
import { spriteModel, soundModel, SPRITE_TABS } from './panel-model.js';
import { versionsFor } from './versions.js';

/** A colour's everyday name with a capital, for the page: '#f2a030' -> 'Orange'. */
export const colourWord = (hex) => { const n = colorName(hex); return n ? n[0].toUpperCase() + n.slice(1) : 'Your own colour'; };
/** The names a row of swatches is read out by: two that share a name are told apart by their place ('Red, choice 2'). */
export function swatchNames(list) {
  const words = list.map(colourWord);
  return words.map((w, i) => (words.filter((x) => x === w).length > 1 ? `${w}, choice ${i + 1}` : w));
}

const svg = (d, size = 16) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  n.setAttribute('viewBox', '0 0 16 16'); n.setAttribute('width', size); n.setAttribute('height', size); n.setAttribute('aria-hidden', 'true');
  n.setAttribute('fill', 'none'); n.setAttribute('stroke', 'currentColor'); n.setAttribute('stroke-width', '1.5'); n.setAttribute('stroke-linecap', 'round'); n.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); n.append(p);
  return n;
};
const ICON = { more: 'M3.5 8h.01M8 8h.01M12.5 8h.01', note: 'M6 12V3.5l6-1.5v8.5M6 12a1.8 1.8 0 1 1-3.6 0A1.8 1.8 0 0 1 6 12Zm6-1.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0Z' };

/** One sprite frame as a canvas of its own size: the first frame of a looping clip, the middle of a one-shot. */
export function spritePicture(sprite, params, style) {
  const clip = sprite.clips[sprite.preview], frame = clip.loop === false ? Math.floor(clip.frames / 2) : 0;
  const g = renderPixels(sprite, sprite.preview, frame, params, style ? { style } : {});
  const cv = el('canvas', { width: g.w, height: g.h });
  cv.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
  return cv;
}
/** Where a picture has something drawn: { x, y, w, h } of its pixels that are not see-through, or null when it has none. */
export function drawnBox(cv) {
  const { data } = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);
  let x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    if (!data[(y * cv.width + x) * 4 + 3]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/**
 * The same pictures without the empty margin around what is drawn, all cut to one box (the smallest that holds every
 * one of them), so they are the same size and sit at the same scale side by side. A small thing in a large frame is
 * then shown larger in its tile. Pictures with nothing drawn are left as they are.
 */
export function trimPictures(list) {
  const boxes = list.map((cv) => (cv ? drawnBox(cv) : null)).filter(Boolean);
  if (!boxes.length) return list;
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 1), y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 1);
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + 1, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + 1;
  return list.map((cv) => {
    if (!cv) return cv;
    const w = Math.min(cv.width, x1) - x0, h = Math.min(cv.height, y1) - y0;
    if (w >= cv.width && h >= cv.height) return cv;
    const out = el('canvas', { width: w, height: h });
    out.getContext('2d').drawImage(cv, -x0, -y0);
    return out;
  });
}
/** Size a pixel picture inside its tile at a whole-number scale (or a whole-number fraction when it is larger than the tile). */
export function fitPicture(cv, box) {
  const w = box.clientWidth - 8, h = box.clientHeight - 8;
  if (w <= 0 || h <= 0) return;
  const up = Math.floor(Math.min(w / cv.width, h / cv.height));
  const k = up >= 1 ? Math.min(up, 4) : 1 / Math.ceil(Math.max(cv.width / w, cv.height / h));
  cv.style.width = `${cv.width * k}px`; cv.style.height = `${cv.height * k}px`;
}

export function editPanel({
  kind, asset, edit, name = asset.name, model = kind === 'sprite' ? spriteModel(asset) : soundModel(asset),
  tabs: extraTabs = [], versions: versionCount = 12, versionPicture = null, sizes = [1, 2, 4], sizeNote = null,
  onDownload = null, downloadLabel = 'Download', onCopyLink = null, moreHref = null, onMore = null, onAct = () => {}, onTab = null,
}) {
  const act = (what, next) => { if (next) edit.set(next); onAct(what); };
  let settings = edit.settings();

  // ---- Start from a version ----
  // (the name of the version on screen, then what a version does: a narrow panel keeps the name alone)
  const hintName = el('span', { class: 'hint-name' }), hintHelp = el('span', { class: 'hint-help' }, 'One click sets everything.');
  const hint = el('span', { class: 'hint' }, hintName, hintHelp);
  const strip = el('div', { class: 'vstrip' + (kind === 'sprite' ? '' : ' is-plain') });
  let versionList = [], versionTiles = [];
  const pictureOf = versionPicture ?? (kind === 'sprite' ? (v, params) => spritePicture(asset, params, settings.artStyle) : () => null);
  // The pictures are one size (trimPictures): they are shown at the largest whole-number scale that fits the tile's
  // width and the tallest a tile may be (--vmax, from the style sheet), and the tiles take the height that needs (--vh).
  // The arrows show while the row is wider than the panel (a short window lays the versions out as one row).
  const fitTiles = () => {
    const first = versionTiles.find((t) => t.cv);
    if (first && kind === 'sprite') {
      const w = first.pic.clientWidth - 8, most = (parseFloat(getComputedStyle(strip).getPropertyValue('--vmax')) || 96) - 8;
      if (w > 0) {
        const z = Math.min(w / first.cv.width, most / first.cv.height), k = z >= 1 ? Math.min(4, Math.floor(z)) : 1 / Math.ceil(1 / z);
        strip.style.setProperty('--vh', `${Math.max(56, Math.ceil(first.cv.height * k) + 8)}px`);
        for (const { cv } of versionTiles) if (cv) { cv.style.width = `${cv.width * k}px`; cv.style.height = `${cv.height * k}px`; }
      }
    } else for (const { pic, cv } of versionTiles) if (cv) fitPicture(cv, pic);
    syncNav();
  };
  const step = (dir) => strip.scrollBy({ left: dir * Math.max(120, strip.clientWidth * 0.75), behavior: 'smooth' });
  const navBack = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Earlier versions', onclick: () => step(-1) }, svg('M10 3.5 5.5 8l4.5 4.5'));
  const navOn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'More versions', onclick: () => step(1) }, svg('M6 3.5 10.5 8 6 12.5'));
  const nav = el('span', { class: 'vnav', hidden: true }, navBack, navOn);
  function syncNav() {
    const over = strip.scrollWidth > strip.clientWidth + 1;
    nav.hidden = !over;
    navBack.disabled = strip.scrollLeft <= 0;
    navOn.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  }
  strip.addEventListener('scroll', syncNav, { passive: true });
  // an ordinary mouse wheel moves the row sideways while there is more of it that way
  strip.addEventListener('wheel', (e) => {
    if (strip.scrollWidth <= strip.clientWidth + 1 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const to = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, strip.scrollLeft + e.deltaY));
    if (to === strip.scrollLeft) return;
    strip.scrollLeft = to; e.preventDefault();
  }, { passive: false });
  const tileWatch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitTiles);
  if (tileWatch) tileWatch.observe(strip);
  function drawVersions() {
    // every picture cut to the one box that holds them all: the same scale on every tile, as large as the tile allows
    let pictures = versionList.map((v) => { try { return pictureOf(v, model.applyVersion(settings, v).params); } catch (e) { console.error('version picture:', e); return null; } });
    try { pictures = trimPictures(pictures); } catch (e) { console.error('version picture:', e); }
    versionTiles = versionList.map((v, i) => {
      const cv = pictures[i];
      const pic = el('span', { class: 'vpic' }, cv ?? svg(ICON.note, 18));
      const btn = el('button', { type: 'button', class: 'vbtn', 'aria-pressed': 'false', title: v.name, onclick: () => act('version', model.applyVersion(edit.settings(), v)) }, pic, el('span', { class: 'name' }, v.name));
      return { v, btn, pic, cv };
    });
    strip.replaceChildren(...versionTiles.map((t) => t.btn));
    fitTiles();
    syncVersions();
  }
  // A sprite made on this visit is drawn in a worker: a picture asked for before its frames are here is the nearest
  // one there is, not the version's own. So its versions are brought first, and the tiles are drawn from them.
  let prepared = '';
  function drawWhenReady() {
    drawVersions();
    if (kind !== 'sprite' || typeof asset.prepare !== 'function' || !versionList.length) return;
    const style = settings.artStyle, key = `${style ?? ''}|${versionList.length}`;
    if (prepared === key) return;
    prepared = key;
    Promise.allSettled(versionList.map((v) => asset.prepare(model.applyVersion(settings, v).params, { clips: [asset.preview], style: style ?? undefined })))
      .then(() => { if (!gone) drawVersions(); });
  }
  function syncVersions() {
    let on = null;
    for (const t of versionTiles) { const yes = model.isVersion(settings, t.v); t.btn.setAttribute('aria-pressed', String(yes)); if (yes && !on) on = t.v.name; }
    hint.hidden = !versionTiles.length;
    hintName.textContent = on ? `${on}. ` : edit.changes() ? 'Your own mix. ' : '';
  }
  let gone = false;
  if (versionCount > 0) versionsFor(kind, asset, versionCount).then((list) => { if (gone) return; versionList = list; drawWhenReady(); });

  const versionsBlock = el('div', { class: 'rx-block' },
    el('div', { class: 'block-head' },
      el('h2', {}, 'Start from a version'), hint, nav,
      el('button', { type: 'button', class: 'btn btn-sm btn-secondary', 'data-act': 'surprise', onclick: () => act('surprise', model.surprise(edit.settings())) }, 'Surprise me'),
      el('button', { type: 'button', class: 'btn btn-sm btn-secondary', 'data-act': 'startover', onclick: () => { edit.startOver(); onAct('startover'); } }, 'Start over')),
    strip);

  // ---- Fine-tune: one pane per tab, all in the page, one shown ----
  const rows = new Map();       // control key -> { row, sync(control) }
  const partBoxes = new Map();  // part name -> its block in the Parts tab
  const set = (key, value) => act('control', model.set(edit.settings(), key, value));

  function controlRow(c) {
    const id = `c-${c.key}`;
    let body, sync;
    if (c.kind === 'range') {
      const input = el('input', { id, type: 'range', min: c.min, max: c.max, step: c.step, value: c.value, 'data-key': c.key, oninput: (e) => set(c.key, Number(e.target.value)) });
      const lo = el('span', { class: 'lo' }, c.lo ?? ''), hi = el('span', { class: 'hi' }, c.hi ?? '');
      // a sound's slider says its value in everyday words where a sprite's says its two ends
      const words = c.valueText !== undefined;
      body = el('span', { class: 'slide' + (words ? ' no-lo' : '') }, words ? null : lo, input, hi);
      sync = (now) => {
        // (left alone while it already says so, to the nearest step: a thumb being dragged is never pulled back)
        if (Math.abs(Number(input.value) - now.value) > (now.step || 0.01) / 2) input.value = now.value;
        input.style.setProperty('--p', `${((now.value - now.min) / (now.max - now.min || 1)) * 100}%`);
        if (words) { hi.textContent = now.valueText; input.setAttribute('aria-valuetext', now.valueText); }
      };
    } else if (c.kind === 'choice') {
      const group = el('span', { class: 'chips', role: 'group', 'aria-label': c.label },
        c.options.map((o) => el('button', { type: 'button', class: 'chip', 'data-v': String(o.value), onclick: () => set(c.key, o.value) }, o.label)));
      body = group;
      // (a choice's words may follow the other settings: a track's lengths are said in seconds at its tempo)
      sync = (now) => {
        for (const b of group.children) {
          b.setAttribute('aria-pressed', String(b.dataset.v === String(now.value)));
          const o = now.options.find((x) => String(x.value) === b.dataset.v);
          if (o && b.textContent !== o.label) b.textContent = o.label;
        }
      };
    } else if (c.kind === 'toggle') {
      const input = el('input', { id, type: 'checkbox', onchange: (e) => set(c.key, e.target.checked) });
      body = el('span', { class: 'ctl-body' }, el('span', { class: 'switch' }, input, el('span', { class: 'knob', 'aria-hidden': 'true' })));
      sync = (now) => { input.checked = !!now.value; };
    } else {
      // each colour is named in words (engine/color.js colorName); its code is kept in the tooltip and, small, beside the name
      const names = swatchNames(c.swatches);
      const custom = el('input', { type: 'color', value: c.value, 'aria-label': `${c.label}: pick any colour`, oninput: (e) => set(c.key, e.target.value.toLowerCase()) });
      const any = el('span', { class: 'swatch any', title: 'Pick any colour' }, custom);
      const group = el('span', { class: 'swatches', role: 'group', 'aria-label': c.label },
        c.swatches.map((hex, i) => el('button', { type: 'button', class: 'swatch', style: `--c:${hex}`, 'data-v': hex, 'aria-label': names[i], title: `${colourWord(hex)} (colour code ${hex})`, onclick: () => set(c.key, hex) })), any);
      const word = el('span', { class: 'colour-word' }), code = el('span', { class: 'colour-code', title: 'The colour code, for drawing programs and game engines' });
      body = el('span', { class: 'ctl-body' }, group, el('span', { class: 'colour-now', 'aria-live': 'polite' }, word, ' ', code));
      sync = (now) => {
        let hit = false;
        for (const b of group.querySelectorAll('button')) { const on = b.dataset.v === now.value; hit = hit || on; b.setAttribute('aria-pressed', String(on)); }
        if (custom.value !== now.value) custom.value = now.value;
        any.classList.toggle('on', !hit);
        any.style.setProperty('--c', now.value);
        word.textContent = colourWord(now.value);
        code.textContent = now.value;
      };
    }
    const label = c.kind === 'range' || c.kind === 'toggle' ? el('label', { for: id }, c.label) : el('span', {}, c.label);
    const row = el('div', { class: 'ctl' + (c.main ? ' is-main' : ''), 'data-control': c.key },
      el('span', { class: 'ctl-label' }, label, el('span', { class: 'dot', title: 'Changed', 'aria-hidden': 'true' })),
      body,
      el('button', { type: 'button', class: 'reset', 'aria-label': `Put ${c.label} back`, onclick: () => act('control', model.reset(edit.settings(), c.key)) }, 'Reset'));
    return { row, sync };
  }

  const first = model.controls(settings);
  const known = [...model.tabs];
  for (const t of extraTabs) {
    if (known.some((k) => k.id === t.id)) continue;
    // an extra tab with a place of its own among the sprite's tabs goes there; any other goes last
    const order = kind === 'sprite' ? SPRITE_TABS.map((x) => x.id) : [];
    const at = order.indexOf(t.id);
    const before = at < 0 ? -1 : known.findIndex((k) => order.indexOf(k.id) > at || order.indexOf(k.id) < 0);
    known.splice(before < 0 ? known.length : before, 0, { id: t.id, label: t.label });
  }
  const panes = new Map(), tabButtons = new Map();
  for (const t of known) {
    const extra = extraTabs.find((x) => x.id === t.id);
    const pane = el('div', { class: 'pane', role: 'tabpanel', id: `pane-${t.id}`, 'data-pane': t.id, 'aria-labelledby': `tab-${t.id}`, hidden: true });
    if (extra) pane.append(extra.node);
    else if (t.id === 'parts') {
      const box = el('div', { class: 'parts' });
      for (const c of first.filter((x) => x.tab === 'parts')) {
        if (!partBoxes.has(c.part)) { const b = el('div', { class: 'part', 'data-part': c.part }); partBoxes.set(c.part, b); box.append(b); }
        const r = controlRow(c); rows.set(c.key, r); partBoxes.get(c.part).append(r.row);
      }
      pane.append(box);
    } else for (const c of first.filter((x) => x.tab === t.id)) { const r = controlRow(c); rows.set(c.key, r); pane.append(r.row); }
    panes.set(t.id, pane);
    const btn = el('button', { type: 'button', class: 'tab', role: 'tab', id: `tab-${t.id}`, 'data-tab': t.id, 'aria-controls': `pane-${t.id}`, 'aria-selected': 'false', onclick: () => showTab(t.id) },
      t.label, el('span', { class: 'dot', 'aria-hidden': 'true', hidden: true }));      // said in words by the tab's description, so its name stays its label
    tabButtons.set(t.id, btn);
  }
  let tabNow = known[0]?.id ?? null;
  function showTab(id) {
    if (!panes.has(id)) return;
    tabNow = id;
    for (const [k, pane] of panes) pane.hidden = k !== id;
    for (const [k, btn] of tabButtons) { btn.setAttribute('aria-selected', String(k === id)); btn.tabIndex = k === id ? 0 : -1; }
    if (onTab) onTab(id);
  }
  const tabList = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Fine-tune' }, [...tabButtons.values()]);
  // the arrow keys move between tabs, as a tab list should
  tabList.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ids = [...tabButtons.keys()], i = ids.indexOf(tabNow), next = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    showTab(next); tabButtons.get(next).focus(); e.preventDefault();
  });
  const tune = el('div', { class: 'tune', hidden: !known.length }, el('div', { class: 'tune-head' }, el('h2', {}, 'Fine-tune'), tabList), [...panes.values()]);

  // ---- the footer ----
  // (its first word and the rest apart, so a narrow panel can say "Saved" alone)
  const savedLead = el('span', {}), savedRest = el('span', { class: 'saved-rest' });
  const savedText = el('span', { class: 'saved-text' }, savedLead, savedRest), savedMore = el('small', {});
  const saved = el('span', { class: 'saved is-idle', role: 'status' }, el('span', { class: 'dot' }), savedText, savedMore);
  const addBtn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary add-btn', onclick: () => { edit.add(); onAct('add'); } }, 'Add to my bag');
  const sizeOut = el('span', { class: 'num lbl' });
  const sizeSeg = el('span', { class: 'seg', role: 'group', 'aria-label': 'Pixel size' },
    sizes.map((s) => el('button', { type: 'button', 'data-px': s, 'aria-pressed': 'false', onclick: () => act('size', { scale: s }) }, `${s}×`)));
  const sizeBox = kind === 'sprite' && sizes.length ? el('span', { class: 'size' }, el('span', { class: 'lbl' }, 'Pixel size'), sizeSeg, sizeOut) : null;
  const status = el('p', { class: 'status panel-status', role: 'status' });
  const say = (text) => { status.textContent = text ?? ''; };
  const run = (fn) => async () => { try { const text = await fn(); if (text) say(text); } catch (e) { say(`That did not work: ${e.message}.`); } };
  const download = onDownload ? el('button', { type: 'button', class: 'btn btn-primary', 'data-act': 'download', onclick: run(onDownload) }, downloadLabel) : null;

  const removeBtn = el('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); edit.remove(); say('Taken out of your bag.'); onAct('remove'); } }, 'Remove from bag');
  const menu = el('div', { class: 'menu up right', role: 'menu', hidden: true },
    onCopyLink ? el('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); run(onCopyLink)(); } }, 'Copy link') : null,
    moreHref ? el('a', { role: 'menuitem', href: moreHref }, 'More like this') : onMore ? el('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); onMore(); } }, 'More like this') : null,
    removeBtn);
  const menuBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `More for ${name}`, onclick: () => (menu.hidden ? openMenu() : closeMenu()) }, svg(ICON.more));
  const openMenu = () => { menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); menu.querySelector('button:not(:disabled), a')?.focus(); };
  const closeMenu = () => { if (menu.hidden) return; menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); };
  const menuWrap = el('span', { class: 'menu-wrap' }, menuBtn, menu);
  const outside = (e) => { if (!menuWrap.contains(e.target)) closeMenu(); };
  const escape = (e) => { if (e.key === 'Escape' && !menu.hidden) { closeMenu(); menuBtn.focus(); } };
  document.addEventListener('click', outside);
  document.addEventListener('keydown', escape);

  const foot = el('div', { class: 'rx-foot' }, saved, addBtn, sizeBox, download, menuWrap);
  const node = el('section', { class: 'rx-panel', 'aria-label': `Change ${name}` }, versionsBlock, tune, foot, status);

  // ---- keeping it in step with the session ----
  let pictured = '';
  function sync() {
    settings = edit.settings();
    const list = model.controls(settings);
    for (const c of list) {
      const r = rows.get(c.key);
      if (!r) continue;
      r.row.hidden = !c.shown;
      r.row.classList.toggle('is-changed', c.changed && c.shown);
      r.sync(c);
    }
    for (const [part, box] of partBoxes) {
      const mine = list.filter((c) => c.part === part);
      box.hidden = mine.every((c) => !c.shown);
      box.classList.toggle('off', mine.some((c) => c.partOff));      // the part is taken off
    }
    const dots = model.changedTabs(settings);
    for (const [id, btn] of tabButtons) {
      const extra = extraTabs.find((x) => x.id === id);
      const changedHere = !!(extra ? extra.changed?.() : dots.has(id));
      btn.querySelector('.dot').hidden = !changedHere;
      if (changedHere) btn.setAttribute('aria-description', 'Something here is changed'); else btn.removeAttribute('aria-description');
      // a tab with nothing in effect in it is not offered (a sprite whose only colour belongs to a part that is off)
      if (!extra) btn.hidden = !list.some((c) => c.tab === id && c.shown);
    }
    if (tabNow && tabButtons.get(tabNow).hidden) showTab([...tabButtons].find(([, b]) => !b.hidden)?.[0] ?? tabNow);
    // version pictures follow the art style (a sprite that can be drawn in more than one)
    if (kind === 'sprite' && (settings.artStyle ?? '') !== pictured && versionTiles.length) { pictured = settings.artStyle ?? ''; drawWhenReady(); } else syncVersions();
    for (const b of sizeSeg.children) b.setAttribute('aria-pressed', String(Number(b.dataset.px) === settings.scale));
    if (sizeNote) sizeOut.textContent = sizeNote(settings.scale ?? 1);

    const s = edit.state();
    saved.className = `saved is-${s.status === 'not-kept' ? 'warn' : s.status}`;
    // (the browser is not keeping the bag: one short line here; the whole of it is said once, under the header)
    const text = s.status === 'not-kept' ? 'This browser is not keeping your bag. Download it or copy its link before you leave.' : s.text;
    saved.title = s.status === 'not-kept' ? s.text : '';
    const cut = s.status === 'saved' ? text.indexOf(' ') : -1;
    savedLead.textContent = cut < 0 ? text : text.slice(0, cut);
    savedRest.textContent = cut < 0 ? '' : text.slice(cut);
    savedMore.textContent = s.status === 'saved' || s.status === 'saving' ? s.detail : '';
    addBtn.hidden = s.inBag || s.status === 'off' || s.status === 'saving';
    removeBtn.disabled = !s.inBag;
  }
  if (edit.state().status === 'off') addBtn.remove();      // a draft cannot go in the bag: no button that could not work
  const off = edit.onChange(sync);
  if (tabNow) showTab(tabNow);
  sync();

  return {
    node,
    /** Draw again from the session (it already does after every change; call it when something outside the session changed, like a tab's own dot). */
    sync,
    /** Say something under the footer ("Downloaded ...", "Link copied"). */
    say,
    showTab,
    tab: () => tabNow,
    /** The page is left: stop listening. (The session is the page's to close.) */
    close() { gone = true; off(); if (tileWatch) tileWatch.disconnect(); document.removeEventListener('click', outside); document.removeEventListener('keydown', escape); },
  };
}
