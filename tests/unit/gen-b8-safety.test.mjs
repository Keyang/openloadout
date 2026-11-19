// Safety of B8's pixel generators (docs/data-sprites.md 3.4 rule 2: "each generator's cost is summed per frame and a
// definition over the budget is refused, so nothing can hang the page, and no worker or time limit is needed").
// The B8 review found three holes, each pinned here with the reviewer's own hostile calls:
//   1. icon.paint@1 cost 240 whatever it scanned: one 64-point polygon at scale 4 and zoom 4 took 600 ms;
//   2. icon.fit@1 cost a fixed 9 and never charged its draw list, which it draws six times (60 heavy bodies: 18 s);
//   3. icon.line@1 passed the check and then failed at run with 11,328 stamp pixels (the frame holds 8,192).
// Now: the icon pen draws in a box at most PEN_ROOM pixels square round its centre (so one call never holds more stamp
// pixels than a frame may), a call's cost charges the shape tests it can make (WORK_PER_COST of them to one unit of
// cost), and icon.fit charges every pass over every item of its draw list. So a call's run time is bounded by its cost.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkCall, runGenerator, expandList, GEN_LIMITS } from '../../engine/gen/index.js';
import { stampPixels, SHAPE_CAPS } from '../../engine/gen/args.js';
import { PEN_ROOM, FIT_PASSES } from '../../engine/gen/icon.js';
import { WORK_PER_COST } from '../../engine/gen/pixels.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';

const FIX = new URL('../fixtures/v2/pictures/', import.meta.url);
const fixture = (id) => JSON.parse(fs.readFileSync(new URL(`${id}.json`, FIX), 'utf8'));
const BIG = { size: [640, 360] };
const ring = (n, r, cx = 0, cy = 0, paint = 'a') => ({ kind: 'poly', points: Array.from({ length: n }, (_, i) => [+(cx + r * Math.cos((i * 2 * Math.PI) / n) * (i % 2 ? 0.3 : 1)).toFixed(2), +(cy + r * Math.sin((i * 2 * Math.PI) / n) * (i % 2 ? 0.3 : 1)).toFixed(2)]), paint });
const timed = (fn) => { const t0 = performance.now(); const r = fn(); return [r, performance.now() - t0]; };
// Milliseconds a unit of cost may take, with a wide margin for a loaded machine: measured at most about 0.02 ms here.
const MS_PER_COST = 0.1;
const msFor = (cost) => 30 + cost * MS_PER_COST;

// The review's hostile calls (scratchpad review-B8/hostile*.mjs)
const HEAVY_PAINT = { gen: 'icon.paint', v: 1, shapes: [ring(64, 30)], within: [{ kind: 'ellipse', at: [0, 0], r: [1, 1], paint: 'a' }], paint: 'a', scale: 4, zoom: 4, centre: [320, 180] };
const MANY_POLYS = (N) => { const s = Array.from({ length: N }, (_, i) => ring(64, 30, (i % 8) * 4 - 14, Math.floor(i / 8) * 4 - 14)); return { gen: 'icon.paint', v: 1, shapes: s, minus: s.slice(0, Math.min(N, 32)), within: s.slice(0, Math.min(N, 32)), paint: 'a', scale: 4, zoom: 4, centre: [320, 180] }; };
const FIT_OF = (K) => { const s = Array.from({ length: 16 }, (_, i) => ring(64, 30, (i % 4) * 4 - 8, Math.floor(i / 4) * 4 - 8)); return { gen: 'icon.fit', v: 1, draw: Array.from({ length: K }, () => ({ gen: 'icon.paint', v: 1, shapes: s, minus: s, paint: 'a' })), span: [32, 32], size: 1 }; };
const ZIGZAG = { gen: 'icon.line', v: 1, path: Array.from({ length: 64 }, (_, i) => (i % 4 < 2 ? -32 : 32)), paint: 'a', scale: 4, zoom: 4, centre: [320, 180] };

test('the cost constants are what the design budget needs: whole numbers, the pen box under a frame\'s stamp pixels', () => {
  assert.ok(Number.isInteger(WORK_PER_COST) && WORK_PER_COST > 0);
  assert.ok(Number.isInteger(PEN_ROOM) && PEN_ROOM * PEN_ROOM <= SHAPE_CAPS.stampPixels, 'one icon call can never hold more stamp pixels than a frame may');
  assert.equal(FIT_PASSES, 6);
});

test('icon.paint@1 is charged for the shape tests it makes: the review\'s 600 ms call now costs what it does and runs in its cost', () => {
  const c = checkCall(HEAVY_PAINT);
  assert.ok(c.cost > 240, `charged more than the old flat 240 (got ${c.cost})`);
  if (c.ok) {
    const [r, ms] = timed(() => runGenerator(HEAVY_PAINT, BIG));
    assert.ok(r.ok, r.errors.join('; '));
    assert.ok(ms <= msFor(c.cost), `${ms.toFixed(1)} ms for cost ${c.cost}`);
  }
  // 64 bodies of 64 points cut by 32 and kept inside 32 more: refused before anything draws
  const many = checkCall(MANY_POLYS(64));
  assert.equal(many.ok, false);
  assert.match(many.errors.join(' '), /over the budget/);
  // the cost grows with the polygons it tests, and with the room the pen has
  assert.ok(checkCall(MANY_POLYS(8)).cost < checkCall(MANY_POLYS(32)).cost);
  assert.ok(checkCall({ ...HEAVY_PAINT, scale: 0.5, zoom: 1 }).cost < c.cost);
});

test('icon.fit@1 charges every pass over every item it draws: wrapping 60 heavy bodies is refused, not run for 18 s', () => {
  const costs = [1, 2, 4, 16].map((K) => checkCall(FIT_OF(K)).cost);
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1], `cost grows with the items (${costs.join(', ')})`);
  assert.ok(costs[3] >= 12 * costs[0], `about linear in the items (${costs.join(', ')})`);
  // one pass over one heavy body already costs more than drawing that body once at the fit's room
  const inner = checkCall({ ...FIT_OF(1).draw[0], scale: 0.4 });
  assert.ok(costs[0] >= FIT_PASSES * inner.cost * 0.5, `${costs[0]} against ${FIT_PASSES} x ${inner.cost}`);
  for (const K of [1, 16, 60]) {
    const c = checkCall(FIT_OF(K));
    assert.equal(c.ok, false, `${K} heavy bodies`);
    assert.match(c.errors.join(' '), /over the budget/);
  }
  // what is accepted runs in its cost, in a small frame and in the biggest
  const light = { ...FIT_OF(1), draw: [{ ...FIT_OF(1).draw[0], shapes: FIT_OF(1).draw[0].shapes.slice(0, 2), minus: FIT_OF(1).draw[0].shapes.slice(0, 1) }] };
  const c4 = checkCall(light);
  assert.ok(c4.ok, c4.errors.join('; '));
  for (const ctx of [{ size: [32, 32] }, BIG]) {
    const [r, ms] = timed(() => runGenerator(light, ctx));
    assert.ok(r.ok, r.errors.join('; '));
    assert.ok(ms <= msFor(c4.cost), `${ms.toFixed(1)} ms for cost ${c4.cost} at ${ctx.size}`);
  }
});

test('a call that passes the check never fails at run for holding too many stamp pixels: the review\'s zig-zag', () => {
  const c = checkCall(ZIGZAG);
  assert.ok(c.ok, c.errors.join('; '));
  const r = runGenerator(ZIGZAG, BIG);
  assert.ok(r.ok, r.errors.join('; '));
  assert.ok(stampPixels(r.primitives) <= PEN_ROOM * PEN_ROOM);
  for (const call of [HEAVY_PAINT, { ...HEAVY_PAINT, within: [] }, { ...HEAVY_PAINT, shapes: [{ kind: 'rect', at: [-32, -32], size: [64, 64] }], within: [] }, FIT_OF(1), { ...FIT_OF(1), span: [32, 32], draw: [{ gen: 'icon.paint', v: 1, shapes: [{ kind: 'rect', at: [-32, -32], size: [64, 64] }], paint: 'a', zoom: 4 }] }]) {
    const k = checkCall(call);
    if (!k.ok) continue;
    const out = runGenerator(call, BIG);
    assert.ok(out.ok, `${call.gen}: ${out.errors.join('; ')}`);
    assert.ok(stampPixels(out.primitives) <= SHAPE_CAPS.stampPixels, `${call.gen}: ${stampPixels(out.primitives)} stamp pixels`);
  }
});

test('every B8 pixel generator at its biggest runs within its cost', () => {
  const calls = [
    HEAVY_PAINT, ZIGZAG, FIT_OF(1),
    { gen: 'token', v: 1, at: [320, 180], size: 31, thick: 8, scale: 2, squash: 0.5, emblem: 'heart', metal: 'a', field: 'a', gleam: 'a', shine: 'a' },
    { gen: 'container', v: 1, style: 'barrel', size: 23, grow: 2, lean: 89, wood: 'a', metal: 'a', mark: 'skull' },
    { gen: 'chunks', v: 1, at: [320, 100], amount: 0.5, count: 24, size: 32, thick: 4, dist: 64, rise: 64, floor: 350, paint: 'a', ink: true },
  ];
  for (const call of calls) {
    const c = checkCall(call);
    if (!c.ok) continue;
    runGenerator(call, BIG);
    const [r, ms] = timed(() => runGenerator(call, BIG));
    assert.ok(r.ok, `${call.gen}: ${r.errors.join('; ')}`);
    assert.ok(ms <= msFor(c.cost), `${call.gen}: ${ms.toFixed(1)} ms for cost ${c.cost}`);
  }
});

test('a frame of calls each under the budget is refused when together they are over it, and none of it hangs', () => {
  const list = Array.from({ length: 64 }, () => HEAVY_PAINT);
  const [x, ms] = timed(() => expandList(list, BIG));
  assert.equal(x.ok, false);
  // each call is bounded by its cost; expandList runs them all before it adds the costs up (engine/gen/registry.js, B2)
  assert.ok(ms <= 64 * msFor(checkCall(HEAVY_PAINT).cost), `${ms.toFixed(0)} ms`);
});

test('a sprite cannot smuggle work past the frame budget: the review\'s heavy coin and heavy icon set', () => {
  // review-B8/hostile5.mjs: a 640 x 360 coin with 15 heavy icon bodies added to its draw list
  const coin = fixture('coin');
  coin.size = [640, 360]; coin.pivot = [320, 350];
  const heavy = { gen: 'icon.paint', v: 1, shapes: [ring(24, 30, 0, 0, 'metal')], within: [{ kind: 'ellipse', at: [0, 0], r: [0.3, 0.3], paint: 'metal' }], paint: 'metal', scale: 4, zoom: 4, centre: [320, 180] };
  coin.body.pictures.draw = [...coin.body.pictures.draw, ...Array.from({ length: 15 }, () => heavy)];
  const [made, ms] = timed(() => { try { return dataSprite(coin); } catch (e) { return e; } });
  assert.ok(ms < 3000, `dataSprite took ${ms.toFixed(0)} ms (was 7.1 s)`);
  if (!(made instanceof Error)) {
    const [, f] = timed(() => { try { renderFrame(made, 'spin', 0, defaultParams(made)); } catch { /* refused while drawing: fine, it was quick */ } });
    assert.ok(f < 1000, `one frame took ${f.toFixed(0)} ms (was 3.5 s)`);
  }
  // review-B8/hostile7.mjs: icons-food with 8 heavy bodies in the apple: the fit charges them six times each
  const icons = fixture('icons-food');
  icons.size = [640, 360]; icons.pivot = [320, 350];
  const slot = icons.palette[0].id;
  icons.body.pictures.pictures.apple.draw = Array.from({ length: 8 }, () => ({ gen: 'icon.paint', v: 1, shapes: [ring(24, 30, 0, 0, slot)], minus: Array.from({ length: 8 }, () => ring(24, 1, 0, 0, slot)), paint: slot }));
  const [made2, ms2] = timed(() => { try { return dataSprite(icons); } catch (e) { return e; } });
  assert.ok(ms2 < 3000, `dataSprite took ${ms2.toFixed(0)} ms`);
  if (!(made2 instanceof Error)) {
    const [, f] = timed(() => { try { renderFrame(made2, 'apple', 0, defaultParams(made2)); } catch { /* refused */ } });
    assert.ok(f < 1000, `one icon frame took ${f.toFixed(0)} ms (was 2.1 s)`);
  }
});

test('the three fixtures stay well inside the frame budget with the new charges', () => {
  for (const id of ['coin', 'crate', 'icons-food']) assert.ok(dataSprite(fixture(id)), id);
  // each icon of the set, fitted as the pictures layout fits it, costs at most a third of a frame
  const icons = fixture('icons-food');
  for (const [name, p] of Object.entries(icons.body.pictures.pictures)) {
    const c = checkCall({ gen: 'icon.fit', v: 1, turn: p.angle ?? 0, draw: p.draw });
    assert.ok(c.ok && c.cost <= GEN_LIMITS.primitives / 3, `${name}: cost ${c.cost}`);
  }
  for (const id of ['coin', 'crate']) for (const x of fixture(id).body.pictures.draw.filter((q) => q.gen)) {
    const c = checkCall(x);
    assert.ok(c.ok && c.cost <= 100, `${id} ${x.gen}: cost ${c.cost}`);
  }
});
