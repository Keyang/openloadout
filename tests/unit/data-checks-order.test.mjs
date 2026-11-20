// The data checks' settings order (quality/data-checks.js; build item B15b, from the B15 reviews): a tileset has many
// clips, so the 600 frame lists (MAX_LISTS) run out after a dozen settings. The on/off and choice controls are tried
// alone before the sliders' turning points, so what a toggle paints (the dungeon's Damp: water, puddle, drip, ooze, wet)
// is seen, and no false "not seen painted" warning is given. A threshold's bounds are tried as values of its slider, so
// a slot painted only inside a threshold is seen too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { dataChecks, MAX_LISTS } from '../../quality/data-checks.js';

const FIX = new URL('../fixtures/v2/', import.meta.url);
const load = (p) => JSON.parse(fs.readFileSync(new URL(p, FIX), 'utf8'));
const notSeen = (r) => r.warnings.filter((w) => /not seen painted/.test(w));

test('the dungeon redraw: what Damp paints is seen, though its 48 tiles spend the frame lists after a dozen settings', () => {
  const s = dataSprite(load('tiles/tiles-dungeon.json'));
  const r = dataChecks(s);
  assert.ok(r.metrics.dataLists <= MAX_LISTS);
  assert.deepEqual(notSeen(r), []);
  assert.deepEqual(r.errors, []);
});

const SOIL = '#7a5236', GRASS = '#5aa040';
/** A tileset of many tiles with five sliders whose maps turn, a toggle and a slot only the toggle (or a threshold) paints. */
function busy(mark) {
  const turning = (k) => ({ key: k, kind: 'range', label: k[0].toUpperCase() + k.slice(1), lo: 'Less', hi: 'More', default: 0.5 });
  const keys = ['a', 'b', 'c', 'd', 'e'];
  const fill = keys.map((k, i) => ({ kind: 'rect', at: [4 + i * 5, 6], size: [2, { from: k, map: [[0, 1], [0.25, 4], [0.5, 2], [0.75, 5], [1, 1]], round: 'px' }], paint: 'soil.dark' }));
  return {
    format: 'loadout-sprite', version: 2, id: 'tiles-busy', name: 'Busy tiles', blurb: 'Tiles for a test.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'tileset', role: 'world/tile', view: 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'soil', label: 'Soil', default: SOIL, material: 'earth' }, { id: 'grass', label: 'Grass', default: GRASS, material: 'plant' }, { id: 'wet', default: '#4fa8d8', material: 'water', detail: true }],
    controls: [...keys.map(turning), { key: 'damp', kind: 'toggle', label: 'Damp', default: false }],
    body: { tiles: { tile: 32, groups: [{ name: 'g', kind: 'block', pieces: ['block', 'narrow', 'lanes'], fills: 3, material: {
      fill: { base: 'soil', versions: [fill, [], []] },
      edges: { top: { depth: 3, bands: [{ rows: [1, 99], paint: 'grass' }] } },
    } }, { name: 'h', kind: 'block', pieces: ['block', 'narrow', 'lanes'], fills: 3, material: {
      fill: { base: 'soil', versions: [[mark], [], []] },
      edges: { top: { depth: 3, bands: [{ rows: [1, 99], paint: 'grass' }] } },
    } }] } },
  };
}

test('a toggle\'s paint is seen before the sliders\' turning points use up the frame lists', () => {
  const s = dataSprite(busy({ kind: 'rect', at: [12, 20], size: [3, 1], paint: 'wet', when: { damp: [true] } }));
  const r = dataChecks(s);
  assert.equal(r.metrics.dataLists <= MAX_LISTS, true);
  assert.deepEqual(notSeen(r), []);
});

test('a slot painted only inside a threshold is seen: the threshold\'s bounds are tried as values of its slider', () => {
  const d = busy({ kind: 'rect', at: [12, 20], size: [3, 1], paint: 'wet', when: { a: [{ atLeast: 0.6, below: 0.7 }] } });
  d.controls[5].key = 'damp';
  d.body.tiles.groups[1].material.edges.top.bands.unshift({ rows: [1, 1], paint: 'soil.light', when: { damp: [true] } });
  const r = dataChecks(dataSprite(d));
  assert.deepEqual(notSeen(r), []);
});
