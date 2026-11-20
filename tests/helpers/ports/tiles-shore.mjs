// Writer of sprites/tiles-shore.json (build item T2), kept for audit as M5's writers are; tests/unit/library-tiles-t2
// holds the library file to what this writes.
// Usage: node tests/helpers/ports/tiles-shore.mjs [--write]   (says whether the library file is what this writes; writes it)
//
// The water and shore as data: a block of water (a hole: the narrow pieces too, and six versions of the open water),
// the two bridges as extra tiles and two decals, 8 frames each where the code had 8, every tile a picture naming
// tile.shore@1 (engine/gen/tile-ports.js, the port of the code's drawing) with its piece, Edge, Waves and Sparkle, and the
// colours the code worked out named as the code's colour rules: the open water engine/water.js waterTones' body (a tone
// 0.7 darker than the water), its streaks textureLight of that (from 0.5 without Sparkle: a choose on Sparkle),
// the froth a mix of the foam and the water, the foam's flashing stretches a mix of the foam and white, the bank
// raisedGround of the bank's colour (engine/ground.js); the lily pads and the rock are the code's fixed Hearthvale leaf,
// cream, gold and cobble.
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { PALETTE } from '../../../engine/palettes.js';
import { tileset, colourSlot, fixtureText, writerMain } from './tile-port-writer.mjs';

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-shore.json', import.meta.url));

const code = await codeSprite('tiles-shore');   // the frozen copy (tests/fixtures/code-sprites/)
const HV = PALETTE.hearthvale;
const palette = [
  colourSlot(code, 'water', 'water'),
  colourSlot(code, 'foam', 'water'),
  colourSlot(code, 'land', 'earth'),
  colourSlot(code, 'wood', 'wood'),
  { id: 'body', material: 'water', derive: { rule: 'tone', of: 'water', by: -0.7 } },
  { id: 'swell', material: 'water', derive: { rule: 'textureLight', of: 'body', against: 'body', from: 0.5 } },
  { id: 'sand', material: 'earth', derive: { rule: 'raisedGround', of: 'land' } },
  { id: 'crest', material: 'water', derive: { rule: 'mix', of: 'foam', with: 'white', amount: 0.7 } },
  { id: 'leaf', default: HV.leaf, material: 'plant', detail: true },
  { id: 'cream', default: HV.cream, material: 'plant', detail: true },
  { id: 'gold', default: HV.gold, material: 'plant', detail: true },
  { id: 'cobble', default: HV.cobble, material: 'stone', detail: true },
];
const water = {
  water: 'water', foam: 'foam', body: 'body',
  streak: { rule: 'choose', when: { sparkle: [true] }, then: { rule: 'textureLight', of: 'body' }, else: 'swell' },
  froth: { rule: 'mix', of: 'foam', with: 'water', amount: 0.5 },
  crest: 'crest', sand: 'sand',
};
const def = tileset({
  code, gen: 'tile.shore', palette, settings: ['edge', 'waves', 'sparkle'],
  groups: [
    { name: 'water', kind: 'block', use: 'hole', pieces: ['block', 'narrow'], fills: 6, frames: 8, fps: 6, paints: water, decals: [
      { name: 'a', place: 'on', label: code.clips['water-deco-a'].label, frames: 8, paints: { water: 'water', foam: 'foam', body: 'body', streak: { rule: 'textureLight', of: 'body' }, leaf: 'leaf', cream: 'cream', gold: 'gold' } },
      { name: 'b', place: 'on', label: code.clips['water-deco-b'].label, frames: 1, paints: { water: 'water', foam: 'foam', body: 'body', cobble: 'cobble' } },
    ] },
  ],
  extra: ['bridge-h', 'bridge-v'].map((name) => ({ name, label: code.clips[name].label, paints: { wood: 'wood' } })),
  decalOrder: 'last',
});

/** The text of sprites/tiles-shore.json as this writes it. */
export const written = () => fixtureText(def);

writerMain(import.meta, LIBRARY_FILE, written);
