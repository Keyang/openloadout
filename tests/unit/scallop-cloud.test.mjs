// engine/scallop-cloud.js (added with batch K23 fix round 2, bundles/specs/core-sprites-3.md): a thought cloud
// scalloped along every edge, with a trail of separate puffs, a repeating middle and dream sparkles off the text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PALETTE } from '../../engine/palettes.js';
import { col } from '../../engine/color.js';
import { CLOUD_STYLES, CLOUD_TRAILS, scallopCloud, scallopPieces, cloudStars } from '../../engine/scallop-cloud.js';

const P = PALETTE.thornwood;
const PAPER = { face: P.cream, frame: P.cavern };
const W = 96, H = 48;
function islands(mask) {
  const lab = new Int32Array(W * H).fill(-1);
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const st = [i]; lab[i] = n;
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * W + X;
        if (X >= 0 && Y >= 0 && X < W && Y < H && mask[k] && lab[k] < 0) { lab[k] = n; st.push(k); }
      }
    }
    n++;
  }
  return n;
}
const longestRun = (a) => { let best = 1, cur = 1; for (let i = 1; i < a.length; i++) { cur = a[i] === a[i - 1] ? cur + 1 : 1; best = Math.max(best, cur); } return best; };

test('the trail is three islands, apart from each other and from the cloud', () => {
  for (const style of CLOUD_STYLES) for (const trail of CLOUD_TRAILS) for (const shadow of [false, true]) for (const border of [0, 0.5, 1]) {
    const g = new Surface(W, H);
    scallopCloud(g, 1, 1, 94, 46, { ...PAPER, style, trail, shadow, border });
    assert.equal(islands(g.data.map((v) => (v ? 1 : 0))), 4, `${style} ${trail} shadow ${shadow} border ${border}`);
  }
});

test('scalloped: no straight run on the top or bottom edge longer than 6 px', () => {
  for (const style of CLOUD_STYLES) for (const trail of [...CLOUD_TRAILS, 'none']) for (const shadow of [false, true]) {
    const g = new Surface(W, H), out = scallopCloud(g, 1, 1, 94, 46, { ...PAPER, style, trail, shadow });
    const top = [], bot = [];
    for (let x = out.inner.x; x < out.inner.x + out.inner.w; x++) {
      let y = 0; while (!g.get(x, y)) y++; top.push(y);
      let yb = H - 1; while (!g.get(x, yb)) yb--; bot.push(yb);
    }
    assert.ok(longestRun(top) <= 6 && longestRun(bot) <= 6, `${style} ${trail}: runs ${longestRun(top)}, ${longestRun(bot)}`);
  }
});

test('no lobe ends in a 1 px tip', () => {
  for (const style of CLOUD_STYLES) for (const trail of [...CLOUD_TRAILS, 'none']) {
    const g = new Surface(W, H);
    scallopCloud(g, 1, 1, 94, 46, { ...PAPER, style, trail, shadow: false });
    const o = (x, y) => (g.get(x, y) ? 1 : 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!o(x, y) || o(x - 1, y) || o(x + 1, y)) continue;
      assert.ok(!(!o(x, y - 1) && o(x, y + 1)) && !(!o(x, y + 1) && o(x, y - 1)), `${style} ${trail}: a 1 px tip at ${x}, ${y}`);
    }
  }
});

test('the three styles have different outlines', () => {
  const outline = (style) => { const g = new Surface(W, H); scallopCloud(g, 1, 1, 94, 46, { ...PAPER, style, trail: 'none' }); return g.data.map((v) => (v ? 1 : 0)).join(''); };
  const [a, b, c] = CLOUD_STYLES.map(outline);
  assert.ok(a !== b && b !== c && a !== c);
});

test('nothing outside the box; inner is flat face; the tile repeats', () => {
  for (const style of CLOUD_STYLES) for (const trail of [...CLOUD_TRAILS, 'none']) for (const shadow of [false, true]) {
    const g = new Surface(W, H), out = scallopCloud(g, 1, 1, 94, 46, { ...PAPER, style, trail, shadow });
    for (let x = 0; x < W; x++) assert.ok(!g.get(x, 0) && !g.get(x, H - 1));
    for (let y = 0; y < H; y++) assert.ok(!g.get(0, y) && !g.get(W - 1, y));
    const r = out.inner;
    assert.ok(r.w >= 40 && r.h >= 17, `${style} ${trail}: inner ${r.w}x${r.h}`);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(g.get(x, y), col(P.cream));
    const t = out.tile;
    assert.ok(t.x >= r.x && t.x + 2 * t.w <= r.x + r.w, `${style} ${trail}: tile inside the text columns`);
    for (let i = 0; i < t.w; i++) for (let y = 0; y < H; y++) assert.equal(g.get(t.x + i, y), g.get(t.x + t.w + i, y), `${style} ${trail}: column ${t.x + i}`);
  }
});

test('the pieces put back together are the whole cloud; puffs smallest first', () => {
  for (const trail of [...CLOUD_TRAILS, 'none']) for (const shadow of [false, true]) {
    const opt = { ...PAPER, trail, shadow };
    const whole = new Surface(W, H); scallopCloud(whole, 1, 1, 94, 46, opt);
    const k = scallopPieces(W, H, 1, 1, 94, 46, opt);
    const g = new Surface(W, H).blit(k.cloud);
    for (const p of k.puffs) g.blit(p.surface);
    assert.deepEqual([...g.data], [...whole.data], trail);
    const sizes = k.puffs.map((p) => p.surface.data.filter(Boolean).length);
    for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i - 1] < sizes[i], `${trail}: ${sizes}`);
  }
});

test('dream sparkles: two 5x5 pluses, off the text area', () => {
  for (const trail of [...CLOUD_TRAILS, 'none']) {
    const g = new Surface(W, H), out = scallopCloud(g, 1, 1, 94, 46, { ...PAPER, style: 'dream', trail, shadow: true });
    cloudStars(g, out, P.hero);
    const r = out.inner;
    let n = 0;
    for (let i = 0; i < g.data.length; i++) if (g.data[i] === col(P.hero)) n++;
    assert.ok(n >= 16, `${trail}: ${n} sparkle pixels`);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(g.get(x, y), col(P.cream));
  }
});

test('refuses an unknown style or trail, and a missing colour', () => {
  const g = new Surface(W, H);
  assert.throws(() => scallopCloud(g, 1, 1, 94, 46, { ...PAPER, style: 'storm' }));
  assert.throws(() => scallopCloud(g, 1, 1, 94, 46, { ...PAPER, trail: 'down' }));
  assert.throws(() => scallopCloud(g, 1, 1, 94, 46, { face: P.cream }));
});
