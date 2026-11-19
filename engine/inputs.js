// Input pictures: keyboard keys, a mouse and the generic parts of a game controller (face buttons, a direction pad, a
// thumbstick, a shoulder button), for "press this" prompts and control-settings screens. Generic shapes only: no
// maker's layout, colours, symbols or letters (style guide section 13). Every function draws bodies only, with no
// outline: the sprite calls g.outline(INK) once after the bodies, then draws motionMarks after it, as light. Colours
// are arguments (sides and grooves are darker tones of them), and every drawing keeps to the box or radius it is given.
//
//   import { keyCap, keyMark, motionMarks } from '../engine/inputs.js';
//   const { top, text } = keyCap(g, 4, 5, 24, 22, { top: p.body, side: p.frame, depth: 2, down });
//   keyMark(g, 'up', top.x + top.w / 2 - 0.5, top.y + top.h / 2 - 0.5, 7, pick(p.body, '#ffffff', INK));
//   g.outline(INK);
//   motionMarks(g, 16, 16, 'up-down', { reach: 12, colour: p.glow, t });
//
// A centre (cx, cy) on a whole number puts a round shape between pixels (an even width); on n + 0.5 it centres it on
// a pixel (an odd width).

import { tone } from './color.js';
import { pulse, fract, TAU } from './motion.js';

/** The pictures keyMark draws on a key: none, up, down, left, right, enter, back, tab, shift. No arguments: a frozen list. */
export const KEY_MARKS = Object.freeze(['none', 'up', 'down', 'left', 'right', 'enter', 'back', 'tab', 'shift']);

const GREY = '#8a8a9a', LIT = '#e6c545';
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dark = (c, k = 1) => tone(c, -k);

// fill every pixel whose centre passes inside(px, py) within [x0, x1) x [y0, y1), clipped to the surface
function fillIn(g, x0, y0, x1, y1, inside, c) {
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(g.h, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(g.w, Math.ceil(x1)); x++) if (inside(x + 0.5, y + 0.5)) g.dot(x, y, c);
  }
}
const disc = (cx, cy, r) => (px, py) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
// a rectangle with its corners cut round to radius r
const roundRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  if (r <= 0) return true;
  const qx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const qy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  return (px - qx) ** 2 + (py - qy) ** 2 <= r * r;
};

/**
 * Draws a keyboard key seen from a little above the front: a flat top face over a darker front side `depth` px tall, inside the box (x, y, w, h).
 * Arguments: g, x, y, w, h (the whole key with its side), o: { top (top colour), side (side colour), corner (0 square .. 1 round; 0.5), depth (side px, 1 to 4; 2), down (the top face sinks by depth onto the side) }. Returns { top, text }: the top face's box and the flat one-colour middle where a game prints its letter, each { x, y, w, h }.
 */
export function keyCap(g, x, y, w, h, { top = '#f0ead8', side = GREY, corner = 0.5, depth = 2, down = false } = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const d = clampN(Math.round(depth), 1, 4), fh = h - d;
  const r = clampN(corner, 0, 1) * Math.min(6, Math.min(w, fh) / 2);
  const ty = down ? y + d : y;
  if (!down) fillIn(g, x, y + d, x + w, y + h, roundRect(x, y + d, w, fh, r), side);
  fillIn(g, x, ty, x + w, ty + fh, roundRect(x, ty, w, fh, r), top);
  const ix = Math.max(2, Math.ceil(r)), iy = Math.max(1, Math.min(2, Math.ceil(r / 2)));
  return {
    top: { x, y: ty, w, h: fh },
    text: { x: x + ix, y: ty + iy, w: Math.max(1, w - 2 * ix), h: Math.max(1, fh - 2 * iy) },
  };
}

// key pictures as sets of whole-pixel cells round the centre pixel; n is how far they reach (7 px across: n = 3)
function arrowUp(n, stem) {
  const out = [];
  for (let k = 0; k <= n; k++) for (let i = -k; i <= k; i++) out.push([i, -n + k]);           // the head, tip on top
  for (let j = 1; j <= n; j++) for (let i = -stem; i <= stem; i++) out.push([i, j]);            // the stem
  return out;
}
const turnCells = (cells, q) => cells.map(([i, j]) => [[i, j], [-j, i], [-i, -j], [j, -i]][q & 3]);   // q quarter turns clockwise
function headLeft(n, at) {                                                                       // a left-pointing head with its tip at x = at
  const out = [], hl = Math.max(2, n - 1);
  for (let k = 0; k < hl; k++) for (let j = -k; j <= k; j++) out.push([at + k, j]);
  return out;
}
const MARK_CELLS = {
  up: (n) => arrowUp(n, Math.floor(n / 3)),
  right: (n) => turnCells(arrowUp(n, Math.floor(n / 3)), 1),
  down: (n) => turnCells(arrowUp(n, Math.floor(n / 3)), 2),
  left: (n) => turnCells(arrowUp(n, Math.floor(n / 3)), 3),
  // a bent return arrow: down the right side, then along to a head pointing left
  enter: (n) => [...headLeft(n, -n), ...Array.from({ length: 2 * n + 1 }, (_, i) => [i - n, 0]), ...Array.from({ length: n }, (_, j) => [n, -n + j])],
  // a left arrow with a bar at its tail
  back: (n) => {
    const hb = Math.max(1, Math.floor(n / 2));
    return [...headLeft(n, -n), ...Array.from({ length: 2 * n }, (_, i) => [i - n, 0]), ...Array.from({ length: 2 * hb + 1 }, (_, j) => [n, j - hb])];
  },
  // a right arrow running to a bar
  tab: (n) => {
    const hb = Math.max(1, Math.floor(n / 2)) + 1;
    return [...headLeft(n, -n + 1).map(([i, j]) => [-i, j]), ...Array.from({ length: 2 * n }, (_, i) => [i - n, 0]), ...Array.from({ length: 2 * hb + 1 }, (_, j) => [n, j - hb])];
  },
  // a hollow up arrow: the rim of a broad-stemmed one
  shift: (n) => {
    const solid = arrowUp(n, Math.max(1, Math.floor(n / 3))), key = (i, j) => i * 100 + j, has = new Set(solid.map(([i, j]) => key(i, j)));
    return solid.filter(([i, j]) => !has.has(key(i + 1, j)) || !has.has(key(i - 1, j)) || !has.has(key(i, j + 1)) || !has.has(key(i, j - 1)));
  },
};

/**
 * Draws a picture for a key (one of KEY_MARKS) on pixel stairs, centred on the pixel (cx, cy): a solid arrow, a bent return arrow, a back arrow with a bar, a tab arrow to a bar, a hollow shift arrow; no letters.
 * Arguments: g, kind (one of KEY_MARKS; 'none' draws nothing), cx, cy (the centre pixel), size (px across, 5 or more, made odd; 7 is the usual), colour.
 */
export function keyMark(g, kind, cx, cy, size, colour = '#231b33') {
  if (!KEY_MARKS.includes(kind)) throw new Error(`keyMark: "${kind}" is not one of ${KEY_MARKS.join(', ')}`);
  if (kind === 'none') return g;
  const n = Math.max(2, Math.floor(Math.max(5, size) / 2)), x = Math.floor(cx), y = Math.floor(cy);
  for (const [i, j] of MARK_CELLS[kind](n)) g.dot(x + i, y + j, colour);
  return g;
}

/**
 * Draws a computer mouse seen from above, centred on (cx, cy): two buttons split down the middle and a wheel between them, the chosen button lit, with an optional short S-bent cable from the top.
 * Arguments: g, cx, cy (the body's centre), o: { w (12 to 17; 14), h (16 to 22; 19), shape ('oval' | 'slim'), body, lit (the chosen button's colour), button ('left' | 'right' | 'middle' | 'none'), down (the lit button 1 px lower), wheel (-1, 0, 1: the ridges a step up or down), cable (8 px above the body) }. Returns { buttons: { left, right, wheel } } as boxes.
 */
export function mouseBody(g, cx, cy, { w = 14, h = 19, shape = 'oval', body = GREY, lit = LIT, button = 'left', down = false, wheel = 0, cable = false } = {}) {
  h = clampN(Math.round(h), 16, 22); w = clampN(Math.round(w), 12, 17);
  if (shape === 'slim') w = Math.max(12, w - 2);
  const x0 = Math.round(cx - w / 2), y0 = Math.round(cy - h / 2), x1 = x0 + w, y1 = y0 + h, mx = x0 + w / 2;
  // an egg: a round front (top) and a fuller back, or a slim one that narrows toward the front
  const inBody = (px, py) => {
    const v = (py - y0) / h, half = w / 2;
    if (v < 0 || v > 1) return false;
    const front = shape === 'slim' ? 0.85 : 0.95;
    const top = Math.min(1, Math.sqrt(Math.max(0, 1 - ((0.42 - Math.min(v, 0.42)) / 0.42) ** 2)));
    const bot = Math.min(1, Math.sqrt(Math.max(0, 1 - ((Math.max(v, 0.62) - 0.62) / 0.38) ** 2)));
    const width = half * Math.min(top, bot) * (v < 0.5 ? front + (1 - front) * (v / 0.5) : 1);
    return Math.abs(px - mx) <= width;
  };
  const split = y0 + Math.round(h * 0.42), seam = dark(body, 0.6), wheelTone = dark(body, 1);
  fillIn(g, x0, y0, x1, y1, inBody, body);
  const sides = { left: (px) => px < mx - 0.5, right: (px) => px > mx + 0.5 };
  if (button === 'left' || button === 'right') {
    const s = sides[button], dy = down ? 1 : 0;
    fillIn(g, x0, y0, x1, split, (px, py) => s(px) && inBody(px, py) && inBody(px, py - dy) && py - dy < split, lit);
    if (down) fillIn(g, x0, y0, x1, split, (px, py) => s(px) && inBody(px, py) && !inBody(px, py - 1), seam);
  }
  for (let y = y0; y < split; y++) if (inBody(mx, y + 0.5)) g.dot(Math.floor(mx - 0.5), y, seam), g.dot(Math.floor(mx), y, seam);
  fillIn(g, x0, split, x1, split + 1, inBody, seam);
  // the wheel: 2 px wide, 4 tall, ridged every 3rd row; it rolls a step with `wheel`, so -1, 0 and 1 are three different pictures
  const wx = Math.floor(mx) - 1, wy = y0 + Math.max(2, Math.round(h * 0.12)), wh = 4;
  const wc = button === 'middle' ? lit : wheelTone, ridge = button === 'middle' ? dark(lit, 0.6) : tone(body, 0.4);
  const wd = button === 'middle' && down ? 1 : 0;
  for (let j = 0; j < wh; j++) for (let i = 0; i < 2; i++) g.dot(wx + i, wy + j + wd, (((j + (wheel | 0)) % 3) + 3) % 3 === 0 ? ridge : wc);
  if (cable) {
    const bend = [0, 0, 1, 1, 0, -1, -1, 0];
    for (let k = 0; k < 8; k++) g.dot(Math.floor(mx - 0.5) + bend[k], y0 - 1 - k, body);
  }
  return {
    buttons: {
      left: { x: x0, y: y0, w: Math.floor(mx - 0.5) - x0, h: split - y0 },
      right: { x: Math.floor(mx) + 1, y: y0, w: x1 - Math.floor(mx) - 1, h: split - y0 },
      wheel: { x: wx, y: wy, w: 2, h: wh },
    },
  };
}

/**
 * Draws one round game-controller button with a front side `depth` px deep, everything within radius r of (cx, cy); its top is the lit colour when one is given.
 * Arguments: g, cx, cy, r (outer radius), o: { body, lit (top colour, optional), depth (side px, 1 to 4; 2), down (the top sinks onto the side) }. Returns { top: { cx, cy, r, x, y, w, h } }: the top disc and a box inside it for a printed letter.
 */
export function padButton(g, cx, cy, r, { body = GREY, lit, depth = 2, down = false } = {}) {
  const d = clampN(Math.round(depth), 1, 4), rt = Math.max(1, r - d / 2);
  const top = lit ?? body, ty = down ? cy + d / 2 : cy - d / 2;
  if (!down) fillIn(g, cx - r, cy - r, cx + r, cy + r, disc(cx, cy + d / 2, rt), dark(top, 0.8));
  fillIn(g, cx - r, cy - r, cx + r, cy + r, disc(cx, ty, rt), top);
  const half = Math.max(0.5, Math.floor(rt * 0.68));
  return { top: { cx, cy: ty, r: rt, x: Math.ceil(cx - half), y: Math.ceil(ty - half), w: Math.max(1, Math.floor(cx + half) - Math.ceil(cx - half)), h: Math.max(1, Math.floor(ty + half) - Math.ceil(ty - half)) } };
}

const PLACES = ['top', 'right', 'bottom', 'left'];

/**
 * Draws four alike round buttons in a diamond round (cx, cy), the ones named by `lit` in the glow colour (and pressed with `down`); no symbols, no colours per button.
 * Arguments: g, cx, cy, o: { r (each button's radius; 5), gap (px between neighbours; 1), body, glow, lit ('top' | 'right' | 'bottom' | 'left' | 'all' | 'none'), depth (2), down }. Returns { tops: { top, right, bottom, left } } (padButton's top for each).
 */
export function padCluster(g, cx, cy, { r = 5, gap = 1, body = GREY, glow = LIT, lit = 'top', depth = 2, down = false } = {}) {
  const D = Math.ceil((2 * r + gap) / Math.SQRT2), tops = {};
  const at = { top: [0, -D], right: [D, 0], bottom: [0, D], left: [-D, 0] };
  for (const p of PLACES) {
    const on = lit === 'all' || lit === p;
    tops[p] = padButton(g, cx + at[p][0], cy + at[p][1], r, { body, lit: on ? glow : undefined, depth, down: on && down }).top;
  }
  return { tops };
}

const ARMS = ['up', 'right', 'down', 'left'];
const ARM_DIR = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };

/**
 * Draws a direction pad round (cx, cy): one plus-shaped piece with a dimple (cross), four separate round arrow buttons (discs) or a round pad with a plus cut into its top (round); each arm has a small arrow notch, lit arms glow and press.
 * Arguments: g, cx, cy, o: { arm (px each arm reaches past the middle square; 6), thick (arm width; 7), style ('cross' | 'discs' | 'round'), body, glow, lit (list of 'up', 'right', 'down', 'left'), depth (2), down }. Returns { arms: { up, right, down, left } } as boxes of each arm's top.
 */
export function dpadCross(g, cx, cy, { arm = 6, thick = 7, style = 'cross', body = GREY, glow = LIT, lit = [], depth = 2, down = false } = {}) {
  const d = clampN(Math.round(depth), 1, 4), t2 = thick / 2, E = t2 + arm, h2 = d / 2;
  const on = new Set(Array.isArray(lit) ? lit : [lit]);
  const colourOf = (a) => (on.has(a) ? glow : body);
  const oyOf = (a) => (on.has(a) && down ? h2 : -h2);
  const arms = {};
  // a 4 px arrow notch pointing out along arm a, its tip at (tx, ty)
  const notch = (a, tx, ty, c) => {
    const [ux, uy] = ARM_DIR[a];
    // the tip pixel is the one whose centre is nearest (tx, ty) on the inner side, so opposite arms are mirror images
    const ix = ux > 0 ? Math.ceil(tx) - 1 : Math.floor(tx), iy = uy > 0 ? Math.ceil(ty) - 1 : Math.floor(ty);
    const cells = [[0, 0], [-1, 1], [0, 1], [1, 1]].map(([i, j]) => (uy ? [i, j * -uy] : [j * -ux, i]));
    for (const [i, j] of cells) g.dot(ix + i, iy + j, dark(c, 0.9));
  };
  const tipD = E - Math.max(2, Math.round(arm * 0.35)) - 0.5;
  const armNotch = (a, oy, c) => { const [ux, uy] = ARM_DIR[a]; notch(a, cx + ux * tipD, cy + uy * tipD + oy, c); };
  if (style === 'discs') {
    const rr = Math.min(t2, E / (Math.SQRT2 + 1)), D = E - rr;
    for (const a of ARMS) {
      const [ux, uy] = ARM_DIR[a], c = colourOf(a);
      const { top } = padButton(g, cx + ux * D, cy + uy * D, rr, { body: c, depth: d, down: on.has(a) && down });
      arms[a] = { x: Math.floor(top.cx - top.r), y: Math.floor(top.cy - top.r), w: Math.ceil(2 * top.r), h: Math.ceil(2 * top.r) };
      notch(a, top.cx + ux * 0.5, top.cy + uy * 0.5, c);
    }
    return { arms };
  }
  const plus = (oy, v) => (px, py) => {
    const y = py - (cy + oy), x = px - cx;
    return (Math.abs(y) <= t2 && Math.abs(x) <= E) || (Math.abs(x) <= t2 && Math.abs(y) <= v);
  };
  const Ev = E - h2;
  const armIn = (a, oy) => (px, py) => {
    const x = px - cx, y = py - (cy + oy);
    if (a === 'up') return Math.abs(x) <= t2 && y < -t2 && y >= -Ev;
    if (a === 'down') return Math.abs(x) <= t2 && y > t2 && y <= Ev;
    if (a === 'left') return Math.abs(y) <= t2 && x < -t2 && x >= -E;
    return Math.abs(y) <= t2 && x > t2 && x <= E;
  };
  const B = [cx - E, cy - E, cx + E, cy + E];
  if (style === 'round') {
    const R = E;
    fillIn(g, ...B, disc(cx, cy + h2, R - h2), dark(body, 0.8));
    fillIn(g, ...B, disc(cx, cy - h2, R - h2), dark(body, 0.35));
    const ta = t2 - 0.5;
    const cut = (px, py) => Math.abs(px - cx) <= ta && Math.abs(py - (cy - h2)) <= ta;
    fillIn(g, ...B, (px, py) => cut(px, py) && disc(cx, cy - h2, R - h2 - 1)(px, py), body);
    for (const a of ARMS) {
      const oy = oyOf(a), inside = (px, py) => disc(cx, cy + oy, R - h2 - 1)(px, py) && armIn(a, oy)(px, py) && (a === 'up' || a === 'down' ? Math.abs(px - cx) <= ta : Math.abs(py - (cy + oy)) <= ta);
      fillIn(g, ...B, inside, colourOf(a));
      armNotch(a, oy, colourOf(a));
      arms[a] = armBox(a, cx, cy + oy, t2, E);
    }
    return { arms };
  }
  // cross: the side under the whole plus, the middle square with its dimple, then each arm at its own height (a pressed
  // arm tips over the middle, so every arm shows the same number of pixels pressed or not)
  fillIn(g, ...B, plus(h2, Ev), dark(body, 0.8));
  fillIn(g, ...B, (px, py) => Math.abs(px - cx) <= t2 && Math.abs(py - (cy - h2)) <= t2, body);
  fillIn(g, ...B, disc(cx, cy - h2, Math.min(1.6, t2 - 1)), dark(body, 0.35));
  for (const a of ARMS) {
    const oy = oyOf(a);
    fillIn(g, ...B, armIn(a, oy), colourOf(a));
    armNotch(a, oy, colourOf(a));
    arms[a] = armBox(a, cx, cy + oy, t2, a === 'up' || a === 'down' ? Ev : E);
  }
  return { arms };
}
function armBox(a, cx, cy, t2, E) {
  if (a === 'up') return { x: Math.round(cx - t2), y: Math.round(cy - E), w: Math.round(2 * t2), h: Math.round(E - t2) };
  if (a === 'down') return { x: Math.round(cx - t2), y: Math.round(cy + t2), w: Math.round(2 * t2), h: Math.round(E - t2) };
  if (a === 'left') return { x: Math.round(cx - E), y: Math.round(cy - t2), w: Math.round(E - t2), h: Math.round(2 * t2) };
  return { x: Math.round(cx + t2), y: Math.round(cy - t2), w: Math.round(E - t2), h: Math.round(2 * t2) };
}

/**
 * Draws a thumbstick seen from above, within radius r of (cx, cy): a base ring, a dark well and a cap moved by `tilt` px that never covers the ring; the cap is domed, ridged or flat (dished), and `down` presses it 1 px and darkens its rim.
 * Arguments: g, cx, cy, o: { r (outer radius; 9), style ('domed' | 'ridged' | 'flat'), body (cap colour), ring (base ring colour), tilt ([dx, dy] px, whole numbers, held inside the well), down }. Returns { cap: { cx, cy, r } }.
 */
export function stickTop(g, cx, cy, { r = 9, style = 'domed', body = GREY, ring = '#b8b0a0', tilt = [0, 0], down = false } = {}) {
  const ringW = r >= 8 ? 2 : 1, inner = r - ringW, room = clampN(Math.round(r * 0.35), 1, 4);
  const rc = Math.max(1.5, inner - room);
  let [tx, ty] = tilt.map((v) => Math.round(v));
  const reach = room - (down ? 1 : 0), len = Math.hypot(tx, ty);
  if (len > reach) { tx = Math.round((tx * reach) / len); ty = Math.round((ty * reach) / len); }
  const B = [cx - r, cy - r, cx + r, cy + r];
  fillIn(g, ...B, (px, py) => disc(cx, cy, r)(px, py) && !disc(cx, cy, inner)(px, py), ring);
  fillIn(g, ...B, disc(cx, cy, inner), dark(ring, 1.2));
  const kx = cx + tx, ky = cy + ty + (down ? 1 : 0), capIn = disc(kx, ky, rc);
  const rimC = dark(body, down ? 1.1 : 0.7);
  fillIn(g, ...B, capIn, body);
  fillIn(g, ...B, (px, py) => capIn(px, py) && !disc(kx, ky, rc - 1)(px, py) && (down || px - kx < py - ky), rimC);
  if (style === 'domed') fillIn(g, ...B, disc(kx - rc * 0.35, ky - rc * 0.35, Math.max(0.8, rc * 0.35)), tone(body, 0.7));
  else if (style === 'flat') fillIn(g, ...B, disc(kx, ky, Math.max(0.8, rc - 1.6)), dark(body, 0.4));
  else {
    // a grip ring of 1 px ridges round the edge
    fillIn(g, ...B, (px, py) => capIn(px, py) && !disc(kx, ky, rc - 1)(px, py) && (((Math.floor(px - kx) + Math.floor(py - ky)) % 2) + 2) % 2 === 0, dark(body, 1.2));
    fillIn(g, ...B, disc(kx, ky, Math.max(0.8, rc - 2.2)), tone(body, 0.3));
  }
  return { cap: { cx: kx, cy: ky, r: rc } };
}

/**
 * Draws a controller's shoulder button inside the box (x, y, w, h): a bumper (a long bar seen from the front, its outer end rounded or angled) or a trigger (a curved paddle seen from the side, its tip curling forward); 'right' is the left one mirrored to the pixel.
 * Arguments: g, x, y, w, h (the box, 2 px taller than the button so it can press), o: { kind ('bumper' | 'trigger'), side ('left' | 'right'), style ('rounded' | 'angled', bumpers only), body, glow, lit (face in glow), down (moves it 2 px) }. Returns { face: { x, y, w, h } }.
 */
export function shoulderButton(g, x, y, w, h, { kind = 'bumper', side = 'left', style = 'rounded', body = GREY, glow = LIT, lit = true, down = false } = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const bh = h - 2, oy = down ? 2 : 0, face = lit ? glow : body, sideC = dark(body, 0.8);
  // the left-hand picture in box coordinates (u right, v down, pixel centres), then mirrored for the right
  let shapeIn, faceIn, faceBox;
  if (kind === 'trigger') {
    const back = (v) => w * 0.9 - (v / bh) * w * 0.14;                      // the straight back edge leans a little
    const front = (v) => { const k = v / bh; return w * 0.08 + w * 0.2 * Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.8 - (k > 0.8 ? (k - 0.8) * w * 0.6 : 0); };
    shapeIn = (u, v) => v >= 0 && v < bh && u >= Math.max(0, front(v)) && u <= back(v) && !(v < bh * 0.12 && u < w * 0.3) && !(v > bh * 0.88 && u > back(v) - (v - bh * 0.88) * 2.2);
    faceIn = (u, v) => shapeIn(u, v) && u <= back(v) - 2;
    faceBox = { u: 0, v: 0, w: Math.round(w * 0.78), h: bh };
  } else {
    const faceH = Math.max(2, bh - 2), r = Math.min(bh / 2, w / 4);
    const end = style === 'angled'
      ? (u, v) => u >= (bh - v) * 0.8                                        // the outer end cut on a slant
      : (u, v) => u >= r || (u - r) ** 2 + (v - bh / 2) ** 2 <= r * r * 1.05;
    shapeIn = (u, v) => u >= 0 && u < w && v >= 0 && v < bh && end(u, v);
    faceIn = (u, v) => shapeIn(u, v) && v < faceH;
    faceBox = { u: 0, v: 0, w, h: faceH };
  }
  const mir = side === 'right';
  for (let j = 0; j < bh; j++) for (let i = 0; i < w; i++) {
    const u = i + 0.5, v = j + 0.5;
    if (!shapeIn(u, v)) continue;
    g.dot(x + (mir ? w - 1 - i : i), y + oy + j, faceIn(u, v) ? face : sideC);
  }
  return { face: { x: mir ? x + w - faceBox.u - faceBox.w : x + faceBox.u, y: y + oy + faceBox.v, w: faceBox.w, h: faceBox.h } };
}

const MOTIONS = ['up', 'down', 'left', 'right', 'up-down', 'left-right', 'all', 'spin', 'click'];

/**
 * Draws light round a picture showing what to do, periodic in t: arrow heads that step out 1 px and back (up, down, left, right, up-down, left-right, all), a dotted ring with an arrow head running round it (spin), or a ring that widens and is gone (click).
 * Arguments: g, cx, cy (the picture's centre), kind (one of the above), o: { reach (px from the centre to the marks; 10), size (arrow head px; 3), colour, t (loop phase 0..1), box ([x0, y0, x1, y1), default the surface) }.
 */
export function motionMarks(g, cx, cy, kind, { reach = 10, size = 3, colour = LIT, t = 0, box } = {}) {
  if (!MOTIONS.includes(kind)) throw new Error(`motionMarks: "${kind}" is not one of ${MOTIONS.join(', ')}`);
  const [x0, y0, x1, y1] = box ?? [0, 0, g.w, g.h];
  const put = (px, py) => { px = Math.floor(px); py = Math.floor(py); if (px >= x0 && px < x1 && py >= y0 && py < y1) g.dot(px, py, colour); };
  const s = Math.max(2, Math.round(size)), ph = fract(t);
  if (kind === 'spin') {
    // a dotted ring: eight short arcs, and one arrow head running round once per loop
    const clip = (px, py) => px >= x0 && px < x1 && py >= y0 && py < y1;
    const rr = reach - s;
    for (let k = 0; k < 8; k++) g.arc(cx, cy, rr, (k * TAU) / 8, (k * TAU) / 8 + TAU / 20, 1, colour, { clip });
    const a = TAU * ph, hx = cx + Math.sin(a) * rr, hy = cy + Math.cos(a) * rr;
    const fx = Math.cos(a), fy = -Math.sin(a);                                    // the way round (rig angles grow anticlockwise on screen)
    const nx = Math.sin(a), ny = Math.cos(a);
    for (let k = 0; k < s; k++) for (let j = -k; j <= k; j++) put(hx + fx * (s - 1 - k) * 0.9 + nx * j * 0.9 + 0.5, hy + fy * (s - 1 - k) * 0.9 + ny * j * 0.9 + 0.5);
    return g;
  }
  if (kind === 'click') {
    // a ring widening from the picture's edge to `reach` over the first 60% of the loop, then gone
    if (ph >= 0.6) return g;
    const rr = s + (reach - s) * (ph / 0.6);
    const clip = (px, py) => px >= x0 && px < x1 && py >= y0 && py < y1;
    g.arc(cx, cy, rr - 0.5, 0, TAU, 1, colour, { clip });
    return g;
  }
  const dirs = { up: ['up'], down: ['down'], left: ['left'], right: ['right'], 'up-down': ['up', 'down'], 'left-right': ['left', 'right'], all: ARMS }[kind];
  const out = pulse(ph) >= 0.5 ? 1 : 0;
  for (const a of dirs) {
    const [ux, uy] = ARM_DIR[a], d = reach - s + out;                              // the tip lands on `reach` when stepped out
    for (let k = 0; k < s; k++) for (let j = -k; j <= k; j++) {
      const along = d + (s - 1 - k), px = cx + ux * along + (uy ? j : 0), py = cy + uy * along + (ux ? j : 0);
      put(px, py);
    }
  }
  return g;
}
