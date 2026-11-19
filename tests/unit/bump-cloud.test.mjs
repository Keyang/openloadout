// Framework addition made with sprite batch K24 fix round 3 (bundles/specs/core-sprites-3.md, emote-bubbles):
// engine/bump-cloud.js, a small thought cloud bumped on every edge with a trail of three separate puffs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK } from '../../engine/color.js';
import { bumpCloud, BUMP_TRAIL, BUMP_TRAILS } from '../../engine/bump-cloud.js';

const FACE = '#f0e6d0', FRAME = '#5a4a3a';
function cloud(w, h, opt = {}) {
  const g = new Surface(32, 32), y = 30 - BUMP_TRAIL.rows - h + 1;
  const out = bumpCloud(g, 16 - (w >> 1), y, w, h, { face: FACE, frame: FRAME, border: 0, ...opt });
  return { g, out, x: 16 - (w >> 1), y };
}
// the crowns of an outline profile: maximal runs of equal values strictly further out than both neighbours
function crowns(profile) {
  const out = [];
  for (let i = 0; i < profile.length;) {
    let j = i;
    while (j + 1 < profile.length && profile[j + 1] === profile[i]) j++;
    const before = i > 0 ? profile[i - 1] : Infinity, after = j + 1 < profile.length ? profile[j + 1] : Infinity;
    if (profile[i] < before && profile[i] < after) out.push(j - i + 1);
    i = j + 1;
  }
  return out;
}
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

test('the outline is round bumps: 3 or more along the top and bottom and 2 or more down each side, each 3 px or wider', () => {
  for (let w = 22; w <= 28; w++) {
    const { g, x, y } = cloud(w, 22, { trail: 'none' });
    const top = [], bottom = [], left = [], right = [];
    for (let px = x; px < x + w; px++) {
      let a = y; while (!g.get(px, a) && a < y + 22) a++;
      let b = y + 21; while (!g.get(px, b) && b > y) b--;
      top.push(a); bottom.push(-b);
    }
    for (let py = y; py < y + 22; py++) {
      let a = x; while (!g.get(a, py) && a < x + w) a++;
      let b = x + w - 1; while (!g.get(b, py) && b > x) b--;
      left.push(a); right.push(-b);
    }
    for (const [name, p, min] of [['top', top, 3], ['bottom', bottom, 3], ['left', left, 2], ['right', right, 2]]) {
      const c = crowns(p);
      assert.ok(c.length >= min, `w ${w} ${name}: ${c.length} bumps`);
      for (const n of c) assert.ok(n >= 3, `w ${w} ${name}: a bump ${n} px wide`);
    }
  }
});

test('the trail is three puffs, each its own island, smaller and lower than the one before, inside the surface less 1 px', () => {
  for (let w = 22; w <= 28; w += 3) for (const [trail, trailX] of [['down-left'], ['down-right'], ['down-left', 26]]) {
    const { g, out } = cloud(w, 22, { trail, trailX });
    assert.equal(islands(g), 4, `w ${w} ${trail}`);
    assert.equal(out.puffs.length, 3);
    for (let i = 1; i < 3; i++) {
      assert.ok(out.puffs[i].d < out.puffs[i - 1].d, 'smaller');
      assert.ok(out.puffs[i].y >= out.puffs[i - 1].y + 1, 'lower');
      assert.ok(trail === 'down-left' ? out.puffs[i].x < out.puffs[i - 1].x : out.puffs[i].x > out.puffs[i - 1].x, 'further out');
    }
    assert.deepEqual(out.tip, { x: out.puffs[2].x, y: out.puffs[2].y });
    const b = g.bounds();
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `w ${w} ${trail}: ${JSON.stringify(b)}`);
  }
  const { out } = cloud(25, 22, { trail: 'down-left', trailX: 26 });
  assert.equal(out.tip.x, 16, 'a trail from column 26 ends under the middle');
});

test('inner is flat face only, 16 px tall in a 22 px cloud, with the line and band round it', () => {
  for (let w = 22; w <= 28; w++) {
    const { g, out } = cloud(w, 22, { trail: 'none' });
    const I = out.inner;
    assert.equal(I.h, 16, `w ${w}`);
    assert.ok(I.w >= 16, `w ${w}: ${I.w}`);
    const inkPx = new Surface(1, 1); inkPx.dot(0, 0, INK);
    const facePx = new Surface(1, 1); facePx.dot(0, 0, FACE);
    for (let py = I.y; py < I.y + I.h; py++) for (let px = I.x; px < I.x + I.w; px++) assert.equal(g.get(px, py), facePx.get(0, 0), `w ${w} ${px},${py}`);
    assert.equal(g.get(out.edge.x, out.edge.y), (() => { const s = new Surface(1, 1); s.dot(0, 0, FRAME); return s.get(0, 0); })());
  }
});

test('BUMP_TRAILS and errors', () => {
  assert.deepEqual([...BUMP_TRAILS], ['down-left', 'down-right', 'none']);
  assert.throws(() => bumpCloud(new Surface(32, 32), 2, 2, 24, 20, { face: FACE }), /needs a face and a frame/);
  assert.throws(() => bumpCloud(new Surface(32, 32), 2, 2, 24, 20, { face: FACE, frame: FRAME, trail: 'up' }), /is not one of/);
});
