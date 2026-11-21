// Build item B4x, part 3 (docs/data-sprites.md 2.2; pieces/README.md, the side-view person): the variant clips baked
// from rigs/humanoid.js (punch, thrust, the unarmed walk, run and talk, shoot-bow) published in the side-view base, so
// a sprite can name them with `from`, and the Hero (tests/fixtures/person-side/knight.json) rebuilt to keep exactly the
// code knight's clips (a clip list on `extends`) and to punch, walk and run unarmed with Weapon none (a `from` that
// picks by a setting), as sprites/knight.js does. Held to here:
//   - base:person-side@7 in pieces/ is the base with its variant clips, pinned, and under the 128 KB piece cap; the
//     released @6 is unchanged (no variant clips). (tools/bake-person-side.mjs wrote them and went in R2b, 2026-11-21: that
//     pieces/ equals what it writes is no longer held; the pins hold the content)
//   - the Hero extends @7, takes the code knight's clips and no more, and picks walk, run and attack by Weapon; at each
//     setting a clip's keys are the base clip's it picked; with no weapon it is close in pixels to the code knight with
//     none, closer than the armed clips would be
//   - sketches of the bone soldier, the spear goblin and the wizard (tests/fixtures/person-side/thrust/) name thrust:
//     each validates on @7, keeps its code sprite's clips, and thrusts where the code does (a spear; the goblin's dagger)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validatePiece, createPieceStore, pieceRegistry, PIECE_LIMITS } from '../../engine/pieces.js';
import { readPins, pieceHash } from '../../tools/lib/pieces-index.mjs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { resolveSprite } from '../../engine/resolve.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { codeSprite } from '../helpers/library.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const V7 = 'pieces/base-person-side.v7.json';
const BASE7 = json(V7);
const HERO = json('tests/fixtures/person-side/knight.json');
const SKETCHES = ['bone-soldier', 'spear-goblin', 'wizard'];
const sketch = (id) => json(`tests/fixtures/person-side/thrust/${id}.json`);
/** The names of the base's standard clips and of its variants (what the baker listed). */
const STANDARD_CLIPS = Object.fromEntries(['idle', 'walk', 'run', 'jump', 'attack', 'shoot', 'cast', 'block', 'hurt', 'die', 'victory', 'talk'].map((n) => [n, true]));
const VARIANT_CLIPS = Object.fromEntries(['walk-unarmed', 'run-unarmed', 'talk-unarmed', 'punch', 'thrust', 'shoot-bow'].map((n) => [n, true]));
/** The pieces the baker wrote, as on disk (the Hero's parts and the base). */
const BAKED_FILES = [V7, 'pieces/part-hair.v2.json', 'pieces/part-hair-long.v1.json', 'pieces/part-ponytail.v1.json', 'pieces/part-hair-nape.v2.json', 'pieces/part-helmet.v3.json', 'pieces/part-plume.v1.json', 'pieces/part-crown.v4.json', 'pieces/part-cape.v1.json', 'pieces/part-cape-ground.v2.json', 'pieces/part-belt.v1.json', 'pieces/held-sword.v1.json', 'pieces/held-axe.v1.json', 'pieces/held-spear.v1.json'];
const store = () => {
  const s = createPieceStore();
  for (const file of BAKED_FILES) s.add(read(file), file.split('/').pop());
  return s;
};
const knight = await codeSprite('knight');

test('base:person-side@7 is the base with its variant clips, pinned, under the piece cap', () => {
  assert.deepEqual(Object.keys(BASE7.body.clips), [...Object.keys(STANDARD_CLIPS), ...Object.keys(VARIANT_CLIPS)]);
  for (const name of ['punch', 'thrust', 'walk-unarmed', 'run-unarmed', 'talk-unarmed', 'shoot-bow']) assert.ok(BASE7.body.clips[name], name);
  const text = read(V7);
  const bytes = Buffer.byteLength(text);
  assert.ok(bytes <= PIECE_LIMITS.jsonBytes, `${bytes} bytes; the cap is ${PIECE_LIMITS.jsonBytes}`);
  const v = validatePiece(text, { file: 'base-person-side.v7.json' });
  assert.ok(v.ok, v.errors.join('; '));
  assert.deepEqual(v.warnings, []);
  const pins = readPins(new URL('.', ROOT).pathname);
  assert.equal(pins['base:person-side@7'], pieceHash(BASE7), 'pinned (released) with this content');
});

test('the released base:person-side@6 is unchanged: its standard clips only, its pin its content', () => {
  const v6 = json('pieces/base-person-side.v6.json');
  assert.deepEqual(Object.keys(v6.body.clips), Object.keys(STANDARD_CLIPS));
  assert.equal(readPins(new URL('.', ROOT).pathname)['base:person-side@6'], pieceHash(v6));
  // @7 is @6 with the variant clips added: the same rig, the same standard clips
  assert.deepEqual(BASE7.body.rig, v6.body.rig);
  for (const name of Object.keys(STANDARD_CLIPS)) assert.deepEqual(BASE7.body.clips[name], v6.body.clips[name], name);
});

test('the Hero extends @7 and takes the code knight\'s clips, no more, in the code\'s order', () => {
  assert.deepEqual(HERO.body.rig.extends.use, 'base:person-side');
  assert.equal(HERO.body.rig.extends.v, 7);
  const v = validateSprite(HERO, { pieces: pieceRegistry(store()) });
  assert.ok(v.ok, v.errors.join('; '));
  assert.deepEqual(v.warnings, []);
  assert.deepEqual(v.clips, Object.keys(knight.clips));
  const r = makeDataSprite(HERO, { pieces: store() });
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(Object.keys(r.sprite.clips), Object.keys(knight.clips));
  for (const [name, c] of Object.entries(knight.clips)) assert.equal(r.sprite.clips[name].frames, c.frames, name);
});

test('the Hero picks walk, run and attack by Weapon as the code knight does: none punches and walks and runs unarmed', () => {
  const want = {
    sword: { walk: 'walk', run: 'run', attack: 'attack' }, axe: { walk: 'walk', run: 'run', attack: 'attack' },
    spear: { walk: 'walk', run: 'run', attack: 'attack' }, none: { walk: 'walk-unarmed', run: 'run-unarmed', attack: 'punch' },
  };
  for (const [weapon, clips] of Object.entries(want)) {
    const r = resolveSprite(HERO, { weapon }, { pieces: store() });
    assert.ok(r.ok, r.errors.join('; '));
    assert.deepEqual(Object.keys(r.clips), Object.keys(knight.clips), weapon);
    for (const [name, from] of Object.entries(clips)) {
      assert.equal(r.clips[name].from, from, `${weapon}: ${name}`);
      assert.deepEqual(r.clips[name].keys, BASE7.body.clips[from].keys, `${weapon}: ${name} plays ${from}'s keys`);
      assert.equal(r.clips[name].frames, BASE7.body.clips[from].frames, `${weapon}: ${name}`);
    }
    // the sounds stay the Hero's: a blade with a weapon, a swish with none
    assert.deepEqual(r.clips.attack.sounds.map((c) => c.sound), weapon === 'none' ? ['whoosh'] : ['sword-slash'], weapon);
    assert.equal(r.clips.walk.sounds.length, 2, `${weapon}: footsteps`);
  }
});

/** The share of pixels that differ between two sprites over every frame of a clip, at their own settings. */
function share(a, pa, b, pb, clip, as = clip) {
  let diff = 0, drawn = 0;
  for (let f = 0; f < a.clips[clip].frames; f++) {
    const g = renderFrame(a, clip, f, pa), h = renderFrame(b, as, f, pb);
    for (let i = 0; i < g.data.length; i++) { if (g.data[i] || h.data[i]) drawn++; if (g.data[i] !== h.data[i]) diff++; }
  }
  return drawn ? diff / drawn : 0;
}

test('the Hero with no weapon beside the code knight with none: attack, walk and run close, closer than the armed clips', () => {
  const r = makeDataSprite(HERO, { pieces: store() });
  assert.ok(r.ok, r.errors.join('; '));
  const s = r.sprite;
  const none = { ...defaultParams(s), weapon: 'none' }, code = { ...defaultParams(knight), weapon: 'none' };
  // the Hero as it was before B4x: no weapon but the armed clips (a swing of an empty hand)
  const armed = makeDataSprite({ ...HERO, clips: { ...HERO.clips, walk: { ...HERO.clips.walk, from: 'walk' }, run: { ...HERO.clips.run, from: 'run' }, attack: { ...HERO.clips.attack, from: 'attack' } } }, { pieces: store() });
  assert.ok(armed.ok, armed.errors.join('; '));
  for (const clip of ['attack', 'walk', 'run']) {
    const now = share(knight, code, s, none, clip), before = share(knight, code, armed.sprite, none, clip);
    assert.ok(now <= 0.15, `${clip}: ${(now * 100).toFixed(1)} % of pixels differ from the code knight with no weapon`);
    assert.ok(now < before, `${clip}: ${(now * 100).toFixed(1)} % picked, ${(before * 100).toFixed(1)} % with the armed clip`);
  }
});

test('the worked example of docs/data-sprites.md 2.2 names only what pieces/ holds: it validates, draws and picks by Weapon', () => {
  const doc = read('docs/data-sprites.md');
  const at = doc.indexOf('### 2.2');
  const open = doc.indexOf('```json\n', at), close = doc.indexOf('\n```', open + 8);
  assert.ok(at > 0 && open > at && close > open && open < doc.indexOf('### 2.3'), 'the example is in 2.2');
  const def = JSON.parse(doc.slice(open + 8, close));
  const v = validateSprite(def, { pieces: pieceRegistry(store()) });
  assert.ok(v.ok, v.errors.join('; '));
  assert.deepEqual(v.warnings, []);
  assert.deepEqual(v.clips, ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'die']);
  const m = makeDataSprite(def, { pieces: store() });
  assert.ok(m.ok, m.errors.join('; '));
  for (const [weapon, want] of [['sword', ['walk', 'run', 'attack']], ['none', ['walk-unarmed', 'run-unarmed', 'punch']]]) {
    const r = resolveSprite(def, { weapon }, { pieces: store() });
    assert.deepEqual(['walk', 'run', 'attack'].map((c) => r.clips[c].from), want, weapon);
  }
});

test('the bone soldier, the spear goblin and the wizard can name thrust: each sketch validates on @7 and keeps its code clips', async () => {
  const thrust = BASE7.body.clips.thrust;
  for (const id of SKETCHES) {
    const def = sketch(id);
    const code = await codeSprite(id);
    const v = validateSprite(def, { pieces: pieceRegistry(store()) });
    assert.ok(v.ok, `${id}: ${v.errors.join('; ')}`);
    assert.deepEqual(v.warnings, [], id);
    const extra = id === 'wizard' ? ['attack'] : [];   // the wizard sketch adds a staff jab the code wizard never had
    assert.deepEqual(v.clips, [...Object.keys(code.clips), ...extra], `${id}: the code sprite's clips`);
    const settings = id === 'wizard' ? {} : { weapon: 'spear' };
    const r = resolveSprite(def, settings, { pieces: store() });
    assert.ok(r.ok, `${id}: ${r.errors.join('; ')}`);
    assert.equal(r.clips.attack.from, 'thrust', id);
    assert.deepEqual(r.clips.attack.keys, thrust.keys, `${id}: attack plays the base's thrust`);
    const m = makeDataSprite(def, { pieces: store() });
    assert.ok(m.ok, `${id}: ${m.errors.join('; ')}`);
    const p = { ...defaultParams(m.sprite), ...settings };
    for (let f = 0; f < m.sprite.clips.attack.frames; f++) assert.ok(renderFrame(m.sprite, 'attack', f, p).data.some(Boolean), `${id} attack ${f}`);
  }
  // where the code picks another attack, so does the sketch
  const pick = (id, weapon) => resolveSprite(sketch(id), { weapon }, { pieces: store() }).clips.attack.from;
  assert.deepEqual(['sword', 'axe', 'spear', 'none'].map((w) => pick('bone-soldier', w)), ['attack', 'attack', 'thrust', 'punch']);
  assert.deepEqual(['spear', 'club', 'dagger', 'none'].map((w) => pick('spear-goblin', w)), ['thrust', 'attack', 'thrust', 'punch']);
});
