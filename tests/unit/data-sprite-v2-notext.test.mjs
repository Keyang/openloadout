// A version 2 clip may say `noText: true` (engine/ui.js, CONTRAST: a clip that never carries the game's text, such
// as a counter row that shows its own sample digits). The field is data like `loop`: the validator keeps a true one,
// refuses anything but true or false, the resolved clip carries it and so does the sprite's clip, where
// contrastFaults (engine/ui.js) and the download guide (engine/sheet-info.js) read it. A clip without it is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataSprite } from '../../engine/data-sprite.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { contrastFaults } from '../../engine/ui.js';

const file = new URL('../../sprites/ui-stat-counter.json', import.meta.url);
const counter = () => JSON.parse(readFileSync(file, 'utf8'));

test('a clip marked noText: true keeps the mark on the sprite; a clip without it has none', () => {
  const def = counter();
  def.clips.idle.noText = true;
  delete def.clips.roll.noText;
  const s = dataSprite(def);
  assert.equal(s.clips.idle.noText, true);
  assert.equal(Object.hasOwn(s.clips.roll, 'noText'), false);
  assert.equal(Object.hasOwn(s.clips.frame, 'noText'), false);
});

test('noText: false is the same as leaving it out', () => {
  const def = counter();
  def.clips.idle.noText = false;
  assert.equal(Object.hasOwn(dataSprite(def).clips.idle, 'noText'), false);
});

test('the validator knows the field (no "dropped" warning) and refuses a value that is not true or false', () => {
  const def = counter();
  def.clips.idle.noText = true;
  const ok = validateSprite(def);
  assert.equal(ok.ok, true, ok.errors.join('\n'));
  assert.ok(!ok.warnings.some((w) => /noText/.test(w)), ok.warnings.join('\n'));
  def.clips.idle.noText = 'yes';
  const bad = validateSprite(def);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /Clip "idle".*noText must be true or false/.test(e)), bad.errors.join('\n'));
});

test('the contrast check skips a noText clip of a data sprite and still checks the others', () => {
  const def = counter();
  for (const c of ['idle', 'roll', 'bump']) def.clips[c].noText = true;
  assert.deepEqual(contrastFaults(dataSprite(def)), []);
  // the mark is per clip: without it on `roll`, that clip (and only that clip) is a fault again
  delete def.clips.roll.noText;
  const faults = contrastFaults(dataSprite(def));
  assert.equal(faults.length, 1);
  assert.match(faults[0], /^roll: .*textArea.*noText/);
});
