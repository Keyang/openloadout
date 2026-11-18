// Rogue (map): the rogue of the Hearthvale kit as seen on the map, built on the top-down rig (rigs/topdown.js) the way
// sprites/hero-walker.js is. The same person as the side-view Rogue (rogue-battler): teal hood, a long slate scarf
// trailing behind, a dagger in each hand held low at the hips. Everything generic is the rig's (Contract 11); this file
// only says what the Rogue is:
//
//   1. rogueFrame(clip, t, p): T.frameWith() with the blade held low, and the run turned into a low, leaning dash with
//      the arms swept back (the rig's dashManner). The picture (render) and the attach points (sockets) both come from it.
//   2. render: F.draw(g, look, hooks). The scarf's tail (T.scarf) streams further back the faster the Rogue moves and a
//      wave runs down it from the neck to the tip, so it lags and whips: it is what tells this outline from the Hero's.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { tone } from '../engine/color.js';
import { lerp, clamp, TAU } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import * as T from '../rigs/topdown.js';

const HV = PALETTE.hearthvale;
const BLADES = ['daggers', 'short sword', 'claws'];
// what each weapon is on the rig: its held kind, its size against the rig's standard, and whether there is one in each hand
const HELD = { daggers: { kind: 'dagger', scale: 1, pair: true }, 'short sword': { kind: 'sword', scale: 0.85, pair: false }, claws: { kind: 'claws', scale: 1, pair: true } };
const NO_HOOD = ['bandana', 'mask', 'none'];                // the hood hides the hair
const TAIL = { short: 6, long: 12 };                        // the scarf's tail in pixels at Length 1
// how the scarf flies in each action: how far it streams back, how many waves run down it per loop, and how hard it whips
const FLY = { idle: { flow: 0.15, beats: 1, whip: 1.2 }, walk: { flow: 0.55, beats: 2, whip: 0.8 }, run: { flow: 1, beats: 2, whip: 1 } };

/** One frame of the Rogue: the rig's pose with the blade held low; the run is a low, leaning dash (T.dashManner). */
function rogueFrame(clip, t, p) {
  const held = HELD[p.weapon];
  const rise = p.headgear === 'hood' ? T.headgearRise('hood') : p.hairStyle === 'spiky' ? 3 : 0;
  return T.frameWith(clip, t, p, { item: held ? T.smallItemSize(held.kind, held.scale * p.weaponLength) : null, carry: 'low', rise, manner: T.dashManner });
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
    weapon: choice('Weapon', 'daggers', [...BLADES, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    hair: color('Hair', HV.wheat, swatches('hearthvale', 'hair', { lead: 'wheat' }), { when: { headgear: NO_HOOD } }),
    // the tunic, and the hood, bandana or mask
    outfit: color('Outfit', HV.rogue, swatches('hearthvale', 'outfit', { lead: 'rogue' })),
    // the scarf, the belt and the boots, so it shows with no scarf too
    trim: color('Scarf and trim', HV.slate, swatches('hearthvale', 'trim', { lead: 'slate' })),
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
    const F = rogueFrame(clip, t, p), held = HELD[p.weapon], fly = FLY[F.action];
    const hood = p.headgear === 'hood';
    // the scarf, belt and boots are told from the tunic by their tone when both are set to the same colour
    const trim = p.trim === p.outfit ? tone(p.trim, 0.85) : p.trim;
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: trim,
      hair: p.hair, hairStyle: hood ? 'bald' : p.hairStyle, hatted: hood,
    };
    const blade = (g, at, far) => T.smallItem(g, F.direction, at, { kind: held.kind, length: F.item.length, metal: far ? tone(HV.steel, -1) : HV.steel, hilt: HV.gold });
    F.draw(g, look, {
      behind(g, J, P, d) {
        if (p.scarf === 'none') return;
        // a wave runs from the neck to the tip, so each part of the tail follows the one before it
        const wave = [0, 1, 2].map((i) => fly.whip * Math.sin(TAU * (fly.beats * t - i * 0.2)));
        T.scarf(g, J, P, d, { colour: trim, length: TAIL[p.scarf] * p.scarfLength, flow: fly.flow, wave });
      },
      torso(g, J, P, d) {
        T.belt(g, J, P, d, { colour: tone(trim, 0.85), buckle: HV.steel });
        if (p.scarf !== 'none') T.scarfWrap(g, J, P, d, { colour: trim });
      },
      head(g, J, P, d) {
        if (hood) T.hood(g, J, P, d, { colour: p.outfit, depth: lerp(0, 2, clamp((p.headgearSize - 0.5) / 1.3)) });
        if (p.headgear === 'bandana') T.bandana(g, J, P, d, { colour: p.outfit, size: p.headgearSize });
        if (p.headgear === 'mask') T.mask(g, J, P, d, { colour: p.outfit, size: p.headgearSize });
      },
      offhand(g, J, P) {
        if (held?.pair) blade(g, T.offGrip(J, P), F.direction === 'side');
      },
      item(g, J) {
        if (held) blade(g, F.hand(J), false);
      },
    });
    F.finish(g);
  },
});
