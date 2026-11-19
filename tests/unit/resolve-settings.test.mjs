// The settings resolver (engine/resolve.js, build item B4): a person's settings cleaned against a definition, old
// saved settings included (docs/data-sprites.md section 7: choice `was`, sprite-level `was: { controls }`, removed
// controls dropped), and ready-made versions through the same maps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { settingTable, defaultSettings, cleanSettings, versionSettings } from '../../engine/resolve.js';
import { validated, testPieces } from '../fixtures/resolve/helpers.mjs';

const store = testPieces();
const knight = validated('knight', store);
const coin = validated('coin', store);

test('the table lists every setting: controls, colour slots with a control, speed', () => {
  const t = settingTable(knight);
  assert.deepEqual(Object.keys(t).sort(), ['headgear', 'hair', 'hairLength', 'hairTone', 'height', 'metal', 'outfit', 'skin', 'speed', 'swordLength', 'weapon'].sort());
  assert.equal(t.height.kind, 'range');
  assert.deepEqual([t.height.min, t.height.max, t.height.default], [0, 1, 0.5]);
  assert.equal(t.headgear.kind, 'choice');
  assert.deepEqual(t.headgear.values, ['none', 'helmet', 'crown']);
  assert.equal(t.speed.kind, 'range');
  assert.equal(t.speed.default, 0.5);
  assert.equal(t.outfit.kind, 'colour');
  assert.equal(t.outfit.default, '#3a6ea5');
  assert.equal(t.trousers, undefined, 'a derived slot has no setting');
  assert.equal(t.eye, undefined, 'a detail slot has no setting');
});

test('defaults: every setting at its default', () => {
  assert.deepEqual(defaultSettings(knight), {
    height: 0.5, headgear: 'helmet', hair: 'short', hairLength: 0.4, weapon: 'sword', swordLength: 0.5, speed: 0.5,
    skin: '#e0a878', outfit: '#3a6ea5', metal: '#b8c4cc', hairTone: '#5a3a22',
  });
  assert.deepEqual(defaultSettings(coin), { size: 0.5, shine: true, bob: 0.5, speed: 0.5, gold: '#e8b23a', light: '#fff4c0' });
});

test('cleaning: sliders clamped, choices checked, on/off read, colours lowercased, unknown keys dropped', () => {
  const r = cleanSettings(knight, { height: 7, headgear: 'tiara', weapon: 'none', hairLength: '0.25', outfit: '#AABBCC', skin: 'red', mystery: 1 });
  assert.equal(r.params.height, 1);
  assert.equal(r.params.headgear, 'helmet', 'an option it never had falls back to the default');
  assert.equal(r.params.weapon, 'none');
  assert.equal(r.params.hairLength, 0.25, 'a number written as text is read');
  assert.equal(r.params.outfit, '#aabbcc');
  assert.equal(r.params.skin, '#e0a878', 'not a colour: the default');
  assert.deepEqual(r.notes.dropped, ['mystery']);
  assert.ok(r.notes.clamped.includes('height'));
  assert.ok(r.notes.refused.includes('headgear') && r.notes.refused.includes('skin'));
  const c = cleanSettings(coin, { shine: 'false', bob: -3 });
  assert.equal(c.params.shine, false);
  assert.equal(c.params.bob, 0);
  for (const v of [1, '1', 'true', true]) assert.equal(cleanSettings(coin, { shine: v }).params.shine, true);
  for (const v of [0, '0', 'no', false]) assert.equal(cleanSettings(coin, { shine: v }).params.shine, false);
});

test('old saved settings: a renamed option opens as its new name (a choice\'s was)', () => {
  const r = cleanSettings(knight, { headgear: 'plumed helmet' });
  assert.equal(r.params.headgear, 'helmet');
  assert.deepEqual(r.notes.remapped, { headgear: ['plumed helmet', 'helmet'] });
});

test('old saved settings: a renamed control opens under its new key (the sprite\'s was: { controls })', () => {
  const def = { ...knight, was: { controls: { bladeLength: 'swordLength', hat: 'headgear' } } };
  const r = cleanSettings(def, { bladeLength: 0.9, hat: 'plumed helmet' });
  assert.equal(r.params.swordLength, 0.9);
  assert.equal(r.params.headgear, 'helmet', 'renamed and remapped in one go');
  assert.deepEqual(r.notes.renamed, { bladeLength: 'swordLength', hat: 'headgear' });
  assert.deepEqual(r.notes.dropped, []);
  const both = cleanSettings(def, { bladeLength: 0.9, swordLength: 0.2 });
  assert.equal(both.params.swordLength, 0.2, 'the new key wins over the old one');
});

test('old saved settings: a removed control is dropped and said once', () => {
  const r = cleanSettings(knight, { cape: 'red', height: 0.3 });
  assert.equal(r.params.height, 0.3);
  assert.equal(Object.hasOwn(r.params, 'cape'), false);
  assert.deepEqual(r.notes.dropped, ['cape']);
});

test('a bag item ({ params }) and plain params are both read', () => {
  assert.equal(cleanSettings(knight, { params: { height: 0.2 } }).params.height, 0.2);
  assert.equal(cleanSettings(knight, { height: 0.2 }).params.height, 0.2);
});

test('ready-made versions go through the same maps', () => {
  const def = { ...knight, was: { controls: { bladeLength: 'swordLength' } }, versions: [{ name: 'Old guard', params: { headgear: 'plumed helmet', height: 0.9 } }] };
  const v = versionSettings(def, 'Old guard');
  assert.equal(v.params.headgear, 'helmet');
  assert.equal(v.params.height, 0.9);
  assert.equal(v.params.weapon, 'sword', 'the rest at their defaults');
  assert.equal(versionSettings(def, 'No such'), null);
});

test('hostile settings never throw and never reach the prototype', () => {
  const bad = [null, undefined, 7, 'text', [], { __proto__: { height: 1 } }, JSON.parse('{"__proto__": {"x": 1}, "height": 0.1}'),
    { height: { valueOf: () => 1 } }, { headgear: 'x'.repeat(100000) }, Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, i]))];
  for (const b of bad) {
    const r = cleanSettings(knight, b);
    assert.equal(typeof r.params.height, 'number');
    assert.equal(Object.getPrototypeOf(r.params), Object.prototype);
    assert.equal(({}).x, undefined);
  }
  const g = { get height() { throw new Error('ran'); } };
  assert.doesNotThrow(() => cleanSettings(knight, g));
  assert.equal(cleanSettings(knight, JSON.parse('{"__proto__": {"x": 1}, "height": 0.1}')).params.height, 0.1);
  const many = cleanSettings(knight, Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`k${i}`, i])));
  assert.ok(many.notes.dropped.length <= 64, 'what is dropped is capped');
});

test('a version 1 part (an on/off keyed by its name) is a setting', () => {
  const def = { format: 'loadout-sprite', version: 2, palette: [], controls: [], parts: { cape: { label: 'Cape', shapes: ['cape'], default: false } } };
  assert.equal(settingTable(def).cape.kind, 'toggle');
  assert.equal(defaultSettings(def).cape, false);
  assert.equal(cleanSettings(def, { cape: true }).params.cape, true);
});
