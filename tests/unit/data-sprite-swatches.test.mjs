// A data sprite's colour slot offers every swatch its definition lists (batch M6, review issue 7): the v2 schema takes up
// to 16 swatches a slot (catalog/sprite-schema.js SPRITE_LIMITS.swatches), so the colour control built from the slot
// (engine/data-sprite.js slotSwatches) shows the slot's colour first and then each listed swatch, none cut off. Before
// this, slotSwatches kept 8 and silently lost the rest (the Hero's 11 cloth colours, three of them used by its versions).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataSprite } from '../../engine/data-sprite.js';
import { SPRITE_LIMITS } from '../../catalog/sprite-schema.js';

const LIST = ['#c9423a', '#3f6fd1', '#3a8f4e', '#7a4fc4', '#d07a2c', '#2f8f8a', '#b8b2a6', '#e6c545', '#6b7280', '#3a3350', '#f0ead8', '#123456', '#654321', '#a0a0a0', '#0f0f0f', '#fafafa'];

function spriteWith(swatches, def = '#3f6fd1') {
  return dataSprite({
    format: 'loadout-sprite', version: 2, id: 'swatch-probe', name: 'Swatch probe',
    meta: { type: 'prop', role: 'world/prop', themes: ['neutral'], gameTypes: ['platformer'], view: 'side', words: ['probe', 'swatch', 'test', 'colour', 'box', 'paint'], license: 'draft' },
    size: [32, 32], pivot: [16, 30], styles: ['pixel'],
    palette: [{ id: 'cloth', label: 'Cloth', default: def, material: 'cloth', swatches }],
    body: { pictures: { nodes: [{ id: 'box', at: [16, 20] }], draw: [{ id: 'b', kind: 'rect', on: 'box', at: [-6, -6], size: [12, 12], paint: 'cloth' }] } },
    clips: { idle: { frames: 1, fps: 1 } },
  });
}

test('a slot with 11 swatches offers all 11, its own colour first (the Hero\'s cloth list)', () => {
  const list = LIST.slice(0, 11);
  const s = spriteWith(list);
  assert.deepEqual(s.params.cloth.swatches, ['#3f6fd1', ...list.filter((c) => c !== '#3f6fd1')]);
  for (const c of ['#6b7280', '#3a3350', '#f0ead8']) assert.ok(s.params.cloth.swatches.includes(c), `${c} is offered`);
});

test('a slot with the most swatches the schema takes offers every one of them', () => {
  assert.equal(LIST.length, SPRITE_LIMITS.swatches);
  const s = spriteWith(LIST, '#c9423a');
  assert.deepEqual(s.params.cloth.swatches, LIST);
  const t = spriteWith(LIST, '#ff00aa');       // a colour that is not in the list leads it: 17 in all
  assert.deepEqual(t.params.cloth.swatches, ['#ff00aa', ...LIST]);
});

test('8 or fewer are kept as they were, duplicates once', () => {
  const s = spriteWith(['#3f6fd1', '#c9423a', '#c9423a', '#e6c545']);
  assert.deepEqual(s.params.cloth.swatches, ['#3f6fd1', '#c9423a', '#e6c545']);
});
