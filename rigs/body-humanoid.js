// The side-view person as a library body of the studio (studio item F2; docs/studio.md 2.3, "Library bodies: one
// module each"): the descriptor engine/library-body.js defineLibraryBody() takes, listed in engine/library-bodies.js.
// It says what a definition with `body: { library: "humanoid", figure }` may hold and how it is drawn:
//   figure      the definition rigs/humanoid-figure.js documents in its header (stance, moves and the blocks body,
//               motion, look, hair, held, headgear, mask, scarf, belt, cape, coat, pack, thrown, loot), as a spec;
//   settings    what a slider or choice may `sets` (catalog/studio-schema.js exports it as FIGURE_SETTINGS), the older
//               short names height, build and head through aliases; colours: what body.paint may paint (FIGURE_COLOURS);
//   keys        the pose fields of rigs/humanoid.js pose() and the figure's moves (HUMANOID_POSE_FIELDS,
//               HUMANOID_MOVE_FIELDS), with the ranges, words and nulls of rigs/humanoid-studio.js POSE_FIELDS;
//   drawing     rigs/humanoid-studio.js drawSprite and spriteSockets (the Hero's parts, figureFor, keysFor and the frame
//               edits); bake: its bakeClip on the stored figure (keys are made for the figure as stored).
// The tables were in catalog/studio-schema.js until F2; the schema still exports them under their old names.
// A side module of no rig (not rigs/humanoid-*.js), so the rig's description (rigs/humanoid-describe.js) is not changed.
import { defineLibraryBody, FIGURE_FIELD } from '../engine/library-body.js';
import { FIGURE_BLOCKS } from '../engine/data-rules.js';
import { SKIN, HAIR, METAL } from '../engine/sprite.js';
import { POSES, HAIR_STYLES, ITEMS, SIZE, PIVOT } from './humanoid.js';
import { STANCES, MOVES, HELD, HEADGEAR, PACKS } from './humanoid-figure.js';
import { POSE_FIELDS, CAPE_KINDS, HERO_HEADGEAR, drawSprite, spriteSockets, bakeClip } from './humanoid-studio.js';

const { colour: COLOUR, flag: BOOL, number: n, word: oneOf, map } = FIGURE_FIELD;
const HELD_KINDS = ['none', ...new Set([...Object.keys(ITEMS), ...Object.keys(HELD)])];
const POSE_NAMES = [...POSES, ...MOVES];

/**
 * What a key of a humanoid library body may hold: the fields of the pose rigs/humanoid.js pose() returns and
 * rigs/humanoid-figure.js adds, each with its kind: px (pixels), angle (degrees), share (0..1), signed (-1..1),
 * point ({ x, y } pixels), arm ({ a, e } degrees), flag (true or false, stepped).
 */
export const HUMANOID_POSE_FIELDS = Object.freeze({
  rootX: 'px', lift: 'px', crouch: 'px', lean: 'angle', headTilt: 'angle', item: 'angle', item2: 'angle',
  sway: 'signed', glow: 'share', lie: 'share', headTurn: 'angle', pull: 'share', fling: 'share', air: 'share', out: 'share', level2: 'share',
  footF: 'point', footB: 'point', armF: 'arm', armB: 'arm',
  blink: 'flag', flash: 'flag', mouth: 'flag', fire: 'flag',
});

/**
 * What a key of a humanoid library body may hold besides HUMANOID_POSE_FIELDS: the fields the figure's own moves add
 * (rigs/humanoid-figure.js throw, toss, steal; ranges, words and null from rigs/humanoid-studio.js POSE_FIELDS): far
 * (share), glint (count: a whole number 0..2), prize (flag), knife (word: 'hand' or 'air', or null). air and knife may be null.
 */
export const HUMANOID_MOVE_FIELDS = Object.freeze({ far: 'share', glint: 'count', prize: 'flag', knife: 'word' });

/** A key field of the person: its kind, with the range (count), words (word) and null (none) rigs/humanoid-studio.js POSE_FIELDS gives it. */
function keyField(f, kind) {
  const own = POSE_FIELDS[f] ?? {};
  return { kind, ...(kind === 'count' ? { min: own.min, max: own.max } : {}), ...(kind === 'word' ? { values: own.values } : {}), ...(own.none ? { none: true } : {}) };
}

/** The side-view person (rigs/humanoid.js through rigs/humanoid-figure.js and rigs/humanoid-studio.js) as a library body: body.library "humanoid". */
export const HUMANOID_BODY = defineLibraryBody({
  id: 'humanoid',
  label: 'Side-view person',
  view: 'side',
  sizes: [[...SIZE]],
  pivots: { [`${SIZE[0]}x${SIZE[1]}`]: [...PIVOT] },
  figure: {
    stance: oneOf(Object.keys(STANCES)),
    moves: map('clip name', 'pose', POSE_NAMES),
    body: { height: n(0, 1), build: n(0, 1), head: n(0, 1) },
    motion: { bounce: n(0, 1), stride: n(0, 1) },
    look: { skin: COLOUR, top: COLOUR, bottom: COLOUR, boots: COLOUR, bareArms: BOOL },
    hair: { style: oneOf(HAIR_STYLES), colour: COLOUR },
    held: { kind: oneOf(HELD_KINDS), length: n(0.25, 3), angle: n(-180, 180), swing: n(0.5, 1.3), metal: COLOUR, wood: COLOUR, hilt: COLOUR, cord: COLOUR },
    headgear: { kind: oneOf(['none', ...HEADGEAR, ...HERO_HEADGEAR]), size: n(0.25, 3), colour: COLOUR, band: COLOUR },
    mask: { colour: COLOUR, drape: n(0, 10) },
    scarf: { kind: oneOf(['none', 'short', 'long']), length: n(0.25, 3), colour: COLOUR },
    belt: { style: oneOf(['plain', 'hero']), colour: COLOUR, buckle: COLOUR },
    cape: { kind: oneOf(['none', ...CAPE_KINDS]), length: n(0.3, 1.8), colour: COLOUR },
    coat: { colour: COLOUR, belt: COLOUR, ragged: n(0, 1), length: n(0, 1.5) },
    pack: { kind: oneOf(['none', ...PACKS]), size: n(0.25, 3), colour: COLOUR, trim: COLOUR, leather: COLOUR, fletching: COLOUR, shaft: COLOUR },
    thrown: { metal: COLOUR, hilt: COLOUR },
    loot: { colour: COLOUR, tie: COLOUR, glint: COLOUR },
  },
  figureHelp: 'rigs/humanoid-figure.js describes its fields',
  aliases: { height: 'body.height', build: 'body.build', head: 'body.head' },
  blocks: [...FIGURE_BLOCKS],
  parts: ['held', 'headgear', 'mask', 'scarf', 'belt', 'coat', 'pack', 'cape'],
  partSockets: { held: 'hand', headgear: 'head', mask: 'head', cape: 'back', pack: 'back' },
  sockets: (figure) => ['hand', 'offhand', 'head', 'back', 'feet', ...(figure?.thrown !== null && typeof figure?.thrown === 'object' && !Array.isArray(figure.thrown) ? ['muzzle'] : [])],
  socketsNote: ' (and muzzle when the figure throws: thrown)',
  keyFields: Object.fromEntries(Object.entries({ ...HUMANOID_POSE_FIELDS, ...HUMANOID_MOVE_FIELDS }).map(([f, kind]) => [f, keyField(f, kind)])),
  poses: POSE_NAMES,
  slots: {
    skin: { label: 'Skin', material: 'skin', swatches: SKIN },
    hair: { label: 'Hair', material: 'cloth', swatches: HAIR },
    metal: { label: 'Metal', material: 'metal', swatches: METAL },
  },
  draw: (g, def, o) => drawSprite(g, def, o),
  socketsAt: (def, o) => spriteSockets(def, o),
  bake: (def, clip, o = {}) => bakeClip(def.body.figure, clip, o),
});
