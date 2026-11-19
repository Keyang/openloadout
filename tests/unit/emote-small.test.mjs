// Framework addition made with sprite batch K24 fix round 3 (bundles/specs/core-sprites-3.md, emote-bubbles):
// engine/emote-small.js, anger, spark and swirl redrawn so they read at 10 to 14 px with a plain ink line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { EMOTES, drawEmote } from '../../engine/emotes.js';
import { SMALL_EMOTES, smallEmoteBody, drawSmallEmote } from '../../engine/emote-small.js';

const T = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i / 8);
// 8-connected islands of every drawn pixel: two islands have at least 1 px of background between them
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
const drawn = (kind, size, t) => { const g = new Surface(40, 40); drawSmallEmote(g, kind, 20, 32, size, { t, colour: '#3c6fd0' }); return g; };

test('SMALL_EMOTES are emotes of engine/emotes.js', () => {
  assert.deepEqual([...SMALL_EMOTES], ['anger', 'spark', 'swirl']);
  for (const k of SMALL_EMOTES) assert.ok(EMOTES.includes(k));
});

test('anger is four separate strokes with background between them, on every frame', () => {
  for (const s of [10, 11, 12, 13, 14]) for (const t of T) assert.equal(islands(drawn('anger', s, t)), 4, `size ${s} t ${t}`);
});

test('spark is a star core and four rays, each clear of the core, on every frame', () => {
  for (const s of [10, 11, 12, 13, 14]) for (const t of T) assert.equal(islands(drawn('spark', s, t)), 5, `size ${s} t ${t}`);
});

test('swirl is a spiral and a separate star that never touch, on every frame', () => {
  for (const s of [10, 11, 12, 13, 14]) for (const t of T) assert.equal(islands(drawn('swirl', s, t)), 2, `size ${s} t ${t}`);
});

test('the idle motion moves every small emote and the loop closes', () => {
  for (const k of SMALL_EMOTES) for (const s of [10, 12, 14]) {
    const a = drawn(k, s, 0).data, b = drawn(k, s, 0.5).data, c = drawn(k, s, 1).data;
    assert.notDeepEqual(a, b, `${k} ${s} moves`);
    assert.deepEqual(a, c, `${k} ${s} loops`);
  }
});

test('a small body stands on its grid without touching its edges', () => {
  for (const k of SMALL_EMOTES) for (const s of [10, 12, 14, 16]) for (const t of T) {
    const b = smallEmoteBody(k, s, { t });
    for (let y = 0; y < b.h; y++) for (const x of [0, b.w - 1]) assert.equal(b.at(x, y), 0, `${k} ${s} left/right edge`);
    for (let x = 0; x < b.w; x++) assert.equal(b.at(x, 0), 0, `${k} ${s} top edge`);
  }
});

test('the other emotes are drawEmote with rim off, pixel for pixel', () => {
  for (const k of EMOTES.filter((e) => !SMALL_EMOTES.includes(e))) {
    const a = new Surface(40, 40), b = new Surface(40, 40);
    drawSmallEmote(a, k, 20, 32, 12, { t: 0.25, colour: '#3c6fd0', bounce: 0, apart: true });
    drawEmote(b, k, 20, 32, 12, { t: 0.25, colour: '#3c6fd0', bounce: 0, apart: true, rim: false });
    assert.deepEqual(a.data, b.data, k);
  }
});

test('smallEmoteBody and drawSmallEmote refuse what they cannot draw', () => {
  assert.throws(() => smallEmoteBody('heart', 12), /no small emote/);
  assert.throws(() => drawSmallEmote(new Surface(8, 8), 'anger', 4, 6, 12, {}), /needs a colour/);
});
