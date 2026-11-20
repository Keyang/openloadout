// PORT (migration batch P4): the drawing of the code sprite sprites/inn.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims (engine/gen/ports/colour.js) and at the ported engine helpers
// (engine/gen/ports/p4/, engine/gen/ports/e2/), so it draws paint refs on an engine/gen/port-surface.js grid. It is the
// drawing of the generator building.inn@1 (engine/gen/world-p4.js), which sprites/inn.json names; it goes only with the last
// version that draws with it. Its settings (p) are that generator's arguments; its colours are the paint refs the data
// file names. A HAND CHANGE note says where it differs from its source (the frozen copy
// tests/fixtures/code-sprites/inn.js); never change what a released generator version draws through it.
// Inn: the biggest building of the Hearthvale village, seen from the south in three-quarter view. Two storeys
// (the upper one juts out over the lower by a pixel on a jetty beam), a wide double door, a row of upstairs
// windows and a picture sign hanging on a bracket by the door, where the cottage has its second window. Built
// exactly as `cottage` is, from the same pieces of engine/buildings.js, so the two stand side by side as one
// village: this file only says where the pieces of THIS house go (plan), what is painted on its sign, and
// which clip shows what.
//
// Scale: the doorway is 28 px tall like the cottage's (the map hero is 30 px tall) and 20 px wide.
import { lerp, wave } from '../../../motion.js';
import { pick, INK } from '../colour.js';
import { ellipseIn } from './surface.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { ROOF_KINDS, houseColours, pitchedRoof, timberWall, plankDoor, doorSwing, doorStep, litWindow, chimneyStack, chimneySmoke, hangingSign } from './buildings.js';

const P = PALETTE.hearthvale, C = houseColours('hearthvale');   // C: glass, doorway, floor, and the plaster and beam swatches
const CX = 64, GROUND = 92;                    // the lowest body row is GROUND - 1; the outline lands on GROUND
const FLOOR_TOP = 58;                          // where the ground floor's wall begins, under the jetty beam
const UP_TOP = 36, EAVE = 39;                  // the upper storey's wall, and the row the eave ends on
const DOOR = { w: 24, h: 30 };                 // with its frame: two leaves of 10 px, 28 px tall
const SIGN = { w: 11, h: 10, sway: 2 };         // the board, and how far its bottom edge swings each way at night
// how tall each roof stands above the eave, and how far it overhangs the wall on each side
const ROOF = { thatch: { h: 22, over: 4 }, tile: { h: 20, over: 3 }, slate: { h: 23, over: 3 } };

/** Where everything is for these settings: shared by every clip. */
function plan(p) {
  const w = 2 * Math.round(lerp(38, 48, p.width)), x0 = CX - w / 2, x1 = x0 + w;
  const door = { x: CX - DOOR.w / 2, y: GROUND - 2 - DOOR.h, ...DOOR };
  // on each side of the door a stretch of plaster `zone` px wide, from the door frame to the corner post, with a
  // window in the middle of it. Where the sign hangs it takes the right-hand window's place: a board that swings
  // needs the whole stretch (the narrowest inn has 23 px; the inked board is 13, its swing 2 more on each side).
  const zone = door.x - (x0 + 3), ww = Math.max(9, Math.min(15, 2 * Math.floor((zone - 7) / 2) + 1));
  const mid = Math.floor((zone - ww) / 2), right = door.x + door.w;
  const down = [{ x: x0 + 3 + mid, y: 64, w: ww, h: 13 }];
  if (p.sign === 'none') down.push({ x: x1 - 3 - mid - ww, y: 64, w: ww, h: 13 });
  // the board hangs in the middle of its stretch, so at least 3 px of plaster stay on each side at the end of a swing
  const sign = { x: right + Math.floor((zone - SIGN.w - 2) / 2), y: 62, arm: SIGN.w + 1, ...SIGN };
  // upstairs: a row of small windows, with a stud between each two
  const n = w >= 92 ? 4 : 3, uw = 11, inner = w - 4, pitch = (inner - n * uw) / (n + 1);
  const up = [], studs = [];
  for (let i = 0; i < n; i++) up.push({ x: Math.round(x0 + 2 + pitch + i * (uw + pitch)), y: EAVE + 3, w: uw, h: 11 });
  for (let i = 1; i < n; i++) studs.push(Math.round((up[i - 1].x + uw + up[i].x) / 2 - 1.5));
  const R = ROOF[p.roof];
  const roof = { x: x0 - 1 - R.over, y: EAVE - R.h, w: w + 2 + 2 * R.over, h: R.h, kind: p.roof };
  const chimney = { x: CX + 2 * Math.round(w * 0.16), y: roof.y - 4, w: 8, h: 13 };
  return { w, x0, x1, door, down, up, studs, sign, roof, chimney };
}

// ---- what is painted on the sign: each picture fits 7 x 7 px around (cx, cy) and is one flat colour ----
const PICTURES = {
  // a tankard: a foam cap wider than the body, and a handle
  mug(s, cx, cy, c) {
    s.rect(cx - 3, cy - 3, 5, 2, c);
    s.rect(cx - 2, cy - 1, 4, 5, c);
    s.rect(cx + 2, cy - 1, 2, 1, c);
    s.rect(cx + 3, cy, 1, 2, c);
    s.rect(cx + 2, cy + 2, 2, 1, c);
  },
  // a bed from the side: a tall headboard, a pillow, the mattress and a foot post
  bed(s, cx, cy, c) {
    s.rect(cx - 3, cy - 3, 1, 7, c);
    s.rect(cx - 2, cy - 1, 2, 1, c);
    s.rect(cx - 2, cy, 5, 2, c);
    s.rect(cx + 3, cy - 1, 1, 5, c);
  },
  // a crescent moon, its horns to the right
  moon(s, cx, cy, c) {
    s.blob([ellipseIn(cx, cy + 0.5, 3.6, 3.6)], c, { minus: [ellipseIn(cx + 2, cy + 0.5, 3, 3)] });
  },
};

/** The old sprite's render: draws one frame of clip `clip` at phase t (frame `frame`) with settings p on the grid g. */
export function render(g, { clip, t, p }) {
  const L = plan(p), night = clip === 'lit';
  const open = clip === 'open' ? doorSwing(t) : 0;

  // ---- the ground floor, in the shadow of the storey above; then that storey on its jetty beam ----
  const rail = 80;
  timberWall(g, { x: L.x0, y: FLOOR_TOP, w: L.w, h: GROUND - FLOOR_TOP, wall: p.wall, wood: p.wood, eave: FLOOR_TOP, rails: [[rail, L.x0, L.door.x], [rail, L.door.x + L.door.w, L.x1]] });
  timberWall(g, { x: L.x0 - 1, y: UP_TOP, w: L.w + 2, h: FLOOR_TOP - UP_TOP, wall: p.wall, wood: p.wood, eave: EAVE, posts: L.studs });

  // at night each window's candle flickers on its own beat; only the ground-floor windows have a sill
  [...L.down, ...L.up].forEach((w, beat) => litWindow(g, { ...w, wood: p.wood, glass: C.glass, glow: p.glow, over: p.wall, night, t, beat, sill: beat < L.down.length }));

  plankDoor(g, { ...L.door, wood: p.wood, leaves: 2, open, inside: C.doorway, floor: C.floor, knob: P.gold });
  doorStep(g, { x: L.door.x, w: L.door.w, ground: GROUND, stone: P.cobble });

  // ---- the sign by the door: it hangs still by day and sways at night ----
  if (p.sign !== 'none') {
    const mark = pick(p.signColour, P.cream, INK);
    hangingSign(g, {
      ...L.sign, drop: 2, swing: night ? SIGN.sway * wave(t) : 0, iron: P.slate, board: p.signColour, frame: p.wood,
      picture: (s, cx, cy) => PICTURES[p.sign](s, cx, cy, mark),
    });
  }

  // ---- the roof over the upper wall's top rows, and the chimney standing on it ----
  pitchedRoof(g, { ...L.roof, colour: p.roofColour });
  const top = p.chimney ? chimneyStack(g, { ...L.chimney, stone: P.cobble }) : null;

  g.outline(INK);
  // smoke is not outlined: the helper rims each puff with a darker tone of its own colour
  if (top && night) chimneySmoke(g, { t, ...top, colour: P.cobble, count: 6, size: 3.5, rise: Math.min(11, top.y - 5), drift: -6, minSize: 5 });
}
