// Framework addition made with sprite batch K24 fix round 4 (bundles/specs/core-sprites-3.md, emote-bubbles):
// engine/puff-cloud.js, a small thought cloud whose outline is round bumps 2 px deep.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { bumpCloud, BUMP_TRAIL } from '../../engine/bump-cloud.js';
import { puffCloud } from '../../engine/puff-cloud.js';

const FACE = '#f0e6d0', FRAME = '#5a4a3a';
function cloud(w, h, opt = {}) {
  const g = new Surface(32, 32), x = 16 - (w >> 1), y = 30 - BUMP_TRAIL.rows - h + 1;
  const out = puffCloud(g, x, y, w, h, { face: FACE, frame: FRAME, trail: 'down-left', ...opt });
  return { g, out, x, y };
}
// how far in the outline lies at each step along an edge
function profile(g, x, y, w, h, side) {
  const n = side === 'top' || side === 'bottom' ? w : h, out = [];
  for (let i = 0; i < n; i++) {
    let d = 0;
    const hit = () => side === 'top' ? g.get(x + i, y + d) : side === 'bottom' ? g.get(x + i, y + h - 1 - d) : side === 'left' ? g.get(x + d, y + i) : g.get(x + w - 1 - d, y + i);
    while (d < 6 && !hit()) d++;
    out.push(d);
  }
  return out;
}
// runs of equal values: [value, length]
const runs = (p) => p.reduce((a, v) => (a.length && a.at(-1)[0] === v ? (a.at(-1)[1]++, a) : [...a, [v, 1]]), []);
// crowns: runs nearer the edge than both neighbours, with the deepest point on each side of them
function bumps(p) {
  const r = runs(p), out = [];
  for (let i = 0; i < r.length; i++) {
    const before = i > 0 ? r[i - 1][0] : Infinity, after = i + 1 < r.length ? r[i + 1][0] : Infinity;
    if (r[i][0] < before && r[i][0] < after) out.push({ at: i, value: r[i][0], width: r[i][1] });
  }
  return { r, out };
}

test('every bump is a round arc 2 px deep, crown 2 px or less, 3 or more along every edge, no straight run over 3 px', () => {
  for (const w of [23, 24, 25, 26, 27, 28]) {
    const { g, x, y } = cloud(w, 22);
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const p = profile(g, x, y, w, 22, side), { r, out } = bumps(p);
      assert.ok(out.length >= 3, `${w} ${side}: ${out.length} bumps`);
      for (const b of out) assert.ok(b.width <= 2, `${w} ${side}: crown ${b.width} px`);
      for (let k = 0; k + 1 < out.length; k++) {
        const between = r.slice(out[k].at + 1, out[k + 1].at).map(([v]) => v);
        assert.ok(Math.max(...between) - Math.max(out[k].value, out[k + 1].value) >= 2, `${w} ${side}: cusp ${k} depth`);
      }
      for (const [, n] of r) assert.ok(n <= 3, `${w} ${side}: straight run ${n}`);
    }
  }
});

test('inner is the whole face 3 px inside the box: 16 tall in a 22 tall cloud', () => {
  for (const w of [23, 26, 28]) {
    const { g, out, x, y } = cloud(w, 22);
    assert.deepEqual(out.inner, { x: x + 3, y: y + 3, w: w - 6, h: 16 });
    for (let py = out.inner.y; py < out.inner.y + out.inner.h; py++) for (let px = out.inner.x; px < out.inner.x + out.inner.w; px++) {
      assert.equal(g.get(px, py), col(FACE), `${w}: ${px},${py}`);
    }
  }
});

test('the trail is bumpCloud\'s, in the rows under the cloud', () => {
  for (const trail of ['down-left', 'down-right']) {
    const { g, out, x, y } = cloud(26, 22, { trail });
    const s = new Surface(32, 32), ref = bumpCloud(s, x, y, 26, 22, { face: FACE, frame: FRAME, border: 0, trail });
    for (let py = y + 22; py < 32; py++) for (let px = 0; px < 32; px++) assert.equal(g.get(px, py), s.get(px, py), `${trail} ${px},${py}`);
    assert.deepEqual(out.tip, ref.tip);
  }
  const none = cloud(26, 22, { trail: 'none' });
  assert.equal(none.out.tip, null);
});

test('a growing cloud as small as 16 by 14 still draws, inside its box', () => {
  const g = new Surface(32, 32);
  puffCloud(g, 4, 4, 16, 14, { face: FACE, frame: FRAME, trail: 'none' });
  assert.deepEqual(g.bounds(), { x0: 4, y0: 4, x1: 19, y1: 17 });
  assert.throws(() => puffCloud(g, 0, 0, 20, 20, { face: FACE }), /colour/);
});
