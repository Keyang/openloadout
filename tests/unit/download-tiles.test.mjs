// What a download says about tiles (engine/tile-rules.js): the rules a game's auto-tiling is set up from must be
// what the site's own picker does (engine/tiles.js), for every tileset there is and every arrangement of neighbours.
// The tilesets are found by scanning sprites/, so a new one is covered with no edit here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { librarySprites, libraryCoverage } from '../helpers/library.mjs';
import { classifyTiles, pickClip, pickThin, pickStack, blockClips, thinClips, slopeClips, decoClips, liquidClips, BLOCK_PIECES, NARROW_PIECES, LANE_PIECES } from '../../engine/tiles.js';
import { AROUND, TILE_FAMILIES, LIQUID_FAMILY, tileFamily, rulesFrom, applyRules, tileRules, patternsFrom, meetable } from '../../engine/tile-rules.js';

// every sprite in sprites/, a code file or a data file (tests/helpers/library.mjs); one another builder has half-written is not counted
const tilesets = (await librarySprites()).sprites.map((s) => s.def).filter((def) => def?.meta?.type === 'tileset');
const every = (keys) => Array.from({ length: 1 << keys.length }, (_, m) => Object.fromEntries(keys.map((k, i) => [k, !!(m & (1 << i))])));
const KEYS = AROUND.map(([k]) => k);
const solidOf = (a) => (x, y) => (x === 0 && y === 0) || !!a[AROUND.find(([, dx, dy]) => dx === x && dy === y)?.[0]];
// How a tool that has no rule list chooses (a terrain in Godot): every tile carries one arrangement of its eight
// neighbours, and the tile whose arrangement differs from the cell's in the fewest places is used. Returns every
// tile that is closest, so a test can ask for one clear winner.
const closest = (patterns, around) => {
  const miss = (p) => KEYS.filter((k) => !!p.around[k] !== !!around[k]).length;
  const least = Math.min(...patterns.map(miss));
  return patterns.filter((p) => miss(p) === least).map((p) => p.tile);
};
const CORNERS = AROUND.filter(([, dx, dy]) => dx && dy).map(([k, dx, dy]) => [k, AROUND.find(([, x, y]) => x === dx && y === 0)[0], AROUND.find(([, x, y]) => x === 0 && y === dy)[0]]);

test('there are tilesets to check', () => {
  assert.ok(tilesets.length >= 1, 'at least one sprite in sprites/ is a tileset');
});

test('rulesFrom: a list read top to bottom gives back the picker it was made from, for every arrangement', () => {
  // a picker with an exception inside another tile's cases: "c" wins only when both neighbours are there and a third is not
  const pick = (a) => (a.left && a.right && !a.up ? 'c' : a.left ? 'a' : 'b');
  const rules = rulesFrom(['left', 'right', 'up'], pick);
  for (const a of every(['left', 'right', 'up'])) assert.equal(applyRules(rules, a), pick(a), JSON.stringify(a));
  assert.ok(rules.length <= 4, `a short list (${rules.length} rules)`);
  // a picker no single rule per tile can describe (the tile depends on whether the two neighbours agree) still comes out exact
  const odd = (a) => (a.left === a.right ? 'same' : 'differ');
  const oddRules = rulesFrom(['left', 'right'], odd);
  for (const a of every(['left', 'right'])) assert.equal(applyRules(oddRules, a), odd(a), JSON.stringify(a));
  // an arrangement with no tile gets no rule
  assert.deepEqual(rulesFrom(['up'], (a) => (a.up ? 'x' : null)), [{ tile: 'x', needs: { up: true } }]);
});

test('every tileset: every group\'s rules name its own tiles and replay the picker for all 256 arrangements', () => {
  for (const def of tilesets) {
    const names = Object.keys(def.clips);
    const R = tileRules(def.clips, { view: def.meta.view });
    const T = classifyTiles(def.clips);
    // every tile is accounted for: it is in a group, a decoration, or listed as placed by hand
    for (const n of names) assert.ok(R.tiles[n] || R.other.includes(n), `${def.id}: "${n}" is described`);
    for (const g of R.groups) {
      for (const r of g.rules) assert.ok(g.tiles.includes(r.tile), `${def.id}/${g.name}: rule tile "${r.tile}" is one of the group's tiles`);
      for (const t of g.tiles) assert.ok(names.includes(t), `${def.id}/${g.name}: "${t}" is a tile of the sheet`);
      for (const d of g.decorations) assert.ok(names.includes(d.tile) && typeof d.place === 'string', `${def.id}/${g.name}: decoration ${d.tile}`);
    }
    for (const b of T.blocks.filter((x) => !x.liquid)) {
      const g = R.groups.find((x) => x.name === b.prefix && x.kind === 'block');
      assert.ok(g, `${def.id}: the block "${b.prefix}" is a group`);
      assert.equal(g.use, b.kind, `${def.id}/${b.prefix}: ground, wall or hole as the classifier says`);
      assert.equal(g.solid, def.meta.view !== 'top-down' || b.kind !== 'ground', `${def.id}/${b.prefix}: blocks the way`);
      for (const a of every(KEYS)) {
        const want = pickClip(b, solidOf(a), 0, 0);
        const got = applyRules(g.rules, a);
        const same = got === want || (b.fills.includes(want) && got === b.fills[0]);       // any version of the middle is the middle
        assert.ok(same, `${def.id}/${b.prefix}: ${JSON.stringify(a)} -> picker ${want}, rules ${got}`);
      }
      assert.ok(g.rules.length <= g.tiles.length + 4, `${def.id}/${b.prefix}: about one rule per tile (${g.rules.length} rules, ${g.tiles.length} tiles)`);
      assert.deepEqual(g.versions, b.fills, `${def.id}/${b.prefix}: the versions of the middle`);
    }
    for (const t of T.thins) {
      const g = R.groups.find((x) => x.name === t.prefix && x.kind === 'platform');
      for (const a of every(['left', 'right'])) {
        const k = pickThin((x) => x === 0 || (x === -1 && a.left) || (x === 1 && a.right), () => false, 0, 0);
        assert.equal(applyRules(g.rules, a), t.pieces[k] ?? t.pieces.m, `${def.id}/${t.prefix}: ${JSON.stringify(a)}`);
      }
      // a thin platform is stood on from above only: not a wall, and marked so a tool can set it up as a one-way platform
      assert.equal(g.solid, false, `${def.id}/${t.prefix}: a platform is not a wall`);
      assert.equal(g.oneWay, true, `${def.id}/${t.prefix}: a platform is marked as stood on from above only`);
    }
    for (const s of T.stacks) {
      const g = R.groups.find((x) => x.name === s.prefix && x.kind === 'stack');
      if (!g) { assert.ok(T.blocks.some((b) => b.liquid && b.prefix === s.prefix), `${def.id}/${s.prefix}: a stack with no group is a liquid's foot`); continue; }
      for (const a of every(['up', 'down'])) {
        const k = pickStack((x, y) => y === 0 || (y === -1 && a.up) || (y === 1 && a.down), 0, 0);
        const want = s.pieces[k] ?? s.pieces.mid ?? (k === 'foot' ? null : s.pieces.cap) ?? null;
        assert.equal(applyRules(g.rules, a), want, `${def.id}/${s.prefix}: ${JSON.stringify(a)}`);
      }
    }
    for (const g of R.groups) assert.equal('oneWay' in g, g.kind === 'platform', `${def.id}/${g.name} (${g.kind}): only a platform carries oneWay`);
    for (const b of T.blocks.filter((x) => x.liquid)) {
      const g = R.groups.find((x) => x.name === b.prefix && x.kind === 'liquid');
      assert.ok(g && g.solid === false, `${def.id}/${b.prefix}: a liquid, never solid`);
      assert.equal(applyRules(g.rules, { up: false, down: true }), b.pieces.top, `${def.id}/${b.prefix}: its surface where nothing of it is above`);
      assert.equal(applyRules(g.rules, { up: true, down: true }), b.fills[0], `${def.id}/${b.prefix}: its body below`);
      if (b.pieces.foot) assert.equal(applyRules(g.rules, { up: true, down: false }), b.pieces.foot, `${def.id}/${b.prefix}: its foot where it lands`);
    }
  }
});

test('meetable and patternsFrom: one complete arrangement for each tile, the fullest it is used for, a corner counted only with both its sides', () => {
  // the arrangements a map can make when a corner only counts between two sides that are there: the 47 of a full "blob" set
  const all = meetable(KEYS);
  assert.equal(all.length, 47);
  for (const a of all) for (const [c, s1, s2] of CORNERS) assert.ok(!a[c] || (a[s1] && a[s2]), JSON.stringify(a));
  assert.equal(meetable(['left', 'right']).length, 4, 'sides alone are free');
  // a picker like a block's: "top" whenever nothing is above (it never looks at the corners beside an open side),
  // "in" for an inside corner, "mid" in the middle
  const pick = (a) => (!a.up ? 'top' : a.right && a.down && a.left ? (a.upLeft ? 'mid' : 'in') : 'rest');
  const P = patternsFrom(KEYS, pick);
  const of = (tile) => P.find((x) => x.tile === tile).around;
  const yes = (...on) => Object.fromEntries(KEYS.map((k) => [k, on.includes(k)]));
  assert.deepEqual(P.map((x) => x.tile).sort(), ['in', 'mid', 'rest', 'top']);
  assert.deepEqual(of('mid'), yes(...KEYS));
  assert.deepEqual(of('in'), yes(...KEYS.filter((k) => k !== 'upLeft')), 'every cell but the one diagonal: not only the cells its first-match rule names');
  assert.deepEqual(of('top'), yes('right', 'downRight', 'down', 'downLeft', 'left'), 'the corners beside the open side are not counted');
  for (const x of P) assert.equal(pick(x.around), x.tile, `${x.tile}: the picker gives it for its own arrangement`);
  // a picker that looks at two cells: the other six are said too, as not held
  const ends = patternsFrom(['left', 'right'], (a) => (a.left && a.right ? 'm' : a.left ? 'r' : 'l'));
  assert.deepEqual(ends.find((x) => x.tile === 'm').around, yes('left', 'right'));
  assert.deepEqual(ends.find((x) => x.tile === 'l').around, yes('right'), 'the fullest arrangement it is used for, not the emptiest');
  // an arrangement with no tile gives nothing
  assert.deepEqual(patternsFrom(['up'], (a) => (a.up ? 'x' : null)), [{ tile: 'x', around: yes('up') }]);
});

test('every tileset: each tile a rule picks has one complete arrangement of its eight neighbours, and matching cell by cell finds the picker\'s tile', () => {
  let groups = 0, corners = 0;
  for (const def of tilesets) {
    const R = tileRules(def.clips, { view: def.meta.view });
    const T = classifyTiles(def.clips);
    for (const g of R.groups) {
      assert.ok(Array.isArray(g.patterns), `${def.id}/${g.name}: patterns`);
      if (g.rules.length < 2) continue;
      groups++;
      assert.deepEqual(g.patterns.map((x) => x.tile).sort(), [...new Set(g.rules.map((r) => r.tile))].sort(), `${def.id}/${g.name}: one pattern for each tile the rules pick`);
      assert.deepEqual(g.patterns.map((x) => x.tile), g.tiles.filter((t) => g.patterns.some((x) => x.tile === t)), `${def.id}/${g.name}: in the order of the sheet`);
      for (const x of g.patterns) {
        assert.deepEqual(Object.keys(x.around), KEYS, `${def.id}/${x.tile}: all eight cells, in order`);
        for (const k of KEYS) assert.equal(typeof x.around[k], 'boolean', `${def.id}/${x.tile}.${k}`);
        for (const [c, s1, s2] of CORNERS) assert.ok(!x.around[c] || (x.around[s1] && x.around[s2]), `${def.id}/${x.tile}: the corner ${c} is counted only with both its sides`);
        assert.equal(applyRules(g.rules, x.around), x.tile, `${def.id}/${x.tile}: the rules give it for its own arrangement`);
        assert.deepEqual(closest(g.patterns, x.around), [x.tile], `${def.id}/${x.tile}: matching cell by cell finds it, and only it`);
      }
    }
    // the case the rule list alone gets wrong in such a tool: a real inside corner (everything round the cell but one diagonal)
    for (const b of T.blocks.filter((x) => !x.liquid)) {
      const g = R.groups.find((x) => x.name === b.prefix && x.kind === 'block');
      for (const [corner] of CORNERS) {
        const a = Object.fromEntries(KEYS.map((k) => [k, k !== corner]));
        const picked = pickClip(b, solidOf(a), 0, 0);
        const want = b.fills.includes(picked) ? b.fills[0] : picked;
        assert.deepEqual(closest(g.patterns, a), [want], `${def.id}/${b.prefix}: all but ${corner} -> ${want}`);
        if (want !== b.fills[0]) corners++;
      }
    }
  }
  assert.ok(groups > 0, 'a group with rules to check');
  assert.ok(corners > 0, 'a tileset with inside corners to check');
});

test('a block made by the helper with every optional piece: lanes and narrow pieces come out of the rules too', () => {
  const clips = { ...blockClips('road', { narrow: true, lanes: true, fills: 3 }), ...thinClips('road'), ...slopeClips('road'), ...decoClips('road', ['on', 'above']), ...liquidClips('lava', { fills: 2 }), 'sign': { frames: 1, fps: 1, loop: true } };
  const R = tileRules(clips);
  const b = classifyTiles(clips).blocks.find((x) => x.prefix === 'road');
  const g = R.groups.find((x) => x.name === 'road' && x.kind === 'block');
  for (const a of every(KEYS)) {
    const want = pickClip(b, solidOf(a), 0, 0), got = applyRules(g.rules, a);
    assert.ok(got === want || (b.fills.includes(want) && got === b.fills[0]), `${JSON.stringify(a)} -> picker ${want}, rules ${got}`);
  }
  assert.equal(applyRules(g.rules, { up: true, right: true, down: true, left: true }), 'road-cross', 'four arms and no diagonal: the crossing');
  assert.deepEqual(R.other, ['sign'], 'a name outside the scheme is listed as placed by hand');
  assert.deepEqual(g.decorations, [{ tile: 'road-deco-a', place: 'on' }, { tile: 'road-deco-b', place: 'above' }]);
  assert.equal(R.groups.find((x) => x.name === 'lava').kind, 'liquid');
  assert.equal(R.groups.find((x) => x.kind === 'slope').tiles.length, 2);
  // a block with only some of its pieces still gets rules that agree with the picker (it uses the nearest piece)
  const few = Object.fromEntries(Object.entries(blockClips('mud')).filter(([n]) => !/inner|bottom/.test(n)));
  const fb = classifyTiles(few).blocks[0], fg = tileRules(few).groups[0];
  for (const a of every(KEYS)) assert.equal(applyRules(fg.rules, a), pickClip(fb, solidOf(a), 0, 0), JSON.stringify(a));
});

test('the naming scheme: every piece name the tile helper knows belongs to a family with a plain sentence', () => {
  const pieces = [...BLOCK_PIECES, 'fill-b', 'fill-c', ...NARROW_PIECES, ...LANE_PIECES];
  for (const p of pieces) assert.ok(tileFamily(`x-${p}`), `"${p}" has a family`);
  for (const n of ['x-thin-l', 'x-thin-m', 'x-thin-r', 'x-slope-up', 'x-slope-down', 'x-cap', 'x-mid', 'x-foot', 'x-deco-a']) assert.ok(tileFamily(n), `"${n}" has a family`);
  assert.equal(tileFamily('stairs-down'), null, 'a name outside the scheme has none');
  for (const f of [...TILE_FAMILIES, LIQUID_FAMILY]) {
    assert.ok(f.id && f.names && f.words.length > 20, `${f.id}: named and explained`);
    assert.ok(!/\b(clip|params?|prefix|sprite)\b/i.test(f.words), `${f.id}: everyday words ("${f.words}")`);
  }
  assert.equal(tileFamily('x-left').id, 'corner', '"left" is a top corner, not a side');
  assert.equal(tileFamily('x-side-l').id, 'edge');
});

test('the scan covers every sprite file, code and data alike, and names any that did not load', async (t) => t.diagnostic(await libraryCoverage()));
