// Star charm (kit-platformer-fantasy, batch P11): the power-up. A flat star-shaped medallion with
// sharp straight points, a raised rim and a jewel, hanging from a small loop at its top point. It
// swings a few degrees like a charm on a chain and turns edge-on once per loop, as the coin does,
// trailing twinkles in its glow colour. It has no face: it is a badge, not a cartoon star.
// The loop is the ring of the chain: it does not turn with the badge, and a short stem on the top
// point (which does turn) keeps the two joined in every frame, edge-on included.
// Collecting it is the standard pickup pop (engine/pickups.js).
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, pulse, fract, keys, PI } from '../engine/motion.js';
import { ramp, tone, mix, brightness, INK } from '../engine/color.js';
import { Surface, ellipseIn, rectIn, capsuleIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { twinkle } from '../engine/fx.js';
import { placedIn, insetIn, turnedIn, ringIn, starIn, spunIn } from '../engine/shapes.js';
import { pickupClips, pickupPose, collectBurst, gleam } from '../engine/pickups.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 17, LOOP = 2, THICK = 2;      // LOOP: the radius of the loop it hangs from; THICK: the thickness of the badge
const POINTS = { four: 4, five: 5, six: 6, eight: 8 };
// The turn through one loop, in half turns: it passes edge-on quickly, so that only frame 4 of 8 is the bar
// and the frames beside it (3 and 5) are still more than half as wide as the face and keep their points.
const TURN = [[0, 0], [0.375, 0.32], [0.5, 0.5], [0.625, 0.68], [1, 1]];
// Six and eight points. inner: deeper notches than the shared default (share of the radius), or the points are 2 px nubs and the badge reads as a nut or a cog.
// spine: half the thickness of a bar down the middle of each point, so that a slanted point is a solid stair of pixels to its tip, not a chain of pixels hanging by their corners.
const CUT = { six: { inner: 0.46, spine: 0.71 }, eight: { inner: 0.44, spine: 0.75 } };

export default defineSprite({
  id: 'star-charm',
  name: 'Star charm',
  kind: 'Item',
  blurb: 'A star-shaped gold medallion on a loop that swings, turns and twinkles: the power-up. Change its points, jewel, halo and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['fantasy', 'forest'], gameTypes: ['platformer', 'arcade', 'roguelike-action'], view: 'front',
    words: ['star', 'charm', 'medallion', 'amulet', 'badge', 'power up', 'powerup', 'bonus', 'invincible', 'collect', 'pickup', 'reward', 'magic', 'shiny'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'five', [{ value: 'four', label: 'Four points' }, { value: 'five', label: 'Five points' }, { value: 'six', label: 'Six points' }, { value: 'eight', label: 'Eight points' }]),
    jewel: toggle('Jewel', true),
    halo: toggle('Halo', true),
    sparkle: toggle('Sparkle', true),
    body: color('Metal', P.gold, swatches('thornwood', 'metal', { lead: 'gold' }).filter((c) => brightness(c) > 0.5)),   // bright metals only: a dark badge hides its own rim
    glow: color('Glow', P.magic, swatches('thornwood', 'glow').filter((c) => c !== P.gold)),      // never the charm's own gold
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'powerup', preset: 'Charge', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const R = Math.round(lerp(13, 19, p.size)) / 2, n = POINTS[p.shape] ?? 5;      // radius to the tips
    const D = R, mid = (D + R - LOOP) / 2;           // loop to star centre (the loop sits on the tip of the top point); loop to the middle of the whole charm
    const idle = clip === 'idle';
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY, up: mid + LOOP + 1.5, down: R + D - mid + 1.5, side: R + 2.5 });
    const swing = idle ? 0.11 * wave(t) : 0;                                     // about six degrees each way, round the loop
    const turn = idle ? PI * keys(t, TURN, (x) => x) : 0;                              // the two faces match: half a turn is one loop
    // written with the loop at (0, 0) and the star hanging under it; swung round the loop, then put in the frame
    const put = (test) => placedIn(placedIn(test, 0, -mid, { angle: swing }), CX, at.y, { sx: at.sx, sy: at.sy });
    const sx = CX - Math.sin(swing) * D * at.sx, sy = at.y + (Math.cos(swing) * D - mid) * at.sy;      // where the star's middle is
    const M = ramp(p.body), G = ramp(p.glow);

    if (p.halo && at.show && !at.bare) {
      // a thin ring of light behind the star, showing between its points, that swells and brightens twice per loop
      const beat = pulse(t * 2), hr = R * lerp(0.74, 0.96, beat);
      g.fill(0, 0, 32, 32, ringIn(sx, sy, hr + 1, 1), tone(p.glow, -1));
      g.fill(0, 0, 32, 32, ringIn(sx, sy, hr, 1), beat > 0.5 ? G.light : G.base);
    }
    if (at.show) {
      const s = new Surface(32, 32);
      const cut = CUT[p.shape], flat = starIn(0, D, R, n, { inner: cut?.inner });
      const spines = cut && spunIn(capsuleIn(0, 0, 0, cut.spine - R, cut.spine), 0, D, n);
      // (the top spine stops under the loop, or it fills the loop's hole)
      const star = spines ? (x, y) => flat(x, y) || (y >= LOOP - 1 && spines(x, y)) : flat, stem = rectIn(-1, LOOP - 1, 2, 2), loop = ringIn(0, 0, LOOP, 1);
      // the edge shows thinner than it is until the badge is edge-on, so that a half-turned star keeps the notches between its points
      // (edge-on it is a bar as long as the star is tall, down to its lowest points, not only as long as its middle column)
      const edgeOn = Math.abs(Math.cos(turn)) < 0.2, tall = rectIn(-R, D - R, 2 * R, R + (n % 2 ? R * Math.cos(PI / n) : R));
      const T = turnedIn((x, y) => (edgeOn ? tall(x, y) : star(x, y)) || stem(x, y), turn, edgeOn ? THICK : 1.2);
      const side = mix(M.base, M.dark, 0.5), front = { base: M.light, dark: M.base, light: mix(M.light, '#ffffff', 0.5) };
      s.fill(0, 0, 32, 32, put(T.body), { base: side, dark: M.dark, light: M.base }, { shade: 1 });     // the edge of the badge
      // the face: a rim one tone lighter all round (the base tone on its shadow side), and the flat field inside it
      const face = put(T.face);
      s.fill(0, 0, 32, 32, face, front, { shade: 1, light: T.squeeze > 0.9 ? 1 : 0 });
      s.fill(0, 0, 32, 32, put(loop), front, { shade: 1 });                                        // the loop, always face-on
      if (T.squeeze > 0.3) {
        s.fill(0, 0, 32, 32, insetIn(put((x, y) => T.face(x, y) && star((x - T.x) / T.squeeze, y)), 1), M.base);
        if (p.jewel && !at.bare) {
          const jr = Math.max(2, R * 0.28);
          s.fill(0, 0, 32, 32, put(ellipseIn(T.x, D, jr * T.squeeze, jr)), G, { light: 1, outline: M.dark });
          if (T.squeeze > 0.6) s.dot(sx + T.x, sy - 1, '#ffffff');
        }
      }
      if (at.flash) s.tint('#ffffff');
      s.outline(INK);
      g.blit(s);
    }
    if (idle || t < 0.5) {
      // three twinkles that trail the swing and blink in turn: two of them are always lit (they hold still while it pops)
      const tw = idle ? t : 0;
      const spots = [[-0.95, 0.55], [1, 0.1], [-0.15, 1.2]];
      spots.forEach(([ux, uy], i) => {
        const life = fract(tw + i / 3), lag = 2.5 * (wave(tw, -0.14 * (i + 1)) - wave(0, -0.14 * (i + 1)));
        if (life < 0.67) twinkle(g, CX + ux * (R + 2) - lag, at.y + (D - mid) + uy * (R + 1) * 0.8, life < 0.34 ? 1 : 0, life < 0.34 ? G.base : G.light);
      });
      if (idle && p.sparkle) gleam(g, sx + R * 0.6, sy - R * 0.8, t, M.light, { at: 0.875 });      // as it turns to face us again
    }
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: R + 1, colour: p.body, sparkle: p.sparkle });
  },
});
