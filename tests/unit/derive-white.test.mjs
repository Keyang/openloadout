// A fixed white inside a derived slot's rule (build item B15b, from the B15 reviews): the library's light marks are often
// a colour's light mixed toward white (engine/tiles.js textureLight: mix(light, '#ffffff', 0.3)), and a colour written
// out is refused, so `white` is a fixed paint a palette `derive` rule may name. It is not a paint anywhere else (a
// sprite that paints white declares a slot: engine/gen/args.js). A slot of the palette called "white" wins over it.
// The dungeon redraw's wet streak is now the code tileset's colour at the default floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite, DERIVE_PAINTS } from '../../catalog/sprite-schema.js';
import { resolvePalette } from '../../engine/resolve.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { mix, ramp } from '../../engine/color.js';
import { textureLight } from '../../engine/tiles.js';
import { codeSprite } from '../helpers/library.mjs';

const dungeonCode = await codeSprite('tiles-dungeon');   // the frozen copy once the library's is redrawn

const FLOOR = '#7e84a0';
function pictures(palette, paint = 'glint') {
  return {
    format: 'loadout-sprite', version: 2, id: 'white-test', name: 'White test', blurb: 'A test.', size: [16, 16], pivot: [8, 8], grounded: false,
    meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'floor', label: 'Floor', default: FLOOR, material: 'stone' }, ...palette],
    controls: [],
    body: { pictures: { nodes: [{ id: 'root', at: [8, 8] }], draw: [{ kind: 'rect', on: 'root', at: [-4, -4], size: [8, 8], paint: 'floor' }, { kind: 'rect', on: 'root', at: [0, 0], size: [2, 1], paint }] } },
    clips: { idle: { frames: 1 } },
  };
}

test('white is a fixed paint of a derived slot\'s rule, and gives #ffffff there', () => {
  assert.deepEqual([...DERIVE_PAINTS], ['white']);
  const d = pictures([{ id: 'glint', material: 'stone', derive: { rule: 'mix', of: 'floor.light', with: 'white', amount: 0.3 } }]);
  const r = validateSprite(d);
  assert.deepEqual(r.errors, []);
  assert.equal(resolvePalette(d).glint.hex, mix(ramp(FLOOR).light, '#ffffff', 0.3).toLowerCase());
  assert.equal(resolvePalette(d).glint.hex, textureLight(FLOOR).toLowerCase(), 'textureLight at this floor');
  // nested deeper in the rule, too
  const deep = pictures([{ id: 'glint', material: 'stone', derive: { rule: 'tone', of: { rule: 'mix', of: 'floor', with: 'white', amount: 0.5 }, by: -0.2 } }]);
  assert.deepEqual(validateSprite(deep).errors, []);
  assert.equal(resolvePalette(deep).glint.lost, undefined);
});

test('white is not a paint outside a derive rule, and a written-out #ffffff is still refused', () => {
  const asPaint = validateSprite(pictures([], 'white'));
  assert.equal(asPaint.ok, false);
  assert.match(asPaint.errors.join('\n'), /white.*only inside a derived slot/s);
  const written = validateSprite(pictures([{ id: 'glint', material: 'stone', derive: { rule: 'mix', of: 'floor', with: '#ffffff', amount: 0.3 } }]));
  assert.match(written.errors.join('\n'), /colour written out/);
});

test('a slot called white is the slot, in a derive rule and elsewhere', () => {
  const d = pictures([{ id: 'white', label: 'Chalk', default: '#ddeeff', material: 'stone' }, { id: 'glint', material: 'stone', derive: { rule: 'mix', of: 'floor', with: 'white', amount: 1 } }]);
  d.body.pictures.draw.push({ kind: 'rect', on: 'root', at: [2, 2], size: [1, 1], paint: 'white' });
  assert.deepEqual(validateSprite(d).errors, []);
  assert.equal(resolvePalette(d).glint.hex, '#ddeeff');
});

test('the dungeon redraw\'s wet streak is the code tileset\'s colour at the defaults (textureLight of the floor)', () => {
  const def = JSON.parse(fs.readFileSync(new URL('../fixtures/v2/tiles/tiles-dungeon.json', import.meta.url), 'utf8'));
  const s = dataSprite(def);
  const ds = defaultParams(s), dc = defaultParams(dungeonCode);
  for (const clip of ['floor-fill-b', 'floor-fill-c']) {   // the first floor version has no wet streak
    const a = renderFrame(s, clip, 0, { ...ds, damp: true }), b = renderFrame(dungeonCode, clip, 0, { ...dc, damp: true });
    const a0 = renderFrame(s, clip, 0, ds), b0 = renderFrame(dungeonCode, clip, 0, dc);
    let wet = 0;
    for (let i = 0; i < a.data.length; i++) {
      const mine = a.data[i] !== a0.data[i], theirs = b.data[i] !== b0.data[i];
      if (!mine || !theirs) continue;
      if (a.data[i] === b.data[i]) wet++;
      else assert.fail(`${clip} pixel ${i % 32},${Math.floor(i / 32)}: damp paints ${a.data[i].toString(16)} in the data tileset, ${b.data[i].toString(16)} in the code one`);
    }
    assert.ok(wet > 0, `${clip}: damp paints the same colours`);
  }
});
