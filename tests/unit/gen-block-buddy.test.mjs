// block.buddy@1 (engine/gen/block-buddy.js): the Gridline kit's block buddy, four joined cells with eyes, cheeks and
// stub feet, in its four acts (bundles/specs/kit-puzzle-gridline.md, `grid-buddy`). Pinned by the goldens harness
// (tests/helpers/gen-harness.mjs); the tests after it hold what the specification's "Fit" asks of the body.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-block-buddy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { BUDDY_ACTS, BUDDY_SHAPES, BUDDY_EYES } from '../../engine/gen/block-buddy.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const PAINTS = { paint: 'body', accent: 'accent', shine: 'shine', drop: 'drop', spark: 'spark' };

test('block.buddy@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('block.buddy', 1), { cases: [
    { args: { at: [24, 42], ...PAINTS } },
    { args: { at: [24, 42], act: 'cheer', shape: 'zig', eyes: 'dots', size: 1, build: 1, bounce: 1, ...PAINTS }, ctx: { t: 4 / 7, frames: 8, frame: 4, size: [48, 48] } },
    { args: { at: [0, 0], act: 'worry', shape: 'ell', eyes: 'visor', size: 0, build: 0, ...PAINTS }, ctx: { t: 0.375, loop: true, frames: 8, frame: 3, size: [48, 48] } },
    { args: { at: [24, 42], act: 'slump', shape: 'line', feet: false, ...PAINTS }, ctx: { t: 1, frames: 8, frame: 7, size: [48, 48] } },
    { args: { at: [24, 42], act: 'idle', eyes: 'round', bounce: 1, ...PAINTS }, ctx: { t: 0.625, loop: true, frames: 8, frame: 5, size: [48, 48] } } ] });
});

/** A call's stamps as a Map "x,y" -> paint (as text). */
function pixels(args, ctx) {
  const r = registry.runGenerator({ gen: 'block.buddy', v: 1, at: [24, 42], ...PAINTS, ...args }, { size: [48, 48], frames: 8, ...ctx });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
  }
  return out;
}
const box = (px) => {
  let x0 = 99, y0 = 99, x1 = -99, y1 = -99;
  for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
const frames = (act) => Array.from({ length: 8 }, (_, f) => ({ frame: f, loop: act === 'idle' || act === 'worry', t: act === 'idle' || act === 'worry' ? f / 8 : f / 7 }));

test('the acts, bodies and eyes are the specification\'s', () => {
  assert.deepEqual([...BUDDY_ACTS], ['idle', 'cheer', 'worry', 'slump']);
  assert.deepEqual([...BUDDY_SHAPES], ['square', 'line', 'zig', 'ell']);
  assert.deepEqual([...BUDDY_EYES], ['dots', 'round', 'visor']);
});

test('no body touches the edge of a 48 x 48 frame, at any size, build, shape or frame of any act', () => {
  for (const act of BUDDY_ACTS) for (const shape of BUDDY_SHAPES) for (const size of [0, 1]) for (const build of [0, 1]) for (const feet of [true, false]) for (const bounce of [0, 1]) for (const ctx of frames(act)) {
    const b = box(pixels({ act, shape, size, build, feet, bounce }, ctx));
    const where = `${act} ${shape} size ${size} build ${build} feet ${feet} bounce ${bounce} frame ${ctx.frame}`;
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 46 && b.y1 <= 41, `${where}: drawn from (${b.x0}, ${b.y0}) to (${b.x1}, ${b.y1})`);
  }
});

test('it stands on the row above its anchor in idle, with or without feet', () => {
  for (const shape of BUDDY_SHAPES) for (const feet of [true, false]) for (const ctx of frames('idle')) {
    assert.equal(box(pixels({ shape, feet }, ctx)).y1, 41, `${shape} feet ${feet} frame ${ctx.frame}`);
  }
});

test('idle breathes and blinks: frames differ, and the eye whites are gone on frames 5 and 6', () => {
  const f = frames('idle').map((ctx) => pixels({}, ctx));
  const whites = (px) => [...px.values()].filter((v) => v === '"shine"').length;
  assert.ok(whites(f[0]) > 0 && whites(f[4]) > 0);
  assert.equal(whites(f[5]), 0); assert.equal(whites(f[6]), 0);
  assert.notDeepEqual([...f[0]], [...f[4]]);
});

test('cheer hops at least 4 px and shows its pluses; worry shows the drop; slump ends with no feet showing', () => {
  const top = (act, frame, more = {}) => box(pixels({ act, ...more }, frames(act)[frame]));
  const cheer = pixels({ act: 'cheer' }, frames('cheer')[4]);
  assert.ok([...cheer.values()].some((v) => v === '"spark"'), 'pluses at the top of the hop');
  let lowest = 0;
  for (const [k, v] of cheer) if (v === '"accent"') lowest = Math.max(lowest, Number(k.split(',')[1]));
  assert.ok(lowest <= 41 - 4, `the feet are off the ground at the top (their last row is ${lowest})`);
  assert.ok([...pixels({ act: 'worry' }, frames('worry')[2]).values()].some((v) => v === '"drop"'));
  const end = pixels({ act: 'slump' }, frames('slump')[7]);
  assert.ok(![...end.values()].some((v) => v === '"accent"' ) || [...end.values()].filter((v) => v === '"accent"').length <= 8, 'only the cheeks are left of the accent colour');
  assert.equal(top('slump', 7).y1, 41);
});

test('every control makes a visible change at rest', () => {
  const base = pixels({}, frames('idle')[0]);
  const differ = (b) => { let n = 0; for (const k of new Set([...base.keys(), ...b.keys()])) if (base.get(k) !== b.get(k)) n++; return n; };
  for (const more of [{ size: 0 }, { size: 1 }, { build: 0 }, { build: 1 }, { shape: 'line' }, { shape: 'zig' }, { shape: 'ell' }, { eyes: 'dots' }, { eyes: 'visor' }, { feet: false }]) {
    assert.ok(differ(pixels(more, frames('idle')[0])) >= 8, `${JSON.stringify(more)} changes ${differ(pixels(more, frames('idle')[0]))} pixels`);
  }
});
