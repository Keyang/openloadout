// Riot gear for the top-down character rig (rigs/topdown.js): a soldier who fights from behind a shield as tall as
// the body. Everything here is drawn and posed for the three directions of that rig and is called from its hooks, the
// same way its own parts are; nothing in rigs/topdown.js was changed for it.
//
//   shieldFrame(clip, t, p, { item, shield, rise })   ONE FRAME of a shield bearer: start here (as T.frame())
//   bodyShield(g, J, P, d, { kind, size, layer })     the shield: riot (a tall slab), round (a disc) or energy (a pane of
//                                                     light on an emitter); call it from the `offhand` and `front` hooks
//                                                     with the hook's name as `layer`, and once more after the outline
//                                                     with layer 'light' (the energy pane is light, so it is not inked)
//   shieldPlace(J, P, d, { kind, size })              where that shield is this frame, for a part of your own
//   carryShield(carry)                                the manner that carries it: the off arm steady, the weapon kept to
//                                                     its own side, and `block` planting the shield and crouching (P.guard)
//   strike(direction, t, m, d, { using })             a jab timed for the six frames of `shoot` (it lands on frame 2):
//                                                     with a baton, with the shield, or with a fist
//   riotItem / riotItemSize / RIOT_ITEMS              what the other hand holds: rifle, pistol, baton
//   shoulderPlates, lensMask                          worn: a plate over each shoulder (`torso` and `front` hooks),
//                                                     a mask with two lit lenses and a filter (`head` hook)
//
//   import * as T from '../rigs/topdown.js';
//   import * as R from '../rigs/topdown-riot.js';
//   const F = R.shieldFrame(clip, t, p, { item: R.riotItemSize(p.weapon, p.weaponLength), shield: { kind: p.shield, size: p.shieldSize } });
//   const shield = (layer) => (g, J, P, d) => R.bodyShield(g, J, P, d, { ...F.shield, layer, colour: p.outfit, glow: p.glow });
//   const J = F.draw(g, look, { offhand: shield('offhand'), front: shield('front'), item(g, J) { R.riotItem(g, F.direction, F.hand(J), { ... }); } });
//   F.finish(g, { flash: false });
//   shield('light')(g, J, F.P, F.d);
//
// Pure functions: Node and browser, no Math.random. Angles are frame angles: 0 = down the picture, PI/2 = right, PI = up.

import { lerp, clamp, keys, pulse, fract, reach, PI, TAU } from '../engine/motion.js';
import { ramp, tone, brightness, INK } from '../engine/color.js';
import * as T from './topdown.js';

const turnTo = (a, b, k) => a + ((((b - a + PI) % TAU) + TAU) % TAU - PI) * k;      // from angle a towards b by k, the short way round
const odd = (v) => 2 * Math.round((v - 1) / 2) + 1;
// a box with its corners cut off by `cut` pixels: a shield, a pane
const chamferIn = (x0, y0, w, h, cut) => (px, py) => {
  if (px < x0 || px >= x0 + w || py < y0 || py >= y0 + h) return false;
  return Math.min(px - x0, x0 + w - px) + Math.min(py - y0, y0 + h - py) > cut;
};
// the tone of a light that stands apart by value from the thing it is on: its light tone on dark armour, its own colour on a pale one
const litOn = (glow, on) => { const c = ramp(glow); return Math.abs(brightness(c.light) - brightness(on)) > Math.abs(brightness(glow) - brightness(on)) ? c.light : c.base; };

// ---- the shield -----------------------------------------------------------------------------------

/** The kinds bodyShield() draws: riot (a tall slab with a window), energy (a pane of light on an emitter), round (a big disc). */
export const BODY_SHIELD_KINDS = ['riot', 'energy', 'round'];

/**
 * Works out where a body shield is this frame, in whole pixels: carried on the off arm, or planted in front of the feet while the pose guards.
 * Arguments: J (the solved joints, or the J a hook gets); P (the pose: P.guard 0..1 plants it, P.shove 0..1 thrusts it forward); d (dims); opt { kind: one of BODY_SHIELD_KINDS, size (0.65 to 1.35) }.
 * Returns { kind, view ('face' facing down, 'back' facing away, 'edge' from the side), x0, y0, w, h (its box), cx, cy (its middle), out (-1 | 1: the off-hand side of the picture) }.
 */
export function shieldPlace(J, P, d, opt = {}) {
  const { kind = 'riot', size = 1 } = opt;
  const dir = J.dir, guard = clamp(P.guard ?? 0), shove = clamp(P.shove ?? 0), out = -J.s, disc = kind === 'round';
  const [hx, hy] = J.armB.hand;
  const wide = disc ? odd(13 * size) : odd(11 * size), h = disc ? wide : Math.round(17 * size);
  // lying on the ground (die): it has slipped off the arm and lies beside the body
  const slip = P.lie ? 4 : 0;
  let w = wide, x0, y1, view;
  if (dir === 'side') {
    view = 'edge';
    w = disc ? Math.max(4, Math.round(wide * 0.4)) : size > 1.15 ? 6 : size < 0.85 ? 4 : 5;
    x0 = Math.round(hx + 1);
    y1 = Math.min(J.gy - 1, Math.round(hy + (disc ? 1 : 1.5) + h / 2));
  } else {
    view = dir === 'up' ? 'back' : 'face';
    x0 = Math.round(J.bx + out * (lerp(dir === 'up' ? 4 : 2.5, 0.5, guard) + slip) - w / 2);
    if (P.lie) x0 = Math.min(x0, 29 + Math.ceil(d.chestR + d.armW) - w);      // on the ground it stays inside the frame (the picture is turned: this is its lowest row)
    const carried = Math.min(J.gy - 1, Math.round(hy + (disc ? 1 : 1.5) + h / 2)) + (dir === 'up' ? 0 : Math.round(2 * shove));
    y1 = Math.round(lerp(carried, J.gy + 2, guard));
  }
  let y0 = y1 - h;
  // carried, it never hides the eyes: its top stays under them (a planted shield is what the body ducks behind)
  if (view !== 'edge' && guard < 0.5 && !P.lie) { const top = J.brow + 4; if (y0 < top) { y1 = Math.min(y1 + (top - y0), J.gy - 1 + Math.round(2 * shove)); y0 = top; } }
  const hh = y1 - y0;
  return { kind, view, x0, y0, w, h: hh, cx: x0 + w / 2, cy: y0 + hh / 2, out };
}

// a pane of light: two tones of one colour, a rim one tone down in place of the ink line, and a bright line that climbs it
function lightPane(g, inside, box, colour, { free = false, scan = null, core = '#ffffff', band = null } = {}) {
  const x0 = Math.max(1, Math.floor(box[0]) - 1), y0 = Math.max(1, Math.floor(box[1]) - 1), x1 = Math.min(g.w - 2, Math.ceil(box[2])), y1 = Math.min(g.h - 2, Math.ceil(box[3]));
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  if (W <= 0 || H <= 0) return;
  // what is there before the pane is painted: `free` keeps it behind everything already drawn
  const open = new Uint8Array(W * H), on = new Uint8Array(W * H);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y - y0) * W + x - x0;
    open[i] = !free || g.get(x, y) === 0 ? 1 : 0;
    on[i] = open[i] && inside(x + 0.5, y + 0.5) ? 1 : 0;
  }
  const at = (x, y) => x >= x0 && y >= y0 && x <= x1 && y <= y1 && on[(y - y0) * W + x - x0] === 1;
  const lightTone = tone(colour, 0.9), rim = tone(colour, -1);
  const line = scan === null ? -99 : Math.round(box[3] - 1 - fract(scan) * (box[3] - box[1] - 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y - y0) * W + x - x0;
    if (on[i]) g.dot(x, y, y === line ? core : (band ? band(x + 0.5, y + 0.5) : !inside(x + 1.5, y + 0.5)) ? lightTone : colour);      // a brighter band just inside its edge
    else if (open[i] && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) g.dot(x, y, rim);
  }
}

/**
 * Draws a shield as tall as the body on the off arm: in front of everything facing down, edge-on ahead of the body from the side, behind the body facing away. Call it from the `offhand` and the `front` hook with that hook's name as `layer` (it draws at the right depth for the direction), and for kind 'energy' once more after the outline with layer 'light' and the J that draw() returned: the pane is light and is rimmed with its own dark tone, not inked.
 * Arguments: g, J, P, d (as a hook gets them); opt { kind: one of BODY_SHIELD_KINDS, size (0.65 to 1.35), layer: 'offhand' | 'front' | 'light', colour (its face), glow (the lit edge, or the pane), inset (its window and fittings), core (the bright line that climbs an energy pane), t (clip phase, moves that line) }.
 */
export function bodyShield(g, J, P, d, opt = {}) {
  const { kind = 'riot', layer = 'front', colour = '#6b7896', glow = '#e2473f', inset = '#434d6d', core = '#f0ead8', t = 0 } = opt;
  if (!BODY_SHIELD_KINDS.includes(kind)) return;
  const dir = J.dir, S = shieldPlace(J, P, d, opt), { x0, y0, w, h, view } = S, x1 = x0 + w, y1 = y0 + h;
  const box = [x0, y0, x1, y1];
  if (layer === 'light') {
    // the pane is switched off once the body goes down
    if (kind !== 'energy' || P.lie || P.tilt) return;
    // edge-on it is a thin wall of light at the front of where the slab would be
    const ex = x1 - 2, shape = view === 'edge' ? chamferIn(ex, y0, 2, h, 0) : chamferIn(x0, y0, w, h, 3);
    const inA = chamferIn(x0 + 1, y0 + 1, w - 2, h - 2, 2.5), inB = chamferIn(x0 + 2, y0 + 2, w - 4, h - 4, 2);
    lightPane(g, shape, view === 'edge' ? [ex, y0, x1, y1] : box, glow, { free: view === 'back', scan: t, core, band: view === 'edge' ? null : (px, py) => inA(px, py) && !inB(px, py) });
    return;
  }
  if (layer !== (dir === 'down' ? 'front' : 'offhand')) return;
  const c = ramp(colour), far = { isRamp: true, light: c.base, base: c.dark, dark: c.deep, deep: c.deep }, fit = ramp(inset), out = S.out;
  // the lit edge is the light's own colour, and `hot` where it catches the light: the tone of it that stands apart from the face by value, so the edge is still there in a look with no hue
  const hot = litOn(glow, colour);
  if (kind === 'energy') {
    // the emitter: a block on the wrist with a lit cell (nothing shows of it from behind)
    if (view === 'back') return;
    const ex = Math.floor(J.armB.hand[0]) - 1, ey = Math.round(J.armB.hand[1]) - 2;
    T.over(g, (px, py) => px >= ex && px < ex + 3 && py >= ey && py < ey + 3, [ex, ey, ex + 3, ey + 3], fit, INK, { shade: 0 });
    g.rect(ex + 1, ey + 1, 1, 1, hot);
    return;
  }
  if (view === 'edge') {
    // seen edge-on: a thin slab ahead of the body, its lit edge towards the way it faces
    const shape = kind === 'round' ? (px, py) => ((px - S.cx) / (w / 2)) ** 2 + ((py - S.cy) / (h / 2)) ** 2 <= 1 : chamferIn(x0, y0, w, h, 1);
    // its inner side (towards the body) in shadow, its face turned a little to the camera, and the lit edge leading
    g.fill(...box, shape, c, { shade: 0 });
    g.fill(...box, (px, py) => shape(px, py) && px < x0 + Math.floor(w / 2), far.base, { shade: 0 });
    g.fill(...box, (px, py) => shape(px, py) && !shape(px + 1, py) && py < y1 - 2, glow, { shade: 0 });
    g.fill(...box, (px, py) => shape(px, py) && !shape(px, py - 1), hot, { shade: 0 });
    return;
  }
  const shape = kind === 'round' ? (px, py) => (px - S.cx) ** 2 + (py - S.cy) ** 2 <= (w / 2) ** 2 : chamferIn(x0, y0, w, h, w > 9 ? 2 : 1);
  const edge = (px, py) => shape(px, py) && !(shape(px + 1, py) && shape(px - 1, py) && shape(px, py + 1) && shape(px, py - 1));
  if (view === 'back') {
    // facing away the body hides it: only its inner side shows past the arm and the legs, in shadow, its rim lit along the outside
    g.fill(...box, shape, far, { shade: 0 });
    g.fill(...box, (px, py) => edge(px, py) && py < y1 - 3 && (kind === 'round' || !shape(px + out, py) || !shape(px, py - 1)), glow, { shade: 0 });
    return;
  }
  // facing the camera it is in front of everything: inked where it lies over the body, so it stays one object
  T.over(g, shape, box, c, INK, { shade: 1, light: 0 });
  if (kind === 'round') {
    const r = w / 2, ring = (px, py) => { const v = Math.hypot(px - S.cx, py - S.cy); return v <= r - 1.2 && v > r - 2.3; };
    g.fill(...box, edge, c.dark, { shade: 0 });
    g.fill(...box, ring, glow, { shade: 0 });
    g.fill(...box, (px, py) => ring(px, py) && py < S.cy - r * 0.45, hot, { shade: 0 });
    const bx = Math.floor(S.cx), by = Math.floor(S.cy);
    g.rect(bx - 1, by - 1, 3, 3, fit, { shade: 0 });
    g.rect(bx, by, 1, 1, hot);
    return;
  }
  // riot: a lit edge along the top and down both sides, a window to look through, a rib across its middle
  g.fill(...box, (px, py) => edge(px, py) && py < y1 - 3, glow, { shade: 0 });
  g.fill(...box, (px, py) => edge(px, py) && !shape(px, py - 1), hot, { shade: 0 });
  const wy = y0 + Math.max(2, Math.round(h * 0.16)), ww = w - 4, wh = h >= 14 ? 3 : 2;
  if (ww >= 3 && h >= 9) {
    g.rect(x0 + 2, wy, ww, wh, fit.dark, { shade: 0 });
    g.rect(x0 + 2, wy, ww, 1, fit.base, { shade: 0 });
    g.rect(x1 - 4, wy, 2, 1, c.light, { shade: 0 });                                   // the glint on the glass
  }
  if (h >= 13) g.rect(x0 + 2, wy + wh + Math.round((y1 - wy - wh) * 0.45), ww, 1, c.light, { shade: 0 });
}

// ---- carrying it: the manner, the jab, the frame -----------------------------------------------------

/**
 * Makes the manner (for T.frameWith() or T.poseFrame()) of a body that carries a shield on its off arm: that arm is held bent and steady, a gun is fired from its own side of the shield, and `block` plants the shield and crouches behind it.
 * Arguments: carry (the carry the weapon rests in, as given to the frame: 'ready', 'up' ...; default 'ready').
 * Returns (P, F, t) => void. It sets P.guard (0..1: how far the shield is planted), which shieldPlace() reads.
 */
export function carryShield(carry = 'ready') {
  return (P, F, t) => {
    if (P.lie) return;
    const a = F.action, dir = F.direction, side = dir === 'side', d = F.d;
    // the off arm: bent, the forearm behind the shield; it keeps a little of the pose's own swing (all of it when it is the arm that strikes)
    const keep = P.strike === 'shield' ? 1 : a === 'hurt' || a === 'die' ? 0.6 : 0.3, own = P.armB;
    const base = side ? { f: 3.5, u: 1.5, o: 0 } : { f: 1, u: 1.5, o: -0.5 };
    P.armB = { f: base.f + own.f * keep, u: base.u + own.u * keep, o: base.o + own.o * keep };
    if (a === 'shoot' && !P.strike && dir === 'down') P.armF.o = Math.max(P.armF.o, 0.5 * keys(t, [[0, 1], [0.7, 1], [1, 0]]));      // the gun stays beside the shield, not behind it
    if (a === 'block') {
      const b = keys(t, [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]);
      P.guard = b;
      P.bob = d.leg * 0.5 * b; P.tuck = 0.35 * b; P.headDy = (P.headDy ?? 0) + b;
      // the weapon is kept low at its own side, out of the way
      P.item = (T.CARRY[carry] ?? T.CARRY.up)[dir];
      P.armF = { f: 0, u: 1 * b, o: 0.5 * b };
      P.armB = { f: base.f + 2 * b, u: base.u + 1 * b, o: base.o - 2 * b };
    }
  };
}

/**
 * Returns the pose of a jab timed for the six frames of `shoot`, for a body with no gun: frame 0 ready, 1 drawn back, 2 the blow lands (furthest reach), 3 held, 4 to 5 back to standing.
 * Arguments: direction ('down' | 'up' | 'side'); t (0..1); m, d (as T.pose()); opt { using: 'item' (the held thing is cocked back and driven out the way the body faces), 'shield' (the off arm shoves: sets P.shove) or 'fist' }.
 * Sets P.strike to `using`; never sets P.fire.
 */
export function strike(direction, t, m = {}, d = T.dims(), opt = {}) {
  const using = opt.using ?? 'item', side = direction === 'side', up = direction === 'up';
  const P = T.pose('idle', direction, 0, m, d), rest = P.item;
  P.blink = false; P.strike = using;
  const wind = keys(t, [[0, 0.5], [0.2, 1], [0.32, 0.5], [0.4, 0], [1, 0]]);
  const hit = keys(t, [[0, 0], [0.2, 0], [0.4, 1], [0.6, 0.85], [0.8, 0.25], [1, 0]]);
  // from the side the arm is thrown out level; at the camera it is thrown low and a little wide, away from it high and wide, so the blow shows outside the body
  const A = { f: -2 * wind + 5.5 * hit, u: 1.5 * wind + (side ? 2.5 : up ? 2.5 : 0) * hit, o: side ? 0 : using === 'shield' ? -0.8 * hit : 1.5 * hit }, B = { f: 1.2 * wind - 1.5 * hit, u: 1 * wind, o: 0 };
  if (using === 'shield') { P.armB = A; P.armF = B; P.shove = hit; } else { P.armF = A; P.armB = B; }
  P.lean = -1 * wind + 1.8 * hit;
  P.lunge = -1.2 * wind + 3 * hit;
  P.bob = 0.6 * wind + 1.2 * hit;
  P.footF.f = 2.2 * hit; P.footF.u = 1.2 * pulse(clamp((t - 0.2) / 0.2)); P.footB.f = -1.6 * hit;
  if (using === 'item') {
    // cocked up and back, then driven out; pointing at the camera or away from it, it looks shorter
    const cock = side ? PI + 0.7 : up ? PI - 1.3 : PI + 1.3, out = side ? PI / 2 - 0.1 : up ? PI - 0.15 : -0.15;
    P.item = turnTo(turnTo(rest, cock, wind), out, hit);
    if (!side) P.reach = 1 - (up ? 0.25 : 0.4) * hit;
  }
  P.sway = keys(t, [[0, 0], [0.2, -1], [0.45, 1], [1, 0]]);
  return P;
}

/**
 * Builds one frame of a body that fights from behind a shield: T.poseFrame() with the shield carried (carryShield), `shoot` turned into a jab when no gun is held (strike), and the body kept inside the frame with the shield on. With no shield and a long gun it is T.bracedFrame(), both hands on the gun.
 * Arguments: clip, t, p (as T.frame()); opt { item: riotItemSize(kind, scale) or null; shield: { kind: one of BODY_SHIELD_KINDS, size } or null; rise, tall, muzzle, manner: as T.frame() and T.poseFrame(); carry (default: 'up' for a baton, 'ready' for a gun) }.
 * Returns the same F as T.frame(), with F.shield (the shield it carries, or null) and F.grip(J) (as T.bracedFrame(): where the free hand is on a gun held in both hands, else null).
 */
export function shieldFrame(clip, t, p = {}, opt = {}) {
  const { action } = T.parseClip(clip);
  const item = opt.item && opt.item.length > 0 ? opt.item : null, gun = !!item && !item.melee;
  const shield = opt.shield && BODY_SHIELD_KINDS.includes(opt.shield.kind) ? { kind: opt.shield.kind, size: opt.shield.size ?? 1 } : null;
  if (!shield && gun && item.long) return Object.assign(T.bracedFrame(clip, t, p, { ...opt, item }), { shield: null });
  const carry = opt.carry ?? (item && item.melee ? 'up' : 'ready'), using = item ? 'item' : shield ? 'shield' : 'fist';
  const d = T.dims(p, { tall: opt.tall });
  const points = (J, P) => {
    const pts = opt.rise ? [[J.head[0], J.headTop - opt.rise]] : [];
    if (shield) { const S = shieldPlace(J, P, d, shield); pts.push([S.x0 - 1, J.hip[1]], [S.x0 + S.w + 1, J.hip[1]]); }
    return pts;
  };
  const F = T.poseFrame(clip, t, p, {
    ...opt, item, carry, points: shield || opt.rise ? points : null,
    pose: action === 'shoot' && !gun ? (a, direction, u, m, dd) => strike(direction, u, m, dd, { using }) : undefined,
    manner: [...(shield ? [carryShield(carry)] : []), ...[].concat(opt.manner ?? [])],
  });
  return Object.assign(F, { shield, grip: () => null });
}

// ---- what the other hand holds ---------------------------------------------------------------------

/** The sizes { length, back, pad } in pixels of what a trooper holds: rifle (the rig's long gun; `long`: held in both hands when there is no shield), pistol, and baton (`melee`: a `shoot` with it is a jab). No arguments: a frozen object. */
export const RIOT_ITEMS = Object.freeze({
  rifle: Object.freeze({ length: 10, back: 3, pad: 3.5, long: true }),
  pistol: Object.freeze({ length: 5, back: 1, pad: 3 }),
  baton: Object.freeze({ length: 9, back: 2, pad: 2, melee: true }),
});

/** Returns the size { length, back, pad, long, melee } of a trooper's held kind at a length setting, ready for shieldFrame(); for any other kind it is T.gunSize()'s answer, and null for 'none'. Arguments: kind (a key of RIOT_ITEMS, or a kind of the rig); scale (1 = standard). */
export const riotItemSize = (kind, scale = 1) => (RIOT_ITEMS[kind] ? { ...RIOT_ITEMS[kind], length: RIOT_ITEMS[kind].length * scale } : T.gunSize(kind, scale));

/**
 * Draws what a trooper holds from an attach point: a rifle or a pistol (the rig's long gun and sidearm, and seen end-on when it points at the camera), or a baton with a side handle; any other kind is handed to T.heldGun().
 * Arguments: g; direction ('down' | 'up' | 'side'); at ({ x, y, angle, reach }, for example F.hand(J)); item { kind, length, metal (the gun, or the baton's shaft), grip (the baton's handle) }.
 */
export function riotItem(g, direction, at, item) {
  if (!RIOT_ITEMS[item.kind]) return T.heldGun(g, direction, at, item);
  const metal = typeof item.metal === 'string' ? ramp(item.metal) : item.metal ?? ramp('#c2c9d6');
  const a = at.angle, r = at.reach ?? 1, len = item.length * r, hx = at.x, hy = at.y;
  const to = (dist, turn = 0, from = [hx, hy]) => reach(from[0], from[1], a + turn, dist);
  if (item.kind === 'baton') {
    const grip = ramp(item.grip ?? '#434d6d'), [bx, by] = to(2 * r, PI), [gx, gy] = to(2), [tx, ty] = to(len);
    g.limb(gx, gy, tx, ty, 2, metal);
    g.dot(tx, ty, metal.light);
    g.limb(bx, by, gx, gy, 2, grip, { shade: 0 });
    const [sx, sy] = to(2.4, direction === 'up' ? PI / 2 : -PI / 2, [gx, gy]);
    g.line(gx, gy, sx, sy, grip.base);                                  // the side handle
    return;
  }
  if (r < 0.7 && direction === 'down' && Math.abs(Math.sin(a)) < 0.3 && Math.cos(a) > 0) {
    // pointing at the camera: seen end-on, a short block with the bore in its face
    const wide = 3, end = Math.max(len, item.kind === 'rifle' ? 5 : 4), [tx, ty] = to(end);
    g.limb(hx, hy, tx, ty, wide, metal, { shade: 0 });
    const [ex, ey] = to(end - 0.5), [qx, qy] = to(end - 1.5);
    g.dot(ex, ey, metal.deep); g.dot(qx, qy, metal.deep);
    if (item.kind === 'rifle') { const [ux, uy] = to(1.8, -PI / 2, to(1)); g.dot(ux, uy, metal.dark); }      // the magazine, beside the body
    return;
  }
  T.heldItem(g, direction, at, { ...item, kind: item.kind === 'rifle' ? 'gun' : 'pistol', glow: undefined });
}

// ---- worn ------------------------------------------------------------------------------------------

/** Draws a plate of armour over each shoulder, one pixel proud of the arm: call it from the `torso` hook and again from the `front` hook with `layer: 'front'` (the near shoulder of a side clip is drawn there). Arguments: g, J, P, d (as a hook gets them); opt { colour, layer: 'torso' | 'front' }. */
export function shoulderPlates(g, J, P, d, opt = {}) {
  const { layer = 'torso' } = opt, c = ramp(opt.colour ?? '#434d6d');
  const plate = (A, sg) => {
    const cx = A.shoulder[0] + sg * 0.5, cy = Math.floor(A.shoulder[1]) + 0.2, rx = d.armW / 2 + 1.3, ry = 2.2;
    T.over(g, (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, [cx - rx, cy - ry, cx + rx, cy + ry], c, c.dark, { light: 1, shade: 0 });
  };
  if (J.dir === 'side') { if (layer === 'front') plate(J.armF, 0); return; }
  if (layer === 'torso') { plate(J.armF, J.s); plate(J.armB, -J.s); }
}

/**
 * Draws a breathing mask with two lit lenses and a filter, for the `head` hook: the lenses over the eyes and a muzzle over the mouth facing down (cheeks and brow stay bare), one lens and the filter out in front from the side, only its strap from behind.
 * Arguments: g, J, P, d (as a hook gets them); opt { size (0.5 to 1.8: bigger lenses and a wider, longer muzzle), colour (the mask), lens (colour of the lit lenses) }.
 */
export function lensMask(g, J, P, d, opt = {}) {
  const { size = 1 } = opt, colour = opt.colour ?? '#434d6d', c = ramp(colour), lens = ramp(opt.lens ?? '#e2473f');
  const hi = litOn(opt.lens ?? '#e2473f', colour), lo = hi === lens.light ? lens.base : lens.dark;
  const [cx] = J.head, rx = d.headW / 2, dir = J.dir, x0 = Math.floor(cx), inH = T.headIn(J, d), box = [cx - rx - 3, J.headTop - 1, cx + rx + 3, J.headTop + d.headH + 4];
  const ey = J.brow + 1, chin = J.headTop + d.headH, lw = size < 0.8 ? 2 : 3, lh = size < 1.4 ? 2 : 3, drop = Math.max(0, Math.round((size - 1) * 2.5));
  if (dir === 'up') {
    g.fill(...box, (px, py) => inH(px, py) && py >= ey && py < ey + 2, c.base, { shade: 0 });        // the strap, and its buckle
    g.rect(x0 - 1, ey, 3, 2, c.light, { shade: 0 });
    return;
  }
  const half = Math.min(rx - 2, 2.2 + 1.3 * size);
  if (dir === 'down') {
    // goggles under a bare brow, the muzzle from under the eyes to the chin, and a filter that hangs below it
    g.fill(...box, (px, py) => inH(px, py) && py >= ey && py < ey + 1, c.base, { shade: 0 });
    g.blob([(px, py) => inH(px, py) && py >= ey + 2 && Math.abs(px - cx) < half, (px, py) => py >= chin - 1 && py < chin + 1 + drop && Math.abs(px - cx) < Math.max(1.6, half - 1)], c, { shade: 1 });
    g.rect(x0 - 1, chin - 2, 3, 1, c.light, { shade: 0 });                                             // the grille
    for (const sg of [-1, 1]) {
      const ex = d.headW >= 13 ? 3 : 2, lx = sg < 0 ? x0 - ex - (lw - 2) : x0 + ex - 1;
      g.rect(lx - 1, ey, lw + 2, lh + 1, c.base, { shade: 0 });                                        // the housing round each lens
      g.rect(lx, ey, lw, lh, lo, { shade: 0 });
      g.rect(lx, ey, lw, 1, hi, { shade: 0 });
    }
    g.rect(x0, ey, 1, 1, c.base);                                                                      // the bridge
    return;
  }
  const front = Math.floor(cx + rx);
  g.fill(...box, (px, py) => inH(px, py) && py >= ey && py < ey + 1 && px < cx + 1, c.base, { shade: 0 });      // the strap, back over the ear
  g.blob([(px, py) => inH(px, py) && py >= ey + 2 && px > cx + 0.5, (px, py) => py >= ey + 3 && py < chin + drop && px >= front - 1 && px < front + 1 + Math.round(size)], c, { shade: 1 });
  g.rect(front - lw - 1, ey, lw + 2, lh + 1, c.base, { shade: 0 });
  g.rect(front - lw, ey, lw, lh, lo, { shade: 0 });
  g.rect(front - lw, ey, lw, 1, hi, { shade: 0 });
}
