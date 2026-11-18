// Party portraits (kit-rpg-fantasy, batch R15): the faces of the hero, the mage and the rogue for dialogue boxes
// and the battle status row. Each is the same person as their sprites: the hero of hero-walker and knight (steel
// helmet with a red plume, brown hair, blue tunic, red cape pinned with gold), the mage of mage-walker and wizard
// (purple pointed hat with a gold band, long pale hair and beard, purple robe trimmed with gold) and the rogue of
// rogue-walker and rogue-battler (teal hood, slate scarf with its ends flying).
//
// Every face is drawn by the face helper (engine/faces.js); this file only says who each person is.
import { defineSprite, range, choice, color } from '../engine/sprite.js';
import { tone } from '../engine/color.js';
import { PALETTE, swatches, swatchesBetween } from '../engine/palettes.js';
import { PORTRAIT_SIZE, PORTRAIT_PIVOT, PORTRAIT_FRAMES, faceClips, parseFaceClip, talkStep, portrait } from '../engine/faces.js';

const P = PALETTE.hearthvale;

// Who is who: the same colours and parts as each person's sprite at its default look.
const PEOPLE = {
  hero: (p) => ({
    skin: p.skin, build: 0.6,
    hair: { style: 'short', colour: P.wood },
    headgear: { kind: 'helmet', metal: P.steel, plume: P.crimson },
    outfit: { colour: p.hero, collar: 'mantle', trim: P.crimson, clasp: P.gold },
  }),
  mage: (p) => ({
    skin: p.skin, age: 'elder', build: 0.7, brows: 'bushy',
    hair: { style: 'long', colour: tone(P.cream, -0.7) },                 // a tone darker than the beard, as on the sprites
    beard: { kind: 'long', colour: P.cream },
    headgear: { kind: 'hat-pointed', colour: p.mage, band: P.gold },
    outfit: { colour: p.mage, collar: 'vee', trim: P.gold },
  }),
  rogue: (p) => ({
    skin: p.skin, build: 0.35,
    hair: { style: 'bald', colour: P.wheat },                              // the hood hides the hair
    headgear: { kind: 'hood', colour: p.rogue },
    outfit: { colour: p.rogue, collar: 'scarf', trim: P.slate },
  }),
};

export default defineSprite({
  id: 'portraits-party',
  name: 'Party portraits',
  kind: 'Character',
  blurb: 'Faces of the hero, the mage and the rogue for dialogue boxes and party menus: neutral, happy, hurt and talking. Change the border, the zoom and each person\'s colour.',
  meta: {
    type: 'icon', role: 'interface/icon', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'top-down-rpg'], view: 'front',
    words: ['portrait', 'face', 'avatar', 'hero', 'mage', 'rogue', 'party', 'dialogue', 'talk', 'happy', 'hurt', 'status', 'headshot'],
    license: 'draft',
  },
  size: [...PORTRAIT_SIZE],
  pivot: [...PORTRAIT_PIVOT],
  grounded: false,
  preview: 'hero-neutral',
  params: {
    frame: choice('Border', 'none', PORTRAIT_FRAMES),
    size: range('Zoom', 0.5, { lo: 'Head and shoulders', hi: 'Face' }),
    // with no border there is nothing behind the head
    backing: color('Backing', P.panel, swatches('hearthvale', 'face', { lead: 'panel' }), { when: { frame: ['round', 'square'] } }),
    skin: color('Skin', P.skin, swatches('hearthvale', 'skin', { lead: 'skin' })),
    // each person's own colour: the same default as the Outfit of their sprite
    // never the red of his cape, which lies on it
    hero: color('Hero\'s tunic', P.hero, swatches('hearthvale', 'outfit', { lead: 'hero' }).filter((c) => c !== P.crimson)),
    // always darker than the gold trim and the pale beard that lie on it
    mage: color('Mage\'s robe and hat', P.mage, swatchesBetween('hearthvale', 'outfit', { lead: 'mage', max: 0.6 })),
    rogue: color('Rogue\'s hood', P.rogue, swatches('hearthvale', 'outfit', { lead: 'rogue' })),
  },
  // per person: neutral, happy, hurt (one frame each), then talk (4 frames, at a fixed 8 fps)
  clips: faceClips(Object.keys(PEOPLE), ['neutral', 'happy', 'hurt'], { talk: true }),

  render(g, { clip, frame, p }) {
    const { who, mood, talk } = parseFaceClip(clip);
    portrait(g, PEOPLE[who](p), { mood, mouth: talk ? talkStep(frame) : 0, zoom: p.size, frame: p.frame, backing: p.backing, band: P.cream });
  },
});
