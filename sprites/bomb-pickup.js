// Bomb (core-sprites-1, batch K02): a bomb to pick up and use later (an item, not the thrown
// projectile). A round iron ball with a collar and a curled fuse, a single stick wrapped with rope,
// or three sticks bound together; with the fuse lit its end flickers on every frame and spits two or
// three sparks. Collecting it is the standard pickup pop (engine/pickups.js). The three kinds are
// drawn by drawBomb in engine/munitions.js; this file gives them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp, hash, PI } from '../engine/motion.js';
import { INK, tone, mix } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { twinkle, particles, steps, glow } from '../engine/fx.js';
import { BOMB_KINDS, munitionReach, drawBomb } from '../engine/munitions.js';

const P = PALETTE.thornwood;
const CX = 16;
const ROCK = 0.07;                                // how far it rocks each way with the float, in radians
const FRAME = [1, 1, 31, 31];

export default defineSprite({
  id: 'bomb-pickup',
  name: 'Bomb',
  kind: 'Item',
  blurb: 'A floating bomb to pick up: an iron ball, a stick or a bundle of three, with a fuse that can burn and spark. Change the kind, fuse length, its size, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral', 'fantasy', 'dungeon'], gameTypes: ['top-down-rpg', 'platformer', 'arcade', 'roguelike-action'], view: 'front',
    words: ['bomb', 'explosive', 'dynamite', 'blast', 'fuse', 'spark', 'stick', 'collect', 'pickup', 'item', 'iron', 'boom'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', BOMB_KINDS),
    fuse: range('Fuse', 0.5, { lo: 'Short', hi: 'Long' }),
    lit: toggle('Lit', true),
    sparkle: toggle('Sparkle', true),
    body: color('Shell', P.slate, [P.slate, P.steel, P.gold, P.stone, '#e6c545', P.crimson], { material: 'paint' }),
    accent: color('Rope', P.cream, swatches('thornwood', 'wood', { lead: 'cream' })),
    glow: color('Spark', P.ember, swatches('thornwood', 'glow', { lead: 'ember' }), { material: 'fire', when: { lit: [true] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'item-get', preset: 'Gritty', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Iron bomb', params: {} },
    { name: 'Blasting stick', params: { shape: 'stick', body: P.crimson } },
    { name: 'Bundle of three', params: { shape: 'bundle', body: P.crimson, fuse: 0.8 } },
    { name: 'Unlit', params: { lit: false } },
    { name: 'Long fuse', params: { fuse: 1, glow: P.gold } },
  ],

  render(g, { clip, t, frame, p }) {
    const o = { kind: p.shape, k: lerp(0.84, 1.08, p.size), fuse: p.fuse, colour: p.body, rope: p.accent };
    // room above the fuse for the flame
    let r = munitionReach('bomb', { ...o, tilt: ROCK });
    const fit = Math.min(1, 21 / (r.up + r.down + 2), 13 / r.side);
    if (fit < 1) { o.k *= fit; r = munitionReach('bomb', { ...o, tilt: ROCK }); }
    const up = r.up + 2;
    const cy = Math.max(up + 2, Math.min(28 - r.down, Math.round(17 + (up - r.down) / 2)));
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: up + 1, down: r.down + 1, side: r.side + 1 });
    const idle = clip === 'idle';
    const angle = idle ? ROCK * wave(t, 0.25) : 0;
    let spark = null;
    if (at.show) {
      const bomb = drawBomb(g, CX, at.y, { ...o, sx: at.sx, sy: at.sy, angle, bare: at.bare });
      spark = bomb.spark;
      if (idle) glint(g, bomb.body, { x: CX, y: at.y, r: r.side, phase: lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)), width: 0.1, colour: mix(tone(p.body, 0.85), '#ffffff', 0.6) });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    // the burning end: a flame that changes size every frame and throws a few sparks up and away
    if (p.lit && spark && !at.flash) {
      const C = steps(p.glow);
      const [sx, sy] = spark;
      if (idle) particles(g, { t, x: sx, y: sy, count: 3, seed: 4, angle: PI, arc: 2.2, dist: 5, size: 2, gravity: 2, colours: C, box: FRAME });
      const big = at.bare ? 0 : Math.round(hash(frame, clip === 'idle' ? 3 : 5));
      glow(g, sx, sy, 2 + big, C.slice(0, 4), { box: FRAME });
      twinkle(g, sx, sy - 1, 1 + big, C[1], { core: C[0], box: FRAME });
    }
    if (idle && p.sparkle) gleam(g, CX - r.side + 2, at.y + r.down - 3, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side, colour: p.lit ? p.glow : p.body, sparkle: p.sparkle });
  },
});
