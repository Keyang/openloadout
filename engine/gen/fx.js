// Effect generators (docs/data-sprites.md 3.3, family "fx"): sparkles, rings, smoke and the like, each returning
// primitives. Started by B2 with twinkle@1 as the registry's proof; the rest of the family (particles, ring, shards,
// smoke, ...) lands with the emitters layout (B12), one defineGenerator each, test first, goldens in tests/fixtures/gen/.
import { defineGenerator } from './registry.js';
import { point, count, paint } from './args.js';

/** Rows of a four-point sparkle reaching s pixels from its centre: arms 'a', centre 'b' from size 1 up (a lone 'a' at size 0). */
function sparkleRows(s) {
  const rows = [];
  for (let j = -s; j <= s; j++) {
    let row = '';
    for (let i = -s; i <= s; i++) row += i === 0 && j === 0 ? (s ? 'b' : 'a') : i === 0 || j === 0 ? 'a' : '.';
    rows.push(row);
  }
  return rows;
}

/**
 * twinkle@1: a four-point sparkle at a point, one stamp (never turned): size 0 one pixel, 1 a plus, 2 a big plus; the
 * centre is the core paint from size 1 up. Port of engine/fx.js twinkle (the coin's sparkle, every pickup's gleam and
 * collect burst); fx.js's white core is a palette slot the sprite declares ("shine": "#ffffff"), since white is not a
 * fixed paint (docs/data-sprites.md 2.6). Arguments: at (the centre; rounded down to a pixel), size (0..4), paint (the
 * arms), core (the centre).
 */
export const twinkle = defineGenerator({
  id: 'twinkle', v: 1, family: 'fx',
  about: 'A four-point sparkle at a point, one pixel to a big plus, with a bright core.',
  args: {
    at: point({ about: 'The centre pixel' }),
    size: count(0, 4, { default: 1, about: 'How far each arm reaches: 0 one pixel, 1 a plus, 2 a big plus' }),
    paint: paint({ about: 'The arms' }),
    core: paint({ about: 'The centre, from size 1 up: a light slot such as "shine" (white in fx.js)' }),
  },
  keyable: ['size'],
  cost: () => 1,
  run(a) {
    const s = a.size, x = Math.floor(a.at[0]), y = Math.floor(a.at[1]);
    const key = s ? { a: a.paint, b: a.core } : { a: a.paint };
    return [{ kind: 'stamp', at: [x - s, y - s], anchor: 'tl', rows: sparkleRows(s), key }];
  },
});
