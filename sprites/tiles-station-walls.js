// Station walls: the bulkheads of the Derelict Station, seen from the south. They stand on the deck of
// sprites/tiles-station-floor.js (read that file first: the tones here are chosen against its tones).
//
//   wall-left  -top  -right          the wall, a block with a front face. The upper pieces are its CAP, the top of the
//   wall-side-l -fill -side-r        wall: dark plating (darker than anything on the floor) inside a lit rim of trim
//   wall-bottom-l -bottom -bottom-r  plates. The bottom row is its FACE: a lit lip, a strip of light in a dark channel,
//   wall-inner-tl -tr -bl -br        a band of panels, a pipe on two brackets and a kick plate, then a base line and
//                                    two rows of shadow on the floor
//   wall-strip-l -m -r, wall-single  the wall one tile deep (every room wall of the kit): the same face, 21 rows of it,
//                                    under 8 rows of cap
//   wall-col-t -m -b                 the wall one tile wide, running up the map: cap, cap, and a full face at its end
//   wall-deco-a window, -b pipe junction, -c warning sign, -d wall light (8 frames): fixtures for a FACE tile. Each
//                                    keeps to the rows that are face in both heights of wall (8 to 28), so it sits right
//                                    on wall-bottom and on wall-strip-m alike. Their place is 'face' (engine/tiles.js):
//                                    a level scatters them over the wall's face cells only, never over its cap. In a
//                                    map, write the decal's letter in a cell of the wall's bottom row
//   doorway-l, doorway-r             the two cells of a doorway two tiles wide in a wall one tile deep: a door post at
//                                    the outer side of each, and between them the sill the door runs on, lying in the
//                                    floor. See-through elsewhere. `blast-door` stands on them; in a map they are
//                                    'open:wall:doorway-l' and 'open:wall:doorway-r' (not solid, and the wall beside
//                                    them is not closed against them)
//
// What is particular here (the face itself is drawBulkhead in engine/bulkhead.js, the rim is rimPlates in
// engine/plating.js):
//   - value before hue, as on the floor. The face is the Wall colour (hull, 0.47). The cap is the Wall top colour
//     drawn darker: at least 0.08 under itself and 0.2 under the face, which at the defaults is 0.22, clear of the
//     deck (0.38) and of the inset plating (0.30). The rim and the lip are the face's light tone (0.68), lighter than
//     anything the floor has
//   - hard surfaces: the outline is the tile boundary, seams are structure and repeat on purpose. The cap has one
//     fill and no versions, so nothing is drawn in it but its seams. Wear is dirt creeping up the kick plate along a
//     profile 32 px long and streaks under the pipe brackets: a band, not a stamp
//   - no dark line of its own on the bottom or the left boundary, where the deck tile next door has its seam: the
//     shadow under the face is the deck's own seam tone, so its two rows and that seam read as one shadow
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { ramp, mix, brightness, INK } from '../engine/color.js';
import { lerp } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { Surface, cropped } from '../engine/surface.js';
import { blockClips, decoClips, pieceOf, drawBlock, patternFill } from '../engine/tiles.js';
import { platingSeams, rimPlates, drawBolt } from '../engine/plating.js';
import { ringIn } from '../engine/shapes.js';
import { lamp } from '../engine/fx.js';
import { BULKHEAD_STYLES, shadeTo, drawBulkhead, machineTones, hazardBand } from '../engine/bulkhead.js';

const D = PALETTE.derelict;
// The same steels the floor offers, so a room can be recoloured as one. The cap is drawn darker than the face
// whatever the two are, so the lists may share colours.
const WALLS = [D.hull, D.panel, D.deck, D.nebula, D.membrane];
const CAPS = [D.plate, D.deck, D.hull, D.nebula, D.membrane];
const LOW_FACE = new Set(['strip-l', 'strip-m', 'strip-r', 'single']);   // the pieces that are a face under a sliver of cap
const POST = 8;                                                           // px of door post in a doorway cell, its ink line included
// where the face's bands lie in a tile, whatever the wall's height (drawBulkhead counts them from the foot)
const LIP = 8, BAND = 12, PIPE = 21;

// The tones everything is drawn in, from the two wall colours.
function tones(p) {
  const want = Math.max(0.2, Math.min(brightness(p.plate) - 0.08, brightness(p.hull) - 0.2));
  const face = machineTones(p.hull), cap = machineTones(shadeTo(p.plate, want));
  return {
    base: face.base, lit: face.lit, soft: face.soft, seam: face.seam, skirt: mix(p.hull, face.seam, 0.5),
    cap: cap.base, capSeam: cap.seam, capLit: cap.soft,
    shadow: ramp(D.deck).dark,                                 // the deck's seam tone: the shadow joins the seam under it
  };
}

// The wall as a material for drawBlock. rows: the height of its face (29, or 21 under a sliver of cap).
function wall(p, T, rows) {
  const E = Math.round(p.edge);
  // the rim is the wall's own metal standing round the cap: lit along its outer row on the top and the right, where it
  // throws a shadow on the cap, and along its inner row on the left
  const lit = rimPlates({ depth: E - 1, line: T.lit, face: T.base });
  const far = rimPlates({ depth: E - 1, line: T.base, face: T.base, inner: T.lit });
  const face = patternFill(T.base, (s) => {
    drawBulkhead(s, {
      rows, style: p.style, bolts: p.texture, grime: p.wear,
      tones: { base: T.base, lit: T.lit, soft: T.soft, seam: T.seam, skirt: T.skirt, dark: T.cap },
      light: { on: p.glow, off: T.cap, dead: p.wear > 0.75 ? 1 : 0 },
    });
  });
  return {
    ink: INK,
    fill: patternFill(T.cap, (s) => { platingSeams(s, p.style === 'plated' ? 'grid' : 'panels', { seam: T.capSeam, lit: T.capLit }); }),
    top: lit, right: lit, left: far,
    face: { paint: face, shadow: T.shadow },
  };
}

// Everything the pieces need, from the controls. The same settings give the same answer, so the last one is kept.
let kept = null;
function materials(p) {
  const key = JSON.stringify(p);
  if (kept && kept.key === key) return kept.m;
  const T = tones(p), m = { T, tall: wall(p, T, 29), low: wall(p, T, 21) };
  kept = { key, m };
  return m;
}

// ---- the fixtures: drawn straight on a face tile, see-through round them, no outline (they are part of the wall) ----

function porthole(g, p, T) {
  // a slit window in a raised bezel, lit along its top and right; behind the glass, space and a few stars
  g.rect(5, BAND, 22, 9, T.seam);
  g.rect(5, BAND, 22, 1, T.lit); g.rect(26, BAND, 1, 9, T.lit);
  g.rect(6, BAND + 1, 20, 7, D.void);
  for (const [x, y] of [[6, BAND + 1], [25, BAND + 1], [6, BAND + 7], [25, BAND + 7]]) g.dot(x, y, T.seam);      // the glass has cut corners
  const sheen = mix(D.void, D.signal, 0.45);
  for (let i = 0; i < 5; i++) { g.dot(9 + i, BAND + 6 - i, sheen); g.dot(11 + i, BAND + 6 - i, sheen); }        // light on the glass
  g.rect(19, BAND + 3, 3, 1, D.cream); g.rect(20, BAND + 2, 1, 3, D.cream);                                     // a bright star
  g.rect(15, BAND + 5, 2, 1, D.steel); g.rect(23, BAND + 6, 2, 1, D.steel); g.rect(8, BAND + 2, 2, 1, D.steel); // and three faint ones
}

function junction(g, p, T) {
  // a feed pipe comes down the wall to a valve box on the pipe run; the hand wheel is in the warning colour
  g.rect(14, LIP + 1, 1, PIPE - LIP - 1, T.seam); g.rect(15, LIP + 1, 1, PIPE - LIP - 1, T.soft); g.rect(16, LIP + 1, 1, PIPE - LIP - 1, T.lit);
  g.rect(13, BAND, 5, 2, T.soft); g.rect(13, BAND, 5, 1, T.lit); g.rect(13, BAND + 2, 5, 1, T.seam);              // a flange
  g.rect(10, PIPE - 3, 11, 9, T.seam);
  g.rect(11, PIPE - 2, 9, 7, T.soft); g.rect(11, PIPE - 2, 9, 1, T.lit);
  const wheel = ramp(p.accent);
  g.fill(12, PIPE - 1, 19, PIPE + 5, ringIn(15.5, PIPE + 1.5, 3, 1.2), wheel.base);
  g.rect(15, PIPE - 1, 1, 6, wheel.dark); g.rect(13, PIPE + 1, 6, 1, wheel.dark);                                // its spokes
  g.rect(15, PIPE + 1, 1, 1, wheel.light);
}

function sign(g, p, T) {
  // a warning plate: a triangle in the warning colour with a dark mark in it (a picture, no words)
  g.rect(7, BAND, 18, 9, T.cap);
  g.rect(7, BAND, 18, 1, T.soft); g.rect(24, BAND, 1, 9, T.soft);
  for (let i = 0; i < 7; i++) g.rect(15 - i, BAND + 1 + i, 2 + 2 * i, 1, p.accent);
  g.rect(15, BAND + 3, 2, 3, T.cap); g.rect(15, BAND + 7, 2, 1, T.cap);
  for (const [x, y] of [[8, BAND + 7], [22, BAND + 7]]) drawBolt(g, x, y, { lit: T.lit, dark: T.capSeam, face: T.soft });
}

// the wall light's loop, in fx.lamp's four levels: lit, flaring, failing down to dark and back
const FLICKER = [1, 2, 1, 0.5, 0, 0.5, 1, 2];
function wallLight(g, p, T, t) {
  // a lamp in a hooded housing; while it is lit the wall under it is lighter, in a patch that widens downward
  const level = FLICKER[Math.round(t * 8) % 8];
  if (level >= 1) for (let i = 0; i < 4; i++) g.rect(11 - i, BAND + 5 + i, 10 + 2 * i, 1, level >= 2 && i < 2 ? T.lit : T.soft);
  g.rect(10, BAND - 1, 12, 2, T.cap); g.rect(10, BAND - 1, 12, 1, T.lit);                                       // the hood
  g.rect(11, BAND + 1, 10, 4, T.seam);
  lamp(g, 12, BAND + 2, 8, 2, p.glow, level);
}

// One cell of a doorway: the post is the end of a real piece of wall (its last columns, moved to the cell's outer
// side), so it joins the wall beside it; hazard paint marks it. The sill lies in the floor between the posts.
function doorway(g, side, p, m) {
  const T = m.T, left = side === 'l', end = new Surface(32, 32);
  drawBlock(end, left ? 'strip-r' : 'strip-l', m.low);
  g.blit(left ? cropped(end, 32 - POST, 0, 32, 32) : cropped(end, 0, 0, POST, 32), left ? POST - 32 : 32 - POST, 0);
  // the outermost column stays bare wall: it is all that shows beside a door standing on the cell
  hazardBand(g, left ? 1 : 32 - POST + 1, BAND, POST - 2, 9, { dark: T.cap, paint: p.accent, pitch: 6, slant: left ? 1 : -1, phase: 1 });
  // the sill: a dark plate with the groove the door runs in, lit along the groove's lower lip
  const sx = left ? POST : 0, sw = 32 - POST;
  g.rect(sx, PIPE, sw, 9, T.cap);
  g.rect(sx, PIPE, sw, 1, T.capSeam); g.rect(sx, PIPE + 8, sw, 1, T.capSeam);
  g.rect(sx, PIPE + 4, sw, 1, T.capSeam); g.rect(sx, PIPE + 5, sw, 1, T.capLit);
}

const FIXTURES = { a: porthole, b: junction, c: sign, d: wallLight };
const FPS = (p) => 6 * lerp(0.65, 1.45, p.speed);
const decals = decoClips('wall', [
  { place: 'face', label: 'Window' }, { place: 'face', label: 'Pipe junction' }, { place: 'face', label: 'Warning sign' }, { place: 'face', label: 'Wall light' },
]);
decals['wall-deco-d'] = { ...decals['wall-deco-d'], frames: 8, fps: FPS };

export default defineSprite({
  id: 'tiles-station-walls',
  name: 'Station walls',
  kind: 'Item',
  blurb: 'Metal bulkheads for a top-down space station: dark wall tops with a lit rim, a panelled face with a light strip and a pipe, a window, a pipe junction, a warning sign, a flickering lamp and the posts of a doorway; change the colours, the build of the panels, the rim and how worn it is.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['sci-fi', 'space'],
    gameTypes: ['roguelike-action', 'shooter'],
    view: 'top-down',
    words: ['wall', 'bulkhead', 'hull', 'panel', 'pipe', 'window', 'porthole', 'doorway', 'corridor', 'room', 'station', 'spaceship', 'metal', 'block'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'wall-single',
  params: {
    style: choice('Style', 'panels', BULKHEAD_STYLES.map((value) => ({ value, label: { panels: 'Panels', ribbed: 'Ribbed', plated: 'Plated' }[value] }))),
    edge: range('Edge', 4, { min: 3, max: 6, step: 1, lo: 'Thin', hi: 'Deep' }),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    wear: range('Wear', 0.4, { lo: 'New', hi: 'Worn' }),
    hull: color('Wall', D.hull, WALLS),
    plate: color('Wall top', D.plate, CAPS),
    accent: color('Warning paint', D.amber, swatches('derelict', 'accent', { lead: 'amber' })),
    glow: color('Wall lights', D.teal, swatches('derelict', 'glow', { lead: 'teal' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    ...blockClips('wall', { kind: 'wall', narrow: true, label: 'Wall' }),
    ...decals,
    'doorway-l': { frames: 1, fps: 1, loop: true, label: 'Doorway: left post and sill' },
    'doorway-r': { frames: 1, fps: 1, loop: true, label: 'Doorway: right post and sill' },
  },
  render(g, { clip, t, p }) {
    const m = materials(p);
    if (clip === 'doorway-l' || clip === 'doorway-r') return doorway(g, clip.slice(-1), p, m);
    const k = pieceOf(clip);
    if (k.kind === 'deco') return FIXTURES[k.piece](g, p, m.T, t);
    return drawBlock(g, k.piece, LOW_FACE.has(k.piece) ? m.low : m.tall, t);
  },
});
