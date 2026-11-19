// engine/data-sprite.js, version 2 (build item B6; docs/data-sprites.md 2.2 and 4.1): a `rig` body turned into an
// ordinary sprite. The bones are solved by rigs/bones.js (solveRig, rigPoints), every shape is placed on its bone and
// drawn by engine/draw-list.js. Held to: every studio template written as version 2 draws byte for byte as version 1
// does (the v1 shape kinds on bones keep their meaning), and the knight fixture (a base piece, stamps, pieces used on
// bones, a part, sounds with conditions, a swap frame edit, attach points) draws with the test pieces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataSprite, validateDataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { renderFrame, renderSheet, frameSockets, defaultParams, cleanParams, cueInEffect, partRemoved } from '../../engine/sprite.js';
import { studioTemplate, STUDIO_TEMPLATE_IDS } from '../../rigs/studio-templates.js';
import { checkSprite } from '../../quality/sprite.js';
import { hexToRgb } from '../../engine/color.js';
import { loadV2, testPieces, testRegistry } from '../fixtures/resolve/helpers.mjs';

const OPTS = { pieces: testPieces(), generators: testRegistry() };
const knight = () => dataSprite(loadV2('knight'), OPTS);
const packed = (hex) => { const [r, g, b] = hexToRgb(hex); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; };
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const count = (g, hex) => g.data.filter((v) => v === packed(hex)).length;
const solid = (g) => g.data.filter((v) => v >>> 24).length;

/** A version 1 studio definition written as version 2: the rig's colours become the palette, nothing else changes. */
function asV2(v1) {
  const rig = { ...v1.body.rig };
  const colours = rig.colours;
  delete rig.colours;
  const out = { ...v1, version: 2, palette: colours.map((c) => ({ ...c, default: v1.colours?.[c.id] ?? c.default })), body: { rig } };
  delete out.colours;
  return out;
}

test('every studio template written as version 2 draws every frame byte for byte as version 1', () => {
  let frames = 0;
  for (const id of STUDIO_TEMPLATE_IDS) {
    const v1 = validateDataSprite(studioTemplate(id)).value;
    const one = dataSprite(v1), two = dataSprite(asV2(v1));
    assert.deepEqual(Object.keys(two.params).sort(), Object.keys(one.params).sort(), `${id}: the same controls`);
    assert.deepEqual(Object.keys(two.clips), Object.keys(one.clips), `${id}: the same clips`);
    const looks = [defaultParams(one)];
    const low = {}, high = {};
    for (const [k, d] of Object.entries(one.params)) if (d.kind === 'range') { low[k] = d.min; high[k] = d.max; }
    looks.push({ ...looks[0], ...low }, { ...looks[0], ...high });
    for (const p of looks) for (const [clip, c] of Object.entries(one.clips)) for (let f = 0; f < c.frames; f++) {
      assert.ok(same(renderFrame(two, clip, f, p), renderFrame(one, clip, f, p)), `${id} ${clip} frame ${f} at ${JSON.stringify(p)}`);
      assert.deepEqual(frameSockets(two, clip, f, p), frameSockets(one, clip, f, p), `${id} ${clip} frame ${f}: sockets`);
      frames++;
    }
  }
  assert.ok(frames > 300, `${frames} frames compared`);
});

test('knight: the base\'s clips, the asset\'s sounds with their conditions, a Contract 3 part, the controls', () => {
  const s = knight();
  assert.equal(s.kind, 'Character');
  assert.deepEqual(Object.keys(s.clips).sort(), ['attack', 'hurt', 'idle', 'swing', 'walk']);
  assert.equal(s.clips.idle.frames, 8);
  assert.equal(s.clips.attack.loop, false);
  const slash = s.sounds.attack[0];
  assert.equal(slash.sound, 'sword-slash');
  const p = defaultParams(s);
  assert.equal(cueInEffect(s, slash, p), true);
  assert.equal(cueInEffect(s, slash, { ...p, weapon: 'none' }), false, 'the cue keeps its condition');
  assert.deepEqual(s.sounds.walk.map((c) => c.sound), ['footstep-grass', 'footstep-grass']);
  assert.deepEqual(s.parts.weapon.params, ['weapon', 'swordLength']);
  assert.equal(s.parts.weapon.socket, 'hand');
  assert.equal(partRemoved(s, 'weapon', { ...p, weapon: 'none' }), true);
  assert.equal(s.params.headgear.kind, 'choice');
  assert.equal(s.params.headgear.was['plumed helmet'], 'helmet');
  assert.equal(cleanParams(s, { headgear: 'plumed helmet' }).headgear, 'helmet', 'an old option name still opens');
  assert.equal(s.params.trousers, undefined, 'a derived slot has no control');
  assert.equal(s.params.eye, undefined, 'a detail slot has no control');
  assert.equal(s.params.skin.material, 'skin');
});

test('knight draws every frame of every clip, deterministically, with its pieces and stamps', () => {
  const s = knight();
  const p = defaultParams(s);
  for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    const g = renderFrame(s, clip, f, p);
    assert.ok(solid(g) > 80, `${clip} ${f} is drawn`);
    assert.ok(same(g, renderFrame(s, clip, f, p)), `${clip} ${f} again`);
  }
  const g = renderFrame(s, 'idle', 0, p);
  assert.ok(count(g, '#231b33') >= 2, 'the eye stamp, two pixels of its detail colour, never turned');
  assert.ok(count(g, '#3a6ea5') > 0, 'the tunic');
  const sheet = renderSheet(s, p);
  assert.equal(sheet.w, 64 * 8);
});

test('knight settings: headgear swaps the helmet for hair, no weapon takes the sword away, height scales bones', () => {
  const s = knight();
  const p = defaultParams(s);
  const at = (q) => renderFrame(s, 'idle', 0, { ...p, ...q });
  const helmet = dataFrameList(s, 'idle', 0, p).list, bare = dataFrameList(s, 'idle', 0, { ...p, headgear: 'none', hair: 'long' }).list;
  assert.ok(helmet.some((x) => x.id === 'helmet') && !helmet.some((x) => x.id === 'hair'));
  assert.ok(bare.some((x) => x.id === 'hair') && !bare.some((x) => x.id === 'helmet'));
  assert.ok(!same(at({ headgear: 'none' }), at({})));
  assert.ok(!dataFrameList(s, 'idle', 0, { ...p, weapon: 'none' }).list.some((x) => x.id === 'sword'));
  assert.ok(!same(at({ weapon: 'none' }), at({})));
  assert.ok(!same(at({ height: 1 }), at({ height: 0 })));
  assert.equal(count(at({ outfit: '#c9423a' }), '#c9423a'), count(at({}), '#3a6ea5'), 'the tunic follows its colour');
});

test('knight frame edits and keys: the blink swap on attack frame 3, the flash on hurt frame 0', () => {
  const s = knight();
  const p = defaultParams(s);
  const eye = (clip, f) => dataFrameList(s, clip, f, p).list.find((x) => x.id === 'eye');
  assert.equal(eye('attack', 3).variant, 'blink');
  assert.equal(eye('attack', 2).variant, undefined);
  const [x, y] = eye('attack', 2).at.map(Math.round);
  assert.deepEqual(eye('attack', 3).at.map(Math.round), [x, y], 'the head holds still over the blink');
  assert.equal(renderFrame(s, 'attack', 2, p).get(x, y), packed('#231b33'), 'the eye\'s top pixel, open');
  assert.notEqual(renderFrame(s, 'attack', 3, p).get(x, y), packed('#231b33'), 'and gone in the blink');
  assert.ok(count(renderFrame(s, 'hurt', 0, p), '#ffffff') > 40, 'white flash');
  assert.equal(count(renderFrame(s, 'hurt', 1, p), '#ffffff'), 0);
});

test('knight sockets: the base\'s hand point on the solved bones, every frame', () => {
  const s = knight();
  const p = defaultParams(s);
  const a = frameSockets(s, 'swing', 0, p).hand, b = frameSockets(s, 'swing', 7, p).hand;
  for (const v of [a.x, a.y, a.angle, b.x, b.y, b.angle]) assert.ok(Number.isFinite(v));
  assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1, 'the hand moves with the swing');
});

test('knight goes through the quality bar like any sprite', () => {
  const r = checkSprite(knight());
  assert.ok(r && typeof r === 'object');
  assert.ok(Array.isArray(r.errors));
  assert.ok(!r.errors.some((e) => /threw|crash|cannot draw/i.test(e)), r.errors.join('\n'));
});

test('a generator that fails in a rig frame makes render throw (no silent gap), naming the sprite, clip and frame', async () => {
  const { createRegistry } = await import('../../engine/gen/registry.js');
  const { count: countOf, paint } = await import('../../engine/gen/args.js');
  const reg = createRegistry();
  reg.defineGenerator({ id: 'glint', v: 1, family: 'shine', about: 'Test glint that cannot draw frame 1.', args: { every: countOf(2, 64), paint: paint() }, cost: () => 1,
    run: (a, ctx) => { if (ctx.frame === 1) throw new Error('no glint on frame 1'); return [{ kind: 'dot', at: [0, 0], paint: a.paint }]; } });
  const def = loadV2('knight');
  def.body.rig.shapes.push({ id: 'shine', gen: 'glint', v: 1, on: 'head', every: 8, paint: 'metal' });
  const s = dataSprite(def, { pieces: testPieces(), generators: reg });
  const p = defaultParams(s);
  assert.doesNotThrow(() => renderFrame(s, 'idle', 0, p));
  assert.throws(() => renderFrame(s, 'idle', 1, p), /knight, clip idle frame 1:.*no glint on frame 1/);
  assert.throws(() => dataFrameList(s, 'idle', 1, p), /knight, clip idle frame 1/);
});

test('clip names are looked up as the sprite\'s own: toString, constructor and __proto__ are no clips', () => {
  const s = knight();
  const p = defaultParams(s);
  for (const clip of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.throws(() => s.render({}, { clip, t: 0, frame: 0, p }), new RegExp(`no clip "${clip}"`), clip);
    assert.throws(() => dataFrameList(s, clip, 0, p), /no clip/, clip);
    assert.deepEqual(s.sockets(clip, 0, p), {}, clip);
  }
});
