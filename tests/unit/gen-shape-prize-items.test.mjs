// Migration batch M2 (docs/data-sprites.md section 9, M1 to M40; section 7): the shape generators the ten pickups of
// the batch are drawn with as data (engine/gen/prize-items.js), each a port of the code that drew the sprite. Each
// passes the goldens harness (pinned output, determinism, cost, loop closure, every argument at its limits), and each
// port paints the same silhouette as the code helper it replaces at the defaults, so a redraw is the old picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { Surface } from '../../engine/surface.js';
import { drawTimer, drawTrophy, drawScroll } from '../../engine/prizes.js';
import { Surface as S2, tilt, ellipseIn, rectIn, capsuleIn } from '../../engine/surface.js';
import { placedIn } from '../../engine/shapes.js';
import { iconPaint, iconLine, ICON_DIAGONAL } from '../../engine/icons.js';
import { ringIn, allIn, boundsOf } from '../../engine/shapes.js';
import { roundRectIn, cutRectIn } from '../../engine/ui.js';
import { chevronIn, leanedIn, crystalIn, cubeIn, drawToken, flatHexIn, rimRunIn, meridianIn } from '../../engine/gadgets.js';
import { anyIn, hoopIn, turnedIn, spunIn } from '../../engine/shapes.js';
import { keys, fract } from '../../engine/motion.js';
import { twinkle, steps } from '../../engine/fx.js';
import { drawCrystal, drawAura } from '../../engine/crystals.js';
import { around, orbitHoop } from '../../engine/orbits.js';
import { drawMark } from '../../engine/marks.js';
import { masked } from '../../engine/surface.js';
import { pick, INK, mix } from '../../engine/color.js';
import { insetIn, starIn } from '../../engine/shapes.js';
import { pulse } from '../../engine/motion.js';
import { streaks } from '../../engine/fx.js';
import { polyIn } from '../../engine/surface.js';
import { drawBottle } from '../../engine/pickups.js';
import { wave } from '../../engine/motion.js';
import { drawMeal, foodReach } from '../../engine/food.js';
import { smoke } from '../../engine/fx.js';

const IDLE = { t: 0.25, loop: true, frames: 8, frame: 2 };
const COLLECT = { t: 4 / 7, loop: false, frames: 8, frame: 4 };

/** The pixels a call paints, as a set of "x,y" (stamps only: these generators return stamps). */
function painted(prims) {
  const out = new Set();
  for (const p of prims) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') out.add(`${p.at[0] + i},${p.at[1] + j}`); }));
  }
  return out;
}
/** The pixels a code helper paints on a 32 x 32 Surface, as a set of "x,y". */
function paintedCode(draw) {
  const g = new Surface(32, 32);
  draw(g);
  const out = new Set();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (g.get(x, y) >>> 24) out.add(`${x},${y}`);
  return out;
}
const run = (call, ctx = {}) => {
  const r = registry.runGenerator(call, ctx);
  assert.ok(r.ok, r.errors.join('; '));
  return r.primitives;
};

// ---- timepiece@1 (sprites/hourglass.js, engine/prizes.js drawTimer) ------------------------------------------------

const TIME = { frame: 'body', sand: 'accent', glass: 'glass', face: 'face', hand: 'ink', shine: 'shine' };

test('timepiece@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('timepiece', 1), { cases: [
    { args: { at: [16, 17], kind: 'hourglass', scale: 0.92, level: 0.5, ...TIME }, ctx: IDLE },
    { args: { at: [16, 17], kind: 'stopwatch', scale: 1.04, ...TIME }, ctx: IDLE },
    { args: { at: [16, 16], kind: 'clock', scale: 0.8, ...TIME }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [16, 17], kind: 'hourglass', scale: 0.92, level: 0.1, collect: true, ...TIME }, ctx: COLLECT },
  ] });
});

test('timepiece@1 paints what drawTimer painted, every kind and level, still and turning', () => {
  for (const kind of ['hourglass', 'stopwatch', 'clock']) for (const k of [0.8, 0.92, 1.04]) for (const level of [0, 0.5, 1]) for (const t of [0, 0.375]) {
    const got = painted(run({ gen: 'timepiece', v: 1, at: [16, 17], kind, scale: k, level, ...TIME }, { t, loop: true, frames: 8 }));
    const want = paintedCode((g) => drawTimer(g, 16, 17, { kind, k, level, t }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${kind} k ${k} level ${level} t ${t}`);
  }
});

test('timepiece@1 draws the same centred on a node as in frame pixels, and is gone by the end of a collect', () => {
  const a = painted(run({ gen: 'timepiece', v: 1, at: [16, 17], kind: 'clock', scale: 1, ...TIME }, IDLE));
  const b = painted(run({ gen: 'timepiece', v: 1, at: [0, 0], kind: 'clock', scale: 1, ...TIME }, IDLE));
  assert.deepEqual([...b].map((s) => s.split(',').map(Number)).map(([x, y]) => `${x + 16},${y + 17}`).sort(), [...a].sort());
  assert.deepEqual(run({ gen: 'timepiece', v: 1, at: [0, 0], kind: 'hourglass', collect: true, ...TIME }, { t: 6 / 7, loop: false, frames: 8 }), []);
  // the flash frame is a little bigger than at rest, the dip squashes it
  const rest = painted(run({ gen: 'timepiece', v: 1, at: [0, 0], kind: 'stopwatch', ...TIME }, { t: 0, loop: false, frames: 8 }));
  const top = painted(run({ gen: 'timepiece', v: 1, at: [0, 0], kind: 'stopwatch', collect: true, ...TIME }, COLLECT));
  assert.ok(top.size > rest.size, `${top.size} > ${rest.size}`);
});

// ---- trophy@1 (sprites/trophy.js, engine/prizes.js drawTrophy) -----------------------------------------------------

const PRIZE = { metal: 'metal', ribbon: 'accent', base: 'stone', shine: 'shine' };

test('trophy@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('trophy', 1), { cases: [
    { args: { at: [16, 17], kind: 'cup', scale: 0.93, emblem: 'star', ...PRIZE }, ctx: IDLE },
    { args: { at: [16, 17], kind: 'medal', scale: 1.06, emblem: 'sun', ...PRIZE }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [16, 17], kind: 'crown', scale: 0.8, emblem: 'diamond', ...PRIZE }, ctx: IDLE },
    { args: { at: [16, 17], kind: 'cup', scale: 0.93, emblem: 'none', collect: true, ...PRIZE }, ctx: COLLECT },
  ] });
});

test('trophy@1 paints what drawTrophy painted, every prize and emblem, the medal turning', () => {
  for (const kind of ['cup', 'medal', 'crown']) for (const k of [0.8, 0.93, 1.06]) for (const emblem of ['star', 'none']) for (const t of [0, 0.25, 0.625]) {
    const got = painted(run({ gen: 'trophy', v: 1, at: [16, 17], kind, scale: k, emblem, glint: false, ...PRIZE }, { t, loop: true, frames: 8 }));
    const want = paintedCode((g) => drawTrophy(g, 16, 17, { kind, k, emblem: emblem === 'none' ? null : emblem, turn: Math.PI * t }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${kind} k ${k} ${emblem} t ${t}`);
  }
});

// ---- potion.bottle@1 (sprites/potion.js, engine/pickups.js drawBottle) ---------------------------------------------

const BOTTLE = { glass: 'glass', liquid: 'body', cork: 'cork', shine: 'shine' };

test('potion.bottle@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('potion.bottle', 1), { cases: [
    { args: { at: [16, 17], height: 18, shape: 'round', level: 0.7, ...BOTTLE }, ctx: IDLE },
    { args: { at: [16, 17], height: 21, shape: 'flask', level: 0.3, ...BOTTLE }, ctx: { t: 0.625, loop: true, frames: 8, frame: 5 } },
    { args: { at: [16, 17], height: 14, shape: 'vial', level: 1, bubbles: false, ...BOTTLE }, ctx: IDLE },
    { args: { at: [16, 17], height: 22, shape: 'tall', level: 0.7, collect: true, ...BOTTLE }, ctx: COLLECT },
  ] });
});

test('potion.bottle@1 paints what drawBottle painted, every bottle, fill and phase', () => {
  for (const shape of ['round', 'tall', 'flask', 'vial']) for (const h of [14, 17, 18, 22]) for (const level of [0, 0.7, 1]) for (const t of [0, 0.25, 0.5]) {
    const got = painted(run({ gen: 'potion.bottle', v: 1, at: [16, 17], height: h, shape, level, ...BOTTLE }, { t, loop: true, frames: 8 }));
    const want = paintedCode((g) => drawBottle(g, 16, h % 2 ? 16.5 : 17, h, { shape, level, tilt: -0.16 * wave(t), bubbles: 2, t }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${shape} h ${h} level ${level} t ${t}`);
  }
});

// ---- meal@1 and meal.steam@1 (sprites/meal.js, engine/food.js drawMeal, engine/fx.js smoke) -----------------------

const MEAL = { food: 'body', bone: 'accent', filling: 'filling', crumb: 'crumb', gleam: 'gleam' };

test('meal@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('meal', 1), { cases: [
    { args: { at: [16, 17], kind: 'drumstick', scale: 0.92, ...MEAL }, ctx: IDLE },
    { args: { at: [16, 18.5], kind: 'pie', scale: 1.06, bite: true, ...MEAL }, ctx: { t: 0.75, loop: true, frames: 8, frame: 6 } },
    { args: { at: [16, 17], kind: 'cheese', scale: 0.78, bite: true, ...MEAL }, ctx: IDLE },
    { args: { at: [16, 17], kind: 'bread', scale: 0.92, collect: true, ...MEAL }, ctx: COLLECT },
  ] });
});

test('meal@1 paints what drawMeal painted where sprites/meal.js put it, every kind, bite and phase', () => {
  for (const kind of ['drumstick', 'bread', 'cheese', 'pie']) for (const k of [0.78, 0.92, 1.06]) for (const bite of [false, true]) for (const steam of [0, 1.5]) for (const t of [0, 0.75]) {
    const got = painted(run({ gen: 'meal', v: 1, at: [16, 17 + steam], kind, scale: k, bite, ...MEAL }, { t, loop: true, frames: 8 }));
    const r = foodReach('meal', kind), cy = Math.round(17 + ((r.up - r.down) * k) / 2 + steam);
    const dip = Math.min(1, Math.max(0, (-wave(t) - 0.6) / 0.4));
    const sy = 1 - dip / (2 * r.down * k + 2 * r.up * k) * 2, sx = 1 + dip / (r.side * k * 2);
    const want = paintedCode((g) => drawMeal(g, 16, cy, { kind, k, sx, sy, bite }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${kind} k ${k} bite ${bite} steam ${steam} t ${t}`);
  }
});

test('meal.steam@1 passes the goldens harness and paints the two wisps sprites/meal.js drew', () => {
  const STEAM = { paint: 'steam' };
  checkGeneratorContract(registry, registry.generator('meal.steam', 1), { cases: [
    { args: { at: [16, 18.5], kind: 'pie', scale: 0.92, room: 17.5, ...STEAM }, ctx: IDLE },
    { args: { at: [16, 18.5], kind: 'drumstick', scale: 1.06, room: 17.5, ...STEAM }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [16, 18.5], kind: 'bread', scale: 0.78, room: 17.5, ...STEAM }, ctx: { t: 0.875, loop: true, frames: 8, frame: 7 } },
  ] });
  for (const kind of ['drumstick', 'bread', 'cheese', 'pie']) for (const k of [0.78, 1.06]) for (const t of [0, 0.25, 0.625]) {
    const got = painted(run({ gen: 'meal.steam', v: 1, at: [16, 18.5], kind, scale: k, room: 17.5, ...STEAM }, { t, loop: true, frames: 8 }));
    const r = foodReach('meal', kind), top = Math.round(17 + ((r.up - r.down) * k) / 2 + 1.5) - r.up * k;
    const want = paintedCode((g) => {
      for (const [w, dx, drift] of [[0, -4.5, -0.6], [1, 4.5, 0.6]]) for (let j = 0; j < 3; j++) {
        smoke(g, { t: t + (j + w / 2) / 3, x: 16 + dx, y: top - 1, count: 1, seed: 1, rise: Math.max(3, top - 4), drift, size: 2.4, colour: '#f0ead8', box: [1, 1, 31, 31] });
      }
    });
    assert.deepEqual([...got].sort(), [...want].sort(), `${kind} k ${k} t ${t}`);
  }
});

// ---- scroll@1 (sprites/scroll.js drawRolled and its rock, engine/prizes.js drawScroll) -----------------------------

// sprites/scroll.js drawRolled as it was (2026-11-20), the reference the port is held to: the rolled scroll through the icon pen
const HALF = 8.6, ROUND = 4;
const KNOB = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const DISC = [[-1, 1], [-2, 2], [-2, 2], [-2, 2], [-1, 1]];
function codeRolled(g, cx, cy, { k, angle, seal }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const pen = { k, angle, shade: true, shine: true, cx, cy, pt: (x, y) => [cx + k * (x * c - y * s), cy + k * (x * s + y * c)], at: (test) => placedIn(test, cx, cy, { angle, sx: k, sy: k }) };
  const tube = [rectIn(-HALF, -ROUND, 2 * HALF + 0.6, 2 * ROUND)];
  iconPaint(g, pen, [...tube, ellipseIn(-HALF - 0.6, 0, 2, ROUND)], '#f0ead8', { soft: 2 });
  iconLine(g, pen, [[-HALF + 2, 1.3], [HALF - 1, 1.3]], '#a0a0a0', { over: true });
  iconPaint(g, pen, ellipseIn(-HALF - 0.6, 0, 2, ROUND), '#a0a0a0', { flat: true });
  iconPaint(g, pen, [capsuleIn(-0.6, 1.2, -2.8, ROUND + 0.4, 0.8), capsuleIn(0.2, 1.2, 2.2, ROUND + 0.4, 0.8)], '#802020', { flat: true, clip: rectIn(-HALF, -ROUND - 1, 2 * HALF, 2 * ROUND + 1.6) });
  iconPaint(g, pen, rectIn(-1.6, -ROUND - 1, 3.2, 2 * ROUND + 2), '#c9423a', { soft: 0, rim: '#231b33', clip: (x, y) => tube.some((f) => f(x, y)) });
  if (k > 0.6) for (const along of [-HALF - 1.4, HALF + 2.2]) {
    const [fx, fy] = pen.pt(along, 0), X = Math.round(fx - 0.5), Y = Math.round(fy - 0.5);
    for (const [dx, dy] of KNOB) g.dot(X + dx, Y + dy, '#a06a3c');
  }
  if (seal) {
    const [fx, fy] = pen.pt(4.8, -0.2), x = Math.round(fx - 0.5), y = Math.round(fy - 0.5);
    DISC.forEach(([a, b], i) => { for (let dx = a; dx <= b; dx++) g.dot(x + dx, y - 2 + i, '#802020'); });
  }
}

const SCROLL = { paper: 'body', ribbon: 'accent', rods: 'wood', shine: 'shine' };

test('scroll@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('scroll', 1), { cases: [
    { args: { at: [16, 16], kind: 'rolled', scale: 0.94, seal: true, ...SCROLL }, ctx: IDLE },
    { args: { at: [16, 17], kind: 'open', scale: 1.06, seal: false, ...SCROLL }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [16, 17], kind: 'letter', scale: 0.82, seal: true, ...SCROLL }, ctx: { t: 0.125, loop: true, frames: 8, frame: 1 } },
    { args: { at: [16, 16], kind: 'rolled', scale: 0.94, seal: true, collect: true, ...SCROLL }, ctx: COLLECT },
  ] });
});

test('scroll@1 paints what sprites/scroll.js painted, every kind, seal and step of its rock', () => {
  for (const kind of ['rolled', 'open', 'letter']) for (const k of [0.82, 0.94, 1.06]) for (const seal of [false, true]) for (const t of [0, 0.25, 0.75]) {
    const y = kind === 'rolled' ? 16 : 17;
    const got = painted(run({ gen: 'scroll', v: 1, at: [16, y], kind, scale: k, seal, ...SCROLL }, { t, loop: true, frames: 8 }));
    const step = Math.round(wave(t, 0.5));
    const want = paintedCode((g) => {
      if (kind === 'rolled') return codeRolled(g, 16, y, { k, angle: -ICON_DIAGONAL + step * 0.1, seal });
      const s = new S2(32, 32);
      drawScroll(s, 16, y, { kind, k, seal });
      g.blit(step ? tilt(s, 16, y, step * 0.08) : s);
    });
    assert.deepEqual([...got].sort(), [...want].sort(), `${kind} k ${k} seal ${seal} t ${t}`);
  }
});

// ---- keycard@1 (sprites/keycard.js) --------------------------------------------------------------------------------

// sprites/keycard.js's card as it was (2026-11-20), the reference the port is held to
function stripeOf(kind, w, y) {
  if (kind === 'two') return [[rectIn(-w / 2, y, w, 2), rectIn(-w / 2, y + 3, w, 2)], y + 2.5];
  if (kind === 'chevron') return [[chevronIn(0, y + 3, w, 6, 2)], y + 3];
  return [[rectIn(-w / 2, y, w, 3)], y + 1.5];
}
function cardShapes(shape, stripes, h) {
  if (shape === 'chip') {
    const sz = h - 4, top = -sz / 2 - 1, [stripe] = stripeOf(stripes, sz, top + 3);
    return { body: [cutRectIn(-sz / 2, top, sz, sz, [0, 4, 0, 0])], pins: [-sz / 2 + 2, -1, sz / 2 - 4].map((x) => rectIn(x, top + sz, 2, 2)), stripe };
  }
  if (shape === 'fob') {
    const r = Math.round(h / 3), cy = h / 2 - r, top = -h / 2, [stripe] = stripeOf(stripes, 2 * r, cy - r + 3);
    return { body: [ellipseIn(0, cy, r, r), rectIn(-2, top + 6, 4, cy - r - top - 4)], pins: [ringIn(0, top + 4, 4, 1.6)], stripe };
  }
  const w = 2 * Math.round(h / 3), top = -h / 2, [stripe] = stripeOf(stripes, w, top + 4);
  return { body: [roundRectIn(-w / 2, top, w, h, 2)], pins: [], stripe };
}
function codeCard(g, { shape, stripes, h, t }) {
  const K = cardShapes(shape, stripes, h);
  const rest = boundsOf(placedIn(leanedIn([...K.body, ...K.pins], 0, 0.375), 16, 16), 32, 32);
  const x = 16 + Math.round(16 - (rest.x0 + rest.x1 + 1) / 2), slope = 0.375 + 0.125 * wave(t);
  const put = (tests) => placedIn(leanedIn(tests, 0, slope), x, 16, { sx: 1, sy: 1 });
  if (K.pins.length) g.fill(0, 0, 32, 32, put(K.pins), '#c2c9d6');
  g.fill(0, 0, 32, 32, put(K.body), '#9aa6c0');
}

const CARD = { card: 'body', stripe: 'accent', lamp: 'glow', pins: 'steel', bezel: 'plate', glint: 'glint', shine: 'shine' };

test('keycard@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('keycard', 1), { cases: [
    { args: { at: [16, 16], shape: 'card', stripes: 'one', height: 18, ...CARD }, ctx: IDLE },
    { args: { at: [16, 16], shape: 'chip', stripes: 'two', height: 20, ...CARD }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [16, 16], shape: 'fob', stripes: 'chevron', height: 16, ...CARD }, ctx: { t: 0.125, loop: true, frames: 8, frame: 1 } },
    { args: { at: [16, 16], shape: 'card', stripes: 'chevron', height: 18, collect: true, ...CARD }, ctx: COLLECT },
  ] });
});

test('keycard@1 paints what sprites/keycard.js painted, every shape, stripe, size and step of its rock', () => {
  for (const shape of ['card', 'chip', 'fob']) for (const stripes of ['one', 'two', 'chevron']) for (const h of [16, 18, 20]) for (const t of [0, 0.25, 0.625]) {
    const got = painted(run({ gen: 'keycard', v: 1, at: [16, 16], shape, stripes, height: h, ...CARD }, { t, loop: true, frames: 8 }));
    const want = paintedCode((g) => codeCard(g, { shape, stripes, h, t }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${shape} ${stripes} h ${h} t ${t}`);
  }
});

// ---- xp.shard@1 (sprites/xp-shard.js) ------------------------------------------------------------------------------

// sprites/xp-shard.js's shapes and drawing as they were (2026-11-20), the reference the port is held to (16 x 16 frame)
const scaledIn = (test, k) => placedIn(test, 0, 0, { sx: k });
const XP_SHAPES = {
  shard: (n) => { const w = 2 * Math.floor(n * 0.3) + 1, body = crystalIn(0, 0, w, n); return { body, hw: w / 2, hh: n / 2, heart: (k) => scaledIn(body, 0.42 + 0.2 * k), oddX: true, oddY: n % 2 === 1 }; },
  orb: (n) => { const r = n % 2 ? (n - 1) / 2 + 0.4 : n / 2, body = ellipseIn(0, 0, r, r); return { body, hw: n / 2, hh: n / 2, heart: (k) => scaledIn(body, 0.42 + 0.2 * k), oddX: n % 2 === 1, oddY: n % 2 === 1 }; },
  star: (n) => { const body = starIn(0, 0, n / 2 + 0.3, 4, { inner: 0.42 }); return { body, hw: n / 2, hh: n / 2, heart: (k) => scaledIn(body, 0.42 + 0.2 * k), oddX: n % 2 === 1, oddY: n % 2 === 1 }; },
  cube: (n) => { const w = 2 * Math.ceil(n / 2), C = cubeIn(0, 0, w), top = (px, py) => C.top(px, py + C.topY); return { body: C.body, hw: w / 2, hh: w / 2, heart: (k) => placedIn(top, 0, C.topY, { sx: 0.7 + 0.3 * k }), faces: [[C.right, 'dark']] }; },
};
function codeShard(g, { shape, n, t, pulled }) {
  const S = XP_SHAPES[shape](n), { hw, hh } = S, cx = S.oddX ? 8.5 : 8, cy = S.oddY ? 8.5 : 8, FULL = [0, 0, 16, 16];
  const draw = (x, y, sx, sy, k) => {
    const put = (test) => placedIn(test, x, y, { sx, sy }), body = put(S.body);
    g.fill(...FULL, body, '#b48af8', { shade: 0 });
    g.fill(...FULL, put(S.heart(k)), '#f0ead8', { clip: insetIn(body, 1) });
  };
  if (!pulled) return draw(cx, cy, 1, 1, pulse(t * 2));
  const long = Math.min(Math.max(2 * hw * 1.3, 6), 9) + pulse(t * 2), low = Math.min(Math.max(2 * hh * 0.7, 4), 7);
  const head = 16 - 2 - long / 2, tail = 2 + Math.round(pulse(t));
  g.fill(...FULL, polyIn([[head, cy - low * 0.4], [head, cy + low * 0.4], [tail, cy + 0.5], [tail, cy - 0.5]]), '#b48af8', { shade: 0 });
  draw(head, cy, long / (2 * hw), low / (2 * hh), 0.4);
  return { x: head - long / 2 - 2, y: cy, reach: Math.max(2, head - long / 2 - 4), spread: low / 2 + 0.5 };
}
const paintedIn16 = (draw) => {
  const g = new Surface(16, 16);
  draw(g);
  const out = new Set();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) >>> 24) out.add(`${x},${y}`);
  return out;
};

const SHARD = { body: 'body', heart: 'glow' };

test('xp.shard@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('xp.shard', 1), { cases: [
    { args: { at: [8, 8], shape: 'shard', length: 9, ...SHARD }, ctx: IDLE },
    { args: { at: [8, 8], shape: 'cube', length: 10, ...SHARD }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [8, 8], shape: 'star', length: 8, layer: 'pulled', ...SHARD }, ctx: { t: 0.5, loop: true, frames: 6, frame: 3 } },
    { args: { at: [8, 8], shape: 'orb', length: 9, layer: 'streaks', ...SHARD }, ctx: { t: 1 / 3, loop: true, frames: 6, frame: 2 } },
    { args: { at: [8, 8], shape: 'orb', length: 8, collect: true, ...SHARD }, ctx: { t: 0.6, loop: false, frames: 6, frame: 3 } },
  ] });
});

test('xp.shard@1 paints what sprites/xp-shard.js painted: floating, pulled to the right, and the streaks behind it', () => {
  for (const shape of ['shard', 'orb', 'star', 'cube']) for (const n of [8, 9, 10]) for (const t of [0, 0.25, 0.5]) {
    const float = painted(run({ gen: 'xp.shard', v: 1, at: [8, 8], shape, length: n, ...SHARD }, { t, loop: true, frames: 8 }));
    assert.deepEqual([...float].sort(), [...paintedIn16((g) => codeShard(g, { shape, n, t }))].sort(), `${shape} n ${n} t ${t}`);
    const pulled = painted(run({ gen: 'xp.shard', v: 1, at: [8, 8], shape, length: n, layer: 'pulled', ...SHARD }, { t, loop: true, frames: 6 }));
    let st;
    assert.deepEqual([...pulled].sort(), [...paintedIn16((g) => { st = codeShard(g, { shape, n, t, pulled: true }); })].sort(), `pulled ${shape} n ${n} t ${t}`);
    const trail = painted(run({ gen: 'xp.shard', v: 1, at: [8, 8], shape, length: n, layer: 'streaks', ...SHARD }, { t, loop: true, frames: 6 }));
    assert.deepEqual([...trail].sort(), [...paintedIn16((g) => streaks(g, { t, ...st, count: 2, length: 3, colours: ['#d0b0ff'] }))].sort(), `streaks ${shape} n ${n} t ${t}`);
  }
});

// ---- shield.cell@1 (sprites/shield-cell.js) ------------------------------------------------------------------------

// sprites/shield-cell.js's drawing as it was (2026-11-20), the reference the port is held to
const even2 = (v) => 2 * Math.round(v / 2);
const CELL_W = { hex: [16, 22], orb: [14, 20], ring: [16, 22] };
function codeCell(g, { shape, w, two, t }) {
  const h = shape === 'hex' ? even2(w * 0.9) : w, R = w / 2, FULL = [0, 0, 32, 32], y = 17, run = t + 0.06;
  const put = (test) => placedIn(test, 16, y);
  if (shape === 'orb') {
    const ball = put(ellipseIn(0, 0, R, R));
    g.fill(...FULL, ball, '#4f9ff0', { shade: 2 });
    g.fill(...FULL, put(ellipseIn(R * 0.3, -R * 0.3, R * 0.2, R * 0.2)), '#ffffff');
    const bands = [meridianIn(0, 0, R, R, Math.PI * t, 2), ...(two ? [meridianIn(0, 0, R, R, Math.PI * t + Math.PI / 2, 2)] : [])];
    g.fill(...FULL, put(anyIn(bands)), '#ffffff', { outline: '#203080', clip: ball });
    g.fill(...FULL, rimRunIn(ball, 16, y, run, 0.2), '#ffffff');
  } else if (shape === 'ring') {
    const c = Math.cos(0.75 * wave(t));
    g.fill(...FULL, put(hoopIn(0, 0, R * c, R, 3)), '#4f9ff0', { shade: 1, light: 1 });
    if (two) g.fill(...FULL, put(hoopIn(0, 0, (R - 5) * Math.cos(0.75 * wave(t, 0.25)), R - 5, 2)), '#4f9ff0', { shade: 1 });
    g.fill(...FULL, put(ellipseIn(0, 0, 2, 2)), '#ffffff', { outline: '#4f9ff0' });
    g.fill(...FULL, put(anyIn(rectIn(-2, -R, 4, 4), rectIn(-2, R - 4, 4, 4))), '#9aa6c0', { light: 1 });
  } else {
    drawToken(g, flatHexIn(0, 0, w, h), 16, y, '#9aa6c0', { turn: 0.75 * wave(t), thick: 4, rim: 2, field: '#203080' });
  }
}

const CELL = { casing: 'body', energy: 'glow', band: 'band', shine: 'shine' };

test('shield.cell@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('shield.cell', 1), { cases: [
    { args: { at: [16, 17], shape: 'hex', size: 0.4, ...CELL }, ctx: IDLE },
    { args: { at: [16, 17], shape: 'orb', size: 1, layers: 2, ...CELL }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [16, 17], shape: 'ring', size: 0, layers: 2, ...CELL }, ctx: { t: 0.625, loop: true, frames: 8, frame: 5 } },
    { args: { at: [16, 17], shape: 'hex', size: 1, layers: 2, collect: true, ...CELL }, ctx: COLLECT },
  ] });
});

test('shield.cell@1 paints what sprites/shield-cell.js painted, every shape, size, layers and phase', () => {
  for (const shape of ['hex', 'orb', 'ring']) for (const u of [0, 0.5, 1]) for (const layers of [1, 2]) for (const t of [0, 0.25, 0.625]) {
    const w = even2(CELL_W[shape][0] + (CELL_W[shape][1] - CELL_W[shape][0]) * u);
    const got = painted(run({ gen: 'shield.cell', v: 1, at: [16, 17], shape, size: u, layers, ...CELL }, { t, loop: true, frames: 8 }));
    const want = paintedCode((g) => codeCell(g, { shape, w, two: layers === 2, t }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${shape} w ${w} layers ${layers} t ${t}`);
  }
});

// ---- star.charm@1 (sprites/star-charm.js) --------------------------------------------------------------------------

// sprites/star-charm.js's drawing as it was (2026-11-20), the reference the port is held to: halo, badge and loop, twinkles
const STAR_N = { four: 4, five: 5, six: 6, eight: 8 }, STAR_CUT = { six: { inner: 0.46, spine: 0.71 }, eight: { inner: 0.44, spine: 0.75 } };
const STAR_TURN = [[0, 0], [0.375, 0.32], [0.5, 0.5], [0.625, 0.68], [1, 1]];
function codeCharm(g, layer, { shape, u, t, sparkle = true }) {
  const R = Math.round(13 + 6 * u) / 2, n = STAR_N[shape], D = R, mid = (D + R - 2) / 2, y = 17, LOOP = 2;
  const swing = 0.11 * wave(t), turn = Math.PI * keys(t, STAR_TURN, (x) => x);
  const put = (test) => placedIn(placedIn(test, 0, -mid, { angle: swing }), 16, y, { sx: 1, sy: 1 });
  const sx = 16 - Math.sin(swing) * D, sy = y + (Math.cos(swing) * D - mid);
  if (layer === 'halo') {
    const hr = R * (0.74 + 0.22 * pulse(t * 2));
    g.fill(0, 0, 32, 32, ringIn(sx, sy, hr + 1, 1), '#204050');
    g.fill(0, 0, 32, 32, ringIn(sx, sy, hr, 1), '#4fd8ee');
  } else if (layer === 'charm') {
    const cut = STAR_CUT[shape], flat = starIn(0, D, R, n, { inner: cut?.inner });
    const spines = cut && spunIn(capsuleIn(0, 0, 0, cut.spine - R, cut.spine), 0, D, n);
    const star = spines ? (x, yy) => flat(x, yy) || (yy >= LOOP - 1 && spines(x, yy)) : flat, stem = rectIn(-1, LOOP - 1, 2, 2), loop = ringIn(0, 0, LOOP, 1);
    const edgeOn = Math.abs(Math.cos(turn)) < 0.2, tall = rectIn(-R, D - R, 2 * R, R + (n % 2 ? R * Math.cos(Math.PI / n) : R));
    const T = turnedIn((x, yy) => (edgeOn ? tall(x, yy) : star(x, yy)) || stem(x, yy), turn, edgeOn ? 2 : 1.2);
    g.fill(0, 0, 32, 32, put(T.body), '#f2c230');
    g.fill(0, 0, 32, 32, put(T.face), '#f2c230');
    g.fill(0, 0, 32, 32, put(loop), '#f2c230');
    if (T.squeeze > 0.3) {
      const jr = Math.max(2, R * 0.28);
      g.fill(0, 0, 32, 32, put(ellipseIn(T.x, D, jr * T.squeeze, jr)), '#4fd8ee', { outline: '#806010' });
      if (T.squeeze > 0.6) g.dot(sx + T.x, sy - 1, '#ffffff');
    }
  } else {
    [[-0.95, 0.55], [1, 0.1], [-0.15, 1.2]].forEach(([ux, uy], i) => {
      const life = fract(t + i / 3), lag = 2.5 * (wave(t, -0.14 * (i + 1)) - wave(0, -0.14 * (i + 1)));
      if (life < 0.67) twinkle(g, 16 + ux * (R + 2) - lag, y + (D - mid) + uy * (R + 1) * 0.8, life < 0.34 ? 1 : 0, '#4fd8ee');
    });
    if (sparkle) { const d = Math.abs(fract(t - 0.875 + 0.5) - 0.5), size = d < 0.07 ? 2 : d < 0.19 ? 1 : -1; if (size >= 0) twinkle(g, sx + R * 0.6, sy - R * 0.8, size, '#ffe080'); }
  }
}

const CHARM = { metal: 'body', energy: 'glow', shine: 'shine' };

test('star.charm@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('star.charm', 1), { cases: [
    { args: { at: [16, 17], points: 'five', size: 0.5, layer: 'charm', ...CHARM }, ctx: IDLE },
    { args: { at: [16, 17], points: 'eight', size: 1, layer: 'charm', ...CHARM }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [16, 17], points: 'six', size: 0, layer: 'halo', ...CHARM }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [16, 17], points: 'four', size: 0.5, layer: 'sparkles', ...CHARM }, ctx: { t: 0.875, loop: true, frames: 8, frame: 7 } },
    { args: { at: [16, 17], points: 'five', size: 0.5, layer: 'charm', collect: true, ...CHARM }, ctx: COLLECT },
  ] });
});

test('star.charm@1 paints what sprites/star-charm.js painted: halo, badge with its loop, and twinkles, every shape and phase', () => {
  for (const points of ['four', 'five', 'six', 'eight']) for (const u of [0, 0.5, 1]) for (const t of [0, 0.25, 0.375, 0.5, 0.875]) for (const layer of ['halo', 'charm', 'sparkles']) {
    const got = painted(run({ gen: 'star.charm', v: 1, at: [16, 17], points, size: u, layer, ...CHARM }, { t, loop: true, frames: 8 }));
    const want = paintedCode((g) => codeCharm(g, layer, { shape: points, u, t }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${layer} ${points} size ${u} t ${t}`);
  }
});

// ---- power.orb@1 (sprites/power-orb.js) ----------------------------------------------------------------------------

// sprites/power-orb.js's render as it was (2026-11-20), floating, without its gleam: the reference the port is held to
const ORB_SHELLS = { orb: { rx: [5, 7], ry: [5, 7] }, prism: { rx: [4, 5], ry: [7, 9] }, shard: { rx: [5, 5], ry: [7, 10] } };
const ORB_PLACE = { orb: { mark: -1, hoop: 3, drift: 1 }, prism: { mark: -1, hoop: 3, drift: 1 }, shard: { mark: 0, hoop: 4, drift: 0 } };
const arrowUpIn = (x, y, size) => {
  const n = Math.max(2, (size - 1) >> 1), half = n >= 3 ? 1 : 0, tip = y - n;
  return (px, py) => { const i = Math.abs(Math.floor(px) - x), j = Math.floor(py) - tip; if (j < 0 || j > 2 * n) return false; return j < n + 1 ? i <= j : i <= half; };
};
function codeOrb(g, { shell, u, mark, cage, t, glow }) {
  const S = ORB_SHELLS[shell], rx = Math.round(S.rx[0] + (S.rx[1] - S.rx[0]) * u), ry = Math.round(S.ry[0] + (S.ry[1] - S.ry[0]) * u), hoop = rx + 4, cy = 17;
  const C = steps(glow), body = new Surface(32, 32);
  const sh = drawCrystal(body, 16, cy, Math.max(2, rx), Math.max(2, ry), glow, { cut: shell, turn: t });
  if (mark !== 'none') {
    const ink = pick(glow, '#ffffff', INK), mx = 16 + Math.round(wave(t)) * ORB_PLACE[shell].drift, my = cy + ORB_PLACE[shell].mark;
    let inner = 0;
    for (let x = 0; x < 32; x++) if (body.get(x, my)) inner++;
    const size = inner >= 11 ? 7 : 5, halo = ink === INK && inner >= size + 4, sign = new Surface(32, 32);
    if (mark === 'arrow') sign.fill(mx - 3, my - 3, mx + 4, my + 4, arrowUpIn(mx, my, size), ink, { shade: 0 });
    else drawMark(sign, mark, mx, my, size, ink);
    const inShell = (x, y) => !!body.get(Math.floor(x), Math.floor(y));
    if (halo) body.blit(masked(drawAura(new Surface(32, 32), sign, { reach: 1, colours: ['#ffffff'] }), inShell));
    body.blit(masked(sign, inShell));
  }
  body.outline(INK);
  drawAura(g, body, { reach: 1 + Math.round(pulse(t)), colours: [C[2], C[3]], box: [1, 1, 31, 31] });
  const rings = cage ? [orbitHoop({ cx: 16, cy: cy + ORB_PLACE[shell].hoop, rx: Math.min(hoop, 14), ry: 3, thick: 2, back: '#606060', front: '#909090', bead: { turn: t, colour: C[1] } })] : [];
  around(g, body, rings);
  return sh;
}

const ORB_LAYERS = ['aura', 'far', 'shell', 'near'];

test('power.orb@1 passes the goldens harness', () => {
  const O = { energy: 'g', metal: 'metal', markInk: 'ink', markHalo: 'shine', shine: 'shine' };
  checkGeneratorContract(registry, registry.generator('power.orb', 1), { cases: [
    { args: { at: [16, 17], shell: 'orb', size: 0.5, mark: 'star', layer: 'shell', ...O }, ctx: IDLE },
    { args: { at: [16, 17], shell: 'prism', size: 1, mark: 'arrow', layer: 'aura', ...O }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [16, 17], shell: 'shard', size: 0, mark: 'sun', layer: 'near', ...O }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3 } },
    { args: { at: [16, 17], shell: 'orb', size: 1, mark: 'none', layer: 'far', ...O }, ctx: { t: 0.75, loop: true, frames: 8, frame: 6 } },
    { args: { at: [16, 17], shell: 'orb', size: 0.5, mark: 'star', layer: 'shell', collect: true, ...O }, ctx: COLLECT },
  ] });
});

test('power.orb@1 paints what sprites/power-orb.js painted: glow, ring behind, shell with its mark, ring in front', () => {
  const O = { energy: 'g', metal: 'metal', markInk: 'ink', markHalo: 'shine', shine: 'shine' };
  for (const shell of ['orb', 'prism', 'shard']) for (const u of [0, 0.5, 1]) for (const mark of ['arrow', 'sun', 'star', 'none']) for (const cage of [false, true]) for (const t of [0, 0.25, 0.625]) {
    const layers = cage ? ORB_LAYERS : ['aura', 'shell'];
    const got = new Set();
    let shellPx = new Set();
    for (const layer of layers) {
      const px = painted(run({ gen: 'power.orb', v: 1, at: [16, 17], shell, size: u, mark, layer, ...O }, { t, loop: true, frames: 8 }));
      if (layer === 'shell') shellPx = px;
      for (const k of px) got.add(k);
    }
    // the outline the data file draws round the shell alone
    for (const k of shellPx) { const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!shellPx.has(`${x + dx},${y + dy}`)) got.add(`${x + dx},${y + dy}`); }
    const want = paintedCode((g) => codeOrb(g, { shell, u, mark, cage, t, glow: '#4fd8ee' }));
    assert.deepEqual([...got].sort(), [...want].sort(), `${shell} size ${u} ${mark} cage ${cage} t ${t}`);
  }
});

// ---- the collect pose is the default (review of M2, round 1) -------------------------------------------------------
// A data file must not have to remember `collect: true` on every call: in a one-shot clip (a pickup's collect) each
// generator squashes, swells and shrinks to nothing unless its call says `collect: false`; a looping clip never moves.

/** The ten generators with a collect pose, and the args of the collect case pinned in each one's golden file. */
const COLLECTING = ['timepiece', 'trophy', 'potion.bottle', 'meal', 'scroll', 'keycard', 'xp.shard', 'shield.cell', 'star.charm', 'power.orb'];
const collectCase = (gen) => {
  const golden = JSON.parse(fs.readFileSync(new URL(`../fixtures/gen/${gen}@1.json`, import.meta.url), 'utf8'));
  const c = golden.cases.find((x) => 'collect' in x.args);
  assert.ok(c, `${gen}: a pinned collect case`);
  const { collect, ...args } = c.args;
  return { args, frames: c.ctx.frames };
};

test('in a one-shot clip each pickup generator shrinks to nothing without being told; collect: false keeps it whole', () => {
  for (const gen of COLLECTING) {
    const { args, frames } = collectCase(gen);
    const at = (t, extra = {}, loop = false) => run({ gen, v: 1, ...args, ...extra }, { t, loop, frames, frame: Math.round(t * (frames - 1)) });
    assert.equal(registry.generator(gen, 1).args.collect.default, true, `${gen}: collect defaults to true`);
    assert.deepEqual(at(1), [], `${gen}: gone by the last frame of a one-shot clip with no collect named`);
    assert.ok(painted(at(1, { collect: false })).size > 0, `${gen}: collect: false still draws on the last frame`);
    // the dip squashes it and the top swells it a little, then it shrinks: smaller after the flash than at the start
    assert.ok(painted(at(0.75)).size < painted(at(0)).size, `${gen}: smaller after the flash`);
    // a looping clip is never posed, whatever the call says
    for (const t of [0, 0.25, 0.625]) assert.deepEqual(at(t, {}, true), at(t, { collect: false }, true), `${gen}: a loop at t ${t} is not posed`);
  }
});
