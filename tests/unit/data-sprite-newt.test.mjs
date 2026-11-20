// dataSprite (engine/data-sprite.js; docs/studio.md 2.3 and section 8, item S4; Contract 14 rule 4): a studio
// definition that is data becomes an ordinary defineSprite result whose drawing is framework code, so renderSheet,
// describeSheet and the quality bar take it like any sprite. Part 1: the side-view newt of tests/fixtures/studio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderFrame, renderSheet, defaultParams, cleanParams, clipFps, partList, inEffect, frameSockets } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { drawRig, solveRig, rigPoints } from '../../rigs/bones.js';
import { clipPose } from '../../rigs/keypose.js';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import * as DS from '../../engine/data-sprite.js';

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${name}.json`, import.meta.url), 'utf8'));
const newtJson = load('newt');
const newt = DS.dataSprite(newtJson);
const P = defaultParams(newt);
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const opaque = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };
const frame = (clip, f, p = P) => renderFrame(newt, clip, f, p);

// ---- the defineSprite result --------------------------------------------------------------------------------

test('data-sprite: the newt becomes a defineSprite result with the definition\'s fields', () => {
  assert.equal(newt.id, 'moss-newt');
  assert.equal(newt.name, 'Moss newt');
  assert.equal(newt.blurb, newtJson.blurb);
  assert.deepEqual(newt.meta, newtJson.meta);
  assert.deepEqual(newt.size, [48, 48]);
  assert.deepEqual(newt.pivot, [24, 42]);
  assert.equal(newt.grounded, true);
  assert.equal(newt.preview, 'walk');
  assert.equal(newt.kind, 'Creature');
  assert.deepEqual(newt.styles, ['pixel']);
  assert.equal(typeof newt.render, 'function');
  assert.equal(typeof newt.sockets, 'function');
  assert.deepEqual(Object.keys(newt.clips), ['idle', 'walk', 'attack', 'hurt', 'die']);
});

test('data-sprite: the cleaned definition is kept on the sprite (definition, with its made), frozen, plain JSON', () => {
  // where it came from is the definition's (definition.made); the sprite itself has no `made` (review F1, issue 1; the worker
  // that once marked sprites made on a visit, app/made.js, went in build item B11)
  assert.deepEqual(newt.definition.made, { in: 'studio', from: 'template:four-legs' });
  assert.equal(newt.made, undefined);
  assert.equal(newt.definition.format, 'loadout-sprite');
  assert.equal(newt.definition.id, 'moss-newt');
  assert.ok(Object.isFrozen(newt.definition) && Object.isFrozen(newt.definition.body.rig.bones[0]));
  assert.deepEqual(JSON.parse(JSON.stringify(newt.definition)), newt.definition);
  // the input is not changed and not shared
  assert.notEqual(newt.definition.clips, newtJson.clips);
  assert.equal(newtJson.clips.walk.keys.length, 4);
});

test('data-sprite: JSON text is accepted as well as an object, and gives the same sprite', () => {
  const s = DS.dataSprite(JSON.stringify(newtJson));
  assert.deepEqual(s.definition, newt.definition);
  assert.ok(same(renderFrame(s, 'walk', 3, P), frame('walk', 3)));
});

// ---- controls (section 2.3) -----------------------------------------------------------------------------------

test('data-sprite: one colour control per colour slot that is not a detail, with its label and material', () => {
  assert.equal(newt.params.skin.kind, 'color');
  assert.equal(newt.params.skin.label, 'Skin');
  assert.equal(newt.params.skin.def, '#4f9d57');
  assert.equal(newt.params.skin.material, 'skin');
  assert.equal(newt.params.skin.swatches[0], '#4f9d57');
  assert.ok(newt.params.skin.swatches.length >= 4 && newt.params.skin.swatches.length <= 8);
  assert.equal(newt.params.belly.kind, 'color');
  assert.equal(newt.params.eye, undefined, 'a detail slot gets no control');
});

test('data-sprite: sliders become range() controls; the standard speed control scales every clip\'s fps', () => {
  const t = newt.params.tailLength;
  assert.equal(t.kind, 'range');
  assert.deepEqual([t.label, t.lo, t.hi, t.min, t.max, t.def], ['Tail', 'Short', 'Long', 0.6, 1.5, 1]);
  const s = newt.params.speed;
  assert.equal(s.kind, 'range');
  assert.deepEqual([s.min, s.max, s.def], [0, 1, 0.5]);
  // fps at the middle speed x lerp(0.65, 1.45, speed), as every catalogue clip does
  for (const speed of [0, 0.5, 1]) {
    assert.equal(clipFps(newt, 'walk', { ...P, speed }), Math.max(1, Math.round(10 * (0.65 + 0.8 * speed))));
    assert.equal(clipFps(newt, 'idle', { ...P, speed }), Math.max(1, Math.round(7 * (0.65 + 0.8 * speed))));
  }
  assert.deepEqual(Object.keys(defaultParams(newt)).sort(), ['belly', 'chunk', 'frill', 'skin', 'speed', 'tailLength']);
});

test('data-sprite: a sprite with no speed control has clips at their own fps', () => {
  const j = structuredClone(newtJson);
  j.controls = j.controls.filter((c) => c.key !== 'speed');
  const s = DS.dataSprite(j);
  assert.equal(s.params.speed, undefined);
  assert.equal(clipFps(s, 'walk', defaultParams(s)), 10);
});

test('data-sprite: every control changes the picture (colour, bone slider, shape slider)', () => {
  const base = frame('idle', 0);
  for (const [k, v] of [['skin', '#c9423a'], ['belly', '#3f6fd1'], ['tailLength', 1.5], ['tailLength', 0.6], ['chunk', 1.3]]) {
    assert.ok(!same(frame('idle', 0, { ...P, [k]: v }), base), `${k} = ${v} changes the picture`);
  }
});

test('data-sprite: a part becomes a Contract 3 part with an on/off selector; off leaves its shapes out', () => {
  assert.equal(newt.params.frill.kind, 'toggle');
  assert.equal(newt.params.frill.def, true);
  assert.equal(newt.params.frill.label, 'Frill');
  const [part] = partList(newt);
  assert.deepEqual([part.name, part.label, part.selector, part.none], ['frill', 'Frill', 'frill', false]);
  const on = frame('idle', 0), off = frame('idle', 0, { ...P, frill: false });
  assert.ok(opaque(off) < opaque(on), 'switching the frill off draws fewer pixels');
  const sheet = renderSheet(newt, { ...P, frill: false });
  assert.deepEqual(sheet.meta.parts.frill, { label: 'Frill', present: false, settings: { frill: false } });
});

test('data-sprite: a control whose shapes all belong to one part is in that part, so it is hidden with the part', () => {
  const j = structuredClone(newtJson);
  j.body.rig.colours.push({ id: 'crest', label: 'Frill colour', default: '#c9423a', material: 'skin' });
  j.body.rig.shapes.find((s) => s.id === 'frill').paint = 'crest';
  j.controls.push({ key: 'frillSize', label: 'Frill size', min: 0.6, max: 1.6, default: 1, scales: { shapes: ['frill'] } });
  const s = DS.dataSprite(j);
  const part = partList(s).find((x) => x.name === 'frill');
  assert.deepEqual(part.params, ['frill', 'crest', 'frillSize']);
  const p = defaultParams(s);
  assert.equal(inEffect(s, 'crest', { ...p, frill: false }), false);
  assert.equal(inEffect(s, 'frillSize', p), true);
  const r = checkSprite(s, { validateMeta });
  assert.ok(!r.errors.some((e) => /crest|frillSize|Frill colour|Frill size/.test(e)), r.errors.join('\n'));
});

// ---- clips and sounds -------------------------------------------------------------------------------------------

test('data-sprite: clips keep frames, loop and label; fps is a function of the settings', () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(newt.clips).map(([n, c]) => [n, [c.frames, c.loop, c.label, typeof c.fps]])),
    { idle: [8, true, 'Idle', 'function'], walk: [8, true, 'Walk', 'function'], attack: [8, false, 'Bite', 'function'], hurt: [4, false, 'Hurt', 'function'], die: [8, false, 'Die', 'function'] });
});

test('data-sprite: each clip\'s sounds become the sprite\'s cue list', () => {
  assert.deepEqual(newt.sounds.walk, [{ sound: 'footstep-grass', frame: 0, volume: 0.4 }, { sound: 'footstep-grass', frame: 4, volume: 0.4 }]);
  assert.deepEqual(newt.sounds.attack, [{ sound: 'whoosh', frame: 3, preset: 'Quick swipe', volume: 0.5 }]);
  assert.deepEqual(newt.sounds.hurt, [{ sound: 'punch', frame: 0 }]);
  assert.equal(newt.sounds.idle, undefined);
});

// ---- drawing -----------------------------------------------------------------------------------------------------

test('data-sprite: a frame is the rig drawn by rigs/bones.js at the keys blended for that frame', () => {
  const rig = newt.definition.body.rig;
  const opt = { colours: { skin: '#4f9d57', belly: '#e6c545', eye: '#231b33' }, partsOff: [], scale: { bones: { tail1: 1, tail2: 1 }, shapes: { torso: 1, belly: 1 } } };
  for (const [clip, f] of [['walk', 0], ['walk', 3], ['attack', 4], ['idle', 2]]) {
    const want = new Surface(48, 48);
    drawRig(want, rig, clipPose(newt.definition.clips[clip], f), opt);
    assert.ok(same(frame(clip, f), want), `${clip} ${f}`);
  }
});

test('data-sprite: framePose is the blended keys plus the frame\'s edits (nudge, flash)', () => {
  const pose = DS.framePose(newt.definition, 'hurt', 0);
  assert.deepEqual(pose.nudge, [-1, 0]);
  assert.equal(pose.flash, true);
  assert.deepEqual(pose.root, [-2, 0]);
  const later = DS.framePose(newt.definition, 'hurt', 2);
  assert.equal(later.flash, undefined);
  assert.equal(later.nudge, undefined);
});

test('data-sprite: a white flash on frame 0 of hurt, as the style guide asks', () => {
  const g = frame('hurt', 0);
  let white = 0;
  for (const v of g.data) if (v === col('#ffffff')) white++;
  assert.ok(white > 40, `hurt frame 0 is mostly white (${white} white pixels)`);
  let white2 = 0;
  for (const v of frame('hurt', 2).data) if (v === col('#ffffff')) white2++;
  assert.equal(white2, 0);
});

test('data-sprite: keys that show and hide shapes work (the idle blink, the dead eye)', () => {
  const open = DS.framePose(newt.definition, 'idle', 0), shut = DS.framePose(newt.definition, 'idle', 6);
  assert.ok(!(open.hide ?? []).includes('eye'));
  assert.ok(shut.hide.includes('eye') && shut.show.includes('eyeShut'));
  assert.ok(!same(frame('idle', 6), frame('idle', 5)));
});

test('data-sprite: frame edits show and hide shapes, and win over the keys', () => {
  const j = structuredClone(newtJson);
  j.clips.idle.frameEdits = { 1: { show: ['eyeShut'], hide: ['eye'] }, 6: { show: ['eye'], hide: ['eyeShut'] } };
  const s = DS.dataSprite(j);
  const p1 = DS.framePose(s.definition, 'idle', 1), p6 = DS.framePose(s.definition, 'idle', 6);
  assert.ok(p1.show.includes('eyeShut') && p1.hide.includes('eye'));
  assert.ok(p6.show.includes('eye') && p6.hide.includes('eyeShut') && !p6.hide.includes('eye') && !p6.show.includes('eyeShut'));
});

test('data-sprite: every frame of every clip draws something inside the frame, and drawing is deterministic', () => {
  for (const [name, c] of Object.entries(newt.clips)) for (let f = 0; f < c.frames; f++) {
    const a = frame(name, f), b = frame(name, f);
    assert.ok(opaque(a) > 60, `${name} ${f} draws the newt`);
    assert.ok(same(a, b), `${name} ${f} is the same twice`);
  }
});

// ---- sockets, sheet, export description ---------------------------------------------------------------------

test('data-sprite: sockets are the rig\'s attach points for the frame (Contract 3)', () => {
  const s = frameSockets(newt, 'walk', 2, P);
  assert.deepEqual(Object.keys(s), ['head', 'back', 'feet']);
  const J = solveRig(newt.definition.body.rig, DS.framePose(newt.definition, 'walk', 2), { scale: { bones: { tail1: 1, tail2: 1 }, shapes: { torso: 1, belly: 1 } } });
  assert.deepEqual(s, rigPoints(newt.definition.body.rig, J));
  // a nudge moves the points with the picture
  const h0 = frameSockets(newt, 'hurt', 0, P), want = rigPoints(newt.definition.body.rig, solveRig(newt.definition.body.rig, DS.framePose(newt.definition, 'hurt', 0)));
  assert.deepEqual(h0, want);
});

test('data-sprite: sockets follow the frame edits of the frame asked for, not frame 0, in a loop and in a one-shot', () => {
  const j = structuredClone(newtJson);
  j.clips.walk.frameEdits = { 3: { nudge: [2, -1] } };        // a loop, 8 frames
  j.clips.attack.frameEdits = { 5: { nudge: [-2, 1] } };      // a one-shot, 8 frames
  const s = DS.dataSprite(j), p = defaultParams(s);
  const plain = (clip, f) => frameSockets(newt, clip, f, P);
  for (const [clip, f, [dx, dy]] of [['walk', 3, [2, -1]], ['attack', 5, [-2, 1]]]) {
    const got = frameSockets(s, clip, f, p), base = plain(clip, f);
    assert.deepEqual(Object.keys(got), ['head', 'back', 'feet']);
    for (const k of ['head', 'back']) {
      assert.ok(Math.abs(got[k].x - base[k].x - dx) < 1e-9 && Math.abs(got[k].y - base[k].y - dy) < 1e-9, `${clip} ${f} ${k}: ${JSON.stringify(got[k])} vs ${JSON.stringify(base[k])}`);
    }
    // the frames around it carry no edit, so they match the plain newt
    for (const g of [f - 1, f + 1]) assert.deepEqual(frameSockets(s, clip, g, p), plain(clip, g));
    // and the points are those of the pose drawn for that frame
    const r = s.definition.body.rig;
    assert.deepEqual(got, rigPoints(r, solveRig(r, DS.framePose(s.definition, clip, f), DS.drawOptions(s.definition, p))));
  }
});

test('data-sprite: a rig with no attach points gives a sprite with no sockets', () => {
  const j = structuredClone(newtJson);
  j.body.rig.points = [];
  const s = DS.dataSprite(j);
  assert.equal(s.sockets, undefined);
  assert.equal(renderSheet(s, defaultParams(s)).meta.frames[0].sockets, undefined);
});

test('data-sprite: renderSheet works: one row per clip, sockets on every frame, parts listed', () => {
  const sheet = renderSheet(newt, P);
  assert.equal(sheet.w, 8 * 48);
  assert.equal(sheet.h, 5 * 48);
  assert.equal(sheet.meta.sprite, 'moss-newt');
  assert.deepEqual(sheet.meta.pivot, { x: 24, y: 42 });
  assert.deepEqual(sheet.meta.animations.walk, { row: 1, frames: 8, fps: 11, loop: true });
  assert.equal(sheet.meta.frames.length, 8 + 8 + 8 + 4 + 8);
  for (const fr of sheet.meta.frames) assert.deepEqual(Object.keys(fr.sockets), ['head', 'back', 'feet']);
  assert.deepEqual(sheet.meta.parts, { frill: { label: 'Frill', present: true, settings: { frill: true } } });
  let drawn = 0;
  for (const v of sheet.data) if (v) drawn++;
  assert.ok(drawn > 2000);
});

test('data-sprite: describeSheet works: a creature, seen from the side, standing on its pivot', () => {
  const sheet = renderSheet(newt, P);
  const d = describeSheet(newt, sheet.meta, P);
  assert.equal(d.kind, 'creature');
  assert.equal(d.view, 'side');
  assert.equal(d.grounded, true);
  assert.equal(d.facing, 'right');
  assert.equal(d.animations.attack.label, 'Bite');
});

// ---- the quality bar ------------------------------------------------------------------------------------------

test('data-sprite: checkSprite runs on it and returns its verdict', () => {
  const sounds = new Map(['footstep-grass', 'whoosh', 'punch', 'monster-fade'].map((id) => [id, JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'))]));
  const r = checkSprite(newt, { validateMeta, soundIndex: sounds });
  assert.ok(Array.isArray(r.errors) && Array.isArray(r.warnings) && r.metrics && typeof r.metrics === 'object');
  // the definition's own faults are the bar's business (advice in the studio); none of them is about the wiring
  assert.ok(!r.errors.some((e) => /never changes the picture|does not exist|not one of the sprite's controls|throws|nothing drawn/.test(e)), r.errors.join('\n'));
});

test('data-sprite: cleanParams keeps colours and clamps sliders like any sprite', () => {
  const p = cleanParams(newt, { tailLength: 9, skin: '#123456' });
  assert.equal(p.tailLength, 1.5);
  assert.equal(p.skin, '#123456');
});

// ---- refusals -------------------------------------------------------------------------------------------------

test('data-sprite: an invalid definition throws, naming what is wrong (as defineSprite does)', () => {
  const j = structuredClone(newtJson);
  j.body.rig.shapes[0].bone = 'nope';
  assert.throws(() => DS.dataSprite(j), (e) => /moss-newt/.test(e.message) && /"nope"/.test(e.message));
  assert.throws(() => DS.dataSprite('{ not json'), /not JSON/);
  assert.throws(() => DS.dataSprite({ format: 'loadout-rig', version: 1 }), /loadout-sprite/);
});

test('data-sprite: makeDataSprite never throws: { ok, errors, warnings, sprite }', () => {
  const good = DS.makeDataSprite(newtJson);
  assert.equal(good.ok, true);
  assert.equal(good.sprite.id, 'moss-newt');
  assert.deepEqual(good.errors, []);
  for (const bad of [null, 42, '{', { format: 'loadout-sprite', version: 9 }, { ...newtJson, clips: {} }]) {
    const r = DS.makeDataSprite(bad);
    assert.equal(r.ok, false);
    assert.equal(r.sprite, null);
    assert.ok(r.errors.length > 0);
  }
});

test('data-sprite: a library body (the side-view person) is drawn since S4b (tests/unit/data-sprite-library.test.mjs)', () => {
  const hero = load('waving-hero');
  const v = DS.validateDataSprite(hero);
  assert.equal(v.ok, true, v.errors.join('\n'));
  const r = DS.makeDataSprite(hero);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(DS.dataSprite(hero).id, 'waving-hero');
});
