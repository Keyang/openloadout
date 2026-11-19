// Framework addition made with sprite batch K24 fix round 6 (bundles/specs/core-sprites-3.md, emote-bubbles):
// engine/dizzy-swirl.js, the small swirl held with its outer end on the left (it read as a 6 with its end up),
// wobbling instead of turning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { dizzySwirlBody, drawDizzySwirl, dizzyWobble } from '../../engine/dizzy-swirl.js';
import { smallEmoteBody } from '../../engine/emote-small.js';

const T = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8);
const SIZES = [10, 11, 12, 13, 14, 15, 16];
const COLOUR = '#3c6fd0';
// 8-connected islands of set pixels, each as a list of [x, y]
function islands(at, W, H) {
  const seen = new Uint8Array(W * H), out = [];
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    if (!at(x0, y0) || seen[y0 * W + x0]) continue;
    const isl = [], st = [[x0, y0]]; seen[y0 * W + x0] = 1;
    while (st.length) {
      const [x, y] = st.pop(); isl.push([x, y]);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < W && Y < H && at(X, Y) && !seen[Y * W + X]) { seen[Y * W + X] = 1; st.push([X, Y]); }
      }
    }
    out.push(isl);
  }
  return out;
}
const bodyIslands = (b) => islands((x, y) => b.at(x, y), b.w, b.h);
const box = (pts) => ({ x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) });

test('a spiral and a separate star on every frame, drawn too (colour islands)', () => {
  for (const s of SIZES) for (const t of T) {
    assert.equal(bodyIslands(dizzySwirlBody(s, { t })).length, 2, `size ${s} t ${t}`);
    const g = new Surface(40, 40); drawDizzySwirl(g, 20, 34, s, { t, colour: COLOUR });
    const c = g.get(20, 34) || 0, col = [...new Set(g.data)].filter(Boolean);
    assert.ok(col.length === 2, `two colours, size ${s} t ${t} (${c})`);
  }
});

test('the spiral never turns: the same pixels on every frame, the outer end on the left', () => {
  for (const s of SIZES) {
    const shapes = T.map((t) => {
      const sp = bodyIslands(dizzySwirlBody(s, { t })).sort((a, b) => b.length - a.length)[0];
      const bb = box(sp);
      return { key: sp.map(([x, y]) => `${x - bb.x0},${y - bb.y0}`).sort().join(' '), bb, sp };
    });
    for (const sh of shapes) assert.equal(sh.key, shapes[0].key, `size ${s}`);
    // the leftmost column holds the outer end: a short run that is not the bottom row and does not reach the top
    const { bb, sp } = shapes[0];
    const left = sp.filter(([x]) => x === bb.x0).map(([, y]) => y);
    assert.ok(Math.min(...left) > bb.y0 && Math.max(...left) < bb.y1, `size ${s}: the outer end is on the left side`);
    assert.ok(left.length <= 4, `size ${s}: no stem longer than 4 px`);
    // the top row of the spiral is an arc, not a stem: 4 px or more wide
    assert.ok(sp.filter(([, y]) => y === bb.y0).length >= 4, `size ${s}: the top is the wrapping arc`);
  }
});

test('the wobble: at rest, spiral up 1, at rest, star down 1; rest at t = 0', () => {
  assert.deepEqual(T.map((t) => dizzyWobble(t)), [
    { spiral: 0, star: 0 }, { spiral: 0, star: 0 }, { spiral: -1, star: 0 }, { spiral: -1, star: 0 },
    { spiral: 0, star: 0 }, { spiral: 0, star: 0 }, { spiral: 0, star: 1 }, { spiral: 0, star: 1 },
  ]);
});

test('the wobble stays inside the rest pose\'s box and inside emote-small\'s turning swirl\'s reach', () => {
  for (const s of SIZES) {
    const all = (b) => { const p = []; for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.at(x, y)) p.push([x, y]); return box(p); };
    const rest = all(dizzySwirlBody(s, { t: 0 }));
    let old = null;
    for (const t of T) {
      const o = all(smallEmoteBody('swirl', s, { t }));
      old = old ? { x0: Math.min(old.x0, o.x0), x1: Math.max(old.x1, o.x1), y0: Math.min(old.y0, o.y0), y1: Math.max(old.y1, o.y1) } : o;
    }
    for (const t of T) {
      const b = all(dizzySwirlBody(s, { t }));
      assert.ok(b.x0 >= rest.x0 && b.x1 <= rest.x1 && b.y0 >= rest.y0 && b.y1 <= rest.y1, `size ${s} t ${t}`);
      assert.ok(b.x0 >= old.x0 && b.x1 <= old.x1 && b.y0 >= old.y0 && b.y1 <= old.y1, `size ${s} t ${t} vs emote-small`);
    }
  }
});

test('the star keeps 3 px or more from the spiral on every frame (ink, face, ink once outlined)', () => {
  for (const s of SIZES) for (const t of T) {
    const [a, b] = bodyIslands(dizzySwirlBody(s, { t }));
    let near = Infinity;
    for (const [x, y] of a) for (const [X, Y] of b) near = Math.min(near, Math.max(Math.abs(x - X), Math.abs(y - Y)));
    assert.ok(near >= 3, `size ${s} t ${t}: ${near}`);
  }
});

test('drawDizzySwirl needs a colour', () => {
  assert.throws(() => drawDizzySwirl(new Surface(30, 30), 15, 25, 12, {}), /needs a colour/);
});
