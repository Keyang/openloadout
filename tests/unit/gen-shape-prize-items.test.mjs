// Migration batch M2 (docs/data-sprites.md section 9, M1 to M40; section 7): the shape generators the ten pickups of
// the batch are drawn with as data (engine/gen/prize-items.js), each a port of the code that drew the sprite. Each
// passes the goldens harness (pinned output, determinism, cost, loop closure, every argument at its limits), and each
// port paints the same silhouette as the code helper it replaces at the defaults, so a redraw is the old picture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

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

const BOTTLE = { glass: 'glass', liquid: 'body', cork: 'cork', shine: 'shine' };

test('potion.bottle@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('potion.bottle', 1), { cases: [
    { args: { at: [16, 17], height: 18, shape: 'round', level: 0.7, ...BOTTLE }, ctx: IDLE },
    { args: { at: [16, 17], height: 21, shape: 'flask', level: 0.3, ...BOTTLE }, ctx: { t: 0.625, loop: true, frames: 8, frame: 5 } },
    { args: { at: [16, 17], height: 14, shape: 'vial', level: 1, bubbles: false, ...BOTTLE }, ctx: IDLE },
    { args: { at: [16, 17], height: 22, shape: 'tall', level: 0.7, collect: true, ...BOTTLE }, ctx: COLLECT },
  ] });
});

const MEAL = { food: 'body', bone: 'accent', filling: 'filling', crumb: 'crumb', gleam: 'gleam' };

test('meal@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('meal', 1), { cases: [
    { args: { at: [16, 17], kind: 'drumstick', scale: 0.92, ...MEAL }, ctx: IDLE },
    { args: { at: [16, 18.5], kind: 'pie', scale: 1.06, bite: true, ...MEAL }, ctx: { t: 0.75, loop: true, frames: 8, frame: 6 } },
    { args: { at: [16, 17], kind: 'cheese', scale: 0.78, bite: true, ...MEAL }, ctx: IDLE },
    { args: { at: [16, 17], kind: 'bread', scale: 0.92, collect: true, ...MEAL }, ctx: COLLECT },
  ] });
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

const CARD = { card: 'body', stripe: 'accent', lamp: 'glow', pins: 'steel', bezel: 'plate', glint: 'glint', shine: 'shine' };

test('keycard@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('keycard', 1), { cases: [
    { args: { at: [16, 16], shape: 'card', stripes: 'one', height: 18, ...CARD }, ctx: IDLE },
    { args: { at: [16, 16], shape: 'chip', stripes: 'two', height: 20, ...CARD }, ctx: { t: 0.5, loop: true, frames: 8, frame: 4 } },
    { args: { at: [16, 16], shape: 'fob', stripes: 'chevron', height: 16, ...CARD }, ctx: { t: 0.125, loop: true, frames: 8, frame: 1 } },
    { args: { at: [16, 16], shape: 'card', stripes: 'chevron', height: 18, collect: true, ...CARD }, ctx: COLLECT },
  ] });
});

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
