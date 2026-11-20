// The library tilesets ported as data in build item B15b (docs/data-sprites.md section 10: "B15 ports all 13 tilesets'
// materials in the test suite before migration"; tests/unit/gen-tiles-materials.test.mjs lists what is ported and what
// each of the others still needs). Each port is a fixture in tests/fixtures/v2/tiles/ made from the code tileset, and is
// held here to what a redraw must keep and to how close it is:
//   - the quality bar (quality/sprite.js checkSprite) with no errors: every join exact at every tested setting
//   - the code tileset's id, meta, every tile with its block kind and decal place, and its control keys and kinds
//   - the download's tile rules and patterns, the picker replaying them, and the playground's level laid out tile for
//     tile as from the code tileset (as tests/unit/gen-tiles-rules.test.mjs holds the B15 ports)
//   - PIXELS: where the port is exact, every tile at a grid of settings (every whole step of the stepped sliders, every
//     threshold of the others and both sides of it, every option and toggle, other colours) is the code tileset's
//     pixel for pixel
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, renderSheet, defaultParams } from '../../engine/sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { tileRules, AROUND, applyRules } from '../../engine/tile-rules.js';
import { classifyTiles, pickClip } from '../../engine/tiles.js';
import { tileIndex, levelFeatures, makeLevel, levelTiles } from '../../app/play/level.js';
import { codeSprite } from '../helpers/library.mjs';

const platformsCode = await codeSprite('tiles-platforms');   // the frozen copy once the library's is redrawn

const FIX = new URL('../fixtures/v2/tiles/', import.meta.url);
const load = (f) => JSON.parse(fs.readFileSync(new URL(f, FIX), 'utf8'));
const soundIndex = new Set(fs.readdirSync(new URL('../../sounds/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));

/** Every combination of the axes ({ key: [values] }), each a settings object. */
const grid = (axes) => Object.entries(axes).reduce((sets, [k, vs]) => sets.flatMap((s) => vs.map((v) => ({ ...s, [k]: v }))), [{}]);

// The ports: the fixture, the code tileset, its view, and the settings at which it is the code's pixel for pixel
// (null where the port is a redraw and not exact).
export const PORTS = [
  { id: 'tiles-platforms', file: 'tiles-platforms.json', code: platformsCode, view: 'side', writer: '../helpers/ports/tiles-platforms.mjs',
    exact: [
      grid({ style: ['planks', 'logs', 'slab'], thickness: [8, 9, 10, 11, 12, 13, 14], rungs: ['wide', 'close'], wear: [0, 0.1, 0.3, 0.35, 0.36, 0.5, 0.65, 0.66, 0.7, 0.75, 0.76, 0.9, 1] }),
      grid({ style: ['planks', 'logs', 'slab'], thickness: [8, 14], wood: ['#5a3a22', '#f0ead8'], rope: ['#c98a4a'], leaf: ['#e08a2c', '#a4c44a'] }),
    ].flat() },
];

for (const P of PORTS) {
  const data = () => dataSprite(load(P.file));

  test(`${P.id}: the port passes the quality bar with no errors (every join exact)`, () => {
    const r = checkSprite(data(), { soundIndex, validateMeta });
    assert.deepEqual(r.errors, []);
  });

  test(`${P.id}: the port keeps the code tileset's id, meta, every tile with its block kind and place, and its control keys and kinds`, () => {
    const s = data();
    assert.equal(s.id, P.code.id);
    assert.deepEqual(s.meta, P.code.meta);
    assert.deepEqual(Object.keys(s.clips).sort(), Object.keys(P.code.clips).sort());
    for (const [n, e] of Object.entries(s.clips)) {
      assert.equal(e.block, P.code.clips[n].block, `${n} block`);
      assert.equal(e.place, P.code.clips[n].place, `${n} place`);
    }
    for (const [k, c] of Object.entries(P.code.params)) {
      assert.ok(Object.hasOwn(s.params, k), `control ${k} kept`);
      assert.equal(s.params[k].kind, c.kind, `control ${k} kind`);
    }
  });

  test(`${P.id}: the download's tile rules are the code tileset's, the picker replays them, and the playground lays out the same level`, () => {
    const s = data();
    const noLabels = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'label' ? undefined : v)));
    const mine = tileRules(s.clips, { view: P.view }), theirs = tileRules(P.code.clips, { view: P.view });
    assert.deepEqual(noLabels(mine), noLabels(theirs));
    const p = defaultParams(s);
    assert.deepEqual(noLabels(describeSheet(s, renderSheet(s, p).meta, p).tiles.groups), noLabels(theirs.groups));
    const T = classifyTiles(s.clips);
    for (const b of T.blocks.filter((x) => !x.liquid)) {
      const group = mine.groups.find((g) => g.name === b.prefix);
      for (let m = 0; m < 256; m++) {
        const around = Object.fromEntries(AROUND.map(([k], i) => [k, !!(m & (1 << i))]));
        const solid = (x, y) => (x === 0 && y === 0) || !!around[AROUND.find(([, dx, dy]) => dx === x && dy === y)?.[0]];
        const want = pickClip(b, solid, 0, 0), got = applyRules(group.rules, around);
        const fills = new Set(b.fills);
        assert.ok(got === want || (fills.has(got) && fills.has(want)), `${b.prefix} ${m}: rules say ${got}, the picker ${want}`);
      }
    }
    const mode = P.view === 'side' ? 'side' : 'top';
    const build = (clips) => { const index = tileIndex([{ key: 'x', names: Object.keys(clips), clips }]); const level = makeLevel(mode, levelFeatures(index, mode)); return { level, ...levelTiles(level, index) }; };
    const a = build(s.clips), b = build(P.code.clips);
    assert.deepEqual(a.tiles, b.tiles);
    assert.deepEqual(a.level.cells, b.level.cells);
  });

  if (P.writer) {
    test(`${P.id}: the fixture is what its writer (tests/helpers/ports/) writes, so it can be audited and written again`, async () => {
      const W = await import(P.writer);
      const def = W.tilesPlatformsPort();
      assert.equal(fs.readFileSync(new URL(P.file, FIX), 'utf8'), W.fixtureText(def), `node tests/helpers/ports/${P.id}.mjs --write`);
      assert.match(def.made.by, /tests\/helpers\/ports\//);
    });
  }

  if (P.exact) {
    test(`${P.id}: every tile is the code tileset's pixel for pixel at ${P.exact.length} settings`, () => {
      const s = data(), dd = defaultParams(s), dc = defaultParams(P.code);
      for (const set of P.exact) for (const [clip, c] of Object.entries(P.code.clips)) for (let f = 0; f < (c.frames ?? 1); f++) {
        const a = renderFrame(s, clip, f, { ...dd, ...set }).data, b = renderFrame(P.code, clip, f, { ...dc, ...set }).data;
        let n = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
        assert.equal(n, 0, `${clip} frame ${f} at ${JSON.stringify(set)}: ${n} px differ`);
      }
    });
  }
}
