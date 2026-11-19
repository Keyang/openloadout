// Sweet (core-sprites-1, batch K01): score candy for casual and arcade games. It floats and rocks
// from side to side, glossy, with an optional pattern of stripes or sprinkles. Collecting it is the
// standard pickup pop (engine/pickups.js). The wrapped sweet, lollipop, donut and cupcake are drawn
// by drawCandy in engine/food.js; this file gives them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp } from '../engine/motion.js';
import { INK, brightness, tone, mix } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { CANDY_KINDS, foodReach, drawCandy } from '../engine/food.js';

const P = PALETTE.thornwood;
const CX = 16;
const ROCK = 0.16;                                // how far it rocks each way, in radians (about 9 degrees)

export default defineSprite({
  id: 'candy',
  name: 'Sweet',
  kind: 'Item',
  blurb: 'A floating glossy sweet worth points: wrapped, a lollipop, a donut or a cupcake. Change the sweet, its size, pattern, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/food', themes: ['neutral', 'candy'], gameTypes: ['arcade', 'puzzle', 'platformer'], view: 'front',
    words: ['candy', 'sweet', 'lollipop', 'donut', 'cupcake', 'toffee', 'treat', 'sugar', 'collect', 'pickup', 'score', 'points', 'bonus'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'wrapped', CANDY_KINDS),
    stripes: choice('Pattern', 'stripes', ['plain', 'stripes', 'dots']),
    sparkle: toggle('Sparkle', true),
    body: color('Candy', P.crimson, [...swatches('thornwood', 'body', { lead: 'crimson' }), P.gold, P.wood], { material: 'paint' }),
    accent: color('Icing', P.cream, [P.cream, P.magic, P.moss, P.hero, '#d8d8e0'], { when: { stripes: ['stripes', 'dots'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'item-get', preset: 'Chiptune', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Cherry drop', params: {} },
    { name: 'Mint swirl', params: { shape: 'lollipop', stripes: 'stripes', body: P.goblin } },
    { name: 'Sprinkle ring', params: { shape: 'donut', stripes: 'dots', body: P.thorn } },
    { name: 'Lemon cake', params: { shape: 'cupcake', body: P.gold } },
    { name: 'Plain toffee', params: { stripes: 'plain', body: P.wood } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.8, 1.12, p.size), r = foodReach('candy', p.shape);
    const cy = Math.round(17 + ((r.up - r.down) * k) / 2);
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up * k + 1.5, down: r.down * k + 1, side: r.side * k + 1 });
    // it rocks from side to side, a quarter of a loop ahead of the float
    const angle = clip === 'idle' ? ROCK * wave(t, 0.25) : 0;
    // the donut's dough and the cupcake's paper stay apart in lightness from whatever colour the candy is
    const light = brightness(p.body) > 0.55;
    if (at.show) {
      const food = drawCandy(g, CX, at.y, {
        kind: p.shape, k, sx: at.sx, sy: at.sy, angle, colour: p.body, pattern: p.stripes, icing: p.accent,
        stick: P.cream, dough: light ? P.wood : PALETTE.hearthvale.wheat, bare: at.bare,
      });
      // a bright band sweeps across it in the first half of the loop
      if (clip === 'idle') glint(g, food.body, { x: CX, y: at.y, r: r.side * k, phase: lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)), width: 0.1, colour: mix(tone(p.body, 0.85), '#ffffff', 0.6) });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (clip === 'idle' && p.sparkle) gleam(g, CX - r.side * k + 1, at.y - r.up * k + 2, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side * k, colour: p.body, sparkle: p.sparkle });
  },
});
