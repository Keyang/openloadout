// Village child: a farm kid of the Hearthvale kit, seen on the map, built on the top-down rig (rigs/topdown.js) the
// way sprites/hero-walker.js is. Everything generic is the rig's (Contract 11); this file only says what the child
// is: three quarters of an adult's height with the same big head, slight, in a sleeveless smock with bare arms and legs, and bouncier
// than anyone else: the idle rocks on its heels and the run flails both arms (the rig's `rock` and `flail` manners).
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import * as T from '../rigs/topdown.js';

const HV = PALETTE.hearthvale;
const TALL = [22, 27];                                  // a child: 22 to 27 px, where an adult is 26 to 34
const SLIGHT = 0.2;                                     // a child's build: a narrow chest, thin arms and legs
const HELD_KINDS = ['stick', 'basket', 'flower'];
const CARRY = { stick: 'up', basket: 'hang', flower: 'up' };
const HATS = ['straw hat', 'cap'];                      // these cover the hair style: under them the hair is short

/** One frame of the child: the rig's pose on a child's body, with the rocking idle and the flailing run laid over it. */
function kidFrame(clip, t, p) {
  const rise = p.headgear === 'straw hat' ? T.headgearRise('hat-wide', p.headgearSize) : p.headgear === 'cap' ? T.peakedCapRise(p.headgearSize)
    : (p.headgear === 'bow' ? T.hairBowRise(p.headgearSize) : 0) + (p.hairStyle === 'spiky' ? 3 : 0);
  return T.frameWith(clip, t, { ...p, build: SLIGHT }, { item: T.townItemSize(p.held, p.heldSize), carry: CARRY[p.held], rise, tall: TALL, manner: [T.MANNERS.rock, T.MANNERS.flail] });
}

const STEPS = (volume) => [{ sound: 'footstep-grass', frame: 0, preset: 'Grass', volume }, { sound: 'footstep-grass', frame: 4, preset: 'Grass', volume }];

export default defineSprite({
  id: 'farm-kid',
  name: 'Village child',
  kind: 'Character',
  blurb: 'A small, bouncy village child who rocks on its heels and runs with both arms in the air. Change the height, head, hair, hat, what it carries and the colours.',
  meta: {
    type: 'character', role: 'characters/npc', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['child', 'kid', 'villager', 'youngster', 'peasant', 'walk', 'run', 'play', 'basket', 'flower', 'townsfolk', 'cheerful'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: {
    walk_down: STEPS(0.45), walk_up: STEPS(0.45), walk_side: STEPS(0.45),
    run_down: STEPS(0.3), run_up: STEPS(0.3), run_side: STEPS(0.3),
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    head: range('Head', 0.5, { lo: 'Small', hi: 'Big' }),
    // under a straw hat or a cap the hair is drawn short, so the style has nothing to change there
    hairStyle: choice('Hair', 'short', ['short', 'bowl', 'pigtails', 'spiky'], { when: { headgear: ['none', 'bow'] } }),
    // held
    held: choice('Carries', 'none', ['none', ...HELD_KINDS]),
    heldSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    // headgear
    headgear: choice('Headgear', 'none', ['none', 'straw hat', 'cap', 'bow']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    hair: color('Hair', HV.wood, swatches('hearthvale', 'hair', { lead: 'wood' })),       // it shows below every headgear
    // the smock is always a light colour and the accent a dark one, so the collar and the belt show on it whichever swatches are picked
    outfit: color('Smock', HV.wheat, swatchesBetween('hearthvale', ['outfit', 'grass', 'water'], { lead: 'wheat', min: 0.58 })),
    // accent is the collar, the belt and the shoes (and the cap, the bow and the hat band when one is worn)
    accent: color('Collar, belt and shoes', HV.roof, swatchesBetween('hearthvale', ['accent', 'trim', 'outfit'], { lead: 'roof', max: 0.5 })),
    bounce: range('Bounce', 0.7, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the child carries and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    held: { label: 'Carries', params: ['held', 'heldSize'], none: 'none', socket: 'hand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
  },
  // idle_*, walk_* and run_* in three directions
  clips: T.clips((p) => p.speed, { action: 'run', plain: [] }),

  // attach points for every frame (hand, offhand, head, back, feet, muzzle), exported so a game can attach or swap parts
  sockets: (clip, t, p) => kidFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = kidFrame(clip, t, p), hatted = HATS.includes(p.headgear);
    const look = {
      skin: p.skin, top: p.skin, bottom: p.skin, boots: p.accent,                 // bare arms and legs: the smock has no sleeves
      hair: p.hair, hairStyle: !hatted && p.hairStyle === 'spiky' ? 'spiky' : 'short', hatted,
    };
    F.draw(g, look, {
      torso(g, J, P, d) {
        T.tabard(g, J, P, d, { colour: p.outfit, length: 0 });                    // the smock: its bib between the arms,
        T.robe(g, J, P, d, { colour: p.outfit, length: 0 });                      // and its skirt, to the knee
        T.hem(g, J, P, d, { colour: p.accent });                                  // the belt
        T.mantle(g, J, P, d, { colour: p.accent, clasp: null });                  // the collar
      },
      head(g, J, P, d) {
        if (!hatted) T.hairdo(g, J, P, d, { style: p.hairStyle, colour: p.hair, tie: p.accent });
        if (p.headgear === 'straw hat') T.hat(g, J, P, d, { kind: 'wide', size: p.headgearSize, colour: HV.wheat, band: p.accent });
        if (p.headgear === 'cap') T.peakedCap(g, J, P, d, { size: p.headgearSize, colour: p.accent });
        if (p.headgear === 'bow') T.hairBow(g, J, P, d, { size: p.headgearSize, colour: p.accent });
      },
      item(g, J) {
        if (F.item) T.townItem(g, F.direction, F.hand(J), { kind: p.held, length: F.item.length, wood: p.held === 'basket' ? HV.path : HV.wood, fill: HV.crimson, stem: HV.leaf, petal: HV.cream, heart: HV.gold });
      },
    });
    F.finish(g);
  },
});
