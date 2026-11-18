// Shield cell (kit-roguelite-scifi, batch S15): shield energy to pick up. A blue six-sided shell lying
// on a flat side, in a pale casing: it turns slowly from side to side, showing its thick edge, while a
// bright line runs round its rim once per loop. Other shapes: an orb whose casing bands cross it as it
// turns, and a ring of energy in two clamps round a bright bead. One or two layers of shell, band or ring.
// Collecting it is the standard pickup pop (engine/pickups.js).
// The turned shell, the run of light and the bands on the orb are drawToken, rimRunIn and meridianIn
// in engine/gadgets.js; this file gives each shape its size and its layers.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, PI } from '../engine/motion.js';
import { ramp, mix, INK } from '../engine/color.js';
import { ellipseIn, rectIn } from '../engine/surface.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { placedIn, insetIn, hoopIn, anyIn } from '../engine/shapes.js';
import { pickupClips, pickupPose, collectBurst, gleam } from '../engine/pickups.js';
import { drawToken, flatHexIn, rimRunIn, meridianIn } from '../engine/gadgets.js';

const P = PALETTE.derelict;
const CX = 16, CY = 17;
const even = (v) => 2 * Math.round(v / 2);
// Width at the smallest and biggest size, and the height for a width.
const SHAPES = { hex: { w: [16, 22], h: (w) => even(w * 0.9) }, orb: { w: [14, 20], h: (w) => w }, ring: { w: [16, 22], h: (w) => w } };
const SWAY = 0.75;                // how far the shell turns to each side, in radians: never edge-on, so it is not taken for a spinning chip
const FULL = [0, 0, 32, 32];

export default defineSprite({
  id: 'shield-cell',
  name: 'Shield cell',
  kind: 'Item',
  blurb: 'A six-sided cell of blue shield energy that turns slowly while a light runs round its rim. Make it a shell, an orb or a ring, with one or two layers, in your colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'front',
    words: ['shield', 'cell', 'energy', 'armour', 'barrier', 'protect', 'battery', 'power', 'hexagon', 'orb', 'collect', 'pickup', 'recharge', 'blue'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'hex', [{ value: 'hex', label: 'Six sides' }, 'orb', 'ring']),
    rings: choice('Layers', 'one', ['one', 'two']),
    sparkle: toggle('Sparkle', true),
    body: color('Casing', P.panel, swatchesBetween('derelict', 'metal', { lead: 'panel', min: 0.45 })),      // no dark casing: it would merge with the outline
    glow: color('Glow', P.shield, swatches('derelict', 'glow', { lead: 'shield' })),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'upgrade-get', preset: 'Shield cell', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const S = SHAPES[p.shape] ?? SHAPES.hex;
    const w = even(lerp(S.w[0], S.w[1], p.size)), h = S.h(w), R = w / 2;
    const idle = clip === 'idle', two = p.rings === 'two';
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY, up: h / 2 + 1, side: R + 1 });
    const y = at.y, M = ramp(p.body), G = ramp(p.glow);
    const run = idle ? t + 0.06 : 0.12;                       // where the bright line is: once round per loop
    const put = (test) => placedIn(test, CX, y, { sx: at.sx, sy: at.sy });

    if (at.show) {
      if (p.shape === 'orb') {
        // a ball of energy; the casing is a cap on each pole and one or two bands from pole to pole, which cross it as it turns
        const ball = put(ellipseIn(0, 0, R, R));
        g.fill(...FULL, ball, G, { shade: 2 });
        if (!at.bare) {
          g.fill(...FULL, put(ellipseIn(R * 0.2, -R * 0.2, R * 0.5, R * 0.5)), G.light, { clip: insetIn(ball, 1) });
          g.fill(...FULL, put(ellipseIn(R * 0.3, -R * 0.3, R * 0.2, R * 0.2)), '#ffffff');
          const turn = idle ? PI * t : 0.5;
          const bands = [meridianIn(0, 0, R, R, turn, 2), ...(two ? [meridianIn(0, 0, R, R, turn + PI / 2, 2)] : [])];
          g.fill(...FULL, put(anyIn(bands)), mix(M.light, '#ffffff', 0.3), { outline: G.dark, clip: ball });
        }
        g.fill(...FULL, (px, py) => ball(px, py) && Math.abs(py - y) > (R - 2) * at.sy, M, { light: 1 });
        g.fill(...FULL, rimRunIn(ball, CX, y, run, 0.2), '#ffffff');
      } else if (p.shape === 'ring') {
        // a ring of energy held in a clamp at the top and one at the bottom, turning from side to side round a bright bead; a second ring inside it turns the other way
        const turn = idle ? SWAY * wave(t) : 0, c = Math.cos(turn);
        const hoop = put(hoopIn(0, 0, R * c, R, 3));
        g.fill(...FULL, hoop, G, { shade: 1, light: 1 });
        if (two && !at.bare) g.fill(...FULL, put(hoopIn(0, 0, (R - 5) * Math.cos(idle ? SWAY * wave(t, 0.25) : 0.5), R - 5, 2)), { base: G.light, dark: G.base, light: G.light }, { shade: 1 });
        g.fill(...FULL, put(ellipseIn(0, 0, 2, 2)), '#ffffff', { outline: G.base });
        const clamp = anyIn(rectIn(-2, -R, 4, 4), rectIn(-2, R - 4, 4, 4));
        g.fill(...FULL, put(clamp), M, { light: 1 });
        g.fill(...FULL, rimRunIn(hoop, CX, y, run, 0.16), '#ffffff', { clip: (px, py) => !put(clamp)(px, py) });
      } else {
        // a thick six-sided shell: a pale rim, a dark groove, then the energy, brighter towards the middle
        const T = drawToken(g, flatHexIn(0, 0, w, h), CX, y, p.body, { turn: idle ? SWAY * wave(t) : 0, thick: 4 * at.scale, rim: 2, field: G.dark, sx: at.sx, sy: at.sy });
        if (T.field) {
          g.fill(...FULL, insetIn(T.field, 1), G.base);
          if (two) { g.fill(...FULL, insetIn(T.field, 3), G.dark); g.fill(...FULL, insetIn(T.field, 4), G.light); }
          else g.fill(...FULL, insetIn(T.field, 3), G.light);
          if (!at.bare) g.fill(...FULL, T.on(rectIn(-1, -1, 2, 2)), '#ffffff');
          g.fill(...FULL, rimRunIn(T.face, CX + T.x * at.sx, y, run, 0.2, 2), '#ffffff', { clip: (px, py) => !T.field(px, py) });
        }
      }
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (idle && p.sparkle) gleam(g, CX + R - 2, y - h / 2 + 1, t, G.light, { at: 0.56 });
    collectBurst(g, { burst: at.burst, x: CX, y, r: Math.max(R, h / 2), colour: p.glow, sparkle: p.sparkle });
  },
});
