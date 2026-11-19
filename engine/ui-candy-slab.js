// Candy slab (added with batch K12 fix round 1, bundles/specs/core-sprites-2.md): the round corners, the style marks
// (jelly gloss, rim stripes, icing and drips), the highlight bubble and the sprinkles of a candy interface piece, drawn
// over a slab engine/ui-skins.js has already drawn (skinButton, skinTab, skinPanel, skinTooltip with skin 'candy').
// The helpers' corners go to 4 px at most and their candy marks are a few corner pixels; these make a candy piece read
// as a round, glossy sweet at 1x while keeping it nine-sliceable.
//
//   const out = skinButton(g, 1, 1, 94, 30, 'normal', 'candy', { ...look, cornerPx: 0, shine: false });
//   const slab = roundSlab(g, out.body, candyCuts(p.corner), { below: 2 });           // below: the button's lip
//   candyStyle(g, slab, p.style, { keep, stripe, glossHi, glossLo, icing: '#ffffff' });
//   if (p.shine) candyBubble(g, slab, { keep, white: '#ffffff', soft: glossHi });
//
// A slab is ring-painted: depth 1 is the outer ink, then the band, then an inner ink, then the face (`rings` is the
// depth of that inner ink, found on the slab itself). roundSlab redraws each corner square (`zone` px) from the
// slab's own straight edges, so the rings follow the new outline and every decoration the helper put in a corner is
// replaced. `keep` is the stretched middle ({ x, y, w, h }, in frame pixels): nothing these draw that varies along a
// side lies in it, except the stripes, which repeat every 3 px along the whole rim.

import { col, tone, INK } from './color.js';

/** Corner cut tables of candyCuts, from square to round: row by row, how many pixels each corner loses. No arguments: a frozen list. */
export const CANDY_CUTS = Object.freeze([[], [1], [2, 1], [4, 2, 1], [5, 3, 2, 1], [6, 4, 2, 1]].map((c) => Object.freeze(c)));

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lum = (v) => 0.3 * (v & 255) + 0.59 * ((v >>> 8) & 255) + 0.11 * ((v >>> 16) & 255);

/**
 * The corner cut table for a Corner control value: square at 0, a 1 to 6 px round at 1; 0.75 cuts 5, 3, 2 and 1 px from its first four rows.
 * Arguments: corner (0..1); rows (at most this many rows cut: the next rounder table that fits, for a slice that leaves little room).
 */
export function candyCuts(corner = 0.75, rows = Infinity) {
  let k = Math.round(clamp01(corner) * (CANDY_CUTS.length - 1));
  while (k > 0 && CANDY_CUTS[k].length > rows) k--;
  return CANDY_CUTS[k];
}

// Depth of every pixel of a w x h shape (inside(i, j) in local pixels): 0 outside, 1 on its edge, 2 one in, ...
function depthMap(w, h, inside, max, openBottom) {
  const W = w + 2, H = h + 2 + (openBottom ? max : 0), d = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (inside(i - 1, j - 1)) d[j * W + i] = 1;
  for (let k = 1; k < max; k++) {
    const next = [];
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const n = j * W + i;
      if (d[n] === k && d[n - 1] >= k && d[n + 1] >= k && d[n - W] >= k && d[n + W] >= k) next.push(n);
    }
    for (const n of next) d[n] = k + 1;
  }
  return (i, j) => (i < -1 || j < -1 || i > w || j >= H - 1 ? 0 : d[(j + 1) * W + i + 1]);
}

/**
 * Re-cuts the corners of a ring-painted slab already drawn in `body` to a rounder outline, its band and inner ink following, and returns the slab { body, at(px, py) depth, rings, zone, ink }.
 * Arguments: g; body ({ x, y, w, h }); cuts (a list such as candyCuts gives); opt { corners ([top left, top right, bottom right, bottom left]), bottomCuts (the bottom corners' table, default cuts), below (rows of lip under the body), openBottom (a tab), zone (corner square, default 7) }.
 */
export function roundSlab(g, body, cuts, { corners = [true, true, true, true], bottomCuts = cuts, below = 0, openBottom = false, zone = 7 } = {}) {
  const { x, y, w, h } = body, Z = zone, orig = g.data.slice();
  const px0 = (i, j) => orig[(y + j) * g.w + x + i] ?? 0;
  // the rings, measured down the middle column: the outer ink, the band, the inner ink
  const mid = w >> 1, inkV = px0(mid, 0);
  let r = 1; while (r < h && px0(mid, r) !== inkV) r++;
  const rings = r + 1;
  const cut = (i, j) => {
    for (const [k, left, top] of [[0, true, true], [1, false, true], [2, false, false], [3, true, false]]) {
      if (!corners[k]) continue;
      const dx = left ? i : w - 1 - i, dy = top ? j : h - 1 - j, c = top ? cuts : bottomCuts;
      if (dy >= 0 && dy < c.length && dx >= 0 && dx < c[dy]) return true;
    }
    return false;
  };
  const at = depthMap(w, h, (i, j) => i >= 0 && j >= 0 && i < w && (j < h || openBottom) && !cut(i, j), 8, openBottom);
  const lipAt = (i, j) => (below ? at(i, j - below) : 0);
  const lipC = below ? px0(Z, h) : 0;
  // a straight-edge sample at depth d: the top or bottom edge in column xs, the left or right edge in row ys
  const sideSample = (d, left, top, horiz) => {
    if (horiz) return px0(left ? Z : w - 1 - Z, top ? d - 1 : h - d);
    return px0(left ? d - 1 : w - d, top ? Z : h - 1 - Z);
  };
  [[0, true, true], [1, false, true], [2, false, false], [3, true, false]].forEach(([k, left, top]) => {
    if (!corners[k]) return;
    const j0 = top ? 0 : h - Z, j1 = top ? Z : h + below;
    for (let j = j0; j < j1; j++) for (let u = 0; u < Z; u++) {
      const i = left ? u : w - 1 - u, v = top ? j : h - 1 - j;
      const fx = x + i, fy = y + j;
      if (fx < 0 || fy < 0 || fx >= g.w || fy >= g.h) continue;
      let c;
      const d = j < h ? at(i, j) : 0;
      if (!d) {
        const ld = lipAt(i, j);
        c = ld === 0 ? 0 : ld === 1 ? inkV : lipC;
      } else if (d > rings) {
        c = px0(left ? Z : w - 1 - Z, j);   // the face, the gloss row, a heading strip: the same row outside the corner
      } else if (d === 1) {
        // the body's bottom line over the lip shows the lip's colour, as the helper draws it
        c = below && !top && (j + 1 >= h || !at(i, j + 1)) && lipAt(i, j + 1) >= 2 ? lipC : inkV;
      } else {
        c = sideSample(d, left, top, v <= u);
      }
      g.data[fy * g.w + fx] = c;
    }
  });
  return { body: { x, y, w, h }, at: (fx, fy) => (fx < x || fx >= x + w || fy < y || fy >= y + h ? 0 : at(fx - x, fy - y)), rings, zone: Z, ink: inkV };
}

const inCols = (keep, px) => !!keep && px >= keep.x && px < keep.x + keep.w;
const inRows = (keep, py) => !!keep && py >= keep.y && py < keep.y + keep.h;

/**
 * Draws a candy style on a slab from roundSlab: jelly a 2 px gloss under the top rim, striped diagonal stripes 3 px apart all along the band, frosted the top rim iced down onto the face's first row, with drips in the top corners.
 * Arguments: g; slab; style ('jelly', 'striped', 'frosted'); opt { keep (the stretched middle), stripe (colour), glossHi, glossLo (jelly: the two gloss rows), icing (colour), only ({ x, y, w, h }: stripes only inside it) }.
 */
export function candyStyle(g, slab, style, { keep = null, stripe, glossHi, glossLo, icing = '#ffffff', only = null } = {}) {
  const { body, at, rings } = slab, { x, y, w, h } = body;
  const set = (px, py, c) => { if (px >= 0 && py >= 0 && px < g.w && py < g.h) g.data[py * g.w + px] = col(c); };
  if (style === 'jelly') {
    // in every column: the inner ink under the top band lit, and the face row under it, a 2 px glossy band
    for (let px = x; px < x + w; px++) {
      let py = y; while (py < y + h && at(px, py) < rings) py++;
      if (py >= y + h || at(px, py) !== rings || at(px, py + 1) <= rings || py - y >= rings + 1) continue;
      if (inRows(keep, py + 1)) continue;
      set(px, py, glossHi); set(px, py + 1, glossLo);
    }
  } else if (style === 'striped') {
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) {
      const d = at(px, py);
      if (d < 2 || d >= rings || (px + py) % 3) continue;
      if (only && !(px >= only.x && px < only.x + only.w && py >= only.y && py < only.y + only.h)) continue;
      set(px, py, stripe);
    }
  } else if (style === 'frosted') {
    // the icing: every band and inner-ink pixel within the top rim's depth, round the top corners too, and the
    // face's first row under it (the same in every column, so the piece still stretches sideways)
    for (let py = y; py < y + rings && py < y + h; py++) for (let px = x; px < x + w; px++) { const d = at(px, py); if (d >= 2 && d <= rings) set(px, py, icing); }
    const lip = y + rings;
    if (!inRows(keep, lip)) for (let px = x; px < x + w; px++) if (at(px, lip) > rings) set(px, lip, icing);
    // the drips: hanging from the icing onto the face, in the top corners, outside the stretched middle
    const drips = [[[0, 2], [1, 1], [2, 2]], [[0, 1], [1, 2], [2, 1]]];
    [[x, 1], [x + w - 1, -1]].forEach(([cx, sx], side) => drips[side].forEach(([du, len]) => {
      const px = cx + sx * (rings + du);
      if (inCols(keep, px) || px < x || px >= x + w) return;
      let py = y; while (py < y + h && (at(px, py) <= rings || g.data[py * g.w + px] === col(icing))) py++;
      for (let k = 0; k < len && py + k < y + h; k++) if (at(px, py + k) > rings && !inRows(keep, py + k)) set(px, py + k, icing);
    }));
  } else throw new Error(`candyStyle: style "${style}" is not one of jelly, striped, frosted`);
  return g;
}

/**
 * Draws a glossy highlight bubble of 12 to 16 px over the top right corner of a slab, on its band, inner ink and face (never its outer ink), outside the stretched middle.
 * Arguments: g; slab; opt { keep (the stretched middle), white (its core colour), soft (its lower edge) }.
 */
export function candyBubble(g, slab, { keep = null, white = '#ffffff', soft } = {}) {
  const { body, at, zone: Z } = slab, right = body.x + body.w - 1;
  // u counts left from the right edge, v down from the top edge; the last row is the soft lower edge
  const shape = [[1, 2, 3], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4], [1, 2, 3]];
  const W = col(white), S = col(soft ?? white);
  const plan = (u0, v0) => {
    const out = [];
    shape.forEach((us, dv) => us.forEach((du) => {
      const px = right - u0 - du, py = body.y + v0 + dv;
      if (u0 + du >= Z || v0 + dv >= Z || at(px, py) < 2 || inCols(keep, px) || inRows(keep, py)) return;
      const c = dv === shape.length - 1 ? S : W;
      const was = g.data[py * g.w + px];
      if (was !== c) out.push([py * g.w + px, c, Math.abs(lum(was) - lum(c))]);
    }));
    return out;
  };
  // the place in the corner square where it shows most (the summed change of brightness), nearest the corner on a tie
  let best = [], score = -1;
  for (let s2 = 2; s2 <= 2 * Z; s2++) for (let u0 = 1; u0 < s2; u0++) {
    const p = plan(u0, s2 - u0), sc = p.reduce((a, q) => a + q[2], 0);
    if (p.length >= 12 && sc > score) { best = p; score = sc; }
  }
  for (const [i, c] of best) g.data[i] = c;
  return best.length;
}

/**
 * Scatters two-pixel sprinkles over a slab's band, a different pattern in each corner square and, on each side whose stretched run `period` divides, a repeating pattern that tiles: returns how many it drew.
 * Arguments: g; slab; opt { colors (list of colours), keep (the stretched middle), period (px; 0: corners only) }.
 */
export function candySprinkles(g, slab, { colors = [], keep = null, period = 16 } = {}) {
  const { body, at, rings, zone: Z } = slab, { x, y, w, h } = body;
  // per corner, the angles (0: on the side, 90: on the top or bottom edge) at which a sprinkle crosses the band
  const spots = [[20, 72], [8, 45, 84], [30, 62], [12, 52, 88]];
  const band = (px, py) => { const d = at(px, py); return d >= 2 && d < rings && !inCols(keep, px) && !inRows(keep, py); };
  let n = 0, c = 0;
  [[true, true], [false, true], [false, false], [true, false]].forEach(([left, top], k) => {
    const fx = (u) => (left ? x + u : x + w - 1 - u), fy = (v) => (top ? y + v : y + h - 1 - v);
    for (const deg of spots[k]) {
      const a = (deg * Math.PI) / 180, du = -Math.cos(a), dv = -Math.sin(a);
      // walk from the corner square's centre outwards along the angle; the last band pixels met are the sprinkle
      const hits = [];
      for (let t = 0; t < 2 * Z; t += 0.25) {
        const u = Math.round(Z - 0.5 + du * t), v = Math.round(Z - 0.5 + dv * t);
        if (u < 0 || v < 0) break;
        const px = fx(u), py = fy(v), key = py * g.w + px;
        if (band(px, py) && !hits.includes(key)) hits.push(key);
      }
      let pair = hits.slice(-2);
      if (pair.length < 2 && hits.length) {
        // a 1 px band: the sprinkle lies along it instead
        const p0 = hits[hits.length - 1], px = p0 % g.w, py = (p0 - px) / g.w;
        const next = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].map(([ox, oy]) => [px + ox, py + oy]).find(([qx, qy]) => band(qx, qy));
        if (next) pair = [p0, next[1] * g.w + next[0]];
      }
      if (pair.length < 2) continue;
      const colour = col(colors[c++ % Math.max(1, colors.length)] ?? INK);
      for (const i of pair) g.data[i] = colour;
      n++;
    }
  });
  if (!keep || !period) return n;
  // the sides: per period, two sprinkles at [offset, across the band (true) or along it]
  const sides = [
    { run: keep.w, at: (o, d) => [keep.x + o, y + d - 1], spots: [[3, true], [11, false]] },
    { run: keep.h, at: (o, d) => [x + w - d, keep.y + o], spots: [[2, false], [9, true]] },
    { run: keep.w, at: (o, d) => [keep.x + o, y + h - d], spots: [[7, false], [13, true]] },
    { run: keep.h, at: (o, d) => [x + d - 1, keep.y + o], spots: [[5, true], [12, false]] },
  ];
  sides.forEach((sd, si) => {
    if (sd.run % period) return;
    // the same colours in every period, so the side tiles exactly
    for (let b0 = 0; b0 < sd.run; b0 += period) sd.spots.forEach(([o, across], k) => {
      const [ax, ay] = sd.at(b0 + o, 2), [bx, by] = across && rings > 3 ? sd.at(b0 + o, 3) : sd.at(b0 + o + 1, 2);
      if (at(ax, ay) < 2 || at(ax, ay) >= rings || at(bx, by) < 2 || at(bx, by) >= rings) return;
      const colour = col(colors[(si + k) % Math.max(1, colors.length)] ?? INK);
      g.data[ay * g.w + ax] = colour; g.data[by * g.w + bx] = colour;
      n++;
    });
  });
  return n;
}

/** The stripe colour of a candy rim: a tone of the rim, never of the face, so a striped rim never reads as a red and white cane. Arguments: frame (the rim colour). */
export const candyStripe = (frame) => tone(frame, -1.5);

/**
 * Draws inked layers onto g as one piece: each pixel takes the first layer's colour that is not ink, else ink, so outlines that fall inside another layer's body vanish (a bracket between two poses).
 * Arguments: g; layers (surfaces the size of g, in order of preference); ink (the outline colour, default INK).
 */
export function unionInked(g, layers, ink = INK) {
  const k = col(ink);
  for (let i = 0; i < g.data.length; i++) {
    let c = 0;
    for (const l of layers) { const v = l.data[i]; if (v && v !== k) { c = v; break; } if (v) c = c || v; }
    if (c) g.data[i] = c;
  }
  return g;
}
