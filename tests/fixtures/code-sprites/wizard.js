// FROZEN COPY, not a sprite: sprites/wizard.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Wizard: a robed spell-caster built on the shared humanoid rig.
// What makes it not-the-Hero: a long robe that hides the legs and sways, wide
// sleeves, a pointed hat, a beard, and a staff planted on the ground whose orb
// glows. `cast` replaces the sword attack.
// Parts (docs/architecture.md, Contract 3): the staff, the hat and the beard. The staff has settings of its own:
// which top it has, how long it is, and the angle it is held at.
// `die`, `victory` and `talk` are the rig's standard poses, re-posed like the others so the hand never leaves the staff.
import { defineSprite, range, choice, color, SKIN, HAIR, CLOTH } from '../../../engine/sprite.js';
import { lerp, clamp, pulse, keys, reach, fract, hash, smooth, PI, TAU } from '../../../engine/motion.js';
import * as H from '../../../rigs/humanoid.js';
import { ramp, farRamp, tone, col, pick, INK } from '../../../engine/color.js';

const MAGIC = ['#4fd8ee', '#6fe86a', '#f4e04a', '#ff8a3c', '#ff5a8a', '#b98cff'];
const TILT = PI - 0.3;                 // resting staff angle: almost upright, top a little forward
const HOLD = { a: 0.7, e: 0.85 };      // resting staff arm: hand held out in front, clear of the face
const LOOPS = { idle: true, walk: true, run: true, victory: true, talk: true };

/**
 * The rig's pose, re-posed so the near arm carries a staff, plus a custom `cast`.
 * tilt is the staff's resting angle: TILT plus the staff's own Hold angle setting, which is added in every clip.
 * S is what `die` needs to lay him down inside the frame: { above: the staff's length above the hand, clear: the room its
 * top needs, hat: how far the hat reaches above the middle of the head }.
 */
function wizPose(clip, t, m, d, tilt = TILT, S = { above: 16, clear: 3, hat: 0 }) {
  const P = H.pose(clip === 'cast' ? 'idle' : clip, clip === 'cast' ? 0 : t, m, d);
  const off = tilt - TILT;
  P.armF.a = HOLD.a; P.armF.e = HOLD.e; P.item = tilt;
  P.staffUp = 0;       // how far the staff is lifted through the hand, in pixels
  P.billow = 0;        // 0..1: robe flares out (falling, lunging)
  switch (clip) {
    case 'walk': {
      // the staff works like a walking stick: lifted and swung forward, then planted
      const c = Math.cos(TAU * t);
      P.armF.a = HOLD.a - 0.16 * c;
      P.item = tilt - 0.2 * c;
      P.staffUp = 2 * Math.max(0, Math.sin(TAU * t));
      break;
    }
    case 'run': {
      const c = Math.cos(TAU * t);
      P.armF.a = 0.7 - 0.2 * c; P.armF.e = 1.0;
      P.item = 2.5 + off + 0.1 * c;
      P.staffUp = 3;
      P.billow = 0.6;
      break;
    }
    case 'jump': {
      P.lift *= 0.8;   // robes are heavy
      P.armB.a *= 0.55;   // the free hand lifts the robe a little instead of flying up past the face
      P.armF.a = keys(t, [[0, HOLD.a], [0.18, 0.45], [0.42, 1.25], [0.62, 1.1], [0.84, 0.55], [1, HOLD.a]]);
      P.armF.e = keys(t, [[0, HOLD.e], [0.18, 1.2], [0.42, 0.7], [0.62, 0.8], [0.84, 1.1], [1, HOLD.e]]);
      P.item = keys(t, [[0, tilt], [0.18, tilt - 0.15], [0.42, 2.45 + off], [0.62, 2.55 + off], [0.84, tilt - 0.1], [1, tilt]]);
      P.billow = keys(t, [[0, 0], [0.3, 0], [0.5, 0.4], [0.7, 1], [0.84, 0.3], [1, 0]]);
      break;
    }
    case 'cast': {
      const wind = keys(t, [[0, 0], [0.28, 1], [0.43, 1], [0.57, 0], [1, 0]]);
      const thr = keys(t, [[0, 0], [0.43, 0], [0.57, 1], [0.75, 0.9], [1, 0]]);
      P.armF.a = HOLD.a - 0.1 * wind + 0.65 * thr;
      P.armF.e = HOLD.e + 0.65 * wind - 0.6 * thr;
      P.item = tilt + 0.12 * wind - 0.5 * thr;
      P.armB.a = keys(t, [[0, -0.15], [0.28, 0.9], [0.43, 1.0], [0.57, -0.7], [0.75, -0.6], [1, -0.15]]);
      P.armB.e = 0.2 + 0.7 * wind + 0.2 * thr;
      P.lean = -0.12 * wind + 0.2 * thr;
      P.headTilt = -0.1 * wind + 0.1 * thr;
      P.rootX = -1 * wind + 1.5 * thr;
      P.crouch = 0.6 * wind + 1.6 * thr;
      P.footF = { x: 1.5 + 3 * thr - P.rootX, y: -1.5 * pulse(clamp((t - 0.43) / 0.14)) };
      P.footB = { x: -1.5 - P.rootX, y: 0 };
      P.glow = keys(t, [[0, 0], [0.28, 0.6], [0.43, 1], [0.57, 1], [0.75, 0.5], [1, 0]]);
      P.sway = keys(t, [[0, 0], [0.3, 0.6], [0.5, -0.3], [0.62, -1], [0.8, 0.4], [1, 0]]);
      P.billow = 0.5 * thr;
      P.blink = false;
      break;
    }
    case 'hurt': {
      // the body reels back but the hand keeps hold of the planted staff
      const h = keys(t, [[0, 0.6], [0.33, 1], [1, 0.2]]);
      P.armF.a = HOLD.a + 0.4 * h; P.armF.e = HOLD.e - 0.3 * h;
      P.item = tilt - 0.25 * h;
      break;
    }
    case 'talk': {
      // the staff stays planted. The free hand is mostly hidden behind the staff arm, so the wizard makes his points with the
      // staff as well: on each beat it tips forward a little and its light swells
      const rest = H.pose('idle', 0, m, d).armB.a, point = P.armB.a - rest;      // 0 at rest, so the clip still starts on the idle pose
      P.armB.a = rest + 1.25 * point; P.armB.e = 0.2;                            // held straight out, to show past the staff
      P.point = point;                                                           // how far out it is: drawn in front of the staff when it is
      P.item = tilt - 0.09 * point;
      P.glow = 0.6 * clamp(point / 1.3);
      break;
    }
    case 'victory': {
      // the staff is lifted off the ground and held high, the orb flares; a smaller hop than the Hero's (robes are heavy)
      const up = keys(t, [[0, 0], [0.125, 0.3], [0.25, 0.85], [0.375, 1], [0.625, 1], [0.75, 0.8], [0.875, 0.35], [1, 0]]);
      const air = P.lift > 0 ? 1 : 0;
      P.lift *= 0.7;
      P.armF.a = HOLD.a + 0.75 * up; P.armF.e = HOLD.e - 0.35 * up;
      P.item = tilt + (PI - 0.06 - tilt) * up;
      P.staffUp = 4 * up;
      P.glow = 0.7 * up;
      P.billow = 0.5 * air * up;
      break;
    }
    case 'die': {
      // he goes over backward with the staff still in his hand: it stays planted while he falls, then tips forward
      // and comes to rest lying along him, its light going out
      const floor = H.GROUND - 1;
      const rest = H.solve(H.pose('die', 1, m, d), d).shoulder;                       // where the shoulder ends up
      const handY = floor - 1.5 - (S.clear - 3);                                      // the hand comes to rest low, on the staff; higher for a big staff top
      const aEnd = Math.acos(clamp((handY - rest[1]) / d.arm, -0.3, 1));
      P.armF.a = keys(t, [[0, HOLD.a + 0.25], [0.143, HOLD.a + 0.45], [0.286, 1.5], [0.429, 1.9], [0.571, 1.6], [0.714, lerp(1.6, aEnd, 0.6)], [1, aEnd]]);
      P.armF.e = keys(t, [[0, HOLD.e - 0.2], [0.286, 0.45], [0.571, 0.2], [0.857, 0], [1, 0]]);
      // lying, the staff points at the feet and a little up, by enough for its top to clear the ground
      const level = PI / 2 + Math.asin(clamp(1 / (S.above + 2.5), 0, 0.5)) + 0.03;
      P.item = keys(t, [[0, tilt - 0.15], [0.143, tilt], [0.286, tilt - 0.1], [0.429, Math.max(level, 2.45)], [0.571, Math.max(level, 2.0)], [0.714, level + 0.14], [0.857, level - 0.03], [1, level]]);
      // the end behind the hand never goes into the ground: as the hand sinks, the staff is turned level instead
      const hy = H.solve(P, d).armF.hand[1];
      P.item = Math.min(P.item, PI - Math.acos(clamp((floor - 0.5 - hy) / 9)));
      // the rig turns the head as he goes down, and the hat with it: it ends up pointing along the ground behind him.
      // The whole body gives way forward by whatever the hat would otherwise reach past the frame edge.
      const tipX = H.solve(P, d).head[0] - Math.sin(P.headTurn) * (S.hat + 2);
      if (tipX < 3) P.rootX += 3 - tipX;
      break;
    }
    default: break;
  }
  return P;
}

/** inside() test for a tapered capsule, so several can be filled as one shape. */
const capIn = (x0, y0, x1, y1, r0, r1) => {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
  return (px, py) => {
    const k = clamp(((px - x0) * dx + (py - y0) * dy) / len2);
    const r = r0 + (r1 - r0) * k;
    return (px - x0 - dx * k) ** 2 + (py - y0 - dy * k) ** 2 <= r * r;
  };
};

/** A wide sleeve over one arm: flares toward the wrist and hangs open below it. */
function sleeve(g, A, d, cloth, cuff, skin, rim, floorY = Infinity) {
  const [sx, sy] = A.shoulder, [ex, ey] = A.elbow, [hx, hy] = A.hand;
  const w = d.armW / 2;
  const wx = lerp(ex, hx, 0.75), wy = lerp(ey, hy, 0.75);
  const upper = capIn(sx, sy, ex, ey, w + 0.3, w + 0.6);
  const fore = capIn(ex, ey, wx, wy, w + 0.6, w + 1.3);
  const drop = capIn(wx, wy, wx - 0.5, wy + 2.6, w + 0.9, 0.9);
  const all = (px, py) => py < floorY && (upper(px, py) || fore(px, py) || drop(px, py));      // floorY: nothing hangs below the ground when he lies on it
  const x0 = Math.min(sx, ex, hx) - 5, y0 = Math.min(sy, ey, hy) - 5, x1 = Math.max(sx, ex, hx) + 5, y1 = Math.max(sy, ey, hy) + 7;
  g.fill(x0, y0, x1, y1, all, cloth, rim ? { outline: rim } : {});
  // trim on the open end of the sleeve
  const fl = Math.hypot(hx - ex, hy - ey) || 1, ux = (hx - ex) / fl, uy = (hy - ey) / fl;
  g.fill(x0, y0, x1, y1, (px, py) => py < floorY && (fore(px, py) || drop(px, py)) && !all(px + ux, py + uy) && Math.hypot(px - wx, py - wy) < w + 3.2, cuff, { shade: 0 });
  g.limb(hx, hy, hx, hy, d.armW, skin, { shade: 0 });
}

/** The staff's resting angle: the Hold angle slider is in degrees, and forward is a smaller rig angle. */
const staffTilt = (p) => TILT - p.staffAngle * PI / 180;

// how far each staff top reaches beyond the edge of its light, in pixels (the crystal's point, the crook's curl)
const STAFF_REACH = { orb: 0, crystal: 1, crook: 2.5 };

/** How long the staff is above the hand, how much room its top needs around the middle of its light, and how far the hat reaches above the middle of the head. */
const staffSize = (p, d) => ({
  above: (d.arm * 0.4 + d.torso * 0.16 + d.headR * 1.25 + 4) * p.staffLength, clear: 3 + STAFF_REACH[p.staff],
  hat: d.headR * (p.hat === 'pointed' ? 2 : p.hat === 'crooked' ? 1.6 : p.hat === 'wide' ? 1.5 : 1) + (p.hat === 'hood' ? 2.2 : 5),
});

/**
 * The top of the staff, drawn from the end of the shaft, its direction, and its own settings.
 * centre and r are where the light sits and how big it is this frame (it grows while casting).
 */
function drawStaffTop(g, [tx, ty], angle, [cx, cy], r, { kind, wood, paint }) {
  if (kind === 'crystal') {
    // a cut gem, long along the staff, in a small wooden collar
    const [ax, ay] = reach(cx, cy, angle, r + 1), [bx, by] = reach(cx, cy, angle + PI, r + 0.5);
    const [lx, ly] = reach(cx, cy, angle + PI / 2, r - 0.6), [rx, ry] = reach(cx, cy, angle - PI / 2, r - 0.6);
    g.poly([[ax, ay], [lx, ly], [bx, by], [rx, ry]], paint, { light: 1 });
    const [qx, qy] = reach(tx, ty, angle + PI / 2, 1.6), [sx, sy] = reach(tx, ty, angle - PI / 2, 1.6);
    g.line(qx, qy, sx, sy, wood.dark);
    return;
  }
  if (kind === 'crook') {
    // the shaft curls forward over the light, like a shepherd's crook
    g.arc(cx, cy, r + 1.5, angle + PI - 0.5, angle + PI + 3.9, 1.6, wood.base);
    g.ellipse(cx, cy, r, r, paint, { light: 1 });
    return;
  }
  // orb: two prongs cradle a round light
  for (const s of [-1, 1]) {
    const [qx, qy] = reach(tx, ty, angle + s * 1.0, 3);
    g.line(tx, ty, qx, qy, wood.dark);
  }
  g.ellipse(cx, cy, r, r, paint, { light: 1 });
}

export default defineSprite({
  id: 'wizard',
  name: 'Wizard',
  kind: 'Character',
  blurb: 'A robed spell-caster with a glowing staff. Change the hat, beard, robe and magic.',
  meta: { type: 'character', role: 'characters/player', themes: ['fantasy', 'dungeon', 'forest'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['wizard', 'mage', 'sorcerer', 'magician', 'witch', 'spellcaster', 'necromancer', 'staff', 'magic', 'spell', 'cast', 'robe', 'hero'], license: 'draft' },
  size: H.SIZE,
  pivot: H.PIVOT,
  preview: 'cast',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: { walk: [{ sound: 'footstep-gravel', frame: 0, preset: 'Sneaking' }, { sound: 'footstep-gravel', frame: 4, preset: 'Sneaking' }], run: [{ sound: 'footstep-gravel', frame: 0, preset: 'Sneaking' }, { sound: 'footstep-gravel', frame: 4, preset: 'Sneaking' }], jump: [{ sound: 'jump', frame: 2, preset: 'Tiny hop' }], cast: [{ sound: 'magic-spell', frame: 2 }], hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab' }], die: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 1 }, { sound: 'land-thud', frame: 5, preset: 'Soft landing', volume: 1 }] },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stout' }),
    head: range('Head', 0.55, { lo: 'Small', hi: 'Big' }),
    hat: choice('Hat', 'pointed', ['pointed', 'crooked', 'wide', 'hood']),
    beard: choice('Beard', 'long', ['long', 'short', 'none']),
    // staff
    staff: choice('Staff', 'orb', ['orb', 'crystal', 'crook']),
    staffLength: range('Length', 1, { min: 0.6, max: 1.3, step: 0.05, lo: 'Short', hi: 'Tall' }),
    staffAngle: range('Hold angle', 0, { min: -6, max: 14, step: 1, lo: 'Upright', hi: 'Forward' }),
    robeLen: range('Robe length', 0.85, { lo: 'Knee', hi: 'Floor' }),
    skin: color('Skin', SKIN[0], SKIN),
    // the hood hides the hair, so with a hood and no beard there is nothing for this colour to show on
    beardColor: color('Hair and beard', HAIR[4], HAIR, { when: [{ hat: ['pointed', 'crooked', 'wide'] }, { beard: ['long', 'short'] }] }),
    robe: color('Robe', CLOTH[6], CLOTH),
    trim: color('Trim', CLOTH[2], CLOTH),
    magic: color('Magic', MAGIC[0], MAGIC),
    spell: range('Spell size', 0.5, { lo: 'Spark', hi: 'Blast', group: 'Motion' }),
    bounce: range('Bounce', 0.4, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Wizard holds and wears. The first key of each list picks which one; the rest are that part's own settings.
  parts: {
    // named as the style guide names parts (section 9); the controls keep the keys they always had, so saved links
    // and bag items still open the same wizard
    weapon: { label: 'Staff', params: ['staff', 'staffLength', 'staffAngle'], socket: 'hand' },
    headgear: { label: 'Hat', params: ['hat'], socket: 'head' },
    beard: { label: 'Beard', params: ['beard'], none: 'none', socket: 'head' },
  },
  clips: (() => {
    const c = H.clips((p) => p.speed, { cast: { frames: 8, fps: (p) => 11 * lerp(0.65, 1.45, p.speed), loop: false } });
    return { idle: c.idle, walk: c.walk, run: c.run, jump: c.jump, cast: c.cast, hurt: c.hurt, ...H.clipsFor(['die', 'victory', 'talk'], (p) => p.speed) };
  })(),

  // attach points for every frame (hand, offhand, head, back, feet); the staff passes through `hand` along its angle
  sockets(clip, t, p) {
    const d = H.dims(p);
    const P = wizPose(clip, t, { bounce: p.bounce, stride: p.stride, armed: true }, d, staffTilt(p), staffSize(p, d));
    return H.sockets(H.solve(P, d), P, d);
  },

  render(g, { clip, t, p }) {
    const [CW, CH] = H.SIZE;
    const d = H.dims(p);
    const m = { bounce: p.bounce, stride: p.stride, armed: true };
    const tilt = staffTilt(p), size = staffSize(p, d);
    const P = wizPose(clip, t, m, d, tilt, size);
    const lie = P.lie;                 // 0..1: how far he has gone down in `die`
    // cloth, beard and hat tip trail the body: the same sway, a little later
    const swayAt = (dt) => wizPose(clip, LOOPS[clip] ? fract(t - dt) : Math.max(0, t - dt), m, d, tilt, size).sway;
    const s1 = swayAt(0.1), s2 = swayAt(0.2);

    const robe = ramp(p.robe), robeFar = farRamp(p.robe);
    const trimHex = p.trim === p.robe ? tone(p.trim, -1) : p.trim;
    const trim = ramp(trimHex), trimFar = farRamp(trimHex);
    const skin = ramp(p.skin), skinFar = farRamp(p.skin);
    const beard = ramp(p.beardColor);
    const magic = ramp(p.magic);
    const wood = ramp('#8a5a34');
    // the staff's light: white-hot; in `die` it dims once he is down (frame 5) and is out, a cold dark stone, by frame 6
    const dim = clip === 'die' ? (t > 0.8 ? 2 : t > 0.65 ? 1 : 0) : 0;
    const orbPaint = dim === 2 ? { light: magic.dark, base: magic.deep, dark: tone(p.magic, -2.6) } : dim === 1 ? { light: magic.light, base: magic.base, dark: magic.dark } : { light: '#ffffff', base: magic.light, dark: magic.base };

    // staff lengths: below the hand it reaches the ground when standing; above, it tops out beside the hat
    const hand0 = H.solve(wizPose('idle', 0, m, d, tilt), d).armF.hand;
    const floor = H.GROUND - 1;
    const below = (floor - hand0[1]) / -Math.cos(tilt);
    const above = size.above;
    let orb = [0, 0], orbR = 2.5, rimR = 1.3;

    const look = {
      skin: p.skin, top: p.robe, bottom: tone(p.robe, -0.9), boots: '#5b3d2e',
      hair: tone(p.beardColor, -0.7), hairStyle: p.hat === 'hood' ? 'bald' : 'long',      // the hood hides the hair
    };

    H.draw(g, P, d, look, {
      offhand(g, J) {
        sleeve(g, J.armB, d, robeFar, trimFar.base, skinFar, null, lie > 0 ? J.gy : Infinity);
      },

      torso(g, J) {
        if (lie > 0.25) {
          // off his feet: the skirt follows the legs wherever they point, one piece of cloth between them
          const reachK = lerp(0.55, 1, p.robeLen);
          const top = [lerp(J.hip[0], J.neck[0], 0.1), lerp(J.hip[1], J.neck[1], 0.1)];
          const endOf = (L) => [lerp(L.hip[0], L.ankle[0], reachK), lerp(L.hip[1], L.ankle[1], reachK)];
          const eF = endOf(J.legF), eB = endOf(J.legB), mid = [(eF[0] + eB[0]) / 2, (eF[1] + eB[1]) / 2];
          const r0 = d.hipR + 0.6, r1 = d.hipR * 0.7 + lerp(0.7, 1.6, p.robeLen);
          const cF = capIn(top[0], top[1], eF[0], eF[1], r0, r1), cB = capIn(top[0], top[1], eB[0], eB[1], r0, r1);
          const side = (a, b, px, py) => (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
          const between = (px, py) => { const a = side(top, eF, px, py), b = side(eF, eB, px, py), c = side(eB, top, px, py); return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0); };
          const cloth = (px, py) => py < J.gy && (cF(px, py) || cB(px, py) || between(px, py));
          const xs = [top[0], eF[0], eB[0]], ys = [top[1], eF[1], eB[1]];
          const box = [Math.min(...xs) - r0 - 1, Math.min(...ys) - r0 - 1, Math.max(...xs) + r0 + 1, Math.max(...ys) + r0 + 1];
          g.fill(...box, cloth, robe, { shade: 1 });
          // trim along the hem: the far end of the cloth
          const len = Math.hypot(mid[0] - top[0], mid[1] - top[1]) || 1, ux = (mid[0] - top[0]) / len, uy = (mid[1] - top[1]) / len;
          const band = d.leg > 10.5 ? 2 : 1;
          g.fill(...box, cloth, trim, { shade: 0, clip: (px, py) => !cloth(px + ux * band, py + uy * band) && (px - top[0]) * ux + (py - top[1]) * uy > len * 0.6 });
          // sash, across the body
          const sx = Math.round(top[0]);
          for (let y = Math.floor(top[1] - r0 - 1); y <= top[1] + r0 + 1; y++) if (g.get(sx, y)) { g.dot(sx, y, trim.base); if (g.get(sx - 1, y)) g.dot(sx - 1, y, trim.dark); }
          return;
        }
        // the skirt of the robe: a bell from the waist to the hem, wide enough to cover both legs
        const wx = lerp(J.hip[0], J.neck[0], 0.22), wy = Math.round(lerp(J.hip[1], J.neck[1], 0.22));
        const hem = Math.round(Math.min(J.hip[1] + d.leg * 0.97 * lerp(0.55, 1, p.robeLen), J.gy - d.foot));
        const reachX = (L) => lerp(L.hip[0], L.ankle[0], lerp(0.6, 1, p.robeLen));
        const legs = [J.legF, J.legB].sort((a, b) => reachX(a) - reachX(b));
        const backX = reachX(legs[0]), frontX = reachX(legs[1]);
        // a lifted foot kicks its side of the hem up; a billowing robe rides higher, most at the back
        const kick = (L) => Math.max(0, J.gy - d.foot - L.ankle[1]) * 0.6 * p.robeLen;
        const hemYB = hem - kick(legs[0]) - P.billow * 3, hemYF = hem - kick(legs[1]) - P.billow * 1.5;
        const flare = lerp(1.2, 2.8, p.robeLen) + P.billow * 2;
        const waistB = wx - d.hipR - 0.8, waistF = wx + d.hipR + 0.8;
        const hemF = Math.max(waistF + flare * 0.5, frontX + 2.5) - s1 * 0.8;
        const hemB = Math.min(waistB - flare, backX - 2.5 - P.billow * 1.5) - s1 * 2.4 * p.robeLen;
        const edges = (py) => {
          const k = clamp((py - wy) / Math.max(1, hem - wy));
          return [lerp(waistB, hemB, k ** 1.4), lerp(waistF, hemF, k ** 1.2)];
        };
        const hemAt = (px) => Math.round(lerp(hemYB, hemYF, clamp((px - hemB) / Math.max(1, hemF - hemB))));
        const skirt = (px, py) => {
          if (py < wy || py >= hemAt(px)) return false;
          const [xl, xr] = edges(py);
          return px >= xl && px <= xr;
        };
        const box = [Math.min(hemB, waistB) - 1, wy, Math.max(hemF, waistF) + 1, hem];
        g.fill(...box, skirt, robe, { shade: hemF - hemB > 13 ? 2 : 1 });
        // one fold line, hanging between the legs
        for (let y = Math.round(lerp(wy, hem, 0.45)); y < hem - 2; y++) {
          const [xl, xr] = edges(y + 0.5);
          const fx = lerp(xl, xr, 0.42) - s2 * 0.6;
          if (skirt(fx, y + 2.5)) g.dot(fx, y, robe.dark);
        }
        // trim along the hem
        const band = d.leg > 10.5 ? 2 : 1;
        g.fill(...box, skirt, trim, { clip: (px, py) => py > hemAt(px) - band });
        // sash
        const sx = Math.round(waistB), sw = Math.round(waistF) - sx;
        g.rect(sx, wy - 1, sw, 2, trim, { shade: 0 });
        g.rect(sx, wy, sw, 1, trim.dark);
        g.rect(sx + sw - 2, wy + 1, 1, 3, trim.dark);
      },

      head(g, J) {
        const [hx, hy] = J.head, R = d.headR;
        const ey = Math.floor(hy - 0.5);
        // nose
        g.dot(Math.floor(hx + R + 0.1), ey + 2, skin.base);

        if (p.beard !== 'none') {
          const len = p.beard === 'long' ? lerp(4, 7.5, p.height) : 1.5;
          const jaw = (px, py) => ((px - hx) / (R + 0.7)) ** 2 + ((py - hy) / (R + 0.9)) ** 2 <= 1 && py > hy + R * 0.3 && px > hx - R * 0.5;
          g.poly([[hx - R * 0.45, hy + R * 0.5], [hx + R + 0.7, hy + R * 0.4], [hx + R * 0.45 - s1 * 1.5, hy + R + len]], beard);
          g.fill(hx - R - 1, hy, hx + R + 2, hy + R + 2, jaw, beard, { shade: 0 });
          const mx = Math.floor(hx + R * 0.55);
          g.dot(mx, ey + 3, beard.dark);   // mouth, under the moustache
          if (P.mouth) {
            // talking: the mouth opens, a gap in the beard that shows on any beard colour
            const gap = pick(p.beardColor, INK, '#ffffff');
            for (const [x, y] of [[mx, ey + 3], [mx, ey + 4], [mx - 1, ey + 3], [mx - 1, ey + 4]]) if (g.get(x, y)) g.dot(x, y, gap);
          }
        }

        const hat = robe;
        const tip = s2 * 1.5;
        const by = Math.min(Math.round(hy - R * 0.5 - 0.5), ey - 2);   // brim row: always clear of the eye
        const brim = (back, front) => {
          const x0 = Math.round(hx - R - back), x1 = Math.round(hx + R + front);
          g.rect(x0 + 1, by, x1 - x0 - 2, 1, hat.base);
          g.rect(x0, by + 1, x1 - x0, 1, hat.dark);
        };
        const band = (cone) => {
          g.poly(cone, trim, { clip: (px, py) => py > by - 2, shade: 0 });
          g.dot(Math.round(hx + R * 0.25), by - 1, trim.light);
        };
        if (p.hat === 'pointed') {
          const h1 = R * 1.5 + 3;
          const cone = [[hx - R * 0.95, by], [hx + R * 0.9, by], [hx - R * 0.3 - tip, by - h1]];
          g.poly(cone, hat, { shade: 2 });
          band(cone);
          brim(1.5, 2.5);
        } else if (p.hat === 'crooked') {
          const h1 = R * 1.1 + 2, w = R * 0.34;
          const bx = hx - R * 0.35, byy = by - h1;
          const cone = [[hx - R * 0.95, by], [hx + R * 0.9, by], [bx + w, byy], [bx - w, byy]];
          g.capsule(bx, byy + 0.5, bx - R * 0.9 - tip * 1.4, byy + 1.5 + Math.abs(tip) * 0.4, w, 0.7, hat);
          g.poly(cone, hat, { shade: 2 });
          band(cone);
          brim(1.5, 2.5);
        } else if (p.hat === 'wide') {
          const h1 = R * 1.0 + 2;
          const cone = [[hx - R * 0.9, by], [hx + R * 0.85, by], [hx + R * 0.1 - tip * 0.6, by - h1], [hx - R * 0.45 - tip * 0.6, by - h1 + 0.5]];
          g.poly(cone, hat, { shade: 2 });
          band(cone);
          brim(4, 5);
        } else {
          // hood: covers the top and back of the head, with a soft point behind
          const shell = (px, py) => {
            if (((px - hx) / (R + 1.2)) ** 2 + ((py - hy) / (R + 1.2)) ** 2 > 1) return false;
            return py < hy - R * 0.4 || px < hx - R * 0.1;
          };
          g.capsule(hx - R * 0.6, hy - R * 0.5, hx - R - 2.5 - tip, hy - R * 0.1, R * 0.5, 0.8, hat);
          g.fill(hx - R - 3, hy - R - 3, hx + R + 3, hy + R + 3, shell, hat, { shade: 2 });
          g.fill(hx - R - 3, hy - R - 3, hx + R + 3, hy + R + 3, (px, py) => shell(px, py) && !shell(px + 1, py + 1) && px > hx - R * 0.3, trim, { shade: 0 });
        }
      },

      item(g, J) {
        const [hx, hy] = J.armF.hand;
        const sx = Math.sin(P.item), cy = Math.cos(P.item);
        let lo = below - P.staffUp, up = above + P.staffUp;
        // down: he ends up holding it nearer its foot, so it lies along him and clear of his face
        if (lie > 0) { const keep = Math.min(lo, lerp(lo, 9, lie)); up += lo - keep; lo = keep; }
        // planted: when the hand sinks, the staff slides up through it instead of going into the ground
        if (cy < -0.2 && hy - cy * lo > floor) { const l2 = (floor - hy) / -cy; up += lo - l2; lo = l2; }
        orbR = 2.5 + Math.round(P.glow * lerp(0.8, 1.8, p.spell));   // x.5 radii keep the disc round
        // thrust forward by a tall wizard: slide the staff back through the hand rather than leave the frame
        if (sx > 0.1) { const fit = Math.min(up, (CW - 4 - orbR - STAFF_REACH[p.staff] - hx) / sx - 2.5); lo += up - fit; up = fit; }
        // a long staff held high: slide it down through the hand rather than leave the top of the frame;
        // when its foot is already on the ground it is shown a little shorter instead
        if (cy < -0.2) {
          const fit = (hy - 2.6 - orbR - STAFF_REACH[p.staff]) / -cy - 2.5;
          if (up > fit) { lo = Math.min(lo + up - fit, Math.max(lo, (floor - hy) / -cy)); up = fit; }
        }
        // down: whatever the slides above did, its foot stays out of the ground (the staff is shown a little shorter instead)
        if (lie > 0 && cy < 0 && hy - cy * lo > floor - 0.5) lo = (floor - 0.5 - hy) / -cy;
        const bx = hx - sx * lo, byy = hy - cy * lo, tx = hx + sx * up, ty = hy + cy * up;
        g.limb(bx, byy, tx, ty, 2, wood);
        const [ox, oy] = reach(tx, ty, P.item, 2.5);
        orb = [Math.round(ox) + 0.5, Math.round(oy) + 0.5];
        drawStaffTop(g, [tx, ty], P.item, orb, orbR, { kind: p.staff, wood, paint: orbPaint });
        rimR = p.staff === 'crystal' ? 2.3 : 1.3;
      },

      front(g, J) {
        // talking, the free hand reaches out past the staff: it is shown in front of it, under the staff arm
        if (P.point > 0.25) {
          sleeve(g, J.armB, d, robeFar, trimFar.base, skinFar, null);
          g.ellipse(J.armB.hand[0] + 0.5, J.armB.hand[1], 1.8, 1.8, skinFar, { shade: 0 });      // an open hand, big enough to read
        }
        sleeve(g, J.armF, d, robe, trim.base, skin.base, robe.deep, lie > 0 ? J.gy - 1 : Infinity);      // one row less: its dark rim is drawn outside it
      },
    });

    if (P.flash) g.tint('#ffffff');
    g.outline(INK);

    // ---- magic: drawn after the outline so it glows instead of looking solid ----
    const [ox, oy] = orb;
    const fxDot = (x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= 1 && y >= 1 && x <= CW - 2 && y <= CH - 2) g.dot(x, y, c); };
    const safe = (px, py) => px > 1 && py > 1 && px < CW - 1 && py < CH - 1;
    const fxRing = (r, thick, c) => g.fill(ox - r - thick, oy - r - thick, ox + r + thick, oy + r + thick,
      (px, py) => Math.abs(Math.hypot(px - ox, py - oy) - r) <= thick / 2, c, { shade: 0, clip: safe });
    const fxRay = (a, r0, r1, c) => { for (let r = r0; r <= r1; r += 0.5) fxDot(ox + Math.sin(a) * r, oy + Math.cos(a) * r, c); };

    if (P.flash) return;
    if (dim === 2) return;                        // out: no lit rim, no motes
    // the orb's rim is lit, not inked
    const ink = col(INK);
    for (let y = Math.floor(oy - orbR - 2); y <= oy + orbR + 2; y++) for (let x = Math.floor(ox - orbR - 2); x <= ox + orbR + 2; x++) {
      if (g.get(x, y) === ink && Math.hypot(x + 0.5 - ox, y + 0.5 - oy) < orbR + rimR) g.dot(x, y, magic.base);
    }
    if (clip === 'die' && t > 0.6) return;        // down: the light has gone out
    if (clip !== 'cast' || P.glow < 0.05) {
      // motes drifting up from the orb
      const n = Math.round(lerp(2, 4, p.spell));
      for (let i = 0; i < n; i++) {
        const u = fract(t + i / n);
        if (u > 0.7) continue;
        fxDot(ox + (hash(i, 3) - 0.5) * 8, oy - orbR - 1 - u * 7, u < 0.35 ? magic.light : magic.base);
      }
    } else {
      // the burst is as big as the Spell size asks for, but never bigger than the room around the orb
      const big = Math.max(orbR + 3, Math.min(lerp(7, 12, p.spell), CW - 3 - ox, oy - 3));
      if (t < 0.5) {
        // charging: sparks spiral in toward the orb
        const n = Math.round(lerp(5, 9, p.spell));
        for (let i = 0; i < n; i++) {
          const a = hash(i, 11) * TAU + t * 5;
          const r = lerp(big, orbR + 1, fract(t * 2.3 + hash(i, 5)));
          fxDot(ox + Math.sin(a) * r, oy + Math.cos(a) * r, '#ffffff');
          fxDot(ox + Math.sin(a) * (r + 1.5), oy + Math.cos(a) * (r + 1.5), magic.light);
        }
      } else {
        // release: a star flash, then a ring that grows and breaks into sparks
        const u = clamp((t - 0.5) / 0.5);
        const r = lerp(orbR + 1, big, smooth(u * 1.2));
        if (u < 0.3) {
          for (let i = 0; i < 8; i++) fxRay(i * TAU / 8, orbR + 1, orbR + (i % 2 ? big * 0.45 : big * 0.8), i % 2 ? magic.light : '#ffffff');
          fxRing(orbR + 1, 1, '#ffffff');
        } else if (u < 0.6) {
          fxRing(r, 2, magic.light);
        } else {
          fxRing(r, 1, magic.base);
        }
        const n = Math.round(lerp(6, 10, p.spell));
        for (let i = 0; i < n; i++) {
          const a = (i + hash(i, 2) * 0.6) * TAU / n;
          const rr = r + 1.5 + hash(i, 9) * 3 * u;
          fxDot(ox + Math.sin(a) * rr, oy + Math.cos(a) * rr + u * u * 3, u < 0.5 ? '#ffffff' : magic.light);
        }
      }
    }
  },
});
