// Ammo pack (core-sprites-1, batch K02): ammunition for any gun, floating to be picked up. A small
// box with its lid thrown back and brass rounds standing in it, a magazine with a window of rounds,
// or a row of fat shotgun shells; it tilts a little on each bob. Collecting it is the standard pickup
// pop (engine/pickups.js). The three kinds are drawn by drawAmmoPack in engine/ammo-packs.js and leaned
// with lean() from engine/surface.js (the top slides a whole pixel, so the outline steps once and never
// notches); this file gives them their size, colours and motion.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, pulse, clamp } from '../engine/motion.js';
import { INK, tone, mix } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { Surface, lean as leaned } from '../engine/surface.js';
import { AMMO_PACK_KINDS, ammoPackReach, drawAmmoPack } from '../engine/ammo-packs.js';

const P = PALETTE.thornwood;
const CX = 16;

export default defineSprite({
  id: 'ammo-box',
  name: 'Ammo pack',
  kind: 'Item',
  blurb: 'A floating pack of ammunition: a box of rounds, a magazine or a row of shotgun shells. Change the kind, how many rounds show, its size, sparkle and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['neutral', 'sci-fi', 'city'], gameTypes: ['shooter', 'arcade', 'roguelike-action', 'platformer'], view: 'front',
    words: ['ammo', 'ammunition', 'bullets', 'rounds', 'magazine', 'clip', 'shells', 'cartridges', 'reload', 'collect', 'pickup', 'brass', 'gun'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'box', AMMO_PACK_KINDS),
    load: range('Rounds', 4, { min: 2, max: 6, step: 1, lo: 'Few', hi: 'Many' }),
    sparkle: toggle('Sparkle', true),
    body: color('Box', P.leaf, [...swatches('thornwood', 'body', { lead: 'leaf' }), P.slate, PALETTE.derelict.hull], { material: 'paint' }),
    metal: color('Brass', P.gold, [P.gold, P.steel, P.stone, '#e6c545', '#c98a4a']),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'ammo-pickup', preset: 'Bullets', frame: 1, volume: 0.7 }] },
  versions: [
    { name: 'Ammo crate', params: {} },
    { name: 'Magazine', params: { shape: 'clip', body: P.slate } },
    { name: 'Shotgun shells', params: { shape: 'shells', body: P.crimson } },
    { name: 'Full load', params: { load: 6, size: 0.8 } },
    { name: 'Station issue', params: { body: PALETTE.derelict.hull, metal: P.steel } },
  ],

  render(g, { clip, t, p }) {
    const k = lerp(0.82, 1.1, p.size);
    const o = { kind: p.shape, k, load: p.load, colour: p.body, metal: p.metal };
    const r0 = ammoPackReach(o), r = { up: r0.up + 1, down: r0.down + 1, side: r0.side + 1 };   // a lean moves an edge 1 px
    const cy = Math.max(r.up + 2, Math.min(28 - r.down, Math.round(17 + (r.up - r.down) / 2)));
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy, up: r.up + 1, down: r.down + 1, side: r.side + 1 });
    // it leans with the bob: one way on the way up, the other on the way down
    // the top slides a whole pixel over a step 2 rows below the middle (a magazine leans only back, along its curve)
    const lean = clip === 'idle' ? Math.round(p.shape === 'clip' ? -pulse(t, 0.25) : wave(t, 0.25)) : 0;
    if (at.show) {
      const layer = new Surface(32, 32);
      const ammo = drawAmmoPack(layer, CX, at.y, { ...o, sx: at.sx, sy: at.sy, bare: at.bare });
      // a bright band sweeps across it in the first half of the loop
      if (clip === 'idle') glint(layer, ammo.body, { x: CX, y: at.y, r: r.side, phase: lerp(-1.5, 1.5, clamp((t - 0.1) / 0.6)), width: 0.1, colour: mix(tone(p.metal, 0.85), '#ffffff', 0.6) });
      const step = Math.round(at.y) + 2, d = Math.max((step - Math.round(at.y) + r0.up) / 2, r0.down - 2) + 0.5;
      g.blit(lean ? leaned(layer, step + d, lean / (2 * d)) : layer);
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (clip === 'idle' && p.sparkle) gleam(g, CX + r.side - 2, at.y - r.up + 2, t, '#ffffff', { at: 0.5 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: r.side, colour: p.metal, sparkle: p.sparkle });
  },
});
