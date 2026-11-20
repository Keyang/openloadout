// FROZEN COPY, not a sprite: sprites/hero-walker.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Hero (map): the hero of the Hearthvale kit as seen on the map, built on the top-down rig (rigs/topdown.js).
// The same person as the side-view Hero (sprites/knight.js): blue outfit, red cape, steel helmet with a red plume,
// the same weapons and headgear. THE WORKED EXAMPLE for every top-down character. Everything generic is the rig's
// (Contract 11); this file only says what the Hero is:
//
//   1. heroFrame(clip, t, p): T.frame() with what the Hero holds and wears. It poses and fits once; the picture
//      (render) and the attach points (sockets) both come from it, so they cannot disagree.
//   2. render: F.draw(g, look, hooks). Each hook calls a part of the rig (T.cape, T.helmet, T.heldItem ...), which
//      draws itself for the direction the body faces. The rig calls each hook at the right depth.
//   3. F.finish(g, { trail }): the white hurt frame, the outline, then the swing arc.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { tone } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import * as T from '../../../rigs/topdown.js';

const HV = PALETTE.hearthvale;
const WEAPON_KINDS = ['sword', 'axe', 'spear'];           // sizes come from the rig (T.ITEMS), shared by every top-down character

/** One frame of the Hero: the rig's pose with the weapon held (a punch with none), kept inside the frame with the headgear on. */
function heroFrame(clip, t, p) {
  const rise = p.headgear === 'none' ? (p.hairStyle === 'spiky' ? 3 : 0) : T.headgearRise(p.headgear, p.headgearSize);
  return T.frame(clip, t, p, { item: T.itemSize(p.weapon, p.weaponLength), rise });
}

const STEPS = () => [{ sound: 'footstep-grass', frame: 0, preset: 'Grass', volume: 0.45 }, { sound: 'footstep-grass', frame: 4, preset: 'Grass', volume: 0.45 }];
// the blade is heard only when a weapon is held; a bare fist swishes instead
const SWING = () => [
  { sound: 'sword-slash', frame: 3, preset: 'Quick dagger', volume: 0.7, when: { weapon: WEAPON_KINDS } },
  { sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.7, when: { weapon: ['none'] } },
];

export default defineSprite({
  id: 'hero-walker',
  name: 'Hero (map)',
  kind: 'Character',
  blurb: 'The hero as seen on the map, walking and fighting in four directions. Change the build, hair, gear and colours.',
  meta: {
    type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['hero', 'knight', 'adventurer', 'player', 'warrior', 'sword', 'cape', 'walk', 'attack', 'explore', 'overworld', 'village'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: {
    walk_down: STEPS(), walk_up: STEPS(), walk_side: STEPS(),
    attack_down: SWING(), attack_up: SWING(), attack_side: SWING(),
    hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }],
    die: [{ sound: 'punch', frame: 0, preset: 'Heavy body blow' }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    hairStyle: choice('Hair', 'short', ['short', 'long', 'spiky', 'ponytail']),       // hair shows under every headgear
    // weapon
    weapon: choice('Weapon', 'sword', [...WEAPON_KINDS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // headgear
    headgear: choice('Headgear', 'helmet', ['helmet', 'crown', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // cape
    cape: choice('Cape', 'plain', ['plain', 'tattered', 'none']),
    capeLength: range('Length', 1, { min: 0.3, max: 1.8, step: 0.05, lo: 'Short', hi: 'Long' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    hair: color('Hair', HV.wood, swatches('hearthvale', 'hair', { lead: 'wood' })),
    outfit: color('Outfit', HV.hero, swatches('hearthvale', 'outfit', { lead: 'hero' })),
    // trim is the cape, the helmet's plume, and the hem and cuffs of the tunic, so it always shows
    trim: color('Cape and trim', HV.crimson, swatches('hearthvale', 'trim', { lead: 'crimson' })),
    // metal is the weapon, the helmet and the crown: with none of them there is nothing for it to colour
    metal: color('Metal', HV.steel, swatches('hearthvale', 'metal', { lead: 'steel' }), { when: [{ weapon: WEAPON_KINDS }, { headgear: ['helmet', 'crown'] }] }),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Hero holds and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    cape: { label: 'Cape', params: ['cape', 'capeLength'], none: 'none', socket: 'back' },
  },
  // idle_*, walk_*, attack_* in three directions, then hurt and die (drawn facing down, used for every direction)
  clips: T.clips((p) => p.speed, { action: 'attack', plain: ['hurt', 'die'] }),

  // attach points for every frame (hand, offhand, head, back, feet, muzzle), exported so a game can attach or swap parts
  sockets: (clip, t, p) => heroFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = heroFrame(clip, t, p);
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: HV.wood,
      hair: p.hair, hairStyle: p.hairStyle, hatted: p.headgear === 'helmet', cuffs: p.trim,
    };
    F.draw(g, look, {
      behind(g, J, P, d) {
        if (p.cape !== 'none') T.cape(g, J, P, d, { kind: p.cape, length: p.capeLength, colour: p.trim });
      },
      torso(g, J, P, d) {
        T.hem(g, J, P, d, { colour: p.trim });
        if (p.cape !== 'none') T.mantle(g, J, P, d, { colour: p.trim, clasp: HV.gold });
      },
      head(g, J, P, d) {
        if (p.headgear === 'helmet') T.helmet(g, J, P, d, { size: p.headgearSize, metal: p.metal, plume: p.trim });
        if (p.headgear === 'crown') T.crown(g, J, P, d, { size: p.headgearSize, metal: p.metal, gem: p.trim });
      },
      item(g, J) {
        if (F.item) T.heldItem(g, F.direction, F.hand(J), { kind: p.weapon, length: F.item.length, metal: p.metal, wood: HV.wood, hilt: HV.gold });
      },
    });
    F.finish(g, { trail: '#ffffff' });
  },
});
