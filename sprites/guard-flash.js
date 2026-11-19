// Block flash: a hit that was blocked or parried, drawn for a fighter facing right (the flash sits at the fighter's
// front, right of the frame's middle, and its sparks fly back to the right, towards the attacker; a game mirrors it
// for a fighter facing left). Frame 0 is the guard at full size and white; then sparks fly off and the guard breaks
// into arcs and dots. Three guards: a crescent of light, a six-sided barrier, or a cross of two strokes. The crescent
// is engine/spells.js's crescent, the barrier engine/fx-floor.js's floorRing, the cross and the sparks engine/fx.js's
// starburst, particles and glow; this file is the timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, starburst, glow } from '../engine/fx.js';
import { floorRing } from '../engine/fx-floor.js';
import { crescent } from '../engine/spells.js';

const P = PALETTE.thornwood;
const GX = 18, GY = 16;                                  // the middle of the guard: right of the frame's middle
// The core runs inside the guard, so the two controls never offer the same colour.
const EDGE = [...swatches('thornwood', 'edge', { lead: 'hero' }), P.steel, P.gold];
const CORE = [P.cream, P.sky, P.goblin, P.skin].filter((c) => !EDGE.includes(c));
// How much of the guard is left on each frame (1 whole, then breaking into pieces) and how bright it is.
const LEFT = [1, 1, 0.75, 0.5, 0.3, 0];

export default defineSprite({
  id: 'guard-flash',
  name: 'Block flash',
  kind: 'Effect',
  blurb: 'The flash of a blocked or parried hit: a crescent, a six-sided barrier or a cross of light that bursts white, throws sparks back at the attacker and breaks apart. Change its size, sparks, spread, style and colours.',
  meta: { type: 'effect', role: 'effects/spark', themes: ['neutral'], gameTypes: ['platformer', 'roguelike-action', 'arcade', 'turn-based-rpg'], view: 'side',
    words: ['block', 'parry', 'guard', 'deflect', 'clash', 'shield', 'barrier', 'spark', 'flash', 'defend', 'counter', 'ward'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 16],
  grounded: false,
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    pieces: range('Sparks', 5, { min: 3, max: 8, step: 1, lo: 'Few', hi: 'Many' }),
    spread: range('Spread', 0.5, { lo: 'Tight', hi: 'Wide' }),
    style: choice('Style', 'arc', ['arc', 'dome', 'cross']),
    core: color('Core', P.cream, CORE),
    edge: color('Edge', P.hero, EDGE),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    burst: { frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: {
    burst: [
      { sound: 'metal-hit', preset: 'Sword clash', frame: 0, volume: 0.8, when: { style: ['arc', 'cross'] } },
      { sound: 'shield-break', preset: 'Small crack', frame: 0, volume: 0.8, when: { style: ['dome'] } },
    ],
  },
  versions: [
    { name: 'Parry', params: {} },
    { name: 'Magic barrier', params: { style: 'dome', edge: P.magic } },
    { name: 'Steel cross', params: { style: 'cross', edge: P.steel } },
    { name: 'Perfect block', params: { size: 1, edge: P.gold } },
    { name: 'Small tick', params: { size: 0, pieces: 3 } },
  ],

  render(g, { t, frame, p }) {
    const C = steps(p.edge, { core: p.core });                       // [white, core, mid, edge, rim]
    const white = frame === 0;
    const left = LEFT[frame];
    const s = lerp(0.72, 1.12, p.size);
    const R = 10 * s;                                                 // half the guard's height

    // sparks fly back to the right, towards the attacker: the right-hand half of a ring of streaks flying outward
    if (frame > 0) {
      const u = (frame - 1) / 4, d = lerp(R * 0.55 + 2, lerp(10, 14.5, p.spread) * s, u), len = [5, 4, 3, 2, 1][frame - 1];
      const bend = lerp(0.35, 1, p.spread);                                // a tight spray keeps near the level
      starburst(g, { x: GX + 0.5, y: GY + 0.5, count: 2 * p.pieces, turn: PI / 2 + PI / (2 * p.pieces), r0: d, r1: d + len, width: 0.4, colour: frame < 3 ? C[1] : frame < 4 ? C[2] : C[3],
        box: [GX + 1, Math.round(GY - (d + len) * bend), 31, Math.round(GY + 1 + (d + len) * bend)] });
    }

    if (p.style === 'arc') {
      // a crescent bowing out towards the attacker; it breaks into three pieces that fly apart and thin
      const arc = (from, to, push, width) => crescent(g, { x0: GX - 3 + push, y0: GY - R, x1: GX - 3 + push, y1: GY + R, bulge: lerp(4, 6, (s - 0.72) / 0.4), width, from, to, head: 0.5, colours: white ? ['#ffffff', C[1], C[4]] : C.slice(1) });
      if (left === 1) arc(0, 1, frame, white ? 5 * s : 4 * s);
      else if (left > 0) {
        const gap = (1 - left) * 0.45, w = Math.max(1.2, 4 * s * left);
        arc(0, 0.33 - gap / 2, frame + 1, w); arc(0.33 + gap / 2, 0.67 - gap / 2, frame + 2, w); arc(0.67 + gap / 2, 1, frame + 1, w);
      } else for (const v of [-1, 0, 1]) glow(g, GX + 4 + (v ? 0 : 2), GY + v * R * 0.85, 0.5, [C[4]]);
    } else if (p.style === 'dome') {
      // a six-sided barrier seen face on; it cracks into arcs that drift apart
      const r = R + (1 - left) * 2;
      if (left > 0) floorRing(g, { x: GX, y: GY, r, squash: 1, sides: 6, turn: PI / 6, thick: white ? 3 : 2, heat: white ? 1 : left, gaps: left === 1 ? 0 : 6, open: (1 - left) * 0.8, phase: 0.4, colours: white ? ['#ffffff', '#ffffff', C[1], C[4]] : C.slice(1) });
      else for (let i = 0; i < 6; i++) glow(g, GX + Math.round(Math.sin(i * PI / 3 + PI / 6) * r), GY + Math.round(Math.cos(i * PI / 3 + PI / 6) * r), 0.5, [C[4]]);
    } else {
      // a cross of two strokes; its middle breaks out first, then the strokes shrink to their tips
      const cross = (o) => starburst(g, { x: GX + 0.5, y: GY + 0.5, count: 4, turn: PI / 4, ...o });
      const reach = R * 1.05;
      if (white) { cross({ r1: reach, width: 4.5 * s, colour: C[1], rim: C[3] }); cross({ r1: reach - 1.5, width: 4.5 * s - 1.8, colour: '#ffffff' }); }
      else if (left > 0) cross({ r0: reach * (1 - left) * 0.9, r1: reach + (1 - left) * 2, width: Math.max(0.4, 3 * s * left), colour: left > 0.6 ? C[2] : C[3], rim: left > 0.6 ? C[4] : null });
      else cross({ r0: reach + 1, r1: reach + 2.2, width: 0.4, colour: C[4] });
    }
    if (white) glow(g, GX, GY, 3 * s, C);                             // the white-hot point where the blow landed
  },
});
