// Framework addition made with sprite batch K24 fix round 4 (bundles/specs/core-sprites-3.md, emote-bubbles):
// engine/anger-vein.js, an anger mark whose strokes keep their arms on every frame of the throb.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { angerVeinBody, drawAngerVein } from '../../engine/anger-vein.js';

const T = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8);
const SIZES = [10, 11, 12, 13, 14];
const q = (s) => Math.max(4, Math.min(6, Math.floor((s - 2) / 2)));
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
const drawn = (s, t) => { const g = new Surface(40, 40); drawAngerVein(g, 20, 32, s, { t, colour: '#3c6fd0' }); return g; };

test('anger vein is four separate strokes on every frame', () => {
  for (const s of SIZES) for (const t of T) assert.equal(islands(drawn(s, t)), 4, `size ${s} t ${t}`);
});

test('every stroke keeps both arms 3 px or longer on every frame, the throb included', () => {
  for (const s of SIZES) for (const t of T) {
    const b = angerVeinBody(s, { t }), k = q(s), B = 2 * k + 4;
    // each quarter's bend, on the pinwheel, and the two directions its arms run out along the gap
    const bends = [[k, k, [-1, 0], [0, -1]], [B + 1 - k, k, [0, -1], [1, 0]], [B + 1 - k, B + 1 - k, [1, 0], [0, 1]], [k, B + 1 - k, [0, 1], [-1, 0]]];
    for (const [bx, by, ...arms] of bends) {
      assert.equal(b.at(bx, by), 1, `size ${s} t ${t} bend ${bx},${by}`);
      for (const [dx, dy] of arms) {
        let n = 1;
        while (b.at(bx + dx * n, by + dy * n)) n++;
        assert.ok(n >= 3, `size ${s} t ${t} bend ${bx},${by} arm ${dx},${dy}: ${n} px`);
      }
    }
  }
});

test('the plus-shaped gap is 4 px of body on every frame: 2 px of background between the ink lines', () => {
  for (const s of SIZES) for (const t of T) {
    const b = angerVeinBody(s, { t }), k = q(s);
    for (let i = 0; i < b.w; i++) for (let j = k + 1; j <= k + 4; j++) {
      assert.equal(b.at(j, i), 0, `size ${s} t ${t} column ${j}`);
      assert.equal(b.at(i, j), 0, `size ${s} t ${t} row ${j}`);
    }
  }
});

test('one arm of every stroke ends bent away from the gap, not in line', () => {
  for (const s of SIZES) {
    const b = angerVeinBody(s), k = q(s);
    assert.equal(b.at(1, k - 1), 1, `size ${s}: the turned end`);
    assert.equal(b.at(1, k), 0, `size ${s}: not straight on`);
  }
});

test('the throb changes the strokes, keeps their reach, and the loop closes', () => {
  for (const s of SIZES) {
    const a = drawn(s, 0), b = drawn(s, 0.5), c = drawn(s, 1);
    assert.notDeepEqual(a.data, b.data, `size ${s} throbs`);
    assert.deepEqual(a.bounds(), b.bounds(), `size ${s} reach`);
    assert.deepEqual(a.data, c.data, `size ${s} loops`);
  }
});

test('the body stands with its bottom row on by, centred on cx, with no lone pixel of background inside', () => {
  const g = new Surface(40, 40), out = drawAngerVein(g, 20, 30, 10, { colour: '#3c6fd0' });
  assert.equal(out.box.y + out.box.h - 1, 31);
  assert.equal(out.box.x + (out.box.w >> 1), 20);
  assert.throws(() => drawAngerVein(g, 20, 30, 10, {}), /colour/);
});
