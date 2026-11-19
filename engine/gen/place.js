// Placing generators (docs/data-sprites.md 3.3, family "place"): put one thing (a primitive, a piece or another
// generator) at many points. Started by B2 with row@1, which also proves nested calls through the registry; scatter and
// grid land with the layouts that need them (B14, B15), one defineGenerator each, test first, goldens.
import { defineGenerator } from './registry.js';
import { point, count, place, flag } from './args.js';

const at = (v, snap) => (snap ? Math.round(v) + 0 : v);

/**
 * row@1: `count` copies of one thing evenly along a line from `from` to `to`, ends included (one copy sits halfway): the
 * rivets on a crate's strap, nails along a board, studs on a belt. The thing is a primitive positioned by `at`, a piece
 * { use, v } or a generator call with an `at` argument; each copy gets its point as `at`. Arguments: from, to, count
 * (1..64), place, snap (true: points rounded to whole pixels).
 */
export const row = defineGenerator({
  id: 'row', v: 1, family: 'place',
  about: 'Copies of one thing placed evenly along a line, ends included: rivets on a strap, nails along a board.',
  args: {
    from: point({ about: 'Where the first copy goes' }),
    to: point({ about: 'Where the last copy goes' }),
    count: count(1, 64, { about: 'How many copies' }),
    place: place({ about: 'The thing to copy' }),
    snap: flag({ default: true, about: 'Round each point to a whole pixel' }),
  },
  keyable: ['count'],
  cost: (a, { costOf }) => a.count * costOf(a.place),
  run(a, ctx, { call }) {
    const out = [];
    for (let i = 0; i < a.count; i++) {
      const t = a.count === 1 ? 0.5 : i / (a.count - 1);
      const p = [at(a.from[0] + (a.to[0] - a.from[0]) * t, a.snap), at(a.from[1] + (a.to[1] - a.from[1]) * t, a.snap)];
      const thing = a.place;
      if (Object.hasOwn(thing, 'gen')) out.push(...call({ ...thing, at: p }, ctx));
      else if (Object.hasOwn(thing, 'use') && !Object.hasOwn(thing, 'kind')) out.push({ kind: 'use', ...thing, at: p });
      else out.push({ ...thing, at: p });
    }
    return out;
  },
});
