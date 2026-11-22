// Hints for the Fine-tune controls (app/hints.js): what a control is and what its value stands for, in words, never numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { controlHint, nowWords } from '../../app/hints.js';

const range = (o) => ({ key: 'height', kind: 'range', label: 'Height', min: 0, max: 1, value: 0.5, lo: 'Short', hi: 'Tall', ...o });

test('a listed control says what it is, its two ends, and where its value sits', () => {
  const h = controlHint(range());
  assert.equal(h.what, 'How tall it is.');
  assert.equal(h.scale, 'Slide from Short to Tall.');
  assert.equal(h.now, 'Now: in the middle.');
});

test('the value is said in words from one end to the other', () => {
  const say = (value) => controlHint(range({ value })).now;
  assert.equal(say(0), 'Now: all the way to Short.');
  assert.equal(say(0.25), 'Now: leaning Short.');
  assert.equal(say(0.75), 'Now: leaning Tall.');
  assert.equal(say(1), 'Now: all the way to Tall.');
  assert.equal(controlHint(range({ lo: '', hi: '', value: 1 })).now, 'Now: the most.');
});

test('a control the lists do not know is described from its kind and label', () => {
  assert.equal(controlHint({ key: 'zz', kind: 'color', label: 'Moss colour', value: '#336633' }, 'sprite', { colourName: () => 'Green' }).what, 'The colour of the moss.');
  assert.equal(controlHint({ key: 'zz', kind: 'toggle', label: 'Ivy', value: true }).now, 'Now: on.');
  const pick = controlHint({ key: 'zz', kind: 'choice', label: 'Leaf', value: 'b', options: [{ value: 'a', label: 'Oak' }, { value: 'b', label: 'Elm' }] });
  assert.equal(pick.what, 'Picks the leaf.');
  assert.equal(pick.scale, 'Pick one: Oak, Elm.');
  assert.equal(pick.now, 'Now: Elm.');
  assert.match(controlHint(range({ key: 'zz', label: 'Fluff', lo: '', hi: '' })).what, /^How much fluff there is\.$/);
});

test('a part\'s picker names the part; a control\'s own hint wins; sounds use their own words and value', () => {
  assert.equal(controlHint({ key: 'hairStyle', kind: 'choice', label: 'Hair', part: 'hair', main: true, partLabel: 'Hair', value: 'a', options: [{ value: 'a', label: 'Short' }] }).what, 'Pick which hair it has.');
  assert.equal(controlHint(range({ hint: 'Sets the stance!' })).what, 'Sets the stance.');
  const s = controlHint({ key: 'bright', kind: 'range', label: 'Brightness', min: 0, max: 1, value: 0.9, lo: 'duller', hi: 'brighter', valueText: 'bright' }, 'sound');
  assert.equal(s.what, 'How crisp or muffled it sounds.');
  assert.equal(s.now, 'Now: bright.');
});

test('no hint holds a digit or a unit', () => {
  for (const c of [range({ value: 0.37 }), { key: 'x', kind: 'range', label: 'Pitch', min: 0, max: 1, value: 0.3, lo: 'lower', hi: 'higher', valueText: 'low' }]) {
    const h = controlHint(c, c.key === 'x' ? 'sound' : 'sprite');
    assert.doesNotMatch(Object.values(h).join(' '), /\d/);
  }
  assert.equal(nowWords({ kind: 'toggle', value: false }), 'off');
});
