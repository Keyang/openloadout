// Micro rocket: a small missile with an inked metal body, a flame at its tail and smoke puffs that
// fall behind and shrink. Drawn pointing right, so a game can turn it to the way it flies; it
// weaves a pixel from side to side as it goes. `hit` is only a small flash, a ring and smoke: the
// game plays a bigger blast (`plasma-burst`) over it. The body is the framework's `missile`
// (engine/shots.js), the flame, smoke and flash are engine/fx.js; this file is sizes and timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp, PI, TAU } from '../engine/motion.js';
import { ramp, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, flame, particles, puffs, ring, glow as flash } from '../engine/fx.js';
import { missile, trailPuffs, MISSILE_NOSES, MISSILE_FINS } from '../engine/shots.js';

const P = PALETTE.derelict;
const CY = 8;
const LEFT = -PI / 2;                                    // the way the flame and the smoke stream
const HIT_X = 18;                                        // where the flash is in `hit`, near the middle so the ring has room
const BODY = swatches('derelict', 'body', { lead: 'panel' });
// The stripe sits on the body, so the two controls never offer the same colour.
const ACCENT = swatches('derelict', 'accent', { lead: 'teal' }).filter((c) => !BODY.includes(c));
const GLOW = swatches('derelict', 'glow', { lead: 'amber' });

export default defineSprite({
  id: 'micro-rocket',
  name: 'Micro rocket',
  kind: 'Item',
  blurb: 'A small missile with a flame and a smoke trail, drawn pointing right so a game can turn it to the way it flies. Change its length, nose, fins, smoke and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'top-down',
    words: ['rocket', 'missile', 'warhead', 'launcher', 'homing', 'smoke', 'flame', 'shoot', 'fly', 'hit', 'explode', 'heavy weapon'], license: 'draft' },
  size: [32, 16],
  pivot: [16, CY],
  grounded: false,
  preview: 'fly',
  sounds: { hit: [{ sound: 'explosion', preset: 'Fireworks pop', frame: 0, volume: 0.8 }] },
  params: {
    length: range('Length', 0.5, { lo: 'Short', hi: 'Long' }),
    shape: choice('Nose', 'round', MISSILE_NOSES),
    fins: choice('Fins', 'small', MISSILE_FINS),
    smoke: toggle('Smoke', true),
    body: color('Body', P.panel, BODY),
    accent: color('Stripe', P.teal, ACCENT),
    glow: color('Flame', P.amber, GLOW),
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 6, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false },
  },

  render(g, { clip, t, p }) {
    const body = ramp(p.body);
    const fire = steps(p.glow, { core: P.cream, white: false });          // [core, middle, flame, rim]
    const smoke = [body.base, body.dark];                                 // exhaust in the body's own tones, dimmer than its lit side

    if (clip === 'hit') {
      // a white-hot flash that is gone in two frames, a ring of the flame's colour, embers and a little smoke
      if (p.smoke) puffs(g, { t, x: HIT_X, y: CY, loop: false, count: 4, seed: 8, stagger: 0.1, angle: PI, arc: TAU, dist: 6, rise: 2, size: 2.6, colours: [body.light, body.base, body.base] });   // pale, so the last wisps show on a dark floor
      ring(g, { t, x: HIT_X, y: CY, r0: 3, r1: 6.5, thick: 3, seed: 2, colours: [fire[0], fire[2], fire[2], fire[3]] });
      if (t > 0.3) particles(g, { t, x: HIT_X, y: CY, loop: false, count: 6, seed: 5, stagger: 0.15, angle: PI, arc: TAU, dist: 9, size: 2.2, colours: [fire[0], fire[2], fire[3]] });
      const hot = 6 * clamp(1 - t * 2.2);
      if (hot >= 1.5) flash(g, HIT_X, CY, hot, ['#ffffff', fire[0], fire[2], fire[3]]);
      return;
    }

    // ---- fly ----
    const L = Math.round(lerp(9, 13, p.length));                           // tail to the end of a round nose; flat is 2 px less, pointed 2 px more
    const sway = lerp(0, 1.7, p.wobble);
    const y = CY + Math.round(sway * wave(t));                             // it weaves from side to side
    const x = 20 + Math.round(L / 2) - L;                                  // its tail end; the nose leads on the right
    const { nozzle } = missile(g, { x, y, length: L, width: 4, nose: p.shape, fins: p.fins, colour: p.body, stripe: p.accent, at: 0.55 });
    g.outline(INK);

    // behind it, un-inked: smoke first, then the flame over the smoke. Flame and smoke together stay within
    // 9 px of the tail, so the whole shot is 24 px or less at the default length whatever its nose.
    const F = lerp(3.4, 4.2, p.length) * (1 + 0.18 * wave(2 * t, 0.2));   // the flame pumps twice per loop, so the loop closes
    if (p.smoke) trailPuffs(g, { t, x: nozzle[0] - 3.5, y: CY, count: 3, seed: 4, dist: 6.5, size: 5, spread: 1.2, colours: smoke });
    // the flame lags the body: its tip is still where the tail was a moment ago
    const lag = y - (CY + Math.round(sway * wave(t - 0.125)));
    flame(g, { t, x: nozzle[0] + 1, y, head: 2, cycles: 2, heat: 0.75, tongues: [{ angle: LEFT + Math.atan2(lag, F), length: F + 1, width: 2, sway: 0.4 + 0.5 * p.wobble }], colours: [fire[0], fire[2], fire[3]], box: [1, 1, nozzle[0], 15] });
  },
});
