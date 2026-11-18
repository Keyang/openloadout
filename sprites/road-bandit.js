// Bandit: a human enemy for the battle screen of the Hearthvale kit: broad and slouching, a kerchief over the lower
// face, a club carried low. Its special move is `steal`: it darts forward, snatches, and hops back holding up a coin bag.
// A sprite on a rig is choices, not code (docs/architecture.md, Contract 13): this file says which stance, which pose
// each clip uses, the colours and the parts with their settings. The body, every part and every pose are drawn by
// rigs/humanoid-figure.js on the shared side-view rig (rigs/humanoid.js).
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { tone } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import * as H from '../rigs/humanoid.js';
import * as F from '../rigs/humanoid-figure.js';

const HV = PALETTE.hearthvale;
const SPEED = (p) => p.speed;
// the coat is dark cloth; the kerchief, the headgear and the belt come in lighter cloth, and the two lists share no colour
const TRIMS = [HV.wood, HV.path, HV.wheat, HV.cobble, HV.roof, HV.cream];
const OUTFITS = swatches('hearthvale', 'outfit', { lead: 'bandit' }).filter((c) => !TRIMS.includes(c)).slice(0, 6);

/** What the Bandit is, for these settings: the definition rigs/humanoid-figure.js draws. */
const bandit = (p) => {
  // the kerchief and the belt lie on the coat, and the kerchief on the face: they are painted in the nearest tone of their
  // colour that is clearly lighter or darker than both, so that no whole-kit look merges them (style guide, section 3, rule 8).
  // The default (wood) and roof are as dark as the bandit's coat and are lifted a tone off it; wheat and cream are as pale as
  // the face and are taken down a tone; path is far enough from both and is painted as it is
  const kerchief = F.apart(p.trim, [[p.outfit, 0.3], [p.skin, 0.19]]), rope = F.apart(p.trim, [[p.outfit, 0.3]]);
  // the loot sack is path cloth: the default wood shows on it as it is; a tie and a patch set to path itself are painted a tone darker, so the patch still shows
  const patch = p.trim === HV.path ? tone(p.trim, -0.85) : p.trim;
  return {
    body: { height: p.height, build: p.build, head: p.head },
    stance: 'slouched',                                                   // heavy, the head hanging forward
    motion: { bounce: p.bounce, stride: p.stride },
    look: { skin: p.skin, top: p.outfit, bottom: HV.path, boots: HV.wood },
    hair: { style: 'short', colour: HV.rust },
    held: { kind: p.weapon, length: p.weaponLength, angle: p.weaponAngle, metal: HV.steel, wood: HV.wood, hilt: HV.gold, cord: HV.cream },
    // the bandana and the hood are the coat's cloth; the hat is the kerchief's, with a band of the coat's
    headgear: { kind: p.headgear, size: p.headgearSize, colour: p.headgear === 'wide hat' ? p.trim : p.outfit, band: p.outfit },
    mask: { colour: kerchief, drape: 3 },                                 // the kerchief: worn whatever the headgear
    coat: { colour: p.outfit, belt: rope, ragged: 0.35, length: 0.42 },
    pack: { kind: p.pack, size: p.packSize, colour: HV.path, trim: patch, leather: HV.wood, fletching: HV.cream, shaft: HV.rust },
    loot: { colour: HV.wheat, tie: HV.wood, glint: HV.gold },             // the coin bag of `steal`
  };
};

export default defineSprite({
  id: 'road-bandit',
  name: 'Bandit',
  kind: 'Character',
  blurb: 'A masked robber for a battle screen, who clubs the party and snatches a bag of coins. Change the build, weapon, headgear, pack and colours.',
  meta: {
    type: 'character', role: 'characters/enemy', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'platformer'], view: 'side',
    words: ['bandit', 'robber', 'thief', 'outlaw', 'highwayman', 'thug', 'club', 'kerchief', 'steal', 'attack', 'walk', 'ambush', 'battle', 'rough'], license: 'draft',
  },
  size: H.SIZE,
  pivot: H.PIVOT,
  preview: 'walk',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: {
    walk: [0, 4].map((frame) => ({ sound: 'footstep-gravel', frame, preset: 'Boots', volume: 0.45 })),
    attack: [{ sound: 'whoosh', frame: 3, preset: 'Heavy swing', volume: 0.7 }, { sound: 'punch', frame: 4, preset: 'Heavy body blow', volume: 0.85 }],
    steal: [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.7 }, { sound: 'coin-pickup', frame: 5, preset: 'Dull token', volume: 0.7 }],
    hurt: [{ sound: 'punch', frame: 0, preset: 'Light jab', volume: 0.9 }],
    die: [{ sound: 'monster-fade', frame: 0, preset: 'Monster fades', volume: 1 }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.75, { lo: 'Slim', hi: 'Stocky' }),
    head: range('Head', 0.5, { lo: 'Small', hi: 'Big' }),
    // weapon
    weapon: choice('Weapon', 'club', ['club', 'cutlass', 'sling', 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    weaponAngle: range('Hold angle', 0, { min: -10, max: 40, step: 1, lo: 'Upright', hi: 'Forward' }),
    // headgear
    headgear: choice('Headgear', 'bandana', ['bandana', 'wide hat', 'hood', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // pack
    pack: choice('Pack', 'none', ['none', 'loot sack', 'quiver']),
    packSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // the coat, and the bandana or the hood
    outfit: color('Coat', HV.bandit, OUTFITS),
    // the kerchief, the belt and the hat
    trim: color('Kerchief and trim', HV.wood, TRIMS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Bandit holds, wears and carries. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength', 'weaponAngle'], none: 'none', socket: 'hand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    pack: { label: 'Pack', params: ['pack', 'packSize'], none: 'none', socket: 'back' },
  },
  clips: {
    ...H.clipsFor(['idle', 'walk', 'attack'], SPEED),
    steal: { ...H.clipsFor(['attack'], SPEED).attack, label: 'Steal' },      // 8 frames at the pace of an attack
    ...H.clipsFor(['hurt', 'die'], SPEED),
  },

  // attach points for every frame (hand, offhand, head, back, feet)
  sockets: (clip, t, p) => F.sockets(clip, t, bandit(p)),
  render: (g, { clip, t, p }) => { F.render(g, clip, t, bandit(p)); },
});
