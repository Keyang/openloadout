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

import { ramp, tone, brightness } from './color.js';

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



