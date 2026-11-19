// The Look tab of a sound's and a music track's page (app/sound-look.js): the same named looks as a sprite's, said in
// words of what is heard, and the settings a sound is heard and downloaded with in a look.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { THEME_PRESETS } from '../../engine/theme.js';
import { themedSoundParams, soundSettingsFor } from '../../sound/theme.js';
import { lookWords, heardIn, lookTheme } from '../../app/sound-look.js';

const patch = (id) => JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'));
const coin = patch('coin-pickup');
const theme = patch('battle-theme');
const look = (id) => THEME_PRESETS.find((p) => p.id === id);
const base = (p) => Object.fromEntries(p.params.map((d) => [d.id, d.default]));

test('lookTheme: a named look\'s theme; nothing for none, "original" or an unknown id', () => {
  assert.equal(lookTheme(null), null);
  assert.equal(lookTheme('original'), null);
  assert.equal(lookTheme('nope'), null);
  assert.deepEqual(lookTheme('frost'), look('frost').theme);
});

test('lookWords says what is heard, in everyday words, for each look', () => {
  assert.equal(lookWords(coin, look('frost')), 'Higher and brighter');
  assert.equal(lookWords(coin, look('night')), 'Lower and softer');
  assert.equal(lookWords(coin, look('original')), 'As it was made');
  assert.equal(lookWords(theme, look('night')), 'Slower, in a lower key, calmer and softer');
  assert.equal(lookWords(theme, look('frost')), 'In a higher key and brighter');
  for (const p of [coin, theme]) {
    for (const l of THEME_PRESETS) {
      const w = lookWords(p, l);
      assert.match(w, /^[A-Z][a-z ,]+$/, `${p.id} ${l.id}: "${w}" is plain words`);
      assert.ok(w.split(' ').length <= 8, `${p.id} ${l.id}: "${w}" is short`);
    }
  }
});

test('a look that changes nothing a sound can hear says so', () => {
  // Desert only makes things a touch duller: a sound hears that, so it is not "as it was made"
  assert.equal(lookWords(coin, look('desert')), 'A little softer');
});

test('heardIn: no look is the settings as they are; a look gives the themed settings and the filter to apply', () => {
  const p = base(coin);
  assert.deepEqual(heardIn(coin, p, null), { params: p, sound: null });
  assert.deepEqual(heardIn(coin, p, 'original'), { params: p, sound: null });
  const t = look('frost').theme;
  assert.deepEqual(heardIn(coin, p, 'frost'), { params: themedSoundParams(coin, p, t), sound: soundSettingsFor(coin, t) });
  const m = base(theme);
  const night = heardIn(theme, m, 'night');
  assert.deepEqual(night.params, themedSoundParams(theme, m, look('night').theme));
  assert.ok(night.params.bpm < m.bpm, 'night is slower');
  assert.deepEqual(night.sound, soundSettingsFor(theme, look('night').theme));
});
