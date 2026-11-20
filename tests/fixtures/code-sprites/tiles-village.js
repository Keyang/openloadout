// FROZEN COPY, not a sprite: sprites/tiles-village.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Village ground and walls: the paved square, the indoor floor, the garden walls and the fences of the Hearthvale
// village, seen from above (three-quarter view from the south). It lies on the grass of `tiles-meadow`.
//
//   cobble-left  -top  -right          the paving, a block of soft ground (drawSoftBlock): it lies over the grass, and
//   cobble-side-l -fill -side-r        outside its outline it is see-through. No ink: you walk on both. Its border is
//   cobble-bottom-l -bottom -bottom-r  a dark line and, inside it, a row of bigger stones half sunk in the turf
//   cobble-inner-tl -tr -bl -br
//   cobble-fill-b, -fill-c             two more versions of the middle (the first is bare but for its joints)
//   cobble-strip-l -m -r, cobble-col-t -m -b, cobble-single     the paving one tile wide: a lane, its ends, a patch
//   plank-fill, -fill-b, -fill-c       an indoor floor: boards running left to right. Nothing else has this prefix, so
//                                      on a map of this tileset alone it is the floor under everything
//   wall-left -top -right ...          a low stone wall (13 pieces and the seven narrow ones). The top rows are its
//                                      cap, lit; the bottom row is its face, with a base line and 2 px of shadow. One
//                                      tile deep (wall-strip-*, wall-single) it is the face under a sliver of cap
//   fence-h  fence-v  fence-post       a rail fence, placed by hand. Every piece has its post in the bottom right of
//                                      its cell: `fence-h` repeats sideways, `fence-v` up and down, and `fence-post`
//                                      closes the left end of a run and the top of a column (engine/fences.js)
//
// What is particular here (the rest is the tile helper's, engine/paving.js and engine/fences.js):
//   - the paving is drawn a step lighter than its colour (pavingTone) and its joints one step down from that, so it
//     stands apart from the meadow's grass by value: `cobble` and `meadow` are equally light in the palette
//   - the wall's cap, its face and the paving are three different values of the one Stone colour
//   - version 0 of every fill is bare; the other two carry at most six marks (MARKS) at any Texture and Wear, each on
//     a stone of its own, far from the others (spreadStones): Wear's marks come first and Texture's give way to them
//   - the wall's cap has one fill and no versions, so nothing is drawn inside it but its slabs: a mark there would show
//     in every cell of a wall. Wear shows on the cap's edge (nicks) and on the face (chips, more moss)
//   - the border stones are drawn in the paving's own two tones. Where a lane one tile wide bends, forks or crosses
//     itself there is no piece for the inside of the bend, so the border stops for 5 px there and the cobbles run into
//     the corner: in these tones that does not show as a notch (a darker or lighter band would)
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { ramp, mix, brightness, INK } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { blockClips, pieceOf, drawBlock, drawSoftBlock, patternFill, textureTone, textureLight, drawCourses, courseShift, stoneSpot, stoneTuft, coursedFace } from '../../../engine/tiles.js';
import { drawHerringbone, paintStone, pavingTone, stoneShade, spreadStones } from '../../../engine/paving.js';
import { drawFence } from '../../../engine/fences.js';
import { crack } from '../../../engine/rock.js';
import { rectIn } from '../../../engine/surface.js';

const HV = PALETTE.hearthvale;
const inner = rectIn(3, 3, 26, 26);          // marks of a fill version stay off the outer 3 px

// ---- the paving ---------------------------------------------------------------------------------------------
// The stones of each style laid in rows: course heights from the top down and, for each version of the fill, the
// columns of the upright joints in each course. No joint on the first or last column; the versions change only
// the middle joints, so they share their edge lines. (Herringbone is drawHerringbone's own pattern.)
const PAVING = {
  round: {
    heights: [8, 8, 8, 8], round: true, glint: 2,
    joints: [
      [[3, 11, 20, 28], [7, 15, 23, 30], [2, 10, 18, 26], [6, 13, 22, 29]],
      [[3, 12, 19, 28], [7, 14, 22, 30], [2, 9, 18, 26], [6, 14, 21, 29]],
      [[3, 10, 20, 28], [7, 16, 23, 30], [2, 11, 17, 26], [6, 13, 21, 29]],
    ],
  },
  square: {
    heights: [16, 16], round: false, glint: 4,
    joints: [
      [[7, 23], [15, 30]],
      [[7, 23], [15, 30]],
      [[7, 23], [15, 30]],
    ],
    // Flags this big leave no stones clear of the tile's edges to pick out, so the marks of the two other versions
    // are placed by hand, each in another part of the tile: a crack [x, y, angle], a tuft of moss on the joint under
    // the upper course [x, px wide] and two pits [x, y]. (The glint is on the one flag that lies inside the tile.)
    marks: {
      1: { crack: [21, 6, 0.4], tuft: [4, 10], pits: [[11, 11], [22, 26]] },
      2: { crack: [12, 5, -0.5], tuft: [11, 10], pits: [[27, 10], [6, 25]] },
    },
  },
};
// The most marks a version of a fill carries, whatever Texture and Wear are set to (style guide, section 6): as Wear
// adds its marks, Texture's give way.
const MARKS = 6;
// The border: a row of bigger stones half sunk in the turf, in the paving's own tones. KERB: where the joints between
// them stand along each edge (the last stone leads into the first of the next tile). The outline is nicked 1 px at
// every joint, so the border's silhouette is a row of stones; it is level at both ends of every edge (the helper
// pins outlines to the tile boundary there).
const KERB = {
  top: [4, 11, 19, 26],
  bottom: [5, 13, 20, 27],
  left: [5, 12, 20, 27],
  right: [4, 12, 19, 26],
};
// Grass that reaches in over the border: [position along the edge, how far in (0..1 of the Edge control)]. The map is
// seen from the south, so the blades are long only along the bottom edge, where the turf stands in front of the stones.
const BLADES = {
  top: [],
  bottom: [[9, 1], [10, 0.5], [23, 0.7]],
  left: [[16, 0.4]],
  right: [[23, 0.3]],
};
// Which border stones are a shade darker, by the joint that starts them: one to an edge.
const DARKER = { top: 11, bottom: 20, left: 5, right: 19 };
// Where the strip of shade under the turf is two pixels deep instead of one (it starts and ends the same).
const SHADE = [1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1];

// ---- the floor boards and the wall --------------------------------------------------------------------------
// Boards 8 px wide running left to right; each row's end joint stands at another column, so they are staggered.
const BOARDS = [{ h: 8, joints: [11] }, { h: 8, joints: [26] }, { h: 8, joints: [5] }, { h: 8, joints: [19] }];
// Grain: short dark lines along a board, [x, y, px long]; the first so many show, by Texture (the second one's board
// also catches the light). Then Wear's marks: a knot [x, y], a gap opening along a seam [x, y], a scratch [x, y, angle].
// Each version spreads its marks over the tile's six parts (left and right of the top, the middle and the bottom), so
// that no two lie together, and the two versions fill those parts differently.
const GRAIN = {
  1: [[5, 6, 5], [17, 13, 4], [8, 21, 6], [21, 28, 3]],
  2: [[18, 6, 6], [8, 14, 4], [21, 22, 5], [6, 28, 3]],
};
const SCUFFS = {
  1: { knot: [6, 13], gap: [20, 25], scratch: [19, 4, 1.2] },
  2: { knot: [5, 5], gap: [9, 25], scratch: [18, 14, 1.9] },
};
// The coping slabs of the wall's cap, and the courses of rough stone of its face: the columns of the upright joints.
const COPING = [{ h: 16, joints: [9, 25] }, { h: 16, joints: [17, 30] }];
const FACE_JOINTS = [[4, 15, 26], [9, 20, 30], [3, 13, 24], [8, 18, 29]];
const FACE_COURSE = 7;
// Where the face's stones are chipped when the wall is worn: [course, column, row within the course], 2 px each.
const CHIPS = [[0, 20, 3], [1, 6, 2], [2, 17, 4], [1, 27, 4]];
// Where the cap's edge is chipped when the wall is worn: [position along the edge, px long].
const NICKS = [[12, 2], [23, 1]];
const nicked = (u) => NICKS.some(([at, n]) => u >= at && u < at + n);
// Moss at the foot of the wall's face: how many px it stands up at each column (0: bare). It leads from the last
// column into the first.
const FOOT_MOSS = [0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 2, 3, 2, 2, 1, 0, 0, 0, 0, 1, 1, 0, 0];

// Everything the helpers need, from the controls. The same settings give the same answer, so the last one is kept.
let kept = null;
function materials(p) {
  const key = JSON.stringify(p);
  if (kept && kept.key === key) return kept.m;
  const stone = ramp(p.stone), moss = ramp(p.growth);
  const E = Math.round(p.edge), busy = p.texture, worn = p.wear;

  // ---- paving: the body a step lighter than the Stone colour, joints one step down from that ----
  const body = pavingTone(p.stone), deepJoint = textureTone(body), joint = stoneShade(body, deepJoint, 0.55), shade = mix(body, deepJoint, 0.8), glintOn = textureLight(body);
  const mossOn = { light: moss.light, base: p.growth, dark: textureTone(p.growth, body) };
  const L = PAVING[p.style];
  // a pit on a stone: where stoneSpot finds room, else (a brick 3 px across) the middle of its face
  const pitAt = (st, i, v) => stoneSpot(st, i, v + 3) ?? (st.w >= 5 && st.h >= 3 && st.x >= 3 && st.y >= 3 ? [st.x + (st.w >> 1) - 1, st.y + (st.h >> 1)] : null);
  const bed = (st) => st.w >= 5 && st.y >= 5 && st.y <= 26;                 // a tuft needs a free row above its stone
  const paving = [0, 1, 2].map((v) => patternFill(body, (s) => {
    let stones;
    if (L) {
      const { shift, round } = courseShift(L.heights, 3);
      const courses = L.heights.map((h, i) => ({ h, joints: L.joints[i === round ? 0 : v][i] }));
      stones = drawCourses(s, courses, { joint, round: L.round, shift });
    } else stones = drawHerringbone(s, { size: 4, joint });
    if (!v) return;                                            // version 0 is bare: it lies in four cells in ten
    // The stones that lie clear of the tile's edges, each as far as can be from those before it (spreadStones), and
    // every mark takes the next one that suits it: so no two marks share a stone or lie side by side, and a version
    // shows no bunch of marks that the eye would find again in every cell. A mark keeps its stone whatever is on.
    const inside = stones.filter((st) => st.inner), free = spreadStones(inside, { start: v === 1 ? 0 : inside.length >> 1 });
    const used = new Set();
    const take = (fits) => { const st = free.find((f) => !used.has(f) && (!fits || fits(f))); if (st) used.add(st); return st ?? null; };
    const flags = L?.marks?.[v];                               // big flags: their marks are placed by hand (PAVING)
    const at = flags
      ? { glint: inside.slice(0, 1), shade: [], pit: flags.pits, tuft: { x: flags.tuft[0], y: stones[stones.length - 1].y, w: flags.tuft[1] } }
      : v === 1
        ? { gone: take(), shade: [take()], tuft: take(bed), pit: [take((st) => pitAt(st, 0, v))], glint: [take()] }
        : { shade: [take()], tuft: take(bed), split: take(), pit: [take((st) => pitAt(st, 0, v))], glint: [take()] };
    if (!flags) { at.pit.push(take((st) => pitAt(st, 1, v))); at.shade.push(take()); at.glint.push(take()); }
    // Wear: a pit, then a second; moss in a joint (version C always has a tuft, version B from the middle up); then
    // version B loses a stone, its bed showing, and version C has one split in two (big flags: a crack across both)
    const pits = Math.min(2, Math.round(worn * 3)), tuft = at.tuft && (v === 2 || worn >= 0.5);
    const gone = at.gone && worn >= 0.6, split = at.split && worn >= 0.7, cracked = flags && worn >= [0, 0.45, 0.7][v];
    // Texture: from the middle up a glint on the top right of a stone, and towards "Busy" a stone or two a shade
    // darker: as many of them as Wear's marks leave room for
    const calm = (flags ? [busy >= 0.4 && 'glint'] : [busy >= 0.6 && 'shade', busy >= 0.4 && 'glint', busy >= 0.9 && 'shade', busy >= 0.8 && 'glint'])
      .filter(Boolean).slice(0, MARKS - pits - (tuft ? 1 : 0) - (gone || split || cracked ? 1 : 0));
    const count = { shade: 0, glint: 0 };
    for (const kind of calm) {
      const st = at[kind][count[kind]++];
      if (!st) continue;
      if (kind === 'shade') paintStone(s, st, shade, { round: L?.round });
      else { const n = Math.min(L?.glint ?? 2, st.w - 2); s.rect(st.x + st.w - n - (L?.round ? 1 : 0), st.y, n, 1, glintOn); }
    }
    for (let i = 0; i < pits; i++) { const spot = flags ? at.pit[i] : at.pit[i] && pitAt(at.pit[i], i, v); if (spot) s.rect(spot[0], spot[1], 2, 1, deepJoint); }
    if (gone) paintStone(s, at.gone, { light: deepJoint, base: joint, dark: joint }, { round: L?.round });   // its bed, in the shade of the stones above it
    if (split) {
      const st = at.split, down = st.w >= st.h;                 // across the shorter side of a brick
      crack(s, down ? st.x + (st.w >> 1) : st.x, down ? st.y : st.y + (st.h >> 1), down ? 0 : Math.PI / 2, (down ? st.h : st.w) - 1, deepJoint, { seed: v + 2, clip: rectIn(st.x, st.y, st.w, st.h), branch: false, jag: 0.5 });
    }
    if (cracked) crack(s, flags.crack[0], flags.crack[1], flags.crack[2], Math.round(5 + worn * 8), deepJoint, { seed: v + 2, clip: inner, branch: false });
    if (tuft) stoneTuft(s, at.tuft, mossOn, { big: worn >= 0.75, seed: v });
  }));

  // one edge of the paving. `shaded`: the turf stands between this edge and the light (top and right).
  // From the outline in: the line, three rows of border stone, a joint; the border is `kerbDeep` px in all.
  const kerbDeep = 5;
  const edge = (which, shaded) => {
    const reach = new Array(32).fill(0), joints = KERB[which];
    for (const [u, k] of BLADES[which]) reach[u] = Math.max(1, Math.round(k * (E - 2)));
    const startOf = (u) => { let at = joints[joints.length - 1]; for (const j of joints) if (j <= u) at = j; return at; };
    return {
      depth: kerbDeep,
      inset: (u) => (joints.includes(u) ? (E >= 6 ? 2 : 1) : 0) + reach[u],
      paint: (d, u) => {
        if (d === 1) return shaded ? stone.deep : stone.dark;
        if (d === kerbDeep || joints.includes(u)) return joint;
        if (shaded && d === 2 && SHADE[u]) return shade;                  // the turf's shadow on the stones under it
        return busy >= 0.3 && startOf(u) === DARKER[which] ? shade : body;
      },
    };
  };

  // ---- the indoor floor: boards with dark seams; grain, knots and scratches in the other two versions ----
  const seam = textureTone(p.wood), fibre = stoneShade(p.wood, seam, 0.55), sheen = textureLight(p.wood, p.wood, 0.5);
  // Wear's marks (a knot, a gap opening between two boards, a long scratch) come first; the grain lines take what is
  // left of the MARKS a version may carry
  const scuffs = Math.round(worn * 3), shiny = busy >= 0.75, grain = Math.min(Math.round(1 + busy * 3), MARKS - scuffs - (shiny ? 1 : 0));
  const boards = [0, 1, 2].map((v) => patternFill(p.wood, (s) => {
    drawCourses(s, BOARDS, { joint: seam, shift: courseShift(BOARDS.map((b) => b.h)).shift });
    if (!v) return;
    GRAIN[v].slice(0, grain).forEach(([x, y, n]) => s.rect(x, y, n, 1, fibre));
    if (shiny) { const [x, y, n] = GRAIN[v][1]; s.rect(x + 1, y - 2, n + 1, 1, sheen); }                  // one board catches the light
    const { knot, gap, scratch } = SCUFFS[v];
    if (scuffs >= 1) s.rect(knot[0], knot[1], 2, 2, seam);
    if (scuffs >= 2) s.rect(gap[0], gap[1], 6, 2, seam);
    if (scuffs >= 3) crack(s, scratch[0], scratch[1], scratch[2], 5, seam, { seed: v + 5, clip: inner, branch: false, jag: 0.3 });
  }));

  // ---- the wall: a lit cap of coping slabs, and a face of rough stone in the shade ----
  const cap = mix(p.stone, stone.light, 0.6), capJoint = textureTone(cap), capLit = textureLight(cap);
  const glinting = brightness(cap) <= 0.85;                 // a cap as pale as cream takes no highlight: it would vanish under most looks
  const rim = Math.max(1, Math.round(E / 2));
  // The cap has one fill and no versions, so whatever is drawn inside it shows in every cell of a wall: only the
  // slabs and their joints go here. Wear shows on the cap's edge (NICKS) and on the face
  const capFill = patternFill(cap, (s) => { drawCourses(s, COPING, { joint: capJoint, lit: busy >= 0.5 && glinting ? capLit : null, glint: 3, shift: courseShift(COPING.map((c) => c.h)).shift }); });
  const faceBody = mix(p.stone, stone.dark, 0.3), faceTop = p.stone, faceJoint = stone.dark;
  const mossFoot = textureTone(p.growth, faceBody);
  // the face, `rows` px high above its base line: courses of rough stone, each lit along its top (only the first
  // course when the texture is plain); the moss at its foot grows a pixel when the wall is worn
  const footMoss = FOOT_MOSS.map((h) => h + (worn >= 0.5 && h ? 1 : 0));
  const face = (rows) => coursedFace({
    rows, course: FACE_COURSE, joints: FACE_JOINTS, body: faceBody, top: faceTop, lit: busy >= 0.25 ? Infinity : 1, joint: faceJoint,
    foot: footMoss, footColour: mossFoot, footTip: p.growth, chips: worn >= 0.6 ? CHIPS : [],
  });
  const wall = (rows) => ({
    ink: INK,
    round: 1,
    fill: capFill,
    top: { depth: E, inset: (u) => (worn >= 0.5 && nicked(u) ? 1 : 0), paint: (d) => (d <= rim ? capLit : null) },
    right: { depth: E, paint: (d) => (d <= Math.max(1, rim - 1) ? capLit : null) },
    left: { depth: E, paint: (d) => (d <= rim ? capJoint : null) },
    face: { paint: face(rows), shadow: stone.deep },
  });

  const m = {
    cobble: {
      ink: null,                                               // floor on floor: no ink; the band's first pixel is the line
      round: E + 1,
      fill: (x, y, t, v) => paving[v ?? 0](x, y),
      top: edge('top', true), right: edge('right', true), bottom: edge('bottom', false), left: edge('left', false),
    },
    plank: { fill: (x, y, t, v) => boards[v ?? 0](x, y) },
    wallTall: wall(29), wallLow: wall(21),
  };
  kept = { key, m };
  return m;
}
// the wall pieces that are a face under a sliver of cap: their face is 21 rows, not 29
const LOW_FACE = new Set(['strip-l', 'strip-m', 'strip-r', 'single']);

export default defineSprite({
  id: 'tiles-village',
  name: 'Village ground and walls',
  kind: 'Item',
  blurb: 'A cobbled square to lay over grass, a wooden floor, low stone walls and rail fences for a top-down village; change the stone, wood and moss colours, the cobble pattern, the border and how worn it all is.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['fantasy', 'farm'],
    gameTypes: ['turn-based-rpg', 'top-down-rpg'],
    view: 'top-down',
    words: ['cobbles', 'cobblestone', 'paving', 'square', 'street', 'floorboards', 'planks', 'wall', 'fence', 'village', 'town', 'garden', 'walk', 'build'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'cobble-right',
  params: {
    style: choice('Style', 'round', [{ value: 'round', label: 'Round cobbles' }, { value: 'square', label: 'Square flags' }, { value: 'herringbone', label: 'Herringbone' }]),
    edge: range('Edge', 5, { min: 3, max: 7, step: 1, lo: 'Thin', hi: 'Deep' }),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    wear: range('Wear', 0.35, { lo: 'New', hi: 'Worn' }),
    stone: color('Stone', HV.cobble, swatches('hearthvale', 'stone')),
    wood: color('Wood', HV.wood, swatches('hearthvale', 'wood')),
    growth: color('Moss', HV.leaf, swatches('hearthvale', 'growth')),
  },
  clips: {
    ...blockClips('cobble', { kind: 'ground', narrow: true, fills: 3, label: 'Cobbles' }),
    'plank-fill': { frames: 1, fps: 1, loop: true, label: 'Wooden floor' },
    'plank-fill-b': { frames: 1, fps: 1, loop: true, label: 'Wooden floor, version B' },
    'plank-fill-c': { frames: 1, fps: 1, loop: true, label: 'Wooden floor, version C' },
    ...blockClips('wall', { kind: 'wall', narrow: true, label: 'Wall' }),
    'fence-h': { frames: 1, fps: 1, loop: true, label: 'Fence: rails and post (repeats sideways)' },
    'fence-v': { frames: 1, fps: 1, loop: true, label: 'Fence: going up the map (repeats up and down)' },
    'fence-post': { frames: 1, fps: 1, loop: true, label: 'Fence: post for corners and ends' },
  },
  render(g, { clip, t, p }) {
    if (clip.startsWith('fence-')) return drawFence(g, clip, { wood: p.wood, worn: p.wear });
    const k = pieceOf(clip), m = materials(p);
    if (k.prefix === 'cobble') return drawSoftBlock(g, k.piece, m.cobble, t);
    if (k.prefix === 'plank') return drawBlock(g, k.piece, m.plank, t);
    return drawBlock(g, k.piece, LOW_FACE.has(k.piece) ? m.wallLow : m.wallTall, t);
  },
});
