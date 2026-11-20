// PORT (build item T3): engine/shafts.js depthFill, copied word for word but for one HAND CHANGE (below), so it draws PAINT
// REFS on an engine/gen/port-surface.js grid: the depth of tiles-pit's holes (engine/gen/tiles-t3.js tile.pit@1). The
// rim and the inner wall (dashedRim, shaftWall), the girder and the cables (trussIn, cableRun) only paint the colours they
// are given and are imported from engine/shafts.js itself. NOT temporary: it stays when engine/shafts.js goes and goes
// only with the last generator version that draws with it; never change what a released generator version draws through it.
// Pure: no randomness, no clock, no DOM; runs the same in the browser and in Node.
import { PortSurface } from '../../port-surface.js';
import { hash, fract } from '../../../motion.js';
import { DEPTH_KINDS } from '../../../shafts.js';

const T = 32;
const wrap = (v) => ((Math.floor(v) % T) + T) % T;
const DRIFT = { stars: [-1, 0], wisps: [1, 0], sparks: [0, -1] };
// how far apart two specks start, across and down (one of the two is enough), so they never touch while they drift
const APART = { stars: [7, 6], wisps: [17, 6], sparks: [6, 9] };
// how far a speck reaches from its own pixel: [left, right, up, down]
const BOX = { stars: [1, 1, 1, 1], wisps: [0, 11, 1, 1], sparks: [0, 1, 0, 1] };
const MOST = 12;

// Where the specks of a seed start: the same list whatever the count, so a slider adds specks and moves none.
// box: [x0, y0, x1, y1], the pixels a start may be on (both ends included).
const starts = new Map();
function startsOf(kind, seed, box) {
  const key = `${kind}/${seed}/${box}`;
  let out = starts.get(key);
  if (out) return out;
  out = [];
  const [x0, y0, x1, y1] = box, wide = x1 - x0 + 1, high = y1 - y0 + 1, round = wide === T && high === T;
  const [gx, gy] = APART[kind], gap = (a, b) => { const d = Math.abs(a - b); return round ? Math.min(d, T - d) : d; };
  for (let k = 0; wide > 0 && high > 0 && out.length < MOST && k < 600; k++) {
    const x = x0 + Math.floor(hash(k, seed * 64 + 11) * wide), y = y0 + Math.floor(hash(k, seed * 64 + 12) * high);
    if (out.every((o) => gap(o.x, x) >= gx || gap(o.y, y) >= gy)) out.push({ x, y });
  }
  starts.set(key, out);
  return out;
}

/**
 * Makes the fill of a hole's depth for one frame: a flat colour with a few specks far below that drift a short way and fade, each on its own timer, so the loop closes and the pattern repeats every 32 px; returns fill(x, y).
 * Arguments: base (the colour of the depth); t (the clip phase: t = 1 draws what t = 0 does); options { kind (one of DEPTH_KINDS: 'stars' are 2 px dots, half of them dim, and a few small crosses; 'wisps' flat banks 7 to 12 px long and three rows thick; 'sparks' 2 px embers that shrink; default 'stars'), count (how many, 0 to 12, default 4; a higher count adds specks to the ones already there), seed (another seed, another layout and other timers), tones ({ faint, bright, heart }: a speck is faint as it comes and goes and bright between; heart is the middle of a cross and a new spark, default: bright), reach (px a speck travels in its life, default 8), drift ([dx, dy]: the way it travels; default left for stars, right for wisps, up for sparks), margin (px every speck keeps from the tile's edges through its whole life. Default 0: specks pass from one tile into the next, so every tile must use the same seed; wisps then keep off the first and last rows, where a level streak would show as a step in a join. With 2 or more nothing ever touches the tile's edge, so tiles of different seeds join each other: give each piece of a block its own seed and a field of them shows no 32 px lattice. A list [left, top, right, bottom] gives each side its own: a piece with the inner wall along its top keeps its specks below it) }.
 * No speck is ever a single pixel. The pattern is drawn when this is called: call it once per frame, not once per pixel.
 */
export function depthFill(base, t = 0, { kind = 'stars', count = 4, seed = 0, tones = {}, reach = 8, drift = null, margin = 0 } = {}) {
  if (!DEPTH_KINDS.includes(kind)) throw new Error(`depthFill: "${kind}" is not a kind of speck (${DEPTH_KINDS.join(', ')})`);
  const { faint, bright = faint, heart = bright } = tones;
  const s = new PortSurface(T, T);   // HAND CHANGE: a paint-ref grid on the running port's table, read with paintAt below
  s.rect(0, 0, T, T, base);
  const put = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) s.dot(wrap(x + i), wrap(y + j), c); };
  const [dx, dy] = drift ?? DRIFT[kind], far = Math.max(0, Math.round(reach));
  const [ml, mt, mr, mb] = (Array.isArray(margin) ? margin : [margin, margin, margin, margin]).map((v) => Math.max(0, Math.round(v)));
  const [bl, br, bu, bd] = BOX[kind];
  const box = ml + mt + mr + mb > 0
    ? [ml + bl + Math.max(0, -dx * far), mt + bu + Math.max(0, -dy * far), T - 1 - mr - br - Math.max(0, dx * far), T - 1 - mb - bd - Math.max(0, dy * far)]
    : kind === 'wisps' ? [0, 2 + Math.max(0, -dy * far), T - 1, T - 3 - Math.max(0, dy * far)] : [0, 0, T - 1, T - 1];
  const all = startsOf(kind, seed | 0, box), n = Math.min(all.length, Math.max(0, Math.round(count)));
  for (let i = 0; i < n; i++) {
    const life = fract(fract(t) + hash(i, (seed | 0) * 64 + 1));
    if (life >= 0.875) continue;                                       // gone, until its timer comes round
    const full = life >= 0.125 && life < 0.625, step = Math.floor(far * life);
    const x = all[i].x + dx * step, y = all[i].y + dy * step, v = hash(i, (seed | 0) * 64 + 3);
    if (kind === 'stars') {
      if (v > 0.8) { put(x - 1, y, 3, 1, full ? bright : faint); put(x, y - 1, 1, 3, full ? bright : faint); if (full) put(x, y, 1, 1, heart); }
      else put(x, y, 2, 2, full && v > 0.45 ? bright : faint);          // the dim ones never brighten: they are further off
    } else if (kind === 'wisps') {
      // a bank three rows thick, its upper side lit; thinner as it comes and goes
      const len = 7 + Math.floor(v * 6);
      if (full) { put(x, y, len, 1, faint); put(x + 1, y + 1, len - 3, 1, faint); put(x + 2, y - 1, len - 4, 1, bright); }
      else { put(x + 1, y, len - 2, 1, faint); put(x + 2, y + 1, len - 5, 1, faint); }
    } else if (life < 0.125) put(x, y, 2, 2, heart);
    else if (full) put(x, y, 2, 2, bright);
    else put(x, y, 1, 2, faint);
  }
  return (x, y) => s.paintAt(wrap(x), wrap(y));
}

