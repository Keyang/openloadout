// PORT (build item T3): sprites/tiles-hive.js, the hive growth of the Derelict Station, word for word on paint refs: its
// imports point at the port shims (engine/gen/ports/colour.js: ramp and mix as colour rules; engine/gen/ports/t3/
// tiles.js: patternFill, drawDecal and drawSoftWall on the port's grid, textureTone, textureLight and sunkTone as colour
// rules; engine/gen/ports/c2/hive.js: blister), so it draws PAINT REFS on an engine/gen/port-surface.js grid. The vein,
// pore and puddle helpers of engine/ooze.js only paint the colours they are given and are imported from there. It is the
// drawing code of tile.hive@1 (engine/gen/tiles-t3.js), so it is NOT temporary; never change what a released generator
// version draws through it. HAND CHANGE notes say where it differs. The settings come in as the generator's arguments
// (p.veins, p.edge, p.texture, p.wet) and the three colours as paint refs (p.flesh, p.growth, p.glow).
import { ramp, mix } from '../colour.js';
import { lerp, clamp, fract, PI } from '../../../motion.js';
import { PALETTE } from '../../../palettes.js';
import { BLOCK_PIECES, NARROW_PIECES, pieceOf, drawBlock } from '../../../tiles.js';
import { anyIn, insetIn } from '../../../shapes.js';
import { puddleIn, scallops, veinPaths, drawVeins, drawVeinPulse, drawPore } from '../../../ooze.js';
import { blister } from '../c2/hive.js';
import { patternFill, drawDecal, drawSoftWall, SOFT_WALL_SLIVER, textureTone, textureLight, sunkTone } from './tiles.js';

const D = PALETTE.derelict;

// ---- where things lie --------------------------------------------------------------------------------------
// The notches between the lobes of the cap's rim, along each side (px from the start of the side): three lobes to a
// tile, the widest one lying across the join with the next tile, or round a corner.
const NOTCH = { top: [7, 16, 25], left: [7, 17, 25], right: [6, 15, 24] }, NOTCH_DEEP = 3;
// The face is a row of fat ribs. A crease runs down between two of them; the cap's south rim hangs over each rib
// in a lobe, and the rib ends in a lobe of the foot: both have their notch on the crease.
const RIBS = [5, 16, 26];
const FOOT = scallops(RIBS, 3, { width: 3 });
const HANG = scallops(RIBS, 3, { width: 4, sharp: 1.2 });
// How the creases sway on their way down the face, px per row.
const SWAY = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, -1, -1, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// Drips on the face: [column, rows it hangs below the rim], each from the middle of a lobe.
const DRIPS = [[10, 7], [21, 11]];
// Pocks on the ribs: [column, row of the face]. The first so many show, by Texture.
const POCKS = [[12, 15], [22, 9], [1, 12], [8, 19]];
// The marks of the floor, one list per version, all on the same loose five-spot (the four quarters and the middle),
// each version nudged its own way and with its own headings: the spacing inside a tile is the spacing across a join.
// veins: [x, y of its middle, heading in turns of PI (0 down, 0.5 right, 1 up), seed]: the first so many show, by
// Veins. pores: [x, y]: the first so many show, by Texture. The first two veins and the first pore lie in three
// different quarters of the tile.
const MARKS = [
  { veins: [[7, 8, 0.3, 21], [25, 23, 1.2, 6], [16, 17, 0.7, 30]], pores: [[25, 8], [5, 23]] },
  { veins: [[26, 8, 1.6, 8], [7, 25, 0.55, 9], [8, 9, 0.05, 14]], pores: [[26, 24], [15, 15]] },
  { veins: [[6, 23, 0.9, 12], [26, 7, 0.12, 17], [17, 15, 0.38, 25]], pores: [[6, 6], [24, 24]] },
];

// The tones everything is drawn in, from the three colours. HAND CHANGE: the cap's tone was worked out from the two
// colours' brightness; here it is the sunkTone colour rule (engine/data-rules.js), the same sum.
function tones(p) {
  const floor = p.flesh, F = ramp(floor);
  // the wall stands on the floor and is drawn darker than it, whatever the two colours are
  const cap = sunkTone(p.growth, floor, 0.09, 0.26);
  const C = ramp(cap), face = C.dark;
  return {
    floor, pore: textureTone(floor), vein: textureLight(floor, floor, 0.55), floorLit: F.light,
    cap, capLit: textureLight(cap), crease: textureTone(cap), gloss: mix(textureLight(cap), '#ffffff', 0.55),
    face, faceLine: textureTone(face), rib: cap, shadow: textureTone(floor), knot: textureTone(p.growth, floor),
    knotTip: mix(textureTone(p.growth, floor), floor, 0.5), swell: { ...F, base: textureLight(floor, floor, 0.55), dark: floor },
    glow: p.glow, glowDark: ramp(p.glow).dark,
  };
}

// ---- the floor ---------------------------------------------------------------------------------------------
// Fill marks keep off the outer 3 px of a tile.
const MARK_BOX = [3, 3, 29, 29];
// The short veins of the floor and of the creep, from a list of [x, y of the middle, heading in turns of PI, seed]:
// 6 to 9 px long, by Veins, and with none, one or two forks.
function shortVeins(list, p) {
  const length = Math.round(lerp(6, 9, p.veins)), forks = p.veins < 0.3 ? 0 : p.veins < 0.8 ? 1 : 2;
  const within = (v) => clamp(Math.round(v), MARK_BOX[0], MARK_BOX[2] - 1);
  return list.map(([x, y, turn, seed]) => {
    const a = turn * PI;
    return veinPaths(within(x - Math.sin(a) * length / 2), within(y - Math.cos(a) * length / 2), a, length, { seed, forks, wander: 0.6, spread: 0.8, branch: 0.45, box: MARK_BOX });
  });
}
// One version of the membrane. A vein stands a little proud of the floor: a short light line with shade under it, and
// when it is wet a glint; a pore is a small dark pit with a lit lip. Veins shows two or three veins, longer and more
// forked; Texture one or two pores, and bigger ones. No mark is longer than 10 px, so none of them can be picked out
// again in the next tile.
function membrane(p, T, version) {
  const marks = MARKS[version];
  return patternFill(T.floor, (s) => {
    for (const [x, y] of marks.pores.slice(0, p.texture < 0.34 ? 1 : 2)) drawPore(s, x, y, T.pore, T.vein, { size: p.texture > 0.8 ? 3 : 2 });
    drawVeins(s, shortVeins(marks.veins.slice(0, p.veins < 0.25 ? 2 : 3), p), T.vein, { shade: T.pore, run: 3, shine: p.wet ? T.floorLit : null, box: MARK_BOX });
  });
}

// ---- the wall ----------------------------------------------------------------------------------------------
// One side of the cap's rim: a row of round lobes. A lobe is an oval bead: the outline arcs over it from notch to
// notch, and the crease where it meets the cap swings under it the other way, so no line of the rim runs straight.
// On the two sides the light reaches (top and right) a lobe is lit along its outer arc; on the left the lower half of
// that arc is in shade.
function rim(which, E, T, wet) {
  // A notch is NOTCH_DEEP px deep at every setting (deeper, and the lobe round a corner is pinched off). Edge sets
  // how far in the crease lies under a lobe's crown: 5 to 7 px, which is all the sliver of cap over a strip can show.
  const depth = Math.min(E + 2, SOFT_WALL_SLIVER - 1);
  const dips = scallops(NOTCH[which], NOTCH_DEEP, { width: 3 });
  const belly = scallops(NOTCH[which], depth - NOTCH_DEEP, { width: 5, sharp: 1.3 });
  const band = dips.map((dip, u) => Math.max(1, depth - belly[u] - dip));      // from the outline in to the crease, at each place along the side
  const lit = which !== 'left';
  const crown = NOTCH[which].map((n, i, all) => Math.round((n + (all[i + 1] ?? all[0] + 32)) / 2) % 32);      // the middle of each lobe
  // on the side away from the light a lobe is shaded along the lower half of its outer arc: from its crown to the notch under it
  const low = dips.map((dip, u) => crown.some((c, i) => { const to = NOTCH[which][(i + 1) % crown.length], span = (to - c + 32) % 32, on = (u - c + 32) % 32; return on > 0 && on < span; }));
  return {
    depth,
    inset: (u) => dips[u],
    ragged: (u) => depth - band[u],
    paint: (d, u, t, here) => {
      if (d === here) return T.crease;                                      // the crease under the lobe, and down the notch
      if (!lit) return d === 1 && low[u] ? T.crease : null;
      if (wet && d === 2 && here > 3 && crown.some((c) => u === c || u === c - 1)) return T.gloss;
      return d === 1 ? T.capLit : null;
    },
  };
}

function wall(p, T) {
  const E = Math.round(p.edge), wet = p.wet;
  // the cap has one version and covers everything outside a room: it is bare, or its marks would show as a lattice
  const cap = patternFill(T.cap);
  const pocks = POCKS.slice(0, Math.round(p.texture * 4));
  const paint = (x, y, t, up) => {
    const hang = 5 - HANG[x];                                              // the cap's south rim hangs over each rib in a lobe
    if (y < hang - 1) return T.cap;
    if (y === hang - 1) return T.crease;
    for (const [dx, n] of DRIPS) {
      // a drip: a thread of slime with a drop at its end; it stops short of the foot
      const len = Math.min(n, up + y - hang - 5);
      if (len < 2 || y >= hang + len) continue;
      if (x === dx) return y >= hang + len - 2 ? T.glow : T.glowDark;
      if (x === dx + 1 && y >= hang + len - 2) return y === hang + len - 2 && wet ? T.gloss : T.glow;
    }
    const u = (x - SWAY[Math.min(y, SWAY.length - 1)] + 64) % 32;
    if (RIBS.includes(u) && up > 1) return T.faceLine;                     // the crease between two ribs
    if (up > 5 && y > hang + 1 && RIBS.some((r) => u === (r + 30) % 32)) return T.rib;      // a rib's lit flank, toward the light
    if (pocks.some(([px, py]) => y === py && (x === px || x === px + 1))) return T.faceLine;                 // a pock, and the lit lip under it
    if (pocks.some(([px, py]) => y === py + 1 && x === px)) return T.rib;
    if (up === 2 && FOOT[x] === 0) return T.rib;                           // the foot's lobes catch the light from above
    return T.face;
  };
  return {
    fill: cap,
    round: E + 2,
    top: rim('top', E, T, wet), right: rim('right', E, T, wet), left: rim('left', E, T, wet),
    face: { paint, foot: (u) => FOOT[u], round: 5, shadow: T.shadow },
  };
}

// ---- the decals --------------------------------------------------------------------------------------------

// A clutch of eggs: pale sacs with something lit inside, the big one at the back.
function eggs(g, p, T) {
  const skin = ramp(mix(T.floor, ramp(T.floor).light, 0.75));
  const clutch = [[21.5, 10.5, 3.5], [12.5, 13, 5.5], [8, 21, 3.5], [20.5, 19, 4.5], [14, 23.5, 2.5]];
  drawDecal(g, (s) => {
    for (const [x, y, r] of clutch) blister(s, x, y, r, { skin, core: p.glow, level: 1, under: T.pore });
  });
  if (p.wet) for (const [x, y, r] of clutch) if (r >= 4) g.rect(Math.round(x + r * 0.3), Math.round(y - r * 0.75), 2, 1, '#ffffff');
}

// The vein knot's loop: how brightly its heart burns on each frame.
const BEAT = [1, 2, 2, 1, 0, 0, 1, 1];
// The veins that run into the knot: [heading in turns of PI, length, seed, forks], all round it, no two alike. The
// first so many show, by Veins.
const ROOTS = [[0.06, 13, 2, 2], [0.58, 14, 6, 2], [0.9, 10, 9, 1], [1.24, 14, 4, 2], [1.68, 12, 13, 1], [0.34, 11, 17, 1], [1.46, 9, 23, 0], [1.05, 13, 31, 2], [1.88, 10, 37, 1]];
// A knot of veins: fine veins run together from all round, over a low, lopsided swelling of the floor, to the point
// where the light shows through; it beats, and each beat runs out along the veins. It is drawn as part of the floor
// (a swelling in the floor's own tones, no outline, veins one pixel wide that fork and fade at their tips), so that
// it cannot be taken for a bug.
function knot(g, p, T, t) {
  const frame = Math.round(t * 8) % 8, box = [1, 1, 31, 31], cx = 16, cy = 16;
  // the swelling: two mounds grown into one, with its shade beside it
  const mound = (dx, dy) => anyIn(puddleIn(cx - 1.5 + dx, cy + 0.6 + dy, 6.2, 3.9, [[3, 0.12, 0.55], [5, 0.07, 0.1]]), puddleIn(cx + 3.5 + dx, cy - 1 + dy, 4.2, 3, [[2, 0.12, 0.2]]));
  g.fill(4, 7, 28, 25, mound(-1, 1), T.pore);
  g.fill(4, 7, 28, 25, mound(0, 0), T.swell, { shade: 1 });
  const roots = ROOTS.slice(0, 7 + Math.round(p.veins * 2)).map(([turn, length, seed, forks]) => {
    const a = turn * PI;
    return veinPaths(Math.round(cx + Math.sin(a) * 1.6), Math.round(cy + Math.cos(a)), a, length, { seed, forks: p.veins < 0.3 ? Math.min(1, forks) : forks, wander: 0.7, spread: 0.75, branch: 0.45, box });
  });
  drawVeins(g, roots, T.knot, { tip: T.knotTip, tipLength: 3, box });
  // the beat: a short run of light that leaves the heart as it flares and reaches the tips as it dims
  // (nothing of it shows once its head has left the vein: its tail alone would be a stray speck)
  roots.forEach((paths, i) => { const at = Math.round(2 + fract(t + 0.8 + (i % 3) * 0.04) * (paths[0].length + 1)); if (at < paths[0].length) drawVeinPulse(g, paths, at, [p.glow, T.glowDark], { from: 3 }); });
  // the heart, where the veins meet: the light shows through
  const level = BEAT[frame], G = ramp(p.glow);
  g.fill(12, 13, 20, 19, puddleIn(cx + 0.5, cy + 0.5, 2.2, 1.4, [[3, 0.2, 0.3]]), level === 2 ? G.light : level === 1 ? G.base : G.dark);
  if (level === 2) g.rect(cx, cy, 2, 1, '#ffffff');
  if (p.wet) g.rect(cx + 4, cy - 3, 2, 1, T.gloss);
}

// What a bug left behind when it hatched: an empty shell broken in two, each half showing its dark inside.
function husk(g, p, T) {
  const shell = ramp(mix(D.chitin, T.floor, 0.45)), hollow = T.faceLine;
  // [the half's middle and radii, the middle and radii of its hollow]
  const halves = [[12, 15, 7.5, 6.5, 14.5, 16.5, 5.2, 4.6], [23, 20, 5, 4.2, 21.6, 19, 3.4, 3]];
  drawDecal(g, (s) => {
    for (const [x, y, rx, ry] of halves) s.ellipse(x, y, rx, ry, shell, { shade: 1 });
    for (const [, , , , hx, hy, hrx, hry] of halves) s.fill(0, 0, 32, 32, puddleIn(hx, hy, hrx, hry, [[7, 0.14, 0.2]]), hollow);
  });
  // the ridges of its back plates, and the broken rim catching the light
  for (const [x, y0, y1] of [[7, 13, 17], [9, 10, 13]]) for (let y = y0; y <= y1; y++) g.dot(x + (y - y0 > 2 ? -1 : 0), y, shell.dark);
  for (const [x, y] of [[12, 11], [15, 11], [18, 13], [20, 17], [23, 17]]) g.dot(x, y, shell.light);
  if (p.wet) g.rect(9, 9, 2, 1, '#ffffff');
}

// The creep patch's own marks, as the floor's: veins [x, y of its middle, heading in turns of PI, seed], pores [x, y].
const CREEP_VEINS = [[10, 10, 0.75, 21], [22, 22, 1.75, 11]], CREEP_PORES = [[14, 15], [5, 5]];
// A patch of creep: membrane that has grown out over the deck. It reaches the middle of each side of its tile, so
// it runs on into a hive floor (or more creep) next door, and falls back in two deep bays, at the top right and the
// bottom left. It lies across the tile from corner to corner so that, where a game lays it on a hive floor tile,
// each mark of that floor is either wholly under it or wholly clear of it, and none is cut in two.
function creep(g, p, T) {
  const body = anyIn(
    puddleIn(9, 9, 9.4, 9.4, [[5, 0.05, 0.6]]), puddleIn(16, 16, 8, 8, [[4, 0.06, 0.15]]), puddleIn(23, 23, 9.4, 9.4, [[5, 0.05, 0.1]]),
    puddleIn(16, 3, 4, 3.6, []), puddleIn(29, 17, 3.6, 4, []), puddleIn(16.5, 29, 4, 3.6, []), puddleIn(2.5, 15, 3.6, 4, []),      // a tongue to each side
  );
  g.fill(0, 0, 32, 32, body, T.floor);
  // marks of its own, kept inside the patch
  const inside = insetIn(body, 2);
  drawVeins(g, shortVeins(CREEP_VEINS.slice(0, p.veins < 0.25 ? 1 : 2), p), T.vein, { shade: T.pore, run: 3, shine: p.wet ? T.floorLit : null, keep: inside });
  for (const [x, y] of CREEP_PORES.slice(0, p.texture < 0.34 ? 1 : 2)) drawPore(g, x, y, T.pore, T.vein, { size: p.texture > 0.8 ? 3 : 2 });
}

const DECALS = { a: eggs, b: knot, c: husk, d: creep };

/** The clips tile.hive@1 draws, each { frames, loop }: the membrane's three fills, the wall block and the four decals. */
export const HIVE_CLIPS = Object.freeze(Object.fromEntries([
  ...['fill', 'fill-b', 'fill-c'].map((k) => [`hive-${k}`, { frames: 1, loop: true }]),
  ...[...BLOCK_PIECES, ...NARROW_PIECES].map((k) => [`wall-${k}`, { frames: 1, loop: true }]),
  ...['a', 'b', 'c', 'd'].map((d) => [`hive-deco-${d}`, { frames: d === 'b' ? 8 : 1, loop: true }]),
]));

/** sprites/tiles-hive.js render on a paint-ref grid: one frame of one clip. Arguments: g (a PortSurface), { clip, t, p }. */
export function drawHive(g, { clip, t, p }) {
  const k = pieceOf(clip), T = tones(p);
  if (k.kind === 'deco') return DECALS[k.piece](g, p, T, t);
  if (k.prefix === 'hive') return drawBlock(g, k.piece, { fill: membrane(p, T, k.piece === 'fill' ? 0 : k.piece.charCodeAt(5) - 97) }, t);
  return drawSoftWall(g, k.piece, wall(p, T), t);
}
