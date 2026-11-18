// Enemy plasma orb: what the station's enemies shoot. Bigger and slower than the player's bolt
// and red by default, so a player can tell at a glance whose shot is whose. A ball of light that
// wobbles as it flies, with a short tail to the left and a darker swirl turning inside it; no ink
// outline. Drawn pointing right, so a game can turn it to the way it flies. `hit` is a white flash
// that opens into a ring of embers. The light is the framework's (engine/shots.js `lightShape`,
// engine/fx.js); this file is the three styles, the sizes and the timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp, PI, TAU } from '../engine/motion.js';
import { ellipseIn } from '../engine/surface.js';
import { anyIn, allIn, notIn, placedIn, ringIn, starIn, insetIn } from '../engine/shapes.js';
import { fanBladesIn } from '../engine/plating.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, particles, ring, glow as flash } from '../engine/fx.js';
import { lightShape, dropIn } from '../engine/shots.js';

const P = PALETTE.derelict;
const CY = 16;
// The core sits inside the glow, so the two controls never offer the same colour, and every core is lighter than every glow.
const GLOW = swatches('derelict', 'glow', { lead: 'red' });
const CORE = [P.cream, P.suit, P.skin, P.steel].filter((c) => !GLOW.includes(c));
const SPIKES = 6;

// Sizes shared by both clips: the ball's radius, the tail behind it, and where the ball's centre sits so that the
// whole drawing is about the pivot.
function dims(p) {
  const R = lerp(4.5, 7.5, p.size) * (p.style === 'spiky' ? 0.86 : 1);
  const tail = lerp(2.5, 8, p.length);
  return { R, tail, cx: 16 + Math.round(tail / 2) - (p.style === 'spiky' ? 1 : 0) };
}

export default defineSprite({
  id: 'plasma-orb',
  name: 'Enemy plasma orb',
  kind: 'Effect',
  blurb: 'A wobbling ball of hostile plasma with a swirl turning inside it, drawn pointing right so a game can turn it to the way it flies; it bursts into a ring of embers. Change its size, style, swirl, tail and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'top-down',
    words: ['plasma', 'orb', 'ball', 'energy', 'enemy shot', 'bullet', 'swirl', 'shoot', 'fly', 'hit', 'burst', 'danger', 'hostile'], license: 'draft' },
  size: [32, 32],
  pivot: [16, CY],
  grounded: false,
  preview: 'fly',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    style: choice('Style', 'orb', ['orb', 'ring', 'spiky']),
    swirl: toggle('Swirl', true),
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    core: color('Core', P.cream, CORE),
    glow: color('Glow', P.red, GLOW),
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    const { R, tail, cx } = dims(p);
    const [white, core, mid, glow, rim] = steps(p.glow, { core: p.core });

    if (clip === 'hit') {
      // frame 0: the white-hot flash; then a ring of the glow opens, cools and breaks up, with embers thrown ahead of it
      const bx = 16, r1 = lerp(9, 13, p.size);
      ring(g, { t, x: bx, y: CY, r0: R, r1, thick: 4, seed: 3, colours: [core, mid, glow, glow, rim] });
      particles(g, { t, x: bx, y: CY, loop: false, count: p.style === 'spiky' ? 12 : 8, seed: 6, stagger: 0.15, angle: PI, arc: TAU, dist: Math.min(14, r1 * 1.3), size: 2.4, colours: [mid, glow, glow, rim] });
      if (t < 0.3) flash(g, bx, CY, (R + 3) * clamp(1 - t * 1.6), [white, core, mid, glow, rim]);
      return;
    }

    // ---- fly ----
    const w = lerp(0, 0.16, p.wobble) * wave(t);                        // it swells sideways, then upward, once per loop
    const squash = { sx: 1 + w, sy: 1 - w };
    const T = R + tail * (1 + 0.18 * wave(2 * t, 0.15));                 // the tail pumps twice per loop, so the loop closes
    const ball = placedIn(ellipseIn(0, 0, R, R), cx, CY, squash);
    const comet = anyIn(ball, placedIn(dropIn(0, 0, R * 0.7, T), cx, CY, squash));   // a round ball, and a tail narrower than it
    // bands from the rim inward: two px of glow (three on a big one), one of the middle tone, then the core
    const bands = R >= 6.4 ? [core, mid, glow, glow, glow, rim] : [core, mid, glow, glow, rim];
    const inner = R - (bands.length - 3);                                // where the core begins
    const turn = TAU * t;

    if (p.style === 'ring') {
      // a hoop of plasma with a hole through it; the tail hangs from the back of the hoop
      const thick = Math.max(3, Math.round(R * 0.5));
      const hoop = placedIn(ringIn(0, 0, R, thick), cx, CY, squash);
      lightShape(g, anyIn(hoop, allIn(comet, notIn(ball))), [glow, rim]);
      // the hot line inside the hoop; with the swirl it is two bright arcs that chase each other round, half a turn per loop
      const line = insetIn(hoop, 1);
      lightShape(g, p.swirl ? allIn(line, fanBladesIn(cx, CY, R + 2, { blades: 2, angle: turn / 2, hub: 0, duty: 0.62, sweep: 0 })) : line, [core]);
      return;
    }

    if (p.style === 'spiky') {
      // a spiked star round the ball: it turns one point per loop, and its points reach out and draw back twice
      const star = starIn(0, 0, R + 3 + 0.8 * wave(2 * t), SPIKES, { inner: 0.5, angle: turn / SPIKES });
      lightShape(g, anyIn(placedIn(star, cx, CY, squash), comet), bands);
    } else {
      lightShape(g, comet, bands);
    }
    // the swirl: two darker arms of the glow that reach in from the band of glow and turn half a turn per loop
    if (p.swirl) lightShape(g, allIn(fanBladesIn(cx, CY, inner + 1.5, { blades: 2, angle: turn / 2, hub: 0.8, duty: 0.34, sweep: 2.4 }), insetIn(ball, 1)), [glow]);
  },
});
