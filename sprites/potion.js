// Potion (kit-platformer-fantasy, batch P11): a corked glass bottle of something worth drinking.
// It floats; the liquid's surface tilts against the float and bubbles rise through it once per loop.
// Collecting it is the standard pickup pop (engine/pickups.js). The bottle, its liquid, cork and
// highlight are drawBottle in engine/pickups.js; this file gives it its size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave } from '../engine/motion.js';
import { mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, drawBottle } from '../engine/pickups.js';

const P = PALETTE.thornwood;
const CX = 16;

export default defineSprite({
  id: 'potion',
  name: 'Potion',
  kind: 'Item',
  blurb: 'A corked bottle of bubbling potion. Change the bottle, how full it is, the bubbles, the liquid and the glass.',
  meta: { type: 'pickup', role: 'items/food', themes: ['fantasy', 'forest', 'dungeon'], gameTypes: ['platformer', 'arcade', 'roguelike-action'], view: 'front',
    words: ['potion', 'bottle', 'flask', 'vial', 'elixir', 'drink', 'heal', 'health', 'magic', 'collect', 'pickup', 'power up', 'glass'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'tall', 'flask', 'vial']),
    level: range('Fill', 0.7, { lo: 'Low', hi: 'Full' }),
    bubbles: toggle('Bubbles', true),
    body: color('Liquid', P.crimson, swatches('thornwood', 'edge', { lead: 'crimson' })),
    accent: color('Glass', P.cream, [P.cream, P.sky, P.steel, P.goblin, P.haze]),      // pale colours only: the liquid must show through
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'powerup', preset: '1-up', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const h = Math.round(lerp(14, 22, p.size));            // the whole bottle, cork included
    const cy = h % 2 ? 16.5 : 17;                          // an odd height sits on a pixel centre
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: h / 2 + 1 });
    if (at.show) {
      // glass is a pale tint of its colour, so any liquid stands out against it
      drawBottle(g, CX, at.y, h, {
        shape: p.shape, glass: mix(p.accent, '#ffffff', 0.25), liquid: p.body, cork: P.wood, level: p.level,
        tilt: clip === 'idle' ? -0.16 * wave(t) : 0,                // the surface tilts one way as it rises and the other as it sinks
        bubbles: p.bubbles && !at.bare ? 2 : 0, t: clip === 'idle' ? t : 0, sx: at.sx, sy: at.sy, shine: !at.bare,   // the bubbles hold still while it pops
      });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: h / 2, colour: p.body, sparkle: true });
  },
});
