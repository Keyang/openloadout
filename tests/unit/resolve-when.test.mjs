// The settings resolver (engine/resolve.js, B4): bindings (tables and picks, docs/data-sprites.md 2.6), `when`
// (Contract 3, with clip and direction left for the frame), controls in effect and parts taken off, the same answers
// engine/sprite.js gives a code sprite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindingValue, whenHolds, settingInEffect, activeSettings, partsOff, defaultSettings, settingTable } from '../../engine/resolve.js';
import { defineSprite, range, choice, toggle, inEffect } from '../../engine/sprite.js';
import { validated, testPieces } from '../fixtures/resolve/helpers.mjs';

const knight = validated('knight', testPieces());
const T = settingTable(knight);
const P = (o = {}) => ({ ...defaultSettings(knight), ...o });

test('a table binding is piecewise linear, held at its ends, and rounded as it says', () => {
  const b = { from: 'swordLength', map: [[0, 10], [1, 18]] };
  assert.equal(bindingValue(b, P({ swordLength: 0 }), T), 10);
  assert.equal(bindingValue(b, P({ swordLength: 0.5 }), T), 14);
  assert.equal(bindingValue(b, P({ swordLength: 0.25 }), T), 12);
  assert.equal(bindingValue(b, P({ swordLength: 1 }), T), 18);
  const three = { from: 'height', map: [[0, 0], [0.5, 10], [1, 12]] };
  assert.equal(bindingValue(three, P({ height: 0.75 }), T), 11);
  assert.equal(bindingValue({ ...b, round: 'px' }, P({ swordLength: 0.3 }), T), 12);
  assert.equal(bindingValue({ ...b, round: 'half' }, P({ swordLength: 0.3 }), T), 12.5);
  assert.equal(bindingValue({ from: 'height', map: [[0.2, 1], [0.8, 5]] }, P({ height: 0 }), T), 1, 'below the first point: the first value');
  assert.equal(bindingValue({ from: 'height', map: [[0.2, 1], [0.8, 5]] }, P({ height: 1 }), T), 5, 'above the last point: the last value');
});

test('a pick binding gives the value of the option, "true"/"false" for an on/off; a bare one the setting itself', () => {
  assert.equal(bindingValue({ from: 'hair', pick: { short: 'crop', long: 'fall' } }, P({ hair: 'long' }), T), 'fall');
  const coin = validated('coin');
  const t = settingTable(coin);
  assert.equal(bindingValue({ from: 'shine', pick: { true: 3, false: 0 } }, { shine: false }, t), 0);
  assert.equal(bindingValue({ from: 'shine', pick: { true: 3, false: 0 } }, { shine: true }, t), 3);
  assert.equal(bindingValue({ from: 'headgear' }, P({ headgear: 'crown' }), T), 'crown');
  assert.equal(bindingValue({ from: 'nothing', map: [[0, 1], [1, 2]] }, P(), T), undefined, 'a control that does not exist gives nothing');
});

test('bindings are deterministic and never formulas', () => {
  const b = { from: 'swordLength', map: [[0, 10], [1, 18]], round: 'px' };
  const xs = Array.from({ length: 50 }, (_, i) => bindingValue(b, P({ swordLength: i / 49 }), T));
  assert.deepEqual(xs, Array.from({ length: 50 }, (_, i) => bindingValue(b, P({ swordLength: i / 49 }), T)));
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] >= xs[i - 1], 'a rising table rises');
  assert.equal(bindingValue({ from: 'swordLength', map: 'x * 2' }, P(), T), undefined);
});

test('when: every key must match; a list means any one; a control named must itself be in effect', () => {
  assert.equal(whenHolds(knight, { headgear: ['none', 'crown'] }, P({ headgear: 'crown' })), true);
  assert.equal(whenHolds(knight, { headgear: ['none', 'crown'] }, P()), false);
  assert.equal(whenHolds(knight, [{ headgear: ['none'] }, { weapon: ['sword'] }], P()), true);
  assert.equal(whenHolds(knight, { headgear: ['none'], weapon: ['none'] }, P({ headgear: 'none' })), false);
  assert.equal(whenHolds(knight, { hair: ['short'] }, P({ headgear: 'helmet' })), false, 'hair is not in effect under a helmet');
  assert.equal(whenHolds(knight, { hair: ['short'] }, P({ headgear: 'none' })), true);
  assert.equal(whenHolds(knight, undefined, P()), true);
});

test('when with clip or direction: decided by the scene, unknown (null) without one', () => {
  const w = { clip: ['attack'], weapon: ['sword'] };
  assert.equal(whenHolds(knight, w, P()), null);
  assert.equal(whenHolds(knight, w, P(), { clip: 'attack' }), true);
  assert.equal(whenHolds(knight, w, P(), { clip: 'walk' }), false);
  assert.equal(whenHolds(knight, w, P({ weapon: 'none' })), false, 'a control that fails decides it at once');
  assert.equal(whenHolds(knight, { direction: ['up'] }, P(), { direction: 'up' }), true);
});

test('controls in effect and parts taken off, as engine/sprite.js answers for the same sprite', () => {
  assert.deepEqual(activeSettings(knight, P()).sort(), ['headgear', 'height', 'metal', 'outfit', 'skin', 'speed', 'swordLength', 'weapon', 'hairTone'].sort());
  assert.equal(settingInEffect(knight, 'swordLength', P({ weapon: 'none' })), false);
  assert.equal(settingInEffect(knight, 'hairLength', P({ headgear: 'none' })), true);
  assert.deepEqual(partsOff(knight, P({ weapon: 'none' })), ['weapon']);
  assert.deepEqual(partsOff(knight, P()), []);
  const code = defineSprite({
    id: 'k', name: 'K', size: [8, 8], pivot: [4, 8], clips: { idle: { frames: 1, fps: 1 } }, render() {},
    params: { headgear: choice('Headgear', 'helmet', ['none', 'helmet', 'crown']), hair: choice('Hair', 'short', ['short', 'long'], { when: { headgear: ['none', 'crown'] } }),
      hairLength: range('Hair length', 0.4, { when: { headgear: ['none', 'crown'] } }), weapon: choice('Weapon', 'sword', ['sword', 'none']), swordLength: range('Blade', 0.5), height: range('Height', 0.5) },
    parts: { weapon: { label: 'Weapon', params: ['weapon', 'swordLength'], none: 'none' } },
  });
  for (const headgear of ['none', 'helmet', 'crown']) for (const weapon of ['sword', 'none']) {
    const p = P({ headgear, weapon });
    for (const k of Object.keys(code.params)) assert.equal(settingInEffect(knight, k, p), inEffect(code, k, p), `${k} at ${headgear}/${weapon}`);
  }
});

test('an on/off part is taken off when it is off', () => {
  const def = { format: 'loadout-sprite', version: 2, palette: [], controls: [{ key: 'cape', kind: 'toggle', label: 'Cape', default: true }, { key: 'capeLength', kind: 'range', label: 'Length', default: 0.5 }],
    parts: { cape: { label: 'Cape', params: ['cape', 'capeLength'] } } };
  assert.deepEqual(partsOff(def, { cape: false, capeLength: 0.5 }), ['cape']);
  assert.equal(settingInEffect(def, 'capeLength', { cape: false, capeLength: 0.5 }), false);
  assert.deepEqual(partsOff(def, { cape: true, capeLength: 0.5 }), []);
});

test('a pick reads only its own options: an option named like a member of every object, missing from the pick, gives nothing', () => {
  const t = new Map([['look', { key: 'look', kind: 'choice', options: ['plain', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'], default: 'plain' }]]);
  const b = { from: 'look', pick: { plain: 1 } };
  for (const k of ['__proto__', 'toString', 'hasOwnProperty', 'valueOf']) assert.equal(bindingValue(b, { look: k }, t), undefined, k);
  assert.equal(bindingValue(b, { look: 'plain' }, t), 1);
  const own = JSON.parse('{ "from": "look", "pick": { "plain": 1, "toString": 2 } }');
  assert.equal(bindingValue(own, { look: 'toString' }, t), 2, 'an option the pick names is read');
  assert.equal(bindingValue(JSON.parse('{ "from": "look", "pick": { "plain": 1, "__proto__": 2 } }'), { look: '__proto__' }, t), undefined, 'never a key that reaches the prototype');
});
