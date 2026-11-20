// Writer of sprites/tiles-meadow.json (build item T2), kept for audit as M5's writers are; tests/unit/library-tiles-t2
// holds the library file to what this writes.
// Usage: node tests/helpers/ports/tiles-meadow.mjs [--write]   (says whether the library file is what this writes; writes it)
//
// The meadow as data: a floor of grass (three versions) and a block of soft path, every tile a picture naming
// tile.meadow@1 (engine/gen/tile-ports.js, the port of the code's drawing) with its piece, Edge, Texture, Wear and
// Pebbles, and the colours the code worked out named as the code's colour rules: the path's body raisedGround of the
// path (engine/ground.js), its grains textureTone of that, the blades textureTone of the grass, their tips textureLight
// of the grass; the pebbles' stone is the code's fixed Hearthvale cobble.
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { PALETTE } from '../../../engine/palettes.js';
import { tileset, colourSlot, fixtureText, writerMain } from './tile-port-writer.mjs';

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-meadow.json', import.meta.url));

const code = await codeSprite('tiles-meadow');   // the frozen copy (tests/fixtures/code-sprites/)
const palette = [
  colourSlot(code, 'grass', 'plant'),
  colourSlot(code, 'path', 'earth'),
  colourSlot(code, 'flowers', 'plant'),
  { id: 'sand', material: 'earth', derive: { rule: 'raisedGround', of: 'path' } },
  { id: 'grain', material: 'earth', derive: { rule: 'textureTone', of: 'sand' } },
  { id: 'blade', material: 'plant', derive: { rule: 'textureTone', of: 'grass' } },
  { id: 'tip', material: 'plant', derive: { rule: 'textureLight', of: 'grass' } },
  { id: 'cobble', default: PALETTE.hearthvale.cobble, material: 'stone', detail: true },
];
const grass = { grass: 'grass', blade: 'blade', tip: 'tip' };
const def = tileset({
  code, gen: 'tile.meadow', palette, settings: ['edge', 'texture', 'wear', 'stones'], decalOrder: 'last',
  groups: [
    { name: 'grass', kind: 'floor', fills: 3, paints: grass, decals: [
      { name: 'a', place: 'on', label: 'Grass tuft', paints: { grass: 'grass', blade: 'blade' } },
      { name: 'b', place: 'on', label: 'Flowers', paints: { grass: 'grass', blade: 'blade', flowers: 'flowers' } },
      { name: 'c', place: 'on', label: 'Pebbles', paints: { blade: 'blade', cobble: 'cobble' } },
      { name: 'd', place: 'on', label: 'Tall grass', paints: { grass: 'grass', blade: 'blade' } },
    ] },
    { name: 'path', kind: 'block', use: 'ground', pieces: ['block', 'narrow'], fills: 3, paints: { path: 'path', sand: 'sand', grain: 'grain', cobble: 'cobble' } },
  ],
});

/** The text of sprites/tiles-meadow.json as this writes it. */
export const written = () => fixtureText(def);

writerMain(import.meta, LIBRARY_FILE, written);
