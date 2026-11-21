// Framework additions made with batch R15 (party and villager portraits):
//   engine/faces.js   PORTRAIT_SIZE, PORTRAIT_PIVOT, PORTRAIT_FRAMES, TALK_FRAMES, TALK_FPS          how a portrait set is laid out
//                     FACE_MOODS, FACE_AGES, FACE_HAIR, FACE_HEADGEAR, FACE_BEARDS, FACE_COLLARS, FACE_CARRIED   what a person may be made of
//                     faceClips, parseFaceClip, talkStep                                           the clips of a set: <who>-<mood>, <who>-talk
//                     faceBust, portraitFrame, portrait                                            a head and shoulders from a description; its border; the two together
// And the two sprites made with it: each portrait is the same person as that person's map sprite.
// R3 (2026-11-21): engine/faces.js went: the tests of its functions are deleted, the portrait sets' own tests (below) stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { librarySprite } from '../helpers/library.mjs';
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const shapeDiff = (a, b) => a.data.reduce((n, v, i) => n + (!v !== !b.data[i] ? 1 : 0), 0);
const colours = (g) => { const s = new Set(g.data); s.delete(0); return s; };
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const SKIN = '#f6d3b0';
const plain = (more = {}) => ({ skin: SKIN, hair: { style: 'short', colour: '#9a6a3e' }, outfit: { colour: '#3f6fd1' }, ...more });
// ---- the two portrait sets -----------------------------------------------------------------------

// the library's two sets and map sprites, a code file or a data file (tests/helpers/library.mjs): these tests are about the assets
const party = await librarySprite('portraits-party');
const village = await librarySprite('portraits-village');
const face = (sprite, clip, set = {}, frame = 0) => renderFrame(sprite, clip, frame, cleanParams(sprite, { ...defaultParams(sprite), ...set }));

test('the two sets have the clips, the controls and the role of their specification', () => {
  assert.deepEqual(Object.keys(party.clips), ['hero', 'mage', 'rogue'].flatMap((w) => ['neutral', 'happy', 'hurt', 'talk'].map((m) => `${w}-${m}`)));
  assert.deepEqual(Object.keys(village.clips), ['elder', 'merchant', 'guard', 'kid'].flatMap((w) => ['neutral', 'happy', 'worried'].map((m) => `${w}-${m}`)));
  for (const [clip, c] of Object.entries(party.clips)) assert.equal(c.frames, clip.endsWith('-talk') ? 4 : 1, clip);
  for (const c of Object.values(village.clips)) assert.equal(c.frames, 1);
  assert.deepEqual(Object.keys(party.params).sort(), ['backing', 'frame', 'hero', 'mage', 'rogue', 'size', 'skin']);
  assert.deepEqual(Object.keys(village.params).sort(), ['backing', 'elder', 'frame', 'guard', 'kid', 'merchant', 'size', 'skin']);
  for (const s of [party, village]) {
    assert.deepEqual(s.size, [48, 48]);
    assert.deepEqual(s.pivot, [24, 24]);
    // a portrait is never the player: the playground moves a characters/player sprite with the keyboard
    assert.equal(s.meta.type, 'icon');
    assert.equal(s.meta.role, 'interface/icon');
    assert.equal(s.meta.view, 'front');
    assert.deepEqual(s.params.backing.when, { frame: ['round', 'square'] });
    assert.equal(s.params.frame.def, 'none');
    assert.ok(!('speed' in s.params) && Object.keys(s.sounds ?? {}).length === 0, 'no speed control and no sounds');
  }
});

test('each portrait wears the default colours of that person\'s map sprite', async () => {
  const same = [
    [party, 'hero', 'hero-walker', ['skin', 'hair', 'outfit', 'trim']],
    [party, 'mage', 'mage-walker', ['skin', 'hair', 'outfit', 'trim']],
    [party, 'rogue', 'rogue-walker', ['skin', 'outfit', 'trim']],                // the hood hides the hair, as on the sprite
    [village, 'elder', 'village-elder', ['skin', 'hair', 'outfit', 'trim']],
    [village, 'merchant', 'merchant', ['skin', 'hair', 'outfit', 'accent']],
    [village, 'guard', 'town-guard', ['skin', 'outfit', 'trim']],
    [village, 'kid', 'farm-kid', ['skin', 'hair', 'outfit', 'accent']],
  ];
  for (const [set, who, id, keys] of same) {
    const sprite = await librarySprite(id), g = face(set, `${who}-neutral`);
    for (const key of keys) assert.ok(count(g, sprite.params[key].def) >= 6, `${who}: the ${key} colour of ${id} (${sprite.params[key].def}) shows in the portrait`);
  }
});

test('every person has an outline of their own, and each control of a set changes its person', () => {
  const all = [...['hero', 'mage', 'rogue'].map((w) => [w, face(party, `${w}-neutral`)]), ...['elder', 'merchant', 'guard', 'kid'].map((w) => [w, face(village, `${w}-neutral`)])];
  all.forEach(([a, ga], i) => all.forEach(([b, gb], j) => { if (i < j) assert.ok(shapeDiff(ga, gb) >= 80, `${a} and ${b}: outlines differ by ${shapeDiff(ga, gb)} pixels`); }));
  for (const [set, people] of [[party, ['hero', 'mage', 'rogue']], [village, ['elder', 'merchant', 'guard', 'kid']]]) for (const who of people) {
    const other = set.params[who].swatches.find((c) => c !== set.params[who].def);
    for (const p of people) {
      const changed = diff(face(set, `${p}-neutral`), face(set, `${p}-neutral`, { [who]: other }));
      if (p === who) assert.ok(changed >= 12, `${who}'s colour changes ${who} (${changed} pixels)`);
      else assert.equal(changed, 0, `${who}'s colour leaves ${p} alone`);
    }
  }
  // the four frames of a talk clip: closed, half open, open, half open
  const talk = [0, 1, 2, 3].map((f) => face(party, 'mage-talk', {}, f));
  assert.equal(diff(talk[0], face(party, 'mage-neutral')), 0);
  assert.ok(diff(talk[0], talk[1]) > 0 && diff(talk[1], talk[2]) > 0 && diff(talk[3], talk[0]) > 0);
  assert.equal(diff(talk[1], talk[3]), 0);
});
