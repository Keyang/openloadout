// A side-view person drawn from a definition, on the shared humanoid rig (rigs/humanoid.js). Added with batch R12
// (rogue-battler, road-bandit) as a module of its own: nothing in rigs/humanoid.js was changed.
//
// The rig is the code and a sprite is choices (docs/architecture.md, Contract 13). A sprite file on this module holds a
// definition and three lines of wiring:
//
//   const rogue = (p) => ({ body: {...}, stance: 'crouched', moves: { attack: 'stab' }, look: {...}, held: {...}, ... });
//   sockets: (clip, t, p) => F.sockets(clip, t, rogue(p)),
//   render: (g, { clip, t, p }) => F.render(g, clip, t, rogue(p)),
//
//   frame(clip, t, def)      everything one frame is drawn from: the pose, the measurements, what is held and shown
//   render(g, clip, t, def)  paints the frame: body, parts in their layers, white flash, outline, then light
//   sockets(clip, t, def)    the attach points of the frame (hand, offhand, head, back, feet, and muzzle when it throws)
//
// The definition (every field optional; colours are hex strings):
//   body      { height, build, head }  0..1, as dims() of the rig takes them
//   stance    one of STANCES: how the body is carried in every clip ('upright', 'crouched', 'slouched')
//   motion    { bounce, stride }  0..1
//   moves     { clip name: pose name }: the pose a clip is drawn with when it is not the pose of its own name; a name of
//             the rig's POSES or one of MOVES ('stab', 'throw', 'toss', 'steal'). An `attack` with nothing held is a 'punch'
//   look      { skin, top, bottom, boots, bareArms }  as draw() of the rig takes them
//   hair      { style (one of the rig's HAIR_STYLES), colour }
//   held      { kind (a key of HELD or 'none'), length (1 = standard), angle (degrees tipped forward), metal, wood, hilt, cord }
//   headgear  { kind (one of HEADGEAR or 'none'), size (1 = standard), colour, band }
//   mask      { colour, drape }  a face cloth worn whatever the headgear (a bandit's kerchief)
//   scarf     { kind ('short', 'long' or 'none'), length (1 = standard), colour }
//   belt      { colour, buckle }
//   coat      { colour, belt, ragged, length }  the skirt of a coat below the waist (tunic() of the rig)
//   pack      { kind (one of PACKS or 'none'), size (1 = standard), colour, trim, leather, fletching, shaft }
//   thrown    { metal, hilt }  the small knife of the 'throw' and 'toss' moves
//   loot      { colour, tie, glint }  the coin bag of the 'steal' move
//
// Every part is also exported as a drawing function of its own (scarf, scarfWrap, bandana, mask, wideHat, belt, cutlass,
// claws, sling, lootSack, quiver, coinBag, throwingKnife, speedLines), for a sprite that wires the rig's hooks itself;
// clothRamp() and apart() are the two colour rules a definition leans on.
// Angles use the rig convention: 0 = down, PI/2 = forward (right), PI = up, negative = backward.

import { lerp, clamp, keys, pulse, wave, reach, TAU, PI } from '../engine/motion.js';
import { ramp, tone, brightness, INK } from '../engine/color.js';
import { capsuleIn, ellipseIn, polyIn } from '../engine/surface.js';
import { twinkle } from '../engine/fx.js';
import { bandTone } from '../engine/tones.js';
import { blendKeys } from './keypose.js';
import * as H from './humanoid.js';

const [W, FRAME_H] = H.SIZE;
const paintOf = (c, fallback) => (typeof c === 'string' ? ramp(c) : c ?? ramp(fallback));

/**
 * Returns the ramp cloth of a colour is painted with: a dark cloth (brightness under 0.4) carries its form with its light and base tones, because its shadow tone is as dark as the outline.
 * Arguments: colour (a hex string, or a ramp, which is returned as it is).
 */
export function clothRamp(colour) {
  if (typeof colour !== 'string') return colour;
  const c = ramp(colour);
  return brightness(colour) < 0.4 ? { isRamp: true, light: c.light, base: c.light, dark: c.base, deep: c.dark } : c;
}

/**
 * Returns a colour that can be told from the colours lying next to it by how light it is: the colour itself when it differs from each of them in brightness by enough, otherwise the nearest lighter or darker tone of it that does.
 * Arguments: colour (hex), from (what it lies against: a hex, a list of them, or a list of [hex, least] pairs where one neighbour needs more room than another), least (the smallest difference in brightness, 0 to 1, that is left alone; default 0.15).
 */
export function apart(colour, from, least = 0.15) {
  const others = (Array.isArray(from) ? from : [from]).map((f) => (Array.isArray(f) ? [brightness(f[0]), f[1]] : [brightness(f), least]));
  const spare = (c) => Math.min(...others.map(([b, room]) => Math.abs(brightness(c) - b) - room));      // 0 or more: far enough from every neighbour
  let best = colour;
  for (let step = 0; step <= 8; step++) for (const way of step ? [1, -1] : [1]) {
    const c = step ? tone(colour, way * step * 0.15) : colour;
    if (spare(c) >= 0) return c;
    if (spare(c) > spare(best) + 1e-9) best = c;
  }
  return best;
}

// ---- what can be held ------------------------------------------------------------------------------------------------

/**
 * The things a figure can hold, by the name a sprite's weapon choice uses: kind (what is drawn), length / back / pad in pixels as the rig's ITEMS, pair (one in each hand), rest (the angle it is carried at), rest2 (the angle of the one in the far hand), toss (it can be thrown up and caught).
 * No arguments: a frozen object. Every other kind the rig's drawItem() knows (sword, axe, spear, staff, gun, dagger) is accepted too, carried at the rig's own angle.
 */
export const HELD = Object.freeze({
  daggers: Object.freeze({ kind: 'dagger', length: 7.5, back: 1.5, pad: 1.5, pair: true, rest: 2.05, rest2: 1.25, toss: true }),
  'short sword': Object.freeze({ kind: 'sword', length: 11, back: 1.5, pad: 1, rest: 2.2, toss: true }),
  claws: Object.freeze({ kind: 'claws', length: 5.5, back: 0, pad: 2.5, pair: true, rest: 1.95, rest2: 1.2 }),
  club: Object.freeze({ kind: 'club', length: 11, back: 1.5, pad: 3, rest: 1.15 }),
  cutlass: Object.freeze({ kind: 'cutlass', length: 12, back: 2, pad: 2.5, rest: 2.25 }),
  sling: Object.freeze({ kind: 'sling', length: 6, back: 0, pad: 2.5, rest: 2.5, hangs: true }),
});

/**
 * Returns what a held thing is for a pose and for drawing: { name, kind, length, back, pad, pair, rest, rest2, toss, hangs }, or null when nothing is held.
 * Arguments: name (a key of HELD, a kind of the rig's drawItem(), or 'none'), scale (the length setting, 1 = standard).
 */
export function heldSize(name, scale = 1) {
  const own = HELD[name];
  if (own) return { name, ...own, length: own.length * scale };
  const std = H.itemSizeOf(name, scale);
  return std ? { name, kind: name, ...std, rest: 2.5 } : null;
}

/**
 * Draws a cutlass from an attach point: a curved blade that widens toward its tip, a cross-guard and a knuckle bow.
 * Arguments: g (the Surface), at ({ x, y, angle }: the hand and the way the blade points), o: { length (hand to tip), metal (a colour or a ramp), hilt (a colour) }.
 */
export function cutlass(g, at, o = {}) {
  const a = at.angle, len = o.length ?? 12, metal = paintOf(o.metal, '#c2c9d6'), hilt = o.hilt ?? '#f2c230';
  const to = (dist, turn = 0, from = [at.x, at.y]) => reach(from[0], from[1], a + turn, dist);
  const [gx, gy] = to(1.5), mid = to(len * 0.58), end = to(len);
  const [mx, my] = to(0.6, -PI / 2, mid), [tx, ty] = to(1.7, PI / 2, end);      // the belly swells to the edge, the point sweeps up to the back
  g.blob([capsuleIn(gx, gy, mx, my, 0.9, 1.7), capsuleIn(mx, my, tx, ty, 1.7, 0.6)], metal, { light: 1 });
  g.dot(tx, ty, metal.light);
  const [ax, ay] = to(1.8, PI / 2, [gx, gy]), [bx, by] = to(2.3, -PI / 2, [gx, gy]);
  g.line(ax, ay, bx, by, hilt);
  const pommel = to(1.6, PI), [qx, qy] = to(2.3, -PI / 2, pommel);
  g.line(bx, by, qx, qy, hilt);
  g.dot(pommel[0], pommel[1], hilt);
}

/**
 * Draws a set of claws on a fist: three thin blades that fan out from the knuckles the way the hand points.
 * Arguments: g (the Surface), at ({ x, y, angle }: the hand), o: { length (hand to the middle tip), metal (a colour or a ramp) }.
 */
export function claws(g, at, o = {}) {
  const a = at.angle, len = o.length ?? 5.5, metal = paintOf(o.metal, '#c2c9d6');
  for (const i of [-1, 1, 0]) {
    const [sx, sy] = reach(at.x, at.y, a + i * PI / 2, 1.4 * Math.abs(i));
    const [tx, ty] = reach(sx, sy, a + i * 0.3, len - 0.8 * Math.abs(i));
    g.line(sx, sy, tx, ty, i ? metal.base : metal.light);
  }
}

/**
 * Draws a sling from the hand that holds its cords: two cords down to a leather pouch with a stone in it; it hangs at rest and flies out the way the hand points when it is swung.
 * Arguments: g (the Surface), at ({ x, y, angle }: the hand), o: { length (hand to the stone), fling (0 hanging straight down .. 1 flung out along at.angle), cord, pouch, stone (colours), floor (the ground row: it never hangs into it) }.
 */
export function sling(g, at, o = {}) {
  const fling = clamp(o.fling ?? 0), a = at.angle * fling;
  let len = o.length ?? 9;
  const floor = o.floor ?? H.GROUND;
  if (Math.cos(a) > 0) len = Math.min(len, Math.max(1, (floor - 3.4 - at.y) / Math.cos(a)));
  const end = reach(at.x, at.y, a, len), ex = end[0], ey = Math.min(end[1], floor - 3.4), pouch = paintOf(o.pouch, '#9a6a3e');
  for (const side of [-1, 1]) {
    const [px, py] = reach(ex, ey, a + side * PI / 2, 1);
    g.line(at.x, at.y, px, py, o.cord ?? '#f0ead8');
  }
  const cx = Math.round(ex), cy = Math.round(ey);
  g.ellipse(cx, cy, 3, 2.4, pouch);
  g.rect(cx - 1, cy - 2, 2, 2, paintOf(o.stone, '#a8a4a0'), { shade: 0 });
}

/**
 * Draws anything a figure holds from an attach point: a cutlass, claws or a sling here, every other kind through the rig's drawItem().
 * Arguments: g (the Surface), at ({ x, y, angle }, for example the hand socket), item ({ kind, length, metal, wood, hilt, cord, fling, floor }).
 */
export function drawHeld(g, at, item) {
  if (item.kind === 'cutlass') cutlass(g, at, item);
  else if (item.kind === 'claws') claws(g, at, item);
  else if (item.kind === 'sling') sling(g, at, { ...item, pouch: item.wood });
  else H.drawItem(g, at, item);
}

/**
 * Draws a small throwing knife: a short bright blade with a dark grip, pointing along an angle.
 * Arguments: g (the Surface), at ({ x, y, angle }: the middle of the knife and the way it points), o: { length (default 5), metal (a colour or a ramp), hilt (a colour) }.
 */
export function throwingKnife(g, at, o = {}) {
  const len = o.length ?? 5, metal = paintOf(o.metal, '#c2c9d6');
  const [bx, by] = reach(at.x, at.y, at.angle + PI, len / 2), [tx, ty] = reach(at.x, at.y, at.angle, len / 2), [hx, hy] = reach(bx, by, at.angle, 1.4);
  g.line(bx, by, tx, ty, metal.base);
  g.dot(tx, ty, metal.light);
  g.line(bx, by, hx, hy, o.hilt ?? '#9a6a3e');
}

/**
 * Draws a small coin bag hanging from a hand: a round pouch, a tied neck, and a coin showing at its mouth.
 * Arguments: g (the Surface), at ({ x, y }: the hand that holds it), o: { colour (the cloth), tie (the cord), coin (the coin at its mouth), size (1 = standard), floor (the ground row) }.
 */
export function coinBag(g, at, o = {}) {
  const s = o.size ?? 1, cloth = paintOf(o.colour, '#c9a06a'), floor = o.floor ?? H.GROUND;
  const cx = Math.round(at.x) + 0.5, cy = Math.min(Math.round(at.y) + 4 * s, floor - 1 - 3 * s);
  g.blob([ellipseIn(cx, cy, 3 * s, 2.9 * s), polyIn([[cx - 1.6, cy - 2 * s], [cx + 1.6, cy - 2 * s], [cx + 2.2, cy - 4.2 * s], [cx - 2.2, cy - 4.2 * s]])], cloth);
  g.rect(cx - 1.5, Math.round(cy - 2.6 * s), 3, 1, o.tie ?? '#9a6a3e', { shade: 0 });
  g.rect(cx - 0.5, Math.round(cy - 4.2 * s), 2, 1, o.coin ?? '#f2c230', { shade: 0 });
}

/**
 * Draws two short white speed lines behind a point that is moving fast, along the way it moved; nothing when it moved less than `least` pixels.
 * Arguments: g (the Surface), from ([x, y]: where the point was), to ([x, y]: where it is), o: { colour (default white), least (default 4), gap (half the distance between the lines, default 2.2) }. Call AFTER g.outline(); the lines never touch the frame edge and never cover a drawn pixel (it reads the picture back to see what is drawn, so it suits the pixel style only).
 */
export function speedLines(g, from, to, o = {}) {
  const dx = to[0] - from[0], dy = to[1] - from[1], far = Math.hypot(dx, dy);
  if (far < (o.least ?? 4)) return false;
  const ux = dx / far, uy = dy / far, gap = o.gap ?? 2.2, colour = o.colour ?? '#ffffff';
  const put = (x, y) => { x = Math.floor(x); y = Math.floor(y); if (x > 1 && y > 1 && x < g.w - 2 && y < g.h - 2 && !g.get(x, y)) g.dot(x, y, colour); };
  for (const [side, a, b] of [[-gap, 0.25, 0.85], [gap, 0.1, 0.7]]) {
    for (let k = a * far; k <= b * far; k += 0.5) put(from[0] + ux * k - uy * side, from[1] + uy * k + ux * side);
  }
  return true;
}

// ---- what can be worn ------------------------------------------------------------------------------------------------

/** Across the body at a joint: the unit vector that points out of the back (to the left when standing, into the ground when lying on the back). */
function backOf(J) {
  const sx = J.neck[0] - J.hip[0], sy = J.neck[1] - J.hip[1], n = Math.hypot(sx, sy) || 1;
  return [sy / n, -sx / n];
}

/**
 * Draws the tail of a scarf, for the `behind` hook: a ribbon three pixels wide that hangs from the back of the neck, streams out behind the body, and is drawn shorter when the frame or the ground is in its way.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour, length (pixels; 0 draws nothing), flow (0 hanging .. 1 streaming straight back), wave (list of -1..1 from the neck to the tip: how far each part is thrown out of line; default [P.sway]) }.
 */
export function scarf(g, J, P, d, opt = {}) {
  const length = opt.length ?? 10, f = clamp(opt.flow ?? 0.3);
  if (!(length > 0)) return;
  const thrown = opt.wave && opt.wave.length ? opt.wave : [P.sway ?? 0];
  const [bx, by] = backOf(J);
  const ax = J.neck[0] + bx * d.chestR * 0.55, ay = J.neck[1] + by * d.chestR * 0.55 + 0.8;
  const a = -lerp(0.4, 1.42, f), amp = 0.8 + 1.7 * f, N = 6, sag = (1 - f) * 0.3;
  const at = (k, L) => {
    const u = k * (thrown.length - 1), i = Math.min(thrown.length - 1, Math.floor(u)), j = Math.min(thrown.length - 1, i + 1);
    const off = amp * k * lerp(thrown[i], thrown[j], u - i);
    return [ax + Math.sin(a) * L * k + Math.cos(a) * off, ay + Math.cos(a) * L * k - Math.sin(a) * off + sag * L * k * k];
  };
  const floor = J.gy - 1.6;
  const fits = (L) => { for (let i = 1; i <= N; i++) { const [x, y] = at(i / N, L); if (x < 3.5 || x > W - 3.5 || y < 3.5 || y > floor) return false; } return true; };
  let L = length;
  while (L > 2 && !fits(L)) L -= 1;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const [x0, y0] = at(i / N, L), [x1, y1] = at((i + 1) / N, L);
    parts.push(capsuleIn(x0, y0, x1, y1, i ? 1.5 : 1.2, i === N - 1 ? 1.2 : 1.5));
  }
  const keep = (px, py) => px > 2 && px < W - 2 && py > 2 && py < J.gy;
  const end = at(1, L);
  g.fill(Math.min(ax, end[0]) - 6, Math.min(ay, end[1]) - 6, Math.max(ax, end[0]) + 6, Math.max(ay, end[1]) + 6, (px, py) => keep(px, py) && parts.some((s) => s(px, py)), clothRamp(opt.colour ?? '#5a5f7a'));
}

/**
 * Draws the part of a scarf that goes round the neck, for the `torso` hook: a roll of cloth across the top of the chest, a little wider than the neck, that turns with the body.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour }.
 */
export function scarfWrap(g, J, P, d, opt = {}) {
  const [bx, by] = backOf(J), half = d.chestR * 0.8 + 0.4, cx = J.neck[0] + 0.3, cy = J.neck[1] + 0.9;
  g.capsule(cx + bx * half, cy + by * half, cx - bx * (half + 0.6), cy - by * (half + 0.6), 1.7, 1.7, clothRamp(opt.colour ?? '#5a5f7a'), { clip: (px, py) => py < J.gy });
}

/**
 * Draws a bandana, for the `head` hook: a band of cloth across the brow with the hair showing above it, knotted behind the head with two short tails that trail the body.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour, size (1 = standard: a deeper band and longer tails; 0.5 to 1.8) }.
 */
export function bandana(g, J, P, d, opt = {}) {
  const c = clothRamp(opt.colour ?? '#2f8f9d'), size = opt.size ?? 1;
  const [hx, hy] = J.head, R = d.headR, sway = P.sway ?? 0;
  const deep = clamp(Math.round(1.2 + size), 2, 3), y1 = Math.floor(hy - 0.5), y0 = y1 - deep, tail = 2.5 + 2.4 * size;
  const inHead = (px, py) => ((px - hx) / (R + 0.9)) ** 2 + ((py - hy) / (R + 0.8)) ** 2 <= 1;
  const kx = hx - R - 0.2, ky = (y0 + y1) / 2;
  g.capsule(kx, ky, kx - 2.6 - sway * 1.4, ky + tail * 0.75, 1.1, 0.7, c);
  g.capsule(kx, ky, kx - 1.2 - sway, ky + tail, 1.1, 0.7, c);
  g.fill(hx - R - 2, y0, hx + R + 2, y1, (px, py) => inHead(px, py) && py >= y0 && py < y1, c, { shade: 0 });
  g.fill(hx - R - 2, y0, hx + R + 2, y1, (px, py) => inHead(px, py) && py >= y1 - 1 && py < y1, c.dark, { shade: 0 });      // the fold along its lower edge
  g.rect(Math.round(kx) - 1, Math.round(ky) - 1, 2, 2, c.dark, { shade: 0 });                                             // the knot
}

/**
 * Draws a cloth mask, for the `head` hook: cloth over the nose, mouth and chin with the eye left clear, tied in a knot behind the head; with a drape it hangs in a point over the neck like a kerchief.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour, size (1 = standard; under 0.8 it sits below the nose, over 1 it hangs lower; 0.5 to 1.8), drape (pixels it hangs below the chin; default from size) }.
 */
export function mask(g, J, P, d, opt = {}) {
  const c = clothRamp(opt.colour ?? '#5a5f7a'), size = opt.size ?? 1;
  const [hx, hy] = J.head, R = d.headR;
  const top = Math.floor(hy - 0.5) + (size < 0.8 ? 3 : 2), chin = hy + R * 0.95, drape = opt.drape ?? Math.max(0, Math.round((size - 1) * 5));
  const inHead = (px, py) => ((px - hx) / (R + 0.5)) ** 2 + ((py - hy) / (R * 0.95 + 0.5)) ** 2 <= 1;
  const front = hx - R * 0.3;
  const parts = [(px, py) => inHead(px, py) && py >= top && px >= front];
  if (drape > 0) parts.push(polyIn([[front, chin - 1.5], [hx + R * 0.9, chin - 2], [hx + R * 0.35, chin + drape], [front + 0.5, chin + drape * 0.4]]));
  // the tie: one dark row back over the hair to a knot behind the head
  g.fill(hx - R - 2, top, hx, top + 1, (px, py) => inHead(px, py) && py >= top && py < top + 1 && px < front, c.dark, { shade: 0 });
  g.rect(Math.round(hx - R) - 1, top - 1 + (size > 1.3 ? 0 : 1), 2, size > 1.3 ? 3 : 2, c, { shade: 0 });
  g.blob(parts, c);
}

/** Returns how far a wideHat() of a size rises above the top of the head, in pixels, for fit()'s `points`. Arguments: size (1 = standard). */
export const wideHatRise = (size = 1) => 1.4 + 1.6 * size;

/** Returns how far the brim of a wideHat() of a size reaches from the middle of the head, in pixels, for fit()'s `points`. Arguments: d (dims), size (1 = standard). */
export const wideHatReach = (d, size = 1) => d.headR + 2.6 + 1.5 * size;

/**
 * Draws a wide-brimmed hat, for the `head` hook: a low crown with a band round it over a broad brim that droops at both ends and shades the brow.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour (the felt), band (the colour of its band; left out: the felt's shadow tone), size (1 = standard: a wider brim and a taller crown; 0.5 to 1.8) }.
 */
export function wideHat(g, J, P, d, opt = {}) {
  const c = clothRamp(opt.colour ?? '#9a6a3e'), size = opt.size ?? 1;
  const [hx, hy] = J.head, R = d.headR;
  const yb = Math.round(hy - R * 0.52), top = hy - R - wideHatRise(size) + 0.5, reachX = wideHatReach(d, size) - 0.6, cw = R * 0.92;
  const crown = polyIn([[hx - cw, yb], [hx - cw * 0.78, top + 1], [hx - cw * 0.45, top], [hx + cw * 0.5, top], [hx + cw * 0.8, top + 1], [hx + cw, yb]]);
  const brim = [capsuleIn(hx - 0.5, yb, hx - reachX, yb + 0.9, 1.05, 0.9), capsuleIn(hx - 0.5, yb, hx + reachX + 1, yb + 0.9, 1.05, 0.9)];
  g.blob([crown, ...brim], c);
  const band = opt.band ? paintOf(opt.band).base : c.dark;
  g.fill(hx - R - 1, yb - 3, hx + R + 1, yb, (px, py) => crown(px, py) && py >= yb - 2 && py < yb - 1, band, { shade: 0 });
}

/** The headgear wear() can draw: the cloth kinds of this module and the rig's metal ones. No arguments: a list. */
export const HEADGEAR = Object.freeze(['hood', 'bandana', 'mask', 'wide hat', ...H.HEADGEAR_KINDS]);

/**
 * Draws headgear of any kind on the head, upright, for the `head` hook: a hood, a bandana, a mask or a wide hat in cloth, or the rig's helmet, crown and horned cap in metal.
 * Arguments: g, J, P, d (as the hook receives them), o: { kind (one of HEADGEAR; anything else draws nothing), size (1 = standard), colour (the cloth, or the metal), band (a wide hat's band; a helmet's crest) }.
 */
export function wear(g, J, P, d, o = {}) {
  const size = o.size ?? 1;
  if (o.kind === 'hood') H.hood(g, J, P, d, { colour: o.colour, size: lerp(0.55, 1.1, clamp((size - 0.5) / 1.3)) });
  else if (o.kind === 'bandana') bandana(g, J, P, d, o);
  else if (o.kind === 'mask') mask(g, J, P, d, o);
  else if (o.kind === 'wide hat') wideHat(g, J, P, d, o);
  else if (H.HEADGEAR_KINDS.includes(o.kind)) H.headgear(g, J, P, d, { kind: o.kind, size, metal: o.colour, trim: o.band });
}

/**
 * Returns the far points of headgear on an upright head, for fit()'s `points`: [above the head, behind the head] in pixels from the middle of the head, [0, 0] for none.
 * Arguments: kind (one of HEADGEAR), size (1 = standard), d (dims).
 */
export function wearReach(kind, size = 1, d = H.dims()) {
  if (kind === 'hood') return [1.6, H.hoodReach(d, lerp(0.55, 1.1, clamp((size - 0.5) / 1.3))) - d.headR];
  if (kind === 'bandana') return [0.9, 3.4 + 1.4 * size];
  if (kind === 'mask') return [0, 2];
  if (kind === 'wide hat') return [wideHatRise(size), wideHatReach(d, size) - d.headR + 1];
  return [H.headgearRise(kind, size), 0];
}

/**
 * Draws a belt across the hips, for the `torso` hook: one row of leather with a buckle at the front, which turns with the body when it lies down.
 * Arguments: g, J, P, d (as the hook receives them), opt { colour (the leather: its shadow tone is used, or a lighter tone of it where the shadow tone would merge with the cloth under the belt: engine/tones.js, bandTone), buckle (a colour; left out: no buckle) }.
 */
export function belt(g, J, P, d, opt = {}) {
  const c = paintOf(opt.colour, '#5a5f7a'), [bx, by] = backOf(J), half = Math.round(d.hipR);
  const cx = Math.round(J.hip[0]) - by * 1.5, cy = Math.round(J.hip[1]) - 1.5 + bx * 1.5 + (P.lie > 0.5 ? 1.5 : 0);
  const clip = (px, py) => py < J.gy - 1;
  // what is already drawn where the belt will lie: the cloth it has to stand clear of
  const under = [];
  for (let k = -(half - 1); k <= half; k++) under.push(g.get(Math.floor(cx + bx * k), Math.floor(cy + by * k)));
  g.limb(cx + bx * half, cy + by * half, cx - bx * (half - 1), cy - by * (half - 1), 1, bandTone(c, under), { shade: 0, clip });
  if (opt.buckle) g.limb(cx - bx * 1.5, cy - by * 1.5, cx - bx * 1.5, cy - by * 1.5, 1, opt.buckle, { shade: 0, clip });
}

/** The packs pack() can draw. No arguments: a list. */
export const PACKS = Object.freeze(['loot sack', 'quiver']);

/**
 * Draws a loot sack slung over the back from an attach point: a bulging sack with a tied neck and a patch, resting against the shoulders.
 * Arguments: g (the Surface), at ({ x, y }: the back socket, between the shoulders), o: { size (1 = standard), colour (the sacking), trim (the tie and the patch), back ([x, y]: the way out of the back, default to the left), floor (the ground row) }.
 */
export function lootSack(g, at, o = {}) {
  const s = o.size ?? 1, cloth = paintOf(o.colour, '#c9a06a'), [bx, by] = o.back ?? [-1, 0], floor = o.floor ?? H.GROUND;
  const rx = 4.2 * s, ry = 5 * s;
  const cx = Math.round(at.x + bx * (rx + 1.2) - by * 2), cy = Math.min(Math.round(at.y + by * (ry + 1) + 3.4 * s + Math.abs(bx) * 0.6), floor - ry - 0.5);
  const neck = polyIn([[cx + rx * 0.2, cy - ry * 0.7], [cx + rx * 0.95, cy - ry * 0.6], [cx + rx * 1.15, cy - ry * 1.3], [cx + rx * 0.4, cy - ry * 1.25]]);
  g.blob([ellipseIn(cx, cy, rx, ry), neck], cloth, { shade: s > 1.1 ? 2 : 1, clip: (px, py) => py < floor });
  const trim = paintOf(o.trim, '#9a6a3e');
  g.limb(cx + rx * 0.3, cy - ry * 0.78, cx + rx * 0.95, cy - ry * 0.68, 1, trim.dark, { shade: 0 });
  g.rect(cx - Math.round(rx * 0.5), cy, 2, 2, trim.base, { shade: 0 });
}

/**
 * Draws a quiver on the back from an attach point: a leather tube that slants across the back with three fletched arrows standing out of it behind the shoulder.
 * Arguments: g (the Surface), at ({ x, y }: the back socket), o: { size (1 = standard: a longer quiver and more of the arrows), colour (the leather), trim (the fletching), shaft (the arrow shafts), back ([x, y]: the way out of the back), floor (the ground row) }.
 */
export function quiver(g, at, o = {}) {
  const s = o.size ?? 1, leather = paintOf(o.colour, '#9a6a3e'), [bx, by] = o.back ?? [-1, 0], floor = o.floor ?? H.GROUND;
  const up = [-by, bx];                                               // up the spine
  const pt = (out, along) => [at.x + bx * out + up[0] * along, Math.min(at.y + by * out + up[1] * along, floor - 2)];
  const foot = pt(2.2, -7 * s), mouth = pt(4.6, 1.5 + 1.5 * s);
  const clip = (px, py) => py < floor;
  for (const [i, k] of [[-1, 0.8], [1, 0.9], [0, 1]]) {
    const tip = pt(4.9 + i * 1.5 + 0.5 * k, 1.5 + 1.5 * s + (2.6 + 1.6 * s) * k);
    g.line(mouth[0] + bx * i * 0.6, mouth[1] + by * i * 0.6, tip[0], tip[1], o.shaft ?? '#9a6a3e');
    if (tip[1] < floor - 1) g.dot(tip[0], tip[1], paintOf(o.trim, '#f0ead8').base);
  }
  g.capsule(foot[0], foot[1], mouth[0], mouth[1], 1.7, 2.1, leather, { clip });
  g.limb(mouth[0] - by * 1.5 - bx, mouth[1] + bx * 1.5 - by, mouth[0] + by * 1.5 - bx, mouth[1] - bx * 1.5 - by, 1, leather.dark, { shade: 0, clip });
}

/**
 * Draws a pack of any kind on the back, for the `behind` hook: a loot sack or a quiver.
 * Arguments: g, J, P, d (as the hook receives them), o: { kind (one of PACKS; anything else draws nothing), size (1 = standard), colour and trim (a sack's cloth, and its tie and patch), leather, fletching and shaft (a quiver's tube, and its arrows) }.
 */
export function pack(g, J, P, d, o = {}) {
  const [bx, by] = backOf(J), at = { x: J.neck[0] + bx * (d.chestR - 1), y: J.neck[1] + 1 + by * (d.chestR - 1) };
  if (o.kind === 'loot sack') lootSack(g, at, { size: o.size, colour: o.colour, trim: o.trim, back: [bx, by], floor: J.gy });
  else if (o.kind === 'quiver') quiver(g, at, { size: o.size, colour: o.leather, trim: o.fletching, shaft: o.shaft, back: [bx, by], floor: J.gy });
}

// ---- how the body is carried, and the moves the rig's POSES do not have ----------------------------------------------

/**
 * The stances a figure can be carried in, each a set of offsets laid over every pose: lean, headTilt, crouch, and how the near and the far arm are held while nothing else moves them.
 * No arguments: a frozen object keyed by name ('upright', 'crouched': low and forward with the hands up, a rogue; 'slouched': heavy, the head hanging forward, a thug). `dash: true` turns a run into a low dash with both arms swept back.
 */
export const STANCES = Object.freeze({
  upright: Object.freeze({ lean: 0, headTilt: 0, crouch: 0, near: [0, 0], far: [0, 0] }),
  crouched: Object.freeze({ lean: 0.17, headTilt: -0.15, crouch: 1.6, near: [0.5, 1.15], far: [0.7, -0.2], dash: true }),
  slouched: Object.freeze({ lean: 0.11, headTilt: 0.07, crouch: 0.8, near: [0.06, 0.2], far: [0.12, 0.25] }),
});

/** The moves move() knows, beside the rig's POSES. No arguments: a list. */
export const MOVES = Object.freeze(['stab', 'throw', 'toss', 'steal']);

/**
 * Returns the pose of a move the rig's pose() does not have, at phase t (0..1), as pose() returns it, with flags of its own for the renderer.
 *   stab   (8 frames) two fast jabs: wind up on 1 and 2, the near hand strikes on 3, the far hand (m.pair) or the near hand again on 5
 *   throw  (6 frames) the far hand flicks a knife from the hip: 0 coiled, 1 the arm is out level and the knife leaves (P.fire), 2 follow through, 5 idle
 *   toss   (8 frames, loops) the near hand flicks what it holds up into the air and catches it: in the air on 3, 4 and 5 (P.air = 0..1)
 *   steal  (8 frames) coil on 1, dart forward on 2, snatch with the far hand on 3, hop back on 5 with the prize held up (P.prize), land on 6
 * Arguments: name (one of MOVES), t, m ({ bounce, stride, hold, pair } as pose() takes them), d (dims).
 * Flags: free (0..1, or [near, far]: how far each arm is from where the stance carries it), level2 (0..1: the far hand's thing points forward), fire, knife ('hand' or 'air'), air, prize, glint.
 */
export function move(name, t, m = {}, d = H.dims()) {
  const P = H.pose('idle', 0, m, d), k = d.leg / 11.5;
  const fa = P.armF.a, fe = P.armF.e, ba = P.armB.a, be = P.armB.e, item = P.item;
  P.blink = false;
  if (name === 'stab') {
    // one hand is drawn back to the hip while the other is out: the wind-up (1, 2), the first strike (3), the change (4), the second (5)
    const wind = keys(t, [[0, 0], [0.143, 0.7], [0.286, 1], [0.36, 0.5], [0.429, 0], [1, 0]]);
    const jab1 = keys(t, [[0, 0], [0.33, 0], [0.429, 1], [0.5, 0.5], [0.571, 0], [1, 0]]);
    const change = keys(t, [[0, 0], [0.429, 0], [0.5, 0.5], [0.571, 1], [0.64, 0.5], [0.714, 0], [1, 0]]);
    const jab2 = keys(t, [[0, 0], [0.62, 0], [0.714, 1], [0.8, 0.6], [0.857, 0.2], [1, 0]]);
    const level = keys(t, [[0, 0], [0.143, 0.6], [0.286, 1], [0.75, 1], [0.857, 0.5], [1, 0]]);
    const BACK = [-0.7, 1.15], JAB = [PI / 2 - 0.3, 0.06], GUARD = [1.15, 0.25];
    const to = (A, a0, e0, list) => { A.a = a0; A.e = e0; for (const [w, [a1, e1]] of list) { A.a += w * (a1 - a0); A.e += w * (e1 - e0); } };
    if (m.pair) {
      // a thing in each hand (or two fists): the near hand strikes first, the far hand second
      to(P.armF, fa, fe, [[wind, BACK], [jab1, JAB], [change, BACK], [jab2, BACK]]);
      to(P.armB, ba, be, [[wind, GUARD], [jab1, BACK], [change, BACK], [jab2, JAB]]);
    } else {
      // one blade: it strikes twice, and the empty hand guards while it is drawn back
      to(P.armF, fa, fe, [[wind, BACK], [jab1, JAB], [change, BACK], [jab2, JAB]]);
      to(P.armB, ba, be, [[wind, GUARD], [jab1, BACK], [change, GUARD], [jab2, BACK]]);
    }
    P.item = lerp(item, PI / 2 + (m.hold ?? 0) * 0.3, level);
    P.level2 = level;
    P.rootX = k * keys(t, [[0, 0], [0.286, -2], [0.429, 4.5], [0.571, 3.4], [0.714, 6], [0.857, 2.2], [1, 0]]);
    P.lean = -0.16 * wind + 0.24 * jab1 + 0.06 * change + 0.27 * jab2;
    P.headTilt = 0.08 * wind - 0.08 * (jab1 + jab2);
    P.crouch = 0.8 * wind + 1.5 * jab1 + 1.1 * change + 1.8 * jab2;
    const step = k * keys(t, [[0, 0], [0.33, 0], [0.429, 5.5], [0.6, 5.5], [0.714, 8], [0.857, 4], [1, 0]]);
    P.footF = { x: 1.5 + step - P.rootX, y: -1.6 * (pulse(clamp((t - 0.33) / 0.1)) + pulse(clamp((t - 0.6) / 0.114)) + pulse(clamp((t - 0.857) / 0.143))) };
    P.footB = { x: -1.5 - P.rootX, y: 0 };
    P.sway = keys(t, [[0, 0], [0.286, -1], [0.45, 1], [0.6, -0.3], [0.72, 1], [1, 0]]);
    P.free = level;
  } else if (name === 'throw') {
    // the far hand does it; the near hand keeps whatever it holds where the stance carries it
    const cock = keys(t, [[0, 1], [0.12, 0.8], [0.2, 0], [1, 0]]);
    const fling = keys(t, [[0, 0], [0.1, 0.2], [0.2, 1], [0.4, 0.85], [0.6, 0.4], [0.8, 0.12], [1, 0]]);
    P.armB.a = keys(t, [[0, -0.85], [0.12, -0.6], [0.2, PI / 2 - 0.1], [0.4, 0.95], [0.6, 0.5], [0.8, ba + 0.3], [1, ba]]);
    P.armB.e = keys(t, [[0, 0.7], [0.2, 0], [0.4, 0.15], [1, be]]);
    P.armF.a = fa + 0.25 * cock - 0.5 * fling;
    P.item = item + 0.15 * fling;
    P.lean = -0.16 * cock + 0.24 * fling;
    P.headTilt = -0.04 * cock - 0.08 * fling;
    P.rootX = -1.4 * cock + 2.6 * fling;
    P.crouch = 1.5 * cock + 1.3 * fling;
    const step = 3.5 * keys(t, [[0, 0], [0.2, 1], [0.6, 1], [1, 0]]);
    P.footF = { x: 1.5 + step - P.rootX, y: -1.4 * (pulse(clamp(t / 0.2)) + pulse(clamp((t - 0.6) / 0.4))) };
    P.footB = { x: -1.5 - P.rootX, y: 0 };
    P.sway = keys(t, [[0, -0.8], [0.2, 1], [0.5, -0.4], [1, 0]]);
    P.fire = t >= 0.15 && t < 0.3;
    P.knife = t < 0.15 ? 'hand' : P.fire ? 'air' : null;
    P.free = [0, keys(t, [[0, 1], [0.6, 1], [0.8, 0.5], [1, 0]])];
  } else if (name === 'toss') {
    const dip = keys(t, [[0, 0], [0.125, 1], [0.25, 0], [1, 0]]);
    const out = keys(t, [[0, 0], [0.125, 0.55], [0.25, 1], [0.75, 1], [0.875, 0.45], [1, 0]]);
    const give = keys(t, [[0, 0], [0.68, 0], [0.75, 1], [0.875, 0.35], [1, 0]]);
    const air = clamp((t - 0.25) / 0.5), high = Math.sin(PI * air);
    P.armF.a = fa + (0.95 - fa) * out - 0.4 * dip - 0.25 * give + 0.25 * keys(t, [[0, 0], [0.2, 0], [0.25, 1], [0.375, 0], [1, 0]]);
    P.armF.e = fe + (0.45 - fe) * out + 0.35 * dip + 0.25 * give;
    P.item = lerp(item, PI, out);
    P.crouch = 1.5 * dip + 1.7 * give + 0.4 * pulse(t);
    P.headTilt = -0.22 * high;                                          // the eyes follow it up
    P.lean = -0.07 * high + 0.05 * give;
    P.sway = wave(t);
    P.blink = t >= 0.86;
    P.air = t > 0.26 && t < 0.74 ? air : null;
    P.out = out;
    P.free = [out, 0];
  } else if (name === 'steal') {
    const coil = keys(t, [[0, 0], [0.143, 1], [0.24, 0.3], [0.286, 0], [1, 0]]);
    const dart = keys(t, [[0, 0], [0.143, -0.16], [0.286, 0.86], [0.429, 1], [0.571, 0.42], [0.714, -0.1], [0.857, 0], [1, 0]]);
    const grab = keys(t, [[0, 0], [0.143, 0], [0.286, 0.65], [0.429, 1], [0.571, 0.3], [0.66, 0], [1, 0]]);
    const show = keys(t, [[0, 0], [0.5, 0], [0.571, 0.45], [0.714, 1], [0.857, 0.92], [0.94, 0.3], [1, 0]]);
    const hop = keys(t, [[0, 0], [0.6, 0], [0.714, 1], [0.857, 0], [1, 0]]);
    const leap = pulse(clamp((t - 0.143) / 0.286));
    const land = keys(t, [[0, 0], [0.75, 0], [0.857, 1], [1, 0]]);
    P.rootX = 8 * dart;
    P.lift = 1.6 * leap + lerp(2.5, 4, m.bounce ?? 0.5) * hop;
    P.lean = -0.12 * coil + 0.36 * grab - 0.15 * show;
    P.headTilt = 0.06 * coil - 0.12 * grab - 0.12 * show;
    P.crouch = 1.8 * coil + 1.8 * grab + 2.2 * land;
    P.armB.a = ba - 0.6 * coil + (PI / 2 + 0.08 - ba) * grab + (1.82 - ba) * show;
    P.armB.e = be + 0.9 * coil - be * grab - be * show;
    P.armF.a = fa + 0.25 * coil - 0.6 * grab - 0.3 * show;                // the weapon hand swings back as the other reaches
    P.armF.e = fe + 0.2 * coil + 0.2 * grab;
    P.footF = { x: 1.5 + 2 * grab + 0.8 * hop, y: -1.2 * hop };
    P.footB = { x: -1.5 - 3 * grab - 0.8 * hop, y: -0.8 * leap - 0.6 * hop };
    P.sway = keys(t, [[0, 0], [0.143, 0.6], [0.36, -1], [0.6, 0.4], [0.714, 1], [0.9, -0.5], [1, 0]]);
    P.prize = show > 0.2;
    P.glint = show > 0.95 ? 2 : show > 0.85 ? 1 : 0;
    P.free = [0, keys(t, [[0, 0], [0.143, 1], [0.857, 1], [1, 0]])];
  }
  return P;
}

/** How far the arms of a rig pose are from where the stance carries them (0 carried .. 1 wholly the pose's own), at phase t. */
function freeOf(pose, t, dash) {
  if (pose === 'attack' || pose === 'punch' || pose === 'thrust') return keys(t, [[0, 0], [0.143, 0.85], [0.286, 1], [0.8, 1], [0.9, 0.5], [1, 0]]);
  if (pose === 'hurt') return keys(t, [[0, 0.7], [0.33, 1], [1, 0]]);
  if (pose === 'jump') return dash ? 0 : keys(t, [[0, 0], [0.18, 0.5], [0.4, 1], [0.6, 1], [0.84, 0.4], [1, 0]]);
  if (pose === 'die') return keys(t, [[0, 0.7], [0.2, 1], [1, 1]]);
  if (pose === 'idle' || pose === 'walk' || pose === 'run') return 0;
  return keys(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
}

/** How a scarf flies in each clip that loops: how far it streams back, how many waves run down it per loop, how hard it whips. */
const FLY = { idle: { flow: 0.15, beats: 1, whip: 1.2 }, walk: { flow: 0.5, beats: 2, whip: 0.8 }, run: { flow: 1, beats: 2, whip: 1 }, toss: { flow: 0.18, beats: 1, whip: 1.2 }, victory: { flow: 0.3, beats: 1, whip: 1.2 }, talk: { flow: 0.15, beats: 1, whip: 1 } };

/** The rig's poses that loop. */
const LOOPS = ['idle', 'walk', 'run', 'victory', 'talk'];

/** The poses whose first frame is already in the middle of the action (the recoil of a hit, the wind-up of a shot), not the idle pose. */
const STARTS_MOVING = ['hurt', 'die', 'shoot', 'throw'];

/**
 * The pose of a clip the definition gives as key poses (the studio, docs/studio.md section 3): def.keys[clip] is a list
 * of keys or { keys, loop }, in the rig's own units (radians, pixels; rigs/humanoid-studio.js converts the studio's
 * degrees). Blended at phase t by rigs/keypose.js over the rest pose (idle at 0, in the stance); null when the clip has none.
 */
function keyedPose(F, t) {
  const own = F.def.keys && Object.hasOwn(F.def.keys, F.clip) ? F.def.keys[F.clip] : null;
  const list = Array.isArray(own) ? own : own?.keys;
  if (!Array.isArray(list) || !list.length) return null;
  const loop = typeof own.loop === 'boolean' ? own.loop : LOOPS.includes(F.name);
  F.rest ??= poseAt({ ...F, clip: 'idle', name: 'idle', def: { ...F.def, keys: undefined } }, 0);
  return blendKeys(list, t, { loop, base: F.rest });
}

/** The pose of a definition's clip at phase t, with its stance, the way its things are carried, and the frame keeping it in. */
function poseAt(F, t) {
  const keyed = keyedPose(F, t);
  if (keyed) return fitPose(F, keyed);                                   // what a person keyed is what is drawn: no stance or carry laid over it
  const { d, m, held, stance, name } = F;
  const own = MOVES.includes(name);
  const P = own ? move(name, t, m, d) : H.pose(name, t, m, d);
  // the rig's one-shot poses start and end a hair off the idle pose (hurt and jump with the elbows bent): here they settle on the idle pose itself
  const settle = own || LOOPS.includes(name) ? 0 : Math.max(STARTS_MOVING.includes(name) ? 0 : keys(t, [[0, 1], [0.1, 0]]), name === 'die' ? 0 : keys(t, [[name === 'hurt' ? 0.67 : 0.9, 0], [1, 1]]));
  if (settle > 0) {
    const R = H.pose('idle', 0, m, d);
    for (const arm of ['armF', 'armB']) for (const key of ['a', 'e']) P[arm][key] = lerp(P[arm][key], R[arm][key], settle);
    P.item = lerp(P.item, R.item, settle);
  }
  const up = 1 - (P.lie || 0), free = [].concat(own ? P.free ?? 0 : freeOf(name, t, stance.dash));
  const carried = up * (1 - clamp(free[0])), carried2 = up * (1 - clamp(free[1] ?? free[0]));
  P.far = 1 - carried2 / (up || 1);                                    // how busy the far hand is with something of its own
  P.lean += stance.lean * up; P.headTilt += stance.headTilt * up; P.crouch += stance.crouch * up;
  P.armF.a += stance.near[0] * carried; P.armF.e += stance.near[1] * carried;
  P.armB.a += stance.far[0] * carried2; P.armB.e += stance.far[1] * carried2;
  if (held) P.item += (held.rest - 2.5) * carried;
  // the thing in the far hand: carried at its own angle, levelled when it strikes, laid along the ground with the body
  let item2 = held?.pair ? lerp(held.rest2 + m.hold, PI / 2, P.level2 ?? 0) : 0;
  if (stance.dash && name === 'run') {
    // a low dash: both arms swept back, the blades trailing
    const c = Math.cos(TAU * t);
    P.armF.a = -1.05 + 0.14 * c; P.armF.e = 0.12;
    P.armB.a = -1.32 - 0.14 * c; P.armB.e = 0.1;
    if (held) P.item = -1.2 + 0.1 * c + m.hold * 0.5;
    item2 = -1.42 - 0.1 * c + m.hold * 0.5;
  } else if (stance.dash && name === 'jump') {
    // a leap with the arms thrown back, clear of the face
    // (from and back to the arms of the idle pose, which the rig's own jump does not quite end on)
    const w = keys(t, [[0, 0], [0.18, 0.5], [0.4, 1], [0.62, 1], [0.84, 0.3], [1, 0]]), R = H.pose('idle', 0, m, d);
    P.armF.a = lerp(R.armF.a + stance.near[0], -0.95, w); P.armF.e = lerp(R.armF.e + stance.near[1], 0.15, w);
    P.armB.a = lerp(R.armB.a + stance.far[0], -1.25, w); P.armB.e = lerp(R.armB.e + stance.far[1], 0.1, w);
    if (held) P.item = lerp(R.item + held.rest - 2.5, -1.15 + m.hold * 0.5, w);
    item2 = lerp(item2, -1.4 + m.hold * 0.5, w);
  }
  P.item2 = lerp(item2, PI / 2 - 0.06, P.lie || 0);
  // how far a sling is flung out: along the swing of an attack, a little at rest
  P.fling = held?.hangs ? lerp(0.2, 1, name === 'attack' ? keys(t, [[0, 0], [0.143, 0.6], [0.286, 1], [0.72, 1], [0.857, 0.4], [1, 0]]) : 0) * up : 0;
  return fitPose(F, P);
}

/** A pose of a definition kept inside the frame: the held thing and the headgear (H.fit), changed in place and returned. */
function fitPose(F, P) {
  const { d, held, name } = F;
  const [rise, behind] = F.reach, top = d.headR + rise;
  H.fit(P, d, {
    item: held && name === 'die' ? { ...held, pad: held.pad + 1.5 } : held,
    points: rise || behind ? (J, Q) => (Q.headTurn
      ? [[J.head[0] - Math.sin(Q.headTurn) * (top + 1), J.head[1] - Math.cos(Q.headTurn) * top], [J.head[0] - d.headR - 1, J.head[1]]]
      : [[J.head[0], J.head[1] - top], [J.head[0] - d.headR - behind, J.head[1]]]) : null,
  });
  return P;
}

/**
 * Returns everything one frame of a figure is drawn from, shared by render() and sockets(): { clip, t, def, name (the pose the clip uses), d (dims), m, held (heldSize() or null), stance, P (the pose), J (the joints), poseAt(u) (the pose at another phase), tips(u) ([near, far]: where the points of the held things are at phase u) }.
 * Arguments: clip (the clip's name), t (phase 0..1), def (the definition: see the header of this file).
 */
export function frame(clip, t, def = {}) {
  const d = H.dims(def.body ?? {}), motion = def.motion ?? {};
  const held = def.held ? heldSize(def.held.kind, def.held.length ?? 1) : null;
  let name = def.moves?.[clip] ?? clip;
  if (name === 'attack' && !held) name = 'punch';
  const worn = def.headgear && def.headgear.kind !== 'none' ? def.headgear : null;
  const F = {
    clip, t, def, name, d, held, worn,
    m: { bounce: motion.bounce ?? 0.5, stride: motion.stride ?? 0.5, armed: !!held, hold: held ? H.holdAngle(def.held.angle ?? 0) : 0, pair: !held || !!held.pair },
    stance: STANCES[def.stance] ?? STANCES.upright,
    reach: worn ? wearReach(worn.kind, worn.size ?? 1, d) : [0, 0],
  };
  F.poseAt = (u) => poseAt(F, u);
  F.P = F.poseAt(t);
  F.J = H.solve(F.P, d);
  F.tips = (u) => {
    const Q = u === t ? F.P : F.poseAt(u), J = u === t ? F.J : H.solve(Q, d), len = held ? held.length : 1;
    return [H.itemTip(J, Q, len), reach(J.armB.hand[0], J.armB.hand[1], held?.pair ? Q.item2 : J.armB.angle, held?.pair ? len : 1)];
  };
  return F;
}

/** Where the thing in the far hand is held: the far hand, never in the ground. */
const offGrip = (J, P, held) => ({ x: J.armB.hand[0], y: Math.min(J.armB.hand[1], J.gy - 1.5 - (held?.pad ?? 1)), angle: P.item2 });

/** Where a thing thrown up from the near hand is at phase `air` (0 leaving the hand .. 1 back in it), and the way it points as it turns over once. */
function airborne(J, air, len) {
  const [hx, hy] = J.armF.hand, angle = PI + TAU * air;
  const cx = hx + 1.5 * Math.sin(PI * air), cy = hy - len / 2 - 15 * 4 * air * (1 - air);
  return { x: cx - Math.sin(angle) * len / 2, y: cy - Math.cos(angle) * len / 2, angle, cx, cy };
}

/**
 * Returns the attach points of one frame of a figure, as the rig's sockets(): hand, offhand, head, back, feet, and muzzle (the far hand, where a thrown knife leaves) when the definition has `thrown`.
 * Arguments: clip, t, def (as frame() takes them).
 */
export function sockets(clip, t, def = {}) {
  const F = frame(clip, t, def), out = H.sockets(F.J, F.P, F.d);
  if (F.held?.pair) out.offhand.angle = F.P.item2;
  if (def.thrown) out.muzzle = { x: F.J.armB.hand[0] + 2, y: F.J.armB.hand[1], angle: F.name === 'throw' ? PI / 2 : F.J.armB.angle };
  return out;
}

/**
 * Paints one frame of a figure from its definition: the rig's body in the stance and pose the clip asks for, every part in its layer, the white flash of a hit, the outline, and then the light (speed lines, a swing's arc, the glint of loot).
 * Arguments: g (the Surface), clip (the clip's name), t (phase 0..1), def (the definition: see the header of this file). Returns the frame, as frame() does.
 */
export function render(g, clip, t, def = {}) {
  const F = frame(clip, t, def), { P, d, held, worn, name } = F;
  const hair = def.hair ?? {}, look = def.look ?? {};
  const throwing = name === 'throw' && P.far > 0.5;                       // the far hand has put its own thing away to throw
  const tossed = name === 'toss' ? (held?.toss ? { ...held } : { kind: 'knife', length: 5 }) : null;
  const metal = paintOf(def.held?.metal, '#c2c9d6'), metalFar = { isRamp: true, light: metal.base, base: metal.dark, dark: metal.deep ?? metal.dark };      // the far one is a step darker
  const itemOf = (far) => ({ kind: held.kind, length: held.length, metal: far ? metalFar : metal, wood: def.held.wood, hilt: def.held.hilt, cord: def.held.cord, fling: P.fling, floor: 0 });
  const drawThing = (g, at, thing, J) => (thing.kind === 'knife'
    ? throwingKnife(g, { x: at.cx ?? at.x + Math.sin(at.angle) * 2.5, y: at.cy ?? at.y + Math.cos(at.angle) * 2.5, angle: at.angle }, def.thrown)
    : drawHeld(g, at, { ...itemOf(false), floor: J.gy }));
  let muzzle = null, prize = null;

  H.draw(g, P, d, {
    skin: look.skin ?? '#f6d3b0', top: look.top ?? '#3f6fd1', bottom: look.bottom ?? look.top ?? '#3f6fd1', boots: look.boots ?? '#9a6a3e', bareArms: look.bareArms,
    hair: hair.colour ?? '#9a6a3e', hairStyle: worn?.kind === 'hood' ? 'bald' : hair.style ?? 'short',
  }, {
    behind(g, J) {
      if (def.pack && def.pack.kind !== 'none') pack(g, J, P, d, def.pack);
      if (def.scarf && def.scarf.kind !== 'none') {
        // in a clip that loops a wave runs down it; in a one-shot it is thrown about by the body, starting from and coming back to how it hangs in idle
        const fly = FLY[name], rest = FLY.idle, hang = (f, u) => [0, 1, 2].map((i) => f.whip * Math.sin(TAU * (f.beats * u - i * 0.2)));
        const own = keys(t, [[0, STARTS_MOVING.includes(name) ? 1 : 0], [0.15, 1], [0.85, 1], [1, name === 'die' ? 1 : 0]]);
        const thrown = fly ? hang(fly, t) : hang(rest, 0).map((v, i) => lerp(v, [0, 0.6 * P.sway, P.sway][i], own));
        scarf(g, J, P, d, { colour: def.scarf.colour, length: (def.scarf.kind === 'long' ? 13 : 6.5) * (def.scarf.length ?? 1), flow: fly ? fly.flow : lerp(rest.flow, 0.4, own), wave: thrown });
      }
    },
    offhand(g, J) {
      if (held?.pair && !throwing) drawHeld(g, offGrip(J, P, held), { ...itemOf(true), floor: J.gy });
    },
    torso(g, J) {
      if (def.coat) H.tunic(g, J, P, d, def.coat);
      if (def.belt) belt(g, J, P, d, def.belt);
      if (def.scarf && def.scarf.kind !== 'none') scarfWrap(g, J, P, d, def.scarf);
    },
    head(g, J) {
      if (worn) wear(g, J, P, d, worn);
      if (def.mask) mask(g, J, P, d, def.mask);
    },
    item(g, J) {
      if (held && !(tossed && held.toss && P.air != null)) drawHeld(g, H.sockets(J, P, d).hand, { ...itemOf(false), floor: J.gy });
    },
    front(g, J) {
      if (tossed && (P.air != null || (!held?.toss && P.out > 0.3))) {
        const len = tossed.length;
        drawThing(g, P.air != null ? airborne(J, P.air, len) : { x: J.armF.hand[0], y: J.armF.hand[1], angle: PI }, tossed, J);
      }
      if (P.knife) {
        const [hx, hy] = J.armB.hand;
        muzzle = P.knife === 'air' ? { x: hx + 6.5, y: hy - 0.5, angle: PI / 2 } : { x: hx - 1.5, y: hy + 1.5, angle: J.armB.angle };
        throwingKnife(g, muzzle, def.thrown);
      }
      if (P.prize) {
        prize = { x: J.armB.hand[0] + 0.5, y: J.armB.hand[1] };
        coinBag(g, prize, { ...def.loot, floor: J.gy });
      }
    },
  });

  if (P.flash) g.tint('#ffffff');
  g.outline(INK);

  // light, drawn after the outline so it is not inked
  const span = 0.15;
  if (name === 'attack' && held && !held.hangs) H.slashTrail(g, F.poseAt, t, d, held.length, '#ffffff');
  else if (name === 'punch') H.thrustTrail(g, F.poseAt, t, d, 1, '#ffffff');
  else if (name === 'stab' && t > span) {
    const now = F.tips(t), was = F.tips(t - span);
    // a strike: two streaks beside the blade that is driving forward
    const reachBack = (held ? held.length : 2) + 3;
    for (const i of [0, 1]) if (now[i][0] - was[i][0] > 3.5) speedLines(g, [now[i][0] - reachBack, now[i][1] - (now[i][1] - was[i][1]) * 0.3], now[i], { gap: 2.6 });
  } else if (name === 'steal' && t > span) {
    // the dart: two lines behind the back while the whole body is travelling forward
    const was = H.solve(F.poseAt(t - span), d).neck, now = F.J.neck, back = d.chestR + 3.5;
    if (now[0] - was[0] > 3.5) speedLines(g, [was[0] - back, now[1] + 3], [now[0] - back, now[1] + 3], { least: 3, gap: 2 });
  }
  if (P.knife === 'air' && muzzle) speedLines(g, [muzzle.x - 9, muzzle.y], [muzzle.x - 2.5, muzzle.y], { least: 3, gap: 1.6 });
  if (prize && P.glint) twinkle(g, Math.min(prize.x + 3.5, W - 4), prize.y + 0.5, P.glint, def.loot?.glint ?? '#f2c230', { box: [2, 2, W - 3, FRAME_H - 3] });
  return F;
}
