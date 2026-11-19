// Munitions: ammunition, arrows and bombs drawn face-on at pickup size (added with core-sprites-1,
// batch K02: the ammo pack, the arrow bundle and the bomb pickups; docs/style-guide.md sections 1
// and 14). Three families, three kinds each: ammunition (a lidded box of rounds, a magazine, a row of
// shotgun shells), arrows (a quiver, a tied bundle, loose crossbow bolts) and bombs (an iron ball,
// a single stick, three sticks bound together), each with the count or length its controls change.
// Every kind is laid out upright around (0, 0) in pixels at scale 1, then scaled, squashed and turned
// as a whole, so a pickup can bob, tilt and pop it. Thin things (shafts, fuses) are drawn after the
// turn in frame pixels, so they stay one clean line at any angle. Colours are arguments; nothing here
// outlines the whole (call g.outline(INK) once afterwards, as for any body), and nothing here is light:
// a burning fuse's spark goes at the returned `spark` point after the outline (fx.js twinkle, particles).
//
//   import { AMMO_KINDS, munitionReach, drawAmmo } from '../engine/munitions.js';
//   const o = { kind: p.shape, k, load: p.load, colour: p.body, metal: p.metal };
//   const r = munitionReach('ammo', { ...o, tilt: 0.12 });
//   const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: 17, up: r.up + 1, down: r.down + 1, side: r.side + 1 });
//   drawAmmo(g, 16, at.y, { ...o, sx: at.sx, sy: at.sy, angle, bare: at.bare });
//   g.outline(INK);
//
// Each draw function returns { body } (the silhouette as a shape test in frame pixels, for a glint
// band); drawBomb also returns spark, the [x, y] of the fuse's free end.
//
// Styles: shapes go through fill, limb and capsule tests; munitionReach measures on a scratch layer.

import { ramp, farRamp, mix, tone, INK } from './color.js';
import { Surface, ellipseIn, polyIn, rectIn, capsuleIn } from './surface.js';
import { placedIn } from './shapes.js';
import { stripesIn } from './solids.js';

const anyOf = (...tests) => (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; };
const box = (g) => [0, 0, g.w, g.h];
// where a point at scale 1 lands in the frame, and a shape test at scale 1 placed the same way
const pointer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (x, y) => {
  const c = Math.cos(angle), s = Math.sin(angle), X = x * k * sx, Y = y * k * sy;
  return [cx + X * c - Y * s, cy + X * s + Y * c];
};
const placer = (cx, cy, { k = 1, sx = 1, sy = 1, angle = 0 } = {}) => (test) => placedIn(test, cx, cy, { angle, sx: k * sx, sy: k * sy });
const whole = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const kindOf = (family, list, kind) => {
  if (!list.includes(kind)) throw new Error(`munitions: unknown ${family} kind "${kind}"; kinds: ${list.join(', ')}`);
  return kind;
};

/** The ammunition drawAmmo can draw, in the order a choice control lists them: box (a lidded box with rounds standing in it), clip (a magazine with a window of rounds), shells (fat shotgun shells side by side). No arguments: a frozen list. */
export const AMMO_KINDS = Object.freeze(['box', 'clip', 'shells']);
/** The arrows drawArrows can draw, in the order a choice control lists them: quiver (a slanted leather quiver with fletched shafts fanning out), bundle (arrows tied at the middle), bolts (short, thick crossbow bolts lying loose side by side). No arguments: a frozen list. */
export const ARROW_KINDS = Object.freeze(['quiver', 'bundle', 'bolts']);
/** The bombs drawBomb can draw, in the order a choice control lists them: round (an iron ball with a collar), stick (one stick wrapped with rope), bundle (three sticks bound together). No arguments: a frozen list. */
export const BOMB_KINDS = Object.freeze(['round', 'stick', 'bundle']);

const DRAW = {};
const REACHED = new Map();            // measured reaches, by family and options: a pickup asks for the same one every frame

/**
 * How far a munition reaches from its centre with the given settings, so a pickup can keep its float and pop inside the frame: { up, down, side } in whole pixels, outline not included.
 * Arguments: family ('ammo', 'arrows' or 'bomb'); o: the options its draw function takes (kind, k, load, count, fuse, ...), plus tilt (radians it may turn either way, default 0).
 */
export function munitionReach(family, o = {}) {
  const draw = DRAW[family];
  if (!draw) throw new Error(`munitionReach: unknown family "${family}"; families: ${Object.keys(DRAW).join(', ')}`);
  const lists = { ammo: AMMO_KINDS, arrows: ARROW_KINDS, bomb: BOMB_KINDS };
  kindOf(family, lists[family], o.kind ?? lists[family][0]);
  const key = family + JSON.stringify(o, Object.keys(o).sort());
  if (REACHED.has(key)) return { ...REACHED.get(key) };
  const tilt = o.tilt ?? 0, r = { up: 0, down: 0, side: 0 };
  for (const a of tilt ? [-tilt, 0, tilt] : [0]) {
    const g = new Surface(96, 96);
    draw(g, 48, 48, { ...o, angle: (o.angle ?? 0) + a, sx: 1, sy: 1 });
    const b = g.bounds();
    if (!b) continue;
    r.up = Math.max(r.up, 48 - b.y0); r.down = Math.max(r.down, b.y1 + 1 - 48); r.side = Math.max(r.side, 48 - b.x0, b.x1 + 1 - 48);
  }
  if (REACHED.size > 512) REACHED.clear();
  REACHED.set(key, r);
  return { ...r };
}

// ---- ammunition -----------------------------------------------------------------------------------

/**
 * Draw ammunition face-on, centred on (cx, cy): a lidded box with brass rounds standing in it, a magazine with rounds in its window, or a row of shotgun shells; returns { body }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of AMMO_KINDS), load (rounds shown, 2 to 6, default 4), k (scale, 1 is about 18 px across), sx, sy (squash), angle (turn, radians clockwise), colour (the box, magazine or shell cases), metal (the brass), bare (true: leave small details out) }.
 */
export function drawAmmo(g, cx, cy, o = {}) {
  const { colour = '#3f8a4f', metal = '#f2c230', bare = false } = o;
  const kind = kindOf('ammo', AMMO_KINDS, o.kind ?? 'box'), n = whole(o.load ?? 4, 2, 6);
  const place = placer(cx, cy, o), C = ramp(colour), M = ramp(metal), B = box(g);
  const tip = mix(M.light, '#ffffff', 0.25);
  let body;
  if (kind === 'clip') {
    // a magazine that curves forward as it goes down; longer the more rounds it holds
    const H = Math.round(8 + 1.5 * n), top = -Math.round(H / 2) + 1, bend = 1.2;
    const mid = (y) => bend * ((y - top) / H) ** 2;
    const side = (x) => Array.from({ length: 6 }, (_, i) => { const y = top + (H * i) / 5; return [x + mid(y), y]; });
    const shell = polyIn([...side(-5), ...side(5).reverse()]);
    const plate = polyIn([[-6 + bend, top + H - 1], [6 + bend, top + H - 1], [6 + bend, top + H + 1], [-6 + bend, top + H + 1]]);
    // the top round lies across the feed lips, its tip pointing forward
    const round = rectIn(-4, top - 3, 6, 3), point = polyIn([[2, top - 3], [3.5, top - 3], [6.2, top - 1.5], [3.5, top], [2, top]]);
    g.fill(...B, place(round), M, { shade: 1, light: 1 });
    g.fill(...B, place(point), tip, { shade: 0 });
    g.fill(...B, place(shell), C, { shade: 1 });
    g.fill(...B, place(plate), C.dark, { shade: 0 });
    if (!bare) {
      // the window down its side: a dark slot with a brass line for each round, top to bottom
      const win = (px, py) => py >= top + 2 && py < top + 1 + 2 * n && Math.abs(px - mid(py) + 0.5) < 1.6;
      g.fill(...B, place(win), C.deep, { shade: 0 });
      g.fill(...B, place((px, py) => win(px, py) && Math.floor(py - top) % 2 === 0), M.base, { shade: 0 });
    }
    body = place(anyOf(shell, plate, round, point));
  } else if (kind === 'shells') {
    // up to four shells in front; a fifth and sixth stand behind them, higher, in the gaps
    const front = Math.min(n, 4), back = n - front;
    const all = [];
    const shell = (x, y, paint) => {
      const hull = anyOf(rectIn(x - 2, y - 5, 4, 8), ellipseIn(x, y - 5, 2, 1.3)), base = rectIn(x - 2, y + 3, 4, 3);
      g.fill(...B, place(hull), paint, { shade: 1, light: 1, outline: INK });
      g.fill(...B, place(base), M, { shade: 1, outline: INK });
      if (!bare) {
        g.fill(...B, place(rectIn(x - 2, y + 3, 4, 1)), M.light, { shade: 0 });          // the brass lip
        g.fill(...B, place(rectIn(x - 0.5, y - 6, 1, 2)), paint.dark, { shade: 0 });     // the crimp
      }
      all.push(hull, base);
    };
    for (const x of back === 1 ? [0] : back === 2 ? [-5, 5] : []) shell(x, -5, farRamp(colour));
    for (let i = 0; i < front; i++) shell((i - (front - 1) / 2) * 5, 0, C);
    body = place(anyOf(...all));
  } else {
    // a box with its lid thrown open behind, rounds standing in it, a painted band and two latches
    const span = 3 * n - 1, x0 = -span / 2;
    const lid = rectIn(-9, -4, 18, 2), front = rectIn(-9, -2, 18, 10);
    g.fill(...B, place(lid), C.dark, { shade: 0 });
    const rounds = [];
    for (let i = 0; i < n; i++) {
      const x = x0 + 3 * i;
      rounds.push(polyIn([[x, -1], [x, -5], [x + 1, -6.6], [x + 2, -5], [x + 2, -1]]));
      g.fill(...B, place(rounds[i]), M, { shade: 1, light: 1 });
      g.fill(...B, place(rectIn(x, -7, 2, 2)), tip, { shade: 0, clip: place(rounds[i]) });
    }
    g.fill(...B, place(front), C, { shade: 2 });
    g.fill(...B, place(rectIn(-9, -2, 18, 1)), C.light, { shade: 0 });
    if (!bare) {
      const band = rectIn(-8, 2, 16, 3);
      g.fill(...B, place(band), C.light, { shade: 0 });
      g.fill(...B, place(stripesIn(band, { pitch: 4, slant: 1, duty: 0.5 })), C.dark, { shade: 0 });
      for (const x of [-7, 5]) g.fill(...B, place(rectIn(x, -1, 2, 2)), M, { shade: 0, light: 1 });
    }
    body = place(anyOf(lid, front, ...rounds));
  }
  return { body };
}
DRAW.ammo = drawAmmo;

// ---- arrows ---------------------------------------------------------------------------------------

// one arrow from its tail (x0, y0) to its tip (x1, y1), in frame pixels: shaft, fletching vanes at the tail, head at the tip
function arrow(g, [x0, y0], [x1, y1], { wood, metal, fletching, shaft = 1, vane = 4, wide = 1.6, head = 4, long = 4, showHead = true, bare = false }) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  const at = (along, across) => [x0 + ux * along - uy * across, y0 + uy * along + ux * across];
  const B = box(g), F = ramp(fletching), M = ramp(metal);
  const end = showHead ? L - long + 0.5 : L;
  g.limb(x0, y0, ...at(end, 0), shaft, ramp(wood), { shade: shaft > 1 ? 1 : 0 });
  const tests = [capsuleIn(x0, y0, ...at(end, 0), shaft / 2 + 0.2)];
  if (!bare || vane > 3) for (const side of [-1, 1]) {
    const v = polyIn([at(-0.4, 0), at(vane, 0), at(vane - 1.2, side * wide), at(-0.4, side * (wide + 0.4))]);
    g.fill(...B, v, side > 0 ? F.base : F.light, { shade: 0 });
    tests.push(v);
  }
  if (showHead) {
    const h = polyIn([at(L, 0), at(L - long, head / 2), at(L - long + 0.8, 0), at(L - long, -head / 2)]);
    g.fill(...B, anyOf(h, capsuleIn(...at(L - long, 0), ...at(L - 0.8, 0), 0.6)), M, { shade: 0, light: 1 });
    tests.push(h);
  }
  return anyOf(...tests);
}

/**
 * Draw arrows face-on, centred on (cx, cy): a slanted leather quiver with fletched shafts fanning out of it, a bundle tied at the middle, or short crossbow bolts lying loose side by side; returns { body }.
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of ARROW_KINDS), count (arrows, 2 to 5, default 3), k (scale, 1 is about 20 px tall), sx, sy (squash), angle (turn, radians clockwise), sway (extra turn of the shafts against the quiver or the cord, radians), leather (the quiver), wood (the shafts), metal (heads, and the quiver's rim and foot), fletching (the vanes), cord (the tie), bare (true: leave small details out) }.
 */
export function drawArrows(g, cx, cy, o = {}) {
  const { leather = '#7a4f33', wood = '#a06a3c', metal = '#c2c9d6', fletching = '#c9423a', cord = '#7a4f33', bare = false, sway = 0 } = o;
  const kind = kindOf('arrows', ARROW_KINDS, o.kind ?? 'quiver'), n = whole(o.count ?? 3, 2, 5);
  const B = box(g), colours = { wood, metal, fletching, bare };
  if (kind === 'quiver') {
    // the quiver leans to the right; the shafts fan out of its mouth, fletching up, heads hidden inside
    const o2 = { ...o, angle: (o.angle ?? 0) + 0.38 }, place = placer(cx, cy, o2), at = pointer(cx, cy, o2);
    const shafts = [];
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.26 + sway, len = 16 + ((i * 2) % 3) - 1;
      const foot = at(0, 4), tail = at(Math.sin(a) * len, 4 - Math.cos(a) * len);
      shafts.push(arrow(g, tail, foot, { ...colours, showHead: false, vane: 3.5, wide: 1.3 }));
    }
    const L = ramp(leather), M = ramp(metal);
    const tube = anyOf(rectIn(-3.5, -2, 7, 9), ellipseIn(0, 7, 3.5, 2.4));
    g.fill(...B, place(tube), L, { shade: 1 });
    if (!bare) g.fill(...B, place(rectIn(-3.5, 3, 7, 1)), L.dark, { shade: 0 });
    g.fill(...B, place(rectIn(-4, -3, 8, 2)), M, { shade: 0, light: 1 });
    g.fill(...B, place((px, py) => py >= 7.6 && ellipseIn(0, 7, 3.5, 2.4)(px, py)), M, { shade: 0 });
    return { body: anyOf(place(anyOf(tube, rectIn(-4, -3, 8, 2))), ...shafts) };
  }
  // a bundle of arrows or of short bolts, side by side along the diagonal (tips to the top right), tied with a cord
  const bolts = kind === 'bolts';
  const o2 = { ...o, angle: (o.angle ?? 0) + (bolts ? 0.75 : 0.7) }, at = pointer(cx, cy, o2), place = placer(cx, cy, o2);
  const len = bolts ? 13 : 20, half = len / 2, pitch = bolts ? 4 : 2.6;
  const tests = [];
  for (let i = 0; i < n; i++) {
    const j = i - (n - 1) / 2;
    if (bolts) {
      // side by side, every other one slid forward, so heads and vanes never sit level with their neighbours'
      const x = j * 3.4, slide = i % 2 ? -2.5 : 1;
      tests.push(arrow(g, at(x, half + slide), at(x + sway * len, -half + slide), { ...colours, shaft: 2, vane: 3.5, wide: 1.3, head: 4.4, long: 3.4 }));
    } else {
      // side by side, the tips staggered; the tips lean with the sway, the tails stay under the cord
      const x = j * pitch, stagger = (i % 2) * 2.5;
      tests.push(arrow(g, at(x, half), at(x + sway * len, -half + stagger), { ...colours, vane: 4, wide: 1.4, head: 4, long: 3.5 }));
    }
  }
  const w = bolts ? (n - 1) * 3.4 + 5 : (n - 1) * pitch + 4, cordAt = bolts ? 0.5 : 0.5;
  const tie = rectIn(-w / 2, cordAt, w, 2);
  if (bolts) return { body: anyOf(...tests) };                 // bolts lie loose: no cord
  g.fill(...B, place(tie), ramp(cord), { shade: 1 });
  return { body: anyOf(place(tie), ...tests) };
}
DRAW.arrows = drawArrows;

// ---- bombs ----------------------------------------------------------------------------------------

// a fuse from `start` (frame pixels), first along `heading` (radians, screen: 0 right, -PI/2 up), curling by `curl` per pixel
function fuseLine(g, start, heading, length, curl, rope, bare) {
  const R = ramp(rope), pts = [start];
  let [x, y] = start, h = heading;
  for (let s = 0; s < length; s += 0.5) { x += Math.cos(h) * 0.5; y += Math.sin(h) * 0.5; h += curl * 0.5; pts.push([x, y]); }
  const parts = [];
  for (let i = 1; i < pts.length; i++) parts.push(capsuleIn(...pts[i - 1], ...pts[i], 0.8));
  const test = anyOf(...parts);
  g.fill(...box(g), test, R, { shade: 0 });
  // a twist in the cord every other pixel along it, and a charred end
  if (!bare) for (let i = 2; i < pts.length - 2; i += 4) g.dot(pts[i][0], pts[i][1], R.dark);
  g.dot(x, y, tone(rope, -1.2));
  return { test, end: [x, y] };
}

/**
 * Draw a bomb face-on, centred on (cx, cy): an iron ball with a collar, one stick wrapped with rope, or three sticks bound together, each with a curled fuse; returns { body, spark } (spark: the [x, y] of the fuse's free end, for the flame).
 * Arguments: g (the Surface); cx, cy (centre); o: { kind (one of BOMB_KINDS), fuse (0 short to 1 long), k (scale, 1 is about 16 px across), sx, sy (squash), angle (turn, radians clockwise), colour (the shell or sticks), rope (the fuse and the wrapping), bare (true: leave small details out) }.
 */
export function drawBomb(g, cx, cy, o = {}) {
  const { colour = '#5d6475', rope = '#f0ead8', bare = false } = o;
  const kind = kindOf('bomb', BOMB_KINDS, o.kind ?? 'round');
  const place = placer(cx, cy, o), at = pointer(cx, cy, o), C = ramp(colour), R = ramp(rope), B = box(g);
  const length = 3 + 8 * Math.max(0, Math.min(1, o.fuse ?? 0.5)), turn = o.angle ?? 0;
  let body, fuse;
  if (kind === 'round') {
    const ball = ellipseIn(0, 2, 7.5, 7.5), collar = placedIn(rectIn(-2.5, -2, 5, 3.5), 5.6, -3.6, { angle: Math.PI / 4 });
    fuse = fuseLine(g, at(6.8, -4.8), -Math.PI / 4 + turn, length * (o.k ?? 1), -0.17, rope, bare);
    g.fill(...B, place(ball), C, { shade: 2 });
    if (!bare) {
      g.fill(...B, place(ellipseIn(2.6, -1.4, 2.6, 2.2)), C.light, { shade: 0, clip: place(ellipseIn(0, 2, 6.5, 6.5)) });
      g.fill(...B, place(ellipseIn(3.4, -2.2, 0.9, 0.9)), mix(C.light, '#ffffff', 0.5), { shade: 0 });
    }
    g.fill(...B, place(collar), { light: mix(C.light, '#ffffff', 0.35), base: C.light, dark: C.base }, { shade: 1 });
    body = anyOf(place(anyOf(ball, collar)), fuse.test);
  } else {
    // sticks: a cylinder with a lit end cap, wrapped with rope; the bundle has three, the middle one in front
    const stick = (x, w, top, bottom) => anyOf(rectIn(x - w / 2, top, w, bottom - top), ellipseIn(x, top, w / 2, 1.2), ellipseIn(x, bottom, w / 2, 1.2));
    const cap = (x, w, top) => ellipseIn(x, top, w / 2 - 0.5, 1.1);
    const sticks = kind === 'stick' ? [[0, 6, -6, 7, null]] : [[-4.5, 5, -4, 7, null], [4.5, 5, -4, 7, null], [0, 5, -5.5, 6.5, INK]];
    const top = kind === 'stick' ? -6 : -5.5;
    fuse = fuseLine(g, at(0, top - 0.5), -Math.PI / 2 + turn, length * (o.k ?? 1), 0.17, rope, bare);
    const all = [];
    for (const [x, w, t0, t1, edge] of sticks) {
      const s = stick(x, w, t0, t1);
      g.fill(...B, place(s), C, { shade: 1, outline: edge ?? undefined });
      g.fill(...B, place(cap(x, w, t0)), C.light, { shade: 0 });
      all.push(s);
    }
    const bands = kind === 'stick' ? [rectIn(-4, -3, 8, 2), rectIn(-4, 3, 8, 2)] : [rectIn(-8, 1, 16, 2)];
    for (const b of bands) {
      g.fill(...B, place(b), R, { shade: 1 });
      if (!bare) g.fill(...B, place(stripesIn(b, { pitch: 3, slant: 1, duty: 0.34 })), R.dark, { shade: 0 });
    }
    body = anyOf(place(anyOf(...all, ...bands)), fuse.test);
  }
  return { body, spark: fuse.end };
}
DRAW.bomb = drawBomb;
