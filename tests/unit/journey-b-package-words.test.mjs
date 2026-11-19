// What the bag's Download says it delivered (J8.1): sprites, sounds and music in the bag's own words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { packageWords } from '../../app/changes.js';

test('a sprite with its action sounds, a sound and a music track', () => {
  const names = ['sprites/hero/knight.png', 'sprites/hero/knight.json', ...Array.from({ length: 7 }, (_, i) => `sprites/hero/sounds/s${i}.wav`), 'sprites/hero/how-to-use.txt',
    'sounds/coin-pickup.wav', 'music/battle-theme.wav', 'manifest.json', 'read-me.txt', 'licence.txt'];
  assert.equal(packageWords(names), '1 sprite sheet with its 7 action sounds, 1 sound, 1 music track, a list of everything and a guide');
});
test('counts are plural and nothing missing is named', () => {
  assert.equal(packageWords(['sprites/a/a.png', 'sprites/b/b.png', 'sounds/x.wav', 'sounds/y.wav', 'manifest.json']), '2 sprite sheets, 2 sounds and a list of everything');
  assert.equal(packageWords(['music/a.wav']), '1 music track');
  assert.equal(packageWords([]), 'nothing');
});
