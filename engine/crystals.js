// Standing crystals (added with batch R10: the Hearthvale save crystal): big cut stones that float or stand
// upright and turn slowly about their upright axis, for save points, shrines, power cores and boss weak spots.
// The small gems a player picks up are in pickups.js (drawGem); these are their big cousins, drawn as solids
// whose faces slide across as they turn, and the glow that hugs them. Pure functions: Node and browser.
// Worked example: sprites/save-crystal.json.
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


import { polyIn, ellipseIn } from './surface.js';
import { starPoints } from './shapes.js';

const TAU = Math.PI * 2;

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
