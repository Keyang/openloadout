// engine/bubble-open.js (added with batch K23, bundles/specs/core-sprites-3.md): a thought bubble taken apart into its
// cloud and its puffs, for an opening clip that shows the puffs one by one before the cloud.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { PALETTE } from '../../engine/palettes.js';
import { THOUGHT_STYLES, thoughtBubble } from '../../engine/bubbles.js';
import { thoughtPieces } from '../../engine/bubble-open.js';

const P = PALETTE.thornwood;
const PAPER = { face: P.cream, frame: P.cavern, accent: P.thorn };
const TRAILS = ['down-left', 'down-right', 'up-left', 'up-right', 'down'];
const count = (s) => s.data.reduce((n, v) => n + (v ? 1 : 0), 0);

test('the cloud with every puff on it is the whole thought bubble', () => {
  for (const style of THOUGHT_STYLES) for (const trail of [...TRAILS, 'none']) for (const shadow of [false, true]) for (const border of [0, 1]) {
    const opt = { ...PAPER, style, trail, shadow, border };
    const whole = new Surface(96, 48), out = thoughtBubble(whole, 1, 1, 94, 46, opt);
    const k = thoughtPieces(96, 48, 1, 1, 94, 46, opt);
    const g = new Surface(96, 48).blit(k.cloud);
    for (const p of k.puffs) g.blit(p.surface);
    assert.deepEqual([...g.data], [...whole.data], `${style} ${trail} shadow ${shadow} border ${border}`);
    assert.deepEqual(k.full.data, whole.data);
    assert.deepEqual(k.out, out);
  }
});

test('three puffs for a trail, smallest first, the first holding the tip; none without a trail', () => {
  for (const trail of TRAILS) for (const shadow of [false, true]) {
    const k = thoughtPieces(96, 48, 1, 1, 94, 46, { ...PAPER, trail, shadow });
    assert.equal(k.puffs.length, 3, trail);
    const sizes = k.puffs.map((p) => count(p.surface));
    // without a shadow the pieces are the puffs alone (a shadow can hide under the cloud or the next puff)
    if (!shadow) assert.ok(sizes[0] < sizes[1] && sizes[1] < sizes[2], `${trail}: ${sizes}`);
    assert.ok(k.puffs[0].surface.get(k.out.tip.x, k.out.tip.y), `${trail}: the tip is in the smallest puff`);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = k.puffs[i].surface, b = k.puffs[j].surface;
      assert.ok(a.data.every((v, n) => !v || !b.data[n]), `${trail}: puffs ${i} and ${j} share no pixel`);
    }
  }
  assert.equal(thoughtPieces(96, 48, 1, 1, 94, 46, { ...PAPER, trail: 'none' }).puffs.length, 0);
});

test('the cloud is a trail-less bubble drawn in cloudBox, on the same body', () => {
  for (const trail of TRAILS) for (const shadow of [false, true]) {
    const opt = { ...PAPER, trail, shadow }, k = thoughtPieces(96, 48, 1, 1, 94, 46, opt);
    const g = new Surface(96, 48), b = k.cloudBox, out = thoughtBubble(g, b.x, b.y, b.w, b.h, { ...opt, trail: 'none' });
    assert.deepEqual(out.body, k.out.body, trail);
    assert.deepEqual([...g.data], [...k.cloud.data], trail);
  }
});

test('each puff has a centre inside it, and the same arguments give the same pixels', () => {
  const opt = { ...PAPER, trail: 'up-right', shadow: true, style: 'dream' };
  const a = thoughtPieces(96, 48, 1, 1, 94, 46, opt), b = thoughtPieces(96, 48, 1, 1, 94, 46, opt);
  for (const p of a.puffs) assert.ok(p.surface.get(p.centre.x, p.centre.y));
  assert.deepEqual(a.puffs.map((p) => [...p.surface.data]), b.puffs.map((p) => [...p.surface.data]));
});

test('dreamSparkles adds at least 12 pixels of the accent round a dream cloud, outside its body and inside the box', async () => {
  const { dreamSparkles } = await import('../../engine/bubble-open.js');
  const { col } = await import('../../engine/color.js');
  for (const trail of ['down-left', 'down-right', 'up-left', 'up-right', 'none']) for (const shadow of [false, true]) {
    const g = new Surface(96, 48), out = thoughtBubble(g, 1, 1, 94, 46, { ...PAPER, style: 'dream', trail, shadow });
    const n0 = g.data.filter((v) => v === col(P.thorn)).length;
    dreamSparkles(g, out.body, P.thorn, { x: 1, y: 1, w: 94, h: 46 });
    const n1 = g.data.filter((v) => v === col(P.thorn)).length;
    assert.ok(n1 - n0 >= 8 && n1 >= 12, `${trail} shadow ${shadow}: ${n0} -> ${n1}`);
    for (let x = 0; x < 96; x++) assert.ok(!g.get(x, 0) && !g.get(x, 47));
  }
});
