// Gilded band carvings (added with batch K14, bundles/specs/core-sprites-2.md): the two style marks of the `gilded`
// skin that run along the band rather than sit in a corner, drawn on a piece engine/ui-skins.js (and
// engine/ui-gilded.js's corner plates) have already drawn:
//   gildedKey     temple: a key pattern of 1 px steps carved in ink along the band, across the ink line between the
//                 band and the stone, repeating every 4 px from the slice line (so a tiled nine-slice repeats it)
//   gildedCracks  ruin: short cracks in ink starting in the gold band and running into the stone border (drawn
//                 here rather than with engine/rock.js crack(), whose free zigzag leaves 2 or 3 loose pixels in a
//                 border only 2 to 4 px of stone wide)
//
//   const out = skinButton(g, 1, 1, 94, 30, clip, 'gilded', look);
//   gildedCorners(g, out.body, style, { ... });
//   if (style === 'temple') gildedKey(g, out.body, { keep, skip: [out.text] });
//   if (style === 'ruin') gildedCracks(g, out.body, [{ side: 'top', at: 0.3, dir: 1 }, { side: 'bottom', at: 0.7, dir: -1 }], { skip: [out.text] });
//
// Both find the band by reading the piece: from a side's outline inwards, the gold rows end at the inner ink line.
// They only ever change pixels inside the piece's outline, never the outline itself, never inside `skip`, and use
// only colours the piece already has (its ink and its band), so they add no colour to a clip. A disabled piece
// (drawn without colour) stays without colour.

import { col } from './color.js';

const SIDES = Object.freeze(['top', 'bottom', 'left', 'right']);
/** The sides of a piece the carvings know: top, bottom, left, right. No arguments: a frozen list. */
export const CARVE_SIDES = SIDES;

// one side as a walk: start pixel of the outer edge at `along`, the step inwards (n) and the step along it (t)
function frameOf(body, side) {
  // the walk starts 4 px outside the box, so a lip or shadow drawn past the box is read as part of the side
  const { x, y, w, h } = body, o = 4;
  if (side === 'top') return { at: (a) => [a, y - o], n: [0, 1], t: [1, 0], lo: x, hi: x + w - 1, mid: x + (w >> 1) };
  if (side === 'bottom') return { at: (a) => [a, y + h - 1 + o], n: [0, -1], t: [1, 0], lo: x, hi: x + w - 1, mid: x + (w >> 1) };
  if (side === 'left') return { at: (a) => [x - o, a], n: [1, 0], t: [0, 1], lo: y, hi: y + h - 1, mid: y + (h >> 1) };
  if (side === 'right') return { at: (a) => [x + w - 1 + o, a], n: [-1, 0], t: [0, 1], lo: y, hi: y + h - 1, mid: y + (h >> 1) };
  throw new Error(`gilded carve: side "${side}" is not one of ${SIDES.join(', ')}`);
}

// Reads the band across one side at `along`: the outline's depth, the inner ink line's depth and its colour.
// Returns null when there is no gold band with an ink line inside it there.
function bandAt(g, f, along) {
  const [sx, sy] = f.at(along);
  const get = (d) => g.get(sx + f.n[0] * d, sy + f.n[1] * d);
  let d = 0;
  while (d < 12 && !get(d)) d++;
  const ink = get(d);
  if (!ink || d >= 12) return null;
  let e = d + 1;
  while (e < d + 6 && get(e) && get(e) !== ink) e++;
  if (e === d + 1 || get(e) !== ink || !get(e + 1) || get(e + 1) === ink) return null;
  return { outline: d, line: e, ink, band: get(e - 1), inner: get(e + 1) };
}

const inRect = (r, px, py) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;

// The key: rows outer (the band's inner row), line (the ink line), inner (the first row inside it), by column mod 4.
// 'o' ink, 'b' band gold, '.' left as it is. A 1 px line climbing and falling a row every 2 px.
const KEY = ['ooo.', 'obob', 'o.oo'];

/**
 * Carves the temple key along the gold band of a gilded piece: a 1 px ink line stepping between the band and the row inside the ink line, repeating every 4 px.
 * Arguments: g; body ({ x, y, w, h }: the piece's box, as the helper returns it); opt { sides (default ['top', 'bottom']), phase (the coordinate the 4 px repeat starts from on every side, default the keep's x or y, else body x or y + 7), keep ({ x, y, w, h }: the stretched middle, for the phase), skip (rectangles never drawn on) }.
 * Only columns where the band reads as it does at the side's middle are carved, so corner plates, cut corners and gems are left alone. Returns the number of pixels changed.
 */
export function gildedKey(g, body, opt = {}) {
  const sides = opt.sides ?? ['top', 'bottom'], skip = opt.skip ?? [];
  let changed = 0;
  for (const side of sides) {
    const f = frameOf(body, side), across = side === 'top' || side === 'bottom';
    const ref = bandAt(g, f, f.mid);
    if (!ref) continue;
    const phase = opt.phase ?? (opt.keep ? (across ? opt.keep.x : opt.keep.y) : (across ? body.x : body.y) + 7);
    const plan = [];
    for (let a = f.lo; a <= f.hi; a++) {
      const b = bandAt(g, f, a);
      if (!b || b.outline !== ref.outline || b.line !== ref.line || b.band !== ref.band || b.inner !== ref.inner || b.ink !== ref.ink) continue;
      const [sx, sy] = f.at(a), m = ((a - phase) % 4 + 4) % 4;
      KEY.forEach((row, r) => {
        const ch = row[m], d = ref.line - 1 + r;
        if (ch === '.') return;
        const px = sx + f.n[0] * d, py = sy + f.n[1] * d;
        if (skip.some((q) => inRect(q, px, py))) return;
        const c = ch === 'o' ? ref.ink : ref.band;
        if (g.get(px, py) !== c) plan.push([px, py, c]);
      });
    }
    for (const [px, py, c] of plan) { g.data[py * g.w + px] = c; changed++; }
  }
  return changed;
}

/**
 * Draws ruin cracks: each starts in the gold band of one side and runs, jagged, through the ink line into the stone border, then along it, in the piece's own ink, one connected pixel line.
 * Arguments: g; body ({ x, y, w, h }); cracks (a list of { side, at (0..1 along the side), dir (+1 or -1: which way along the side it runs), length (px, default 7), jog (0..2: how often it drops straight in rather than slanting, default 1), slope (0..3: how many steps run along the side between two steps in, default 0; 1 or 2 cross a narrow band at a low angle), fork (px: a second, short split from the same start the other way, default none), path (instead: a list of depths from the inner ink line, one per step along the side, each within 1 of the last: -1 the band's inner row, -2 the next row out, 0 the ink line, 1 the first row of stone; rows outside the band or in `skip` are left out, so one path fits every band width) }); opt { skip (rectangles never drawn on: text areas), shade (a colour the piece already has, such as its dark gold: with `path`, the gold just inside each crack pixel takes it) }.
 * It steps inwards and along at once while it can, then along the stone when the next row in is `skip` or the edge. Returns the number of pixels each crack changed, in order.
 */
export function gildedCracks(g, body, cracks, opt = {}) {
  const skip = opt.skip ?? [];
  const drawn = (px, py) => px >= 0 && py >= 0 && px < g.w && py < g.h && !!g.get(px, py);
  // inside the piece: a pixel and its four neighbours all drawn (so the outline itself is never touched), not skipped
  const ok = (px, py) => !skip.some((q) => inRect(q, px, py)) && drawn(px, py) && drawn(px - 1, py) && drawn(px + 1, py) && drawn(px, py - 1) && drawn(px, py + 1);
  return cracks.map((c) => {
    const f = frameOf(body, c.side);
    const along = Math.round(f.lo + (f.hi - f.lo) * Math.max(0, Math.min(1, c.at)));
    const b = bandAt(g, f, along);
    if (!b) return 0;
    const [sx, sy] = f.at(along), [nx, ny] = f.n;
    const x0 = sx + nx * (b.outline + 1), y0 = sy + ny * (b.outline + 1);
    let n = 0;
    const run = (dir, length, slope, jog) => {
      const tx = f.t[0] * dir, ty = f.t[1] * dir;
      let px = x0, py = y0;
      for (let i = 0; i < length; i++) {
        if (!ok(px, py)) break;
        if (g.get(px, py) !== b.ink) { g.data[py * g.w + px] = b.ink; n++; }
        // every third step (jog 1) it drops straight in; otherwise it slants in, or runs along `slope` steps first;
        // along the stone once it can go no deeper
        const straight = jog > 0 && i % (4 - Math.min(2, jog)) === 1, flat = slope > 0 && i % (slope + 1) !== slope;
        const moves = flat ? [[tx, ty], [nx + tx, ny + ty]]
          : straight ? [[nx, ny], [nx + tx, ny + ty], [tx, ty]] : [[nx + tx, ny + ty], [nx, ny], [tx, ty]];
        const m = moves.find(([dx, dy]) => ok(px + dx, py + dy));
        if (!m) break;
        px += m[0]; py += m[1];
      }
    };
    const dir = c.dir < 0 ? -1 : 1;
    if (c.path) {
      // a crack drawn to a given shape: one step along the side per entry, at that depth from the ink line
      let last = null;
      c.path.forEach((d, i) => {
        if (last !== null && Math.abs(d - last) > 1) throw new Error('gildedCracks: a path may change depth by 1 px a step at most');
        last = d;
        const k = b.line - b.outline - 1 + d;            // from the band's outer row
        const px = x0 + f.t[0] * dir * i + nx * k, py = y0 + f.t[1] * dir * i + ny * k;
        if (ok(px, py) && g.get(px, py) !== b.ink) { g.data[py * g.w + px] = b.ink; n++; }
      });
      // the shade: the gold just inside each crack pixel of the band darkens, so the split reads as a groove
      if (opt.shade != null) c.path.forEach((d, i) => {
        const k = b.line - b.outline - 1 + d + 1;
        const px = x0 + f.t[0] * dir * i + nx * k, py = y0 + f.t[1] * dir * i + ny * k;
        const here = g.get(px, py);
        if (d + 1 < 0 && ok(px, py) && here !== b.ink) { g.data[py * g.w + px] = col(opt.shade); n++; }
      });
    } else run(dir, c.length ?? 7, c.slope ?? 0, c.jog ?? 1);
    // the fork: a short split from the same start, the other way along the band, low in the gold
    if (c.fork) run(-dir, c.fork, 1, 0);
    return n;
  });
}
