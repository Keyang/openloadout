// Teleport beam: a character leaving or arriving (the game hides or shows the body). `burst` (Leave): a column of
// light at its brightest on frame 0 lifts off the floor, breaks into dashes that run upward and thins away, ending on
// a ring of pixels on the floor. `arrive` runs the other way: it starts from those pixels, light gathers down into
// the column, flashes on frame 6 and settles back to a faint ring. Three styles: a column, hoops rising, or sparks
// streaming up. The column is engine/fx.js's beam and glow, the floor ring engine/fx-floor.js's floorRing, the hoops
// engine/shapes.js's hoopIn painted with lightShape, the sparks engine/spells.js's motes; this file is the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, keys, hash, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, beam, glow } from '../engine/fx.js';
import { floorRing, lightShape } from '../engine/fx-floor.js';
import { hoopIn } from '../engine/shapes.js';
import { motes } from '../engine/spells.js';

const P = PALETTE.thornwood;
const CX = 32, FLOOR = 61;                               // the beam stands on row 61
const BOX = [1, 1, 63, FLOOR + 1];
// The core runs up the middle of the beam, so the two controls never offer the same colour.
const EDGE = [...swatches('thornwood', 'edge', { lead: 'magic' }), P.gold, PALETTE.derelict.cyan];
const CORE = [P.cream, P.sky, P.goblin, P.steel, P.skin].filter((c) => !EDGE.includes(c));
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

// The column's state on each frame of `burst` (Leave); `arrive` reads it backwards, with its flash on frame 6.
// lift: how far its foot has left the floor (share of its height); w: share of its width; solid: unbroken share.
const LEAVE = [
  { lift: 0, w: 1, solid: 1, flash: 1 },
  { lift: 0, w: 1, solid: 0.7, flash: 0.5 },
  { lift: 0.05, w: 0.85, solid: 0.45 },
  { lift: 0.15, w: 0.7, solid: 0.25 },
  { lift: 0.3, w: 0.55, solid: 0.1 },
  { lift: 0.45, w: 0.45, solid: 0 },
  { lift: 0.6, w: 0.35, solid: 0 },
  { lift: 0.75, w: 0.25, solid: 0 },
  { lift: 0.9, w: 0.15, solid: 0 },
  null,
];
const ARRIVE = [null, { drop: 0.85, w: 0.2 }, { drop: 0.6, w: 0.35 }, { drop: 0.35, w: 0.55 }, { drop: 0.15, w: 0.75, solid: 0.2 },
  { drop: 0, w: 0.9, solid: 0.6 }, { drop: 0, w: 1, solid: 1, flash: 1 }, { drop: 0, w: 0.75, solid: 0.5, flash: 0.4 }, { drop: 0, w: 0.4, solid: 0.2, short: 0.35 }, null];

export default defineSprite({
  id: 'teleport-beam',
  name: 'Teleport beam',
  kind: 'Effect',
  blurb: 'A column of light that carries a character away or sets one down: it lifts off and breaks into rising dashes, hoops or sparks, then comes back down with a flash. Change its height, width, style, pieces, colours and flicker.',
  meta: { type: 'effect', role: 'effects/magic', themes: ['neutral', 'sci-fi', 'fantasy'], gameTypes: ['platformer', 'roguelike-action', 'top-down-rpg', 'shooter'], view: 'side',
    words: ['teleport', 'beam', 'warp', 'transport', 'leave', 'arrive', 'appear', 'vanish', 'blink', 'column', 'light', 'portal', 'beam up'], license: 'draft' },
  size: [64, 64],
  pivot: [32, 62],
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    width: range('Width', 0.5, { lo: 'Narrow', hi: 'Wide' }),
    style: choice('Style', 'column', ['column', 'rings', 'sparks']),
    pieces: range('Pieces', 5, { min: 3, max: 8, step: 1, lo: 'Few', hi: 'Many', when: { style: ['rings', 'sparks'] } }),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.magic, EDGE),
    flicker: range('Flicker', 0.5, { lo: 'Steady', hi: 'Wild', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { label: 'Leave', frames: 10, fps: fps(16), loop: false },
    arrive: { frames: 10, fps: fps(16), loop: false },
  },
  sounds: {
    burst: [{ sound: 'warp-out', preset: 'Warp out', frame: 0, volume: 0.8 }],
    arrive: [{ sound: 'warp-out', preset: 'Teleport blink', frame: 0, volume: 0.8 }],
  },
  versions: [
    { name: 'Beam out', params: {} },
    { name: 'Hoop lift', params: { style: 'rings', edge: P.gold } },
    { name: 'Spark cloud', params: { style: 'sparks', edge: P.thorn } },
    { name: 'Wide beam', params: { width: 1, size: 1 } },
    { name: 'Red warp', params: { edge: P.crimson } },
  ],

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core });                         // [white, core, mid, edge, rim]
    const soft = C.slice(1);                                           // the same without the white
    const H = Math.round(lerp(34, 56, p.size));                        // how tall the column stands
    const W = lerp(9, 18, p.width);                                    // how wide it is at its brightest
    const R = W * 0.5 + 4;                                             // the floor ring round its foot
    const leave = clip === 'burst';
    const k = leave ? t : 1 - t;                                       // 0: the beam in full, 1: only the floor ring left
    // flicker: on every frame the light jumps a little in width and its dashes skip
    const jig = (hash(frame, leave ? 3 : 4) - 0.5) * 2 * p.flicker;
    const S = leave ? LEAVE[frame] : ARRIVE[frame];

    // the ring of light on the floor: whole while the beam stands on it, broken into a ring of pixels at the ends
    const ends = !S;
    const ring = { x: CX, y: FLOOR - 1, r: R + (S && S.flash ? 2 : 0), squash: 0.3, colours: ends ? soft.slice(1) : C, box: BOX };
    if (ends) floorRing(g, { ...ring, thick: 1, gaps: 8, open: 0.55, phase: 0.3 + jig * 0.3, rim: false });
    else floorRing(g, { ...ring, thick: S.flash ? 3 : 2, heat: S.flash ? 1 : 0.5 });

    // the column itself (every style has it on its brightest frames; the column style keeps it all the way)
    const column = (s, foot, top, colours) => {
      const w = Math.max(1, Math.round(W * s.w + jig * 1.5));
      const y = FLOOR - foot, h = Math.max(2, top - foot);
      beam(g, { x: CX + (w % 2 ? 0.5 : 0), y, w, h, phase: frame / 2 + jig * 0.5, dash: 3, gap: 2 + Math.round(p.flicker * 2), solid: s.solid ?? 0, seed: 6, colours, box: BOX });
    };
    if (S && (p.style === 'column' || (S.solid ?? 0) >= 0.5)) {
      const foot = Math.round(H * (leave ? S.lift : S.drop)), top = Math.round(H * (S.short ?? 1));
      column(S, foot, Math.max(foot + 2, top), foot > 0 ? soft : C);
    }
    if (S && S.flash) glow(g, CX, FLOOR - 1, lerp(5, 8, p.width) * (S.flash > 0.7 ? 1 : 0.6), S.flash > 0.7 ? C : soft, { box: BOX });

    if (p.style === 'rings') {
      // hoops rise up the column one after another, shrinking as they climb
      for (let i = 0; i < p.pieces; i++) {
        const u = k * 1.5 + 0.08 - (i / p.pieces) * 0.7;               // this hoop's progress: they set off one after another
        if (u <= 0 || u >= 1) continue;
        const y = FLOOR - 2 - u * (H - 4), rx = W * 0.5 + 3 - 4 * u, ry = Math.max(2, rx * 0.38);
        lightShape(g, hoopIn(CX, y, rx + jig * 0.5, ry, 1), { colours: u < 0.4 ? C.slice(0, -1) : soft, rim: u < 0.7, box: BOX });
      }
    } else if (p.style === 'sparks') {
      // sparks stream up out of the floor ring (arrive: the same stream, run backwards, so they fall into it)
      motes(g, { t: clamp(k * 1.1), x: CX, y: FLOOR - 2, count: p.pieces + 2, seed: 9, loop: false, stagger: 0.4, rise: H, width: W + 4, size: 3, shape: 'plus', sway: 1 + p.flicker, colours: C.slice(1), box: [1, 1, 63, FLOOR - 1] });
    }
  },
});
