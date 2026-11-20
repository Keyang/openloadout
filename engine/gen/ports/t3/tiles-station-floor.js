// PORT (build item T3): sprites/tiles-station-floor.js, the deck of the Derelict Station, word for word on paint refs: its
// imports point at the port shims (engine/gen/ports/colour.js: ramp and mix as colour rules; engine/gen/ports/t3/tiles.js:
// patternFill on the port's grid, textureTone, textureLight and sunkTone as colour rules; engine/gen/ports/e2/fx.js:
// lamp), so it draws PAINT REFS on an engine/gen/port-surface.js grid. It is the drawing code of tile.station-floor@1
// (engine/gen/tiles-t3.js), so it is NOT temporary; never change what a released generator version draws through it.
// HAND CHANGE notes say where it differs. The settings come in as the generator's arguments (p.style, p.edge,
// p.texture, p.wear) and the four colours as paint refs (p.floor, p.plate, p.accent, p.glow).
import { ramp, mix } from '../colour.js';
import { TAU } from '../../../motion.js';
import { PALETTE } from '../../../palettes.js';
import { ellipseIn, rectIn } from '../../../surface.js';
import { BLOCK_PIECES, NARROW_PIECES, pieceOf, drawBlock, tileNoise } from '../../../tiles.js';
import { platingSeams, platingSpots, rimPlates, drawBolt, drawPlateMark, drawGrate, fanBladesIn, splatIn } from '../../../plating.js';
import { insetIn } from '../../../shapes.js';
import { squircleIn, stripesIn } from '../../../solids.js';
import { patternFill, textureTone, textureLight, sunkTone } from './tiles.js';
import { lamp } from '../e2/fx.js';

const D = PALETTE.derelict;

// Where the bolts of the bolted version sit, per plate layout: the corners of the tile's plates, or a stud in the
// middle of each honeycomb cell. The first so many show, by the Texture control.
const BOLTS = {
  panels: [[3, 4], [26, 27], [26, 4], [3, 27]],
  grid: [[3, 4], [26, 27], [26, 4], [3, 27]],
  hex: [[6, 7], [19, 15], [6, 23]],
};

// The tones everything is drawn in, from the two floor colours. HAND CHANGE: the plating's tone was worked out from
// the two colours' brightness; here it is the sunkTone colour rule (engine/data-rules.js), the same sum.
function tones(p) {
  // the plating lies lower than the deck and is drawn darker than it: at its own colour when that is dark enough
  const plate = sunkTone(p.plate, p.floor, 0.08, 0.2);
  return {
    deck: p.floor, deckSeam: textureTone(p.floor), deckLit: textureLight(p.floor, p.floor, 0.4),
    plate, plateSeam: textureTone(plate), plateLit: textureLight(plate, plate, 0.4),
  };
}

// One version of a plated fill. Its marks each fit a place 5 px by 4 (platingSpots); light marks are bright metal
// showing, dark ones are dents. Version 0 goes in four cells in ten and lies behind every edge piece: it holds the
// seams and nothing else, at every setting. The other two are kinds of plate, not dirt: a mark that pretends to be
// chance (a stain) shows as a stamp when it comes round again, a bolted plate does not. Version 1 is the bolted
// plate (Texture adds bolts); version 2 the walked-on one (Wear adds scratches, Texture a scuff, and only heavy Wear
// a small pit). Every mark keeps to a place of its own, so a slider adds marks and never moves the ones there.
function plating(p, version, base, seam, lit, seed) {
  return patternFill(base, (s) => {
    const boxes = platingSeams(s, p.style, { seam, lit });
    const taken = BOLTS[p.style].map(([x, y]) => [x, y, 2, 2]);
    if (version === 1) {
      const bolts = BOLTS[p.style].slice(0, Math.round(p.texture * BOLTS[p.style].length));
      for (const [x, y] of bolts) drawBolt(s, x, y, { lit, dark: seam });
      const spots = platingSpots(boxes, { seed, avoid: taken });
      if (p.wear >= 0.6 && spots[0]) drawPlateMark(s, 'scratch', ...spots[0], lit);
    }
    if (version === 2) {
      // at the default settings one scratch and nothing else: two marks side by side come round as a stamp
      const spots = platingSpots(boxes, { seed: seed + 1, avoid: taken });
      const count = (v, one, two) => (v > two ? 2 : v > one ? 1 : 0);
      [0, 1].forEach((i) => { if (i < count(p.wear, 0.25, 0.8) && spots[i]) drawPlateMark(s, 'scratch', ...spots[i], lit); });      // first: the honeycomb has room for few marks
      if (p.texture > 0.6 && spots[2]) drawPlateMark(s, 'scuff', ...spots[2], lit);
      if (p.wear > 0.8 && spots[3]) drawPlateMark(s, 'pit', ...spots[3], seam);
    }
  });
}
const versions = (make) => { const made = []; return (x, y, t, v = 0) => (made[v] ??= make(v))(x, y); };

function deck(p, T) {
  return { fill: versions((v) => plating(p, v, T.deck, T.deckSeam, T.deckLit, 3)) };
}

function inset(p, T) {
  const E = Math.round(p.edge);
  // The rim is the deck's own metal standing a little above the plating, and its line is one more seam in the deck.
  // Along the top and the right that line is the rim's first row. Along the bottom and the left the deck tile next
  // door already has a seam on that boundary (in the honeycomb it has none), and a second line would double it.
  const seamed = p.style !== 'hex';
  const lit = rimPlates({ depth: E, line: T.deckSeam, face: T.deck, outer: T.deckLit, cast: T.plateSeam });
  const far = rimPlates({ depth: seamed ? E - 1 : E, line: seamed ? T.deck : T.deckSeam, face: T.deck, inner: T.deckLit });
  return {
    ink: null,                                                 // floor on floor: no ink, the rim's first row is the line
    fill: versions((v) => plating(p, v, T.plate, T.plateSeam, T.plateLit, 7)),
    top: lit, right: lit, bottom: far, left: far,
  };
}

// ---- the decals: drawn straight on the tile, see-through round them, no outline (they lie in a floor) ------------

function grate(g, p, T) {
  // a drain: a slatted grate in a frame, with the lit lip of a groove under and beside it
  g.rect(5, 23, 20, 1, T.deckLit); g.rect(5, 9, 1, 14, T.deckLit);
  drawGrate(g, 6, 8, 20, 15, { frame: T.deckSeam, bar: T.plate, slot: T.plateSeam, lit: T.plateLit, pitch: 3 });
  for (const [x, y] of [[3, 5], [27, 5], [3, 25], [27, 25]]) drawBolt(g, x, y, { lit: T.deckLit, dark: T.deckSeam });
}

function vent(g, p, T, t) {
  // a round fan in a square housing; one blade step per loop, so the loop closes
  const housing = squircleIn(16, 16, 11, 11, 6), well = ellipseIn(16, 16, 8, 8);
  const turn = (t * TAU) / 3;
  const blades = (lead) => fanBladesIn(16, 16, 7.4, { blades: 3, angle: turn + lead, hub: 0, duty: 0.56, sweep: 0.6 });
  g.fill(4, 4, 28, 28, housing, T.deckSeam);
  g.fill(4, 4, 28, 28, insetIn(housing, 1), T.plate);
  g.fill(4, 4, 28, 28, (x, y) => insetIn(housing, 1)(x, y) && !insetIn(housing, 2)(x, y) && x - y > 0, T.plateLit);      // the housing's lit top and right
  g.fill(7, 7, 25, 25, well, T.plateSeam);
  g.fill(7, 7, 25, 25, (x, y) => well(x, y) && blades(0)(x, y), T.deck);
  g.fill(7, 7, 25, 25, (x, y) => well(x, y) && blades(0)(x, y) && !blades(0.5)(x, y), T.deckLit);      // the leading half of each blade, tilted to the light
  g.rect(15, 15, 2, 2, T.deckLit); g.dot(15, 16, T.deckSeam);
}

function hazard(g, p, T) {
  // warning paint along the south edge of a plate: amber and dark stripes that run on from tile to tile. Wear eats
  // into it from its two long edges, two columns at a time, and never through it
  const band = rectIn(0, 22, 32, 7), stripe = stripesIn(band, { pitch: 8, slant: 1, duty: 0.5 });
  const eaten = (x, side) => Math.floor(tileNoise(Math.floor(x / 2), side, 9) * p.wear * 3.4);
  const whole = (x, y) => y - 22 >= eaten(x, 1) && 28 - y >= eaten(x, 2);
  g.fill(0, 22, 32, 29, (x, y) => band(x, y) && whole(x, Math.floor(y)), T.deckSeam);
  g.fill(0, 22, 32, 29, (x, y) => stripe(x, y) && whole(x, Math.floor(y)), p.accent);
}

function goo(g, p, T) {
  // what a bug leaves: a flat splat of acid, dulled by the deck under it, with a darker rim and two wet glints
  const acid = ramp(D.acid), splat = splatIn(15.5, 16.5, 8, { seed: 5, lobes: 4, drops: 5 });
  g.fill(0, 0, 32, 32, splat, mix(acid.dark, T.deckSeam, 0.45));
  g.fill(0, 0, 32, 32, insetIn(splat, 1), mix(D.acid, T.deck, 0.4));
  g.rect(17, 13, 2, 1, acid.base); g.dot(13, 18, acid.base);
}

function burn(g, p, T) {
  // a blast mark: soot thrown out in rays round a darker middle
  g.fill(0, 0, 32, 32, splatIn(16, 16, 9, { seed: 2, lobes: 9, drops: 6 }), T.deckSeam);
  g.fill(0, 0, 32, 32, splatIn(16, 16, 5, { seed: 7, lobes: 6, drops: 0 }), T.plateSeam);
}

// the floor light's loop, in fx.lamp's four levels: lit (the still picture), flaring, down to off and back up
const GLOW = [1, 2, 2, 1, 0.5, 0, 0.5, 0.5];
function light(g, p, T, t) {
  // a light strip let into the deck, in a housing with the lit lip of a groove under and beside it
  g.rect(6, 19, 19, 1, T.deckLit); g.rect(6, 13, 1, 6, T.deckLit);
  g.rect(7, 12, 18, 7, T.deckSeam);
  g.rect(8, 13, 16, 5, T.plate);
  lamp(g, 10, 14, 12, 3, p.glow, GLOW[Math.round(t * 8) % 8]);
}

const DECALS = { a: grate, b: vent, c: hazard, d: goo, e: burn, f: light };

/** The clips tile.station-floor@1 draws, each { frames, loop }: the deck's three fills, the plating block and the six decals. */
export const FLOOR_CLIPS = Object.freeze(Object.fromEntries([
  ...['fill', 'fill-b', 'fill-c'].map((k) => [`floor-${k}`, { frames: 1, loop: true }]),
  ...[...BLOCK_PIECES, 'fill-b', 'fill-c', ...NARROW_PIECES].map((k) => [`plate-${k}`, { frames: 1, loop: true }]),
  ...['a', 'b', 'c', 'd', 'e', 'f'].map((d) => [`floor-deco-${d}`, { frames: d === 'b' || d === 'f' ? 8 : 1, loop: true }]),
]));

/** sprites/tiles-station-floor.js render on a paint-ref grid: one frame of one clip. Arguments: g (a PortSurface), { clip, t, p }. */
export function drawStationFloor(g, { clip, t, p }) {
  const k = pieceOf(clip), T = tones(p);
  if (k.kind === 'deco') return DECALS[k.piece](g, p, T, t);
  return drawBlock(g, k.piece, k.prefix === 'floor' ? deck(p, T) : inset(p, T), t);
}
