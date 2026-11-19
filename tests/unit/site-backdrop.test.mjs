// Which backdrop a sprite is previewed on (final review, fault 6: interface pieces stood on grass).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { backdropFor, stagesFor, STAGES } from '../../app/stage.js';
import { SPRITE_ROLES, SPRITE_TYPES } from '../../catalog/schema.js';

const CATALOG = new URL('../../generated/catalog.json', import.meta.url);
const catalog = fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : null;

test('an interface piece is shown on a plain panel, a background fills the frame, a character stands on the ground', () => {
  assert.equal(backdropFor({ type: 'ui', role: 'interface/panel' }), 'panel');
  assert.equal(backdropFor({ type: 'ui', role: 'interface/bar' }), 'panel');
  assert.equal(backdropFor({ type: 'icon', role: 'interface/icon' }), 'panel');
  assert.equal(backdropFor({ type: 'icon', role: 'items/weapon' }), 'panel');
  assert.equal(backdropFor({ type: 'background', role: 'environment/background' }), 'fill');
  assert.equal(backdropFor({ type: 'character', role: 'characters/player' }), 'ground');
  assert.equal(backdropFor({ type: 'tileset', role: 'world/tile' }), 'ground');
  assert.equal(backdropFor({ type: 'pickup', role: 'items/pickup' }), 'ground');
});

test('it reads the role first: anything under "interface" is a panel, anything under "environment/background" fills', () => {
  for (const type of SPRITE_TYPES) {
    assert.equal(backdropFor({ type, role: 'interface/button' }), 'panel', type);
    assert.equal(backdropFor({ type, role: 'environment/background' }), 'fill', type);
  }
});

test('every sprite role and type gives one of the three, and nothing given still gives the ground', () => {
  for (const role of SPRITE_ROLES) for (const type of SPRITE_TYPES) assert.ok(['ground', 'panel', 'fill'].includes(backdropFor({ type, role })));
  assert.equal(backdropFor(null), 'ground');
  assert.equal(backdropFor({}), 'ground');
});

test('the backdrop choices suit the kind: scenes for things on the ground, panels for interface pieces, none for a background', () => {
  const ids = (list) => list.map((s) => s.id);
  assert.deepEqual(ids(stagesFor('ground')), ids(STAGES));
  const panels = stagesFor('panel');
  assert.ok(panels.length >= 2, 'a light and a dark panel at least');
  for (const s of panels) assert.ok(!ids(STAGES).includes(s.id) || s.id === 'plain', `${s.id}: no ground scenes for an interface piece`);
  assert.deepEqual(stagesFor('fill'), []);
  for (const s of [...panels, ...STAGES]) assert.match(s.label, /^[A-Z][a-z]+( [a-z]+)*$/);
});

test('every interface piece and background in the catalogue is off the grass', { skip: !catalog && 'no generated/catalog.json' }, () => {
  for (const a of catalog.assets.filter((x) => x.kind === 'sprite')) {
    const b = backdropFor(a);
    if (a.role?.startsWith('interface/') || a.type === 'ui') assert.equal(b, 'panel', a.id);
    if (a.type === 'background') assert.equal(b, 'fill', a.id);
  }
});
