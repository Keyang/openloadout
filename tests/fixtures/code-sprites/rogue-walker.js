// FROZEN COPY, not a sprite: sprites/rogue-walker.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Rogue (map): the rogue of the Hearthvale kit as seen on the map, built on the top-down rig (rigs/topdown.js) the way
// sprites/hero-walker.js is. The same person as the side-view Rogue (rogue-battler): teal hood, a long slate scarf
// trailing behind, a dagger in each hand held low at the hips. A sprite on a rig is choices, not code
// (docs/architecture.md, Contract 13): the body, the poses, the scarf, the headgear and the blades are the rig's
// (rigs/topdown.js and its sneak gear, rigs/topdown-sneak.js); this file only says what the Rogue is:
//
//   1. rogueFrame(clip, t, p): T.frameWith() with the blade held low, and the run turned into a low, leaning dash with
//      the arms swept back (the rig's dashManner). The picture (render) and the attach points (sockets) both come from it.
//   2. render: F.draw(g, look, hooks), each hook naming a part of the rig. The scarf's tail (S.scarfTail) hangs at rest,
//      streams further back the faster the Rogue moves, and whips: it is what tells this outline from the Hero's.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { tone } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import * as T from '../../../rigs/topdown.js';
import * as S from '../../../rigs/topdown-sneak.js';

const HV = PALETTE.hearthvale;
const WEAPONS = Object.keys(S.BLADES);                      // daggers, short sword, claws: what each is on the rig is the rig's
// the scarf, belt and boots: dungeon slate first (the kit's default), then village stone and the rest of the kit's trim colours
const TRIMS = [HV.slate, HV.cobble, ...swatches('hearthvale', 'trim', { lead: 'slate' }).slice(1)].slice(0, 8);
const NO_HOOD = ['bandana', 'mask', 'none'];                // the hood hides the hair

/** One frame of the Rogue: the rig's pose with the blade held low; the run is a low, leaning dash (T.dashManner). */
function rogueFrame(clip, t, p) {
  const rise = S.headRise({ headgear: p.headgear, size: p.headgearSize, hairStyle: p.hairStyle });
  return T.frameWith(clip, t, p, { item: S.bladeSize(p.weapon, p.weaponLength), carry: 'low', rise, manner: T.dashManner });
}

const STEPS = (preset) => [{ sound: 'footstep-grass', frame: 0, preset, volume: 0.45 }, { sound: 'footstep-grass', frame: 4, preset, volume: 0.45 }];

export default defineSprite({
  id: 'rogue-walker',
  name: 'Rogue (map)',
  kind: 'Character',
  blurb: 'The rogue as seen on the map, sneaking and dashing in four directions with a scarf trailing behind. Change the build, hood, scarf, blades and colours.',
  meta: {
    type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['rogue', 'thief', 'assassin', 'ninja', 'party member', 'hood', 'scarf', 'daggers', 'walk', 'run', 'dash', 'sneak', 'overworld', 'stealthy'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: {
    walk_down: STEPS('Grass'), walk_up: STEPS('Grass'), walk_side: STEPS('Grass'),
    run_down: STEPS('Tall grass'), run_up: STEPS('Tall grass'), run_side: STEPS('Tall grass'),
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    hairStyle: choice('Hair', 'short', ['short', 'long', 'spiky', 'ponytail'], { when: { headgear: NO_HOOD } }),
    // headgear
    headgear: choice('Headgear', 'hood', ['hood', 'bandana', 'mask', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // scarf
    scarf: choice('Scarf', 'long', ['short', 'long', 'none']),
    scarfLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // weapon
    weapon: choice('Weapon', 'daggers', [...WEAPONS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    hair: color('Hair', HV.wheat, swatches('hearthvale', 'hair', { lead: 'wheat' }), { when: { headgear: NO_HOOD } }),
    // the tunic, and the hood, bandana or mask
    outfit: color('Outfit', HV.rogue, swatches('hearthvale', 'outfit', { lead: 'rogue' })),
    // the scarf, the belt and the boots, so it shows with no scarf too
    trim: color('Scarf and trim', HV.slate, TRIMS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Rogue wears and holds. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    scarf: { label: 'Scarf', params: ['scarf', 'scarfLength'], none: 'none', socket: 'back' },
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
  },
  // idle_*, walk_* and run_* in three directions
  clips: T.clips((p) => p.speed, { action: 'run', plain: [] }),

  // attach points for every frame (hand, offhand, head, back, feet, muzzle); the second dagger or claw is on `offhand`
  sockets: (clip, t, p) => rogueFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = rogueFrame(clip, t, p), hood = p.headgear === 'hood';
    // the scarf, belt and boots are told from the tunic by their tone when both are set to the same colour
    const trim = p.trim === p.outfit ? tone(p.trim, 0.85) : p.trim;
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: trim,
      hair: p.hair, hairStyle: hood ? 'bald' : p.hairStyle, hatted: hood,
    };
    const blade = (hand) => (g, J, P, d) => S.blade(g, J, P, d, { kind: p.weapon, length: F.item?.length, hand, metal: HV.steel, hilt: HV.gold });
    F.draw(g, look, {
      behind(g, J, P, d) { S.scarfTail(g, J, P, d, { kind: p.scarf, length: p.scarfLength, colour: trim, action: F.action, t }); },
      torso(g, J, P, d) {
        T.belt(g, J, P, d, { colour: tone(trim, 0.85), buckle: HV.steel });
        if (p.scarf !== 'none') T.scarfWrap(g, J, P, d, { colour: trim });
      },
      head(g, J, P, d) { S.headCloth(g, J, P, d, { kind: p.headgear, size: p.headgearSize, colour: p.outfit }); },
      offhand: blade('off'),
      item: blade('main'),
    });
    F.finish(g);
  },
});
