// Framework additions of batch S07, fix round 2 (scout-drone), both in engine/breaking.js:
//   restInRow          how far each chunk must move sideways so that the chunks come to rest side by side, in their left-to-right order
//   drawFragmentApart  draws a chunk over what is there and keeps one clear pixel round it, which g.outline turns into its own line
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { fragments, drawFragment, restInRow, drawFragmentApart } from '../../engine/breaking.js';

const block = (x, y, w, h, c = '#c2c9d6') => { const s = new Surface(48, 48); s.rect(x, y, w, h, c); return s; };
const box = (f, dx) => [f.x0 + dx, f.x1 + dx];

test('restInRow: chunks that overlap sideways end side by side with the gap between them, in their left-to-right order', () => {
  const F = fragments(block(19, 12, 10, 10), 3, { seed: 5 }), D = restInRow(F, { lo: 2, hi: 45, gap: 3 });   // three chunks of a small block: room to spare
  assert.equal(D.length, F.length);
  const order = F.map((f, i) => i).sort((a, b) => F[a].x - F[b].x), spans = order.map((i) => box(F[i], D[i]));
  for (let i = 1; i < spans.length; i++) assert.equal(spans[i][0] - spans[i - 1][1] - 1, 3);
  assert.ok(spans[0][0] >= 2 && spans.at(-1)[1] <= 45);
  for (const d of D) assert.ok(Number.isInteger(d));
});

test('restInRow: the row is centred on where the chunks were, and pushed back inside lo..hi when that is off to a side', () => {
  const F = fragments(block(14, 12, 20, 20), 3, { seed: 5 }), D = restInRow(F, { lo: 2, hi: 45, gap: 3 });
  const x0 = Math.min(...F.map((f, i) => f.x0 + D[i])), x1 = Math.max(...F.map((f, i) => f.x1 + D[i]));
  assert.ok(Math.abs((x0 + x1) / 2 - 23.5) <= 1);
  const G = fragments(block(1, 12, 20, 20), 3, { seed: 5 }), E = restInRow(G, { lo: 2, hi: 45, gap: 3 });
  assert.equal(Math.min(...G.map((f, i) => f.x0 + E[i])), 2);
});

test('restInRow: with too little room the gap shrinks (the chunks may then overlap) and the row still starts at lo; `centre` moves the row', () => {
  const F = fragments(block(4, 12, 40, 20), 3, { seed: 5 }), sum = F.reduce((s, f) => s + f.x1 - f.x0 + 1, 0);
  const D = restInRow(F, { lo: 2, hi: 2 + sum - 5, gap: 3 });
  const order = F.map((f, i) => i).sort((a, b) => F[a].x - F[b].x), spans = order.map((i) => box(F[i], D[i]));
  assert.equal(spans[0][0], 2);
  assert.ok(spans.at(-1)[1] <= 2 + sum - 5);
  for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] - spans[i - 1][1] - 1 < 3);
  const S = fragments(block(20, 20, 8, 8), 2, { seed: 1 });
  const a = restInRow(S, { lo: 2, hi: 45, gap: 2, centre: 12 }), b = restInRow(S, { lo: 2, hi: 45, gap: 2, centre: 30 });
  assert.ok(a.every((d, i) => b[i] - d === 18));
  assert.deepEqual(restInRow([], { lo: 2, hi: 45 }), []);
});

test('drawFragmentApart: on an empty Surface it draws exactly what drawFragment draws', () => {
  const F = fragments(block(14, 12, 20, 20), 3, { seed: 5 });
  for (const f of F) {
    const a = drawFragment(new Surface(48, 48), f, 3, 2, { cut: true }), b = drawFragmentApart(new Surface(48, 48), f, 3, 2, { cut: true });
    assert.deepEqual(b.data, a.data);
  }
});

test('drawFragmentApart: over another picture it leaves one clear pixel round the chunk, and nothing else is rubbed out', () => {
  const [f] = fragments(block(20, 20, 6, 6), 1), g = block(10, 10, 30, 30, '#5a6988'), before = Uint32Array.from(g.data);
  drawFragmentApart(g, f, 0, 0);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const inside = x >= 20 && x < 26 && y >= 20 && y < 26;
    const ring = !inside && ((x >= 20 && x < 26 && (y === 19 || y === 26)) || (y >= 20 && y < 26 && (x === 19 || x === 26)));
    const v = g.data[y * 48 + x];
    if (inside) assert.notEqual(v, before[y * 48 + x]);
    else if (ring) assert.equal(v, 0);
    else assert.equal(v, before[y * 48 + x]);
  }
});

test('drawFragmentApart: it stays inside the box like drawFragment, and is the same every time', () => {
  const [f] = fragments(block(20, 20, 6, 6), 1);
  const a = drawFragmentApart(new Surface(48, 48), f, 22, 0), b = drawFragmentApart(new Surface(48, 48), f, 22, 0);   // would reach column 47
  assert.deepEqual(a.data, b.data);
  assert.equal(a.bounds().x1, 46);
  assert.equal(drawFragmentApart(new Surface(48, 48), f, 30, 0).bounds(), null);                                        // wholly outside: nothing drawn
  assert.equal(drawFragmentApart(new Surface(48, 48), f, 0, 0, { box: [0, 0, 22, 48] }).bounds().x1, 21);
});
