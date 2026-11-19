// Picture-mark generators (family "mark"): the small one-colour pictures of engine/marks.js (a crate's stamp, a sign,
// an emblem) as stamps of whole pixels, at any odd size. Started by B2 with mark@1 as the registry's proof.
import { defineGenerator } from './registry.js';
import { point, count, paint, word, flag } from './args.js';
import { markIn, MARKS, LABEL_MARKS, SIGN_MARKS } from '../marks.js';

/** Every mark name mark@1 knows: engine/marks.js MARKS, LABEL_MARKS and SIGN_MARKS, in that order. */
export const MARK_NAMES = Object.freeze([...MARKS, ...LABEL_MARKS, ...SIGN_MARKS]);

/**
 * mark@1: a small picture mark (star, skull, leaf, sun, arrow, exclaim, diamond, cross, bolt, question) as one stamp
 * whose centre pixel is at `at`, `size` pixels across (an even size is drawn one smaller), flipped and turned by
 * quarter turns. Port of engine/marks.js drawMark; it has no outline of its own (draw it before the outline op).
 * Arguments: name, at, size (3..31), paint, flip, turn (quarter turns clockwise, 0..3).
 */
export const mark = defineGenerator({
  id: 'mark', v: 1, family: 'mark',
  about: 'A small one-colour picture mark (a star, a skull, a leaf ...) of whole pixels, for a stamp on a crate, a sign or an emblem.',
  args: {
    name: word(MARK_NAMES, { about: 'Which picture' }),
    at: point({ about: 'The centre pixel' }),
    size: count(3, 31, { default: 7, about: 'Pixels across (odd; an even size is drawn one smaller)' }),
    paint: paint({ about: 'Its one colour' }),
    flip: flag({ default: false, about: 'Mirror it left to right' }),
    turn: count(0, 3, { default: 0, about: 'Quarter turns clockwise' }),
  },
  cost: () => 1,
  run(a) {
    const n = Math.max(1, Math.floor((Math.round(a.size) - 1) / 2));
    const x = Math.floor(a.at[0]), y = Math.floor(a.at[1]);
    const inside = markIn(a.name, x, y, a.size, { flip: a.flip, turn: a.turn });
    const rows = [];
    for (let j = -n; j <= n; j++) {
      let row = '';
      for (let i = -n; i <= n; i++) row += inside(x + i + 0.5, y + j + 0.5) ? 'a' : '.';
      rows.push(row);
    }
    return [{ kind: 'stamp', at: [x - n, y - n], anchor: 'tl', rows, key: { a: a.paint } }];
  },
});
