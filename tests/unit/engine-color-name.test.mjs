// colorName: an everyday name for a colour code (final review, fault 3: colour controls showed only codes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { colorName } from '../../engine/color.js';

const has = (hex, word) => assert.match(colorName(hex), new RegExp(`\\b${word}\\b`), `${hex} -> "${colorName(hex)}" should say ${word}`);

test('plain colours get their plain names', () => {
  assert.equal(colorName('#ffffff'), 'white');
  assert.equal(colorName('#000000'), 'black');
  has('#808080', 'grey');
  has('#e2574c', 'red');
  has('#f2a030', 'orange');
  has('#e6cf4a', 'yellow');
  has('#5fc46b', 'green');
  has('#3fb3c9', 'blue');
  has('#4f7fe0', 'blue');
  has('#9a62d6', 'purple');
  has('#e0609a', 'pink');
  has('#8b5a2b', 'brown');
});

test('light and dark are said', () => {
  has('#1f2f6f', 'dark');
  has('#bfe6f7', 'light');
  has('#3a0d0d', 'dark');
});

test('short codes and capitals work; anything else gives an empty name', () => {
  assert.equal(colorName('#FFF'), 'white');
  assert.equal(colorName('#F2A030'), colorName('#f2a030'));
  assert.equal(colorName('orange'), '');
  assert.equal(colorName(''), '');
  assert.equal(colorName(null), '');
  assert.equal(colorName('#12345'), '');
});

test('a name is everyday words only: no codes, no numbers', () => {
  for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
    const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    const name = colorName(hex);
    assert.match(name, /^[a-z]+( [a-z]+)*$/, `${hex} -> "${name}"`);
  }
});

test('the same code always gives the same name', () => {
  assert.equal(colorName('#4f9d57'), colorName('#4f9d57'));
});

// Final review round 1: pure blue (hue 240) was called purple, navy dark purple, dark magenta pink, dark olive lime green.
test('pure blue and navy are blue, not purple', () => {
  assert.equal(colorName('#0000ff'), 'blue');
  assert.equal(colorName('#000080'), 'dark blue');
  has('#3333ff', 'blue');
  has('#4040c0', 'blue');
  has('#8a2be2', 'purple');      // blue violet still reads as purple
  has('#800080', 'purple');      // purple itself
});

test('dark magenta is purple, dark olive is olive', () => {
  has('#7a1f5c', 'purple');
  has('#8b008b', 'purple');
  has('#556b2f', 'olive');
  has('#808000', 'olive');
  has('#32cd32', 'green');       // a bright lime is still green
});
