// Market stalls and other open-air shop furniture, seen from the south in three-quarter view (docs/style-guide.md
// section 1): a cloth awning, the poles it stands on, a plank counter and the goods laid out on it. A stall sprite
// stacks these from the back to the front and outlines the whole once. Worked example: sprites/market-stall.js.
//
//   import { AWNING_STYLES, GOODS, awning, pole, counter, layGoods } from '../engine/stalls.js';
//   pole(g, { x: 14, y: 16, h: 24, wood: p.wood, far: true });                                // the two back poles first
//   const top = counter(g, { x: 12, y: 40, w: 40, wood: p.wood });                            // then the counter
//   layGoods(g, p.shape, { ...top.span, colours: { a: P.crimson, b: P.gold, c: P.leaf, basket: P.wheat, ... } });
//   pole(g, { x: 9, y: 18, h: 42, wood: p.wood });                                            // the front poles
//   awning(g, { x: 7, y: 6, w: 50, style: p.style, cloth: p.cloth, accent: p.accent, t, sway });   // and the cloth over all
//   g.outline(INK);
//
// Rules every piece follows (the same as engine/buildings.js):
//   - Light from the top right; three tones per material, all from the one colour passed in. No colour is typed here.
//   - A piece is drawn OVER what is already there and inks its own rim only where it covers drawn pixels (layOver).
//     The silhouette is left to the sprite's single g.outline(INK), so the outline is never doubled.
//   - The space between the awning and the counter is left see-through: whoever keeps the stall stands behind it, and
//     a game that sorts by the pivot row draws them first.
//   - Colours are '#rrggbb'. Coordinates are whole pixels; a box is its top-left corner (x, y), w wide and h tall.

import { Surface } from './surface.js';
import { ramp, col, INK } from './color.js';
import { TAU, clamp } from './motion.js';
import { drawBottle } from './pickups.js';

/**
 * Pastes a layer over what is already drawn and inks its rim only where that rim lies on drawn pixels, so a thing in front gets a line against what is behind it and its silhouette is left to the sprite's own outline; returns the Surface.
 * Arguments: g (the Surface drawn so far); layer (a Surface of the same size holding the thing in front, not outlined); ink (the line colour, default INK; null pastes with no line).
 */
export function layOver(g, layer, ink = INK) {
  if (ink) {
    const c = col(ink);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (layer.data[y * g.w + x] || !g.data[y * g.w + x]) continue;
      if (layer.get(x - 1, y) || layer.get(x + 1, y) || layer.get(x, y - 1) || layer.get(x, y + 1)) g.data[y * g.w + x] = c;
    }
  }
  return g.blit(layer);
}

const layerOf = (g) => { const s = new Surface(g.w, g.h); s.shadow = g.shadow; return s; };

/** The awning styles awning() and awningShape() know, in the order a choice control lists them: striped, plain (one colour with an edging band), scalloped (a plain cloth whose front edge is cut in scallops). No arguments: a frozen list. */
export const AWNING_STYLES = Object.freeze(['striped', 'plain', 'scalloped']);

/**
 * The outline of a cloth awning seen from the south: a sloping roof, narrower at its back edge, and a valance hanging from its front edge whose lower edge may be scalloped and ripples in the wind.
 * Arguments: { x, y, w, rise, drop, inset, style, t, sway, pitch }: x, y: the left end of the front edge's box and the top row (the back edge); w: the width at the front edge; rise: rows of roof (default 9); drop: rows of valance (default 6); inset: px the back edge is narrower on each side (default 4); style: one of AWNING_STYLES; t: clip phase 0 to 1; sway: px the valance's lower edge moves up and down (0: still); pitch: px from one ripple to the next (default 24; one ripple passes a point per loop).
 * Returns { x, y, w, eave, left(row), right(row), bottomAt(px), inside(px, py), phase(px) }: eave: the first row of the valance; left, right: the roof's first and last column on a row; bottomAt: the valance's last row at column px; phase: 0 to 1, where column px is in the ripple.
 */
export function awningShape({ x, y, w, rise = 9, drop = 6, inset = 4, style = 'striped', t = 0, sway = 0, pitch = 24 }) {
  if (!AWNING_STYLES.includes(style)) throw new Error(`stalls: no awning style "${style}". Styles: ${AWNING_STYLES.join(', ')}`);
  const eave = y + rise, x1 = x + w - 1;
  const lean = (row) => Math.round(inset * (1 - clamp((row - y) / Math.max(1, rise - 1))));
  const left = (row) => x + lean(row), right = (row) => x1 - lean(row);
  const scallops = Math.max(2, Math.round(w / 8)), sw = w / scallops;
  const hang = (px) => (style === 'scalloped' ? Math.round(2.3 * Math.sin(Math.PI * ((((px - x + 0.5) % sw) + sw) % sw) / sw) ** 0.7) : 0);
  const phase = (px) => (((px - x) / pitch - t) % 1 + 1) % 1;
  // the corners are tied to the poles: the cloth moves most in the middle of each span
  const free = (px) => clamp(Math.min(px - x, x1 - px) / 5);
  const ripple = (px) => Math.round(sway * free(px) * Math.sin(TAU * phase(px)));
  const bottomAt = (px) => eave + (style === 'scalloped' ? drop - 2 : drop - 1) + hang(px) + ripple(px);
  const inside = (px, py) => {
    const cx = Math.floor(px), cy = Math.floor(py);
    if (cy < y || cx < x || cx > x1) return false;
    if (cy < eave) return cx >= left(cy) && cx <= right(cy);
    return cy <= bottomAt(cx);
  };
  return { x, y, w, eave, left, right, bottomAt, inside, phase };
}

/**
 * Draws a cloth awning seen from the south, over what is already drawn (its poles): a lit roof, a crease where the cloth turns down, and a valance with pleats that travel along it as it flaps; returns its awningShape.
 * Arguments: g (the Surface); { x, y, w, rise, drop, inset, style, t, sway, pitch } as awningShape takes them; cloth (the cloth's colour); accent (the stripes of 'striped'; the edging band along the valance's lower edge of 'plain' and 'scalloped'); stripes (how many stripes across, an odd number so both ends are cloth; default from the width, about 5 px each); ink (the line where it covers what is behind it, default INK; null for none).
 */
export function awning(g, o) {
  const S = awningShape(o), { cloth, accent, ink = INK, style = 'striped' } = o;
  const C = ramp(cloth), A = ramp(accent), pitch = o.pitch ?? 24;
  const n = o.stripes ?? 2 * Math.round(S.w / 11) + 1;
  const layer = layerOf(g);
  for (let py = Math.max(0, S.y); py < g.h; py++) for (let px = Math.max(0, S.x); px < Math.min(g.w, S.x + S.w); px++) {
    if (!S.inside(px + 0.5, py + 0.5)) continue;
    const roof = py < S.eave, l = roof ? S.left(py) : S.x, r = roof ? S.right(py) : S.x + S.w - 1;
    const stripe = Math.min(n - 1, Math.floor(((px - l) / (r - l + 1)) * n));
    const bottom = S.bottomAt(px);
    let R = style === 'striped' && stripe % 2 ? A : C;
    if (style !== 'striped' && !roof && py >= bottom - 1) R = A;                        // the edging band
    let tone = 'base';
    if (roof) tone = py - S.y < 2 || px === r ? 'light' : px === l ? 'dark' : 'base';     // the back edge and the right side catch the light
    else if (py === S.eave) tone = 'dark';                                               // the crease: the roof's own shade on the valance
    else if (S.phase(px) * pitch < 1.5 && px > S.x + 1 && px < S.x + S.w - 2) tone = 'dark';   // a pleat
    else if (S.phase(px) * pitch >= pitch - 2 && px > S.x + 1 && px < S.x + S.w - 2) tone = 'light';
    layer.dot(px, py, R[tone]);
  }
  layOver(g, layer, ink);
  return S;
}

/**
 * Draws an upright pole 2 px wide, lit down its right side, over what is already drawn; returns the Surface.
 * Arguments: g (the Surface); { x, y, h, w, wood, far, ink }: x, y: its top-left pixel; h: its height; w: its width (default 2); wood: its colour; far: true for a pole on the far side of the thing, a tone darker; ink: the line where it covers what is behind it (default INK; null for none).
 */
export function pole(g, { x, y, h, w = 2, wood, far = false, ink = INK }) {
  // a far pole is the same wood a tone down (its ramp's dark, lit with its base), so it adds no colour of its own
  const W = ramp(wood), body = far ? W.dark : W.base, lit = far ? W.base : W.light, layer = layerOf(g);
  layer.rect(x, y, w, h, body);
  layer.rect(x + w - 1, y, 1, h, lit);
  if (w > 2) layer.rect(x, y, 1, h, far ? W.deep : W.dark);
  return layOver(g, layer, ink);
}

/**
 * Draws a plank counter seen from the south, over what is already drawn: a lit top you can lay goods on and a boarded front that stands on the ground; returns { top, span } for placing things on it.
 * Arguments: g (the Surface); { x, y, w, depth, h, wood, board, ink }: x, y: the top-left pixel of the front (the top overhangs it by 1 px on each side); y: the first row of the top; w: the front's width; depth: rows of top (default 6); h: rows of front below it (default 14); wood: its colour; board: the width of a front board in px (default 7); ink: the line where it covers what is behind it (default INK; null for none).
 * Returns { top: { x, y, w, h } (the top's box), span: { x, y, w } (where goods stand: the first column, the row their lowest pixels go on, and the width, as layGoods takes them) }.
 */
export function counter(g, { x, y, w, depth = 6, h = 14, wood, board = 7, ink = INK }) {
  const W = ramp(wood), layer = layerOf(g), fy = y + depth;
  // the top: lit, with one seam between its two planks and a darker front lip
  layer.rect(x - 1, y, w + 2, depth, W.light);
  layer.rect(x - 1, y + Math.floor(depth / 2) - 1, w + 2, 1, W.base);
  layer.rect(x - 1, y + depth - 1, w + 2, 1, W.base);
  // the front: boards, in the top's shade along their heads, with a rail near the ground
  layer.rect(x, fy, w, h, W.base);
  layer.rect(x, fy, w, 1, W.dark);
  const n = Math.max(2, Math.round(w / board));
  for (let i = 1; i < n; i++) layer.rect(x + Math.round((w * i) / n), fy + 1, 1, h - 1, W.dark);
  layer.rect(x, fy + h - 4, w, 1, W.dark);
  layer.rect(x, fy + h - 3, w, 1, W.light);
  layer.rect(x, fy + 1, 1, h - 1, W.dark);
  layer.rect(x + w - 1, fy + 1, 1, h - 1, W.light);
  layOver(g, layer, ink);
  return { top: { x: x - 1, y, w: w + 2, h: depth }, span: { x: x + 2, y: y + depth - 3, w: w - 4 } };
}

/** The kinds of goods layGoods can lay out, in the order a choice control lists them: fruit (heaped baskets), potions (corked bottles), weapons (a shield, a sword, a helmet), bread (loaves and a basket of buns). No arguments: a frozen list. */
export const GOODS = Object.freeze(['fruit', 'potions', 'weapons', 'bread']);

// a small round thing 3 px across, lit at its top right
const berry = (s, x, y, R) => { s.rect(x, y, 3, 3, R.base); s.dot(x + 2, y, R.light); };
// a low wicker basket 11 px wide whose rim is on row y - 3 and whose foot is on row y
const basket = (s, cx, y, R) => {
  s.rect(cx - 5, y - 3, 11, 2, R.base); s.rect(cx - 4, y - 1, 9, 2, R.base);
  for (let i = -4; i <= 4; i += 2) s.dot(cx + i, y - 1, R.dark);
  s.rect(cx - 4, y, 9, 1, R.dark);
};

/**
 * Lays goods out on a counter top, over what is already drawn, each group with a line of its own against the counter; returns the Surface.
 * Arguments: g (the Surface); kind (one of GOODS); { x, y, w, colours, ink }: x: the first column goods may use; y: the row their lowest pixels stand on; w: the width they may use (26 to 50 px: from 34 px up there is room for one group more); colours: { a, b, c (three bright colours: the fruits, the potions, the shield), basket (wicker), crust (bread), glass, cork, metal (blades, helmet), trim (hilt, crest), grip (a sword's handle) }; ink (the line colour, default INK; null for none).
 * Nothing stands more than 13 px above row y, so whoever stands behind the counter still shows over the goods.
 */
export function layGoods(g, kind, { x, y, w, colours, ink = INK }) {
  if (!GOODS.includes(kind)) throw new Error(`stalls: no goods "${kind}". Goods: ${GOODS.join(', ')}`);
  const K = colours, wide = w >= 34;
  const group = (draw) => { const s = layerOf(g); draw(s); layOver(g, s, ink); };
  const at = (i, n) => Math.round(x + (w * (i + 0.5)) / n);
  if (kind === 'fruit') {
    const n = wide ? 3 : 2, heaps = [K.a, K.b, K.c];
    for (let i = 0; i < n; i++) group((s) => {
      const cx = at(i, n), R = ramp(heaps[i % heaps.length]);
      berry(s, cx - 3, y - 9, R); berry(s, cx, y - 9, R);
      berry(s, cx - 4, y - 6, R); berry(s, cx - 1, y - 6, R); berry(s, cx + 2, y - 6, R);
      basket(s, cx, y, ramp(K.basket));
    });
  }
  if (kind === 'potions') {
    const n = wide ? 5 : 4, shapes = ['round', 'tall', 'flask', 'vial', 'round'], liquids = [K.a, K.c, K.b, K.a, K.c], tall = [12, 13, 12, 13, 12];
    for (let i = 0; i < n; i++) group((s) => {
      const h = tall[i];
      drawBottle(s, at(i, n), y + 1 - h / 2, h, { shape: shapes[i], glass: K.glass, liquid: liquids[i], cork: K.cork, level: 0.75 });
    });
  }
  if (kind === 'weapons') {
    const M = ramp(K.metal), T = ramp(K.trim), A = ramp(K.a), G = ramp(K.grip);
    // a round shield leaning against the back of the counter
    group((s) => {
      const cx = x + 6;
      s.ellipse(cx, y - 7, 6, 6, M, { shade: 1 });
      s.ellipse(cx, y - 7, 4, 4, A, { shade: 1 });
      s.rect(cx - 1, y - 8, 2, 2, T.base); s.dot(cx, y - 8, T.light);
    });
    // a helmet with a crest, where there is room
    if (wide) group((s) => {
      const cx = x + w - 7;
      s.fill(cx - 5, y - 11, cx + 5, y - 2, (px, py) => ((px - cx) / 4.5) ** 2 + ((py - (y - 5)) / 5.5) ** 2 <= 1 && py < y - 1, M, { shade: 1, light: 1 });
      s.rect(cx - 5, y - 3, 10, 2, M.base); s.rect(cx - 5, y - 3, 10, 1, M.light);
      s.rect(cx - 1, y - 12, 2, 3, T.base);
      s.rect(cx - 2, y - 6, 4, 2, INK);                                  // the eye slit
    });
    // a sword lying along the front of the counter, point to the right
    group((s) => {
      const x0 = x + 3, x1 = x + w - 2;
      s.rect(x0, y - 1, 2, 2, T.base);                                   // pommel
      s.rect(x0 + 2, y - 1, 4, 2, G.base); s.rect(x0 + 2, y - 1, 4, 1, G.light);
      s.rect(x0 + 6, y - 3, 2, 6, T.base); s.rect(x0 + 6, y - 3, 2, 1, T.light);     // cross-guard
      s.rect(x0 + 8, y - 1, x1 - x0 - 9, 1, M.light); s.rect(x0 + 8, y, x1 - x0 - 10, 1, M.base);
    });
  }
  if (kind === 'bread') {
    const C = ramp(K.crust);
    // a basket of buns
    group((s) => {
      const cx = x + 6;
      for (const [dx, dy] of [[-4, -6], [0, -7], [2, -5]]) { s.rect(cx + dx, y + dy, 4, 3, C.base); s.rect(cx + dx + 1, y + dy, 3, 1, C.light); }
      basket(s, cx, y, ramp(K.basket));
    });
    // a long loaf with three cuts
    group((s) => {
      const x0 = x + 14, len = (wide ? w - 28 : w - 15);
      s.capsule(x0 + 2.5, y - 2, x0 + len - 2.5, y - 2, 2.6, 2.6, C, { shade: 1 });
      s.rect(x0 + 2, y - 4, len - 4, 1, C.light);
      for (let i = 1; i <= 3; i++) { const cx = x0 + Math.round((len * i) / 4); s.dot(cx, y - 4, C.dark); s.dot(cx + 1, y - 3, C.dark); }
    });
    // a round loaf with a cross cut, on the wide counter
    if (wide) group((s) => {
      const cx = x + w - 6;
      s.ellipse(cx, y - 3, 5.5, 4.4, C, { shade: 1 });
      s.rect(cx - 3, y - 6, 5, 1, C.light);
      s.rect(cx - 2, y - 4, 5, 1, C.dark); s.rect(cx, y - 5, 1, 3, C.dark);
    });
  }
  return g;
}
