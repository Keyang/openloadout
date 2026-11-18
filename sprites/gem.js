// Gem (kit-platformer-fantasy, batch P11): a cut jewel worth more than a coin. It floats, a glint
// sweeps across its facets once per loop and a sparkle flares on its top right corner. Collecting
// it is the standard pickup pop (engine/pickups.js): dip, pop, white flash, sparkles.
// The cuts and their facets come from engine/shapes.js; this file only gives each cut its size.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, clamp } from '../engine/motion.js';
import { tone, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam, drawGem } from '../engine/pickups.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 17;
// Width and height of each cut at the middle size, in pixels.
const CUTS = { diamond: [16, 14], emerald: [12, 16], round: [14, 14], shard: [12, 18] };
const even = (v) => 2 * Math.round(v / 2);        // even sizes sit on the pixel corner at (16, 17)

export default defineSprite({
  id: 'gem',
  name: 'Gem',
  kind: 'Item',
  blurb: 'A floating cut jewel that glints, worth more than a coin. Change its cut, size, cut lines, sparkle and colour.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'arcade', 'puzzle'], view: 'front',
    words: ['gem', 'jewel', 'diamond', 'crystal', 'emerald', 'ruby', 'treasure', 'loot', 'collect', 'pickup', 'reward', 'score', 'shiny'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'diamond', ['diamond', 'emerald', 'round', 'shard']),
    facets: toggle('Cut lines', true),
    sparkle: toggle('Sparkle', true),
    body: color('Gem', P.magic, swatches('thornwood', 'gem')),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'gem-pickup', preset: 'Gem', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const k = lerp(0.75, 1.25, p.size);
    const rx = even(CUTS[p.shape][0] * k) / 2, ry = even(CUTS[p.shape][1] * k) / 2;
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY, up: ry + 1 });
    if (at.show) {
      const stone = drawGem(g, CX, at.y, rx * at.sx, ry * at.sy, p.body, { cut: p.shape, facets: p.facets && !at.bare });
      // the glint crosses the stone in the first half of the loop; the corner sparkle flares as it leaves
      if (clip === 'idle') glint(g, stone, { x: CX, y: at.y, r: Math.max(rx, ry), phase: lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)), width: 0.11, colour: mix(tone(p.body, 0.85), '#ffffff', 0.7) });
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (clip === 'idle' && p.sparkle) gleam(g, CX + rx - 1, at.y - ry + 1, t, '#ffffff', { at: 0.75 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: Math.max(rx, ry), colour: p.body, sparkle: p.sparkle });
  },
});
