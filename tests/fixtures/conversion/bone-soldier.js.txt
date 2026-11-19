// Skeleton soldier: a battle enemy on the shared humanoid rig, drawn as bare bones (H.drawSkeleton) instead of a body.
// What is particular to it: the soldier's stoop, the rattle (every bone a pixel out of step, the `wobble` slider), a jaw
// that chatters in idle and drops open on attack and hurt, and the collapse: it falls straight down into a heap with
// the skull on top. The weapon, the shield and the headgear are the rig's (H.heldItem, H.shield, H.headgear).
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { lerp, clamp, keys, smooth } from '../engine/motion.js';
import * as H from '../rigs/humanoid.js';
import { ramp, tone, INK } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { twinkle } from '../engine/fx.js';

const C = PALETTE.hearthvale;
const WEAPONS = ['sword', 'axe', 'spear'];
const METAL = swatches('hearthvale', 'metal', { lead: 'rust' }).filter((c) => c !== C.cobble);      // cobble is a bone colour here
const BONE = [C.cream, C.cobble, C.wheat, C.heal];                                                   // fresh, ashen, yellowed with age, and a cursed green
const straight = (v) => v;

/** Body measurements: the rig's, at a lean build. */
const dimsOf = (p) => H.dims({ height: p.height, build: 0.3, head: p.head });

/**
 * Everything one frame is drawn from: the pose P, the skeleton's look (rattle, jaw, fall), the held item's size w,
 * and whether the shield is raised in front of the body. Shared by render() and sockets().
 */
function frameOf(clip, t, p, d) {
  const w = H.itemSize(p.weapon, p.weaponLength);
  const m = { bounce: 0.5, stride: 0.5, armed: !!w, hold: w ? H.holdAngle(p.weaponAngle) : 0 };
  const attack = !w ? 'punch' : p.weapon === 'spear' ? 'thrust' : 'attack';                 // bare hands claw; a spear is thrust
  // the collapse starts from the recoil of a hit and stays on it while the bones drop
  const P = clip === 'die' ? H.pose('hurt', keys(t, [[0, 0], [0.143, 0.33], [1, 0.33]], straight), m, d) : H.pose(clip === 'attack' ? attack : clip, t, m, d);
  const fall = clip === 'die' ? keys(t, [[0, 0], [0.143, 0.05], [0.286, 0.3], [0.429, 0.55], [0.571, 0.8], [0.714, 0.9], [0.857, 1], [1, 1]], straight) : 0;
  // a soldier's stoop, the head a little forward of the chest; and a wider stance, so the two leg bones show apart
  const thick = p.thickness < 0.25 ? 1 : p.thickness < 0.8 ? 2 : 3;
  P.lean += 0.05; P.headTilt += 0.06;
  P.footF.x += 0.9 * thick - 0.6; P.footB.x -= 0.9 * thick - 0.6;
  const raised = p.shield !== 'none' && H.shieldPose(P, clip, t);                             // the far arm carries the shield, and brings it up in a block
  const rise = H.headgearRise(p.headgear, p.headgearSize);
  if (clip === 'die') {
    if (w) P.item = lerp(P.item, H.itemRest(p.weapon, w.length), smooth(clamp(fall * 1.5)));      // the weapon is let go and comes to lie in front of the heap
  } else {
    H.fit(P, d, { margin: 3, item: w, points: rise ? (J) => [[J.head[0], J.head[1] - d.headR - rise]] : null });
  }
  const jaw = clip === 'attack' ? keys(t, [[0, 0], [0.286, 0.6], [0.43, 1], [0.571, 1], [0.857, 0], [1, 0]])
    : clip === 'hurt' ? keys(t, [[0, 1], [0.4, 1], [1, 0]])
      : clip === 'die' ? keys(t, [[0, 1], [0.6, 1], [1, 0.4]])
        : clip === 'idle' ? (t >= 0.24 && t < 0.49 ? 0.34 : 0)                               // one chatter of the teeth
          : 0;
  if (fall >= 0.9) P.blink = true;                                                          // the lights in the eyes go out as the skull settles
  const loose = clip === 'hurt' ? 1.25 : clip === 'idle' || clip === 'block' ? 0.85 : 1;
  const look = {
    bone: p.body, glow: p.glow, thick,
    jaw, rattle: lerp(0.2, 1.3, p.wobble) * loose, beat: t, fall,
  };
  return { P, look, w, raised };
}

export default defineSprite({
  id: 'bone-soldier',
  name: 'Skeleton soldier',
  kind: 'Creature',
  blurb: 'A rattling skeleton with glowing eyes for a battle screen. Change its bones, weapon, shield, headgear and how much it rattles.',
  meta: { type: 'creature', role: 'characters/enemy', themes: ['fantasy', 'dungeon'], gameTypes: ['turn-based-rpg', 'platformer'], view: 'side', words: ['skeleton', 'undead', 'bones', 'skull', 'soldier', 'warrior', 'attack', 'block', 'collapse', 'battle', 'crypt', 'spooky', 'rattle'], license: 'draft' },
  size: H.SIZE,
  pivot: H.PIVOT,
  preview: 'walk',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles. The blade is
  // heard only when a weapon is held (bare hands swish); a blocked blow rings on the shield or, without one, on the weapon
  sounds: {
    walk: [{ sound: 'footstep-gravel', frame: 0, preset: 'Sneaking', volume: 0.45 }, { sound: 'footstep-gravel', frame: 4, preset: 'Sneaking', volume: 0.45 }],
    attack: [
      { sound: 'sword-slash', frame: 3, preset: 'Heavy blade', volume: 0.7, when: { weapon: WEAPONS } },
      { sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.7, when: { weapon: ['none'] } },
    ],
    block: [{ sound: 'metal-hit', frame: 1, preset: 'Tin can', volume: 0.7, when: [{ shield: H.SHIELD_KINDS }, { weapon: WEAPONS }] }],
    hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }],
    die: [{ sound: 'monster-fade', frame: 0, preset: 'Bones collapse', volume: 1 }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    thickness: range('Bones', 0.5, { lo: 'Thin', hi: 'Thick' }),
    head: range('Head', 0.55, { lo: 'Small', hi: 'Big' }),
    // weapon
    weapon: choice('Weapon', 'sword', [...WEAPONS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    weaponAngle: range('Hold angle', 0, { min: -10, max: 40, step: 1, lo: 'Upright', hi: 'Forward' }),
    // shield
    shield: choice('Shield', 'round', [...H.SHIELD_KINDS, 'none']),
    shieldSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    // headgear
    headgear: choice('Headgear', 'none', ['none', ...H.HEADGEAR_KINDS]),
    headgearSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    body: color('Bone', C.cream, BONE),
    glow: color('Eyes', C.magic, swatches('hearthvale', 'glow')),
    // metal is the weapon, the shield and the headgear: with none of them there is nothing for it to colour
    metal: color('Metal', C.rust, METAL, { when: [{ weapon: WEAPONS }, { shield: H.SHIELD_KINDS }, { headgear: H.HEADGEAR_KINDS }] }),
    wobble: range('Rattle', 0.5, { lo: 'Firm', hi: 'Loose', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What it holds and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength', 'weaponAngle'], none: 'none', socket: 'hand' },
    shield: { label: 'Shield', params: ['shield', 'shieldSize'], none: 'none', socket: 'offhand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
  },
  clips: (() => {
    const c = H.clipsFor(['idle', 'walk', 'attack', 'block', 'hurt', 'die'], (p) => p.speed);
    return { ...c, die: { ...c.die, label: 'Collapse' } };
  })(),

  // attach points for every frame (hand, offhand, head, back, feet): they follow the bones, into the heap too
  sockets(clip, t, p) {
    const d = dimsOf(p);
    const { P, look, raised } = frameOf(clip, t, p, d);
    const J = H.skeletonJoints(P, d, look);
    const out = H.sockets(J, P, d);
    if (p.shield !== 'none') Object.assign(out.offhand, H.shieldAt(J, p.shield, p.shieldSize, raised));
    return out;
  },

  render(g, { clip, t, p }) {
    const d = dimsOf(p);
    const frame = (u) => frameOf(clip, u, p, d);
    const { P, look, w, raised } = frame(t);
    const metal = ramp(p.metal);
    const blade = { light: tone(p.metal, 1.5), base: metal.light, dark: metal.base };       // an edge is the brightest metal there is
    const drawShield = (g, J) => H.shield(g, H.shieldAt(J, p.shield, p.shieldSize, raised), { kind: p.shield, size: p.shieldSize, metal });

    const J = H.drawSkeleton(g, P, d, look, {
      offhand(g, J) { if (p.shield !== 'none' && !raised) drawShield(g, J); },
      head(g, J) { if (p.headgear !== 'none') H.headgear(g, J, P, d, { kind: p.headgear, size: p.headgearSize, metal, horn: p.body }); },
      item(g, J) {
        if (!w) return;
        const item = { kind: p.weapon, length: w.length, metal: blade, wood: C.wood, hilt: C.gold }, at = { x: J.armF.hand[0], y: J.armF.hand[1], angle: P.item };
        H.heldItem(g, clip === 'die' ? H.itemAboveGround(at, J.gy, item) : at, item);          // let go, it rests on the ground, not in it
      },
      front(g, J) { if (p.shield !== 'none' && raised) drawShield(g, J); },
    });

    if (P.flash) g.tint('#ffffff');
    g.outline(INK);

    // light, drawn after the outline: the trail of the blade or the spear point, and the eyes flaring as the blow lands
    if (clip === 'attack' && w) {
      if (p.weapon === 'spear') H.thrustTrail(g, (u) => frame(u).P, t, d, w.length, '#ffffff');
      else H.slashTrail(g, (u) => frame(u).P, t, d, w.length, '#ffffff');
    }
    if (clip === 'attack' && t > 0.36 && t < 0.64) for (const [x, y] of J.eyes) twinkle(g, x, y, 1, ramp(p.glow).light);
  },
});
