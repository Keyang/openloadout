// The Look tab of a sprite's page: a look of its own for this one sprite, one of the named whole-set looks
// (engine/theme.js THEME_PRESETS: Original, Sunset, Frost, Night ...), each shown on a picture of the sprite.
// It is a setting like any other (app/bag.js lookOf: `settings.look`): choosing one saves it with the sprite in the
// bag, where the sprite then keeps it whatever look the rest of the bag takes; "Follows the bag" takes it off again.
// The page shows the sprite in the look, and its download and its link (`artlook=<id>`) carry it. The same options and
// words as the Look tab beside the bag's list and the playground's scene (app/bag-edit.js).
import { THEME_PRESETS, spriteLook } from '../engine/theme.js';
import { el } from './ui.js';
import { spritePicture, trimPictures, pictureK, keepK } from './panel.js';
import { bag } from './bag.js';

/** The looks, the first being "Original" (nothing changed). */
export const LOOKS = THEME_PRESETS;
/** A look by its id; null for none, for "original" and for anything unknown. */
export const lookById = (id) => (id && id !== 'original' ? THEME_PRESETS.find((p) => p.id === id) ?? null : null);

/**
 * Something that recolours pictures of one sprite at one set of settings in one look: (canvas) => a new canvas.
 * What each colour is of is found once, at the first picture. A canvas of any size (a flat picture is bigger than its
 * frame): the new one is the same size and is shown the same way.
 */
export function lookPainter(sprite, params, style, look) {
  const made = spriteLook(sprite, params, look.theme, { style });
  return (cv) => {
    const out = el('canvas', { width: cv.width, height: cv.height });
    const g = out.getContext('2d');
    g.drawImage(cv, 0, 0);
    const img = g.getImageData(0, 0, cv.width, cv.height);
    made.recolour(img.data);
    g.putImageData(img, 0, 0);
    return keepK(out, pictureK(cv));
  };
}

/** What the Look tab says above its options, here and beside the bag (app/bag-edit.js says the same). */
export const LOOK_NOTE = 'A look for this one thing. It keeps it whatever look the rest of your bag takes.';
export const FOLLOWS = 'Follows the bag';

/**
 * lookTab({ sprite, now, pick, say, before }) -> { node, show(), hide(), sync(), changed(), close() }
 *   now()      { params, style, look }: the settings on screen and the id of the sprite's own look (null: it follows the bag)
 *   pick(id)   the visitor chose a look (null for "Follows the bag")
 *   say(text)  say something under the panel's footer
 *   before     an element shown above the looks (the sprite's choice of art style, when it has one)
 * show(): the tab is on screen (its pictures are drawn only then). sync(): the settings or the look changed.
 */
export function lookTab({ sprite, now, pick, say = () => {}, before = null }) {
  const grid = el('div', { class: 'looks', role: 'group', 'aria-label': 'Its own look' });
  const tiles = [{ id: '', name: FOLLOWS, blurb: 'No look of its own: in your bag it takes whatever look the bag has.', theme: null }, ...LOOKS].map((look) => {
    const pic = el('span', { class: 'vpic' });
    const btn = el('button', { type: 'button', class: 'vbtn', 'data-look': look.id, 'aria-pressed': 'false', title: look.blurb, onclick: () => pick(look.id || null) }, pic, el('span', { class: 'name' }, look.name));
    grid.append(btn);
    return { look, btn, pic, cv: null };
  });
  const useBtn = el('button', { type: 'button', class: 'btn btn-sm btn-secondary', 'data-act': 'look-to-bag', onclick: () => {
    const look = LOOKS.find((p) => p.id === now().look) ?? LOOKS[0];
    bag.setTheme(look.theme);
    say(look.id === 'original' ? 'Your bag is back to the original look.' : `Everything in your bag now has the ${look.name} look. You can change it in your bag.`);
  } }, 'Use this look for my whole bag');
  const node = el('div', { class: 'look-tab' }, before, el('p', { class: 'pane-note look-note' }, LOOK_NOTE), grid, el('p', { class: 'look-acts' }, useBtn));

  let drawn = '', shown = false, timer = 0;
  // one whole-number scale for every tile, as large as the tile allows
  const fit = () => {
    const first = tiles.find((t) => t.cv);
    if (!first) return;
    // (the tallest a tile may be comes from the style sheet, --vmax; the tiles then take the height the pictures need, --vh)
    const w = first.pic.clientWidth - 8, h = (parseFloat(getComputedStyle(grid).getPropertyValue('--vmax')) || 88) - 8;
    if (w <= 0 || h <= 0) return;
    const q = pictureK(first.cv), fw = first.cv.width / q, fh = first.cv.height / q;      // (its size in frame pixels)
    const z = Math.min(w / fw, h / fh), k = z >= 1 ? Math.min(4, Math.floor(z)) : 1 / Math.ceil(1 / z);
    grid.style.setProperty('--vh', `${Math.max(56, Math.ceil(fh * k) + 8)}px`);
    for (const t of tiles) if (t.cv) { const p = pictureK(t.cv); t.cv.style.width = `${(t.cv.width / p) * k}px`; t.cv.style.height = `${(t.cv.height / p) * k}px`; }
  };
  const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
  if (watch) watch.observe(grid);
  function draw() {
    const { params, style } = now();
    const sig = JSON.stringify([params, style]);
    if (sig === drawn) return;
    drawn = sig;
    let base;
    try { [base] = trimPictures([spritePicture(sprite, params, style)]); } catch (e) { console.error('look picture:', e); return; }
    for (const t of tiles) {
      // (each tile needs a canvas of its own: one canvas cannot be in two places)
      try { t.cv = t.look.theme && t.look.id !== 'original' ? lookPainter(sprite, params, style, t.look)(base) : copyOf(base); } catch (e) { console.error('look picture:', e); t.cv = null; }
      t.pic.replaceChildren(...(t.cv ? [t.cv] : []));
    }
    fit();
  }
  function sync() {
    const id = now().look ?? '';
    for (const t of tiles) t.btn.setAttribute('aria-pressed', String(t.look.id === id));
    // the pictures follow the settings, a moment after the last change, and only while the tab is on screen
    if (shown) { clearTimeout(timer); timer = setTimeout(draw, 120); }
  }
  sync();
  return {
    node,
    show() { shown = true; draw(); },
    hide() { shown = false; },
    sync,
    changed: () => !!now().look,
    close() { clearTimeout(timer); if (watch) watch.disconnect(); },
  };
}
const copyOf = (cv) => { const out = el('canvas', { width: cv.width, height: cv.height }); out.getContext('2d').drawImage(cv, 0, 0); return keepK(out, pictureK(cv)); };
