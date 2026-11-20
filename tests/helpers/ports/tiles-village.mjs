// Writer of sprites/tiles-village.json (build item T2), kept for audit as M5's writers are; tests/unit/library-tiles-t2
// holds the library file to what this writes.
// Usage: node tests/helpers/ports/tiles-village.mjs [--write]   (says whether the library file is what this writes; writes it)
//
// The village as data: a block of soft cobbles, a floor of boards and a block of low wall, three fence pieces as extra
// tiles, every tile a picture naming tile.village.cobbles@1, tile.village.wood@1 or tile.village.wall@1
// (engine/gen/tile-ports.js, the port of the code's drawing; three generators, as the village has 18 colours and a
// generator takes 12) with its piece, Style, Edge, Texture and Wear, and the colours the code worked out named as the
// code's colour rules: the paving pavingTone of the stone (engine/paving.js), its joints stoneShade, its pits textureTone, its glints textureLight; the
// boards' seams textureTone of the wood; the wall's cap and face mixes of the stone with its light and dark; the cap's
// highlight, which the code left off a cap brighter than 0.85, ifLight of the cap.
import { fileURLToPath } from 'node:url';
import { codeSprite } from '../library.mjs';
import { tileset, colourSlot, fixtureText, writerMain } from './tile-port-writer.mjs';

/** The library file this writes. */
export const LIBRARY_FILE = fileURLToPath(new URL('../../../sprites/tiles-village.json', import.meta.url));

const code = await codeSprite('tiles-village');   // the frozen copy (tests/fixtures/code-sprites/)
const tt = (of, against) => ({ rule: 'textureTone', of, ...(against ? { against } : {}) });
const palette = [
  colourSlot(code, 'stone', 'stone'),
  colourSlot(code, 'wood', 'wood'),
  colourSlot(code, 'growth', 'plant'),
  { id: 'body', material: 'stone', derive: { rule: 'pavingTone', of: 'stone' } },
  { id: 'deepjoint', material: 'stone', derive: tt('body') },
  { id: 'joint', material: 'stone', derive: { rule: 'stoneShade', of: 'body', with: 'deepjoint', start: 0.55 } },
  { id: 'cap', material: 'stone', derive: { rule: 'mix', of: 'stone', with: 'stone.light', amount: 0.6 } },
  { id: 'caplit', material: 'stone', derive: { rule: 'textureLight', of: 'cap' } },
  { id: 'capjoint', material: 'stone', derive: tt('cap') },
  { id: 'face', material: 'stone', derive: { rule: 'mix', of: 'stone', with: 'stone.dark', amount: 0.3 } },
  { id: 'seam', material: 'wood', derive: tt('wood') },
  { id: 'sheen', material: 'wood', derive: { rule: 'textureLight', of: 'wood', against: 'wood', from: 0.5 } },
];
const def = tileset({
  code, gen: 'tile.village.cobbles', palette, settings: ['style', 'edge', 'texture', 'wear'],
  groups: [
    { name: 'cobble', kind: 'block', use: 'ground', pieces: ['block', 'narrow'], fills: 3, label: 'Cobbles', paints: {
      stone: 'stone', growth: 'growth', body: 'body', deepJoint: 'deepjoint', joint: 'joint',
      darker: { rule: 'mix', of: 'body', with: 'deepjoint', amount: 0.8 }, glint: { rule: 'textureLight', of: 'body' }, mossOn: tt('growth', 'body') } },
    { name: 'plank', kind: 'floor', fills: 3, label: 'Wooden floor', gen: 'tile.village.wood', paints: {
      wood: 'wood', seam: 'seam', fibre: { rule: 'stoneShade', of: 'wood', with: 'seam', start: 0.55 }, sheen: 'sheen' } },
    { name: 'wall', kind: 'block', use: 'wall', pieces: ['block', 'narrow'], label: 'Wall', gen: 'tile.village.wall', paints: {
      stone: 'stone', growth: 'growth', cap: 'cap', capJoint: 'capjoint', capLit: 'caplit',
      capGlint: { rule: 'ifLight', of: 'cap', above: 0.85, then: 'cap', else: 'caplit' }, faceBody: 'face', mossFoot: tt('growth', 'face') } },
  ],
  extra: ['fence-h', 'fence-v', 'fence-post'].map((name) => ({ name, label: code.clips[name].label, gen: 'tile.village.wood', paints: { wood: 'wood' } })),
});

/** The text of sprites/tiles-village.json as this writes it. */
export const written = () => fixtureText(def);

writerMain(import.meta, LIBRARY_FILE, written);
