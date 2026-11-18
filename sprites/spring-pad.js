// Spring pad: a pad on a coil spring that throws the player into the air.
// `idle` is the pad at rest. `bounce`: pressed flat on frame 1 (the sound), shot up to nearly
// the top of the frame on frames 2 and 3 with the coil pulled thin, then a wobble down to rest.
// The pad is a studded wooden plate, a broad curled leaf or a small drum; the foot and the coil
// are the same under all three, so the one number that drives the whole clip is how high the
// top of the pad stands above the ground line.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { ellipseIn, capsuleIn } from '../engine/surface.js';
import { lerp, clamp } from '../engine/motion.js';
import { ramp, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { coil } from '../engine/mech.js';

const P = PALETTE.thornwood;
const SIZE = 32, CX = 16, GROUND = 29;                         // the last row above the ground line; its outline lands on row 30
const FOOT = 2;                                                // height of the foot plate
// the pad sits on the spring: the two lists share no colour. No red pad: this is not a red disc.
const METAL = swatches('thornwood', 'metal');
const BODY = swatches('thornwood', 'outfit', { lead: 'hero' }).filter((c) => c !== P.crimson && !METAL.includes(c));
const THICK = { plate: 5, leaf: 5, drum: 7 };                  // how thick each pad is
const CURL = { plate: 0, leaf: 2, drum: 0 };                   // how far a pad's ends stand above its top

// How high the top of the pad stands above the ground line this frame, and how hard it is being
// pressed (1 on the frame it is flat) or pulled (1 at the top of its flight).
function stand(clip, frame, p) {
  const rest = Math.round(lerp(12, 19, p.height));
  if (clip !== 'bounce') return { h: rest, rest, press: 0, pull: 0 };
  const low = FOOT + THICK[p.style] + 3;                       // the coil squeezed to three rows
  const top = Math.min(Math.round(lerp(rest + 4, 27, p.bounce)), 27 - CURL[p.style]);
  const h = [rest, low, Math.round(lerp(rest, top, 0.8)), top, Math.round(lerp(rest, top, 0.3)), Math.max(low, rest - 2), rest + 1, rest][frame];
  return { h, rest, press: frame === 1 ? 1 : 0, pull: clamp((h - rest) / Math.max(1, top - rest)) };
}

export default defineSprite({
  id: 'spring-pad',
  name: 'Spring pad',
  kind: 'Item',
  blurb: 'A pad on a coil spring that launches whoever lands on it; change the pad (plate, leaf or drum), its width and height, the number of coils, the colours and how far it stretches.',
  meta: {
    type: 'prop',
    role: 'world/platform',
    themes: ['fantasy', 'forest'],
    gameTypes: ['platformer'],
    view: 'side',
    words: ['spring', 'pad', 'bounce', 'trampoline', 'launch', 'jump', 'bouncer', 'coil', 'springboard', 'boing', 'leaf', 'drum'],
    license: 'draft',
  },
  size: [SIZE, SIZE],
  pivot: [CX, 30],
  params: {
    style: choice('Style', 'plate', ['plate', 'leaf', 'drum']),
    width: range('Width', 0.6, { lo: 'Narrow', hi: 'Wide' }),
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    coils: range('Coils', 3, { min: 2, max: 4, step: 1, lo: 'Few', hi: 'Many' }),
    body: color('Pad', P.hero, BODY),
    metal: color('Spring', P.steel, METAL),
    bounce: range('Bounce', 0.75, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: {
    idle: { frames: 1, fps: 8, loop: true },
    bounce: { frames: 8, fps: (p) => 12 * lerp(0.65, 1.45, p.speed), loop: false },
  },
  sounds: { bounce: [{ sound: 'spring-boing', preset: 'Spring pad', frame: 1, volume: 0.8 }] },

  render(g, { clip, frame, p }) {
    const { h, rest, press, pull } = stand(clip, frame, p);
    const body = ramp(p.body), metal = ramp(p.metal);
    const W = 2 * Math.round(lerp(8, 13, p.width));             // pad width: 16 to 26, always even so it is centred
    const th = THICK[p.style];
    const top = GROUND + 1 - h;                                 // the pad's top row
    const under = top + th;                                     // the first row below the pad

    // ---- the foot and the coil ----
    const fw = 2 * Math.round(W * 0.3);
    g.rect(CX - fw / 2, GROUND + 1 - FOOT, fw, FOOT, metal, { shade: 0 });
    g.rect(CX - fw / 2, GROUND + 1 - FOOT, fw, 1, metal.light);
    const len = GROUND + 1 - FOOT - under, restLen = rest - th - FOOT;
    // pulled long the coil gets thinner, squeezed short it bulges
    const cw = Math.round(W * 0.5 * clamp(Math.sqrt(restLen / Math.max(1, len)), 0.62, 1.2));
    coil(g, CX, under, CX, GROUND + 1 - FOOT, { turns: Math.round(p.coils), width: cw, colour: p.metal });

    // ---- the pad ----
    const x0 = CX - W / 2;
    if (p.style === 'plate') {
      // a wooden plate with a metal cap on each end and a row of studs
      g.rect(x0, top, W, th, body, { shade: 0 });
      g.rect(x0, top, W, 1, body.light);
      g.rect(x0, top + th - 2, W, 2, body.dark);                // the underside, in shade
      for (const x of [x0, x0 + W - 3]) { g.rect(x, top, 3, th, metal, { shade: 0 }); g.rect(x, top, 3, 1, metal.light); g.rect(x, top + th - 1, 3, 1, metal.dark); }
      for (let x = x0 + 5; x <= x0 + W - 7; x += 4) g.rect(x, top + 1, 2, 1, metal.light);       // studs, each two pixels
      g.rect(CX - 3, under, 6, 1, metal.dark);                  // the bracket the coil is fixed to
    } else if (p.style === 'leaf') {
      // a broad leaf cupped upward: a stalk end on the left, a pointed tip curling up on the right.
      // Pressed, both ends curl higher; in flight they trail down
      const lift = 2 + press - Math.round(2.4 * pull), mid = top + th / 2;
      g.blob([
        ellipseIn(CX, mid + 0.2, W / 2 - 1, th / 2 + 0.2),
        capsuleIn(CX + W / 2 - 5, mid, CX + W / 2 - 0.6, mid - lift, 1.8, 0.7),
        capsuleIn(CX - W / 2 + 4, mid + 0.5, CX - W / 2 + 0.8, mid - lift * 0.6, 1.3, 0.8),
      ], body, { shade: 1 });
      g.rect(x0 + 4, top + 1, W - 9, 1, body.light);            // the lit upper face
      g.rect(x0 + 3, top + 2, W - 7, 1, body.dark);             // the midrib
      for (let x = x0 + 5; x < x0 + W - 5; x += 3) g.dot(x, top + 3, body.dark);                  // side veins
      g.rect(CX - 1, under - 1, 2, 2, body.dark);               // the stalk, where the coil holds it
    } else {
      // a small drum: a pale skin, a shell laced in zigzag, a metal hoop top and bottom
      const skin = ramp(mix(P.cream, p.body, 0.12));
      const dent = press ? 1 : 0;
      g.rect(x0 + 1, top + 2, W - 2, th - 2, body, { shade: 0 });
      g.rect(x0 + 1, top + th - 2, W - 2, 1, body.dark);
      for (let x = x0 + 2, i = 0; x < x0 + W - 2; x++, i++) g.dot(x, top + 3 + [0, 1, 2, 1][i % 4], skin.base);   // the lacing
      g.rect(x0, top + 1, W, 1, metal.base); g.rect(x0, top + th - 1, W, 1, metal.dark);           // the hoops
      g.rect(x0 + 1, top, W - 2, 1, skin.light);                // the skin
      if (dent) { g.rect(x0 + 5, top, W - 10, 1, skin.dark); }
    }
    g.outline(INK);
  },
});
