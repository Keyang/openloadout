// Standing crystals (added with batch R10: the Hearthvale save crystal): big cut stones that float or stand
// upright and turn slowly about their upright axis, for save points, shrines, power cores and boss weak spots.
// The small gems a player picks up are in pickups.js (drawGem); these are their big cousins, drawn as solids
// whose faces slide across as they turn, and the glow that hugs them. Pure functions: Node and browser.
// Worked example: sprites/save-crystal.js.
//
//   import { CRYSTAL_CUTS, crystalFaces, drawCrystal, drawAura } from '../engine/crystals.js';
//   const body = new Surface(32, 48);
//   const stone = drawCrystal(body, 16, 22, 5, 10, p.body, { cut: p.shape, turn: t });   // t 0..1: one step of the turn
//   glint(body, stone, { x: 16, y: 22, r: 10, phase });                                   // pickups.js: a band of light across it
//   body.outline(INK);
//   drawAura(g, body, { reach: 2, colours: [p.glow, tone(p.glow, -1)] });                 // light: under the body, no ink
//   g.blit(body);
//
// A turn of 1 brings a crystal back to where it started (a four-sided shard has turned a quarter, a six-sided
// prism a sixth), so a looping clip that runs `turn` from 0 to 1 closes exactly.
//
// Styles: the faces are polygons and carry over to any style; drawAura reads pixels back, so it is pixel only.

import { ramp, mix, col } from './color.js';
import { polyIn, ellipseIn } from './surface.js';
import { starPoints } from './shapes.js';

const TAU = Math.PI * 2;

/** The cuts drawCrystal and crystalFaces accept: shard (a long four-sided point), prism (a six-sided column with pointed ends), orb (a polished ball) and star (a flat four-pointed star). No arguments: a frozen list. */
export const CRYSTAL_CUTS = Object.freeze(['shard', 'prism', 'orb', 'star']);

// A spindle: a ring of `sides` corners at the waist (or two rings, for a column), a point above and a point below.
const SPINDLES = { shard: { sides: 4, top: 0.22, bottom: 0.22, width: 1 }, prism: { sides: 6, top: -0.5, bottom: 0.5, width: 1 } };
// which tone a face gets from the way it is turned (light from the top right): 2 hard highlight, 1 light, 0 base, -1 dark
const toneOf = (score) => (score > 0.95 ? 2 : score > 0.3 ? 1 : score > -0.45 ? 0 : -1);

/**
 * The faces of a standing crystal that fills the box cx ± rx, cy ± ry, turned about its upright axis: { outline, faces }, outline a shape test of its silhouette and faces a list of { pts, tone } polygons, tone 2 (hard highlight), 1 (light), 0 (base) or -1 (dark) for light from the top right.
 * Arguments: cx, cy (centre); rx, ry (half its width and height in pixels); cut (one of CRYSTAL_CUTS, default 'shard'); turn (0..1: one step of its turn, after which it looks as it did at 0). The orb has no faces: its list is empty and drawCrystal polishes it.
 */
export function crystalFaces(cx, cy, rx, ry, cut = 'shard', turn = 0) {
  if (cut === 'orb') return { outline: ellipseIn(cx, cy, rx, ry), faces: [] };
  if (cut === 'star') {
    // a flat star that swings a little to either side as it turns: it narrows, and the light moves over its arms
    const swing = Math.sin(TAU * turn), wide = 1 - 0.22 * Math.abs(swing);
    const pts = starPoints(0, 0, 1, 4, { inner: 0.36 }).map(([x, y]) => [cx + x * rx * wide, cy + y * ry]);
    const faces = pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length], tip = i % 2 ? b : a, side = i % 2 ? a : b;
      // the half of an arm faces away from the arm's ridge, towards its inside corner
      const ax = tip[0] - cx, ay = tip[1] - cy, len = Math.hypot(ax, ay) || 1;
      const k = ((side[0] - cx) * ax + (side[1] - cy) * ay) / (len * len);
      const nx = side[0] - cx - k * ax, ny = side[1] - cy - k * ay, n = Math.hypot(nx, ny) || 1;
      // ... and an arm that points towards the light is brighter all over than one that points away
      const arm = 0.6 * ((ax / len) * 0.7 - (ay / len) * 0.7);
      return { pts: [[cx, cy], a, b], tone: toneOf(1.1 * ((nx / n) * 0.7 - (ny / n) * 0.7) + arm + 0.45 * swing * Math.sign(nx || 1)) };
    });
    return { outline: polyIn(pts), faces };
  }
  const S = SPINDLES[cut] ?? SPINDLES.shard, n = S.sides, lean = Math.min(1.2, ry * 0.1);
  const at = (i, h) => { const a = (turn + i) * (TAU / n); return [cx + Math.sin(a) * rx * S.width, cy + h * ry + Math.cos(a) * lean, Math.cos(a)]; };
  const up = [cx, cy - ry], down = [cx, cy + ry];
  const faces = [], all = [];
  for (let i = 0; i < n; i++) {
    const mid = (turn + i + 0.5) * (TAU / n), toUs = Math.cos(mid), toLight = Math.sin(mid);
    const a = at(i, S.top), b = at(i + 1, S.top), c = at(i + 1, S.bottom), d = at(i, S.bottom);
    const column = S.bottom > S.top;
    const list = [{ pts: [up, a, b], lift: 0.45 }, ...(column ? [{ pts: [a, b, c, d], lift: 0 }] : []), { pts: [d, c, down], lift: -0.55 }];
    for (const f of list) {
      const pts = f.pts.map(([x, y]) => [x, y]);
      all.push(polyIn(pts));
      if (toUs > 0.02) faces.push({ pts, tone: toneOf(toLight + f.lift) });
    }
  }
  return { outline: (px, py) => all.some((f) => f(px, py)), faces };
}

/**
 * Draws a standing crystal that fills the box cx ± rx, cy ± ry, lit from the top right, turned about its upright axis; returns its silhouette as a shape test (for a glint or a glow). Call g.outline afterwards.
 * Arguments: g (the Surface); cx, cy (centre); rx, ry (half its width and height in pixels); colour; options { cut (one of CRYSTAL_CUTS, default 'shard'), turn (0..1: one step of its turn; run it from 0 to 1 over a loop) }.
 */
export function drawCrystal(g, cx, cy, rx, ry, colour, { cut = 'shard', turn = 0 } = {}) {
  const R = ramp(colour), { outline, faces } = crystalFaces(cx, cy, rx, ry, cut, turn);
  const box = [cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2];
  const tones = { 2: mix(R.light, '#ffffff', 0.55), 1: R.light, 0: R.base, [-1]: R.dark };
  if (cut === 'orb') {
    // a polished ball: a dark side, a window of light that drifts a little as it turns, a white spot in it
    g.fill(...box, outline, R, { shade: Math.min(rx, ry) >= 6 ? 2 : 1 });
    const a = TAU * turn, wx = cx + rx * (0.28 + 0.1 * Math.cos(a)), wy = cy - ry * (0.3 + 0.08 * Math.sin(a));
    const keep = (px, py) => outline(px, py) && outline(px + 1, py) && outline(px, py - 1);
    g.fill(...box, ellipseIn(wx, wy, rx * 0.42, ry * 0.42), R.light, { clip: keep });
    g.fill(...box, ellipseIn(wx + rx * 0.12, wy - ry * 0.1, Math.max(1, rx * 0.18), Math.max(1, ry * 0.18)), tones[2], { clip: keep });
    g.fill(...box, (px, py) => outline(px, py) && !outline(px + 1.5, py - 1.5) && px < cx && py > cy, R.dark);
    return outline;
  }
  g.fill(...box, outline, R.base);
  for (const f of faces) g.fill(...box, polyIn(f.pts), tones[f.tone] ?? R.base, { clip: outline });
  return outline;
}

/**
 * Paints a glow that hugs whatever is drawn on another Surface: every empty pixel within `reach` px of it, in rings of colour from the nearest outwards. Draw it on the frame first and paste the other Surface over it, so the glow is light behind an inked thing.
 * Arguments: g (the Surface to paint on); src (the Surface whose drawing glows, the same size); options { reach (px, default 2), colours (a list, nearest ring first; the last is used for the rest; default white), dx, dy (where src will be pasted, default 0 and 0), box ([x0, y0, x1, y1] to keep the glow in; default the frame inside its 1 px border) }.
 */
export function drawAura(g, src, { reach = 2, colours = ['#ffffff'], dx = 0, dy = 0, box } = {}) {
  const r = Math.max(0, Math.round(reach));
  if (!r) return g;
  const [x0, y0, x1, y1] = box ?? [1, 1, g.w - 1, g.h - 1];
  const b = src.bounds();
  if (!b) return g;
  for (let y = Math.max(y0, b.y0 + dy - r); y < Math.min(y1, b.y1 + dy + r + 1); y++) for (let x = Math.max(x0, b.x0 + dx - r); x < Math.min(x1, b.x1 + dx + r + 1); x++) {
    if (src.get(x - dx, y - dy)) continue;
    let near = Infinity;
    for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (src.get(x - dx + ox, y - dy + oy)) near = Math.min(near, Math.hypot(ox, oy));
    const ring = Math.round(near);
    if (ring >= 1 && ring <= r) g.data[y * g.w + x] = col(colours[Math.min(ring, colours.length) - 1]);
  }
  return g;
}
