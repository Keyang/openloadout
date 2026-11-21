// Migration batch M2 (docs/data-sprites.md section 9, M1 to M40; section 7): the shape generators the ten pickups of
// the batch are drawn with as data (engine/gen/prize-items.js), each a port of the code that drew the sprite. Each
// passes the goldens harness (pinned output, determinism, cost, loop closure, every argument at its limits), and each
// port paints the same silhouette as the code helper it replaces at the defaults, so a redraw is the old picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

import { oldReplay } from '../helpers/old-replay.mjs';
const OLD = oldReplay('gen-shape-prize-items');   // what the modules that are gone (engine/prizes.js, gadgets.js, food.js, orbits.js, icons.js) drew and answered, recorded in the order of the calls (tests/helpers/old-replay.mjs)
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
  const g = OLD.surface(32, 32, draw);
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
    const want = paintedCode();
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
    const want = paintedCode();
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
    const want = paintedCode();
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
    OLD.value();   // foodReach: only the old drawing's place needed it (kept so the calls stay in the recorded order)
    const want = paintedCode();
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
    OLD.value();   // foodReach, kept so the calls stay in the recorded order
    const want = paintedCode();
    assert.deepEqual([...got].sort(), [...want].sort(), `${kind} k ${k} t ${t}`);
  }
});


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
    const want = paintedCode();
    assert.deepEqual([...got].sort(), [...want].sort(), `${kind} k ${k} seal ${seal} t ${t}`);
  }
});


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
    const want = paintedCode();
    assert.deepEqual([...got].sort(), [...want].sort(), `${shape} ${stripes} h ${h} t ${t}`);
  }
});

const paintedIn16 = (draw) => {
  const g = OLD.surface(16, 16, draw);
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
    assert.deepEqual([...float].sort(), [...paintedIn16()].sort(), `${shape} n ${n} t ${t}`);
    const pulled = painted(run({ gen: 'xp.shard', v: 1, at: [8, 8], shape, length: n, layer: 'pulled', ...SHARD }, { t, loop: true, frames: 6 }));
    assert.deepEqual([...pulled].sort(), [...paintedIn16()].sort(), `pulled ${shape} n ${n} t ${t}`);
    const trail = painted(run({ gen: 'xp.shard', v: 1, at: [8, 8], shape, length: n, layer: 'streaks', ...SHARD }, { t, loop: true, frames: 6 }));
    assert.deepEqual([...trail].sort(), [...paintedIn16()].sort(), `streaks ${shape} n ${n} t ${t}`);
  }
});

// ---- shield.cell@1 (sprites/shield-cell.js) ------------------------------------------------------------------------

// sprites/shield-cell.js's drawing as it was (2026-11-20), the reference the port is held to
const even2 = (v) => 2 * Math.round(v / 2);
const CELL_W = { hex: [16, 22], orb: [14, 20], ring: [16, 22] };

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
    const want = paintedCode();
    assert.deepEqual([...got].sort(), [...want].sort(), `${shape} w ${w} layers ${layers} t ${t}`);
  }
});


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
    const want = paintedCode();
    assert.deepEqual([...got].sort(), [...want].sort(), `${layer} ${points} size ${u} t ${t}`);
  }
});


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
    const want = paintedCode();
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
