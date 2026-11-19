// Icon shapes that keep the chosen swatch (batch K17, fix round 2): craft icon shapes whose shading stays
// in the hue of the colour the viewer picks, and whose parts stay apart at 1x. They work exactly like the
// shapes of engine/icons.js, engine/icons-more.js and engine/icons-craft.js, which stay as they are, and are
// drawn with the same pen: each takes (g, pen, options), is written upright in local units round (0, 0)
// about 23 units along its longer side, paints through iconPaint and iconLine, and draws no outline (the
// sprite outlines once inside iconFit). Pure drawing: Node and browser.
//
//   import { iconFit, iconTidy } from '../engine/icons.js';
//   import { iconBoards, iconSpade, iconHued } from '../engine/icons-swatch.js';
//   iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: ICON_DIAGONAL }, (s, pen) => {
//     iconSpade(s, pen, { metal: iconHued(p.metal, [p.wood, p.accent]), wood: p.wood, grip: p.accent });
//     iconTidy(s).outline(INK);
//   });
//
//   lightness     CIE L* of a colour, 0 (black) to 100 (white): the lightness people see
//   hueRamp       a ramp (light, base, dark, deep) that changes only lightness, so every shade keeps the colour's hue
//   iconHued      a colour moved lighter or darker in its own hue until it stands apart from its neighbours
//   iconBoards    sawn planks, one to three, stacked crosswise, shaded in the wood's own hue
//   iconOreLumps  ore: a broken chunk of rock set with big metal nuggets, each sunk in a dark socket
//   iconSpade     a shovel: a pointed spade, symmetric about its handle, with a cross grip at the foot
//   iconSickle    a sickle: a long wooden handle and a crescent blade curving back over it, its edge facing the handle
// Other makers add shapes here: APPEND at the end.

import { ellipseIn, polyIn, rectIn } from './surface.js';
import { hexToRgb, rgbToHsl, hsl, mix, tone, INK } from './color.js';
import { iconPaint, iconLine, iconGlint } from './icons.js';

const boxIn = (x0, y0, x1, y1) => rectIn(x0, y0, x1 - x0, y1 - y0);
const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const need = (name, o, keys) => { for (const k of keys) if (!o[k]) throw new Error(`${name}: needs ${keys.join(', ')} colours`); };
const turnedIn = (test, x, y, a) => { const c = Math.cos(a), s = Math.sin(a); return (px, py) => { const dx = px - x, dy = py - y; return test(dx * c + dy * s, -dx * s + dy * c); }; };

/**
 * The lightness people see: CIE L* of a colour.
 * Arguments: hex ('#rrggbb'). Returns 0 (black) to 100 (white).
 */
export function lightness(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

// the colour at another lightness, same hue and saturation (a grey stays grey)
const atLight = (hex, l) => { const [h, s] = rgbToHsl(...hexToRgb(hex)); return hsl(h, s, Math.max(0, Math.min(1, l))); };

/**
 * A ramp for iconPaint that changes only lightness: every shade keeps the colour's hue, so a brown never turns red in its shadow and the picked swatch stays the colour of the body.
 * Arguments: hex (the base colour). Returns { isRamp, light, base, mid, dark, deep } ('#rrggbb' each).
 */
export function hueRamp(hex) {
  const l = rgbToHsl(...hexToRgb(hex))[2];
  return {
    isRamp: true, base: hex,
    light: atLight(hex, l + (1 - l) * 0.38),
    mid: atLight(hex, l * 0.84),
    dark: atLight(hex, l * 0.68),
    deep: atLight(hex, l * 0.46),
  };
}

/**
 * A colour moved lighter or darker in its own hue (hue and saturation kept) by the least that makes its lightness differ from each neighbour's by that neighbour's gap, so a metal head stays the colour picked and still parts from its handle and its grip. It never goes within 18 points of the outline ink, and when no lightness in its hue clears every gap it takes the one that comes closest.
 * Arguments: colour; against (a colour or a list: the neighbours); gap (L* difference wanted, 0..100: one number for all, or a list, one per neighbour; default 20). Returns a colour: the given one when it already stands apart.
 */
export function iconHued(colour, against, gap = 20) {
  const near = [].concat(against).map(lightness), gaps = near.map((_, i) => (Array.isArray(gap) ? gap[i] ?? gap[gap.length - 1] : gap));
  const floor = lightness(INK) + 18;
  // how far short of its gaps a colour falls (0: it clears them all)
  const short = (c) => { const L = lightness(c); return Math.max(L < floor ? floor - L : 0, ...near.map((n, i) => gaps[i] - Math.abs(L - n))); };
  if (short(colour) <= 0) return colour;
  const l = rgbToHsl(...hexToRgb(colour))[2];
  let best = colour, worst = short(colour);
  for (let d = 0.01; d <= 0.7; d += 0.01) for (const c of [l + d <= 0.92 ? atLight(colour, l + d) : null, l - d >= 0.08 ? atLight(colour, l - d) : null]) {
    if (!c) continue;
    const f = short(c);
    if (f <= 0) return c;
    if (f < worst) { best = c; worst = f; }
  }
  return best;
}

/**
 * Sawn planks, one to three, stacked crosswise in a small pile: each a board in the wood's colour with a 1 px shadow edge, a grain line and a pale sawn end, every shade in the wood's own hue, so the picked wood is the colour of the boards.
 * Arguments: g: the Surface; pen: from iconPen; options { wood (colour), count (1 to 3, default 3) }.
 */
export function iconBoards(g, pen, o = {}) {
  need('iconBoards', o, ['wood']);
  const n = whole(o.count ?? 3, 1, 3), W = hueRamp(o.wood);
  const lay = { 1: [[0, 0, 0]], 2: [[0, 3.2, 0.28], [0, -3.2, -0.28]], 3: [[0.4, 6.2, 0], [0, 0.4, -0.4], [-0.4, -5.6, 0.1]] }[n];
  for (const [x, y, a] of lay) {
    const plank = turnedIn(boxIn(-11.5, -2.8, 11.5, 2.8), x, y, a);
    // a dark seam only where this board lies on one already drawn, so the pile parts into boards without a rim round the whole
    const under = (u, v) => { const [fx, fy] = pen.pt(u, v), x = Math.floor(fx), y = Math.floor(fy); return x >= 0 && y >= 0 && x < g.w && y < g.h && g.data[y * g.w + x] !== 0; };
    iconPaint(g, pen, plank, W, { flat: true, rim: W.deep, clip: under });
    iconPaint(g, pen, plank, W, { soft: 0, light: 0 });
    iconPaint(g, pen, turnedIn(boxIn(9.6, -2.8, 11.5, 2.8), x, y, a), W.light, { flat: true, clip: plank });
    const c = Math.cos(a), s = Math.sin(a), at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
    iconLine(g, pen, [at(-9.2, 0), at(-2, -0.4), at(6.6, 0.2)], W.mid, { over: true });
  }
  return g;
}

/**
 * Ore: an angular chunk of rock broken open, set with big metal nuggets, each a lit face sunk in a dark socket of the rock's own hue, so the nuggets stand off the rock at 1x even when metal and rock are both pale.
 * Arguments: g: the Surface; pen: from iconPen; options { stone, metal (colours), nuggets (1 to 4, default 3) }.
 */
export function iconOreLumps(g, pen, o = {}) {
  need('iconOreLumps', o, ['stone', 'metal']);
  const S = hueRamp(o.stone), M = hueRamp(o.metal), n = whole(o.nuggets ?? 3, 1, 4);
  const chunk = polyIn([[-11.4, 3.6], [-9.6, -5.4], [-3.6, -11.4], [4.4, -10.6], [11.4, -3.2], [10.2, 6.4], [3, 11.4], [-6.8, 10]]);
  iconPaint(g, pen, chunk, S, { soft: 2 });
  iconPaint(g, pen, polyIn([[-3.6, -11.4], [4.4, -10.6], [11.4, -3.2], [2.4, -3.4]]), pen.shine ? S.light : S.base, { flat: true, clip: chunk });
  iconLine(g, pen, [[-9.6, -5.4], [-2.6, -3.6], [2.4, -3.4]], S.dark, { over: true });
  // the sockets: the rock round each nugget darkened, far enough below the metal to read at 1x
  const sock = mix(S.deep, INK, 0.35);
  const at = [[-5.6, 3.4, 3.4], [5, 3.2, 3.4], [-3.6, -5.8, 3]];
  const lump = (x, y, k) => polyIn([[x - k, y - 0.4], [x - 0.6, y - k], [x + k, y - 0.8], [x + k * 0.8, y + k * 0.7], [x - 0.4, y + k], [x - k * 0.9, y + k * 0.6]]);
  for (let i = 0; i < Math.min(n, at.length); i++) {
    const [x, y, k] = at[i];
    const nug = lump(x, y, k), r = 1.5, ring = [[r, 0], [-r, 0], [0, r], [0, -r], [r * 0.7, r * 0.7], [-r * 0.7, r * 0.7], [r * 0.7, -r * 0.7], [-r * 0.7, -r * 0.7]];
    iconPaint(g, pen, (px, py) => ring.some(([dx, dy]) => nug(px + dx, py + dy)), sock, { flat: true, clip: chunk });
  }
  for (let i = 0; i < Math.min(n, at.length); i++) {
    const [x, y, k] = at[i], nug = lump(x, y, k);
    iconPaint(g, pen, nug, M, { soft: 0, light: 0 });
    if (pen.shine) iconPaint(g, pen, nug, M.light, { flat: true, clip: (px, py) => py < y - 0.6 && px < x + 0.8 });
  }
  if (pen.shine) iconGlint(g, pen, at[0][0] - 0.6, at[0][1] - 2.2, { len: 1, dot: false });
  return g;
}

/**
 * A shovel standing on its handle: a pointed spade with straight sides tapering to one point at the top, symmetric about the handle, a socket where it meets the handle, a cross grip at the foot and an optional wrap under the blade. Lean it with ICON_DIAGONAL; its edges then run along the pixel grid.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, wood (colours), grip (a colour: the wrap; default none) }. Returns { tip: [x, y] } (the point) in local units.
 */
export function iconSpade(g, pen, o = {}) {
  need('iconSpade', o, ['metal', 'wood']);
  const { metal, wood, grip = null } = o, M = typeof metal === 'string' ? hueRamp(metal) : metal, foot = 11.5;
  iconPaint(g, pen, boxIn(-1.3, -6, 1.3, foot), wood, { soft: 0 });
  iconPaint(g, pen, boxIn(-4, foot - 2, 4, foot + 0.6), wood, { soft: 0 });
  if (grip) iconPaint(g, pen, boxIn(-1.7, -2.8, 1.7, 1), grip, { flat: true, rim: tone(grip, -1) });
  // shoulders across, sides straight up, then a 45 degree taper to the point
  const blade = polyIn([[-5, -4.4], [5, -4.4], [5, -8.6], [0, -13.6], [-5, -8.6]]);
  iconPaint(g, pen, [blade, boxIn(-2, -4.6, 2, -2.8)], M, { soft: 1 });
  iconPaint(g, pen, polyIn([[0, -13.6], [5, -8.6], [5, -4.4], [3, -4.4], [3, -8.6]]), pen.shine ? M.light : M.base, { flat: true, clip: blade });
  return { tip: [0, -13.6] };
}

/**
 * A sickle standing on its handle: a long wooden handle with an optional wrap at its top, and a thin crescent blade that leaves the top of the handle, sweeps out to the right and up, and curves back over to a point above the handle, its cutting edge facing down towards the handle. Upright it reads as a sickle, not as a question mark: the handle is long and the hook opens towards it.
 * Arguments: g: the Surface; pen: from iconPen; options { metal, wood (colours), grip (a colour: the wrap; default none) }. Returns { tip: [x, y] } (the point) in local units.
 */
export function iconSickle(g, pen, o = {}) {
  need('iconSickle', o, ['metal', 'wood']);
  const { metal, wood, grip = null } = o, M = typeof metal === 'string' ? hueRamp(metal) : metal;
  const hx = -4.6, top = -1, foot = 13.4;
  iconPaint(g, pen, boxIn(hx - 1.4, top, hx + 1.4, foot), wood, { soft: 0 });
  if (grip) iconPaint(g, pen, boxIn(hx - 1.8, top, hx + 1.8, top + 3), grip, { flat: true, rim: tone(grip, -1) });
  // the crescent: a disc less a disc set lower, so the spine is thick over the top and thins to both ends;
  // its foot sits on the handle and its point comes down at the far side: the hook opens down, towards the handle
  const cx = 2.8, out = ellipseIn(cx, -2.4, 8.4, 8.6), cut = ellipseIn(cx + 0.6, 0.2, 7.4, 8);
  const blade = (px, py) => out(px, py) && !cut(px, py) && py < 2.2 && !(px < cx && py > top - 1.4 && px > hx + 1.2);
  iconPaint(g, pen, [blade, boxIn(hx - 1.5, top - 2, hx + 1.5, top + 0.4)], M, { soft: 1 });
  const tip = [cx + 8.2, 2.2];
  return { tip };
}
