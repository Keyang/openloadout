// Trophy (core-sprites-1, batch K03): the big end-of-level or secret collectable. A two-handled cup on
// a dark plinth, a medal on a short ribbon that turns like a coin, or a small crown with three points,
// with an optional picture mark on its face; a strong glint sweeps across it once per loop. Collecting
// it is the standard pickup pop (engine/pickups.js). The three prizes are drawn by drawTrophy in
// engine/prizes.js; this file gives them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, PI } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { TROPHY_KINDS, prizeReach, drawTrophy } from '../engine/prizes.js';

const P = PALETTE.thornwood;
const CX = 16;

export default defineSprite({
  id: 'trophy',
  name: 'Trophy',
  kind: 'Item',
  blurb: 'A floating prize for the end of a level or a secret: a cup, a medal or a crown. Change the prize, its size, emblem, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral'], gameTypes: ['arcade', 'platformer', 'racing', 'puzzle'], view: 'front',
    words: ['trophy', 'cup', 'medal', 'crown', 'prize', 'award', 'winner', 'champion', 'collect', 'reward', 'secret', 'golden'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'cup', TROPHY_KINDS),
    emblem: choice('Emblem', 'star', ['star', 'sun', 'diamond', 'none']),
    sparkle: toggle('Sparkle', true),
    metal: color('Metal', P.gold, [P.gold, P.steel, '#e6c545', '#c98a4a', PALETTE.hearthvale.rust]),
    accent: color('Ribbon', P.hero, [P.hero, P.crimson, P.thorn, P.cream, P.ember, '#4f9d57'], { when: { shape: ['medal'] } }),
    stone: color('Base', P.slate, swatches('thornwood', 'stone', { lead: 'slate' }), { when: { shape: ['cup'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'star-pickup', preset: 'Storybook', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Gold cup', params: {} },
    { name: 'Silver medal', params: { shape: 'medal', metal: P.steel } },
    { name: 'Crown', params: { shape: 'crown', emblem: 'diamond' } },
    { name: 'Bronze cup', params: { metal: PALETTE.hearthvale.rust } },
    { name: 'Plain cup', params: { emblem: 'none', size: 0.3 } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.8, 1.06, p.size), r = prizeReach('trophy', p.shape);
    const cy = Math.round(16.5 + ((r.up - r.down) * k) / 2);
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up * k + 1, down: r.down * k + 1, side: r.side * k + 1 });
    const idle = clip === 'idle';
    if (at.show) {
      // the medal turns like a coin, half a turn per loop (both faces are alike)
      const prize = drawTrophy(g, CX, at.y, { kind: p.shape, k, sx: at.sx, sy: at.sy, metal: p.metal, ribbon: p.accent, base: p.stone,
        emblem: p.emblem === 'none' ? null : p.emblem, turn: idle ? PI * t : 0, bare: at.bare });
      // a strong glint sweeps across once per loop
      if (idle) glint(g, prize.shiny, { x: CX, y: at.y, r: r.side * k, phase: lerp(-1.6, 1.6, t), width: 0.2, colour: '#ffffff' });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, CX + r.side * k - 1, at.y - r.up * k + 3, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side * k, colour: p.metal, sparkle: p.sparkle });
  },
});
