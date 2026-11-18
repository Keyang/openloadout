// Framework additions made with batch S13 (the pit tileset, the warp pad and the starfield of the Derelict kit):
//   engine/shafts.js   dashedRim      the rim of a hole in a hard floor: trim plates with a dashed row of warning lights
//                      shaftWall      the plated inner wall of a shaft, darkening in steps into its depth
//                      depthFill      what is far down a hole: a flat dark with stars, wisps or sparks that drift and fade
//                      trussIn        a lattice girder seen from above, as a shape test
//                      cableRun       the points of a cable that hangs and leans
//   engine/space.js    spaceLook      the bands of open space from one colour
//                      arch           one broad rise across the 320 px: the limb of a planet, the arc of its ring
//                      starField      stars that keep their places when their number changes, and twinkle
//                      nebula         a soft cloud patch in two tones that wraps
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness } from '../../engine/color.js';
import { PALETTES, applyColour } from '../../engine/theme.js';
import { DEPTH_KINDS, dashedRim, shaftWall, depthFill, trussIn, cableRun } from '../../engine/shafts.js';
import { spaceLook, arch, starField, nebula } from '../../engine/space.js';

const VOID = '#141a33', LINE = '#333564', LIP = '#7c8ca5', AMBER = '#f2a030';
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

// ---- engine/shafts.js ------------------------------------------------------------------------------

test('dashedRim: a line, then a row of lights that is the same from both ends of a tile', () => {
  const rim = dashedRim({ depth: 2, line: LINE, housing: LIP, light: AMBER });
  assert.equal(rim.depth, 2);
  for (let u = 0; u < 32; u++) assert.equal(rim.paint(1, u), LINE, 'the first row is the line all along');
  const row = Array.from({ length: 32 }, (_, u) => rim.paint(2, u));
  assert.equal(row.filter((c) => c === AMBER).length, 12, 'three dashes of four');
  for (let u = 0; u < 32; u++) assert.equal(row[u], row[31 - u], `mirrored at ${u}`);
  for (const u of [0, 1, 30, 31]) assert.equal(row[u], null, 'cut at both ends: nothing but the line reaches a corner');
  assert.equal(rim.paint(3, 10), null, 'nothing beyond its depth');
});

test('dashedRim: the lights move with shift and come round after one pitch; joint fills the cut ends', () => {
  const at = (shift) => { const r = dashedRim({ line: LINE, housing: LIP, light: AMBER, shift, joint: VOID }); return Array.from({ length: 32 }, (_, u) => r.paint(2, u)); };
  assert.notDeepEqual(at(0), at(1));
  assert.deepEqual(at(0), at(8));
  assert.equal(at(3)[0], VOID);
  assert.equal(at(3)[31], VOID);
  const none = dashedRim({ line: LINE, housing: LIP });
  assert.ok(Array.from({ length: 28 }, (_, i) => none.paint(2, i + 2)).every((c) => c === LIP), 'no light colour: a plain strip');
});

test('shaftWall: the tones step down, seams take the next tone, and it ends after its rows', () => {
  const wall = shaftWall({ rows: 9, tones: ['#aaaaaa', '#666666', '#333333'], seams: [15, 31] });
  assert.deepEqual([1, 3, 4, 6, 7, 9].map((w) => wall(w, 5)), ['#aaaaaa', '#aaaaaa', '#666666', '#666666', '#333333', '#333333']);
  assert.equal(wall(2, 15), '#666666', 'a seam in the first step is the second tone');
  assert.equal(wall(8, 15), '#333333', 'the last step has no seams');
  assert.equal(wall(10, 5), null);
  assert.equal(wall(0, 5), null);
  const shaded = shaftWall({ rows: 12, tones: ['#aaaaaa', '#666666'], shadow: '#444444' });
  assert.equal(shaded(1, 3), '#444444', 'the row under the rim is in its shadow');
  assert.equal(shaded(2, 3), '#aaaaaa');
  assert.throws(() => shaftWall({ rows: 6, tones: [] }), /tone/);
});

for (const kind of DEPTH_KINDS) {
  test(`depthFill (${kind}): repeats every 32 px, closes its loop, and leaves no single pixels`, () => {
    const tones = { faint: '#363e54', bright: '#c2c9d6', heart: '#ffffff' };
    const frames = Array.from({ length: 8 }, (_, f) => depthFill(VOID, f / 8, { kind, count: 6, seed: 3, tones }));
    const base = col(VOID);
    const grid = (fill) => Array.from({ length: 32 * 32 }, (_, i) => col(fill(i % 32, Math.floor(i / 32))));
    const grids = frames.map(grid);
    assert.deepEqual(grid(depthFill(VOID, 1, { kind, count: 6, seed: 3, tones })), grids[0], 't = 1 is t = 0');
    assert.deepEqual(grid(depthFill(VOID, 0, { kind, count: 6, seed: 3, tones })), grids[0], 'the same every time');
    assert.equal(col(frames[2](5, 9)), col(frames[2](37, -23)), 'the same pixel one tile on');
    assert.ok(new Set(grids.map((g) => g.join())).size >= 6, 'the frames differ');
    grids.forEach((g, f) => {
      const on = (x, y) => g[((y + 32) % 32) * 32 + ((x + 32) % 32)] !== base;
      let marks = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (!on(x, y)) continue;
        marks++;
        assert.ok(on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1), `frame ${f}: a single pixel at ${x},${y}`);
      }
      assert.ok(marks >= 4 && marks < 200, `frame ${f}: ${marks} px of specks`);
    });
  });
}

test('depthFill: more specks are added to the ones already there', () => {
  const tones = { faint: '#363e54', bright: '#c2c9d6' }, base = col(VOID);
  for (const kind of DEPTH_KINDS) for (let f = 0; f < 8; f++) {
    const few = depthFill(VOID, f / 8, { kind, count: 3, seed: 1, tones }), many = depthFill(VOID, f / 8, { kind, count: 7, seed: 1, tones });
    let a = 0, b = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (col(few(x, y)) !== base) { a++; assert.notEqual(col(many(x, y)), base, `${kind} frame ${f}: the speck at ${x},${y} is gone`); }
      if (col(many(x, y)) !== base) b++;
    }
    assert.ok(b >= a);
  }
  assert.equal(col(depthFill(VOID, 0.3, { count: 0, tones })(4, 4)), base, 'no specks: the plain depth');
  assert.throws(() => depthFill(VOID, 0, { kind: 'fish', tones }), /stars, wisps, sparks/);
});

test('trussIn: two chords with lacing between them, inside its width', () => {
  const whole = trussIn(4, 16.5, 28, 16.5, { width: 7, bay: 6 });
  const g = new Surface(32, 32).fill(0, 0, 32, 32, whole, '#ffffff');
  assert.deepEqual(g.bounds(), { x0: 4, y0: 13, x1: 27, y1: 19 });
  for (let x = 4; x < 28; x++) { assert.ok(g.get(x, 13), `upper chord at ${x}`); assert.ok(g.get(x, 19), `lower chord at ${x}`); }
  const open = lit(g);
  assert.ok(open < 24 * 7 * 0.75, 'it is a lattice, not a slab');
  const count = (part) => lit(new Surface(32, 32).fill(0, 0, 32, 32, trussIn(4, 16.5, 28, 16.5, { width: 7, bay: 6, part }), '#ffffff'));
  assert.equal(count('a'), 24);
  assert.equal(count('b'), 24);
  assert.ok(count('web') > 12 && count('web') < open);
  const tilted = new Surface(32, 32).fill(0, 0, 32, 32, trussIn(6, 2, 22, 26, { width: 6 }), '#ffffff');
  assert.ok(lit(tilted) > 60, 'it can lie any way');
  assert.throws(() => trussIn(0, 0, 9, 9, { part: 'roof' }), /part/);
});

test('cableRun: hangs straight down, and leans more the further down it is', () => {
  assert.deepEqual(cableRun(10, 2, 3), [[10, 2], [10, 3], [10, 4], [10, 5]]);
  const pts = cableRun(10, 2, 12, 4);
  assert.deepEqual(pts[0], [10, 2]);
  assert.deepEqual(pts.at(-1), [14, 14]);
  assert.equal(pts.length, 13);
  assert.ok(pts[6][0] - 10 <= 1, 'half way down it has moved a quarter as far');
  for (let i = 1; i < pts.length; i++) assert.ok(Math.abs(pts[i][0] - pts[i - 1][0]) <= 1, 'no breaks');
  assert.deepEqual(cableRun(10, 2, 12, -4).at(-1), [6, 14]);
});

// ---- engine/space.js -------------------------------------------------------------------------------

test('spaceLook: three dark bands, the lightest last, a step of value apart', () => {
  for (const sky of ['#434d6d', '#566182', '#6660b6', '#6b7896', '#a87894']) {
    const look = spaceLook(sky, VOID);
    assert.equal(look.bands.length, 3);
    for (let i = 1; i < 3; i++) assert.ok(brightness(look.bands[i]) - brightness(look.bands[i - 1]) >= 0.03, `${sky}: ${look.bands}`);
    assert.ok(brightness(look.bands[0]) < 0.17 && brightness(look.bands[2]) < 0.4, `${sky}: space stays dark (${look.bands})`);
    assert.equal(look.air, look.bands[2]);
    assert.equal(new Set(applyColour(Uint32Array.from(look.bands.map(col)), { palette: PALETTES[0].name })).size >= 2, true, 'a palette keeps the top and the bottom apart');
  }
});

test('arch: one rise across the layer that repeats every 320 px', () => {
  const limb = arch({ base: 172, height: 30, at: 200 });
  assert.equal(limb(200), 142);
  assert.ok(Math.abs(limb(40) - 172) < 1e-9, 'lowest half way round');
  for (const x of [0, 13.5, 160, 319.5]) {
    assert.ok(Math.abs(limb(x) - limb(x + 320)) < 1e-9);
    assert.ok(limb(x) >= 142 && limb(x) <= 172);
  }
  assert.ok(Math.abs(limb(190) - limb(210)) < 1e-9, 'the same on both sides of its top');
  const flat = arch({ base: 172, height: 30, at: 200, power: 2 });
  assert.ok(flat(120) > limb(120), 'a higher power makes a narrower rise');
});

test('starField: stars keep their places as their number grows, wrap, and are never one pixel', () => {
  const colours = { dim: '#697586', bright: '#e8ecf2', heart: '#ffffff' };
  const draw = (count, t = null, extra = {}) => { const g = new Surface(320, 180); starField(g, { count, seed: 4, top: 4, bottom: 120, colours, t, ...extra }); return g; };
  const few = draw(20), many = draw(60);
  assert.ok(lit(many) > lit(few) * 2);
  for (let i = 0; i < few.data.length; i++) if (few.data[i]) assert.ok(many.data[i], 'a star of the few is gone among the many');
  assert.ok(same(draw(20), few), 'the same every time');
  const b = many.bounds();
  assert.ok(b.y0 >= 4 && b.y1 < 120, `rows ${b.y0}..${b.y1}`);
  for (const g of [many, draw(60, 0.25), draw(60, 0.5)]) {
    const on = (x, y) => y >= 0 && y < 180 && g.data[y * 320 + ((x + 320) % 320)] !== 0;
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) if (on(x, y)) assert.ok(on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1), `a single pixel at ${x},${y}`);
  }
  // a star that hangs over the right edge comes back in on the left
  const edge = new Surface(320, 180);
  starField(edge, { count: 400, seed: 2, top: 0, bottom: 180, colours, plus: 1, big: 1 });
  let left = 0, right = 0;
  for (let y = 0; y < 180; y++) { if (edge.data[y * 320]) left++; if (edge.data[y * 320 + 319]) right++; }
  assert.ok(left > 0 && right > 0, 'stars reach both edges');
});

test('starField: twinkling changes the frames, closes the loop, and can be switched off', () => {
  const colours = { dim: '#697586', bright: '#e8ecf2', heart: '#ffffff' };
  const draw = (t, twinkle) => { const g = new Surface(320, 180); starField(g, { count: 40, seed: 9, colours, t, twinkle }); return g; };
  assert.ok(!same(draw(0, 0.6), draw(0.5, 0.6)));
  assert.ok(same(draw(0, 0.6), draw(1, 0.6)));
  assert.ok(same(draw(0, 0), draw(0.5, 0)), 'no star twinkles');
  assert.ok(same(draw(null, 0.6), draw(0.5, 0)), 'no time: the stars at rest');
});

test('nebula: a patch in two or three tones that stays in its box and wraps', () => {
  const tones = { base: '#3a3f6e', light: '#56589a' };
  const g = new Surface(320, 180);
  nebula(g, 160, 70, 150, 70, tones, 3);
  const b = g.bounds();
  assert.ok(b.x0 >= 160 - 76 && b.x1 <= 160 + 76 && b.y0 >= 70 - 36 && b.y1 <= 70 + 36, JSON.stringify(b));
  assert.ok(b.x1 - b.x0 > 90 && b.y1 - b.y0 > 36, `it fills most of its box (${JSON.stringify(b)})`);
  const count = (s, hex) => s.data.reduce((n, v) => n + (v === col(hex) ? 1 : 0), 0);
  assert.ok(count(g, tones.base) > 600 && count(g, tones.light) > 300, `${count(g, tones.base)} / ${count(g, tones.light)}`);
  assert.equal(lit(g), count(g, tones.base) + count(g, tones.light));
  const three = new Surface(320, 180);
  nebula(three, 160, 70, 150, 70, { ...tones, core: '#8a8ad0' }, 3);
  assert.ok(count(three, '#8a8ad0') > 40 && count(three, '#8a8ad0') < count(three, tones.light), 'a small bright heart');
  assert.equal(lit(three), lit(g), 'the heart adds no outline');
  const over = new Surface(320, 180);
  nebula(over, 300, 70, 150, 70, tones, 3);
  assert.ok(over.get(319, 70) && over.get(4, 70), 'it comes back in on the left');
  const other = new Surface(320, 180);
  nebula(other, 160, 70, 150, 70, tones, 4);
  assert.ok(!same(g, other), 'another seed, another nebula');
});

// ---- added with batch S13, fix round 1 -------------------------------------------------------------------
//   engine/space.js    lighterThan    a shape's colour moved lighter until it is clear of what is behind it (never darker)
//                      noDarkerThan   a tone lifted to a least brightness: the darkest tone of a backdrop, clear of the ink
//   engine/tiles.js    RIM_PIECES, the decal place 'rim'   something that hangs from a block's north edge: scattered over
//                                     the pieces that have that edge, never over a fill

const { lighterThan, noDarkerThan } = await import('../../engine/space.js');
const { blockClips, decoClips, classifyTiles, pickDecal, layoutTiles, pieceOf, DECAL_CHANCE, RIM_PIECES, FACE_PIECES } = await import('../../engine/tiles.js');
const { INK, tone } = await import('../../engine/color.js');

test('lighterThan: a clear step of value above everything behind it, a different colour under every palette, and never darker', () => {
  const band = '#2e3653', dark = '#191f39';
  const under = (hex) => PALETTES.map((pal) => applyColour(new Uint32Array([col(hex)]), { palette: pal.name })[0]);
  for (const c of ['#2e3653', '#2c3350', '#3f456d', '#2fb3a8', '#141a33', '#6660b6']) {
    const out = lighterThan(c, [band], { also: [dark] });
    assert.ok(brightness(out) >= brightness(c) - 1e-9, `${c} went darker: ${out}`);
    assert.ok(brightness(out) - brightness(band) >= 0.08 - 1e-9, `${c} -> ${out} is not a step above the band`);
    const mine = under(out), theirs = under(band);
    assert.ok(mine.every((m, k) => m !== theirs[k]), `${c} -> ${out} turns into the band under a palette`);
    assert.equal(lighterThan(c, [band], { also: [dark] }), out, 'the same every time');
  }
  assert.equal(lighterThan('#2fb3a8', [], {}), '#2fb3a8', 'nothing behind it: unchanged');
  // `also` asks for the step of value only, and a smaller step is a fainter shape
  const faint = lighterThan('#2f3754', [], { also: [band], step: 0.06 });
  assert.ok(brightness(faint) - brightness(band) >= 0.06 - 1e-9 && brightness(faint) < brightness(lighterThan('#2f3754', [band])) + 1e-9);
  const clear = lighterThan('#e8ecf2', [band]);
  assert.equal(clear, '#e8ecf2', 'a colour that is already clear comes back unchanged');
});

test('noDarkerThan: lifts a tone that is as dark as the ink, keeps its hue, and leaves a lighter one alone', () => {
  for (const c of ['#002a54', '#160743', '#000000', INK, tone('#2f8186', -2)]) {
    const out = noDarkerThan(c);
    assert.ok(brightness(out) >= 0.18, `${c} -> ${out} (${brightness(out)})`);
    assert.ok(brightness(out) < 0.2, `${c} -> ${out}: lifted no further than it has to be`);
    assert.ok(brightness(out) > brightness(INK) + 0.04, 'clear of the ink');
  }
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(noDarkerThan('#002a54').slice(i, i + 2), 16));
  assert.ok(b > g && g > r, 'a dark blue is still a blue');
  assert.equal(noDarkerThan('#566182'), '#566182');
  assert.ok(brightness(noDarkerThan('#141a33', 0.3)) >= 0.3, 'another floor');
});

const HOLES = { 'floor-fill': {}, ...blockClips('pit', { kind: 'hole', narrow: true, fills: 3 }), ...decoClips('pit', ['rim', { place: 'rim', label: 'Cables' }, 'on']), ...decoClips('floor', ['on']) };
const DECK = [
  '..............',
  '.OOOOOOOOOO...',
  '.OOOOOOOOOO.O.',
  '.OOOOOOOOOO.O.',
  '.OOOOOOOOOO.O.',
  '.OOOOOOOOOO...',
  '.OOOOOOOOOO...',
  '......OOOOOO..',
  '.O............',
];

test("the decal place 'rim': decoClips keeps it, classifyTiles reads it as an 'on' decal for rim cells only, pickDecal keeps the two apart", () => {
  assert.equal(HOLES['pit-deco-a'].place, 'rim'); assert.equal(HOLES['pit-deco-b'].label, 'Cables'); assert.equal(HOLES['pit-deco-c'].place, 'on');
  const T = classifyTiles(HOLES), pit = T.blocks.find((b) => b.prefix === 'pit');
  assert.deepEqual(pit.decals, [{ clip: 'pit-deco-a', prefix: 'pit', place: 'on', only: 'rim' }, { clip: 'pit-deco-b', prefix: 'pit', place: 'on', only: 'rim' }, { clip: 'pit-deco-c', prefix: 'pit', place: 'on' }]);
  const seen = { on: new Set(), rim: new Set() };
  let n = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const r = pickDecal(pit.decals, 'rim', x, y), o = pickDecal(pit.decals, 'on', x, y, 1);
    if (r) { n++; seen.rim.add(r); }
    seen.on.add(o);
  }
  assert.deepEqual([...seen.rim].sort(), ['pit-deco-a', 'pit-deco-b']);
  assert.deepEqual([...seen.on], ['pit-deco-c'], "'on' never picks a rim decal");
  assert.ok(Math.abs(n / 1600 - DECAL_CHANCE.rim) < 0.06, `${n} of 1600`);
  assert.deepEqual([...RIM_PIECES].sort(), ['col-t', 'elbow-tl', 'elbow-tr', 'left', 'right', 'single', 'strip-l', 'strip-m', 'strip-r', 'tee-t', 'top']);
  assert.ok(Object.isFrozen(RIM_PIECES));
  assert.equal(DECAL_CHANCE.face, 0.33, 'the other chances are as they were');
  assert.deepEqual([DECAL_CHANCE.on, DECAL_CHANCE.floor, DECAL_CHANCE.above, DECAL_CHANCE.below], [0.25, 0.12, 0.3, 0.5]);
});

test("layoutTiles scatters 'rim' decals over the cells of a block that have its north edge, and never over a fill", () => {
  const pieceAt = (L, c, r) => { const t = L.tiles.find((x) => x.col === c && x.row === r && pieceOf(x.clip)?.kind === 'block' && pieceOf(x.clip).prefix === 'pit'); return t ? pieceOf(t.clip).piece : null; };
  const L = layoutTiles(DECK, HOLES, { view: 'top-down', decals: true });
  const placed = L.tiles.filter((t) => /^pit-deco-/.test(t.clip));
  const rims = placed.filter((t) => t.clip !== 'pit-deco-c'), ons = placed.filter((t) => t.clip === 'pit-deco-c');
  for (const t of rims) assert.ok(RIM_PIECES.includes(pieceAt(L, t.col, t.row)), `${t.clip} at ${t.col},${t.row} is on ${pieceAt(L, t.col, t.row)}`);
  for (const t of ons) assert.ok(/^fill/.test(pieceAt(L, t.col, t.row)), `${t.clip} at ${t.col},${t.row} is on ${pieceAt(L, t.col, t.row)}`);
  assert.ok(ons.length > 0, "the block's 'on' decal still goes on its fill");
  // a chance of 1 fills every rim cell and no other; a chance of 0 none
  const all = layoutTiles(DECK, HOLES, { view: 'top-down', decals: { rim: 1, on: 0, floor: 0 } });
  const onRim = all.tiles.filter((t) => /^pit-deco-/.test(t.clip)).map((t) => `${t.col},${t.row}`).sort();
  const rimCells = [];
  for (let r = 0; r < DECK.length; r++) for (let c = 0; c < DECK[0].length; c++) if (RIM_PIECES.includes(pieceAt(all, c, r))) rimCells.push(`${c},${r}`);
  assert.deepEqual(onRim, rimCells.sort());
  assert.ok(rimCells.length >= 13, `${rimCells.length} rim cells: the top row of the big hole, the top of the slot, the hatch`);
  assert.ok(all.tiles.some((t) => t.clip === 'pit-deco-a') && all.tiles.some((t) => t.clip === 'pit-deco-b'), 'both are used');
  assert.equal(layoutTiles(DECK, HOLES, { view: 'top-down', decals: { rim: 0 } }).tiles.filter((t) => /^pit-deco-[ab]$/.test(t.clip)).length, 0);
  // at most one decal to a cell, the same map every time, and none at all without decals: true
  assert.equal(new Set(placed.map((t) => `${t.col},${t.row}`)).size, placed.length);
  assert.deepEqual(layoutTiles(DECK, HOLES, { view: 'top-down', decals: true }).tiles, L.tiles);
  assert.equal(layoutTiles(DECK, HOLES, { view: 'top-down' }).tiles.filter((t) => /-deco-/.test(t.clip)).length, 0);
  // side view: the pieces with the block's top edge
  const side = layoutTiles(['......', '.####.', '.####.', '.####.', '......'], { ...blockClips('rock'), ...decoClips('rock', ['rim']) }, { decals: { rim: 1 } });
  assert.deepEqual(side.tiles.filter((t) => /-deco-/.test(t.clip)).map((t) => `${t.col},${t.row}`).sort(), ['1,1', '2,1', '3,1', '4,1']);
});

test("layoutTiles: a 'rim' decal written in a map is drawn on a rim cell and left out, with a note, on a fill", () => {
  const rows = ['.......', '.OOaOO.', '.OObOO.', '.OOOOO.', '.......', '.....a.', '.......'];
  const L = layoutTiles(rows, HOLES, { view: 'top-down' });
  const at = (c, r) => L.tiles.filter((t) => t.col === c && t.row === r).map((t) => t.clip);
  assert.deepEqual(at(3, 1), ['floor-fill', 'pit-top', 'pit-deco-a'], 'on the top row of the hole');
  assert.deepEqual(at(5, 5), ['floor-fill', 'pit-single', 'pit-deco-a'], 'on its own: a hatch with the rim on every side');
  assert.equal(at(3, 2).length, 2, 'in the middle of the hole: the depth, and nothing hanging in it');
  assert.ok(/^pit-fill/.test(at(3, 2)[1]));
  assert.equal(L.cells[2][3].solid, true);
  assert.deepEqual(L.notes, ["pit-deco-b at 3,2: it hangs from the block's north edge, and this cell (fill) has none"]);
});

test("a wall's 'face' decals are scattered as before now that 'rim' exists, and a wall may have both", () => {
  const WALLS = { 'floor-fill': {}, ...blockClips('wall', { kind: 'wall', narrow: true }), ...decoClips('wall', ['face', 'rim']) };
  const rows = ['........', '.WWWWWW.', '.WWWWWW.', '.WWWWWW.', '........', '.WWWW...', '........'];
  const pieceAt = (L, c, r) => { const t = L.tiles.find((x) => x.col === c && x.row === r && pieceOf(x.clip)?.kind === 'block' && pieceOf(x.clip).prefix === 'wall'); return t ? pieceOf(t.clip).piece : null; };
  const L = layoutTiles(rows, WALLS, { view: 'top-down', decals: { face: 1, rim: 1 } });
  for (const t of L.tiles.filter((x) => x.clip === 'wall-deco-a')) assert.ok(FACE_PIECES.includes(pieceAt(L, t.col, t.row)));
  for (const t of L.tiles.filter((x) => x.clip === 'wall-deco-b')) assert.ok(RIM_PIECES.includes(pieceAt(L, t.col, t.row)) && !FACE_PIECES.includes(pieceAt(L, t.col, t.row)), 'where a piece shows both, the face decal has the cell');
  assert.equal(L.tiles.filter((x) => x.clip === 'wall-deco-a').length, 6 + 4, 'every face cell: the bottom row and the low wall');
  assert.equal(L.tiles.filter((x) => x.clip === 'wall-deco-b').length, 6, 'every cell of the cap\'s north edge');
});
