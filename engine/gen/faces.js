// Face generators (migration batch M4b; docs/data-sprites.md 3.3, family "face"): the library's portrait sets as data.
// A portrait set's file says who each person is and what each clip's face does; portrait@1 draws them.
//   portrait@1   one head-and-shoulders portrait of a person described by its arguments, in a mood, talking or not,
//                at a zoom, with or without a round or square border: a port of engine/faces.js portrait (the code the
//                code portrait sets called), drawn on an engine/gen/port-surface.js grid by engine/gen/ports/faces.js
//                and handed back as stamps, so the redraw is the old picture pixel for pixel.
//
// The person is plain arguments, words, numbers and paints (engine/faces.js "A PERSON IS DATA"); a feature that is not
// there is the word "none" (beard, headgear, collar, carried) or the paint "clear" (a plume, a hat band, a jewel, a clasp,
// the spectacles' wire); a feature's colours are a small group of their own (gearPaints, spectacles, outfitPaints,
// carriedPaints).
// Two things the code worked out from colours' numbers are said by the definition instead:
//   - hairLight and beardLight: how light the hair and the beard colours are (engine/color.js brightness, 0 to 1). Where
//     the skin is within 0.25 of it the hair (or beard) gets a rim one tone darker than itself; where it is within 0.3,
//     the brows are a tone darker than the hair (ink on a skin darker than 0.5). The test on the skin becomes ifLight
//     colour rules, so any skin colour a person picks is shaded as the code shaded it.
//   - a second cloth given the first one's colour (a trim the same as its outfit) was moved a tone lighter (apart): the
//     definition writes that as a `choose` colour rule on the setting that holds the outfit's colour.
//
//   { "gen": "portrait", "v": 1, "at": [24, 24], "mood": "happy", "zoom": { "from": "size", "map": [[0, 0], [1, 1]] },
//     "frame": { "from": "frame", "pick": { "none": "none", "round": "round", "square": "square" } }, "backing": "backing", "edge": "cream",
//     "skin": "skin", "white": "white", "hair": "short", "hairPaint": "wood", "hairLight": 0.4523,
//     "headgear": "helmet", "gearPaints": { "metal": "steel", "plume": "crimson" },
//     "outfit": "hero", "collar": "mantle", "outfitPaints": { "trim": "crimson", "clasp": "gold" } }
//
// Pure: no randomness, no clock; Node and browser.
import { defineGenerator } from './registry.js';
import { point, px, share, count, word, flag, paint, struct } from './args.js';
import { PortSurface, withPaintTable, portTiles, shiftTo } from './port-surface.js';
import { workCost } from './pixels.js';
import { portrait, talkStep, FACE_MOODS, FACE_AGES, FACE_HAIR, FACE_HEADGEAR, FACE_BEARDS, FACE_COLLARS, FACE_CARRIED, PORTRAIT_FRAMES } from './ports/faces.js';

/** The side of a portrait's square frame, in pixels (engine/faces.js PORTRAIT_SIZE): portrait@1 draws a picture this size, its middle on `at`. */
export const PORTRAIT_SIDE = 48;

// Shape tests one pixel of the portrait is charged: the layers' fills, rims and paste each walk the whole grid, so a
// call costs about what engine/faces.js portrait took (a cost unit is about 0.01 ms). Measured on 2026-11-20 (Node 24,
// an idle machine): the old code's heaviest library face, the mage at zoom 1 in a round border, 3.3 ms; this port about
// the same. Charged 328 a call, so a set of twelve faces (the validator prices every picture of a set together, though
// a frame draws one) stays within the 4,000 of a frame.
const WORK_PER_PIXEL = 576;

const none = (v) => v === undefined || v === null || v === 'clear';
/** The headgear words portrait@1 takes: engine/faces.js FACE_HEADGEAR with its one two-word name joined ("kettle hat" is kettle-hat: a word is one id). */
export const PORTRAIT_HEADGEAR = Object.freeze(FACE_HEADGEAR.map((g) => g.replace(' ', '-')));

/** The person engine/gen/ports/faces.js draws, from a portrait@1 call's arguments (each feature that is off left out). */
function personOf(a) {
  const g = a.gearPaints ?? {}, o = a.outfitPaints ?? {}, c = a.carriedPaints ?? {}, sp = a.spectacles;
  return {
    skin: a.skin, white: a.white, age: a.age, build: a.build, neck: a.neck, brows: a.brows,
    hair: { style: a.hair, colour: a.hairPaint, light: a.hairLight },
    ...(a.beard !== 'none' ? { beard: { kind: a.beard, colour: a.beardPaint, light: a.beardLight, length: a.beardLength } } : {}),
    ...(a.headgear !== 'none' ? { headgear: { kind: FACE_HEADGEAR[PORTRAIT_HEADGEAR.indexOf(a.headgear)], colour: g.cloth ?? 'clear', metal: g.metal ?? 'clear', ...(none(g.plume) ? {} : { plume: g.plume }), ...(none(g.band) ? {} : { band: g.band }), ...(none(g.jewel) ? {} : { jewel: g.jewel }) } } : {}),
    ...(sp && !none(sp.wire) ? { spectacles: { frame: sp.wire, lens: sp.lens ?? 'clear' } } : {}),
    outfit: { colour: a.outfit, collar: a.collar, trim: o.trim ?? 'clear', ...(none(o.clasp) ? {} : { clasp: o.clasp }), panel: o.panel ?? 'clear' },
    ...(a.carried !== 'none' ? { carried: { kind: a.carried, metal: c.metal ?? 'clear', wood: c.wood ?? 'clear' } } : {}),
  };
}

/**
 * portrait@1: one head-and-shoulders portrait, 48 x 48 pixels with its middle on `at`, of the person its arguments
 * describe (port of engine/faces.js portrait): the head three quarters to the right, lit from the top right, in a mood,
 * with the mouth closed, or opening and closing with the clip's frames while `talk` is on (closed, half, open, half), at a
 * zoom from head and shoulders to the face, alone (cut to the frame's 1 px border and inked) or in a round or square
 * border round the backing colour. Returns stamps.
 */
export const portraitGen = defineGenerator({
  id: 'portrait', v: 1, family: 'face',
  about: 'A head-and-shoulders portrait of a person described by its arguments, in a mood, talking or not, zoomed, in a border or alone (port of engine/faces.js).',
  args: {
    at: point({ default: [24, 24], about: 'Where the middle of its 48 x 48 picture goes' }),
    mood: word(FACE_MOODS, { default: 'neutral', about: 'What the face shows: brows, eyes and mouth (hurt tips the head back, worried adds a drop of sweat)' }),
    mouth: count(0, 2, { default: 0, about: 'How far the mouth is open: 0 closed, 1 half, 2 open' }),
    talk: flag({ default: false, about: 'The mouth opens and closes with the clip\'s frames (closed, half, open, half), for a talk clip' }),
    zoom: share({ default: 0.5, about: 'Head and shoulders (0) to the face (1)' }),
    frame: word(PORTRAIT_FRAMES, { default: 'none', about: 'The border: none, a round medallion or a square plate' }),
    backing: paint({ default: 'clear', about: 'The colour inside a border, behind the head' }),
    edge: paint({ default: 'clear', about: 'The colour of a border\'s band' }),
    skin: paint({ about: 'The skin' }),
    white: paint({ about: 'The whites of the eyes, the teeth and a drop of sweat' }),
    age: word(FACE_AGES, { default: 'adult', about: 'Adult, child (smaller shoulders, bigger eyes) or elder (lines on the brow)' }),
    build: share({ default: 0.5, about: 'Narrow (0) to broad (1) shoulders' }),
    neck: share({ default: 0.3, about: 'Short (0) to long (1) neck' }),
    brows: word(['thin', 'bushy'], { default: 'thin', about: 'Thin or bushy brows' }),
    hair: word(FACE_HAIR, { default: 'bald', about: 'The hair style' }),
    hairPaint: paint({ about: 'The hair colour (the brows take it too)' }),
    hairLight: share({ default: 0.5, about: 'How light the hair colour is (engine/color.js brightness): the skin near it gives the hair a darker rim and darker brows' }),
    beard: word(FACE_BEARDS, { default: 'none', about: 'No beard, a short one or a long one' }),
    beardPaint: paint({ default: 'clear', about: 'The beard colour' }),
    beardLight: share({ default: 0.5, about: 'How light the beard colour is: the skin near it gives the beard a darker rim' }),
    beardLength: px(0.65, 1.35, { default: 1, about: 'How long a long beard hangs' }),
    headgear: word(PORTRAIT_HEADGEAR, { default: 'none', about: 'What is worn on the head' }),
    gearPaints: struct({
      cloth: paint({ default: 'clear', about: 'The cloth of a hat, hood, turban or cap' }),
      metal: paint({ default: 'clear', about: 'The metal of a helmet or kettle hat' }),
      plume: paint({ default: 'clear', about: 'A helmet\'s plume (clear: none)' }),
      band: paint({ default: 'clear', about: 'A pointed or wide hat\'s band (clear: none)' }),
      jewel: paint({ default: 'clear', about: 'A turban\'s jewel (clear: none)' }),
    }, { default: {}, about: 'The headgear\'s colours' }),
    spectacles: struct({
      wire: paint({ default: 'clear', about: 'The wire (clear: no spectacles)' }),
      lens: paint({ default: 'clear', about: 'The glint on the lenses' }),
    }, { default: {}, about: 'Round wire spectacles: their colours (none without a wire)' }),
    outfit: paint({ about: 'The cloth on the shoulders' }),
    collar: word(FACE_COLLARS, { default: 'none', about: 'What is round the neck and over the chest' }),
    outfitPaints: struct({
      trim: paint({ default: 'clear', about: 'The collar, mantle, scarf, apron or tabard border' }),
      clasp: paint({ default: 'clear', about: 'A mantle\'s clasp at the throat (clear: none)' }),
      panel: paint({ default: 'clear', about: 'A tabard\'s panel' }),
    }, { default: {}, about: 'The colours of what is round the neck and over the chest' }),
    carried: word(['none', ...FACE_CARRIED], { default: 'none', about: 'A pole weapon standing behind the near shoulder' }),
    carriedPaints: struct({
      metal: paint({ default: 'clear', about: 'Its head' }),
      wood: paint({ default: 'clear', about: 'Its shaft' }),
    }, { default: {}, about: 'The pole weapon\'s colours' }),
  },
  cost: () => portTiles(PORTRAIT_SIDE, PORTRAIT_SIDE) + workCost(PORTRAIT_SIDE * PORTRAIT_SIDE * WORK_PER_PIXEL),
  run(a, ctx) {
    const frame = Number.isInteger(ctx?.frame) ? ctx.frame : 0;
    const mouth = a.talk ? talkStep(frame) : a.mouth;
    return withPaintTable(() => {
      const g = new PortSurface(PORTRAIT_SIDE, PORTRAIT_SIDE);
      portrait(g, personOf(a), { mood: a.mood, mouth, zoom: a.zoom, frame: a.frame, backing: a.backing, band: a.edge });
      return g.stamps(shiftTo(a.at, PORTRAIT_SIDE / 2, PORTRAIT_SIDE / 2));
    });
  },
});
