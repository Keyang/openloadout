// Dungeon pieces for top-down (three-quarter view) maps: a flight of stairs that fills one tile, the inner wall
// of a pit, bones to scatter on a floor, and a rune seal that turns over a door or a floor.
// (docs/style-guide.md section 1: the camera looks from the south, tilted down, so of a hole it sees the north
// inner wall, and of a flight of stairs it sees the treads, plus the risers when the flight climbs away from it.)
// Pure functions: Node and browser, no Math.random. Worked example: sprites/tiles-dungeon.json, sprites/dungeon-door.json.
//
//   import { drawStairs, sunkWall, boneIn, runeSeal } from '../engine/dungeon.js';
//   drawStairs(g, 'down', { tread: p.floor, wall: p.stone });                     // a whole tile: steps going down to the north
//   drawStairs(g, 'up', { tread: p.floor, wall: p.stone });                       // steps climbing to the north
//   const pit = { ink: INK, fill: () => INK, top: { depth: 12, paint: sunkWall({ depth: 12, joints, tones: [{ body, joint }, { body: joint }] }) } };
//   g.blob([boneIn(8, 20, 17, 16)], ramp(P.cream), { outline: tone(P.cream, -1.4) });   // a bone lying on the floor
//   runeSeal(g, 16.5, 24.5, 9, t / 3, steps(p.glow));                             // after g.outline: it is light

import { tone } from './color.js';


const TAU = Math.PI * 2;

/**
 * Draws a rune seal seen face on, a thing made of light: an outer ring rimmed with a darker tone in place of an ink line, and inside it an inner ring, rune marks that turn between the two and a mark at the heart, through which what it lies on still shows. Draw it after g.outline. Returns g.
 * Arguments: g (the Surface); cx, cy (its middle; pixel centres are at .5); r (the outer ring's radius, 6 or more); turn (how far the marks have turned, in turns; the marks are by turns a stroke and a dot, so going from 0 to 2 / marks over a loop closes it); colours (the steps of the light, hottest first, as steps() in engine/fx.js gives them: the marks take the first, the rings the middle one, the rim the last); options { marks (how many rune marks, default 6), heat (0..1: 1 makes the rings as hot as the marks, default 0), box ([x0, y0, x1, y1]: nothing is drawn outside it) }.
 */
export function runeSeal(g, cx, cy, r, turn, colours, { marks = 6, heat = 0, box } = {}) {
  const C = Array.isArray(colours) ? colours : [tone(colours, 1.6), colours, tone(colours, -1)];
  const hot = C[0], rim = C[C.length - 1], body = heat >= 0.5 ? C[Math.min(1, C.length - 2)] : C[Math.max(0, Math.floor((C.length - 1) / 2))];
  const B = box ?? [1, 1, g.w - 1, g.h - 1];
  const inBox = (px, py) => px >= B[0] && py >= B[1] && px < B[2] && py < B[3];
  const ringAt = (rad) => (px, py) => { const d = Math.hypot(px - cx, py - cy); return d <= rad && d > rad - 1; };
  const inner = Math.max(2, r - 5), mid = (r - 1 + inner) / 2;
  const outerRing = ringAt(r), innerRing = ringAt(inner);
  const n = Math.max(2, Math.round(marks)), dots = [];
  for (let i = 0; i < n; i++) { const a = TAU * (turn + i / n); dots.push([Math.floor(cx + Math.sin(a) * mid), Math.floor(cy - Math.cos(a) * mid), i % 2]); }
  // rune marks: by turns a short upright stroke and a square dot, so the turning shows
  const mark = (px, py) => dots.some(([x, y, kind]) => (kind ? px >= x && px < x + 1 && py >= y - 1 && py < y + 2 : px >= x && px < x + 2 && py >= y && py < y + 2));
  const heart = (px, py) => Math.abs(px - cx) + Math.abs(py - cy) <= 1.5;
  const lines = (px, py) => outerRing(px, py) || innerRing(px, py);
  const x0 = Math.floor(cx - r - 2), y0 = Math.floor(cy - r - 2), x1 = Math.ceil(cx + r + 2), y1 = Math.ceil(cy + r + 2);
  // only the outer ring is rimmed: a rim round every stroke would fill the seal in, and what it lies on must show through
  g.fill(x0, y0, x1, y1, outerRing, rim, { outline: rim, clip: inBox });
  g.fill(x0, y0, x1, y1, lines, body, { clip: inBox });
  g.fill(x0, y0, x1, y1, (px, py) => mark(px, py) || heart(px, py), hot, { clip: inBox });
  return g;
}
