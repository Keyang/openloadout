// Migration batch M3 (docs/data-sprites.md section 9, M1 to M40; section 7): the shape generators the library props of
// the batch are drawn with as data (engine/gen/world-props.js), each a port of the code that drew the prop. Each passes
// the goldens harness (pinned output, determinism, cost, every argument at its limits), reads its per-frame tables at
// ctx.frame (the last entry holding past the end), and draws round `at`, so the same call on a node lands the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { tableAt } from '../../engine/gen/world-props.js';

const frame = (f, frames = 8) => ({ t: frames > 1 ? f / (frames - 1) : 0, loop: false, frames, frame: f });

/** The pixels a call paints, as a set of "x,y" (these generators return stamps). */
function painted(prims) {
  const out = new Set();
  for (const p of prims) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.' && ch !== ' ') out.add(`${p.at[0] + i},${p.at[1] + j}`); }));
  }
  return out;
}
const run = (call, ctx = frame(0, 1)) => {
  const r = registry.runGenerator(call, ctx);
  assert.ok(r.ok, r.errors?.join('; '));
  return r.primitives;
};
const lowest = (set) => Math.max(...[...set].map((k) => Number(k.split(',')[1])));
const highest = (set) => Math.min(...[...set].map((k) => Number(k.split(',')[1])));

test('tableAt reads a per-frame table at the frame, the last entry holding past the end', () => {
  assert.equal(tableAt([0, 1, 2], { frame: 1 }), 1);
  assert.equal(tableAt([0, 1, 2], { frame: 7 }), 2);
  assert.equal(tableAt([5], { frame: 3 }), 5);
  assert.equal(tableAt(4, { frame: 3 }), 4);
  assert.equal(tableAt(undefined, { frame: 0 }, 9), 9);
});

const SPRING = { gen: 'spring.pad', v: 1, at: [16, 30], body: 'body', metal: 'metal', skin: 'cream' };
test('spring.pad@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('spring.pad', 1), { cases: [
    { args: { ...SPRING } },
    { args: { ...SPRING, style: 'leaf', half: 13, rest: 19, coils: 4, lift: [0, 0, 0.8, 1], press: [0, 1] }, ctx: frame(3) },
    { args: { ...SPRING, style: 'drum', half: 8, rest: 12, coils: 2, press: [0, 1] }, ctx: frame(1) },
  ] });
});

test('spring.pad@1 stands on its foot, is pressed down by press and thrown up by lift', () => {
  const rest = painted(run(SPRING)), pressed = painted(run({ ...SPRING, press: [0, 1] }, frame(1))), up = painted(run({ ...SPRING, lift: [0, 0, 0, 1] }, frame(3)));
  assert.equal(lowest(rest), 29);
  assert.ok(highest(pressed) > highest(rest) + 3, 'pressed lower');
  assert.ok(highest(up) < highest(rest) - 3, 'thrown higher');
  assert.ok(highest(up) >= 1, 'stays in the frame');
});

const SPIKE = { gen: 'spikes', v: 1, at: [16, 30], body: 'spike', tip: 'tip', plate: 'plate', shine: 'shine' };
test('spikes@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('spikes', 1), { cases: [
    { args: { ...SPIKE } },
    { args: { ...SPIKE, style: 'thorn', count: 5, length: 22, base: false, out: [0, 0.62, 1], over: [0, 0, 2] }, ctx: frame(2, 6) },
    { args: { ...SPIKE, style: 'crystal', count: 3, length: 12, out: [0], odd: [0, 2], even: [0, 0] }, ctx: frame(1, 4) },
    { args: { ...SPIKE, layer: 'light', glint: [0, 0, 1] }, ctx: frame(2, 6) },
  ] });
});

test('spikes@1 sink by out and keep their tips in view; the light layer is only the glints', () => {
  const outFull = painted(run(SPIKE)), sunk = painted(run({ ...SPIKE, out: [0] })), bare = painted(run({ ...SPIKE, out: [0], base: false }));
  assert.ok(highest(sunk) > highest(outFull) + 5);
  assert.equal(lowest(outFull), 29);
  assert.ok(bare.size >= 8, 'retracted with no plate, the tips still show');
  assert.equal(run({ ...SPIKE, layer: 'light' }).length, 0, 'no glint where glint is 0');
  assert.ok(painted(run({ ...SPIKE, layer: 'light', glint: [1] })).size >= 8);
});

const SIGN = { gen: 'signpost', v: 1, at: [16, 46], wood: 'wood', moss: 'moss', chain: 'chain', markPaint: 'picture' };
test('signpost@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('signpost', 1), { cases: [
    { args: { ...SIGN } },
    { args: { ...SIGN, style: 'hanging', points: 'both', mark: 'skull', tall: 38, mossy: true, wear: 1, sway: [0, 0.13] }, ctx: frame(1, 6) },
    { args: { ...SIGN, style: 'board', points: 'left', mark: 'exclaim', tall: 22, wear: 0.55 } },
  ] });
});

test('signpost@1 stands on its post\'s foot and sways from it by its table', () => {
  const still = painted(run(SIGN)), swayed = painted(run({ ...SIGN, sway: [0, 0.13] }, frame(1, 6)));
  assert.equal(lowest(still), 45);
  assert.equal(lowest(swayed), 45);
  const right = (set) => Math.max(...[...set].map((k) => Number(k.split(',')[0])));
  assert.ok(right(swayed) > right(still), 'leans right');
});

const CHEST = { gen: 'chest', v: 1, at: [16, 30], wood: 'wood', metal: 'metal', inner: 'glow', gold: 'gold', gem: 'gem', ruby: 'ruby', shine: 'shine' };
const OPENED = { open: [0, 0, 0, 1.25, 0.88], inside: [0, 0, 1, 1, 2], beam: [0, 0, 0, 1.3, 1.15], hot: [0, 0, 0, 1, 0], phase: [0, 0.34, 0.68, 1.02, 1.36], flick: [0, 1, 0, 1, 0] };
test('chest@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('chest', 1), { cases: [
    { args: { ...CHEST } },
    { args: { ...CHEST, style: 'royal', size: 1, lid: 1, ...OPENED }, ctx: frame(4) },
    { args: { ...CHEST, style: 'iron', size: 0, lid: 0, lift: [0, 0, 3], wide: [0, 1, -1], tall: [0, -1, 1], inside: [0, 0, 1] }, ctx: frame(2) },
    { args: { ...CHEST, layer: 'light', glint: [-1, -1, -1, 0, 0.25, 0.5], lock: [0, 0, 0, 0, 0, 1] }, ctx: frame(5) },
    { args: { ...CHEST, layer: 'light', ...OPENED }, ctx: frame(3) },
  ] });
});

test('chest@1 opens by its tables: the lid stands up behind the box, treasure in a lit mouth, rays in the light layer', () => {
  const shut = painted(run(CHEST)), open = painted(run({ ...CHEST, ...OPENED }, frame(4))), empty = painted(run({ ...CHEST, open: [1], inside: [0] }));
  assert.equal(lowest(shut), 29);
  assert.ok(highest(open) < highest(shut), 'the open lid stands higher than the shut one');
  assert.notDeepEqual([...open].sort(), [...empty].sort(), 'treasure shows only while lit');
  assert.ok(painted(run({ ...CHEST, layer: 'light', ...OPENED }, frame(3))).size >= 6, 'rays and sparkles');
  assert.equal(run({ ...CHEST, layer: 'light' }).length, 0, 'no light on a shut chest with no glint');
});

const CHEST_TD = { ...CHEST, gen: 'chest.topdown' };
test('chest.topdown@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('chest.topdown', 1), { cases: [
    { args: { ...CHEST_TD } },
    { args: { ...CHEST_TD, style: 'royal', size: 1, lid: 1, ...OPENED }, ctx: frame(4) },
    { args: { ...CHEST_TD, style: 'iron', size: 0, lid: 0, open: [1], inside: [0] } },
    { args: { ...CHEST_TD, layer: 'light', ...OPENED }, ctx: frame(3) },
  ] });
});

test('chest.topdown@1 shows its lid\'s top face shut and its mouth open, standing on its foot', () => {
  const shut = painted(run(CHEST_TD)), open = painted(run({ ...CHEST_TD, ...OPENED }, frame(4)));
  assert.equal(lowest(shut), 29);
  assert.equal(lowest(open), 29);
  assert.notDeepEqual([...open].sort(), [...shut].sort());
});

const CACHE = { gen: 'cache', v: 1, at: [16, 30], body: 'body', accent: 'accent', inner: 'glow', shine: 'shine' };
const CACHE_OPEN = { apart: [0, 0, 0.25, 1.25, 0.8, 1.05], lift: [0, 0, 1, 0], wide: [0, 1, 0], inside: [0, 0, 1, 1, 2, 2], lamp: [1, 2, 2, 2, 1, 1], flare: [0, 1, 1, 1, 0],
  beam: [0, 0, 0, 1, 0.95, 0.85], hot: [0, 0, 0, 1, 0], phase: [0, 0.25, 0.5, 0.75, 1, 1.25], prize: [-1, -1, -1, -1, -1, 2] };
test('cache@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('cache', 1), { cases: [
    { args: { ...CACHE } },
    { args: { ...CACHE, style: 'pod', size: 1, lid: 1, stripes: 'two', ...CACHE_OPEN }, ctx: frame(5) },
    { args: { ...CACHE, style: 'locker', size: 0, lid: 0, stripes: 'none', apart: [1], inside: [0] } },
    { args: { ...CACHE, layer: 'light', ...CACHE_OPEN }, ctx: frame(5) },
  ] });
});

test('cache@1 slides its lid halves apart by its table; the beam and prize are light', () => {
  const shut = painted(run(CACHE)), apart = painted(run({ ...CACHE, apart: [1] }));
  const width = (set) => { const xs = [...set].map((k) => Number(k.split(',')[0])); return Math.max(...xs) - Math.min(...xs); };
  assert.ok(width(apart) > width(shut), 'the halves stand out over the sides');
  assert.ok(painted(run({ ...CACHE, layer: 'light', ...CACHE_OPEN }, frame(5))).size > 20, 'beam and prize');
  assert.ok(painted(run({ ...CACHE, layer: 'light', lamp: [0] })).size === 4, 'a dark lens is its 4 pixels');
});

const BLOCK = { gen: 'crumble.block', v: 1, at: [16, 30], body: 'block', edge: 'edge', shine: 'shine' };
test('crumble.block@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('crumble.block', 1), { cases: [
    { args: { ...BLOCK } },
    { args: { ...BLOCK, style: 'wood', wear: 1, pieces: 8, wobble: 2, shake: [0, 1, 2, 3] }, ctx: frame(3, 6) },
    { args: { ...BLOCK, style: 'ice', pieces: 4, crumble: [0, 0.5, 1] }, ctx: frame(1, 3) },
    { args: { ...BLOCK, style: 'cloud', rise: [0, 0.62], hop: [0, 1], crumbs: [1, 1] }, ctx: frame(1, 6) },
  ] });
});

test('crumble.block@1 crumbles to a row of crumbs on the ground line and grows back out of it', () => {
  const whole = painted(run(BLOCK)), crumbs = painted(run({ ...BLOCK, crumble: [1] })), half = painted(run({ ...BLOCK, rise: [0.5] }));
  assert.equal(lowest(whole), 29);
  assert.ok(crumbs.size >= 4 && crumbs.size < whole.size / 4, 'a few crumbs are left');
  assert.equal(lowest(crumbs), 29);
  assert.ok(highest(half) > highest(whole) + 8, 'half of it stands out of the ground');
});

const SUPPLY = { gen: 'supply.crate', v: 1, at: [16, 30], body: 'body', accent: 'accent', labelInk: 'label-ink', strap: 'strap' };
const BURST = { stage: [1, 2, 3, 3, 3, 3, 3, 3], fly: [0, 0, 0.0566, 0.2453, 0.434, 0.6226, 0.8113, 1], flat: [0.5, 0.5, 0.6, 0.25, 0.7, 0.5] };
test('supply.crate@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('supply.crate', 1), { cases: [
    { args: { ...SUPPLY } },
    { args: { ...SUPPLY, style: 'canister', size: 1, mark: 'skull', squash: [1, -1], shift: [1, -1] }, ctx: frame(1, 4) },
    { args: { ...SUPPLY, style: 'locker', size: 0, straps: false, mark: 'none', ...BURST }, ctx: frame(4) },
    { args: { ...SUPPLY, scraps: 10, ...BURST, layer: 'light' }, ctx: frame(3) },
  ] });
});

test('supply.crate@1 bursts into panels that come to rest round its floor plate; the scraps are light', () => {
  const whole = painted(run(SUPPLY)), cracked = painted(run({ ...SUPPLY, ...BURST }, frame(1))), done = painted(run({ ...SUPPLY, ...BURST }, frame(7)));
  assert.equal(lowest(whole), 29);
  assert.ok(cracked.size > 0 && done.size > 0);
  assert.ok(highest(done) > highest(whole), 'what is left is lower than the whole crate');
  assert.equal(run({ ...SUPPLY, layer: 'light' }).length, 0);
  assert.ok(painted(run({ ...SUPPLY, ...BURST, layer: 'light' }, frame(4))).size >= 3);
});

const WOOD_DOOR = { gen: 'door.wood', v: 1, at: [24, 62], wood: 'wood', metal: 'metal', stone: 'stone', hole: 'hole', shine: 'shine' };
test('door.wood@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('door.wood', 1), { cases: [
    { args: { ...WOOD_DOOR } },
    { args: { ...WOOD_DOOR, style: 'arched', width: 1, height: 1, window: true, lock: 'padlock', lockSize: 1.35, open: [1, 0.9, 0.58] }, ctx: frame(2, 6) },
    { args: { ...WOOD_DOOR, style: 'iron-bound', width: 0, height: 0, lock: 'bar', lockSize: 0.65, rattle: [1], flash: [1] } },
    { args: { ...WOOD_DOOR, lock: 'none', flash: [1] } },
  ] });
});

test('door.wood@1 swings its leaf away on the hinge and keeps a big padlock inside the frame', () => {
  const shut = painted(run(WOOD_DOOR));
  assert.equal(lowest(shut), 61);
  assert.notDeepEqual(run({ ...WOOD_DOOR, open: [0.08] }), run(WOOD_DOOR), 'the doorway shows dark where the leaf was (same outline, other paints)');
  const padlock = painted(run({ ...WOOD_DOOR, style: 'arched', height: 0.1, width: 0.44, lock: 'padlock', lockSize: 1.3 }));
  assert.ok(lowest(padlock) <= 61, 'nothing below the threshold');
});

const DUNGEON = { gen: 'door.dungeon', v: 1, at: [16, 46], leaf: 'leaf', metal: 'metal', stone: 'stone', inner: 'glow', hole: 'hole', inkTone: 'ink-tone', shine: 'shine' };
test('door.dungeon@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('door.dungeon', 1), { cases: [
    { args: { ...DUNGEON } },
    { args: { ...DUNGEON, style: 'iron', corner: 1, bars: true, raise: [0, 0.06, 0.34] }, ctx: frame(2, 6) },
    { args: { ...DUNGEON, style: 'stone', corner: 0, heave: [2], flash: [1] } },
    { args: { ...DUNGEON, layer: 'light', dust: [-1, 0, 0.5] }, ctx: frame(2, 6) },
    { args: { ...DUNGEON, layer: 'light', seal: [1] }, ctx: { t: 0.25, loop: true, frames: 8, frame: 2 } },
  ] });
});

test('door.dungeon@1 slides its leaf up into the wall; the rune seal and dust are light', () => {
  assert.equal(lowest(painted(run(DUNGEON))), 45);
  assert.notDeepEqual(run({ ...DUNGEON, raise: [1] }), run(DUNGEON), 'the doorway shows dark under the raised leaf');
  assert.equal(run({ ...DUNGEON, layer: 'light' }).length, 0);
  assert.ok(painted(run({ ...DUNGEON, layer: 'light', seal: [1] })).size > 30, 'the seal');
});

const BOULDER = { gen: 'boulder', v: 1, at: [24, 44], stone: 'stone', moss: 'moss', shine: 'shine' };
test('boulder@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('boulder', 1), { cases: [
    { args: { ...BOULDER } },
    { args: { ...BOULDER, shape: 'cluster', size: 1, wear: 1, pieces: 1, squash: [1, -1], shift: [1, -1] }, ctx: frame(1, 4) },
    { args: { ...BOULDER, shape: 'slab', size: 0, mossy: false, wear: 0, burst: [0, 0.2, 0.4] }, ctx: frame(2, 8) },
    { args: { ...BOULDER, layer: 'light', dust: [-1, 0, 0.5] }, ctx: frame(2, 8) },
  ] });
});

test('boulder@1 stands on its foot and breaks into inked wedges that end as rubble on the ground', () => {
  const whole = painted(run(BOULDER)), rubble = painted(run({ ...BOULDER, burst: [1] }));
  assert.equal(lowest(whole), 43);
  assert.ok(rubble.size > 20 && rubble.size < whole.size, 'rubble is left');
  assert.ok(run({ ...BOULDER, burst: [0] }).some((p) => Object.values(p.key).includes('ink')), 'each stone is inked on its own as it breaks');
});

const BARREL = { gen: 'fuel.barrel', v: 1, at: [16, 46], body: 'body', accent: 'accent', inner: 'glow', tape: 'tape', steel: 'steel', panel: 'panel', cream: 'cream', shine: 'shine' };
const BLAST = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => Math.min(1, Math.max(0, (f - 1.6) / 5.4)));
test('fuel.barrel@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('fuel.barrel', 1), { cases: [
    { args: { ...BARREL, lamp: [1] } },
    { args: { ...BARREL, style: 'tank', size: 1, wear: 1, lamp: [1], squash: [1, -1], shift: [1, -1], leak: [0, 2] }, ctx: frame(1, 4) },
    { args: { ...BARREL, style: 'cell', size: 0, bands: false, lamp: [1], leak: [64], grow: [0, 0, 0, 1], tint: [1, 0, 0, 1] }, ctx: frame(3) },
    { args: { ...BARREL, stage: [0, 1], grow: [2] }, ctx: frame(1) },
    { args: { ...BARREL, stage: [-1, -1, 2], blast: BLAST }, ctx: frame(4) },
    { args: { ...BARREL, layer: 'light', stage: [0, 1, 2], blast: BLAST, ball: [0, 1, 2, 3, 0] }, ctx: frame(3) },
    { args: { ...BARREL, layer: 'light', flare: [1], puddle: [2.4] } },
  ] });
});

test('fuel.barrel@1 stands on its foot, blows into a scorch ring with inked fragments, and its blast is light', () => {
  assert.equal(lowest(painted(run({ ...BARREL, lamp: [1] }))), 45);
  const blown = run({ ...BARREL, stage: [2], blast: [1] });
  assert.ok(painted(blown).size > 10, 'scorch and fragments are left');
  assert.ok(blown.some((p) => Object.values(p.key).includes('ink')), 'the fragments are inked by themselves');
  assert.deepEqual(run({ ...BARREL, stage: [-1] }), [], 'stage below 0 draws nothing');
  assert.ok(painted(run({ ...BARREL, layer: 'light', stage: [2], blast: [0.26], ball: [3] })).size > 10, 'ball, ring and sparks');
});

// ---- cost (review round 1, issue 4) ---------------------------------------------------------------------------------
// docs/data-sprites.md 3.4 rule 2: the summed cost bounds the work before anything draws. Each M3 generator draws on a
// fixed grid, so its cost is that grid's stamps plus the shape tests it makes there (engine/gen/pixels.js workCost), as
// M2's prize items are charged (portCost); boulder@1 also pays for its break by its pieces and size when its burst table
// breaks it. Allowance as gen-b8-safety and gen-b12-safety (0.1 ms a unit of cost), with a smaller fixed part, so a
// call whose cost is a flat 1 to 4 (the review's boulder: 9 to 17 ms at cost 4) fails.
const M3_GENS = ['spring.pad', 'spikes', 'signpost', 'chest', 'chest.topdown', 'cache', 'crumble.block', 'supply.crate', 'door.wood', 'door.dungeon', 'boulder', 'fuel.barrel'];
const msFor = (cost) => 4 + cost * 0.1;
function quickest(fn) {
  fn();
  let best = Infinity, out;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); out = fn(); best = Math.min(best, performance.now() - t0); }
  return [out, best];
}
/** Calls at hostile arguments: counts and lengths at their top, shares at 1 and 0, each table alone at values from -64 to 64, both layers. */
function hostileCalls(id) {
  const e = registry.generator(id, 1), out = [];
  const tables = Object.entries(e.args).filter(([, t]) => t.type === 'profile').map(([k]) => k);
  for (const hi of [true, false]) {
    const a = { gen: id, v: 1 };
    for (const [k, t] of Object.entries(e.args)) {
      if (t.type === 'paint') a[k] = 'p';
      else if (t.type === 'share') a[k] = hi ? 1 : 0;
      else if (t.type === 'count' || t.type === 'px') a[k] = hi ? t.hi : t.lo;
    }
    for (const layer of e.args.layer ? ['body', 'light'] : [null]) {
      for (const k of tables) for (const v of [-64, -1, 0, 0.5, 1, 2, 3, 64]) out.push({ ...a, ...(layer ? { layer } : {}), [k]: [v] });
    }
  }
  return out;
}

test('every M3 generator is charged for its work: at hostile arguments each call runs within its cost', () => {
  for (const id of M3_GENS) {
    let worst = { ms: 0 };
    for (const call of hostileCalls(id)) {
      const c = registry.checkCall(call);
      if (!c.ok) continue;
      const [r, ms] = quickest(() => registry.runGenerator(call, { t: 0.5, frame: 0, frames: 8, loop: false, size: [64, 64] }));
      assert.ok(r.ok || /stamp pixels/.test(r.errors.join(' ')), `${id}: ${r.errors?.join('; ')}`);
      if (ms - msFor(c.cost) > worst.ms - msFor(worst.cost ?? 0)) worst = { ms, cost: c.cost, call };
    }
    // a loaded machine can stall any one run: the call nearest its bound is timed again (each of three timings the mean of four runs, the quickest kept)
    if (worst.call) worst.ms = Math.min(worst.ms, quickest(() => { for (let i = 0; i < 4; i++) registry.runGenerator(worst.call, { t: 0.5, frame: 0, frames: 8, loop: false, size: [64, 64] }); })[1] / 4);
    assert.ok(worst.ms <= msFor(worst.cost ?? 0), `${id}: ${worst.ms.toFixed(1)} ms for cost ${worst.cost} (allowed ${msFor(worst.cost ?? 0).toFixed(1)}) at ${JSON.stringify(worst.call)}`);
  }
});

test('boulder@1 pays for its break: more than whole, and more with more pieces and a bigger stone', () => {
  const cost = (x) => registry.checkCall({ ...BOULDER, ...x }).cost;
  assert.ok(cost({ burst: [0] }) > 2 * cost({}), 'a break costs more than a whole boulder');
  assert.ok(cost({ burst: [-1, -1, 0.5] }) === cost({ burst: [0] }), 'any frame of the table that breaks it is charged');
  assert.ok(cost({ burst: [0], pieces: 1 }) > cost({ burst: [0], pieces: 0 }));
  assert.ok(cost({ burst: [0], size: 1 }) > cost({ burst: [0], size: 0 }));
});

test('the review\'s hostile boulder definitions are refused for their cost before anything draws, quickly', async () => {
  const { validateSprite } = await import('../../catalog/sprite-schema.js');
  const fs = await import('node:fs');
  const d = JSON.parse(fs.readFileSync(new URL('../../sprites/boulder.json', import.meta.url), 'utf8'));
  const call = { ...d.body.pictures.draw[0], burst: [0] };
  delete call.clip;
  for (const n of [8, 64]) {
    const h = structuredClone(d);
    h.id = 'hostile-boulder';
    h.body.pictures.draw = Array.from({ length: n }, (_, i) => ({ ...call, id: `b${i}`, at: [24 + (i % 3), 44] }));
    h.clips = { idle: { frames: 4, fps: 8 } };
    const t0 = performance.now(), v = validateSprite(h), ms = performance.now() - t0;
    assert.ok(!v.ok, `${n} breaking boulders are refused`);
    assert.match(v.errors.join(' '), /budget/, `${n}: refused for the budget`);
    assert.ok(ms < 1500, `${n}: refused in ${ms.toFixed(0)} ms`);
  }
  // the library file itself stays well inside the budget
  const ok = validateSprite(d);
  assert.ok(ok.ok, ok.errors?.join('; '));
  assert.ok(ok.cost.expanded <= ok.cost.budget, `${ok.cost.expanded} of ${ok.cost.budget}`);
});
