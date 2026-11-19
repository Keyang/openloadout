// Fruit (core-sprites-1, batch K01): a piece of fruit that gives back a little health. It hangs in
// the air, turning a few degrees left and right as it bobs, its stalk and leaf trailing the turn by
// a frame. Collecting it is the standard pickup pop (engine/pickups.js). The four fruits are drawn
// by drawFruit in engine/food.js; this file gives them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp } from '../engine/motion.js';
import { INK, tone, mix } from '../engine/color.js';
import { PALETTE } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { FRUIT_KINDS, foodReach, drawFruit } from '../engine/food.js';

const P = PALETTE.thornwood;
const CX = 16;
const TURN = 0.1;                                 // how far it turns each way, in radians (about 6 degrees)

export default defineSprite({
  id: 'fruit',
  name: 'Fruit',
  kind: 'Item',
  blurb: 'A floating piece of fruit that restores a little health. Change the fruit, its size, leaf, shine, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/food', themes: ['neutral', 'forest', 'farm'], gameTypes: ['platformer', 'arcade', 'farming-sim', 'top-down-rpg'], view: 'front',
    words: ['fruit', 'apple', 'pear', 'berries', 'lemon', 'orange', 'food', 'snack', 'eat', 'heal', 'health', 'collect', 'pickup', 'fresh'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'apple', FRUIT_KINDS),
    leaf: toggle('Leaf', true),
    shine: toggle('Shine', true),
    sparkle: toggle('Sparkle', true),
    body: color('Fruit', P.crimson, [P.crimson, P.goblin, P.thorn, P.soil, P.water, P.moss, P.gold]),
    accent: color('Leaves', P.leaf, [P.leaf, P.grass, P.ember, PALETTE.hearthvale.leaf], { when: { leaf: [true] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'heart-pickup', preset: 'Chiptune', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Red apple', params: {} },
    { name: 'Green pear', params: { shape: 'pear', body: P.moss } },
    { name: 'Berry bunch', params: { shape: 'berries', body: P.thorn, size: 0.4 } },
    { name: 'Lemon', params: { shape: 'citrus', body: P.gold, leaf: false } },
    { name: 'Golden apple', params: { body: P.gold, sparkle: true, shine: true } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.74, 1.08, p.size), r = foodReach('fruit', p.shape);
    // the whole fruit, stalk and leaf, sits a little below the middle, so it has room to pop up
    const cy = Math.min(Math.round(17.5 + ((r.up - r.down) * k) / 2), Math.floor(28 - r.down * k));
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up * k + 1.5, down: r.down * k + 1, side: r.side * k + 1 });
    const idle = clip === 'idle';
    // it turns with the float; the stalk follows a frame (an eighth of the loop) later
    const angle = idle ? TURN * wave(t, 0.25) : 0, lag = idle ? TURN * wave(t - 0.125, 0.25) - angle : 0;
    if (at.show) {
      const food = drawFruit(g, CX, at.y, { kind: p.shape, k, sx: at.sx, sy: at.sy, angle, lag, colour: p.body, stalk: P.soil, leaf: p.leaf ? p.accent : null, shine: p.shine, bare: at.bare });
      // a bright band sweeps across it in the first half of the loop
      if (clip === 'idle' && p.shine) glint(g, food.body, { x: CX, y: at.y, r: r.side * k, phase: lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)), width: 0.1, colour: mix(tone(p.body, 0.85), '#ffffff', 0.6) });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, CX - r.side * k + 1, at.y + r.down * k * 0.3, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side * k, colour: p.body, sparkle: p.sparkle });
  },
});
