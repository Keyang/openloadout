// derelict-boss ("Station boss theme") after it was given a chord order of its own (it had, step for step, the
// chord order of hearthvale-battle): what changed, and what had to stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lint, tuneFit, INSTRUMENTS } from '../../tools/compose/kit.mjs';
import { build, CHORDS, TUNE } from '../../tools/compose/derelict_boss.mjs';

const SOUNDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sounds');
const patch = build();
const node = (id) => patch.nodes.find((n) => n.id === id);
const nums = (s) => { let prev = 0; return s.replace(/\|/g, ' ').trim().split(/\s+/).map((x) => (prev = x === '_' ? prev : Number(x))); };
const pc = (x) => ((x % 12) + 12) % 12;

test('the chords: two bars of C minor, down to F minor and G minor, then a climb through a diminished chord to G', () => {
  assert.equal(CHORDS.replace(/[,']/g, ''), 'Cm Cm Fm Gm | Cm Eb F#dim G');
  const root = nums(node('root').steps), third = nums(node('third').steps), fifth = nums(node('fifth').steps);
  assert.deepEqual(root.map(pc), [0, 0, 5, 7, 0, 3, 6, 7], 'semitones above C: C C F G | C Eb F# G');
  assert.deepEqual(third, [3, 3, 3, 3, 3, 4, 3, 4]);
  assert.deepEqual(fifth, [7, 7, 7, 7, 7, 7, 6, 7]);
  assert.ok(root[2] < 0 && root[3] < 0, 'the bass drops under its first note for bars 3 and 4');
  assert.deepEqual(root.slice(4), [0, 3, 6, 7], 'and climbs through the second half');
  assert.equal(node('tonic').expr, '0', 'C');
});

test('what stayed: key, tempo, controls, styles, length, instruments and metadata', () => {
  const by = Object.fromEntries(patch.params.map((p) => [p.id, p]));
  assert.deepEqual(patch.params.map((p) => p.id), ['intensity', 'bpm', 'key', 'bars', 'inst', 'bright', 'space', 'lead', 'grit']);
  assert.deepEqual([by.bpm.min, by.bpm.max, by.bpm.default], [150, 180, 164]);
  assert.equal(by.bars.default, 8);
  assert.deepEqual(by.inst.options, INSTRUMENTS);
  assert.equal(by.inst.options[by.inst.default], 'Synth lead');
  assert.deepEqual(Object.keys(patch.presets), ['Boss appears', 'Phase two', 'Enraged']);
  assert.equal(patch.meta.role, 'music/boss');
  assert.deepEqual(patch.meta.themes, ['sci-fi', 'space']);
  const run = JSON.parse(fs.readFileSync(path.join(SOUNDS, 'derelict-run.json'), 'utf8'));
  assert.ok(by.bpm.default > run.params.find((p) => p.id === 'bpm').default, 'faster than the run theme of the same kit');
  assert.deepEqual(lint(patch), []);
});

test('the tune and the alarm belong to the new chords', () => {
  const fit = tuneFit(patch).lines.find((l) => l.id === 'l');
  assert.equal(fit.chordShare, 1, 'every note on the beat is a note of its bar\'s chord');
  assert.equal(fit.scaleShare, 1);
  assert.equal(TUNE.length, 8);
  // the alarm sounds C on the first beat of bars 1, 3, 5 and 7: C is a note of each of those chords
  const root = nums(node('root').steps), third = nums(node('third').steps), fifth = nums(node('fifth').steps);
  for (const bar of [0, 2, 4, 6]) assert.ok([root[bar], root[bar] + third[bar], root[bar] + fifth[bar]].map(pc).includes(0), `bar ${bar + 1} has a C in its chord`);
  assert.equal(node('alT').steps.replace(/[|\s]/g, '').slice(0, 32), 'X.X.............................');
  // the climb to the G chord over bars 5 to 8 is as the specification asks: the top note of each bar higher than the last
  const top = TUNE.slice(4).map((b) => Math.max(...b.split(/\s+/).filter((x) => x !== '_').map((x) => { const m = /^([A-G])([#b]?)(\d)/.exec(x); return 12 * (Number(m[3]) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); })));
  for (let i = 1; i < top.length; i++) assert.ok(top[i] > top[i - 1], `bar ${i + 5} tops bar ${i + 4}`);
});
