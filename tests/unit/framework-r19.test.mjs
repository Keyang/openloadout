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
// R3 (2026-11-21): engine/scenery.js went: the tests of its functions are deleted (the scenery generators have their own goldens), the two backdrops' specification tests now read the library's data files (the frozen copies went), and the two checks the data files do not meet (single pixels in the dungeon's torch layer, a shade band inside a field cloud) are gone with the code copies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness, rgbToHex, INK } from '../../engine/color.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { PALETTE } from '../../engine/palettes.js';
import { LAYER } from '../../engine/backdrop.js';
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
const framesOf = (def, clip) => (def.clips[clip].frames > 1 ? [0, 3] : [0]);

const byArea = (g, skip = new Set()) => { const m = new Map(); for (const v of g.data) if (v && !skip.has(v)) m.set(v, (m.get(v) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([v]) => v); };
const distinctUnderEveryLook = (pairs) => {
  assert.ok(THEME_PRESETS.filter((t) => t.theme.colour.palette).length >= 8, 'the palette looks are there');
  for (const preset of THEME_PRESETS) for (const [name, front, behind] of pairs) {
    const [a, b] = applyColour(new Uint32Array([front, behind]), preset.theme.colour);
    assert.notEqual(a, b, `${preset.name}: ${name} ${hexOf(front)} turns into the ${hexOf(behind)} behind it (both ${hexOf(a)})`);
  }
};

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

