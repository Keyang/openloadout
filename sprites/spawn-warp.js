// Spawn warning: shows where an enemy is about to appear, lying flat on the floor. `warn` loops: a ring that pulses
// twice a loop (a click on each pulse) while its tick marks turn round it. `burst` (Open): the ring snaps wide and a
// column of light flashes up out of it. `close`: it shrinks to a dot. The ring, its marks and the tear are the
// framework's (engine/fx-floor.js: floorRing, lightShape, riftIn), the column is engine/fx.js's beam; this file is
// the three styles and the timing of the three clips.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, keys, easeIn, fract, hash, TAU, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { ellipseIn } from '../engine/surface.js';
import { steps, beam } from '../engine/fx.js';
import { floorRing, lightShape, riftIn } from '../engine/fx-floor.js';

const D = PALETTE.derelict;
const CX = 24, CY = 24;
const SQUASH = 0.66;                                     // the floor as the three-quarter camera sees it
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('derelict', 'edge', { lead: 'red' });
const CORE = [D.cream, D.suit, D.steel, D.gold, D.chitin].filter((c) => !EDGE.includes(c));
const RINGS = { one: 1, two: 2, three: 3 };
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

/**
 * What the mark looks like on this frame: the outer ring (r, thick, heat, and gaps / open / phase when it breaks up), the
 * rings that travel inside it (pings: each a radius), the tick marks (ticks: their radius and turn), and for `burst` the
 * flash and the column of light.
 */
function stateOf(clip, t, frame, p) {
  const R = lerp(11, 17, p.size), n = RINGS[p.rings];    // the outer ring, across
  if (clip === 'burst') {
    // 0: a white flash fills the ring; 1: the ring snaps wide and the column shoots up; then both thin and break up
    const wide = Math.min(R * 1.25, 21.5), r = keys(t, [[0, R], [0.14, wide], [1, wide]]);
    return {
      r, thick: t < 0.3 ? 3 : t < 0.75 ? 2 : 1, heat: 1 - 1.25 * t, gaps: t > 0.5 ? 5 : 0, open: clamp((t - 0.45) * 1.5, 0, 0.7), phase: 0.4,
      pings: t > 0 && t < 0.5 ? Array.from({ length: n - 1 }, (_, j) => r * lerp(0.45 + 0.2 * j, 0.8, t / 0.5)) : [],
      ticks: t < 0.6 ? { r: Math.min(r + 4 + 3 * t, 22.4), turn: 0, thick: t < 0.3 ? 2 : 1 } : null,
      flash: frame === 0, done: t >= 1, tear: 1,
      column: frame === 0 ? null : { h: keys(t, [[0.14, 23], [0.45, 23], [0.85, 16], [1, 6]]), w: Math.max(2, Math.round(lerp(8, 12, p.size) * keys(t, [[0.14, 1], [0.3, 1], [0.75, 0.5], [1, 0.25]]))), solid: keys(t, [[0.14, 1], [0.3, 0.8], [0.7, 0.2], [1, 0]]), phase: t * 3, cool: clamp((t - 0.3) * 1.4) },
    };
  }
  if (clip === 'close') {
    const r = lerp(R, 0, easeIn(t));
    return { r, thick: t < 0.7 ? 2 : 1, heat: 1 - 0.5 * t, gaps: 0, open: 0, phase: 0, pings: t < 0.6 ? Array.from({ length: n - 1 }, (_, j) => r * (0.6 - 0.25 * j) * (1 - t)) : [], ticks: t < 0.45 ? { r: r + 4, turn: -TAU * t * 0.2, thick: t < 0.25 ? 2 : 1 } : null, tear: 1 - t, dot: t >= 1 };
  }
  // warn: two pulses a loop, on frames 0 and 4. On each one the ring is at its hottest and a ring sets out from the
  // middle to meet it; a wild one breaks into dashes between the pulses.
  const beat = 0.5 + 0.5 * Math.cos(2 * TAU * t);
  const open = 0.6 * p.flicker * (1 - beat) ** 2;          // how much of the ring drops out between the pulses
  return {
    r: R, thick: 2, heat: beat, gaps: open >= 0.1 ? 5 : 0, open, phase: TAU * hash(frame, 5),
    pings: Array.from({ length: n - 1 }, (_, j) => fract(2 * t + j / Math.max(1, n - 1))).filter((u) => u > 0.1).map((u) => lerp(3.5, R - 3, u)),      // on the pulse itself the last one has just reached the big ring
    ticks: { r: R + 4, turn: (TAU * t) / p.pieces, thick: 2 }, tear: lerp(0.5, 1, beat),
  };
}

export default defineSprite({
  id: 'spawn-warp',
  name: 'Spawn warning',
  kind: 'Effect',
  blurb: 'A warning ring on the floor where an enemy is about to appear: it pulses, snaps open with a column of light, and closes to a dot. Change its size, style, rings, tick marks, colours and flicker.',
  meta: { type: 'effect', role: 'effects/magic', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['spawn', 'warning', 'warp', 'teleport', 'portal', 'ring', 'marker', 'telegraph', 'summon', 'appear', 'rift', 'beacon', 'danger'], license: 'draft' },
  size: [48, 48],
  pivot: [CX, CY],
  grounded: false,
  sounds: {
    warn: [{ sound: 'tech-click', preset: 'Hover', frame: 0, volume: 0.6 }, { sound: 'tech-click', preset: 'Hover', frame: 4, volume: 0.6 }],
    burst: [{ sound: 'warp-out', preset: 'Spawn in', frame: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'ring', ['ring', 'hex', 'rift']),
    rings: choice('Rings', 'two', ['one', 'two', 'three']),
    pieces: range('Ticks', 8, { min: 4, max: 12, step: 1, lo: 'Few', hi: 'Many' }),
    core: color('Core', D.cream, CORE),
    edge: color('Edge', D.red, EDGE, { material: 'warning' }),   // a spawn warning: a look must leave it as loud as it is
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    warn: { frames: 8, fps: fps(10), loop: true },
    burst: { label: 'Open', frames: 8, fps: fps(14), loop: false },
    close: { frames: 6, fps: fps(14), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core, white: false });            // [core, middle, edge, rim]
    const [core, , edge] = C, rim = C[3];
    const S = stateOf(clip, t, frame, p);
    const hex = p.style === 'hex', rift = p.style === 'rift';
    const sides = hex ? 6 : 0;
    const spent = S.done ? [rim, rim] : C;                              // the last frame of `burst`: only its dark remains
    const flat = { x: CX, y: CY, squash: SQUASH, sides };

    if (S.dot) {                                                        // `close` ends on a dot
      lightShape(g, ellipseIn(CX, CY, 2.6, 1.6), { colours: C, heart: core });
      return;
    }
    // the rings that travel from the middle out to the big one: thin, and a rift's are broken
    for (const r of S.pings) if (r >= 3) floorRing(g, { ...flat, r, thick: 1, colours: [edge, edge], rim: false, gaps: rift ? 3 : 0, open: 0.3, phase: 1 - r * 0.2 });
    // the big ring; a rift's is always broken, and its breaks travel round
    floorRing(g, { ...flat, r: S.r, thick: S.thick, colours: spent, heat: S.heat, rim: S.done ? false : undefined,
      gaps: rift ? Math.max(3, S.gaps) : S.gaps, open: rift ? Math.max(0.25, S.open) : S.open, phase: rift && !S.gaps ? TAU * t / 3 : S.phase });
    // the tick marks: blocks that stand round the ring, as far from it above and below as at the sides, and turn
    if (S.ticks) floorRing(g, { x: CX, y: CY, squash: (S.r * SQUASH + S.ticks.r - S.r) / S.ticks.r, r: S.ticks.r, thick: S.ticks.thick, colours: [edge, edge], rim: false, gaps: p.pieces, open: 0.68, phase: S.ticks.turn });
    // frame 0 of `burst`: a white flash that fills the ring
    if (S.flash) lightShape(g, ellipseIn(CX, CY, S.r - 3, (S.r - 3) * SQUASH), { colours: [core, edge], heart: '#ffffff', inset: 2 });
    if (S.column) {
      const hot = S.column.cool < 0.34 ? [core, core] : S.column.cool < 0.67 ? [core] : [];      // it starts at the core colour and cools to the edge colour
      beam(g, { x: CX, y: CY + 1, w: S.column.w, h: S.column.h, phase: S.column.phase, solid: S.column.solid, dash: 3, gap: 2, seed: 4, colours: [...hot, ...C.slice(1)] });
    }
    if (rift && S.r >= 5) {
      // the tear: a jagged crack of light standing over the middle of the ring, which gapes on every pulse
      const tall = Math.min(S.r * 1.5, 21);
      const tear = riftIn(CX, CY + 1 - tall / 2, tall, Math.min(S.r * 0.62, 10), { seed: 2, teeth: 3, jag: 0.5, open: clamp(S.tear), angle: PI / 2 });
      lightShape(g, tear, { colours: spent, rim: S.done ? false : undefined, heart: S.done ? null : S.flash ? '#ffffff' : core });
    }
  },
});
