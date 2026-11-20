// FROZEN COPY, not a sprite: sprites/village-elder.js as it was on 2026-11-20 (build item T1), before the migration redraws it as
// data (docs/data-sprites.md section 7). Kept only for the tests about the framework its code uses (tests/helpers/library.mjs
// codeSprite, codeSpriteSource); imports point at ../../../. Never edit it; the build never scans tests/.
// Village elder: an old villager who gives quests, seen on the map. Built on the top-down rig (rigs/topdown.js) the way
// sprites/hero-walker.js is: one posed frame serves the picture and the attach points. What is the elder's own: a bald
// crown ringed with white hair, a long beard, a grey robe with a coloured hem, sash and cuffs, a back bent over a
// walking stick (the Stoop slider), and slow short steps with the stick planted between them.
import { defineSprite, range, choice, color } from '../../../engine/sprite.js';
import { tone } from '../../../engine/color.js';
import { PALETTE, swatches } from '../../../engine/palettes.js';
import * as T from '../../../rigs/topdown.js';

const HV = PALETTE.hearthvale;
const SHORT_STEPS = 0.15;             // an old man's stride: the rig's Stride, fixed

/** One frame of the elder: the rig's pose, bent by the Stoop slider, with the cane planted or the lantern held out. */
function elderFrame(clip, t, p) {
  const item = T.itemSize(p.held, p.heldSize);
  const rise = p.headgear === 'cap' ? T.peakedCapRise(p.headgearSize) : 0;
  return T.frameWith(clip, t, { ...p, stride: SHORT_STEPS }, {
    item, rise, carry: p.held === 'lantern' ? 'hang' : 'low',
    manner(P, F, u) {
      T.stoop(P, F.direction, p.stoop);
      if (p.held === 'cane') T.plantStick(P, F.direction, F.d, { action: F.action, t: u, length: item.length });
      if (p.held === 'lantern') { P.armF.u += 3; P.armF.o += 1.5; }       // held up and out, to light the way
      if (F.action === 'talk') { P.armB.u += 2.5; P.armB.o += 2; }        // the free hand comes right up as he speaks
    },
  });
}

const STEPS = () => [{ sound: 'footstep-grass', frame: 0, preset: 'Dirt path', volume: 0.45 }, { sound: 'footstep-grass', frame: 4, preset: 'Dirt path', volume: 0.45 }];

export default defineSprite({
  id: 'village-elder',
  name: 'Village elder',
  kind: 'Character',
  blurb: 'An old villager bent over a walking stick, who walks slowly and talks. Change the stoop, beard, cap, what is held and the colours.',
  meta: {
    type: 'character', role: 'characters/npc', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'top-down',
    words: ['elder', 'old man', 'villager', 'grandfather', 'sage', 'quest giver', 'beard', 'cane', 'walk', 'talk', 'village', 'wise'], license: 'draft',
  },
  size: T.SIZE,
  pivot: T.PIVOT,
  preview: 'walk_down',
  sounds: { walk_down: STEPS(), walk_up: STEPS(), walk_side: STEPS() },
  params: {
    height: range('Height', 0.5, { lo: 'Short', hi: 'Tall' }),
    build: range('Build', 0.5, { lo: 'Slim', hi: 'Stocky' }),
    stoop: range('Stoop', 0.55, { lo: 'Upright', hi: 'Bent' }),
    // held
    held: choice('Held', 'cane', ['cane', 'lantern', 'none']),
    heldSize: range('Size', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Small', hi: 'Big' }),
    // beard
    beard: choice('Beard', 'long', ['long', 'short', 'none']),
    beardLength: range('Length', 1, { min: 0.65, max: 1.35, step: 0.05, lo: 'Short', hi: 'Long' }),
    // headgear
    headgear: choice('Headgear', 'none', ['none', 'cap', 'circlet']),
    headgearSize: range('Size', 1, { min: 0.5, max: 1.8, step: 0.05, lo: 'Small', hi: 'Big' }),
    skin: color('Skin', HV.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // hair is the ring of hair round the bald crown and the beard, so it shows with no beard and under the cap
    hair: color('Hair', HV.cream, swatches('hearthvale', 'hair', { lead: 'cream' })),
    outfit: color('Robe', HV.cobble, swatches('hearthvale', 'outfit', { lead: 'cobble' })),
    // trim is the robe's hem, sash and cuffs, the cap, and the stone of the circlet
    trim: color('Trim', HV.roof, swatches('hearthvale', 'trim', { lead: 'roof' })),
    bounce: range('Bounce', 0.5, { lo: 'Calm', hi: 'Bouncy', group: 'Motion' }),
    speed: range('Speed', 0.5, { lo: 'Slow', hi: 'Fast', group: 'Motion' }),
  },
  parts: {
    held: { label: 'Held', params: ['held', 'heldSize'], none: 'none', socket: 'hand' },
    beard: { label: 'Beard', params: ['beard', 'beardLength'], none: 'none', socket: 'head' },
    headgear: { label: 'Headgear', params: ['headgear', 'headgearSize'], none: 'none', socket: 'head' },
  },
  // idle_* and walk_* in three directions, then talk (drawn facing down, used for every direction)
  clips: T.clips((p) => p.speed, { action: null, plain: ['talk'] }),

  sockets: (clip, t, p) => elderFrame(clip, t, p).sockets(),

  render(g, { clip, t, p }) {
    const F = elderFrame(clip, t, p);
    const look = {
      skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: HV.wood,
      hair: p.hair, hairStyle: 'bald', hatted: p.headgear === 'cap', cuffs: p.trim,
    };
    F.draw(g, look, {
      torso(g, J, P, d) {
        T.robe(g, J, P, d, { colour: p.outfit, length: 0.55, trim: p.trim });
        T.belt(g, J, P, d, { colour: p.trim });
        T.hunch(g, J, P, d, { colour: p.outfit });
      },
      head(g, J, P, d) {
        T.baldingHair(g, J, P, d, { colour: p.hair });
        if (p.beard !== 'none') T.beard(g, J, P, d, { kind: p.beard, length: p.beardLength, colour: p.hair });
        if (p.headgear === 'cap') T.peakedCap(g, J, P, d, { size: p.headgearSize, colour: p.trim });
        if (p.headgear === 'circlet') T.circlet(g, J, P, d, { size: p.headgearSize, metal: HV.gold, gem: p.trim });
      },
      item(g, J) {
        if (F.item) T.heldItem(g, F.direction, F.hand(J), { kind: p.held, length: F.item.length, wood: HV.wood, metal: HV.rust, glow: HV.thunder });
      },
      front(g, J, P, d) { T.hunch(g, J, P, d, { colour: p.outfit, front: true }); },
    });
    F.finish(g);
  },
});
