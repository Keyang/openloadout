// engine/draw-list.js, part 3: painting order and bodies (docs/data-sprites.md 4.1 step 6; docs/studio.md section 4):
// shapes with the same group and z are ONE blob (one shade band, no seams), the rest go in z order with list order
// breaking ties, an operation acts on what is drawn before it in the list, and `cut` takes a shape out of a body.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn, capsuleIn, rectIn } from '../../engine/surface.js';
import { ramp, INK, col } from '../../engine/color.js';
import * as D from '../../engine/draw-list.js';

const SKIN = '#4f9d57', CLOTH = '#3a6ea5';
const palette = { skin: SKIN, cloth: CLOTH };
const draw = (list, opt = {}) => D.renderList(48, 48, list, { palette, ...opt }).g;
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const fresh = () => new Surface(48, 48);

const head = { kind: 'ellipse', at: [20, 16], r: [7, 6], paint: 'skin', group: 'body', z: 10 };
const torso = { kind: 'capsule', from: [20, 22], to: [24, 36], r: [6, 5], paint: 'skin', group: 'body', z: 10 };

test('draw-list groups: same group and z paint as one g.blob (one shade band round the whole body)', () => {
  const want = fresh().blob([ellipseIn(20, 16, 7, 6), capsuleIn(20, 22, 24, 36, 6, 5)], ramp(SKIN));
  assert.ok(same(draw([head, torso]), want));
  const seams = fresh().ellipse(20, 16, 7, 6, ramp(SKIN)).capsule(20, 22, 24, 36, 6, 5, ramp(SKIN));
  assert.ok(!same(want, seams), 'the joined body differs from two shapes drawn one after the other (the seam band)');
  assert.ok(same(draw([{ ...head, group: undefined }, { ...torso, group: undefined }]), seams), 'without a group they are two shapes');
  assert.ok(same(draw([head, { ...torso, z: 11 }]), seams), 'another z is another body');
  assert.ok(same(draw([head, { ...torso, group: 'other' }]), seams), 'another group is another body');
});

test('draw-list groups: the body takes its first member\'s paint, shade and light', () => {
  const want = fresh().blob([ellipseIn(20, 16, 7, 6), capsuleIn(20, 22, 24, 36, 6, 5)], ramp(SKIN), { shade: 2, light: 1 });
  assert.ok(same(draw([{ ...head, shade: 2, light: 1 }, { ...torso, paint: 'cloth' }]), want));
});

test('draw-list order: higher z paints over lower whatever the list order; equal z keeps list order', () => {
  const a = { kind: 'rect', at: [10, 10], size: [12, 12], paint: 'skin', z: 5 };
  const b = { kind: 'rect', at: [16, 16], size: [12, 12], paint: 'cloth', z: 1 };
  const want = fresh().rect(16, 16, 12, 12, ramp(CLOTH)).rect(10, 10, 12, 12, ramp(SKIN));
  assert.ok(same(draw([a, b]), want));
  assert.ok(same(draw([b, a]), want));
  const flat = fresh().rect(10, 10, 12, 12, ramp(SKIN)).rect(16, 16, 12, 12, ramp(CLOTH));
  assert.ok(same(draw([{ ...a, z: 0 }, { ...b, z: 0 }]), flat), 'ties: list order');
  assert.ok(same(draw([{ ...a, z: undefined }, { ...b, z: undefined }]), flat), 'z defaults to 0');
});

test('draw-list order: an operation acts on what comes before it in the list; z sorts only between operations', () => {
  const a = { kind: 'rect', at: [6, 6], size: [10, 10], paint: 'skin', z: 50 };
  const b = { kind: 'rect', at: [26, 26], size: [10, 10], paint: 'cloth', z: 0 };
  const want = fresh().rect(6, 6, 10, 10, ramp(SKIN)).outline(INK).rect(26, 26, 10, 10, ramp(CLOTH));
  assert.ok(same(draw([a, { kind: 'outline' }, b]), want), 'b (z 0, after the outline) has no ink even though a has z 50');
});

test('draw-list cut: `from` a group takes the shape out of that body (blob minus), so the shade follows the cut', () => {
  const bite = { kind: 'ellipse', at: [27, 14], r: [4, 4] };
  const want = fresh().blob([ellipseIn(20, 16, 7, 6), capsuleIn(20, 22, 24, 36, 6, 5)], ramp(SKIN), { minus: [ellipseIn(27, 14, 4, 4)] });
  assert.ok(same(draw([head, torso, { kind: 'cut', shape: bite, from: 'body' }]), want));
  assert.ok(same(draw([{ kind: 'cut', shape: bite, from: 'body' }, head, torso]), want), 'wherever the cut is listed');
  const notBody = draw([head, torso, { kind: 'rect', at: [24, 8], size: [8, 4], paint: 'cloth', z: 20 }, { kind: 'cut', shape: bite, from: 'body' }]);
  assert.equal(notBody.get(26, 9), col(ramp(CLOTH).base), 'other shapes are not cut');
});

test('draw-list cut: with no `from` it clears every pixel inside the shape drawn so far', () => {
  const box = { kind: 'rect', at: [4, 4], size: [30, 30], paint: 'cloth' };
  const want = fresh().rect(4, 4, 30, 30, ramp(CLOTH));
  const hole = rectIn(10, 10, 6, 6);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (hole(x + 0.5, y + 0.5)) want.data[y * 48 + x] = 0;
  assert.ok(same(draw([box, { kind: 'cut', shape: { kind: 'rect', at: [10, 10], size: [6, 6] } }]), want));
  const later = draw([box, { kind: 'cut', shape: { kind: 'rect', at: [10, 10], size: [6, 6] } }, { kind: 'rect', at: [12, 12], size: [2, 2], paint: 'skin' }]);
  assert.notEqual(later.get(12, 12), 0, 'shapes after the cut are not cut');
});

test('draw-list cut: a cut `from` a primitive id cuts that shape alone', () => {
  const coin = { id: 'coin', kind: 'ellipse', at: [24, 24], r: [10, 10], paint: 'skin' };
  const want = fresh().blob([ellipseIn(24, 24, 10, 10)], ramp(SKIN), { minus: [rectIn(22, 14, 4, 20)] });
  assert.ok(same(draw([coin, { kind: 'cut', from: 'coin', shape: { kind: 'rect', at: [22, 14], size: [4, 20] } }]), want));
});

test('draw-list: hidden primitives are not drawn', () => {
  assert.ok(draw([{ ...head, hidden: true }]).data.every((v) => v === 0));
});
