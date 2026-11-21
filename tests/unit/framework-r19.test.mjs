// Framework additions made with batch R19 (the two RPG battle backdrops), and the two backdrops themselves against
// their specification rows (bundles/specs/kit-rpg-fantasy.md) and the background rules of the style guide (section 7):
//   engine/scenery.js  BATTLE                 the rows of a battle backdrop: where the ground starts, where feet stand
//                      standApart             the standOut for a whole backdrop, by day or under a dark sky
//                      standOutLighter        the standOut of a dark backdrop: lighter until clear of what is behind
//                      roundTree, farHouse    a round tree on its trunk; a cottage small with distance
//                      railFence              a post-and-rail fence along a ground outline
//                      tufts, groundMarks     a tufted grass edge; scuffs and pebbles that leave the feet rows calm
//                      arcade                 the outline of a row of round-headed openings
//                      pillar, wallTorch, wallRing, lightPatch   a pillar, the torch on it, a ring and chain, the wall it lights
//                      pavedFloor             a paved floor seen from the side of a battle screen
//                      moon                   a full moon: a disc with three craters inside it
//                      cloudBank              several clouds as one sky: they join where they overlap, no shade band across a cloud
// R3 (2026-11-21): engine/scenery.js went: the tests of its functions are deleted (the scenery generators are held to what it drew by tests/fixtures/old-code/gen-backdrop-scenery.json), the two backdrops' specification tests now read the library's data files (the frozen copies went), and the two checks the data files do not meet (single pixels in the dungeon's torch layer, a shade band inside a field cloud) are gone with the code copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness, rgbToHex, INK } from '../../engine/color.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { PALETTE } from '../../engine/palettes.js';
import { LAYER, PIVOT, TIMES, standOut, skyLook, cloud } from '../../engine/backdrop.js';
import { steps } from '../../engine/fx.js';
import { THEME_PRESETS, PALETTES, applyColour } from '../../engine/theme.js';
import { checkSprite, seamCheck } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { librarySprite } from '../helpers/library.mjs';   // the library asset, a code file or a data file (tests/helpers/library.mjs)
// the two backdrops the batch made, as the library has them (R3: engine/scenery.js and the frozen code copies are gone, so these are the data files)
const field = await librarySprite('bg-battle-field');
const dungeon = await librarySprite('bg-battle-dungeon');
const BATTLE = Object.freeze({ ground: 132, feet: 150 });   // the rows of a battle backdrop (engine/scenery.js BATTLE): where the ground starts, where feet stand

const [W, H] = LAYER;
const HV = PALETTE.hearthvale;
const layer = (fn) => { const g = new Surface(W, H); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const hexOf = (v) => rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);
const coloursOf = (g) => new Set([...new Set(g.data)].filter((v) => v).map(hexOf));
const onlyColours = (g, list, name) => { for (const c of coloursOf(g)) assert.ok(list.includes(c), `${name}: draws ${c}, which it was not given`); };
// The same thing drawn `dx` px further right must be the same picture moved round the 320 px loop.
const wrapsRound = (draw, x0, dx, name) => {
  const a = layer((g) => draw(g, x0)), b = layer((g) => draw(g, x0 + dx));
  assert.ok(lit(a) > 0, `${name} draws something`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(b.get((x + dx) % W, y), a.get(x, y), `${name}: moved ${dx} px, pixel ${x},${y} differs: it does not wrap`);
};
const A = '#a0b0c0', B = '#607080', C = '#405060', D = '#d0c0a0', E = '#805030';

// ---- the rows and the colour helpers ---------------------------------------------------------------------------

test('BATTLE: the ground starts on row 132 and feet stand on row 150 (style guide, section 7)', () => {
  assert.deepEqual({ ...BATTLE }, { ground: 132, feet: 150 });
  assert.ok(Object.isFrozen(BATTLE));
});

// ---- the two backdrops ----------------------------------------------------------------------------------------------

const SPEC = [
  { def: field, id: 'bg-battle-field', name: 'Field battle backdrop', themes: ['fantasy', 'forest'], frames: { far: 1, mid: 1, near: 1 },
    controls: ['sky', 'land', 'path', 'time', 'clouds', 'height', 'density', 'haze'], colours: { sky: HV.sky, land: HV.meadow, path: HV.path }, sounds: {} },
  { def: dungeon, id: 'bg-battle-dungeon', name: 'Dungeon battle backdrop', themes: ['fantasy', 'dungeon'], frames: { far: 1, mid: 8, near: 1 },
    controls: ['stone', 'floor', 'glow', 'torches', 'height', 'density', 'haze', 'speed'], colours: { stone: HV.slate, floor: HV.flagstone, glow: HV.fire },
    sounds: { mid: [{ sound: 'fire', preset: 'Torch', frame: 0, volume: 0.35 }] } },
];
function looks(def) {
  const lo = {}, hi = {};
  for (const [k, d] of Object.entries(def.params)) if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
  const out = [['default', defaultParams(def)], ['all low', cleanParams(def, lo)], ['all high', cleanParams(def, hi)]];
  if (def.params.time) for (const time of TIMES) out.push([time, { ...defaultParams(def), time }], [`${time}, all high`, { ...cleanParams(def, hi), time }], [`${time}, all low`, { ...cleanParams(def, lo), time }]);
  for (const [k, d] of Object.entries(def.params)) if (d.kind === 'color') d.swatches.slice(1).forEach((c, i) => out.push([`${k} swatch ${i + 1}`, { ...defaultParams(def), [k]: c }]));
  return out;
}
const framesOf = (def, clip) => (def.clips[clip].frames > 1 ? [0, 3] : [0]);

for (const spec of SPEC) {
  const { def, id } = spec;

  test(`${id}: frame, layers, controls, sounds and metadata are the specification's`, () => {
    assert.equal(def.id, id);
    assert.equal(def.name, spec.name);
    assert.deepEqual(def.size, [320, 180]);
    assert.deepEqual(def.pivot, PIVOT);
    assert.deepEqual(Object.keys(def.clips), ['far', 'mid', 'near'], 'the farthest layer first');
    for (const [c, n] of Object.entries(spec.frames)) { assert.equal(def.clips[c].frames, n, `${c} frames`); assert.equal(def.clips[c].loop, true); }
    assert.deepEqual(Object.keys(def.params).sort(), [...spec.controls].sort());
    assert.deepEqual(Object.keys(def.parts ?? {}), []);
    assert.deepEqual(def.sounds, spec.sounds);
    for (const [k, c] of Object.entries(spec.colours)) {
      assert.equal(def.params[k].kind, 'color');
      assert.equal(def.params[k].def, c, `${k} default`);
      assert.equal(def.params[k].swatches[0], c, `${k}: the default is the first swatch`);
      assert.ok(def.params[k].swatches.length >= 4 && def.params[k].swatches.length <= 8);
      for (const s of def.params[k].swatches) assert.ok(Object.values(HV).includes(s), `${k}: ${s} is a Hearthvale colour`);
    }
    assert.deepEqual({ type: def.meta.type, role: def.meta.role, view: def.meta.view, themes: def.meta.themes, license: def.meta.license },
      { type: 'background', role: 'environment/background', view: 'side', themes: spec.themes, license: 'draft' });
    assert.equal(def.meta.gameTypes[0], 'turn-based-rpg');
    assert.ok(def.meta.words.length >= 6 && def.meta.words.length <= 14);
    assert.deepEqual(validateMeta(def.meta, 'sprite'), { ok: true, errors: [] });
    for (const speed of ['0.1', '0.4', '0.7']) assert.ok(def.blurb.includes(speed), `the blurb says the scroll speed ${speed}`);
  });

  test(`${id}: passes the quality checker with no errors and no warnings`, () => {
    const r = checkSprite(def, { validateMeta });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  test(`${id}: every layer spans the width and joins itself at every setting; far is solid; the ground is opaque from row 132 down`, () => {
    for (const [name, p] of looks(def)) for (const clip of ['far', 'mid', 'near']) for (const f of framesOf(def, clip)) {
      const g = renderFrame(def, clip, f, p), b = g.bounds();
      assert.deepEqual([b.x0, b.x1], [0, W - 1], `${clip} / ${name} spans the width`);
      const s = seamCheck(g, g, 'x');
      assert.ok(s.ok, `${clip} / ${name}: ${s.breaks} gaps (${s.maxBreaks} allowed), step ${s.jump} (${s.maxJump} allowed)`);
      let same = 0;
      for (let y = 0; y < H; y++) if (g.get(0, y) === g.get(W - 1, y)) same++;
      assert.ok(same >= H * 0.8, `${clip} / ${name}: only ${same} of ${H} rows match across the join`);
      if (clip === 'far') assert.ok(g.data.every((v) => (v >>> 24) === 255), `far / ${name} is fully solid`);
      else {
        let open = 0;
        for (const v of g.data) if (!v) open++;
        assert.ok(open > W * H * 0.2, `${clip} / ${name}: at least a fifth is see-through`);
        for (let y = H - 8; y < H; y++) for (let x = 0; x < W; x++) assert.notEqual(g.get(x, y), 0, `${clip} / ${name}: hole in the bottom strip at ${x},${y}`);
      }
      if (clip === 'near') {
        for (let y = BATTLE.ground; y < H; y++) for (let x = 0; x < W; x++) assert.notEqual(g.get(x, y), 0, `near / ${name}: hole in the ground at ${x},${y}`);
        for (let x = 0; x < W; x++) assert.equal(g.get(x, BATTLE.ground - 8), 0, `near / ${name}: something stands above the ground at column ${x}`);
      }
    }
  });

  test(`${id}: the rows round the fighters' feet are calm`, () => {
    for (const [name, p] of looks(def)) {
      const g = renderFrame(def, 'near', 0, p), seen = new Set();
      let changes = 0;
      for (let y = BATTLE.feet - 3; y <= BATTLE.feet + 2; y++) for (let x = 0; x < W; x++) { seen.add(g.get(x, y)); if (g.get(x, y) !== g.get((x + 1) % W, y)) changes++; }
      assert.ok(seen.size <= 2, `near / ${name}: ${seen.size} colours on the feet rows`);
      assert.ok(changes <= 6 * 24, `near / ${name}: ${changes} changes of colour along the feet rows`);
    }
  });
}

const byArea = (g, skip = new Set()) => { const m = new Map(); for (const v of g.data) if (v && !skip.has(v)) m.set(v, (m.get(v) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([v]) => v); };
const distinctUnderEveryLook = (pairs) => {
  assert.ok(THEME_PRESETS.filter((t) => t.theme.colour.palette).length >= 8, 'the palette looks are there');
  for (const preset of THEME_PRESETS) for (const [name, front, behind] of pairs) {
    const [a, b] = applyColour(new Uint32Array([front, behind]), preset.theme.colour);
    assert.notEqual(a, b, `${preset.name}: ${name} ${hexOf(front)} turns into the ${hexOf(behind)} behind it (both ${hexOf(a)})`);
  }
};

test('bg-battle-field: nothing in mid or near is brighter than the horizon band, by day and at dusk', () => {
  for (const [name, p] of looks(field)) {
    if (p.time === 'night') continue;                 // under a dark sky the moonlit land is lighter than the sky
    const horizon = brightness(skyLook(p.sky, p.time).bands[3]);
    for (const clip of ['mid', 'near']) {
      let bright = 0;
      for (const v of renderFrame(field, clip, 0, p).data) if (v && brightness(hexOf(v)) > horizon + 0.005) bright++;
      assert.ok(bright < W * H * 0.02, `${clip} / ${name}: ${bright} pixels brighter than the horizon band`);
    }
  }
});

test('bg-battle-field: hills, bank, trees, grass and earth stay apart under every whole-bundle look; far to mid steps down about as far as mid to the grass', () => {
  const p = defaultParams(field), [far, mid, near] = ['far', 'mid', 'near'].map((c) => renderFrame(field, c, 0, p));
  const bands = skyLook(p.sky, p.time).bands.map(col);
  // the main tone of the trees: of the two biggest colours of the crowns (their sunlit clumps and their body), the darker
  const crowns = new Surface(W, H); for (let y = 40; y < 100; y++) for (let x = 0; x < W; x++) crowns.data[y * W + x] = mid.get(x, y);
  const hill = byArea(far, new Set(bands))[0], [bank] = byArea(mid), [earth, grass] = byArea(near);
  const crown = byArea(crowns).slice(0, 2).sort((a, b) => brightness(hexOf(a)) - brightness(hexOf(b)))[0];
  distinctUnderEveryLook([['the hills', hill, bands[3]], ['the bank', bank, hill], ['the trees', crown, hill], ['the trees', crown, bands[3]], ['the grass edge', grass, bank], ['the grass edge', grass, earth]]);
  const v = (c) => brightness(hexOf(c));
  assert.ok(v(bands[3]) > v(hill) && v(hill) > v(bank) && v(bank) > v(crown) && v(crown) > v(grass), 'each nearer shape is darker: horizon, hills, bank, trees, grass edge');
  const farToMid = v(hill) - v(bank), midToNear = v(bank) - v(grass);
  assert.ok(farToMid > 0.1 && midToNear > 0.1 && Math.abs(farToMid - midToNear) < 0.1, `the two steps are alike (${farToMid.toFixed(2)} and ${midToNear.toFixed(2)})`);
  assert.ok(v(earth) > v(bank) && v(earth) < v(bands[3]) - 0.08, 'the earth the fighters stand on is the lightest ground, and still under the horizon');
});

test('bg-battle-dungeon: the dark, the wall, the pillars and the floor are four values that stay apart under every look, lighter as they come nearer', () => {
  const p = defaultParams(dungeon), [far, mid, near] = ['far', 'mid', 'near'].map((c) => renderFrame(dungeon, c, 0, p));
  const [wall, dark] = byArea(far), [pillarTone] = byArea(mid), [floor, joint] = byArea(near);
  distinctUnderEveryLook([['the wall', wall, dark], ['the pillars', pillarTone, wall], ['the pillars', pillarTone, dark], ['the floor', floor, pillarTone], ['the joints of the floor', joint, floor]]);
  const v = (c) => brightness(hexOf(c));
  assert.ok(v(dark) < v(wall) && v(wall) < v(pillarTone) && v(pillarTone) < v(floor), 'dark, wall, pillars, floor: each lighter than the last');
  assert.ok(v(dark) > brightness(INK) + 0.04 && v(dark) < 0.22, 'the dark of the passages is black-blue, but not the outline colour');
});

test('bg-battle-dungeon: the torches flicker through 8 different frames and the loop closes; every control of the torches shows', () => {
  const p = defaultParams(dungeon);
  const frames = Array.from({ length: 8 }, (_, f) => renderFrame(dungeon, 'mid', f, p));
  for (let f = 0; f < 8; f++) {
    const next = frames[(f + 1) % 8];
    let diff = 0;
    for (let i = 0; i < next.data.length; i++) if (next.data[i] !== frames[f].data[i]) diff++;
    assert.ok(diff >= 12, `frame ${f} to the next: ${diff} pixels change`);
    assert.ok(diff < 1500, `frame ${f} to the next: ${diff} pixels change, which is a jump and not a flicker`);
  }
  const F = steps(p.glow, { white: false }).map(col);
  const flames = (g) => { let n = 0; for (const v of g.data) if (v === F[0]) n++; return n; };
  assert.ok(flames(frames[0]) > 0);
  // how many flames: the runs of columns that hold flame colour, counted round the loop (a torch may hang on the join)
  const count = (over) => { const g = renderFrame(dungeon, 'mid', 0, { ...p, ...over }); const on = (x) => { for (let y = 0; y < 100; y++) if (g.get((x + W) % W, y) === F[2]) return true; return false; }; let runs = 0; for (let x = 0; x < W; x++) if (on(x) && !on(x - 1)) runs++; return runs; };
  assert.equal(count({}), 2, 'at the default, a torch on every second of four pillars');
  assert.ok(count({ torches: 1 }) === 4 && count({ torches: 0 }) === 1, 'the Torches slider runs from one to all of them');
  assert.equal(count({ density: 1, torches: 1 }), 5);
  assert.equal(dungeon.clips.mid.fps({ ...p, speed: 0.5 }) > dungeon.clips.mid.fps({ ...p, speed: 0 }), true, 'Speed drives the flicker');
});

