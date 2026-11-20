// PORT (build item T2): the drawing of sprites/tiles-village.js (frozen at tests/fixtures/code-sprites/tiles-village.js)
// for the tile.village@1 generator (engine/gen/tile-ports.js). Word for word the code's, except where it worked a
// colour out: those colours come in as C (stand-in colours engine/gen/tile-ports.js maps back to the paints the asset
// names: the code's own colour rules, written in sprites/tiles-village.json). The joins are engine/tiles.js drawBlock
// and drawSoftBlock, the fences engine/fences.js drawFence, the paving engine/paving.js: the code's own helpers.
// Never change what a released generator version draws through it: a different look is a new version.
//
//   C: stone, growth, wood (the colour controls; their ramps' tones are read back as the slots' tones);
//      body (pavingTone of stone), deepJoint (textureTone of body), joint (stoneShade of body towards deepJoint from
//      0.55), darker (mix of body and deepJoint, 0.8), glint (textureLight of body), mossOn (textureTone of growth
//      against body); seam (textureTone of wood), fibre (stoneShade of wood towards seam from 0.55), sheen (textureLight
//      of wood from 0.5); cap (mix of stone and its light, 0.6), capJoint (textureTone of cap), capLit (textureLight of
//      cap), capGlint (the cap's highlight: capLit, or the cap itself on a cap as pale as cream, brighter than 0.85),
//      faceBody (mix of stone and its dark, 0.3), mossFoot (textureTone of growth against faceBody)
//
// Pure: no DOM, no clock, no randomness; runs the same in Node and the browser.
import { ramp, INK } from '../../color.js';
import { pieceOf, drawBlock, drawSoftBlock, patternFill, drawCourses, courseShift, stoneSpot, stoneTuft, coursedFace } from '../../tiles.js';
import { drawHerringbone, paintStone, spreadStones } from '../../paving.js';
import { drawFence } from '../../fences.js';
import { crack } from '../../rock.js';
import { rectIn } from '../../surface.js';

const inner = rectIn(3, 3, 26, 26);

// ---- the paving ---------------------------------------------------------------------------------------------
const PAVING = {
  round: {
    heights: [8, 8, 8, 8], round: true, glint: 2,
    joints: [
      [[3, 11, 20, 28], [7, 15, 23, 30], [2, 10, 18, 26], [6, 13, 22, 29]],
      [[3, 12, 19, 28], [7, 14, 22, 30], [2, 9, 18, 26], [6, 14, 21, 29]],
      [[3, 10, 20, 28], [7, 16, 23, 30], [2, 11, 17, 26], [6, 13, 21, 29]],
    ],
  },
  square: {
    heights: [16, 16], round: false, glint: 4,
    joints: [
      [[7, 23], [15, 30]],
      [[7, 23], [15, 30]],
      [[7, 23], [15, 30]],
    ],
    marks: {
      1: { crack: [21, 6, 0.4], tuft: [4, 10], pits: [[11, 11], [22, 26]] },
      2: { crack: [12, 5, -0.5], tuft: [11, 10], pits: [[27, 10], [6, 25]] },
    },
  },
};
const MARKS = 6;
const KERB = {
  top: [4, 11, 19, 26],
  bottom: [5, 13, 20, 27],
  left: [5, 12, 20, 27],
  right: [4, 12, 19, 26],
};
const BLADES = {
  top: [],
  bottom: [[9, 1], [10, 0.5], [23, 0.7]],
  left: [[16, 0.4]],
  right: [[23, 0.3]],
};
const DARKER = { top: 11, bottom: 20, left: 5, right: 19 };
const SHADE = [1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1];

// ---- the floor boards and the wall --------------------------------------------------------------------------
const BOARDS = [{ h: 8, joints: [11] }, { h: 8, joints: [26] }, { h: 8, joints: [5] }, { h: 8, joints: [19] }];
const GRAIN = {
  1: [[5, 6, 5], [17, 13, 4], [8, 21, 6], [21, 28, 3]],
  2: [[18, 6, 6], [8, 14, 4], [21, 22, 5], [6, 28, 3]],
};
const SCUFFS = {
  1: { knot: [6, 13], gap: [20, 25], scratch: [19, 4, 1.2] },
  2: { knot: [5, 5], gap: [9, 25], scratch: [18, 14, 1.9] },
};
const COPING = [{ h: 16, joints: [9, 25] }, { h: 16, joints: [17, 30] }];
const FACE_JOINTS = [[4, 15, 26], [9, 20, 30], [3, 13, 24], [8, 18, 29]];
const FACE_COURSE = 7;
const CHIPS = [[0, 20, 3], [1, 6, 2], [2, 17, 4], [1, 27, 4]];
const NICKS = [[12, 2], [23, 1]];
const nicked = (u) => NICKS.some(([at, n]) => u >= at && u < at + n);
const FOOT_MOSS = [0, 0, 1, 2, 2, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 2, 3, 2, 2, 1, 0, 0, 0, 0, 1, 1, 0, 0];

// The same settings give the same answer, so the last one is kept (the colours C are the same stand-ins every call).
let kept = null;
function materials(p, C) {
  const key = JSON.stringify([p, C]);
  if (kept && kept.key === key) return kept.m;
  const stone = ramp(C.stone), moss = ramp(C.growth);
  const E = Math.round(p.edge), busy = p.texture, worn = p.wear;

  // ---- paving ----
  const body = C.body, deepJoint = C.deepJoint, joint = C.joint, shade = C.darker, glintOn = C.glint;
  const mossOn = { light: moss.light, base: C.growth, dark: C.mossOn };
  const L = PAVING[p.style];
  const pitAt = (st, i, v) => stoneSpot(st, i, v + 3) ?? (st.w >= 5 && st.h >= 3 && st.x >= 3 && st.y >= 3 ? [st.x + (st.w >> 1) - 1, st.y + (st.h >> 1)] : null);
  const bed = (st) => st.w >= 5 && st.y >= 5 && st.y <= 26;
  const paving = lazyList(3, (v) => patternFill(body, (s) => {
    let stones;
    if (L) {
      const { shift, round } = courseShift(L.heights, 3);
      const courses = L.heights.map((h, i) => ({ h, joints: L.joints[i === round ? 0 : v][i] }));
      stones = drawCourses(s, courses, { joint, round: L.round, shift });
    } else stones = drawHerringbone(s, { size: 4, joint });
    if (!v) return;
    const inside = stones.filter((st) => st.inner), free = spreadStones(inside, { start: v === 1 ? 0 : inside.length >> 1 });
    const used = new Set();
    const take = (fits) => { const st = free.find((f) => !used.has(f) && (!fits || fits(f))); if (st) used.add(st); return st ?? null; };
    const flags = L?.marks?.[v];
    const at = flags
      ? { glint: inside.slice(0, 1), shade: [], pit: flags.pits, tuft: { x: flags.tuft[0], y: stones[stones.length - 1].y, w: flags.tuft[1] } }
      : v === 1
        ? { gone: take(), shade: [take()], tuft: take(bed), pit: [take((st) => pitAt(st, 0, v))], glint: [take()] }
        : { shade: [take()], tuft: take(bed), split: take(), pit: [take((st) => pitAt(st, 0, v))], glint: [take()] };
    if (!flags) { at.pit.push(take((st) => pitAt(st, 1, v))); at.shade.push(take()); at.glint.push(take()); }
    const pits = Math.min(2, Math.round(worn * 3)), tuft = at.tuft && (v === 2 || worn >= 0.5);
    const gone = at.gone && worn >= 0.6, split = at.split && worn >= 0.7, cracked = flags && worn >= [0, 0.45, 0.7][v];
    const calm = (flags ? [busy >= 0.4 && 'glint'] : [busy >= 0.6 && 'shade', busy >= 0.4 && 'glint', busy >= 0.9 && 'shade', busy >= 0.8 && 'glint'])
      .filter(Boolean).slice(0, MARKS - pits - (tuft ? 1 : 0) - (gone || split || cracked ? 1 : 0));
    const count = { shade: 0, glint: 0 };
    for (const kind of calm) {
      const st = at[kind][count[kind]++];
      if (!st) continue;
      if (kind === 'shade') paintStone(s, st, shade, { round: L?.round });
      else { const n = Math.min(L?.glint ?? 2, st.w - 2); s.rect(st.x + st.w - n - (L?.round ? 1 : 0), st.y, n, 1, glintOn); }
    }
    for (let i = 0; i < pits; i++) { const spot = flags ? at.pit[i] : at.pit[i] && pitAt(at.pit[i], i, v); if (spot) s.rect(spot[0], spot[1], 2, 1, deepJoint); }
    if (gone) paintStone(s, at.gone, { light: deepJoint, base: joint, dark: joint }, { round: L?.round });
    if (split) {
      const st = at.split, down = st.w >= st.h;
      crack(s, down ? st.x + (st.w >> 1) : st.x, down ? st.y : st.y + (st.h >> 1), down ? 0 : Math.PI / 2, (down ? st.h : st.w) - 1, deepJoint, { seed: v + 2, clip: rectIn(st.x, st.y, st.w, st.h), branch: false, jag: 0.5 });
    }
    if (cracked) crack(s, flags.crack[0], flags.crack[1], flags.crack[2], Math.round(5 + worn * 8), deepJoint, { seed: v + 2, clip: inner, branch: false });
    if (tuft) stoneTuft(s, at.tuft, mossOn, { big: worn >= 0.75, seed: v });
  }));

  const kerbDeep = 5;
  const edge = (which, shaded) => {
    const reach = new Array(32).fill(0), joints = KERB[which];
    for (const [u, k] of BLADES[which]) reach[u] = Math.max(1, Math.round(k * (E - 2)));
    const startOf = (u) => { let at = joints[joints.length - 1]; for (const j of joints) if (j <= u) at = j; return at; };
    return {
      depth: kerbDeep,
      inset: (u) => (joints.includes(u) ? (E >= 6 ? 2 : 1) : 0) + reach[u],
      paint: (d, u) => {
        if (d === 1) return shaded ? stone.deep : stone.dark;
        if (d === kerbDeep || joints.includes(u)) return joint;
        if (shaded && d === 2 && SHADE[u]) return shade;
        return busy >= 0.3 && startOf(u) === DARKER[which] ? shade : body;
      },
    };
  };

  // ---- the indoor floor ----
  const seam = C.seam, fibre = C.fibre, sheen = C.sheen;
  const scuffs = Math.round(worn * 3), shiny = busy >= 0.75, grain = Math.min(Math.round(1 + busy * 3), MARKS - scuffs - (shiny ? 1 : 0));
  const boards = lazyList(3, (v) => patternFill(C.wood, (s) => {
    drawCourses(s, BOARDS, { joint: seam, shift: courseShift(BOARDS.map((b) => b.h)).shift });
    if (!v) return;
    GRAIN[v].slice(0, grain).forEach(([x, y, n]) => s.rect(x, y, n, 1, fibre));
    if (shiny) { const [x, y, n] = GRAIN[v][1]; s.rect(x + 1, y - 2, n + 1, 1, sheen); }
    const { knot, gap, scratch } = SCUFFS[v];
    if (scuffs >= 1) s.rect(knot[0], knot[1], 2, 2, seam);
    if (scuffs >= 2) s.rect(gap[0], gap[1], 6, 2, seam);
    if (scuffs >= 3) crack(s, scratch[0], scratch[1], scratch[2], 5, seam, { seed: v + 5, clip: inner, branch: false, jag: 0.3 });
  }));

  // ---- the wall ----
  const cap = C.cap, capJoint = C.capJoint, capLit = C.capLit;
  const rim = Math.max(1, Math.round(E / 2));
  // (the code drew its highlight only on a cap no brighter than 0.85: capGlint is that highlight, or the cap itself)
  const capFill = lazy(() => patternFill(cap, (s) => { drawCourses(s, COPING, { joint: capJoint, lit: busy >= 0.5 ? C.capGlint : null, glint: 3, shift: courseShift(COPING.map((c) => c.h)).shift }); }));
  const faceBody = C.faceBody, faceTop = C.stone, faceJoint = stone.dark;
  const mossFoot = C.mossFoot;
  const footMoss = FOOT_MOSS.map((h) => h + (worn >= 0.5 && h ? 1 : 0));
  const face = (rows) => coursedFace({
    rows, course: FACE_COURSE, joints: FACE_JOINTS, body: faceBody, top: faceTop, lit: busy >= 0.25 ? Infinity : 1, joint: faceJoint,
    foot: footMoss, footColour: mossFoot, footTip: C.growth, chips: worn >= 0.6 ? CHIPS : [],
  });
  const wall = (rows) => ({
    ink: INK,
    round: 1,
    fill: (x, y) => capFill()(x, y),
    top: { depth: E, inset: (u) => (worn >= 0.5 && nicked(u) ? 1 : 0), paint: (d) => (d <= rim ? capLit : null) },
    right: { depth: E, paint: (d) => (d <= Math.max(1, rim - 1) ? capLit : null) },
    left: { depth: E, paint: (d) => (d <= rim ? capJoint : null) },
    face: { paint: face(rows), shadow: stone.deep },
  });

  const m = {
    cobble: {
      ink: null,
      round: E + 1,
      fill: (x, y, t, v) => paving[v ?? 0](x, y),
      top: edge('top', true), right: edge('right', true), bottom: edge('bottom', false), left: edge('left', false),
    },
    plank: { fill: (x, y, t, v) => boards[v ?? 0](x, y) },
    wallTall: wall(29), wallLow: wall(21),
  };
  kept = { key, m };
  return m;
}
// HAND CHANGE (speed only, no pixel changes): every version of a fill (and the cap's fill) is made on first use, so a tile does not make
// the versions it does not show (the code made them all for every tile); each version is drawn on its own as before
function lazy(make) { let v; return () => (v ??= make()); }
function lazyList(n, make) {
  const out = [], made = [];
  for (let i = 0; i < n; i++) Object.defineProperty(out, i, { get: () => (made[i] ??= make(i)) });
  return out;
}
const LOW_FACE = new Set(['strip-l', 'strip-m', 'strip-r', 'single']);

const BLOCK = ['left', 'top', 'right', 'side-l', 'fill', 'side-r', 'bottom-l', 'bottom', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br',
  'strip-l', 'strip-m', 'strip-r', 'col-t', 'col-m', 'col-b', 'single'];
/** The tiles of the village, in the code tileset's clip order (its clips' names): what tile.village@1's `piece` names. */
export const VILLAGE_PIECES = Object.freeze([
  ...BLOCK.flatMap((k) => (k === 'fill' ? ['cobble-fill', 'cobble-fill-b', 'cobble-fill-c'] : [`cobble-${k}`])),
  'plank-fill', 'plank-fill-b', 'plank-fill-c',
  ...BLOCK.map((k) => `wall-${k}`),
  'fence-h', 'fence-v', 'fence-post']);

/** Draws one tile of the village on a 32 x 32 Surface, as sprites/tiles-village.js rendered it: clip (a VILLAGE_PIECES name), t, p (style, edge, texture, wear), C (the colours, see the top). */
export function drawVillage(g, { clip, t, p, C }) {
  if (clip.startsWith('fence-')) return drawFence(g, clip, { wood: C.wood, worn: p.wear });
  const k = pieceOf(clip), m = materials(p, C);
  if (k.prefix === 'cobble') return drawSoftBlock(g, k.piece, m.cobble, t);
  if (k.prefix === 'plank') return drawBlock(g, k.piece, m.plank, t);
  return drawBlock(g, k.piece, LOW_FACE.has(k.piece) ? m.wallLow : m.wallTall, t);
}
