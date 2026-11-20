// The tile generators of build item T2 (engine/gen/tile-ports.js): tile.castle, tile.village.cobbles, tile.village.wood,
// tile.village.wall, tile.meadow, tile.water and tile.shore, each one tile of a library tileset drawn as its code drew it, its colours the paints its call names.
// Here: the goldens harness for each (determinism, pinned output, argument fuzz, cost, loop closure), the stand-in
// colours the ports draw with (all different, and so are their tones), every paint read back as the call named it
// (a pixel in a colour no paint gives is an error, never a stand-in left on the screen), the same drawing on a node
// centred at the origin as in frame pixels, and each call's run time within its cost. That each library tileset draws
// its code's pixels through them is tests/unit/library-tiles-t2.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { SENTINELS, sentinelTable, drawTilePort } from '../../engine/gen/tile-ports.js';
import { col, ramp, INK } from '../../engine/color.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const GENS = ['tile.castle', 'tile.village.cobbles', 'tile.village.wood', 'tile.village.wall', 'tile.meadow', 'tile.water', 'tile.shore'].filter((id) => registry.generator(id, 1));

/** Every paint argument of a tile generator, each given its own name as a slot (so a read-back pixel names the role it was drawn in). */
const paintsOf = (entry) => Object.fromEntries(Object.entries(entry.args).filter(([, t]) => t.type === 'paint').map(([k]) => [k, k]));

test('the seven tile generators are registered, family tile, version 1', () => {
  assert.equal(GENS.length, 7);
  for (const id of GENS) {
    const e = registry.generator(id, 1);
    assert.equal(e.family, 'tile', id);
    assert.ok(e.about.length > 30, id);
    assert.equal(e.args.piece.type, 'word', id);
  }
});

test('the stand-in colours are all different, and so are their light, dark and deep tones, the outline colour and white', () => {
  const seen = new Set([col(INK), col('#ffffff')]);
  assert.ok(SENTINELS.length >= 32, 'room for every paint of the biggest port');
  for (const s of SENTINELS) {
    const R = ramp(s);
    for (const c of [s, R.light, R.dark, R.deep]) { assert.equal(seen.has(col(c)), false, `${s}: ${c} is taken`); seen.add(col(c)); }
  }
  const { C, back } = sentinelTable(['a', 'b'], { a: 'grass', b: { rule: 'textureTone', of: 'grass' } });
  assert.equal(back.get(col(C.a)), 'grass');
  assert.equal(back.get(col(ramp(C.a).dark)), 'grass.dark');
  assert.deepEqual(back.get(col(ramp(C.b).light)), { rule: 'ramp', of: { rule: 'textureTone', of: 'grass' }, tone: 'light' });
  assert.equal(back.get(col(INK)), 'ink');
});

test('a pixel in a colour no paint gives is an error naming the colour, never a stand-in left on the screen', () => {
  const spec = { id: 'tile.probe', roles: [['body', 'x']], settings: {}, draw: (g, { C }) => { g.rect(0, 0, 4, 4, C.body); g.dot(5, 5, '#123456'); } };
  assert.throws(() => drawTilePort(spec, { at: [16, 16], piece: 'p', body: 'stone' }, {}), /#123456/);
  const ok = drawTilePort({ ...spec, draw: (g, { C }) => g.rect(0, 0, 4, 4, ramp(C.body).dark) }, { at: [16, 16], piece: 'p', body: 'stone' }, {});
  assert.deepEqual(ok.map((s) => Object.values(s.key)), [['stone.dark']]);
  assert.deepEqual(ok[0].at, [0, 0]);
});

/** Three golden cases per generator: its first piece at the defaults, a middle piece, its last piece, at the tile's middle and moved. */
function casesOf(entry) {
  const pieces = entry.args.piece.values, paints = paintsOf(entry);
  const mid = pieces[Math.floor(pieces.length / 2)];
  return [
    { args: { at: [16, 16], piece: pieces[0], ...paints } },
    { args: { at: [16, 16], piece: mid, ...paints }, ctx: { t: 0.375, frame: 3, frames: 8, loop: true } },
    { args: { at: [40, 20], piece: pieces.at(-1), ...paints }, ctx: { t: 0.5, frame: 4, frames: 8, loop: true } },
  ];
}

for (const id of GENS) {
  test(`${id}@1 passes the goldens harness`, { timeout: 300_000 }, () => {
    const entry = registry.generator(id, 1);
    checkGeneratorContract(registry, entry, { cases: casesOf(entry) });
  });

  test(`${id}@1: every piece draws, the same on a node centred at the origin (moved by whole pixels) as in frame pixels`, () => {
    const entry = registry.generator(id, 1), paints = paintsOf(entry);
    for (const piece of entry.args.piece.values) {
      const a = registry.runGenerator({ gen: id, v: 1, at: [16, 16], piece, ...paints }, { t: 0.25 });
      assert.ok(a.ok, `${piece}: ${a.errors?.join('; ')}`);
      assert.ok(a.primitives.length >= 1, `${piece} draws`);
      const b = registry.runGenerator({ gen: id, v: 1, at: [0, 0], piece, ...paints }, { t: 0.25 });
      assert.deepEqual(b.primitives.map((s) => ({ ...s, at: [s.at[0] + 16, s.at[1] + 16] })), a.primitives, piece);
    }
  });

  test(`${id}@1: its heaviest piece runs within its cost (0.03 ms a unit, the M2 and M3 ports' rate under load), at fresh settings`, () => {
    const entry = registry.generator(id, 1), paints = paintsOf(entry);
    // every run at settings no earlier run had (a port keeps the last settings' materials), after one warm-up pass; the
    // fastest of seven runs, as the machine's load only ever adds time
    let n = 0;
    const fresh = (piece) => ({ gen: id, v: 1, at: [16, 16], piece, ...paints, ...(entry.args.texture ? { texture: 0.9 - (n++ % 100000) * 1e-6 } : {}), ...(entry.args.wear ? { wear: 1 } : {}) });
    for (const piece of entry.args.piece.values) registry.runGenerator(fresh(piece), { t: 0.5 });
    let worst = 0, cost = 0, at = '';
    for (const piece of entry.args.piece.values) {
      const times = [];
      for (let i = 0; i < 7; i++) { const call = fresh(piece), t0 = performance.now(); const r = registry.runGenerator(call, { t: 0.5 }); times.push(performance.now() - t0); cost = r.cost; }
      const mid = Math.min(...times);
      if (mid > worst) { worst = mid; at = piece; }
    }
    assert.ok(worst <= cost * 0.03, `${id}: ${worst.toFixed(2)} ms for ${at}, over its cost ${cost} at 0.03 ms a unit`);
  });
}
