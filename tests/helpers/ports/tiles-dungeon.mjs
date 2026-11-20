// Writer of sprites/tiles-dungeon.json (migration batch M5), kept for audit as B15b kept
// tests/helpers/ports/tiles-platforms.mjs: B15's dungeon redraw (tests/fixtures/v2/tiles/tiles-dungeon.json) with the
// floor's three versions traced from the code tileset for every style (joints, darker stones, glints, pits, cracks,
// moss, wet streaks: in place at every Texture, Wear and Damp threshold the code has), the stairs and the wall's brick
// face traced from the code, and the pit's last course.
//
// Colours: every traced pixel is written in the paint that gives the code's colour at that pixel under every swatch of
// the colours it follows (tiles-trace.mjs lookMap), so a person who picks another Stone, Floor or Slime colour sees the
// code's tileset. Colours the code mixes that no palette slot holds (the steps' half tones, the wall's wet runs, the
// skull's sockets, the moss on the floor, the wall's lit brick tops) are colour rules written in place (a paint may be a
// colour rule, docs/data-sprites.md 2.6): the palette keeps to its 12 slots. The darker stones and the joints are the
// code's stoneShade (engine/paving.js), named as the framework colour rule stoneShade (engine/data-rules.js, review
// round 2): the first mix towards the joint tone that every look keeps apart from the floor, worked out for whatever
// colour the person picks. The glint is the code's textureLight from half way, a derived slot (a paint written in place
// may not hold `from`, which reads as a binding). Every paint is chosen under the swatches and under colours off them
// (OFF below), so it follows the code's colour maths, not only its colours at the swatches.
//
// Usage: node tests/helpers/ports/tiles-dungeon.mjs           (says whether sprites/tiles-dungeon.json is what this writes)
//        node tests/helpers/ports/tiles-dungeon.mjs --write   (writes it)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { defaultParams, renderFrame } from '../../../engine/sprite.js';
import { fixtureText } from './tiles-platforms.mjs';
import { lookMap, traceGrid } from './tiles-trace.mjs';

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-dungeon.json', import.meta.url));

const code = await codeSprite('tiles-dungeon');   // the frozen copy (tests/fixtures/code-sprites/)
const D = defaultParams(code);
const def = JSON.parse(fs.readFileSync(new URL('../../fixtures/v2/tiles/tiles-dungeon.json', import.meta.url), 'utf8'));
delete def.made;
const misses = new Map();
const SW = { stone: code.params.stone.swatches, floor: code.params.floor.swatches, growth: code.params.growth.swatches };
const mixRule = (of, w, amount) => ({ rule: 'mix', of, with: w, amount });
/**
 * Colours off every swatch the paints are also chosen under: the review's, a spread of hues and values, and colours at
 * which the code's darker stones (stoneShade from 0.25) and its brick and cobble joints (from 0.55) differ, which they do
 * for about one colour in forty and at no swatch (so the darker stones are told from the joints).
 */
const OFF = ['#3a6ea8', '#e37f2d', '#520bed', '#a3109b', '#025d28', '#4216b0', '#d8dde4', '#2a2622', '#7fbf3f', '#f2e94e',
  '#626b19', '#7799ff', '#ff99aa', '#33eeaa'];

// ---- the palette ---------------------------------------------------------------------------------------------------
const tt = { rule: 'textureTone', of: 'floor' };
/** The code's stoneShade(floor, textureTone(floor), start), as the framework colour rule of that name (engine/data-rules.js). */
const shadeRule = (start) => ({ rule: 'stoneShade', of: 'floor', with: tt, start });
// the joints and cracks: the code's joint tone per style (stoneShade from 0.85 for slabs, 0.55 for bricks and cobbles)
def.palette.push({ id: 'joint', material: 'stone', derive: { rule: 'choose', when: { style: ['slabs'] }, then: shadeRule(0.85), else: shadeRule(0.55) } });
// the slime oozing into the pit and the moss at the foot of the wall: the code's textureTone of the growth against the stone
def.palette.find((x) => x.id === 'ooze').derive = { rule: 'textureTone', of: 'growth', against: 'stone' };
// the darker stones a busy floor has: stoneShade from a quarter of the way. The wall's wet runs (B15's drip slot) and the
// lit tops of its bricks (B15's course slot) are colour rules in place, which leaves two of the 12 slots for this and the glint
def.palette = def.palette.filter((x) => x.id !== 'drip' && x.id !== 'course');
def.palette.push({ id: 'darker', material: 'stone', derive: shadeRule(0.25) });
// the glint on a busy floor: the code's textureLight(floor, floor, 0.5), the first of the floor's mixes towards its light
// from half way that every look keeps apart from it. A slot, because `from` may be written only in a derived slot's rule
def.palette.push({ id: 'glint', material: 'stone', derive: { rule: 'textureLight', of: 'floor', from: 0.5 } });

// ---- the floor -----------------------------------------------------------------------------------------------------
const floorG = def.body.tiles.groups[0];
// the thresholds the code has: Texture (shades, glint), Wear (pits, crack start and length, branch, moss and its size)
const tex = [0.65, 0.75, 0.8, 0.9];
const wearT = new Set([1 / 3, 2 / 3, 1, 0.25, 0.55, 0.8, 0.3, 0.75, 0.9]);
for (let n = 6; n <= 14; n++) wearT.add((n - 5.5) / 9);
const lv = (ts) => [[0, null], ...[...ts].filter((t) => t > 0 && t <= 1).sort((a, b) => a - b).map((t) => [t, [{ atLeast: t }]])];
const axes = [{ key: 'texture', levels: lv(tex) }, { key: 'wear', levels: lv(wearT) }, { key: 'damp', levels: [[false, null], [true, [true]]] }];
const floorRefs = ['floor', 'joint', 'darker', 'floor.dark', 'floor.light', 'wet', 'glint',
  'growth', { rule: 'textureTone', of: 'growth', against: 'floor' },            // the moss in a joint: its tip, its body
  'growth.dark', 'growth.light'];
/** The floor colour the floor's versions are traced at (see below): no two of the floor's mark colours are the same there, for any style. */
const TRACE_FLOOR = '#7799ff';
const floorLooks = [{}, ...[...SW.floor, ...OFF].map((floor) => ({ floor })), ...[...SW.growth, ...OFF].map((growth) => ({ growth }))];
const floorMap = lookMap(code, def, floorRefs, floorLooks, { misses });
// the joints of each style: tile.courses@1 as B15 wrote them, in the joint slot; the marks are traced over them
const courses = floorG.material.fill.versions[0].filter((x) => x.gen === 'tile.courses').map((x) => ({ ...x, paint: 'joint' }));
floorG.material.fill.versions = ['floor-fill', 'floor-fill-b', 'floor-fill-c'].map((clip) => {
  const out = structuredClone(courses);
  for (const style of ['slabs', 'bricks', 'cobbles']) {
    // traced at a floor colour where the joint, the darker stones, the wet streaks, the glint and the moss are all
    // different colours (at the swatches some are the same, so a stamp at one Texture or Wear step left a pixel in the
    // paint of another that only showed the same there); the paints are then chosen under every look as before
    const P = { ...D, style, floor: TRACE_FLOOR };
    const base = renderFrame(code, 'floor-fill', 0, { ...P, texture: 0, wear: 0, damp: false }).data;
    for (const s of traceGrid(code, clip, P, axes, floorMap, base)) { s.when = { style: [style], ...(s.when ?? {}) }; out.push(s); }
  }
  return out;
});
// the light on the puddle in the cracks: the code's textureLight of the puddle (B15's puddle.light differs at Floor #e6c96a)
for (const st of floorG.decals.find((x) => x.name === 'a').draw) for (const [k, v] of Object.entries(st.key)) if (v === 'puddle.light') st.key[k] = { rule: 'textureLight', of: 'puddle' };
// the skull's sockets and nose: the code's mix of the bone's dark tone with the outline colour (B15 drew them in iron)
const skull = floorG.decals.find((x) => x.name === 'b').draw[0];
for (const [k, v] of Object.entries(skull.key)) if (v === 'iron.deep') skull.key[k] = mixRule('bone.dark', 'ink', 0.6);
// the cracks, the puddle's rim, the shade under the bones and under the grate, and the wall's shadow: the code's deepJoint,
// textureTone of the floor (B15 wrote the floor's dark tone, the same at every swatch but not for every colour)
for (const d of floorG.decals) for (const st of d.draw) for (const [k, v] of Object.entries(st.key ?? {})) if (v === 'floor.dark') st.key[k] = tt;
def.body.tiles.groups[1].material.face.shadow = tt;

// ---- the stairs: the code's steps, traced; their half tones are mixes of two tones of the floor or the stone ----------
const tones = (s) => [s, `${s}.light`, `${s}.dark`, `${s}.deep`];
const halves = [];
for (const s of ['floor', 'stone']) {
  const [b, l, d, p] = tones(s);
  for (const [x, y] of [[b, d], [d, p], [b, l], [p, 'ink']]) halves.push(mixRule(x, y, 0.5), mixRule(y, x, 0.5));
}
const stairLooks = [{}];
for (const stone of SW.stone) for (const floor of SW.floor) stairLooks.push({ stone, floor });
OFF.forEach((c, i) => stairLooks.push({ stone: c, floor: OFF[(i + 3) % OFF.length] }, { stone: c }, { floor: c }));
const stairMap = lookMap(code, def, ['ink', ...tones('floor'), ...tones('stone'), ...halves], stairLooks, { misses });
for (const x of def.body.tiles.extra) x.draw = traceGrid(code, x.name, D, [], stairMap, 0);

// ---- the wall's brick face: traced from the code's full face (wall-bottom, rows 0 to 28) at every Texture, Wear and Damp
// step it has (lit brick tops from Texture 0.25, foot moss grows from Wear 0.5, chipped mortar from 0.6, wet runs) -------
const wallG = def.body.tiles.groups[1], face = wallG.material.face;
const faceRefs = ['stone', 'stone.light', 'stone.dark', mixRule('stone', 'stone.light', 0.45), 'growth', 'ooze', mixRule('stone', 'stone.light', 0.7)];
const faceLooks = [{}, ...[...SW.stone, ...OFF].map((stone) => ({ stone })), ...[...SW.growth, ...OFF].map((growth) => ({ growth }))];
const faceAxes = [{ key: 'texture', levels: lv([0.25]) }, { key: 'wear', levels: lv([0.5, 0.6]) }, { key: 'damp', levels: [[false, null], [true, [true]]] }];
{
  // traced against a blank base over the whole tile; rows 29 to 31 (base line and shadow) are the layout's and dropped,
  // so the paints this map could not match there (the outline and the shadow are no face paint) are not reported; the
  // face rows are held exact by tests/unit/library-tiles-m5.test.mjs
  const stamps = traceGrid(code, 'wall-bottom', D, faceAxes, lookMap(code, def, faceRefs, faceLooks), 0);
  face.draw = stamps.map((st) => {
    const rows = st.rows.slice(0, Math.max(0, 29 - st.at[1]));
    return rows.length ? { ...st, rows } : null;
  }).filter((st) => st && st.rows.some((r) => /[^.]/.test(r)));
}

// ---- the pit's inner wall: its last course is a plain band of the stone's dark tone; how many courses show depends on Edge
const pitTop = def.body.tiles.groups[2].material.edges.top;
const at = pitTop.bands.findIndex((b) => Array.isArray(b.rows) && b.rows[0] === 1 && b.rows[1] === 1);
pitTop.bands.splice(at + 1, 0,
  { rows: [13, 99], paint: 'stone.dark' },
  { rows: [9, 12], paint: 'stone.dark', when: { edge: [{ below: 7.5 }] } },
  { rows: [5, 8], paint: 'stone.dark', when: { edge: [{ below: 3.5 }] } });

// the code's clip order: the floor's decals after the stairs (body.tiles.decalOrder, engine/gen/tiles-clips.js)
def.body.tiles.decalOrder = 'last';

// nothing names the slots dropped above (B15's drip and course): their colours are rules in place now
{ const t = JSON.stringify(def); for (const id of ['drip', 'course']) if (t.includes(`"${id}"`) || t.includes(`"${id}.`)) throw new Error(`the slot ${id} is gone but still named`); }

/** The text of sprites/tiles-dungeon.json as this writes it. */
export const written = () => fixtureText(def);
/** Pixels written in a paint that is not the code's colour under every look: { 'clip #hex -> paint': count } (none when exact). */
export const approximations = () => Object.fromEntries(misses);

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const text = written();
  if (process.argv.includes('--write')) { fs.writeFileSync(LIBRARY_FILE, text); console.log('wrote', LIBRARY_FILE, Buffer.byteLength(text), 'bytes'); }
  else { const same = fs.existsSync(LIBRARY_FILE) && fs.readFileSync(LIBRARY_FILE, 'utf8') === text; console.log(same ? 'the library file is what this writes' : 'the library file differs from what this writes (--write to write it)'); process.exitCode = same ? 0 : 1; }
  for (const [k, n] of misses) console.log('  approximate:', k, 'x', n);
}
