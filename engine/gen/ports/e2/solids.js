// PORT (migration batch E2): a copy of engine/solids.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/e2/surface.js), so it draws paint refs on engine/gen/port-surface.js grids. It is the drawing code of migration batch E2's
// effect behaviours (engine/gen/fx-e2.js), so it is NOT temporary: it stays when engine/solids.js goes and goes only with the last
// generator version that draws with it. A HAND CHANGE note below says where it differs from its source; never change what
// a released generator version draws through it.
// Solid things in three-quarter (top-down) view: the camera looks from the south, tilted down, so a
// box, a drum or a pedestal shows its top face, lit, above the wall that faces the camera
// (docs/style-guide.md section 1, "Top-down means three-quarter view"). For crates, barrels, chests,
// pedestals, consoles and machines. Pure functions: Node and browser, no Math.random.
//
// One idea: a solid is the shape of its TOP FACE as seen on screen, dropped `h` px down the screen.
//   rectIn(...)                      a box                 squircleIn(...)   a box with round corners, a dome lid
//   ellipseIn(...)                   a drum, a column      polyIn(ngonPoints(...))   a prism, a turning cube
//
//   import { extrude, bandIn, wallFill, stripesIn, squircleIn, ngonPoints } from '../engine/solids.js';
//   const S = extrude(g, ellipseIn(16, 20, 9, 3), 20, p.body, { lip: 1 });        // a drum: lit lid, wall shaded round
//   wallFill(g, S, bandIn(S, 4, 2), P.steel);                                      // a hoop that follows its curve
//   wallFill(g, S, stripesIn(bandIn(S, 9, 5), { pitch: 4 }), p.accent);            // hazard tape round it
//   g.outline(INK);
//   const cube = solid(polyIn(ngonPoints(16, 12, 6, 3, 4, turn)), 6, [0, 0, 32, 48]);   // the tests alone, nothing drawn
//
// The wall is shaded by the way each part of it faces: where the top's front edge runs level the wall
// faces the camera (base tone); where the edge climbs to the right the wall is turned to the light
// (light tone); where it falls to the right it is turned away (dark tone). Light comes from the top
// right, as everywhere. Draw solids before g.outline(INK).

// HAND CHANGE (E2): engine/color.js col packs a colour into a pixel's number; on a paint-ref grid a pixel's number is
// its paint ref's cell in the grid's table, so every col(c) below is g.table.id(c) (the same pixel, its paint kept).
import { ramp, tone, brightness, col } from '../colour.js';

const TAU = Math.PI * 2;

// ---- footprints ----------------------------------------------------------------

/**
 * Shape test for a box with rounded corners: an ellipse whose corners square up as `power` grows (2 is an ellipse, 4 a soft box, 8 nearly a rectangle); returns inside(px, py).
 * Arguments: cx, cy (centre); rx, ry (half its width and half its height); power (2 or more, default 4).
 */
export function squircleIn(cx, cy, rx, ry, power = 4) {
  const n = Math.max(1, power);
  return (px, py) => Math.abs((px - cx) / rx) ** n + Math.abs((py - cy) / ry) ** n <= 1;
}

/**
 * The corners of a regular polygon lying flat, squashed as the three-quarter camera sees it and turned about its upright axis: the top of a hexagonal canister or of a turning cube. Returns [[x, y], ...] for polyIn or g.poly.
 * Arguments: cx, cy (centre); rx, ry (half its width and half its height on screen); sides (how many, default 6); angle (the turn in radians, default 0: one flat side faces the camera).
 */
export function ngonPoints(cx, cy, rx, ry, sides = 6, angle = 0) {
  const n = Math.max(3, Math.round(sides)), pts = [];
  for (let i = 0; i < n; i++) {
    const a = angle + Math.PI / 2 - Math.PI / n + (i * TAU) / n;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// ---- the solid -----------------------------------------------------------------

/**
 * The geometry of an upright solid in three-quarter view, from the shape of its top face: returns { top, wall, body, drop, front, back, facing, shadeOf, h, box } and draws nothing; box is null when the top is empty.
 * Arguments: top (shape test of the top face as seen on screen); h (px the wall drops below the top's front edge); box ([x0, y0, x1, y1]: the area the top face lies in, in pixels). In the result: top, wall, body are shape tests; drop(px, py) is how many rows a wall pixel is below the top's front edge (0 for the first); front(x) and back(x) are the last and first row of the top face in column x (null outside); facing(px, turn) is 1 where the wall is turned to the light, -1 where it is turned away, 0 where it faces the camera; shadeOf(px, py, { shade, turn, shadow }) names the tone of a wall pixel: 'light', 'base' or 'dark'.
 */
export function solid(top, h, box) {
  const x0 = Math.floor(box[0]), y0 = Math.floor(box[1]), x1 = Math.ceil(box[2]), y1 = Math.ceil(box[3]);
  const n = Math.max(0, x1 - x0), H = Math.max(0, Math.round(h));
  const has = new Uint8Array(n), lo = new Int32Array(n), hi = new Int32Array(n), edge = new Float64Array(n);
  let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
  for (let i = 0; i < n; i++) {
    for (let y = y0; y < y1; y++) {
      if (!top(x0 + i + 0.5, y + 0.5)) continue;
      if (!has[i]) { has[i] = 1; lo[i] = y; }
      hi[i] = y;
    }
    if (!has[i]) continue;
    // where exactly the front edge crosses this column, between the last row inside and the next
    let a = hi[i] + 0.5, b = hi[i] + 1.5;
    for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (top(x0 + i + 0.5, m)) a = m; else b = m; }
    edge[i] = (a + b) / 2;
    ax = Math.min(ax, x0 + i); bx = Math.max(bx, x0 + i); ay = Math.min(ay, lo[i]); by = Math.max(by, hi[i]);
  }
  const col0 = (px) => { const i = Math.floor(px) - x0; return i >= 0 && i < n && has[i] ? i : -1; };
  const wall = (px, py) => { const i = col0(px); if (i < 0) return false; const y = Math.floor(py); return y > hi[i] && y <= hi[i] + H; };
  const body = (px, py) => top(px, py) || wall(px, py);
  const slopeAt = (i) => {
    let a = i, b = i;
    for (let k = 0; k < 2; k++) { if (a > 0 && has[a - 1]) a--; if (b < n - 1 && has[b + 1]) b++; }
    return a === b ? 0 : (edge[b] - edge[a]) / (b - a);
  };
  const facing = (px, turn = 0.22) => { const i = col0(px); if (i < 0) return 0; const s = slopeAt(i); return s > turn ? -1 : s < -turn ? 1 : 0; };
  const shadeOf = (px, py, { shade = 1, turn = 0.22, shadow = [-1, 1] } = {}) => {
    const f = facing(px, turn);
    if (f < 0) return 'dark';
    if (shade > 0 && !body(px + shadow[0] * shade, py + shadow[1] * shade)) return 'dark';
    return f > 0 ? 'light' : 'base';
  };
  return {
    top, wall, body, facing, shadeOf, h: H,
    drop: (px, py) => { const i = col0(px); return i < 0 ? -1 : Math.floor(py) - hi[i] - 1; },
    front: (x) => { const i = col0(x); return i < 0 ? null : hi[i]; },
    back: (x) => { const i = col0(x); return i < 0 ? null : lo[i]; },
    box: bx < ax ? null : [ax, ay, bx + 1, by + H + 1],
  };
}

/**
 * The two ramps of a solid lit from above: { wall, top }, the top face one step lighter than the wall; for a colour too pale to lighten, the wall goes a step darker instead, so the two faces always stay apart by value.
 * Arguments: colour (the solid's colour, '#rrggbb'); topColour (optional: another colour for the top face, used as it is).
 */
export function faceRamps(colour, topColour) {
  let wall = colour, top = topColour ?? tone(colour, 0.85);
  if (!topColour && brightness(top) - brightness(colour) < 0.12) { top = colour; wall = tone(colour, -0.6); }
  return { wall: ramp(wall), top: { light: tone(top, 0.8), base: top, dark: tone(top, -0.5) } };
}

/**
 * Draws an upright solid in three-quarter view from the shape of its top face: the top, lit, and the wall that drops `h` px below it, shaded by the way each part of the wall faces (a box, a drum, a prism). Returns the solid() geometry with the two ramps used ({ ..., ramps }), for adding detail.
 * Arguments: g (the Surface); top (shape test of the top face: rectIn a box, ellipseIn a drum, squircleIn a round-cornered box, polyIn(ngonPoints(...)) a prism); h (px the wall drops); colour (the wall's colour; the top is a step lighter); options { topColour (another colour for the top face), lip (px: a raised light rim round the top face, default 0: only its lit edges are light), shade (px of dark band along the wall's left side and foot, default 1; 2 on things wider than 14 px; 0 none), turn (how steeply the top's front edge must climb or fall, rise over run, before the wall counts as turned to or from the light; default 0.22), box ([x0, y0, x1, y1] the top lies in; default the whole Surface) }.
 */
export function extrude(g, top, h, colour, { topColour, lip = 0, shade = 1, turn = 0.22, box } = {}) {
  const S = solid(top, h, box ?? [0, 0, g.w, g.h]);
  const R = faceRamps(colour, topColour);
  S.ramps = R;
  if (!S.box) return S;
  const [x0, y0, x1, y1] = S.box;
  const packed = { light: g.table.id(R.wall.light), base: g.table.id(R.wall.base), dark: g.table.id(R.wall.dark) };
  const opt = { shade, turn, shadow: g.shadow };
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    if (top(px, py) || !S.wall(px, py)) continue;
    g.data[y * g.w + x] = packed[S.shadeOf(px, py, opt)];
  }
  g.fill(x0, y0, x1, y1, top, { base: R.top.base, light: R.top.light, dark: R.top.base }, { shade: 0, light: lip > 0 ? 0 : 1 });
  if (lip > 0) {
    const ring = (px, py) => top(px, py) && !(top(px - lip, py) && top(px + lip, py) && top(px, py - lip) && top(px, py + lip));
    g.fill(x0, y0, x1, y1, ring, R.top.light);
  }
  return S;
}

// ---- marking a solid -------------------------------------------------------------

/**
 * Shape test for a band round the wall of a solid, a set number of rows below the top's front edge, so it follows the curve of a drum or the corners of a prism: a hoop, a rib, a strap, a painted stripe.
 * Arguments: S (a solid from solid() or extrude()); from (rows below the top's front edge where the band starts, 0 = the first wall row); thick (rows, default 1); options { x0, x1 (keep only columns x0 <= x < x1: a label instead of a full band) }.
 */
export function bandIn(S, from, thick = 1, { x0 = -Infinity, x1 = Infinity } = {}) {
  return (px, py) => {
    if (px < x0 || px >= x1 || !S.wall(px, py)) return false;
    const d = S.drop(px, py);
    return d >= from && d < from + thick;
  };
}

/**
 * Paints part of the wall of a solid in another colour, shaded like the wall itself (dark where it turns from the light and along its left side and foot, light where it turns to the light): a hoop, a label, a painted panel.
 * Arguments: g (the Surface); S (a solid from extrude() or solid()); inside (shape test of what to paint; only wall pixels are touched); colour ('#rrggbb', or a ramp { light, base, dark }); options { shade, turn (as extrude; defaults 1 and 0.22), flat (true: one tone, the colour itself, with no shading) }.
 */
export function wallFill(g, S, inside, colour, { shade = 1, turn = 0.22, flat = false } = {}) {
  if (!S.box) return g;
  const R = typeof colour === 'object' ? colour : ramp(colour);
  const packed = { light: g.table.id(R.light), base: g.table.id(R.base), dark: g.table.id(R.dark) };
  const opt = { shade, turn, shadow: g.shadow };
  const [x0, y0, x1, y1] = S.box;
  for (let y = Math.max(0, y0); y < Math.min(g.h, y1); y++) for (let x = Math.max(0, x0); x < Math.min(g.w, x1); x++) {
    const px = x + 0.5, py = y + 0.5;
    if (!S.wall(px, py) || !inside(px, py)) continue;
    g.data[y * g.w + x] = flat ? packed.base : packed[S.shadeOf(px, py, opt)];
  }
  return g;
}

/**
 * Shape test for slanted stripes inside another shape: hazard tape, a striped label, warning paint. Stripes are counted in whole pixels, so their edges stay crisp.
 * Arguments: inside (the shape test to stripe); options { pitch (px from one stripe to the next, default 4), slant (px a stripe moves sideways per row down, default 1; 0 upright bars; negative leans the other way), duty (share of the pitch that is stripe, default 0.5), phase (px to slide the stripes sideways, default 0) }.
 */
export function stripesIn(inside, { pitch = 4, slant = 1, duty = 0.5, phase = 0 } = {}) {
  const P = Math.max(2, pitch);
  return (px, py) => {
    if (!inside(px, py)) return false;
    const v = Math.floor(px) + Math.round(slant * Math.floor(py)) - phase;
    return (((v % P) + P) % P) < P * duty;
  };
}

// ---- added with batch S14, fix round 2: wear on a wall, a turning cube ----
//
//   wallWear(g, S, p.wear, S.ramps.wall);                                           // dents, scratches and dirt on a drum or a crate
//   const cube = turningCubeIn(6, t);                                               // a data cube turning in place, round (0, 0)
//   hologram(g, placedIn(cube.body, 16, 14), p.glow, { lit: placedIn(cube.lit, 16, 14) });

import { hash } from '../../../motion.js';
import { polyIn } from './surface.js';

// where wallWear puts its marks when seed is 0: across (-1..1) and down (0..1) the wall; d a dent, s a scratch
const WEAR_SPOTS = [[-0.5, 0.16, 'd'], [0.5, 0.74, 'd'], [0.15, 0.45, 's'], [-0.3, 0.86, 's'], [0.62, 0.3, 'd'], [-0.66, 0.58, 's']];

/**
 * Wears the wall of a solid: small dents and short diagonal scratches, then dirt along its foot once the wear passes half. Each mark keeps its place, so more wear adds marks and never moves the ones there.
 * Arguments: g (the Surface); S (a solid from extrude() or solid()); amount (0 new, which draws nothing, to 1 worn out); tones (the wall's ramp { light, base, dark }, as S.ramps.wall, or its colour); options { spots (how many dents and scratches at full wear, default 6), grime (rows of dirt just above the foot, default 2; 0 none), seed (0, the default, is a layout placed by hand; any other whole number scatters the marks another way), mid, half (the column of the wall's middle and how many columns it reaches to each side; default: read from the solid) }.
 */
export function wallWear(g, S, amount, tones, { spots = 6, grime = 2, seed = 0, mid, half } = {}) {
  if (!S.box || !(amount > 0)) return g;
  const R = typeof tones === 'object' ? tones : ramp(tones);
  const cx = mid ?? (S.box[0] + S.box[2] - 1) / 2, reach = (half ?? (S.box[2] - 1 - S.box[0]) / 2) - 1;
  const mark = (x, y, c) => { if (S.wall(x + 0.5, y + 0.5)) g.dot(x, y, c); };
  const worn = Math.round(Math.min(1, amount) * spots);
  for (let i = 0; i < worn; i++) {
    const [u, v, kind] = seed === 0 && i < WEAR_SPOTS.length ? WEAR_SPOTS[i]
      : [hash(i, seed * 64 + 1) * 1.4 - 0.7, 0.1 + hash(i, seed * 64 + 2) * 0.78, hash(i, seed * 64 + 3) < 0.5 ? 'd' : 's'];
    const x = Math.round(cx + u * reach), top = S.front(x);
    if (top === null) continue;
    const y = top + 2 + Math.round(v * Math.max(0, S.h - 4));
    if (kind === 'd') { mark(x, y, R.dark); mark(x + 1, y, R.dark); mark(x, y + 1, R.dark); mark(x + 1, y + 1, R.light); }   // a dent: a shadow with a lit lower lip
    else { mark(x, y, R.light); mark(x + 1, y - 1, R.light); mark(x + 2, y - 2, R.light); }                                    // a scratch: bare metal showing
  }
  if (grime > 0 && amount > 0.5) {
    const foot = bandIn(S, S.h - 1 - grime, grime);
    wallFill(g, S, (px, py) => foot(px, py) && hash(Math.floor(px) + seed * 64, Math.floor(py) + 31) < amount * 0.7, R.dark, { flat: true });
  }
  return g;
}

/**
 * Shape tests for a cube turning about its upright axis in three-quarter view, round (0, 0): { body, lit, top, wall }, where lit is its top face and the upright edge of the corner nearest the camera. Draws nothing.
 * Arguments: R (half its width from corner to corner, in px); t (the turn: a quarter turn, after which a cube looks the same, per whole number, so t and t + 1 are one picture; 0 has a corner to the camera and shows three faces, 0.5 is face-on and shows two); options { squash (how flat the camera sees the top face: half its depth on screen as a share of R, default 0.5), height (the wall as a share of R, default 0.95), lift (how far the middle of the top face sits above (0, 0), as a share of R; the default 0.45 puts the middle of the default cube on (0, 0)) }.
 */
export function turningCubeIn(R, t, { squash = 0.5, height = 0.95, lift = 0.45 } = {}) {
  const corners = ngonPoints(0, -R * lift, R, R * squash, 4, (Math.PI / 2) * (t - Math.floor(t) + 0.5));
  const box = [-R - 1, Math.min(-R - 2, -R * (lift + squash) - 1), R + 1, Math.max(R + 2, R * (squash - lift) + 1)];
  const S = solid(polyIn(corners), Math.round(R * height), box);
  const [nx, ny] = corners.reduce((a, b) => (b[1] > a[1] ? b : a));                    // the corner nearest the camera
  const edge = (px, py) => Math.floor(px) === Math.floor(nx) && py > ny && S.wall(px, py);
  return { body: S.body, top: S.top, wall: S.wall, lit: (px, py) => S.top(px, py) || edge(px, py) };
}
