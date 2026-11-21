// Shape tests beyond the four basic ones in surface.js (ellipseIn, capsuleIn, polyIn, rectIn):
// ways to place, turn and inset any test, and the shapes small objects are made of
// (ring, heart, star, cut gem, feathered wing, corked bottle). Each returns inside(px, py), so it
// goes straight into g.fill(...) or g.blob([...]); nothing here draws. Pure functions: Node and browser.
//
//   import { placedIn, heartIn, starIn, insetIn } from '../engine/shapes.js';
//   const key = placedIn([ringIn(0, -7, 4.5, 2), rectIn(-1, -3, 2, 12)], 16, 16, { angle: -0.7 });   // drawn upright, then tilted
//   g.blob([key], ramp(p.metal), { light: 1 });
//   const star = starIn(16, 16, 9, 5);                                // a point at the top
//   g.fill(0, 0, 32, 32, insetIn(star, 2), tone(p.body, -0.25));      // the sunken field inside a bevelled rim
//
// Conventions: x grows right, y grows down, sizes are in pixels. An angle here turns a shape clockwise
// on screen, in radians. For shapes that must come out symmetrical, give an even width a whole-number
// centre and an odd width a centre ending in .5.

import { polyIn, ellipseIn, rectIn, capsuleIn } from './surface.js';

const list = (t) => (Array.isArray(t) ? t : [t]);
const any = (tests) => (tests.length === 1 ? tests[0] : (px, py) => { for (const f of tests) if (f(px, py)) return true; return false; });

// ---- placing ------------------------------------------------------------------

/**
 * Shape tests drawn upright around (0, 0), then scaled, turned and moved to (cx, cy): a tilted key, a squashed gem, a rocking charm.
 * Arguments: tests (one shape test or a list, joined); cx, cy (where (0, 0) goes); options { angle (radians, clockwise on screen), sx, sy (scale across and down, before the turn; sy defaults to sx) }.
 */
export function placedIn(tests, cx, cy, { angle = 0, sx = 1, sy = sx } = {}) {
  const f = any(list(tests));
  const c = Math.cos(angle), s = Math.sin(angle);
  const kx = Math.abs(sx) < 1e-6 ? 1e-6 : sx, ky = Math.abs(sy) < 1e-6 ? 1e-6 : sy;
  return (px, py) => {
    const dx = px - cx, dy = py - cy;
    return f((dx * c + dy * s) / kx, (dy * c - dx * s) / ky);
  };
}

/**
 * A shape test shrunk by `d` pixels on every side: the cavity inside a glass wall, the sunken field inside a raised rim.
 * Arguments: test (a shape test); d (pixels to take off each side, default 1).
 */
export function insetIn(test, d = 1) {
  return (px, py) => test(px, py) && test(px - d, py) && test(px + d, py) && test(px, py - d) && test(px, py + d);
}

/**
 * A flat badge around (0, 0) turned about its upright axis, as a coin spins: returns { face, body, x, squeeze }, where body is face plus the edge band.
 * Arguments: test (the badge seen face-on, a shape test around (0, 0)); angle (the turn in radians: 0 face-on, PI / 2 edge-on); thick (thickness of the badge in pixels, default 2).
 */
export function turnedIn(test, angle, thick = 2) {
  const c = Math.cos(angle), s = Math.sin(angle);
  const k = Math.max(Math.abs(c), 1e-3);
  const f = (thick / 2) * s, lo = Math.min(-f, f), hi = Math.max(-f, f);
  const x = c >= 0 ? f : -f;                                    // the face we see slides to the side that turns towards us
  return {
    x, squeeze: Math.abs(c),
    face: (px, py) => test((px - x) / k, py),
    body: (px, py) => test((px - Math.min(Math.max(px, lo), hi)) / k, py),
  };
}

// ---- shapes -------------------------------------------------------------------

/**
 * Shape test for a ring: a circle line `thick` pixels wide whose outer edge has radius r.
 * Arguments: cx, cy (centre); r (outer radius); thick (width of the line, default 1).
 */
export function ringIn(cx, cy, r, thick = 1) {
  const o = r * r, i = Math.max(0, r - thick) ** 2;
  return (px, py) => { const d = (px - cx) ** 2 + (py - cy) ** 2; return d <= o && d > i; };
}

// unit hearts: u across (0 at the middle, 1 at the widest point), v down (-1 top of the lobes, 1 the tip)
const HEART_UNIT = {
  // two tall round lobes with a deep notch; the sides run straight from where they leave the lobes to the tip
  classic: (u, v) => ((u - 0.5) / 0.5) ** 2 + ((v + 0.4) / 0.6) ** 2 <= 1 || (v >= -0.4 && v < -0.1 && u <= 0.92) || (v >= -0.1 && u <= 0.836 * (1 - v)),
  // bigger lobes, a shallow notch and sides that bow outwards to a blunt tip
  round: (u, v) => ((u - 0.46) / 0.56) ** 2 + ((v + 0.32) / 0.68) ** 2 <= 1 || (v >= -0.32 && v <= 1 && u <= 1.02 * (1 - ((v + 0.32) / 1.32) ** 2.2)),
};

// the stepped heart of an 8-bit game, in 2 px blocks: two humps, two or three full rows, then one block less on each side per row
function blockHeart(cx, cy, w) {
  const N = Math.max(6, 2 * Math.round(w / 4)), F = N >= 8 ? 3 : 2, M = F + N / 2, x0 = cx - N, y0 = cy - M;
  return (px, py) => {
    const c = Math.floor((px - x0) / 2), r = Math.floor((py - y0) / 2);
    if (c < 0 || c >= N || r < 0 || r >= M) return false;
    const d = Math.min(c, N - 1 - c);                            // blocks in from the nearer side
    return r === 0 ? d >= 1 && d <= N / 2 - 2 : r <= F || d >= r - F;
  };
}

/**
 * Shape test for a heart w wide and h tall centred on (cx, cy), in one of four styles.
 * Arguments: cx, cy (centre of its bounding box); w, h (width and height in pixels); style ('classic', 'round', 'pixel' or 'crystal': see HEART_STYLES; default 'classic'). The pixel heart is built of 2 px blocks: its width snaps to 12, 16, 20... and its height follows (10, 14, 16...), so give it whole-number cx and cy.
 */
export function heartIn(cx, cy, w, h, style = 'classic') {
  const a = w / 2, b = h / 2;
  if (style === 'crystal') return gemIn(cx, cy, a, b, 'heart');
  if (style === 'pixel') return blockHeart(cx, cy, w);
  const unit = HEART_UNIT[style] ?? HEART_UNIT.classic;
  return (px, py) => unit(Math.abs(px - cx) / a, (py - cy) / b);
}

const STAR_INNER = { 3: 0.3, 4: 0.4, 5: 0.46, 6: 0.56, 7: 0.6, 8: 0.64 };

/**
 * The corner points of a star with sharp straight points, the first one pointing up: [[x, y], ...], twice as many as it has points.
 * Arguments: cx, cy (centre); r (radius to the tips); points (how many, default 5); options { inner (radius of the inside corners as a share of r; default by point count), angle (turn, radians clockwise) }.
 */
export function starPoints(cx, cy, r, points = 5, { inner, angle = 0 } = {}) {
  const k = inner ?? STAR_INNER[points] ?? 0.6;
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = angle - Math.PI / 2 + (i * Math.PI) / points, d = i % 2 ? r * k : r;
    pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
  }
  return pts;
}

/**
 * Shape test for a star with sharp straight points, the first one pointing up.
 * Arguments: cx, cy (centre); r (radius to the tips); points (how many, default 5); options { inner (share of r for the inside corners), angle (turn, radians clockwise) }.
 */
export function starIn(cx, cy, r, points = 5, opt = {}) {
  return polyIn(starPoints(cx, cy, r, points, opt));
}

// Gem cuts in unit space: x and y from -1 to 1 (y down). `outline` is the silhouette ('ellipse' for a round stone);
// `facets` cover it, each with a tone for light from the top right: 2 = the hard highlight, 1 = light, 0 = base, -1 = dark.
const octagon = (k, c = 0.42) => [[-1 + c, -1], [1 - c, -1], [1, -1 + c], [1, 1 - c], [1 - c, 1], [-1 + c, 1], [-1, 1 - c], [-1, -1 + c]].map(([x, y]) => [x * k, y * k]);
const CUTS = {
  // a brilliant seen from the side: flat table, slanted crown, long point below
  diamond: {
    outline: [[-0.5, -1], [0.5, -1], [1, -0.3], [0, 1], [-1, -0.3]],
    facets: [
      { tone: 0, pts: [[-1, -0.3], [-0.5, -1], [-0.36, -0.3]] },
      { tone: 1, pts: [[-0.5, -1], [0.5, -1], [0.36, -0.3], [-0.36, -0.3]] },
      { tone: 2, pts: [[0.5, -1], [1, -0.3], [0.36, -0.3]] },
      { tone: -1, pts: [[-1, -0.3], [-0.36, -0.3], [0, 1]] },
      { tone: 0, pts: [[-0.36, -0.3], [0.36, -0.3], [0, 1]] },
      { tone: 1, pts: [[0.36, -0.3], [1, -0.3], [0, 1]] },
    ],
  },
  // a step cut seen from above: a long eight-sided stone with a flat table and four bevels
  emerald: (() => {
    const o = [[-0.5, -1], [0.5, -1], [1, -0.62], [1, 0.62], [0.5, 1], [-0.5, 1], [-1, 0.62], [-1, -0.62]];
    const i = [[-0.28, -0.56], [0.28, -0.56], [0.5, -0.36], [0.5, 0.36], [0.28, 0.56], [-0.28, 0.56], [-0.5, 0.36], [-0.5, -0.36]];
    const band = (a, b) => [o[a], o[b], i[b], i[a]];
    return {
      outline: o,
      facets: [
        { tone: 0, pts: i },
        { tone: 1, pts: band(0, 1) }, { tone: 2, pts: band(1, 2) }, { tone: 1, pts: band(2, 3) }, { tone: 0, pts: band(3, 4) },
        { tone: -1, pts: band(4, 5) }, { tone: -1, pts: band(5, 6) }, { tone: -1, pts: band(6, 7) }, { tone: 0, pts: band(7, 0) },
      ],
    };
  })(),
  // a brilliant seen from above: a round stone, an eight-sided table and eight kites round it
  round: (() => {
    const i = octagon(0.5), far = octagon(1.5);
    const tones = [1, 2, 1, 0, -1, -1, -1, 0];                  // from the top edge, clockwise
    return {
      outline: 'ellipse',
      facets: [{ tone: 0, pts: i }, ...tones.map((tone, n) => ({ tone, pts: [i[n], i[(n + 1) % 8], far[(n + 1) % 8], far[n]] }))],
    };
  })(),
  // a rough crystal splinter: a leaning six-sided spike with a ridge down its middle
  shard: {
    outline: [[0.12, -1], [0.72, -0.42], [0.62, 0.5], [0.05, 1], [-0.6, 0.55], [-0.7, -0.3]],
    facets: [
      { tone: 0, pts: [[0.12, -1], [0.05, -0.1], [-0.7, -0.3]] },
      { tone: 2, pts: [[0.12, -1], [0.72, -0.42], [0.05, -0.1]] },
      { tone: 1, pts: [[0.72, -0.42], [0.62, 0.5], [0.05, 1], [0.05, -0.1]] },
      { tone: -1, pts: [[-0.7, -0.3], [0.05, -0.1], [0.05, 1], [-0.6, 0.55]] },
    ],
  },
  // a heart cut: straight edges, a table across the top and a long point
  heart: {
    outline: [[0, -0.5], [0.34, -1], [0.74, -1], [1, -0.56], [1, -0.12], [0, 1], [-1, -0.12], [-1, -0.56], [-0.74, -1], [-0.34, -1]],
    facets: [
      { tone: 1, pts: [[0, -0.5], [-0.34, -1], [-0.74, -1], [-1, -0.56], [-1, -0.12], [-0.4, -0.12]] },
      { tone: 2, pts: [[0, -0.5], [0.34, -1], [0.74, -1], [1, -0.56], [0.4, -0.12]] },
      { tone: 1, pts: [[1, -0.56], [1, -0.12], [0.4, -0.12]] },
      { tone: 0, pts: [[0, -0.5], [0.4, -0.12], [0, 1], [-0.4, -0.12]] },
      { tone: -1, pts: [[-1, -0.12], [-0.4, -0.12], [0, 1]] },
      { tone: 1, pts: [[0.4, -0.12], [1, -0.12], [0, 1]] },
    ],
  },
};

/** The gem cuts gemIn and gemFacets accept: diamond, emerald, round, shard, heart. No arguments: a frozen list. */
export const GEM_CUTS = Object.freeze(Object.keys(CUTS));

/**
 * Shape test for the silhouette of a cut gem that fills the box cx ± rx, cy ± ry.
 * Arguments: cx, cy (centre); rx, ry (half its width and height in pixels); cut (one of GEM_CUTS, default 'diamond').
 */
export function gemIn(cx, cy, rx, ry, cut = 'diamond') {
  const C = CUTS[cut] ?? CUTS.diamond;
  if (C.outline === 'ellipse') return ellipseIn(cx, cy, rx, ry);
  return polyIn(C.outline.map(([x, y]) => [cx + x * rx, cy + y * ry]));
}

/**
 * The facets of a cut gem as polygons with a tone each, for light from the top right: [{ pts, tone }], tone 2 (hard highlight), 1 (light), 0 (base) or -1 (dark).
 * Arguments: cx, cy (centre); rx, ry (half its width and height in pixels); cut (one of GEM_CUTS, default 'diamond'). Facets may reach past the silhouette: clip them with gemIn.
 */
export function gemFacets(cx, cy, rx, ry, cut = 'diamond') {
  const C = CUTS[cut] ?? CUTS.diamond;
  return C.facets.map((f) => ({ tone: f.tone, pts: f.pts.map(([x, y]) => [cx + x * rx, cy + y * ry]) }));
}

/** The bottle shapes bottleIn accepts: round (a ball with a neck), tall (straight sides, round shoulders), flask (a cone with a wide foot), vial (a thin tube). No arguments: a frozen list. */
export const BOTTLE_SHAPES = Object.freeze(['round', 'tall', 'flask', 'vial']);

/**
 * A corked bottle h pixels tall standing upright around (0, 0), in whole pixels: returns { glass, cork, shine, fill: [top, bottom], half }.
 * Arguments: h (total height with the cork, a whole number of pixels, 12 or more); shape (one of BOTTLE_SHAPES, default 'round'). glass, cork and shine (where the highlight on the glass goes) are shape tests; fill is the highest and lowest y a liquid may reach; half is half the widest width. Even widths: put x = 0 on a whole pixel.
 */
export function bottleIn(h, shape = 'round') {
  const k = h / 21;
  const corkH = Math.max(2, Math.round(2 * k)), lipH = 1, neckH = Math.max(2, Math.round(4 * k));
  const top = -h / 2, bodyH = h - corkH - lipH - neckH;
  const yLip = top + corkH, yNeck = yLip + lipH, yBody = yNeck + neckH, bottom = h / 2;
  let nw = Math.max(1, Math.round(2 * k));                       // half the width of the neck and of the cork in it
  let body, half, fillTop, shine;
  if (shape === 'tall') {
    half = Math.max(nw + 2, Math.round(5 * k));
    const sh = Math.min(3, Math.floor(bodyH / 3));               // the height of the round shoulders
    body = [ellipseIn(0, yBody + sh, half, sh), rectIn(-half, yBody + sh, 2 * half, bodyH - sh - 1), rectIn(-half + 1, bottom - 1, 2 * half - 2, 1)];
    fillTop = yBody + sh;
    shine = rectIn(half - 3, yBody + sh + 1, 1, Math.max(2, Math.round(bodyH * 0.4)));
  } else if (shape === 'flask') {
    half = Math.max(nw + 3, Math.round(7.5 * k));
    // one half of the cone, mirrored, so that both sides come out the same
    const side = polyIn([[-1, yBody - 0.5], [nw, yBody - 0.5], [half, bottom - 2.5], [half, bottom - 1], [half - 1, bottom], [-1, bottom]]);
    body = [(px, py) => side(Math.abs(px), py)];
    fillTop = yBody + 1;
    // the highlight runs down the inside of the right wall
    const wall = (y) => nw + ((half - nw) * (y - yBody + 0.5)) / (bottom - 2 - yBody), ya = yBody + 2.5, yb = Math.max(ya + 2, bottom - 5.5);
    shine = capsuleIn(wall(ya) - 2, ya, wall(yb) - 2.5, yb, 0.6);
  } else if (shape === 'vial') {
    half = Math.max(3, Math.round(3.5 * k)); nw = half - 1;
    body = [rectIn(-half, yNeck, 2 * half, h - corkH - lipH - half), ellipseIn(0, bottom - half, half, half)];
    fillTop = yNeck + 2;
    shine = rectIn(half - 2, yNeck + 2, 1, Math.max(3, Math.round((bottom - yNeck) * 0.45)));
  } else {
    half = Math.floor(bodyH / 2);
    body = [ellipseIn(0, bottom - half, half, half), rectIn(-nw, yBody, 2 * nw, bodyH - 2 * half + 1)];
    fillTop = bottom - 2 * half + 2;
    shine = any([rectIn(Math.round(half * 0.5), bottom - 2 * half + Math.round(half * 0.45), 1, Math.max(2, Math.round(half * 0.55))), rectIn(Math.round(half * 0.5) - 1, bottom - half + 1, 1, 1)]);
  }
  const lipW = shape === 'vial' ? half + 1 : nw + 1;
  const cork = rectIn(-nw, top, 2 * nw, corkH + 1);
  const glass = any([rectIn(-lipW, yLip, 2 * lipW, lipH), rectIn(-nw, yNeck, 2 * nw, neckH + 1), ...body]);
  return { glass, cork, fill: [fillTop, bottom - 1], half: Math.max(half, lipW), shine };
}

// ---- sign shapes (batch S16) ----------------------------------------------------------------
// The flat shapes that signs, status marks and badges are made of.

/**
 * Shape test for a straight arrow from a tail point to a tip: a shaft of even width and a triangular head.
 * Arguments: x0, y0 (the tail); x1, y1 (the tip); options { shaft (width of the shaft, default 3; 0 for a head alone), head (width of the head across, default 8), long (length of the head, default 6), notch (how far the back of the head is cut in towards the tip, for barbs; default 0) }.
 */
export function arrowIn(x0, y0, x1, y1, { shaft = 3, head = 8, long = 6, notch = 0 } = {}) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1e-6, ux = dx / L, uy = dy / L;
  const at = (along, across) => [x0 + ux * along - uy * across, y0 + uy * along + ux * across];
  const base = Math.max(0, L - long), cut = Math.min(notch, long * 0.8), half = shaft / 2;
  const stem = shaft > 0 ? polyIn([at(0, -half), at(base + cut + 0.5, -half), at(base + cut + 0.5, half), at(0, half)]) : null;
  const tip = polyIn([at(L, 0), at(base, head / 2), at(base + cut, 0), at(base, -head / 2)]);
  return (px, py) => tip(px, py) || (stem !== null && stem(px, py));
}

/**
 * Shape test for a plus sign centred on (cx, cy): two bars of even width crossing at their middles.
 * Arguments: cx, cy (centre); size (length of each bar); thick (width of each bar, default a third of size).
 */
export function crossIn(cx, cy, size, thick = size / 3) {
  const a = size / 2, b = thick / 2;
  return (px, py) => { const x = Math.abs(px - cx), y = Math.abs(py - cy); return (x < a && y < b) || (x < b && y < a); };
}

/**
 * Shape test for a hexagon standing on a point, with flat sides left and right and slanted edges that step two pixels along for one up: a badge, a cell, a plate.
 * Arguments: cx, cy (centre: whole numbers for an even width and height); w (width between the flat sides); h (height between the two points; the slanted edges rise w / 4, so h about 1.1 times w looks regular).
 */
export function hexIn(cx, cy, w, h) {
  const a = w / 2, b = h / 2;
  return (px, py) => { const x = Math.abs(px - cx), y = Math.abs(py - cy); return x < a && y + x / 2 < b + 0.25; };
}

/**
 * Shape test for a hoop: the band between an ellipse and a smaller one inside it, the same width all round: a ring seen at an angle.
 * Arguments: cx, cy (centre); rx, ry (outer radii); thick (width of the band, default 2; as much as the smaller radius or more fills the hoop).
 */
export function hoopIn(cx, cy, rx, ry, thick = 2) {
  const ix = rx - thick, iy = ry - thick, open = ix > 0 && iy > 0;
  return (px, py) => {
    const x = px - cx, y = py - cy;
    return (x / rx) ** 2 + (y / ry) ** 2 <= 1 && !(open && (x / ix) ** 2 + (y / iy) ** 2 <= 1);
  };
}

/**
 * Shape test for several copies of one shape spaced evenly round a centre: the arms of a cross-hair, the spokes of a wheel, the petals of a flower. Four copies come out exactly symmetrical.
 * Arguments: test (a shape test drawn around (0, 0); a copy that points up is the first); cx, cy (the centre they turn about); count (how many copies, default 4); angle (turns them all, radians clockwise on screen, default 0).
 */
export function spunIn(test, cx, cy, count = 4, angle = 0) {
  const n = Math.max(1, Math.round(count));
  const snap = (v) => (Math.abs(v) < 1e-12 ? 0 : Math.abs(v - 1) < 1e-12 ? 1 : Math.abs(v + 1) < 1e-12 ? -1 : v);
  const turns = [];
  for (let k = 0; k < n; k++) { const a = angle + (k * 2 * Math.PI) / n; turns.push([snap(Math.cos(a)), snap(Math.sin(a))]); }
  return (px, py) => {
    const dx = px - cx, dy = py - cy;
    for (const [c, s] of turns) if (test(dx * c + dy * s, dy * c - dx * s)) return true;
    return false;
  };
}

/**
 * Shape test for a tapering spike standing upright, tip at the top: a floor spike, fang, horn, thorn, crystal point or stalagmite; two small functions give its outline, so it can be a straight cone, a curved tusk or a hooked thorn (turn it with placedIn to point it another way).
 * Arguments: xc (the column its foot is centred on: ending in .5 for a one-pixel tip, a whole number for a two-pixel one); tipY, footY (the rows where it starts and ends, footY below tipY); half (k => half its width in px, with k running from 0 at the tip to 1 at the foot; or a number: a straight cone that many px to each side at the foot); shift (k => px its middle is moved sideways at k, 0 at the foot; or a number: the tip is that far to the side and the spike curves back to stand on xc; default 0); shank (px it carries on below footY at its foot width, for the part still in its slot or socket; default 0).
 */
export function spikeIn(xc, tipY, footY, half, shift = 0, shank = 0) {
  const long = Math.max(1e-6, footY - tipY);
  const wide = typeof half === 'function' ? half : (k) => 0.5 + (half - 0.5) * k;
  const off = typeof shift === 'function' ? shift : (k) => shift * (1 - k) ** 2;
  return (px, py) => {
    if (py < tipY || py >= footY + shank) return false;
    const k = Math.min(1, (py - tipY) / long), mid = xc + off(k), w = wide(k);
    return px >= mid - w && px <= mid + w;
  };
}

/**
 * A shape test kept only inside a box: the upper half of a rounded box (a domed lid), one strap's width of a body, a single row of a shape.
 * Arguments: test (a shape test); x0, y0, x1, y1 (the box: a point stays inside only when x0 <= px < x1 and y0 <= py < y1; pass -Infinity or Infinity for a side with no limit).
 */
export function clippedIn(test, x0, y0, x1, y1) {
  return (px, py) => px >= x0 && px < x1 && py >= y0 && py < y1 && test(px, py);
}

// ---- measuring, and a skull (batch P11, fix round 1) ---------------------------------------------

/**
 * The box of pixels that shape tests cover in a frame, found without drawing them: { x0, y0, x1, y1 } (whole pixels, both ends included), or null when they cover none.
 * Arguments: tests (one shape test or a list, measured as one shape); w, h (the size of the frame to look in; h defaults to w). Use it to centre a turned or odd-shaped thing, or to keep its biggest look inside the frame.
 */
export function boundsOf(tests, w, h = w) {
  const f = any(list(tests));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!f(x + 0.5, y + 0.5)) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * The pixels of a shape that lie along one of its sides: the far edge of a top face, the lip where a dome meets its wall, the lit rim of a hole.
 * Arguments: test (a shape test); dx, dy (which side, as the step from a pixel to its neighbour outside the shape: 0, -1 is the top edge, the default; 0, 1 the bottom; -1, 0 the left; 1, 0 the right; a bigger step gives a thicker edge only on a shape at least that thick).
 */
export function edgeIn(test, dx = 0, dy = -1) {
  return (px, py) => test(px, py) && !test(px + dx, py + dy);
}

/**
 * A shape test with pixels taken off chosen sides only (insetIn takes the same off every side): a top face without its far and near edge rows, a plate without its left column.
 * Arguments: test (a shape test); sides { left, right, top, bottom } (pixels to take off each side, default 0).
 */
export function trimmedIn(test, { left = 0, right = 0, top = 0, bottom = 0 } = {}) {
  return (px, py) => test(px, py) && (!left || test(px - left, py)) && (!right || test(px + right, py)) && (!top || test(px, py - top)) && (!bottom || test(px, py + bottom));
}

// ---- joining tests, and an arched opening (batch P04, fix round 1: wall torch, wooden door) ----------------
//
//   g.fill(0, 0, g.w, g.h, anyIn(rectIn(12, 28, 8, 13), ellipseIn(16, 28, 4, 2.5), ellipseIn(16, 41, 4, 2.5)), metal);   // a plate with round ends
//   const hole = archIn(14, 34, 12, 20, 60), frame = archIn(14, 34, 12, 20, 60, 4, 5);    // a doorway, and the stone frame round it
//   g.blob([frame], stone, { shade: 2, light: 1 }); g.fill(0, 0, g.w, g.h, hole, dark, { outline: INK });

/**
 * Joins several shape tests into one: a point is inside when any of them has it (a plate with rounded ends, a body built of overlapping parts).
 * Arguments: ...tests (shape tests, or lists of shape tests, in any mix; with none at all the result is never inside).
 */
export function anyIn(...tests) {
  const all = tests.flat(Infinity);
  return (px, py) => { for (const f of all) if (f(px, py)) return true; return false; };
}

/**
 * Shape test for an arched opening: straight sides from a springing line down to its foot, and a half ellipse over them (a doorway, a window, a niche, a gate); grown, it is the outside of the frame round that opening.
 * Arguments: x0, x1 (the left and right edges of the opening: inside is x0 <= px < x1); top (the top edge: the crown of the arch); spring (the row the arch springs from: straight-sided from there down; at or above `top` gives a flat-topped box); bottom (the bottom edge: inside is py < bottom); grow (px added on each side, for a frame that thick; default 0); head (px added at the top, default the same as grow). The foot does not grow: a frame stands on the same line as its opening.
 */
export function archIn(x0, x1, top, spring, bottom, grow = 0, head = grow) {
  const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2 + grow, rise = spring - top, ry = rise + head;
  return (px, py) => {
    if (px < x0 - grow || px >= x1 + grow || py >= bottom || py < top - head) return false;
    return !(rise > 0) || py >= spring || ((px - cx) / rx) ** 2 + ((py - spring) / ry) ** 2 <= 1;
  };
}

// ---- combining and measuring (batch S20, fix round 1) ---------------------------------------------

/**
 * A shape test for what several shape tests share: the part of a body that is lit, a mark kept inside a plate, one half of an outline.
 * Arguments: ...tests (shape tests, each inside(px, py); a point is inside only when it is inside every one of them; with none given, every point is inside).
 */
export function allIn(...tests) {
  return (px, py) => { for (const f of tests) if (!f(px, py)) return false; return true; };
}

/**
 * A shape test turned inside out: everything a shape test leaves out (pair it with allIn to cut one shape out of another).
 * Arguments: test (a shape test, inside(px, py)).
 */
export function notIn(test) {
  return (px, py) => !test(px, py);
}

/**
 * How near to a point and how far from it shape tests come, found without drawing them: { near, far } (distances in pixels from the point to the middles of the nearest and the farthest covered pixel), or null when they cover none.
 * Arguments: tests (one shape test or a list, measured as one shape); cx, cy (the point to measure from); w, h (the size of the frame to look in; h defaults to w). Use it to put a ring round a shape (radius above far) or inside its opening (radius below near).
 */
export function reachOf(tests, cx, cy, w, h = w) {
  const f = any(list(tests));
  let near = Infinity, far = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!f(x + 0.5, y + 0.5)) continue;
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < near) near = d; if (d > far) far = d;
  }
  return far < 0 ? null : { near, far };
}

/**
 * A shape test grown by `d` pixels on every side, corners included: the clear margin to keep round a shape, or a way to ask whether a pixel touches it (the partner of insetIn).
 * Arguments: test (a shape test, inside(px, py)); d (whole pixels to add on each side, default 1; 0 gives the shape back).
 */
export function grownIn(test, d = 1) {
  const n = Math.max(0, Math.round(d));
  return (px, py) => {
    for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) if (test(px + x, py + y)) return true;
    return false;
  };
}

/**
 * Shape test for a straight bar drawn the pixel-art way: one pixel per column (per row when it is steep), stepping sideways after equal runs that start full at its first pixel, and the same number of pixels in every column (or row), so a slanted bar keeps one thickness and has no lumps.
 * Arguments: x, y (the pixel it starts on, whole numbers); dx, dy (the way it runs and how far, in pixels: it covers round(|dx|) columns, or round(|dy|) rows when across is true, and never fewer than one); count (pixels in each column or row, default 1); grow (which way they are added from the line of first pixels: 1 down, or right when across; -1 up, or left; default 1); across (false: one pixel per column, thickened up or down, for a bar nearer level than upright; true: one per row, thickened left or right; default: whichever suits the slope, and an exact diagonal counts as level).
 */
export function strokeIn(x, y, dx, dy, count = 1, grow = 1, across = Math.abs(dy) > Math.abs(dx)) {
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const n = Math.max(1, Math.round(across ? ady : adx)), slope = across ? adx / Math.max(ady, 1e-9) : ady / Math.max(adx, 1e-9);
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1, k = Math.max(1, Math.round(count)), g = grow < 0 ? -1 : 1;
  return (px, py) => {
    const cx = Math.floor(px) - x, cy = Math.floor(py) - y;      // the pixel, counted from the first one
    const i = across ? cy * sy : cx * sx;                         // how far along the bar it is
    if (i < 0 || i >= n) return false;
    const side = Math.floor(i * slope + 1e-9);                    // how far the bar has stepped sideways by then
    const j = across ? (cx - side * sx) * g : (cy - side * sy) * g;
    return j >= 0 && j < k;
  };
}

/**
 * Shape test for two bars that meet at a tip (an L, a V, a corner bracket, an arrow head), clean in pixels whichever way it is turned: both arms are strokeIn bars that start on the tip pixel and thicken towards the inside of the corner, so one piece can be drawn at several turns and keep its shape.
 * Arguments: x, y (the middle of the tip pixel, the outermost pixel of the corner; it is snapped to the grid, and a tip that falls exactly between two pixels gives each arm its own, for a piece that must mirror); ax, ay and bx, by (the way each arm runs from the tip and how long it is, in pixels); thick (how thick the arms are, measured square across them: the pixels per column or row are worked out from it, so a slanted arm weighs what a level one does; default 2); count (pixels per column or row instead, the same at every slope; default 0: work it out from thick).
 */
export function cornerIn(x, y, ax, ay, bx, by, thick = 2, count = 0) {
  const snap = (v) => Math.round(v * 1e6) / 1e6;
  const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
  const mx = ax / la + bx / lb, my = ay / la + by / lb;          // the line down the middle of the corner
  const arm = (ux, uy, len, ox, oy) => {
    const adx = Math.abs(ux), ady = Math.abs(uy);
    // an exact diagonal is thickened along the middle line, which keeps the tip sharp; any other arm across its own slope
    const across = Math.abs(adx - ady) < 1e-6 * len ? Math.abs(mx) > Math.abs(my) + 1e-9 : ady > adx;
    const turn = ux * oy - uy * ox, nx = turn >= 0 ? -uy : uy, ny = turn >= 0 ? ux : -ux;      // square to this arm, towards the other one
    const k = count > 0 ? count : Math.max(1, Math.round((thick * len) / Math.max(adx, ady)));
    return strokeIn(Math.floor(snap(x + (0.01 * ux) / len)), Math.floor(snap(y + (0.01 * uy) / len)), ux, uy, k, (across ? nx : ny) < 0 ? -1 : 1, across);
  };
  const a = arm(ax, ay, la, bx, by), b = arm(bx, by, lb, ax, ay);
  return (px, py) => a(px, py) || b(px, py);
}
