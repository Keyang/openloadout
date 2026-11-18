// Villager portraits (kit-rpg-fantasy, batch R15): the faces of the four townsfolk for dialogue boxes. Each is the
// same person as their sprite: the village elder (bald crown ringed with pale hair, long pale beard, grey robe with
// terracotta trim), the merchant (terracotta turban with a gold jewel, round spectacles, a ponytail, a long neck and
// an apron over a wheat shirt), the town guard (steel helmet with a wheat plume, mail under a blue tabard with a
// wheat border, his halberd at his shoulder) and the farm child (a big head of brown hair, a wheat smock with a
// terracotta collar).
//
// Every face is drawn by the face helper (engine/faces.js); this file only says who each person is.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { PORTRAIT_SIZE, PORTRAIT_PIVOT, PORTRAIT_FRAMES, faceClips, parseFaceClip, portrait } from '../engine/faces.js';

const P = PALETTE.hearthvale;

// Who is who: the same colours and parts as each person's sprite at its default look.
const PEOPLE = {
  elder: (p) => ({
    skin: p.skin, age: 'elder', build: 0.3, brows: 'bushy',
    hair: { style: 'balding', colour: P.cream },
    beard: { kind: 'long', colour: P.cream },
    outfit: { colour: p.elder, collar: 'vee', trim: P.roof },
  }),
  merchant: (p) => ({
    skin: p.skin, build: 0.2, neck: 1,
    hair: { style: 'ponytail', colour: P.wood },
    headgear: { kind: 'turban', colour: P.roof, jewel: P.gold },
    spectacles: { frame: P.slate, lens: P.cream },
    outfit: { colour: p.merchant, collar: 'apron', trim: P.roof },
  }),
  guard: (p) => ({
    skin: p.skin, build: 0.9,
    hair: { style: 'short', colour: P.wood },
    headgear: { kind: 'helmet', metal: P.steel, plume: P.wheat },
    outfit: { colour: P.cobble, collar: 'tabard', panel: p.guard, trim: P.wheat },       // mail, with the tabard over it
    carried: { kind: 'halberd', metal: P.steel, wood: P.wood },
  }),
  kid: (p) => ({
    skin: p.skin, age: 'child',
    hair: { style: 'short', colour: P.wood },
    outfit: { colour: P.wheat, collar: 'collar', trim: p.kid },                          // the smock, with its collar
  }),
};

export default defineSprite({
  id: 'portraits-village',
  name: 'Villager portraits',
  kind: 'Character',
  blurb: 'Faces of the village elder, the merchant, the town guard and the farm child for dialogue boxes: neutral, happy and worried. Change the border, the zoom and each person\'s colour.',
  meta: {
    type: 'icon', role: 'interface/icon', themes: ['fantasy', 'farm'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'front',
    words: ['portrait', 'face', 'avatar', 'villager', 'elder', 'merchant', 'guard', 'child', 'townsfolk', 'dialogue', 'talk', 'happy', 'worried', 'quest'],
    license: 'draft',
  },
  size: [...PORTRAIT_SIZE],
  pivot: [...PORTRAIT_PIVOT],
  grounded: false,
  preview: 'elder-neutral',
  params: {
    frame: choice('Border', 'none', PORTRAIT_FRAMES),
    size: range('Zoom', 0.5, { lo: 'Head and shoulders', hi: 'Face' }),
    // with no border there is nothing behind the head
    backing: color('Backing', P.panel, swatches('hearthvale', 'face', { lead: 'panel' }), { when: { frame: ['round', 'square'] } }),
    skin: color('Skin', P.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // each person's own colour, with the default of their sprite
    // always lighter than its terracotta trim and darker than the pale beard
    elder: color('Elder\'s robe', P.cobble, swatchesBetween('hearthvale', ['outfit', 'stone'], { lead: 'cobble', min: 0.56, max: 0.82 })),
    // always lighter than the apron over it
    merchant: color('Merchant\'s shirt', P.wheat, swatchesBetween('hearthvale', ['outfit', 'grass', 'water'], { lead: 'wheat', min: 0.58 })),
    // the tabard is always darker than the mail round it, as on the guard's sprite
    guard: color('Guard\'s tabard', P.hero, swatchesBetween('hearthvale', 'outfit', { lead: 'hero', max: 0.56 })),
    // the collar is always darker than the smock under it, as on the child's sprite
    kid: color('Child\'s collar', P.roof, swatchesBetween('hearthvale', ['accent', 'trim', 'outfit'], { lead: 'roof', max: 0.5 })),
  },
  clips: faceClips([['elder', 'Elder'], ['merchant', 'Merchant'], ['guard', 'Guard'], ['kid', 'Child']], ['neutral', 'happy', 'worried']),

  render(g, { clip, p }) {
    const { who, mood } = parseFaceClip(clip);
    portrait(g, PEOPLE[who](p), { mood, zoom: p.size, frame: p.frame, backing: p.backing, band: P.cream });
  },
});
