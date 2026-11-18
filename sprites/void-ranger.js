// Ranger: the player of the Derelict Station kit, a salvager in a pale padded suit with blue stripes, gloves and
// boots and cyan lights, seen from above on the top-down rig (rigs/topdown.js) and built as sprites/hero-walker.js is.
// Everything generic is the rig's (Contract 11): the body, the poses, the guns (T.heldGun), the helmet and visor,
// the packs, the gloves and the suit lights. This file only says what the Ranger is:
//
//   1. rangerFrame(clip, t, p): T.bracedFrame(), the gun held in both hands, with the headgear and pack on. It poses and fits
//      once; the picture (render) and the attach points (sockets) both come from it. With no weapon `shoot_*` is a shove.
//   2. render: F.draw(g, look, hooks), each hook calling parts of the rig, then F.finish(g, { flash }) for the white
//      hurt frame, the outline and the muzzle flash on the fire frame, then the two afterimage streaks of `dodge`.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { tone, pick } from '../engine/color.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import * as T from '../rigs/topdown.js';

const D = PALETTE.derelict;
const RIM = D.plate;      // the dark line round the gun where it lies over the suit
// cool colours are the player's: nothing the Ranger wears is hazard amber or hostile red, and the lights (which are also
// the colour of the shot) are never amber, red or acid green, the colours of warnings, enemy fire and the hive
const TRIMS = swatches('derelict', 'trim', { lead: 'signal' }).filter((c) => c !== D.amber && c !== D.red);
const GLOWS = swatches('derelict', 'glow', { lead: 'cyan' }).filter((c) => c !== D.amber && c !== D.red && c !== D.acid);
// the suit never offers a colour its own stripes offer, so no look merges the two
const SUITS = [...new Set([D.suit, D.steel, D.panel, D.hull, ...swatches('derelict', 'outfit', { lead: 'suit' })])].filter((c) => !TRIMS.includes(c));

/** How far the headgear and the pack rise above the head, so the tallest look stays inside the frame. */
function riseOf(p) {
  const gear = p.headgear === 'helmet' ? T.visorHelmetRise(p.headgearSize) : p.headgear === 'hood' ? T.headgearRise('hood') : 0;
  return Math.max(gear, T.packRise(p.pack, p.packSize));
}

/** One frame of the Ranger: the rig's pose with the gun held in both hands (a shove in place of a shot when nothing is held). */
function rangerFrame(clip, t, p) {
  const item = T.gunSize(p.weapon, p.weaponLength);
  return T.bracedFrame(item ? clip : clip.replace(/^shoot_/, 'attack_'), t, p, { item, rise: riseOf(p) });
}

const STEPS = () => [{ sound: 'footstep-metal', frame: 0, preset: 'Boots on deck', volume: 0.45 }, { sound: 'footstep-metal', frame: 4, preset: 'Boots on deck', volume: 0.45 }];
// the shot is the gun's: a blaster or a beam goes pew, a scatter gun booms, and a bare-handed shove is silent
const SHOT = () => [
  { sound: 'laser-shot', frame: 1, preset: 'Pew', volume: 0.85, when: { weapon: ['blaster', 'beam'] } },
  { sound: 'scatter-blast', frame: 1, preset: 'Scatter gun', volume: 0.85, when: { weapon: ['scatter'] } },
];

export default defineSprite({
  id: 'void-ranger',
  name: 'Ranger',
  kind: 'Character',
  blurb: 'A salvager in a pale space suit who walks, shoots and dodges in four directions. Change the build, gun, headgear, pack and colours.',
  meta: {
    type: 'character', role: 'characters/player', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['ranger', 'astronaut', 'salvager', 'marine', 'player', 'hero', 'gun', 'blaster', 'shoot', 'dodge', 'walk', 'helmet', 'jetpack', 'twin stick'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: {
    walk_down: STEPS(), walk_up: STEPS(), walk_side: STEPS(),
    shoot_down: SHOT(), shoot_up: SHOT(), shoot_side: SHOT(),
    dodge: [{ sound: 'dodge-dash', frame: 1, preset: 'Dodge roll', volume: 0.7 }],
    hurt: [{ sound: 'ranger-hurt', frame: 0, preset: 'Hit', volume: 0.9 }],
    die: [{ sound: 'ranger-hurt', frame: 0, preset: 'Critical' }, { sound: 'footstep-metal', frame: 5, preset: 'Heavy mech', volume: 0.8 }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    // weapon
    weapon: choice('Weapon', 'blaster', ['blaster', { value: 'scatter', label: 'Scatter gun' }, { value: 'beam', label: 'Beam gun' }, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // headgear
    headgear: choice('Headgear', 'helmet', ['helmet', 'visor', 'hood', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // pack
    pack: choice('Pack', 'none', ['none', { value: 'tank', label: 'Air tank' }, { value: 'antenna', label: 'Radio' }, { value: 'jet', label: 'Jet pack' }]),
    packSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', D.skin, swatches('derelict', 'skin', { lead: 'skin' })),
    outfit: color('Suit', D.suit, SUITS),
    // trim is the stripes (the belt, and one down the back), the gloves and the boots, so it always shows
    trim: color('Stripes, gloves and boots', D.signal, TRIMS),
    // glow is the lights on the chest and shoulders, which show with every headgear and with none, and the visor, the gun's cell and the pack's light
    glow: color('Lights', D.cyan, GLOWS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    stride: range('Stride', 0.5, { lo: 'Small steps', hi: 'Big steps', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Ranger holds and wears. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    pack: { label: 'Pack', params: ['pack', 'packSize'], none: 'none', socket: 'back' },
  },
  // idle_*, walk_*, shoot_* in three directions, then dodge, hurt and die (drawn facing down, used for every direction)
  clips: T.clips((p) => p.speed, { action: 'shoot', plain: ['dodge', 'hurt', 'die'] }),

  // attach points for every frame (hand, offhand, head, back, feet, muzzle): a shot and its flash appear at `muzzle`
  sockets: (clip, t, p) => rangerFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = rangerFrame(clip, t, p);
    const look = {
      skin: p.skin, top: p.outfit, bottom: p.outfit, boots: p.trim,
      hair: pick(p.skin, D.plate, D.cream), hairStyle: 'short', hatted: p.headgear === 'helmet' || p.headgear === 'hood',
    };
    const J = F.draw(g, look, {
      behind(g, J, P, d) {
        if (p.pack !== 'none') T.pack(g, J, P, d, { kind: p.pack, size: p.packSize, colour: D.panel, glow: p.glow, thrust: P.tuck });
      },
      offhand(g, J, P, d) { T.gloves(g, J, P, d, { colour: p.trim, layer: 'offhand' }); },
      torso(g, J, P, d) {
        T.gloves(g, J, P, d, { colour: p.trim, layer: 'torso' });
        if (F.item) T.backOver(g, J, P, d, { colour: p.outfit });      // seen from behind, the hands that hold the gun are in front of the body
        T.stripe(g, J, P, d, { colour: p.trim, up: 4 });      // the belt, a clear row above the gloves
        T.spine(g, J, P, d, { colour: p.trim });
        if (p.pack !== 'none') T.packStraps(g, J, P, d, { colour: D.hull });
        T.suitLights(g, J, P, d, { colour: p.glow, layer: 'torso' });
      },
      head(g, J, P, d) {
        if (p.headgear === 'helmet') T.visorHelmet(g, J, P, d, { size: p.headgearSize, shell: p.outfit, visor: p.glow });
        if (p.headgear === 'visor') T.visor(g, J, P, d, { size: p.headgearSize, colour: p.glow, strap: D.panel });
        if (p.headgear === 'hood') T.hood(g, J, P, d, { colour: tone(p.outfit, -1), depth: (p.headgearSize - 0.5) / 0.65 });      // the suit's own hood, in its shaded tone so it stays apart from the face
      },
      item(g, J) {
        if (!F.item) return;
        // rimmed where it lies over the suit, so it stays a gun; and the free hand on it where the body hides that arm (facing away)
        T.drawOver(g, (s) => T.heldGun(s, F.direction, F.hand(J), { kind: p.weapon, length: F.item.length, metal: D.panel, glow: p.glow }), RIM);
        if (F.grip(J)) T.handAt(g, F.grip(J), F.d, { colour: p.trim });
      },
      front(g, J, P, d) {
        T.gloves(g, J, P, d, { colour: p.trim, layer: 'front' });
        T.suitLights(g, J, P, d, { colour: p.glow, layer: 'front' });
      },
    });
    F.finish(g, { flash: false });
    // the shot: a flare in the colour of the lights (cyan: friendly energy) with a white-hot centre, at the muzzle
    if (F.P.fire && F.item) T.muzzleFlare(g, F.sockets().muzzle, { colour: p.glow, core: D.cream, ray: F.direction !== 'down' });
    // dodge: two afterimage streaks trail the tucked body (it dashes down the screen, so they stream up) and shorten as it lands
    if (F.action === 'dodge' && F.P.tuck > 0.95) T.dashStreaks(g, J, F.P, F.d, { colour: p.glow, core: D.cream, fade: (t - 2 / 7) * 1.4, rise: riseOf(p) });
  },
});
