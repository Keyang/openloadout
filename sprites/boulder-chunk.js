// Boss rock: a lump of the golem's stone that tumbles one full turn per loop and shatters on a
// hit. The rock itself is the framework's `rock` (engine/fx.js): the shading stays put while the
// outline, the cracks and the moss patch go round, which is what shows the turn. The shatter is
// the framework's `rockBreak`: the same rock cut into wedges that fly apart, over chips and dust.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, PI, TAU } from '../engine/motion.js';
import { Surface } from '../engine/surface.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { rock, rockBreak, shards, puffs, starburst } from '../engine/fx.js';

const P = PALETTE.thornwood;
const C = 16;
const MOSS = swatches('thornwood', 'grass', { lead: 'moss' });
// Stone light enough to keep three tones, and never the moss's own colour.
const STONE = swatches('thornwood', 'stone').filter((c) => !MOSS.includes(c) && c !== P.cavern);
const SHAPES = {
  round: { sides: 9, jag: 0.16, squash: 1, k: 1.03 },
  jagged: { sides: 7, jag: 0.38, squash: 1, k: 1.14 },
  slab: { sides: 6, jag: 0.14, squash: 0.6, k: 1.16 },
};

export default defineSprite({
  id: 'boulder-chunk',
  name: 'Boss rock',
  kind: 'Item',
  blurb: 'A tumbling rock thrown by the moss golem, which shatters into shards and dust. Change its size, shape, moss, cracks, pieces and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'arcade'], view: 'side',
    words: ['rock', 'boulder', 'stone', 'chunk', 'rubble', 'throw', 'tumble', 'shatter', 'smash', 'boss attack', 'golem', 'mossy', 'heavy'], license: 'draft' },
  size: [32, 32],
  pivot: [C, C],
  grounded: false,
  preview: 'fly',
  sounds: { hit: [{ sound: 'golem-slam', preset: 'Boulder drop', frame: 0, volume: 0.7 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'jagged', 'slab']),
    mossy: toggle('Mossy', true),
    wear: range('Wear', 0.5, { lo: 'New', hi: 'Worn' }),
    pieces: range('Pieces', 0.5, { lo: 'Few', hi: 'Many' }),
    stone: color('Stone', P.stone, STONE),
    accent: color('Moss', P.moss, MOSS, { when: { mossy: [true] } }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, frame, p }) {
    const S = SHAPES[p.shape];
    const r = Math.min(13, lerp(6, 11, p.size) * S.k);
    const cracks = Math.round(lerp(1, 4, p.wear)), chips = Math.round(lerp(0, 3, p.wear));     // even a new rock has one seam: it shows the turn
    const lump = { x: C, y: C, r, seed: 4, sides: S.sides, jag: S.jag, squash: S.squash, colour: p.stone, chips, patch: p.mossy ? { colour: p.accent, size: 0.62, at: 3.6 } : null, box: [2, 2, 30, 30] };

    if (clip === 'fly') {
      rock(g, { ...lump, angle: TAU * t, cracks });
      g.outline(INK);
      return;
    }

    // ---- hit ----
    // The same rock, cut into wedges (the framework's `rockBreak`): frame 0 is the whole rock with a white flash in the
    // cuts, frame 1 the wedges just parted, so the break starts at the rock's own size and only grows from there.
    const wedges = Math.round(lerp(3, 6, p.pieces));
    const broken = { ...lump, pieces: wedges, turn: 0.5, uneven: 0.6, dist: 8, gravity: 5 };
    if (frame === 0) {
      rockBreak(g, { ...broken, t: 0, seam: '#ffffff' });
      g.outline(INK);
      starburst(g, { x: C - 0.5, y: C - 0.5, count: wedges, turn: 0.4, r1: r * 0.6, width: r * 0.3, colour: '#ffffff' });
      return;
    }
    const k = lerp(0.1, 1, (frame - 1) / 6);             // frames 1 to 7: the pieces fly, already a little apart
    const tones = ramp(p.stone), dust = [tones.light, tones.base, tones.dark];     // the rock's own three tones
    puffs(g, { t: k, x: C, y: C + 1, count: 5, seed: 3, stagger: 0.1, angle: PI, arc: TAU, dist: r * 0.95, rise: 3, size: r * 0.36, colours: dust });
    // the pieces are solid, so they get the ink outline; the dust behind them does not. Small chips first, the wedges over them.
    const bits = new Surface(32, 32);
    shards(bits, { t: k, x: C, y: C, count: Math.round(lerp(2, 5, p.pieces)), seed: 7, dist: 13, gravity: 7, size: Math.min(8, r * 0.85), colour: p.stone, box: [2, 2, 30, 30] });
    if (p.mossy) shards(bits, { t: k, x: C, y: C - 1, count: 2, seed: 9, dist: 11, gravity: 5, size: Math.min(5, r * 0.5), colour: p.accent, box: [2, 2, 30, 30] });
    bits.outline(INK);
    g.blit(bits);
    const big = new Surface(32, 32);
    rockBreak(big, { ...broken, t: k });
    big.outline(INK);
    g.blit(big);
  },
});
