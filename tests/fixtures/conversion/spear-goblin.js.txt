// Spear goblin: a small hunched patrol enemy on the shared humanoid rig (rigs/humanoid.js).
// What makes it a goblin and not a short Hero: its proportions (four fifths of the Hero's height, a head too big for
// its body, long arms), the stoop, bare feet and legs under a ragged tunic, and a face of its own (a long ear that
// sticks out behind the head and trails it, one of three noses). Everything it wears and holds is drawn by the rig:
// the weapon, the headgear (hood, skullcap, bone topknot), the ear, the nose, the tunic and its rope belt. What is the
// goblin's own is here: its measurements, its stoop, and the way it carries its weapon low and pointing ahead, clear
// of its nose.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, keys, PI, TAU } from '../engine/motion.js';
import * as H from '../rigs/humanoid.js';
import { ramp, rgbToHsl, hexToRgb, INK } from '../engine/color.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';

const T = PALETTE.thornwood;
const WEAPONS = ['spear', 'club', 'dagger'];
// cloth for the tunic is dark and earthy; the belt and hood come in brighter cloth, and the two lists share no colour
const TRIMS = swatches('thornwood', 'trim', { lead: 'thorn' });
const OUTFITS = swatchesBetween('thornwood', ['outfit', 'wood'], { lead: 'soil', max: 0.5 }).filter((c) => !TRIMS.includes(c));
// skin: goblin green, moss, marsh grey-blue, stone grey, and whatever in the skin list is not a human skin tone (a lilac).
// No human tones: a goblin in one reads as a small bald person. All are lighter than every tunic cloth.
const humanTone = (c) => { const [hue] = rgbToHsl(...hexToRgb(c)); return hue > 10 && hue < 45; };      // hue in degrees: the oranges and browns of skin
const SKINS = [...new Set([T.goblin, T.moss, T.haze, T.stone, ...swatchesBetween('thornwood', 'skin', { lead: 'goblin', min: 0.55 }).filter((c) => !humanTone(c))])];

/** Body measurements: the rig's, moved down the Height scale, with a bigger head and longer arms. */
function dimsOf(p) {
  const d = H.dims({ height: lerp(-0.7, 0.1, p.height), build: p.build, head: lerp(0.45, 1.1, p.head) });
  d.arm *= 1.12;
  return d;
}

/** What is held: its size for these settings, or null. */
const held = (p) => H.itemSizeOf(p.weapon, p.weaponLength);
/** The ear, root to tip in pixels: the smallest still sticks out well behind the head, the biggest is longer than the head is wide. */
const earLength = (p, d) => (d.headR * 0.38 + 6.4 + 3.4 * p.ears * (d.headR / 6)) / 0.9;      // the part inside the head, then 6 to 10 px behind it
/** How far the headgear rises above the top of the head, in pixels. */
const rise = (p) => (p.headgear === 'skullcap' ? 1 + 2 * p.headgearSize : p.headgear === 'bone' ? H.boneTopknotRise(p.headgearSize) : p.headgear === 'hood' ? 1.2 : 0);
/** How each weapon is carried: the angle it is held at, as an offset from the rig's (below 0 = tipped further forward). */
const CARRY = { spear: -0.5, club: -0.6, dagger: -0.5 };

/** The goblin's pose for a frame: the rig's pose for its weapon, stooped, and kept inside the frame. */
function goblinPose(clip, t, p, d) {
  const w = held(p);
  const m = { bounce: p.bounce, stride: p.stride, armed: !!w, hold: w ? H.holdAngle(p.weaponAngle) : 0 };
  // a point is thrust, a club is swung, bare claws rake
  const name = clip !== 'attack' ? clip : !w ? 'punch' : p.weapon === 'club' ? 'attack' : 'thrust';
  const P = H.pose(name, t, m, d);
  const up = 1 - P.lie;                                   // the stoop goes as it falls
  P.lean += 0.2 * up; P.headTilt -= 0.2 * up; P.crouch += 0.8 * up;
  // short legs pick their feet up: a lifted foot clears the ground by enough for its toes
  if (clip === 'walk') for (const f of [P.footF, P.footB]) if (f.y < -0.5) f.y = Math.min(f.y, -1.7);
  if (w) {
    // carried low in front of the belly and pointing ahead and up, like a guard with a spear at the ready; the attack
    // starts from and comes back to this carry
    const carry = clip === 'attack' ? keys(t, [[0, 1], [0.143, 0], [0.857, 0], [1, 1]]) : up;
    if (clip === 'run') {
      // running, it is couched: the hand low at the hip, the point leading
      const swing = Math.cos(TAU * t);
      P.armF.a = 0.55 - 0.25 * swing; P.armF.e = 0.45;
      P.item = 2.5 + CARRY[p.weapon] - 0.2 + 0.08 * swing + m.hold;
    } else {
      P.armF.a += 0.35 * carry; P.armF.e += 0.15 * carry;
      if (clip === 'hurt') P.armF.a -= 0.9 * clamp(-P.rootX / 3);      // knocked back, the weapon hand stays low: it is not thrown up over the face
      P.item += CARRY[p.weapon] * carry;
    }
    if (name === 'thrust') P.item -= m.hold * (1 - carry);      // a thrust is level whatever angle the weapon is carried at
    // never across the face: while it is carried, the weapon is tipped forward until it passes clear of every nose it
    // could have (the tip of the long one, the bottom of the hooked one), whichever it has, so the nose never moves it
    const clear = carry * clamp(1 - 3 * P.lie);
    if (clear > 0) P.item = lerp(P.item, H.itemClearOf(P, d, w, (J) => [H.noseTip(J, d, { kind: 'long' }), H.noseTip(J, d, { kind: 'hooked', low: true })]), clear);
  }
  const back = Math.max(earLength(p, d) * 0.95, p.headgear === 'hood' ? H.hoodReach(d, p.headgearSize) - d.headR * 0.4 : 0);
  const top = d.headR + rise(p);
  return H.fit(P, d, {
    item: w && clip === 'die' ? { ...w, pad: w.pad + 1.5 } : w,
    points: (J, P) => (P.headTurn
      ? [[J.head[0] - Math.sin(P.headTurn) * (top + 1), J.head[1] - Math.cos(P.headTurn) * top], [J.head[0] - d.headR - 1, J.head[1]]]
      : [[J.head[0], J.head[1] - top], [J.head[0] - d.headR * 0.42 - back, J.head[1] - back * 0.45]]),
  });
}

export default defineSprite({
  id: 'spear-goblin',
  name: 'Spear goblin',
  kind: 'Character',
  blurb: 'A small hunched goblin that patrols and lunges with its spear. Change its build, ears, nose, weapon, headgear and colours.',
  meta: { type: 'character', role: 'characters/enemy', themes: ['fantasy', 'forest'], gameTypes: ['platformer'], view: 'side', words: ['goblin', 'imp', 'gremlin', 'grunt', 'spear', 'guard', 'patrol', 'thrust', 'stab', 'walk', 'run', 'sneaky', 'enemy'], license: 'draft' },
  size: H.SIZE,
  pivot: H.PIVOT,
  preview: 'walk',
  sounds: {
    walk: [{ sound: 'footstep-gravel', frame: 0, preset: 'Sneaking', volume: 0.45 }, { sound: 'footstep-gravel', frame: 4, preset: 'Sneaking', volume: 0.45 }],
    run: [{ sound: 'footstep-gravel', frame: 0, preset: 'Sneaking', volume: 0.45 }, { sound: 'footstep-gravel', frame: 4, preset: 'Sneaking', volume: 0.45 }],
    attack: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.7 }],
    hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }],
    die: [{ sound: 'enemy-squish', frame: 0, preset: 'Crunch', volume: 1 }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    head: range('Head', 0.5, { lo: 'Small', hi: 'Big' }),
    ears: range('Ears', 0.5, { lo: 'Small', hi: 'Huge' }),
    nose: choice('Nose', 'long', H.NOSES),
    // weapon
    weapon: choice('Weapon', 'spear', [...WEAPONS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    weaponAngle: range('Hold angle', 0, { min: -10, max: 40, step: 1, lo: 'Upright', hi: 'Forward' }),
    // headgear
    headgear: choice('Headgear', 'hood', ['hood', 'skullcap', 'bone', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', T.goblin, SKINS),
    outfit: color('Outfit', T.soil, OUTFITS),
    trim: color('Belt and hood', T.thorn, TRIMS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength', 'weaponAngle'], none: 'none', socket: 'hand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
  },
  clips: (() => {
    const c = H.clipsFor(['idle', 'walk', 'run', 'attack', 'hurt', 'die'], (p) => p.speed);
    c.attack.label = 'Thrust';
    return c;
  })(),

  // attach points for every frame (hand, offhand, head, back, feet), exported so a game can attach or swap parts
  sockets(clip, t, p) {
    const d = dimsOf(p);
    const P = goblinPose(clip, t, p, d);
    return H.sockets(H.solve(P, d), P, d);
  },

  render(g, { clip, t, p }) {
    const d = dimsOf(p);
    const poseAt = (u) => goblinPose(clip, u, p, d);
    const P = poseAt(t);
    const w = held(p);
    const skin = ramp(p.skin), outfit = ramp(p.outfit), trim = ramp(p.trim);
    // bare legs, bare feet, bare arms, no hair
    const look = { skin: p.skin, top: p.outfit, bottom: p.skin, boots: p.skin, hair: p.skin, hairStyle: 'bald', bareArms: true };

    H.draw(g, P, d, look, {
      torso(g, J) {
        H.tunic(g, J, P, d, { colour: outfit, belt: trim });
      },
      head(g, J) {
        if (p.headgear === 'hood') H.hood(g, J, P, d, { colour: trim, size: p.headgearSize });
        else if (p.headgear === 'skullcap') H.skullcap(g, J, P, d, { colour: T.steel, size: p.headgearSize });
        else if (p.headgear === 'bone') H.boneTopknot(g, J, P, d, { size: p.headgearSize, colour: T.cream, knot: trim });
        // lying on its back the ear points up off the ground instead of into it
        H.pointedEar(g, J, P, d, { length: earLength(p, d), angle: lerp(-PI / 2 - 0.45, PI - 0.5, clamp(P.headTurn / (PI / 2))), colour: skin, inner: skin.dark });
        H.nose(g, J, P, d, { kind: p.nose, colour: skin });
      },
      item(g, J) {
        if (w) H.drawItem(g, H.sockets(J, P, d).hand, { kind: p.weapon, length: w.length, metal: ramp(T.steel), wood: T.wood, hilt: T.soil });
      },
      front(g, J) {
        // bare claws when nothing is held
        if (w) return;
        const [hx, hy] = J.armF.hand, a = J.armF.angle;
        for (const s of [-0.5, 0.5]) g.dot(hx + Math.sin(a + s) * (d.armW / 2 + 1), hy + Math.cos(a + s) * (d.armW / 2 + 1), T.cream);
      },
    });

    if (P.flash) g.tint('#ffffff');
    g.outline(INK);
    if (clip === 'attack') {
      if (w && p.weapon === 'club') H.slashTrail(g, poseAt, t, d, w.length, '#ffffff');
      else H.thrustTrail(g, poseAt, t, d, w ? w.length : 1, '#ffffff');
    }
  },
});
