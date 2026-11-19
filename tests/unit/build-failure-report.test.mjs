// failureReport() in tools/lib/quality-run.mjs: what the build prints when assets fail the quality bar.
// For each one it must say which file, what is wrong and what to do about it, in plain words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { failureReport } from '../../tools/lib/quality-run.mjs';

const ok = { kind: 'sprite', file: 'sprites/fine.js', id: 'fine', name: 'Fine', ok: true, errors: [], warnings: ['a warning'] };
const empty = { kind: 'sprite', file: 'sprites/glow-crate.js', id: 'glow-crate', name: 'Glow crate', ok: false, errors: ['idle frame 0 / default: nothing drawn (and 22 more)'], warnings: [] };
const two = { kind: 'sound', file: 'sounds/soft-chime.json', id: 'soft-chime', name: 'Soft chime', ok: false, errors: ['silent: nothing is heard', 'clips: the loudest moment is cut off'], warnings: [] };

test('says which file, what is wrong and what to do, for each asset that failed and no other', () => {
  const text = failureReport([ok, empty, two]).join('\n');
  assert.doesNotMatch(text, /fine/i, 'an asset that passed is not listed');
  // which file, with the name a person knows it by
  assert.match(text, /sprites\/glow-crate\.js/);
  assert.match(text, /Glow crate/);
  assert.match(text, /sounds\/soft-chime\.json/);
  assert.match(text, /Soft chime/);
  // what is wrong: every finding, word for word
  assert.match(text, /What is wrong/);
  for (const e of [...empty.errors, ...two.errors]) assert.ok(text.includes(e), e);
  // what to do: the file to open and the command that checks just this asset
  assert.match(text, /What to do/);
  assert.ok(text.includes('node tools/check.mjs glow-crate'), 'the command that checks only this sprite');
  assert.ok(text.includes('node tools/render.mjs glow-crate'), 'the command that draws it to look at');
  assert.ok(text.includes('node tools/sfx.mjs check sounds/soft-chime.json'), 'the command that checks only this sound');
  assert.match(text, /docs\/quality-bar\.md/, 'where every check is explained');
});

test('explains the short forms a finding uses, when one is there', () => {
  const text = failureReport([empty]).join('\n');
  assert.match(text, /animation/i, '"idle frame 0 / default" is explained');
  assert.match(text, /counted from 0|count from 0/i);
  assert.match(text, /22 more/);
  const plain = failureReport([two]).join('\n');
  assert.doesNotMatch(plain, /counted from 0|count from 0/i, 'no legend when no finding uses the short form');
});

test('a file that cannot be opened, and a checker that broke, get their own advice', () => {
  const broken = { kind: 'sprite', file: 'sprites/typo.js', id: 'typo', ok: false, errors: ['cannot be loaded: Unexpected token \'}\''], warnings: [] };
  const badJson = { kind: 'sound', file: 'sounds/typo.json', id: 'typo', ok: false, errors: ['cannot be read: Unexpected end of JSON input'], warnings: [] };
  const crashed = { kind: 'sprite', file: 'sprites/unlucky.js', id: 'unlucky.js', ok: false, errors: ['checker crashed: boom'], warnings: [] };
  const a = failureReport([broken]).join('\n');
  assert.match(a, /mistake/i);
  assert.ok(a.includes('node tools/check.mjs typo'));
  assert.match(failureReport([badJson]).join('\n'), /comma|bracket|quote/i);
  const c = failureReport([crashed]).join('\n');
  assert.match(c, /not .* about the asset|checking code/i, 'a crash is not blamed on the asset');
  assert.match(c, /again/i);
});

test('nothing failed: nothing to say', () => {
  assert.deepEqual(failureReport([ok]), []);
  assert.deepEqual(failureReport([]), []);
});

test('no jargon the reader has to look up', () => {
  const text = failureReport([empty, two]).join('\n');
  assert.doesNotMatch(text, /\b(stderr|stack trace|exit code|hash|worker thread|undefined|null)\b/i);
});
