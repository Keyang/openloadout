// Craft icon shapes, second takes (batch K17 fix round): shapes for the food, material and tool icon sets
// that read more clearly at 1x than their first takes in engine/icons-more.js, which stay as they are.
// They work exactly like the shapes of engine/icons.js and engine/icons-more.js and are drawn with the
// same pen: each takes (g, pen, options), is written upright in local units round (0, 0) about 23 units
// along its longer side, paints through iconPaint and iconLine, and draws no outline (the sprite outlines
// once inside iconFit). Pure drawing: Node and browser.
//
//   import { iconFit, iconTidy } from '../engine/icons.js';
//   import { iconAxe, iconRoll, iconPelt, iconNuggets, iconApart } from '../engine/icons-craft.js';
//   iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: ICON_DIAGONAL }, (s, pen) => {
//     iconAxe(s, pen, { metal: iconApart(p.metal, p.wood), wood: p.wood, grip: p.accent });
//     iconTidy(s).outline(INK);
//   });
//
//   iconMushroomPlain  a plain mushroom whose stem takes one tone less than iconMushroom's (ten colours or fewer in all)
//   iconRoll           a bolt of cloth: a long cylinder, its round end showing the wound layers round a core, a flap hanging off
//   iconPelt           an animal hide: an uneven skin with four leg flaps, a neck and a tail, tufts of hair on it
//   iconNuggets        ore: an angular broken chunk set with big metal nuggets, each a lit face over a dark socket
//   iconAxe            an axe whose blade flares from a narrow neck to a curved cutting edge, wider than its eye
//   iconApart          a metal colour pushed darker (or lighter) until it stands apart from the handle it is fixed to
// Other makers add shapes here: APPEND at the end.

import { ellipseIn, capsuleIn, polyIn, rectIn } from './surface.js';
import { ramp, tone, brightness, INK } from './color.js';
import { iconPaint, iconLine, iconGlint, iconOver } from './icons.js';

const boxIn = (x0, y0, x1, y1) => rectIn(x0, y0, x1 - x0, y1 - y0);
const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const need = (name, o, keys) => { for (const k of keys) if (!o[k]) throw new Error(`${name}: needs ${keys.join(', ')} colours`); };
// a band one unit wide just inside an ellipse: a ring drawn round it at every size
const ellipseLineIn = (cx, cy, rx, ry, w = 1) => { const o = ellipseIn(cx, cy, rx, ry), i = ellipseIn(cx, cy, Math.max(0.1, rx - w), Math.max(0.1, ry - w)); return (px, py) => o(px, py) && !i(px, py); };

/**
 * A plain mushroom: a smooth domed cap with its gills underneath, on a thick stem in three tones, so cap, stem, ink and glint stay within ten colours.
 * Arguments: g: the Surface; pen: from iconPen; options { cap, stem (colours) }.
 */
export function iconMushroomPlain(g, pen, o = {}) {
  need('iconMushroomPlain', o, ['cap', 'stem']);
  const { cap, stem } = o, S = ramp(stem);
  iconPaint(g, pen, [boxIn(-3.4, -1, 3.4, 9.6), ellipseIn(0, 9.4, 4.4, 2.2)], S, { soft: 0 });
  iconPaint(g, pen, ellipseIn(0, -0.6, 10.2, 2.6), S.dark, { flat: true, clip: (x, y) => y > -1.2 });
  for (const x of [-7, -4, 4, 7]) iconLine(g, pen, [[x * 0.7, -0.4], [x, 1]], S.deep, { over: true });
  iconPaint(g, pen, ellipseIn(0, -1.2, 11.5, 9.4), cap, { soft: 2, minus: boxIn(-12, -1.2, 12, 10) });
  iconGlint(g, pen, 4, -7.2, { len: 1 });
  return g;
}

/**
 * A bolt of cloth lying level: a long cylinder with two straight parallel sides, its right end a round face showing the wound layers round a core that pokes out, and its loose end lying flat under it and running out past the far end, cut on a slant. Lean it with -ICON_LEAN / 2.
 * Arguments: g: the Surface; pen: from iconPen; options { cloth, core (colours) }.
 */
export function iconRoll(g, pen, o = {}) {
  need('iconRoll', o, ['cloth', 'core']);
  const { cloth, core } = o, C = ramp(cloth), cy = -1.8, r = 7, x0 = -7.4, x1 = 8.4, ex = 3;
  iconPaint(g, pen, capsuleIn(x1, cy, x1 + ex + 1.6, cy, 1.5), core, { soft: 0 });
  iconPaint(g, pen, [boxIn(x0, cy - r, x1, cy + r), ellipseIn(x0, cy, ex, r)], C, { soft: 2 });
  // the loose end: unrolled off the underside, lying flat and running out past the far end, cut on a slant
  const tail = polyIn([[x1 - ex - 0.6, cy + r - 1.2], [x1 - ex - 1.6, cy + r + 2.8], [-13, cy + r + 2.8], [-10.6, cy + r - 1.2]]);
  iconPaint(g, pen, tail, C, { soft: 0, rim: INK });
  iconLine(g, pen, [[-11.2, cy + r + 0.8], [x0 - 0.6, cy + r + 0.8]], C.dark, { over: true });
  // the round end: a lit face, two wound layers, the core in the middle
  iconPaint(g, pen, ellipseIn(x1, cy, ex + 0.4, r), pen.shine ? C.light : C.base, { flat: true, rim: C.dark });
  iconPaint(g, pen, ellipseLineIn(x1, cy, ex - 0.6, r - 1.6), C.dark, { flat: true });
  iconOver(g, pen, ellipseIn(x1, cy, 1.1, 1.6), core, { soft: 0, light: 0, rim: C.dark });
  // one line along the roll: the edge of the outer turn
  iconLine(g, pen, [[x0 + 1.4, cy - 1.8], [x1 - ex - 0.6, cy - 1.8]], C.dark, { over: true });
  return g;
}

/**
 * An animal hide laid flat: an uneven skin with four leg flaps splayed out, a neck tab at the top and a tail at the bottom, a paler middle and tufts of hair on it.
 * Arguments: g: the Surface; pen: from iconPen; options { hide (colour) }.
 */
export function iconPelt(g, pen, o = {}) {
  need('iconPelt', o, ['hide']);
  const Hd = ramp(o.hide);
  const body = [
    polyIn([[0, -9.4], [3.6, -8.6], [6.2, -5.2], [5.4, -1.4], [6.6, 2.6], [5.6, 7], [2.4, 9.4], [0, 8.8], [-2.6, 9.6], [-5.8, 7.2], [-6.4, 2.2], [-5.6, -1.8], [-6.4, -5.6], [-3.4, -8.8]]),
    // four legs, splayed, each ending in a little flared paw
    capsuleIn(4.4, -5, 9.6, -8.8, 2.8, 2), capsuleIn(-4.4, -5, -10, -7.8, 2.8, 2),
    capsuleIn(4.6, 5, 9.4, 9.4, 2.8, 2), capsuleIn(-4.4, 5.2, -9.8, 8.8, 2.8, 2),
    // neck and tail
    capsuleIn(0, -8.6, -0.6, -11.6, 2.4, 1.8), capsuleIn(0.2, 8.6, 2.2, 11.8, 1.2, 0.7),
  ];
  iconPaint(g, pen, body, Hd, { soft: 2 });
  iconPaint(g, pen, ellipseIn(0.2, 0, 3.2, 5.2), pen.shine ? Hd.light : Hd.base, { flat: true });
  // tufts of hair: short strokes that all lie the same way, none on the pale middle
  for (const [x, y] of [[-3.8, -5.6], [2.4, -6.2], [-4.4, 0.6], [4.2, -1.6], [-2.6, 6], [3.8, 4.4], [7.2, -7.4], [-7.6, 7.2]]) iconLine(g, pen, [[x, y], [x + 1, y + 1.4]], Hd.dark, { over: true });
  return g;
}

/**
 * Ore: an angular chunk of rock broken open, set with big metal nuggets that each show a lit face over a dark socket, so they read at 1x even on a rock of a near colour.
 * Arguments: g: the Surface; pen: from iconPen; options { stone, metal (colours), nuggets (1 to 4, default 3) }.
 */
export function iconNuggets(g, pen, o = {}) {
  need('iconNuggets', o, ['stone', 'metal']);
  const S = ramp(o.stone), M = ramp(o.metal), n = whole(o.nuggets ?? 3, 1, 4);
  const chunk = polyIn([[-11.4, 3.6], [-9.6, -5.4], [-3.6, -11.4], [4.4, -10.6], [11.4, -3.2], [10.2, 6.4], [3, 11.4], [-6.8, 10]]);
  iconPaint(g, pen, chunk, S, { soft: 2 });
  // the broken face: a flat lit facet top right, edged by a crack
  iconPaint(g, pen, polyIn([[-3.6, -11.4], [4.4, -10.6], [11.4, -3.2], [2.4, -3.4]]), pen.shine ? S.light : S.base, { flat: true, clip: chunk });
  iconLine(g, pen, [[-9.6, -5.4], [-2.6, -3.6], [2.4, -3.4]], S.dark, { over: true });
  iconLine(g, pen, [[-2.6, -3.6], [-3.4, 4], [-6.8, 10]], S.dark, { over: true });
  const at = [[-6.4, 3.2, 3.2], [4.6, 2.6, 3.4], [-4.8, -6.4, 2.8], [3.4, -7.6, 2.6]];
  for (let i = 0; i < n; i++) {
    const [x, y, k] = at[i];
    const nug = polyIn([[x - k, y - 0.4], [x - 0.6, y - k], [x + k, y - 0.8], [x + k * 0.8, y + k * 0.7], [x - 0.4, y + k], [x - k * 0.9, y + k * 0.6]]);
    iconPaint(g, pen, nug, M, { soft: 0, light: 0, rim: S.deep });
    iconPaint(g, pen, nug, M.light, { flat: true, clip: (px, py) => py < y - 0.2 });
  }
  iconGlint(g, pen, at[0][0] - 0.6, at[0][1] - 2.2, { len: 1, dot: false });
  return g;
}

/**
 * An axe standing on its handle: an eye round the handle's top with a short poll behind, and a blade that flares from a narrow neck to a curved cutting edge taller than the eye. Lean it with ICON_DIAGONAL; it reads as an axe upright too.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, wood (colours), grip (a colour: a wrap under the head; default none) }. Returns { tip: [x, y] } (the middle of the cutting edge) in local units.
 */
export function iconAxe(g, pen, o = {}) {
  need('iconAxe', o, ['metal', 'wood']);
  const { metal, wood, grip = null } = o, M = ramp(metal), ey = -8.6;
  iconPaint(g, pen, boxIn(-1.3, -10.6, 1.3, 11.5), wood, { soft: 0 });
  if (grip) iconPaint(g, pen, boxIn(-1.7, -4.4, 1.7, -0.6), grip, { flat: true, rim: tone(grip, -1) });
  // the curved cutting edge: the blade is cut from a disc, so its far edge bows out
  const disc = ellipseIn(3.6, ey, 7.8, 8.2);
  const blade = (px, py) => disc(px, py) && px > 4.6 && Math.abs(py - ey) < 1.6 + (px - 4.6) * 1.15;
  iconPaint(g, pen, [boxIn(-2.8, ey - 2.8, 2.2, ey + 2.6), boxIn(2, ey - 1.5, 5.2, ey + 1.5), blade], M, { soft: 1 });
  iconPaint(g, pen, (px, py) => blade(px, py) && !ellipseIn(3.6, ey, 6.2, 6.6)(px, py), pen.shine ? M.light : M.base, { flat: true });
  return { tip: [11.4, ey] };
}

/**
 * A metal colour that stands apart from the handle it is fixed to: returned as it is when its brightness differs from the handle's by gap or more, else toned darker (or lighter, when darker would sink towards the ink) until it does.
 * Arguments: metal, handle (colours), gap (brightness difference wanted, 0..1, default 0.16). Returns a colour.
 */
export function iconApart(metal, handle, gap = 0.16) {
  const bh = brightness(handle);
  if (Math.abs(brightness(metal) - bh) >= gap) return metal;
  for (let k = 0.25; k <= 2; k += 0.25) {
    const d = tone(metal, -k);
    if (brightness(d) < 0.22) break;
    if (Math.abs(brightness(d) - bh) >= gap) return d;
  }
  for (let k = 0.25; k <= 2; k += 0.25) {
    const l = tone(metal, k);
    if (Math.abs(brightness(l) - bh) >= gap) return l;
  }
  return tone(metal, 2);
}
