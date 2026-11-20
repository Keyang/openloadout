// PORT (migration batch C3): a copy of engine/groundbot.js with its imports pointed at the port shims (engine/gen/ports/colour.js,
// engine/gen/ports/c3/surface.js) and the other port copies (engine/gen/ports/e2/, engine/gen/ports/c3/), so it draws paint refs on
// engine/gen/port-surface.js grids. It is the drawing code of migration batch C3's robot ports (engine/gen/robots.js), so it
// is NOT temporary: it stays when engine/groundbot.js goes and goes only with the last generator version that draws with it. A HAND
// CHANGE note below says where it differs from its source; never change what a released generator version draws through it.
// Ground robot parts in the three-quarter (top-down) view, for machines that are drawn in three directions: guard
// robots, tanks, turrets, loaders. Added with batch S08 (sprites/security-bot.js on rigs/guard-bot.js, the worked
// example). The partner of engine/warmachine.js, whose parts always face the camera.
//
// The idea: a part is described ONCE, in the machine's own space (a: forward, b: to its own right, c: up off the
// floor, as rigs/creature-topdown.js has it), and handed a projector `at(a, b, c) -> [x, y, z]` that places a point of
// that space on the picture for the direction the machine faces. Nothing here is drawn per direction by hand:
//
//   boxView      where a box of the machine's own space shows on the picture: its lit top face and the wall under it
//   trackPod     a caterpillar track filling such a box, seen end on or from the side, its cleats moving
//   botHead      a small robot head with one lens that looks the way the machine faces (BOT_HEADS: dome, block, sensor)
//   botWeapon    a weapon on a shoulder housing that points forward (BOT_WEAPONS: cannon, saw, claw)
//   botPack      what stands on a rear deck (BOT_PACKS: siren, exhaust)
//
//   import * as K from '../rigs/creature-topdown.js';
//   const at = (a, b, c) => K.project('side', a, b, c);                        // or a projector that also moves with a pose
//   const hull = boxView(at, { a: 0, b: 0, c: 4, len: 13, wide: 17, tall: 7 });
//   armourBlock(g, { ...hull, paint: ramp(p.body) });                          // a box view is what armourBlock paints
//   trackPod(g, boxView(at, { b: 10, len: 17, wide: 6, tall: 5 }), { along: 'across', phase: frame });
//   const W = botWeapon(g, 'cannon', at, { facing: 'side', mount: [0, 10, 5], length: 8 });   // W.tip: the muzzle
//
// `facing` says which wall of a box the camera sees: 'down' the front (the machine comes toward the camera), 'up' the
// back, 'side' its right side (it faces picture-right). Light comes from the top right, as everywhere. Colours are
// handed in as ramps (ramp() of engine/color.js); lights take colour steps, hottest first (steps() of engine/fx.js).
// botWeapon and botPack take `null` for the Surface to measure a part without drawing it (the box it would cover),
// so a rig can keep a machine inside its frame without reading a pixel back.
// Pure functions: Node and browser, no Math.random. Everything draws through the Surface's own calls.

import { ramp, tone } from './colour.js';
import { polyIn } from './surface.js';
import { seam } from './rock.js';
import { toothedIn } from './mech.js';
import { stripesIn } from '../e2/solids.js';
import { armourBlock } from './warmachine.js';
import { clamp, TAU } from '../../../motion.js';

const R = Math.round;
/** A dark material painted without its darkest tone, which would sink into the outline. */
const flatDark = (K) => ({ light: K.light, base: K.base, dark: K.base });
const RED = ['#ffffff', '#f0ead8', '#e98c8c', '#e2473f', tone('#e2473f', -1)];
const newBox = () => [Infinity, Infinity, -Infinity, -Infinity];
const grow = (E, x0, y0, x1, y1) => { E[0] = Math.min(E[0], Math.floor(x0)); E[1] = Math.min(E[1], Math.floor(y0)); E[2] = Math.max(E[2], Math.ceil(x1)); E[3] = Math.max(E[3], Math.ceil(y1)); return E; };
/** The colour of a lens at a light level: off, dim, lit, flaring. */
const lensOf = (L, K, level) => (level >= 1.5 ? L[1] : level >= 0.75 ? L[3] : level >= 0.25 ? L[4] : K.dark);

/**
 * Works out where a box of a machine's own space shows on the picture in three-quarter view: its lit top face and the wall under it. Returns { x0, x1 (its left edge and the column after its right edge), top (the first row of its lit top face), face (the first row of the wall turned to the camera), bottom (the row after its last), z (how near the camera its nearest corner is: paint smaller z first), cx (its middle column) } in whole pixels.
 * Arguments: at ((a, b, c) => [x, y, z]: places a point of the machine's own space on the picture, for example K.project of rigs/creature-topdown.js with the direction filled in); box { a, b (the middle of its footprint: forward, and to the machine's right; default 0), c (how high its underside is off the floor, default 0), len (along the machine), wide (across it), tall }.
 */
export function boxView(at, box) {
  const { a = 0, b = 0, c = 0, len, wide, tall } = box;
  let x0 = Infinity, x1 = -Infinity, top = Infinity, face = -Infinity, bottom = -Infinity, z = -Infinity;
  for (const sa of [-0.5, 0.5]) for (const sb of [-0.5, 0.5]) {
    const [x, y, zz] = at(a + sa * len, b + sb * wide, c + tall), y0 = at(a + sa * len, b + sb * wide, c)[1];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); top = Math.min(top, y); face = Math.max(face, y); bottom = Math.max(bottom, y0); z = Math.max(z, zz);
  }
  return { x0: R(x0), x1: R(x1), top: R(top), face: R(face), bottom: R(bottom), z, cx: (x0 + x1) / 2 };
}

/**
 * Draws a caterpillar track filling a box view, seen end on or from the side, with cleats that move as it turns. Seen end on (the track runs toward or away from the camera) it is a lit top run over the curve of its end, crossed by cleats; seen from the side it is a belt round a row of wheels. The cleats move with `phase`, so a walk clip shows it turning. Returns the view.
 * Arguments: g (the Surface); V (a box view from boxView()); o { along ('depth': seen end on, the default; 'across': seen from the side), phase (whole px the belt has moved: positive moves the cleats down the picture when seen end on and to the right when seen from the side), pitch (px from one cleat to the next, default 4: a phase of one pitch is the same picture), paint (a ramp: the belt, a dark colour), wheel (a ramp: the wheels), seam (a colour: darkens what it sits on) }.
 */
export function trackPod(g, V, o = {}) {
  const K = o.paint ?? ramp('#434d6d'), M = o.wheel ?? ramp('#c2c9d6');
  const pitch = Math.max(2, R(o.pitch ?? 4)), phase = R(o.phase ?? 0), { x0, x1, top, face, bottom } = V, w = x1 - x0;
  const on = (v, dir = 1) => (((v - dir * phase) % pitch) + pitch) % pitch === 0;
  if ((o.along ?? 'depth') !== 'across') {
    const shape = polyIn([[x0, top], [x1, top], [x1, bottom - 1], [x1 - 1, bottom], [x0 + 1, bottom], [x0, bottom - 1]]);
    if (o.seam) seam(g, shape, o.seam, { box: [x0 - 1, top - 1, x1 + 1, bottom + 1] });
    g.fill(x0, top, x1, bottom, shape, K.base, { shade: 0 });
    if (face > top) g.rect(x0, top, w, face - top, K.light);
    g.rect(x0, face, 1, Math.max(0, bottom - 1 - face), K.dark);                  // its shaded left edge
    for (let y = top; y < bottom - 1; y++) if (on(y)) g.rect(x0 + 1, y, Math.max(1, w - 2), 1, K.dark);
    return V;
  }
  const h = bottom - face, cut = h >= 5 ? 2 : 1;
  const belt = polyIn([[x0 + cut, face], [x1 - cut, face], [x1, face + cut], [x1, bottom - cut], [x1 - cut, bottom], [x0 + cut, bottom], [x0, bottom - cut], [x0, face + cut]]);
  const lid = face > top ? polyIn([[x0 + cut + 1, top], [x1 - cut - 1, top], [x1 - cut, face], [x0 + cut, face]]) : null;
  if (o.seam) seam(g, (px, py) => belt(px, py) || (lid ? lid(px, py) : false), o.seam, { box: [x0 - 1, top - 1, x1 + 1, bottom + 1] });
  if (lid) {
    g.fill(x0, top, x1, face, lid, K.light, { shade: 0 });
    for (let x = x0 + cut; x < x1 - cut; x++) if (on(x)) g.fill(x, top, x + 1, face, (px, py) => lid(px, py) && Math.floor(px) === x, K.dark, { shade: 0 });
  }
  g.fill(x0, face, x1, bottom, belt, K.base, { shade: 0 });
  // the well the wheels run in, and the wheels
  if (h >= 4 && w >= 8) {
    g.rect(x0 + 2, face + 1, w - 4, h - 2, K.dark);
    const d = Math.min(4, h - 2), n = Math.max(2, R((w - 4) / (d + 2)));
    for (let i = 0; i < n; i++) {
      const wx = R(x0 + 2 + ((w - 4 - d) * i) / (n - 1)), wy = face + 1 + Math.floor((h - 2 - d) / 2);
      if (d >= 3) { g.ellipse(wx + d / 2, wy + d / 2, d / 2, d / 2, M.base, { shade: 0 }); g.rect(wx + Math.floor(d / 2) - (d % 2 ? 0 : 1), wy + Math.floor(d / 2) - (d % 2 ? 0 : 1), d % 2 ? 1 : 2, d % 2 ? 1 : 2, K.base); }
      else g.rect(wx, wy, d, d, M.base);
    }
  }
  // cleats along the belt: the upper run goes forward, the lower run comes back
  for (let x = x0 + cut; x < x1 - cut; x++) {
    if (on(x)) g.dot(x, face, K.light);
    if (on(x, -1)) g.dot(x, bottom - 1, K.light);
  }
  return V;
}

/** The heads botHead() can draw: dome (a glossy half ball with a round lens), block (an armoured box with a lens in a visor slot), sensor (a narrow mast that is one big lens, with an aerial). No arguments: a frozen list. */
export const BOT_HEADS = Object.freeze(['dome', 'block', 'sensor']);

/**
 * Draws a small robot head filling a box view, with one lens that looks the way the machine faces. The lens looks toward the camera, to picture-right, or (facing away) is not seen at all, the back of the head showing a vent or hatch instead. Returns { eye ([x, y]: the lens, or null when it faces away), top (the row of its highest pixel), x0, x1 (its left edge and the column after its right edge, with what sticks out) }.
 * Arguments: g (the Surface); kind (one of BOT_HEADS); V (the head's box view from boxView(); give it an odd width); o { facing ('down', 'up' or 'side'), body, metal, dark (ramps: the armour, bright metal, dark fittings), colours (the light's colour steps, hottest first), level (the lens: 0 off, 0.5 dim, 1 lit, 2 flaring), look (-1..1: where the lens looks, sideways; only seen facing 'down'), seam (a colour: darkens what the head sits on) }.
 */
export function botHead(g, kind, V, o = {}) {
  if (!BOT_HEADS.includes(kind)) throw new Error(`groundbot.botHead: no head "${kind}"; heads: ${BOT_HEADS.join(', ')}`);
  const facing = o.facing ?? 'down';
  const H = o.body ?? ramp('#6b7896'), M = o.metal ?? ramp('#c2c9d6'), K = o.dark ?? ramp('#434d6d'), L = o.colours ?? RED;
  const level = o.level ?? 1, on = level >= 0.75, lens = lensOf(L, K, level);
  const look = facing === 'down' ? R(clamp(o.look ?? 0, -1, 1)) : 0;
  const { x0, x1, top, face, bottom } = V, w = x1 - x0, h = bottom - face, mid = (x0 + x1) / 2, mx = Math.floor(mid);
  let eye = null, hi = top, left = x0, right = x1;
  if (kind === 'block') {
    armourBlock(g, { x0, x1, top, face, bottom, inset: 1, cut: [1, 1], paint: H, seam: o.seam });
    const vy = face + 1, vh = clamp(h - 2, 2, 3);
    if (facing === 'down') {
      g.rect(x0 + 1, vy, w - 2, vh, K.base);                                     // the visor slot
      g.rect(mx - 1 + look, vy, 3, vh, lens);
      if (on) g.dot(mx + 1 + look, vy, L[0]);
      eye = [mx + look, vy + Math.floor(vh / 2)];
    } else if (facing === 'side') {
      g.rect(x1 - 4, vy, 5, vh, K.base); right = x1 + 1;                          // the slot wraps round the front corner, and its hood sticks out
      g.rect(x1 - 2, vy, 2, vh, lens);
      if (on) g.dot(x1 - 1, vy, L[0]);
      eye = [x1 - 1, vy + Math.floor(vh / 2)];
    } else for (let i = 0; i < 2 && vy + 2 * i < bottom - 1; i++) g.rect(mx - 2, vy + 2 * i, 5, 1, K.base);   // a vent in the back plate
  } else if (kind === 'dome') {
    // a half ball on a dark collar: the collar is the footprint, the dome stands on its middle
    const half = Math.max(1, (face - top) / 2), cy = bottom - half, rx = w / 2, up = Math.max(h, rx * 0.9);
    const ring = (px, py) => ((px - mid) / rx) ** 2 + ((py - cy) / half) ** 2 <= 1;
    const dome = (px, py) => (py < cy + 0.5 ? ((px - mid) / rx) ** 2 + ((py - cy - 0.5) / up) ** 2 <= 1 : ring(px, py) && py < cy + half - 1);
    const both = (px, py) => ring(px, py) || dome(px, py);
    hi = Math.floor(cy + 0.5 - up);
    if (o.seam) seam(g, both, o.seam, { box: [x0 - 1, hi - 1, x1 + 1, bottom + 1] });
    g.fill(x0, cy, x1, bottom, ring, K.base, { shade: 0 });
    g.fill(x0, hi, x1, bottom, dome, H, { shade: 1, light: 1 });
    const ey = R(cy - Math.max(1, up * 0.35));
    if (facing === 'down') {
      g.ellipse(mid + look, ey + 0.5, 2.4, 2.4, K.base, { shade: 0 });
      g.rect(mx - 1 + look, ey - 1, 3, 3, lens);
      if (on) g.dot(mx + 1 + look, ey - 1, L[0]);
      eye = [mx + look, ey];
    } else if (facing === 'side') {
      g.rect(x1 - 3, ey - 1, 4, 4, K.base); right = x1 + 1;
      g.rect(x1 - 1, ey, 2, 2, lens);
      if (on) g.dot(x1, ey, L[0]);
      eye = [x1 - 1, ey];
    } else g.rect(mx - 1, ey, 3, 2, K.base);                                      // a hatch in the back of the dome
  } else {
    armourBlock(g, { x0, x1, top, face, bottom, inset: w >= 7 ? 1 : 0, paint: H, seam: o.seam });
    const ly = face + Math.floor((h - 1) / 2), r = Math.max(1.4, Math.min(w / 2 - 0.6, h / 2 - 0.6));
    if (facing !== 'side') { for (const s of [-1, 1]) g.rect(s < 0 ? x0 - 1 : x1, ly - 1, 1, 3, K.base); left = x0 - 1; right = x1 + 1; }   // a pod at each side
    if (facing === 'down') {
      g.ellipse(mid, ly + 0.5, r, r, K.base, { shade: 0 });
      g.ellipse(mid, ly + 0.5, r - 1, r - 1, lens, { shade: 0 });
      if (on) { g.dot(mx + look, ly, L[2]); g.dot(mx + 1 + look, ly - 1, L[0]); } else g.dot(mx + look, ly, K.base);
      eye = [mx + look, ly];
    } else if (facing === 'side') {
      g.rect(x1 - 2, ly - 2, 3, 5, K.base); right = x1 + 1;
      g.rect(x1 - 1, ly - 1, 2, 3, lens);
      if (on) g.dot(x1, ly - 1, L[0]);
      eye = [x1 - 1, ly];
    } else for (let i = 0; i < 3 && face + 1 + 2 * i < bottom - 1; i++) g.rect(x0 + 1, face + 1 + 2 * i, w - 2, 1, K.base);
    // the aerial stands on the machine's own left, at the back
    const ax = facing === 'down' ? x1 - 2 : x0 + 1;
    g.rect(ax, top - 4, 1, 4, M.base);
    g.dot(ax, top - 5, on ? L[3] : K.base);
    hi = top - 5;
  }
  return { eye, top: hi, x0: left, x1: right };
}

/** The weapons botWeapon() can draw: cannon (a thick barrel with a muzzle ring), saw (a toothed blade on an arm, facing forward, which turns), claw (two steel pincers that open and close). No arguments: a frozen list. */
export const BOT_WEAPONS = Object.freeze(['cannon', 'saw', 'claw']);

/**
 * Draws a weapon that points forward from a striped shoulder housing, placed by a projector so it is right for any direction. kind is one of BOT_WEAPONS. Returns { hand ([x, y]: the top of the housing), tip ([x, y]: its far end, the muzzle), box ([x0, y0, x1, y1]: what it covers, the last column and row not included), z (how near the camera it is) }.
 * Arguments: g (the Surface, or null to measure it without drawing); kind (one of BOT_WEAPONS); at ((a, b, c) => [x, y, z], as boxView takes it); o { mount ([a, b, c]: the middle of the foot of its housing), length (px from the housing to its tip, in the machine's own space; a longer saw is mostly a bigger blade), facing ('down', 'up' or 'side': which end is nearer the camera), k (the scale of its thickness, default 1), thrust (px it is pushed forward out of the housing, negative pulled back), droop (px its tip hangs below its root), work (a whole number that goes up as it works: the saw turns half a tooth, the claw opens and closes every eight), grip (0 shut .. 2 wide: the claw's opening, instead of what `work` gives), body, metal, dark, accent (ramps), seam (a colour: darkens what the housing sits on) }.
 */
export function botWeapon(g, kind, at, o = {}) {
  if (!BOT_WEAPONS.includes(kind)) throw new Error(`groundbot.botWeapon: no weapon "${kind}"; weapons: ${BOT_WEAPONS.join(', ')}`);
  const facing = o.facing ?? 'down', k = o.k ?? 1, [ma, mb, mc] = o.mount ?? [0, 0, 0];
  const L = Math.max(3, o.length ?? 8), th = o.thrust ?? 0, droop = Math.max(0, o.droop ?? 0), work = R(o.work ?? 0);
  const H = o.body ?? ramp('#6b7896'), M = o.metal ?? ramp('#c2c9d6'), K = o.dark ?? ramp('#434d6d'), A = o.accent ?? ramp('#f2a030');
  const HV = boxView(at, { a: ma, b: mb, c: mc, len: 6, wide: 5, tall: 4 });
  const axis = mc + 2.5, pt = (a, b, c) => { const q = at(a, b, Math.max(1, c)); return [q[0], q[1]]; };
  const root = pt(ma + 1 + th, mb, axis), far = ma + 3 + th + L;
  const E = grow(newBox(), HV.x0, HV.top, HV.x1, HV.bottom);
  const housing = () => {
    const B = armourBlock(g, { ...HV, inset: 1, cut: [1, 1], paint: H, seam: o.seam });
    // hazard stripes across the wall the camera sees
    const band = (px, py) => B.front(px, py) && py >= HV.face + 1 && py < HV.bottom - 1 && px >= HV.x0 + 1 && px < HV.x1 - 1;
    g.fill(HV.x0, HV.face, HV.x1, HV.bottom, band, K.base, { shade: 0 });
    g.fill(HV.x0, HV.face, HV.x1, HV.bottom, stripesIn(band, { pitch: 4, slant: 1, duty: 0.5, phase: HV.x0 + HV.face }), A.base, { shade: 0 });
  };
  let tip, tool;
  if (kind === 'cannon') {
    // a drooping barrel keeps its length: its tip comes back as it goes down
    const run = Math.sqrt(Math.max(1, (L + 2) ** 2 - droop ** 2)), end = pt(ma + 1 + th + run, mb, axis - droop), bw = Math.max(3, R(3.4 * k)), hb = bw / 2;
    tip = end;
    grow(E, Math.min(root[0], end[0]) - hb - 1, Math.min(root[1], end[1]) - hb - 3, Math.max(root[0], end[0]) + hb + 1, Math.max(root[1], end[1]) + hb + 1);
    tool = () => {
      g.limb(root[0], root[1], end[0], end[1], bw, M, { shade: 1 });
      const ex = R(end[0] - hb), ey = R(end[1]);
      if (facing === 'down') { g.rect(ex - 1, ey - 3, bw + 2, 4, M.light); g.rect(ex, ey - 2, bw, 2, K.dark); }        // the muzzle looks at the camera
      else if (facing === 'side') g.rect(R(end[0]) - 2, R(end[1] - hb) - 1, 2, bw + 2, M.light);                       // a collar round the muzzle
      else g.rect(ex - 1, ey, bw + 2, 2, M.light);
    };
  } else if (kind === 'saw') {
    // the blade stands across the arm, facing forward: a disc of the machine's own space, a full circle when it comes at the camera and
    // a sliver when it is seen from the side, as the projector makes it
    const r = Math.max(3, L * 0.6), c0 = Math.max(r + 2, axis + 1 - droop), far2 = ma + 7 + th + 0.3 * L, C = pt(far2, mb, c0), eb = pt(far2, mb + r, c0), ec = pt(far2, mb, c0 + r);
    const rx = Math.max(Math.abs(eb[0] - C[0]), Math.abs(ec[0] - C[0]), 1.2), ry = Math.max(Math.abs(eb[1] - C[1]), Math.abs(ec[1] - C[1]), 1.2);
    tip = pt(far2 + 1, mb, c0);
    const teeth = 8, wheel = toothedIn(0, 0, r, teeth, Math.min(1.8, r * 0.36), (work * TAU) / (teeth * 2), 'saw');
    const blade = (px, py) => wheel(((px - C[0]) * r) / rx, ((py - C[1]) * r) / ry);
    grow(E, Math.min(root[0], C[0] - rx) - 2, Math.min(root[1], C[1] - ry) - 1, Math.max(root[0], C[0] + rx) + 2, Math.max(root[1], C[1] + ry) + 1);
    const arm = () => g.limb(root[0], root[1], C[0], C[1], 2, flatDark(K), { shade: 0 });
    const disc = () => {
      if (rx < 2) {
        // edge on: a steel bar with its teeth along the leading edge, stepping as it turns
        const x = R(C[0]) - 1, y0 = R(C[1] - ry), n = Math.max(2, R(2 * ry)), lead = facing === 'side' ? x + 2 : x - 1;
        g.rect(x, y0, 2, n, { light: M.light, base: M.light, dark: M.base }, { shade: 1 });
        for (let i = ((work % 2) + 2) % 2; i < n; i += 2) g.dot(lead, y0 + i, M.base);
        g.rect(x, R(C[1]) - 1, 2, 2, A.base);
        return;
      }
      g.fill(C[0] - rx - 1, C[1] - ry - 1, C[0] + rx + 1, C[1] + ry + 1, blade, { light: M.light, base: M.light, dark: M.base }, { shade: 1 });
      const a = (work * TAU) / 8;                                                  // a slot in the blade, turning with it
      g.line(C[0], C[1], C[0] + Math.cos(a) * rx * 0.62, C[1] + Math.sin(a) * ry * 0.62, M.dark);
      g.rect(Math.floor(C[0]) - 1, Math.floor(C[1]), 2, 1, A.base);
    };
    tool = facing === 'up' ? () => { disc(); arm(); } : () => { arm(); disc(); };
  } else {
    const aw = ma + 1 + th + L * 0.45, c0 = axis - droop * 0.5, c1 = axis - droop;
    const grip = o.grip ?? [0, 1, 2, 1][((Math.floor(work / 2) % 4) + 4) % 4];
    const wrist = pt(aw, mb, c0);
    tip = pt(far, mb, c1);
    const fingers = [-1, 1].map((s) => ({ s, knuckle: pt(aw + L * 0.32, mb + s * (2.2 + grip * 0.9), c0), end: pt(far, mb + s * (0.7 + grip * 0.8), c1) }));
    for (const f of fingers) grow(E, Math.min(root[0], f.knuckle[0], f.end[0]) - 2, Math.min(root[1], f.knuckle[1], f.end[1]) - 2, Math.max(root[0], f.knuckle[0], f.end[0]) + 2, Math.max(root[1], f.knuckle[1], f.end[1]) + 2);
    tool = () => {
      g.limb(root[0], root[1], wrist[0], wrist[1], 3, flatDark(K), { shade: 0 });
      for (const f of fingers) {                                                    // the far pincer first
        g.limb(wrist[0], wrist[1], f.knuckle[0], f.knuckle[1], 2, M, { shade: 0 });
        g.limb(f.knuckle[0], f.knuckle[1], f.end[0], f.end[1], 2, { light: M.light, base: M.light, dark: M.base }, { shade: 1 });
      }
      g.rect(Math.floor(wrist[0]) - 1, Math.floor(wrist[1]) - 1, 2, 2, A.base);
    };
  }
  if (g) { if (facing === 'down') { housing(); tool(); } else { tool(); housing(); } }
  return { hand: [(HV.x0 + HV.x1) / 2, HV.top], tip, box: E, z: HV.z };
}

/** What botPack() can stand on a rear deck: siren (a warning lamp on a dark base, which turns and flashes), exhaust (two steel stacks). No arguments: a frozen list. */
export const BOT_PACKS = Object.freeze(['siren', 'exhaust']);

/**
 * Draws what a machine carries on its rear deck, placed by a projector so it is right for any direction. kind is one of BOT_PACKS. Returns { lamp ([x, y]: the middle of the siren's lamp, or null), vents ([[x, y], ...]: the mouth of each exhaust stack, where its smoke starts), box ([x0, y0, x1, y1]: what it covers, the last column and row not included), z }.
 * Arguments: g (the Surface, or null to measure it without drawing); kind (one of BOT_PACKS); at ((a, b, c) => [x, y, z], as boxView takes it); o { mount ([a, b, c]: where it stands, on the deck), size (a multiplier, default 1), level (the siren: 0 off, 0.5 dim, 1 lit, 2 flashing), spin (a whole number that goes up as the siren's lamp turns), hot (true: the mouths of the stacks glow), metal, dark (ramps), colours (the light's colour steps, hottest first), seam (a colour: darkens what it sits on) }.
 */
export function botPack(g, kind, at, o = {}) {
  if (!BOT_PACKS.includes(kind)) throw new Error(`groundbot.botPack: no pack "${kind}"; packs: ${BOT_PACKS.join(', ')}`);
  const [ma, mb, mc] = o.mount ?? [0, 0, 0], size = o.size ?? 1, M = o.metal ?? ramp('#c2c9d6'), K = o.dark ?? ramp('#434d6d'), L = o.colours ?? RED;
  const E = newBox(), z = at(ma, mb, mc)[2];
  if (kind === 'siren') {
    const V = boxView(at, { a: ma, b: mb, c: mc, len: 5, wide: 5, tall: 1 }), q = at(ma, mb, mc + 1);
    const d = Math.max(3, R(4.6 * size)), r = d % 2 ? (d - 1) / 2 + 0.4 : d / 2, cx = d % 2 ? Math.floor(q[0]) + 0.5 : R(q[0]), cy = R(q[1]) - d / 2 + 1;
    grow(E, V.x0, V.top, V.x1, V.bottom); grow(E, cx - d / 2, cy - d / 2, cx + d / 2, cy + d / 2);
    if (g) {
      const level = o.level ?? 1, spin = ((R(o.spin ?? 0) % 4) + 4) % 4;
      armourBlock(g, { ...V, inset: 0, paint: flatDark(K), seam: o.seam });
      const glass = level >= 1.5 ? { light: L[0], base: L[1], dark: L[2] } : level >= 0.75 ? { light: L[2], base: L[3], dark: L[4] } : level >= 0.25 ? { light: L[3], base: L[4], dark: L[4] } : { light: K.light, base: K.base, dark: K.base };
      g.ellipse(cx, cy, r, r, glass, { shade: 1 });
      // the reflector turns inside the glass: a bright bar that crosses it and comes back
      if (level >= 0.75 && d >= 4) g.rect(Math.floor(cx) + [-1, 0, 1, 0][spin] - (d % 2 ? 0 : 1) + (spin === 3 ? 0 : 0), Math.floor(cy - d / 2) + 1, 1, Math.max(1, d - 2), glass.light);
    }
    return { lamp: [Math.floor(cx), Math.floor(cy)], vents: [], box: E, z };
  }
  const w = Math.max(2, R(2.4 * size)), h = Math.max(3, R(5.5 * size));
  const stacks = [[ma, mb - 1.5], [ma + 3, mb + 2]].map(([a, b]) => at(a, b, mc)).sort((p, q) => p[2] - q[2]);
  const vents = [];
  for (const [x, y] of stacks) {
    const sx = R(x - w / 2), sy = R(y);
    grow(E, sx - 1, sy - h, sx + w + 1, sy);
    vents.push([sx + w / 2, sy - h - 1]);
    if (!g) continue;
    g.rect(sx - 1, sy - 1, w + 2, 1, flatDark(K), { shade: 0 });                   // its flange on the deck
    g.rect(sx, sy - h, w, h - 1, M, { shade: 1 });
    g.rect(sx, sy - h, w, 1, o.hot ? L[3] : M.light);
    g.rect(sx, sy - h + 1, w, 1, K.dark);                                           // the dark of its mouth, seen from above
  }
  return { lamp: null, vents, box: E, z };
}
