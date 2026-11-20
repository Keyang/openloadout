// PORT (build item T3): the parts of engine/tiles.js and engine/ooze.js that the four station and hive tilesets drew
// with and that make Surfaces of their own (patternFill, drawBlock's wall face, drawDecal, drawSoftWall), copied with
// `new Surface` turned into a paint-ref grid on the running port's paint table (engine/gen/port-surface.js) and colour
// reads turned into paint reads, so they draw PAINT REFS. What only paints the colours it is given is imported from
// engine/ itself (drawBlock's other pieces, drawSoftBlock, the clip lists, the vein and pore helpers, rimPlates ...),
// and engine/tiles.js textureTone and textureLight become the colour rules of the same names (engine/data-rules.js).
// These copies are the drawing code of the T3 port generators (engine/gen/tiles-t3.js), so they are NOT temporary: they
// stay when the engine originals go and go only with the last generator version that draws with them. A HAND CHANGE
// note says where a copy differs from its source; never change what a released generator version draws through it.
// Pure: no randomness, no clock, no DOM; runs the same in the browser and in Node.
import { PortSurface, fixed, INK_P } from '../../port-surface.js';
import { colourOf } from '../../pixels.js';
import { TILE, pieceOf, drawBlock, drawSoftBlock } from '../../../tiles.js';

const M = TILE - 1;
const wrap = (v) => ((Math.floor(v) % TILE) + TILE) % TILE;
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
const whole = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
/** A paint ref as a colour rule names it (a slot tone as its ramp rule, a written-out colour as its identity rule). */
const ruleRef = (ref) => colourOf(fixed(ref));

/** engine/tiles.js textureTone(of, against) as the `textureTone` colour rule. Arguments: of, against (default of). */
export function textureTone(of, against) {
  return against === undefined || against === of ? { rule: 'textureTone', of: ruleRef(of) } : { rule: 'textureTone', of: ruleRef(of), against: ruleRef(against) };
}
/** engine/tiles.js textureLight(of, against, from) as the `textureLight` colour rule. Arguments: of, against (default of), from (default 1). */
export function textureLight(of, against, from = 1) {
  const r = { rule: 'textureLight', of: ruleRef(of) };
  if (against !== undefined && against !== of) r.against = ruleRef(against);
  if (from !== 1) r.from = from;
  return r;
}
/** The `sunkTone` colour rule (engine/data-rules.js): of sunk below under by drop, never darker than floor. Arguments: of, under, drop, floor. */
export const sunkTone = (of, under, drop, floor) => ({ rule: 'sunkTone', of: ruleRef(of), under: ruleRef(under), drop, floor });
/** The `shadeApart` colour rule (engine/data-rules.js): engine/bulkhead.js shadeTo to max(floor, min(b(of) - self, b(under) - drop)). Arguments: of, under, drop, self, floor. */
export const shadeApart = (of, under, drop, self, floor) => ({ rule: 'shadeApart', of: ruleRef(of), under: ruleRef(under), drop, self, floor });

/** A new grid on the running port's paint table (what `new Surface(TILE, TILE)` was in the code). */
const grid = () => new PortSurface(TILE, TILE);

/** engine/tiles.js patternFill: a 32 x 32 fill drawn by `draw(s)` over base; returns fill(x, y), a paint ref. HAND CHANGE: a paint-ref grid, read with paintAt. Arguments: base, draw. */
export function patternFill(base, draw) {
  const s = grid();
  s.rect(0, 0, TILE, TILE, base);
  if (draw) draw(s);
  return (x, y) => s.paintAt(wrap(x), wrap(y));
}

/** engine/tiles.js drawDecal: draw(s) on a spare grid, outlined in ink, pasted on g. HAND CHANGE: the spare grid shares g's paint table; ink is the ink paint. Arguments: g, draw, { ink }. */
export function drawDecal(g, draw, { ink = INK_P } = {}) {
  const s = g.blank();
  draw(s);
  if (ink) s.outline(ink);
  g.blit(s);
  return g;
}

// ---- drawBlock's top-down wall face (engine/tiles.js drawFace) ----------------------------------------------------------

const NO_EDGE = { depth: 0 };
const edgeOf = (m, which) => m[which] ?? ((which === 'left' || which === 'right') ? m.side : null) ?? NO_EDGE;
const insetAt = (e, u, t) => { u = wrap(u); return e.inset ? Math.min(clampInt(e.inset(u, t), 0, 3), u, M - u) : 0; };
const SLIVER = 8;
const FACES = {
  bottom: {}, 'bottom-l': { W: 1 }, 'bottom-r': { E: 1 }, 'col-b': { W: 1, E: 1 },
  'strip-l': { W: 1, sliver: 1 }, 'strip-m': { sliver: 1 }, 'strip-r': { E: 1, sliver: 1 }, single: { W: 1, E: 1, sliver: 1 },
};
const SLIVER_SHAPE = { 'strip-l': 'left', 'strip-m': 'top', 'strip-r': 'right', single: 'col-t' };   // the piece drawShape draws for { N: 1, W, E }

/**
 * engine/tiles.js drawBlock with its top-down wall face drawn on paint refs. HAND CHANGE: drawFace's sliver of cap was
 * drawn on a Surface of its own by drawShape({ N: 1, W, E }); here it is the cap piece with the same open sides (left,
 * top, right, col-t) drawn by engine/tiles.js drawBlock without the face on a grid of this paint table, read with
 * paintAt. Every other piece is engine/tiles.js drawBlock itself. Arguments: g, piece, material, t.
 */
export function drawBlockP(g, piece, material, t = 0) {
  const name = pieceOf(piece)?.piece ?? piece;
  if (!material.face || !FACES[name]) return drawBlock(g, piece, material, t);
  const ends = FACES[name], f = material.face, ink = material.ink === undefined ? INK_P : material.ink;
  const eL = edgeOf(material, 'left'), eR = edgeOf(material, 'right');
  const baseRow = M - 2, y0 = ends.sliver ? SLIVER : 0;
  if (ends.sliver) {
    const cap = g.blank(TILE, TILE);
    drawBlock(cap, SLIVER_SHAPE[name], { ...material, face: undefined }, t);
    for (let y = 0; y < SLIVER; y++) for (let x = 0; x < TILE; x++) { const v = cap.paintAt(x, y); if (v) g.dot(x, y, v); }
  }
  for (let y = y0; y < TILE; y++) {
    const xa = ends.W ? insetAt(eL, y, t) : 0, xb = ends.E ? M - insetAt(eR, y, t) : M;
    for (let x = xa; x <= xb; x++) {
      if (y > baseRow) { if (f.shadow) g.dot(x, y, f.shadow); continue; }
      const end = (ends.W && x === xa) || (ends.E && x === xb);
      if (y === baseRow) g.dot(x, y, f.base ?? ink ?? INK_P);
      else if (end && ink) g.dot(x, y, ink);
      else g.dot(x, y, f.paint(x, y - y0, t));
    }
  }
  return g;
}

// ---- engine/ooze.js drawSoftWall ----------------------------------------------------------------------------------------

/** engine/ooze.js SOFT_WALL_SLIVER: the rows of cap over the face of a soft wall one tile deep. */
export const SOFT_WALL_SLIVER = 8;
const pulledIn = (e, u, t) => { u = wrap(u); return e && e.inset ? Math.min(whole(e.inset(u, t), 0, 8), u, M - u) : 0; };
const WALL_FACES = {
  bottom: {}, 'bottom-l': { W: 1 }, 'bottom-r': { E: 1 }, 'col-b': { W: 1, E: 1 },
  'strip-l': { W: 1, cap: 'left' }, 'strip-m': { cap: 'top' }, 'strip-r': { E: 1, cap: 'right' }, single: { W: 1, E: 1, cap: 'col-t' },
};

/** engine/ooze.js drawSoftWall on paint refs. HAND CHANGE: the cap over a low face is drawn on a grid of g's paint table and read with paintAt (get: painted or not). Arguments: g, piece, material, t. */
export function drawSoftWall(g, piece, material, t = 0) {
  const name = pieceOf(piece)?.piece ?? piece;
  const face = material.face;
  if (!face) return drawSoftBlock(g, name, material, t);
  const mat = { ...material, round: Math.min(SOFT_WALL_SLIVER, Math.max(0, Number(material.round) || 0)) };
  const ink = material.ink === undefined ? INK_P : material.ink, line = face.base ?? ink ?? INK_P;
  const eL = material.left ?? material.side, eR = material.right ?? material.side;
  const R = whole(face.round ?? 0, 0, 8);
  const corner = (d) => (d < R ? Math.max(0, Math.round(R - Math.sqrt(Math.max(0, R * R - (R - d - 0.5) ** 2)))) : 0);
  const lift = (x) => whole(face.foot ? face.foot(wrap(x), t) : 0, 0, 6);
  const F = WALL_FACES[name];
  if (!F) {
    if (name !== 'inner-bl' && name !== 'inner-br') return drawSoftBlock(g, name, mat, t);
    const behind = (x, y) => {
      const foot = M - 2 - lift(x);
      return y < foot ? face.paint(x, y, t, foot - y) ?? material.fill(x, y, t, 0) : y === foot ? line : y <= foot + 2 ? face.shadow ?? null : null;
    };
    return drawSoftBlock(g, name === 'inner-bl' ? 'side-l' : 'side-r', { ...mat, outside: behind }, t);
  }
  const y0 = F.cap ? SOFT_WALL_SLIVER : 0;
  let cap = null;
  if (F.cap) {
    cap = g.blank(TILE, TILE);
    drawSoftBlock(cap, F.cap, mat, t);
    for (let y = 0; y < y0; y++) for (let x = 0; x < TILE; x++) { const v = cap.paintAt(x, y); if (v) g.dot(x, y, v); }
  }
  const footRow = (x) => M - 2 - lift(x) - (F.W ? corner(x) : 0) - (F.E ? corner(M - x) : 0);
  const solid = (x, y) => {
    if ((F.W && x < 0) || (F.E && x > M)) return false;
    if (y < y0) return !cap || x < 0 || x > M || cap.get(x, Math.max(0, y)) !== 0;
    if (F.W && x < pulledIn(eL, y, t)) return false;
    if (F.E && x > M - pulledIn(eR, y, t)) return false;
    return y <= footRow(x);
  };
  for (let x = 0; x < TILE; x++) {
    const foot = footRow(x);
    for (let y = y0; y <= foot; y++) {
      if (!solid(x, y)) continue;
      if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y + 1) || !solid(x, y - 1)) { g.dot(x, y, line); continue; }
      g.dot(x, y, face.paint(x, y - y0, t, foot - y) ?? material.fill(x, y, t, 0));
    }
    if (face.shadow && solid(x, foot)) for (let y = foot + 1; y <= Math.min(M, foot + 2); y++) g.dot(x, y, face.shadow);
  }
  return g;
}
