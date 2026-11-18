// Health cell (kit-roguelite-scifi, batch S15): health to pick up on the station. A glass tube of green
// charge between two metal caps; the charge beats twice per loop like the fantasy heart (frames 1 and
// 3), flaring white with a halo beside the glass, then rests. Other shapes: a syringe, needle up, and
// a med pack with a cross-shaped window. Collecting it is the standard pickup pop (engine/pickups.js).
// The containers, the charge and the halo are cellIn, drawCharge and haloIn in engine/gadgets.js; this
// file gives each container its size.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp } from '../engine/motion.js';
import { ramp, mix, INK } from '../engine/color.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { placedIn, anyIn } from '../engine/shapes.js';
import { pickupClips, pickupPose, collectBurst, heartbeat, gleam } from '../engine/pickups.js';
import { cellIn, drawCharge, haloIn } from '../engine/gadgets.js';

const P = PALETTE.derelict;
const CX = 16, CY = 17;
const even = (v) => 2 * Math.round(v / 2);
// Each shape: which container of cellIn, and its height at the smallest and biggest size.
const SHAPES = {
  cell: { kind: 'cell', h: [16, 22] },
  syringe: { kind: 'syringe', h: [18, 24] },
  'cross-pack': { kind: 'pack', h: [15, 20] },
};

export default defineSprite({
  id: 'health-cell',
  name: 'Health cell',
  kind: 'Item',
  blurb: 'A capsule of glowing green charge that beats like a heart and gives health back. Make it a cell, a syringe or a med pack, and change how full it is and its colours.',
  meta: { type: 'pickup', role: 'items/food', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'front',
    words: ['health', 'heal', 'medkit', 'med pack', 'capsule', 'cell', 'syringe', 'life', 'hp', 'recover', 'collect', 'pickup', 'first aid', 'glowing'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'cell', ['cell', 'syringe', { value: 'cross-pack', label: 'Cross pack' }]),
    level: range('Fill', 0.8, { lo: 'Low', hi: 'Full' }),
    sparkle: toggle('Sparkle', true),
    body: color('Casing', P.panel, swatchesBetween('derelict', 'metal', { lead: 'panel', min: 0.45 })),      // no dark casing: it would merge with the outline
    glow: color('Glow', P.heal, swatches('derelict', 'glow', { lead: 'heal' })),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'upgrade-get', preset: 'Health cell', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const S = SHAPES[p.shape] ?? SHAPES.cell;
    const h = even(lerp(S.h[0], S.h[1], p.size)), C = cellIn(h, S.kind);
    const whole = anyIn(C.casing, C.seams, C.window);
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY, up: h / 2 + 1, side: C.half + 1 });
    const put = (test) => placedIn(test, CX, at.y, { sx: at.sx, sy: at.sy });
    const beat = clip === 'idle' ? heartbeat(t) : 0;
    const M = ramp(p.body), G = ramp(p.glow);

    if (at.show) {
      g.blob([put(C.casing)], M, { light: 1 });
      g.fill(0, 0, 32, 32, put(C.seams), M.deep);
      // the charge is written upright, like the container, so that it fills along it whatever its slant
      const lit = drawCharge(g, C.window, p.glow, { from: C.fill[0], to: C.fill[1], level: at.bare ? 1 : p.level, beat, empty: G.dark, place: put });
      if (!at.bare && beat < 0.3) g.fill(0, 0, 32, 32, put(C.shine), '#ffffff', { clip: lit.wet });       // the glass shines while the charge rests
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
      // on a beat the light spills out beside the glass
      if (beat >= 0.6) g.fill(0, 0, 32, 32, haloIn(put(whole), lit.wet), beat >= 0.95 ? mix(G.light, '#ffffff', 0.4) : G.light);
    }
    if (clip === 'idle' && p.sparkle) gleam(g, CX + C.half - 1, at.y - h / 2 + 1, t, G.light, { at: 0.7 });      // on its top right corner, in the rest after the two beats
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: h / 2, colour: p.glow, sparkle: p.sparkle });
  },
});
