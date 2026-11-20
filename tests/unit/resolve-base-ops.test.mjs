// The settings resolver (engine/resolve.js, B4) merging a base piece (`extends`): a base's operations (cut, outline,
// tint; engine/draw-list.js DRAW_LIST_OPS) come after everything the sprite adds, so a base can carry its own ground
// cut and every sprite on it gets it without writing it (build item B16a2: base:person-side's ground cut). An
// operation splits engine/draw-list.js's z order (everything after it paints over everything before it), so a base's
// cut placed among its own shapes would put every part a sprite adds over the whole body; placed last it applies to
// the base and the parts alike. A sprite may still replace the operation by id (it stays last) or drop it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSprite } from '../../engine/resolve.js';
import { createPieceStore } from '../../engine/pieces.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';

const GROUND = 28;
const BASE = {
  format: 'loadout-piece', version: 1, id: 'base:test-post', v: 1, name: 'Post', about: 'A post standing on the ground, for tests.',
  slots: [{ id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }],
  body: {
    rig: {
      size: [32, 32],
      bones: [{ id: 'post', parent: null, at: [16, GROUND], angle: 180, length: 10 }],
      nodes: [{ id: 'ground', parent: 'post', from: 0, angle: 0 }],
      shapes: [
        { id: 'stake', kind: 'rect', on: 'post', at: [0, -1], size: [2, 14], paint: 'wood', z: 10 },
        { id: 'groundCut', kind: 'cut', on: 'ground', shape: { kind: 'poly', points: [[0, -32], [0, 32], [-8, 32], [-8, -32]] } },
        { id: 'cap', kind: 'rect', on: 'post', at: [9, -1], size: [3, 2], paint: 'wood.dark', z: 12 },
      ],
    },
    clips: { idle: { frames: 1, fps: 1, keys: [{ t: 0 }] } },
  },
};
const store = () => { const s = createPieceStore(); s.add(JSON.stringify(BASE), 'base-test-post.v1.json'); return s; };
const sprite = (shapes, ext = {}) => ({
  format: 'loadout-sprite', version: 2, id: 'post-test', name: 'Post', blurb: 'A post for tests.', size: [32, 32], pivot: [16, GROUND],
  meta: { type: 'prop', role: 'world/prop', view: 'side', themes: ['neutral'], gameTypes: ['platformer'], words: ['post'], license: 'draft' },
  palette: [{ id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }, { id: 'flag', label: 'Flag', default: '#c9423a', material: 'cloth' }],
  body: { rig: { extends: { use: 'base:test-post', v: 1, ...ext }, shapes } },
});
// a flag hanging from the post's foot down past the ground: only the base's cut keeps it above the ground
const FLAG = { id: 'flag', kind: 'rect', on: 'post', at: [2, -1], size: [3, 8], paint: 'flag', z: 5 };
const R = (def) => resolveSprite(def, {}, { pieces: store() });
const ids = (r) => r.body.rig.shapes.map((s) => s.id);

test('a base\'s operations come after the sprite\'s own shapes; the base\'s other shapes keep their order', () => {
  const r = R(sprite([FLAG]));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(ids(r), ['stake', 'cap', 'flag', 'groundCut']);
});

test('a sprite replacing the base\'s operation by id keeps it last; dropping it removes it; the sprite\'s own operations stay where it wrote them', () => {
  const mine = { ...BASE.body.rig.shapes[1], shape: { kind: 'poly', points: [[0, -32], [0, 32], [-4, 32], [-4, -32]] } };
  const replaced = R(sprite([mine, FLAG]));
  assert.equal(replaced.ok, true, replaced.errors.join('; '));
  assert.deepEqual(ids(replaced), ['stake', 'cap', 'flag', 'groundCut']);
  assert.deepEqual(replaced.body.rig.shapes.at(-1).shape.points[2], [-4, 32], 'the sprite\'s version');
  const dropped = R(sprite([FLAG], { drop: ['groundCut'] }));
  assert.equal(dropped.ok, true, dropped.errors.join('; '));
  assert.deepEqual(ids(dropped), ['stake', 'cap', 'flag']);
  const own = { id: 'myTint', kind: 'tint', paint: 'flag' };
  const r = R(sprite([own, FLAG]));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(ids(r), ['stake', 'cap', 'myTint', 'flag', 'groundCut'], 'the sprite\'s tint where it wrote it, the base\'s cut after it');
});

test('drawn: what a sprite adds below the ground is cut by the base, without the sprite writing a cut', () => {
  const low = (g) => { for (let y = g.h - 1; y >= 0; y--) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) return y; return -1; };
  const on = makeDataSprite(sprite([FLAG]), { pieces: store() });
  assert.ok(on.ok, on.errors.join('; '));
  const g = renderFrame(on.sprite, 'idle', 0, defaultParams(on.sprite));
  assert.ok(low(g) <= GROUND, `lowest row ${low(g)} (the outline may touch the ground row)`);
  const off = makeDataSprite(sprite([FLAG], { drop: ['groundCut'] }), { pieces: store() });
  assert.ok(off.ok, off.errors.join('; '));
  assert.ok(low(renderFrame(off.sprite, 'idle', 0, defaultParams(off.sprite))) > GROUND + 1, 'without the cut the flag reaches under the ground');
});

test('a sprite shape that replaces a base operation by id with something that is not an operation stays where the base had it', () => {
  // only operations move last (B16a2 round 3): a rect with the cut's id replaces the cut in its place, like any shape
  const mine = { id: 'groundCut', kind: 'rect', on: 'post', at: [0, 2], size: [2, 2], paint: 'flag', z: 11 };
  const r = R(sprite([mine, FLAG]));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(ids(r), ['stake', 'groundCut', 'cap', 'flag']);
  assert.equal(r.body.rig.shapes[1].kind, 'rect');
});
