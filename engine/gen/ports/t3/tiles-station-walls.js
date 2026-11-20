// PORT (build item T3): sprites/tiles-station-walls.js, the bulkheads of the Derelict Station, word for word on paint refs:
// its imports point at the port shims (engine/gen/ports/colour.js: ramp and mix as colour rules, INK the ink paint;
// engine/gen/ports/t3/tiles.js: patternFill and drawBlock's wall face on the port's grid, textureTone, textureLight and
// shadeApart as colour rules; engine/gen/ports/e2/fx.js: lamp), so it draws PAINT REFS on an engine/gen/port-surface.js
// grid. It is the drawing code of tile.station-walls@1 (engine/gen/tiles-t3.js), so it is NOT temporary; never change
// what a released generator version draws through it. HAND CHANGE notes say where it differs. The settings come in as
// the generator's arguments (p.style, p.edge, p.texture, p.wear) and the four colours as paint refs (p.hull, p.plate,
// p.accent, p.glow).
import { ramp, mix, INK } from '../colour.js';
import { PALETTE } from '../../../palettes.js';
import { cropped } from '../../../surface.js';
import { BLOCK_PIECES, NARROW_PIECES, pieceOf } from '../../../tiles.js';
import { platingSeams, rimPlates, drawBolt } from '../../../plating.js';
import { ringIn } from '../../../shapes.js';
import { drawBulkhead, hazardBand } from '../../../bulkhead.js';
import { patternFill, drawBlockP, textureTone, textureLight, shadeApart } from './tiles.js';
import { lamp } from '../e2/fx.js';

const D = PALETTE.derelict;
const LOW_FACE = new Set(['strip-l', 'strip-m', 'strip-r', 'single']);   // the pieces that are a face under a sliver of cap
const POST = 8;                                                           // px of door post in a doorway cell, its ink line included
// where the face's bands lie in a tile, whatever the wall's height (drawBulkhead counts them from the foot)
const LIP = 8, BAND = 12, PIPE = 21;

// The tones everything is drawn in, from the two wall colours. HAND CHANGE: the cap's target brightness was worked out
// from the two colours' numbers; here the cap is the shadeApart colour rule (engine/data-rules.js), the same sum, and
// machineTones (engine/bulkhead.js) is written out as the colour rules it names (its dark tone is not used here).
function tones(p) {
  const tonesOf = (c) => ({ base: c, lit: textureLight(c), soft: textureLight(c, c, 0.4), seam: textureTone(c) });
  const face = tonesOf(p.hull), cap = tonesOf(shadeApart(p.plate, p.hull, 0.2, 0.08, 0.2));
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
  const face = patternFill(T.base, (s) => {   // HAND CHANGE: patternFill on the port's grid (engine/gen/ports/t3/tiles.js)
    drawBulkhead(s, {
      rows, style: p.style, bolts: p.texture, grime: p.wear,
      tones: { base: T.base, lit: T.lit, soft: T.soft, seam: T.seam, skirt: T.skirt, dark: T.cap },
      light: { on: p.glow, off: T.cap, dead: p.wear > 0.75 ? 1 : 0 },
    });
  });
  return {
    ink: INK,                                                  // the ink paint (engine/gen/ports/colour.js INK)
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
  const T = m.T, left = side === 'l', end = g.blank(32, 32);   // HAND CHANGE: a grid on g's paint table
  drawBlockP(end, left ? 'strip-r' : 'strip-l', m.low);
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

/** The clips tile.station-walls@1 draws, each { frames, loop }: the wall block, its four fixtures and the doorway's two cells. */
export const WALL_CLIPS = Object.freeze(Object.fromEntries([
  ...[...BLOCK_PIECES, ...NARROW_PIECES].map((k) => [`wall-${k}`, { frames: 1, loop: true }]),
  ...['a', 'b', 'c', 'd'].map((d) => [`wall-deco-${d}`, { frames: d === 'd' ? 8 : 1, loop: true }]),
  ['doorway-l', { frames: 1, loop: true }], ['doorway-r', { frames: 1, loop: true }],
]));

/** sprites/tiles-station-walls.js render on a paint-ref grid: one frame of one clip. Arguments: g (a PortSurface), { clip, t, p }. */
export function drawStationWalls(g, { clip, t, p }) {
  const m = materials(p);
  if (clip === 'doorway-l' || clip === 'doorway-r') return doorway(g, clip.slice(-1), p, m);
  const k = pieceOf(clip);
  if (k.kind === 'deco') return FIXTURES[k.piece](g, p, m.T, t);
  return drawBlockP(g, k.piece, LOW_FACE.has(k.piece) ? m.low : m.tall, t);
}
