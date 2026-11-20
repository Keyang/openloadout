// PORT (build item T2): the drawing of sprites/tiles-castle.js (frozen at tests/fixtures/code-sprites/tiles-castle.js)
// for the tile.castle@1 generator (engine/gen/tile-ports.js). Word for word the code's, except where it worked a colour
// out: those colours come in as C (stand-in colours engine/gen/tile-ports.js maps back to the paints the asset names:
// the code's own colour rules, written in sprites/tiles-castle.json). The joins are engine/tiles.js drawTile,
// drawBattlement and drawArchway, the code's and the tiles layout's own. A HAND CHANGE note says where it differs.
// Never change what a released generator version draws through it: a different look is a new version.
//
//   C: stone, wall, growth (the colour controls; their ramps' tones are read back as the slots' tones); joint
//      (textureTone of stone), mortar (textureTone of wall), mossOn (textureTone of growth against stone), trim (mix of
//      stone and its light, 0.5), lit (the stone's light where it is 0.1 brighter than the stone, else the stone),
//      frame (mix of stone and wall, 0.3: the window's dressed frame)
//
// Pure: no DOM, no clock, no randomness; runs the same in Node and the browser.
import { Surface, rectIn, ellipseIn } from '../../surface.js';
import { ramp, INK } from '../../color.js';
import { drawTile, patternFill, drawCourses, courseShift, drawBattlement, drawArchway, stoneSpot, stoneTuft } from '../../tiles.js';
import { crack } from '../../rock.js';

// HAND CHANGE (speed only, no pixel changes): every version of a fill is made on first use, so a tile does not make
// the versions it does not show (the code made them all for every tile); each version is drawn on its own as before
function lazyList(n, make) {
  const out = [], made = [];
  for (let i = 0; i < n; i++) Object.defineProperty(out, i, { get: () => (made[i] ??= make(i)) });
  return out;
}

// The stone pattern of each style: course heights from the top down, and for each version of the fill the columns of
// the upright joints in each course. No joint stands on the first or last column, or within `glint` px of the left
// edge (so a stone's highlight never reaches the first column). tick: where the trim course's own joints stand.
const PATTERN = {
  blocks: {
    heights: [11, 10, 11], glint: 3, tick: 1,
    joints: [
      [[9, 25], [4, 18], [13, 29]],
      [[9, 25], [13, 29], [5, 20]],
      [[9, 25], [6, 16], [12, 22]],
    ],
  },
  cobbles: {
    heights: [8, 8, 8, 8], glint: 2, tick: 6, round: true,
    joints: [
      [[2, 10, 18, 26], [6, 14, 22, 29], [2, 10, 18, 26], [6, 14, 22, 29]],
      [[2, 10, 18, 26], [5, 14, 21, 29], [2, 10, 18, 26], [7, 14, 21, 29]],
      [[2, 10, 18, 26], [6, 13, 22, 29], [2, 10, 18, 26], [5, 13, 21, 29]],
    ],
  },
  slabs: {
    heights: [16, 16], glint: 5, tick: 7,
    joints: [
      [[15], [29]],
      [[15], [8]],
      [[15], [23]],
    ],
  },
};
// The back wall: plain running bond, the same joints in every version.
const BRICKS = [{ h: 8, joints: [7, 23] }, { h: 8, joints: [15, 30] }, { h: 8, joints: [7, 23] }, { h: 8, joints: [15, 30] }];

// How much moss lies on the top line at each column, 0..1: one cushion and a smaller one, with bare stone between;
// the Moss control widens and deepens them until they join. The last column leads into the first.
const MOSS = [0, 0.15, 0.35, 0.55, 0.55, 0.55, 0.35, 0.15, 0, 0, 0, 0.2, 0.3, 0.3, 0.2, 0, 0.2, 0.5, 0.75, 0.9, 1, 1, 0.9, 1, 0.9, 0.75, 0.5, 0.3, 0.2, 0.3, 0.2, 0];
// Where the outline is nicked when the stone is worn: [position along the edge, px long].
const NICKS = [[11, 2], [22, 1]];
const nicked = (u) => NICKS.some(([at, n]) => u >= at && u < at + n);
const inner = rectIn(3, 3, 26, 26);          // marks of a fill version stay off the outer 3 px

// Everything the pieces are drawn from: the stone as a material for the tile helper, and the back wall.
function masonry(p, C) {
  const stone = ramp(C.stone), wall = ramp(C.wall), moss = ramp(C.growth);
  const joint = C.joint, mortar = C.mortar;
  const mossOn = { light: moss.light, base: moss.base, dark: C.mossOn };       // moss lying on the stone's fill
  const trim = C.trim;              // the trim course where it faces away from the light
  const lit = C.lit;   // HAND CHANGE: the code's stone.light when 0.1 brighter than the stone, else no highlight; the paint gives the stone itself then (the same pixels)      // a stone as pale as cream takes no highlight
  const edge = Math.round(p.edge), L = PATTERN[p.style];
  const busy = Math.round(p.texture * 4);                   // 0 plain: joints only; 1: lit corners; 2 to 4: pits
  const wear = p.wear, over = p.overgrowth;
  // The courses are moved down so that the joint under the one that goes round the bottom of the tile lands on row
  // `edge`: the trim course along a top edge then sits exactly on a course line, and no join between two tiles is a joint.
  const { shift, round } = courseShift(L.heights, edge + 1);

  // The inside of the block, in three versions. Version 0 is what every edge piece has behind its edge, and is the plainest.
  // The versions share the course that goes round the bottom of the tile and differ in the upright joints of the others.
  const versions = lazyList(3, (v) => patternFill(C.stone, (s) => {
    const courses = L.heights.map((h, i) => ({ h, joints: L.joints[i === round ? 0 : v][i] }));
    const all = drawCourses(s, courses, { shift });
    const stones = all.map((_, i) => all[(i * 5 + v * 2 + 1) % all.length]);                      // a different order in each version, so their marks fall in different courses
    drawCourses(s, courses, { joint, lit: busy >= 1 ? lit : null, glint: L.glint, round: L.round, shift });
    // pits: two dark pixels side by side on the face of a stone, clear of its joints and of the tile's outer 3 px
    stones.slice(0, Math.max(0, busy - 1 - (v ? 0 : 1))).forEach((st, i) => { const at = stoneSpot(st, i, v + 3); if (at) s.rect(at[0], at[1], 2, 1, joint); });
    // wear: chipped corners, then a crack; version 0 gets the least
    stones.slice(2, 2 + Math.round(wear * 3) - (v ? 0 : 1)).forEach((st) => {
      const x = (st.x + st.w - 1) % 32, y = (st.y + st.h - 1) % 32;
      if (x >= 4 && x <= 28 && y >= 4 && y <= 28) { s.rect(x - 1, y, 2, 1, joint); s.dot(x, y - 1, joint); }
    });
    const start = [0.8, 0.35, 0.55][v];
    if (wear >= start) crack(s, [20, 8, 23][v], [12, 7, 6][v], [0.5, 0.35, -0.4][v], Math.round(5 + (wear - start) * 14), joint, { seed: v + 2, clip: inner });
    // moss in the joints: a tuft on top of a stone that lies wholly inside the tile, over the joint above it
    const beds = stones.filter((st) => st.x >= 2 && st.x + st.w <= 30 && st.y >= 4 && st.y <= 26 && st.y + st.h <= 32 && st.w >= 6);
    if (beds.length && over >= [0.85, 0.6, 0.4][v]) stoneTuft(s, beds[v % beds.length], mossOn, { big: over >= 0.7 });
    if (beds.length > 1 && over >= 0.9 && v) stoneTuft(s, beds[(v + 1) % beds.length], mossOn);
  }));

  // The back wall, in three versions: the same bricks, with one brick cut in two in the second and the third, and
  // the marks of texture, wear and moss in a different place in each. All in the one mortar tone: it stays calm.
  const bricks = lazyList(3, (v) => patternFill(C.wall, (s) => {
    const [bx, by, bw] = [[8, 4, 15], [16, 12, 14], [8, 20, 15]][v];        // a whole brick away from the tile's edges
    drawCourses(s, BRICKS, { joint: mortar, shift: 4 });
    if (v) s.rect(bx + 7, by, 1, 7, mortar);
    if (busy >= 3 - (v ? 1 : 0)) { s.rect(bx + 2 + v, by + 2, 2, 1, mortar); if (busy >= 4) s.rect(bx + 10 - v, by + 4, 2, 1, mortar); }
    if (wear >= [0.8, 0.35, 0.55][v]) crack(s, [10, 20, 12][v], [14, 22, 6][v], [0.3, -0.5, 0.6][v], Math.round(4 + wear * 6), mortar, { seed: v + 11, clip: inner, branch: false });
    if (wear >= 0.9 && v === 2) s.rect(8, 4, 15, 7, mortar);                                             // a brick has fallen out
    if (over >= [0.85, 0.6, 0.4][v]) stoneTuft(s, { x: [16, 8, 16][v], y: [12, 4, 12][v], w: 14, h: 7 }, { light: moss.dark, base: moss.dark, dark: moss.deep });
  }));

  // The trim course on one edge: `edge` px under the ink line, cut into stones 16 px long, with a joint line under it.
  const course = (first, body, tick) => ({
    depth: edge,
    inset: (u) => (wear >= 0.5 && nicked(u) ? 1 : 0),
    paint: (d, u) => (d === edge || (u - tick) % 16 === 0 ? joint : d === 1 ? first : body),
  });
  // moss on the top line: cushions where the profile is high enough, wider and deeper the more overgrown, and from
  // well overgrown on a thin carpet between them, so the whole top is green
  const carpet = (u) => (over < 0.6 ? 0 : over >= 0.85 && u % 3 !== 1 ? 2 : 1);
  const cushion = (u) => (over >= 0.08 && MOSS[u] >= 0.75 - 0.55 * over ? Math.min(over >= 0.9 ? 5 : 4, Math.round(MOSS[u] * (2 + 4 * over))) : 0);
  const mossDeep = (u) => Math.max(carpet(u), cushion(u));
  const top = course(stone.light, stone.light, L.tick);
  const block = {
    ink: INK,
    round: wear >= 0.75 ? 1 : 0,
    fill: (x, y, t, v) => versions[v ?? 0](x, y),
    // the top: the trim course in full light, with cushions of moss lying on it
    top: {
      depth: Math.max(edge, 5),
      inset: top.inset,
      paint: (d, u) => {
        const m = mossDeep(u);
        if (d <= m) return d === 1 ? (MOSS[u] >= 1 ? moss.light : moss.base) : d === m && m >= 3 ? moss.deep : moss.dark;
        return d <= edge ? top.paint(d, u) : null;
      },
    },
    right: course(stone.light, stone.light, edge + 5),
    left: course(C.stone, trim, edge + 5),                    // away from the light
    bottom: course(C.stone, trim, L.tick + 8),
  };
  return { block, bricks, stone, wall, moss, joint, mortar, trim, frame: C.frame, edge, busy, wear, over };
}
// The underside of the thin ledge: one row of shade.
const ledgeUnderside = (M) => ({ depth: 1, paint: () => M.joint });
// A stepped corbel under each end of the ledge, its upright side at the end: the ledge is drawn over its top rows.
function corbel(g, end, M) {
  const s = new Surface(32, 32), x = end === 'l' ? 3 : 19, flip = (dx, w) => (end === 'l' ? x + dx : x + 10 - dx - w);
  s.rect(x, 10, 10, 4, M.stone.base); s.rect(flip(0, 6), 14, 6, 3, M.stone.base);
  s.rect(x, 13, 10, 1, M.joint); s.rect(flip(0, 6), 16, 6, 1, M.joint);                        // the underside of each step
  s.rect(flip(end === 'l' ? 9 : 0, 1), 12, 1, 1, M.stone.light); s.rect(flip(end === 'l' ? 5 : 0, 1), 14, 1, 2, M.stone.light);
  s.outline(INK);
  g.blit(s);
}

// ---- the pillar: a round shaft with two flutes, a capital and a base ---------------------------------
// 20 px wide with its outline (columns 6 to 25). The shaft's drum joints are 16 px apart, so the middle piece repeats.
function pillar(s, part, M) {
  const { stone, joint, trim, moss } = M;
  const y0 = part === 'cap' ? 9 : 0, y1 = part === 'foot' ? 22 : 31;
  const chip = M.wear >= 0.6 && part !== 'cap' ? (px, py) => !(px < 9 && Math.abs(py - 15.5) + (px - 7) < 2.5) : undefined;   // a chip out of the edge
  s.rect(7, y0, 18, y1 - y0 + 1, stone.base, { clip: chip });
  s.rect(7, y0, 2, y1 - y0 + 1, stone.dark, { clip: chip });   // the side away from the light
  s.rect(22, y0, 2, y1 - y0 + 1, stone.light);
  s.rect(24, y0, 1, y1 - y0 + 1, trim);
  if (M.busy >= 1) for (const x of [12, 17]) { s.rect(x, y0, 1, y1 - y0 + 1, joint); s.rect(x + 1, y0, 1, y1 - y0 + 1, trim); }   // the flutes
  for (const y of [7, 23]) if (y > y0 + 2 && y < y1 - 2) s.rect(7, y, 18, 1, joint);                                            // the drum joints
  if (M.wear >= 0.3 && part === 'mid') crack(s, 19, 9, 0.3, Math.round(4 + M.wear * 8), joint, { seed: 5, clip: rectIn(9, 0, 13, 32) });
  const slab = (x, y, w, h) => { s.rect(x, y, w, h, stone.base); s.rect(x, y, w, 1, stone.light); s.rect(x, y + h - 1, w, 1, stone.dark); s.rect(x + w - 2, y + 1, 2, Math.max(0, h - 2), trim); };
  if (part === 'cap') {
    slab(3, 0, 26, 4);                                        // the slab it carries the load on
    slab(5, 4, 22, 3);
    s.rect(7, 7, 18, 2, stone.dark);                          // the shadow under the capital
    s.rect(7, 11, 18, 1, stone.light); s.rect(7, 12, 18, 1, joint);          // a ring round the neck
  }
  if (part === 'foot') {
    s.rect(7, 19, 18, 1, joint); s.rect(7, 20, 18, 1, stone.light);
    slab(5, 23, 22, 3);
    slab(3, 26, 26, 6);
    if (M.over >= 0.35) { const n = Math.round(4 + M.over * 12); s.rect(3, 26, n, 1, moss.light); s.rect(3, 27, Math.max(2, n - 3), 1, moss.base); s.rect(3, 28, Math.max(1, n - 6), 1, moss.dark); }
  }
}

// ---- the window: back wall with an arched opening, a dressed stone frame and a sill -------------------------
function window(g, M) {
  const frame = ramp(M.frame), line = M.wall.deep;   // HAND CHANGE: M.frame is the code's mix of the stone and the back wall, 0.3
  drawArchway(g, { ink: line, fill: (x, y) => M.bricks[0](x, y) }, 0, {
    x0: 9, x1: 22, spring: 12, crown: 4, foot: 24,
    band: { depth: 2, paint: (d, u) => (d === 1 && u > -8 ? frame.light : frame.base), joints: { every: 6, colour: frame.dark } },
  });
  // the sill: a ledge a little wider than the frame, lit along its top, with its shadow on the wall under it
  g.rect(5, 25, 22, 1, frame.light); g.rect(5, 26, 22, 1, frame.base); g.rect(5, 27, 22, 1, line);
  g.rect(6, 28, 20, 1, M.mortar);
  if (M.over >= 0.5) { const n = Math.round(M.over * 9); g.rect(5, 25, n, 1, M.moss.base); g.rect(5, 26, Math.max(1, n - 3), 1, M.moss.dark); }
}

// ---- the battlement: one merlon with an arrow slit, standing on the top tile under it ------------------------
function battlement(g, M) {
  drawBattlement(g, M.block, 0, { merlons: [[6, 25]], top: 10 });
  const y = Math.min(19, 11 + M.edge + 1);                                       // the slit starts under the trim course
  g.rect(15, y, 2, 9, M.stone.deep); g.rect(13, y + 3, 6, 2, M.stone.deep);      // the slit: a dark cross
  g.rect(17, y, 1, 3, M.joint); g.rect(19, y + 3, 1, 2, M.joint); g.rect(17, y + 5, 1, 4, M.joint);   // the side of it that is in shade
}

// ---- the archway: the ring of stones round the opening, with a keystone on the crown ---------------------------
function arch(g, half, M) {
  const { edge, joint, trim, stone } = M;
  const band = { depth: edge, paint: (d, u) => (d === edge ? joint : Math.abs(u) < 3.6 ? (d === 1 ? trim : stone.light) : d === 1 ? stone.base : trim), joints: { every: 7, colour: joint } };
  drawArchway(g, M.block, 0, half === 'l' ? { x0: 1, x1: 62, spring: 32, crown: 9, band } : { x0: -31, x1: 30, spring: 32, crown: 9, band });
}

// ---- the decals: both lie over a fill tile ------------------------------------------------------------
function bigCrack(g, M) {
  crack(g, 9, 5, 0.45, 24, M.stone.deep, { seed: 4, clip: rectIn(4, 4, 24, 24), jag: 0.8 });
  crack(g, 21, 9, -0.7, 8, M.joint, { seed: 9, clip: rectIn(4, 4, 24, 24), branch: false });
  g.rect(13, 13, 2, 2, M.stone.deep);                                           // where a piece has fallen out
  g.rect(15, 13, 1, 2, M.stone.light);
}
function mossPatch(g, M) {
  const k = 0.85 + 0.4 * M.over;
  g.blob([ellipseIn(15, 15, 8 * k, 5 * k), ellipseIn(10, 18, 5 * k, 4 * k), ellipseIn(20, 12, 5 * k, 3.5 * k), ellipseIn(19, 19, 4 * k, 3 * k)], M.moss, { shade: 2, clip: rectIn(3, 3, 26, 26) });
  for (const [x, y] of [[8, 11], [24, 17], [12, 23], [22, 22]]) g.rect(x, y, 2, 1, M.moss.base);       // loose bits round it
  for (const [x, y] of [[13, 14], [17, 16], [11, 18]]) g.rect(x, y, 2, 1, M.moss.dark);                // the hollows in it
}


const STONE = ['left', 'top', 'right', 'side-l', 'fill', 'fill-b', 'fill-c', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br',
  'strip-l', 'strip-m', 'strip-r', 'col-t', 'col-m', 'col-b', 'single', 'thin-l', 'thin-m', 'thin-r'];
/** The tiles of the castle, in the code tileset's clip order (its clips' names): what tile.castle@1's `piece` names. */
export const CASTLE_PIECES = Object.freeze([...STONE.map((k) => `stone-${k}`), 'brick-fill', 'brick-fill-b', 'brick-fill-c',
  'pillar-cap', 'pillar-mid', 'pillar-foot', 'window', 'battlement', 'arch-l', 'arch-r', 'stone-deco-a', 'stone-deco-b']);

/** Draws one tile of the castle on a 32 x 32 Surface, as sprites/tiles-castle.js rendered it: clip (a CASTLE_PIECES name), t, p (style, edge, texture, wear, overgrowth), C (the colours, see the top). */
export function drawCastle(g, { clip, t, p, C }) {
  const M = masonry(p, C);
  if (clip.startsWith('brick-fill')) { const v = clip.length > 10 ? clip.charCodeAt(11) - 97 : 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) g.dot(x, y, M.bricks[v](x, y)); return; }
  if (clip === 'stone-thin-l' || clip === 'stone-thin-r') corbel(g, clip.slice(-1), M);
  if (drawTile(g, clip, M.block, t, { thickness: 12, bottom: ledgeUnderside(M) })) return;
  if (clip.startsWith('pillar-')) { const s = new Surface(32, 32); pillar(s, clip.slice(7), M); s.outline(INK); g.blit(s); }
  else if (clip === 'window') window(g, M);
  else if (clip === 'battlement') battlement(g, M);
  else if (clip === 'arch-l' || clip === 'arch-r') arch(g, clip.slice(5), M);
  else if (clip === 'stone-deco-a') bigCrack(g, M);
  else mossPatch(g, M);
}
