// Framework addition made with sprite batch K24 (bundles/specs/core-sprites-3.md, emote-bubbles "Fit"):
// engine/emote-fit.js, how far an emote reaches over its whole motion, and the biggest emote that fits a box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { EMOTES, drawEmote } from '../../engine/emotes.js';
import { emoteReach, fitEmote } from '../../engine/emote-fit.js';

// every frame the reach covers: the idle loop at `size`, then one still frame per scale
function frames(size, { frames: n = 8, scales = [] } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ size, t: i / n });
  for (const s of scales) out.push({ size: Math.round(size * s), t: 0 });
  return out;
}
function drawn(kind, cx, by, size, t, opt) {
  const g = new Surface(64, 64);
  drawEmote(g, kind, cx, by, size, { t, colour: '#e08a2c', edge: '#f0ead8', ...opt });
  return g.bounds();
}

test('emoteReach is exactly how far every frame reaches from the centre column and the bottom row', () => {
  for (const kind of EMOTES) for (const size of [10, 14, 20]) for (const opt of [{ bounce: 0, rim: false }, { bounce: 1, rim: true, shadow: true, bold: true }]) {
    const scales = [0.6, 1.15], r = emoteReach(kind, size, { ...opt, scales });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of frames(size, { scales })) {
      const b = drawn(kind, 32, 44, f.size, f.t, opt);
      x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1);
    }
    assert.deepEqual(r, { left: 32 - x0, right: x1 - 32, up: 44 - y0, down: y1 - 44 }, `${kind} ${size} ${JSON.stringify(opt)}`);
  }
});

test('fitEmote picks the biggest size whose every frame stays inside the box less the margin', () => {
  const opt = { bounce: 0, rim: false, scales: [0.6, 1.15] };
  for (const box of [{ x: 6, y: 4, w: 21, h: 18 }, { x: 5, y: 5, w: 18, h: 16 }, { x: 3, y: 2, w: 26, h: 26 }]) for (const kind of EMOTES) {
    const f = fitEmote(kind, box, opt);
    if (!f.fits) continue;
    for (const fr of frames(f.size, opt)) {
      const b = drawn(kind, f.cx, f.by, fr.size, fr.t, opt);
      assert.ok(b.x0 >= box.x + 1 && b.y0 >= box.y + 1 && b.x1 <= box.x + box.w - 2 && b.y1 <= box.y + box.h - 2, `${kind} in ${JSON.stringify(box)}: ${JSON.stringify(b)}`);
    }
    if (f.size < 20) {
      const r = emoteReach(kind, f.size + 1, opt);
      assert.ok(r.left + r.right + 1 > box.w - 2 || r.up + r.down + 1 > box.h - 2, `${kind}: size ${f.size + 1} would fit too`);
    }
  }
  // a roomy box fits every mark at the largest size it allows
  for (const kind of EMOTES) assert.equal(fitEmote(kind, { x: 0, y: 0, w: 64, h: 64 }, opt).size, 20);
});

test('fitEmote says when nothing fits, keeps the smallest size and centres it; same arguments, same answer', () => {
  const f = fitEmote('sleep', { x: 4, y: 4, w: 8, h: 8 }, { bounce: 0, rim: false });
  assert.equal(f.fits, false);
  assert.equal(f.size, 10);
  assert.ok(Number.isInteger(f.cx) && Number.isInteger(f.by));
  assert.deepEqual(fitEmote('heart', { x: 6, y: 4, w: 21, h: 18 }, { scales: [1.15] }), fitEmote('heart', { x: 6, y: 4, w: 21, h: 18 }, { scales: [1.15] }));
  assert.ok(fitEmote('exclaim', { x: 6, y: 4, w: 21, h: 18 }, { margin: 0 }).size >= fitEmote('exclaim', { x: 6, y: 4, w: 21, h: 18 }, { margin: 2 }).size);
});
