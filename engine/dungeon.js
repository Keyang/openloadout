// Dungeon pieces for top-down (three-quarter view) maps: a flight of stairs that fills one tile, the inner wall
// of a pit, bones to scatter on a floor, and a rune seal that turns over a door or a floor.
// (docs/style-guide.md section 1: the camera looks from the south, tilted down, so of a hole it sees the north
// inner wall, and of a flight of stairs it sees the treads, plus the risers when the flight climbs away from it.)
// Pure functions: Node and browser, no Math.random. Worked example: sprites/tiles-dungeon.js, sprites/dungeon-door.js.
//
//   import { drawStairs, sunkWall, boneIn, runeSeal } from '../engine/dungeon.js';
//   drawStairs(g, 'down', { tread: p.floor, wall: p.stone, dark: pit });          // a whole tile: steps going down to the north
//   drawStairs(g, 'up', { tread: p.floor, wall: p.stone });                       // steps climbing to the north
//   const pit = { ink: INK, fill: () => dark, top: { depth: 12, paint: sunkWall({ depth: 12, body, joint, dark, lit }) } };
//   g.blob([boneIn(8, 20, 17, 16)], ramp(P.cream), { outline: tone(P.cream, -1.4) });   // a bone lying on the floor
//   runeSeal(g, 16, 24, 10, t / 6, steps(p.glow));                                // after g.outline: it is light

import { INK, ramp, mix, tone } from './color.js';
import { ellipseIn, capsuleIn } from './surface.js';

const TAU = Math.PI * 2;

/**
 * Draws a flight of stairs that fills one 32x32 tile of a top-down map: 'down' sinks to the north, each tread darker, into the dark; 'up' climbs to the north, each tread lighter, with its riser showing under it. Returns g.
 * Arguments: g (the 32x32 Surface); dir ('down' or 'up'); options { tread (the colour of the steps, usually the floor's), wall (the colour of the two side walls, default tread), dark (the colour of the darkness a flight going down ends in, default near the outline colour), steps (how many, 3 to 7, default 5), cheek (px of side wall inside each ink line, 1 to 5, default 3), ink (the line round the west, north and east sides, default INK; the south side is open: that is where it is walked onto) }.
 */
export function drawStairs(g, dir, { tread = '#7e84a0', wall = tread, dark = mix(INK, ramp(wall).deep, 0.4), steps = 5, cheek = 3, ink = INK } = {}) {
  if (dir !== 'down' && dir !== 'up') throw new Error(`drawStairs: "${dir}" is not down or up`);
  const S = g.w, n = Math.max(3, Math.min(7, Math.round(steps))), c = Math.max(1, Math.min(5, Math.round(cheek)));
  const T = ramp(tread), Wl = ramp(wall);
  const x0 = 1 + c, x1 = S - 1 - c;                                     // the treads lie in columns x0 .. x1 - 1
  const head = dir === 'down' ? 4 : 1;                                   // rows at the north end: the dark a flight sinks into, or only the line
  const rows = S - head, each = Math.floor(rows / n), spare = rows - each * n;
  // the tones of the treads, from the one level with the floor to the last: stepped, never a smooth blend
  const down = (k) => (k === 0 ? T.base : mix(T.base, dark, Math.min(0.85, (k / (n - 1)) * 0.85)));
  const up = (k) => (k === n - 1 ? T.light : mix(T.dark, T.light, k / (n - 1)));
  g.rect(0, 0, S, S, dir === 'down' ? dark : T.dark);
  let y = S;                                                              // steps are laid from the south edge northwards
  for (let k = 0; k < n; k++) {
    const h = each + (k < spare ? 1 : 0), top = y - h;
    if (dir === 'down') {
      const body = down(k);
      g.rect(x0, top, x1 - x0, h, body);
      g.rect(x0, top, x1 - x0, 1, mix(body, dark, 0.6));                 // the drop beyond its far edge
      if (h >= 4) g.rect(x0, top + 1, x1 - x0, 1, mix(body, T.light, k === 0 ? 0.5 : 0.25));   // the nosing catches the light
    } else {
      const body = up(k), rise = Math.max(2, Math.round(h * 0.4));
      g.rect(x0, top, x1 - x0, h - rise, body);                          // the tread
      g.rect(x0, top, x1 - x0, 1, mix(body, '#ffffff', 0.25));           // its far edge, lit
      g.rect(x0, top + h - rise, x1 - x0, rise, mix(body, T.deep, 0.55));   // the riser under it, facing the camera, in shade
      g.rect(x0, top + h - 1, x1 - x0, 1, mix(body, T.deep, 0.8));
    }
    y = top;
  }
  // the side walls: the west one faces the light, the east one is turned from it
  for (let yy = head; yy < S; yy++) {
    const k = Math.min(n - 1, Math.floor((S - 1 - yy) / each));
    const fade = dir === 'down' ? Math.min(0.8, (k / (n - 1)) * 0.8) : 0;
    for (let i = 0; i < c; i++) {
      g.dot(1 + i, yy, mix(i === c - 1 ? Wl.dark : Wl.base, dark, fade));
      g.dot(S - 2 - i, yy, mix(i === c - 1 ? Wl.deep : Wl.dark, dark, fade));
    }
  }
  if (dir === 'up') { g.rect(1, 0, S - 2, 1, Wl.light); for (let i = 0; i < c; i++) { g.rect(1 + i, 0, 1, S, i ? Wl.base : Wl.light); g.rect(S - 2 - i, 0, 1, S, i ? Wl.dark : Wl.base); } }
  if (ink) { g.rect(0, 0, 1, S, ink); g.rect(S - 1, 0, 1, S, ink); g.rect(0, 0, S, 1, ink); }
  return g;
}

/**
 * Makes the paint of a hole's north edge band on a top-down map: the inner wall seen going down, in courses of stone that darken step by step into the hole's depth; returns paint(d, u) for a tile material's top edge.
 * Arguments: options { depth (px of wall that show: the edge's depth), course (px per course, its last row being the joint under it, default 4), joints ([[u, ...], ...]: the columns 0..31 of the upright joints of each course from the top down, used in turn; default none), body (the stones' colour at the top), joint (the joints' colour at the top), dark (the colour of the hole's depth, which the wall fades towards), lit (a colour for the first row under the rim, where light still falls; left out: body), fade (0..1: how far towards `dark` the lowest course has gone, default 0.8) }.
 * Every course is one flat tone: the fade is stepped, never a smooth blend. The pattern repeats every 32 px along the edge when the joints do.
 */
export function sunkWall({ depth = 12, course = 4, joints = [], body, joint, dark, lit = null, fade = 0.8 } = {}) {
  const high = Math.max(2, Math.round(course)), n = Math.max(1, Math.ceil(depth / high));
  const tones = [];
  for (let c = 0; c < n; c++) { const k = n > 1 ? (c / (n - 1)) * fade : 0; tones.push({ body: mix(body, dark, k), joint: mix(joint, dark, Math.min(1, k + 0.15)) }); }
  return (d, u) => {
    const c = Math.min(n - 1, Math.floor((d - 1) / high)), row = (d - 1) - c * high, T = tones[c];
    if (d === 1 && lit) return lit;
    if (row === high - 1 && c < n - 1) return T.joint;
    if (joints.length && joints[c % joints.length].includes(u)) return T.joint;
    return T.body;
  };
}

/**
 * Shape test for a long bone lying flat: a thin shaft from (x0, y0) to (x1, y1) with a two-lobed knob at each end; returns inside(px, py).
 * Arguments: x0, y0, x1, y1 (the two ends of the shaft); r (half the shaft's thickness in px, default 0.8); knob (the radius of each of the four lobes, default 1.5).
 */
export function boneIn(x0, y0, x1, y1, r = 0.8, knob = 1.5) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, off = knob * 0.75;
  const parts = [capsuleIn(x0, y0, x1, y1, r)];
  for (const [ex, ey] of [[x0, y0], [x1, y1]]) for (const s of [-1, 1]) parts.push(ellipseIn(ex + nx * off * s, ey + ny * off * s, knob, knob));
  return (px, py) => parts.some((f) => f(px, py));
}

/**
 * Draws a rune seal seen face on, a thing made of light: an outer ring, an inner ring, rune marks that turn between them and a mark at the heart, rimmed with a darker tone in place of an ink line. Draw it after g.outline. Returns g.
 * Arguments: g (the Surface); cx, cy (its middle; pixel centres are at .5); r (the outer ring's radius, 6 or more); turn (how far the marks have turned, in turns: with `marks` marks, going from 0 to 1 / marks over a loop closes it); colours (the steps of the light, hottest first, as steps() in engine/fx.js gives them: the marks take the first, the rings the middle one, the rim the last); options { marks (how many rune marks, default 6), heat (0..1: 1 makes the rings as hot as the marks, default 0), box ([x0, y0, x1, y1]: nothing is drawn outside it) }.
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
  const whole = (px, py) => lines(px, py) || mark(px, py) || heart(px, py);
  const x0 = Math.floor(cx - r - 2), y0 = Math.floor(cy - r - 2), x1 = Math.ceil(cx + r + 2), y1 = Math.ceil(cy + r + 2);
  g.fill(x0, y0, x1, y1, whole, rim, { outline: rim, clip: inBox });
  g.fill(x0, y0, x1, y1, lines, body, { clip: inBox });
  g.fill(x0, y0, x1, y1, (px, py) => mark(px, py) || heart(px, py), hot, { clip: inBox });
  return g;
}
