// Shelves on a bundle page (final review, fault 2: about 48 sprites in one flat grid). The groups come from each
// asset's catalogue type and role, so a new asset or a new bundle needs no change here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shelvesOf, shelfOf } from '../../app/shelves.js';
import { SPRITE_ROLES, SOUND_ROLES, MUSIC_ROLES, SPRITE_TYPES, SOUND_TYPES } from '../../catalog/schema.js';

const CATALOG = new URL('../../generated/catalog.json', import.meta.url);
const catalog = fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : null;
const row = (id, type, role, kind = 'sprite') => ({ id, kind, type, role, name: id });

test('people come first, then enemies, then the world, then things to pick up, effects, backgrounds and menus', () => {
  const rows = [
    row('menu', 'ui', 'interface/panel'), row('sky', 'background', 'environment/background'), row('boom', 'effect', 'effects/explosion'),
    row('coin', 'pickup', 'items/pickup'), row('tree', 'prop', 'world/prop'), row('grass', 'tileset', 'world/tile'),
    row('slime', 'creature', 'characters/enemy'), row('hero', 'character', 'characters/player'),
  ];
  const shelves = shelvesOf(rows);
  assert.deepEqual(shelves.map((s) => s.rows[0].id), ['hero', 'slime', 'grass', 'tree', 'coin', 'boom', 'sky', 'menu']);
  for (const s of shelves) assert.equal(s.rows.length, 1);
});

test('enemies and bosses share a shelf whatever their type; tiles and platforms share one', () => {
  const shelves = shelvesOf([row('a', 'creature', 'characters/enemy'), row('b', 'character', 'characters/enemy'), row('c', 'creature', 'characters/boss'),
    row('d', 'tileset', 'world/tile'), row('e', 'prop', 'world/platform'), row('f', 'tileset', 'world/platform')]);
  assert.equal(shelves.length, 2);
  assert.deepEqual(shelves[0].rows.map((r) => r.id), ['a', 'b', 'c']);
  assert.deepEqual(shelves[1].rows.map((r) => r.id), ['d', 'e', 'f']);
});

test('within a shelf the bundle order is kept', () => {
  const shelves = shelvesOf([row('z', 'pickup', 'items/pickup'), row('a', 'pickup', 'items/key'), row('m', 'pickup', 'items/pickup')]);
  assert.deepEqual(shelves[0].rows.map((r) => r.id), ['z', 'a', 'm']);
});

test('every sprite and sound role in the schema lands on a shelf with an everyday name', () => {
  const seen = new Set();
  const check = (r) => {
    const s = shelfOf(r);
    assert.ok(s && s.key && s.label, `${r.kind} ${r.type} ${r.role}`);
    assert.match(s.label, /^[A-Z][a-z]+(,? [a-z]+)*$/, `"${s.label}" should be everyday words`);
    seen.add(s.label);
  };
  for (const role of SPRITE_ROLES) for (const type of SPRITE_TYPES) check(row('x', type, role));
  for (const role of SOUND_ROLES) for (const type of SOUND_TYPES) check(row('x', type, role, 'sound'));
  for (const role of MUSIC_ROLES) check(row('x', 'music', role, 'music'));
  assert.ok(seen.size >= 8, 'there are enough shelves to tell things apart');
});

test('an unknown role or type still gets a shelf (at the end), never lost', () => {
  const shelves = shelvesOf([row('hero', 'character', 'characters/player'), row('odd', 'gizmo', 'gadgets/thing')]);
  assert.equal(shelves.length, 2);
  assert.equal(shelves.at(-1).rows[0].id, 'odd');
  assert.match(shelves.at(-1).label, /^[A-Z]/);
});

test('sprites, sounds and music never share a shelf', () => {
  const shelves = shelvesOf([row('chest', 'prop', 'world/prop'), row('creak', 'sfx', 'world/chest', 'sound'), row('tune', 'music', 'music/exploration', 'music')]);
  for (const s of shelves) assert.equal(new Set(s.rows.map((r) => r.kind)).size, 1);
});

test('every bundle in the catalogue: each asset on exactly one shelf, shelves in a fixed order, more than one shelf for a big bundle', { skip: !catalog && 'no generated/catalog.json' }, () => {
  const byId = new Map(catalog.assets.map((a) => [a.id, a]));
  const order = [];
  for (const b of catalog.bundles) {
    const rows = b.sprites.map((id) => byId.get(id)).filter(Boolean);
    const shelves = shelvesOf(rows);
    assert.equal(shelves.reduce((n, s) => n + s.rows.length, 0), rows.length, b.id);
    assert.equal(new Set(shelves.map((s) => s.key)).size, shelves.length, `${b.id}: one shelf per group`);
    if (rows.length >= 12) assert.ok(shelves.length >= 4, `${b.id}: ${rows.length} sprites should be split up, got ${shelves.length} shelves`);
    order.push(shelves.map((s) => s.key));
  }
  // the order is the same everywhere: a key that comes before another in one bundle never comes after it in another
  const rank = new Map();
  for (const keys of order) keys.forEach((k, i) => { for (const later of keys.slice(i + 1)) rank.set(`${k}<${later}`, true); });
  for (const pair of rank.keys()) { const [a, b] = pair.split('<'); assert.ok(!rank.has(`${b}<${a}`), `${a} and ${b} swap places between bundles`); }
});
