// Mage (map): the mage of the Hearthvale kit as seen on the map, built on the top-down rig (rigs/topdown.js) the way
// sprites/hero-walker.js is. The same person as the side-view Wizard (sprites/wizard.js): purple robe with gold trim,
// pointed hat, long pale beard and hair, a staff whose orb glows. Everything generic is the rig's (Contract 11) or the
// effect helper's (engine/fx.js); this file only says what the Mage is:
//
//   1. mageFrame(clip, t, p): T.frameWith() with what the Mage holds and wears. A staff is carried upright, a wand or an
//      orb in a hand that hangs. The picture (render) and the attach points (sockets) both come from it.
//   2. render: F.draw(g, look, hooks). The robe hides the legs and its hem sways with each step (T.robe).
//   3. after the outline: the light of the staff, wand or orb, and of the spell in `cast` (with nothing held the
//      light gathers over the raised palm), so Glow shows with every weapon and with none.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { tone } from '../engine/color.js';
import { lerp, clamp } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import { steps, glow, particles, sparkles, ring, starburst } from '../engine/fx.js';
import * as T from '../rigs/topdown.js';

const HV = PALETTE.hearthvale;
const HATS = { pointed: 'hat-pointed', wide: 'hat-wide', hood: 'hood' };        // the rig's names, for T.headgearRise
const CARRY = { staff: 'upright', wand: 'up', orb: 'up' };

/** One frame of the Mage: the rig's pose with the staff, wand or orb held, kept inside the frame with the hat on. */
function mageFrame(clip, t, p) {
  const rise = p.headgear === 'none' ? 0 : T.headgearRise(HATS[p.headgear], p.headgearSize);
  // walking, the staff is a walking stick: lifted with one step and planted with the next (T.walkingStickManner)
  return T.frameWith(clip, t, p, { item: T.smallItemSize(p.weapon, p.weaponLength), carry: CARRY[p.weapon], rise, manner: T.walkingStickManner });
}

const STEPS = () => [{ sound: 'footstep-grass', frame: 0, preset: 'Grass', volume: 0.45 }, { sound: 'footstep-grass', frame: 4, preset: 'Grass', volume: 0.45 }];

export default defineSprite({
  id: 'mage-walker',
  name: 'Mage (map)',
  kind: 'Character',
  blurb: 'The mage as seen on the map, walking in four directions and casting a spell. Change the hat, staff, beard, robe and the colour of the magic.',
  meta: {
    type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['mage', 'wizard', 'sorcerer', 'spellcaster', 'party member', 'staff', 'robe', 'beard', 'walk', 'cast', 'spell', 'magic', 'overworld', 'old'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: {
    walk_down: STEPS(), walk_up: STEPS(), walk_side: STEPS(),
    cast: [{ sound: 'magic-spell', frame: 2, preset: 'Quick zap', volume: 0.8 }],
  },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    length: range('Robe', 0.85, { lo: 'Knee', hi: 'Floor' }),
    // headgear
    headgear: choice('Headgear', 'pointed', ['pointed', 'wide', 'hood', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // weapon
    weapon: choice('Weapon', 'staff', ['staff', 'wand', 'orb', 'none']),
    weaponLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // beard
    beard: choice('Beard', 'long', ['long', 'short', 'none']),
    beardLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // beard and hair: the long hair shows at the temples and the neck under every headgear, so it always shows
    hair: color('Hair and beard', HV.cream, swatches('hearthvale', 'hair', { lead: 'cream' })),
    outfit: color('Outfit', HV.mage, swatches('hearthvale', 'outfit', { lead: 'mage' })),
    // the hem of the robe, the cuffs, the sash and the band of the hat
    trim: color('Trim', HV.gold, swatches('hearthvale', 'trim', { lead: 'gold' })),
    // the light of the staff, wand or orb, and of the spell in `cast` (with nothing held too)
    glow: color('Glow', HV.magic, swatches('hearthvale', 'glow', { lead: 'magic' })),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  // What the Mage wears and holds. The first key of each list picks which one (or none); the rest are that part's own settings.
  parts: {
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    weapon: { label: 'Weapon', params: ['weapon', 'weaponLength'], none: 'none', socket: 'hand' },
    beard: { label: 'Beard', params: ['beard', 'beardLength'], none: 'none', socket: 'head' },
  },
  // idle_* and walk_* in three directions, then `cast` (drawn facing down, used for every direction)
  clips: T.clips((p) => p.speed, { action: null, plain: ['cast'] }),

  // attach points for every frame (hand, offhand, head, back, feet, muzzle: the lit end of what is held)
  sockets: (clip, t, p) => mageFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = mageFrame(clip, t, p), P = F.P;
    // the trim is told from the robe by its tone when both are set to the same colour
    const trim = p.trim === p.outfit ? tone(p.trim, 0.85) : p.trim;
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.9), boots: HV.wood,
      // the hair is a tone darker than the beard, as on the side-view Wizard, so the two stay apart
      hair: tone(p.hair, -0.7), hairStyle: 'long', hatted: p.headgear !== 'none', cuffs: trim,
    };
    F.draw(g, look, {
      torso(g, J, P, d) {
        T.robe(g, J, P, d, { colour: p.outfit, length: p.length, trim });
        T.belt(g, J, P, d, { colour: tone(trim, 0.85) });                          // the sash
      },
      head(g, J, P, d) {
        if (p.beard !== 'none') T.beard(g, J, P, d, { kind: p.beard, length: p.beardLength, colour: p.hair });
        if (p.headgear === 'hood') T.hood(g, J, P, d, { colour: p.outfit, depth: lerp(0, 2, clamp((p.headgearSize - 0.5) / 1.3)) });
        else if (p.headgear !== 'none') T.hat(g, J, P, d, { kind: p.headgear, size: p.headgearSize, colour: p.outfit, band: trim });
      },
      item(g, J) {
        if (F.item) T.smallItem(g, F.direction, F.hand(J), { kind: p.weapon, length: F.item.length, wood: HV.wood, orb: p.glow, glow: P.glow });
      },
    });
    F.finish(g);

    // ---- light: drawn after the outline, rimmed with a darker tone of its own colour ----
    const C = steps(p.glow), S = F.sockets();
    const casting = F.action === 'cast' && P.glow > 0.05;
    // where the light sits: the lit end of what is held, or over the raised palm of an empty hand
    const at = F.item ? S.muzzle : { x: S.hand.x - 2, y: S.hand.y - 4 };
    const x = Math.round(at.x) + 0.5, y = Math.round(at.y) + 0.5;
    const small = p.weapon === 'wand';
    if (casting && P.glow > 0.9) starburst(g, { x, y, count: 4, r1: F.item ? 8 : 7, width: 3, colour: C[1], rim: C.at(-1) });      // frame 4, the brightest
    if (F.item) glow(g, x, y, (small ? 1.9 : 3.4) + P.glow * (small ? 1.6 : 1.6), C);
    else if (casting) glow(g, x, y, 1.5 + P.glow * 3, C);
    if (casting) {
      // twinkles gather round the light while it grows; on the release (frames 5 and 6) a ring bursts from it
      if (t < 0.6) sparkles(g, { t: t * 1.5, count: 5, seed: 3, big: false, area: [x - 9, y - 9, x + 10, y + 10], colours: C });
      else ring(g, { t: clamp((t - 0.6) / 0.4), x, y, r0: 5, r1: 11, thick: 2, colours: C, seed: 2 });
    } else if (F.item) {
      // a mote or two drifting up from the light
      particles(g, { t, x, y: y - 3, count: 2, seed: 5, loop: true, lifespan: 0.6, angle: Math.PI, arc: 0.9, dist: 6, size: 1, colours: C.slice(1, 4) });
    }
  },
});
