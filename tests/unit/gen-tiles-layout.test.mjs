// The `tiles` layout (build item B15; docs/data-sprites.md 2.3, 4.3; engine/gen/tiles.js). A tileset is data: groups
// name their pieces, a material says what the inside and each edge look like (profiles and band rules, never
// functions), and the framework's tile renderer (engine/tiles.js drawBlock, drawSoftBlock, drawThin, drawSlope,
// drawLiquid) draws every piece from it, so pieces join as a code tileset's do. Held to here:
//   - tiles@1 is the site's layout for a tiles body; engine/data-sprite.js finds it through the registry (4.3)
//   - every clip tile.clips names is drawn; a frame is one stamp of the tile's pixels (plus a decal's own primitives)
//   - the port is exact: a data material draws, pixel for pixel, what engine/tiles.js draws from the same material
//     written as functions (insets and ragged edges from profiles times an amount, band rules first match wins, wrap,
//     tuck, ink, round, fill versions and `behind`), for every piece: block, narrow, lanes, thin (thickness, under),
//     slopes, soft ground, a top-down wall's face (low pieces read the same rows), a liquid (level, a travelling rise,
//     surface bands), a floor, hand-drawn pictures (stacks), extra tiles and decals (outlined when they say so)
//   - the clips carry block and place, as blockClips and decoClips leave them
//   - one tile draws in about a millisecond (section 4.2)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { Surface } from '../../engine/surface.js';
import { INK, ramp, col } from '../../engine/color.js';
import { drawTile, drawSoftBlock, drawLiquid, drawBlock, fillBehind, BLOCK_PIECES, NARROW_PIECES, LANE_PIECES, pieceOf } from '../../engine/tiles.js';
import { generator } from '../../engine/gen/index.js';
import { TILE_JOINS } from '../../engine/gen/tiles.js';
import { tileClipNames } from '../../engine/gen/tiles-clips.js';
import { testPieces } from '../fixtures/resolve/helpers.mjs';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
const forest = () => dataSprite(load('tiles-forest.json'), { pieces: testPieces() });
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);

// A small tileset around one material, for the feature tests below.
const SOIL = '#7a5236', GRASS = '#5aa040';
function tileset(group, extra = {}) {
  return {
    format: 'loadout-sprite', version: 2, id: 'tiles-test', name: 'Test tiles', blurb: 'Tiles for a test.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'tileset', role: 'world/tile', view: extra.view ?? 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'soil', label: 'Soil', default: SOIL, material: 'earth' }, { id: 'grass', label: 'Grass', default: GRASS, material: 'plant' }],
    controls: extra.controls ?? [],
    body: { tiles: { tile: 32, profiles: { dips: [0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0], hang: [0, 1, 2, 1, 0], wave: [0, 1, 2, 1] }, groups: [group], ...(extra.tiles ?? {}) } },
    ...(extra.clips ? { clips: extra.clips } : {}),
  };
}
const soil = ramp(SOIL), grass = ramp(GRASS);
// a fill drawn by hand the way the data says it: base, and one rect per version
const handFill = (marks) => { const grids = marks.map((m) => { const s = new Surface(32, 32); s.rect(0, 0, 32, 32, SOIL); if (m) s.rect(...m, soil.dark); return s; }); return (x, y, t, v) => grids[v ?? 0].data[(((y % 32) + 32) % 32) * 32 + (((x % 32) + 32) % 32)]; };
const versions = (marks) => marks.map((m) => (m ? [{ kind: 'rect', at: [m[0], m[1]], size: [m[2], m[3]], paint: 'soil.dark' }] : []));
const draw = (fn) => { const g = new Surface(32, 32); fn(g); return g; };

test('tiles@1 is the site\'s layout for a tiles body; the join kinds are listed', () => {
  const e = generator('tiles', 1);
  assert.ok(e, 'tiles@1 registered');
  assert.equal(e.family, 'layout');
  assert.deepEqual(Object.keys(TILE_JOINS), ['block', 'soft', 'face', 'thin', 'slope', 'liquid', 'floor', 'picture', 'decal', 'extra']);
  for (const v of Object.values(TILE_JOINS)) assert.match(v, /\w+/);
});

test('the forest fixture: every clip tile.clips names is drawn, one stamp a tile, with block kind and decal place', () => {
  const s = forest();
  const def = load('tiles-forest.json');
  assert.deepEqual(Object.keys(s.clips), tileClipNames(def.body.tiles));
  assert.equal(s.clips['grass-top'].block, 'ground');
  assert.equal(s.clips['grass-deco-a'].place, 'above');
  const p = defaultParams(s);
  for (const clip of Object.keys(s.clips)) {
    const g = renderFrame(s, clip, 0, p);
    assert.ok(g.data.some((v) => v >>> 24), `${clip} draws`);
  }
  const fill = renderFrame(s, 'grass-fill', 0, p);
  assert.ok(fill.data.every((v) => v >>> 24 === 255), 'a fill is opaque');
  const { list } = dataFrameList(s, 'grass-top', 0, p);
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'stamp');
  assert.equal(list[0].rows.length, 32);
  assert.ok(list[0].rows.every((r) => r.length === 32));
});

test('the forest\'s material is drawn exactly as engine/tiles.js draws the same material written as functions', () => {
  const s = forest();
  for (const settings of [{}, { edge: 9, bumps: 3, texture: 1 }, { edge: 5, bumps: 0, texture: 0 }]) {
    const p = { ...defaultParams(s), ...settings };
    const edge = Math.round(5 + (p.edge - 5)), bumps = p.bumps;
    const D = load('tiles-forest.json').body.tiles.profiles;
    const fills = ['grass-fill', 'grass-fill-b', 'grass-fill-c'].map((c) => renderFrame(s, c, 0, p));
    const g = ramp(p.grass), so = ramp(p.soil);
    const mat = {
      ink: INK,
      fill: (x, y, t, v) => fills[v ?? 0].data[(((y % 32) + 32) % 32) * 32 + (((x % 32) + 32) % 32)],
      top: {
        depth: edge, wrap: 4, tuck: true, inset: (u) => D.dips[u] * bumps,
        paint: (d, u, t, here) => (d === here ? so.dark : d === 1 ? g.light : d === here - 1 ? g.dark : d === 2 && D.hang[u] === 0 ? g.light : d >= 3 && [2, 3].includes(D.hang[u]) ? g.dark : g.base),
      },
      left: { depth: 1, paint: (d) => (d === 1 ? so.dark : null) },
    };
    for (const clip of Object.keys(s.clips)) {
      const k = pieceOf(clip);
      if (!k || k.kind === 'deco' || (k.kind === 'block' && k.piece.startsWith('fill'))) continue;
      const want = draw((x) => drawTile(x, clip, mat, 0, { thickness: 12 }));
      const got = renderFrame(s, clip, 0, p);
      assert.ok(same(got, want), `${clip} at ${JSON.stringify(settings)}: ${diff(got, want)} pixels differ`);
    }
  }
});

test('narrow and lane pieces, fill versions behind edge pieces, round and ink of the material\'s own', () => {
  const marks = [null, [8, 9, 4, 2], [18, 20, 3, 3]];
  const def = tileset({ name: 'path', kind: 'block', pieces: ['block', 'narrow', 'lanes'], fills: 3,
    material: { ink: 'soil.deep', round: 2, behind: true, fill: { base: 'soil', versions: versions(marks) },
      edges: { top: { depth: 3, inset: { profile: 'dips', amount: 1 }, bands: [{ rows: [1, 1], paint: 'grass.light' }, { rows: [2, 99], paint: 'grass' }] },
        bottom: { depth: 2, ragged: { profile: 'hang', amount: 1 }, bands: [{ rows: [1, 99], paint: 'soil.dark' }] },
        left: { depth: 1, bands: [{ rows: [1, 1], paint: 'soil.dark' }] }, right: { depth: 2, tuck: 1, bands: [{ rows: [1, 2], paint: 'grass.dark' }] } } } });
  const s = dataSprite(def);
  const fill = handFill(marks);
  const P = [0, 1, 2, 1, 0];
  for (const piece of [...BLOCK_PIECES, ...NARROW_PIECES, ...LANE_PIECES]) {
    const behind = fillBehind(piece, 3);
    const mat = {
      ink: soil.deep, round: 2, fill: (x, y, t, v) => fill(x, y, t, v || behind),
      top: { depth: 3, inset: (u) => [0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0][u], paint: (d) => (d === 1 ? grass.light : grass.base) },
      bottom: { depth: 2, ragged: (u) => P[u % 5], paint: () => soil.dark },
      left: { depth: 1, paint: (d) => (d === 1 ? soil.dark : null) }, right: { depth: 2, tuck: 1, paint: () => grass.dark },
    };
    const want = draw((g) => drawBlock(g, piece, mat, 0));
    const got = renderFrame(s, `path-${piece}`, 0, defaultParams(s));
    assert.ok(same(got, want), `${piece}: ${diff(got, want)} pixels differ`);
  }
  for (const [v, clip] of [[1, 'path-fill-b'], [2, 'path-fill-c']]) {
    assert.ok(same(renderFrame(s, clip, 0, {}), draw((g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) g.dot(x, y, fill(x, y, 0, v)); })), clip);
  }
});

test('soft ground: drawSoftBlock from the same data, with no ink', () => {
  const def = tileset({ name: 'moss', kind: 'block', pieces: ['block', 'narrow'], material: { soft: true, ink: 'none', round: 6, fill: { base: 'soil' },
    edges: { top: { depth: 2, inset: { profile: 'wave', amount: 2 }, bands: [{ rows: [1, 1], paint: 'grass.dark' }, { rows: [2, 2], paint: 'grass' }] }, bottom: { depth: 1, bands: [{ rows: [1, 1], paint: 'grass.dark' }] },
      left: { depth: 1, bands: [{ rows: [1, 1], paint: 'grass.dark' }] }, right: { depth: 1, bands: [{ rows: [1, 1], paint: 'grass.dark' }] } } } }, { view: 'top-down' });
  const s = dataSprite(def);
  const W = [0, 1, 2, 1];
  const mat = { ink: null, round: 6, fill: () => SOIL, top: { depth: 2, inset: (u) => W[u % 4] * 2, paint: (d) => (d === 1 ? grass.dark : grass.base) },
    bottom: { depth: 1, paint: () => grass.dark }, left: { depth: 1, paint: () => grass.dark }, right: { depth: 1, paint: () => grass.dark } };
  for (const piece of [...BLOCK_PIECES, ...NARROW_PIECES]) {
    const want = draw((g) => drawSoftBlock(g, piece, mat, 0));
    const got = renderFrame(s, `moss-${piece}`, 0, {});
    assert.ok(same(got, want), `${piece}: ${diff(got, want)} pixels differ`);
  }
});

test('a top-down wall\'s face: one picture, read at the same rows by full and low pieces; its first row, base line and shadow', () => {
  const def = tileset({ name: 'wall', kind: 'block', use: 'wall', pieces: ['block', 'narrow'], material: { fill: { base: 'soil.dark' },
    edges: { top: { depth: 3, bands: [{ rows: [1, 1], paint: 'grass.light' }, { rows: [2, 3], paint: 'soil' }] }, left: { depth: 2, bands: [{ rows: [1, 2], paint: 'soil' }] }, right: { depth: 2, bands: [{ rows: [1, 2], paint: 'soil' }] } },
    face: { draw: [{ kind: 'rect', at: [0, 0], size: [32, 32], paint: 'soil.base' }, { kind: 'rect', at: [0, 6], size: [32, 1], paint: 'soil.dark' }, { kind: 'rect', at: [0, 13], size: [32, 1], paint: 'soil.dark' }, { kind: 'rect', at: [10, 0], size: [1, 6], paint: 'soil.dark' }], top: 'soil.light', base: 'soil.deep', shadow: 'soil.dark' } } }, { view: 'top-down' });
  const s = dataSprite(def);
  const faceAt = (x, y) => (y === 6 || y === 13 || (x === 10 && y < 6) ? soil.dark : SOIL);
  const low = new Set(['strip-l', 'strip-m', 'strip-r', 'single']);
  for (const piece of [...BLOCK_PIECES, ...NARROW_PIECES]) {
    const y0 = low.has(piece) ? 8 : 0;
    const mat = { fill: () => soil.dark, top: { depth: 3, paint: (d) => (d === 1 ? grass.light : SOIL) }, left: { depth: 2, paint: () => SOIL }, right: { depth: 2, paint: () => SOIL },
      face: { paint: (x, y) => (y === 0 ? soil.light : faceAt(x, y + y0)), base: soil.deep, shadow: soil.dark } };
    const want = draw((g) => drawBlock(g, piece, mat, 0));
    const got = renderFrame(s, `wall-${piece}`, 0, {});
    assert.ok(same(got, want), `${piece}: ${diff(got, want)} pixels differ`);
  }
});

test('a thin platform of the block (thickness, its own underside) and slopes; a platform group drawn by hand; a stack; extra tiles', () => {
  const def = tileset({ name: 'grass', kind: 'block', pieces: ['block', 'thin', 'slope'], thickness: 10, under: { depth: 1, bands: [{ rows: [1, 1], paint: 'soil.dark' }] },
    material: { fill: { base: 'soil' }, edges: { top: { depth: 5, tuck: true, wrap: 3, bands: [{ rows: [1, 1], paint: 'grass.light' }, { rows: [2, 99], paint: 'grass' }] }, bottom: { depth: 2, bands: [{ rows: [1, 99], paint: 'soil.dark' }] } } } },
  { tiles: { extra: [{ name: 'stairs-down', label: 'Stairs', draw: [{ kind: 'rect', at: [4, 4], size: [24, 24], paint: 'soil.dark' }] }] } });
  def.body.tiles.groups.push({ name: 'ladder', kind: 'stack', pictures: { cap: [{ kind: 'rect', at: [10, 2], size: [12, 30], paint: 'soil' }], mid: [{ kind: 'rect', at: [10, 0], size: [12, 32], paint: 'soil' }], foot: [{ kind: 'rect', at: [10, 0], size: [12, 28], paint: 'soil' }] } });
  const s = dataSprite(def);
  const mat = { fill: () => SOIL, top: { depth: 5, tuck: true, wrap: 3, paint: (d) => (d === 1 ? grass.light : grass.base) }, bottom: { depth: 2, paint: () => soil.dark } };
  for (const clip of ['grass-thin-l', 'grass-thin-m', 'grass-thin-r', 'grass-slope-up', 'grass-slope-down']) {
    const want = draw((g) => drawTile(g, clip, mat, 0, { thickness: 10, bottom: { depth: 1, paint: () => soil.dark } }));
    const got = renderFrame(s, clip, 0, {});
    assert.ok(same(got, want), `${clip}: ${diff(got, want)} pixels differ`);
  }
  const cap = renderFrame(s, 'ladder-cap', 0, {});
  assert.equal(cap.get(16, 1), col(INK), 'a picture is outlined once');
  assert.equal(cap.get(16, 10), col(SOIL));
  assert.equal(renderFrame(s, 'ladder-mid', 0, {}).get(16, 0), col(SOIL), 'no outline where it leaves the tile');
  assert.equal(renderFrame(s, 'stairs-down', 0, {}).get(10, 10), col(soil.dark));
});

test('a liquid: its body, a surface line at its level that rises by a profile and travels, bands under the line; every frame joins', () => {
  const def = tileset({ name: 'water', kind: 'liquid', frames: 4, fps: 6, material: { fill: { base: 'grass' }, liquid: { level: 6, rise: { profile: 'wave', amount: 1, travel: 1 }, surface: [{ rows: [1, 1], paint: 'grass.light' }, { rows: [2, 2], paint: 'soil.dark' }] } } });
  const s = dataSprite(def);
  assert.equal(s.clips['water-top'].frames, 4);
  const W = [0, 1, 2, 1];
  for (let f = 0; f < 4; f++) {
    const t = f / 4;
    const liquid = { level: 6, rise: (u, tt) => W[(((u - Math.round(tt * 4)) % 4) + 4) % 4], surface: (d) => (d === 0 ? grass.light : d === 1 ? soil.dark : null), body: () => GRASS };
    for (const piece of ['top', 'fill']) {
      const want = draw((g) => drawLiquid(g, piece, liquid, t));
      const got = renderFrame(s, `water-${piece}`, f, {});
      assert.ok(same(got, want), `${piece} frame ${f}: ${diff(got, want)} pixels differ`);
    }
  }
});

test('decals: drawn as their own primitives, outlined only when they say so', () => {
  const s = forest();
  const { list } = dataFrameList(s, 'grass-deco-a', 0, {});
  assert.ok(list.some((p) => p.kind === 'stamp'));
  assert.ok(!list.some((p) => p.kind === 'outline'), 'the tuft says outline: false');
  const def = load('tiles-forest.json');
  def.body.tiles.groups[0].decals[0].outline = true;
  const o = dataFrameList(dataSprite(def, { pieces: testPieces() }), 'grass-deco-a', 0, {});
  assert.equal(o.list.at(-1).kind, 'outline');
});

test('a 16 px tileset is refused with a reason; a group with nothing to draw a piece from is an error naming it', () => {
  const small = tileset({ name: 'grass', kind: 'block', material: { fill: { base: 'soil' }, edges: { top: { depth: 1, bands: [{ rows: [1, 1], paint: 'grass' }] } } } });
  small.body.tiles.tile = 16; small.size = [16, 16]; small.pivot = [8, 8];
  assert.throws(() => dataSprite(small), /16 px/);
  const bare = tileset({ name: 'post', kind: 'stack', material: { fill: { base: 'soil' }, edges: { top: { depth: 1, bands: [{ rows: [1, 1], paint: 'grass' }] } } } });
  assert.throws(() => dataSprite(bare), /post-cap.*picture/);
});

test('one tile draws in about a millisecond (docs/data-sprites.md 4.2: <= 1 ms; held to 3 ms here, the warm median)', () => {
  const s = forest();
  const p = defaultParams(s);
  for (const c of Object.keys(s.clips)) renderFrame(s, c, 0, p);
  const times = [];
  for (let i = 0; i < 9; i++) for (const c of ['grass-top', 'grass-inner-tl', 'grass-slope-up', 'grass-fill-b']) { const t0 = performance.now(); renderFrame(s, c, 0, p); times.push(performance.now() - t0); }
  times.sort((a, b) => a - b);
  const median = times[times.length >> 1];
  assert.ok(median <= 3, `median ${median.toFixed(2)} ms`);
});
