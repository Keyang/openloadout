// The classic pairs in a track's panel model (app/panel-model.js, sound/pairs.js): which pairs a track can play, and what a tap sets.
// No page here (the page is tests/e2e/music-pairs.spec.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { soundModel } from '../../app/panel-model.js';
import { PAIRS } from '../../sound/pairs.js';
import { INSTRUMENTS, ALONG } from '../../sound/compose.js';

const track = (over = {}) => ({
  id: 'x', category: 'music', name: 'X',
  params: [
    { id: 'bars', label: 'Length', min: 8, max: 32, step: 8, default: 8, unit: 'bars' },
    { id: 'inst', label: 'Melody instrument', min: 0, max: 9, default: 0, options: [...INSTRUMENTS] },
    { id: 'along', label: 'Plays along', min: 0, max: 5, default: 0, options: [...ALONG] },
  ],
  presets: {}, ...over,
});
const start = (patch) => ({ params: Object.fromEntries(patch.params.map((d) => [d.id, d.default])), style: null });

test('a track with both choices offers the six pairs, in order, each as two values to set together', () => {
  const m = soundModel(track());
  assert.deepEqual(m.pairs.map((q) => q.label), PAIRS.map((q) => q.label));
  assert.equal(m.pairs.length, 6);
  const gb = m.pairs[0];
  assert.deepEqual(gb.params, { inst: INSTRUMENTS.indexOf('Guitar'), along: ALONG.indexOf('Bass') });
  assert.deepEqual(gb.params, { inst: 5, along: 5 });
});

test('a tap sets both choices, keeps the rest, and the pair reads as on; changing one by hand turns it off', () => {
  const patch = track(), m = soundModel(patch);
  let s = { ...start(patch), params: { ...start(patch).params, bars: 16 } };
  assert.ok(m.pairs.every((q) => !m.pairOn(s, q)));
  s = m.setPair(s, m.pairs[1]);
  assert.deepEqual([s.params.inst, s.params.along, s.params.bars], [INSTRUMENTS.indexOf('Piano'), ALONG.indexOf('Violin'), 16]);
  assert.deepEqual(m.pairs.map((q) => m.pairOn(s, q)), [false, true, false, false, false, false]);
  s = m.set(s, 'inst', 1);
  assert.ok(m.pairs.every((q) => !m.pairOn(s, q)));
});

test('no pair is the same instrument twice', () => {
  for (const q of PAIRS) assert.notEqual(q.inst, q.along, q.label);
});

test('a track without the along choice, an older instrument list, or a sound offers none', () => {
  assert.deepEqual(soundModel(track({ params: track().params.filter((d) => d.id !== 'along') })).pairs, []);
  const old = track(); old.params[1] = { ...old.params[1], max: 4, options: INSTRUMENTS.slice(0, 5) };
  assert.deepEqual(soundModel(old).pairs.map((q) => q.label), ['Flute + Guitar', 'Bell + Piano'], 'only the pairs whose melody instrument it has');
  assert.deepEqual(soundModel({ ...track(), category: 'sfx' }).pairs, []);
});
