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

import { INK, ramp, mix, tone } from './color.js';
import { ellipseIn, capsuleIn } from './surface.js';

const TAU = Math.PI * 2;

/**
 * Draws a flight of stairs that fills one 32x32 tile of a top-down map: 'down' sinks to the north, each tread darker, into the dark; 'up' climbs to the north, each tread lighter, with its riser showing under it. Returns g.
 * Arguments: g (the 32x32 Surface); dir ('down' or 'up'); options { tread (the colour of the steps, usually the floor's), wall (the colour of the two side walls, default tread), dark (the colour of the darkness a flight going down ends in, default the outline colour), steps (how many, 3 to 7, default 5), cheek (px of side wall inside each ink line, 1 to 5, default 3), ink (the line round the west, north and east sides, default INK; the south side is open: that is where it is walked onto) }.
 * Every tread is one flat tone of the tread colour's ramp (light, base, dark, deep and the halves between them), so a flight uses about a dozen colours and the steps stay apart under the whole-bundle looks.
 */
export function drawStairs(g, dir, { tread = '#7e84a0', wall = tread, dark = INK, steps = 5, cheek = 3, ink = INK } = {}) {
  if (dir !== 'down' && dir !== 'up') throw new Error(`drawStairs: "${dir}" is not down or up`);
  const S = g.w, n = Math.max(3, Math.min(7, Math.round(steps))), c = Math.max(1, Math.min(5, Math.round(cheek)));
  const T = ramp(tread), Wl = ramp(wall);
  // a ladder of flat tones along a ramp: 0 is its first colour, 1 its last
  const along = (list, k) => { const f = Math.max(0, Math.min(1, k)) * (list.length - 1), i = Math.min(list.length - 2, Math.floor(f)), r = Math.round((f - i) * 2) / 2; return r === 0 ? list[i] : r === 1 ? list[i + 1] : mix(list[i], list[i + 1], 0.5); };
  const x0 = 1 + c, x1 = S - 1 - c;                                     // the treads lie in columns x0 .. x1 - 1
  const head = dir === 'down' ? 4 : 1;                                   // rows at the north end: the dark a flight sinks into, or only the line
  const rows = S - head, each = Math.floor(rows / n), spare = rows - each * n;
  g.rect(0, 0, S, S, dir === 'down' ? dark : T.dark);
  let y = S;                                                              // steps are laid from the south edge northwards
  for (let k = 0; k < n; k++) {
    const h = each + (k < spare ? 1 : 0), top = y - h, u = k / (n - 1);
    if (dir === 'down') {
      g.rect(x0, top, x1 - x0, h, along([T.base, T.dark, T.deep], u));
      g.rect(x0, top, x1 - x0, 1, k === n - 1 ? dark : along([T.dark, T.deep, dark], u));     // the drop beyond its far edge
      if (k === 0) g.rect(x0, top + 1, x1 - x0, 1, T.light);            // the first nosing, level with the floor, catches the light
      // the side walls sink into the dark with the steps: the west one faces the light
      g.rect(1, top, c, h, along([Wl.base, Wl.dark, Wl.deep], u)); g.rect(c, top, 1, h, along([Wl.dark, Wl.deep, dark], u));
      g.rect(x1, top, c, h, along([Wl.dark, Wl.deep, dark], u));
    } else {
      const rise = Math.max(2, Math.round(h * 0.4));
      g.rect(x0, top, x1 - x0, h - rise, along([T.dark, T.base, T.light], u));                // the tread
      g.rect(x0, top + h - rise, x1 - x0, rise, along([T.deep, T.dark, T.base], u));           // the riser under it, facing the camera, in shade
    }
    y = top;
  }
  if (dir === 'up') {
    // the side walls stand above the steps: lit on the west, in shade on the east, a light line along their tops
    g.rect(1, 0, c, S, Wl.base); g.rect(1, 0, 1, S, Wl.light); g.rect(x1, 0, c, S, Wl.dark); g.rect(x1, 0, 1, S, Wl.deep);
    g.rect(x0, 0, x1 - x0, 1, T.light);
  }
  if (ink) { g.rect(0, 0, 1, S, ink); g.rect(S - 1, 0, 1, S, ink); g.rect(0, 0, S, 1, ink); }
  return g;
}

/**
 * Makes the paint of a hole's north edge band on a top-down map: the inner wall seen going down, in courses of stone that darken course by course into the hole's depth; returns paint(d, u) for a tile material's top edge.
 * Arguments: options { depth (px of wall that show: the edge's depth), course (px per course, its last row being the joint under it, default 4), joints ([[u, ...], ...]: the columns 0..31 of the upright joints of each course from the top down, used in turn; default none), tones ([{ body, joint }, ...]: the colours of each course from the top down; a course without `joint` is one plain band; the last entry is used for every course below it), lit (a colour for the first row under the rim, where light still falls; left out: the first course's body) }.
 * Give the lowest course a tone the whole-bundle looks keep apart from the hole's own colour, and each course one that differs clearly from the next: the fade is stepped, never a smooth blend. The pattern repeats every 32 px along the edge when the joints do.
 */
export function sunkWall({ depth = 12, course = 4, joints = [], tones = [], lit = null } = {}) {
  if (!tones.length) throw new Error('sunkWall: give at least one tone, { body, joint }');
  const high = Math.max(2, Math.round(course)), n = Math.max(1, Math.ceil(depth / high));
  return (d, u) => {
    const c = Math.min(n - 1, Math.floor((d - 1) / high)), row = (d - 1) - c * high, T = tones[Math.min(c, tones.length - 1)];
    if (d === 1 && lit) return lit;
    if (!T.joint) return T.body;
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
