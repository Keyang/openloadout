// PORT (build item T3): sprites/tiles-pit.js, the pits of the Derelict Station, word for word on paint refs: its imports
// point at the port shims (engine/gen/ports/colour.js: ramp and mix as colour rules; engine/gen/ports/t3/tiles.js:
// textureTone and textureLight as the colour rules of those names, drawDecal on the port's grid; engine/gen/ports/t3/
// shafts.js: depthFill on paint refs; engine/gen/ports/e2/fx.js: lamp), so it draws PAINT REFS on an
// engine/gen/port-surface.js grid. It is the drawing code of tile.pit@1 (engine/gen/tiles-t3.js), so it is NOT
// temporary; never change what a released generator version draws through it. HAND CHANGE notes say where it differs.
// The settings come in as the generator's arguments (p.below, p.height, p.pieces) and the three colours as paint refs
// (p.land, p.hull, p.glow).
import { ramp, mix } from '../colour.js';
import { lerp, wave } from '../../../motion.js';
import { PALETTE } from '../../../palettes.js';
import { polyline } from '../../../surface.js';
import { BLOCK_PIECES, NARROW_PIECES, RIM_PIECES, pieceOf, drawBlock } from '../../../tiles.js';
import { dashedRim, shaftWall, trussIn, cableRun } from '../../../shafts.js';
import { textureTone, textureLight, drawDecal } from './tiles.js';
import { depthFill } from './shafts.js';
import { lamp } from '../e2/fx.js';

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
    // HAND CHANGE: the code compared packed colours (col(base)); depthFill's grid hands back the very ref it was given
    return (x, y) => { const c = sparks(x, y); return c === base ? heat(x, y) : c; };
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

/** The clips tile.pit@1 draws, each { frames, loop }: the code tileset's block and its two decals, in the code's order. */
export const PIT_CLIPS = Object.freeze(Object.fromEntries([
  ...[...BLOCK_PIECES, 'fill-b', 'fill-c', ...NARROW_PIECES].filter((x, i, a) => a.indexOf(x) === i).map((k) => [`pit-${k}`, { frames: k === 'fill' ? 1 : FRAMES, loop: true }]),
  ['pit-deco-a', { frames: 1, loop: true }], ['pit-deco-b', { frames: FRAMES, loop: true }],
]));

/** sprites/tiles-pit.js render on a paint-ref grid: one frame of one clip. Arguments: g (a PortSurface), { clip, t, frame, p }. */
export function drawPit(g, { clip, t, frame, p }) {
  const k = pieceOf(clip);
  if (k.kind === 'deco') return DECALS[k.piece](g, p, t);
  return drawBlock(g, k.piece, material(p, k.piece, frame), t);
}
