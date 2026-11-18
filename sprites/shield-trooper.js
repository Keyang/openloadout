// Shield trooper: a human enemy of the Derelict Station kit, a soldier in dark armour who fights from behind a shield
// as tall as the body, with red lights where the Ranger's are cyan. Built on the top-down rig (rigs/topdown.js) the way
// sprites/void-ranger.js is; the shield, the way it is carried and planted, the jab, the mask and the shoulder plates
// are riot gear the rig offers in rigs/topdown-riot.js. This file only says what the trooper is (Contract 13):
//
//   1. trooperFrame(clip, t, p): R.shieldFrame() with the weapon, the shield and the headgear chosen. With a baton or
//      nothing in the hand `shoot_*` is a jab or a shove with the shield; `block` plants the shield and crouches.
//   2. render: F.draw(g, look, hooks), each hook calling parts of the rig, then F.finish(), the shot and the energy pane.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { tone, pick } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import * as T from '../rigs/topdown.js';
import * as R from '../rigs/topdown-riot.js';

const D = PALETTE.derelict;
const SHIELDS = R.BODY_SHIELD_KINDS;                       // riot, energy, round
const GUNS = ['rifle', 'pistol'];
// dark where the Ranger is pale: the armour is one of the kit's dark and middle tones, never a pale one
const ARMOUR = [D.hull, D.teal, D.membrane, D.nebula];
// the plates, gloves and boots are greys, darker or clearly lighter than any armour, so the two never merge
const TRIMS = [D.plate, D.panel, D.steel, D.cream];
// warm colours are the enemy's: the lights are never the cyan, blue or green of the player's own energy and health
const GLOWS = swatches('derelict', 'glow', { lead: 'red' }).filter((c) => c !== D.cyan && c !== D.shield && c !== D.heal);

/** One frame of the trooper: the rig's pose behind the shield, with the weapon held and the headgear on. */
function trooperFrame(clip, t, p) {
  const rise = p.headgear === 'helmet' ? T.visorHelmetRise(p.headgearSize) : 0;
  return R.shieldFrame(clip, t, p, { item: R.riotItemSize(p.weapon, p.weaponLength), shield: { kind: p.shield, size: p.shieldSize }, rise });
}

const STEPS = () => [{ sound: 'footstep-metal', frame: 0, preset: 'Boots on deck', volume: 0.45 }, { sound: 'footstep-metal', frame: 4, preset: 'Boots on deck', volume: 0.45 }];
// a gun fires; a baton or a bare hand is a jab or a shove with the shield, which lands a frame later
const SHOT = () => [
  { sound: 'laser-shot', frame: 1, preset: 'Heavy cannon', volume: 0.85, when: { weapon: GUNS } },
  { sound: 'bolt-impact', frame: 2, preset: 'On metal', volume: 0.7, when: { weapon: ['baton', 'none'] } },
];

export default defineSprite({
  id: 'shield-trooper',
  name: 'Shield trooper',
  kind: 'Character',
  blurb: 'An enemy soldier in dark armour who walks, shoots and blocks from behind a tall shield. Change the build, shield, weapon, headgear and colours.',
  meta: {
    type: 'character', role: 'characters/enemy', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['trooper', 'soldier', 'guard', 'enemy', 'shield', 'riot', 'armour', 'rifle', 'baton', 'shoot', 'block', 'walk', 'security'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: {
    walk_down: STEPS(), walk_up: STEPS(), walk_side: STEPS(),
    shoot_down: SHOT(), shoot_up: SHOT(), shoot_side: SHOT(),
    block: [{ sound: 'bolt-impact', frame: 1, preset: 'On metal', volume: 0.7, when: { shield: SHIELDS } }],
    hurt: [{ sound: 'bolt-impact', frame: 0, preset: 'On flesh', volume: 0.9 }],
    die: [{ sound: 'ranger-hurt', frame: 0, preset: 'Critical' }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.8, { lo: 'Slim', hi: 'Stocky' }),            // stockier than the Ranger
    // shield
    shield: choice('Shield', 'riot', [{ value: 'riot', label: 'Riot shield' }, { value: 'energy', label: 'Energy shield' }, { value: 'round', label: 'Round shield' }, 'none']),
    shieldSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    // weapon
    weapon: choice('Weapon', 'rifle', ['rifle', 'pistol', 'baton', 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // headgear
    headgear: choice('Headgear', 'helmet', ['helmet', 'mask', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', D.skin, swatches('derelict', 'skin', { lead: 'skin' })),
    outfit: color('Armour', D.hull, ARMOUR),
    // trim is the shoulder plates, the belt, the gloves and the boots, the mask, and the window of the shield, so it always shows
    trim: color('Plates, gloves and boots', D.plate, TRIMS),
    // glow is the visor or the lenses of the mask, and the lit edge of the shield (or the whole energy pane): with neither there is nothing lit
    glow: color('Lights', D.red, GLOWS, { when: [{ headgear: ['helmet', 'mask'] }, { shield: SHIELDS }] }),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the trooper holds and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    shield: { label: 'Shield', params: ['shield', 'shieldSize'], none: 'none', socket: 'offhand' },
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
  },
  // idle_*, walk_*, shoot_* in three directions, then block, hurt and die (drawn facing down, used for every direction)
  clips: T.clips((p) => p.speed, { action: 'shoot', plain: ['block', 'hurt', 'die'] }),

  // attach points for every frame (hand, offhand, head, back, feet, muzzle): a shot and its flash appear at `muzzle`
  sockets: (clip, t, p) => trooperFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = trooperFrame(clip, t, p);
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.4), boots: p.trim,
      hair: pick(p.skin, D.plate, D.cream), hairStyle: 'short', hatted: p.headgear === 'helmet',
    };
    const shield = (layer) => (g, J, P, d) => { if (F.shield) R.bodyShield(g, J, P, d, { ...F.shield, layer, colour: p.outfit, glow: p.glow, inset: p.trim, core: D.cream, t }); };
    const J = F.draw(g, look, {
      offhand(g, J, P, d) {
        T.gloves(g, J, P, d, { colour: p.trim, layer: 'offhand' });
        shield('offhand')(g, J, P, d);
      },
      torso(g, J, P, d) {
        T.gloves(g, J, P, d, { colour: p.trim, layer: 'torso' });
        if (F.grip(J)) T.backOver(g, J, P, d, { colour: p.outfit });      // a rifle in both hands, seen from behind: the hands are in front of the body
        T.stripe(g, J, P, d, { colour: p.trim, up: 4 });                 // the belt, a clear row above the gloves
        T.spine(g, J, P, d, { colour: p.trim, wide: 3 });
        R.shoulderPlates(g, J, P, d, { colour: p.trim, layer: 'torso' });
      },
      head(g, J, P, d) {
        if (p.headgear === 'helmet') T.visorHelmet(g, J, P, d, { size: p.headgearSize, shell: p.outfit, visor: p.glow });
        if (p.headgear === 'mask') R.lensMask(g, J, P, d, { size: p.headgearSize, colour: p.trim, lens: p.glow });
      },
      item(g, J) {
        if (!F.item) return;
        // rimmed where it lies over the armour, so it stays a weapon; and the free hand on a rifle held in both hands
        T.drawOver(g, (s) => R.riotItem(s, F.direction, F.hand(J), { kind: p.weapon, length: F.item.length, metal: D.steel, grip: D.plate }));
        if (F.grip(J)) T.handAt(g, F.grip(J), F.d, { colour: p.trim });
      },
      front(g, J, P, d) {
        T.gloves(g, J, P, d, { colour: p.trim, layer: 'front' });
        R.shoulderPlates(g, J, P, d, { colour: p.trim, layer: 'front' });
        shield('front')(g, J, P, d);
      },
    });
    F.finish(g, { flash: false });
    // the shot: a flare of hostile red with a white-hot centre, at the muzzle
    if (F.P.fire && F.item) T.muzzleFlare(g, F.sockets().muzzle, { colour: D.red, core: D.cream, ray: F.direction !== 'down' });
    shield('light')(g, J, F.P, F.d);
  },
});
