// Pits and the void: holes in the deck of the Derelict Station, seen from above. It goes with
// sprites/tiles-station-floor.js (the deck these holes are cut in) and sprites/bg-starfield.js (the space that
// shows down them); the rim, the inner wall and the depth are the framework's (engine/shafts.js).
//
//   pit-left  -top  -right          the hole as a block (kind "hole": it blocks the way). Its outline is the tile
//   pit-side-l -fill -side-r        boundary and every piece is opaque: the north pieces show the plated inner wall
//   pit-bottom-l -bottom -bottom-r  dropping away under the rim, the other three sides are the floor's cut edge,
//   pit-inner-tl -tr -bl -br        two pixels of it. A dashed warning light runs round every rim
//   pit-fill-b, -c                  the depth with its specks: a level mixes them with the bare pit-fill by position
//   pit-strip-l -m -r, pit-col-t -m -b, pit-single     the hole one tile wide: a trench, a slot, a single hatch
//   pit-deco-a, -b                  a broken girder that juts out from the north rim; cables that hang from it and
//                                   sway (8 frames). Their place is 'rim' (engine/tiles.js): they go over a pit
//                                   tile that has the north rim, never out in the middle of the hole
// Every piece but the bare pit-fill has 8 frames: the lights run round the rim one pixel a frame, and what is far
// below drifts.
//
// No lattice in a wide pit. A level picks the version of the fill by the cell's position (engine/tiles.js
// fillVariant): four cells in ten get pit-fill, three -b, three -c, and the same version often comes three or four
// times in a row. Whatever a piece shows is then repeated 32 px apart, and the drift does not hide it, since every
// tile drifts in step. So:
//   - what repeats carries nothing. pit-fill, the version that comes most and in the longest runs, is the bare
//     depth, and so are the pieces that repeat along an edge or a trench (the top, the bottom, the sides, the
//     middle of a trench or a slot), whatever the Specks slider says. Half a wide pit is dark and the stars come
//     in clumps, as they do in a real sky
//   - pit-fill-b keeps everything it has in the upper half of the tile (rows 3 to 14) and pit-fill-c in the lower
//     half (rows 17 to 28), and their seeds put their specks in different columns and on different timers, so two
//     versions side by side never put a speck on the same line
//   - each of the two shows little: one bright star at a time and one or two dim ones, or one bank of mist, or
//     two sparks. The less a version shows, the less there is to see when it comes three times in a row
// What is left is exactly that: a run of three or four -b or -c cells shows the same star three or four times. No
// choice of seed can remove it; only the picker, or more versions than the three a block has, could.
//
// How it sits in the station floor:
//   - no ink and no line of its own on the south and the west side: the deck tile next door has its seam on that
//     boundary already. There the rim starts with a lit lip (light from the top right: a hole's lip is lit on its
//     lower and its left side). On the north and the east side the rim's first row is the line, in the deck's own
//     seam tone
//   - value: the deck is 0.38. The wall under the north rim starts at the Inner wall colour, the colour of the
//     station's wall faces, and steps down to the near-black of the void (0.11), so the hole is the darkest thing in
//     a room and the pale Ranger never stands against it by accident
//   - the depth of "space" is the palette's void with the starfield's own star tones, so a pit and the backdrop
//     behind a window read as the same sky
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { ramp, mix, col } from '../engine/color.js';
import { lerp, wave } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { polyline } from '../engine/surface.js';
import { BLOCK_PIECES, NARROW_PIECES, RIM_PIECES, blockClips, decoClips, pieceOf, drawBlock, drawDecal, textureTone, textureLight } from '../engine/tiles.js';
import { dashedRim, shaftWall, depthFill, trussIn, cableRun } from '../engine/shafts.js';
import { lamp } from '../engine/fx.js';

const D = PALETTE.derelict;
// The floor's cut edge offers the deck's own colours (tiles-station-floor), so the rim can match whatever floor it is in.
const FLOORS = [D.deck, D.hull, D.nebula, D.membrane];
const WALLS = [D.hull, D.deck, D.panel, D.nebula, D.membrane];
const FRAMES = 8;

// What is down there: the colour of the depth and its specks (engine/shafts.js depthFill). Every piece has a layout
// and timers of its own (its seed), and no speck comes within 3 px of a tile's edge, so any piece joins any other.
// The pieces that repeat are bare (see "No lattice in a wide pit" above). The others are pit-fill-b and -c and the
// pieces that come once to a pit (corners, ends, the single hatch): the Specks slider moves them between the two
// numbers of HOW_MANY. The reactor's once-only pieces also have a slow heat line under their sparks; the two
// versions of the fill do not, since a row of the same dash is the first thing the eye finds.
const CLEAR = 3;
const PIECES = [...BLOCK_PIECES, ...NARROW_PIECES];
const BARE = new Set(['fill', 'top', 'bottom', 'side-l', 'side-r', 'strip-m', 'col-m']);
const HOW_MANY = { space: [2, 4], mist: [1, 2], reactor: [1, 3] };
// The rows the two versions of the fill that have specks keep clear, [at the top, at the bottom], on top of CLEAR:
// -b has its specks in rows 3 to 14 and -c in rows 17 to 28, through their whole life.
const BAND = { 'fill-b': [0, 14], 'fill-c': [14, 0] };
// Their seeds are picked for what depthFill makes of them inside those rows. Stars: two that brighten and two dim
// ones (the slider shows two to four of the four), no two of them on one line or in one column, and no cross (it
// would catch the eye where a version comes three times in a row). The two bright ones of a version take turns,
// four frames each, and -c changes over two frames after -b: every cell with stars always has just one bright, a
// -b cell high in the tile and a -c cell low, and never all of them in the same place at once, which would draw
// the picker's grid with holes in it. No bright star starts within 4 columns of the other version's. Mist: the
// two banks start 9 columns apart and take turns. Sparks: none starts within 3 columns of the other version's, a
// version's own are unevenly spaced and each rises at a time of its own.
const FILL_SEEDS = {
  space: { 'fill-b': 84856, 'fill-c': 895484 },
  mist: { 'fill-b': 33, 'fill-c': 8718 },
  reactor: { 'fill-b': 2084, 'fill-c': 5598 },
};
function depthOf(p, t, piece, top) {
  const seed = FILL_SEEDS[p.below][piece] ?? 1 + PIECES.indexOf(piece), [above, under] = BAND[piece] ?? [0, 0];
  // half way up the slider is the lower of the two whole numbers it lies between: the default is the calm side
  const n = BARE.has(piece) ? 0 : Math.round(lerp(...HOW_MANY[p.below], p.pieces) - 0.01);
  const margin = [CLEAR, top + CLEAR + above, CLEAR, CLEAR + under];
  if (p.below === 'mist') {
    const base = mix(D.void, D.panel, 0.26);
    return depthFill(base, t, { kind: 'wisps', count: n, seed, margin, reach: 3, tones: { faint: textureLight(base, base, 0.4), bright: textureLight(base) } });
  }
  if (p.below === 'reactor') {
    const base = mix(D.void, D.red, 0.3), ember = mix(D.void, D.red, 0.62);
    const heat = depthFill(base, t, { kind: 'wisps', count: BAND[piece] ? 0 : Math.min(n, 1), seed: seed + 40, margin, reach: 3, drift: [0, -1], tones: { faint: ember, bright: ember } });
    const sparks = depthFill(base, t, { kind: 'sparks', count: n, seed, margin, tones: { faint: D.red, bright: D.amber, heart: D.cream } });
    const plain = col(base);
    return (x, y) => { const c = sparks(x, y); return c === plain ? heat(x, y) : c; };
  }
  return depthFill(D.void, t, { kind: 'stars', count: n, seed, margin, tones: { faint: textureLight(D.void, D.void, 0.4), bright: D.steel, heart: D.suit } });
}

// The material of one piece of the block (a version of the fill is a piece of its own here), for one frame. The
// last few made are kept.
const kept = new Map();
function material(p, piece, frame) {
  const key = `${JSON.stringify(p)}/${piece}/${frame}`;
  if (kept.has(key)) return kept.get(key);
  const line = textureTone(p.land), lip = textureLight(p.land, p.land, 0.4), hull = ramp(p.hull);
  const H = Math.round(p.height);
  // the lights run round the hole against the clock, one pixel a frame: 8 frames is one dash and one gap
  const rim = (first, run, joint = null) => dashedRim({ depth: 2, line: first, housing: line, light: p.glow, shift: run * frame, joint });
  const north = rim(line, 1, line), wall = shaftWall({ rows: H, tones: [hull.base, hull.dark, hull.deep], seams: [15, 31], shadow: hull.dark });
  const band = (d, u) => (d <= 2 ? north.paint(d, u) : wall(d - 2, u));
  // An inner corner: the wall under the neighbour's north rim ends at the tile's side, as the end of a wall does
  // when seen from the south. The corner piece keeps one column of it, so the two tiles join, and no mitre.
  const end = { 'inner-tl': 0, 'inner-tr': 31 }[piece];
  const walled = RIM_PIECES.includes(piece);                   // the pieces with the wall along their top
  const m = {
    ink: null,                                                 // no ink: the rim's first row is the line
    fill: depthOf(p, frame / FRAMES, piece, walled ? H : 0),
    top: { depth: 2 + H, paint: end === undefined ? band : (d, u) => (u === end ? band(d, u) : null) },
    right: rim(line, 1), bottom: rim(lip, -1), left: rim(lip, -1),
  };
  if (kept.size > 400) kept.clear();
  kept.set(key, m);
  return m;
}

// ---- the decals: laid over a pit tile that has the north rim, which they hang from -------------------------------

function girder(g, p) {
  // a lattice girder that ran across the hole and broke: it juts out from the north rim, lit along its east
  // chord, and ends in a torn plate with one bar bent down past it
  const steel = ramp(p.hull), at = [9.5, 0, 17.5, 19], truss = (part) => trussIn(...at, { width: 7, bay: 6, part });
  drawDecal(g, (s) => {
    s.limb(at[0], at[1], at[2], at[3], 7, steel.deep);                  // the dark between the lacing
    s.fill(0, 0, 32, 32, truss('web'), steel.base);
    s.fill(0, 0, 32, 32, truss('a'), steel.light);
    s.fill(0, 0, 32, 32, truss('b'), steel.base);
    s.limb(14.5, 19, 15.5, 24, 2, steel.base);
  }, { ink: textureTone(p.land) });
}

// [column, length, sway in px, where in its swing it starts]: three cut cables of different lengths
const CABLES = [[9, 14, 2, 0], [16, 20, 3, 0.35], [24, 9, 2, 0.7]];
function cables(g, p, t) {
  // loose cables hanging from under the north rim; each sways on its own time, and its cut end still sparks
  const wire = ramp(p.hull).light;
  CABLES.forEach(([x, len, sway, when], i) => {
    const pts = cableRun(x, 2, len, Math.round(sway * wave(t, when)));
    polyline(g, pts, wire);
    const [ex, ey] = pts.at(-1);
    lamp(g, ex, ey, 2, 2, p.glow, (Math.round(t * FRAMES) + i * 3) % 4 === 0 ? 2 : 1);
  });
}

const DECALS = { a: girder, b: cables };
const FPS = (p) => 6 * lerp(0.65, 1.45, p.speed);
const decals = decoClips('pit', [{ place: 'rim', label: 'Broken girder' }, { place: 'rim', label: 'Hanging cables' }]);
decals['pit-deco-b'] = { ...decals['pit-deco-b'], frames: FRAMES, fps: FPS };
const block = blockClips('pit', { kind: 'hole', narrow: true, fills: 3, frames: FRAMES, fps: FPS, label: 'Pit' });
block['pit-fill'] = { ...block['pit-fill'], frames: 1 };            // the bare depth does not move: one picture

export default defineSprite({
  id: 'tiles-pit',
  name: 'Pits and the void',
  kind: 'Item',
  blurb: 'Holes in a space station floor that open onto drifting stars, mist or a reactor glow, with a plated inner wall and warning lights running round the rim; change what is below, how deep the wall shows, the colours and the speed.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['sci-fi', 'space'],
    gameTypes: ['roguelike-action', 'shooter'],
    view: 'top-down',
    words: ['pit', 'hole', 'void', 'chasm', 'gap', 'shaft', 'hatch', 'drop', 'fall', 'hazard', 'stars', 'reactor', 'mist', 'bottomless'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'pit-single',
  params: {
    below: choice('Below', 'space', ['space', 'mist', 'reactor']),
    height: range('Depth', 10, { min: 6, max: 14, step: 1, lo: 'Shallow', hi: 'Deep' }),
    pieces: range('Specks', 0.5, { lo: 'Few', hi: 'Many' }),
    land: color('Floor edge', D.deck, FLOORS),
    hull: color('Inner wall', D.hull, WALLS),
    glow: color('Warning lights', D.amber, swatches('derelict', 'glow', { lead: 'amber' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    ...block,
    ...decals,
  },
  render(g, { clip, t, frame, p }) {
    const k = pieceOf(clip);
    if (k.kind === 'deco') return DECALS[k.piece](g, p, t);
    return drawBlock(g, k.piece, material(p, k.piece, frame), t);
  },
});
