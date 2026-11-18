// Scenery: the things a backdrop is furnished with, and the ground of a battle screen (docs/style-guide.md
// section 7). Added with batch R19 (sprites/bg-battle-field.js and sprites/bg-battle-dungeon.js, the worked
// examples). Everything wraps at 320 px the way the backdrop helper's own pieces do, and is used with them:
// scatter, wrapped, recede, standOut, fillBelow, fillBetween, tidy.
//
//   import { fillBelow, fillBetween, recede, standOut, tidy } from '../engine/backdrop.js';
//   import { BATTLE, standApart, standOutLighter, roundTree, farHouse, railFence, tufts, groundMarks, arcade, pillar, wallTorch, wallRing, lightPatch, pavedFloor, moon, cloudBank } from '../engine/scenery.js';
//
//   const apart = standApart(p.time === 'night');                     // one standOut for all the layers of a backdrop
//   const bank = apart(recede(p.land, 0.3, sky.air), [hill]);
//   const floor = standOutLighter(recede(p.floor, 0, dark), [column]);                // a dark backdrop: nearer is lighter
//   moon(g, 284, 42, 9, sky.glow, mix(sky.glow, sky.bands[0], 0.28));                // far: a full moon with its craters
//   cloudBank(g, scatter(6, 12, { stable: true }).map((c) => ({ x: c.x, y: 12 + Math.round(c.v * 8) * 5, w: 40, seed: c.i })), sky.cloud, sky.cloudShade);   // far: clouds that may overlap
//   roundTree(g, x, foot, { height: 50, tones: leaves, wood });       // mid: a round tree on its trunk
//   farHouse(g, x, foot, { width: 14, tones: { wall, roof } });       // far: a cottage small with distance
//   railFence(g, ground, { posts: 16, height: 11, colours: { wood, lit } });   // a post-and-rail fence along an outline
//   fillBetween(g, arcade({ count: 4, width: 50, crown: 36, spring: 66 }), () => 180, dark);   // far: a row of arches
//   pillar(g, x, { top: 0, bottom: 126, width: 20, tones: stone });   // mid: a pillar with a capital and a foot
//   lightPatch(g, x, y, 22, [outer, inner], { level });               // the patch of wall a torch lights
//   wallTorch(g, x, y, { t, iron, colours: steps(p.glow, { white: false }) });
//   wallRing(g, x, y, { links: 3, colour: iron.base });               // a ring and chain on a pillar that has no torch
//   pavedFloor(g, { top: BATTLE.ground, courses: [{ h: 5, period: 32 }, ...], colours: { body, joint } });   // near
//   fillBelow(g, tufts({ base: BATTLE.ground, count: 26, seed: 3 }), grass);         // near: a tufted edge of grass
//   groundMarks(g, { top: 140, bottom: 178, clear: [146, 153], colours: { dark } });   // near: scuffs, feet rows left calm
//
// A battle backdrop's near layer is the ground the fighters stand on: BATTLE.ground (row 132) is where it becomes
// opaque and BATTLE.feet (row 150) is the row their feet stand on. Keep the rows round the feet calm.
//
// Rules of the style guide these keep for you: nothing here is narrower than 2 px across the way a layer scrolls,
// nothing is outlined, a thing that hangs over the right edge comes back in on the left, and the same input gives
// the same pixels. What they cannot keep: every colour you pass must already be receded and stood out.
//
// Pure JavaScript, no state. They draw with the Surface's own calls only; wallTorch draws the flame of engine/fx.js
// on a small layer of its own and pastes it (pixel styles only, like every flame).

import { Surface } from './surface.js';
import { hash, lerp, clamp, PI } from './motion.js';
import { tone, brightness, col } from './color.js';
import { PALETTES, applyColour } from './theme.js';
import { LAYER, wrapX, wrapped, scatter, standOut, canopy, treeline, disc, cloud } from './backdrop.js';
import { flame } from './fx.js';

const [W, H] = LAYER;
const asOutline = (base) => (typeof base === 'function' ? base : () => base);

/** The two rows of a battle backdrop (style guide section 7): `ground`, where the near layer becomes opaque (132), and `feet`, the row the fighters' feet stand on (150). No arguments: a frozen object. */
export const BATTLE = Object.freeze({ ground: 132, feet: 150 });

/**
 * Returns the standOut to use for every layer of one backdrop: the full one in daylight (a step of value that survives every whole-bundle palette), a gentler one under a dark sky, where the land is only a small step lighter than the night.
 * Arguments: dark (true under a night sky); floor (a brightness, 0 to 1, default 0: when the full standOut would take a colour below it, towards the outline colour, the colour keeps a plain step of 0.1 from what is behind it instead).
 * Returns apart(colour, sure, also): sure = the colours it must never merge with, also = the colours it only keeps a step of brightness from.
 */
export const standApart = (dark = false, floor = 0) => (colour, sure = [], also = []) => {
  if (dark) return standOut(colour, [], { also: [...sure, ...also], step: 0.05 });
  const out = standOut(colour, sure, { also });
  return brightness(out) < floor ? standOut(colour, [], { also: [...sure, ...also], step: 0.1 }) : out;
};

// What a colour becomes under each of the site's colour palettes (engine/theme.js), worked out once.
const underPalette = new Map();
function inPalettes(hex) {
  let v = underPalette.get(hex);
  if (v === undefined) { v = PALETTES.map((pal) => applyColour(new Uint32Array([col(hex)]), { palette: pal.name })[0]); underPalette.set(hex, v); }
  return v;
}
const lifted = new Map();

/**
 * The standOut of a dark backdrop (a dungeon, a cave, a hall at night), where each nearer layer is LIGHTER than the one behind it: makes a colour lighter until it is a clear step of value brighter than what it is seen against and stays a different colour under every whole-bundle palette.
 * Arguments: colour ('#rrggbb'); behind (the colours it must never merge with); { step (the lead in brightness it needs, default 0.08), also (colours it only keeps that lead from) }.
 * Returns '#rrggbb': the colour itself when it stands out already. backdrop.js standOut moves a colour darker whenever what is behind it is brighter than half-way, which a pale pillar behind a floor is; this one only ever goes lighter.
 */
export function standOutLighter(colour, behind = [], { step = 0.08, also = [] } = {}) {
  if (!behind.length && !also.length) return colour;
  const key = `${colour}|${behind.join('|')}|${also.join('|')}|${step}`;
  let out = lifted.get(key);
  if (out !== undefined) return out;
  const theirs = behind.map(inPalettes), need = Math.max(...[...behind, ...also].map((c) => brightness(c))) + step - 1e-9;
  const clear = (c) => {
    if (brightness(c) < need) return false;
    const mine = inPalettes(c);
    for (const t of theirs) for (let k = 0; k < mine.length; k++) if (mine[k] === t[k]) return false;
    return true;
  };
  out = colour;
  for (let k = 1; k <= 48 && !clear(out); k++) out = tone(colour, k * 0.06);
  lifted.set(key, out);
  return out;
}

/**
 * Draws a round tree on its trunk for the middle distance: a trunk that widens at the root with a shadow down its left side, under a mass of leaves in three tones; wraps at 320 px.
 * Arguments: g: the Surface; x: the column of the root; foot: the row it stands on;
 * { height (px from the foot to about the top of the crown, default 48), crown (radius of the leaves, default 0.36 of the height), trunk (px wide, default 5), lean (px the crown stands to the side of the root),
 * tones: { light, base, dark } for the leaves, wood: { base, dark } for the trunk (all already receded), seed (the shape of the crown) }.
 */
export function roundTree(g, x, foot, { height = 48, crown, trunk = 5, lean = 0, tones, wood, seed = 0 } = {}) {
  const r = crown ?? height * 0.36, cy = Math.round(foot - height + r * 0.95), w = Math.max(3, Math.round(trunk)), band = Math.max(1, Math.round(w * 0.4));
  wrapped(Math.round(x), r * 1.2 + Math.abs(lean) + w + 4, (cx) => {
    const lt = cx + lean - w / 2, rt = cx + lean + w / 2, lb = cx - w / 2, rb = cx + w / 2, knee = foot - Math.min(4, Math.round(height * 0.08));
    g.poly([[lt, cy], [rt, cy], [rb, knee], [rb + 2, foot + 1], [lb - 2, foot + 1], [lb, knee]], wood.base);
    g.poly([[lt, cy], [lt + band, cy], [lb + band, knee], [lb - 2 + band, foot + 1], [lb - 2, foot + 1], [lb, knee]], wood.dark);
  });
  canopy(g, x + lean, cy, r, tones, seed);
  return g;
}

/**
 * Draws a cottage made small by distance: a low wall under a broad roof that overhangs it, a door, and if wanted a chimney and a lit window; no outline; wraps at 320 px.
 * Arguments: g: the Surface; x: its middle column; foot: the row it stands on;
 * { width (px across the walls, default 14), wall (px high, default 5), roof (px high, default 6), chimney (true: a stack on the right of the roof),
 * tones: { wall, roof, door (default the roof colour), window (a 2x2 light beside the door; left out: none) } }.
 */
export function farHouse(g, x, foot, { width = 14, wall = 5, roof = 6, chimney = false, tones } = {}) {
  const w = Math.max(8, Math.round(width));
  wrapped(Math.round(x), w / 2 + 4, (cx) => {
    const l = Math.round(cx - w / 2), eave = foot - wall, top = eave - roof;
    if (chimney) g.rect(l + w - 5, top - 2, 3, 4, tones.wall);
    g.rect(l, eave, w, wall, tones.wall);
    g.poly([[l - 2, eave + 1], [l + 2, top], [l + w - 2, top], [l + w + 2, eave + 1]], tones.roof);
    g.rect(l + Math.round(w * 0.3) - 1, foot - Math.min(wall - 1, 4), 3, Math.min(wall - 1, 4), tones.door ?? tones.roof);
    if (tones.window) g.rect(l + Math.round(w * 0.68) - 1, eave + 2, 2, 2, tones.window);
  });
  return g;
}

/**
 * Draws a post-and-rail fence standing on a ground outline across the whole layer: evenly spaced posts and rails that follow the ground from post to post; spans can be left open and rails left out; wraps at 320 px. Returns the posts [{ x, top, foot }].
 * Arguments: g: the Surface; ground: the row, or the outline x -> y, the posts stand on;
 * { posts (how many across the 320 px, default 16), height (px of the fence above the ground, default 11), post (px wide, default 3), rails (rows below the top of the fence where each rail starts, default [2, 6]), thick (px, default 2),
 * sink (px a post goes on below the ground line, default 3), open (spans with no rails and no post at their right end: a gateway; span i runs from post i to post i + 1), broken (list of [span, rail] left out), seed (which posts stand a pixel or two above the rest),
 * colours: { wood, lit (the top of each rail and post; left out: none), shade (the left side of each post; left out: none) } }.
 */
export function railFence(g, ground, { posts = 16, height = 11, post = 3, rails = [2, 6], thick = 2, sink = 3, open = [], broken = [], seed = 0, colours } = {}) {
  const at = asOutline(ground), n = Math.max(1, Math.round(posts)), pitch = W / n, gone = new Set(open.map((s) => ((s % n) + n + 1) % n));
  const list = [];
  for (let i = 0; i < n; i++) {
    const x = Math.round(i * pitch + pitch / 2), foot = Math.round(at(x + 0.5));
    list.push({ i, x, foot, top: foot - height - Math.round(hash(seed, i) * 1.6), there: !gone.has(i) });
  }
  // the rails first, so the posts stand in front of them
  for (let i = 0; i < n; i++) {
    if (open.includes(i)) continue;
    const a = list[i], b = list[(i + 1) % n], bx = b.x + (i === n - 1 ? W : 0);
    rails.forEach((dy, k) => {
      if (broken.some(([s, r]) => s === i && r === k)) return;
      for (let x = a.x; x <= bx; x++) {
        const y = Math.round(lerp(a.foot, b.foot, (x - a.x) / (bx - a.x))) - height + dy;
        g.rect(wrapX(x), y, 1, thick, colours.wood);
        if (colours.lit) g.rect(wrapX(x), y, 1, 1, colours.lit);
      }
    });
  }
  for (const p of list) {
    if (!p.there) continue;
    wrapped(p.x, post + 1, (cx) => {
      const l = cx - Math.floor(post / 2);
      g.rect(l, p.top, post, p.foot + sink - p.top, colours.wood);
      if (colours.shade) g.rect(l, p.top + 1, 1, p.foot + sink - p.top - 1, colours.shade);
      if (colours.lit) g.rect(l, p.top, post, 1, colours.lit);
    });
  }
  return list.filter((p) => p.there).map(({ x, top, foot }) => ({ x, top, foot }));
}

/**
 * Scatters small marks over a band of ground: scuffs (two short offset lines) and, if wanted, pebbles lit along the top, each at least 3 px wide and wider towards the front; a strip of rows can be kept clear for feet; wraps at 320 px.
 * Arguments: g: the Surface; { top, bottom (the rows of the band), count (default 12), seed, clear ([row, row]: no mark is drawn on these rows), pebbles (0..1: the share of marks that are pebbles, default 0),
 * colours: { dark (scuffs, and the underside of a pebble), stone, light (a pebble and its lit top; needed only with pebbles) } }. Marks keep their places when `count` changes.
 */
export function groundMarks(g, { top, bottom, count = 12, seed = 1, clear = null, pebbles = 0, colours } = {}) {
  for (const m of scatter(count, seed, { stable: true })) {
    let y = Math.round(lerp(top + 1, bottom - 4, m.v));
    if (clear && y >= clear[0] - 3 && y <= clear[1]) {
      // moved off the clear rows: up or down, whichever has room; a mark with room on neither side is left out
      const up = clear[0] - 4 - Math.round(m.u * 4), down = clear[1] + 2 + Math.round(m.u * 6), upFits = up >= top, downFits = down <= bottom - 4;
      if (!upFits && !downFits) continue;
      y = upFits && (m.u < 0.5 || !downFits) ? up : down;
    }
    const depth = clamp((y - top) / Math.max(1, bottom - top));
    const stone = m.w < pebbles && colours.stone;
    const w = stone ? 4 + Math.round(depth * 2) : Math.round(lerp(4, 8, depth) + m.u * 3);
    wrapped(m.x, w + 2, (x) => {
      if (stone) {
        g.rect(x, y + 1, w, 2, colours.stone); g.rect(x + 1, y, w - 2, 1, colours.stone);
        g.rect(x + 1, y, w - 2, 1, colours.light ?? colours.stone);
        g.rect(x, y + 3, w, 1, colours.dark);
      } else {
        g.rect(x, y, w, 1, colours.dark);
        g.rect(x + 2, y + 1, Math.max(3, w - 3), 1, colours.dark);
      }
    });
  }
  return g;
}

/**
 * The outline of a tufted edge of grass that repeats exactly across the 320 px: clumps of two or three narrow blades of different heights standing on a level line (or on another outline), bare line between them.
 * Arguments: { base (the row, or the outline x -> y, the grass stands on), count (clumps across the 320 px, default 26), seed, height (px of the tallest blade, default 6) }. Returns outline(x) for backdrop.js fillBelow and fillBetween.
 */
export function tufts({ base = BATTLE.ground, count = 26, seed = 1, height = 6 } = {}) {
  const at = [];
  for (const c of scatter(count, seed, { jitter: 0.8 })) {
    const n = c.w > 0.45 ? 3 : 2;
    for (let k = 0; k < n; k++) at.push({ x: c.x + (k - 1) * 3, u: hash(seed * 13 + c.i, 40 + k), v: 0 });
  }
  return treeline({ base, height, shape: 'pointed', width: 0.4, at });
}

/**
 * The outline of a row of round-headed openings (an arcade, a row of niches or windows) that repeats exactly across the 320 px: over an opening it gives the curve of its arch, over the piers between them the row `solid`.
 * Arguments: { count (openings across the 320 px; 2, 4, 5, 8 or 10 give spans of whole pixels), width (px across an opening), crown (the row of the top of an arch), spring (the row its curve starts from),
 * shift (px everything is moved to the right; at 0 a pier stands on the join), solid (the row returned over a pier, default far below the layer, so fillBetween fills nothing there) }. Returns outline(x) for backdrop.js fillBetween and fillBelow.
 */
export function arcade({ count = 4, width = 48, crown = 40, spring = 72, shift = 0, solid = 1e6 } = {}) {
  const n = Math.max(1, Math.round(count)), span = W / n, half = Math.min(width, span) / 2, rise = spring - crown;
  return (x) => {
    const u = wrapX(x - shift) / span, d = Math.abs(u - Math.floor(u) - 0.5) * span;      // how far from the middle of its opening
    return d >= half ? solid : crown + rise * (1 - Math.sqrt(1 - (d / half) ** 2));
  };
}

/**
 * Draws a stone pillar from its capital down to its foot in three tones, lit from the top right, with level joints across the shaft if wanted; wraps at 320 px. Returns { left, right, top, bottom }: the box of the shaft.
 * Arguments: g: the Surface; x: its middle column;
 * { top (the row of the top of the capital), bottom (the row the foot stands on), width (px across the shaft, default 18), capital, foot (px each juts out on both sides, default 4 and 5; 0: none),
 * courses (px between joints, default 0: a plain shaft), collars (rows, counted down from the capital, where a ring 4 px high goes round the shaft, jutting out 1 px; default none),
 * seed (which joints are left out, so no two pillars match), tones: { light, base, dark } }.
 */
export function pillar(g, x, { top = 0, bottom = H, width = 18, capital = 4, foot = 5, courses = 0, collars = [], seed = 0, tones } = {}) {
  const w = Math.max(6, Math.round(width)), shade = Math.max(2, Math.round(w * 0.22)), lit = Math.max(2, Math.round(w * 0.17));
  const capH = capital > 0 ? 6 : 0, footH = foot > 0 ? 9 : 0;
  let box = null;
  wrapped(Math.round(x), w / 2 + Math.max(capital, foot) + 3, (cx) => {
    const l = Math.round(cx - w / 2), y0 = top + capH, y1 = bottom - footH;
    g.rect(l, top, w, bottom - top, tones.base);
    g.rect(l, y0, shade, y1 - y0, tones.dark);
    g.rect(l + w - lit, y0, lit, y1 - y0, tones.light);
    if (courses > 0) {
      let k = 0;
      for (let y = y0 + 5 + courses; y < y1 - 4; y += courses, k++) {
        if (hash(seed * 17 + k, 3) < 0.3) continue;                    // a joint lost to the dark here and there
        g.rect(l + shade, y, w - shade - lit, 1, tones.dark);
      }
    }
    for (const dy of collars) {
      const y = y0 + dy;
      if (y + 4 > y1) continue;
      g.rect(l - 1, y, w + 2, 4, tones.base);
      g.rect(l - 1, y, w + 2, 1, tones.light);
      g.rect(l - 1, y + 3, w + 2, 1, tones.dark);
      g.rect(l - 1, y + 1, shade, 2, tones.dark);
    }
    if (capital > 0) {
      g.rect(l - capital, top, w + capital * 2, capH, tones.base);
      g.rect(l - capital, top, w + capital * 2, 3, tones.light);
      g.rect(l - capital + 2, top + capH, w + capital * 2 - 4, 3, tones.dark);
    }
    if (foot > 0) {
      g.rect(l - Math.ceil(foot / 2), y1, w + Math.ceil(foot / 2) * 2, 4, tones.base);
      g.rect(l - Math.ceil(foot / 2), y1, w + Math.ceil(foot / 2) * 2, 2, tones.light);
      g.rect(l - foot, y1 + 4, w + foot * 2, footH - 4, tones.base);
      g.rect(l - foot, y1 + 4, w + foot * 2, 2, tones.light);
      g.rect(l - foot, y1 + 6, shade + foot, footH - 6, tones.dark);
    }
    if (!box || (cx >= 0 && cx < W)) box = { left: l, right: l + w, top: y0, bottom: y1 };
  });
  return box;
}

/**
 * Draws a soft-edged patch of light on a wall or a floor: flat steps of colour, the widest first, each a blunt round patch inside the last with a slightly uneven edge; wraps at 320 px.
 * Arguments: g: the Surface; x, y: the lamp; r: the radius of the widest step, in px; colours: one colour per step, the widest (dimmest) first;
 * { level (0..1: how big it is at this moment, for a flame that flickers, default 1), squash (its height as a share of its width, default 1), seed (the unevenness of the edge), clip (a shape test (px, py) it stays inside) }.
 */
export function lightPatch(g, x, y, r, colours, { level = 1, squash = 1, seed = 0, clip = null } = {}) {
  const n = colours.length, a0 = hash(seed, 5) * 6.283, a1 = hash(seed, 6) * 6.283;
  wrapped(Math.round(x), r + 3, (cx) => {
    for (let j = 0; j < n; j++) {
      const rr = Math.max(1.5, r * (0.72 + 0.28 * clamp(level)) * (1 - (j / n) * 0.9));
      const inside = (px, py) => {
        const dx = px - cx, dy = (py - y) / squash, a = Math.atan2(dy, dx);
        const edge = rr * (1 + 0.025 * Math.sin(3 * a + a0) + 0.015 * Math.sin(5 * a + a1));
        return dx * dx + dy * dy <= edge * edge && (!clip || clip(px, py));
      };
      const reach = Math.ceil(rr * 1.12) + 1;
      g.fill(Math.floor(cx - reach), Math.floor(y - reach * squash), Math.ceil(cx + reach), Math.ceil(y + reach * squash), inside, colours[j]);
    }
  });
  return g;
}

/**
 * Draws a torch burning in a small iron cup on a wall or pillar, for a backdrop: the cup on its stem, and the rippling flame of engine/fx.js above it (no outline: it is light); wraps at 320 px.
 * Arguments: g: the Surface; x, y: the middle of the cup's rim (the foot of the flame);
 * { t (0..1 through the loop), size (1 = a flame about 11 px tall), cycles (whole ripples per loop, default 2), sway (px the tip moves sideways, default 1.2),
 * iron: { base, light } for the cup (left out: no cup), colours: the flame's colours, hottest first and its rim last (steps(colour, { white: false }) of engine/fx.js) }.
 */
export function wallTorch(g, x, y, { t = 0, size = 1, cycles = 2, sway = 1.2, iron = null, colours } = {}) {
  // the flame is drawn once on a layer of its own and pasted, so one that hangs over the join is the same on both sides of it
  const R = 12, fl = new Surface(R * 2 + 1, Math.ceil(11 * size * 1.15) + 8), fy = fl.h - 2;
  const length = 11 * size * (1 + 0.1 * Math.sin(2 * PI * (cycles * t + 0.1)));
  flame(fl, {
    t, x: R + 0.5, y: fy - 0.5, cycles, sway, heat: 0.55, colours,
    tongues: [{ angle: PI, length, width: 3.4 * Math.min(1, 0.6 + size * 0.4), phase: 0 }, { angle: PI - 0.12, length: length * 0.55, width: 1.9, phase: 0.4, sway: sway * 0.6, at: [-2, 0] }],
  });
  wrapped(Math.round(x), R + 1, (cx) => {
    if (iron) {
      g.rect(cx - 1, y + 3, 3, 7, iron.base);
      g.rect(cx - 4, y + 8, 6, 2, iron.base);
      g.rect(cx - 3, y, 7, 4, iron.base);
      g.rect(cx - 3, y, 7, 1, iron.light);
    }
    g.blit(fl, cx - R, y - fy);
  });
  return g;
}

/**
 * Draws an iron ring bolted to a wall or pillar with a short chain hanging from it, in one flat colour (no outline), for a backdrop; wraps at 320 px.
 * Arguments: g: the Surface; x, y: the bolt (the middle of the ring's top); { links (how many chain links hang below the ring, default 3), colour (the iron, already receded) }.
 */
export function wallRing(g, x, y, { links = 3, colour } = {}) {
  wrapped(Math.round(x), 6, (cx) => {
    g.rect(cx - 1, y - 2, 3, 3, colour);
    g.rect(cx - 3, y + 1, 7, 2, colour); g.rect(cx - 3, y + 6, 7, 2, colour);
    g.rect(cx - 3, y + 1, 2, 7, colour); g.rect(cx + 2, y + 1, 2, 7, colour);
    for (let k = 0; k < links; k++) {
      const ly = y + 8 + k * 4;
      g.rect(cx, ly, 1, 1, colour);
      g.rect(cx - 1, ly + 1, 3, 3, colour);
    }
  });
  return g;
}

/**
 * Draws a paved floor as a battle screen shows it, from the side and a little from above: courses of slabs, each with its own height and slab width, with the joints of a top-down paving pattern; wraps at 320 px.
 * Returns the slabs [{ x, y, w, h, course }]. The courses run from the back row down.
 * Arguments: g: the Surface; { top (the back row, default 132), bottom (default the bottom of the layer),
 * courses: [{ h (px high), period (px one repeat of the pattern takes: a divisor of 320 such as 32, 40, 64, 80, 160), shift (px to the right), upright (px width of its upright joints, default 2) }] from the back to the front,
 * joints (the columns of the upright joints in one 32 px repeat, one list per course in turn, as a tileset writes them; default the big slabs [[10, 29], [4, 20]]),
 * colours: { body, joint, lit (a line along the back edge of every course; left out: none), shade (some slabs are this colour, a shade off the body; left out: none) },
 * shaded (0..1: the share of slabs in the shade colour, default 0.2), clear ([row, row]: no slab that lies on these rows is shaded), seed (which slabs) }.
 */
export function pavedFloor(g, { top = BATTLE.ground, bottom = g.h, courses = [], joints = [[10, 29], [4, 20]], colours, shaded = 0.2, clear = null, seed = 0 } = {}) {
  const slabs = [];
  let y = top;
  courses.forEach((c, k) => {
    const h = Math.min(c.h, bottom - y);
    if (h <= 0) return;
    const period = c.period ?? 32, s = period / 32, cols = joints[k % joints.length], wide = c.upright ?? 2, shift = c.shift ?? 0;
    g.rect(0, y, W, h, colours.body);
    const xs = [];
    for (let x0 = 0; x0 < W; x0 += period) for (const j of cols) xs.push(wrapX(Math.round(x0 + j * s + shift)));
    xs.sort((a, b) => a - b);
    if (colours.shade && !(clear && y <= clear[1] && y + h > clear[0])) xs.forEach((x, i) => {
      if (hash(seed * 29 + k, i) >= shaded) return;
      const next = xs[(i + 1) % xs.length] + (i === xs.length - 1 ? W : 0);
      for (const dx of [0, -W]) g.rect(x + dx, y, next - x, h, colours.shade);
    });
    for (const x of xs) wrapped(x, wide + 1, (jx) => g.rect(jx, y, wide, h, colours.joint));
    g.rect(0, y, W, 1, colours.joint);
    if (colours.lit && h > 3) {
      g.rect(0, y + 1, W, 1, colours.lit);
      for (const x of xs) wrapped(x, wide + 1, (jx) => g.rect(jx, y + 1, wide, 1, colours.joint));
    }
    xs.forEach((x, i) => { const next = xs[(i + 1) % xs.length] + (i === xs.length - 1 ? W : 0); slabs.push({ x: x + wide, y: y + 1, w: next - x - wide, h: h - 1, course: k }); });
    y += h;
  });
  if (y < bottom) g.rect(0, y, W, bottom - y, colours.body);
  return slabs;
}

/**
 * Draws a full moon: a flat disc with three craters of different sizes inside it; wraps at 320 px.
 * Arguments: g: the Surface; x, y: its middle; r: its radius in px (the craters scale with it; from about 8 up they stay 3 px across or more);
 * colour: the moon (skyLook().glow at night); shadow: the craters, a shade off the moon towards the sky (left out: a darker tone of the moon);
 * { seed (0, the default: the usual three; any other number turns them round the middle and makes each a little bigger or smaller) }.
 */
export function moon(g, x, y, r, colour, shadow, { seed = 0 } = {}) {
  const dark = shadow ?? tone(colour, -0.35), turn = seed ? hash(seed, 91) * 2 * PI : 0, ca = Math.cos(turn), sa = Math.sin(turn);
  const craters = [[-0.33, -0.33, 0.267, 0.267], [0.44, 0.33, 0.29, 0.245], [0.22, -0.66, 0.167, 0.167]];      // middle and radii, as shares of the moon's radius
  x = Math.round(x); y = Math.round(y);
  disc(g, x, y, r, colour);
  wrapped(x, r + 1, (cx) => {
    const onMoon = (px, py) => (px - cx) ** 2 + (py - y) ** 2 <= r * r;
    craters.forEach(([dx, dy, rx, ry], i) => {
      const k = seed ? lerp(0.85, 1.15, hash(seed, 92 + i)) : 1;
      g.ellipse(cx + Math.round((dx * ca - dy * sa) * r), y + Math.round((dx * sa + dy * ca) * r), Math.max(1.5, rx * r * k), Math.max(1.5, ry * r * k), dark, { clip: onMoon });
    });
  });
  return g;
}

/**
 * Draws several flat-bottomed clouds (backdrop.js cloud) as one sky: where two overlap they join into one mass, and a cloud's shaded underside is left out wherever another cloud's body lies right under it, so no shade band cuts across a cloud; wraps at 320 px.
 * Arguments: g: the Surface; clouds: [{ x, y (the row of its flat underside), w (its width in px), seed (its bumps, default 0) }], in any order;
 * colour: the clouds; shade: their undersides (left out: none). Clouds that do not touch come out exactly as cloud() draws them one by one.
 */
export function cloudBank(g, clouds, colour, shade) {
  const body = new Surface(g.w, g.h);
  for (const c of clouds) cloud(body, c.x, c.y, c.w, colour, null, c.seed ?? 0);
  g.blit(body);
  if (!shade || col(shade) === col(colour)) return g;
  const one = new Surface(g.w, g.h), under = col(shade);
  for (const c of clouds) {
    const y = Math.round(c.y);
    cloud(one.clear(), c.x, c.y, c.w, colour, shade, c.seed ?? 0);
    for (let row = Math.max(0, y - 8); row < Math.min(g.h, y); row++) for (let px = 0; px < g.w; px++) {
      if (one.data[row * g.w + px] !== under) continue;
      if (body.get(px, y) || body.get(px, y + 1) || body.get(px, y + 2)) continue;      // another cloud's body right under this column: no shade here
      g.data[row * g.w + px] = under;
    }
  }
  return g;
}
