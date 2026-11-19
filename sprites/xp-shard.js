// XP shard (kit-roguelite-scifi, batch S15): experience, dropped by the hundred, so it is tiny (8 to 10
// px in a 16 px frame, 10 to 12 with its outline), one bright shape with a pale heart and very few colours. It floats and its
// heart swells twice per loop. `attract` is the shard pulled towards the player: it stretches into a
// comet pointing right, with a tail that flickers (the game turns it to face the player). `collect` is
// a quick pop: a white flash and three pixels.
// The pose, the burst and the sparkle are engine/pickups.js; the tail's loose streaks are engine/fx.js;
// the crystal and the cube are engine/gadgets.js.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, pulse } from '../engine/motion.js';
import { ramp, INK } from '../engine/color.js';
import { ellipseIn, polyIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { streaks } from '../engine/fx.js';
import { placedIn, insetIn, starIn } from '../engine/shapes.js';
import { pickupPose, collectBurst, gleam } from '../engine/pickups.js';
import { crystalIn, cubeIn } from '../engine/gadgets.js';

const P = PALETTE.derelict;
const FRAME = 16, FULL = [0, 0, FRAME, FRAME];
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);
// Each shape n px along its longer side, written around (0, 0): { body, hw, hh (half its width and height), heart (k => the pale
// heart, k from 0 at rest to 1 swollen), faces (flat tones painted over the body: [shape, tone of the ramp]), oddX, oddY (true:
// its middle is a pixel centre that way, not a pixel corner) }.
const scaled = (test, k) => placedIn(test, 0, 0, { sx: k });
const SHAPES = {
  // a crystal standing on a sharp point
  shard: (n) => { const w = 2 * Math.floor(n * 0.3) + 1, body = crystalIn(0, 0, w, n); return { body, hw: w / 2, hh: n / 2, heart: (k) => scaled(body, lerp(0.42, 0.62, k)), oddX: true, oddY: n % 2 === 1 }; },      // an odd width: its points are one pixel
  // a ball
  orb: (n) => { const r = n % 2 ? (n - 1) / 2 + 0.4 : n / 2, body = ellipseIn(0, 0, r, r); return { body, hw: n / 2, hh: n / 2, heart: (k) => scaled(body, lerp(0.42, 0.62, k)), oddX: n % 2 === 1, oddY: n % 2 === 1 }; },
  // a spark with four sharp points
  star: (n) => { const body = starIn(0, 0, n / 2 + 0.3, 4, { inner: 0.42 }); return { body, hw: n / 2, hh: n / 2, heart: (k) => scaled(body, lerp(0.42, 0.62, k)), oddX: n % 2 === 1, oddY: n % 2 === 1 }; },
  // a cube seen from a corner: a left side, a darker right side and a top that is its pale heart
  cube: (n) => {
    const w = 2 * Math.ceil(n / 2), C = cubeIn(0, 0, w), top = (px, py) => C.top(px, py + C.topY);
    return { body: C.body, hw: w / 2, hh: w / 2, heart: (k) => placedIn(top, 0, C.topY, { sx: lerp(0.7, 1, k) }), faces: [[C.right, 'dark']] };
  },
};

export default defineSprite({
  id: 'xp-shard',
  name: 'XP shard',
  kind: 'Item',
  blurb: 'A tiny glowing shard of experience, made to be dropped by the hundred: it floats, streaks towards the player and pops. Change its shape, size and colours.',
  meta: { type: 'pickup', role: 'items/pickup', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter', 'arcade'], view: 'front',
    words: ['xp', 'experience', 'shard', 'crystal', 'orb', 'exp', 'level up', 'points', 'collect', 'pickup', 'attract', 'magnet', 'tiny', 'glowing'], license: 'draft' },
  size: [FRAME, FRAME],
  pivot: [8, 8],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'shard', ['shard', 'orb', 'star', 'cube']),
    sparkle: toggle('Sparkle', true),
    body: color('Shard', P.xp, swatches('derelict', 'gem'), { material: 'signal' }),
    glow: color('Heart', P.cream, [P.cream, P.suit, P.skin, P.steel], { material: 'light' }),      // pale colours only: it is the bright heart of the shard
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 8, fps: fps(10), loop: true },
    attract: { frames: 6, fps: fps(14), loop: true, label: 'Magnetise' },
    collect: { frames: 6, fps: fps(14), loop: false },
  },
  sounds: { collect: [{ sound: 'xp-blip', preset: 'XP shard', frame: 0, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const n = Math.round(lerp(8, 10, p.size));
    const S = (SHAPES[p.shape] ?? SHAPES.shard)(n), { hw, hh } = S;
    const cx = S.oddX ? 8.5 : 8, cy = S.oddY ? 8.5 : 8;      // an odd size sits on a pixel centre, an even one on a pixel corner
    const B = ramp(p.body);
    // the body and its pale heart, squashed by sx, sy about (x, y); k is how far the heart has swollen
    const draw = (x, y, sx, sy, k, bare) => {
      const put = (test) => placedIn(test, x, y, { sx, sy }), body = put(S.body);
      g.fill(...FULL, body, B, { shade: 0, light: S.faces ? 0 : 1 });      // it glows: a lit edge and no shadow (and it keeps to six colours)
      for (const [face, tone] of S.faces ?? []) g.fill(...FULL, put(face), B[tone], { clip: body });
      if (!bare) g.fill(...FULL, put(S.heart(k)), p.glow, { clip: insetIn(body, 1) });
    };

    if (clip === 'attract') {
      // pulled to the right: the shard is squeezed long and low at the head of a tapering tail, with loose streaks behind it
      const long = Math.min(Math.max(2 * hw * 1.3, 6), 9) + pulse(t * 2), low = Math.min(Math.max(2 * hh * 0.7, 4), 7);
      const head = FRAME - 2 - long / 2, tail = 2 + Math.round(pulse(t));
      g.fill(...FULL, polyIn([[head, cy - low * 0.4], [head, cy + low * 0.4], [tail, cy + 0.5], [tail, cy - 0.5]]), S.faces ? B.dark : { base: B.base, dark: B.base, light: B.light }, { light: 1 });
      draw(head, cy, long / (2 * hw), low / (2 * hh), 0.4, false);
      g.outline(INK);
      streaks(g, { t, x: head - long / 2 - 2, y: cy, count: 2, length: 3, reach: Math.max(2, head - long / 2 - 4), spread: low / 2 + 0.5, colours: [B.light] });
      return;
    }

    const at = pickupPose(clip, t, { bob: p.bob, cy, up: hh + 1, side: hw + 1 + (S.oddX ? 0.5 : 0), frame: FRAME });      // (an odd width sits half a pixel right of the middle)
    const y = at.y;
    if (at.show) {
      const beat = clip === 'idle' ? pulse(t * 2) : 0;                    // the heart swells twice per loop
      draw(cx, y, at.sx, at.sy, beat, at.bare);
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (clip === 'idle' && p.sparkle) gleam(g, cx + hw - 1, y - hh + 1, t, p.glow, { at: 0.75, big: 1 });
    collectBurst(g, { burst: at.burst, x: cx, y, r: Math.max(hw, hh), colour: p.body, sparkle: p.sparkle });
  },
});
