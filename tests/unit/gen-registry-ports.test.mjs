// The first generators are ports of engine helpers the first slice (coin, crate, icons-food) draws with. Each port
// returns primitives instead of drawing; painted, those primitives give exactly the pixels the helper drew.
//   twinkle@1  engine/fx.js twinkle          (the coin's sparkle, every pickup's gleam and collect burst)
//   mark@1     engine/marks.js drawMark      (the crate's stamp: leaf, skull, star; signs and labels)
//   row@1      the crate's rivet loop        (evenly placed things: rivets, nails, studs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { twinkle as fxTwinkle } from '../../engine/fx.js';
import { drawMark, MARKS, LABEL_MARKS, SIGN_MARKS } from '../../engine/marks.js';
import { runGenerator, generator } from '../../engine/gen/index.js';
import { paintSimple } from '../helpers/gen-harness.mjs';

const COLOURS = { gold: '#c08020', white: '#ffffff', core: '#fff0a0', mark: '#336699', rivet: '#4a4a5a' };
const same = (a, b, label) => {
  const diff = [];
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) diff.push([i % a.w, Math.floor(i / a.w)]);
  assert.deepEqual(diff.slice(0, 8), [], `${label}: pixels differ`);
};
const run = (node) => {
  const r = runGenerator(node);
  assert.ok(r.ok, r.errors.join('; '));
  return r.primitives;
};

test('twinkle@1 paints what engine/fx.js twinkle draws', () => {
  for (const size of [0, 1, 2, 3, 4]) {
    for (const [x, y] of [[16, 16], [16.5, 12.7], [5.2, 6.9], [26, 26]]) {   // away from the 1 px frame margin fx.js keeps for the outline
      for (const core of [undefined, 'core']) {
        const want = new Surface(32, 32);
        fxTwinkle(want, x, y, size, COLOURS.gold, core ? { core: COLOURS.core } : {});
        // fx.js's default core is white: here a palette slot named "white" (#ffffff)
        const got = paintSimple(new Surface(32, 32), run({ gen: 'twinkle', v: 1, at: [x, y], size, paint: 'gold', core: core ?? 'white' }), COLOURS);
        same(got, want, `twinkle size ${size} at ${x},${y}`);
      }
    }
  }
});

test('twinkle@1 is one stamp, never turned: pixel detail, not a shape', () => {
  const [p, ...rest] = run({ gen: 'twinkle', v: 1, at: [10, 10], size: 2, paint: 'gold', core: 'shine' });
  assert.equal(rest.length, 0);
  assert.equal(p.kind, 'stamp');
  assert.equal(p.anchor, 'tl');
  assert.deepEqual(p.rows, ['..a..', '..a..', 'aabaa', '..a..', '..a..']);
  assert.deepEqual(p.key, { a: 'gold', b: 'shine' });
  assert.deepEqual(generator('twinkle', 1).keyable, ['size']);
});

test('mark@1 paints what engine/marks.js drawMark draws, for every mark, size, flip and turn', () => {
  const names = [...MARKS, ...LABEL_MARKS, ...SIGN_MARKS];
  assert.deepEqual([...generator('mark', 1).args.name.values], names, 'mark@1 knows every mark');
  for (const name of names) {
    for (const size of [3, 4, 5, 7, 9, 11, 15, 31]) {
      for (const flip of [false, true]) {
        for (const turn of [0, 1, 2, 3]) {
          const want = new Surface(48, 48);
          drawMark(want, name, 24, 23, size, COLOURS.mark, { flip, turn });
          const got = paintSimple(new Surface(48, 48), run({ gen: 'mark', v: 1, name, at: [24, 23], size, paint: 'mark', flip, turn }), COLOURS);
          same(got, want, `${name} ${size} flip ${flip} turn ${turn}`);
        }
      }
    }
  }
});

test('row@1 places the crate\'s rivets where its loop put them', () => {
  // sprites/crate.js: for (rx = x + 2; rx < x + S - 1; rx += 4) g.dot(rx, sy + (b >> 1), metal.dark)
  for (let S = 15; S <= 23; S++) {
    const x = 16 - Math.ceil(S / 2), y = 30 - S, b = S >= 19 ? 3 : 2;
    const want = new Surface(32, 32);
    for (let rx = x + 2; rx < x + S - 1; rx += 4) want.dot(rx, y + (b >> 1), COLOURS.rivet);
    const k = Math.ceil((S - 3) / 4);
    const prims = run({ gen: 'row', v: 1, from: [x + 2, y + (b >> 1)], to: [x + 2 + 4 * (k - 1), y + (b >> 1)], count: k, place: { kind: 'dot', paint: 'rivet' } });
    same(paintSimple(new Surface(32, 32), prims, COLOURS), want, `rivets at size ${S}`);
  }
});

test('row@1 places a generator by its at argument, and refuses one that has none', () => {
  const prims = run({ gen: 'row', v: 1, from: [4, 4], to: [12, 4], count: 3, place: { gen: 'twinkle', v: 1, size: 1, paint: 'gold', core: 'shine' } });
  assert.deepEqual(prims.map((p) => p.at), [[3, 3], [7, 3], [11, 3]]);
  const no = runGenerator({ gen: 'row', v: 1, from: [0, 0], to: [4, 0], count: 2, place: { gen: 'row', v: 1, from: [0, 0], to: [1, 1], count: 1, place: { kind: 'dot', paint: 'gold' } } });
  assert.equal(no.ok, false);
  assert.match(no.errors.join(), /at/);
  const line = runGenerator({ gen: 'row', v: 1, from: [0, 0], to: [4, 0], count: 2, place: { kind: 'line', from: [0, 0], to: [1, 1], paint: 'gold' } });
  assert.equal(line.ok, false, 'a line has no at to place it by');
});
