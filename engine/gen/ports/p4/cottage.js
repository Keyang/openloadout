// PORT (migration batch P4): the drawing of the code sprite sprites/cottage.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims (engine/gen/ports/colour.js) and at the ported engine helpers
// (engine/gen/ports/p4/, engine/gen/ports/e2/), so it draws paint refs on an engine/gen/port-surface.js grid. It is the
// drawing of the generator building.cottage@1 (engine/gen/world-p4.js), which sprites/cottage.json names; it goes only with the last
// version that draws with it. Its settings (p) are that generator's arguments; its colours are the paint refs the data
// file names. A HAND CHANGE note says where it differs from its source (the frozen copy
// tests/fixtures/code-sprites/cottage.js); never change what a released generator version draws through it.
// Cottage: a small half-timbered house of the Hearthvale village, seen from the south in three-quarter view.
// The front wall with its door and windows is the lower half, the south slope of the roof the upper half.
// Every piece comes from engine/buildings.js (wall, windows, door and doorstep, roof, chimney, smoke, and the
// colours a house takes from its palette); this file only says where the pieces of THIS house go (plan) and
// which clip shows what. `inn` is built the same way.
//
// Scale: the map hero (sprites/hero-walker.js) is 30 px tall and 16 px wide, so the doorway is 28 px tall
// and 14 px wide: he walks in without ducking. The door stands on the pivot, so a game can put the
// "enter" spot one step below it.
import { lerp } from '../../../motion.js';
import { INK } from '../colour.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { ROOF_KINDS, houseColours, pitchedRoof, timberWall, plankDoor, doorSwing, doorStep, litWindow, chimneyStack, chimneySmoke } from './buildings.js';

const P = PALETTE.hearthvale, C = houseColours('hearthvale');   // C: glass, doorway, floor, and the plaster and beam swatches
const CX = 48, GROUND = 92;                    // the lowest body row is GROUND - 1; the outline lands on GROUND
const WALL_TOP = 54, EAVE = 57, WALL_H = GROUND - WALL_TOP;
const DOOR = { w: 18, h: 30 };                 // with its frame: the doorway itself is 14 x 28
// how tall each roof stands above the eave, and how far it overhangs the wall on each side
const ROOF = { thatch: { h: 31, over: 4 }, tile: { h: 29, over: 3 }, slate: { h: 33, over: 3 } };

/** Where everything is for these settings: shared by every clip. */
function plan(p) {
  const w = 2 * Math.round(lerp(25, 37, p.width)), x0 = CX - w / 2, x1 = x0 + w;
  const door = { x: CX - DOOR.w / 2, y: GROUND - 2 - DOOR.h, ...DOOR };
  // a window sits in the middle of the wall between a corner post and the door frame
  const zone = door.x - (x0 + 3), ww = Math.max(9, Math.min(15, 2 * Math.floor((zone - 7) / 2) + 1));
  const off = Math.floor((zone - ww) / 2);
  const win = (left) => ({ x: left ? x0 + 3 + off : door.x + door.w + (zone - ww - off), y: 64, w: ww, h: 13 });
  const R = ROOF[p.roof];
  const roof = { x: x0 - R.over, y: EAVE - R.h, w: w + 2 * R.over, h: R.h, kind: p.roof };
  const chimney = { x: CX + 2 * Math.round(w * 0.14), y: roof.y - 4, w: 8, h: 14 };
  return { w, x0, x1, door, zone, windows: p.windows === 'two' ? [win(true), win(false)] : [win(false)], roof, chimney };
}

/** The old sprite's render: draws one frame of clip `clip` at phase t (frame `frame`) with settings p on the grid g. */
export function render(g, { clip, t, p }) {
  const L = plan(p), night = clip === 'lit';
  const open = clip === 'open' ? doorSwing(t) : 0;

  // ---- the front wall: a rail under the windows, and where a window is left out the timbers cross instead ----
  const rail = 80, left = [L.x0, L.door.x], right = [L.door.x + L.door.w, L.x1];
  const braces = p.windows === 'one' ? [[L.x0 + 4, rail - 2, L.door.x - 2, EAVE + 4], [L.x0 + 4, EAVE + 4, L.door.x - 2, rail - 2]] : [];
  timberWall(g, { x: L.x0, y: WALL_TOP, w: L.w, h: WALL_H, wall: p.wall, wood: p.wood, eave: EAVE, rails: [[rail, ...left], [rail, ...right]], braces });

  // at night each window's candle flickers on its own beat
  L.windows.forEach((w, beat) => litWindow(g, { ...w, wood: p.wood, glass: C.glass, glow: p.glow, over: p.wall, night, t, beat }));

  plankDoor(g, { ...L.door, wood: p.wood, open, inside: C.doorway, floor: C.floor, knob: P.gold });
  doorStep(g, { x: L.door.x, w: L.door.w, ground: GROUND, stone: P.cobble });

  // ---- the roof over the wall's top rows, and the chimney standing on it ----
  pitchedRoof(g, { ...L.roof, colour: p.roofColour });
  const top = p.chimney ? chimneyStack(g, { ...L.chimney, stone: P.cobble }) : null;

  g.outline(INK);
  // smoke is not outlined: the helper rims each puff with a darker tone of its own colour
  if (top && night) chimneySmoke(g, { t, ...top, colour: P.cobble, count: 6, size: 4, rise: 15, drift: -5, minSize: 5 });
}
