// FROZEN COPY, not a sprite: sprites/tiles-station-floor.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Station floor: the deck of the Derelict Station, seen from above. THE WORKED EXAMPLE for a hard, plated floor
// (the soft one is sprites/tiles-meadow.js); the plating itself comes from engine/plating.js.
//
//   floor-fill, -fill-b, -fill-c    the deck: metal plates whose seams lie on the tile boundary, so a room reads as a
//                                   grid. Nothing else under this prefix: it lies under everything. Version 0 is bare
//                                   at every setting; -b is the bolted plate, -c the walked-on one
//   plate-left  -top  -right        the inset plating, a second floor laid on the deck as a block: a darker area inside
//   plate-side-l -fill -side-r      a rim of trim plates, for walkways and room centres. See-through outside its
//   plate-bottom-l -bottom -bottom-r   outline (which is the tile boundary), never inked: you walk on both
//   plate-inner-tl -tr -bl -br
//   plate-fill-b, -fill-c           two more versions of its middle
//   plate-strip-l -m -r, plate-col-t -m -b, plate-single     the plating one tile wide: a walkway, its ends, a pad
//   floor-deco-a grate, -b vent fan (8 frames), -c hazard strip, -d goo splat, -e scorch mark, -f floor light
//                                   (8 frames): decals, laid over a deck tile
//
// What to copy for another station tileset:
//   - value before hue. Every steel of the palette has the same hue, so the two floors are told apart only by how
//     light they are: the plating is drawn 0.08 or more darker than the deck whatever the two colours are, and no
//     floor swatch is lighter than 0.55, so the pale Ranger and the lilac bugs stand out on it under every look
//   - seams repeat on purpose and never move: every version of a fill has the same seams (platingSeams), and only the
//     marks between them differ. Light tones mean raised or scratched bright, dark tones mean a groove or a dent
//   - the rim is a row of trim plates, one per tile, with both ends cut at 45 degrees (rimPlates): a walkway one tile
//     wide bends, forks and crosses with the same 20 pieces and shows no notch. Light from the top right: the rim's
//     top and right sides are lit along their outer row and throw a shadow on the plating; the other two are lit
//     along their inner row
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { ramp, mix, brightness } from '../../../engine/color.js';
import { lerp, clamp, TAU } from '../../../engine/motion.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import { ellipseIn, rectIn } from '../../../engine/surface.js';
import { blockClips, decoClips, pieceOf, drawBlock, patternFill, textureTone, textureLight, tileNoise } from '../../../engine/tiles.js';
import { PLATING_STYLES, platingSeams, platingSpots, rimPlates, drawBolt, drawPlateMark, drawGrate, fanBladesIn, splatIn } from '../../../engine/plating.js';
import { insetIn } from '../../../engine/shapes.js';
import { squircleIn, stripesIn } from '../../../engine/solids.js';
import { lamp } from '../../../engine/fx.js';

const D = PALETTE.derelict;
// Floors are dull: only energy is saturated in this kit. The deck is never lighter than the hive floor (0.54), so bug
// shells (0.70) and the Ranger's suit (0.92) stay the lightest things in a room. The plating may be any of the same
// steels, the deck's own colour included: it is drawn darker than the deck whatever the two are.
const FLOORS = [D.deck, D.hull, D.nebula, D.membrane];
const PLATES = [D.plate, D.deck, D.hull, D.nebula, D.membrane];

// Where the bolts of the bolted version sit, per plate layout: the corners of the tile's plates, or a stud in the
// middle of each honeycomb cell. The first so many show, by the Texture control.
const BOLTS = {
  panels: [[3, 4], [26, 27], [26, 4], [3, 27]],
  grid: [[3, 4], [26, 27], [26, 4], [3, 27]],
  hex: [[6, 7], [19, 15], [6, 23]],
};

// The tones everything is drawn in, from the two floor colours.
function tones(p) {
  const pr = ramp(p.plate);
  // the plating lies lower than the deck and is drawn darker than it: at its own colour when that is dark enough
  const want = Math.max(0.2, Math.min(brightness(p.plate), brightness(p.floor) - 0.08));
  const plate = mix(p.plate, pr.dark, clamp((brightness(p.plate) - want) / Math.max(0.01, brightness(p.plate) - brightness(pr.dark))));
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
const FPS = (p) => 6 * lerp(0.65, 1.45, p.speed);
const decals = decoClips('floor', [
  { place: 'on', label: 'Grate' }, { place: 'on', label: 'Vent fan' }, { place: 'on', label: 'Hazard strip' },
  { place: 'on', label: 'Goo splat' }, { place: 'on', label: 'Scorch mark' }, { place: 'on', label: 'Floor light' },
]);
for (const k of ['floor-deco-b', 'floor-deco-f']) decals[k] = { ...decals[k], frames: 8, fps: FPS };

export default defineSprite({
  id: 'tiles-station-floor',
  name: 'Station floor',
  kind: 'Item',
  blurb: 'Metal deck plating for a top-down space station, with a darker inset walkway, grates, a vent fan, hazard paint and floor lights; change the colours, the plate layout, the rim and how worn it is.',
  meta: {
    type: 'tileset',
    role: 'world/tile',
    themes: ['sci-fi', 'space'],
    gameTypes: ['roguelike-action', 'shooter'],
    view: 'top-down',
    words: ['floor', 'deck', 'plating', 'metal', 'panel', 'walkway', 'grate', 'vent', 'hazard', 'station', 'spaceship', 'room', 'corridor', 'walk'],
    license: 'draft',
  },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  preview: 'plate-single',
  params: {
    style: choice('Style', 'panels', PLATING_STYLES.map((value) => ({ value, label: { panels: 'Panels', grid: 'Grid', hex: 'Honeycomb' }[value] }))),
    edge: range('Edge', 4, { min: 3, max: 6, step: 1, lo: 'Thin', hi: 'Deep' }),
    texture: range('Texture', 0.5, { lo: 'Plain', hi: 'Busy' }),
    wear: range('Wear', 0.4, { lo: 'New', hi: 'Worn' }),
    floor: color('Floor', D.deck, FLOORS),
    plate: color('Plating', D.plate, PLATES),
    accent: color('Hazard paint', D.amber, swatches('derelict', 'accent', { lead: 'amber' })),
    glow: color('Floor lights', D.teal, swatches('derelict', 'glow', { lead: 'teal' })),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    'floor-fill': { frames: 1, fps: 1, loop: true, label: 'Deck' },
    'floor-fill-b': { frames: 1, fps: 1, loop: true, label: 'Deck, version B' },
    'floor-fill-c': { frames: 1, fps: 1, loop: true, label: 'Deck, version C' },
    ...blockClips('plate', { kind: 'ground', narrow: true, fills: 3, label: 'Plating' }),
    ...decals,
  },
  render(g, { clip, t, p }) {
    const k = pieceOf(clip), T = tones(p);
    if (k.kind === 'deco') return DECALS[k.piece](g, p, T, t);
    return drawBlock(g, k.piece, k.prefix === 'floor' ? deck(p, T) : inset(p, T), t);
  },
});
