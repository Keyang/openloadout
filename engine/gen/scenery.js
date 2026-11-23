// Scenery generators for backgrounds (docs/data-sprites.md 2.4, 3.3 "backdrop"; migration batch M10): the things the
// library's five code backdrops drew with engine/scenery.js and by hand, as named generators that RETURN PRIMITIVES, so
// sprites/bg-forest, bg-castle, bg-battle-field, bg-battle-dungeon and bg-starfield could become data files.
//
//   tidy            draws a few shapes and backdrop calls together and takes off the single pixels they leave
//                   (engine/backdrop.js tidy, which every code backdrop ran on its layers)
//   tall.trees      tall trees rising from the bottom edge, leaning, some with side crowns (sprites/bg-forest.js near)
//   round.trees     a line of round trees standing on a ground (engine/scenery.js roundTree, as bg-battle-field placed them)
//   towers          small far towers standing on a ground, pointed or crenellated, some with a lit window (bg-castle far)
//   far.house       a cottage made small by distance (engine/scenery.js farHouse)
//   rail.fence      a post-and-rail fence following a ground (engine/scenery.js railFence)
//   ground.marks    scuffs and pebbles over a band of ground, rows kept clear for feet (engine/scenery.js groundMarks)
//   castle.wall     a long castle wall: battlements, blind arches, turrets and bastions, windows (bg-castle mid)
//   battlements     a wall filled below a crenellated top (engine/backdrop.js battlements + fillBelow)
//   arcade          a row of round-headed openings: the space below the arches, or the stone above them (scenery.js arcade)
//   pillars         a row of stone pillars evenly across the layer, in up to three kinds by turns (scenery.js pillar)
//   banners         a row of hanging swallow-tailed banners (bg-castle near)
//   castle.columns  a row of plain columns on a two-step foot (bg-castle near)
//   wall.torches    a row of wall torches with flickering flames and the patches of wall they light, iron rings where
//                   none burns (scenery.js wallTorch, lightPatch, wallRing)
//   paved.course    one course of a paved floor seen from the side (scenery.js pavedFloor, one course a call)
//   edge.band       a band under an outline and itself moved aside and down: the lit tops of hills (M10b)
//   tufts           a tufted edge of grass on a row (engine/scenery.js tufts; M10b)
//   stand.apart     a colour rule: a backdrop's main tone as engine/scenery.js standApart works it out (M10b)
//
// Every one works in frame pixels across the layer's width (ctx.size[0]) and wraps: a thing over an edge comes back on
// the other side, as engine/backdrop.js wrapped() did; the layers layout tells each one whether its layer wraps (the
// registry entry's `wraps: true`). They are frame generators (engine/gen/scenery-frame.js): named in a layers body, not
// on a node. A call that takes a `ground` stands on an earlier ridge or swell of the layer by `on` (engine/gen/backdrop.js).
// Every shape is flat (shade 0) and has no outline: a background is drawn in flat tones.
//
// Pure: no DOM, no Node, no clock, no randomness (seeds through engine/motion.js hash). Runs unchanged in the browser and
// in Node.
import { defineGenerator } from './registry.js';
import { px, share, count, seed, word, flag, paint, paints, point, struct, primitives } from './args.js';
import { hash, clamp, lerp, wave, TAU } from '../motion.js';
import { columnPolys, groundOutline, spots, COLOUR_WORK } from './backdrop.js';
import { brightness } from '../color.js';
import { capsuleIn } from '../surface.js';

const FLAT = { shade: 0 };
const mod = (x, W) => ((x % W) + W) % W;
const r3 = (v) => Math.round(v * 1000) / 1000;
const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/** The columns a thing at x reaching `reach` px either way is drawn at: x, and once more W px to the side when it crosses the join (the right edge first; never both, so at most two copies). */
function copiesAt(x, reach, W, wrap) {
  if (!wrap) return [x];
  if (x + reach > W) return [x, x - W];
  if (x - reach < 0) return [x, x + W];
  return [x];
}

/** An upper bound on the stair polygons engine/gen/backdrop.js columnPolys gives for 640 columns (as backdrop.js FILL_COST). */
const FILL_COST = Math.ceil(640 / 15) + 3;

/** Whole columns between two outlines (x -> row) across a frame [W, H], rounded at each column's centre, as flat stair polygons. */
function fillBetween(top, bottom, paintRef, W, H) {
  const y0 = new Array(W), y1 = new Array(W);
  for (let x = 0; x < W; x++) {
    const t = top(x + 0.5), b = bottom(x + 0.5);
    y0[x] = fin(t) ? Math.max(0, Math.round(t)) : H;
    y1[x] = fin(b) ? Math.min(H, Math.round(b)) : 0;
  }
  return columnPolys(y0, y1, paintRef);
}

// ---- tidy: a generator's own shapes drawn on a grid, single pixels found, fixed with one-pixel patches -------------------

/**
 * What tidy@1 may spend (docs/data-sprites.md 3.4 rule 2: nothing a definition says can hang the page): at most `work`
 * pixel steps for each primitive of its cost, counted before it starts (each shape's box inside the frame, an arc twice,
 * a polygon's rows once more for each of its points; then the box round everything it drew, five times: the grid, its
 * three passes, the patches or polygons it gives back). Past that the drawing comes back as it came, untidied. A frame costs at most 4,000, so all its tidy
 * calls together take at most 10 million steps, about what engine/draw-list.js may spend drawing one 640 x 360 frame.
 */
export const TIDY_LIMITS = Object.freeze({ work: 2500 });

/** Written shapes tidy@1 refuses: in a data file a limb and a capsule are drawn along a bone (their from and to are shares of it), so in a layer they lose their ends. */
const TIDY_REFUSED = new Set(['limb', 'capsule']);

/**
 * The pixels one flat primitive covers as engine/draw-list.js draws it (rect, ellipse, poly, dot, arc, ring, a line of
 * thick 1 or less as its stepped 1 px line, and limb, capsule and thicker line as generators give them, in frame pixels), as { box, work, fill(set) } where fill calls set(x0, x1, y)
 * for each run of covered pixel centres of a row (x1 not included), or null for a shape it does not lay out the same
 * (a turned or mirrored one, any other kind).
 */
function shapeOf(p, W, H) {
  if (p.mirror === true || (fin(p.turn) && p.turn !== 0) || (fin(p.turnRad) && p.turnRad !== 0)) return null;
  const pair = (v) => (Array.isArray(v) && v.length === 2 && fin(v[0]) && fin(v[1]) ? v : null);
  if (p.kind === 'rect') {
    const at = pair(p.at), sz = pair(p.size);
    if (!at || !sz) return null;
    const [x, y] = at, [w, h] = sz;
    return { box: [x, y, x + w, y + h], fill: (set, X0, Y0, X1, Y1) => {
      const ax = Math.max(X0, Math.ceil(x - 0.5)), bx = Math.min(X1 + 1, Math.ceil(x + w - 0.5));
      for (let j = Math.max(Y0, Math.ceil(y - 0.5)); j <= Y1 && j + 0.5 < y + h; j++) if (bx > ax) set(ax, bx, j);
    } };
  }
  if (p.kind === 'dot') {      // as engine/draw-list.js places a dot: size 1 at the pixel it is in, size 2 on the pixels round it
    const at = pair(p.at);
    if (!at) return null;
    const n = fin(p.size) && p.size >= 2 ? 2 : 1, x = n === 1 ? Math.floor(at[0]) : Math.round(at[0]) - 1, y = n === 1 ? Math.floor(at[1]) : Math.round(at[1]) - 1;
    return { box: [x, y, x + n, y + n], fill: (set, X0, Y0, X1, Y1) => { for (let j = Math.max(Y0, y); j < y + n && j <= Y1; j++) if (Math.min(X1 + 1, x + n) > Math.max(X0, x)) set(Math.max(X0, x), Math.min(X1 + 1, x + n), j); } };
  }
  if (p.kind === 'poly') {
    if (!Array.isArray(p.points) || p.points.length < 3 || !p.points.every(pair)) return null;
    const pts = p.points, n = pts.length, xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    // a row at a time: the pixel centres between each pair of crossings (the same pixels as surface.js polyIn's test)
    return { box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], rows: n, fill: (set, X0, Y0, X1, Y1) => {
      // the edges a row can cross (not flat), lowest first; a row crosses those with lo <= py < hi (the same as
      // (yi > py) !== (yk > py)), each at the same arithmetic, so the pixels are the same, in a time that grows with the
      // edges a row meets, not with all of them (a stair polygon has up to 64 points)
      const edges = [];
      for (let i = 0, k = n - 1; i < n; k = i++) {
        const [xi, yi] = pts[i], [xk, yk] = pts[k];
        if (yi !== yk) edges.push([Math.min(yi, yk), Math.max(yi, yk), xi, yi, xk, yk]);
      }
      edges.sort((u, v) => u[0] - v[0]);
      const cross = [], live = [];
      let next = 0;
      for (let j = Y0; j <= Y1; j++) {
        const py = j + 0.5;
        cross.length = 0;
        while (next < edges.length && edges[next][0] <= py) live.push(edges[next++]);
        for (let m = live.length - 1; m >= 0; m--) {
          const e = live[m];
          if (e[1] <= py) { live.splice(m, 1); continue; }
          const [, , xi, yi, xk, yk] = e;
          cross.push(((xk - xi) * (py - yi)) / (yk - yi) + xi);
        }
        cross.sort((u, v) => u - v);
        for (let m = 0; m + 1 < cross.length; m += 2) {
          const ax = Math.max(X0, Math.ceil(cross[m] - 0.5)), bx = Math.min(X1 + 1, Math.ceil(cross[m + 1] - 0.5));
          if (bx > ax) set(ax, bx, j);
        }
      }
    } };
  }
  // the round shapes: a convex test is a run per row, found from each end by the exact test (the renderer's arithmetic)
  const convex = (box, inside, span) => ({ box, fill: (set, X0, Y0, X1, Y1) => {
    for (let j = Y0; j <= Y1; j++) {
      const py = j + 0.5, s = span ? span(py) : [X0, X1];
      if (!s) continue;
      let a = Math.max(X0, s[0]), b = Math.min(X1, s[1]);
      while (a <= b && !inside(a + 0.5, py)) a++;
      while (b >= a && !inside(b + 0.5, py)) b--;
      if (b >= a) set(a, b + 1, j);
    }
  } });
  if (p.kind === 'ellipse') {
    const at = pair(p.at), r = Array.isArray(p.r) ? pair(p.r) : fin(p.r) ? [p.r, p.r] : null;
    if (!at || !r || !(r[0] > 0 && r[1] > 0)) return null;
    const [cx, cy] = at, [rx, ry] = r;
    const inside = (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
    const span = (py) => { const q = 1 - ((py - cy) / ry) ** 2; if (q < -1e-9) return null; const w = rx * Math.sqrt(Math.max(0, q)); return [Math.floor(cx - w - 0.5) - 1, Math.ceil(cx + w - 0.5) + 1]; };
    return convex([cx - rx, cy - ry, cx + rx, cy + ry], inside, span);
  }
  if (p.kind === 'line' && !(fin(p.thick) && p.thick > 1)) {      // as engine/draw-list.js: a stepped 1 px line, not a capsule
    const a0 = pair(p.from), b0 = pair(p.to);
    const e = a0 && b0 ? thinLineEnds(a0, b0, W, H) : null;
    if (!e) return a0 && b0 && e === null ? { box: [0, 0, -1, -1], fill: () => {} } : null;      // off the frame: nothing drawn
    const px = thinLinePixels(e), rows = new Map();
    for (let k = 0; k < px.length; k += 2) { const y = px[k + 1]; if (!rows.has(y)) rows.set(y, []); rows.get(y).push(px[k]); }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < px.length; k += 2) { x0 = Math.min(x0, px[k]); x1 = Math.max(x1, px[k]); y0 = Math.min(y0, px[k + 1]); y1 = Math.max(y1, px[k + 1]); }
    return { box: px.length ? [x0, y0, x1, y1] : [0, 0, -1, -1], fill: (set, X0, Y0, X1, Y1) => {
      for (const [y, xs] of rows) if (y >= Y0 && y <= Y1) for (const x of xs) if (x >= X0 && x <= X1) set(x, x + 1, y);
    } };
  }
  if (p.kind === 'limb' || p.kind === 'line' || p.kind === 'capsule') {
    const a0 = pair(p.from), b0 = pair(p.to);
    if (!a0 || !b0) return null;
    let a = a0, b = b0, r0, r1;
    if (p.kind === 'capsule') {
      const rr = Array.isArray(p.r) ? pair(p.r) : fin(p.r) ? [p.r, p.r] : null;
      if (!rr) return null;
      [r0, r1] = rr;
    } else {      // as engine/draw-list.js: a whole width, the ends snapped so the line never shimmers
      const w = Math.max(1, Math.round(fin(p.kind === 'limb' ? p.width : p.thick) ? (p.kind === 'limb' ? p.width : p.thick) : 1));
      const snap = w % 2 ? (v) => Math.floor(v) + 0.5 : (v) => Math.round(v);
      a = [snap(a0[0]), snap(a0[1])]; b = [snap(b0[0]), snap(b0[1])]; r0 = r1 = w / 2;
    }
    const R = Math.max(r0, r1);
    return convex([Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R], capsuleIn(a[0], a[1], b[0], b[1], r0, r1), null);
  }
  if (p.kind === 'arc' || p.kind === 'ring') {      // as engine/surface.js arc: angles in degrees, 0 down, 90 picture-right
    const at = pair(p.at);
    if (!at || !fin(p.r) || p.r < 0) return null;
    if (p.kind === 'arc' && (!fin(p.a0) || !fin(p.a1))) return null;
    const [cx, cy] = at, r = p.r, th = fin(p.thick) && p.thick > 0 ? p.thick : 1, rad = Math.PI / 180;
    const a0 = p.kind === 'arc' ? p.a0 * rad : 0, a1 = p.kind === 'arc' ? p.a1 * rad : TAU, lo = Math.min(a0, a1), span = Math.abs(a1 - a0);
    const inside = (px, py) => {
      const dx = px - cx, dy = py - cy;
      if (Math.abs(Math.hypot(dx, dy) - r) > th / 2) return false;
      let t = Math.atan2(dx, dy) - lo;
      t = ((t % TAU) + TAU) % TAU;
      return t <= span;
    };
    const out = r + th / 2, inn = r - th / 2;
    return { box: [cx - r - th, cy - r - th, cx + r + th, cy + r + th], arc: true, fill: (set, X0, Y0, X1, Y1) => {
      for (let j = Y0; j <= Y1; j++) {
        const py = j + 0.5, dy = py - cy, q = out * out - dy * dy;
        if (q < 0) continue;
        const w = Math.sqrt(Math.max(0, q)), hole = inn > 0 && inn * inn - dy * dy > 0 ? Math.sqrt(inn * inn - dy * dy) : -1;
        // the ring's row is up to two runs: left of the hole and right of it, each tested pixel by pixel at its own centre
        const runs = hole < 0 ? [[cx - w, cx + w]] : [[cx - w, cx - hole], [cx + hole, cx + w]];
        for (const [l, rr] of runs) {
          let x = Math.max(X0, Math.floor(l - 0.5) - 1), start = -1;
          const end = Math.min(X1, Math.ceil(rr - 0.5) + 1);
          for (; x <= end; x++) {
            if (inside(x + 0.5, py)) { if (start < 0) start = x; }
            else if (start >= 0) { set(start, x, j); start = -1; }
          }
          if (start >= 0) set(start, end + 1, j);
        }
      }
    } };
  }
  return null;
}

/**
 * The ends of a 1 px line as engine/draw-list.js lineEnds takes them for a W x H frame: the floored ends when both lie
 * within 1,024 px of the frame, else the line first clipped to the frame plus 2 px (Liang-Barsky); null when it misses,
 * undefined when an end lies further than the renderer places (it refuses the line, so tidy leaves it as it came).
 */
function thinLineEnds(a, b, W, H) {
  const off = (v, n) => Math.max(-v, v - n);
  if (Math.max(off(a[0], W), off(b[0], W), off(a[1], H), off(b[1], H)) > 1e9) return undefined;
  let p = a, q = b;
  const near = (v) => v[0] >= -1024 && v[1] >= -1024 && v[0] <= W + 1024 && v[1] <= H + 1024;
  if (!near(a) || !near(b)) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    let t0 = 0, t1 = 1;
    for (const [pk, qk] of [[-dx, a[0] + 2], [dx, W + 2 - a[0]], [-dy, a[1] + 2], [dy, H + 2 - a[1]]]) {
      if (pk === 0) { if (qk < 0) return null; continue; }
      const r = qk / pk;
      if (pk < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    p = [a[0] + t0 * dx, a[1] + t0 * dy]; q = [a[0] + t1 * dx, a[1] + t1 * dy];
  }
  return [Math.floor(p[0]), Math.floor(p[1]), Math.floor(q[0]), Math.floor(q[1])];
}

/** The pixels [x, y, x, y, ...] of a 1 px Bresenham line between whole ends, as engine/draw-list.js linePixels steps it. */
function thinLinePixels([x0, y0, x1, y1]) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const px = [], steps = dx - dy + 1;
  for (let n = 0; n < steps; n++) {
    px.push(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return px;
}

/** Pixels of the box [x0, y0, x1, y1] (floor to ceil, as engine/draw-list.js counts it) inside a W x H frame: { n, x0, y0, x1, y1 }. */
function boxWork(b, W, H) {
  const x0 = Math.max(0, Math.floor(b[0])), x1 = Math.min(W - 1, Math.ceil(b[2])), y0 = Math.max(0, Math.floor(b[1])), y1 = Math.min(H - 1, Math.ceil(b[3]));
  return x1 < x0 || y1 < y0 ? { n: 0 } : { n: (x1 - x0 + 1) * (y1 - y0 + 1), x0, y0, x1, y1 };
}

/**
 * A list of flat primitives (rect, ellipse, poly, dot, arc, ring, limb, capsule, line), drawn in order, with every
 * single pixel taken off as engine/backdrop.js tidy() took them off a code backdrop's layer: laid on a grid of the frame
 * (pixel centres, as engine/draw-list.js fills), each pixel that has no neighbour of its own colour above, below, left
 * or right (the left and right edges wrapping) given the colour under it or beside it (up to three passes; see-through
 * counts as a colour). Given back as the primitives themselves, flat (shade 0, no group or z of their own), followed by
 * one-pixel-high patches: a rect for each run of changed pixels of a row, painted with the colour it became; when a
 * pixel it drew becomes see-through (a patch could not take it away without what other calls drew under it), as its
 * grid in flat stair polygons instead, see-through pixels not drawn. Only the box round what was drawn is laid out and passed over (a pixel outside it is
 * see-through and always has a see-through neighbour, so it never changes). When a shape is one it cannot lay out the
 * same, the work (counted as TIDY_LIMITS says) would pass `work`, or the primitives and patches together would pass
 * `room`, the list is given back as it came. Pure. Returns { prims, tidied, patches, work }.
 */
export function tidyPlan(prims, W, H, room, workCap) {
  const shapes = [];
  let work = 0, ux0 = W, uy0 = H, ux1 = -1, uy1 = -1;
  const as = (tidied, list, patches = 0) => ({ prims: list, tidied, patches, work });
  for (const p of prims) {
    if (p.hidden === true) continue;
    const sh = shapeOf(p, W, H);
    if (!sh) return as(false, prims);
    const b = boxWork(sh.box, W, H);
    work += b.n * (sh.arc ? 2 : 1) + (sh.rows && b.n ? (b.y1 - b.y0 + 1) * sh.rows : 0);
    if (b.n) { ux0 = Math.min(ux0, b.x0); uy0 = Math.min(uy0, b.y0); ux1 = Math.max(ux1, b.x1); uy1 = Math.max(uy1, b.y1); }
    shapes.push([p, sh, b]);
  }
  if (ux1 < 0) return as(false, prims);
  if (ux0 <= 1 || ux1 >= W - 2) { ux0 = 0; ux1 = W - 1; }      // near an edge: the whole width, so the join wraps as it did
  const gw = ux1 - ux0 + 1, gh = uy1 - uy0 + 1, full = gw === W;
  work += 5 * gw * gh;
  if (work > workCap || shapes.length > room) return as(false, prims);
  const paintsOf = [], index = new Map(), grid = new Int32Array(gw * gh).fill(-1);
  for (const [p, sh, b] of shapes) {
    if (!b.n) continue;
    const k = JSON.stringify(p.paint);
    if (!index.has(k)) { index.set(k, paintsOf.length); paintsOf.push(p.paint); }
    const c = index.get(k);
    sh.fill((x0, x1, y) => grid.fill(c, (y - uy0) * gw + x0 - ux0, (y - uy0) * gw + x1 - ux0), b.x0, b.y0, b.x1, b.y1);
  }
  const before = grid.slice();
  // the grid's coloured pixels as flat stair polygons: one set per patch of touching pixels of a colour (so no polygon's
  // box spans the layer), within a patch the k-th run of each column, each run of neighbouring columns at most 64 points
  const gridPolys = () => {
    // (the patches found with one queue and their cells sorted column by column, top to bottom: the same runs and the
    // same polygons, in the same order, as listing each column's rows in a map)
    const out = [], seen = new Uint8Array(gw * gh), queue = new Int32Array(gw * gh), N = gw * gh;
    for (let start = 0; start < N; start++) {
      const c = grid[start];
      if (c < 0 || seen[start]) continue;
      let n = 0;
      queue[n++] = start;
      seen[start] = 1;
      for (let q = 0; q < n; q++) {
        const i = queue[q], x = i % gw;
        if (x > 0 && !seen[i - 1] && grid[i - 1] === c) { seen[i - 1] = 1; queue[n++] = i - 1; }
        if (x < gw - 1 && !seen[i + 1] && grid[i + 1] === c) { seen[i + 1] = 1; queue[n++] = i + 1; }
        if (i >= gw && !seen[i - gw] && grid[i - gw] === c) { seen[i - gw] = 1; queue[n++] = i - gw; }
        if (i + gw < N && !seen[i + gw] && grid[i + gw] === c) { seen[i + gw] = 1; queue[n++] = i + gw; }
      }
      const keys = new Float64Array(n);
      for (let q = 0; q < n; q++) { const i = queue[q], x = i % gw; keys[q] = x * gh + (i - x) / gw; }
      keys.sort();
      // each column of the patch (left to right) and its runs of rows (top to bottom)
      const colX = [], colAt = [], r0 = [], r1 = [];
      let deepest = 0;
      for (let q = 0; q < n;) {
        const x = Math.floor(keys[q] / gh), first = r0.length;
        colX.push(x); colAt.push(first);
        for (; q < n && Math.floor(keys[q] / gh) === x; q++) {
          const y = keys[q] - x * gh + uy0, last = r0.length - 1;
          if (last >= first && r1[last] === y) r1[last] = y + 1; else { r0.push(y); r1.push(y + 1); }
        }
        deepest = Math.max(deepest, r0.length - first);
      }
      colAt.push(r0.length);
      for (let k = 0; k < deepest; k++) {
        let seg = [];
        const flush = () => { if (seg.length) out.push(...stairs(seg, paintsOf[c])); seg = []; };
        for (let m = 0; m < colX.length; m++) {
          const x = colX[m], at = colAt[m] + k, has = at < colAt[m + 1];
          if (!has || (seg.length && seg[seg.length - 1][0] !== x + ux0 - 1)) flush();
          if (has) seg.push([x + ux0, r0[at], r1[at]]);
        }
        flush();
        if (out.length > room) return as(false, prims);
      }
    }
    return as(true, out, out.length);
  };
  // a neighbour: in the box, see-through beside it (-1), or off the top or bottom of the frame (-2)
  const side = (gx, gy, dx) => {
    if (full) return grid[gy * gw + ((gx + dx + gw) % gw)];
    const x = gx + dx;
    return x < 0 || x >= gw ? -1 : grid[gy * gw + x];
  };
  const vert = (gx, gy, dy) => {
    const y = gy + dy;
    if (y < 0) return uy0 + y < 0 ? -2 : -1;
    if (y >= gh) return uy0 + y >= H ? -2 : -1;
    return grid[y * gw + gx];
  };
  for (let pass = 0; pass < 3; pass++) {
    let changed = 0;
    for (let y = 0; y < gh; y++) {
      // side() and vert() written out for the inside of the box (the same neighbours, read in a loop that most pixels
      // leave at their first neighbour of their own colour)
      const row = y * gw;
      for (let x = 0; x < gw; x++) {
        const i = row + x, v = grid[i];
        if (x > 0 && x < gw - 1 && (grid[i - 1] === v || grid[i + 1] === v)) continue;
        if (y > 0 && y < gh - 1 && (grid[i - gw] === v || grid[i + gw] === v)) continue;
        const l = side(x, y, -1), r = side(x, y, 1), u = vert(x, y, -1), d = vert(x, y, 1);
        if (v === l || v === r || v === u || v === d) continue;
        grid[i] = d !== -2 && (d === l || d === r || d === u) ? d : l === r || l === u ? l : d !== -2 ? d : l;
        changed++;
      }
    }
    if (!changed) break;
  }
  // a pixel this drawing loses (see-through after the passes, drawn before): a patch cannot take a pixel away without
  // taking what is under it too (another call's sky), so the drawing is given back as its grid, in stair polygons (the
  // way the first tidy@1 gave every drawing back): see-through pixels are then simply not drawn
  for (let i = 0; i < gw * gh; i++) if (grid[i] < 0 && before[i] >= 0) return gridPolys();
  const patches = [];
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw;) {
      const i = y * gw + x;
      if (grid[i] === before[i]) { x++; continue; }
      let e = x + 1;
      while (e < gw && grid[y * gw + e] !== before[y * gw + e] && grid[y * gw + e] === grid[i]) e++;
      patches.push({ kind: 'rect', at: [x + ux0, y + uy0], size: [e - x, 1], paint: paintsOf[grid[i]], ...FLAT, light: 0 });
      if (shapes.length + patches.length > room) return as(false, prims);
      x = e;
    }
  }
  const flat = shapes.map(([p]) => { const { z, group, glow, id, ...rest } = p; void z; void group; void glow; void id; return { ...rest, ...FLAT, light: 0 }; });
  return as(true, [...flat, ...patches], patches.length);
}

/** Neighbouring columns [[x, top, bottom], ...] (bottom not included) as flat stair polygons of at most 64 points, every pixel exactly the column's (as engine/gen/backdrop.js columnPolys). */
function stairs(cols, paintRef) {
  const out = [];
  let a = 0;
  while (a < cols.length) {
    let n = 4, b = a + 1;
    while (b < cols.length) {
      const add = (cols[b][1] !== cols[b - 1][1] ? 2 : 0) + (cols[b][2] !== cols[b - 1][2] ? 2 : 0);
      if (n + add > 64) break;
      n += add; b++;
    }
    const pts = [[cols[a][0], cols[a][1]]];
    for (let i = a + 1; i < b; i++) if (cols[i][1] !== cols[i - 1][1]) pts.push([cols[i][0], cols[i - 1][1]], [cols[i][0], cols[i][1]]);
    pts.push([cols[b - 1][0] + 1, cols[b - 1][1]], [cols[b - 1][0] + 1, cols[b - 1][2]]);
    for (let i = b - 1; i > a; i--) if (cols[i][2] !== cols[i - 1][2]) pts.push([cols[i][0], cols[i][2]], [cols[i][0], cols[i - 1][2]]);
    pts.push([cols[a][0], cols[a][2]]);
    out.push({ kind: 'poly', points: pts, paint: paintRef, ...FLAT });
    a = b;
  }
  return out;
}

/**
 * tidy@1: the things of `draw` (flat shapes and backdrop generator calls) drawn together with their single pixels taken
 * off, as engine/backdrop.js tidy() took them off a code backdrop's layer (tidyPlan): where a thin lit edge, the mist
 * at a ridge's foot or the rim of a clump of leaves leaves a pixel that touches none of its own colour. Calls inside
 * are run through the registry as written (a ground written out, not `on`; wrap written where it is wanted). What
 * comes back is the things themselves, flat, then a one-pixel patch for each run of pixels it changed, all within its
 * cost (the larger of `most` and what its things cost); past that, past its work (TIDY_LIMITS: in proportion to its
 * cost) or with a shape it cannot lay out, the things come back untidied. A limb or capsule written in `draw` is
 * refused when the sprite is checked (in a data file they are drawn along a bone, so in a layer they lose their ends).
 */
export const tidy = defineGenerator({
  id: 'tidy', v: 1, family: 'backdrop',
  about: 'Draws a few flat shapes and backdrop generators together and takes off the single pixels they leave, as a hand-tidied layer.',
  args: {
    draw: primitives({ about: 'The shapes and generator calls, back to front (rect, ellipse, poly, dot, arc, ring, line, or calls that return them; never a limb or capsule)' }),
    most: count(16, 2000, { default: 400, about: 'The most shapes the tidied drawing may take, its patches included' }),
  },
  cost: (a, { costOf }) => {
    for (const x of a.draw) if (!Object.hasOwn(x, 'gen') && TIDY_REFUSED.has(x.kind)) throw new Error(`a ${x.kind} cannot be written in tidy's draw: in a data file a ${x.kind} is drawn along a bone, so in a layer it loses its ends; write a poly or a line`);
    return Math.max(a.most, a.draw.reduce((n, x) => n + costOf(x), 0));
  },
  run(a, ctx, { call, costOf }) {
    const [W, H] = ctx.size, out = [];
    let cost = 0;
    for (const x of a.draw) {
      cost += costOf(x);
      if (Object.hasOwn(x, 'gen')) out.push(...call(x, ctx));
      else if (TIDY_REFUSED.has(x.kind)) throw new Error(`a ${x.kind} cannot be written in tidy's draw (it is drawn along a bone); write a poly or a line`);
      else out.push(x);
    }
    const room = Math.max(a.most, cost);
    return tidyPlan(out, W, H, room, TIDY_LIMITS.work * room).prims;
  },
});

const rect = (x, y, w, h, p) => ({ kind: 'rect', at: [x, y], size: [Math.max(0, w), Math.max(0, h)], paint: p, ...FLAT });
const ellipse = (x, y, rx, ry, p) => ({ kind: 'ellipse', at: [x, y], r: [rx, ry], paint: p, ...FLAT });
const poly = (points, p) => ({ kind: 'poly', points, paint: p, ...FLAT });
const usable = (p) => p !== undefined && p !== 'clear';

// The ground struct (the same fields as engine/gen/backdrop.js takes): an outline written out, or set from `on`.
const GROUND_FIELDS = {
  kind: word(['line', 'ridge', 'swell'], { default: 'line', about: 'A flat line, a ridge or a swell' }),
  base: px(-360, 720, { default: 0, about: 'Its lowest row (a line: its row)' }),
  height: px(-360, 360, { default: 40, about: 'How far it rises above base' }),
  seed: seed({ default: 1, about: 'Which ridge' }),
  peaks: count(1, 12, { default: 4, about: 'Summits across the layer (a ridge)' }),
  shape: word(['round', 'jagged'], { default: 'round', about: 'Soft hills or crags (a ridge)' }),
  rough: share({ default: 0.35, about: 'Small bumps on top (a ridge)' }),
  at: px(-640, 1280, { default: 160, about: 'The column of its top (a swell)' }),
  power: px(0.75, 4, { default: 1, about: 'Above 1 a narrower rise with a flatter foot (a swell)' }),
  dx: px(-640, 640, { default: 0, about: 'Moved this many px right' }),
  dy: px(-360, 360, { default: 0, about: 'Moved this many px down' }),
};
const GROUND = (about) => struct(GROUND_FIELDS, { default: { kind: 'line' }, about });

/** A canopy (engine/backdrop.js canopy, as canopy@1 draws it): overlapping round clumps in three tones round (x, y), lit from the top right; pushed to out. */
function canopyAt(out, x, y, r, s, tones, W, wrap) {
  const clumps = [[0, 0, r * 0.62]];
  for (let i = 0; i < 5; i++) {
    const ang = TAU * ((i + hash(s, 50 + i) * 0.7) / 5) + hash(s, 49) * TAU;
    const d = r * lerp(0.42, 0.55, hash(s, 60 + i));
    clumps.push([Math.cos(ang) * d * 1.1, Math.sin(ang) * d * 0.8, r * lerp(0.36, 0.5, hash(s, 70 + i))]);
  }
  const cy = Math.round(y);
  const e = (cx, cyy, rx, ry, p) => { if (rx > 0 && ry > 0) out.push(ellipse(cx, cyy, rx, ry, p)); };
  for (const cx of copiesAt(Math.round(x), r * 1.1 + 3, W, wrap)) {
    for (const [dx, dy, cr] of clumps) e(cx + dx, cy + dy, cr, cr, tones.dark);
    for (const [dx, dy, cr] of clumps) e(cx + dx + 1.5, cy + dy - 2, cr - 1.5, cr - 2, tones.base);
    for (const [dx, dy, cr] of clumps) e(cx + dx + cr * 0.3, cy + dy - cr * 0.38, cr * 0.5, cr * 0.42, tones.light);
  }
}
/** The most copies copiesAt gives of one thing: itself and once across the join. */
const COPIES = 2;

/** The most primitives canopyAt gives: 18 ellipses, in up to two copies. */
const CANOPY_COST = 18 * COPIES;


// ---- trees ----------------------------------------------------------------------------------------------------------

/**
 * tall.trees@1: tall trees rising from the bottom edge (port of the near layer of sprites/bg-forest.js): `count` trees
 * placed so a Density slider adds trees to the ones there (stable), no two alike: big ones with a side crown on the
 * left, the right, both or neither, trunks that lean and differ in width, every third tree a slim young one. Each trunk
 * widens at the root, with a shadow down its left side and a lit strip down its right; each crown is a canopy of clumps
 * in three tones. `foot` is the bottom row the trunks stand on (the layer's bottom).
 */
/**
 * edge.band@1: a band under an outline, between it and itself moved `dx` px right and `dy` px down (engine/backdrop.js
 * fillBetween(outline, shifted(outline, dx, dy)), whole columns rounded at their centres): the sunlit tops of a row of
 * hills, broader on the faces that fall away from the light. `also` is a second outline the band follows where it is
 * the higher (engine/backdrop.js highest: two swells in one tone). Repeats across the layer's width.
 */
export const edgeBand = defineGenerator({
  id: 'edge.band', v: 1, family: 'backdrop', wraps: true,
  about: 'A band under an outline, between it and itself moved a few px aside and down: the sunlit tops of a row of hills.',
  args: {
    ground: GROUND('The outline: set from `on`, or written out'),
    also: struct(GROUND_FIELDS, { default: { kind: 'line', base: 720 }, about: 'A second outline it follows where that one is higher (left out: none)' }),
    dx: px(-64, 64, { default: -3, about: 'The lower edge is the outline moved this many px right' }),
    dy: px(0, 64, { default: 3, about: 'and this many px down: the band\'s depth' }),
    paint: paint({ about: 'The band' }),
    wrap: flag({ default: true, about: 'Repeats across the join (an outline always does)' }),
  },
  cost: () => FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const g = groundOutline(a.ground, W), h = groundOutline(a.also, W, 720);
    const top = (x) => Math.min(g(x), h(x));
    return fillBetween(top, (x) => top(x - a.dx) + a.dy, a.paint, W, H);
  },
});

/**
 * tufts@1: a tufted edge of grass on a level row (port of engine/scenery.js tufts, the ground of the field battle
 * backdrop): `count` clumps of two or three narrow pointed blades at seeded places, the tallest `height` px, bare row
 * between them; filled from the edge moved `from` px down to row `to`. Repeats across the layer's width.
 */
export const tufts = defineGenerator({
  id: 'tufts', v: 1, family: 'backdrop', wraps: true,
  about: 'A tufted edge of grass on a row: clumps of two or three narrow blades, bare between them, filled down to a row.',
  args: {
    base: px(-360, 720, { default: 24, about: 'The row the grass stands on' }),
    count: count(0, 64, { default: 26, about: 'Clumps across the layer' }),
    seed: seed({ default: 1, about: 'Which clumps' }),
    height: px(1, 32, { default: 6, about: 'The tallest blade, px' }),
    from: px(-64, 64, { default: 0, about: 'The fill starts at the edge moved this many px down' }),
    to: px(0, 720, { default: 720, about: 'The row the fill stops at' }),
    paint: paint({ about: 'The grass' }),
    wrap: flag({ default: true, about: 'Repeats across the join (an outline always does)' }),
  },
  cost: () => FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size, s = a.seed;
    // the blades (engine/scenery.js tufts) as engine/backdrop.js treeline stands them: pointed, 0.4 wide, on the row
    const at = [];
    for (const c of spots(a.count, s, { jitter: 0.8 }, W)) for (let k = 0, n = c.w > 0.45 ? 3 : 2; k < n; k++) at.push({ x: c.x + (k - 1) * 3, u: hash(s * 13 + c.i, 40 + k) });
    const blades = at.map((t) => { const h = a.height * lerp(0.65, 1, t.u); return { x: t.x + 0.5, h, r: Math.max(2, (h * 0.4 * lerp(0.8, 1.15, 0)) / 2) }; });
    if (blades.length) blades.reduce((p, q) => (q.h > p.h ? q : p)).h = a.height;
    const gap = (x, y) => { const d = mod(x - y, W); return d > W / 2 ? d - W : d; };
    const edge = (x) => {
      let y = a.base;
      for (const t of blades) { const d = Math.abs(gap(x, t.x)); if (d < t.r && a.base - t.h * (1 - d / t.r) < y) y = a.base - t.h * (1 - d / t.r); }
      return y;
    };
    return fillBetween((x) => edge(x) + a.from, () => a.to, a.paint, W, H);
  },
});

/** The tones of tall.trees@1 it can make from the air when they are left out. */
const TALL_TONES = Object.freeze(['lit', 'dark', 'barkLit', 'barkDark']);

export const tallTrees = defineGenerator({
  id: 'tall.trees', v: 1, family: 'backdrop', wraps: true,
  about: 'Tall trees rising from the bottom edge: leaning trunks that widen at the root under big leaf crowns, some with side crowns, every third a slim young one.',
  args: {
    count: count(0, 12, { default: 4, about: 'How many trees (more are added to the ones already there)' }),
    seed: seed({ default: 31, about: 'Which trees' }),
    foot: px(8, 720, { default: 180, about: 'The row the trunks stand on (the bottom of the layer)' }),
    leaf: paint({ about: 'The leaves' }),
    lit: paint({ default: 'clear', about: 'The sunlit leaves (left out: lit.tone of the leaves, 0.3 towards the air)' }),
    dark: paint({ default: 'clear', about: 'The shaded leaves (left out: the leaves a tone of -0.45 darker)' }),
    bark: paint({ about: 'The trunks' }),
    barkLit: paint({ default: 'clear', about: 'The lit strip down a trunk (left out: lit.tone of the bark, 0.3 towards the air)' }),
    barkDark: paint({ default: 'clear', about: 'The shadow down a trunk, and the far branch (left out: the bark a tone of -0.45 darker)' }),
    air: paint({ default: 'clear', about: 'The air (a sky look\'s air): the tones left out are made from it as the code made them' }),
    bushes: count(0, 40, { default: 0, about: 'Bushes along the bottom, in front of the trunks' }),
    bushSeed: seed({ default: 17, about: 'Which bushes' }),
    bushRows: point({ lo: -360, hi: 360, default: [174, 178], about: 'The rows the middles of the bushes lie between' }),
    bushSize: px(4, 40, { default: 12, about: 'The smallest bush\'s radius (some are up to 3 px bigger)' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * (COPIES * 5 + 3 * CANOPY_COST) + a.bushes * CANOPY_COST,
  run(a0, ctx) {
    // the tones left out, made from the leaves and the bark as the code's forest made its canopy and trunk tones
    // (sprites/bg-forest.js near: litTone(base, air, 0.3), tone(base, -0.45)); with no air, left out is not drawn
    const made = (k, of) => (k === 'lit' || k === 'barkLit' ? { rule: 'lit.tone', v: 1, of, air: a0.air, amount: 0.3 } : { rule: 'tone', of, by: -0.45 });
    const a = { ...a0 };
    if (a.air !== 'clear') for (const k of TALL_TONES) if (a[k] === 'clear') a[k] = made(k, k.startsWith('bark') ? a.bark : a.leaf);
    const [W] = ctx.size, F = a.foot, out = [];
    const tones = { light: a.lit, base: a.leaf, dark: a.dark };
    for (const t of spots(a.count, a.seed, { stable: true }, W)) {
      const young = t.i % 3 === 1;
      const r = young ? 13 + Math.round(t.u * 4) : 24 + Math.round(t.u * 14);
      const top = young ? F - 58 - Math.round(t.v * 24) : F - 68 - r - Math.round(t.v * 44);
      const w = young ? 5 : 7 + Math.round(hash(t.i, 81) * 6), flare = young ? 2 : 5, band = young ? 2 : 3;
      const lean = Math.round((hash(t.i, 82) - 0.5) * (young ? 12 : 24));      // the crown stands this far to the side of the root
      const sides = young ? 0 : 1 + (Math.floor(hash(t.i, 83) * 3.99) % 4);     // side crowns: 1 left, 2 right, 3 both, 0 or 4 neither
      const mid = F - 30;
      for (const x of copiesAt(t.x, r * 2.2 + Math.abs(lean) + 10, W, a.wrap)) {
        const cx = x + lean, lt = cx - w / 2, rt = cx + w / 2, lb = x - w / 2 - 2, rb = x + w / 2 + 1;
        if (sides & 1) out.push({ kind: 'limb', from: [cx - 1, top + r + 16], to: [cx - r * 0.75, top + r * 0.3], width: 4, paint: a.barkDark, ...FLAT });
        if (sides & 2) out.push({ kind: 'limb', from: [cx + 1, top + r + 22], to: [cx + r * 0.8, top + r * 0.4], width: 4, paint: a.bark, ...FLAT });
        out.push(poly([[lt, top], [rt, top], [rb, mid], [rb + flare, F], [lb - flare, F], [lb, mid]], a.bark));
        out.push(poly([[lt, top], [lt + band, top], [lb + band, mid], [lb - flare + band, F], [lb - flare, F], [lb, mid]], a.barkDark));
        if (!young) out.push(poly([[rt - 3, top], [rt, top], [rb, mid], [rb + flare, F], [rb + flare - 3, F], [rb - 3, mid]], a.barkLit));
      }
      if (sides & 1) canopyAt(out, t.x + lean - r * 0.72, top + r * 0.42, r * 0.62, t.i + 20, tones, W, a.wrap);
      if (sides & 2) canopyAt(out, t.x + lean + r * 0.78, top + r * 0.36, r * 0.58, t.i + 40, tones, W, a.wrap);
      canopyAt(out, t.x + lean, top, r, t.i + 3, tones, W, a.wrap);
    }
    // undergrowth: bushes across the whole bottom edge (sprites/bg-forest.js: scatter(11, 17, { jitter: 0.7 }))
    for (const b of spots(a.bushes, a.bushSeed, { jitter: 0.7 }, W)) canopyAt(out, b.x, a.bushRows[0] + Math.round(b.v * (a.bushRows[1] - a.bushRows[0])), a.bushSize + Math.round(b.u * 3), b.i + 60, tones, W, a.wrap);
    return out;
  },
});

/**
 * round.trees@1: a line of round trees for the middle distance standing on a ground (engine/scenery.js roundTree, placed
 * as sprites/bg-battle-field.js placed them): `count` trees (stable, so a Density slider adds trees), each `tall` to
 * `tall` + `vary` px from its foot (`sink` px below the ground) to the top of its crown, a trunk that widens at the root
 * with a shadow down its left side, leaning a little, under a canopy of clumps in three tones; no two alike.
 */
export const roundTrees = defineGenerator({
  id: 'round.trees', v: 1, family: 'backdrop', wraps: true,
  about: 'A line of round trees on their trunks standing on a hill (an earlier ridge it is on): leaf crowns in three tones, no two alike.',
  args: {
    ground: GROUND('The ground they stand on: set from `on`, or written out'),
    base: px(-360, 720, { default: 120, about: 'The row of a flat ground' }),
    count: count(0, 16, { default: 5, about: 'How many trees (more are added to the ones already there)' }),
    seed: seed({ default: 31, about: 'Which trees' }),
    sink: px(-32, 32, { default: 4, about: 'How far below the ground line their feet stand' }),
    tall: px(8, 120, { default: 44, about: 'The smallest tree, px from its foot to the top of its crown' }),
    vary: px(0, 60, { default: 14, about: 'How much taller some trees are' }),
    leaf: paint({ about: 'The leaves' }),
    lit: paint({ about: 'The sunlit leaves' }),
    dark: paint({ about: 'The shaded leaves' }),
    wood: paint({ about: 'The trunks' }),
    woodDark: paint({ about: 'The shadow down a trunk' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * (COPIES * 2 + CANOPY_COST),
  run(a, ctx) {
    const [W] = ctx.size, out = [];
    const ground = groundOutline(a.ground, W, a.base);
    const tones = { light: a.lit, base: a.leaf, dark: a.dark };
    for (const t of spots(a.count, a.seed, { stable: true }, W)) {
      const height = a.tall + Math.round(t.u * a.vary), r = height * lerp(0.34, 0.4, t.v);
      const foot = Math.round(ground(t.x)) + a.sink, lean = Math.round((hash(t.i, 82) - 0.5) * 6);
      const cy = Math.round(foot - height + r * 0.95), w = Math.max(3, 4 + Math.round(t.w * 2)), band = Math.max(1, Math.round(w * 0.4));
      for (const cx of copiesAt(t.x, r * 1.2 + Math.abs(lean) + w + 4, W, a.wrap)) {
        const lt = cx + lean - w / 2, rt = cx + lean + w / 2, lb = cx - w / 2, rb = cx + w / 2, knee = foot - Math.min(4, Math.round(height * 0.08));
        out.push(poly([[lt, cy], [rt, cy], [rb, knee], [rb + 2, foot + 1], [lb - 2, foot + 1], [lb, knee]], a.wood));
        out.push(poly([[lt, cy], [lt + band, cy], [lb + band, knee], [lb - 2 + band, foot + 1], [lb - 2, foot + 1], [lb, knee]], a.woodDark));
      }
      canopyAt(out, t.x + lean, cy, r, t.i + 3, tones, W, a.wrap);
    }
    return out;
  },
});

// ---- buildings ------------------------------------------------------------------------------------------------------

/**
 * towers@1: small far towers standing on a ground (the far layer of sprites/bg-castle.js): `count` towers spread across
 * the layer (jitter), each 8 to 13 px wide and 18 to 32 px tall from `sink` px below the ground, half under a pointed
 * roof and half crenellated; the first `lit` of them show a lit window.
 */
export const towers = defineGenerator({
  id: 'towers', v: 1, family: 'backdrop', wraps: true,
  about: 'Small far towers standing on crags (an earlier ridge it is on), pointed or crenellated, the first few with a lit window.',
  args: {
    ground: GROUND('The ground they stand on: set from `on`, or written out'),
    base: px(-360, 720, { default: 120, about: 'The row of a flat ground' }),
    count: count(0, 24, { default: 9, about: 'How many towers' }),
    seed: seed({ default: 6, about: 'Which towers' }),
    jitter: share({ default: 0.5, about: '0 evenly spaced, 1 anywhere in its share of the width' }),
    sink: px(-32, 32, { default: 6, about: 'How far below the ground line they stand' }),
    lit: count(0, 24, { default: 0, about: 'How many of them show a lit window' }),
    stone: paint({ about: 'The towers' }),
    lamp: paint({ about: 'A lit window' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * COPIES * 6,
  run(a, ctx) {
    const [W] = ctx.size, out = [];
    const ground = groundOutline(a.ground, W, a.base);
    for (const t of spots(a.count, a.seed, { jitter: a.jitter }, W)) {
      const w = 8 + Math.round(t.u * 5), foot = Math.round(ground(t.x)) + a.sink, top = foot - 18 - Math.round(t.v * 14);
      for (const x of copiesAt(t.x, w + 4, W, a.wrap)) {
        out.push(rect(x - w / 2, top, w, foot - top + 8, a.stone));
        if (t.w < 0.5) out.push(poly([[x - w / 2 - 2, top], [x + w / 2 + 2, top], [x, top - w - 2]], a.stone));
        else out.push(rect(x - w / 2 - 2, top - 3, w + 4, 5, a.stone), rect(x - w / 2 - 2, top - 6, 3, 3, a.stone), rect(x - 1, top - 6, 3, 3, a.stone), rect(x + w / 2 - 1, top - 6, 3, 3, a.stone));
        if (t.i < a.lit) out.push(rect(x - 2, top + 6, 3, 5, a.lamp));
      }
    }
    return out;
  },
});

/**
 * far.house@1: a cottage made small by distance (engine/scenery.js farHouse): a low wall under a broad roof that
 * overhangs it, a door, if wanted a chimney on the right and a lit window; `at` is the middle of its foot.
 */
export const farHouse = defineGenerator({
  id: 'far.house', v: 1, family: 'backdrop', wraps: true,
  about: 'A cottage made small by distance: a low wall under a broad overhanging roof, a door, a chimney and a lit window if wanted.',
  args: {
    at: point({ about: 'The middle of its foot' }),
    width: px(8, 48, { default: 14, about: 'px across the walls' }),
    wall: px(2, 24, { default: 5, about: 'px high' }),
    roof: px(2, 24, { default: 6, about: 'The roof, px high' }),
    chimney: flag({ default: false, about: 'A stack on the right of the roof' }),
    window: flag({ default: false, about: 'A lit window beside the door' }),
    walls: paint({ about: 'The walls (and the chimney)' }),
    tiles: paint({ about: 'The roof and the door' }),
    lamp: paint({ default: 'clear', about: 'The lit window' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: () => COPIES * 5,
  run(a, ctx) {
    const W = ctx.size[0], w = Math.max(8, Math.round(a.width)), foot = a.at[1], out = [];
    for (const cx of copiesAt(Math.round(a.at[0]), w / 2 + 4, W, a.wrap)) {
      const l = Math.round(cx - w / 2), eave = foot - a.wall, top = eave - a.roof;
      if (a.chimney) out.push(rect(l + w - 5, top - 2, 3, 4, a.walls));
      out.push(rect(l, eave, w, a.wall, a.walls));
      out.push(poly([[l - 2, eave + 1], [l + 2, top], [l + w - 2, top], [l + w + 2, eave + 1]], a.tiles));
      const door = Math.min(a.wall - 1, 4);
      if (door > 0) out.push(rect(l + Math.round(w * 0.3) - 1, foot - door, 3, door, a.tiles));
      if (a.window && usable(a.lamp)) out.push(rect(l + Math.round(w * 0.68) - 1, eave + 2, 2, 2, a.lamp));
    }
    return out;
  },
});

/**
 * castle.wall@1: a long castle wall seen from outside (the middle layer of sprites/bg-castle.js): battlements on its top
 * (`top` is the walkway behind them), a lit string course under the teeth, courses of stone, and `bays` bays across the
 * layer that differ by turns, so nothing repeats inside two bays: a tall blind arch in deep shadow with a slim turret
 * standing well above the wall, then a pair of narrow arches under a hood with a broad low bastion. Windows on the
 * turrets, bastions and wall, the share `lit` of them lit (the others dark), in an order that is the same at every share.
 */
export const castleWall = defineGenerator({
  id: 'castle.wall', v: 1, family: 'backdrop', wraps: true,
  about: 'A long castle wall: battlements, blind arches, slim turrets and broad bastions by turns, and a row of windows, some lit.',
  args: {
    top: px(-360, 720, { about: 'The row of the walkway behind the battlements' }),
    bays: count(2, 8, { default: 4, about: 'Bays across the layer (an even number keeps the turns)' }),
    lit: share({ default: 0.45, about: 'How many windows are lit' }),
    seed: seed({ default: 5, about: 'Which courses of stone show' }),
    bright: paint({ about: 'The lit faces' }),
    base: paint({ about: 'The stone' }),
    dark: paint({ about: 'Shaded faces and the courses' }),
    deep: paint({ about: 'Openings' }),
    lamp: paint({ about: 'A lit window' }),
    wrap: flag({ default: true, about: 'Repeats across the join' }),
  },
  cost: (a) => FILL_COST + 1 + 14 * COPIES + a.bays * (COPIES * 9 + 10 + 4 * 2 * COPIES),
  run(a, ctx) {
    const [W, H] = ctx.size, top = Math.round(a.top), BAY = W / a.bays, out = [];
    const S = { light: a.bright, base: a.base, dark: a.dark, deep: a.deep };
    const n = Math.max(1, Math.round(W / 16)), period = W / n, lead = (1 - 10 / 16) / 2;
    const crest = (x) => { const u = mod(x, W) / period, v = u - Math.floor(u); return top - (v >= lead && v < lead + 10 / 16 ? 7 : 0); };
    out.push(...fillBetween(crest, () => H, S.base, W, H));
    out.push(rect(0, top + 6, W, 3, S.light));
    for (const s of spots(14, a.seed, { jitter: 0.9 }, W)) for (const x of copiesAt(s.x, 10, W, a.wrap)) out.push(rect(x - 5, top + 18 + Math.round(s.v * 7) * 9, 9, 3, S.dark));
    const arch = (x, y0, y1, w, p) => { const r = w / 2; out.push(ellipse(x, y0 + r, r, r, p), rect(x - r, y0 + r, w, y1 - y0 - r, p)); };
    const windows = [];
    for (let k = 0; k < a.bays; k++) {
      const ax = Math.round(k * BAY), tx = Math.round(k * BAY + BAY / 2);
      if (k % 2 === 0) {
        for (const x of copiesAt(ax, 24, W, a.wrap)) { arch(x, top + 30, H, 36, S.dark); arch(x + 2, top + 33, H, 32, S.deep); }
        const tt = top - 18;
        out.push(rect(tx - 9, tt, 18, H - tt, S.base), rect(tx - 11, tt - 3, 22, 6, S.base));
        for (const dx of [-11, -3, 5]) out.push(rect(tx + dx, tt - 9, 6, 6, S.base));
        out.push(rect(tx + 5, tt + 3, 4, H - tt, S.light), rect(tx - 9, tt + 3, 3, H - tt, S.dark), rect(tx - 11, tt + 3, 22, 3, S.dark));
        windows.push([tx - 1, tt + 12], [tx - 1, tt + 40], [ax - 26, top + 22], [ax + 26, top + 22]);
      } else {
        for (const x of copiesAt(ax, 30, W, a.wrap)) {
          out.push(rect(x - 24, top + 34, 48, 4, S.light));
          for (const dx of [-11, 11]) { arch(x + dx, top + 42, H, 16, S.dark); arch(x + dx + 1, top + 44, H, 13, S.deep); }
        }
        const tt = top - 7;
        out.push(rect(tx - 15, tt, 30, H - tt, S.base), poly([[tx - 15, top + 44], [tx + 15, top + 44], [tx + 21, H], [tx - 21, H]], S.base), rect(tx - 17, tt - 3, 34, 6, S.base));
        for (const dx of [-17, -8, 1, 10]) out.push(rect(tx + dx, tt - 9, 7, 6, S.base));
        out.push(rect(tx + 10, tt + 3, 5, H - tt, S.light), rect(tx - 15, tt + 3, 4, H - tt, S.dark), rect(tx - 17, tt + 3, 34, 3, S.dark));
        windows.push([tx - 7, tt + 16], [tx + 5, tt + 16], [ax - 32, top + 20], [ax + 32, top + 20]);
      }
    }
    // windows: more of them are lit as the share rises, always in the same order
    const lit = Math.round(lerp(2, windows.length, a.lit));
    const order = windows.map((_, i) => i).sort((p, q) => hash(p, 91) - hash(q, 91));
    windows.forEach(([x, y], i) => { for (const wx of copiesAt(mod(x, W), 6, W, a.wrap)) arch(wx, y, y + 11, 6, order.indexOf(i) < lit ? a.lamp : S.deep); });
    return out;
  },
});

/** battlements@1: a wall filled down from a crenellated top (engine/backdrop.js battlements + fillBelow): teeth `depth` px above `base`, a whole number of them across the layer, the join in a gap. */
export const battlements = defineGenerator({
  id: 'battlements', v: 1, family: 'backdrop', wraps: true,
  about: 'A castle wall filled down from a line of battlements: square teeth standing above its top, a whole number across the layer.',
  args: {
    base: px(-360, 720, { about: 'The row of the wall top between the teeth' }),
    tooth: px(1, 64, { default: 8, about: 'px across a tooth' }),
    gap: px(1, 64, { default: 8, about: 'px across a gap' }),
    depth: px(0, 64, { default: 6, about: 'px the teeth stand above the wall top' }),
    to: px(0, 720, { default: 720, about: 'The row the fill stops at' }),
    paint: paint({ about: 'The wall' }),
    wrap: flag({ default: true, about: 'Repeats across the join' }),
  },
  cost: () => FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const n = Math.max(1, Math.round(W / (a.tooth + a.gap))), period = W / n, part = a.tooth / (a.tooth + a.gap), lead = (1 - part) / 2;
    const top = (x) => { const u = mod(x, W) / period, v = u - Math.floor(u); return a.base - (v >= lead && v < lead + part ? a.depth : 0); };
    return fillBetween(top, () => a.to, a.paint, W, H);
  },
});

/**
 * arcade@1: a row of round-headed openings evenly across the layer (engine/scenery.js arcade): `count` openings `width`
 * px across, each arch from `spring` up to `crown`; at offset 0 a pier stands on the join (0.5: an opening does).
 * side below: the space under each arch, down to `to` (a passage, a niche). side above: the stone above the arches,
 * from `top` down, and the piers down to `to` (a vault seen from inside). depth above 0: only a band that thick along
 * each arch (its ring of stones; above, no lower than the spring).
 */
export const arcade = defineGenerator({
  id: 'arcade', v: 1, family: 'backdrop', wraps: true,
  about: 'A row of round-headed openings across the layer: the space below the arches, the stone above them, or a band along each arch.',
  args: {
    count: count(1, 16, { default: 4, about: 'Openings across the layer' }),
    width: px(2, 640, { default: 48, about: 'px across an opening' }),
    crown: px(-360, 720, { about: 'The row of the top of an arch' }),
    spring: px(-360, 720, { about: 'The row its curve starts from' }),
    offset: share({ default: 0, about: 'The pattern moved right by this share of a span: 0 a pier on the join, 0.5 an opening' }),
    side: word(['below', 'above'], { default: 'below', about: 'below: the openings; above: the stone over them and the piers' }),
    depth: px(0, 64, { default: 0, about: 'Only a band this thick along each arch (0: all of it)' }),
    top: px(-360, 720, { default: 0, about: 'The row the stone above starts at' }),
    to: px(0, 720, { default: 720, about: 'The row the openings (below) or the piers (above) end at' }),
    paint: paint({ about: 'The fill' }),
    wrap: flag({ default: true, about: 'Repeats across the join' }),
  },
  cost: () => FILL_COST,
  run(a, ctx) {
    const [W, H] = ctx.size;
    const span = W / a.count, half = Math.min(a.width, span) / 2, rise = a.spring - a.crown, shift = a.offset * span;
    const curve = (x) => {
      const u = mod(x - shift, W) / span, d = Math.abs(u - Math.floor(u) - 0.5) * span;
      return d >= half ? null : a.crown + rise * (1 - Math.sqrt(1 - (d / half) ** 2));
    };
    if (a.side === 'below') {
      if (a.depth > 0) return fillBetween((x) => curve(x) ?? NaN, (x) => { const c = curve(x); return c === null ? NaN : c + a.depth; }, a.paint, W, H);
      return fillBetween((x) => curve(x) ?? NaN, (x) => (curve(x) === null ? NaN : a.to), a.paint, W, H);
    }
    if (a.depth > 0) return fillBetween((x) => { const c = curve(x); return c === null ? NaN : Math.max(a.top, c - a.depth); }, (x) => { const c = curve(x); return c === null ? NaN : Math.min(c, a.spring); }, a.paint, W, H);
    return fillBetween(() => a.top, (x) => curve(x) ?? a.to, a.paint, W, H);
  },
});

const KIND = (about, dflt) => struct({
  width: px(6, 64, { default: 18, about: 'px across the shaft' }),
  capital: px(0, 16, { default: 4, about: 'px the capital juts out on each side (0: none)' }),
  foot: px(0, 16, { default: 5, about: 'px the foot juts out (0: none)' }),
  courses: px(0, 64, { default: 0, about: 'px between level joints (0: a plain shaft)' }),
  collar: px(0, 360, { default: 0, about: 'A ring round the shaft this many px below the capital (0: none)' }),
  collar2: px(0, 360, { default: 0, about: 'A second ring (0: none)' }),
}, { default: dflt, about });

/** The rows of level joints a pillar kind may draw between top and bottom, an upper bound (monotone in each number). */
const jointsBound = (k, top, bottom) => Math.ceil(Math.max(0, bottom - top) / Math.max(4, k?.courses ?? 0)) + 1;

/**
 * pillars@1: a row of stone pillars evenly across the layer (engine/scenery.js pillar, as sprites/bg-battle-dungeon.js
 * and bg-castle.js stood them): each from its capital at `top` to its foot on `bottom`, in three tones lit from the top
 * right, with level joints, collars, a capital and a foot as its kind says. turns one: every pillar is kind `a`; two:
 * a and b by turns; three: a and b by turns, and c for the last when the count is odd (so no kind stands next to itself
 * across the join). At offset 0 a pillar stands on the join.
 */
export const pillars = defineGenerator({
  id: 'pillars', v: 1, family: 'backdrop', wraps: true,
  about: 'A row of stone pillars evenly across the layer, from capital to foot, lit from the top right, in one to three kinds by turns.',
  args: {
    count: count(1, 16, { default: 4, about: 'Pillars across the layer' }),
    offset: share({ default: 0, about: 'Moved right by this share of the spacing: 0 a pillar on the join' }),
    top: px(-360, 720, { default: 0, about: 'The row of the top of the capital' }),
    bottom: px(-360, 720, { default: 180, about: 'The row the foot stands on' }),
    a: KIND('The first kind', { width: 18 }),
    b: KIND('The second kind (turns two or three)', { width: 16 }),
    c: KIND('The third kind (turns three, the last of an odd count)', { width: 20 }),
    turns: word(['one', 'two', 'three'], { default: 'one', about: 'How many kinds take turns' }),
    seed: seed({ default: 1, about: 'Which joints are lost to the dark here and there (pillar i takes seed + i)' }),
    bright: paint({ about: 'The lit side and the tops' }),
    base: paint({ about: 'The stone' }),
    dark: paint({ about: 'The shaded side and the joints' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * COPIES * (19 + Math.max(jointsBound(a.a, a.top, a.bottom), jointsBound(a.b, a.top, a.bottom), jointsBound(a.c, a.top, a.bottom))),
  run(a, ctx) {
    const W = ctx.size[0], n = a.count, span = W / n, out = [];
    const kindOf = (i) => (a.turns === 'one' ? a.a : a.turns === 'three' && n % 2 && i === n - 1 ? a.c : i % 2 ? a.b : a.a);
    const T = { light: a.bright, base: a.base, dark: a.dark };
    for (let i = 0; i < n; i++) {
      const k = kindOf(i), x = Math.round((i + a.offset) * span);
      const w = Math.max(6, Math.round(k.width ?? 18)), capital = k.capital ?? 4, foot = k.foot ?? 5, courses = k.courses ?? 0;
      const collars = [k.collar ?? 0, k.collar2 ?? 0].filter((c) => c > 0);
      const shade = Math.max(2, Math.round(w * 0.22)), lit = Math.max(2, Math.round(w * 0.17));
      const capH = capital > 0 ? 6 : 0, footH = foot > 0 ? 9 : 0, top = a.top, bottom = a.bottom;
      for (const cx of copiesAt(x, w / 2 + Math.max(capital, foot) + 3, W, a.wrap)) {
        const l = Math.round(cx - w / 2), y0 = top + capH, y1 = bottom - footH;
        out.push(rect(l, top, w, bottom - top, T.base), rect(l, y0, shade, y1 - y0, T.dark), rect(l + w - lit, y0, lit, y1 - y0, T.light));
        if (courses > 0) {
          let j = 0;
          for (let y = y0 + 5 + courses; y < y1 - 4; y += courses, j++) {
            if (hash((a.seed + i) * 17 + j, 3) < 0.3) continue;      // a joint lost to the dark here and there (engine/scenery.js pillar, seed + i)
            out.push(rect(l + shade, y, w - shade - lit, 1, T.dark));
          }
        }
        for (const dy of collars) {
          const y = y0 + dy;
          if (y + 4 > y1) continue;
          out.push(rect(l - 1, y, w + 2, 4, T.base), rect(l - 1, y, w + 2, 1, T.light), rect(l - 1, y + 3, w + 2, 1, T.dark), rect(l - 1, y + 1, shade, 2, T.dark));
        }
        if (capital > 0) out.push(rect(l - capital, top, w + capital * 2, capH, T.base), rect(l - capital, top, w + capital * 2, 3, T.light), rect(l - capital + 2, top + capH, w + capital * 2 - 4, 3, T.dark));
        if (foot > 0) {
          const f2 = Math.ceil(foot / 2);
          out.push(rect(l - f2, y1, w + f2 * 2, 4, T.base), rect(l - f2, y1, w + f2 * 2, 2, T.light));
          out.push(rect(l - foot, y1 + 4, w + foot * 2, footH - 4, T.base), rect(l - foot, y1 + 4, w + foot * 2, 2, T.light), rect(l - foot, y1 + 6, shade + foot, footH - 6, T.dark));
        }
      }
    }
    return out;
  },
});

/**
 * banners@1: a row of hanging banners evenly across the layer (the near layer of sprites/bg-castle.js): each swallow-tailed,
 * `width` px across, dropping from row `top`, a shadow down its left side and a light band near its foot; every other
 * one shorter (`short`) with two bands, the others `length` long with a diamond. At offset 0 a banner hangs on the join.
 */
export const banners = defineGenerator({
  id: 'banners', v: 1, family: 'backdrop', wraps: true,
  about: 'A row of swallow-tailed banners hanging evenly across the layer, every other one shorter, each shaded down its left side.',
  args: {
    count: count(1, 16, { default: 4, about: 'Banners across the layer' }),
    offset: share({ default: 0, about: 'Moved right by this share of the spacing: 0 a banner on the join' }),
    top: px(-360, 720, { default: 0, about: 'The row they hang from' }),
    width: px(8, 64, { default: 22, about: 'px across a banner' }),
    length: px(8, 160, { default: 36, about: 'The long ones, px to the notch' }),
    short: px(8, 160, { default: 28, about: 'Every other one, px to the notch' }),
    cloth: paint({ about: 'The cloth' }),
    dark: paint({ about: 'The shadow down its left side' }),
    trim: paint({ about: 'The bands and the diamond' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * COPIES * 5,
  run(a, ctx) {
    const W = ctx.size[0], span = W / a.count, bw = Math.round(a.width), out = [], y0 = a.top;
    for (let k = 0; k < a.count; k++) {
      const len = k % 2 ? a.short : a.length;
      for (const cx of copiesAt(Math.round((k + a.offset) * span), bw / 2 + 2, W, a.wrap)) {
        const bl = cx - bw / 2;
        out.push(poly([[bl, y0], [bl + bw, y0], [bl + bw, y0 + len + 12], [cx, y0 + len + 4], [bl, y0 + len + 12]], a.cloth));
        out.push(poly([[bl, y0], [bl + 4, y0], [bl + 4, y0 + len + 9], [bl, y0 + len + 12]], a.dark));
        out.push(rect(bl + 4, y0 + len - 8, bw - 4, 4, a.trim));
        if (k % 2) out.push(rect(bl + 4, y0 + len - 16, bw - 4, 4, a.trim));
        else out.push(poly([[cx + 2, y0 + 8], [cx + 7, y0 + 16], [cx + 2, y0 + 24], [cx - 3, y0 + 16]], a.trim));
      }
    }
    return out;
  },
});

// ---- fittings -------------------------------------------------------------------------------------------------------

/** The most rows one stair polygon of a light patch takes (4 points a row, within the 64 points of a polygon). */
const PATCH_ROWS = 15;
/** The most polygons patchPolys gives for a radius up to `rr` (its rows, PATCH_ROWS a polygon, one more for a split). */
const patchCost = (rr, squash) => Math.ceil((2 * (Math.ceil(rr * 1.12) + 1) * squash + 2) / PATCH_ROWS) + 1;

/**
 * One step of engine/scenery.js lightPatch as flat stair polygons, the same pixels: the blunt round patch of radius `rr`
 * round (cx, y), its height `squash` times its width, its edge a little uneven as `seedN` says (the code's two sine
 * ripples), each pixel centre tested as the code tests it; with `strip` [x0, x1], only the pixel centres between those
 * columns (the code's clip to a pillar's shaft). Its rows go in stair polygons of up to PATCH_ROWS rows (at most
 * patchCost(rr, squash) of them).
 */
function patchPolys(cx, y, rr, squash, seedN, strip, p) {
  const a0 = hash(seedN, 5) * 6.283, a1 = hash(seedN, 6) * 6.283, reach = Math.ceil(rr * 1.12) + 1;
  const inside = (px, py) => {
    const dx = px - cx, dy = (py - y) / squash, a = Math.atan2(dy, dx);
    const edge = rr * (1 + 0.025 * Math.sin(3 * a + a0) + 0.015 * Math.sin(5 * a + a1));
    return dx * dx + dy * dy <= edge * edge && (!strip || (px >= strip[0] && px < strip[1]));
  };
  const out = [], rows = [];
  for (let Y = Math.floor(y - reach * squash); Y <= Math.ceil(y + reach * squash); Y++) {
    const runs = [];
    let from = null;
    for (let X = Math.floor(cx - reach); X <= Math.ceil(cx + reach) + 1; X++) {
      const on = X <= Math.ceil(cx + reach) && inside(X + 0.5, Y + 0.5);
      if (on && from === null) from = X;
      if (!on && from !== null) { runs.push([from, X]); from = null; }
    }
    // (a patch's row is one run: its ripples are too small to notch it; a row of two would be filled between them)
    if (runs.length) rows.push([Y, runs[0][0], runs[runs.length - 1][1]]);
  }
  // consecutive rows of one run each, in stair polygons
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && j - i < PATCH_ROWS && rows[j][0] === rows[j - 1][0] + 1) j++;
    const part = rows.slice(i, j), right = [], left = [];
    for (const [Y, u, v] of part) { right.push([v, Y], [v, Y + 1]); left.push([u, Y], [u, Y + 1]); }
    out.push(part.length === 1 ? rect(part[0][1], part[0][0], part[0][2] - part[0][1], 1, p) : poly([...right, ...left.reverse()], p));
    i = j;
  }
  return out;
}

/** The torches of a row of `n` spots that burn when the share `lit` of them is asked for: the odd ones first (every second at the middle), then the rest, at least one. */
function litSpots(n, lit) {
  const order = [...Array(n).keys()].sort((p, q) => (q % 2) - (p % 2) || p - q);
  return new Set(order.slice(0, Math.max(1, Math.floor(lerp(1, n, clamp(lit)) + 1e-6))));
}

/**
 * wall.torches@1: a row of `count` torch places evenly across the layer, `lit` of them burning (the odd ones first),
 * the cup of each at row `y` (engine/scenery.js wallTorch, lightPatch, wallRing, as sprites/bg-battle-dungeon.js hung
 * them on its pillars). show glow: the soft-edged patch of wall each burning torch lights (draw it behind the pillars):
 * flat steps, widest and dimmest first, that swell and shrink as the flame flickers. show torch: each burning torch's
 * iron cup and its flame, which ripples and sways (whole cycles over a looping clip, so the loop closes; each torch on
 * its own beat), and an iron ring with a short chain where none burns.
 */
export const wallTorches = defineGenerator({
  id: 'wall.torches', v: 1, family: 'backdrop', wraps: true,
  about: 'A row of wall torches with flickering flames, the patches of wall they light, and iron rings where none burns.',
  args: {
    count: count(1, 16, { default: 4, about: 'Torch places across the layer' }),
    offset: share({ default: 0, about: 'Moved right by this share of the spacing: 0 a place on the join' }),
    lit: share({ default: 0.5, about: 'How many burn: 0 one, 1 all (the odd places first)' }),
    y: px(-360, 720, { about: 'The row of the rim of each cup (the foot of its flame)' }),
    show: word(['glow', 'torch'], { default: 'torch', about: 'glow: the lit patches of wall; torch: the torches and rings' }),
    reach: px(4, 64, { default: 25, about: 'The radius of the widest step of a lit patch' }),
    size: px(0.5, 3, { default: 1, about: '1: a flame about 11 px tall' }),
    flame: paints(4, { about: 'The flame, hottest first, its rim last' }),
    warm: paints(4, { default: ['clear'], about: 'The steps of a lit patch, widest (dimmest) first' }),
    face: px(0, 64, { default: 0, about: 'How wide the face behind a burning torch is (a pillar\'s), lit by it in two steps (0: none)' }),
    faces: struct({
      a: px(0, 64, { default: 0, about: 'The first kind\'s' }), b: px(0, 64, { default: 0, about: 'The second kind\'s' }), c: px(0, 64, { default: 0, about: 'The third kind\'s (the last of an odd count)' }),
    }, { default: { a: 0, b: 0, c: 0 }, about: 'The faces\' widths by turns, as pillars@1 three turns (all 0: every face `face` wide)' }),
    faceWarm: paints(2, { default: ['clear'], about: 'The steps of the lit face, dimmer first' }),
    iron: paint({ about: 'The cups and rings' }),
    ironLit: paint({ about: 'The lit rim of a cup' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  // glow: up to 4 steps of a patch; torch: two steps of the face's patch, the stem, 4 tongues and the rim (or a ring and its 4 links)
  cost: (a) => a.count * COPIES * (a.show === 'glow' ? 4 * patchCost(a.reach, 1) : Math.max(13, 2 * patchCost(13, 1.4) + 8)),
  run(a, ctx) {
    const W = ctx.size[0], n = a.count, span = W / n, burn = litSpots(n, a.lit), out = [];
    const t = fin(ctx.t) ? ctx.t : 0, y = a.y;
    const turns = a.faces.a > 0 || a.faces.b > 0 || a.faces.c > 0;
    const faceOf = (i) => (!turns ? a.face : n % 2 && i === n - 1 ? a.faces.c : i % 2 ? a.faces.b : a.faces.a);
    // (rounded to a thousandth, so the last frame of a loop meets its first exactly)
    const flick = (i) => r3(0.75 + 0.15 * wave(t, hash(i, 3)) + 0.1 * wave(2 * t, hash(i, 4)));
    // the lit patches take the level unrounded, as the code did: they are laid out in whole pixels, so the loop still closes
    const level = (i) => 0.75 + 0.15 * wave(t, hash(i, 3)) + 0.1 * wave(2 * t, hash(i, 4));
    for (let i = 0; i < n; i++) {
      const x = Math.round((i + a.offset) * span);
      if (a.show === 'glow') {
        if (!burn.has(i)) continue;
        const steps = a.warm.filter(usable), lv = level(i);
        for (const cx of copiesAt(x, a.reach + 3, W, a.wrap)) {
          steps.forEach((p, j) => out.push(...patchPolys(cx, y - 5, Math.max(1.5, a.reach * (0.72 + 0.28 * clamp(lv)) * (1 - (j / steps.length) * 0.9)), 1, i, null, p)));
        }
        continue;
      }
      if (!burn.has(i)) {
        // an iron ring bolted on, a short chain hanging from it
        const ry = y - 4, links = 2 + (i % 3);
        for (const cx of copiesAt(x, 6, W, a.wrap)) {
          out.push(rect(cx - 1, ry - 2, 3, 3, a.iron), rect(cx - 3, ry + 1, 7, 2, a.iron), rect(cx - 3, ry + 6, 7, 2, a.iron), rect(cx - 3, ry + 1, 2, 7, a.iron), rect(cx + 2, ry + 1, 2, 7, a.iron));
          for (let k = 0; k < links; k++) out.push(rect(cx, ry + 8 + k * 4, 1, 1, a.iron), rect(cx - 1, ry + 9 + k * 4, 3, 3, a.iron));
        }
        continue;
      }
      // the flame: nested tongues, the rim outermost, each a drop that leans with the sway and stretches as it ripples
      const tt = t + hash(i, 5), cols = a.flame.filter(usable), L = r3(11 * a.size * (1 + 0.1 * Math.sin(TAU * (2 * tt + 0.1))));
      const sway = r3(1.2 * Math.sin(TAU * 2 * tt)), hw = 4.2 * Math.min(1, 0.6 + a.size * 0.4);
      for (const cx of copiesAt(x, Math.max(12, a.face / 2 + 1), W, a.wrap)) {
        // the face it hangs on catches the light too: two blunt steps, no wider than the face
        // (engine/scenery.js lightPatch, squashed 1.4, kept inside the face: the shaft of the pillar it hangs on)
        const fw = faceOf(i);
        if (fw > 0) a.faceWarm.filter(usable).forEach((p, j, all) => {
          out.push(...patchPolys(cx, y - 3, Math.max(1.5, 13 * (0.72 + 0.28 * clamp(level(i))) * (1 - (j / all.length) * 0.9)), 1.4, i + 9, [cx - fw / 2, cx + fw / 2], p));
        });
        out.push(rect(cx - 1, y + 3, 3, 7, a.iron), rect(cx - 4, y + 8, 6, 2, a.iron));
        for (let j = 0; j < cols.length; j++) {      // the rim first and biggest, the hottest last and smallest
          const s = 1 - (j / Math.max(1, cols.length)) * 0.7, len = L * s, w = hw * s, tip = cx + 0.5 + sway * s;
          out.push(poly([[tip, y - len], [cx + 0.5 + w, y - len * 0.38], [cx + 0.5 + w * 0.8, y + 0.5], [cx + 0.5 - w * 0.8, y + 0.5], [cx + 0.5 - w, y - len * 0.38]], cols[cols.length - 1 - j]));
        }
        out.push(rect(cx - 3, y, 7, 4, a.iron), rect(cx - 3, y, 7, 1, a.ironLit));
      }
    }
    return out;
  },
});

// ---- ground ---------------------------------------------------------------------------------------------------------

/**
 * ground.marks@1: small marks over a band of ground (engine/scenery.js groundMarks): scuffs (two short offset lines) and,
 * `pebbles` of them, pebbles lit along the top, wider towards the front; marks keep their places when the count changes;
 * the rows `keep` (from, to) are kept clear for feet, a mark there moved up or down, or left out.
 */
export const groundMarks = defineGenerator({
  id: 'ground.marks', v: 1, family: 'backdrop', wraps: true,
  about: 'Scuffs and pebbles scattered over a band of ground, wider towards the front, with rows kept clear where feet stand.',
  args: {
    top: px(-360, 720, { about: 'The first row of the band' }),
    bottom: px(-360, 720, { about: 'The last row of the band' }),
    count: count(0, 40, { default: 12, about: 'How many marks' }),
    seed: seed({ default: 1, about: 'Which marks' }),
    keep: point({ lo: -1, hi: 360, default: [-1, -1], about: 'Rows kept clear, from and to (-1: none)' }),
    pebbles: share({ default: 0, about: 'The share of marks that are pebbles' }),
    dark: paint({ about: 'Scuffs, and the underside of a pebble' }),
    stone: paint({ default: 'clear', about: 'A pebble (clear: no pebbles)' }),
    gleam: paint({ default: 'clear', about: 'A pebble\'s lit top (clear: as the pebble)' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * COPIES * 4,
  run(a, ctx) {
    const W = ctx.size[0], out = [], clear = a.keep[0] >= 0 && a.keep[1] >= a.keep[0] ? a.keep : null;
    for (const m of spots(a.count, a.seed, { stable: true }, W)) {
      let y = Math.round(lerp(a.top + 1, a.bottom - 4, m.v));
      if (clear && y >= clear[0] - 3 && y <= clear[1]) {
        const up = clear[0] - 4 - Math.round(m.u * 4), down = clear[1] + 2 + Math.round(m.u * 6), upFits = up >= a.top, downFits = down <= a.bottom - 4;
        if (!upFits && !downFits) continue;
        y = upFits && (m.u < 0.5 || !downFits) ? up : down;
      }
      const depth = clamp((y - a.top) / Math.max(1, a.bottom - a.top));
      const pebble = m.w < a.pebbles && usable(a.stone);
      const w = pebble ? 4 + Math.round(depth * 2) : Math.round(lerp(4, 8, depth) + m.u * 3);
      for (const x of copiesAt(m.x, w + 2, W, a.wrap)) {
        if (pebble) out.push(rect(x, y + 1, w, 2, a.stone), rect(x + 1, y, w - 2, 1, usable(a.gleam) ? a.gleam : a.stone), rect(x, y + 3, w, 1, a.dark));
        else out.push(rect(x, y, w, 1, a.dark), rect(x + 2, y + 1, Math.max(3, w - 3), 1, a.dark));
      }
    }
    return out;
  },
});

/**
 * paved.course@1: one course of a paved floor seen from the side and a little from above (engine/scenery.js pavedFloor,
 * one course a call, back to front): a band `h` px high from row `top`, upright joints at the columns `joints` of each 32
 * px of the pattern stretched to `period` px and moved `shift` px right, a joint line along its back edge with a lit
 * line under it, and a share of its slabs a shade off the body (none when `calm`, for the rows where feet stand).
 */
export const pavedCourse = defineGenerator({
  id: 'paved.course', v: 1, family: 'backdrop', wraps: true,
  about: 'One course of a paved floor seen from the side: slabs with upright joints, a lit back edge, some slabs a shade darker.',
  args: {
    top: px(-360, 720, { about: 'The back row of the course' }),
    h: px(1, 180, { default: 8, about: 'px high' }),
    period: px(8, 320, { default: 32, about: 'px one repeat of the pattern takes (a divisor of the width: 32, 40, 64, 80, 160)' }),
    shift: px(-320, 320, { default: 0, about: 'px the pattern is moved right' }),
    joints: point({ lo: 0, hi: 32, default: [10, 29], about: 'The columns of the two upright joints in each 32 px' }),
    upright: px(1, 8, { default: 2, about: 'px across an upright joint' }),
    shaded: share({ default: 0.2, about: 'The share of slabs a shade off the body' }),
    calm: flag({ default: false, about: 'No shaded slabs (rows where feet stand)' }),
    seed: seed({ default: 1, about: 'Which slabs are shaded' }),
    body: paint({ about: 'The slabs' }),
    joint: paint({ about: 'The joints' }),
    lit: paint({ default: 'clear', about: 'The lit line along the back edge (clear: none)' }),
    dark: paint({ default: 'clear', about: 'A shaded slab (clear: none)' }),
    wrap: flag({ default: true, about: 'Repeats across the join' }),
  },
  cost: (a) => 3 + (2 + 2 * COPIES) * 2 * Math.ceil(640 / a.period),
  run(a, ctx) {
    const W = ctx.size[0], out = [], y = a.top, h = Math.round(a.h), s = a.period / 32, wide = Math.round(a.upright);
    out.push(rect(0, y, W, h, a.body));
    const xs = [];
    for (let x0 = 0; x0 < W; x0 += a.period) for (const j of a.joints) xs.push(mod(Math.round(x0 + j * s + a.shift), W));
    xs.sort((p, q) => p - q);
    if (usable(a.dark) && !a.calm) xs.forEach((x, i) => {
      if (hash(a.seed, i) >= a.shaded) return;
      const next = xs[(i + 1) % xs.length] + (i === xs.length - 1 ? W : 0);
      for (const dx of [0, -W]) out.push(rect(x + dx, y, next - x, h, a.dark));
    });
    for (const x of xs) for (const jx of copiesAt(x, wide + 1, W, a.wrap)) out.push(rect(jx, y, wide, h, a.joint));
    out.push(rect(0, y, W, 1, a.joint));
    if (usable(a.lit) && h > 3) {
      out.push(rect(0, y + 1, W, 1, a.lit));
      for (const x of xs) for (const jx of copiesAt(x, wide + 1, W, a.wrap)) out.push(rect(jx, y + 1, wide, 1, a.joint));
    }
    return out;
  },
});

/**
 * rail.fence@1: a post-and-rail fence standing on a ground across the whole layer (engine/scenery.js railFence): `posts`
 * evenly spaced posts (some a pixel or two taller), rails that follow the ground from post to post at the rows `rails`
 * below the top of the fence, a lit top on each rail and post and a shade down each post's left side. The spans `open`
 * (span i runs from post i to post i + 1; -1: none) are a gateway with no rails and no post at their right end; `missing`
 * rails are left out here and there.
 */
export const railFence = defineGenerator({
  id: 'rail.fence', v: 1, family: 'backdrop', wraps: true,
  about: 'A post-and-rail fence along a ground (an earlier ridge it is on): rails follow the ground from post to post, a gateway or two left open.',
  args: {
    ground: GROUND('The ground it stands on: set from `on`, or written out'),
    base: px(-360, 720, { default: 120, about: 'The row of a flat ground' }),
    posts: count(1, 40, { default: 16, about: 'Posts across the layer' }),
    height: px(2, 48, { default: 11, about: 'px of the fence above the ground' }),
    post: count(1, 6, { default: 3, about: 'px across a post' }),
    rails: point({ lo: 0, hi: 48, default: [2, 6], about: 'The rows below the top of the fence where the two rails start' }),
    thick: px(1, 6, { default: 2, about: 'px a rail is thick' }),
    sink: px(0, 16, { default: 3, about: 'px a post goes on below the ground' }),
    open: point({ lo: -1, hi: 39, default: [-1, -1], about: 'Spans left open, a gateway (-1: none)' }),
    missing: count(0, 16, { default: 0, about: 'Rails left out here and there' }),
    seed: seed({ default: 0, about: 'Which posts stand a little taller, which rails are missing' }),
    wood: paint({ about: 'The wood' }),
    lit: paint({ default: 'clear', about: 'The top of each rail and post (clear: none)' }),
    shadow: paint({ default: 'clear', about: 'The left side of each post (clear: none)' }),
    wrap: flag({ default: true, about: 'Repeats across the join' }),
  },
  cost: (a) => 4 * FILL_COST + a.posts * COPIES * 3,
  run(a, ctx) {
    const [W, H] = ctx.size, out = [];
    const ground = groundOutline(a.ground, W, a.base), n = a.posts, pitch = W / n;
    const opens = new Set(a.open.filter((s) => s >= 0).map((s) => Math.round(s) % n));
    const gone = new Set([...opens].map((s) => (s + 1) % n));
    const list = [];
    for (let i = 0; i < n; i++) {
      const x = Math.round(i * pitch + pitch / 2), foot = Math.round(ground(x + 0.5));
      list.push({ x, foot, top: foot - a.height - Math.round(hash(a.seed, i) * 1.6) });
    }
    const missing = new Set([...Array(n * 2).keys()].sort((p, q) => hash(a.seed + 7, p) - hash(a.seed + 7, q)).slice(0, a.missing));
    // the rails first (stairs of whole rows, as the code drew them a column at a time), so the posts stand in front
    a.rails.forEach((dy, k) => {
      const y0 = new Array(W).fill(NaN), y1 = new Array(W).fill(NaN), l0 = new Array(W).fill(NaN), l1 = new Array(W).fill(NaN);
      for (let i = 0; i < n; i++) {
        if (opens.has(i) || missing.has(i * 2 + k)) continue;
        const p = list[i], q = list[(i + 1) % n], bx = q.x + (i === n - 1 ? W : 0);
        for (let x = p.x; x <= bx; x++) {
          const y = Math.round(lerp(p.foot, q.foot, (x - p.x) / (bx - p.x))) - a.height + dy, c = a.wrap ? mod(x, W) : x;
          if (c < 0 || c >= W) continue;
          y0[c] = y; y1[c] = y + a.thick; l0[c] = y; l1[c] = y + 1;
        }
      }
      const clip = (v) => v.map((y) => (fin(y) ? clamp(y, 0, H) : y));
      out.push(...columnPolys(clip(y0), clip(y1), a.wood));
      if (usable(a.lit)) out.push(...columnPolys(clip(l0), clip(l1), a.lit));
    });
    for (const [i, p] of list.entries()) {
      if (gone.has(i)) continue;
      for (const cx of copiesAt(p.x, a.post + 1, W, a.wrap)) {
        const l = cx - Math.floor(a.post / 2), tall = p.foot + a.sink - p.top;
        out.push(rect(l, p.top, a.post, tall, a.wood));
        if (usable(a.shadow)) out.push(rect(l, p.top + 1, 1, tall - 1, a.shadow));
        if (usable(a.lit)) out.push(rect(l, p.top, a.post, 1, a.lit));
      }
    }
    return out;
  },
});

/**
 * castle.columns@1: a row of plain columns evenly across the layer, from a capital at row `spring` to the bottom (port of
 * the columns of the near layer of sprites/bg-castle.js): each `shaft` px wide, a band of shadow 4 px down its left
 * side and a lit band 3 px down its right, a pixel in from its edge; a capital 8 px wider than the shaft, lit along its
 * top, shadowed under it; a foot from row `foot`, 6 px wider than the shaft and lit along its top, then a plinth 14 px
 * wider from 5 rows below, lit along its top. At offset 0 a column stands on the join.
 */
export const castleColumns = defineGenerator({
  id: 'castle.columns', v: 1, family: 'backdrop', wraps: true,
  about: 'A row of plain columns from a capital to the ground, shadowed down the left and lit down the right, on a two-step foot.',
  args: {
    count: count(1, 16, { default: 3, about: 'Columns across the layer' }),
    offset: share({ default: 0, about: 'Moved right by this share of the spacing: 0 a column on the join' }),
    spring: px(-360, 720, { default: 56, about: 'The row the shaft starts at (its capital two rows above)' }),
    shaft: px(6, 64, { default: 18, about: 'px across the shaft' }),
    foot: px(-360, 720, { default: 154, about: 'The row of the top of the foot' }),
    bright: paint({ about: 'The lit band and the tops' }),
    base: paint({ about: 'The stone' }),
    dark: paint({ about: 'The shadow down the left and under the capital' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * COPIES * 9,
  run(a, ctx) {
    const [W, H] = ctx.size, span = W / a.count, s = Math.round(a.shaft), top = a.spring, f = a.foot, out = [];
    for (let k = 0; k < a.count; k++) {
      for (const cx of copiesAt(Math.round((k + a.offset) * span), s / 2 + 8, W, a.wrap)) {
        const l = cx - s / 2;
        out.push(rect(l, top, 4, H - top, a.dark), rect(l + s - 4, top, 3, H - top, a.bright));
        out.push(rect(l - 4, top - 2, s + 8, 6, a.base), rect(l - 4, top - 2, s + 8, 3, a.bright), rect(l - 2, top + 4, s + 4, 3, a.dark));
        out.push(rect(l - 3, f, s + 6, 5, a.base), rect(l - 3, f, s + 6, 3, a.bright));
        out.push(rect(l - 7, f + 5, s + 14, H - f - 5, a.base), rect(l - 7, f + 5, s + 14, 3, a.bright));
      }
    }
    return out;
  },
});

// ---- stand.apart: the backdrops' main tones, as the code works them out (migration batch M10b) ------------------------

/**
 * How stand.apart@1 is worked out (engine/gen/backdrop.js workOutColour reads it from SCENERY_COLOUR_WORK), every paint
 * already '#rrggbb' (air null when it names none; behind and also the colours among them): engine/scenery.js
 * standApart(night, darkest) of engine/backdrop.js recede(of, depth, air), or standOutLighter (way lighter), built on
 * clear.of@1 and haze@1 (engine/backdrop.js standOut and recede), so a backdrop's tones are the code's at every colour.
 */
function standApartHex({ of, air = null, depth = 0.5, behind = [], also = [], night = false, darkest = 0, way = 'auto', step = 0.08 }) {
  const c = air ? COLOUR_WORK['haze@1']({ of, air, depth }) : of;
  const clearOf = COLOUR_WORK['clear.of@1'];
  // at night (the moonlit land lighter, a smaller step): only the step, from all of them
  if (night) return clearOf({ of: c, behind: [], also: [...behind, ...also], step: 0.05, way });
  const out = clearOf({ of: c, behind, also, step, way });
  // standApart's floor: a tone that sank below `darkest` is worked out again, a larger step from all of them
  return darkest > 0 && brightness(out) < darkest ? clearOf({ of: c, behind: [], also: [...behind, ...also], step: 0.1, way }) : out;
}

/** How this module's colour rules are worked out, "<id>@<v>" -> fn(args) -> '#rrggbb' (engine/gen/backdrop.js COLOUR_WORK's form; workOutColour reads both). */
export const SCENERY_COLOUR_WORK = Object.freeze({ 'stand.apart@1': standApartHex });

/**
 * stand.apart@1: a backdrop's main tone as engine/scenery.js standApart works it out: the colour receded into the air
 * (engine/backdrop.js recede, as haze@1; leave air out for none), then moved a clear step of value from what it is seen
 * against (behind: also a different colour under every site palette) and from `also` (only the step), as clear.of@1
 * (engine/backdrop.js standOut). night: the night form (a step of 0.05 from all of them, no palette test); darkest: a
 * tone that sinks below it is worked out again, a step of 0.1 from all of them; way lighter: engine/scenery.js
 * standOutLighter (a dark hall, each nearer layer lighter). The recede inside it keeps a chain of a backdrop's tones
 * (each kept clear of the one before it) within the nesting of 6 colour rules.
 */
export const standApartRule = defineGenerator({
  id: 'stand.apart', v: 1, family: 'colour',
  about: 'A backdrop\'s main tone as the code works it out: receded into the air, then moved a clear step of value from what it is seen against.',
  args: {
    of: paint({ about: 'The shape\'s colour, before the air' }),
    air: paint({ default: 'clear', about: 'The air it recedes into (a sky look\'s air); clear: not receded' }),
    depth: share({ default: 0.5, about: 'How far it recedes: 0 the near layer, 1 the horizon (bind it to the Haze slider)' }),
    behind: paints(4, { default: ['clear'], about: 'What it is seen against: kept a step away and a different colour under every site palette' }),
    also: paints(4, { default: ['clear'], about: 'Colours it only keeps the step from (clear: none)' }),
    night: flag({ default: false, about: 'The night form: a smaller step (0.05) from all of them, no palette test' }),
    darkest: share({ default: 0, about: 'A tone darker than this is worked out again, a step of 0.1 from all of them (0: never)' }),
    way: word(['auto', 'lighter'], { default: 'auto', about: 'auto: darker in front of a light sky, lighter against the dark; lighter: only ever lighter' }),
    step: share({ default: 0.08, about: 'The least difference in brightness by day' }),
  },
  cost: () => 1,
  run: (a, ctx) => [{ kind: 'rect', at: [0, 0], size: [...ctx.size], paint: { rule: 'stand.apart', v: 1, ...a } }],
});

/** The colour rules of this module: "<id>@<v>" -> its entry (worked out by engine/gen/backdrop.js workOutColour through SCENERY_COLOUR_WORK). */
export const SCENERY_COLOUR_RULES = Object.freeze({ 'stand.apart@1': standApartRule });

/** The generators of this module, every one a frame generator (engine/gen/scenery-frame.js): "<id>@<v>" -> its entry. */
export const SCENERY_GENERATORS = Object.freeze(Object.fromEntries([tidy, tallTrees, roundTrees, towers, farHouse, castleWall, battlements, arcade, pillars, banners, wallTorches, groundMarks, pavedCourse, railFence, castleColumns, edgeBand, tufts].map((e) => [`${e.id}@${e.v}`, e])));


// ---- added for the Cloudreach kit's bg-sky-harbour: towers and banners that take a light and fit a low rope ----------

/**
 * towers@2: towers@1's towers, pixel for pixel, each with a shaded column down its left (`dark`) and a sunlit one down
 * its right (`bright`), `edge` px wide, on the shaft and on a crenellated top's band, so they are shaded like the
 * things beside them (the light is from the right). With both clear it draws exactly as towers@1. Arguments as
 * towers@1, and dark, bright, edge. Wraps.
 */
export const towers2 = defineGenerator({
  id: 'towers', v: 2, family: 'backdrop', wraps: true,
  about: 'Small far towers as towers@1 draws them, each with a shaded column down its left and a sunlit one down its right.',
  args: {
    ground: GROUND('The ground they stand on: set from `on`, or written out'),
    base: px(-360, 720, { default: 120, about: 'The row of a flat ground' }),
    count: count(0, 24, { default: 9, about: 'How many towers' }),
    seed: seed({ default: 6, about: 'Which towers' }),
    jitter: share({ default: 0.5, about: '0 evenly spaced, 1 anywhere in its share of the width' }),
    sink: px(-32, 32, { default: 6, about: 'How far below the ground line they stand' }),
    lit: count(0, 24, { default: 0, about: 'How many of them show a lit window' }),
    stone: paint({ about: 'The towers' }),
    lamp: paint({ about: 'A lit window' }),
    dark: paint({ default: 'clear', about: 'The shaded column down each tower\'s left (clear: none)' }),
    bright: paint({ default: 'clear', about: 'The sunlit column down each tower\'s right (clear: none)' }),
    edge: count(1, 3, { default: 1, about: 'px across each of those columns' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * COPIES * 10,
  run(a, ctx) {
    const [W] = ctx.size, out = [];
    const ground = groundOutline(a.ground, W, a.base);
    for (const t of spots(a.count, a.seed, { jitter: a.jitter }, W)) {
      const w = 8 + Math.round(t.u * 5), foot = Math.round(ground(t.x)) + a.sink, top = foot - 18 - Math.round(t.v * 14);
      for (const x of copiesAt(t.x, w + 4, W, a.wrap)) {
        const flat = !(t.w < 0.5);
        // the columns towers@1's rects paint: a pixel is painted where its centre lies inside
        const l = Math.ceil(x - w / 2 - 0.5), r = Math.ceil(x + w / 2 - 0.5), cl = Math.ceil(x - w / 2 - 2.5), cr = Math.ceil(x + w / 2 + 1.5);
        out.push(rect(x - w / 2, top, w, foot - top + 8, a.stone));
        if (!flat) out.push(poly([[x - w / 2 - 2, top], [x + w / 2 + 2, top], [x, top - w - 2]], a.stone));
        else out.push(rect(x - w / 2 - 2, top - 3, w + 4, 5, a.stone), rect(x - w / 2 - 2, top - 6, 3, 3, a.stone), rect(x - 1, top - 6, 3, 3, a.stone), rect(x + w / 2 - 1, top - 6, 3, 3, a.stone));
        if (a.dark !== 'clear') { out.push(rect(l, flat ? top + 2 : top, a.edge, foot - top + 8 - (flat ? 2 : 0), a.dark)); if (flat) out.push(rect(cl, top - 3, a.edge, 5, a.dark)); }
        if (a.bright !== 'clear') { out.push(rect(r - a.edge, flat ? top + 2 : top, a.edge, foot - top + 8 - (flat ? 2 : 0), a.bright)); if (flat) out.push(rect(cr - a.edge, top - 3, a.edge, 5, a.bright)); }
        if (t.i < a.lit) out.push(rect(x - 2, top + 6, 3, 5, a.lamp));
      }
    }
    return out;
  },
});

/**
 * banners@2: a row of swallow-tailed banners as banners@1, measured so they fit above a low edge: `length` and `short`
 * are px from the rope to the tips, `tail` how deep the notch is cut, and the marks fit the cloth above the notch (a
 * diamond on the long ones, two bands on the short ones). `sway`: over a looping clip each banner's tips hang that
 * many px lower for half its cycle, out of step with its neighbours, so the last frame leads into the first. Wraps.
 */
export const banners2 = defineGenerator({
  id: 'banners', v: 2, family: 'backdrop', wraps: true,
  about: 'A row of swallow-tailed banners measured to their tips, with a notch of a chosen depth, that can sway a px over a looping clip.',
  args: {
    count: count(1, 16, { default: 4, about: 'Banners across the layer' }),
    offset: share({ default: 0, about: 'Moved right by this share of the spacing: 0 a banner on the join' }),
    top: px(-360, 720, { default: 0, about: 'The row they hang from' }),
    width: px(8, 64, { default: 22, about: 'px across a banner' }),
    length: px(12, 160, { default: 48, about: 'The long ones, px from the rope to the tips' }),
    short: px(12, 160, { default: 40, about: 'Every other one, px from the rope to the tips' }),
    tail: px(2, 32, { default: 8, about: 'How deep the notch is cut, px (never more than half the banner)' }),
    sway: count(0, 2, { default: 0, about: 'Over a looping clip the tips hang this many px lower for half of each banner\'s cycle' }),
    cloth: paint({ about: 'The cloth' }),
    dark: paint({ about: 'The shadow down its left side' }),
    trim: paint({ about: 'The bands and the diamond' }),
    wrap: flag({ default: true, about: 'Over an edge it comes back on the other side' }),
  },
  cost: (a) => a.count * COPIES * 5,
  run(a, ctx) {
    const W = ctx.size[0], span = W / a.count, bw = Math.round(a.width), out = [], y0 = Math.round(a.top);
    const t = ctx.loop === true && fin(ctx.t) ? ((ctx.t % 1) + 1) % 1 : -1;
    const s = Math.max(2, Math.round(bw / 5));                                   // the shadow's width
    for (let k = 0; k < a.count; k++) {
      const drop = Math.round(k % 2 ? a.short : a.length), tail = Math.min(Math.round(a.tail), Math.floor(drop / 2));
      const low = t >= 0 && a.sway && (((t + hash(k, 61)) % 1) < 0.5) ? a.sway : 0;
      const h = drop - tail, end = y0 + drop + low, notch = end - tail;         // the marks keep to the still banner's cloth
      for (const cx of copiesAt(Math.round((k + a.offset) * span), bw / 2 + 2, W, a.wrap)) {
        const bl = cx - bw / 2;
        out.push(poly([[bl, y0], [bl + bw, y0], [bl + bw, end], [cx, notch], [bl, end]], a.cloth));
        out.push(poly([[bl, y0], [bl + s, y0], [bl + s, end - tail * (s / (bw / 2))], [bl, end]], a.dark));
        if (k % 2) {
          const b = h >= 24 ? 4 : 2, lower = y0 + h - 2 - b, upper = lower - 2 * b;
          out.push(rect(bl + s, lower, bw - s, b, a.trim));
          if (upper >= y0 + 2) out.push(rect(bl + s, upper, bw - s, b, a.trim));
        } else {
          const rx = Math.max(2, Math.floor((bw - s) / 2) - 1), ry = Math.max(2, Math.min(Math.floor(h / 2) - 2, Math.round(rx * 1.6)));
          const mx = bl + s + (bw - s) / 2, my = y0 + Math.round(h / 2);
          out.push(poly([[mx, my - ry], [mx + rx, my], [mx, my + ry], [mx - rx, my]], a.trim));
        }
      }
    }
    return out;
  },
});
