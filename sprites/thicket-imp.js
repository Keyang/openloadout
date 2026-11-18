// Thicket imp: a small flying trickster of the woods, a battle enemy. Its body is the humanoid rig's imp (H.impDims,
// H.drawImp) and its wings, horns and tail are the rig's too (H.wing, H.horns, H.tail); it is posed on the rig's joints
// and drawn on the rig's own layer, which the rig places in the 48x48 frame (H.inFrame).
// What is particular to it: it never stands (it hovers with a quick flutter and its legs dangle), its big ears stand up
// from the back of its head, its wings are leaves (or a bat's skin, or a moth's lobes), it claws with a darting swoop,
// holds a ball of glow up between its two hands and throws it as its hex, and when it is beaten it tumbles, turns to
// glow and goes up in a puff that leaves a few leaves behind.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, wave, keys, PI } from '../engine/motion.js';
import * as H from '../rigs/humanoid.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { flapCycle } from '../engine/creature.js';
import { steps, glow, particles, puffs, leaves } from '../engine/fx.js';

const C = PALETTE.hearthvale;
const SIZE = [48, 48];
const FRAME = H.inFrame(SIZE, [26, 36]);             // the rig's body in this smaller frame: its middle line on column 26, its ground on row 36
const BOX = FRAME.box;                               // the frame, less its border, in the rig's pixels (effects stay inside it)
const WINGS = H.WING_KINDS;
const M = { bounce: 0.5, stride: 0.5 };
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

/** Body measurements: the rig's imp. `reach` 0..1 stretches the arms as they are thrown up, so both hands show past its big head. */
const dimsOf = (p, reach = 0) => {
  const d = H.impDims({ size: p.size, belly: p.belly });
  return reach ? { ...d, arm: d.arm * (1 + 0.4 * reach) } : d;
};

/**
 * Everything one frame is drawn from: the pose P (on the rig's joints), the measurements d it is solved with, the wing
 * beat W ({ arm, tip, fold }), and for `die` how far the puff has got (burst 0..1), whether the body has turned to glow
 * (lit) and whether it is gone. Shared by render() and sockets().
 */
function frameOf(clip, t, p) {
  const d = dimsOf(p);
  const bob = lerp(0.5, 2.6, p.bob);
  // the hover every clip starts from and returns to: upright, hands held in front, legs dangling
  const hover = (u) => {
    const P = H.pose('idle', u, M, d);
    P.crouch = 0; P.lean = 0.1; P.headTilt = -0.05;
    P.lift = bob * wave(u);
    P.armF = { a: 0.55 + 0.1 * wave(u, 0.1), e: 0.9 }; P.armB = { a: 0.35 - 0.1 * wave(u, 0.1), e: 1.1 };
    P.footF = { x: 1.2 + 0.5 * wave(u, 0.3), y: -1.4 }; P.footB = { x: -0.4 + 0.5 * wave(u, 0.55), y: -0.7 };
    return P;
  };
  // one of the rig's clips laid over the hover; the dangling legs trail behind whichever way the body is thrown
  const over = (name, u) => {
    const rest = hover(0), P = H.layerPose(hover(0), name, u, M, d), thrown = P.rootX - rest.rootX;
    P.footF.x -= 0.4 * thrown; P.footB.x -= 0.4 * thrown;
    P.blink = false;
    return P;
  };
  let P, burst = 0, lit = false, gone = false, reach = 0;
  let W = flapCycle(t * (clip === 'fly' || clip === 'hurt' ? 1 : 2));      // a quick flutter: two beats in a hover, one full beat in `fly`
  if (clip === 'idle') P = hover(t);
  else if (clip === 'fly') {
    // leaning into the wind, arms out in front, legs trailing; the body rises as the wings go down
    P = hover(0);
    P.lean = 0.45; P.headTilt = -0.3; P.rootX = 1; P.lift = 1 + 0.8 * bob * W.lift;
    P.armF = { a: 1.15 - 0.12 * W.arm, e: 0.45 }; P.armB = { a: 0.85 - 0.12 * W.tip, e: 0.7 };
    P.footF = { x: -2.8, y: -2.2 + 0.4 * W.lift }; P.footB = { x: -3.6, y: -1.2 + 0.4 * W.tip };
    P.sway = 0.6 + 0.4 * W.tip;
  } else if (clip === 'attack') {
    // the claw: it pulls back and up (frames 1 to 2), darts forward and down with the near arm coming over (3), lands (4)
    const rest = hover(0), A = H.pose('attack', t, M, d);
    const on = keys(t, [[0, 0], [0.143, 1], [0.857, 1], [1, 0]]);
    const dart = keys(t, [[0, 0], [0.286, -0.35], [0.429, -0.25], [0.571, 1], [0.714, 0.9], [1, 0]]);
    P = over('attack', t);
    P.armF.a = lerp(rest.armF.a, A.armF.a, on); P.armF.e = lerp(rest.armF.e, A.armF.e, on);
    P.rootX += 4.5 * dart; P.lift -= 1.6 * Math.max(0, dart) - 1.2 * Math.max(0, -dart) * 3;
    P.footF.x -= 2 * dart; P.footB.x -= 2 * dart;
    P.mouth = t > 0.4 && t < 0.75;
  } else if (clip === 'cast') {
    // the hex: both arms are thrown forward and up, clear of the big head, the far hand the higher one, and the head tips
    // back to look at the ball of glow that grows between the two hands (frames 1 to 4); then the arms come down and it is thrown (5)
    const raise = keys(t, [[0, 0], [0.143, 0.55], [0.286, 1], [0.571, 1], [0.714, 0], [1, 0]]);
    const thrown = keys(t, [[0, 0], [0.571, 0], [0.714, 1], [0.857, 0.7], [1, 0]]);
    const calm = 1 - Math.min(1, raise + thrown);
    P = hover(0);
    P.armF.a += (2.0 - P.armF.a) * raise + (1.45 - P.armF.a) * thrown; P.armF.e = P.armF.e * calm + 0.1 * thrown;
    P.armB.a += (2.55 - P.armB.a) * raise + (1.2 - P.armB.a) * thrown; P.armB.e = P.armB.e * calm + 0.15 * thrown;
    P.lean += -0.2 * raise + 0.3 * thrown; P.headTilt -= 0.3 * raise;
    P.rootX += -1 * raise + 2.5 * thrown; P.lift += 1.2 * raise - 0.6 * thrown;
    P.glow = keys(t, [[0, 0], [0.143, 0.3], [0.286, 0.6], [0.429, 0.85], [0.571, 1], [0.714, 1], [0.857, 0.5], [1, 0]]);
    P.sway = raise - 2 * thrown; P.blink = false;
    P.mouth = raise > 0.6;                                                  // it cackles while the hex grows
    reach = raise;
  } else if (clip === 'hurt') {
    P = over('hurt', t);
    P.blink = t < 0.7;
  } else {
    // die: the recoil (0), it reels and its wings fold (1), it tips over backward and drops (2 to 3), the whole of it
    // turns to glow as the puff bursts out of it (4), and the puff spreads and thins and leaves a few leaves to settle (5 to 7)
    const drop = keys(t, [[0, 0], [0.143, 0.1], [0.286, 0.5], [0.429, 1], [1, 1]]);
    P = over('hurt', keys(t, [[0, 0], [0.143, 0.33], [1, 0.33]], (v) => v));
    P.lean -= 1.1 * drop; P.headTilt -= 0.3 * drop; P.lift -= 5 * drop; P.rootX -= 1.5 * drop;
    P.footF = { x: 1.2 + 2.5 * drop, y: -1.4 - 2 * drop }; P.footB = { x: -0.4 + 2 * drop, y: -0.7 - 1.5 * drop };
    P.blink = t > 0.05;
    const fold = clamp(t * 4);
    W = { arm: lerp(W.arm, -1, fold), tip: lerp(W.tip, -1, fold), fold, lift: 0 };
    burst = clamp((t - 0.45) / 0.55);
    lit = t > 0.5;
    gone = t > 0.65;
  }
  P.item = P.armF.a + P.armF.e;                                              // nothing is held: the claws point along the forearm
  return { P, d: reach ? dimsOf(p, reach) : d, W, burst, lit, gone };
}

/** Where the wings and the tail grow from, in the rig's pixels, with the rig's other sockets. */
function attach(J, P, d) {
  const out = H.sockets(J, P, d);
  out.back = { x: J.neck[0] - d.chestR * 0.7, y: J.neck[1] + 2.5, angle: -P.lean };
  out.tail = { x: J.hip[0] - d.hipR * 0.8, y: J.hip[1] + 0.5, angle: -PI / 2 };
  return out;
}

export default defineSprite({
  id: 'thicket-imp',
  name: 'Thicket imp',
  kind: 'Creature',
  blurb: 'A pot-bellied flying trickster of the woods that claws and throws hexes. Change its belly, ears, eyes, wings, horns, tail and colours.',
  meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'platformer'], view: 'side', words: ['imp', 'goblin', 'gremlin', 'pixie', 'trickster', 'flyer', 'hover', 'claw', 'hex', 'curse', 'cast', 'wings', 'woodland', 'mischief'], license: 'draft' },
  size: SIZE,
  pivot: [24, 24],
  grounded: false,
  preview: 'fly',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles. The wing
  // beat is heard only when it has wings
  sounds: {
    fly: [{ sound: 'whoosh', frame: 1, preset: 'Quick swipe', volume: 0.35, when: { wings: WINGS } }],
    attack: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.7 }],
    cast: [{ sound: 'magic-spell', frame: 2, preset: 'Curse', volume: 0.8 }],
    hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }],
    die: [{ sound: 'monster-fade', frame: 0, preset: 'Monster fades', volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    belly: range('Belly', 0.5, { lo: 'Slim', hi: 'Round' }),
    ears: range('Ears', 0.5, { lo: 'Small', hi: 'Huge' }),
    eyes: choice('Eyes', 'sly', H.IMP_EYES),
    // wings
    wings: choice('Wings', 'leaf', [...WINGS, 'none']),
    wingSpan: range('Span', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Wide' }),
    // horns
    horns: choice('Horns', 'none', ['none', ...H.HORN_KINDS]),
    hornLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // tail
    tail: choice('Tail', 'none', ['none', ...H.TAIL_KINDS]),
    tailLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    body: color('Body', C.leaf, swatches('hearthvale', 'body')),
    accent: color('Wings and ears', C.mage, swatches('hearthvale', 'accent', { lead: 'mage' })),
    glow: color('Eyes and hex', C.mage, swatches('hearthvale', 'glow', { lead: 'mage' })),
    // without wings there is nothing to flap: it floats on a puff of glow
    flap: range('Flap', 0.5, { lo: 'Small', hi: 'Wide', group: 'Motion', when: { wings: WINGS } }),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What can be taken off or swapped. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    wings: { label: 'Wings', params: ['wings', 'wingSpan'], none: 'none', socket: 'back' },
    horns: { label: 'Horns', params: ['horns', 'hornLength'], none: 'none', socket: 'head' },
    tail: { label: 'Tail', params: ['tail', 'tailLength'], none: 'none', socket: 'tail' },
  },
  clips: {
    idle: { label: 'Hover', frames: 8, fps: fps(7), loop: true },
    fly: { frames: 8, fps: fps(12), loop: true },
    attack: { label: 'Claw', frames: 8, fps: fps(13), loop: false },
    cast: { label: 'Hex', frames: 8, fps: fps(10), loop: false },
    hurt: { frames: 4, fps: fps(9), loop: false },
    die: { frames: 8, fps: fps(10), loop: false },
  },

  // attach points for every frame, in frame pixels: back (wings), head (horns), tail, hand, offhand, feet
  sockets(clip, t, p) {
    const { P, d } = frameOf(clip, t, p);
    return FRAME.sockets(attach(H.solve(P, d), P, d));
  },

  render(g, { clip, t, p }) {
    const frame = (u) => frameOf(clip, u, p);
    const { P, d, W, burst, lit, gone } = frame(t);
    const accentHex = p.accent === p.body ? tone(p.accent, -1) : p.accent;                    // the same swatch twice still shows as two
    const accent = ramp(accentHex), bodyPaint = ramp(p.body), light = steps(p.glow);
    const winged = p.wings !== 'none';
    const J0 = H.solve(P, d);

    // everything is drawn on the rig's own layer, which the rig then places in the frame
    FRAME.draw(g, (layer) => {
      if (!gone) {
        const span = 12 * p.wingSpan * d.s, swing = lerp(0.3, 0.75, p.flap);
        const look = { body: p.body, accent: accentHex, glow: p.glow, ears: lerp(0.2, 1.3, p.ears), perk: 1, earRim: INK, eyes: p.eyes, claw: C.cream };
        H.drawImp(layer, P, d, look, {
          behind(g, J) {
            const S = attach(J, P, d);
            // the wings beat below the ears; the far one a moment behind the near one and a little higher, so both show
            if (winged) H.wing(g, S.back, { kind: p.wings, length: span * 0.85, angle: PI + 1.35 - swing * W.tip, fold: W.fold, paint: farRamp(accentHex) });
            if (winged) H.wing(g, S.back, { kind: p.wings, length: span, angle: PI + 1.75 - swing * W.arm, fold: W.fold, paint: accent });
            if (p.tail !== 'none') H.tail(g, S.tail, { kind: p.tail, length: p.tailLength * d.s, sway: P.sway, body: bodyPaint, tip: accent });      // over the wings, so it always shows
          },
          head(g, J) { if (p.horns !== 'none') H.horns(g, J, d, { kind: p.horns, length: p.hornLength * d.s, bone: C.cream, wood: C.wood }); },
        });
      }
      if (P.flash) layer.tint('#ffffff');
      else if (lit) layer.tint(tone(p.glow, 0.9));                                             // beaten, the whole of it turns to glow for a frame
      layer.outline(INK);

      // ---- light, drawn after the outline ----
      if (!winged && !P.flash && clip !== 'die') {
        // no wings: it rides a puff of glow that streams down from under its feet
        const fx0 = (J0.legF.ankle[0] + J0.legB.ankle[0]) / 2, fy0 = Math.max(J0.legF.ankle[1], J0.legB.ankle[1]) + 3;
        particles(layer, { t, x: fx0, y: fy0, count: 5, seed: 3, loop: true, cycles: 2, angle: 0, arc: 1.1, dist: 6, size: 2.6, lifespan: 0.8, colours: light, box: BOX });
        glow(layer, Math.round(fx0), Math.round(fy0), 2, light, { box: BOX });
      }
      if (clip === 'attack') H.slashTrail(layer, (u) => frame(u).P, t, d, 3, '#ffffff');
      if (clip === 'cast' && P.glow > 0) {
        // the hex: a ball that grows between the two raised hands, then flies forward and thins to a spark
        const fly = clamp((t - 0.64) / 0.36);
        const r = (fly > 0 ? lerp(3.5, 1.5, fly) : 0.5 + 3 * P.glow) | 0;
        const [hx, hy] = H.heldBetween(J0, r);                                                 // in the crook of the two hands, touching both
        const bx = Math.min(BOX[2] - 5, Math.round(hx + 13 * fly) + 0.5), by = Math.round(hy + 2 * fly) + 0.5;
        if (fly > 0) for (let i = 1; i <= 3; i++) layer.dot(bx - r - 1 - 2 * i, by - 0.5 + (i % 2), light[Math.min(light.length - 1, 1 + i)]);      // its trail
        glow(layer, bx, by, r + 0.5, light, { box: BOX });
      }
      if (burst > 0) {
        // `die`: puffs of glow burst out along the body, from its head to its feet, and throw leaves, which tumble down and are what is left
        const ends = [[J0.head[0], J0.head[1]], [(J0.legF.ankle[0] + J0.legB.ankle[0]) / 2, J0.hip[1]]];
        const colours = [tone(p.glow, 0.9), p.glow, tone(p.glow, -1)];
        ends.forEach(([ex, ey], i) => {
          const cx = clamp(ex, BOX[0] + 7, BOX[2] - 7), cy = clamp(ey, BOX[1] + 9, BOX[3] - 8);
          puffs(layer, { t: burst, x: cx, y: cy, count: 4, seed: 5 + 3 * i, loop: false, angle: PI, arc: 2 * PI, dist: 7, rise: 3, size: 2.9, lobes: 2, colours, box: BOX });
        });
        const cx = clamp(J0.hip[0], BOX[0] + 9, BOX[2] - 9), cy = clamp(J0.neck[1], BOX[1] + 9, BOX[3] - 10);
        leaves(layer, { t: burst, x: cx, y: cy, count: 5, seed: 2, dist: 9, gravity: 9, size: 5, paints: [p.body, accentHex, p.body, tone(p.body, 0.7), accentHex], rim: INK, box: BOX });
      }
    });
  },
});
