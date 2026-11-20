// Writer of sprites/tiles-water.json (build item T2), kept for audit as M5's writers are; tests/unit/library-tiles-t2
// holds the library file to what this writes.
// Usage: node tests/helpers/ports/tiles-water.mjs [--write]   (says whether the library file is what this writes; writes it)
//
// The pool and waterfall as data: two liquid groups (the pool, with three versions of its body; the waterfall, with its
// foot), 8 frames each, every tile a picture naming tile.water@1 (engine/gen/tile-ports.js, the port of the code's
// drawing) with its piece, Liquid, Waves and Sparkle, and the colours the code worked out named as the code's colour
// rules: the body's light and dark marks textureLight and textureTone of the liquid, the froth a mix of the foam and the
// liquid; the swamp's lily pads are the code's fixed Thornwood leaf, cream and crimson.
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { PALETTE } from '../../../engine/palettes.js';
import { tileset, colourSlot, fixtureText, writerMain } from './tile-port-writer.mjs';

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-water.json', import.meta.url));

const code = await codeSprite('tiles-water');   // the frozen copy (tests/fixtures/code-sprites/)
const P = PALETTE.thornwood;
const palette = [
  colourSlot(code, 'water', 'water'),
  colourSlot(code, 'foam', 'water'),
  { id: 'lit', material: 'water', derive: { rule: 'textureLight', of: 'water' } },
  { id: 'murk', material: 'water', derive: { rule: 'textureTone', of: 'water' } },
  { id: 'froth', material: 'water', derive: { rule: 'mix', of: 'foam', with: 'water', amount: 0.4 } },
  { id: 'leaf', default: P.leaf, material: 'plant', detail: true },
  { id: 'cream', default: P.cream, material: 'plant', detail: true },
  { id: 'crimson', default: P.crimson, material: 'plant', detail: true },
];
const liquid = { water: 'water', foam: 'foam', lit: 'lit', murk: 'murk', froth: 'froth' };
const def = tileset({
  code, gen: 'tile.water', palette, settings: ['liquid', 'waves', 'sparkle'],
  groups: [
    { name: 'water', kind: 'liquid', fills: 3, frames: 8, fps: 6, label: 'Pool', paints: { ...liquid, leaf: 'leaf', cream: 'cream', crimson: 'crimson' } },
    { name: 'fall', kind: 'liquid', pieces: ['foot'], frames: 8, fps: 6, label: 'Waterfall', paints: liquid },
  ],
});

/** The text of sprites/tiles-water.json as this writes it. */
export const written = () => fixtureText(def);

writerMain(import.meta, LIBRARY_FILE, written);
