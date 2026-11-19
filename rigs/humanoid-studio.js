// The side-view person as a library body of the studio (docs/studio.md section 3, work item S6; Contract 14 rule 1):
// a code rig with a data layer. Added with S6 as a module of its own; rigs/humanoid.js is not changed, and
// rigs/humanoid-figure.js only gained the seam (a clip the definition gives as key poses is drawn from them).
//
//   frame(clip, t, def), render(g, clip, t, def), sockets(clip, t, def)
//       draw a figure definition (the data rigs/humanoid-figure.js documents) with the Hero's parts too: a `cape`, the
//       Hero's own headgear kinds and his belt (`belt.style: 'hero'`). A definition with none of them is drawn by
//       rigs/humanoid-figure.js itself, so every figure sprite draws as before.
//   bake(def, clip, { frames, loop, from, between }), bakeClip(...), bakeClips(def, clips)
//       the formula pose of a clip at every frame's phase, as studio keys (degrees, pixels): "Start this clip over".
//       The white flash of hurt and die is not a key: bakeClip puts it in the clip's frameEdits (studio.md 2.2).
//   figureKeys(clips)      the studio's clips -> def.keys for the seam (radians, the rig's units), frame flashes folded in
//   figureFor(def, p)      a library-body studio sprite at settings p -> the figure the rig draws, with keys and keysFor
//   drawSprite(g, def, { clip, t, frame, p }), spriteSockets(def, { clip, t, frame, p })
//       one frame of a library-body studio sprite, frame edits applied: what engine/data-sprite.js (S4) calls. S4 must
//       draw every library body through these two and never through rigs/humanoid-figure.js directly: only they know
//       the Hero's parts, keysFor and frame edits (studio.md 3, "Library bodies in dataSprite").
//   refigure(def, figure)  the sprite with a new stored figure and every clip's keys moved with it (the studio, S10)
//   heroFigure(p), hero()  the Hero of sprites/knight.js as a figure, and as a studio sprite with every clip baked
//
// keysFor (docs/studio.md 3, Contract 14 rule 3): keys are the final pose for the figure as stored (body.figure). The
// drawn figure is that figure with the sprite's sliders, colours and parts applied (figureFor). Where the two differ,
// each key of a clip with `from` moves by what the formula of `from` moves between them at its t: a value nobody changed
// is exactly the formula, a value changed by hand keeps its distance from it.
//
// The Hero's cape, headgear, the hair under his helmet and his belt were drawn inside sprites/knight.js (Contract 13
// says they belong in the rig). They are copied here with their pixels, as new exports; sprites/knight.js is left as it
// is until it is converted (R3). heroFigure(p) drawn by its formula is that file, pixel for pixel, at every setting.
// Angles in the rig's units: 0 = down, PI/2 = forward (right), PI = up. Studio keys hold degrees (docs/studio.md 2).
import { PI } from '../engine/motion.js';
import { ramp, farRamp, tone, INK } from '../engine/color.js';
import { framePhase, frameOfPhase, blendKeys } from './keypose.js';
import { paintFigure, FIGURE_BLOCKS } from '../engine/data-rules.js';
import * as H from './humanoid.js';
import * as F from './humanoid-figure.js';

const DEG = 180 / PI;
const paintOf = (c, fallback) => (typeof c === 'string' ? ramp(c) : c ?? ramp(fallback));

// ---- the pose numbers a key may hold -------------------------------------------------------------------------------

const field = (kind, min, max, more = {}) => Object.freeze({ kind, ...(min === undefined ? {} : { min, max }), ...more });

/**
 * The fields of a pose a studio key may hold, each with its kind and range in the studio's units: px (pixels), angle
 * (degrees; radians in the rig), share (0..1), signed (-1..1), count (a small whole number), point ({ x, y } pixels, and
 * `up`: the knee bends up, a leg lying on the ground), arm ({ a, e } degrees), flag (true or false) and word (one of
 * `values`). `none: true`: null is a value too (not in the air, no knife). No arguments: a frozen object keyed by field.
 * The fields catalog/studio-schema.js lets a key hold are among these; far, glint, prize and knife (the figure's moves)
 * and a foot's `up` are not in the validator yet.
 */
export const POSE_FIELDS = Object.freeze({
  rootX: field('px', -64, 64), lift: field('px', -64, 64), crouch: field('px', -64, 64),
  lean: field('angle', -720, 720), headTilt: field('angle', -720, 720), item: field('angle', -720, 720), item2: field('angle', -720, 720), headTurn: field('angle', -720, 720),
  sway: field('signed', -1, 1),
  glow: field('share', 0, 1), lie: field('share', 0, 1), pull: field('share', 0, 1), fling: field('share', 0, 1), air: field('share', 0, 1, { none: true }), out: field('share', 0, 1), level2: field('share', 0, 1), far: field('share', 0, 1),
  glint: field('count', 0, 2),
  footF: field('point', -64, 64), footB: field('point', -64, 64),
  armF: field('arm', -720, 720), armB: field('arm', -720, 720),
  blink: field('flag'), flash: field('flag'), mouth: field('flag'), fire: field('flag'), prize: field('flag'),
  knife: field('word', undefined, undefined, { values: Object.freeze(['hand', 'air']), none: true }),
});

/** Copies one field of a pose into another unit: angle and arm fields through `turn`, everything else as it is; -0 becomes 0, as JSON makes it. */
function convert(kind, v, turn) {
  if (v === null || v === undefined) return v;
  const n = (x) => (x === 0 ? 0 : x);
  if (kind === 'angle') return n(turn(v));
  if (kind === 'arm') return { a: n(turn(v.a)), e: n(turn(v.e)) };
  if (kind === 'point') return v.up === undefined ? { x: n(v.x), y: n(v.y) } : { x: n(v.x), y: n(v.y), up: !!v.up };
  return typeof v === 'number' ? n(v) : v;
}

/**
 * Returns a studio key from a pose of the rig: { t, ...every field of POSE_FIELDS the pose has }, angles in degrees.
 * Arguments: P (a pose, as rigs/humanoid.js pose() and rigs/humanoid-figure.js give it), t (the key's phase, 0..1).
 */
export function toStudioKey(P, t) {
  const k = { t };
  for (const [f, { kind }] of Object.entries(POSE_FIELDS)) if (P[f] !== undefined) k[f] = convert(kind, P[f], (a) => a * DEG);
  return k;
}

/**
 * Returns a key in the rig's units (radians) from a studio key (degrees): t, ease and the pose fields; anything else is left out.
 * Arguments: k (a studio key, { t, ease?, ...pose fields }).
 */
export function fromStudioKey(k) {
  const out = { t: k.t };
  if (k.ease !== undefined) out.ease = k.ease;
  for (const [f, { kind }] of Object.entries(POSE_FIELDS)) if (Object.hasOwn(k, f) && k[f] !== undefined) out[f] = convert(kind, k[f], (a) => a / DEG);
  return out;
}

/**
 * The white flash of a clip's frame edits laid onto its keys (rig units) as a stepped track: a flash value on every
 * frame's phase, true where the frame edit or the keys say so. Between frames it is stepped, and only frames are drawn.
 */
function foldFlash(keys, c, loop) {
  const edits = c.frameEdits && typeof c.frameEdits === 'object' ? c.frameEdits : {};
  if (!Object.values(edits).some((e) => e?.flash === true)) return keys;
  const clip = { frames: c.frames, loop }, out = keys.map((k) => ({ ...k }));
  for (let f = 0; f < Math.max(1, Math.floor(c.frames) || 1); f++) {
    const t = framePhase(clip, f), flash = edits[f]?.flash === true || blendKeys(keys, t, { loop }).flash === true;
    const at = out.find((k) => Math.abs(k.t - t) < 1e-9);
    if (at) at.flash = flash; else out.push({ t, flash });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Returns what a figure definition's `keys` holds for the seam in rigs/humanoid-figure.js: { clip: { loop, keys, from? } }
 * in the rig's units, for every clip that has keys (`from`: the pose its keys were baked from, which keysFor uses). A
 * frame edit's white flash is folded in as a flash value on every frame (a key-free clip's frame edits are not drawn).
 * Arguments: clips (a studio sprite's clips: { name: { frames, loop, keys, frameEdits, from, ... } }).
 */
export function figureKeys(clips = {}) {
  const out = {};
  for (const [name, c] of Object.entries(clips)) {
    if (!Array.isArray(c?.keys) || !c.keys.length) continue;
    const loop = c.loop ?? true;
    out[name] = { loop, keys: foldFlash(c.keys.map(fromStudioKey), c, loop), ...(typeof c.from === 'string' ? { from: c.from } : {}) };
  }
  return out;
}

// ---- keys made for one figure, drawn on another (a visitor's sliders and parts) ------------------------------------

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameData = (a, b) => (isPlain(a) && isPlain(b)
  ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.hasOwn(b, k) && sameData(a[k], b[k]))
  : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((x, i) => sameData(x, b[i])) : Object.is(a, b) || (a === 0 && b === 0));
const bare = (def) => { const { keys, keysFor, ...rest } = def; return rest; };

/** One value of a key moved from the formula `was` to the formula `now`: a number by the same amount (exactly `now` when it was `was`), anything else to `now` when it was `was`. */
function follow(v, was, now) {
  if (typeof v === 'number') {
    if (typeof was !== 'number' || typeof now !== 'number') return v;
    return Math.abs(v - was) < 1e-9 ? now : now + (v - was);
  }
  if (isPlain(v)) {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = follow(x, isPlain(was) ? was[k] : undefined, isPlain(now) ? now[k] : undefined);
    return out;
  }
  return was !== undefined && now !== undefined && sameData(v, was) ? now : v;
}

/**
 * The definition with one clip's keys moved to its settings: keys are made for one figure (def.keysFor: the definition as
 * the studio stores it), and a sprite is drawn at other settings (a slider for height, a part switched off). Each key
 * then moves by what the formula of the pose it was baked from (`from`) moves between the two figures at its t: a clip
 * no one changed is the formula at the new settings, and a dragged foot keeps its distance from where the formula
 * puts the foot. No keysFor, the same figure, or a clip without `from`: the keys are drawn as they are.
 */
function settle(def, clip) {
  const own = def.keysFor && def.keys && Object.hasOwn(def.keys, clip) ? def.keys[clip] : null;
  if (!own || Array.isArray(own) || typeof own.from !== 'string' || !Array.isArray(own.keys) || !POSE_NAMES.includes(own.from)) return def;
  const now = bare(def), was = bare(def.keysFor);
  if (sameData(now, was)) return def;
  const src = (fig) => ({ ...fig, moves: { ...fig.moves, [clip]: own.from } });
  const keys = own.keys.map((k) => {
    const a = frame(clip, k.t, src(was)).P, b = frame(clip, k.t, src(now)).P, out = { t: k.t };
    if (k.ease !== undefined) out.ease = k.ease;
    for (const [f, v] of Object.entries(k)) if (f !== 't' && f !== 'ease') out[f] = follow(v, a[f], b[f]);
    return out;
  });
  return { ...def, keysFor: undefined, keys: { ...def.keys, [clip]: { ...own, keys } } };      // settled: not moved twice
}

// ---- the Hero's parts (from sprites/knight.js, same pixels) -------------------------------------------------------

/** The capes cape() can draw. No arguments: a list. */
export const CAPE_KINDS = Object.freeze(['plain', 'tattered']);

/**
 * Draws the Hero's cape, for the `behind` hook: cloth from the shoulders that hangs behind the body and blows back with the sway, its hem torn for 'tattered'.
 * Known limit (copied as it is from sprites/knight.js): it hangs from the neck's x, so a lean posed by hand past the formula's range hides it behind the torso (+15 degrees: 37 to 22 cloth pixels; +30: gone). Fix when knight.js is converted (R3); the test is marked todo.
 * Arguments: g, J, P, d (as the hook receives them), o: { kind (one of CAPE_KINDS), length (1 = to a little below the hip; 0.3 to 1.8), colour (the cloth: painted a step darker, it hangs behind) }.
 */
export function cape(g, J, P, d, o = {}) {
  const kind = o.kind ?? 'plain', length = o.length ?? 1, colour = o.colour ?? '#c9423a';
  const [nx, ny] = J.neck, s = P.sway;
  const hemY = (k) => Math.min(J.hip[1] + d.leg * k * length, J.gy - 1);
  const back = [nx - d.chestR - 3 - s * 2.5, hemY(0.45)], front = [nx - d.chestR + 1.5 - s * 1.5, hemY(0.55)];
  const pts = [[nx + 1, ny + 1], [nx - d.chestR - 0.5, ny + 1], back];
  if (kind === 'tattered') {
    // a torn hem: two bites out of the bottom edge
    const at = (k, up) => [back[0] + (front[0] - back[0]) * k, back[1] + (front[1] - back[1]) * k - up];
    pts.push(at(0.2, 0), at(0.35, 3.5), at(0.5, 0), at(0.68, 3), at(0.85, 0));
  }
  pts.push(front);
  g.poly(pts, farRamp(colour));
}

/**
 * Draws the edge of the Hero's cape along the ground under a body lying on its back, for the `front` hook (draw it once the pose's lie is over 0.9): two rows from the shoulders toward the feet.
 * Arguments: g, J, P, d (as the hook receives them), o: { kind (one of CAPE_KINDS), length (as cape()), colour }.
 */
export function capeOnGround(g, J, P, d, o = {}) {
  const kind = o.kind ?? 'plain', length = o.length ?? 1, paint = ramp(o.colour ?? '#c9423a');
  const x0 = Math.round(J.neck[0] - d.chestR), x1 = Math.round(J.neck[0] + (d.torso + d.leg * 0.45) * Math.min(length, 1.5));
  const y = Math.round(J.gy) - 1;
  for (let x = x0; x <= x1; x++) {
    const torn = kind === 'tattered' && ((x - x0) % 5 === 3 || x === x1 - 1);
    g.dot(x, y, torn ? paint.dark : paint.base);
    if (!torn && x < x1 - 1) g.dot(x, y - 1, x % 2 || kind !== 'tattered' ? paint.base : paint.dark);
  }
  g.dot(x0 - 1, y, paint.dark);
}

/** The headgear heroHeadgear() can draw: the Hero's own helmet and crown (the rig's 'helmet' and 'crown' are other drawings). No arguments: a list. */
export const HERO_HEADGEAR = Object.freeze(['plumed helmet', 'gold crown']);

/** Returns how far the Hero's headgear rises above the top of the head, in pixels, for fit()'s `points`; 0 for any other kind. Arguments: kind (one of HERO_HEADGEAR), size (1 = standard). */
export function heroHeadgearRise(kind, size = 1) {
  if (kind === 'plumed helmet') return 3 + 2.5 * size + 1.6 * Math.sqrt(size);
  if (kind === 'gold crown') return 1 + Math.max(1, Math.round(2 * size)) + Math.max(1, Math.round(size));
  return 0;
}

/**
 * Draws the Hero's headgear, for the `head` hook: an open-faced helmet with a plume that grows with the size and blows with the sway, or a gold crown with a jewel whose band and points grow with the size.
 * Arguments: g, J, P, d (as the hook receives them), o: { kind (one of HERO_HEADGEAR), size (1 = standard; 0.5 to 1.8), metal (the helmet: a colour or a ramp), trim (the plume and the jewel: a colour or a ramp) }.
 */
export function heroHeadgear(g, J, P, d, o = {}) {
  const kind = o.kind ?? 'plumed helmet', size = o.size ?? 1, metal = paintOf(o.metal, '#c2c9d6'), trim = paintOf(o.trim, '#c9423a');
  const [hx, hy] = J.head, R = d.headR;
  if (kind === 'plumed helmet') {
    const shell = (px, py) => {
      if (((px - hx) / (R + 1)) ** 2 + ((py - hy) / (R + 1)) ** 2 > 1) return false;
      if (py < hy - R * 0.3) return true;          // dome
      return px < hx - R * 0.15;                    // back and cheek guard
    };
    g.fill(hx - R - 2, hy - R - 2, hx + R + 2, hy + R + 2, shell, metal, { light: 1 });
    g.rect(Math.round(hx - R * 0.1), Math.round(hy - R * 0.3) - 1, Math.ceil(R * 1.1) + 1, 1, metal.dark);
    // the plume: the size makes it longer and fuller
    const x0 = hx - 0.5, y0 = hy - R - 0.5, w = Math.sqrt(size);
    g.capsule(x0, y0, H.scaleFrom(x0, hx - R * 0.9 - (P.sway ?? 0) * 1.5, size), H.scaleFrom(y0, hy - R - 2.5, size), 1.6 * w, 0.9 * w, trim);
  } else if (kind === 'gold crown') {
    // the size makes the band deeper and the points taller
    const band = Math.max(1, Math.round(2 * size)), points = Math.max(1, Math.round(size));
    const y = Math.round(hy - R - 1) + 2 - band, x = Math.round(hx - R * 0.55), w = Math.round(R * 1.2);
    const gold = ramp('#e6c545');
    g.rect(x, y, w, band, gold);
    for (let i = 0; i < w; i += 2) for (let j = 1; j <= points; j++) g.dot(x + i, y - j, gold.light);
    g.dot(x + Math.floor(w / 2), y + Math.floor((band - 1) / 2), trim.base);
  }
}

/**
 * Draws hair below the back of a helmet, for the `head` hook after the helmet, so the hair colour still reads with it on; only short and spiky hair (long hair and a ponytail already hang out, bald has none).
 * Arguments: g, J, P, d (as the hook receives them), o: { style (one of the rig's HAIR_STYLES), colour (a colour or a ramp) }.
 */
export function napeHair(g, J, P, d, o = {}) {
  const style = o.style ?? 'short';
  if (style !== 'short' && style !== 'spiky') return;
  const [hx, hy] = J.head, R = d.headR;
  g.fill(hx - R - 2, hy, hx, hy + R + 1, (px, py) => ((px - hx) / (R + 0.8)) ** 2 + ((py - hy) / (R + 0.7)) ** 2 <= 1 && px < hx - R * 0.45 && py > hy + R * 0.2 && py < hy + R * 0.62, paintOf(o.colour, '#5a3a22'), { shade: 0 });
}

/**
 * Draws the Hero's belt, for the `torso` hook: one row across the hips in the shadow tone of its colour with a buckle at the front; lying down, it runs across the body over what is drawn there.
 * Arguments: g, J, P, d (as the hook receives them), o: { colour (the strap, drawn in its shadow tone), buckle (a colour) }.
 */
export function heroBelt(g, J, P, d, o = {}) {
  const strap = paintOf(o.colour, '#c9423a').dark, buckle = o.buckle ?? ramp('#c2c9d6').light;
  const hx = Math.round(J.hip[0]), hy = Math.round(J.hip[1]), r = Math.round(d.hipR);
  if (P.lie > 0.5) {
    for (let y = hy - r - 1; y <= hy + r; y++) if (g.get(hx - 2, y)) g.dot(hx - 2, y, strap);
    if (g.get(hx - 2, hy - 1)) g.dot(hx - 2, hy - 1, buckle);
    return;
  }
  g.rect(hx - r, hy - 2, r * 2, 1, strap);
  g.dot(hx + 1, hy - 2, buckle);
}

// ---- a figure with the Hero's parts: frame, render, sockets --------------------------------------------------------

/** Whether a definition wears any of the Hero's parts (then this module draws it; otherwise rigs/humanoid-figure.js does). */
const heroic = (def) => def.cape !== undefined || HERO_HEADGEAR.includes(def.headgear?.kind) || def.belt?.style === 'hero';

/** Whether a definition gives a clip as key poses (the seam in rigs/humanoid-figure.js draws it then). */
const keyed = (def, clip) => {
  const own = def.keys && Object.hasOwn(def.keys, clip) ? def.keys[clip] : null;
  const list = Array.isArray(own) ? own : own?.keys;
  return Array.isArray(list) && list.length > 0;
};

/** The far point of the Hero's headgear for fit(), as sprites/knight.js keeps it in: above the head, behind it when lying. */
function headgearPoints(def, d) {
  const g = def.headgear, rise = g ? heroHeadgearRise(g.kind, g.size ?? 1) : 0, top = d.headR + rise;
  return rise ? (J, P) => [P.headTurn ? [J.head[0] - Math.sin(P.headTurn) * (top + 1), J.head[1] - Math.cos(P.headTurn) * top] : [J.head[0], J.head[1] - d.headR - rise]] : null;
}

/**
 * Returns everything one frame of a figure is drawn from, as rigs/humanoid-figure.js frame() does: { clip, t, def, name, d, held, worn, m, P, J, poseAt(u), tips(u) }.
 * A definition with the Hero's parts is posed as sprites/knight.js poses the Hero (the rig's pose, `held.swing` for the attack, the headgear kept in the frame); a clip given as keys goes through the figure's seam, then the Hero's headgear is kept in the frame.
 * Arguments: clip (the clip's name), t (phase 0..1), def (the definition: rigs/humanoid-figure.js header, and cape, the Hero's headgear kinds, belt.style, held.swing).
 */
export function frame(clip, t, def = {}) {
  def = settle(def, clip);
  if (!heroic(def)) return F.frame(clip, t, def);
  const d = H.dims(def.body ?? {}), points = headgearPoints(def, d);
  if (keyed(def, clip)) {
    // the seam draws the keys; the Hero's headgear (which the figure module does not know) is kept in the frame on top
    const Fr = F.frame(clip, t, def), seam = Fr.poseAt;
    const fit = (P) => (points ? H.fit(P, Fr.d, { points }) : P);
    Fr.poseAt = (u) => fit(seam(u));
    Fr.P = fit(Fr.P);
    Fr.J = H.solve(Fr.P, Fr.d);
    return Fr;
  }
  const motion = def.motion ?? {};
  const held = def.held ? F.heldSize(def.held.kind, def.held.length ?? 1) : null;
  let name = def.moves?.[clip] ?? clip;
  if (name === 'attack' && !held) name = 'punch';                  // nothing held: an unarmed attack
  const worn = def.headgear && def.headgear.kind !== 'none' ? def.headgear : null;
  const m = { bounce: motion.bounce ?? 0.5, stride: motion.stride ?? 0.5, armed: !!held, hold: held ? H.holdAngle(def.held.angle ?? 0) : 0, swing: held ? def.held.swing ?? 1 : 1 };
  const Fr = { clip, t, def, name, d, held, worn, m };
  Fr.poseAt = (u) => {
    const P = F.MOVES.includes(name) ? F.move(name, u, m, d) : H.pose(name, u, m, d);
    // lying beside the body, a wide blade rests on the ground, not in it
    return H.fit(P, d, { item: held && name === 'die' ? { ...held, pad: held.pad + 1.5 } : held, points });
  };
  Fr.P = Fr.poseAt(t);
  Fr.J = H.solve(Fr.P, d);
  Fr.tips = (u) => { const Q = u === t ? Fr.P : Fr.poseAt(u); return [H.itemTip(u === t ? Fr.J : H.solve(Q, d), Q, held ? held.length : 1)]; };
  return Fr;
}

/**
 * Returns the attach points of one frame of a figure (hand, offhand, head, back, feet; muzzle for a definition with `thrown`), the Hero's parts or not.
 * Arguments: clip, t, def (as frame() takes them).
 */
export function sockets(clip, t, def = {}) {
  def = settle(def, clip);
  if (!heroic(def)) return F.sockets(clip, t, def);
  const Fr = frame(clip, t, def), out = H.sockets(Fr.J, Fr.P, Fr.d);
  if (def.thrown) out.muzzle = { x: Fr.J.armB.hand[0] + 2, y: Fr.J.armB.hand[1], angle: Fr.J.armB.angle };
  return out;
}

/**
 * Paints one frame of a figure: a definition with the Hero's parts (cape, his headgear, his belt) as sprites/knight.js paints the Hero, any other through rigs/humanoid-figure.js render(). Returns the frame, as frame() does.
 * With the Hero's parts it also draws the figure's coat, pack, mask, other headgear and the thing in the near hand; not yet a scarf, a second thing in the far hand, or what the figure's moves show (a tossed blade, a thrown knife, the coin bag).
 * Arguments: g (the Surface), clip (the clip's name), t (phase 0..1), def (as frame() takes it).
 */
export function render(g, clip, t, def = {}) {
  def = settle(def, clip);
  if (!heroic(def)) return F.render(g, clip, t, def);
  const Fr = frame(clip, t, def), { P, d, held, worn, name } = Fr;
  const look = def.look ?? {}, hair = def.hair ?? {};
  const hero = HERO_HEADGEAR.includes(worn?.kind);
  const capeOn = def.cape && def.cape.kind !== 'none' ? def.cape : null;
  H.draw(g, P, d, {
    skin: look.skin ?? '#f6d3b0', top: look.top ?? '#3f6fd1', bottom: look.bottom ?? look.top ?? '#3f6fd1', boots: look.boots ?? '#5b3d2e', bareArms: look.bareArms,
    hair: hair.colour ?? '#5a3a22', hairStyle: worn?.kind === 'hood' ? 'bald' : hair.style ?? 'short',
  }, {
    behind(g, J) {
      if (capeOn) cape(g, J, P, d, capeOn);
      if (def.pack && def.pack.kind !== 'none') F.pack(g, J, P, d, def.pack);
    },
    torso(g, J) {
      if (def.coat) H.tunic(g, J, P, d, def.coat);
      if (def.belt?.style === 'hero') heroBelt(g, J, P, d, def.belt);
      else if (def.belt) F.belt(g, J, P, d, def.belt);
    },
    head(g, J) {
      if (hero) {
        heroHeadgear(g, J, P, d, { kind: worn.kind, size: worn.size, metal: worn.colour, trim: worn.band });
        if (worn.kind === 'plumed helmet') napeHair(g, J, P, d, { style: hair.style ?? 'short', colour: hair.colour ?? '#5a3a22' });
      } else if (worn) F.wear(g, J, P, d, worn);
      if (def.mask) F.mask(g, J, P, d, def.mask);
    },
    front(g, J) {
      if (capeOn && P.lie > 0.9) capeOnGround(g, J, P, d, capeOn);
    },
    item(g, J) {
      if (held) F.drawHeld(g, H.sockets(J, P, d).hand, { kind: held.kind, length: held.length, metal: paintOf(def.held.metal, '#c2c9d6'), wood: def.held.wood, hilt: def.held.hilt, cord: def.held.cord, fling: P.fling ?? 0, floor: J.gy });
    },
  });
  if (P.flash) g.tint('#ffffff');
  g.outline(INK);
  if (name === 'attack' && held && !held.hangs) H.slashTrail(g, Fr.poseAt, t, d, held.length, '#ffffff');
  return Fr;
}

// ---- baking: a formula clip as key poses ---------------------------------------------------------------------------

const POSE_NAMES = [...H.POSES, ...F.MOVES];

// How far back in the clip the light of a pose looks (rigs/humanoid.js slashTrail and thrustTrail: 0.16; the stab and
// the dart of rigs/humanoid-figure.js render(): 0.15). A frame of these poses is drawn from its own pose and the pose
// that far back, between frames: bake() keys that phase too, so a baked clip's light is the formula's.
const LOOKS_BACK = { attack: 0.16, punch: 0.16, stab: 0.15, steal: 0.15 };

/** frames and loop of a pose in the rig's clip table (the moves borrow the clip they stand for); null for a name it has not. */
function tableOf(name) {
  const own = { stab: 'attack', throw: 'shoot', toss: 'victory', steal: 'attack', punch: 'attack', thrust: 'attack' }[name] ?? name;
  try { const c = H.clipsFor([own])[own]; return { frames: c.frames, loop: c.loop }; } catch { return null; }
}

/** The most frames a clip has (catalog/studio-schema.js STUDIO_LIMITS.framesPerClip, LIMITS.framesPerClip): bake() keys at most this many frames. */
export const MOST_FRAMES = 64;

/** What bake() works from: the pose, the clip's frames and loop, the figure without keys, and the phase of every frame. Throws for a pose the body has not, or frames that are not a number. */
function bakeSource(def, clip, o) {
  const from = o.from ?? def.moves?.[clip] ?? clip;
  if (!POSE_NAMES.includes(from)) throw new Error(`rigs/humanoid-studio.js bake: "${from}" is not a pose of the side-view body (${POSE_NAMES.join(', ')}); give from`);
  if (o.frames !== undefined && (typeof o.frames !== 'number' || !Number.isFinite(o.frames))) throw new Error(`rigs/humanoid-studio.js bake: frames must be a number from 1 to ${MOST_FRAMES}; got ${String(o.frames)}`);
  const std = tableOf(from) ?? {};
  const frames = Math.min(MOST_FRAMES, Math.max(1, Math.floor(o.frames ?? std.frames ?? 8))), loop = o.loop ?? std.loop ?? true;
  const src = { ...def, keys: undefined, keysFor: undefined, moves: { ...def.moves, [clip]: from } };
  const phases = Array.from({ length: frames }, (_, f) => framePhase({ frames, loop }, f));
  return { from, frames, loop, src, phases };
}

/**
 * Returns a clip's formula pose as studio keys (degrees, pixels), sorted by t: one key at every frame's phase, and (unless `between` is false) for a pose whose light looks back between frames (a swing, a punch, a stab, a dart) one more key at each phase it looks back to, so a baked clip draws the same frames as the formula clip, light and all. No key holds the white flash: bakeClip() gives it as frame edits. The clip's own keys, if it has any, are not used: this is "Start this clip over". Throws when frames is given and is not a finite number; frames are capped to 1..MOST_FRAMES.
 * Arguments: def (a figure definition), clip (the clip's name), o: { frames, loop (default: the rig's table for the pose), from (the pose to bake from: a name of the rig's POSES or the figure's MOVES; default the pose the definition uses for the clip), between (default true: the keys between frames the light needs) }.
 */
export function bake(def, clip, o = {}) {
  const { src, phases } = bakeSource(def, clip, o);
  const back = o.between === false ? 0 : LOOKS_BACK[frame(clip, 0, src).name];
  if (back) for (const t of [...phases]) { const u = Math.max(0, t - back); if (!phases.includes(u)) phases.push(u); }
  return phases.sort((a, b) => a - b).map((t) => { const k = toStudioKey(frame(clip, t, src).P, t); delete k.flash; return k; });
}

/**
 * Returns one clip baked: { from, keys, frameEdits? }: bake()'s keys, and the frames the formula flashes white as frame edits ({ "0": { flash: true } } for hurt and die), absent when none does.
 * Arguments: def, clip, o (as bake() takes them).
 */
export function bakeClip(def, clip, o = {}) {
  const { from, src, phases } = bakeSource(def, clip, o);
  const frameEdits = {};
  phases.forEach((t, f) => { if (frame(clip, t, src).P.flash) frameEdits[f] = { flash: true }; });
  return { from, keys: bake(def, clip, o), ...(Object.keys(frameEdits).length ? { frameEdits } : {}) };
}

/**
 * Returns a table of clips with every clip baked: { name: { ...the clip, from, keys, frameEdits? } }, `from` being the pose each was baked from. A clip's other frame edits (nudges) are kept; the white flash of every frame is set from the formula.
 * Arguments: def (a figure definition), clips ({ name: { frames, fps, loop, from?, label?, sounds?, frameEdits? } }).
 */
export function bakeClips(def, clips) {
  const out = {};
  for (const [name, c] of Object.entries(clips)) {
    const from = c.from ?? def.moves?.[name] ?? name;
    const b = bakeClip(def, name, { frames: c.frames, loop: c.loop, from });
    const edits = {};
    for (const [f, e] of Object.entries(c.frameEdits ?? {})) { const { flash, ...rest } = e ?? {}; if (Object.keys(rest).length) edits[f] = rest; }
    for (const [f, e] of Object.entries(b.frameEdits ?? {})) edits[f] = { ...e, ...edits[f] };
    const { frameEdits, ...clip } = c;
    out[name] = { ...clip, from, keys: b.keys, ...(Object.keys(edits).length ? { frameEdits: edits } : {}) };
  }
  return out;
}

// ---- a library-body studio sprite: settings to figure, one frame, a new stored figure -----------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;
// the tones a figure colour may be of a slot's colour and still follow it (tone(c, a) of engine/color.js: the Hero's
// trousers are tone(outfit, -0.6); a ramp's light and dark are tone(c, 0.85) and tone(c, -1))
const FOLLOW_TONES = [-0.6, 0.85, -1];
// the parts of a figure a sprite may switch off: those with a kind are set to kind 'none', the others are left out
const KIND_PARTS = ['held', 'headgear', 'scarf', 'pack', 'cape'];
const BODY_FIELDS = ['height', 'build', 'head'];
const copyOf = (v) => JSON.parse(JSON.stringify(v ?? {}));

/** The new value of one figure colour for the sprite's slots at settings p: the first slot (in the sprite's order) whose default it is, or whose default it is a tone of, recolours it the same way; anything else is kept. */
function slotColour(v, slots, p) {
  const low = v.toLowerCase();
  for (const [slot, d] of slots) {
    if (typeof d !== 'string' || !HEX.test(d)) continue;
    const now = typeof p[slot] === 'string' && HEX.test(p[slot]) ? p[slot].toLowerCase() : d.toLowerCase();
    if (low === d.toLowerCase()) return now;
    for (const a of FOLLOW_TONES) if (low === tone(d, a).toLowerCase()) return tone(now, a);
  }
  return v;
}

// Any part other than engine/data-rules.js FIGURE_BLOCKS (held, headgear, cape ...) is drawn only when the stored figure
// has it, so a control never adds one, as body.paint never does (review F1, issue 4; catalog/studio-schema.js warns).

/** A control's value in the figure field it sets ("part.field", or "stance"): a number for a slider, a word for a choice (through its map, when it has one); nothing when the settings do not give one of those, or the part is one the figure has not. */
function setField(fig, c, v) {
  if (!(typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)))) return;
  if (typeof v === 'string' && c.map && Object.hasOwn(c.map, v)) v = c.map[v];      // an option that stands for another value of the field
  if (c.sets === 'stance') { if (typeof v === 'string') fig.stance = v; return; }
  const dot = c.sets.indexOf('.'), part = c.sets.slice(0, dot), field = c.sets.slice(dot + 1);
  if (dot < 1 || !field || part === '__proto__' || field === '__proto__') return;
  if (!isPlain(fig[part]) && !FIGURE_BLOCKS.includes(part)) return;
  fig[part] = { ...(isPlain(fig[part]) ? fig[part] : {}), [field]: v };
}

/** Every setting of a library-body sprite, its defaults under the ones p gives: colours, controls (speed 0.5) and on/off parts. */
function settingsOf(def, q) {
  const out = { ...(def.colours ?? {}) };
  for (const c of def.controls ?? []) if (c?.key && c.kind !== 'colour') out[c.key] = c.standard ? 0.5 : c.default;
  for (const [name, part] of Object.entries(def.parts ?? {})) if (!Array.isArray(part?.params)) out[name] = part?.default !== false;
  for (const [k, v] of Object.entries(q ?? {})) if (v !== undefined && v !== null) out[k] = v;
  return out;
}

/**
 * Returns the figure a library-body studio sprite is drawn with at settings p, plain data: its stored figure (body.figure)
 * with (1) each slider's value in the body field it sets (`sets`: height, build, head), (2) every colour of the figure
 * that is a colour slot's default, or one of its tones (tone -0.6, the ramp's light and dark), in that slot's colour
 * (the first slot wins when two share a default), (3) each part switched off (p[part] false, or its default false when
 * p does not say) set to kind 'none' (held, headgear, scarf, pack, cape) or left out (belt, coat, mask), (4) a clip with
 * no keys but a `from` drawn by that pose, and (5) `keys` (figureKeys of the clips) and `keysFor` (the stored figure).
 * Studio item F1: a slider or choice whose `sets` is "part.field" (or "stance") puts its value in that field; and when the
 * definition has body.paint, (2) is replaced by it: only the fields paint names follow the settings, each through its
 * rule (engine/data-rules.js paintFigure; missing settings are their defaults), and every other colour stays as stored.
 * A Contract 3 part (with params) is taken off by its choice, not by (3).
 * Arguments: def (a cleaned loadout-sprite with body { library: 'humanoid', figure }), p (settings by slot, control key and part name; missing ones are their defaults).
 */
export function figureFor(def, p = {}) {
  const stored = def?.body?.figure ?? {}, q = p ?? {};
  let fig = copyOf(stored);
  const all = settingsOf(def, q);
  for (const c of def.controls ?? []) {
    if (BODY_FIELDS.includes(c?.sets) && typeof q[c.key] === 'number' && Number.isFinite(q[c.key])) fig.body = { ...fig.body, [c.sets]: q[c.key] };
    else if (typeof c?.sets === 'string' && !BODY_FIELDS.includes(c.sets)) setField(fig, c, all[c.key]);      // studio item F1: missing settings are the defaults
  }
  const paint = def?.body?.paint;
  // body.paint (studio item F1): only the fields it names follow the settings, each through its rule (engine/data-rules.js)
  if (isPlain(paint)) fig = paintFigure(fig, paint, all);
  else {
    const slots = Object.entries(def.colours ?? {});
    if (slots.length) for (const part of Object.values(fig)) {
      if (!isPlain(part)) continue;
      for (const [k, v] of Object.entries(part)) if (typeof v === 'string' && HEX.test(v)) part[k] = slotColour(v, slots, q);
    }
  }
  for (const [name, part] of Object.entries(def.parts ?? {})) {
    if (Array.isArray(part?.params)) continue;       // a Contract 3 part is taken off by its choice (kind "none"), through `sets`
    if ((typeof q[name] === 'boolean' ? q[name] : part?.default !== false) || fig[name] === undefined) continue;
    if (KIND_PARTS.includes(name)) fig[name] = { ...fig[name], kind: 'none' };
    else delete fig[name];
  }
  for (const [name, c] of Object.entries(def.clips ?? {})) if (!(c?.keys?.length) && POSE_NAMES.includes(c?.from)) fig.moves = { ...fig.moves, [name]: c.from };
  return { ...fig, keys: keysOfClips(def.clips), keysFor: stored };
}

// figureKeys of a frozen table of clips (engine/data-sprite.js freezes its definition), worked out once: it is most of
// the cost of a frame. A table that can still change is worked out every time.
const FROZEN_KEYS = new WeakMap();
function keysOfClips(clips) {
  const frozen = (v) => v === undefined || Object.isFrozen(v);
  if (!clips || typeof clips !== 'object' || !Object.isFrozen(clips) || !Object.values(clips).every((c) => frozen(c) && frozen(c?.keys) && (c?.keys ?? []).every(frozen) && frozen(c?.frameEdits))) return figureKeys(clips);
  let k = FROZEN_KEYS.get(clips);
  if (!k) { k = figureKeys(clips); FROZEN_KEYS.set(clips, k); }
  return k;
}

/** The clip, its frame and its phase for drawSprite and spriteSockets: frame wins when given; else the frame nearest t. Null for a clip the sprite has not. */
function frameAt(def, { clip, t, frame: f } = {}) {
  const c = def?.clips && Object.hasOwn(def.clips, clip) ? def.clips[clip] : null;
  if (!c) return null;
  const n = Math.max(1, Math.floor(c.frames) || 1), shape = { frames: n, loop: c.loop ?? true };
  const at = Number.isInteger(f) ? Math.min(n - 1, Math.max(0, f)) : frameOfPhase(shape, t);
  const e = c.frameEdits?.[at], nudge = Array.isArray(e?.nudge) ? e.nudge.map((v) => Math.round(Number(v) || 0)) : [0, 0];
  return { c, at, t: Number.isInteger(f) || !Number.isFinite(t) ? framePhase(shape, at) : t, nudge };
}

/**
 * Draws one frame of a library-body studio sprite on g (64 by 64): figureFor(def, p) drawn by render() at the frame's phase, then the frame's nudge (whole pixels; what leaves the frame is cut). The white flash of a frame edit is drawn through the keys (figureKeys). Draws nothing for a clip the sprite has not. Returns the frame render() gives, or null.
 * Arguments: g (the Surface), def (a cleaned loadout-sprite with a library body), o: { clip, frame (wins when given), t (the phase, used when frame is not given), p (the sprite's settings) }.
 */
export function drawSprite(g, def, o = {}) {
  const at = frameAt(def, o);
  if (!at) return null;
  const Fr = render(g, o.clip, at.t, figureFor(def, o.p));
  const [dx, dy] = at.nudge;
  if (dx || dy) {
    const was = g.data.slice();
    g.data.fill(0);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const v = was[y * g.w + x], nx = x + dx, ny = y + dy;
      if (v && nx >= 0 && ny >= 0 && nx < g.w && ny < g.h) g.data[ny * g.w + nx] = v;
    }
  }
  return Fr;
}

/**
 * Returns the attach points of one frame of a library-body studio sprite (as sockets() gives them), moved by the frame's nudge; null for a clip the sprite has not.
 * Arguments: def, o: { clip, frame, t, p } (as drawSprite takes them).
 */
export function spriteSockets(def, o = {}) {
  const at = frameAt(def, o);
  if (!at) return null;
  const out = sockets(o.clip, at.t, figureFor(def, o.p)), [dx, dy] = at.nudge;
  for (const s of Object.values(out)) { s.x += dx; s.y += dy; }
  return out;
}

/** A key in the rig's units back in the studio's (degrees): t, ease and the pose fields it holds. */
function toStudioUnits(k) {
  const out = { t: k.t };
  if (k.ease !== undefined) out.ease = k.ease;
  for (const [f, { kind }] of Object.entries(POSE_FIELDS)) if (Object.hasOwn(k, f) && k[f] !== undefined) out[f] = convert(kind, k[f], (a) => a * DEG);
  return out;
}

/**
 * Returns a copy of a library-body studio sprite with a new stored figure, every clip with `from` and keys moved with it: each key by what the formula of its `from` moves between the old figure and the new at its t (keysFor), so a clip nobody changed is the new formula and a value changed by hand keeps its distance from it. What the studio (S10) does when a person changes the stance, the liveliness, the stride or a body field. Frame edits, sounds and the rest are kept.
 * Arguments: def (a cleaned loadout-sprite with a library body), figure (the new figure, plain data, without keys).
 */
export function refigure(def, figure) {
  const was = def.body.figure, now = copyOf(figure), clips = {};
  for (const [name, c] of Object.entries(def.clips ?? {})) {
    if (!(c?.keys?.length) || typeof c.from !== 'string') { clips[name] = copyOf(c); continue; }
    const own = { loop: c.loop ?? true, from: c.from, keys: c.keys.map(fromStudioKey) };
    const moved = settle({ ...now, keys: { [name]: own }, keysFor: was }, name).keys[name].keys;
    clips[name] = { ...copyOf(c), keys: moved.map(toStudioUnits) };
  }
  return { ...copyOf(def), body: { ...def.body, figure: now }, clips };
}

// ---- the Hero ------------------------------------------------------------------------------------------------------

/** The Hero's settings at their defaults, by the names sprites/knight.js gives them. No arguments: a frozen object. */
export const HERO_SETTINGS = Object.freeze({
  height: 0.5, build: 0.5, head: 0.55, hairStyle: 'short', hair: '#5a3a22', headgear: 'helmet', headgearSize: 1,
  weapon: 'sword', weaponLength: 1, weaponAngle: 0, weaponSwing: 1, cape: 'plain', capeLength: 1,
  skin: '#f6d3b0', outfit: '#3f6fd1', trim: '#c9423a', metal: '#c2c9d6', bounce: 0.5, stride: 0.5, speed: 0.5,
});

/**
 * Returns the Hero of sprites/knight.js as a figure definition (plain data) for settings of that sprite: drawn by render() with no keys, it is that sprite, pixel for pixel.
 * Arguments: p (any of HERO_SETTINGS; the rest are their defaults).
 */
export function heroFigure(p = {}) {
  const s = { ...HERO_SETTINGS, ...p }, armed = s.weapon !== 'none';
  const kind = { helmet: 'plumed helmet', crown: 'gold crown' }[s.headgear] ?? 'none';
  return {
    body: { height: s.height, build: s.build, head: s.head },
    motion: { bounce: s.bounce, stride: s.stride },
    look: { skin: s.skin, top: s.outfit, bottom: tone(s.outfit, -0.6), boots: '#5b3d2e' },
    hair: { style: s.hairStyle, colour: s.hair },
    held: { kind: s.weapon, length: s.weaponLength, angle: s.weaponAngle, swing: s.weaponSwing, metal: s.metal, wood: '#8a5a34', hilt: '#e6c545' },
    headgear: { kind, size: s.headgearSize, colour: s.metal, band: s.trim },
    cape: { kind: s.cape, length: s.capeLength, colour: s.trim },
    // the buckle is the metal's light tone when something metal is worn or held, else plain steel's
    belt: { style: 'hero', colour: s.trim, buckle: ramp(armed || s.headgear === 'helmet' ? s.metal : '#c2c9d6').light },
  };
}

// the Hero's clips (sprites/knight.js: the rig's six, then die, block and victory) and the sounds of each at the default settings
const HERO_CLIPS = ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'die', 'block', 'victory'];
const STEPS = [0, 4].map((frame) => ({ sound: 'footstep-gravel', frame, preset: 'Boots' }));
const HERO_SOUNDS = {
  walk: STEPS, run: STEPS,
  jump: [{ sound: 'jump', frame: 2, preset: 'Big leap' }, { sound: 'land-thud', frame: 6, preset: 'Armoured', volume: 0.7 }],
  attack: [{ sound: 'sword-slash', frame: 3, preset: 'Heavy blade' }],
  hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab' }],
  die: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 1 }, { sound: 'land-thud', frame: 5, preset: 'Armoured', volume: 1 }],
  block: [{ sound: 'metal-hit', frame: 1, preset: 'Sword clash', volume: 0.7 }],
};

/**
 * Returns the Hero as a studio sprite (`loadout-sprite`, docs/studio.md 2.3): the library body with heroFigure() at the defaults, every one of the Hero's nine clips baked into keys, his sounds, sliders for height, build and head, and his weapon, headgear and cape as parts. A new object every call, plain JSON.
 * No arguments.
 */
export function hero() {
  const table = {};
  for (const name of HERO_CLIPS) {
    const c = H.clipsFor([name])[name];
    table[name] = { label: name[0].toUpperCase() + name.slice(1), frames: c.frames, fps: Math.round(c.fps({ speed: 0.5 }) / 1.05), loop: c.loop, ...(HERO_SOUNDS[name] ? { sounds: HERO_SOUNDS[name].map((x) => ({ ...x })) } : {}) };
  }
  const figure = heroFigure();
  const slider = (key, label, lo, hi) => ({ key, label, lo, hi, min: 0, max: 1, default: HERO_SETTINGS[key], sets: key });
  return {
    format: 'loadout-sprite', version: 1, id: 'my-hero', name: 'Hero',
    blurb: 'A brave adventurer from the library, ready to change: every animation can be posed by hand.',
    meta: { type: 'character', role: 'characters/player', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['knight', 'hero', 'warrior', 'adventurer', 'player', 'sword', 'armor', 'fighter'], license: 'draft' },
    body: { library: 'humanoid', figure },
    size: [...H.SIZE], pivot: [...H.PIVOT], grounded: true,
    colours: { skin: HERO_SETTINGS.skin, hair: HERO_SETTINGS.hair, outfit: HERO_SETTINGS.outfit, trim: HERO_SETTINGS.trim, metal: HERO_SETTINGS.metal },
    controls: [{ key: 'speed', standard: 'speed' }, slider('height', 'Height', 'Short', 'Tall'), slider('build', 'Build', 'Slim', 'Stocky'), slider('head', 'Head', 'Small', 'Big')],
    parts: { held: { label: 'Weapon', default: true }, headgear: { label: 'Headgear', default: true }, cape: { label: 'Cape', default: true } },
    clips: bakeClips(figure, table),
    preview: 'walk',
    made: { in: 'studio', from: 'library:knight' },
  };
}
