// sound/words.js: a sound or music control's value in everyday words ("low", "fast", "a lot"), never a number or a
// unit. The library test runs over every control of every patch in sounds/, so a new sound needs no change here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { controlWords, valueWord, position } from '../../sound/words.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOUNDS = path.join(ROOT, 'sounds');
const library = fs.readdirSync(SOUNDS).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => JSON.parse(fs.readFileSync(path.join(SOUNDS, f), 'utf8')));

const pitch = { id: 'pitch', label: 'Pitch', min: 400, max: 5000, default: 2200, unit: 'Hz', scale: 'log' };

test('position is where the value sits on the slider, 0 to 1, following a log scale', () => {
  assert.equal(position(pitch, 400), 0);
  assert.equal(position(pitch, 5000), 1);
  assert.ok(Math.abs(position(pitch, Math.sqrt(400 * 5000)) - 0.5) < 1e-9);
  assert.equal(position({ min: 0, max: 1 }, 0.25), 0.25);
  assert.equal(position({ min: 0, max: 1 }, 7), 1, 'clamped');
});

test('a pitch reads low to high, a speed slow to fast, a length short to long, brightness dull to bright', () => {
  assert.deepEqual(controlWords(pitch).ends, ['lower', 'higher']);
  assert.equal(valueWord(pitch, 400), 'very low');
  assert.equal(valueWord(pitch, 5000), 'very high');
  assert.equal(valueWord(pitch, Math.sqrt(400 * 5000)), 'middle');
  assert.deepEqual(controlWords({ label: 'Tempo', unit: 'bpm', min: 130, max: 190 }).ends, ['slower', 'faster']);
  assert.equal(valueWord({ label: 'Tempo', unit: 'bpm', min: 130, max: 190 }, 190), 'very fast');
  assert.deepEqual(controlWords({ label: 'Length', unit: 's', min: 0.1, max: 1 }).ends, ['shorter', 'longer']);
  assert.deepEqual(controlWords({ label: 'Ring', unit: 's', min: 0.1, max: 1 }).ends, ['shorter', 'longer'], 'a time in seconds is a length');
  assert.deepEqual(controlWords({ label: 'Brightness', min: 0, max: 1 }).ends, ['duller', 'brighter']);
  assert.deepEqual(controlWords({ label: 'Key', unit: 'semitones', min: -5, max: 6 }).ends, ['lower', 'higher']);
});

test('a control that moves the pitch by an amount is an amount, not a pitch', () => {
  assert.deepEqual(controlWords({ label: 'Pitch drop', unit: 'oct', min: 0.5, max: 5 }).ends, ['less', 'more']);
  assert.deepEqual(controlWords({ label: 'Rise', unit: 'semitones', min: 16, max: 24 }).ends, ['less', 'more']);
});

test('a control that runs both ways reads by direction', () => {
  const glide = { label: 'Glide', unit: 'oct', min: -2, max: 2 };
  assert.deepEqual(controlWords(glide).ends, ['falls', 'rises']);
  assert.equal(valueWord(glide, 0), 'level');
  assert.equal(valueWord(glide, 2), 'rises a lot');
  assert.equal(valueWord(glide, -0.5), 'falls a little');
  const fall = { label: 'Fall', unit: 'semitones', min: -12, max: 12 };
  assert.deepEqual(controlWords(fall).ends, ['rises', 'falls'], 'a positive fall goes down');
  assert.equal(valueWord(fall, 12), 'falls a lot');
});

test('an amount that starts at nothing says "none" there', () => {
  assert.equal(valueWord({ label: 'Grit', min: 0, max: 1 }, 0), 'none');
  assert.equal(valueWord({ label: 'Grit', min: 0, max: 1 }, 1), 'the most');
  assert.equal(valueWord({ label: 'Grit', min: 0.1, max: 1 }, 0.1), 'very little');
});

test(`every control in sounds/ reads as words with no number or unit at its ends and default (${library.length} patches)`, () => {
  let n = 0;
  for (const p of library) for (const d of p.params ?? []) {
    if (d.options) continue;
    n++;
    const w = controlWords(d);
    assert.notEqual(w.ends[0], w.ends[1], `${p.id}.${d.id}`);
    for (const v of [d.min, d.max, d.default]) {
      const s = valueWord(d, v);
      assert.ok(s && !/\d/.test(s), `${p.id}.${d.id} at ${v}: "${s}"`);
      if (d.unit) assert.ok(!new RegExp(`(^|[^a-z])${d.unit.replace(/[^a-z]/gi, (c) => `\\${c}`)}([^a-z]|$)`, 'i').test(s), `${p.id}.${d.id}: "${s}" shows its unit`);
    }
    assert.notEqual(valueWord(d, d.min), valueWord(d, d.max), `${p.id}.${d.id}: both ends read the same`);
  }
  assert.ok(n > 0);
});

test('shownValue is what a page shows beside a slider: a count is its number, anything else a word', async () => {
  const { shownValue } = await import('../../sound/words.js');
  assert.equal(shownValue({ label: 'Rockets', min: 1, max: 4, default: 1, step: 1 }, 3), '3');
  assert.equal(shownValue(pitch, 5000), 'very high');
  assert.equal(shownValue({ label: 'Length', unit: 'bars', min: 8, max: 32, step: 8 }, 32), 'very long', 'a count with a unit is a word');
  for (const p of library) for (const d of p.params ?? []) if (!d.options) assert.ok(!(d.unit && new RegExp(`\\b${d.unit.replace(/[^a-z]/gi, '')}\\b`, 'i').test(shownValue(d, d.default))), `${p.id}.${d.id}`);
});
