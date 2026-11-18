// Framework additions of batch F02 (tiles-shore, final pass: no grid in open water):
//   engine/ripples.js   rippleVersion: one version of a moving water surface as a tile fill, every streak kept inside
//                       the tile on every frame, so that versions join each other and a level mixes them by position.
//                       rippleEvenness: how even such a field is over a loop (to pick the arrangements by measuring)
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, fillVariant } from '../../engine/tiles.js';
import { col } from '../../engine/color.js';
import { rippleVersion, rippleEvenness } from '../../engine/ripples.js';

const DEEP = '#2c79c0', LIGHT = '#4fa8d8', TIP = '#f0ead8';
const FRAMES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
const marksOf = (f) => { const out = []; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (f(x, y) !== col(DEEP)) out.push([x, y]); return out; };

test('rippleVersion: repeats every 32 px, closes over one loop, and draws only its streaks', () => {
  for (const t of FRAMES) {
    const f = rippleVersion(DEEP, t, { light: LIGHT, count: 6, seed: 3 }), again = rippleVersion(DEEP, t + 1, { light: LIGHT, count: 6, seed: 3 });
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      assert.equal(f(x, y), f(x + TILE, y - TILE), `t ${t}: repeats at ${x},${y}`);
      assert.equal(f(x, y), again(x, y), `t ${t}: the loop closes at ${x},${y}`);
      assert.ok(f(x, y) === col(DEEP) || f(x, y) === col(LIGHT), `t ${t}: only the base and the light at ${x},${y}`);
    }
  }
  const bare = rippleVersion(DEEP, 0.3, { light: LIGHT, count: 0 });
  assert.equal(marksOf(bare).length, 0, 'no streaks asked for: the plain colour');
  // the same arguments, the same picture
  const a = rippleVersion(DEEP, 0.3, { light: LIGHT, seed: 9 }), b = rippleVersion(DEEP, 0.3, { light: LIGHT, seed: 9 });
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(a(x, y), b(x, y));
});

test('rippleVersion: every mark stays `margin` px inside the tile on every frame, whatever the settings', () => {
  for (const margin of [3, 5]) for (const seed of [0, 1, 2, 7, 42, 99]) for (const [count, length, stir] of [[4, 4, 1], [6, 7, 2], [8, 9, 4], [9, 12, 6]]) {
    for (const t of FRAMES) {
      const f = rippleVersion(DEEP, t, { light: LIGHT, tips: TIP, count, length, stir, seed, margin });
      for (const [x, y] of marksOf(f)) assert.ok(x >= margin && x < TILE - margin && y >= margin && y < TILE - margin, `seed ${seed}, count ${count}, t ${t}: a mark at ${x},${y} inside the outer ${margin} px`);
    }
  }
});

test('rippleVersion: versions share their four edge lines, so any of them joins any other and the fill itself', () => {
  const edges = (f) => [...Array(TILE).keys()].flatMap((i) => [f(i, 0), f(i, TILE - 1), f(0, i), f(TILE - 1, i)]);
  for (const t of FRAMES) {
    const plain = edges(rippleVersion(DEEP, t, { light: LIGHT, seed: 0 }));
    for (const seed of [1, 2, 3]) assert.deepEqual(edges(rippleVersion(DEEP, t, { light: LIGHT, seed })), plain);
  }
});

test('rippleVersion: another seed is another arrangement, and something shows and moves on every frame', () => {
  const key = (f) => marksOf(f).map(([x, y]) => `${x}:${y}`).join(' ');
  const seen = new Set();
  for (const seed of [0, 1, 2, 3, 4, 5]) seen.add(key(rippleVersion(DEEP, 0.25, { light: LIGHT, count: 6, seed })));
  assert.equal(seen.size, 6, 'six seeds, six pictures');
  for (const seed of [0, 1, 2]) {
    const frames = FRAMES.map((t) => key(rippleVersion(DEEP, t, { light: LIGHT, count: 5, seed })));
    for (const [i, k] of frames.entries()) assert.ok(k.length > 0, `seed ${seed}: frame ${i} shows a streak`);
    assert.equal(new Set(frames).size, FRAMES.length, `seed ${seed}: no two frames of the loop are the same`);
  }
  // no two streaks of one version lie on the same row, and their rows are spread down the whole tile
  for (const seed of [0, 1, 2, 3]) {
    const rows = new Set();
    for (const t of FRAMES) for (const [, y] of marksOf(rippleVersion(DEEP, t, { light: LIGHT, count: 6, seed, under: false }))) rows.add(y);
    assert.equal(rows.size, 6, `seed ${seed}: six streaks on six rows (${[...rows].join(', ')})`);
    assert.ok(Math.min(...rows) < 10 && Math.max(...rows) > 21, `seed ${seed}: rows from top to bottom (${[...rows].join(', ')})`);
  }
});

test('rippleVersion: tips mark the leading pixel of a full-grown streak, dark colours every third streak', () => {
  const f = rippleVersion(DEEP, 0.3, { light: LIGHT, count: 6, length: 8, tips: TIP, seed: 4 });
  let tips = 0;
  for (const [x, y] of marksOf(f)) if (f(x, y) === col(TIP)) { tips++; assert.equal(f(x - 1, y), col(LIGHT), 'a tip leads a streak'); assert.equal(f(x + 1, y), col(DEEP)); }
  assert.ok(tips > 0);
  const DARK = '#1f5e9c';
  const seen = new Set();
  for (const t of FRAMES) for (const [x, y] of marksOf(rippleVersion(DEEP, t, { light: LIGHT, dark: DARK, count: 6, seed: 4 }))) seen.add(rippleVersion(DEEP, t, { light: LIGHT, dark: DARK, count: 6, seed: 4 })(x, y));
  assert.deepEqual([...seen].sort(), [col(LIGHT), col(DARK)].sort());
});

test('rippleEvenness: counts the marked pixels of every frame of a loop; versions laid by the helper\'s rule differ from cell to cell', () => {
  const make = (seed) => (t) => rippleVersion(DEEP, t, { light: LIGHT, count: 6, seed });
  const one = rippleEvenness(make(1), { base: DEEP });
  assert.equal(one.lit.length, 8, 'eight frames by default');
  assert.ok(one.min > 0 && one.max >= one.min && one.mean > 0);
  assert.ok(one.spread >= 0 && one.spread === (one.max - one.min) / one.mean);
  // the numbers are the picture's: count by hand on one frame
  assert.equal(one.lit[2], marksOf(make(1)(0.25)).length);
  assert.equal(rippleEvenness(() => () => col(DEEP), { base: DEEP }).mean, 0, 'plain water: nothing lit');
  assert.equal(rippleEvenness(() => () => col(DEEP), { base: DEEP }).spread, 0);
  // frames: another count of frames
  assert.equal(rippleEvenness(make(1), { base: DEEP, frames: 4 }).lit.length, 4);
  // three versions laid out by the helper's own rule over a lake: never the same picture in every cell
  const versions = [1, 2, 3].map((s) => rippleVersion(DEEP, 0.25, { light: LIGHT, count: 6, seed: s }));
  const cells = new Set();
  for (let cy = 0; cy < 6; cy++) for (let cx = 0; cx < 10; cx++) cells.add(fillVariant(cx, cy, 3));
  assert.equal(cells.size, 3, 'a lake of 10 by 6 uses all three');
  assert.notDeepEqual(marksOf(versions[0]), marksOf(versions[1]));
});
