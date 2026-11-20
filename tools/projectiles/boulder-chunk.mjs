// Writes sprites/boulder-chunk.json (migration batch E3): the code sprite's rock (engine/fx.js rock, rockBreak, shards,
// puffs) as a pictures body. Size scales the node `sz` (every point is written at the middle size, r = 8.5 x the shape's
// k). Drawn in the code's order: the dust first (no ink), then the chips and their ink, then the rock or its wedges with
// their lit facets and moss, all in the group `solid` (one z per wedge part, so each is its own body), inked round as
// one, then the cracks. Moss is the code's patch: its lobes cut to the rock or wedge, with a dark line of its own colour
// round it inside the stone. Each wedge's node sits at its own shape's wedge middle (a pick on Shape), so a wedge turns
// and shrinks about the point rockBreak turns it about.
import { head, clip, build, B } from './lib.mjs';
import { hash, easeOut } from '../../engine/motion.js';
const h = head('boulder-chunk', { stone: 'stone', accent: 'plant' });
h.palette.push({ id: 'shine', default: '#ffffff', material: 'light', detail: true });
const TAU = Math.PI * 2, SEED = 4, RM = 8.5;                 // the middle size's radius before the shape's k
const SHAPES = { round: { sides: 9, jag: 0.16, squash: 1, k: 1.03 }, jagged: { sides: 7, jag: 0.38, squash: 1, k: 1.14 }, slab: { sides: 6, jag: 0.14, squash: 0.6, k: 1.16 } };
const r2 = (v) => Math.round(v * 100) / 100, r1 = (v) => Math.round(v * 10) / 10;
const P2 = ([x, y]) => [r1(x), r1(y)];
const hs = (i, ch) => hash(i, SEED * 64 + ch);
// ---- geometry (rock space, px at the middle size) ----
const corners = (S) => Array.from({ length: S.sides }, (_, i) => [(TAU * (i + (hs(i, 11) - 0.5) * 0.5)) / S.sides, 1 - S.jag * hs(i, 12)]);
const rockPoly = (S) => corners(S).map(([a, d]) => [Math.cos(a) * d * RM * S.k, Math.sin(a) * d * RM * S.k * S.squash]);
function edgeAt(poly, a) {                                     // the distance to the polygon's edge along angle a
  const dir = [Math.cos(a), Math.sin(a)]; let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], e = [q[0] - p[0], q[1] - p[1]], den = dir[0] * e[1] - dir[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = (p[0] * e[1] - p[1] * e[0]) / den, u = (p[0] * dir[1] - p[1] * dir[0]) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}
const area = (P) => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
/** Sutherland-Hodgman: the subject polygon cut to the convex polygon `clipP`. */
function clipTo(subject, clipP) {
  const ccw = area(clipP) > 0;
  let out = subject;
  for (let i = 0; i < clipP.length && out.length; i++) {
    const a = clipP[i], b = clipP[(i + 1) % clipP.length];
    const inside = (p) => { const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); return ccw ? c >= 0 : c <= 0; };
    const cross = (p, q) => { const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [b[0] - a[0], b[1] - a[1]]; const den = d1[0] * d2[1] - d1[1] * d2[0]; const t = ((a[0] - p[0]) * d2[1] - (a[1] - p[1]) * d2[0]) / den; return [p[0] + d1[0] * t, p[1] + d1[1] * t]; };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      if (inside(q)) { if (!inside(p)) out.push(cross(p, q)); out.push(q); } else if (inside(p)) out.push(cross(p, q));
    }
  }
  return out;
}
/** The polygon moved d px inward along each edge (mitred corners; mild dents are fine). */
function inset(P, d) {
  const s = area(P) > 0 ? 1 : -1, n = P.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (-(b[1] - a[1]) / L) * s, ny = ((b[0] - a[0]) / L) * s;
    lines.push([[a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]]);
  }
  return lines.map((l, i) => {
    const m = lines[(i + n - 1) % n], [p, p2] = m, [q, q2] = l, d1 = [p2[0] - p[0], p2[1] - p[1]], d2 = [q2[0] - q[0], q2[1] - q[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-6) return q;
    const t = ((q[0] - p[0]) * d2[1] - (q[1] - p[1]) * d2[0]) / den;
    return [p[0] + d1[0] * t, p[1] + d1[1] * t];
  });
}
const circle = (c, r, n = 12) => Array.from({ length: n }, (_, i) => [c[0] + Math.cos((TAU * i) / n) * r, c[1] + Math.sin((TAU * i) / n) * r]);
// engine/fx.js rock and rockBreak: the moss patch, three lobes about angle 3.6 (radius 0.62 r, then 0.55 and 0.5 of that)
const lobes = (S) => [[0, 0.62, 1], [0.9, 0.7, 0.55], [-0.8, 0.74, 0.5]].map(([da, d, sz]) => { const r = RM * S.k; return [[Math.cos(3.6 + da) * r * d, Math.sin(3.6 + da) * r * d * S.squash], r * 0.62 * sz]; });
// the patch (`grow` 0), or the band of its dark line (each lobe 0.9 px bigger: the code's g.fill outline, the pixels
// beside the patch), as ONE outline: the three lobes' union, traced round from the big lobe's middle (each ray from
// there leaves the union once), cut to the wedge's angles (`sector`) and then to the stone along rays from the rock's
// middle (the stone is star-shaped about it), so the patch and its line stay inside the stone as the code clipped them
const unionOf = (S, grow) => {
  const L = lobes(S).map(([c, r]) => [c, r + grow]), [c0] = L[0];
  return Array.from({ length: 48 }, (_, k) => {
    const a = (TAU * k) / 48, u = [Math.cos(a), Math.sin(a)];
    let R = 0;
    for (const [c, r] of L) { const dx = c[0] - c0[0], dy = c[1] - c0[1], along = dx * u[0] + dy * u[1], perp2 = dx * dx + dy * dy - along * along; if (perp2 <= r * r) R = Math.max(R, along + Math.sqrt(r * r - perp2)); }
    return [c0[0] + u[0] * R, c0[1] + u[1] * R];
  });
};
/** The subject polygon cut to the half-plane on the left of the ray from the origin along angle a (side 1) or its right (side -1). */
const halfPlane = (P, a, side) => {
  const d = [Math.cos(a), Math.sin(a)], val = (p) => side * (d[0] * p[1] - d[1] * p[0]), out = [];
  for (let j = 0; j < P.length; j++) {
    const p = P[j], q = P[(j + 1) % P.length], vp = val(p), vq = val(q);
    if (vp >= 0) out.push(p);
    if ((vp >= 0) !== (vq >= 0)) { const t = vp / (vp - vq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
};
const mossOf = (stone, S, grow = 0, sector = null) => {
  let P = unionOf(S, grow);
  if (sector) P = halfPlane(halfPlane(P, sector[0], 1), sector[1], -1);
  P = P.map((q) => { const d = Math.hypot(q[0], q[1]), e = edgeAt(stone, Math.atan2(q[1], q[0])); return d > e && d > 0 ? [(q[0] * e) / d, (q[1] * e) / d] : q; });
  const out = [];
  for (const q of P.map(P2)) if (!out.length || Math.hypot(q[0] - out.at(-1)[0], q[1] - out.at(-1)[1]) > 0.05) out.push(q);
  while (out.length > 1 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) <= 0.05) out.pop();
  // a polygon holds at most 24 points: drop the point that changes the outline least (the smallest triangle with its
  // neighbours) until there are 24 and every point left bends it by more than 0.03 px squared
  for (;;) {
    let best = -1, least = Infinity;
    for (let j = 0; j < out.length && out.length > 3; j++) { const a = out[(j + out.length - 1) % out.length], b = out[j], c = out[(j + 1) % out.length], t = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; if (t < least) { least = t; best = j; } }
    if (best < 0 || (out.length <= 24 && least > 0.03)) break;
    out.splice(best, 1);
  }
  return out.length >= 3 && Math.abs(area(out)) >= 0.3 ? [out] : [];
};
/** Is the point inside the polygon (even-odd). */
const within = (P, [x, y]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
// the wedges: rockBreak's cuts (turn 0.5, uneven 0.6), each wedge from the middle out to the rock's edge
const cutsOf = (n) => Array.from({ length: n }, (_, i) => 0.5 + (TAU * (i + (hs(i, 41) - 0.5) * 0.8 * 0.6)) / n);
function wedgePoly(S, n, i) {
  const poly = rockPoly(S), cuts = cutsOf(n), a0 = cuts[i], a1 = i + 1 < n ? cuts[i + 1] : cuts[0] + TAU;
  const angs = poly.map((p) => { let a = Math.atan2(p[1], p[0]); while (a < a0) a += TAU; while (a >= a0 + TAU) a -= TAU; return a; }).filter((a) => a < a1).sort((p, q) => p - q);
  return [[0, 0], ...[a0, ...angs, a1].map((a) => { const d = edgeAt(poly, a); return [Math.cos(a) * d, Math.sin(a) * d]; })];
}
const wedgeMid = (S, n, i) => { const c = cutsOf(n), m = (c[i] + (i + 1 < n ? c[i + 1] : c[0] + TAU)) / 2, r = RM * S.k; return [Math.cos(m) * r * 0.5, Math.sin(m) * r * 0.5 * S.squash]; };
const sub = (p, o) => [p[0] - o[0], p[1] - o[1]];


const TRAVEL = 0.55;   // how far the wedges fly at Big, as a share of the frame px they fly at the middle size: the exact 0.77 (11 / 8.5 the other way) pushes big wedges into the frame edge (138 newly clipped cases), 0.55 keeps every one inside
const fly = ['fly'], hit = ['hit'], WEDGES = [3, 4, 5, 6];
const q4 = (v) => Math.round(v * 1e4) / 1e4;
const piecesWhen = (n) => ({ pieces: n === 3 ? [{ below: q4(1 / 6) }] : n === 6 ? [{ atLeast: q4(5 / 6) }] : [{ atLeast: q4((n - 3.5) / 3), below: q4((n - 2.5) / 3) }] });
const solid = [], cracks = [], seams = [], facetIds = [];
// one z per part, in the code's order (stone, facet, moss line, moss), so each part is its own body; all are `solid`
const Z = { stone: 0, facet: 1, line: 2, moss: 3 };
/** The stone, facet and moss of one rock or wedge (points in the node's space). */
function parts({ poly, facet, S, node, clipL, when, z, ids, stone, sector, at = [0, 0] }) {
  const out = [{ id: ids.stone, kind: 'poly', clip: clipL, on: node, points: poly.map(P2), paint: 'stone', group: 'solid', z: z + Z.stone, when }];
  out.push({ id: ids.facet, kind: 'poly', clip: clipL, on: node, points: facet.map(P2), paint: 'stone.light', group: 'solid', z: z + Z.facet, when });
  const mw = { ...when, mossy: [true] };
  for (const [grow, paint, tag, dz] of [[0.9, 'accent.dark', 'd', Z.line], [0, 'accent', '', Z.moss]])
    mossOf(stone, S, grow, sector).forEach((p) => out.push({ id: `${ids.moss}${tag}`, kind: 'poly', clip: clipL, on: node, points: p.map((q) => P2(sub(q, at))), paint, group: 'solid', z: z + dz, when: mw }));
  return out;
}
// each wedge's node: its own shape's wedge middle (Shape picks it), so it turns and shrinks about it as rockBreak does
const nodeAt = (n, i) => [0, 1].map((ax) => ({ from: 'shape', pick: Object.fromEntries(Object.entries(SHAPES).map(([nm, S]) => [nm, r1(wedgeMid(S, n, i)[ax])])) }));
for (const [name, S] of Object.entries(SHAPES)) {
  const when = { shape: [name] }, poly = rockPoly(S), s = name[0];
  // the rock: the lit facet is its own outline, half as big, pushed toward the light (it turns with the rock)
  solid.push(...parts({ poly, facet: poly.map(([x, y]) => [x * 0.5 + 1.8, y * 0.5 - 1.8]), S, node: 'rock', clipL: fly, when, z: 0, stone: poly,
    ids: { stone: `${name}Body`, facet: `${name}Facet`, moss: `${name}Moss` } }));
  // cracks: one on a new rock (it shows the turn), up to four on a worn one; each kept 1.6 px inside the edge, so at Small
  // none pokes out of the rock (it would be inked there, a barb)
  const safe = inset(poly, 1.6);
  for (let i = 0; i < 4; i++) {
    const a = TAU * (i / 4 + 0.13 + 0.12 * hs(i, 31)), r = RM * S.k;
    const pol = (aa, d) => [Math.cos(aa) * d * r, Math.sin(aa) * d * r * S.squash];
    const P = [pol(a, 0.85), pol(a + (hs(i, 32) - 0.5) * 0.7, 0.55), pol(a + (hs(i, 33) - 0.5) * 1.4, 0.12 + 0.2 * hs(i, 34))];
    for (let q = 0; q < 2; q++) { let t = 1; while (t > 0 && !within(safe, [P[q][0] * t, P[q][1] * t])) t -= 0.02; P[q] = [P[q][0] * t, P[q][1] * t]; }
    const w = i === 0 ? when : { ...when, wear: [{ atLeast: (i - 0.5) / 3 }] };
    for (let q = 0; q < 2; q++) cracks.push({ id: `${name}Crack${i}${q}`, kind: 'line', clip: fly, on: 'rock', from: P2(P[q]), to: P2(P[q + 1]), thick: 1, paint: 'stone.dark', when: w });
  }
  // hit: the same rock cut into wedges that fly apart, each with its own facet and moss; on frame 0 (assembled, under
  // the flash) a white line along each cut, as rockBreak's seam drew where two wedges meet
  for (const n of WEDGES) {
    const cutsN = cutsOf(n);
    for (let i = 0; i < n; i++) {
      const a = cutsN[i], e = edgeAt(poly, a) - 1;
      seams.push({ id: `${s}S${n}${i}`, kind: 'line', on: 'sz', from: [0, 0], to: P2([Math.cos(a) * e, Math.sin(a) * e]), paint: 'shine', hidden: true, when: { ...when, ...piecesWhen(n), clip: hit } });
    }
    for (let i = 0; i < n; i++) {
      const mid = wedgeMid(S, n, i), wp = wedgePoly(S, n, i), off = 0.12 * RM * S.k, cuts = cutsOf(n);
      const facet = wp.map((p) => sub([mid[0] + (p[0] - mid[0]) * 0.5 + off, mid[1] + (p[1] - mid[1]) * 0.5 - off], mid));
      solid.push(...parts({ poly: wp.map((p) => sub(p, mid)), facet, S, node: `w${n}${i}`, clipL: hit, when: { ...when, ...piecesWhen(n) }, z: 10 + 10 * i,
        stone: poly, sector: [cuts[i], i + 1 < n ? cuts[i + 1] : cuts[0] + TAU], at: mid,
        ids: { stone: `${s}W${n}${i}`, facet: `${s}F${n}${i}`, moss: `${s}M${n}${i}` } }));
      facetIds.push(`${s}F${n}${i}`);
    }
  }
}
// the dust (engine/fx.js puffs at the code's k = 0.1 to 1 over hit frames 1 to 7: begin 1/21 of the clip), behind
// everything and not inked; r is the code's lerp(6, 11, size) x the shape's k
const dust = Object.entries(SHAPES).map(([name, S]) => ({ id: `dust${name[0].toUpperCase()}${name.slice(1)}`, gen: 'puffs', v: 1, clip: hit, when: { shape: [name] }, at: [16, 17], count: 5, seed: 3, stagger: 0.1,
  angle: 180, arc: 360, dist: B('size', r2(6 * S.k * 0.95), r2(11 * S.k * 0.95)), rise: 3, size: B('size', r2(6 * S.k * 0.36), r2(11 * S.k * 0.36)), begin: q4(1 / 21), paints: ['stone.light', 'stone', 'stone.dark'] }));
// the chips (engine/fx.js shards): small spinning triangles of stone and moss, inked on their own over the dust. Each is
// on a node `c<i>` that flies in frame px, and a node `c<i>s` under it that Size scales and the keys turn and shrink.
const CH = [...Array.from({ length: 5 }, (_, i) => ({ i, seed: 7, dist: 13, gravity: 7, y: 16, paint: 'stone', when: i < 2 ? {} : { pieces: [{ atLeast: q4((i - 1.5) / 3) }] } })),
  ...Array.from({ length: 2 }, (_, i) => ({ i, seed: 9, dist: 11, gravity: 5, y: 15, paint: 'accent', when: { mossy: [true] } }))];
const chipSize = (c) => (c.seed === 7 ? Math.min(8, RM * 1.03 * 0.85) : Math.min(5, RM * 1.03 * 0.5));
const chips = CH.map((c, j) => {
  const hh = (ch) => hash(c.i, c.seed * 64 + ch), L = chipSize(c) * (0.7 + 0.6 * hh(5)), wd = Math.max(1.4, L * 0.6);
  return [{ id: `chip${j}`, kind: 'poly', on: `c${j}s`, points: [[L / 2, 0], [-L / 2, wd / 2], [-L / 2, -wd / 2]].map(P2), paint: c.paint, group: 'chips', when: { ...c.when, clip: hit } },
    { id: `chipDot${j}`, kind: 'dot', on: `c${j}s`, at: [0, 0], paint: c.paint, group: 'chips', when: { ...c.when, clip: hit } }];
}).flat();
const chipMove = (c, k) => {
  const hh = (ch) => hash(c.i, c.seed * 64 + ch), a = Math.PI + (hh(2) - 0.5) * TAU, d = c.dist * (0.5 + 0.5 * hh(3)) * easeOut(k);
  // the code kept a chip's middle in the box and cut it there; a shape is not cut, so its whole length stays in the box
  const L = chipSize(c) * (0.7 + 0.6 * hh(5)) * (1 - 0.6 * k) * 1.08, e = 2 + Math.max(0.5, L / 2);
  const cx = Math.min(Math.max(16 + Math.sin(a) * d, e), 32 - e), cy = Math.min(Math.max(c.y + Math.cos(a) * d + c.gravity * k * k * (0.6 + 0.4 * hh(4)), e), 32 - e);
  return { move: [r1(cx - 16), r1(cy - c.y)], k };
};
const chipNodes = (f) => {
  if (f === 0) return {};
  const k = 0.1 + (0.9 * (f - 1)) / 6;
  return Object.fromEntries(CH.flatMap((c, j) => { const hh = (ch) => hash(c.i, c.seed * 64 + ch), m = chipMove(c, k);
    return [[`c${j}`, { move: m.move }], [`c${j}s`, { scale: r2(1 - 0.6 * k), turn: r1((TAU * (hh(6) + 1.5 * (hh(7) - 0.5) * 2 * k) * 180) / Math.PI) }]]; }));
};
const draw = [...dust, ...chips, { kind: 'outline', paint: 'ink', only: 'chips' }, ...solid, { kind: 'outline', paint: 'ink', only: 'solid' }, ...cracks, ...seams];
const body = { pictures: {
  nodes: [ { id: 'sz', parent: null, at: [16, 16], scale: B('size', r2(6 / RM * 1e4) / 1e4, r2(11 / RM * 1e4) / 1e4) },
    ...CH.flatMap((c, j) => [{ id: `c${j}`, parent: null, at: [16, c.y] }, { id: `c${j}s`, parent: `c${j}`, at: [0, 0], scale: B('size', [[0, r2(Math.min(c.seed === 7 ? 8 : 5, 6 * 1.03 * (c.seed === 7 ? 0.85 : 0.5)) / chipSize(c))], [0.5, 1], [1, r2(Math.min(c.seed === 7 ? 8 : 5, 11 * 1.03 * (c.seed === 7 ? 0.85 : 0.5)) / chipSize(c))]]) }]),
    { id: 'rock', parent: 'sz', at: [0, 0] },
    ...WEDGES.flatMap((n) => Array.from({ length: n }, (_, i) => ({ id: `w${n}${i}`, parent: 'sz', at: nodeAt(n, i) }))) ],
  draw: draw.map((it) => { if (!Array.isArray(it.clip) || it.gen) return it; const { clip: c, ...rest } = it; return { ...rest, when: { ...(rest.when ?? {}), clip: c } }; }),
  emitters: [
    { id: 'flash', gen: 'starburst', v: 1, clip: hit, at: [15.5, 15.5], points: B('pieces', 3, 6, 'px'), turn: 23, r: [0, B('size', 3.7, 7.6)], width: B('size', 1.9, 3.8), paints: ['shine'] } ] } };
// rockBreak at the middle size: each wedge's middle flies out (dist 8, gravity 5, kept in the box), turns and shrinks.
// The way out is the round rock's (the jagged rock's is the same; the slab's, squashed, a little flatter).
const ext0 = RM * SHAPES.round.k * 0.5;
const motion = (n, i, k) => {
  const [gu, gv] = wedgeMid(SHAPES.round, n, i), hl = Math.hypot(gu, gv) || 1, sc = 1 - 0.6 * k ** 1.5, ext = ext0 * sc;
  const d = 8 * (0.55 + 0.45 * hs(i, 42)) * easeOut(k);
  const cx = Math.min(Math.max(16 + gu + (gu / hl) * d, 2 + ext + 0.01), 30 - ext - 0.01), cy = Math.min(Math.max(16 + gv + (gv / hl) * d + 5 * k * k * (0.6 + 0.4 * hs(i, 43)), 2 + ext + 0.01), 30 - ext - 0.01);
  return { move: [r1(cx - 16 - gu), r1(cy - 16 - gv)], scale: r2(sc), turn: r1(((TAU * 0.15 * (hs(i, 44) - 0.5) * 2 * k) * 180) / Math.PI) };
};
const clips = {
  fly: clip(h, 'fly', 12, { keys: [ { t: 0, ease: 'linear', nodes: { rock: { turn: 0 } } }, { t: 1, nodes: { rock: { turn: 360 } } } ] }),
  hit: clip(h, 'hit', 16, { travel: [0, 1].map((half) => ({ tracks: WEDGES.flatMap((n) => Array.from({ length: n }, (_, i) => `nodes.w${n}${i}.move`)).slice(half * 9, half * 9 + 9),
    by: B('size', [[0, r2(RM / 6)], [0.5, 1], [1, TRAVEL]]) })), keys: Array.from({ length: 8 }, (_, f) => {
    const k = f === 0 ? 0 : 0.1 + (0.9 * (f - 1)) / 6;
    // frame 0: the seams, no chips (the code drew none); frames 6 and 7: no facets (too small)
    const chipIds = chips.map((c) => c.id), seamIds = seams.map((c) => c.id);
    const hide = f === 0 ? chipIds : [...seamIds, ...(f >= 6 ? facetIds : [])], show = f === 0 ? seamIds : f === 1 ? chipIds : [];
    return { t: f / 7, ease: 'hold', emit: { flash: { amount: f === 0 ? 1 : 0 } }, nodes: { ...Object.fromEntries(WEDGES.flatMap((n) => Array.from({ length: n }, (_, i) => [`w${n}${i}`, motion(n, i, k)]))), ...chipNodes(f) },
      ...(show.length ? { show } : {}), hide };
  }) }),
};
/** The definition this writer gives (tools/projectiles/write.mjs writes it as sprites/boulder-chunk.json). */
export const definition = () => build(h, body, clips);
