// Framework additions of batch R11 (cottage, inn): building pieces seen from the south in
// three-quarter view (engine/buildings.js), swatch lists kept to a brightness band
// (swatchesBetween in engine/palettes.js) and a layer cleaned of stray pixels (despeckle in engine/surface.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, despeckle } from '../../engine/surface.js';
import { col, ramp, brightness, INK } from '../../engine/color.js';
import { PALETTE, swatches, swatchesBetween } from '../../engine/palettes.js';

const P = PALETTE.hearthvale;
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const draw = (fn, w = 96, h = 96) => { const g = new Surface(w, h); fn(g); return g; };

test('swatchesBetween: palette colours first, all inside the brightness band, 4 to 8 of them', () => {
  const walls = swatchesBetween('hearthvale', ['stone', 'haze'], { lead: 'cream', min: 0.6 });
  const beams = swatchesBetween('hearthvale', ['wood', 'roof'], { lead: 'wood', max: 0.5 });
  assert.equal(walls[0], P.cream);
  assert.equal(beams[0], P.wood);
  for (const list of [walls, beams]) {
    assert.ok(list.length >= 4 && list.length <= 8, `${list.length} swatches`);
    assert.equal(new Set(list).size, list.length);
  }
  for (const c of walls) assert.ok(brightness(c) >= 0.6, `${c} is light enough`);
  for (const c of beams) assert.ok(brightness(c) <= 0.5 && brightness(c) >= 0.18, `${c} is dark enough and not an outline`);
  for (const c of walls) assert.ok(!beams.includes(c), 'two touching materials never share a swatch');
  // one material and no band is plain swatches()
  assert.deepEqual(swatchesBetween('hearthvale', 'roof', { lead: 'wheat' }), swatches('hearthvale', 'roof', { lead: 'wheat' }));
  assert.throws(() => swatchesBetween('hearthvale', ['stone'], { min: 0.99 }), /fewer than 3/);
  assert.throws(() => swatchesBetween('hearthvale', ['stone'], { lead: 'slate', min: 0.6 }), /outside/);
});

// ---- fix round 1: what cottage and inn both did by hand now lives in the framework ----

// the sizes of the groups of touching pixels (side by side or one above the other) on a Surface
function groups(g) {
  const seen = new Uint8Array(g.w * g.h), sizes = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (seen[y * g.w + x] || !g.get(x, y)) continue;
    let n = 0;
    const todo = [[x, y]];
    seen[y * g.w + x] = 1;
    while (todo.length) {
      const [a, b] = todo.pop();
      n++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const u = a + dx, v = b + dy;
        if (u < 0 || v < 0 || u >= g.w || v >= g.h || seen[v * g.w + u] || !g.get(u, v)) continue;
        seen[v * g.w + u] = 1;
        todo.push([u, v]);
      }
    }
    sizes.push(n);
  }
  return sizes;
}

test('despeckle: groups of touching pixels smaller than `min` are left out; the rest and the source are untouched', () => {
  const src = draw((g) => {
    g.dot(5, 5, P.cobble);                                   // 1 px
    g.rect(10, 5, 2, 1, P.cobble); g.dot(10, 6, P.cobble);   // 3 px in an L
    g.rect(20, 5, 2, 2, P.cobble);                           // 4 px
    g.rect(30, 5, 5, 5, P.wood);                             // 25 px
    g.dot(35, 10, P.cobble);                                 // touches the block only at a corner: on its own
  });
  const before = src.data.slice();
  const out = despeckle(src, 4);
  assert.deepEqual([...src.data], [...before], 'the source is not changed');
  assert.deepEqual(groups(out).sort((a, b) => a - b), [4, 25]);
  assert.equal(out.get(20, 5), col(P.cobble));
  assert.equal(out.get(32, 7), col(P.wood));
  assert.equal(out.get(35, 10), 0, 'a pixel that touches only at a corner is a speck');
  assert.ok(same(despeckle(src, 1), src), 'min 1 keeps everything');
  assert.deepEqual(groups(despeckle(src)).sort((a, b) => a - b), [4, 25], 'min is 4 when left out');
  assert.deepEqual(groups(despeckle(src, 5)), [25]);
});
