// catalog/studio-schema.js: the formats (docs/studio.md, section 2) and the worked examples.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as S from '../../catalog/studio-schema.js';
import { LIMITS } from '../../app/api-source.js';
import { MATERIAL_IDS } from '../../engine/materials.js';

const fixture = (name) => fs.readFileSync(new URL(`../fixtures/studio/${name}.json`, import.meta.url), 'utf8');
const load = (name) => JSON.parse(fixture(name));

test('exports the validator, the parser and the tables the studio builds from', () => {
  for (const f of ['validateStudio', 'validateStudioSprite', 'validateStudioRig', 'parseStudioJson']) assert.equal(typeof S[f], 'function', f);
  for (const k of ['STUDIO_LIMITS', 'FRAME_SIZES', 'STANDARD_CLIPS', 'CLIP_SYNONYMS', 'EASES', 'SHAPE_KINDS', 'SOCKET_NAMES', 'HUMANOID_POSE_FIELDS', 'LIBRARY_BODIES', 'LIBRARY_PARTS', 'ID_PATTERN', 'SPRITE_ID_PATTERN', 'RESERVED_IDS']) assert.ok(S[k] !== undefined, k);
  assert.deepEqual([...S.EASES], ['smooth', 'linear', 'in', 'out', 'hold']);
  assert.deepEqual([...S.SHAPE_KINDS], ['limb', 'capsule', 'ellipse', 'poly', 'dot']);
  assert.deepEqual([...S.LIBRARY_BODIES], ['humanoid']);
});

test('the caps are the design\'s, and the shared ones equal LIMITS of app/api-source.js', () => {
  const L = S.STUDIO_LIMITS;
  assert.equal(L.jsonBytes, 64 * 1024);
  assert.equal(L.bones, 48); assert.equal(L.boneDepth, 16); assert.equal(L.shapes, 160); assert.equal(L.polyPoints, 24);
  assert.equal(L.ik, 8); assert.equal(L.points, 16); assert.equal(L.colours, 8); assert.equal(L.keysPerClip, 64);
  assert.equal(L.nameChars, 60); assert.equal(L.blurbChars, 300); assert.equal(L.wordChars, 30);
  assert.equal(L.angle, 720); assert.equal(L.radius, 32); assert.equal(L.frameWidth, 128); assert.equal(L.frameHeight, 96);
  assert.equal(L.clips, LIMITS.clips); assert.equal(L.framesPerClip, LIMITS.framesPerClip); assert.equal(L.frames, LIMITS.frames); assert.equal(L.controls, LIMITS.controls);
  assert.ok(Object.isFrozen(L));
});

test('frame sizes are the style guide\'s, none over 128 x 96', () => {
  for (const s of [[16, 16], [32, 32], [48, 48], [64, 48], [64, 64], [96, 96], [128, 96], [32, 16], [96, 32], [64, 16]]) assert.ok(S.FRAME_SIZES.some(([w, h]) => w === s[0] && h === s[1]), `${s} is a frame size`);
  for (const [w, h] of S.FRAME_SIZES) assert.ok(w <= 128 && h <= 96, `${w}x${h} fits`);
  assert.ok(!S.FRAME_SIZES.some(([w, h]) => w === 320 && h === 180), 'a backdrop is not a studio size');
});

test('standard clips follow style guide 4', () => {
  assert.deepEqual(S.STANDARD_CLIPS.walk, { frames: 8, fps: 10, loop: true });
  assert.deepEqual(S.STANDARD_CLIPS.attack, { frames: 8, fps: 13, loop: false });
  assert.deepEqual(S.STANDARD_CLIPS.hurt, { frames: 4, fps: 9, loop: false });
  assert.equal(S.CLIP_SYNONYMS.bite, 'attack');
  assert.equal(S.CLIP_SYNONYMS.death, 'die');
});

test('ids: the inner pattern allows the design\'s camelCase names; a sprite id is lowercase with dashes', () => {
  for (const id of ['body', 'thighF', 'tail1', 'foot-front', 'a']) assert.ok(S.ID_PATTERN.test(id), id);
  for (const id of ['', '1leg', 'Tail', 'has space', 'a_b', 'x'.repeat(41), '__proto__']) assert.ok(!S.ID_PATTERN.test(id), id);
  assert.ok(S.SPRITE_ID_PATTERN.test('moss-newt'));
  assert.ok(!S.SPRITE_ID_PATTERN.test('mossNewt'));
  for (const r of ['constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty']) assert.ok(S.RESERVED_IDS.includes(r), r);
});

test('the design\'s worked rig (the trimmed newt) passes as a rig', () => {
  const r = S.validateStudioRig(load('newt-rig-doc'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.value.id, 'newt');
  assert.equal(r.value.bones.length, 6);
  assert.equal(r.value.shapes.length, 8);
});

test('the newt passes as a sprite, with no errors and no warnings', () => {
  const r = S.validateStudioSprite(load('newt'));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.ok, true);
  assert.equal(r.value.id, 'moss-newt');
  assert.deepEqual(Object.keys(r.value.clips), ['idle', 'walk', 'attack', 'hurt', 'die']);
  assert.equal(r.value.clips.attack.label, 'Bite');
  assert.deepEqual(r.value.size, [48, 48]);
});

test('the newt passes from its JSON text too, and validateStudio picks the format', () => {
  const a = S.validateStudio(fixture('newt'));
  assert.equal(a.ok, true, a.errors.join('\n'));
  assert.deepEqual(a.value, S.validateStudioSprite(load('newt')).value);
  const b = S.validateStudio(fixture('newt-rig-doc'));
  assert.equal(b.ok, true, b.errors.join('\n'));
  assert.equal(b.value.format, 'loadout-rig');
  const c = S.validateStudio({ format: 'something-else' });
  assert.equal(c.ok, false);
  assert.match(c.errors.join('\n'), /loadout-sprite/);
});

test('the library-body example (a hero with a new wave) passes', () => {
  const r = S.validateStudioSprite(load('waving-hero'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.size, [64, 64]);
  assert.equal(r.value.body.library, 'humanoid');
  assert.equal(r.value.body.figure.held.kind, 'sword');
  assert.deepEqual(r.value.clips.wave.keys[1].armF, { a: 160, e: 30 });
});

test('a maximal definition (every count at its cap) fits in 64 KB and passes', () => {
  const text = fixture('maximal');
  assert.ok(new TextEncoder().encode(text).length <= S.STUDIO_LIMITS.jsonBytes);
  const d = JSON.parse(text);
  assert.equal(d.body.rig.bones.length, 48); assert.equal(d.body.rig.shapes.length, 160); assert.equal(Object.keys(d.clips).length, 32);
  const r = S.validateStudio(text);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) S.validateStudio(text);
  assert.ok((performance.now() - t0) / 10 < 50, 'validating a maximal definition takes well under 50 ms');
});

test('value is a cleaned copy: plain JSON, input untouched', () => {
  const d = load('newt');
  const before = JSON.stringify(d);
  const r = S.validateStudioSprite(d);
  assert.equal(JSON.stringify(d), before, 'the input is not changed');
  assert.notEqual(r.value, d);
  assert.deepEqual(JSON.parse(JSON.stringify(r.value)), r.value, 'value survives JSON unchanged');
});

test('a sprite fills what it can derive: size from the rig, pivot, grounded, preview, made, colours, blurb', () => {
  const d = load('newt');
  delete d.size; delete d.pivot; delete d.grounded; delete d.preview; delete d.made; delete d.blurb;
  d.colours = { skin: '#112233' };
  const r = S.validateStudioSprite(d);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.value.size, [48, 48]);
  assert.deepEqual(r.value.pivot, [24, 42]);
  assert.equal(r.value.grounded, true);
  assert.equal(r.value.preview, 'idle');
  assert.deepEqual(r.value.made, { in: 'studio', from: 'new' });
  assert.equal(r.value.blurb, '');
  assert.deepEqual(r.value.colours, { skin: '#112233', belly: '#e6c545', eye: '#231b33' });
});

test('materials are checked against engine/materials.js', () => {
  assert.ok(MATERIAL_IDS.includes('skin'));
  const rig = load('newt-rig-doc');
  rig.colours[0].material = 'cheese';
  const r = S.validateStudioRig(rig);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /material/);
});

test('the humanoid pose fields are the design\'s list', () => {
  const F = S.HUMANOID_POSE_FIELDS;
  for (const k of ['rootX', 'lift', 'crouch', 'lean', 'headTilt', 'item', 'item2', 'sway', 'glow', 'lie', 'headTurn', 'pull', 'fling', 'air', 'out', 'level2', 'footF', 'footB', 'armF', 'armB', 'blink', 'flash', 'mouth', 'fire']) assert.ok(F[k], k);
  assert.equal(Object.keys(F).length, 24);
});

test('never throws, whatever it is given', () => {
  for (const x of [undefined, null, 0, NaN, '', '{', '[]', 'null', [], () => 1, Symbol('s'), 10n, new Date(0), { format: 'loadout-sprite' }, { format: 'loadout-rig' }]) {
    for (const f of [S.validateStudio, S.validateStudioSprite, S.validateStudioRig]) {
      const r = f(x);
      assert.equal(r.ok, false);
      assert.ok(Array.isArray(r.errors) && r.errors.length > 0);
      assert.ok(Array.isArray(r.warnings));
      assert.equal(r.value, null);
      for (const e of r.errors) assert.equal(typeof e, 'string');
    }
  }
});
