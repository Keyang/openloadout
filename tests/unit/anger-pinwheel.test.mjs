// Framework addition made with sprite batch K24 fix round 5 (bundles/specs/core-sprites-3.md, emote-bubbles):
// engine/anger-pinwheel.js, the anger vein whose throb steps its strokes round the gap instead of swelling them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { angerPinwheelBody, drawAngerPinwheel } from '../../engine/anger-pinwheel.js';

const T = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8);
const SIZES = [10, 11, 12, 13, 14];
const COLOUR = '#3c6fd0';
function islands(g) {
  const W = g.w, H = g.h, seen = new Uint8Array(W * H);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!g.data[i] || seen[i]) continue;
    n++; seen[i] = 1;
    const st = [i];
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * W + X;
        if (X >= 0 && Y >= 0 && X < W && Y < H && g.data[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
  }
  return n;
}
const drawn = (s, t) => { const g = new Surface(40, 40); drawAngerPinwheel(g, 20, 32, s, { t, colour: COLOUR }); return g; };

test('anger pinwheel is four separate strokes on every frame', () => {
  for (const s of SIZES) for (const t of T) assert.equal(islands(drawn(s, t)), 4, `size ${s} t ${t}`);
});

test('no 2x2 block of the mark colour on any frame: every arm stays 1 px thick through the throb', () => {
  for (const s of SIZES) for (const t of T) {
    const b = angerPinwheelBody(s, { t });
    for (let y = 0; y < b.h - 1; y++) for (let x = 0; x < b.w - 1; x++) {
      assert.ok(!(b.at(x, y) && b.at(x + 1, y) && b.at(x, y + 1) && b.at(x + 1, y + 1)), `size ${s} t ${t} block at ${x},${y}`);
    }
  }
});

test('every stroke keeps two arms of 3 px or more from its bend and a bent end, on every frame', () => {
  for (const s of SIZES) for (const t of T) {
    const b = angerPinwheelBody(s, { t });
    // a bend: a pixel with one neighbour along x and one along y (4-neighbours), each arm then running straight
    let bends = 0;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      if (!b.at(x, y)) continue;
      const hx = [-1, 1].filter((d) => b.at(x + d, y)), vy = [-1, 1].filter((d) => b.at(x, y + d));
      if (hx.length !== 1 || vy.length !== 1) continue;
      let nx = 1; while (b.at(x + hx[0] * nx, y)) nx++;
      let ny = 1; while (b.at(x, y + vy[0] * ny)) ny++;
      if (nx >= 3 && ny >= 3) bends++;
    }
    assert.equal(bends, 4, `size ${s} t ${t}`);
  }
});

test('the strokes keep 3 px or more of body between them on every frame (1 px of background inside the ink)', () => {
  for (const s of SIZES) for (const t of T) {
    const b = angerPinwheelBody(s, { t }), quarter = (x, y) => (x < b.w / 2 ? 0 : 1) + (y < b.h / 2 ? 0 : 2);
    const px = [];
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.at(x, y)) px.push([x, y, quarter(x, y)]);
    for (const [x, y, k] of px) for (const [X, Y, K] of px) {
      if (K !== k) assert.ok(Math.max(Math.abs(X - x), Math.abs(Y - y)) >= 4, `size ${s} t ${t}: ${x},${y} and ${X},${Y}`);
    }
  }
});

test('the throb moves the strokes, keeps their reach, and the loop closes', () => {
  for (const s of SIZES) {
    const a = drawn(s, 0), b = drawn(s, 0.5), c = drawn(s, 1);
    assert.notDeepEqual(a.data, b.data, `size ${s} throbs`);
    assert.deepEqual(a.bounds(), b.bounds(), `size ${s} reach`);
    assert.deepEqual(a.data, c.data, `size ${s} loops`);
    const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
    const body = (t) => { const g = angerPinwheelBody(s, { t }); let n = 0; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) n += g.at(x, y); return n; };
    assert.equal(body(0), body(0.5), `size ${s}: no pixel added or lost`);
    assert.ok(count(b) > 0);
  }
});

test('the body stands with its bottom row on by, centred on cx; a colour is required', () => {
  const g = new Surface(40, 40), out = drawAngerPinwheel(g, 20, 30, 10, { colour: COLOUR });
  assert.equal(out.box.y + out.box.h - 1, 31);
  assert.equal(out.box.x + (out.box.w >> 1), 20);
  assert.throws(() => drawAngerPinwheel(g, 20, 30, 10, {}), /colour/);
});
