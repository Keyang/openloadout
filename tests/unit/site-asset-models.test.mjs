// What the asset pages add to the editing panel's model and to the preview backdrops (app/panel-model.js, app/stage.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundModel } from '../../app/panel-model.js';
import { STAGES, sceneFor, stagesFor, defaultStage, keptStage } from '../../app/stage.js';
import { countChanges } from '../../app/editing.js';

const read = (id) => JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'));

test('a track keeps its length and its lead instrument when a style is chosen, unless the version names them itself', () => {
  const patch = read('battle-theme'), m = soundModel(patch);
  const d = Object.fromEntries(patch.params.map((p) => [p.id, p.default]));
  let s = { params: { ...d, bars: 16, inst: 2 }, style: null };
  const style = Object.keys(patch.presets)[0];
  s = m.applyVersion(s, { name: style, style });
  assert.equal(s.style, style);
  assert.equal(s.params.bars, 16, 'the length chosen is kept');
  assert.equal(s.params.inst, 2, 'the instrument chosen is kept');
  assert.equal(s.params.grit, { ...d, ...patch.presets[style] }.grit, 'the sliders are the style\'s');
  assert.equal(m.isVersion(s, { name: style, style }), true, 'and it still counts as that version');
  // a version that names an instrument sets it
  s = m.applyVersion(s, { name: 'Bell', params: { inst: 3 } });
  assert.equal(s.params.inst, 3);
  assert.equal(s.params.bars, 16);
  assert.equal(m.isVersion(s, { name: 'Bell', params: { inst: 3 } }), true);
  assert.equal(m.isVersion(s, { name: 'Flute', params: { inst: 1 } }), false);
});

test('Surprise me on a track keeps its length; on a sound it changes everything', () => {
  const track = read('battle-theme'), m = soundModel(track);
  const d = Object.fromEntries(track.params.map((p) => [p.id, p.default]));
  for (const seed of [1, 2, 3, 4, 5]) assert.equal(m.surprise({ params: { ...d, bars: 24 }, style: 'x' }, seed).params.bars, 24);
  assert.equal(m.surprise({ params: { ...d }, style: 'x' }, 1).style, null);
  const coin = read('coin-pickup'), c = soundModel(coin);
  const cd = Object.fromEntries(coin.params.map((p) => [p.id, p.default]));
  const out = c.applyVersion({ params: { ...cd }, style: null, seed: 4 }, { name: 'x', style: Object.keys(coin.presets)[0] });
  assert.equal(out.seed, 4, 'a sound\'s variation is left alone by a version');
});

test('the asset page offers "In your bag" and "Plain"; with nothing of the bag\'s own, the scene suits the sprite', () => {
  assert.deepEqual(STAGES.map((s) => s.id), ['bag', 'plain']);
  assert.deepEqual(STAGES.map((s) => s.label), ['In your bag', 'Plain']);
  assert.equal(stagesFor('ground')[0].id, 'bag', 'a thing that stands on the ground opens in your bag');
  // a choice remembered from before (the two scenes, then "In a scene") is "In your bag" now
  for (const old of ['meadow', 'cave', 'scene']) assert.equal(keptStage(old), 'bag', old);
  assert.equal(keptStage('plain'), 'plain');
  assert.equal(sceneFor({ themes: ['fantasy', 'dungeon'] }), 'meadow');
  assert.equal(sceneFor({ themes: ['dungeon'] }), 'cave');
  assert.equal(sceneFor({ themes: ['sci-fi'] }), 'cave');
  assert.equal(sceneFor({}), 'meadow');
  assert.equal(sceneFor(null), 'meadow');
});

test('a character or a creature opens in your bag; a tileset, a prop and anything else opens plain', () => {
  for (const type of ['character', 'creature']) assert.equal(defaultStage({ type }), 'bag', type);
  for (const type of ['tileset', 'prop', 'pickup', 'effect', 'projectile', undefined]) assert.equal(defaultStage({ type }), 'plain', String(type));
  assert.equal(defaultStage(null), 'plain');
});

test('a look of its own counts as one change, for a sprite, a sound and a track', () => {
  const d = { params: { a: 1 }, cues: null, scale: 1 };
  assert.equal(countChanges('sprite', { ...d }, d), 0);
  assert.equal(countChanges('sprite', { ...d, look: 'night' }, d), 1);
  assert.equal(countChanges('sprite', { ...d, look: 'original', params: { a: 2 } }, d), 2);
  assert.equal(countChanges('sound', { params: {}, style: null, seed: 1, look: 'frost' }, { params: {}, style: null, seed: 1 }), 1);
  assert.equal(countChanges('music', { params: {}, style: null, look: 'frost' }, { params: {}, style: null }), 1);
});
