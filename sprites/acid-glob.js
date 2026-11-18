// Acid glob: a lobbed blob of acid. Inked and glossy, it stretches and squashes as it tumbles and
// sheds drips that fall behind it. Drawn flying right, so a game can turn it to the way it flies.
// `hit` flattens it into a splat with droplets flying out, which dries back to a small puddle (the
// game then places `acid-pool` there). The splat is the framework's `splatIn` (engine/plating.js),
// the drips are `trailPuffs` (engine/shots.js); this file is the three shapes, sizes and timing.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, wave, keys, PI, TAU } from '../engine/motion.js';
import { ellipseIn } from '../engine/surface.js';
import { ramp, INK } from '../engine/color.js';
import { anyIn, allIn, placedIn, insetIn } from '../engine/shapes.js';
import { squashStretch } from '../engine/creature.js';
import { splatIn } from '../engine/plating.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { particles } from '../engine/fx.js';
import { dropIn, crescentIn, trailPuffs } from '../engine/shots.js';

const P = PALETTE.derelict;
const CY = 16;
const BODY = swatches('derelict', 'liquid', { lead: 'acid' });
// The shine lies on the body, so the two controls never offer the same colour.
const SHINE = [P.cream, P.suit, P.skin, P.steel].filter((c) => !BODY.includes(c));

// The glob this frame, as blobs of goo: [x, y, r] each, about its middle (0, 0). `turn` is how far it has tumbled.
function lumps(shape, R, turn) {
  const at = (a, d, r) => [Math.cos(a) * d, Math.sin(a) * d, r];
  if (shape === 'cluster') return [at(turn, R * 0.42, R * 0.66), at(turn + 2.2, R * 0.55, R * 0.5), at(turn + 4.3, R * 0.6, R * 0.4)];   // three drops stuck together, going round each other
  return [[0, 0, R * (shape === 'teardrop' ? 0.88 : 1)], at(turn, R * 0.72, R * 0.4)];                                                  // one ball, and a bulge that travels round it
}

export default defineSprite({
  id: 'acid-glob',
  name: 'Acid glob',
  kind: 'Item',
  blurb: 'A wobbling blob of acid that sheds drips as it flies and splats into a puddle, drawn flying right so a game can turn it to the way it flies. Change its size, shape, drips and colours.',
  meta: { type: 'projectile', role: 'effects/projectile', themes: ['sci-fi', 'space', 'horror'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'top-down',
    words: ['acid', 'glob', 'blob', 'spit', 'goo', 'slime', 'venom', 'drip', 'fly', 'hit', 'splat', 'puddle', 'bug attack', 'sticky'], license: 'draft' },
  size: [32, 32],
  pivot: [16, CY],
  grounded: false,
  preview: 'fly',
  sounds: { hit: [{ sound: 'bug-splat', preset: 'Mite pop', frame: 0, volume: 0.7 }] },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'teardrop', 'cluster']),
    pieces: range('Drips', 0.5, { lo: 'Few', hi: 'Many' }),
    body: color('Body', P.acid, BODY),
    glow: color('Shine', P.cream, SHINE),
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    fly: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: true },
    hit: { frames: 8, fps: (p) => 16 * lerp(0.65, 1.45, p.speed), loop: false, label: 'Splat' },
  },

  render(g, { clip, t, frame, p }) {
    const R = lerp(4.5, 7.5, p.size);
    const tones = ramp(p.body), goo = { base: tones.base, dark: tones.dark, light: tones.base };   // base and shadow: the shine is the highlight
    const drips = Math.round(lerp(1, 5, p.pieces));
    // the shine: a crescent on the side of the light and a dot beside it, on a blob of radius r at (x, y)
    const shine = (x, y, r, inside) => {
      g.fill(x - r, y - r, x + r, y + r, allIn(crescentIn(x + r * 0.12, y - r * 0.12, r * 0.66, { bite: 0.92, shift: 0.42, angle: -PI / 4 }), insetIn(inside, 1)), p.glow);
      if (r >= 3.5) g.rect(Math.round(x - r * 0.42), Math.round(y + r * 0.2), 1, 1, p.glow);
    };

    if (clip === 'hit') {
      // 0 flattened wide, 1 to 2 the splat bursts open and droplets fly, 3 to 5 it draws back, 6 to 7 a small puddle
      const grow = keys(t, [[0, 1.05], [0.14, 1.45], [0.3, 1.75], [0.6, 1.5], [0.86, 0.95], [1, 0.85]]);
      const r = R * grow;
      const body = frame === 0
        ? placedIn(ellipseIn(0, 0, R, R), 16, CY, { sx: 1.25, sy: 1.25 })
        : frame >= 6
          ? anyIn(splatIn(16, CY, r, { seed: 5, lobes: 4, drops: 0 }), ellipseIn(16, CY, r * 0.62, r * 0.5))     // the puddle: a rounder pool
          : splatIn(16, CY, r, { seed: 5, lobes: 6, drops: drips + 1 });
      if (frame >= 1 && frame <= 5) particles(g, { t: (frame - 1) / 5, x: 16, y: CY, loop: false, count: drips + 2, seed: 9, stagger: 0.1, angle: PI, arc: TAU, dist: Math.min(13.5, R * 2.1), size: 3.2, colours: [tones.base, tones.base, tones.dark], box: [2, 2, 30, 30] });
      g.fill(1, 1, 31, 31, body, goo, { shade: 1, clip: (px, py) => px >= 2 && py >= 2 && px < 30 && py < 30 });
      if (frame === 0) g.tint('#ffffff');                 // the slap of the landing
      else shine(16, CY, Math.min(r * 0.62, R), body);
      g.outline(INK);
      return;
    }

    // ---- fly ----
    const [wide, tall] = squashStretch(lerp(0.04, 0.34, p.wobble) * wave(t));
    const cx = p.shape === 'teardrop' ? 21 : 20;           // ahead of the pivot: the tail and the drips trail behind it
    const turn = TAU * t;
    const parts = lumps(p.shape, R, turn).map(([x, y, r]) => ellipseIn(x, y, r, r));
    if (p.shape === 'teardrop') parts.push(dropIn(0, 0, R * 0.8, R * 1.9, -PI / 2 + 0.35 * wave(t, 0.25)));   // its tail wags as it goes
    const body = placedIn(parts, cx, CY, { sx: wide, sy: tall });
    // drips come off the back, fall behind and shrink; they are solid goo, so they are inked with the rest
    const from = cx - R * wide * (p.shape === 'teardrop' ? 1.55 : 0.8);
    trailPuffs(g, { t, x: from, y: CY, count: drips, seed: 2, dist: Math.min(lerp(8, 11, p.size), from - 4), size: lerp(3.6, 4.8, p.size), spread: 2.4, colours: [tones.base, tones.dark], box: [2, 2, 30, 30] });
    g.fill(1, 1, 31, 31, body, goo, { shade: R >= 6.5 ? 2 : 1 });
    for (const [x, y, r] of lumps(p.shape, R, turn).slice(0, p.shape === 'cluster' ? 3 : 1)) shine(cx + x * wide, CY + y * tall, r, body);
    g.outline(INK);
  },
});
