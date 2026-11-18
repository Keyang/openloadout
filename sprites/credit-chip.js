// Credit chip (kit-roguelite-scifi, batch S15): the money of the station. A six-sided gold chip that
// turns about its upright axis as the coin does (edge-on in the middle of the loop), with a lit
// circuit line on its face. Collecting it is the standard pickup pop (engine/pickups.js), with a flip.
// The turned badge and the circuit are drawToken and drawCircuit in engine/gadgets.js; this file
// gives each shape its size and says what is on the face.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, keys, fract, PI } from '../engine/motion.js';
import { ramp, tone, mix, brightness, INK } from '../engine/color.js';
import { ellipseIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { hexIn, starIn } from '../engine/shapes.js';
import { cutRectIn } from '../engine/ui.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';
import { drawToken, drawCircuit } from '../engine/gadgets.js';

const P = PALETTE.derelict;
const CX = 16, CY = 17;
const even = (v) => 2 * Math.round(v / 2);        // even sizes sit on the pixel corner at (16, 17)
// Each shape face-on: its width at the smallest and biggest size, and its height for a width.
const SHAPES = {
  hex: { w: [12, 18], h: (w) => even(w * 1.14), face: (w, h) => hexIn(0, 0, w, h) },
  round: { w: [13, 19], h: (w) => w, face: (w, h) => ellipseIn(0, 0, w / 2, h / 2) },
  bar: { w: [8, 12], h: (w) => even(w * 1.8), face: (w, h) => cutRectIn(-w / 2, -h / 2, w, h, 2) },
};
// The flip on the way up, in half turns (collect).
const FLIP = [[0.14, 0], [0.29, 0.34], [0.43, 0.5], [0.57, 1]];

export default defineSprite({
  id: 'credit-chip',
  name: 'Credit chip',
  kind: 'Item',
  blurb: 'A spinning six-sided gold chip with a lit circuit on its face: the money of a space station. Change its shape, thickness, mark and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'front',
    words: ['credit', 'chip', 'money', 'coin', 'cash', 'currency', 'token', 'gold', 'loot', 'collect', 'pickup', 'spin', 'score', 'circuit'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'hex', [{ value: 'hex', label: 'Six sides' }, 'round', 'bar']),
    thickness: range('Thickness', 0.4, { lo: 'Thin', hi: 'Chunky' }),
    mark: choice('Mark', 'circuit', ['circuit', 'star', 'plain']),
    sparkle: toggle('Sparkle', true),
    metal: color('Metal', P.gold, swatches('derelict', 'metal', { lead: 'gold' }).filter((c) => brightness(c) >= 0.45)),   // no dark metal: its shadow side would merge with the outline
    glow: color('Glow', P.cyan, swatches('derelict', 'glow'), { when: { mark: ['circuit', 'star'] } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'credit-pickup', preset: 'Credit chip', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const S = SHAPES[p.shape] ?? SHAPES.hex;
    const w = even(lerp(S.w[0], S.w[1], p.size)), h = S.h(w), thick = Math.round(lerp(2, 5, p.thickness));
    const idle = clip === 'idle';
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY, up: h / 2 + 1, side: w / 2 + 1 });
    const turn = PI * (idle ? t : keys(t, FLIP, (x) => x));        // the two faces match: half a turn is one loop
    const M = ramp(p.metal), G = ramp(p.glow);

    if (at.show) {
      const T = drawToken(g, S.face(w, h), CX, at.y, p.metal, { turn, thick: Math.max(1, thick * at.scale), sx: at.sx, sy: at.sy, field: mix(M.base, M.dark, 0.3) });
      if (idle) {
        // the glint: a slanted bright band that slides across the face as it comes round, dimmer in the field
        const band = { x: CX + T.x, y: at.y, r: h / 2, phase: lerp(-1.6, 1.6, fract(t + 0.5)), width: 0.13 };
        glint(g, T.face, { ...band, colour: mix(M.light, '#ffffff', 0.6) });
        if (T.field) glint(g, T.field, { ...band, colour: M.base });
      }
      if (!at.bare && T.squeeze > 0.6) {
        const lit = mix(G.light, p.glow, 0.35);
        if (p.mark === 'circuit') drawCircuit(g, T.at, lit, { rx: w / 2 - 2, ry: h / 2 - 3 });
        else if (p.mark === 'star') {
          g.fill(0, 0, 32, 32, T.on(starIn(0, 0.5, Math.min(w, h) / 2 - 2, 5)), lit, { clip: T.field });
        }
      }
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, CX + w / 2 - 1, at.y - h / 2 + 1, t, tone(p.metal, 0.9), { at: 0 });      // as it faces us
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: Math.max(w, h) / 2, colour: p.metal, sparkle: p.sparkle });
  },
});
