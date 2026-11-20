// FROZEN COPY, not a sprite: sprites/tiles-dungeon.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Dungeon tiles: the rooms and corridors under Hearthvale, seen from above (three-quarter view from the south).
//
//   floor-fill, -fill-b, -fill-c    the floor: flagstones with dark joints, in three versions. Nothing else has this
//                                   prefix, so it lies under everything. Version 0 is bare but for its joints
//   wall-left -top -right ...       the wall (13 pieces and the seven narrow ones): a dark cap with a lighter kerb
//                                   round it, and on the bottom row its brick face, a base line and 2 px of shadow.
//                                   One tile deep (wall-strip-*, wall-single) it is the face under a sliver of cap
//   pit-left -top -right ...        a pit (13 pieces and the seven narrow ones): black depth; its north edge shows
//                                   the inner wall going down, course by course into the dark; the other sides are a lip
//   stairs-down, stairs-up          a flight of steps filling one tile, placed by hand (engine/dungeon.js)
//   floor-deco-a cracks (a puddle in them when Damp is on), -b bones, -c an iron grate     decals, laid on the floor
//
// What is particular here (the rest is the tile helper's, engine/paving.js and engine/dungeon.js):
//   - four values, kept apart under every whole-bundle look: the floor at its own colour (the lightest), the wall's
//     face at the Stone colour, the wall's cap at Stone's dark tone, the pit near the outline colour
//   - the wall's kerb and the first row of its face are Stone's light tone: that line is what parts cap from face
//   - version 0 of the floor is bare; the marks of the other two are few and lie in different parts of the tile
import { defineSprite, range, choice, color, toggle } from '../../../engine/sprite.js';
import { ramp, mix, INK } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { blockClips, decoClips, pieceOf, drawBlock, patternFill, textureTone, textureLight, drawCourses, courseShift, stoneSpot, stoneTuft, coursedFace } from '../../../engine/tiles.js';
import { paintStone, stoneShade } from '../../../engine/paving.js';
import { crack } from '../../../engine/rock.js';
import { rectIn } from '../../../engine/surface.js';
import { skullIn } from '../../../engine/shapes.js';
import { drawGrate, splatIn } from '../../../engine/plating.js';
import { drawStairs, sunkWall, boneIn } from '../../../engine/dungeon.js';

const HV = PALETTE.hearthvale;
const inner = rectIn(3, 3, 26, 26);          // marks of a fill version stay off the outer 3 px

// ---- the floor ------------------------------------------------------------------------------------------------
// The stones of each style laid in rows: course heights from the top down and the columns of the upright joints in
// each course. No joint on the first or last column. Every version of the fill has the same joints: they differ
// only in their marks.
const PAVING = {
  slabs: { heights: [17, 15], joints: [[10, 29], [4, 20]], round: false, glint: 4, strong: 0.85 },
  bricks: { heights: [8, 8, 8, 8], joints: [[13, 29], [5, 21], [13, 29], [5, 21]], round: false, glint: 3, strong: 0.55 },
  cobbles: { heights: [8, 8, 8, 8], joints: [[3, 11, 20, 28], [7, 15, 23, 30], [2, 10, 18, 26], [6, 13, 22, 29]], round: true, glint: 2, strong: 0.55 },
};
// Which stones take a mark in each version of the fill (counted row by row from the top left): none shared.
const SPREAD = { 1: [0, 5, 3, 6], 2: [2, 7, 1, 4] };
// Where a crack starts in each version and which way it runs (0 = down, PI/2 = right).
const CRACKS = { 1: [20, 7, 0.5], 2: [15, 12, -0.5] };
// Wet streaks, [x, y, px long]: two short lines of light, one under the other, on two stones of a version.
const WET = { 1: [[6, 22, 4], [7, 23, 2], [19, 12, 3]], 2: [[21, 8, 4], [22, 9, 2], [9, 25, 3]] };

// ---- the wall --------------------------------------------------------------------------------------------------
// The bricks of the face: 7 px courses in running bond. Chips, moss at the foot and drips as in the village walls.
const FACE_JOINTS = [[6, 22], [14, 30]];
const FACE_COURSE = 7;
const CHIPS = [[0, 17, 3], [1, 8, 2], [2, 25, 4], [1, 20, 4]];
const NICKS = [[11, 2], [22, 1]];
const nicked = (u) => NICKS.some(([at, n]) => u >= at && u < at + n);
const FOOT_MOSS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0];
const FOOT_MOSS_WORN = [0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0];   // from Wear 0.5
const DRIPS = [[9, 10, 5], [21, 16, 4], [27, 9, 4]];       // wet runs down the face: [column, first row, rows]
// The pit's inner wall: 4 px courses; slime hangs from its rim at these columns, this many px down.
const PIT_JOINTS = [[5, 16, 27], [11, 22], [3, 14, 25]];
const SLIME = { 6: 3, 7: 5, 8: 2, 19: 2, 20: 4, 27: 3, 28: 2 };

// Everything the helpers need, from the controls. The same settings give the same answer, so the last one is kept.
let kept = null;
function materials(p) {
  const key = JSON.stringify(p);
  if (kept && kept.key === key) return kept.m;
  const stone = ramp(p.stone), slime = ramp(p.growth);
  const E = Math.round(p.edge), busy = p.texture, worn = p.wear;
  const depth = INK;                                          // the black of a pit is the outline colour: under a look it stays as dark as the lines

  // ---- the floor: at its own colour, with joints a step or more down ----
  const L = PAVING[p.style], body = p.floor;
  const deepJoint = textureTone(body), joint = stoneShade(body, deepJoint, L.strong), darker = stoneShade(body, deepJoint, 0.25), wet = textureLight(body), glint = textureLight(body, body, 0.5);
  const moss = { light: p.growth, base: textureTone(p.growth, body), dark: textureTone(p.growth, body) };
    const { shift } = courseShift(L.heights, 3);                 // from 3: one of the big slabs then lies clear of the tile's edges
  const floor = [0, 1, 2].map((v) => patternFill(body, (s) => {
    const stones = drawCourses(s, L.heights.map((h, i) => ({ h, joints: L.joints[i] })), { joint, round: L.round, shift });
    if (!v) return;                                            // version 0 is bare: it lies in four cells in ten
    // the stones that lie clear of the tile's edges: only those may change colour (a slab that crosses an edge would
    // show half painted beside another version)
    const free = stones.filter((st) => st.inner), pickAt = (i) => free[(SPREAD[v][i % 4] + Math.floor(i / 4)) % free.length];
    // Texture: towards "Busy" a stone a shade darker (version B first) and a glint. At the default the floor is
    // joints, cracks and moss only: a darker slab in every third cell reads as a chequer
    const shades = !free.length ? 0 : v === 1 ? (busy >= 0.9 && free.length > 3 ? 2 : busy >= 0.65 ? 1 : 0) : busy >= 0.8 && free.length > 3 ? 1 : 0;
    for (let i = 0; i < shades; i++) paintStone(s, pickAt(i), darker, { round: L.round });
    if (busy >= 0.75) { const at = stoneSpot(stones[(v * 3 + 1) % stones.length], 1, v + 11, { w: L.glint, h: 1 }); if (at) s.rect(at[0], at[1], L.glint, 1, glint); }
    // Wear: a pit or two, then a crack (version C first), then a longer one with a branch
    for (let i = 0; i < Math.floor(worn * 3); i++) { const at = stoneSpot(stones[(i * 3 + v * 2) % stones.length], i, v + 3); if (at) s.rect(at[0], at[1], 2, 1, joint); }
    if (worn >= [0, 0.55, 0.25][v]) crack(s, CRACKS[v][0], CRACKS[v][1], CRACKS[v][2], Math.round(5 + worn * 9), joint, { seed: v + 2, clip: inner, branch: worn >= 0.8 });
    // moss in a joint: version B gets a tuft once the floor is a little worn, version C when it is badly worn
    const beds = stones.filter((st) => st.w >= 6 && st.x >= 3 && st.x + st.w <= 29 && st.y >= 5 && st.y <= 26);
    if (beds.length && worn >= [0, 0.3, 0.75][v]) stoneTuft(s, beds[(v * 2 + 1) % beds.length], moss, { big: worn >= 0.9, seed: v });
    // Damp: wet streaks catching the light
    if (p.damp) for (const [x, y, n] of WET[v]) s.rect(x, y, n, 1, wet);
  }));

  // ---- the wall: a dark cap inside a lighter kerb, and a brick face ----
  const cap = stone.dark;
  const kerb = p.stone, kerbLit = stone.light;
  const rim = Math.max(1, Math.round(E * 0.45));
  // the cap covers everything outside a room and has only one version, so it is bare: any mark in it would show as
  // a lattice across the whole map. Texture and Wear act on the kerb and the face
  const capFill = patternFill(cap);
  const course = mix(p.stone, stone.light, 0.45), mossFoot = textureTone(p.growth, p.stone), drip = mix(p.stone, stone.light, 0.7);
  const footMoss = worn >= 0.5 ? FOOT_MOSS_WORN : FOOT_MOSS;
  // the face, `rows` px high above its base line: bricks, each lit along its top (only the wall's own top edge when
  // the texture is plain); moss at the foot; chipped mortar when worn; wet runs when damp
  const bricks = coursedFace({
    rows: 29, course: FACE_COURSE, joints: FACE_JOINTS, body: p.stone, top: course, lit: busy >= 0.25 ? Infinity : 0, joint: stone.dark,
    foot: footMoss, footColour: mossFoot, footTip: p.growth, chips: worn >= 0.6 ? CHIPS : [],
  });
  // `skip`: rows of the face hidden under a sliver of cap (the pieces of a wall one tile deep). The courses are those
  // of the full face with its top rows left out, so a low face and a full one side by side keep their joints in line
  const face = (skip) => (x, y) => {
    if (y === 0) return kerbLit;                               // the front edge of the wall's top catches the light
    const row = y + skip;
    if (p.damp && DRIPS.some(([u, y0, n]) => x === u && row >= y0 && row < y0 + n)) return drip;
    return bricks(x, row);
  };
  const wall = (skip) => ({
    ink: INK,
    round: 1,
    fill: capFill,
    top: { depth: E, inset: (u) => (worn >= 0.5 && nicked(u) ? 1 : 0), paint: (d) => (d === 1 ? kerbLit : d <= rim ? kerb : null) },
    right: { depth: E, paint: (d) => (d === 1 ? kerbLit : d <= rim ? kerb : null) },
    left: { depth: E, paint: (d) => (d <= rim ? kerb : null) },
    face: { paint: face(skip), shadow: deepJoint },
  });

  // ---- the pit: its north edge shows the inner wall going down; the other three sides are a thin lip ----
  // the courses of the inner wall from the rim down: bricks at the Stone colour, and last a plain band of its dark
  // tone, the darkest that every look still keeps apart from the black below
  const courses = Math.ceil((E + 5) / 4), brick = { body: p.stone, joint: stone.dark };
  const sunk = sunkWall({ depth: E + 5, course: 4, joints: PIT_JOINTS, tones: [...new Array(courses - 1).fill(brick), { body: stone.dark }], lit: kerbLit });
  const ooze = textureTone(p.growth, p.stone);
  const pit = {
    ink: INK,
    fill: () => depth,
    top: { depth: E + 5, paint: (d, u) => (p.damp && d <= (SLIME[u] ?? 0) ? (d === SLIME[u] ? p.growth : ooze) : sunk(d, u)) },
    left: { depth: 1, paint: () => kerb },
    right: { depth: 1, paint: () => stone.dark },
    bottom: { depth: 1, paint: () => stone.dark },
  };

  const m = { floor: { fill: (x, y, t, v) => floor[v ?? 0](x, y) }, wallTall: wall(0), wallLow: wall(8), pit, depth, deepJoint, wet };
  kept = { key, m };
  return m;
}
// the wall pieces that are a face under a sliver of cap: their face is 21 rows, not 29
const LOW_FACE = new Set(['strip-l', 'strip-m', 'strip-r', 'single']);

// ---- the decals: drawn straight on the tile, see-through round them, no outline (they lie on the floor) ----------

function cracks(g, p, m) {
  if (p.damp) {
    // water has seeped up through the cracks: a puddle with a dark rim and a line of light on it
    const water = mix(p.floor, HV.water, 0.6), pool = splatIn(16, 17, 11, { seed: 5, lobes: 3, drops: 0, squash: 0.55 });
    g.fill(2, 8, 30, 27, pool, water, { outline: m.deepJoint });
    g.rect(17, 14, 6, 1, textureLight(water)); g.rect(20, 15, 3, 1, textureLight(water)); g.rect(8, 19, 4, 1, textureLight(water));
  }
  crack(g, 15, 10, 0.4, 11, m.deepJoint, { seed: 3 });
  crack(g, 15, 10, 2.3, 8, m.deepJoint, { seed: 6, branch: false });
  crack(g, 15, 10, -1.5, 7, m.deepJoint, { seed: 9, branch: false });
  g.rect(14, 9, 3, 2, m.deepJoint);                             // the chip they start from
}
function bones(g, p, m) {
  const bone = ramp(HV.cream), under = m.deepJoint;
  // two long bones, a rib and a skull lying where they fell; a line of shade under each
  for (const [x0, y0, x1, y1] of [[6, 22, 16, 18], [17, 24, 26, 25]]) {
    g.fill(0, 0, 32, 32, boneIn(x0, y0 + 1, x1, y1 + 1), under);
    g.blob([boneIn(x0, y0, x1, y1)], bone, { shade: 1 });
  }
  g.rect(20, 17, 5, 1, under); g.rect(19, 16, 5, 1, bone.base); g.dot(24, 15, bone.base); g.dot(18, 17, bone.dark);
  const K = skullIn(11.5, 11.5, 9, 9, { teeth: 3 });
  g.rect(8, 16, 8, 1, under);
  g.blob([K.bone], bone, { minus: [K.gaps], shade: 1 });
  for (const hole of [K.sockets, K.nose]) g.fill(4, 4, 20, 20, hole, mix(bone.dark, INK, 0.6));
}
function grate(g, p, m) {
  const iron = ramp(HV.steel);
  drawGrate(g, 7, 8, 18, 16, { frame: iron.deep, bar: iron.deep, slot: m.depth, lit: iron.dark, pitch: 4, upright: true });
  g.rect(7, 24, 18, 1, m.deepJoint);                            // the shade along its lower edge
  if (p.damp) { g.rect(12, 9, 2, 3, p.growth); g.rect(19, 9, 1, 2, p.growth); }   // slime on the bars
}
const DECALS = { 'floor-deco-a': cracks, 'floor-deco-b': bones, 'floor-deco-c': grate };
const one = { frames: 1, fps: 1, loop: true };

export default defineSprite({
  id: 'tiles-dungeon',
  name: 'Dungeon tiles',
  kind: 'Item',
  blurb: 'Flagstone floors, dark walls with a brick face, pits and stairs for top-down dungeon rooms and corridors; change the stone, floor and slime colours, the paving, the kerb, how worn and how damp it is.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['fantasy', 'dungeon'],
    gameTypes: ['turn-based-rpg', 'top-down-rpg'],
    view: 'top-down',
    words: ['dungeon', 'floor', 'flagstones', 'wall', 'bricks', 'pit', 'hole', 'stairs', 'corridor', 'room', 'crypt', 'cellar', 'explore', 'underground'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'wall-bottom',
  params: {
    style: choice('Style', 'slabs', [{ value: 'slabs', label: 'Slabs' }, { value: 'bricks', label: 'Bricks' }, { value: 'cobbles', label: 'Cobbles' }]),
    edge: range('Edge', 5, { min: 3, max: 9, step: 1, lo: 'Thin', hi: 'Deep' }),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    wear: range('Wear', 0.35, { lo: 'New', hi: 'Worn' }),
    damp: toggle('Damp', false),
    // the walls keep to dark stones and the floor to light ones, so no pair of swatches gives a floor as dark as its walls
    stone: color('Stone', HV.slate, [HV.slate, HV.bandit, HV.pine, HV.mage]),
    floor: color('Floor', HV.flagstone, [HV.flagstone, HV.cobble, HV.path, HV.wheat]),
    growth: color('Slime and moss', HV.leaf, swatches('hearthvale', 'growth')),
  },
  clips: {
    'floor-fill': { ...one, label: 'Floor' },
    'floor-fill-b': { ...one, label: 'Floor, version B' },
    'floor-fill-c': { ...one, label: 'Floor, version C' },
    ...blockClips('wall', { kind: 'wall', narrow: true, label: 'Wall' }),
    ...blockClips('pit', { kind: 'hole', narrow: true, label: 'Pit' }),
    'stairs-down': { ...one, label: 'Stairs going down' },
    'stairs-up': { ...one, label: 'Stairs going up' },
    ...decoClips('floor', [{ place: 'on', label: 'Cracks' }, { place: 'on', label: 'Bones' }, { place: 'on', label: 'Iron grate' }]),
  },
  render(g, { clip, t, p }) {
    const m = materials(p);
    if (clip === 'stairs-down') return drawStairs(g, 'down', { tread: p.floor, wall: p.stone });
    if (clip === 'stairs-up') return drawStairs(g, 'up', { tread: p.floor, wall: p.stone });
    const k = pieceOf(clip);
    if (k.kind === 'deco') return DECALS[clip](g, p, m);
    if (k.prefix === 'floor') return drawBlock(g, k.piece, m.floor, t);
    if (k.prefix === 'pit') return drawBlock(g, k.piece, m.pit, t);
    return drawBlock(g, k.piece, LOW_FACE.has(k.piece) ? m.wallLow : m.wallTall, t);
  },
});
