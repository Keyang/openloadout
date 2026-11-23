// A tile edge's inset and ragged profile may be picked by a choice or an on/off: { from, pick: { option: profile } }
// (catalog/sprite-schema.js profileRef, engine/gen/tiles.js edgeOf). Before this a profile was a name or a list only,
// so a style could change how far an outline wanders (amount) but never its shape. Held to here:
//   - the validator keeps the binding, marks its control used, and refuses a pick that names no profile of the sprite,
//     leaves an option out, or is a table (map) or a slider
//   - the tile drawn at each option is, pixel for pixel, the tile drawn with that option's profile named directly
//   - a name or a list draws as before
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';

const DIPS = [0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 3, 2, 1, 0, 0, 0];
const STEP = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 0];
const NICK = [0, 0, 1, 1, 0, 0, 0, 0];
const CONTROLS = [{ key: 'style', kind: 'choice', label: 'Style', options: ['dips', 'step', 'list'], default: 'dips' }, { key: 'torn', kind: 'toggle', label: 'Torn', default: false },
  { key: 'bumps', kind: 'range', label: 'Bumps', lo: 'Flat', hi: 'Bumpy', default: 0.5 }, { key: 'shape', kind: 'colour', label: 'Soil' }];
function tileset(inset, ragged) {
  return {
    format: 'loadout-sprite', version: 2, id: 'tiles-test', name: 'Test tiles', blurb: 'Tiles for a test.', size: [32, 32], pivot: [16, 16], grounded: false,
    meta: { type: 'tileset', role: 'world/tile', view: 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['test'], license: 'draft' },
    palette: [{ id: 'soil', label: 'Soil', default: '#7a5236', material: 'earth' }, { id: 'grass', label: 'Grass', default: '#5aa040', material: 'plant' }],
    controls: CONTROLS.filter((c) => JSON.stringify([inset, ragged]).includes(`"from":"${c.key}"`)),   // a control nothing names is refused
    body: { tiles: { tile: 32, profiles: { dips: DIPS, step: STEP, nick: NICK, none: [0] },
      groups: [{ name: 'turf', kind: 'block', material: { fill: { base: 'soil' }, edges: { top: { depth: 5, inset, ...(ragged ? { ragged } : {}), bands: [{ rows: [1, 99], paint: 'grass' }] } } } }] } },
  };
}
const BOUND = { profile: { from: 'style', pick: { dips: 'dips', step: 'step', list: NICK } }, amount: 1 };
const TORN = { profile: { from: 'torn', pick: { true: 'nick', false: 'none' } }, amount: { from: 'bumps', map: [[0, 1], [1, 2]], round: 'px' } };
const tile = (def, set = {}, clip = 'turf-top') => { const s = dataSprite(def); return renderFrame(s, clip, 0, { ...defaultParams(s), ...set }); };
const same = (a, b) => a.width === b.width && a.data.every((v, i) => v === b.data[i]);
const errs = (d) => validateSprite(d).errors.join('\n');

test('the validator keeps a picked profile and counts its control as used', () => {
  const r = validateSprite(tileset(BOUND, TORN));
  assert.deepEqual(r.errors, []);
  const top = r.value.body.tiles.groups[0].material.edges.top;
  assert.deepEqual(top.inset.profile, { from: 'style', pick: { dips: 'dips', step: 'step', list: NICK } });
  assert.deepEqual(top.ragged.profile, { from: 'torn', pick: { true: 'nick', false: 'none' } });
  assert.ok(!r.warnings.concat(r.errors).some((m) => /"style".*nothing uses|"torn".*nothing uses/.test(m)));
});

test('a picked profile must name profiles of the sprite (or be lists), one for every option, and is never a table', () => {
  assert.match(errs(tileset({ profile: { from: 'style', pick: { dips: 'dips', step: 'wobble', list: NICK } }, amount: 1 })), /"wobble" is not a profile/);
  assert.match(errs(tileset({ profile: { from: 'style', pick: { dips: 'dips', step: 'step' } }, amount: 1 })), /no value for "list"/);
  assert.match(errs(tileset({ profile: { from: 'style', pick: { dips: 'dips', step: 'step', list: 7 } }, amount: 1 })), /name of a profile or a list/);
  assert.match(errs(tileset({ profile: { from: 'style', pick: { dips: 'dips', step: 'step', list: NICK, tall: 'dips' } }, amount: 1 })), /"tall", which "style" never is/);
  assert.match(errs(tileset({ profile: { from: 'bumps', map: [[0, 0], [1, 3]] }, amount: 1 })), /pick/);
  assert.match(errs(tileset({ profile: { from: 'bumps', pick: { a: 'dips' } }, amount: 1 })), /choice or an on\/off/);
  assert.match(errs(tileset({ profile: { from: 'shape', pick: { a: 'dips' } }, amount: 1 })), /"shape".*not one of the sprite's controls/);
  assert.match(errs(tileset({ profile: { from: 'style' }, amount: 1 })), /pick/);
});

test('each option draws the tile its profile draws when named directly', () => {
  const by = { dips: 'dips', step: 'step', list: NICK };
  for (const clip of ['turf-top', 'turf-left', 'turf-right']) {
    const seen = [];
    for (const [option, profile] of Object.entries(by)) {
      const a = tile(tileset(BOUND), { style: option }, clip), b = tile(tileset({ profile, amount: 1 }), {}, clip);
      assert.ok(same(a, b), `${clip}, style ${option}`);
      seen.push(a);
    }
    assert.ok(!same(seen[0], seen[1]) && !same(seen[1], seen[2]) && !same(seen[0], seen[2]), `${clip}: the three options draw three outlines`);
  }
});

test('a picked ragged profile: an on/off changes the band\'s inner edge, with its amount still bound to a slider', () => {
  const plain = { profile: 'dips', amount: 1 };
  const on = tile(tileset(plain, TORN), { torn: true }), off = tile(tileset(plain, TORN), { torn: false });
  assert.ok(!same(on, off));
  assert.ok(same(on, tile(tileset(plain, { profile: 'nick', amount: TORN.amount }))));
  assert.ok(same(off, tile(tileset(plain))), 'a profile of noughts leaves the band whole');
  assert.ok(!same(tile(tileset(plain, TORN), { torn: true, bumps: 0 }), tile(tileset(plain, TORN), { torn: true, bumps: 1 })));
});
