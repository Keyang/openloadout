// FROZEN COPY, not a sprite: sprites/town-guard.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Town guard: a soldier at a gate of the Hearthvale kit, seen on the map, built on the top-down rig (rigs/topdown.js)
// the way sprites/hero-walker.js is. Everything generic is the rig's (Contract 11); this file only says what the
// guard is: a tabard over mail, an open helmet or a kettle hat, a pole weapon taller than he is held upright at his
// side, and a shield on the other arm. `block` swings the weapon across the body to bar the way; with nothing in
// either hand he bars it with an arm (the rig's `bar` manner).
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { PALETTE, swatches, swatchesBetween } from '../../../engine/palettes.js';
import * as T from '../../../rigs/topdown.js';

const HV = PALETTE.hearthvale;
const WEAPON_KINDS = ['halberd', 'spear', 'sword'];
const SHIELD_KINDS = ['round', 'kite'];
const HELD = { halberd: 'halberd', spear: 'pike', sword: 'sword' };       // the rig's kinds: a guard's spear is the long one, taller than he is
const CARRY = { halberd: 'upright', spear: 'upright', sword: 'up' };      // a pole weapon stands upright at his side
const MAIL = HV.cobble, HOSE = HV.flagstone;                              // what shows round the tabard: sleeves and legs

/** One frame of the guard: the rig's pose with his weapon carried his way, kept inside the frame with the headgear on. */
function guardFrame(clip, t, p) {
  const rise = p.headgear === 'helmet' ? T.headgearRise('helmet', p.headgearSize) : p.headgear === 'kettle hat' ? T.headgearRise('hat-wide', p.headgearSize) : 0;
  // a pole weapon is carried at attention and `block` brings it level across the body; with nothing in either hand he bars the way with an arm
  const manner = CARRY[p.weapon] === 'upright' ? [T.MANNERS.attention, T.MANNERS.bar] : p.weapon === 'none' && p.shield === 'none' ? T.MANNERS.bar : null;
  return T.frameWith(clip, t, p, { item: T.townItemSize(HELD[p.weapon], p.weaponLength), carry: CARRY[p.weapon], rise, manner });
}

const STEPS = () => [{ sound: 'footstep-gravel', frame: 0, preset: 'Boots', volume: 0.45 }, { sound: 'footstep-gravel', frame: 4, preset: 'Boots', volume: 0.45 }];

export default defineSprite({
  id: 'town-guard',
  name: 'Town guard',
  kind: 'Character',
  blurb: 'A soldier who stands at a gate, walks his round and bars the way. Change his build, weapon, shield, headgear and colours.',
  meta: {
    type: 'character', role: 'characters/npc', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['guard', 'soldier', 'sentry', 'watchman', 'halberd', 'shield', 'helmet', 'gate', 'patrol', 'walk', 'block', 'stern'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: {
    walk_down: STEPS(), walk_up: STEPS(), walk_side: STEPS(),
    // metal rings only when he has metal to block with; a bare arm bars the way in silence
    block: [{ sound: 'metal-hit', frame: 1, preset: 'Tin can', volume: 0.7, when: [{ weapon: WEAPON_KINDS }, { shield: SHIELD_KINDS }] }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    // weapon
    weapon: choice('Weapon', 'halberd', [...WEAPON_KINDS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // shield
    shield: choice('Shield', 'none', ['none', ...SHIELD_KINDS]),
    shieldSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    // headgear
    headgear: choice('Headgear', 'helmet', ['helmet', 'kettle hat', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // the tabard is always darker than the mail round it and its border always lighter, whichever swatches are picked
    outfit: color('Tabard', HV.hero, swatchesBetween('hearthvale', 'outfit', { lead: 'hero', max: 0.56 })),
    trim: color('Border and belt', HV.wheat, swatchesBetween('hearthvale', ['trim', 'outfit'], { lead: 'wheat', min: 0.58 })),
    // metal is the weapon, the shield and the headgear: with none of them there is nothing for it to colour
    metal: color('Metal', HV.steel, swatches('hearthvale', 'metal', { lead: 'steel' }), { when: [{ weapon: WEAPON_KINDS }, { shield: SHIELD_KINDS }, { headgear: ['helmet', 'kettle hat'] }] }),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the guard holds and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
    shield: { label: 'Shield', params: ['shield', 'shieldSize'], none: 'none', socket: 'offhand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
  },
  // idle_* and walk_* in three directions, then block (drawn facing down, used for every direction)
  clips: T.clips((p) => p.speed, { action: null, plain: ['block'] }),

  // attach points for every frame (hand, offhand, head, back, feet, muzzle), exported so a game can attach or swap parts
  sockets: (clip, t, p) => guardFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = guardFrame(clip, t, p);
    const look = { skin: p.skin, top: MAIL, bottom: HOSE, boots: HV.wood, hair: HV.wood, hairStyle: 'short', hatted: p.headgear !== 'none' };
    F.draw(g, look, {
      torso(g, J, P, d) {
        T.tabard(g, J, P, d, { colour: p.outfit, border: p.trim });
        T.belt(g, J, P, d, { colour: p.trim });
      },
      head(g, J, P, d) {
        if (p.headgear === 'helmet') T.helmet(g, J, P, d, { size: p.headgearSize, metal: p.metal, plume: p.trim });
        if (p.headgear === 'kettle hat') T.kettleHat(g, J, P, d, { size: p.headgearSize, metal: p.metal });
      },
      offhand(g, J, P, d) {
        if (p.shield !== 'none') T.shield(g, J, P, d, { kind: p.shield, size: p.shieldSize, metal: p.metal, boss: p.trim });
      },
      item(g, J) {
        if (F.item) T.townItem(g, F.direction, F.hand(J), { kind: HELD[p.weapon], length: F.item.length, metal: p.metal, wood: HV.wood, hilt: HV.gold });
      },
    });
    F.finish(g);
  },
});
