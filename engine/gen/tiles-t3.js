// Build item T3: four tilesets of the Derelict Station ported whole (the M9 and E2 pattern of a port generator), so their
// data redraws (sprites/tiles-hive.json, tiles-pit.json, tiles-station-floor.json, tiles-station-walls.json) draw every
// tile as the code tileset drew it, pixel for pixel, with every colour a paint ref or a colour rule worked out per frame.
//
// Why ports and not a material as data (as the forest, cave, dungeon and platforms are): the tiles@1 layout has no join
// for these. The hive's walls are soft walls (engine/ooze.js drawSoftWall: a lobed rim, a ribbed face with drips) and
// the layout's joins are block, soft, face, thin, slope and liquid; the pit's warning lights run round its rim one pixel a
// frame and its depth drifts per piece, and a band rule is the same on every frame; the station floor's and walls'
// fixtures flicker and turn. A port draws the old tile, frame and clip with the code's own joins (engine/tiles.js
// drawBlock, drawSoftBlock), so every piece joins every other exactly as it did.
//
// Each generator draws one tile of its tileset (`picture`, the code's clip name) at `at` (the tile's middle: the old
// frame's 16, 16), from the code's settings as typed arguments and its colours as paints. The frame within the clip is
// ctx.frame. The drawing code is in engine/gen/ports/t3/ (copies of the sprite files and of the engine helpers that made
// Surfaces of their own, with HAND CHANGE notes). Each declares `units`, its heaviest call measured
// (tests/unit/gen-tiles-t3.test.mjs holds every port's heaviest call within its cost).
// Pure: no randomness, no clock, no DOM; Node and browser.
import { portGenerator } from './port-sprite.js';
import { px, share, word, flag, paint } from './args.js';
import { drawHive, HIVE_CLIPS } from './ports/t3/tiles-hive.js';
import { drawPit, PIT_CLIPS } from './ports/t3/tiles-pit.js';
import { drawStationFloor, FLOOR_CLIPS } from './ports/t3/tiles-station-floor.js';
import { drawStationWalls, WALL_CLIPS } from './ports/t3/tiles-station-walls.js';

const TILE = [32, 32], MIDDLE = [16, 16];
// `glow` is a call field (engine/gen/registry.js CALL_FIELDS), so the code's glow colour is the argument `lights`; the
// ported code reads it as p.glow, as it did
const withGlow = (ctx) => ({ ...ctx, p: { ...ctx.p, glow: ctx.p.lights } });

/** tile.hive@1: one tile of the hive growth tileset (port of sprites/tiles-hive.js): the membrane floor, the soft wall of bulging mass with its lobed rim and ribbed, dripping face, the eggs, the beating vein knot, the husk and the creep. */
export const tilesHive = portGenerator({
  id: 'tile.hive', v: 1, family: 'tile', size: TILE, origin: MIDDLE, states: HIVE_CLIPS, units: 100,
  about: 'One tile of a hive growth tileset seen from above (port of the code tileset): a veined membrane floor, a soft wall of bulging lobes with a ribbed, dripping face, eggs, a beating vein knot, a husk and creep.',
  args: {
    veins: share({ default: 0.5, about: 'Veins: few to many (longer and more forked)' }),
    edge: px(3, 5, { default: 4, about: 'Edge: how deep the rim\'s lobes are, 3 to 5 px' }),
    texture: share({ default: 0.5, about: 'Texture: plain to busy (pores, pocks)' }),
    wet: flag({ default: true, about: 'Wet: glints on the rim, the drips and the eggs' }),
    flesh: paint({ about: 'The floor (the membrane)' }),
    growth: paint({ about: 'The walls (sunk below the floor\'s brightness)' }),
    lights: paint({ about: 'The glow inside the eggs, the drips and the knot' }),
  },
  draw: (g, ctx) => drawHive(g, withGlow(ctx)),
});

/** tile.pit@1: one tile of the pits-and-void tileset (port of sprites/tiles-pit.js): the dashed warning lights running round the rim, the plated inner wall under the north rim, the drifting depth, the broken girder and the swaying cables. */
export const tilesPit = portGenerator({
  id: 'tile.pit', v: 1, family: 'tile', size: TILE, origin: MIDDLE, states: PIT_CLIPS, units: 80,
  about: 'One tile of a pit in a station floor seen from above (port of the code tileset): warning lights running round the rim, a plated inner wall, stars, mist or sparks drifting far below, a broken girder and swaying cables.',
  args: {
    below: word(['space', 'mist', 'reactor'], { default: 'space', about: 'What is far below: stars, mist or a reactor\'s glow' }),
    height: px(6, 14, { default: 10, about: 'Depth: px of inner wall that show under the north rim' }),
    pieces: share({ default: 0.5, about: 'Specks: few to many' }),
    land: paint({ about: 'The floor edge round the hole' }),
    hull: paint({ about: 'The inner wall and the girder' }),
    lights: paint({ about: 'The warning lights' }),
  },
  draw: (g, ctx) => drawPit(g, withGlow(ctx)),
});

/** tile.station-floor@1: one tile of the station floor tileset (port of sprites/tiles-station-floor.js): the plated deck, the darker inset plating with its rim of trim plates, the grate, the turning vent fan, hazard paint, goo, a scorch and a flickering floor light. */
export const tilesStationFloor = portGenerator({
  id: 'tile.station-floor', v: 1, family: 'tile', size: TILE, origin: MIDDLE, states: FLOOR_CLIPS, units: 60,
  about: 'One tile of a station deck seen from above (port of the code tileset): plated deck, a darker inset walkway in a rim of trim plates, a grate, a turning vent fan, hazard paint, goo, a scorch and a floor light.',
  args: {
    style: word(['panels', 'grid', 'hex'], { default: 'panels', about: 'Style: the plate layout (panels, grid, honeycomb)' }),
    edge: px(3, 6, { default: 4, about: 'Edge: px of the inset plating\'s rim' }),
    texture: share({ default: 0.5, about: 'Texture: plain to busy (bolts, a scuff)' }),
    wear: share({ default: 0.4, about: 'Wear: new to worn (scratches, a pit, worn hazard paint)' }),
    floor: paint({ about: 'The deck' }),
    plate: paint({ about: 'The inset plating (sunk below the deck)' }),
    accent: paint({ about: 'The hazard paint' }),
    lights: paint({ about: 'The floor light' }),
  },
  draw: (g, ctx) => drawStationFloor(g, withGlow(ctx)),
});

/** tile.station-walls@1: one tile of the station walls tileset (port of sprites/tiles-station-walls.js): the dark cap in its lit rim, the panelled face with its light strip and pipe, a window, a pipe junction, a warning sign, a flickering lamp and the doorway's two cells. */
export const tilesStationWalls = portGenerator({
  id: 'tile.station-walls', v: 1, family: 'tile', size: TILE, origin: MIDDLE, states: WALL_CLIPS, units: 80,
  about: 'One tile of a station bulkhead seen from the south (port of the code tileset): a dark cap in a lit rim, a panelled face with a light strip and a pipe, a window, a pipe junction, a sign, a lamp and a doorway.',
  args: {
    style: word(['panels', 'ribbed', 'plated'], { default: 'panels', about: 'Style: the build of the face\'s panels' }),
    edge: px(3, 6, { default: 4, about: 'Edge: px of the cap\'s rim' }),
    texture: share({ default: 0.5, about: 'Texture: plain to busy (bolts)' }),
    wear: share({ default: 0.4, about: 'Wear: new to worn (dirt, streaks, a dead light)' }),
    hull: paint({ about: 'The wall (its face)' }),
    plate: paint({ about: 'The wall top (kept darker than the face)' }),
    accent: paint({ about: 'The warning paint' }),
    lights: paint({ about: 'The wall lights' }),
  },
  draw: (g, ctx) => drawStationWalls(g, withGlow(ctx)),
});
