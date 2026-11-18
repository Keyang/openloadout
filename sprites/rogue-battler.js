// Rogue: the third party member of the Hearthvale kit on the battle screen, and the same person as the Rogue on the map
// (sprites/rogue-walker.js): teal hood, a long slate scarf, a dagger in each hand, wheat hair under the hood.
// A sprite on a rig is choices, not code (docs/architecture.md, Contract 13): this file says which stance, which pose
// each clip uses, the colours and the parts with their settings. The body, every part and every pose are drawn by
// rigs/humanoid-figure.js on the shared side-view rig (rigs/humanoid.js).
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { tone } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import * as H from '../rigs/humanoid.js';
import * as F from '../rigs/humanoid-figure.js';

const HV = PALETTE.hearthvale;
const BLADES = ['daggers', 'short sword', 'claws'];
const SPEED = (p) => p.speed;
const STEPS = [0, 4].map((frame) => ({ sound: 'footstep-gravel', frame, preset: 'Sneaking', volume: 0.45 }));

/** What the Rogue is, for these settings: the definition rigs/humanoid-figure.js draws. */
const rogue = (p) => {
  // the scarf, belt and boots are told from the tunic by their tone when both are set to the same colour (as on the map)
  const trim = F.apart(p.trim, p.outfit, 0.05);
  return {
    body: { height: p.height, build: p.build, head: p.head },
    stance: 'crouched',                                                   // low and forward, the hands up; a run is a dash
    motion: { bounce: p.bounce, stride: p.stride },
    moves: { attack: 'stab', shoot: 'throw', victory: 'toss' },           // two jabs; a knife flicked from the belt; a dagger tossed and caught
    look: { skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: trim },
    hair: { style: 'short', colour: HV.wheat },                           // the map Rogue's default hair; the hood hides it
    held: { kind: p.weapon, length: p.weaponLength, angle: p.weaponAngle, metal: p.metal, hilt: HV.gold },
    headgear: { kind: p.headgear, size: p.headgearSize, colour: p.outfit },
    scarf: { kind: p.scarf, length: p.scarfLength, colour: trim },
    belt: { colour: trim, buckle: HV.steel },
    thrown: { metal: HV.steel, hilt: HV.wood },                           // the throwing knife is the same with every weapon, also none
  };
};

export default defineSprite({
  id: 'rogue-battler',
  name: 'Rogue',
  kind: 'Character',
  blurb: 'A hooded rogue for a battle screen or a platformer, who stabs twice, throws a knife and tosses a dagger to cheer. Change the build, hood, scarf, blades and colours.',
  meta: {
    type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'platformer'], view: 'side',
    words: ['rogue', 'thief', 'assassin', 'ninja', 'party member', 'hood', 'scarf', 'daggers', 'stab', 'throw', 'run', 'jump', 'sneaky', 'battle'], license: 'draft',
  },
  size: H.SIZE,
  pivot: H.PIVOT,
  preview: 'walk',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles. The blade is
  // heard only when one is held (bare fists swish); the thrown knife sounds the same with every weapon
  sounds: {
    walk: STEPS,
    run: STEPS,
    jump: [{ sound: 'jump', frame: 2, preset: 'Tiny hop', volume: 0.7 }],
    attack: [
      { sound: 'sword-slash', frame: 3, preset: 'Quick dagger', volume: 0.7, when: { weapon: BLADES } },
      { sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.7, when: { weapon: ['none'] } },
    ],
    shoot: [{ sound: 'whoosh', frame: 1, preset: 'Quick swipe', volume: 0.85 }],
    hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }],
    die: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow', volume: 1 }],
  },
  params: {
    height: range('Height', 0.45, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.3, { lo: 'Slim', hi: 'Stocky' }),
    head: range('Head', 0.5, { lo: 'Small', hi: 'Big' }),
    // weapon
    weapon: choice('Weapon', 'daggers', [...BLADES, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    weaponAngle: range('Hold angle', 0, { min: -10, max: 40, step: 1, lo: 'Upright', hi: 'Forward' }),
    // headgear
    headgear: choice('Headgear', 'hood', ['hood', 'bandana', 'mask', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // scarf
    scarf: choice('Scarf', 'long', ['short', 'long', 'none']),
    scarfLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // the tunic, and the hood, bandana or mask
    outfit: color('Outfit', HV.rogue, swatches('hearthvale', 'outfit', { lead: 'rogue' })),
    // the scarf, the belt and the boots, so it shows with no scarf too
    trim: color('Scarf and trim', HV.slate, swatches('hearthvale', 'trim', { lead: 'slate' })),
    // the blades: with none held there is nothing for it to colour
    metal: color('Metal', HV.steel, swatches('hearthvale', 'metal', { lead: 'steel' }), { when: { weapon: BLADES } }),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Rogue holds and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength', 'weaponAngle'], none: 'none', socket: 'hand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    scarf: { label: 'Scarf', params: ['scarf', 'scarfLength'], none: 'none', socket: 'back' },
  },
  clips: {
    ...H.clipsFor(['idle', 'walk', 'run', 'jump'], SPEED),
    attack: { ...H.clipsFor(['attack'], SPEED).attack, label: 'Stab' },
    shoot: { ...H.clipsFor(['shoot'], SPEED).shoot, label: 'Throw' },
    ...H.clipsFor(['hurt', 'die', 'victory'], SPEED),
  },

  // attach points for every frame (hand, offhand, head, back, feet, and muzzle: where the thrown knife leaves)
  sockets: (clip, t, p) => F.sockets(clip, t, rogue(p)),
  render: (g, { clip, t, p }) => { F.render(g, clip, t, rogue(p)); },
});
