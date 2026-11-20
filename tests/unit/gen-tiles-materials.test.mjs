// The 13 library tilesets against the tiles body (build item B15; docs/data-sprites.md section 10, risk "Tile materials
// as band rules may not express every paint function": B15 ports all 13 tilesets' materials in the test suite before
// migration). Two parts:
//   1. NAMES, for every tileset in the library (librarySprites(): code and data files alike, so a tileset already
//      migrated to sprites/<id>.json stays counted, and a new one is covered): its whole clip table can be named by
//      tile.clips from groups, decals and extra tiles, nothing missing and nothing extra.
//   2. MATERIALS: the ones redrawn as data (here, or migrated) pass the quality bar with exact joins
//      (gen-tiles-quality.test.mjs) and match the code tileset's tiles, rules and playground layout
//      (gen-tiles-rules.test.mjs); each of the others is a todo naming what its material needs that the tiles body does
//      not have yet (a generator or a material field).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyTiles, pieceOf } from '../../engine/tiles.js';
import { tileClipNames } from '../../engine/gen/tiles-clips.js';
import { librarySprites, libraryCoverage } from '../helpers/library.mjs';

const { sprites, unloadable } = await librarySprites();
const tilesets = sprites.filter((s) => s.def?.meta?.type === 'tileset' || /^tiles-/.test(s.id));

/** The groups a data tileset would write for a code tileset's clip table (what classifyTiles finds in it). */
function groupsFor(clips) {
  const K = classifyTiles(clips);
  const groups = [];
  for (const b of K.blocks) {
    const has = (p) => Object.hasOwn(clips, `${b.prefix}-${p}`);
    if (b.liquid) groups.push({ name: b.prefix, kind: 'liquid', fills: b.fills.length, ...(b.pieces.foot ? { pieces: ['foot'] } : {}) });
    else groups.push({ name: b.prefix, kind: 'block', pieces: ['block', ...(has('strip-l') ? ['narrow'] : []), ...(has('elbow-tl') ? ['lanes'] : []), ...(has('thin-l') ? ['thin'] : []), ...(has('slope-up') ? ['slope'] : [])], fills: b.fills.length });
  }
  for (const f of K.floors) groups.push({ name: f.prefix, kind: 'floor', fills: f.fills.length });
  for (const t of K.thins) if (!groups.some((g) => g.name === t.prefix)) groups.push({ name: t.prefix, kind: 'platform' });
  for (const s of K.stacks) if (!groups.some((g) => g.name === s.prefix && g.kind === 'liquid')) groups.push({ name: s.prefix, kind: 'stack', pieces: Object.keys(s.pieces) });
  for (const d of K.decals) { const g = groups.find((x) => x.name === d.prefix); if (g) (g.decals ??= []).push({ name: pieceOf(d.clip).piece, place: d.only ?? d.place }); }
  return { tile: 32, groups, extra: K.extras.map((name) => ({ name })) };
}

test('there are 13 or more tilesets in the library to hold to (code or data), none unloadable', () => {
  assert.ok(tilesets.length >= 13, tilesets.map((s) => s.id).join(', '));
  assert.deepEqual(unloadable.filter((u) => /^sprites\/tiles-/.test(u)), []);
});

test('the scan covers every sprite file, code and data alike, and names any that did not load', async (t) => t.diagnostic(await libraryCoverage()));

for (const s of tilesets) {
  test(`${s.file}: tile.clips names its whole clip table from groups, decals and extra tiles`, () => {
    const names = tileClipNames(groupsFor(s.def.clips));
    assert.deepEqual([...names].sort(), Object.keys(s.def.clips).sort());
  });
}

// what is redrawn as data, and where its proof is (a tileset migrated to sprites/<id>.json counts as redrawn too)
const PORTED = {
  'tiles-forest': 'tests/fixtures/v2/tiles-forest.json',
  'tiles-cave': 'tests/fixtures/v2/tiles/tiles-cave.json',
  'tiles-dungeon': 'tests/fixtures/v2/tiles/tiles-dungeon.json',
  'tiles-platforms': 'tests/fixtures/v2/tiles/tiles-platforms.json',   // B15b: pixel for pixel (tests/unit/gen-tiles-ports.test.mjs)
};
// what each of the others needs (read from its code, 2026-11-20; B15b added thresholds in `when`, a fixed white in a
// derived slot's rule and the material check in the piece store), so the migration knows what to add first
const NEEDS = {
  'tiles-castle': 'courses (tile.courses@1 has the joints; drawCourses\' lit and glint, stoneSpot, stoneTuft are not ported), engine/rock.js crack as a generator (its wear thresholds can now be written), the moss cap\'s depth from Overgrowth per column (a band rule reading two settings), drawBattlement and drawArchway as tile generators for its extra tiles',
  'tiles-hive': 'the comb and ooze patterns of engine/hive.js and engine/ooze.js as generators (the material\'s `outside` is there now)',
  'tiles-meadow': 'bandStone (half-buried stones that stay upright along every edge of a soft path) as a band field or generator; soft ground, ink "none" and outside are there',
  'tiles-pit': 'animated rims (engine/shafts.js dashedRim: a band that moves with the frame), shaftWall and depthFill (stars, mist, sparks) as generators',
  'tiles-shore': 'a hole of water with moving shore lines and ripples (engine/water.js, engine/ripples.js) as generators (outside is there now)',
  'tiles-station-floor': 'plating seams, spots, bolts and rim plates (engine/plating.js) as generators (outside is there now); the plate tone (a mix clamped by brightness) as a colour rule (textureTone and textureLight are colour rules now); the vent fan\'s turning blades and the floor light\'s glow as moving decals',
  'tiles-station-walls': 'bulkhead and plating faces (engine/bulkhead.js, engine/plating.js) as generators for a face picture',
  'tiles-village': 'fences (engine/fences.js) and rock marks as generators; soft paths, courses (tile.courses@1) and a coursed face picture are there',
  'tiles-water': 'moving marks in a liquid\'s body (liquidMarks: dashes, blobs, bubbles, glints) as a generator; rise shapes beyond a travelling profile (lava bubbles); falling streaks; the waterfall\'s foot is a picture',
};

for (const [id, file] of Object.entries(PORTED)) {
  test(`${id}: its material as data (${file})`, () => {
    const s = tilesets.find((x) => x.id === id);
    const def = JSON.parse(fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    assert.equal(def.id, id);
    assert.ok(def.body?.tiles, 'a tiles body');
    // every tile it names is one of the library tileset's (the forest fixture redraws its grass only; the ports name them all: gen-tiles-ports)
    if (s) for (const n of tileClipNames(def.body.tiles)) assert.ok(Object.hasOwn(s.def.clips, n), `${n} is a tile of ${id}`);
  });
}

test('every library tileset is either redrawn as data (here or migrated) or has its needs written down', () => {
  for (const s of tilesets) assert.ok(s.data || Object.hasOwn(PORTED, s.id) || Object.hasOwn(NEEDS, s.id), `${s.id}: neither ported nor listed`);
  for (const p of Object.values(PORTED)) assert.ok(fs.existsSync(new URL(`../../${p}`, import.meta.url)), p);
});

for (const [id, need] of Object.entries(NEEDS)) {
  const migrated = tilesets.find((s) => s.id === id)?.data === true;
  test(`${id}: its material as data`, migrated ? {} : { todo: need }, () => {});   // a todo until it is redrawn; migrated, it is held by the quality and rules tests
}
