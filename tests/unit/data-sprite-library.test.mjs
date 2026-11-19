// dataSprite, part 4: library bodies (studio item S4b; docs/studio.md 2.3 and section 3, "Library bodies in dataSprite";
// Contract 14 rules 3 and 4). A definition whose body is { library: "humanoid", figure } becomes an ordinary sprite
// drawn through rigs/humanoid-studio.js: drawSprite(g, def, { clip, frame, t, p }) in render and
// spriteSockets(def, { clip, t, p }) in sockets, never rigs/humanoid-figure.js directly. Its controls: one color() per
// colour slot keyed by the slot id, one range() per slider keyed by its key, one toggle() per part keyed by the part
// name, and the standard speed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderFrame, renderSheet, defaultParams, frameSockets, clipFps, partList } from '../../engine/sprite.js';
import { describeSheet } from '../../engine/sheet-info.js';
import { Surface } from '../../engine/surface.js';
import { framePhase } from '../../rigs/keypose.js';
import * as S from '../../rigs/humanoid-studio.js';
import * as DS from '../../engine/data-sprite.js';
import knight from '../../sprites/knight.js';

const heroDef = S.hero();
const hero = DS.dataSprite(heroDef);
const P = defaultParams(hero);
const waving = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/waving-hero.json', import.meta.url), 'utf8'));
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
/** One frame as rigs/humanoid-studio.js draws it, for a cleaned definition and settings. */
const studioFrame = (def, clip, frame, p) => { const g = new Surface(64, 64); S.drawSprite(g, def, { clip, frame, p }); return g; };

test('data-sprite library: the Hero preset becomes a sprite (dataSprite and makeDataSprite, object and text)', () => {
  assert.equal(hero.id, 'my-hero');
  assert.equal(hero.name, 'Hero');
  assert.equal(hero.kind, 'Character');
  assert.deepEqual(hero.size, [64, 64]);
  assert.deepEqual(hero.pivot, [28, 58]);
  assert.equal(hero.grounded, true);
  assert.equal(hero.preview, 'walk');
  assert.deepEqual(hero.definition.made, { in: 'studio', from: 'library:knight' });
  assert.equal(hero.made, undefined, 'sprite.made means a worker sprite (review F1, issue 1)');
  assert.equal(hero.definition.body.library, 'humanoid');
  assert.ok(Object.isFrozen(hero.definition) && Object.isFrozen(hero.definition.body.figure));
  const m = DS.makeDataSprite(heroDef);
  assert.equal(m.ok, true, m.errors.join('\n'));
  assert.deepEqual(m.errors, []);
  assert.equal(DS.dataSprite(JSON.stringify(heroDef)).id, 'my-hero');
});

test('data-sprite library: controls are a colour per slot, a slider per `sets` control, a toggle per part, and speed', () => {
  const kinds = Object.fromEntries(Object.entries(hero.params).map(([k, d]) => [k, [d.kind, d.def]]));
  assert.deepEqual(kinds, {
    skin: ['color', '#f6d3b0'], hair: ['color', '#5a3a22'], outfit: ['color', '#3f6fd1'], trim: ['color', '#c9423a'], metal: ['color', '#c2c9d6'],
    speed: ['range', 0.5], height: ['range', 0.5], build: ['range', 0.5], head: ['range', 0.55],
    held: ['toggle', true], headgear: ['toggle', true], cape: ['toggle', true],
  });
  assert.deepEqual([hero.params.height.min, hero.params.height.max, hero.params.height.lo, hero.params.height.hi], [0, 1, 'Short', 'Tall']);
  assert.equal(hero.params.skin.material, 'skin');
  assert.equal(hero.params.metal.material, 'metal');
  assert.equal(hero.params.skin.swatches[0], '#f6d3b0');
  assert.deepEqual(partList(hero).map((x) => [x.name, x.label, x.socket]), [['held', 'Weapon', 'hand'], ['headgear', 'Headgear', 'head'], ['cape', 'Cape', 'back']]);
});

test('data-sprite library: clips keep frames, loop and label; fps at the middle speed is fps x 1.05, as the bone rigs', () => {
  assert.deepEqual(Object.keys(hero.clips), Object.keys(heroDef.clips));
  for (const [name, c] of Object.entries(heroDef.clips)) {
    const s = hero.clips[name];
    assert.deepEqual([s.frames, s.loop, s.label], [c.frames, c.loop, c.label], name);
    assert.equal(s.fps({ speed: 0.5 }), c.fps * 1.05, name);
    assert.equal(s.fps({ speed: 1 }), c.fps * 1.45, name);
    // the Hero's fps were stored as the catalogue's middle speed / 1.05: the drawn speed is the catalogue Hero's
    assert.equal(clipFps(hero, name, P), clipFps(knight, name, defaultParams(knight)), name);
  }
  assert.deepEqual(hero.sounds.attack, heroDef.clips.attack.sounds);
  assert.deepEqual(Object.keys(hero.sounds), Object.keys(heroDef.clips).filter((n) => heroDef.clips[n].sounds?.length));
});

test('data-sprite library: every frame is what rigs/humanoid-studio.js drawSprite draws, at the defaults and at other settings', () => {
  const def = hero.definition;
  const other = { ...P, outfit: '#4f9d57', metal: '#e6c545', height: 0.9, head: 0.2, cape: false, held: false };
  for (const [name, c] of Object.entries(hero.clips)) for (let f = 0; f < c.frames; f++) {
    assert.ok(same(renderFrame(hero, name, f, P), studioFrame(def, name, f, P)), `${name} ${f}`);
    assert.ok(same(renderFrame(hero, name, f, other), studioFrame(def, name, f, other)), `${name} ${f}, other settings`);
  }
});

test('data-sprite library: the Hero preset drawn by dataSprite is sprites/knight.js, pixel for pixel, at the defaults', () => {
  const kp = defaultParams(knight);
  for (const [name, c] of Object.entries(hero.clips)) for (let f = 0; f < c.frames; f++) {
    assert.equal(diff(renderFrame(hero, name, f, P), renderFrame(knight, name, f, kp)), 0, `${name} ${f}`);
  }
});

test('data-sprite library: every control changes the picture; a part switched off removes it', () => {
  const base = renderFrame(hero, 'walk', 2, P);
  for (const [k, v] of [['skin', '#9a6240'], ['hair', '#e0b040'], ['outfit', '#4f9d57'], ['trim', '#3f6fd1'], ['metal', '#e6c545'], ['height', 1], ['build', 0], ['head', 1], ['held', false], ['headgear', false], ['cape', false]]) {
    assert.ok(!same(renderFrame(hero, 'walk', 2, { ...P, [k]: v }), base), `${k} = ${v}`);
  }
  const opaque = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
  assert.ok(opaque(renderFrame(hero, 'idle', 0, { ...P, cape: false, held: false })) < opaque(renderFrame(hero, 'idle', 0, P)));
});

test('data-sprite library: sockets are spriteSockets of the frame (hand, offhand, head, back, feet)', () => {
  for (const [name, c] of Object.entries(hero.clips)) for (let f = 0; f < c.frames; f++) {
    const got = frameSockets(hero, name, f, P);
    assert.deepEqual(Object.keys(got), ['hand', 'offhand', 'head', 'back', 'feet'], name);
    assert.deepEqual(got, S.spriteSockets(hero.definition, { clip: name, t: framePhase(c, f), p: P }), `${name} ${f}`);
  }
});

test('data-sprite library: frame edits reach the sprite: a nudge moves the frame and its sockets, a flash whitens one frame', () => {
  const def = S.hero();
  def.clips.walk.frameEdits = { 3: { nudge: [2, -1] } };
  def.clips.idle.frameEdits = { 5: { flash: true } };
  const s = DS.dataSprite(def);
  const a = renderFrame(hero, 'walk', 3, P), b = renderFrame(s, 'walk', 3, P);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const sx = x - 2, sy = y + 1;
    assert.equal(b.data[y * 64 + x], sx >= 0 && sy >= 0 && sx < 64 && sy < 64 ? a.data[sy * 64 + sx] : 0, `pixel ${x},${y}`);
  }
  assert.ok(same(renderFrame(s, 'walk', 2, P), renderFrame(hero, 'walk', 2, P)));
  const s0 = frameSockets(hero, 'walk', 3, P), s1 = frameSockets(s, 'walk', 3, P);
  for (const k of Object.keys(s0)) assert.deepEqual([s1[k].x, s1[k].y], [s0[k].x + 2, s0[k].y - 1], k);
  assert.ok(!same(renderFrame(s, 'idle', 5, P), renderFrame(hero, 'idle', 5, P)));
  assert.ok(same(renderFrame(s, 'idle', 4, P), renderFrame(hero, 'idle', 4, P)));
});

test('data-sprite library: renderSheet and describeSheet work; the sheet carries the sockets and parts', () => {
  const sheet = renderSheet(hero, P);
  assert.equal(sheet.w, 64 * Math.max(...Object.values(hero.clips).map((c) => c.frames)));
  assert.equal(sheet.h, 64 * Object.keys(hero.clips).length);
  const d = describeSheet(hero, sheet.meta, P);
  assert.equal(d.view, 'side');
  assert.equal(d.kind, 'character');
  assert.equal(d.grounded, true);
  for (const fr of sheet.meta.frames) assert.deepEqual(Object.keys(fr.sockets), ['hand', 'offhand', 'head', 'back', 'feet']);
  assert.deepEqual(Object.keys(sheet.meta.parts), ['held', 'headgear', 'cape']);
});

test('data-sprite library: a figure without the Hero\'s parts draws too (the waving hero: a scarf, a new keyed clip)', () => {
  const s = DS.dataSprite(waving);
  const p = defaultParams(s);
  assert.deepEqual(Object.keys(s.params), ['speed', 'height', 'held', 'scarf']);
  for (const [name, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    const g = renderFrame(s, name, f, p);
    assert.ok(g.bounds(), `${name} ${f} draws`);
    assert.ok(same(g, studioFrame(s.definition, name, f, p)), `${name} ${f}`);
  }
  assert.ok(!same(renderFrame(s, 'wave', 2, p), renderFrame(s, 'wave', 4, p)), 'the wave moves');
  assert.ok(!same(renderFrame(s, 'idle', 0, p), renderFrame(s, 'idle', 0, { ...p, scarf: false })));
});

test('data-sprite library: drawing is deterministic and never changes the definition', () => {
  const before = JSON.stringify(hero.definition);
  for (const name of ['attack', 'die']) assert.ok(same(renderFrame(hero, name, 3, P), renderFrame(hero, name, 3, P)));
  assert.equal(JSON.stringify(hero.definition), before);
});
