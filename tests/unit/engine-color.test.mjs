// Colour helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ramp, tone, pick, brightness, mix, hexToRgb, rgbToHex, col, pack } from '../../engine/color.js';

test('hex round trip and packing', () => {
  assert.deepEqual(hexToRgb('#ff8000'), [255, 128, 0]);
  assert.deepEqual(hexToRgb('#f80'), [255, 136, 0]);
  assert.equal(rgbToHex(255, 128, 0), '#ff8000');
  assert.equal(col('#ff0000'), pack(255, 0, 0));
  assert.equal(col(123), 123);
});

test('brightness runs from 0 to 1', () => {
  assert.equal(brightness('#000000'), 0);
  assert.equal(brightness('#ffffff'), 1);
  assert.ok(brightness('#00ff00') > brightness('#0000ff'));
});

test('tone lightens for positive and darkens for negative amounts', () => {
  const base = '#4f9d57';
  assert.ok(brightness(tone(base, 0.8)) > brightness(base));
  assert.ok(brightness(tone(base, -0.8)) < brightness(base));
  assert.equal(tone('#808080', 0).length, 7);
});

test('ramp has light > base > dark > deep brightness and keeps the base', () => {
  const r = ramp('#c9423a');
  assert.equal(r.base, '#c9423a');
  assert.ok(brightness(r.light) > brightness(r.base));
  assert.ok(brightness(r.base) > brightness(r.dark));
  assert.ok(brightness(r.dark) > brightness(r.deep));
});

test('ramp is deterministic', () => {
  assert.deepEqual(ramp('#2f8f9d'), ramp('#2f8f9d'));
});

test('pick chooses the candidate that stands out most', () => {
  assert.equal(pick('#000000', '#ffffff', '#222222'), '#ffffff');
  assert.equal(pick('#ffffff', '#ffffff', '#222222'), '#222222');
  assert.equal(pick('#808080', '#808080'), '#808080');
});

test('mix blends halfway', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mix('#102030', '#102030', 0.7), '#102030');
});
