// Money pouch (core-sprites-1, batch K03): a big money drop worth many coins. A drawstring purse, a
// knotted sack or a leaning stack of coins floats and sways; the coin tied to a bag's cord turns, and
// loose coins beside it catch the glint one after another. Collecting it is the standard pickup pop
// (engine/pickups.js). The three kinds are drawn by drawPurse in engine/prizes.js; this file gives
// them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave } from '../engine/motion.js';
import { INK } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, gleam } from '../engine/pickups.js';
import { PURSE_KINDS, prizeReach, drawPurse } from '../engine/prizes.js';

const P = PALETTE.thornwood;
const CX = 16;
const SWAY = 0.07;                                // how far a bag sways each way, in radians (about 4 degrees)

export default defineSprite({
  id: 'coin-pouch',
  name: 'Money pouch',
  kind: 'Item',
  blurb: 'A floating purse, sack or stack of coins worth a lot of money. Change its kind, size, fullness, spilled coins, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral', 'fantasy'], gameTypes: ['platformer', 'top-down-rpg', 'arcade', 'turn-based-rpg'], view: 'front',
    words: ['money', 'pouch', 'purse', 'sack', 'coins', 'gold', 'loot', 'treasure', 'cash', 'wealth', 'collect', 'reward', 'bag'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'pouch', PURSE_KINDS),
    fullness: range('Fullness', 0.5, { lo: 'Lean', hi: 'Bulging' }),
    spill: toggle('Spill', true),
    sparkle: toggle('Sparkle', true),
    body: color('Leather', P.wood, [P.wood, P.soil, P.cream, '#a8612a', '#5a3a22'], { when: { shape: ['pouch', 'sack'] } }),
    metal: color('Metal', P.gold, [P.gold, P.steel, P.stone, P.slate, '#e6c545']),
    accent: color('Rope', P.crimson, [P.crimson, P.thorn, P.magic, P.moss, P.hero], { when: { shape: ['pouch', 'sack'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'credit-pickup', preset: 'Big payout', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Coin pouch', params: {} },
    { name: 'Loot sack', params: { shape: 'sack', fullness: 1, body: P.cream } },
    { name: 'Gold stack', params: { shape: 'stack', fullness: 0.8 } },
    { name: 'Silver purse', params: { metal: P.steel, body: P.soil } },
    { name: 'Lean purse', params: { fullness: 0, spill: false, size: 0.3 } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.78, 1, p.size), r = prizeReach('purse', p.shape);
    const cy = Math.round(16.5 + ((r.up - r.down) * k) / 2);
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up * k + 1, down: r.down * k + 1, side: r.side * k + 1 });
    const idle = clip === 'idle';
    // a bag sways a little a quarter of a loop after the float; a stack stays upright
    const angle = idle && p.shape !== 'stack' ? SWAY * wave(t, 0.25) : 0;
    if (at.show) {
      drawPurse(g, CX, at.y, { kind: p.shape, k, sx: at.sx, sy: at.sy, angle, fullness: p.fullness, spill: p.spill, leather: p.body, metal: p.metal, rope: p.accent, t: idle ? t : null, bare: at.bare });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, CX + 7 * k, at.y - 5 * k, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: 9 * k, colour: p.metal, sparkle: p.sparkle });
  },
});
