// Writer of sprites/tiles-castle.json (build item T2), kept for audit as M5's writers are; tests/unit/library-tiles-t2
// holds the library file to what this writes.
// Usage: node tests/helpers/ports/tiles-castle.mjs [--write]   (says whether the library file is what this writes; writes it)
//
// The castle as data: a block of dressed stone (with its ledge), a floor of back wall, a pillar stack, the window,
// battlement and two archway halves as extra tiles and two decals, every tile a picture naming tile.castle@1
// (engine/gen/tile-ports.js, the port of the code's drawing) with its piece, Style, Edge, Texture, Wear and Moss, and the
// colours the code worked out named as the code's colour rules: the joints and mortar textureTone of the stone and the
// back wall, the moss on the stone textureTone of the moss against the stone, the trim a mix of the stone and its light,
// the window's frame a mix of the stone and the back wall, and the lit corners the stone's light where the code drew
// them (brighterBy: 0.1 brighter than the stone), else the stone.
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { tileset, colourSlot, fixtureText, writerMain } from './tile-port-writer.mjs';

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-castle.json', import.meta.url));

const code = await codeSprite('tiles-castle');   // the frozen copy (tests/fixtures/code-sprites/)
const palette = [
  colourSlot(code, 'stone', 'stone'),
  colourSlot(code, 'wall', 'stone'),
  colourSlot(code, 'growth', 'plant'),
  { id: 'joint', material: 'stone', derive: { rule: 'textureTone', of: 'stone' } },
  { id: 'mortar', material: 'stone', derive: { rule: 'textureTone', of: 'wall' } },
  { id: 'trim', material: 'stone', derive: { rule: 'mix', of: 'stone', with: 'stone.light', amount: 0.5 } },
];
const stone = {
  stone: 'stone', growth: 'growth', joint: 'joint', trim: 'trim',
  mossOn: { rule: 'textureTone', of: 'growth', against: 'stone' },
  lit: { rule: 'brighterBy', of: 'stone.light', than: 'stone', by: 0.1, else: 'stone' },
};
const back = { wall: 'wall', growth: 'growth', mortar: 'mortar' };
const def = tileset({
  code, gen: 'tile.castle', palette, settings: ['style', 'edge', 'texture', 'wear', 'overgrowth'], decalOrder: 'last',
  groups: [
    { name: 'stone', kind: 'block', use: 'ground', pieces: ['block', 'narrow', 'thin'], fills: 3, paints: stone, decals: [
      { name: 'a', place: 'on', label: code.clips['stone-deco-a'].label, paints: { stone: 'stone', joint: 'joint' } },
      { name: 'b', place: 'on', label: code.clips['stone-deco-b'].label, paints: { growth: 'growth' } },
    ] },
    { name: 'brick', kind: 'floor', fills: 3, label: 'Back wall', paints: back },
    { name: 'pillar', kind: 'stack', pieces: ['cap', 'mid', 'foot'], label: 'Pillar', paints: { stone: 'stone', growth: 'growth', joint: 'joint', trim: 'trim' } },
  ],
  extra: [
    { name: 'window', label: code.clips.window.label, paints: { stone: 'stone', ...back, frame: { rule: 'mix', of: 'stone', with: 'wall', amount: 0.3 } } },
    ...['battlement', 'arch-l', 'arch-r'].map((name) => ({ name, label: code.clips[name].label, paints: stone })),
  ],
});

/** The text of sprites/tiles-castle.json as this writes it. */
export const written = () => fixtureText(def);

writerMain(import.meta, LIBRARY_FILE, written);
