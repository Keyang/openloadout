// Framework additions made with batch P10 (platformer platforms and hazards: moving platform,
// crumbling block, spring pad, spike trap, saw blade):
//   engine/mech.js      toothedIn     shape test for a toothed wheel: a gear, a cog, a saw blade
//   engine/mech.js      coil          a coil spring seen from the side, between two end points
//   engine/mech.js      chain         a chain of alternating links between two points
//   engine/breaking.js  fragments     the drawn pixels of a Surface split into chunks
//   engine/breaking.js  drawFragment  one of those chunks, moved, shrunk or cut loose
//   engine/breaking.js  crumble       a drawn Surface falling apart into a row of crumbs on a floor line
//   engine/breaking.js  rise          a drawn Surface rising out of a floor line, or sinking into it
//   engine/shapes.js    spikeIn       shape test for a tapering spike: a floor spike, fang, horn, thorn, crystal point
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { ramp, col } from '../../engine/color.js';
import { TAU } from '../../engine/motion.js';
import { toothedIn } from '../../engine/mech.js';
import { fragments, drawFragment, crumble, rise } from '../../engine/breaking.js';
import { spikeIn } from '../../engine/shapes.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const block = () => new Surface(32, 32).rect(2, 4, 28, 26, ramp('#8f97a8'));
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

// ---- toothedIn ------------------------------------------------------------------

test('toothedIn: the hub is inside, beyond the tips is outside, and there are as many teeth as asked for', () => {
  for (const profile of ['square', 'saw']) {
    for (const teeth of [6, 8, 12]) {
      const f = toothedIn(24, 24, 16, teeth, 4, 0, profile);
      assert.ok(f(24.5, 24.5), `${profile}: centre`);
      assert.ok(f(24 + 11, 24), `${profile}: inside the roots`);
      assert.ok(!f(24 + 16.6, 24) && !f(24, 24 - 16.6), `${profile}: beyond the tips`);
      // walk round the wheel half way up the teeth and count how often we step onto a tooth
      let rises = 0, was = f(24 + 14, 24);
      for (let i = 1; i <= 3600; i++) { const a = (i / 3600) * TAU; const now = f(24 + 14 * Math.cos(a), 24 + 14 * Math.sin(a)); if (now && !was) rises++; was = now; }
      assert.equal(rises, teeth, `${profile} with ${teeth} teeth`);
    }
  }
});

test('fragments: as many chunks as asked for, every drawn pixel in exactly one of them', () => {
  for (let pieces = 1; pieces <= 9; pieces++) {
    const src = block(), F = fragments(src, pieces, { seed: 2 });
    assert.equal(F.length, pieces, `${pieces} pieces`);
    const seen = new Set();
    for (const f of F) for (const c of f.cells) { const k = c.y * 32 + c.x; assert.ok(!seen.has(k)); seen.add(k); assert.equal(src.get(c.x, c.y), c.c); }
    assert.equal(seen.size, lit(src));
    for (const f of F) assert.ok(f.cells.length >= lit(src) / pieces / 4, `${pieces} pieces: no sliver (${f.cells.length} px)`);
  }
  assert.deepEqual(fragments(new Surface(8, 8), 4), []);
});

test('drawFragment: all chunks drawn in place give the source back; `cut` leaves a line between neighbours; `keep` shrinks but never to nothing', () => {
  const src = block(), F = fragments(src, 6, { seed: 1 });
  const whole = new Surface(32, 32);
  F.forEach((f) => drawFragment(whole, f));
  assert.ok(same(whole, src));
  const cut = new Surface(32, 32);
  F.forEach((f) => drawFragment(cut, f, 0, 0, { cut: true }));
  const gone = lit(src) - lit(cut);
  assert.ok(gone >= 30 && gone < lit(src) / 4, `${gone} px of cut lines`);
  for (const f of F) {
    const g = new Surface(32, 32);
    drawFragment(g, f, 0, 0, { keep: 0 });
    assert.ok(lit(g) >= 2 && lit(g) <= 6, `kept ${lit(g)} px`);
    const moved = new Surface(32, 32);
    drawFragment(moved, f, 1, -2);
    assert.equal(lit(moved), f.cells.length);
    assert.equal(moved.bounds().y0, f.y0 - 2);
  }
});

// ---- crumble --------------------------------------------------------------------

test('crumble: starts as the whole thing, never draws nothing, never falls through the floor', () => {
  for (const pieces of [4, 5, 6, 7, 8]) {
    const src = block();
    for (const t of ts) {
      const g = new Surface(32, 32);
      crumble(g, src, { t, pieces, seed: 5, floor: 29 });
      const b = g.bounds();
      assert.ok(b, `${pieces} pieces, t ${t}: something drawn`);
      assert.ok(lit(g) >= 2 * pieces, `${pieces} pieces, t ${t}: ${lit(g)} px`);
      assert.ok(b.y1 <= 29 && b.x0 >= 1 && b.x1 <= 30, `${pieces} pieces, t ${t}: inside`);
    }
    const first = new Surface(32, 32);
    crumble(first, src, { t: 0, pieces, seed: 5, floor: 29 });
    assert.ok(lit(first) > lit(src) * 0.75, 'frame 0 is the block, cracked through');
    assert.ok(lit(first) < lit(src), 'with cut lines');
  }
});

test('crumble: ends as a row of crumbs on the floor, one per chunk, spread across the width', () => {
  for (const pieces of [4, 6, 8]) {
    const g = new Surface(32, 32);
    crumble(g, block(), { t: 1, pieces, seed: 5, floor: 29 });
    const b = g.bounds();
    assert.equal(b.y1, 29, 'resting on the floor row');
    assert.ok(b.y0 >= 24, `crumbs are small (top row ${b.y0})`);
    assert.ok(b.x1 - b.x0 >= 18, `spread over ${b.x1 - b.x0 + 1} px`);
    // count the separate runs of pixels on the floor row
    let runs = 0;
    for (let x = 1; x < 32; x++) if (g.get(x, 29) && !g.get(x - 1, 29)) runs++;
    assert.ok(runs >= 4, `${pieces} pieces: ${runs} crumbs on the floor row`);
    assert.ok(lit(g) <= 12 * pieces);
  }
});

test('crumble: the pieces fall (the picture gets lower and smaller) and it is the same every time', () => {
  const at = (t) => { const g = new Surface(32, 32); crumble(g, block(), { t, pieces: 6, seed: 9, floor: 29 }); return g; };
  const top = ts.map((t) => at(t).bounds().y0);
  for (let i = 1; i < top.length; i++) assert.ok(top[i] >= top[i - 1] - 1, `top row ${top}`);
  assert.ok(top.at(-1) > top[0] + 15);
  assert.ok(lit(at(0.5)) < lit(at(0)));
  assert.ok(same(at(0.5), at(0.5)));
  assert.ok(!same(at(0.25), at(0.5)));
});

// ---- rise -----------------------------------------------------------------------

test('rise: nothing shown draws nothing, the full height gives the source back, and it grows from the floor line upward', () => {
  const src = block();                                      // rows 4..29
  const none = new Surface(32, 32);
  rise(none, src, { shown: 0, floor: 29 });
  assert.equal(lit(none), 0, 'shown 0 draws nothing');
  for (const shown of [26, 40]) {
    const all = new Surface(32, 32);
    rise(all, src, { shown, floor: 29 });
    assert.ok(same(all, src), `shown ${shown} gives the source back`);
  }
  const byDefault = new Surface(32, 32);
  rise(byDefault, src);
  assert.ok(same(byDefault, src), 'no options: all of it, on its own lowest row');
  let before = 0;
  for (let shown = 1; shown <= 26; shown++) {
    const g = new Surface(32, 32);
    rise(g, src, { shown, floor: 29 });
    const b = g.bounds();
    assert.deepEqual([b.y0, b.y1, b.x0, b.x1], [30 - shown, 29, 2, 29], `shown ${shown}`);
    // what shows is the TOP of the thing: its first row is the source's first row
    for (let x = 0; x < 32; x++) assert.equal(g.get(x, b.y0), src.get(x, 4));
    assert.ok(lit(g) > before); before = lit(g);
  }
});

test('rise: nothing is ever drawn below the floor, whatever is shown, wherever the floor is, with or without a hop', () => {
  const src = block();
  for (const floor of [29, 24, 31]) for (const hop of [0, 1, 3, -2]) for (let shown = 0; shown <= 30; shown++) {
    const g = new Surface(32, 32);
    rise(g, src, { shown, floor, hop });
    const b = g.bounds();
    if (b) assert.ok(b.y1 <= floor, `floor ${floor}, hop ${hop}, shown ${shown}: lowest row ${b.y1}`);
    if (shown === 0) assert.equal(b, null, 'nothing shown, nothing drawn');
  }
  // a hop lifts it: one more row shows, and at full height it stands clear of the floor
  const g = new Surface(32, 32), h = new Surface(32, 32);
  rise(g, src, { shown: 10, floor: 29 }); rise(h, src, { shown: 10, floor: 29, hop: 1 });
  assert.equal(h.bounds().y0, g.bounds().y0 - 1);
  const up = new Surface(32, 32);
  rise(up, src, { shown: 26, floor: 29, hop: 1 });
  assert.deepEqual([up.bounds().y0, up.bounds().y1], [3, 28]);
  // the source is not changed, an empty source draws nothing, and what is already on g is kept
  assert.ok(same(src, block()));
  const kept = new Surface(32, 32).rect(0, 0, 3, 3, '#ffffff');
  rise(kept, new Surface(32, 32), { shown: 5 });
  assert.equal(lit(kept), 9);
});

// ---- spikeIn --------------------------------------------------------------------

test('spikeIn: a point one or two pixels wide at the tip, as wide as asked at the foot, and nothing outside its rows', () => {
  const rowOf = (f, y) => { const xs = []; for (let x = 0; x < 32; x++) if (f(x + 0.5, y + 0.5)) xs.push(x); return xs; };
  for (const [xc, tipPx] of [[16.5, 1], [16, 2]]) for (const half of [3, 4, 5.5]) {
    // a number and the same straight cone as a function, then a tusk that thickens early: its tip is blunter
    [half, (k) => 0.5 + (half - 0.5) * k, (k) => 0.5 + (half - 0.5) * k ** 0.6].forEach((prof, i) => {
      const f = spikeIn(xc, 6, 28, prof);
      if (i < 2) assert.equal(rowOf(f, 6).length, tipPx, `xc ${xc}: tip row`);
      else assert.ok(rowOf(f, 6).length <= tipPx + 2 && rowOf(f, 6).length >= tipPx, `xc ${xc}: tusk tip row`);
      assert.equal(rowOf(f, 5).length, 0, 'nothing above the tip');
      assert.equal(rowOf(f, 28).length, 0, 'nothing below the foot');
      const foot = rowOf(f, 27);
      assert.ok(Math.abs(foot.length - 2 * half) <= 1, `xc ${xc}, half ${half}: foot row is ${foot.length} px`);
      // it only ever gets wider on the way down, and every row is one unbroken run
      let last = 0;
      for (let y = 6; y < 28; y++) { const r = rowOf(f, y); assert.ok(r.length >= last, `row ${y}`); assert.equal(r.at(-1) - r[0] + 1, r.length); last = r.length; }
    });
  }
  // the shank carries on below the foot at exactly the foot's width
  const g = spikeIn(16, 6, 20, 4, 0, 5);
  assert.deepEqual(rowOf(g, 20), [12, 13, 14, 15, 16, 17, 18, 19]);
  assert.deepEqual(rowOf(g, 24), rowOf(g, 20));
  assert.equal(rowOf(g, 25).length, 0);
});

test('spikeIn: a shift moves the tip and leaves the foot where it was; it paints as one body through g.fill', () => {
  const rowOf = (f, y) => { const xs = []; for (let x = 0; x < 32; x++) if (f(x + 0.5, y + 0.5)) xs.push(x); return xs; };
  const straight = spikeIn(16, 6, 28, 4);
  for (const shift of [3, -3, (k) => 3 * (1 - k) ** 2, (k) => -4 * Math.max(0, 1 - k / 0.3)]) {
    const bent = spikeIn(16, 6, 28, 4, shift, 1);
    const way = Math.sign(typeof shift === 'number' ? shift : shift(0));
    const tip = rowOf(bent, 6), tip0 = rowOf(straight, 6);
    assert.ok(tip.length >= 1 && tip.length <= 2);
    assert.ok((tip[0] - tip0[0]) * way >= 2, `tip moved ${tip[0] - tip0[0]} px`);
    assert.deepEqual(rowOf(bent, 28), [12, 13, 14, 15, 16, 17, 18, 19], 'the foot stays put');
  }
  const g = new Surface(32, 32).fill(0, 0, 32, 32, spikeIn(16, 6, 28, 4, 3), ramp('#c2c9d6'), { shade: 1, light: 1 });
  const b = g.bounds();
  assert.deepEqual([b.y0, b.y1], [6, 27]);
  assert.ok(new Set(g.data).size >= 3, 'shaded by the fill like any other shape');
});
