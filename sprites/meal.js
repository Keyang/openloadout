// Hearty meal (core-sprites-1, batch K01): the big health food of beat-em-ups and adventures. It
// floats and squashes a pixel on each dip; hot food lets two wisps of steam rise. Collecting it is
// the standard pickup pop (engine/pickups.js). The roast leg, loaf, cheese wedge and pie are drawn
// by drawMeal in engine/food.js and the steam by smoke in engine/fx.js; this file gives them their
// size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp } from '../engine/motion.js';
import { INK, tone, mix } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { smoke } from '../engine/fx.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { MEAL_KINDS, foodReach, drawMeal } from '../engine/food.js';

const P = PALETTE.thornwood;
const CX = 16;
const STEAM_PUFFS = 3;            // puffs alive in each wisp at once

export default defineSprite({
  id: 'meal',
  name: 'Hearty meal',
  kind: 'Item',
  blurb: 'A floating roast leg, loaf, cheese or pie that restores a lot of health. Change the food, its size, a bite, steam, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/food', themes: ['neutral', 'fantasy'], gameTypes: ['platformer', 'arcade', 'top-down-rpg', 'turn-based-rpg'], view: 'front',
    words: ['meal', 'food', 'meat', 'roast', 'drumstick', 'bread', 'loaf', 'cheese', 'pie', 'eat', 'heal', 'health', 'collect', 'feast'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'drumstick', MEAL_KINDS),
    bite: toggle('Bitten', false),
    steam: toggle('Steam', false),
    sparkle: toggle('Sparkle', true),
    body: color('Food', P.wood, [P.wood, P.soil, '#a8612a', '#5a3a22', '#c98a4a', P.gold, PALETTE.hearthvale.wheat], { material: 'wood' }),
    accent: color('Bone', P.cream, [P.cream, '#d8d8e0', '#e0b040', P.stone], { when: { shape: ['drumstick'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'heart-pickup', preset: 'Storybook', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Roast leg', params: {} },
    { name: 'Bread loaf', params: { shape: 'bread', body: PALETTE.hearthvale.wheat } },
    { name: 'Cheese wedge', params: { shape: 'cheese', body: P.gold, bite: true } },
    { name: 'Hot pie', params: { shape: 'pie', steam: true } },
    { name: 'Snack', params: { size: 0.3, bite: true, steam: false } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.78, 1.06, p.size), r = foodReach('meal', p.shape);
    const steamy = p.steam && clip === 'idle';
    const cy = Math.round(17 + ((r.up - r.down) * k) / 2 + (p.steam ? 1.5 : 0));        // hot food sits lower, under its steam
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up * k + 1.5, down: r.down * k + 1, side: r.side * k + 1 });
    // a pixel of squash at the bottom of each dip: the float's lowest point is three quarters into the loop
    const dip = clip === 'idle' ? clamp((-wave(t) - 0.6) / 0.4) : 0;
    const sy = at.sy * (1 - dip / (2 * r.down * k + 2 * r.up * k) * 2), sx = at.sx * (1 + dip / (r.side * k * 2));
    if (at.show) {
      const food = drawMeal(g, CX, at.y, { kind: p.shape, k, sx, sy, colour: p.body, bone: p.accent, filling: P.crimson, bite: p.bite, bare: at.bare });
      // a bright band sweeps across it in the first half of the loop
      if (clip === 'idle') glint(g, food.body, { x: CX, y: at.y, r: r.side * k, phase: lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)), width: 0.1, colour: mix(tone(p.body, 0.85), '#ffffff', 0.6) });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (steamy) {
      // two narrow wisps from either side of the top, each a column of three puffs born a third of a
      // loop apart (one puff per smoke call, its life shifted by t), the second wisp a sixth behind the first
      const top = at.y - r.up * k;
      for (const [w, dx, drift] of [[0, -4.5, -0.6], [1, 4.5, 0.6]]) for (let j = 0; j < STEAM_PUFFS; j++) {
        smoke(g, { t: t + (j + w / 2) / STEAM_PUFFS, x: CX + dx, y: top - 1, count: 1, seed: 1, rise: Math.max(3, top - 4), drift, size: 2.4, colour: P.cream, box: [1, 1, 31, 31] });
      }
    }
    if (clip === 'idle' && p.sparkle) gleam(g, CX + r.side * k - 2, at.y - r.up * k * 0.6, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side * k, colour: p.body, sparkle: p.sparkle });
  },
});
