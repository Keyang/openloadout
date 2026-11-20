// FROZEN COPY, not a sprite: sprites/warden-mech.js as it was on 2026-11-20 (migration batch C3), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Warden mech: the second boss of the Derelict Station kit, a walking security machine that faces the camera: two
// thick legs, a broad chest with a glowing reactor in it (the weak point), hazard-striped shoulders and heavy weapon
// arms. It is built on the walking war machine rig (rigs/mech-walker.js), which draws and poses everything: the body,
// the three heads, the weapon arms, the missile pods and radiators, the missile volley, the beam, the steam and the
// blasts. This file only says which of those the Warden is (Contract 13): its choices, colours, clips and sounds.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { pick } from '../../../engine/color.js';
import { PALETTE } from '../../../engine/palettes.js';
import * as M from '../../../rigs/mech-walker.js';

const D = PALETTE.derelict;
// a station machine: dull steel, clearly lighter than its own dark joints and never the white of the Ranger's suit
const BODIES = [D.hull, D.panel, D.steel, D.membrane];
// hostile energy: its lights are never the cyan, blue or green of friendly energy, shields and healing
const GLOWS = [D.red, D.acid, D.xp, D.flesh];
// the hazard paint: never a colour its own lights or its armour offer
const ACCENTS = [D.amber, D.gold, D.teal, D.cream];

/** One frame of the Warden: the rig's pose with the chosen head, weapon arms and pack. */
const wardenFrame = (clip, t, p) => M.frame(clip, t, p, {
  head: p.shape, weapon: { kind: p.weapon, length: p.weaponLength }, pack: { kind: p.pack, size: p.packSize },
});

export default defineSprite({
  id: 'warden-mech',
  name: 'Warden mech',
  kind: 'Creature',
  blurb: 'A boss: a walking security machine with a glowing reactor in its chest that stomps, fires a missile volley and a sweeping beam, overheats and blows apart. Change its size, bulk, legs, head, weapon arms, back pack and colours.',
  meta: {
    type: 'creature', role: 'characters/boss', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['mech', 'robot', 'machine', 'walker', 'guardian', 'warden', 'security', 'missile', 'beam', 'stomp', 'overheat', 'reactor', 'weak point', 'boss fight'], license: 'draft',
  },
  size: M.SIZE,
  pivot: M.PIVOT,
  preview: 'walk',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: {
    walk: [{ sound: 'footstep-metal', frame: 0, preset: 'Heavy mech', volume: 0.8 }, { sound: 'footstep-metal', frame: 4, preset: 'Heavy mech', volume: 0.8 }],
    shoot: [{ sound: 'rocket-launch', frame: 4, preset: 'Missile volley', volume: 1 }],
    beam: [{ sound: 'laser-shot', frame: 6, preset: 'Heavy cannon', volume: 1 }],
    overheat: [{ sound: 'door-hiss', frame: 0, preset: 'Airlock', volume: 1 }],
    hurt: [{ sound: 'bolt-impact', frame: 0, preset: 'On metal', volume: 0.9 }],
    die: [{ sound: 'bot-shutdown', frame: 0, preset: 'Mech collapse', volume: 1 }, { sound: 'explosion', frame: 8, preset: 'Grenade', volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    bulk: range('Bulk', 0.5, { lo: 'Light', hi: 'Heavy' }),
    legs: range('Legs', 0.5, { lo: 'Short', hi: 'Long' }),
    shape: choice('Head', 'cockpit', M.HEADS),
    // weapon: the arms; they cannot be taken off
    weapon: choice('Weapon', 'cannon arms', M.WEAPONS),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // pack: what it carries on its back
    pack: choice('Pack', 'missile pods', [...M.PACKS, 'none']),
    packSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    body: color('Body', D.hull, BODIES),
    accent: color('Hazard paint', D.amber, ACCENTS),
    glow: color('Reactor and eyes', D.red, GLOWS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Warden carries. The first key of each list picks which one; the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], socket: 'hand' },
    pack: { label: 'Pack', params: ['pack', 'packSize'], none: 'none', socket: 'back' },
  },
  // idle, walk (it stomps on the spot), shoot (four missiles straight up), beam, overheat, hurt, die
  clips: M.clips((p) => p.speed, ['idle', 'walk', { name: 'shoot', label: 'Missile volley' }, 'beam', 'overheat', 'hurt', 'die']),

  // attach points for every frame: hand and offhand (the weapon arms), head, back (the pack), feet, muzzle (where the next
  // missile leaves) and core (the reactor: the weak point, and where the beam starts)
  sockets: (clip, t, p) => wardenFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = wardenFrame(clip, t, p);
    // barrels, claws and the skull plate are bright steel, or the dark of the hull on a body that is itself bright steel
    const look = { body: p.body, accent: p.accent, glow: p.glow, metal: pick(p.body, D.steel, D.hull), dark: D.plate, core: D.cream, fire: D.amber };
    F.draw(g, look);
    F.finish(g, look);
  },
});
