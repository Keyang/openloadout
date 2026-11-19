// Spore hopper: a seed pod that hops on one coiled root. No skeleton. The pod is one onion-shaped bulb whose
// width and height trade off (squash and stretch); the root under it is a spring that presses flat before a hop
// and stretches to twice its length at take-off. A collar of leaves (the `ruff` part) sits round the neck and
// flaps up as the pod comes down. It attacks by swelling and puffing spores out of the vent on top.
// The shapes, the hop and the eyes come from engine/creature.js; this file holds the proportions and the timing.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { lerp, clamp, wave, keys, loopKeys, PI } from '../engine/motion.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';
import { capsuleIn, polyIn } from '../engine/surface.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { particles, steps } from '../engine/fx.js';
import { hopArc, squashStretch, bulbIn, bulbHalf, bulbRibsIn, springIn, leafIn, creatureEye } from '../engine/creature.js';

const P = PALETTE.thornwood;
const W = 48, GROUND = 42, CX = 24;
// The pod touches the ruff, the vent and the root, so its colours appear in none of their lists (the root is always soil).
const POD = [...swatches('thornwood', 'shell', { lead: 'moss' }).filter((c) => c !== P.soil && c !== P.thorn), P.water];
const RUFF = [...swatches('thornwood', 'leaf').filter((c) => !POD.includes(c)), P.cream];
const SPORES = [...swatches('thornwood', 'glow', { lead: 'thorn' }).filter((c) => !POD.includes(c)), P.cream];

const SHAPE = { low: 0.38, neck: 0.3, flat: 0.2 };      // the bulb: a round bottom, widest a third of the way up, a narrow neck
const NECK = 0.72;                                      // how far up the pod the ruff sits
const RIBS = [-0.68, -0.26, 0.2, 0.62];                 // where the four ribs run, as shares of the half-width
const idleFlap = (t) => 0.3 * wave(t, -0.2);            // the ruff lags the breathing

// Where everything is this frame: shared by render() and sockets().
function pose(clip, t, p) {
  const s = lerp(0.8, 1.2, p.size);
  const rx0 = lerp(6.8, 10, p.bulk) * s, h0 = lerp(18.5, 17, p.bulk) * s, root0 = lerp(6, 8.5, p.size);
  const wob = lerp(0.45, 1.5, p.wobble), f0 = idleFlap(0);
  // squash: > 0 flatter and wider. legs: the root, 0 pressed flat, 1 at rest, 2 stretched. flap: the ruff, -1 limp .. 1 thrown up.
  let squash = 0, legs = 1, lift = 0, dx = 0, lean = 0, flap = f0, swell = 0, vent = 0, split = 0, wilt = 0;
  let mood = p.eyes, flash = false, puff = -1, leak = -1;
  if (clip === 'idle') {
    squash = 0.06 * wob * wave(t);
    legs = 1 + 0.17 * wave(t, 0.5);
    flap = idleFlap(t);
    if (t >= 0.75) mood = 'blink';
  } else if (clip === 'hop') {
    const H = hopArc(t);
    squash = 0.24 * wob * H.squash;
    legs = H.legs;
    lift = lerp(4, 10, p.hop) * H.lift;
    lean = 1.5 * H.lift;
    // pressed down by the launch, thrown up by the fall and the landing, then settling
    flap = loopKeys(t, [[0, f0], [0.125, 0.2], [0.25, -0.7], [0.48, -0.1], [0.625, 0.8], [0.75, 1], [0.875, -0.4]]);
  } else if (clip === 'attack') {
    // 0 idle, 1 to 3 it swells and sinks on its root, 4 it squeezes and the spores come out, 5 to 6 it wobbles back
    swell = keys(t, [[0, 0], [0.143, 0.4], [0.286, 0.75], [0.429, 1], [0.5, 1], [0.571, -0.45], [0.714, 0.25], [0.857, -0.1], [1, 0]]);
    legs = keys(t, [[0, 1], [0.429, 0.5], [0.571, 1.45], [0.714, 0.85], [1, 1]]);
    lean = keys(t, [[0, 0], [0.286, -1.5], [0.429, -2.5], [0.571, 2.5], [0.714, 1], [1, 0]]);
    squash = wob * keys(t, [[0, 0], [0.429, 0.1], [0.571, -0.22], [0.714, 0.12], [0.857, -0.05], [1, 0]]);
    flap = keys(t, [[0, f0], [0.429, 0.45], [0.571, 1], [0.714, -0.5], [0.857, 0.1], [1, f0]]);
    vent = keys(t, [[0, 0], [0.429, 0.3], [0.571, 1], [0.857, 0.3], [1, 0]]);
    if (t > 0.1 && t < 0.5) mood = 'angry'; else if (t >= 0.5 && t < 0.65) mood = 'hurt';
    if (t > 0.5 && t < 0.95) puff = clamp((t - 0.4) / 0.5);          // frames 4, 5, 6
  } else if (clip === 'hurt') {
    squash = keys(t, [[0, 0.3], [0.333, -0.2 * wob], [0.667, 0.1 * wob], [1, 0]]);
    dx = keys(t, [[0, -2], [0.333, -3], [0.667, -1], [1, 0]]);
    lean = keys(t, [[0, -3], [0.333, -2], [0.667, 1], [1, 0]]);
    legs = keys(t, [[0, 0.6], [0.333, 1.3], [0.667, 0.9], [1, 1]]);
    flap = keys(t, [[0, 0.9], [0.333, -0.5], [0.667, 0.3], [1, f0]]);
    flash = t < 0.2;
    if (t < 0.9) mood = 'hurt';
  } else if (clip === 'die') {
    // 0 the hit (white), 1 to 4 it splits open down a rib, spores leak and it wilts, 5 to 6 it flops over, 7 the limp husk on its root
    squash = keys(t, [[0, 0.3], [0.143, -0.15], [0.286, 0.05], [1, 0]]);
    dx = keys(t, [[0, -2], [0.143, -3], [0.429, -2], [1, -1]]);
    split = keys(t, [[0, 0], [0.143, 0.3], [0.286, 0.65], [0.571, 1], [1, 1]]);
    wilt = keys(t, [[0.143, 0], [0.286, 0.15], [0.571, 0.7], [0.857, 1], [1, 1]]);
    lean = keys(t, [[0, -3], [0.143, -2], [0.286, 0], [0.571, rx0 * 0.3], [0.857, rx0 * 0.55], [1, rx0 * 0.5]]);
    legs = keys(t, [[0, 0.6], [0.143, 1.25], [0.286, 1], [0.571, 0.75], [0.857, 0.5], [1, 0.55]]);
    flap = keys(t, [[0, 0.9], [0.143, 0.3], [0.286, -0.3], [0.571, -0.8], [0.857, -1], [1, -1]]);
    flash = t < 0.1;
    mood = wilt > 0.5 ? 'none' : 'hurt';
    if (t > 0.3 && t < 0.8) leak = clamp((t - 0.2) / 0.65);
  }

  const [wide, tall] = squashStretch(squash), grow = 1 + 0.18 * swell;
  const cx = CX + Math.round(dx);
  const rx = Math.min(rx0 * wide * grow * lerp(1, 1.3, wilt), cx - 3, W - 3 - cx);
  const h = h0 * tall * grow * lerp(1, 0.42, wilt);
  let root = Math.max(1.5, root0 * legs);
  lift = Math.round(lift);
  // the vent and its outline stay inside the frame: a big look gives up some of its hop, then some of its root
  const over = (clip === 'attack' ? 9 : 4.5) - (GROUND - lift - root - h);           // puffing, it also keeps room for the cloud
  if (over > 0) { const cut = Math.min(lift, Math.ceil(over)); lift -= cut; root = Math.max(1.5, root - Math.max(0, over - cut)); }
  const foot = GROUND - lift, base = foot - root;
  const at = (v) => cx + lean * v * v;                       // the middle of the pod at height v (0 bottom .. 1 top)
  const half = (v) => rx * bulbHalf(v, SHAPE);
  const neck = { x: at(NECK), y: base - h * NECK, half: half(NECK) };
  return { s, rx, h, rx0, root, foot, base, cx, lean, at, half, neck, top: { x: at(1), y: base - h }, flap, vent, split, wilt, mood, flash, puff, leak };
}

// ---- the ruff: a part drawn from the neck, its settings and how far it is thrown up --------------------------

// Each kind is a set of blades per side: [how far round from straight down it points at rest (radians), length as a share of the ruff's size].
// `front` blades lie over the pod, `back` ones show behind it, `mid` is one more down the front. swing: how far a flap turns them.
const BLADES = {
  leaves: { swing: 0.75, wide: 0.45, front: [[0.95, 1]], back: [[1.4, 0.92]], mid: [-0.3, 0.7] },                 // two long drooping leaves a side
  petals: { swing: 0.5, wide: 0.8, front: [[1.2, 0.7], [1.85, 0.72]], back: [[2.45, 0.66]], mid: [-0.3, 0.5] },   // a ring of short round petals that stand out and up, like a flower round the vent
  thorns: { swing: 0.25, wide: 0.3, front: [[0.75, 0.85], [1.35, 1.15]], back: [[1.95, 0.9]], mid: null },          // stiff spikes that stand straight out
};

/** One blade of the ruff as a shape test, from its root along rig angle a, shortened where it would leave the frame or go under the ground. */
function blade(kind, x, y, a, len, width, floor) {
  const sx = Math.sin(a), sy = Math.cos(a);
  let L = len;
  if (sx > 0) L = Math.min(L, (W - 2.5 - x) / sx); else if (sx < 0) L = Math.min(L, (x - 2.5) / -sx);
  if (sy > 0) L = Math.min(L, (floor - y) / sy); else if (sy < 0) L = Math.min(L, (y - 2.5) / -sy);
  L = Math.max(1.5, L);
  const tx = x + sx * L, ty = y + sy * L;
  if (kind === 'petals') { const r = Math.min(width / 2, L / 2); return { test: capsuleIn(x, y, tx - sx * r, ty - sy * r, 0.9, r), tip: [tx, ty] }; }
  if (kind === 'thorns') return { test: polyIn([[x - sy * width / 2, y + sx * width / 2], [x + sy * width / 2, y - sx * width / 2], [tx, ty]]), tip: [tx, ty] };
  return { test: leafIn(x, y, tx, ty, width, { belly: 0.42, blunt: 0.5 }), tip: [tx, ty] };
}

/** Draws the far blades (layer 'back', before the pod) or the near ones (layer 'front', over it). */
function drawRuff(g, layer, neck, { kind, size, colour, flap, floor }) {
  const B = BLADES[kind], turn = B.swing * flap;
  const width = (len) => clamp(len * B.wide, 2.4, 5.5);
  if (layer === 'back') {
    const paint = farRamp(colour);
    for (const side of [-1, 1]) for (const [a, long] of B.back) {
      g.fill(0, 0, W, W, blade(kind, neck.x + side * neck.half * 0.9, neck.y - 0.5, side * (a + turn), size * long, width(size * long), floor).test, paint, { shade: 0 });
    }
    return;
  }
  const paint = ramp(colour), list = [];
  for (const side of [-1, 1]) for (const [a, long] of B.front) list.push([neck.x + side * (neck.half - 0.3), neck.y + 0.3, side * (a + turn), size * long]);
  if (B.mid) list.push([neck.x - neck.half * 0.25, neck.y + 0.8, B.mid[0], size * B.mid[1] * lerp(1, 0.7, clamp(flap))]);      // it shortens as the others lift
  for (const [x, y, a, len] of list) {
    const b = blade(kind, x, y, a, len, width(len), floor);
    g.fill(0, 0, W, W, b.test, paint, { shade: 1 });
    if (kind === 'leaves' && len >= 6) g.line(x, y, lerp(x, b.tip[0], 0.6), lerp(y, b.tip[1], 0.6), paint.dark);      // the midrib
  }
}

const EYES = { round: 'dots', sleepy: 'sleepy', angry: 'angry' };         // the Eyes choice, and the moods of the clips, as styles of creatureEye()
const fps = (base) => (p) => base * lerp(0.65, 1.45, p.speed);

export default defineSprite({
  id: 'spore-hopper',
  name: 'Spore hopper',
  kind: 'Creature',
  blurb: 'A seed pod that hops about on a coiled root and puffs spores. Change its size and plumpness, its eyes, its leafy ruff and its colours.',
  meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side',
    words: ['pod', 'seed', 'bulb', 'plant', 'sprout', 'onion', 'spores', 'hop', 'bounce', 'spring', 'puff', 'enemy', 'monster', 'poison'], license: 'draft' },
  size: [W, W],
  pivot: [CX, GROUND],
  preview: 'hop',
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    bulk: range('Pod', 0.5, { lo: 'Slim', hi: 'Plump' }),
    eyes: choice('Eyes', 'round', ['round', 'sleepy', 'angry']),
    ribs: toggle('Ribs', true),
    ruff: choice('Ruff', 'leaves', ['leaves', 'petals', 'thorns', 'none']),
    ruffSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    ruffColour: color('Colour', P.leaf, RUFF, { material: 'plant' }),
    body: color('Pod', P.moss, POD, { material: 'plant' }),
    glow: color('Spores', P.thorn, SPORES),
    hop: range('Hop height', 0.5, { lo: 'Low', hi: 'High', group: 'Motion' }),
    wobble: range('Wobble', 0.5, { lo: 'Firm', hi: 'Wobbly', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: { ruff: { label: 'Ruff', params: ['ruff', 'ruffSize', 'ruffColour'], none: 'none', socket: 'head' } },
  clips: {
    idle: { frames: 8, fps: fps(7), loop: true },
    hop: { frames: 8, fps: fps(11), loop: true },
    attack: { label: 'Spore puff', frames: 8, fps: fps(13), loop: false },
    hurt: { frames: 4, fps: fps(9), loop: false },
    die: { frames: 8, fps: fps(10), loop: false },
  },
  sounds: {
    hop: [{ sound: 'jump', frame: 1, preset: 'Tiny hop', volume: 0.5 }, { sound: 'footstep-gravel', frame: 6, preset: 'Sneaking', volume: 0.5 }],
    attack: [{ sound: 'whoosh', frame: 4, preset: 'Quick swipe', volume: 0.7 }],
    hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }],
    die: [{ sound: 'enemy-squish', frame: 0, preset: 'Pop', volume: 1 }],
  },
  // head: the neck, where the ruff sits (a game can hang another collar there); muzzle: the vent the spores leave by
  sockets(clip, t, p) {
    const q = pose(clip, t, p);
    return { head: { x: q.neck.x, y: q.neck.y, angle: PI }, muzzle: { x: q.top.x, y: q.top.y - 1, angle: PI * 0.8 } };
  },

  render(g, { clip, t, p }) {
    const q = pose(clip, t, p);
    const { rx, h, base, foot, neck, top } = q;
    const body = ramp(q.wilt > 0.5 ? tone(p.body, -0.35) : p.body), spore = ramp(p.glow), root = ramp(P.soil);
    const ruff = p.ruff === 'none' ? null : { kind: p.ruff, size: (0.5 * q.rx0 + 3) * p.ruffSize, colour: p.ruffColour, flap: q.flap, floor: GROUND - 0.5 };

    if (ruff) drawRuff(g, 'back', neck, ruff);

    // the root: a coil with its last turn lying on the ground
    const rw = clamp(q.rx0 * 0.85, 5.5, 9.5), wire = q.s > 1.05 ? 1.4 : 1.1;
    g.blob([springIn(CX, foot - wire, q.cx, base + 0.5, 2, rw, wire), capsuleIn(CX - rw / 2, foot - wire, CX + rw / 2, foot - wire, wire)], root, { shade: 1 });

    // the pod
    const bulb = { ...SHAPE, lean: q.lean }, pod = bulbIn(q.cx, base, rx, h, bulb), band = rx > 7 ? 2 : 1;
    g.blob([pod], body, { shade: band });
    // the ribs are raised, so each is the pod one tone lighter: the pod painted again in lighter tones, only along the ribs
    if (p.ribs) g.fill(0, 0, W, W, pod, { base: body.light, dark: body.base, light: body.light }, { shade: band, clip: bulbRibsIn(q.cx, base, rx, h, RIBS, bulb) });
    // the vent: puckered lips in the spore colour, open when it puffs
    const lip = rx * SHAPE.neck + 1.2;
    g.ellipse(top.x, top.y - 0.3, lip, 1.5 + 0.7 * q.vent, spore, { shade: 0 });
    g.rect(Math.round(top.x - (q.vent > 0.5 ? 1.5 : 1)), Math.round(top.y - 1.3 - 0.7 * q.vent), q.vent > 0.5 ? 3 : 2, q.vent > 0.5 ? 2 : 1, spore.deep);

    // a glint on the lit shoulder of the bulb
    if (q.wilt < 0.5) { const gx = Math.round(q.at(0.6) + q.half(0.6) * 0.5), gy = Math.round(base - h * 0.6); g.rect(gx, gy, 2, 1, body.light); g.dot(gx + 1, gy + 1, body.light); }
    // the two eyes, low on the pod. Round eyes both look ahead; every other look is mirrored on the far eye, so brows and lids slope in to the middle
    if (q.mood !== 'none') {
      const ex = Math.round(q.at(0.38) + rx * 0.3), ey = Math.round(base - h * 0.38) + 1;
      const look = { body: body.base, style: EYES[q.mood] ?? EYES[p.eyes], blink: q.mood === 'blink', squint: q.mood === 'hurt' };
      creatureEye(g, ex - 2, ey, look);
      creatureEye(g, ex + 2, ey, { ...look, flip: look.squint || look.style !== 'dots' });
    }
    if (ruff) drawRuff(g, 'front', neck, ruff);

    // dying, it splits open down the third rib, as a seed pod opens along its seam: a dark gash, widest in its middle, with a lit lip where the skin curls back
    if (q.split > 0) {
      const hi = 0.9, lo = hi - 0.72 * q.split, wide = 0.5 + 1.8 * q.split;
      const seam = (shift) => (px, py) => {
        const v = (base - py) / h;
        return v < hi && v > lo && Math.abs(px - shift - (q.at(v) + q.half(v) * RIBS[2])) <= wide * Math.sin(PI * (v - lo) / (hi - lo));
      };
      g.fill(0, base - h, W, base, seam(1), body.light, { clip: pod });
      g.fill(0, base - h, W, base, seam(0), ramp(p.body).deep, { clip: pod });       // the deepest tone of the pod: never darker than the outline
    }

    if (q.flash) g.tint('#ffffff');
    g.outline(INK);

    // spores: light, so drawn after the outline and rimmed with their own dark tone
    const cloud = steps(p.glow, { white: false });
    if (q.puff >= 0) {
      particles(g, { t: q.puff, loop: false, x: top.x, y: top.y - 2, count: Math.round(lerp(8, 12, p.size)), seed: 3, stagger: 0.25,
        angle: PI * 0.8, arc: PI * 0.75, dist: lerp(10, 14, p.size), gravity: 2, size: 3.4, spread: 1.5, wobble: 1, colours: cloud });
    }
    if (q.leak >= 0) {
      particles(g, { t: q.leak, loop: false, x: q.at(0.6) + q.half(0.6) * RIBS[2], y: base - h * 0.6, count: 5, seed: 9, stagger: 0.2,
        angle: PI * 0.9, arc: PI * 0.6, dist: 10, gravity: 3, size: 1.9, spread: 2.5, wobble: 1, colours: cloud.slice(1) });
    }
  },
});
