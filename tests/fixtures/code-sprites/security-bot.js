// FROZEN COPY, not a sprite: sprites/security-bot.js as it was on 2026-11-20 (migration batch C3), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Security bot: a heavy robot guard of the Derelict Station kit, wider than it is tall, seen from above in three
// directions: boxy armour with hazard stripes, a small head with one red sensor, a weapon at its shoulder. It is built
// on the guard robot rig (rigs/guard-bot.js), which draws and poses everything: the treads and the legs, the hull, the
// three heads, the weapons, the siren and the exhaust, the charge, the shot and the shutdown. This file only says
// which of those the security bot is (Contract 13): its choices, colours, clips and sounds.
import { defineSprite, range, choice, color, METAL } from '../../../engine/sprite.js';
import { PALETTE } from '../../../engine/palettes.js';
import * as B from '../../../rigs/guard-bot.js';

const D = PALETTE.derelict;
// a station machine: dark, dull steel or old bronze, far darker than the Ranger's white suit and never the pale lilac of a bug
const BODIES = [D.hull, D.panel, D.membrane, METAL[3]];
// warm colours are warnings and enemies: its lights are never the cyan, blue or green of friendly energy, shields and healing
const GLOWS = [D.red, D.acid, D.xp, D.flesh];
// the hazard paint: never a colour its own lights or its armour offer
const ACCENTS = [D.amber, D.gold, D.teal, D.cream];

/** One frame of the security bot: the rig's pose with the chosen drive, head, weapon and pack. */
const botFrame = (clip, t, p) => B.frame(clip, t, p, {
  drive: p.legs, head: p.shape,
  weapon: { kind: p.weapon, length: p.weaponLength }, pack: { kind: p.pack, size: p.packSize },
});
const STEP = { sound: 'footstep-metal', preset: 'Heavy mech', volume: 0.45 };
const CHARGE = [{ sound: 'dodge-dash', frame: 3, preset: 'Thruster dash', volume: 0.7 }, { sound: 'bolt-impact', frame: 5, preset: 'On metal', volume: 0.85 }];
const SHOT = [{ sound: 'scatter-blast', frame: 1, preset: 'Heavy slug', volume: 0.85, when: { weapon: ['cannon'] } }];   // only the cannon shoots: with a saw, a claw or nothing `shoot_*` is a silent feint

export default defineSprite({
  id: 'security-bot',
  name: 'Security bot',
  kind: 'Creature',
  blurb: 'A heavy robot guard on treads or legs that patrols, charges, shoots and shuts down in a slump. Change its size, bulk, drive, head, weapon, back pack and colours.',
  meta: {
    type: 'creature', role: 'characters/enemy', themes: ['sci-fi', 'space'], gameTypes: ['roguelike-action', 'shooter'], view: 'top-down',
    words: ['robot', 'guard', 'security', 'sentry', 'machine', 'tank', 'treads', 'patrol', 'charge', 'ram', 'shoot', 'shutdown', 'enemy', 'hazard stripes'], license: 'draft',
  },
  size: B.SIZE,
  pivot: B.PIVOT,
  preview: 'walk_down',
  // sounds that play with each animation: frame is counted from 0; preset is one of the sound's named styles
  sounds: {
    walk_down: [{ ...STEP, frame: 0 }, { ...STEP, frame: 4 }],
    walk_up: [{ ...STEP, frame: 0 }, { ...STEP, frame: 4 }],
    walk_side: [{ ...STEP, frame: 0 }, { ...STEP, frame: 4 }],
    attack_down: CHARGE, attack_up: CHARGE, attack_side: CHARGE,
    shoot_down: SHOT, shoot_up: SHOT, shoot_side: SHOT,
    hurt: [{ sound: 'bolt-impact', frame: 0, preset: 'On metal', volume: 0.9 }],
    die: [{ sound: 'bot-shutdown', frame: 0, preset: 'Bot shutdown', volume: 1 }],
  },
  params: {
    size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }),
    bulk: range('Bulk', 0.5, { lo: 'Light', hi: 'Heavy' }),
    legs: choice('Legs', 'treads', B.DRIVES),
    shape: choice('Shape', 'block', B.HEADS),
    // weapon: what it carries at its shoulder
    weapon: choice('Weapon', 'cannon', [...B.WEAPONS, 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // pack: what stands on its rear deck
    pack: choice('Pack', 'none', ['none', ...B.PACKS]),
    packSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    body: color('Body', D.hull, BODIES),
    accent: color('Hazard stripes', D.amber, ACCENTS),
    glow: color('Lights', D.red, GLOWS),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the security bot carries. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
    pack: { label: 'Pack', params: ['pack', 'packSize'], none: 'none', socket: 'back' },
  },
  // idle (down only), walk, attack (the charge) and shoot in three directions, then hurt and die, drawn facing down
  clips: B.clips((p) => p.speed, ['idle_down', 'walk*', { name: 'attack*', label: 'Charge' }, 'shoot*', 'hurt', 'die']),

  // attach points for every frame: hand (the weapon's housing), muzzle (the weapon's far end), head, back (the pack) and feet
  sockets: (clip, t, p) => botFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = botFrame(clip, t, p);
    const look = { body: p.body, accent: p.accent, glow: p.glow, metal: D.steel, dark: D.plate, core: D.cream, fire: D.amber };
    F.draw(g, look);
    F.finish(g, look);
  },
});
