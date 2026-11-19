// The settings resolver (engine/resolve.js, B4) on every version 2 fixture (tests/fixtures/v2): each resolves at its
// defaults, every slider low and high, every option and every on/off flipped, with nothing left to resolve (no
// binding, no condition on a control), deterministically, as frozen plain data; and what each body resolves to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSprite, settingTable } from '../../engine/resolve.js';
import { V2_FIXTURES, loadV2, testPieces, settingsOf, leftovers } from '../fixtures/resolve/helpers.mjs';
import { stubRegistry } from '../fixtures/v2/registry.mjs';
import { lerp } from '../../engine/motion.js';

const store = testPieces();
const opts = { pieces: store, generators: stubRegistry() };
const R = (name, settings = {}) => {
  const r = resolveSprite(loadV2(name), settings, opts);
  assert.equal(r.ok, true, `${name}: ${r.errors.join('; ')}`);
  return r;
};
const ids = (list) => list.map((s) => s.id);

test('every fixture resolves at every setting worth trying, leaving nothing unresolved', () => {
  assert.ok(V2_FIXTURES.length >= 6, 'the fixtures are found');
  for (const name of V2_FIXTURES) {
    const def = loadV2(name);
    const keys = Object.keys(settingTable(def));
    for (const s of settingsOf(def)) {
      const r = resolveSprite(def, s, opts);
      assert.equal(r.ok, true, `${name} at ${JSON.stringify(s)}: ${r.errors.join('; ')}`);
      assert.deepEqual(leftovers(r.body, keys), [], `${name} at ${JSON.stringify(s)}`);
      assert.deepEqual(leftovers(r.clips, keys), [], `${name} clips at ${JSON.stringify(s)}`);
      assert.ok(Object.isFrozen(r) && Object.isFrozen(r.body) && Object.isFrozen(r.palette), 'frozen, so caches can share it');
      assert.equal(JSON.stringify(r), JSON.stringify(resolveSprite(def, s, opts)), 'deterministic');
      assert.deepEqual(JSON.parse(JSON.stringify(r.body)), r.body, 'plain data');
    }
  }
});

test('a definition that fails the check is refused with its errors, and nothing is resolved', () => {
  const bad = { ...loadV2('coin'), controls: [{ key: 'size', kind: 'range', label: 'Size', default: 5 }] };
  const r = resolveSprite(bad, {}, opts);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length > 0);
  assert.equal(r.body, null);
});

test('coin (pictures): tables to numbers, a shine that is off is gone, motion and clips', () => {
  const mid = R('coin');
  assert.equal(mid.body.kind, 'pictures');
  const face = mid.body.pictures.draw.find((s) => s.id === 'face');
  assert.deepEqual(face.r, [6.5, 6.5]);
  assert.deepEqual(R('coin', { size: 0 }).body.pictures.draw.find((s) => s.id === 'face').r, [5, 5]);
  assert.deepEqual(R('coin', { size: 1 }).body.pictures.draw.find((s) => s.id === 'face').r, [8, 8]);
  const glint = (r) => r.body.pictures.draw.find((s) => s.gen === 'glint');
  assert.ok(glint(mid));
  assert.equal(glint(mid).when, undefined, 'a condition that holds is gone');
  assert.equal(glint(R('coin', { shine: false })), undefined, 'a condition that fails takes the item away');
  assert.equal(mid.body.pictures.motion[0].height, 1);
  assert.deepEqual(mid.body.pictures.motion[1].clip, ['spin'], 'a clip list is kept for the frame to decide');
  assert.equal(mid.clips.spin.frames, 8);
  assert.equal(mid.clips.spin.fpsBase, 10);
  assert.equal(mid.clips.spin.fps, 10 * lerp(0.65, 1.45, 0.5));
  assert.equal(R('coin', { speed: 1 }).clips.spin.fps, 10 * lerp(0.65, 1.45, 1));
  assert.equal(mid.clips.collect.loop, false);
  assert.deepEqual(mid.clips.collect.sounds, [{ sound: 'coin-pickup', frame: 0 }]);
  assert.equal(mid.preview, 'spin');
});

test('knight (rig): the base is merged, pieces drawn where their conditions hold, parts off, scales, clips from the base', () => {
  const r = R('knight');
  const rig = r.body.rig;
  assert.equal(r.body.kind, 'rig');
  assert.equal(rig.extends, undefined, 'the base is merged in');
  assert.deepEqual(r.base, 'base:person-side@1');
  assert.ok(['root', 'spine', 'head', 'handF'].every((b) => rig.bones.some((x) => x.id === b)), 'the base\'s bones');
  const shapes = ids(rig.shapes);
  for (const s of ['torso', 'skull', 'legF', 'legB', 'eye', 'buckle', 'helmet', 'sword']) assert.ok(shapes.includes(s), `${s} is drawn`);
  assert.ok(!shapes.includes('hair'), 'no hair under the helmet');
  const helmet = rig.shapes.filter((s) => s.id === 'helmet');
  assert.equal(helmet.length, 2, 'every item of the helmet piece, under the use\'s id');
  assert.ok(helmet.every((s) => s.on === 'head'));
  const plume = helmet.find((s) => s.kind === 'stamp');
  assert.deepEqual(plume.key, { a: 'outfit', b: 'outfit.dark' }, 'the piece\'s slots painted as the use maps them');
  const edge = rig.shapes.find((s) => s.id === 'sword' && s.kind === 'line');
  assert.deepEqual(edge.to, [14, 0], 'swordLength 0.5 -> length 14 -> the edge reaches 14');
  assert.equal(edge.on, 'handF');
  assert.equal(edge.paint, 'metal');
  assert.equal(edge.part, 'weapon', 'a shape listed by a part carries the part\'s name');
  assert.deepEqual(rig.points.find((p) => p.id === 'hand').at, [5, 0], 'points from the base');
  // hair under no helmet, long
  const bare = R('knight', { headgear: 'none', hair: 'long', hairLength: 0.4 }).body.rig.shapes;
  assert.ok(!ids(bare).includes('helmet'));
  const fall = bare.find((s) => s.id === 'hair' && s.kind === 'rect');
  assert.deepEqual(fall.size, [2, 5], 'hairLength 0.4 -> length 4 -> the fall is 5 tall');
  assert.equal(fall.paint, 'hairTone.dark');
  assert.equal(bare.filter((s) => s.id === 'hair' && s.kind === 'stamp').length, 0, 'the bun is another style');
  // the weapon part off
  const none = R('knight', { weapon: 'none' });
  assert.deepEqual(none.partsOff, ['weapon']);
  assert.ok(!ids(none.body.rig.shapes).includes('sword'));
  // scales
  assert.deepEqual(r.scales.bones, { spine: 1, thighF: 1, thighB: 1, shinF: 1, shinB: 1 });
  assert.equal(R('knight', { height: 1 }).scales.bones.spine, 1.15);
  assert.equal(R('knight', { height: 0 }).scales.bones.shinB, 0.85);
});

test('knight clips: inherited from the base, overridden by the asset, sounds by their conditions', () => {
  const r = R('knight');
  assert.deepEqual(Object.keys(r.clips).sort(), ['attack', 'hurt', 'idle', 'swing', 'walk']);
  assert.equal(r.clips.idle.frames, 8);
  assert.equal(r.clips.idle.fpsBase, 6);
  assert.equal(r.clips.attack.from, 'swing');
  assert.equal(r.clips.attack.loop, false);
  assert.equal(r.clips.attack.keys.length, 2, 'keys from the base clip');
  assert.deepEqual(r.clips.attack.frameEdits, { 3: { swap: { eye: 'blink' } } });
  assert.deepEqual(r.clips.attack.sounds, [{ sound: 'sword-slash', frame: 3 }]);
  assert.deepEqual(R('knight', { weapon: 'none' }).clips.attack.sounds, [], 'a cue whose condition fails is left out');
  assert.deepEqual(r.clips.walk.sounds.map((s) => s.sound), ['footstep-grass', 'footstep-grass'], 'the asset\'s cues replace the base\'s');
  assert.deepEqual(r.clips.hurt.frameEdits, { 0: { flash: true } });
  assert.equal(r.clips.attack.label, 'Attack');
});

test('hit-spark (emitters): counts rounded to whole numbers, spreads as tables give them', () => {
  const at = (s) => R('hit-spark', s).body.emitters.find((e) => e.id === 'sparks');
  assert.equal(at({}).count, 8);
  assert.equal(at({ amount: 0 }).count, 4);
  assert.equal(at({ amount: 1 }).count, 12);
  assert.equal(at({ amount: 0.3 }).count, 6, '6.4 rounds to 6');
  assert.equal(at({}).dist, 10.5);
  assert.equal(R('hit-spark').clips.hit.fps, 18, 'no speed control: the clip\'s own fps');
});

test('ui button (panel): picks and bare bindings, the skin piece resolved with the sprite\'s paints, the states as clips', () => {
  const r = R('ui-button');
  const piece = r.body.panel.piece;
  assert.deepEqual([piece.style, piece.corner, piece.border, piece.nails, piece.grain], ['framed', 2.5, 2, true, 0.5]);
  assert.equal(R('ui-button', { style: 'carved', nails: false }).body.panel.piece.style, 'carved');
  assert.equal(R('ui-button', { nails: false }).body.panel.piece.nails, false);
  const skin = r.body.panel.skin;
  assert.equal(skin.ref, 'skin:wood@1');
  assert.deepEqual(skin.body.face, { paint: 'face', grain: 'face.dark' });
  assert.deepEqual(skin.body.rim, { paint: 'frame', light: 'frame.light' });
  assert.deepEqual(Object.keys(r.clips), ['normal', 'hover', 'pressed', 'disabled']);
  assert.equal(r.clips.normal.frames, 1);
  assert.deepEqual(r.clips.pressed.sounds, [{ sound: 'ui-click', preset: 'Soft tap', frame: 0, volume: 0.6 }]);
  assert.deepEqual(r.slice, { left: 6, top: 6, right: 6, bottom: 6 });
  assert.equal(r.textArea.colour, 'frame.dark');
});

test('bg-forest (layers): every generator argument a number, bindings inside colour rules too', () => {
  const r = R('bg-forest');
  const far = r.body.layers.find((l) => l.name === 'far');
  assert.equal(far.draw[0].paint.time, 0.5, 'a bare binding inside a colour rule');
  assert.equal(far.draw[1].count, 5);
  assert.equal(far.draw[2].height, 64);
  assert.ok(Math.abs(far.draw[3].height - 4.2) < 1e-9);
  assert.equal(R('bg-forest', { clouds: 1, haze: 1 }).body.layers[0].draw[1].count, 8);
  const mid = r.body.layers.find((l) => l.name === 'mid');
  assert.equal(mid.draw[1].clumps, 8);
  assert.deepEqual(Object.keys(r.clips), ['far', 'mid']);
});

test('tiles-forest (tiles): the material as data with its bindings resolved; the placed piece kept for the frame', () => {
  const r = R('tiles-forest');
  const mat = r.body.tiles.groups[0].material;
  assert.equal(mat.edges.top.depth, 7);
  assert.equal(mat.edges.top.inset.amount, 1);
  const scatter = mat.fill.versions[0][0];
  assert.equal(scatter.count, 2, 'texture 0.5 -> 1.5 -> rounds to 2');
  assert.deepEqual(scatter.place, { use: 'stamp:clod', v: 1, paint: { a: 'soil.dark' } }, 'placed by the generator, drawn per frame');
  assert.equal(R('tiles-forest', { edge: 9, bumps: 3 }).body.tiles.groups[0].material.edges.top.depth, 9);
  assert.equal(r.clips['grass-top'].label, 'Grass: top edge');
});
