// Scout drone: a small flying machine with one red eye, seen from the top-down camera and always facing it. The float
// is the rig's (hover() in rigs/creature-topdown.js), the rotors are the framework's (rotor() in engine/mech.js), the
// hazard stripes are stripesIn() of engine/solids.js and its break-up uses engine/breaking.js. What is the drone's own
// is here: the three hulls, the lenses, the weapon and wings parts, and what it does in each clip (hover, alert, shoot,
// recoil, and a death in which it spins out one way round, keels over and falls apart).
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, keys, easeOut, PI } from '../engine/motion.js';
import { ramp, tone, INK } from '../engine/color.js';
import { Surface, ellipseIn, polyIn, tilt, blitInside } from '../engine/surface.js';
import { glow, particles, starburst, steps } from '../engine/fx.js';
import { fragments, restInRow, drawFragmentApart } from '../engine/breaking.js';
import { rotor } from '../engine/mech.js';
import { stripesIn } from '../engine/solids.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import * as K from '../rigs/creature-topdown.js';

const P = PALETTE.derelict;
const CX = 24, CY = 22, FLOOR = 41;                      // the hull floats round (CX, CY); FLOOR is the row its pieces come to rest on
const LOWEST = 45, WIDEST = 20;                          // nothing is drawn below row LOWEST, and no fin reaches further than WIDEST px from the middle column
const HULLS = [...swatchesBetween('derelict', ['wall', 'metal'], { lead: 'panel', min: 0.45 }).slice(0, 3), P.suit];   // panel, hull, steel, suit: greys and white, a machine
const STRIPES = swatches('derelict', 'accent', { lead: 'amber' }).filter((c) => !HULLS.includes(c));
const LIGHTS = swatches('derelict', 'glow', { lead: 'red' });
const GUNS = ['blaster', 'stinger'];
const F5 = (n) => n / 5, F7 = (n) => n / 7;              // frame n of a 6-frame and of an 8-frame one-shot
const SPIN = [0, 0.5, 0.95, 1.35];                       // radians the dying drone has turned on frames 0 to 3: short of a quarter turn in all, so its two arms never seem to swing back; from frame 3 on it holds that turn
const KEEL = [0.1, 0.3];                                 // how far it has keeled over on frame 1 and from frame 3 on (radians)

/** Everything about one frame: where the hull is, how it is pitched, and what the clip is doing. */
function frameOf(clip, t, p) {
  const k = lerp(0.9, 1.2, p.size);
  // dy: the hull moved down; pitch: tipped toward the camera (more face, less top); yaw: turned about its upright axis (its left side comes
  // toward the camera); flare: the eye flaring; fire: the shot; fall: the death
  const S = { dy: 0, dx: 0, pitch: 0, yaw: 0, flare: 0, fire: -1, lit: 1, flash: false, fall: -1, spin: true };
  if (clip === 'idle') {
    const H = K.hover(t, { bob: p.bob });
    S.dy = -Math.round(H.lift);
    S.dx = Math.round(H.lean * 0.6 * p.bob);
    S.lit = t >= 0.74 && t < 0.86 ? 0.4 : 1;              // the eye flickers once a loop
  } else if (clip === 'alert') {
    // 0 hovering, 1 startled: it jumps and the eye flares, 2 to 4 it tips toward the player and stares, 5 hovering
    S.dy = Math.round(keys(t, [[0, 0], [F5(1), -3], [F5(2), 2], [F5(4), 1], [1, 0]]));
    S.pitch = keys(t, [[0, 0], [F5(1), -0.3], [F5(2), 1], [F5(4), 1], [1, 0]]);
    S.flare = keys(t, [[0, 0], [F5(1), 1], [F5(2), 0.75], [F5(3), 0.9], [F5(4), 0.5], [1, 0]]);
  } else if (clip === 'shoot') {
    // 0 aims (tipped forward), 1 fires, 2 kicked back 2 px, 3 to 4 recovers, 5 hovering
    S.pitch = keys(t, [[0, 0.7], [F5(1), 1], [F5(2), -0.4], [F5(4), 0.2], [1, 0]]);
    S.dy = Math.round(keys(t, [[0, 1], [F5(1), 1], [F5(2), -2], [F5(3), -1], [1, 0]]));
    S.fire = t >= F5(1) - 0.01 && t <= F5(2) + 0.01 ? (t - F5(1)) / F5(1) : -1;
    S.flare = keys(t, [[0, 0.3], [F5(1), 0.8], [F5(2), 0.3], [1, 0]]);
  } else if (clip === 'hurt') {
    S.dy = Math.round(keys(t, [[0, -3], [1 / 3, 2], [2 / 3, -1], [1, 0]]));
    S.dx = Math.round(keys(t, [[0, -1], [1 / 3, 1], [1, 0]]));
    S.pitch = keys(t, [[0, -0.8], [1 / 3, 0.5], [1, 0]]);
    S.lit = t < 0.5 ? 0.4 : 1;
    S.flash = t < 0.2;
  } else if (clip === 'die') {
    // 0 the hit (white), 1 to 3 it sparks and spins out as it drops, always the same way round, 4 it breaks in three as it is (turned and keeled over), 5 to 6 the pieces fall, 7 they lie still
    S.fall = t;
    S.lit = t < F7(2) ? 0.4 : 0;
    S.spin = t < F7(4) - 0.01;                            // the rotors run until it breaks up
    S.yaw = SPIN[Math.min(Math.round(t * 7), SPIN.length - 1)];
    S.dy = Math.round(keys(t, [[0, -2], [F7(1), 0], [F7(3), 7], [1, 7]], (x) => x * x));
    S.pitch = keys(t, [[0, -0.6], [F7(2), 0.6], [1, 0.6]]);
    S.flash = t < 0.1;
  }
  const w = 9 * k, top = Math.max(2, (5 - 2 * S.pitch) * k), face = Math.max(3, (8 + 2 * S.pitch) * k);
  const gun = !GUNS.includes(p.weapon) ? 0 : (p.weapon === 'blaster' ? 5 : 7) * p.weaponLength * k;
  const tall = Math.round(top) + Math.round(face) - 1 + Math.round(gun);                                   // rows from the top of the hull to the weapon's tip, with its outline
  // a big drone with a long weapon does not drop as far when it dies, so its tip stays 2 px inside the frame
  const x = CX + S.dx, y0 = Math.min(Math.round(CY + S.dy - 6.5 * k), LOWEST - tall), split = y0 + Math.round(top), y1 = split + Math.round(face);
  return { k, S, x, w, y0, split, y1, eye: { x, y: Math.round((split + y1) / 2) }, mount: { x, y: y1 - 1 }, gun, tip: { x, y: y1 - 1 + gun } };
}

/** The shape test of the whole hull, and of its top face alone. */
function hullOf(shape, { x, w, y0, split, y1 }) {
  if (shape === 'box') {
    const whole = polyIn([[x - w + 2, y0], [x + w - 2, y0], [x + w, split], [x + w, y1 - 2], [x + w - 2, y1], [x - w + 2, y1], [x - w, y1 - 2], [x - w, split]]);
    return { whole, top: (px, py) => py < split && whole(px, py), seam: () => split };
  }
  if (shape === 'wedge') {
    // a dart with its nose toward the camera
    const whole = polyIn([[x - w, y0 + 2], [x - w + 3, y0], [x + w - 3, y0], [x + w, y0 + 2], [x + w - 1, split], [x + 4, y1], [x - 4, y1], [x - w + 1, split]]);
    return { whole, top: (px, py) => py < split && whole(px, py), seam: () => split };
  }
  const cy = (y0 + y1) / 2, ry = (y1 - y0) / 2, whole = ellipseIn(x, cy, w, ry);
  const seam = (px) => split + 1.6 * (1 - ((px - x) / w) ** 2);              // the join sags toward the camera, as a ring round a ball does
  return { whole, top: (px, py) => py < seam(px) && whole(px, py), seam };
}

/** The weapon part, hanging under the hull from its mount and pointing at the camera. */
function drawWeapon(g, at, { kind, length, k, metal, lit }) {
  const D = ramp(P.plate), x = Math.round(at.x);
  if (kind === 'blaster') {
    // a stubby barrel seen from in front and above: a dark tube and a bright muzzle ring round the bore
    const w = Math.max(2, Math.round(2.2 * k)), end = Math.round(at.y + length);
    g.rect(x - w, at.y - 2, 2 * w, length + 2, D, { shade: 1 });
    g.rect(x - w, end - 3, 2 * w, 3, metal, { shade: 0 });
    g.rect(x - w + 1, end - 2, 2 * w - 2, 1, lit);                                                    // the bore, lit by the charge inside
  } else if (kind === 'stinger') {
    g.ellipse(x, at.y + 1, 2.5 * k, 2, D, { shade: 1 });
    g.rect(x - 1, at.y, 2, length, metal, { shade: 1 });
    g.rect(x - 1, Math.round(at.y + length) - 2, 2, 2, lit);                                          // the charged tip
  }
}

/** The wings part: what carries the drone. Called twice, behind the hull and in front of it. */
function drawWings(g, layer, { kind, span, k, beat, spin, yaw = 0, F, hull, trim }) {
  const { x, w, y0, split, y1 } = F, steel = ramp(P.steel), dark = ramp(P.plate);
  // a thing fixed r px out on side s (-1 left, 1 right) swings round the hull as the drone turns: `across` is how far out it still shows,
  // `toward` how far it has come toward the camera (down the picture; under 0 it has gone behind the hull)
  const across = (s, r) => s * r * Math.cos(yaw), toward = (s, r) => -s * r * Math.sin(yaw);
  const behind = (s) => toward(s, 1) < -0.01, before = (s) => toward(s, 1) > 0.01;
  if (kind === 'rotors') {
    const r = 3.8 * span * k, hub = 7 * k + r, ry = y0;
    for (const s of [-1, 1]) {
      const hx = x + across(s, hub), hy = ry + toward(s, hub) * 0.45;
      if (layer === (before(s) ? 'front' : 'back')) g.limb(x + across(s, w - 2), split - 1 + toward(s, 2), hx, hy + 1, 2, dark, { shade: 0 });
      if (layer === (behind(s) ? 'back' : 'front')) rotor(g, hx, hy, r, { beat: beat + (s > 0 ? 1 : 0), flat: 0.5, colour: P.steel, hub: trim, still: !spin, turn: 0.5 * s + yaw });
    }
  } else if (kind === 'fins') {
    const reach = w + 7 * span * k * Math.min(1, (WIDEST - w) / (7 * 1.35 * k));                               // on the biggest hulls the fins are cut down to fit the frame
    for (const s of [-1, 1]) {
      if (layer !== (before(s) ? 'front' : 'back')) continue;
      const X = (r) => x + across(s, r), sag = (r) => toward(s, r) * 0.3;                                       // a fin that points at the camera hangs down the picture
      g.poly([[X(w - 2), split - 2], [X(reach), split + 3 + sag(reach)], [X(reach - 1), split + 5 + sag(reach)], [X(w - 2), y1 - 2]], hull, { shade: 1 });
      g.poly([[X(reach - 3.5), split + 1.4 + sag(reach)], [X(reach), split + 3 + sag(reach)], [X(reach - 1), split + 5 + sag(reach)], [X(reach - 4.5), split + 4.6 + sag(reach)]], trim, { shade: 0 });
    }
  } else if (kind === 'ring') {
    const rx = w + 5 * span * k, ry = rx * 0.42, cy = split + 1;
    const near = layer !== 'back';
    g.blob([ellipseIn(x, cy, rx, ry)], steel, { shade: 1, minus: [ellipseIn(x, cy, rx - 2, ry - 1.6)], clip: (px, py) => (py >= cy) === near });
    for (const s of [-1, 1]) if (near !== behind(s)) g.rect(Math.round(x + across(s, rx - 1)) - 1, Math.round(cy + toward(s, ry - 1)) - 1, 2, 3, trim);   // the two lugs ride round the ring
  }
}

/** The lens: one of three kinds, in a dark housing on the face. narrow: under 1 when the face is turned aside and the lens is seen at a slant. */
function drawEyes(g, at, { kind, k, light, lit, flare, narrow = 1 }) {
  const housing = ramp(P.plate).dark, on = lit > 0.7 ? light : tone(light, -1.2), x = Math.round(at.x), y = at.y;
  if (kind === 'visor') {
    const w = Math.round(6 * k * narrow);
    g.rect(x - w, y - 2, 2 * w, 4, housing);
    g.rect(x - w + 1, y - 1, 2 * w - 2, 2, on);
    if (lit > 0.7) g.rect(x + 1, y - 1, 2 + Math.round(flare), 1, '#ffffff');
  } else if (kind === 'triple') {
    for (const [dx, dy] of [[-4, -1], [4, -1], [0, 1]]) {
      const ex = x + Math.round(dx * k * narrow), ey = y + dy;
      g.rect(ex - 2, ey - 2, 4, 4, housing);
      g.rect(ex - 1, ey - 1, 2, 2, on);
      if (lit > 0.7 && flare > 0.5) g.dot(ex, ey - 1, '#ffffff');
    }
  } else {
    const r = Math.max(2.2, 2.7 * k);
    g.ellipse(x, y, (r + 1.3) * narrow, r + 1.3, housing, { shade: 0 });
    g.ellipse(x, y, (r - 0.2 + 0.6 * flare) * narrow, r - 0.2 + 0.6 * flare, on, { shade: 0 });
    if (lit > 0.7) { g.rect(x, y - 2, 1 + Math.round(flare), 1, '#ffffff'); g.dot(x + 1, y - 1, '#ffffff'); }
  }
}

/** The whole drone, without its outline. */
function drawDrone(g, F, p, frame) {
  const { k, S } = F, hull = ramp(p.body), H = hullOf(p.shape, F);
  const metal = ramp(P.steel), lit = S.lit > 0.7 ? p.glow : tone(p.glow, -1.2);
  if (p.wings !== 'none') drawWings(g, 'back', { kind: p.wings, span: p.wingSpan, k, beat: frame, spin: S.spin, yaw: S.yaw, F, hull, trim: p.accent });
  if (F.gun) drawWeapon(g, F.mount, { kind: p.weapon, length: Math.round(F.gun), k, metal, lit });
  // the hull: a lit top, a face in the base tone with its shadow, and the hazard band along the front edge of the top
  g.blob([H.whole], hull, { shade: 1 });
  g.blob([H.top], { base: hull.light, dark: hull.light, light: hull.light }, { shade: 0 });
  const band = Math.max(3, Math.round(3.2 * k));
  const tape = (px, py) => H.whole(px, py) && py < H.seam(px) && py >= H.seam(px) - band;
  g.blob([tape], P.plate, { shade: 0 });
  g.blob([stripesIn(tape, { pitch: 6, slant: 1, duty: 0.5, phase: F.x + F.y0 + Math.round(S.yaw * 4.2) })], p.accent, { shade: 0 });   // fixed to the hull: the stripes ride its bob, and slide round with it when it turns
  for (let px = Math.floor(F.x - F.w); px <= F.x + F.w; px++) { const sy = Math.floor(H.seam(px + 0.5)); if (H.whole(px + 0.5, sy + 0.5)) g.dot(px, sy, hull.dark); }
  drawEyes(g, { x: F.eye.x + Math.sin(S.yaw) * F.w * 0.55, y: F.eye.y }, { kind: p.eyes, k, light: p.glow, lit: S.lit, flare: S.flare, narrow: Math.max(0.4, Math.cos(S.yaw)) });   // as it turns the lens slides to the side and narrows
  if (p.wings === 'none') return;
  // a wing that has swung round in front of the hull is inked on a layer of its own, so that it stands off the hull behind it
  const near = S.yaw ? new Surface(g.w, g.h) : g;
  drawWings(near, 'front', { kind: p.wings, span: p.wingSpan, k, beat: frame, spin: S.spin, yaw: S.yaw, F, hull, trim: p.accent });
  if (near !== g) g.blit(near.outline(INK));
}

export default defineSprite({
  id: 'scout-drone',
  name: 'Scout drone',
  kind: 'Creature',
  blurb: 'A small flying security machine with a red eye: it hovers, spots the player, shoots and falls apart in three pieces. Change its hull, lens, weapon, wings and colours.',
  meta: {
    type: 'creature', role: 'characters/enemy', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['drone', 'robot', 'machine', 'scout', 'flying', 'hover', 'rotor', 'sentry', 'alert', 'shoot', 'enemy', 'security', 'patrol'], license: 'draft',
  },
  size: K.SIZE,
  pivot: [24, 24],
  grounded: false,
  preview: 'idle',
  sounds: {
    alert: [{ sound: 'tech-click', frame: 0, preset: 'Confirm', volume: 0.6 }],
    shoot: [{ sound: 'laser-shot', frame: 1, preset: 'Pew', volume: 0.7, when: { weapon: GUNS } }],
    hurt: [{ sound: 'bolt-impact', frame: 0, preset: 'On metal', volume: 0.9 }],
    die: [{ sound: 'bot-shutdown', frame: 0, preset: 'Drone down', volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    shape: choice('Shape', 'round', ['round', 'wedge', 'box']),
    eyes: choice('Eyes', 'single', ['single', 'visor', 'triple']),
    // weapon
    weapon: choice('Weapon', 'blaster', [...GUNS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // wings
    wings: choice('Wings', 'rotors', ['rotors', 'fins', 'ring', 'none']),
    wingSpan: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    body: color('Body', P.panel, HULLS),
    accent: color('Stripes', P.amber, STRIPES),
    glow: color('Light', P.red, LIGHTS),
    bob: range('Float', 0.5, { lo: 'Still', hi: 'Floaty', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
    wings: { label: 'Wings', params: ['wings', 'wingSpan'], none: 'none', socket: 'back' },
  },
  clips: K.clips((p) => p.speed, [{ name: 'idle', label: 'Hover' }, { name: 'alert', frames: 6, fps: 10 }, 'shoot', 'hurt', 'die']),

  // hand: where the weapon hangs. muzzle: its tip (the shot leaves toward the camera). back: the top of the hull, where the wings are fixed
  sockets(clip, t, p) {
    const F = frameOf(clip, t, p);
    return { hand: { ...F.mount, angle: 0 }, muzzle: { ...F.tip, angle: 0 }, back: { x: F.x, y: F.y0, angle: PI } };
  },

  render(g, { clip, t, frame, p }) {
    const F = frameOf(clip, t, p), { S, k } = F;
    const C = steps(p.glow, { core: P.cream }), sparks = steps(P.amber, { core: P.cream });
    if (S.fall < F7(1) - 0.01) drawDrone(g, F, p, frame);
    else {
      // dying: the whole machine on a layer of its own. It keels over as it turns, further every frame and always to the same side (the
      // biggest drone still does so inside the frame), and it is that turned, keeled machine which breaks in three
      const whole = new Surface(g.w, g.h), posed = new Surface(g.w, g.h);
      drawDrone(whole, F, p, frame);
      blitInside(posed, tilt(whole, F.x, (F.y0 + F.y1) / 2, lerp(KEEL[0], KEEL[1], clamp((S.fall - F7(1)) / F7(2)))));
      if (S.fall < F7(4) - 0.01) g.blit(posed);
      else {
        const u = clamp((S.fall - F7(4)) / F7(3)), pieces = fragments(posed, 3, { seed: 5 });
        const rest = restInRow(pieces, { lo: 2, hi: g.w - 3, gap: 3 });
        pieces.forEach((f, i) => {
          // each piece is thrown toward its own place on the floor, falls, and stops when it gets there
          const dx = Math.round(lerp(Math.sign(rest[i]), rest[i], easeOut(u)));
          const drop = FLOOR - f.y1, dy = Math.min(drop, Math.round(1 + (drop + 4) * u * u * 1.6 - 3 * Math.sin(PI * Math.min(1, u * 1.5)) * (1 - u)));
          drawFragmentApart(g, f, dx, Math.max(0, dy), { cut: true });   // a piece that lands against another keeps its own line
        });
      }
    }
    if (S.flash) g.tint('#ffffff');
    g.outline(INK);

    // light, after the outline
    const eye = F.eye;
    if (S.flare > 0.45 && clip === 'alert') {
      // the eye flares: a hot disc with four short rays
      const r = (2.2 + 2.6 * S.flare) * k;
      starburst(g, { x: eye.x + 0.5, y: eye.y + 0.5, count: 4, r0: r, r1: r + 3.5 * S.flare * k, width: 1.2, turn: 0, colour: C[2], rim: C[4], box: [2, 2, g.w - 2, g.h - 2] });
      glow(g, eye.x + 0.5, eye.y + 0.5, r, C, { box: [2, 2, g.w - 2, g.h - 2] });
    }
    if (S.fire >= 0 && S.fire < 0.5 && F.gun) glow(g, F.tip.x, F.tip.y + 2, 3.4 * k, C, { box: [2, 2, g.w - 2, g.h - 2] });   // the muzzle flash, on frame 1
    if (S.fall >= F7(1) - 0.01) {
      const u = clamp((S.fall - F7(1)) / F7(6));
      // sparks, gone by the last frame: what stays is the three pieces
      if (u < 0.9) particles(g, { t: u, x: F.x, y: Math.min(F.y0 + 4, FLOOR - 4), count: 9, seed: 9, loop: false, stagger: 0.5, angle: PI, arc: 4, dist: 12, gravity: 9, size: 3.2, colours: sparks, box: [2, 2, g.w - 2, FLOOR + 1] });
    }
  },
});
