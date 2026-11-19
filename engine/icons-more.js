// More icon shapes (batch H3, bundles/specs/core-sprites-2.md "New helpers"): food, raw materials, tools,
// settings signs, currencies and map markers for the icon sets of K17 and K18. They work exactly like the
// shapes of engine/icons.js and are drawn with its pen: each takes (g, pen, options), is written upright in
// local units round (0, 0) about 23 units along its longer side, paints through iconPaint and iconLine,
// and draws no outline (the sprite outlines once inside iconFit). Pure drawing: Node and browser.
//
//   import { ICON_SIZE, ICON_PIVOT, ICON_DIAGONAL, iconClips, iconFit, iconTidy } from '../engine/icons.js';
//   import { iconTool, iconCan } from '../engine/icons-more.js';
//   iconFit(g, { size: p.size, tilt: p.tilt, shade: p.shade, shine: p.shine, angle: ICON_DIAGONAL }, (s, pen) => {
//     iconTool(s, pen, { kind: 'axe', metal: p.metal, wood: p.wood, grip: p.accent });
//     iconTidy(s).outline(INK);
//   });
//
// Leans: things that stand (an egg, a carrot, a bowl of soup) take ICON_LEAN; long tools ICON_DIAGONAL;
// things that lie flat when upright (a fish, a log, planks, an ingot, a banknote, a ticket) take -ICON_LEAN,
// like the loaf of engine/icons.js, so they still rise to the top right. Settings signs and map markers are
// drawn upright. Shapes that end in something a sprite adds later return where it goes (iconBowl `steam`,
// iconTool `tip`, iconPin `plate`). Other makers add shapes here: APPEND at the end.

import { ellipseIn, capsuleIn, polyIn, rectIn } from './surface.js';
import { ramp, tone, mix, INK } from './color.js';
import { placedIn, ringIn, hoopIn, starIn, crossIn, arrowIn } from './shapes.js';
import { FRUIT_KINDS, MEAL_KINDS, drawFruit, drawMeal } from './food.js';
import { iconPaint, iconLine, iconGlint, iconOver } from './icons.js';

const boxIn = (x0, y0, x1, y1) => rectIn(x0, y0, x1 - x0, y1 - y0);
const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const need = (name, o, keys) => { for (const k of keys) if (!o[k]) throw new Error(`${name}: needs ${keys.join(', ')} colours`); };
const oneOf = (name, what, v, list) => { if (!list.includes(v)) throw new Error(`${name}: ${what} "${v}" is not one of ${list.join(', ')}`); };
// a test that holds on a band one unit wide just inside an ellipse: a line drawn round it at every size
const ellipseLineIn = (cx, cy, rx, ry, w = 1) => { const o = ellipseIn(cx, cy, rx, ry), i = ellipseIn(cx, cy, Math.max(0.1, rx - w), Math.max(0.1, ry - w)); return (px, py) => o(px, py) && !i(px, py); };

// ---- food ----------------------------------------------------------------------------------

/**
 * A fruit or a meal of engine/food.js drawn as an icon: drawFruit or drawMeal placed at the pen's centre, at its scale and lean, so the food pickups' shapes serve as icons.
 * Arguments: g: the Surface; pen: from iconPen or iconFit (a bold pen draws it at its normal weight); options { kind (one of FRUIT_KINDS or MEAL_KINDS of food.js), colour (the fruit, meat, crust or cheese), stalk, leaf (colours for a fruit; no leaf: none), bone (the drumstick's bone) }.
 * Returns what drawFruit / drawMeal return: { body (the silhouette as a frame shape test), glint ([x, y] in frame pixels) }.
 */
export function iconFood(g, pen, o = {}) {
  const { kind = 'apple', colour, stalk, leaf = null, bone } = o;
  if (!colour) throw new Error('iconFood: needs a colour');
  const [cx, cy] = pen.pt(0, 0);
  if (FRUIT_KINDS.includes(kind)) return drawFruit(g, cx, cy, { kind, k: pen.k * 1.3, angle: pen.angle, colour, stalk, leaf, shine: pen.shine });
  if (MEAL_KINDS.includes(kind)) return drawMeal(g, cx, cy, { kind, k: pen.k * 1.2, angle: pen.angle, colour, bone });
  throw new Error(`iconFood: kind "${kind}" is not one of ${[...FRUIT_KINDS, ...MEAL_KINDS].join(', ')}`);
}

/**
 * A whole fish lying level, head to the right, with a forked tail, a fin on its back, a gill line and one eye; lean it with -ICON_LEAN so the head rises to the top right.
 * Arguments: g: the Surface; pen: from iconPen; options { body, belly, fin (colours: the back, the pale underside, the tail and fins) }.
 */
export function iconFish(g, pen, o = {}) {
  need('iconFish', o, ['body', 'belly', 'fin']);
  const { body, belly, fin } = o, B = ramp(body), shape = ellipseIn(1.5, 0, 9.6, 5.4);
  iconPaint(g, pen, [polyIn([[-6, 0], [-11.5, -6], [-9.4, 0], [-11.5, 6]]), polyIn([[-3.6, -3.8], [3, -4.6], [-4.6, -8.2]]), polyIn([[-1, 4], [3, 4.4], [-1.6, 7.4]])], fin, { soft: 0 });
  iconPaint(g, pen, shape, B, { soft: 1 });
  iconPaint(g, pen, shape, belly, { soft: 0, light: 0, clip: (x, y) => y > 1.4 && x > -6 });
  iconLine(g, pen, [[4.4, -3.6], [3.6, 0], [4.4, 3.4]], B.dark, { over: true });
  iconPaint(g, pen, ellipseIn(7.4, -1.4, 1.15, 1.15), INK, { flat: true });
  iconGlint(g, pen, 1, -3.6, { len: 1, dot: false });
  return g;
}

/**
 * An egg standing on its broad end, plain or speckled.
 * Arguments: g: the Surface; pen: from iconPen; options { shell (colour), speckle (a colour: small spots on the shell; default none: plain) }.
 */
export function iconEgg(g, pen, o = {}) {
  need('iconEgg', o, ['shell']);
  const { shell, speckle = null } = o;
  const egg = (px, py) => { if (Math.abs(py) > 11.5) return false; const a = 8.4 * (1 + (0.15 * py) / 11.5); return (px / a) ** 2 + (py / 11.5) ** 2 <= 1; };
  iconPaint(g, pen, egg, shell, { soft: 3 });
  if (speckle) iconPaint(g, pen, [[-3.6, -3.6], [2.6, -6.2], [4.4, 1], [-4.8, 4.2], [0.6, 4.4], [-1, -0.6], [3.4, 7.2]].map(([x, y]) => ellipseIn(x, y, 1.2, 1)), speckle, { flat: true, clip: egg });
  iconGlint(g, pen, 3.2, -6.4);
  return g;
}

/** The roots iconRoot draws: carrot (a long tapering root), turnip (a round bulb with a thin tail). No arguments: a frozen list. */
export const ROOT_KINDS = Object.freeze(['carrot', 'turnip']);

/**
 * A root vegetable standing on its tip under its leafy top: a carrot (a long tapering root with ridges) or a turnip (a round bulb with a pale crown and a thin tail).
 * Arguments: g: the Surface; pen: from iconPen; options { kind (one of ROOT_KINDS, default 'carrot'), root, leaf (colours) }.
 */
export function iconRoot(g, pen, o = {}) {
  const { kind = 'carrot', root, leaf } = o;
  oneOf('iconRoot', 'kind', kind, ROOT_KINDS);
  need('iconRoot', o, ['root', 'leaf']);
  const R = ramp(root), top = kind === 'carrot' ? -4.6 : -2.6;
  iconPaint(g, pen, [capsuleIn(0, top, -4.6, -12, 1.6, 0.8), capsuleIn(0, top, 0.6, -13, 1.7, 0.9), capsuleIn(0, top, 5, -11.4, 1.6, 0.8)], leaf, { soft: 0 });
  if (kind === 'carrot') {
    const body = [polyIn([[-4.6, -4.4], [4.6, -4.4], [0.7, 11.5], [-0.7, 11.5]]), ellipseIn(0, -4.4, 4.6, 1.6)];
    iconPaint(g, pen, body, R, { soft: 1 });
    for (const [y, w] of [[-0.6, 2.2], [3.4, 1.6], [7.2, 1]]) iconLine(g, pen, [[-w - 1, y], [-0.2, y + 0.6]], R.dark, { over: true });
  } else {
    const bulb = ellipseIn(0, 3, 7.8, 7);
    iconPaint(g, pen, [bulb, capsuleIn(0, 8, 0.6, 12.6, 1.4, 0.4)], R, { soft: 2 });
    iconPaint(g, pen, bulb, mix(root, '#ffffff', 0.55), { soft: 0, light: 0, clip: (x, y) => y < 0.4 });
  }
  return g;
}

/**
 * A plain mushroom: a smooth domed cap with its gills showing underneath, on a thick stem; no spots and no face.
 * Arguments: g: the Surface; pen: from iconPen; options { cap, stem (colours) }.
 */
export function iconMushroom(g, pen, o = {}) {
  need('iconMushroom', o, ['cap', 'stem']);
  const { cap, stem } = o, S = ramp(stem);
  iconPaint(g, pen, [boxIn(-3.4, -1, 3.4, 9.6), ellipseIn(0, 9.4, 4.4, 2.2)], S, { soft: 1 });
  iconPaint(g, pen, ellipseIn(0, -0.6, 10.2, 2.6), S.dark, { flat: true, clip: (x, y) => y > -1.2 });
  for (const x of [-7, -4, 4, 7]) iconLine(g, pen, [[x * 0.7, -0.4], [x, 1]], S.deep, { over: true });
  iconPaint(g, pen, ellipseIn(0, -1.2, 11.5, 9.4), cap, { soft: 2, minus: boxIn(-12, -1.2, 12, 10) });
  iconGlint(g, pen, 4, -7.2, { len: 1 });
  return g;
}

/**
 * A bowl of soup seen from a little above: a round bowl on a foot, the soup's surface inside its rim and a herb leaf floating on it.
 * Arguments: g: the Surface; pen: from iconPen; options { bowl, soup, herb (colours) }. Returns { steam: [x, y] } (just above the soup, for steam drawn after the outline) in local units.
 */
export function iconBowl(g, pen, o = {}) {
  need('iconBowl', o, ['bowl', 'soup', 'herb']);
  const { bowl, soup, herb } = o, Bw = ramp(bowl);
  iconPaint(g, pen, [ellipseIn(0, -1, 11.5, 9.4), boxIn(-4.4, 7, 4.4, 9.8)], Bw, { soft: 2, minus: boxIn(-12, -12, 12, -1) });
  iconPaint(g, pen, ellipseIn(0, -1, 11.5, 3.6), Bw.light, { flat: true });
  iconPaint(g, pen, ellipseIn(0, -0.8, 9.6, 2.5), soup, { soft: 0, light: 0 });
  iconPaint(g, pen, [capsuleIn(-4.6, -0.4, -0.6, -1.6, 0.6, 1.5), capsuleIn(-0.6, -1.6, 2, -0.6, 1.5, 0.6), capsuleIn(1.4, 0.2, 4.4, -0.4, 1.1, 0.5)], herb, { flat: true });
  return { steam: [0, -5] };
}

// ---- raw materials -------------------------------------------------------------------------

/**
 * A short log lying level, its cut end to the right showing rings, bark lines along it and a stub of a branch on top; lean it with -ICON_LEAN.
 * Arguments: g: the Surface; pen: from iconPen; options { bark, wood (colours: the bark and the cut end) }.
 */
export function iconLog(g, pen, o = {}) {
  need('iconLog', o, ['bark', 'wood']);
  const { bark, wood } = o, K = ramp(bark), W = ramp(wood);
  iconPaint(g, pen, [boxIn(-9.4, -5.6, 7.4, 5.6), ellipseIn(-9.4, 0, 2.2, 5.6), capsuleIn(-3, -4.6, -1.4, -8.6, 1.6, 1.2)], K, { soft: 2 });
  for (const y of [-2.6, 1.4]) iconLine(g, pen, [[-8.6, y], [-4, y + 0.6], [4, y + 0.2]], K.dark, { over: true });
  iconPaint(g, pen, ellipseIn(7.6, 0, 3.9, 5.8), W, { soft: 0, light: 0 });
  iconPaint(g, pen, [ellipseLineIn(7.6, 0, 2.7, 4.1), ellipseIn(7.6, 0, 0.9, 1.2)], W.dark, { flat: true });
  return g;
}

/**
 * Sawn planks, one to three, stacked crosswise in a small pile, each with a grain line and a pale sawn end.
 * Arguments: g: the Surface; pen: from iconPen; options { wood (colour), count (1 to 3, default 3) }.
 */
export function iconPlank(g, pen, o = {}) {
  need('iconPlank', o, ['wood']);
  const n = whole(o.count ?? 3, 1, 3), W = ramp(o.wood);
  const lay = { 1: [[0, 0, 0]], 2: [[0, 3, 0.28], [0, -3, -0.28]], 3: [[0, 6, 0], [0, 0.4, -0.4], [0, -5.4, 0.1]] }[n];
  for (const [x, y, a] of lay) {
    const plank = placedIn(boxIn(-11.5, -2.6, 11.5, 2.6), x, y, { angle: a });
    iconPaint(g, pen, plank, W, { soft: 1, rim: W.deep });
    iconPaint(g, pen, placedIn(boxIn(9.4, -2.6, 11.5, 2.6), x, y, { angle: a }), W.light, { flat: true, clip: plank });
    const c = Math.cos(a), s = Math.sin(a), at = (u, v) => [x + u * c - v * s, y + u * s + v * c];
    iconLine(g, pen, [at(-9.6, 0.2), at(-2, -0.4), at(7, 0.3)], W.dark, { over: true });
  }
  return g;
}

/**
 * A rock: with no flecks a smooth round boulder (plain stone); with flecks an angular chunk broken open, its metal flecks showing in the break (ore).
 * Arguments: g: the Surface; pen: from iconPen; options { stone (colour), fleck (the metal's colour; needed when flecks is above 0), flecks (0 to 5, default 3: 0 is plain stone) }.
 */
export function iconOre(g, pen, o = {}) {
  const { stone, fleck } = o, n = whole(o.flecks ?? 3, 0, 5);
  if (!stone || (n > 0 && !fleck)) throw new Error('iconOre: needs a stone colour, and a fleck colour when flecks is above 0');
  const S = ramp(stone);
  if (!n) {
    iconPaint(g, pen, [ellipseIn(-2.6, 2, 8.9, 7.2), ellipseIn(3.6, 2.6, 7.9, 6.4), ellipseIn(0.4, -2.8, 7.6, 6.6)], S, { soft: 3 });
    iconLine(g, pen, [[-6.8, 4.6], [-2.6, 6.4]], S.dark, { over: true });
    return g;
  }
  const chunk = polyIn([[-10.6, 4.4], [-11.4, -2.4], [-6.2, -9.4], [0.6, -11.4], [6.6, -8.4], [11.2, -1.4], [9.6, 7.4], [1.4, 11.4], [-6.4, 9.6]]);
  iconPaint(g, pen, chunk, S, { soft: 2 });
  iconPaint(g, pen, polyIn([[0.6, -11.4], [6.6, -8.4], [11.2, -1.4], [3.2, -2.6]]), pen.shine ? S.light : S.base, { flat: true, clip: chunk });
  iconLine(g, pen, [[-6.2, -9.4], [-2.4, -2.4], [3.2, -2.6]], S.dark, { over: true });
  iconLine(g, pen, [[-2.4, -2.4], [-3.6, 6.2]], S.dark, { over: true });
  const at = [[-5.2, 2.6], [3.6, 3.2], [-6.4, -4], [5.6, -5], [0.2, 7.4]];
  for (let i = 0; i < n; i++) {
    const [x, y] = at[i];
    iconPaint(g, pen, polyIn([[x, y - 2.4], [x + 2.3, y - 0.2], [x + 0.6, y + 2.2], [x - 2.2, y + 0.4]]), fleck, { soft: 0, rim: S.dark });
  }
  iconGlint(g, pen, at[0][0], at[0][1] - 1.8, { len: 1, dot: false });
  return g;
}

/**
 * A cast metal bar seen from the front and a little above: a sloping front face under a lit top face; with stack 2 a second bar lies on the first. Lean it with -ICON_LEAN.
 * Arguments: g: the Surface; pen: from iconPen; options { metal (colour), stack (1 or 2, default 1) }.
 */
export function iconIngot(g, pen, o = {}) {
  need('iconIngot', o, ['metal']);
  const n = whole(o.stack ?? 1, 1, 2), M = ramp(o.metal), lift = n === 2 ? 3.4 : 0;
  const bar = (dx, dy) => {
    const front = polyIn([[-11.5 + dx, 4.6 + dy], [11.5 + dx, 4.6 + dy], [9 + dx, -0.6 + dy], [-9 + dx, -0.6 + dy]]);
    const top = polyIn([[-9 + dx, -0.6 + dy], [9 + dx, -0.6 + dy], [7.2 + dx, -4.6 + dy], [-7.2 + dx, -4.6 + dy]]);
    iconPaint(g, pen, [front, top], M, { soft: 1, rim: M.deep });
    iconPaint(g, pen, top, pen.shine ? M.light : M.base, { flat: true });
    iconLine(g, pen, [[-8.6 + dx, -0.6 + dy], [8.6 + dx, -0.6 + dy]], M.dark, { over: true });
  };
  bar(0, lift);
  if (n === 2) bar(1, lift - 6.6);
  iconGlint(g, pen, -3, lift - (n === 2 ? 10.4 : 3.8), { len: 1, dot: false });
  return g;
}

/**
 * A bolt of cloth: a fat roll lying level, its right end showing the turns of cloth round a core that pokes out, and its loose end hanging down in front in a fold.
 * Arguments: g: the Surface; pen: from iconPen; options { cloth, core (colours) }.
 */
export function iconCloth(g, pen, o = {}) {
  need('iconCloth', o, ['cloth', 'core']);
  const { cloth, core } = o, C = ramp(cloth), cy = -3;
  iconPaint(g, pen, capsuleIn(4, cy, 9.6, cy, 2.1), core, { soft: 0 });
  iconPaint(g, pen, [boxIn(-9.6, cy - 6.4, 4, cy + 6.4), ellipseIn(-9.6, cy, 1.9, 6.4)], C, { soft: 2 });
  iconPaint(g, pen, ellipseIn(4, cy, 4.2, 6.4), pen.shine ? C.light : C.base, { flat: true, rim: C.dark });
  iconPaint(g, pen, ellipseLineIn(4, cy, 2.9, 4.6), C.dark, { flat: true });
  iconOver(g, pen, ellipseIn(4, cy, 1.7, 2.6), core, { soft: 0, light: 0, rim: C.dark });
  iconPaint(g, pen, polyIn([[-9, cy + 5.6], [2.6, cy + 5.6], [1.2, 11.5], [-3.4, 10.2], [-6.6, 11.5], [-10, 10.4]]), C, { soft: 1, rim: C.dark });
  iconLine(g, pen, [[-3.4, cy + 6.6], [-3.4, 9.8]], C.dark, { over: true });
  return g;
}

/**
 * A coil of rope seen from a little above: three turns lying on one another and the loose end trailing off to the right.
 * Arguments: g: the Surface; pen: from iconPen; options { rope (colour) }.
 */
export function iconCoil(g, pen, o = {}) {
  need('iconCoil', o, ['rope']);
  const R = ramp(o.rope);
  iconPaint(g, pen, [capsuleIn(7.4, 5.4, 11, 9, 1.5), capsuleIn(11, 9, 6.6, 11.4, 1.5)], R, { soft: 0, rim: R.deep });
  for (const y of [5, 1, -3]) iconPaint(g, pen, hoopIn(0, y, 10.4, 6.4, 3), R, { soft: 1, rim: R.deep });
  for (const [x, y] of [[-8.4, -1.6], [-5, 1.6], [5, 1.4], [8.4, -1.8]]) iconLine(g, pen, [[x - 0.6, y - 1], [x + 0.6, y + 1]], R.dark, { over: true });
  return g;
}

/**
 * A hide stretched flat with four points where the legs were, a darker line down its back and a few stitches round its edge.
 * Arguments: g: the Surface; pen: from iconPen; options { hide (colour) }.
 */
export function iconHide(g, pen, o = {}) {
  need('iconHide', o, ['hide']);
  const Hd = ramp(o.hide);
  const pts = [[0, -10.4], [5.4, -9], [11.5, -11.5], [8.6, -4], [9.4, 4], [11.5, 11.5], [4.4, 8.8], [0, 10.4], [-4.4, 8.8], [-11.5, 11.5], [-9.4, 4], [-8.6, -4], [-11.5, -11.5], [-5.4, -9]];
  iconPaint(g, pen, polyIn(pts), Hd, { soft: 2 });
  iconLine(g, pen, [[0, -8.6], [0.4, 0], [0, 8.6]], Hd.dark, { over: true });
  for (const [x, y] of [[-6.4, -6], [6.4, -6], [6.6, 5.6], [-6.6, 5.6]]) iconPaint(g, pen, ellipseIn(x, y, 0.8, 0.8), Hd.dark, { flat: true });
  return g;
}

// ---- tools ---------------------------------------------------------------------------------

/** The hand tools iconTool draws: axe, pickaxe, shovel, hoe, hammer, sickle. No arguments: a frozen list. */
export const TOOL_KINDS = Object.freeze(['axe', 'pickaxe', 'shovel', 'hoe', 'hammer', 'sickle']);

/**
 * A hand tool standing on its handle, head at the top: lean it with ICON_DIAGONAL so the handle ends bottom left; an optional wrap round the handle just under the head.
 * Arguments: g: the Surface; pen: from iconPen; options { kind (one of TOOL_KINDS, default 'axe'), metal, wood (colours), grip (a colour: the wrap; default none) }. Returns { tip: [x, y] } (the working edge or point) in local units.
 */
export function iconTool(g, pen, o = {}) {
  const { kind = 'axe', metal, wood, grip = null } = o;
  oneOf('iconTool', 'kind', kind, TOOL_KINDS);
  need('iconTool', o, ['metal', 'wood']);
  const M = ramp(metal), short = kind === 'sickle', foot = 11.5, head = short ? 1 : -8;
  iconPaint(g, pen, boxIn(-1.3, head, 1.3, foot), wood, { soft: 0 });
  if (kind === 'shovel') iconPaint(g, pen, boxIn(-3.6, foot - 2, 3.6, foot + 0.6), wood, { soft: 0 });
  if (grip) iconPaint(g, pen, short ? boxIn(-1.7, 4.6, 1.7, 9.4) : boxIn(-1.7, -5, 1.7, -1.2), grip, { flat: true, rim: tone(grip, -1) });
  let tip;
  if (kind === 'axe') {
    iconPaint(g, pen, [polyIn([[0.6, -11.2], [5.4, -12.8], [9.2, -8], [5.6, -3.6], [0.6, -5.4]]), boxIn(-3.4, -11, 0.6, -6)], M, { soft: 1 });
    iconPaint(g, pen, polyIn([[5.4, -12.8], [9.2, -8], [5.6, -3.6], [7, -8]]), pen.shine ? M.light : M.base, { flat: true });
    tip = [9.2, -8];
  } else if (kind === 'pickaxe') {
    iconPaint(g, pen, [capsuleIn(-11, -5.4, -4.4, -9.4, 0.6, 1.9), capsuleIn(-4.4, -9.4, 4.4, -9.4, 1.9), capsuleIn(4.4, -9.4, 11, -5.4, 1.9, 0.6), boxIn(-2.1, -12, 2.1, -7.6)], M, { soft: 1 });
    tip = [11, -5.4];
  } else if (kind === 'shovel') {
    iconPaint(g, pen, [polyIn([[-5.2, -4.6], [5.2, -4.6], [5.2, -10.6], [0, -13.4], [-5.2, -10.6]]), boxIn(-1.9, -6.4, 1.9, -3)], M, { soft: 1 });
    iconLine(g, pen, [[0, -5], [0, -11]], M.dark, { over: true });
    tip = [0, -13.4];
  } else if (kind === 'hoe') {
    iconPaint(g, pen, [boxIn(-1.9, -11.8, 1.9, -8.4), polyIn([[1.6, -11.8], [8, -11.8], [9.6, -4.6], [5.8, -4.6], [5, -8.6], [1.6, -8.6]])], M, { soft: 1 });
    tip = [9.6, -4.6];
  } else if (kind === 'hammer') {
    iconPaint(g, pen, [boxIn(-7.4, -12.4, 5, -6.2), boxIn(5, -11.6, 7.4, -7)], M, { soft: 1 });
    iconPaint(g, pen, boxIn(5, -11.6, 7.4, -7), pen.shine ? M.light : M.base, { flat: true });
    tip = [7.4, -9.3];
  } else {
    // the blade curls up from the top of the short handle and round to the left, to a point
    const out = ellipseIn(-1.8, -4.4, 9.4, 9.4), hole = ellipseIn(-3.4, -2.8, 7.6, 8);
    iconPaint(g, pen, [(px, py) => out(px, py) && !hole(px, py) && py < 2.6 && !(px < -4 && py > -3), boxIn(-1.9, -0.4, 1.9, 2.6)], M, { soft: 1 });
    tip = [-10.8, -4.6];
  }
  return { tip };
}

/**
 * A watering can: a round-shouldered body with a handle arching over its top, a long spout rising to the right ending in a flat rose, and drops falling from it; an optional band round the body.
 * Arguments: g: the Surface; pen: from iconPen; options { metal (colour), water (a colour: three drops under the rose; default none), band (a colour: a band round the body; default none) }.
 */
export function iconCan(g, pen, o = {}) {
  need('iconCan', o, ['metal']);
  const { metal, water = null, band = null } = o, M = ramp(metal);
  const body = [boxIn(-10, -2.4, 3, 9.4), ellipseIn(-3.5, -2.4, 6.5, 2.6)], arch = ringIn(-3.5, -2.6, 6.6, 1.9), rose = [8.6, -6.4];
  iconPaint(g, pen, [(px, py) => arch(px, py) && py < -2.6, capsuleIn(1.6, 6, ...rose, 1.5, 1.1), placedIn(ellipseIn(0, 0, 1.4, 3.3), ...rose, { angle: -0.93 })], M, { soft: 0 });
  iconPaint(g, pen, body, M, { soft: 2 });
  if (band) iconPaint(g, pen, body, band, { flat: true, rim: M.dark, clip: (x, y) => y > 2.4 && y < 5.4 });
  if (water) iconPaint(g, pen, [[11.2, -1.6], [8.8, 1.4], [11.6, 4.2]].map(([x, y]) => capsuleIn(x, y - 1.4, x, y + 0.4, 0.4, 1)), water, { soft: 0 });
  iconGlint(g, pen, 0, -1);
  return g;
}

/**
 * A fishing rod standing on its butt: a tapering rod whose tip bends over to the right, with a reel near the bottom, its line hanging straight down the screen from the tip to a hook, whatever the lean.
 * Arguments: g: the Surface; pen: from iconPen; options { wood, line, metal (colours: the rod, the line, the reel and hook) }.
 */
export function iconRod(g, pen, o = {}) {
  need('iconRod', o, ['wood', 'line', 'metal']);
  const { wood, line, metal } = o;
  const down = [Math.sin(pen.angle), Math.cos(pen.angle)], tip = [4.2, -11.5], end = [tip[0] + down[0] * 13, tip[1] + down[1] * 13];
  iconPaint(g, pen, [capsuleIn(0, 11.5, 0.6, -5, 1.5, 0.9), capsuleIn(0.6, -5, 2, -9.4, 0.9, 0.7), capsuleIn(2, -9.4, tip[0], tip[1], 0.7, 0.6)], wood, { soft: 0 });
  iconLine(g, pen, [tip, end], line);
  iconPaint(g, pen, [ellipseIn(2.9, 5, 2.6, 2.6), boxIn(-0.4, 4.2, 2.4, 5.8)], metal, { soft: 0 });
  const across = [down[1], -down[0]], hk = (u, v) => [end[0] + down[0] * u + across[0] * v, end[1] + down[1] * u + across[1] * v];
  iconPaint(g, pen, [capsuleIn(...end, ...hk(2.4, 0), 0.6), capsuleIn(...hk(2.4, 0), ...hk(2.6, 1.8), 0.6), capsuleIn(...hk(2.6, 1.8), ...hk(1.4, 2.2), 0.6)], metal, { flat: true });
  return g;
}

// ---- settings signs ------------------------------------------------------------------------

/**
 * A settings cog: a toothed wheel with a round hub of a second colour and a hole through its middle.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the wheel), hub (colour), teeth (6 to 10, default 8) }.
 */
export function iconCog(g, pen, o = {}) {
  need('iconCog', o, ['colour', 'hub']);
  const n = whole(o.teeth ?? 8, 6, 10), w = 1.3 + 5.6 / n, teeth = [];
  for (let i = 0; i < n; i++) teeth.push(placedIn(polyIn([[-w, -7], [w, -7], [w * 0.8, -11.5], [-w * 0.8, -11.5]]), 0, 0, { angle: (i * 2 * Math.PI) / n }));
  iconPaint(g, pen, [ellipseIn(0, 0, 7.6, 7.6), ...teeth], o.colour, { soft: 0 });
  iconOver(g, pen, ellipseIn(0, 0, 4.6, 4.6), o.hub, { soft: 0, minus: ellipseIn(0, 0, 1.9, 1.9) });
  return g;
}

/**
 * A loudspeaker facing right, with none to two sound waves in front of it or a cross for mute.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, waves (0 to 2, default 2), cross (a colour: a cross in front for mute; default none) }.
 */
export function iconSpeaker(g, pen, o = {}) {
  need('iconSpeaker', o, ['colour']);
  const { colour, cross = null } = o, n = whole(o.waves ?? 2, 0, 2);
  iconPaint(g, pen, [boxIn(-11.5, -3.6, -6, 3.6), polyIn([[-6.6, -3.6], [0, -9.6], [0, 9.6], [-6.6, 3.6]])], colour, { soft: 0 });
  const arcs = [ringIn(-0.6, 0, 6.4, 2.4), ringIn(-0.6, 0, 11, 2.4)].slice(0, n);
  if (n) iconPaint(g, pen, arcs, colour, { soft: 0, clip: (x, y) => x > 2.4 && Math.abs(y) < (x - 1.2) * 1.15 });
  if (cross) iconPaint(g, pen, [capsuleIn(3, -4, 10.4, 4, 1.4), capsuleIn(3, 4, 10.4, -4, 1.4)], cross, { soft: 0 });
  return g;
}

/**
 * A music note: one note on a stem with a flag, or two notes joined by a beam.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, double (true: two joined notes; default false) }.
 */
export function iconNote(g, pen, o = {}) {
  need('iconNote', o, ['colour']);
  const head = (x, y) => placedIn(ellipseIn(0, 0, 4, 2.9), x, y, { angle: -0.42 });
  if (o.double) iconPaint(g, pen, [head(-6.6, 8.2), head(5.4, 5.6), boxIn(-4.2, -6.6, -2, 8), boxIn(7.8, -9.2, 10, 5.4), polyIn([[-4.2, -6.6], [10, -10.2], [10, -6.4], [-4.2, -2.8]])], o.colour, { soft: 0 });
  else iconPaint(g, pen, [head(-3.4, 8.2), boxIn(-1, -11.5, 1.4, 8), capsuleIn(1.2, -10.4, 6.6, -5.4, 1.5), capsuleIn(6.6, -5.4, 6, -1.4, 1.4, 1)], o.colour, { soft: 0 });
  return g;
}

/**
 * A screen on a stand: a frame round a dark pane, with four corner marks on the pane for full screen.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the frame and stand; the pane is a dark tone of it), corners (true: the full-screen marks; default false) }.
 */
export function iconScreen(g, pen, o = {}) {
  need('iconScreen', o, ['colour']);
  const C = ramp(o.colour);
  iconPaint(g, pen, [boxIn(-11.5, -8.4, 11.5, 6), boxIn(-1.6, 6, 1.6, 9.4), boxIn(-5.6, 9, 5.6, 11)], C, { soft: 0 });
  iconPaint(g, pen, boxIn(-9.2, -6.2, 9.2, 3.8), mix(C.deep, INK, 0.4), { flat: true });
  if (o.corners) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * 7, y = -1.2 + sy * 3.6;
    iconPaint(g, pen, [boxIn(Math.min(x, x - sx * 3.6), y - 0.7, Math.max(x, x - sx * 3.6), y + 0.7), boxIn(x - 0.7, Math.min(y, y - sy * 2.6), x + 0.7, Math.max(y, y - sy * 2.6))], C.light, { flat: true });
  }
  return g;
}

/**
 * A generic game controller: a rounded bar with two grips hanging from it, a small cross on the left and two dots on the right; no maker's outline.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the body), mark (the cross and dots) }.
 */
export function iconPad(g, pen, o = {}) {
  need('iconPad', o, ['colour', 'mark']);
  iconPaint(g, pen, [capsuleIn(-6.4, -1.6, 6.4, -1.6, 5.4), capsuleIn(-7.4, 0, -8.6, 5.6, 3.6, 2.9), capsuleIn(7.4, 0, 8.6, 5.6, 3.6, 2.9)], o.colour, { soft: 0 });
  iconPaint(g, pen, [crossIn(-6, -1.8, 5.6, 1.9), ellipseIn(5, -3.4, 1.3, 1.3), ellipseIn(7.8, -0.6, 1.3, 1.3)], o.mark, { flat: true });
  return g;
}

/**
 * A globe for language: a disc crossed by an equator and a pair of meridians in a dark tone of its colour; two lines add two parallels, three a middle meridian.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, lines (1 to 3, default 2) }.
 */
export function iconGlobe(g, pen, o = {}) {
  need('iconGlobe', o, ['colour']);
  const n = whole(o.lines ?? 2, 1, 3), C = ramp(o.colour), R = 11.2, disc = ellipseIn(0, 0, R, R);
  iconPaint(g, pen, disc, C, { soft: 0 });
  const lines = [boxIn(-R, -0.6, R, 0.6), ellipseLineIn(0, 0, 5.4, R, 1.2)];
  if (n >= 2) lines.push(boxIn(-R, -6.2, R, -5), boxIn(-R, 5, R, 6.2));
  if (n >= 3) lines.push(boxIn(-0.6, -R, 0.6, R));
  iconPaint(g, pen, lines, C.dark, { flat: true, clip: disc });
  return g;
}

/**
 * An open tray with an arrow going into it (save) or out of it (load), the arrow parted from the tray by an ink line where they touch.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the tray), arrow ('in' | 'out', default 'in'), mark (a colour for the arrow; default the tray's) }.
 */
export function iconTray(g, pen, o = {}) {
  const { colour, arrow = 'in', mark = colour } = o;
  oneOf('iconTray', 'arrow', arrow, ['in', 'out']);
  need('iconTray', o, ['colour']);
  iconPaint(g, pen, boxIn(-11.5, 1.6, 11.5, 10.6), colour, { soft: 0, minus: boxIn(-8.8, 1, 8.8, 7.8) });
  const a = arrow === 'in' ? arrowIn(0, -11.5, 0, 6, { shaft: 4.4, head: 11, long: 6.6 }) : arrowIn(0, 6, 0, -11.5, { shaft: 4.4, head: 11, long: 6.6 });
  iconOver(g, pen, a, mark, { soft: 0 });
  return g;
}

/** The signs iconSign draws: play, pause, stop, close, tick, plus, minus, back, next. No arguments: a frozen list. */
export const SIGN_KINDS = Object.freeze(['play', 'pause', 'stop', 'close', 'tick', 'plus', 'minus', 'back', 'next']);

/**
 * A bold flat sign in one colour: play, pause, stop, close (an X, also a dig spot on a map), tick, plus, minus, back or next.
 * Arguments: g: the Surface; pen: from iconPen; options { kind (one of SIGN_KINDS, default 'play'), colour }.
 */
export function iconSign(g, pen, o = {}) {
  const { kind = 'play', colour } = o;
  oneOf('iconSign', 'kind', kind, SIGN_KINDS);
  need('iconSign', o, ['colour']);
  const shapes = {
    play: [polyIn([[-7.4, -10.6], [9.6, 0], [-7.4, 10.6]])],
    pause: [boxIn(-8.4, -10.4, -2.6, 10.4), boxIn(2.6, -10.4, 8.4, 10.4)],
    stop: [boxIn(-9.4, -9.4, 9.4, 9.4)],
    close: [capsuleIn(-8.2, -8.2, 8.2, 8.2, 2.9), capsuleIn(-8.2, 8.2, 8.2, -8.2, 2.9)],
    tick: [capsuleIn(-9.4, 0.6, -3.4, 6.6, 2.8), capsuleIn(-3.4, 6.6, 9.4, -6.6, 2.8)],
    plus: [crossIn(0, 0, 21, 6.4)],
    minus: [boxIn(-10.5, -3.2, 10.5, 3.2)],
    back: [arrowIn(10.6, 0, -10.6, 0, { shaft: 6.4, head: 19, long: 10 })],
    next: [arrowIn(-10.6, 0, 10.6, 0, { shaft: 6.4, head: 19, long: 10 })],
  };
  iconPaint(g, pen, shapes[kind], colour, { soft: 0 });
  return g;
}

/**
 * A small house seen from the front: a wall under a pitched roof with a chimney, and a door.
 * Arguments: g: the Surface; pen: from iconPen; options { wall, roof, door (colours) }.
 */
export function iconHome(g, pen, o = {}) {
  need('iconHome', o, ['wall', 'roof', 'door']);
  const { wall, roof, door } = o;
  iconPaint(g, pen, boxIn(-8.4, -1.4, 8.4, 10.6), wall, { soft: 0 });
  iconOver(g, pen, boxIn(-2.6, 3, 2.6, 10.6), door, { soft: 0, light: 0 });
  iconPaint(g, pen, [polyIn([[-11.5, 0.6], [0, -10.6], [11.5, 0.6]]), boxIn(4.4, -9.6, 7.6, -3.4)], roof, { soft: 0, rim: INK });
  return g;
}

// ---- currencies ----------------------------------------------------------------------------

/**
 * A stack of one to four coins seen from a little above, their edges showing, the top coin's face lit.
 * Arguments: g: the Surface; pen: from iconPen; options { metal (colour), count (1 to 4, default 3) }.
 */
export function iconCoins(g, pen, o = {}) {
  need('iconCoins', o, ['metal']);
  const n = whole(o.count ?? 3, 1, 4), M = ramp(o.metal), step = 3.6, base = ((n - 1) * step) / 2 + 1.6;
  for (let i = 0; i < n; i++) {
    const y = base - i * step;
    iconPaint(g, pen, [ellipseIn(0, y, 10, 4.2), boxIn(-10, y, 10, y + 2.2), ellipseIn(0, y + 2.2, 10, 4.2)], M, { soft: 1, rim: M.deep });
    for (const x of [-6, -2, 2, 6]) iconLine(g, pen, [[x, y + 4.2], [x, y + 5.2]], M.dark, { over: true });
  }
  const top = base - (n - 1) * step;
  iconPaint(g, pen, ellipseIn(0, top, 10, 4.2), pen.shine ? M.light : M.base, { flat: true });
  iconPaint(g, pen, ellipseLineIn(0, top, 7.2, 2.8), M.dark, { flat: true });
  return g;
}

/**
 * A banknote folded down the middle so its two halves catch the light differently, with a plain oval in the middle; no currency sign, no letters, no portrait. Lean it with -ICON_LEAN.
 * Arguments: g: the Surface; pen: from iconPen; options { paper, mark (colours: the note and its oval) }.
 */
export function iconBill(g, pen, o = {}) {
  need('iconBill', o, ['paper', 'mark']);
  const R = ramp(o.paper), left = polyIn([[-11.5, -5.4], [0, -7.4], [0, 7.4], [-11.5, 5.4]]), right = polyIn([[0, -7.4], [11.5, -5.4], [11.5, 5.4], [0, 7.4]]);
  iconPaint(g, pen, [left, right], R, { soft: 0, light: 0 });
  iconPaint(g, pen, right, pen.shine ? R.light : R.base, { flat: true });
  iconLine(g, pen, [[-9.4, -3.4], [-9.4, 3.4]], R.dark, { over: true });
  iconLine(g, pen, [[9.4, -3.4], [9.4, 3.4]], R.dark, { over: true });
  iconLine(g, pen, [[0, -7.2], [0, 7.2]], R.dark, { over: true });
  iconOver(g, pen, ellipseIn(0, 0, 3.6, 4.4), o.mark, { soft: 0, light: 0, rim: R.dark });
  return g;
}

/**
 * A thick round token seen from the front and a little above: a metal rim round a face of a second colour carrying a raised star, its edge showing below.
 * Arguments: g: the Surface; pen: from iconPen; options { metal (the rim and star), face (colours) }.
 */
export function iconToken(g, pen, o = {}) {
  need('iconToken', o, ['metal', 'face']);
  const M = ramp(o.metal);
  iconPaint(g, pen, [ellipseIn(0, 1.6, 10.6, 10), ellipseIn(0, -0.6, 10.6, 10)], M, { soft: 2 });
  iconPaint(g, pen, ellipseIn(0, -0.6, 7.4, 7), o.face, { soft: 0, rim: M.dark });
  iconPaint(g, pen, starIn(0, -0.4, 5.6, 5), M, { soft: 0 });
  iconGlint(g, pen, 4.6, -7.6, { len: 1 });
  return g;
}

/**
 * A ticket lying level: a strip with a round notch cut from each end, a stub of a second colour at the right and a dashed tear line before it. Lean it with -ICON_LEAN.
 * Arguments: g: the Surface; pen: from iconPen; options { paper, stub (colours) }.
 */
export function iconTicket(g, pen, o = {}) {
  need('iconTicket', o, ['paper', 'stub']);
  const R = ramp(o.paper), shape = boxIn(-11.5, -6.4, 11.5, 6.4), notches = [ellipseIn(-11.5, 0, 2.6, 2.6), ellipseIn(11.5, 0, 2.6, 2.6)];
  iconPaint(g, pen, shape, R, { soft: 1, minus: notches });
  iconPaint(g, pen, shape, o.stub, { soft: 0, minus: notches, clip: (x) => x > 5.4 });
  for (let y = -5.4; y < 5.6; y += 2.6) iconLine(g, pen, [[4.6, y], [4.6, y + 1]], R.dark, { over: true });
  iconLine(g, pen, [[-7.4, -2.4], [1.4, -2.4]], R.dark, { over: true });
  iconLine(g, pen, [[-7.4, 1.6], [-1, 1.6]], R.dark, { over: true });
  return g;
}

/**
 * A lightning bolt for energy: a zigzag of two slanted strokes ending in a point.
 * Arguments: g: the Surface; pen: from iconPen; options { colour }.
 */
export function iconBolt(g, pen, o = {}) {
  need('iconBolt', o, ['colour']);
  iconPaint(g, pen, polyIn([[1.4, -11.5], [8.4, -11.5], [3, -3], [8.6, -3], [-4.4, 11.5], [-1, 1.4], [-7.4, 1.4]]), o.colour, { soft: 0 });
  return g;
}

// ---- map markers ---------------------------------------------------------------------------

/**
 * A map pin standing on its point: a drop-shaped marker or a round-headed push pin, its head holding a lit dot or a plate for another picture.
 * Arguments: g: the Surface; pen: from iconPen; options { colour, head ('drop' | 'round', default 'drop'), plate (a colour: a disc in the head on which a sprite puts a small picture; default none: a lit dot) }.
 * Returns { plate: { x, y, r } }: the centre and radius of the head's plate in local units.
 */
export function iconPin(g, pen, o = {}) {
  const { colour, head = 'drop', plate = null } = o;
  oneOf('iconPin', 'head', head, ['drop', 'round']);
  need('iconPin', o, ['colour']);
  const C = ramp(colour);
  const at = head === 'drop' ? { x: 0, y: -3.6, r: 5.2 } : { x: 0, y: -5.6, r: 4.4 };
  if (head === 'drop') iconPaint(g, pen, [ellipseIn(0, -3.6, 7.8, 7.8), polyIn([[-6.8, 0.2], [6.8, 0.2], [0, 11.5]])], C, { soft: 0 });
  else {
    iconPaint(g, pen, capsuleIn(0, 1, 0, 11.5, 1.1, 0.5), C.dark, { flat: true });
    iconPaint(g, pen, ellipseIn(0, -5.6, 6.6, 6.2), C, { soft: 0 });
  }
  if (plate) iconOver(g, pen, ellipseIn(at.x, at.y, at.r, at.r), plate, { flat: true });
  else iconPaint(g, pen, ellipseIn(at.x, at.y, 2.4, 2.4), pen.shine ? C.light : C.dark, { flat: true });
  return { plate: at };
}

/**
 * A pennant on a pole: a triangle of cloth flying to the right from the top of a pole with a round knob.
 * Arguments: g: the Surface; pen: from iconPen; options { cloth, pole (colours) }.
 */
export function iconFlag(g, pen, o = {}) {
  need('iconFlag', o, ['cloth', 'pole']);
  iconPaint(g, pen, [boxIn(-8.4, -9.6, -6, 11.5), ellipseIn(-7.2, -10, 1.8, 1.6)], o.pole, { soft: 0 });
  iconPaint(g, pen, polyIn([[-6, -9.6], [10.6, -5], [-6, -0.4]]), o.cloth, { soft: 0, rim: INK });
  return g;
}

/**
 * A shop front: a striped awning with a scalloped edge over a dark opening and a counter, set in a wall.
 * Arguments: g: the Surface; pen: from iconPen; options { cloth, stripe (colours of the awning's stripes), wall (colour) }.
 */
export function iconAwning(g, pen, o = {}) {
  need('iconAwning', o, ['cloth', 'stripe', 'wall']);
  const W = ramp(o.wall);
  iconPaint(g, pen, boxIn(-9.6, -4, 9.6, 10.6), W, { soft: 0 });
  iconPaint(g, pen, boxIn(-7.2, -2, 7.2, 4.4), mix(W.deep, INK, 0.5), { flat: true });
  iconPaint(g, pen, boxIn(-8.4, 4.4, 8.4, 6.8), W.light, { flat: true, rim: W.dark });
  const awning = [polyIn([[-11.5, -4.4], [11.5, -4.4], [9.2, -10.6], [-9.2, -10.6]]), ...[-9.2, -4.6, 0, 4.6, 9.2].map((x) => ellipseIn(x, -4.4, 2.3, 2))];
  iconPaint(g, pen, awning, o.cloth, { soft: 0, rim: INK });
  iconPaint(g, pen, awning, o.stripe, { flat: true, clip: (x) => (((Math.floor((x + 11.5) / 4.6) % 2) + 2) % 2) === 1 });
  return g;
}

/**
 * A treasure chest seen from the front: a wooden box with a domed lid, two metal bands and a lock plate; opened, the lid stands up behind and the dark inside shows.
 * Arguments: g: the Surface; pen: from iconPen; options { wood, metal (colours), open (true: the lid raised; default false) }.
 */
export function iconChest(g, pen, o = {}) {
  need('iconChest', o, ['wood', 'metal']);
  const W = ramp(o.wood), M = ramp(o.metal), open = !!o.open;
  const box = boxIn(-11, -1, 11, 9.6), bands = [boxIn(-7.6, -12, -5.4, 9.6), boxIn(5.4, -12, 7.6, 9.6)];
  if (open) {
    const lid = polyIn([[-11, -1], [11, -1], [9, -11.5], [-9, -11.5]]);
    iconPaint(g, pen, lid, W, { soft: 1 });
    iconPaint(g, pen, lid, W.dark, { flat: true, clip: (x, y) => y > -9.6 && Math.abs(x) < 9.6 - (y + 9.6) * -0.1 });
    iconPaint(g, pen, bands, M, { soft: 0, clip: lid });
    iconPaint(g, pen, box, W, { soft: 2 });
    iconPaint(g, pen, boxIn(-9.6, -1, 9.6, 1.4), mix(W.deep, INK, 0.5), { flat: true });
  } else {
    const lid = [boxIn(-11, -6, 11, -1), ellipseIn(0, -6, 11, 4.4)];
    iconPaint(g, pen, [box, ...lid], W, { soft: 2, minus: boxIn(-12, -12, 12, -10.4) });
    iconLine(g, pen, [[-10.6, -1], [10.6, -1]], W.deep, { over: true });
  }
  iconPaint(g, pen, [...bands, boxIn(-2.2, -3, 2.2, 2.6)], M, { soft: 0, clip: (px, py) => box(px, py) || (!open && (boxIn(-11, -6, 11, -1)(px, py) || ellipseIn(0, -6, 11, 4.4)(px, py))) });
  iconPaint(g, pen, boxIn(-0.6, -1.2, 0.6, 1), M.deep, { flat: true });
  return g;
}
