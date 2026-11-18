// Moss golem: the boss of the Thornwood kit. A hunched giant of stacked boulders on the large two-legged rig
// (rigs/bigbody.js): the rig says where each of its seventeen stones is in every frame, and this file paints them
// (boulders from engine/fx.js, seams and cracks from engine/rock.js, moss, mushrooms and saplings from
// engine/growth.js) and adds what is the golem's own:
// its head, the glowing core in its chest (the weak point) and the growth on its shoulders and back.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import * as B from '../rigs/bigbody.js';
import { rock, ring, shards, puffs, twinkle } from '../engine/fx.js';
import { seam, crack } from '../engine/rock.js';
import { mossCap, mushroom, sapling } from '../engine/growth.js';
import { gemIn, gemFacets } from '../engine/shapes.js';
import { ellipseIn } from '../engine/surface.js';
import { hornIn, hornFit } from '../engine/creature.js';
import { lerp, clamp, wave, PI } from '../engine/motion.js';
import { ramp, farRamp, tone, mix, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';

const P = PALETTE.thornwood;
const [W] = B.SIZE, G = B.GROUND;
// moss is left out of the stone swatches and cavern is too dark to keep its shadows clear of the outline:
// the growth is moss by default, and two colours that touch must not offer the same swatch
const STONE = swatches('thornwood', 'stone').filter((c) => c !== P.moss && c !== P.cavern);
const GROWTH = swatches('thornwood', 'leaf', { lead: 'moss' });
const GLOW = swatches('thornwood', 'glow');
const WHITE = '#ffffff';

/** Everything about one frame that both render() and sockets() need: sizes, pose, joints and the stones in painting order. */
function frame(clip, t, p) {
  const d = B.dims({ size: p.size, bulk: p.bulk, arms: p.arms });
  const pose = B.pose(clip, t, { bounce: p.bounce }, d);
  const J = B.solve(pose, d);
  let list = B.pieces(J, pose, d);
  if (pose.fall > 0) list = B.collapse(list, pose.fall, { cx: J.pelvis[0], reachOut: 35, settle: pose.settle, seed: 5 });
  return { d, pose, J, list };
}

/** The colour of the eyes and the core for how brightly they burn: 0 dark, 1 lit; above 1 they flare. */
const lightOf = (glow, level, stone) => (level < 0.5 ? mix(glow, stone.deep, 0.78) : glow);

// ---- the golem's own parts: each is drawn from where it sits on a stone and its own settings ----

/** The core in the chest: a recess in the stone with a cut gem, a carved rune or a single eye in it. */
function drawCore(g, at, size, kind, glow, stone, pose, t) {
  const w = Math.max(5, Math.round(size * (kind === 'gem' ? 2 : 2.5))), h2 = w / 2;
  const cx = w % 2 ? Math.floor(at[0]) + 0.5 : Math.round(at[0]), cy = w % 2 ? Math.floor(at[1]) + 0.5 : Math.round(at[1]);
  const level = pose.glow, hot = level >= 2, C = ramp(lightOf(glow, level, stone));
  if (kind === 'gem') {
    const ry = h2 * 1.2;
    g.fill(cx - h2 - 2, cy - ry - 2, cx + h2 + 2, cy + ry + 2, gemIn(cx, cy, h2 + 1.3, ry + 1.3, 'emerald'), stone.deep);
    const inGem = gemIn(cx, cy, h2, ry, 'emerald');
    const tones = { '-1': hot ? C.base : C.dark, 0: hot || level > 1.15 ? C.light : C.base, 1: hot ? WHITE : C.light, 2: level >= 0.5 ? WHITE : C.light };
    for (const f of gemFacets(cx, cy, h2, ry, 'emerald')) g.poly(f.pts, tones[f.tone], { clip: inGem });
  } else if (kind === 'rune') {
    // a square tablet with a groove round it and a carved sign: an upright stroke, one arm up to the right, one down to the left
    const x0 = cx - h2, y0 = cy - h2;
    g.rect(x0 - 1, y0 - 1, w + 2, w + 2, stone.deep);
    g.rect(x0, y0, w, w, hot ? C.light : C.dark);
    g.rect(x0 + 1, y0 + 1, w - 2, w - 2, { base: stone.dark, dark: stone.deep, light: stone.base }, { shade: 1 });
    const sign = hot ? WHITE : level > 1.15 ? WHITE : C.light, mid = Math.floor(cx), arm = Math.max(2, Math.floor(h2) - 2);
    g.line(mid, y0 + 2, mid, y0 + w - 3, sign);
    g.line(mid + 1, cy - 1, mid + arm, cy - arm, sign);
    g.line(mid - 1, cy, mid - arm, cy + arm - 1, sign);
  } else {
    const ball = ellipseIn(cx, cy, h2, h2 * 0.92);
    g.ellipse(cx, cy, h2 + 1.3, h2 * 0.92 + 1.3, stone.deep);
    g.fill(cx - h2, cy - h2, cx + h2, cy + h2, ball, hot ? { base: WHITE, dark: C.light, light: WHITE } : C, { shade: 1, light: 1 });
    // a slit pupil that looks about, and a stone lid that comes down when it blinks or the light goes out
    const look = Math.round(wave(t, 0.1)), pw = w >= 8 ? 2 : 1;
    g.rect(Math.round(cx - pw / 2) + look, cy - h2 * 0.6, pw, h2 * 1.2, INK, { clip: ball });
    if (level >= 0.5) g.dot(Math.round(cx - pw / 2) + look + pw, Math.floor(cy - h2 * 0.45), WHITE);
    const lid = level < 0.5 ? 0.75 : pose.blink >= 1 ? 0.8 : pose.blink > 0 ? 0.5 : 0.22;
    const edge = Math.round(cy - h2 * 0.92 + 2 * h2 * 0.92 * lid);
    g.fill(cx - h2, cy - h2, cx + h2, cy + h2, (px, py) => ball(px, py) && py < edge, stone.base, { shade: 0 });
    g.fill(cx - h2, cy - h2, cx + h2, cy + h2, (px, py) => ball(px, py) && py < edge && py >= edge - 1, stone.deep, { shade: 0 });
  }
  return [cx, cy];
}

/** The head: a jaw that drops when it roars, a skull in one of three shapes, a brow and one burning eye. */
function drawHead(g, piece, { shape, p, stone, far, jag, pose, d, box }) {
  const r = d.headR, s = d.s, at = (u, v) => B.onPiece(piece, u, v);
  const up = PI - piece.angle;                                  // the way the top of the head points, as a rig angle
  // the horned head's two horns curl forward: the far one is drawn before the skull, the near one after it;
  // where a pose carries the head to the edge of the frame they are drawn shorter, not cut off
  const room = [box[0] + 1, box[1] + 1, box[2] - 1, box[3]];
  const horn = ([x, y], a, len, paint) => {
    const o = { curl: -0.75, width: 5.2 * s, tip: 1.2 };
    g.blob([hornIn(x, y, a, hornFit(x, y, a, len * 1.1, { ...o, box: room }), o)], paint, { shade: 1 });
  };
  if (shape === 'horned') horn(at(0.45, -0.6), up - 0.2, 10 * s, far);
  // the mouth and the jaw under it
  const drop = pose.jaw * 2.8 * s, [jx, jy] = at(0.28, 0.74);
  if (drop >= 1) g.ellipse(jx + 1, jy + drop * 0.3, r * 0.6, drop * 0.5 + 1.2, stone.deep, { shade: 0 });
  seam(g, rock(g, { x: jx, y: jy + drop, r: r * 0.74, squash: 0.58, angle: piece.angle, seed: 73, colour: p.stone, jag, box }), stone.deep);
  // the skull
  let skull;
  if (shape === 'slab') skull = rock(g, { x: piece.x - r * 0.1, y: piece.y - r * 0.12, r: r * 1.42, squash: 0.56, angle: piece.angle - 0.06, seed: 76, sides: 6, colour: p.stone, jag: jag * 0.5, box });
  else skull = rock(g, { x: piece.x, y: piece.y, r: piece.rx, squash: piece.ry / piece.rx, angle: piece.angle, seed: piece.seed, colour: p.stone, jag, box });
  seam(g, skull, stone.deep);
  if (shape === 'horned') horn(at(-0.3, -0.7), up + 0.15, 11.5 * s, stone);
  // the brow, and the eye in its shadow
  const e = at(0.5, -0.1), ex = Math.round(e[0]), ey = Math.round(e[1]);
  g.rect(ex - 1, ey - 2, 5, 4, stone.deep, { clip: skull });
  const level = pose.glow;
  if (level >= 0.5 && pose.blink < 1) {
    const flare = level >= 1.5, light = lightOf(p.glow, level, stone);
    if (pose.blink > 0) g.rect(ex, ey, 3, 1, light);
    else {
      g.rect(ex, ey - 1, flare ? 4 : 3, 2, light);
      g.dot(ex + 1, ey - 1, WHITE);
      if (flare) g.dot(ex + 2, ey - 1, WHITE);
    }
  }
}

export default defineSprite({
  id: 'moss-golem',
  name: 'Moss golem',
  kind: 'Creature',
  blurb: 'A boss: a hunched giant of stacked boulders with a glowing core in its chest. Change its size, bulk, arms, head, growth, core and colours.',
  meta: { type: 'creature', role: 'characters/boss', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side', words: ['golem', 'giant', 'stone', 'rock', 'boulder', 'moss', 'guardian', 'monster', 'slam', 'smash', 'roar', 'stagger', 'weak point', 'boss fight'], license: 'draft' },
  size: B.SIZE,
  pivot: B.PIVOT,
  preview: 'walk',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: {
    walk: [{ sound: 'golem-slam', preset: 'Distant quake', frame: 0, volume: 0.5 }, { sound: 'golem-slam', preset: 'Distant quake', frame: 4, volume: 0.5 }],
    roar: [{ sound: 'whoosh', preset: 'Heavy swing', frame: 2, volume: 1 }],
    attack: [{ sound: 'golem-slam', preset: 'Boss slam', frame: 7, volume: 1 }],
    hurt: [{ sound: 'punch', preset: 'Heavy body blow', frame: 0, volume: 0.9 }],
    stagger: [{ sound: 'crate-break', preset: 'Barrel', frame: 0, volume: 0.8 }],
    die: [{ sound: 'golem-slam', preset: 'Boulder drop', frame: 0, volume: 1 }, { sound: 'crate-break', preset: 'Crate', frame: 7, volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    bulk: range('Bulk', 0.5, { lo: 'Lean', hi: 'Massive' }),
    arms: range('Arms', 0.5, { lo: 'Short', hi: 'Long' }),
    shape: choice('Head', 'boulder', ['boulder', 'slab', 'horned']),
    wear: range('Wear', 0.4, { lo: 'New', hi: 'Worn' }),
    // growth: what grows on its shoulders and back
    growth: choice('Growth', 'moss', ['moss', 'mushrooms', 'saplings', 'none']),
    growthSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    growthColour: color('Colour', P.moss, GROWTH),
    // core: the weak point in its chest; it cannot be taken out
    core: choice('Core', 'gem', ['gem', 'rune', 'eye']),
    coreSize: range('Size', 1, { min: 0.7, max: 1.3, step: 0.05, lo: 'Small', hi: 'Big' }),
    stone: color('Stone', P.stone, STONE),
    glow: color('Glow', P.magic, GLOW),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: {
    growth: { label: 'Growth', params: ['growth', 'growthSize', 'growthColour'], none: 'none', socket: 'back' },
    core: { label: 'Core', params: ['core', 'coreSize'], socket: 'core' },
  },
  clips: B.clips((p) => p.speed),

  // attach points for every frame: hand and offhand (the fists), head, back (where the growth sits), feet, and core (the weak point)
  sockets(clip, t, p) {
    const { d, pose, J, list } = frame(clip, t, p);
    return B.sockets(J, pose, d, list);
  },

  render(g, { clip, t, loop, p }) {
    const { d, pose, J, list } = frame(clip, t, p);
    const s = d.s;
    const stone = ramp(p.stone), farHex = farRamp(p.stone).base, far = ramp(farHex);
    const growth = ramp(p.growthColour), growthFar = { light: growth.base, base: growth.dark, dark: growth.dark };   // the far shoulder's growth, in the same three tones
    const jag = lerp(0.1, 0.3, p.wear);
    const box = [1, 1, W - 1, G], grown = [2, 2, W - 2, G];      // where stone may be drawn, and where what grows on it must stay
    const by = Object.fromEntries(list.map((piece) => [piece.name, piece]));
    // growth leans against the body's movement: it sways in the loops and is thrown back by a lunge
    const sway = loop ? 0.08 * wave(clip === 'walk' ? t * 2 : t, -0.22) : clamp(-0.5 * pose.lean, -0.2, 0.2);
    const gs = p.growthSize;
    // nothing may grow out of the top of the frame: the tallest sapling stops short of it at the biggest size
    const restTop = G - d.hip - d.torso * Math.cos(d.hunch) - 0.64 * d.ry - d.shoulderR;
    const sapLen = Math.min(11.5 * gs * s, restTop - 11), leafR = Math.min(3.3 * gs * s, 4.2);

    /** Whatever grows on one stone. spots: where things stand on it, as [u, v, size] on the piece. */
    const grow = (piece, inside, capBox, paint, under, spots) => {
      if (p.growth === 'none') return;
      const depth = p.growth === 'moss' ? Math.max(2, Math.round(2.7 * gs * s)) : p.growth === 'mushrooms' ? 1 : Math.max(1, Math.round(1.4 * gs));
      mossCap(g, inside, capBox, paint, { under, depth, rise: p.growth === 'moss' ? (gs >= 1.2 ? 2 : 1) : 0, ragged: p.growth === 'moss' ? 2 : 1, seed: piece.seed });
      const up = PI - piece.angle;
      for (const [u, v, k] of spots) {
        const [ax, ay] = B.onPiece(piece, u, v);
        if (p.growth === 'mushrooms') mushroom(g, ax, ay, up + (u < 0 ? 0.25 : -0.2), { height: 4.6 * gs * s * k, cap: Math.max(2.5, 4.3 * gs * s * k), paint, stalk: ramp(P.cream), box: grown });
        if (p.growth === 'saplings') sapling(g, ax, ay, up + (u < 0 ? 0.12 : -0.08), { length: sapLen * k, sway: sway * (0.7 + 0.3 * k), leaf: leafR * (0.75 + 0.25 * k), paint, wood: ramp(P.soil), box: grown });
      }
    };

    let coreAt = null;
    for (const piece of list) {
      if (piece.name === 'head') { drawHead(g, piece, { shape: p.shape, p, stone, far, jag, pose, d, box }); continue; }
      const R = piece.far ? far : stone, big = piece.rx >= 9 * s, foot = piece.sole !== undefined;
      const inside = rock(g, {
        x: piece.x, y: piece.y, r: piece.rx, squash: piece.ry / piece.rx, angle: piece.angle, seed: piece.seed,
        colour: piece.far ? farHex : p.stone, jag, sides: foot ? 7 : big ? 9 : 8,
        cracks: Math.round(p.wear * (big ? 3 : piece.far ? 1 : 2)), chips: p.wear > 0.6 && !foot ? (big ? 2 : 1) : 0,
        box: foot ? [1, 1, W - 1, Math.min(G, piece.sole)] : box,
      });
      seam(g, inside, piece.far ? far.dark : stone.deep, { clip: (px, py) => py < (foot ? piece.sole : G) });
      const { x, y, rx, ry } = piece;
      if (piece.name === 'shoulderF') grow(piece, inside, [x - rx, y - rx - 2, x + rx, y - ry * 0.2], growthFar, far.dark, [[0.25, -0.8, 0.7]]);
      if (piece.name === 'chest') {
        // one long crack runs down the chest toward the core
        if (p.wear >= 0.25) crack(g, ...B.onPiece(piece, -0.05, -0.8), 0.3 - piece.angle, lerp(5, 14, p.wear) * s, stone.deep, { seed: 4, clip: inside });
        coreAt = drawCore(g, B.onPiece(piece, B.CORE_AT[0], B.CORE_AT[1]), 3.7 * p.coreSize * s, p.core, p.glow, stone, pose, t);
        grow(piece, inside, [x - rx - 1, y - rx - 2, x + rx * 0.3, y - ry * 0.3], growth, stone.dark, [[-0.1, -0.86, 0.85]]);
      }
      if (piece.name === 'shoulderN') grow(piece, inside, [x - rx - 1, y - rx - 2, x + rx + 1, y - ry * 0.15], growth, stone.dark, [[-0.35, -0.82, 1], [0.5, -0.74, 0.7]]);
    }

    if (pose.flash) g.tint(WHITE);
    g.outline(INK);

    // ---- light and dust: after the outline, rimmed with their own dark tones ----
    const dust = [tone(p.stone, 1.5), stone.light, stone.base, stone.dark];
    const air = [1, 1, W - 1, G + 1];
    if (pose.impact >= 0) {
      // the slam: a flat ring of dust and chips of stone from where the fists land
      const x = clamp((J.armN.hand[0] + J.armF.hand[0]) / 2 + 2, 26, W - 26), k = pose.impact;
      ring(g, { t: k, x, y: G - 6, r0: 6, r1: 24, thick: 4, squash: 0.28, colours: dust, box: air, seed: 2 });
      for (const side of [-1, 1]) puffs(g, { t: k, x: x + side * 6, y: G - 3, count: 3, seed: 5 + side, angle: side * PI / 2, arc: 0.6, dist: 18, rise: 8, size: 3.2, shape: 'wispy', floor: G, colours: dust, box: air });
      shards(g, { t: k, x, y: G - 6, count: 6, dist: 15, gravity: 12, size: 3.2, angle: PI, arc: 2.6, colour: p.stone, box: air, seed: 4 });
    }
    if (pose.shout >= 0) {
      // the roar: two arcs of sound leaving the mouth
      const [mx, my] = B.onPiece(by.head, 0.95, 0.55), c = ramp(p.glow).light;
      for (const [r0, wide] of [[5, 0.55], [10, 0.7]]) {
        const r = Math.min(r0 + 9 * pose.shout, W - 3 - mx);
        if (r > 3 && pose.shout < 0.99) g.arc(mx, my, r, PI / 2 - wide, PI / 2 + wide, 1.2, c);
      }
    }
    if (clip === 'stagger' && pose.glow > 1 && coreAt) {
      // down on one knee: the core flares, bright and brighter
      const hot = pose.glow >= 2, c = ramp(p.glow), [x, y] = coreAt, r = Math.round(4.5 * p.coreSize * s) + (hot ? 3 : 1);
      twinkle(g, x, y, hot ? 2 : 1, c.light);
      for (const [dx, dy] of [[1, -1], [1, 1], [-1, 1], [-1, -1]]) { g.dot(x + dx * r, y + dy * r, hot ? WHITE : c.light); if (hot) g.dot(x + dx * (r + 1), y + dy * (r + 1), c.base); }
    }
    if (clip === 'die' && pose.fall > 0.8 && t < 1) {
      // the stones land: dust rolls out along the ground both ways and thins before the last frame
      const k = clamp((t - 6 / 11) / (5 / 11));
      for (const [side, seed] of [[-1, 7], [1, 9]]) puffs(g, { t: k, x: J.pelvis[0] + side * 22, y: G - 3, count: 3, seed, angle: side * PI / 2, arc: 0.7, dist: 12, rise: 7, size: 3.4, shape: 'wispy', floor: G, colours: dust.slice(1), box: air });
    }
  },
});
