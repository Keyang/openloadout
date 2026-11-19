// engine/cloud-bubble.js (added with batch K23, bundles/specs/core-sprites-3.md): a thought cloud with round lobes and a
// trail of separate puffs, taken apart for an opening, with dream sparkles at its top corners only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PALETTE } from '../../engine/palettes.js';
import { col } from '../../engine/color.js';
import { CLOUD_STYLES, CLOUD_TRAILS, thoughtCloud, cloudPieces, cloudSparkles } from '../../engine/cloud-bubble.js';

const P = PALETTE.thornwood;
const PAPER = { face: P.cream, frame: P.cavern };
const W = 96, H = 48;
// 8-connected islands of a mask
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

test('the trail is three islands, apart from each other and from the cloud, in every style, trail, band and shadow', () => {
  for (const style of CLOUD_STYLES) for (const trail of CLOUD_TRAILS) for (const shadow of [false, true]) for (const border of [0, 0.5, 1]) {
    const g = new Surface(W, H);
    thoughtCloud(g, 1, 1, 94, 46, { ...PAPER, style, trail, shadow, border });
    assert.equal(islands(g.data.map((v) => (v ? 1 : 0))), 4, `${style} ${trail} shadow ${shadow} border ${border}`);
  }
});

test('no lobe ends in a 1 px tip', () => {
  for (const style of CLOUD_STYLES) for (const trail of [...CLOUD_TRAILS, 'none']) for (const shadow of [false, true]) {
    const g = new Surface(W, H);
    thoughtCloud(g, 1, 1, 94, 46, { ...PAPER, style, trail, shadow });
    const o = (x, y) => (g.get(x, y) ? 1 : 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!o(x, y) || o(x - 1, y) || o(x + 1, y)) continue;
      assert.ok(!(!o(x, y - 1) && o(x, y + 1)) && !(!o(x, y + 1) && o(x, y - 1)), `${style} ${trail}: a 1 px tip at ${x}, ${y}`);
    }
  }
});

test('nothing is drawn outside the box; inner is flat face clear of the trail', () => {
  for (const trail of [...CLOUD_TRAILS, 'none']) for (const shadow of [false, true]) {
    const g = new Surface(W, H), out = thoughtCloud(g, 1, 1, 94, 46, { ...PAPER, trail, shadow });
    for (let x = 0; x < W; x++) assert.ok(!g.get(x, 0) && !g.get(x, H - 1));
    for (let y = 0; y < H; y++) assert.ok(!g.get(0, y) && !g.get(W - 1, y));
    const r = out.inner;
    assert.ok(r.w >= 40 && r.h >= 17, `${trail}: inner ${r.w}x${r.h}`);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(g.get(x, y), col(P.cream));
    if (trail !== 'none') assert.equal(out.puffs.length, 3);
  }
});

test('the pieces put back together are the whole cloud; puffs smallest first', () => {
  for (const trail of [...CLOUD_TRAILS, 'none']) for (const shadow of [false, true]) {
    const opt = { ...PAPER, trail, shadow };
    const whole = new Surface(W, H); thoughtCloud(whole, 1, 1, 94, 46, opt);
    const k = cloudPieces(W, H, 1, 1, 94, 46, opt);
    const g = new Surface(W, H).blit(k.cloud);
    for (const p of k.puffs) g.blit(p.surface);
    assert.deepEqual([...g.data], [...whole.data], trail);
    const sizes = k.puffs.map((p) => p.surface.data.filter(Boolean).length);
    for (let i = 1; i < sizes.length; i++) assert.ok(sizes[i - 1] < sizes[i], `${trail}: ${sizes}`);
    const none = new Surface(W, H); thoughtCloud(none, k.cloudBox.x, k.cloudBox.y, k.cloudBox.w, k.cloudBox.h, { ...opt, trail: 'none' });
    assert.deepEqual([...none.data], [...k.cloud.data], `${trail}: cloudBox draws the same cloud`);
  }
});

test('dream sparkles only beside the top corners', () => {
  for (const trail of CLOUD_TRAILS) {
    const g = new Surface(W, H), box = { x: 1, y: 1, w: 94, h: 46 };
    const out = thoughtCloud(g, 1, 1, 94, 46, { ...PAPER, style: 'dream', trail, shadow: true });
    cloudSparkles(g, out.body, P.hero, box);
    let n = 0;
    for (let i = 0; i < g.data.length; i++) if (g.data[i] === col(P.hero)) { n++; assert.ok(Math.floor(i / W) < out.body.y, `${trail}: sparkle below the top`); }
    assert.ok(n >= 8, `${trail}: ${n} sparkle pixels`);
  }
});

test('refuses an unknown style or trail, and a missing colour', () => {
  const g = new Surface(W, H);
  assert.throws(() => thoughtCloud(g, 1, 1, 94, 46, { ...PAPER, style: 'storm' }));
  assert.throws(() => thoughtCloud(g, 1, 1, 94, 46, { ...PAPER, trail: 'down' }));
  assert.throws(() => thoughtCloud(g, 1, 1, 94, 46, { face: P.cream }));
});
