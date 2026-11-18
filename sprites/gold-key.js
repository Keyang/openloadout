// Key (kit-platformer-fantasy, batch P11): a big old key held at a slant, bow up, teeth down.
// It floats and rocks a few degrees while a glint runs down the shaft. Collecting it is the standard
// pickup pop (engine/pickups.js). The key is written upright (bow at the top) and turned as a set of
// shape tests (placedIn in engine/shapes.js), never as a picture, so its edges stay hard.
// One bow is not turned: the skull keeps its head level on the end of the slanted shaft, because a
// skull this small turned 45 degrees loses its sockets and teeth and reads as a spotted plate.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, wave, clamp, PI } from '../engine/motion.js';
import { ramp, tone, mix, brightness, INK } from '../engine/color.js';
import { ellipseIn, rectIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { placedIn, heartIn, skullIn, boundsOf } from '../engine/shapes.js';
import { pickupClips, pickupPose, collectBurst, glint, gleam } from '../engine/pickups.js';

const P = PALETTE.thornwood;
const CX = 16, CY = 16, SLANT = -PI / 4;
const TEETH = { one: 1, two: 2, three: 3 };

// The key upright around (0, 0), one unit = one pixel at scale k: { metal, jewel, glints, shaft, top, tip, by, head }.
// Each bow gives the metal shapes, the jewel set in it and where the jewel's white dots go; `head` is the
// size [w, h] of a skull that is drawn level over the bow end of the shaft instead of turning with it.
function keyShapes(shape, teeth, k) {
  const r = 5 * k, by = -6 * k;                     // the bow: its radius and where its middle is
  const len = Math.round(12.5 * k), y0 = -Math.round(k), y1 = y0 + len;     // the shaft: from under the bow to the tip
  const bows = {
    ring: { metal: [ellipseIn(0, by, r, r)], jewel: [ellipseIn(0, by, 2.5 * k, 2.5 * k)], glints: [[0.6 * k, by - 1.1 * k]] },
    heart: { metal: [heartIn(0, by + 0.4 * k, 11.6 * k, 10 * k, 'classic')], jewel: [heartIn(0, by + 0.3 * k, 6 * k, 5.2 * k, 'classic')], glints: [[1.2 * k, by - 0.9 * k]] },
    // a skull (skullIn): the shaft runs on under it to its middle, and comes out behind the corner of its jaw
    skull: { metal: [rectIn(-1, by, 2, y0 - by)], jewel: [], glints: [], head: [2 * Math.round(Math.max(5, 5.6 * k)) + 1, Math.round(Math.max(10, 11.6 * k))] },      // never under 11x10: its sockets stay 3x3
    // a clover: three round leaves about a jewel
    clover: {
      metal: [ellipseIn(-3.1 * k, by + 1.2 * k, 3 * k, 3 * k), ellipseIn(3.1 * k, by + 1.2 * k, 3 * k, 3 * k), ellipseIn(0, by - 3 * k, 3 * k, 3 * k), rectIn(-1.5 * k, by, 3 * k, 5 * k)],
      jewel: [ellipseIn(0, by - 0.1 * k, 1.8 * k, 1.8 * k)], glints: [[0.4 * k, by - 0.8 * k]],
    },
  };
  const B = bows[shape] ?? bows.ring;
  const shaft = [rectIn(-1, y0, 2, len), ...(B.head ? [] : [rectIn(-2, y0, 4, 2)])];      // the shaft and the collar under the bow
  // teeth: 2 px thick, 1 px apart, of uneven length, on the side that ends up underneath
  const long = Math.max(3, Math.round(4 * k)), lengths = [[long], [long, long - 1], [long, long - 2, long]][teeth - 1];
  lengths.forEach((tl, i) => shaft.push(rectIn(-1 - tl, y1 - 3 - 3 * i, tl, 2)));       // the shaft runs one pixel past the last tooth
  return { metal: [...B.metal, ...shaft], jewel: B.jewel, glints: B.glints, shaft, top: y0, tip: y1, by, head: B.head };
}

// Where the middle of the skull is, counted from the middle of the key, when the key is turned by `angle`
// and squashed by sx, sy: on the bow end of the shaft, snapped to whole pixels so that the skull is never blurred.
const headAt = ([w, h], by, angle, sx = 1, sy = 1) => [Math.round(-by * Math.sin(angle) * sx) + (w % 2 ? 0.5 : 0), Math.round(by * Math.cos(angle) * sy) + (h % 2 ? 0.5 : 0)];

export default defineSprite({
  id: 'gold-key',
  name: 'Key',
  kind: 'Item',
  blurb: 'A big old key with a jewel in its bow, floating at a slant. Change its bow, its teeth, its size and its colours.',
  meta: { type: 'pickup', role: 'items/key', themes: ['fantasy', 'forest', 'dungeon'], gameTypes: ['platformer', 'arcade', 'puzzle'], view: 'front',
    words: ['key', 'door key', 'unlock', 'open', 'lock', 'gold', 'skeleton key', 'collect', 'pickup', 'treasure', 'dungeon', 'old'], license: 'draft' },
  size: [32, 32],
  pivot: [16, 30],
  grounded: false,
  preview: 'idle',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'ring', ['ring', 'heart', 'skull', 'clover']),
    teeth: choice('Teeth', 'two', ['one', 'two', 'three']),
    sparkle: toggle('Sparkle', true),
    metal: color('Metal', P.gold, swatches('thornwood', 'metal', { lead: 'gold' }).filter((c) => brightness(c) >= 0.45)),   // no dark metal: its shadow side would merge with the outline
    accent: color('Jewel', P.crimson, swatches('thornwood', 'gem', { lead: 'crimson' }).filter((c) => c !== P.gold)),   // never the key's own gold
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    pop: range('Pop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  clips: pickupClips(),
  sounds: { collect: [{ sound: 'gem-pickup', preset: 'Key', frame: 1, volume: 0.7 }] },

  render(g, { clip, t, p }) {
    const k = lerp(0.75, 1.1, p.size);
    const K = keyShapes(p.shape, TEETH[p.teeth] ?? 2, k);
    // measure the slanted key at rest, so that it sits in the middle of the frame whatever its bow and size
    const rest = [placedIn(K.metal, 16, 16, { angle: SLANT })];
    if (K.head) { const [hx, hy] = headAt(K.head, K.by, SLANT); rest.push(skullIn(16 + hx, 16 + hy, ...K.head).bone); }
    const box = boundsOf(rest, 32, 32);
    const ox = Math.round(CX - (box.x0 + box.x1 + 1) / 2), oy = Math.round(CY - (box.y0 + box.y1 + 1) / 2);
    const half = (box.y1 - box.y0 + 1) / 2 + 1, wide = (box.x1 - box.x0 + 1) / 2 + 1;
    const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: CY, up: half + 1, down: half + 1, side: wide + 1 });   // one more pixel each way for the rocking
    const x = 16 + ox, y = 16 + oy + at.y - CY;
    const angle = SLANT + (clip === 'idle' ? 0.13 * wave(t) : 0);       // rocks about seven degrees each way, starting from rest
    const c = Math.cos(angle), sn = Math.sin(angle);
    const put = (tests) => placedIn(placedIn(tests, 0, 0, { angle }), x, y, { sx: at.sx, sy: at.sy });

    if (at.show) {
      const M = ramp(p.metal);
      g.blob([put(K.metal)], M, { light: 1 });
      if (!at.bare) {
        g.blob([put(K.jewel)], ramp(p.accent), { outline: M.dark });       // a dark setting round the jewel
        for (const [jx, jy] of K.glints) g.dot(x + jx * c - jy * sn, y + jx * sn + jy * c, '#ffffff');      // one white dot on a jewel, on the lit side
        // the glint runs down the shaft, from the collar to the tip, in the first half of the loop
        const mid = (K.top + K.tip) / 2;
        if (clip === 'idle') glint(g, put(K.shaft), { x: x - mid * sn, y: y + mid * c, r: (K.tip - K.top) * Math.SQRT1_2, phase: lerp(-1.15, 1.15, clamp((t - 0.1) / 0.5)), slant: 1, width: 0.1, colour: mix(M.light, '#ffffff', 0.7) });
      }
      if (K.head) {
        // the skull, level, over the end of the shaft: a dark line where it lies on the shaft, hollow sockets and nose, a jewel glowing in each socket
        const [hx, hy] = headAt(K.head, K.by, angle, at.sx, at.sy), H = skullIn(0, 0, ...K.head);
        const hs = Math.min(at.scale, Math.max(at.sx, at.sy));       // it shrinks with the key but is not squashed: squashed sockets run into one bar
        const on = (test) => placedIn(test, x + hx, y + hy, { sx: hs });
        g.fill(0, 0, 32, 32, on(H.bone), M.dark, { outline: M.dark, clip: put(K.metal) });
        g.blob([on(H.bone)], M, { minus: [on(H.gaps)], light: 1 });
        g.fill(0, 0, 32, 32, on(H.sockets), INK);
        g.fill(0, 0, 32, 32, on(H.nose), INK);
        // the jewel: a glow of two pixels in each socket, the middle one and the one under it, so that the socket keeps its dark corners
        if (!at.bare) { const J = ramp(p.accent); for (const [ex, ey] of H.eyes) { g.dot(x + hx + ex, y + hy + ey, J.base); g.dot(x + hx + ex, y + hy + ey + 1, J.dark); } }
      }
      if (at.flash) g.tint('#ffffff');
      g.outline(INK);
    }
    if (clip === 'idle' && p.sparkle) gleam(g, box.x0 + ox + 2, box.y0 + oy + 1 + at.y - CY, t, tone(p.metal, 0.85), { at: 0.75 });
    collectBurst(g, { burst: at.burst, x: CX, y: at.y, r: half, colour: p.metal, sparkle: p.sparkle });
  },
});
