// Paving: patterns and tones for ground that people laid by hand (cobbled squares, brick lanes, courtyards), for
// the fills of a tileset. It goes with engine/tiles.js: drawCourses there lays stones in rows; here are the
// patterns rows cannot make, a way to pick out single stones, and the tone that keeps light paving apart from grass.
// Worked example: sprites/tiles-village.js.
//
//   import { patternFill, textureTone, drawCourses } from '../engine/tiles.js';
//   import { drawHerringbone, paintStone, pavingTone, stoneShade } from '../engine/paving.js';
//   const body = pavingTone(p.stone), joint = textureTone(body);
//   const fill = patternFill(body, (s) => {
//     const bricks = drawHerringbone(s, { size: 4, joint });                       // or: drawCourses(s, courses, { joint, round: true, shift })
//     bricks.filter((b) => b.inner).slice(0, 2).forEach((b) => paintStone(s, b, stoneShade(body, joint)));   // two darker bricks, clear of the tile's edges
//   });
//
// Everything here repeats every 32 px both ways and is the same every time: no Math.random(), and nothing kept
// between calls but a memo of answers already worked out (stoneShade).

import { TILE } from './tiles.js';
import { ramp, mix, brightness, col } from './color.js';
import { THEME_PRESETS, applyColour } from './theme.js';

const wrap = (v) => ((Math.floor(v) % TILE) + TILE) % TILE;

/**
 * Draws a herringbone of bricks twice as long as they are wide on a tile's pattern, with 1 px joints, repeating every 32 px both ways; returns the face of every brick.
 * Arguments: s (the 32x32 Surface patternFill hands to its drawing, already filled with the brick colour); options { size (the width of a brick with its joint, in px: 4 or 8, default 4; a brick is 2 x size long), joint (the joints' colour; left out: nothing is drawn and only the bricks are returned), lit (a colour for a short highlight at the top right of each brick's face), glint (px of that highlight, default 2) }.
 * Returns [{ x, y, w, h, lie, inner }]: the top-left pixel and size of each face (one that goes round the edge of the tile has x + w or y + h above 32); lie: 'h' for a brick lying across, 'v' for one standing up the tile; inner: it keeps 3 px off every edge of the tile, so a version of the fill may recolour or mark it.
 * Every brick is whole and the pattern has no seam at the tile's edges, so every version of a fill that marks only inner bricks shares its four edge lines with the others.
 */
export function drawHerringbone(s, { size = 4, joint = null, lit = null, glint = 2 } = {}) {
  const W = size === 8 ? 8 : 4, period = 4 * W;
  // The lattice: a staircase of one lying brick and one standing brick, moved (W, W) from step to step, and the whole
  // staircase repeated every 4 W px across. brickAt gives the top-left pixel and size (with joint) of the brick at (x, y).
  const brickAt = (x, y) => {
    const r = Math.floor(y / W), m = (((x - r * W) % period) + period) % period;
    if (m < 2 * W) return { x: x - m, y: r * W, w: 2 * W, h: W, lie: 'h' };
    if (m < 3 * W) return { x: x - (m - 2 * W), y: (r - 1) * W, w: W, h: 2 * W, lie: 'v' };
    return { x: x - (m - 3 * W), y: r * W, w: W, h: 2 * W, lie: 'v' };
  };
  const seen = new Map();
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const b = brickAt(x, y), last = x - b.x === b.w - 1 || y - b.y === b.h - 1;
    if (last) { if (joint) s.dot(x, y, joint); continue; }
    const key = `${wrap(b.x)},${wrap(b.y)}`;
    if (!seen.has(key)) seen.set(key, { x: wrap(b.x), y: wrap(b.y), w: b.w - 1, h: b.h - 1, lie: b.lie });
    if (lit && y === b.y && x >= b.x + b.w - 1 - Math.round(glint) && x < b.x + b.w - 1) s.dot(x, y, lit);
  }
  return [...seen.values()]
    .map((b) => ({ ...b, inner: b.x >= 3 && b.x + b.w <= TILE - 3 && b.y >= 3 && b.y + b.h <= TILE - 3 }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Paints the face of one stone of a paving pattern in another colour (a darker cobble, a mossy one, a hole where one is missing), going round the edges of the tile as the stone does; returns the Surface.
 * Arguments: s (the Surface the pattern is drawn on); stone ({ x, y, w, h }: a face as drawCourses or drawHerringbone returns it); paint (the colour, or a ramp { light, base, dark }: the top row then takes its light and the bottom row its dark); options { round (true leaves the four corner pixels alone, for stones drawn with rounded corners), inset (px to stay inside the face on every side, default 0) }.
 * Paint only stones marked `inner` in a version of a fill: a stone that crosses the tile's edge would show half painted beside another version.
 */
export function paintStone(s, stone, paint, { round = false, inset = 0 } = {}) {
  const tones = typeof paint === 'object' ? paint : { light: paint, base: paint, dark: paint };
  const k = Math.max(0, Math.round(inset)), w = stone.w - 2 * k, h = stone.h - 2 * k;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (round && w >= 3 && h >= 3 && (i === 0 || i === w - 1) && (j === 0 || j === h - 1)) continue;
    s.dot(wrap(stone.x + k + i), wrap(stone.y + k + j), j === 0 && h > 2 ? tones.light : j === h - 1 && h > 2 ? tones.dark : tones.base);
  }
  return s;
}

/**
 * The colour to lay light paving in, so it stands apart by value from the grass or earth it lies on under every whole-bundle look: the colour itself when it is light enough, else lifted towards its ramp's light and, past that, towards white.
 * Arguments: colour (the paving's colour control, '#rrggbb'); to (the brightness to reach, 0 to 1; default 0.81, which keeps a grey apart from a mid green and from sand lifted the same way). A colour already that light is returned unchanged.
 */
export function pavingTone(colour, to = 0.81) {
  const b = brightness(colour);
  if (b >= to) return colour;
  const light = ramp(colour).light, bl = brightness(light);
  if (bl >= to) return mix(colour, light, (to - b) / Math.max(0.001, bl - b));
  return mix(light, '#ffffff', Math.min(0.45, (to - bl) / Math.max(0.001, 1 - bl)));
}

const shadeCache = new Map();
/**
 * A tone between a paving's body colour and its joint colour that every whole-bundle look (engine/theme.js) keeps apart from the body: for a stone a shade darker than its neighbours, which a softer tone would lose under some look.
 * Arguments: body (the paving's colour, '#rrggbb'); joint (the colour of its joints, the darkest the shade may get); from (0 to 1: where the search starts between the two, default 0.4; it moves towards the joint colour in steps of 0.15 until a tone survives every look, and returns the joint colour when none does).
 */
export function stoneShade(body, joint, from = 0.4) {
  const key = `${body}/${joint}/${from}`;
  let tone = shadeCache.get(key);
  if (tone) return tone;
  const kept = (c) => col(c) !== col(body) && THEME_PRESETS.every((look) => { const to = applyColour(Uint32Array.from([col(body), col(c)]), look.theme.colour); return to[0] !== to[1]; });
  tone = joint;
  for (let k = Math.min(1, Math.max(0.1, from)); k < 1; k += 0.15) { const c = mix(body, joint, k); if (kept(c)) { tone = c; break; } }
  shadeCache.set(key, tone);
  return tone;
}

// ---- added with batch R08, fix round 1: spreadStones ----
// The marks of a fill version (a darker stone, a tuft of moss, a pit, a missing stone) must not bunch up: a bunch is a
// shape the eye finds again in every cell that shows the version. Give each mark the next stone of this order.
//
//   const order = spreadStones(stones.filter((st) => st.inner), { start: version });
//   paintStone(s, order[0], shade); stoneTuft(s, order[1], moss); ...                // the first few are never neighbours

/**
 * Puts the stones of a paving pattern in an order in which each one lies as far as it can from all those before it, so that marks given to the first few stones are spread over the tile and never side by side; returns the stones in that order.
 * Arguments: stones ([{ x, y, w, h }]: faces as drawCourses or drawHerringbone returns them; pass the ones marked `inner` for the marks of a fill version); options { start (which stone of the list comes first; default 0; another start gives another order, so two versions of a fill put their marks in different places; a number past the end goes round), wrap (true, the default: distances are measured round the edges of the 32 px tile, because the tile repeats and a mark by the left edge is beside one by the right edge of the next cell; false for a pattern that stands alone) }.
 * Distances are between the middles of the faces. The same arguments always give the same order; of two stones equally far, the one earlier in the list comes first.
 */
export function spreadStones(stones, { start = 0, wrap: round = true } = {}) {
  const list = [...(stones ?? [])], n = list.length;
  if (!n) return [];
  const mid = list.map((st) => [st.x + (st.w ?? 1) / 2, st.y + (st.h ?? 1) / 2]);
  const axis = (d) => { d = Math.abs(d); if (!round) return d; d %= TILE; return Math.min(d, TILE - d); };
  const first = ((Math.round(start) % n) + n) % n;
  const far = mid.map((m) => Math.hypot(axis(m[0] - mid[first][0]), axis(m[1] - mid[first][1])));   // from the nearest stone chosen so far
  const taken = new Array(n).fill(false), order = [list[first]];
  taken[first] = true;
  while (order.length < n) {
    let next = -1;
    for (let i = 0; i < n; i++) if (!taken[i] && (next < 0 || far[i] > far[next] + 1e-9)) next = i;
    taken[next] = true;
    order.push(list[next]);
    for (let i = 0; i < n; i++) far[i] = Math.min(far[i], Math.hypot(axis(mid[i][0] - mid[next][0]), axis(mid[i][1] - mid[next][1])));
  }
  return order;
}
