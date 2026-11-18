// Merchant: a tall, lean trader who stands at a stall, seen on the map. Built on the top-down rig (rigs/topdown.js)
// the way sprites/hero-walker.js is. What is the merchant's own: long arms and a long neck, a long apron, round
// spectacles, a pack over one shoulder hung with a rolled rug and a lantern, and two gestures in place of a walk:
// `talk` counts on the fingers of the free hand, `wave` raises that arm high and swings it twice.
import { defineSprite, range, choice, color, toggle } from '../engine/sprite.js';
import { tone } from '../engine/color.js';
import { lerp } from '../engine/motion.js';
import { PALETTE, swatches } from '../engine/palettes.js';
import * as T from '../rigs/topdown.js';

const HV = PALETTE.hearthvale;
const TALL = [29, 35];                // a head taller than the other townsfolk
const NECK = 3;                       // rows the head is carried above the shoulders
const GOODS = { 'coin purse': 'purse', scale: 'scale' };        // the option's name -> the rig's kind
const RISE = { turban: T.turbanRise, cap: T.peakedCapRise, 'straw hat': (size) => T.headgearRise('hat-wide', size) };

/** One frame of the merchant: standing, counting (`talk`) or waving, with the head carried high and what is held hung from a raised hand. */
function merchantFrame(clip, t, p) {
  const item = T.tradeItemSize(GOODS[p.held], p.heldSize);
  return T.poseFrame(clip, t, p, {
    item, carry: 'hang', tall: TALL, rise: RISE[p.headgear]?.(p.headgearSize) ?? 0,
    dims: (d) => ({ ...d, arm: d.arm + 2 }),
    pose: (action, direction, u, m, d) => (action === 'wave' ? T.gesture('wave', direction, u, m, d) : action === 'talk' ? T.gesture('count', direction, u, m, d) : null),
    manner(P) {
      P.headDy = (P.headDy ?? 0) - NECK;
      if (item) P.armF.o += 2.5;                                   // held out, clear of the apron
      if (P.wave && p.headgear === 'straw hat') P.wave.clear = p.headgearSize - 1;      // the waving hand stays out from under a wide brim
    },
  });
}

export default defineSprite({
  id: 'merchant',
  name: 'Merchant',
  kind: 'Character',
  blurb: 'A tall, lean trader who stands at a stall, counts on his fingers and waves customers over. Change the pack, headgear, spectacles, what is held and the colours.',
  meta: {
    type: 'character', role: 'characters/npc', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['merchant', 'trader', 'shopkeeper', 'vendor', 'seller', 'shop', 'stall', 'buy', 'sell', 'talk', 'wave', 'apron', 'backpack'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'idle_down',
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.3, { lo: 'Slim', hi: 'Stocky' }),
    spectacles: toggle('Spectacles', true),                      // round, 11 px across
    // pack
    pack: choice('Pack', 'backpack', ['backpack', 'crate', 'sack', 'none']),
    packSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    // headgear
    headgear: choice('Headgear', 'turban', ['turban', 'cap', 'straw hat', 'none']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    // held
    held: choice('Held', 'none', ['none', 'coin purse', 'scale']),
    heldSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // hair is a fringe and a ponytail, which show below every headgear
    hair: color('Hair', HV.wood, swatches('hearthvale', 'hair', { lead: 'wood' })),
    outfit: color('Outfit', HV.wheat, swatches('hearthvale', 'outfit', { lead: 'wheat' })),
    // accent is the apron and the cuffs, and the turban, the cap or the band of the straw hat
    accent: color('Apron', HV.roof, swatches('hearthvale', 'accent', { lead: 'roof' })),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: {
    pack: { label: 'Pack', params: ['pack', 'packSize'], none: 'none', socket: 'back' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
    held: { label: 'Held', params: ['held', 'heldSize'], none: 'none', socket: 'hand' },
  },
  // idle_* in three directions (a merchant does not walk), then talk and wave, drawn facing down
  clips: T.clips((p) => p.speed, {
    action: null, walk: false, plain: ['talk'],
    extra: { wave: { frames: 8, fps: (p) => 10 * lerp(0.65, 1.45, p.speed), loop: false } },
  }),

  sockets: (clip, t, p) => merchantFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = merchantFrame(clip, t, p);
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: HV.wood,
      hair: p.hair, hairStyle: 'ponytail', hatted: p.headgear !== 'none', cuffs: p.accent,
    };
    F.draw(g, look, {
      behind(g, J, P, d) {
        if (p.pack !== 'none') T.travelPack(g, J, P, d, { kind: p.pack, size: p.packSize, colour: p.pack === 'sack' ? HV.cream : HV.path, wood: HV.wood, rug: HV.rogue, lantern: HV.thunder });
      },
      torso(g, J, P, d) {
        T.neck(g, J, P, d, { skin: p.skin });
        T.apron(g, J, P, d, { colour: p.accent, length: 0.55 });
        if (p.pack !== 'none') T.packStraps(g, J, P, d, { colour: HV.wood });
      },
      head(g, J, P, d) {
        if (p.headgear === 'turban') T.turban(g, J, P, d, { size: p.headgearSize, colour: p.accent, jewel: HV.gold });
        if (p.headgear === 'cap') T.peakedCap(g, J, P, d, { size: p.headgearSize, colour: p.accent });
        if (p.headgear === 'straw hat') T.hat(g, J, P, d, { kind: 'wide', size: p.headgearSize, colour: HV.wheat, band: p.accent });
        if (p.spectacles) T.spectacles(g, J, P, d, { frame: HV.slate, lens: HV.cream });
      },
      item(g, J) {
        if (F.item) T.tradeItem(g, F.direction, F.hand(J), { kind: GOODS[p.held], length: F.item.length, metal: HV.gold, wood: HV.wood, hilt: HV.gold });
      },
      front(g, J, P, d) {
        T.fingers(g, J, P, d, { skin: p.skin });                                             // talk
        T.waveArm(g, J, P, d, { sleeve: p.outfit, skin: p.skin, cuff: p.accent });           // wave
      },
    });
    F.finish(g);
  },
});
