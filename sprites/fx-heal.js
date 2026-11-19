// Heal: a gentle battle effect played over an ally. A ring of light opens on the ground and small
// motes rise in a loose column, each fading at its own height; `loop` is the slow version for a
// lasting effect. No ink outline: light is rimmed with its own dark tone. The motes are the
// framework's (engine/spells.js `motes`), the ring, the glow and the column of light are
// engine/fx.js; this file is the timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, pulse } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, ring, glow, beam } from '../engine/fx.js';
import { motes } from '../engine/spells.js';

const P = PALETTE.hearthvale;
const CX = 32, FLOOR = 58;                               // the ground row: the ring lies on the rows above it
const ABOVE = [1, 1, 63, FLOOR];
// The core sits inside the edge colour, so the two controls never offer the same colour.
const EDGE = swatches('hearthvale', 'edge', { lead: 'heal' });
const CORE = [P.cream, P.thunder, P.skin, P.sky].filter((c) => !EDGE.includes(c));

// How tall the column of light is on each frame of `burst`, as a share of the rise: it wells up and sinks away.
const WELL = [0.25, 0.6, 0.9, 1, 0.85, 0.6, 0.35, 0.15, 0, 0];

export default defineSprite({
  id: 'fx-heal',
  name: 'Heal',
  kind: 'Effect',
  blurb: 'A healing spell: a ring of light opens on the ground and small motes rise and fade, once or as a lasting glow. Change its size, the motes and how high they rise, the ring and colours.',
  meta: { type: 'effect', role: 'effects/magic', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'roguelike-action', 'platformer'], view: 'side',
    words: ['heal', 'cure', 'restore', 'recover', 'regenerate', 'health', 'buff', 'blessing', 'spell', 'magic', 'rise', 'sparkle', 'gentle'], license: 'draft' },
  size: [64, 64],
  pivot: [CX, FLOOR],
  sounds: { burst: [{ sound: 'heal-shimmer', preset: 'Heal', frame: 0, volume: 0.8 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Motes', 6, { min: 4, max: 10, step: 1, lo: 'Few', hi: 'Many' }),
    rise: range('Rise', 0.5, { lo: 'Low', hi: 'High' }),
    style: choice('Style', 'plus', ['plus', 'leaf', 'star', 'heart']),
    rings: toggle('Ring', true),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.heal, EDGE, { material: 'signal' }),   // the colour says "healing": a look keeps it
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 10, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
    loop: { label: 'Regenerate', frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: true },
  },

  render(g, { clip, t, frame, p }) {
    const C = steps(p.edge, { core: p.core, white: false });            // [core, middle, edge, rim]
    const up = lerp(26, 50, p.rise);                                    // how high the highest mote climbs
    const wide = lerp(20, 34, p.size);                                  // the width of the column
    const r1 = lerp(14, 22, p.size);                                    // how far the ring opens
    const mote = { x: CX, y: FLOOR - 5, count: p.pieces, rise: up, width: wide, size: lerp(7.2, 11, p.size), shape: p.style, sway: 1.6, colours: C, box: ABOVE };
    const ringAt = { x: CX, y: FLOOR - 3, r0: 3, r1, thick: 3, squash: 0.3, seed: 4, colours: C, box: [1, 1, 63, FLOOR + 1] };

    if (clip === 'loop') {
      // the ring breathes, the column shimmers upward and every mote rises on its own timer
      if (p.rings) ring(g, { ...ringAt, t: 0.3 + 0.14 * pulse(t) });
      beam(g, { x: CX, y: FLOOR - 2, w: Math.round(wide * 0.3), h: up * 0.5, phase: t, dash: 2, gap: 3, solid: 0.15, seed: 2, colours: C, box: ABOVE });
      motes(g, { ...mote, t, loop: true, seed: 5 });
      return;
    }

    // ---- burst ----
    if (p.rings) ring(g, { ...ringAt, t });
    if (WELL[frame] > 0) beam(g, { x: CX, y: FLOOR - 2, w: Math.round(wide * 0.36), h: up * 0.75 * WELL[frame], phase: frame / 3, dash: 2, gap: 2, solid: 0.3, seed: 2, colours: C, box: ABOVE });
    // frame 0: the brightest moment, a soft white glow on the ground where the spell wells up
    if (frame === 0) glow(g, CX, FLOOR, lerp(6, 9, p.size), steps(p.edge, { core: p.core }), { box: ABOVE });
    else if (frame === 1) glow(g, CX, FLOOR, lerp(4, 6, p.size), C, { box: ABOVE });
    motes(g, { ...mote, t, loop: false, stagger: 0.5, seed: 5 });
  },
});
