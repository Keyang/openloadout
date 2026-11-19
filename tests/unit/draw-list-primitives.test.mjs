// engine/draw-list.js, part 1: every shape primitive equals the Surface call it stands for (docs/data-sprites.md
// sections 2.7 and 4.1 step 6, build-plan row B3). Primitives here are in frame coordinates; paints are palette slot
// refs, resolved by the renderer to the slot's three-tone ramp (or one tone of it, or a flat colour).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn } from '../../engine/surface.js';
import { placedIn } from '../../engine/shapes.js';
import { ramp, farRamp, INK } from '../../engine/color.js';
import * as D from '../../engine/draw-list.js';

const RAD = Math.PI / 180;
const WOOD = '#8a5a2b', LEAF = '#4f9d57', EYE = '#f0ead8';
const palette = { wood: WOOD, leaf: LEAF, eye: { hex: EYE, detail: true } };
const W = 48, H = 48;
const draw = (list, opt = {}) => D.renderList(W, H, list, { palette, ...opt }).g;
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const fresh = () => new Surface(W, H);

test('draw-list: rect is g.rect, shaded with the slot ramp; a hex paint is flat', () => {
  assert.ok(same(draw([{ kind: 'rect', at: [3, 4], size: [17, 9], paint: 'wood' }]), fresh().rect(3, 4, 17, 9, ramp(WOOD))));
  assert.ok(same(draw([{ kind: 'rect', at: [3, 4], size: [17, 9], paint: 'wood', shade: 2, light: 1 }]), fresh().rect(3, 4, 17, 9, ramp(WOOD), { shade: 2, light: 1 })));
  assert.ok(same(draw([{ kind: 'rect', at: [3, 4], size: [7, 5], paint: '#336699' }]), fresh().rect(3, 4, 7, 5, '#336699')));
  assert.ok(same(draw([{ kind: 'rect', at: [3.5, 4.2], size: [7.4, 5.1], paint: 'wood' }]), fresh().rect(3.5, 4.2, 7.4, 5.1, ramp(WOOD))), 'fractional rects as the surface samples them');
});

test('draw-list: a slot tone (slot.light, .dark, .deep, .base) paints flat in that tone; slot.far is the far ramp', () => {
  const R = ramp(WOOD);
  for (const [ref, hex] of [['wood.light', R.light], ['wood.dark', R.dark], ['wood.deep', R.deep], ['wood.base', WOOD], ['ink', INK]]) {
    assert.ok(same(draw([{ kind: 'rect', at: [2, 2], size: [9, 9], paint: ref }]), fresh().rect(2, 2, 9, 9, hex)), ref);
  }
  assert.ok(same(draw([{ kind: 'rect', at: [2, 2], size: [19, 9], paint: 'wood.far' }]), fresh().rect(2, 2, 19, 9, farRamp(WOOD))));
  assert.ok(same(draw([{ kind: 'rect', at: [2, 2], size: [19, 9], paint: 'wood', far: true }]), fresh().rect(2, 2, 19, 9, farRamp(WOOD))), 'far: true on a shape');
  assert.ok(same(draw([{ kind: 'rect', at: [2, 2], size: [19, 9], paint: 'eye' }]), fresh().rect(2, 2, 19, 9, EYE)), 'a detail slot paints flat');
  assert.ok(same(draw([{ kind: 'rect', at: [2, 2], size: [19, 9], paint: { base: '#808080', light: '#c0c0c0', dark: '#404040' } }]),
    fresh().rect(2, 2, 19, 9, { base: '#808080', light: '#c0c0c0', dark: '#404040' })), 'a ramp object');
});

test('draw-list: ellipse is g.ellipse; with `turn` it is the ellipse turned by shapes.js placedIn', () => {
  assert.ok(same(draw([{ kind: 'ellipse', at: [20.5, 18], r: [9, 5.5], paint: 'leaf' }]), fresh().ellipse(20.5, 18, 9, 5.5, ramp(LEAF))));
  for (const turn of [30, -70, 135]) {
    const want = fresh().blob([placedIn(ellipseIn(0, 0, 9, 4), 24, 24, { angle: turn * RAD })], ramp(LEAF));
    assert.ok(same(draw([{ kind: 'ellipse', at: [24, 24], r: [9, 4], turn, paint: 'leaf' }]), want), `turn ${turn}`);
  }
  assert.ok(same(draw([{ kind: 'ellipse', at: [24, 24], r: [9, 4], light: 1, paint: 'leaf' }]), fresh().ellipse(24, 24, 9, 4, ramp(LEAF), { light: 1 })));
});

test('draw-list: capsule is g.capsule, limb is g.limb (ends snapped, whole pixels wide), poly is g.poly', () => {
  assert.ok(same(draw([{ kind: 'capsule', from: [8, 10], to: [36.3, 30], r: [4, 2], paint: 'leaf' }]), fresh().capsule(8, 10, 36.3, 30, 4, 2, ramp(LEAF))));
  assert.ok(same(draw([{ kind: 'capsule', from: [8, 10], to: [36, 30], r: 3, paint: 'leaf' }]), fresh().capsule(8, 10, 36, 30, 3, 3, ramp(LEAF))), 'one radius');
  for (const w of [1, 2, 3, 4]) {
    assert.ok(same(draw([{ kind: 'limb', from: [10.3, 9.8], to: [33.6, 37.1], width: w, paint: 'wood' }]), fresh().limb(10.3, 9.8, 33.6, 37.1, w, ramp(WOOD))), `limb ${w}`);
  }
  const pts = [[6, 40], [24, 6], [42, 40], [24, 30]];
  assert.ok(same(draw([{ kind: 'poly', points: pts, paint: 'wood' }]), fresh().poly(pts, ramp(WOOD))));
});

test('draw-list: dot is one pixel (floor) or a 2x2 block (round - 1), flat, never shaded', () => {
  assert.ok(same(draw([{ kind: 'dot', at: [10.7, 12.2], paint: 'leaf' }]), fresh().dot(10.7, 12.2, LEAF)));
  assert.ok(same(draw([{ kind: 'dot', at: [10.7, 12.2], size: 2, paint: 'leaf' }]), fresh().rect(10, 11, 2, 2, LEAF, { shade: 0 })));
});

test('draw-list: line is g.line (1 px, Bresenham); a thicker line is g.limb in one flat colour', () => {
  assert.ok(same(draw([{ kind: 'line', from: [3, 4], to: [40, 22], paint: 'wood.dark' }]), fresh().line(3, 4, 40, 22, ramp(WOOD).dark)));
  assert.ok(same(draw([{ kind: 'line', from: [3, 4], to: [40, 22], paint: 'wood' }]), fresh().line(3, 4, 40, 22, WOOD)), 'a slot paints its base');
  assert.ok(same(draw([{ kind: 'line', from: [3, 4], to: [40, 22], thick: 3, paint: 'wood' }]), fresh().limb(3, 4, 40, 22, 3, WOOD)));
});

test('draw-list: arc is g.arc with degrees in the rig convention; ring is a whole arc', () => {
  assert.ok(same(draw([{ kind: 'arc', at: [24, 24], r: 12, a0: 90, a1: 200, thick: 3, paint: 'leaf' }]), fresh().arc(24, 24, 12, 90 * RAD, 200 * RAD, 3, ramp(LEAF))));
  assert.ok(same(draw([{ kind: 'arc', at: [24, 24], r: 12, a0: 90, a1: 200, paint: 'leaf.light' }]), fresh().arc(24, 24, 12, 90 * RAD, 200 * RAD, 1, ramp(LEAF).light)), 'thick defaults to 1');
  assert.ok(same(draw([{ kind: 'ring', at: [24, 24], r: 15, thick: 2, paint: 'wood' }]), fresh().arc(24, 24, 15, 0, Math.PI * 2, 2, ramp(WOOD))));
  assert.ok(same(draw([{ kind: 'ring', at: [24, 24], r: 15, thick: 4, shade: 1, paint: 'wood' }]), fresh().arc(24, 24, 15, 0, Math.PI * 2, 4, ramp(WOOD), { shade: 1 })), 'a ring may take a shade band');
});

test('draw-list: ops are the surface operations: outline is g.outline once, tint is g.tint, at their place in the list', () => {
  const body = [{ kind: 'ellipse', at: [20, 20], r: [8, 6], paint: 'leaf' }, { kind: 'rect', at: [26, 26], size: [8, 8], paint: 'wood' }];
  const want = fresh().ellipse(20, 20, 8, 6, ramp(LEAF)).rect(26, 26, 8, 8, ramp(WOOD)).outline(INK);
  assert.ok(same(draw([...body, { kind: 'outline' }]), want), 'outline paint defaults to ink');
  assert.ok(same(draw([...body, { kind: 'outline', paint: 'ink' }]), want));
  assert.ok(same(draw([...body, { kind: 'outline', paint: 'wood.deep', sides: 'all' }]),
    fresh().ellipse(20, 20, 8, 6, ramp(LEAF)).rect(26, 26, 8, 8, ramp(WOOD)).outline(ramp(WOOD).deep, { corners: true })), 'sides all takes the corners too');
  assert.ok(same(draw([...body, { kind: 'tint', paint: '#ffffff' }, { kind: 'outline' }]),
    fresh().ellipse(20, 20, 8, 6, ramp(LEAF)).rect(26, 26, 8, 8, ramp(WOOD)).tint('#ffffff').outline(INK)), 'a hit flash before the outline');
});

test('draw-list: an empty list draws nothing; renderList makes a surface of the asked size', () => {
  const { g, drawn, skipped } = D.renderList(32, 16, []);
  assert.equal(g.w, 32); assert.equal(g.h, 16);
  assert.equal(drawn, 0); assert.deepEqual(skipped, []);
  assert.ok(g.data.every((v) => v === 0));
});

test('draw-list: drawList draws onto a given surface and keeps what is there', () => {
  const g = fresh().rect(0, 0, 4, 4, '#ff0000');
  const out = D.drawList(g, [{ kind: 'rect', at: [10, 10], size: [4, 4], paint: 'wood' }], { palette });
  assert.equal(out.drawn, 1);
  assert.ok(same(g, fresh().rect(0, 0, 4, 4, '#ff0000').rect(10, 10, 4, 4, ramp(WOOD))));
});

test('draw-list: the kinds it knows are listed (and nothing else draws)', () => {
  for (const k of ['limb', 'capsule', 'ellipse', 'poly', 'dot', 'rect', 'line', 'arc', 'ring', 'stamp', 'dither', 'bands', 'text']) assert.ok(D.DRAW_LIST_KINDS.includes(k), k);
  for (const k of ['outline', 'tint', 'cut']) assert.ok(D.DRAW_LIST_OPS.includes(k), k);
});
