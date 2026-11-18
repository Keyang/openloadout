// Heart (kit-platformer-fantasy, batch P11): health to pick up. It does not float, it beats: two
// quick swells per loop (frames 1 and 3), then rest; the Beat control says how hard. Optional wings
// flap with the beat. Collecting it is the standard pickup pop (engine/pickups.js).
// The heart shapes are heartIn in engine/shapes.js, the same ones the HUD hearts use.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { placedIn, heartIn, wingIn, wingReach } from '../engine/shapes.js';
import { pickupClips, pickupPose, collectBurst, heartbeat, gleam, drawGem } from '../engine/pickups.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 17;
const even = (v) => 2 * Math.round(v / 2);
const SPREAD = 0.8;                             // how far the feathers of a wing fan out, in radians

export default defineSprite({
  id: 'heart',
  name: 'Heart',
  kind: 'Item',
  blurb: 'A beating heart that gives health back. Change its shape, size, wings, shine, colour and how hard it beats.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'arcade', 'roguelike-action'], view: 'front',
    words: ['heart', 'health', 'life', 'heal', 'love', 'hp', 'beat', 'collect', 'pickup', 'extra life', 'recover', 'winged'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'classic', ['classic', 'round', 'pixel', 'crystal']),
    wings: toggle('Wings', false),
    shine: toggle('Shine', true),
    sparkle: toggle('Sparkle', true),
    body: color('Heart', P.crimson, swatches('thornwood', 'edge', { lead: 'crimson' })),      // bright colours only, none as pale as the wings
    bob: range('Beat', 0.5, { lo: 'Gentle', hi: 'Strong', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'gem-pickup', preset: 'Heart', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    // a winged heart is a little smaller, so that its wings can spread
    const w0 = even(lerp(12, p.wings ? 18 : 20, p.size)), h0 = even(w0 * 0.875), len = w0 * 0.5;
    // how high the wings must be raised to stay inside the frame when the heart is `half` wide
    const liftFor = (half) => {
      let lift = 0.7;
      while (lift < 1.35 && wingReach(len, { lift: lift + 0.25, spread: SPREAD }).out > 12.9 - half * 0.72) lift += 0.05;
      return lift;
    };
    const top = p.wings ? Math.max(h0 / 2, h0 * 0.2 + wingReach(len, { lift: liftFor(w0 / 2) + 0.25, spread: SPREAD }).up) : h0 / 2;
    const at = pickupPose(clip, t, { pop: p.pop, cy: CY, up: top + 1, down: h0 / 2 + 1, float: false });
    const beat = clip === 'idle' ? heartbeat(t) : 0;
    // the swell, in pixels on each side: the stepped heart grows a whole block at a time
    const grow = p.shape === 'pixel' ? 2 * Math.round(lerp(0.6, 1.4, p.bob) * beat) : lerp(0.7, 2.2, p.bob) * beat;
    const w = w0 + 2 * grow, h = h0 + 2 * grow * (h0 / w0), cy = at.y;
    const place = (test) => placedIn(test, CX, cy, { sx: at.sx, sy: at.sy });
    if (at.show) {
      if (p.wings && !at.bare) {
        // two wings from its shoulders that lift on each beat; they do not widen when the heart squashes
        const lift = liftFor(w / 2) + 0.25 * beat;
        const wing = (side) => placedIn(wingIn(side * w * 0.36, -h0 * 0.2, len, { side, lift, spread: SPREAD }), CX, cy, { sx: Math.min(1, at.sx), sy: at.sy });
        g.blob([wing(-1), wing(1)], ramp(P.cream), { shade: 0 });        // feathers this thin would be all shadow: they stay one pale tone
      }
      const body = place(heartIn(0, 0, w, h, p.shape));
      if (p.shape === 'crystal') drawGem(g, CX, cy, (w / 2) * at.sx, (h / 2) * at.sy, p.body, { cut: 'heart', facets: !at.bare });
      else g.fill(CX - w, cy - h, CX + w, cy + h, body, ramp(p.body), { shade: w0 > 14 ? 2 : 1, light: p.shine ? 1 : 0 });
      if (p.shine && !at.bare) {
        // the gloss on the right lobe: a short white mark with a dot under it (one block on the stepped heart)
        const gx = CX + Math.round(w * 0.22), gy = Math.round(cy - h * 0.28);
        if (p.shape === 'pixel') g.rect(CX + 2 * Math.round(w / 8), cy - 2 * Math.round(w / 8), 2, 2, '#ffffff');
        else { g.rect(gx, gy, 2, 1, '#ffffff'); g.dot(gx + 1, gy + 1, '#ffffff'); }
      }
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (clip === 'idle' && p.sparkle) {
      const light = ramp(p.body).light;
      gleam(g, CX + w0 / 2 + 1, cy - h0 / 2, t, light, { at: 0.125 });        // one flare for each beat
      gleam(g, CX - w0 / 2 - 1, cy + h0 / 4, t, light, { at: 0.375, big: 1 });
    }
    collectBurst(g, { burst: at.burst, x: CX, y: cy, r: w0 / 2, colour: p.body, sparkle: p.sparkle });
  },
});
