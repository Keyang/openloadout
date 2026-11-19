// Bone rig v2 (rigs/bones.js, build item B5), part 5: what the B5 review found. A version 2 sprite whose rig uses only
// version 1 kinds on `bone` is still drawn by version 2 rules (every paint ref, the larger caps); shapes past a cap
// are reported, not dropped in silence; a frame's whole list is capped, however many generator calls it makes; and a
// point naming a prototype key as its bone is left out instead of throwing.
// Run: node --test tests/unit/bones-v2-caps.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import * as B from '../../rigs/bones.js';
import { resolveSprite } from '../../engine/resolve.js';
import { testPieces, testRegistry } from '../fixtures/resolve/helpers.mjs';

/** A version 2 sprite with one bone and n ellipses on it, each on `bone` (version 1's key) or `on`. */
const blob = (n, paint, key = 'bone') => ({
  format: 'loadout-sprite', version: 2, id: 'blobby', name: 'Blobby', blurb: 'A test blob for the bone rig.', size: [64, 64], pivot: [32, 58],
  meta: { type: 'creature', role: 'characters/enemy', view: 'side', themes: ['fantasy'], gameTypes: ['platformer'], words: ['blob'], license: 'draft' },
  palette: [{ id: 'skin', label: 'Skin', default: '#4f9d57', material: 'skin' }],
  body: { rig: { bones: [{ id: 'body', parent: null, at: [32, 40], angle: 180, length: 10 }],
    shapes: Array.from({ length: n }, (_, i) => ({ id: 's' + i, [key]: 'body', kind: 'ellipse', at: [(i % 10) - 5, (i % 7) - 3], r: [1, 1], paint, z: i % 5 })) } },
  clips: { idle: { frames: 2, fps: 4 } },
});
const R = (def) => {
  const r = resolveSprite(def, {}, { pieces: testPieces(), generators: testRegistry() });
  assert.equal(r.ok, true, r.errors?.join('; '));
  return r;
};
const draw = (resolved) => {
  const g = new Surface(64, 64);
  return { g, ...B.drawResolvedRig(g, resolved, {}, { clip: 'idle' }) };
};
const lit = (g) => g.data.filter(Boolean).length;
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);

test('bones v2 caps: a version 2 sprite with only version 1 kinds on `bone` takes tone refs, as it does with `on`', () => {
  const viaBone = R(blob(3, 'skin.dark'));
  assert.equal(viaBone.version, 2);
  const a = draw(viaBone), b = draw(R(blob(3, 'skin.dark', 'on')));
  assert.deepEqual(a.errors, []);
  assert.deepEqual(a.skipped, []);
  assert.ok(lit(a.g) > 0, 'the shapes are painted');
  assert.ok(same(a.g, b.g), '`bone` and `on` draw the same');
});

test('bones v2 caps: a version 2 sprite with only version 1 kinds on `bone` takes the version 2 shape cap (200 shapes all drawn)', () => {
  const resolved = R(blob(200, 'skin'));
  const a = draw(resolved), b = draw(R(blob(200, 'skin', 'on')));
  assert.deepEqual(a.skipped, []);
  assert.ok(same(a.g, b.g), '`bone` and `on` draw the same');
  // the frame as a list (resolvedRigList, what drawResolvedRig draws): all 200 and the outline, nothing left out
  const r = B.resolvedRigList(resolved, {}, { clip: 'idle' });
  assert.equal(r.error, undefined);
  assert.equal(r.list.length, 201);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(B.resolvedRigList(R(blob(3, 'skin.dark')), {}, { clip: 'idle' }).skipped, []);
  assert.ok(typeof B.resolvedRigList(null).error === 'string', 'not a resolved rig sprite: an error, not a throw');
});

test('bones v2 caps: shapes past the cap are reported in skipped, for version 1 and version 2 rigs', () => {
  const colours = [{ id: 'skin', default: '#e0a878' }];
  const bones = [{ id: 'a', parent: null, at: [16, 16], angle: 90, length: 8 }];
  const v1 = { size: [32, 32], colours, bones, shapes: Array.from({ length: 170 }, (_, i) => ({ id: 's' + i, bone: 'a', kind: 'dot', at: [i % 8, 0], paint: 'skin' })) };
  const r1 = B.rigList(v1, B.solveRig(v1));
  assert.equal(r1.list.length, B.BONE_LIMITS.shapes + 1);
  assert.ok(r1.skipped.some((s) => /at most 160 shapes/.test(s.why) && /10 more/.test(s.why)), JSON.stringify(r1.skipped));
  const n = B.RIG_V2_LIMITS.shapes + 5;
  const v2 = { version: 2, size: [32, 32], colours, bones, shapes: Array.from({ length: n }, (_, i) => ({ id: 's' + i, on: 'a', kind: 'rect', at: [i % 8, 0], size: [1, 1], paint: 'skin' })) };
  const r2 = B.rigList(v2, B.solveRig(v2));
  // the frame's own primitives stop two short of draw-list's cap, so the outline (and a flash) always fit
  assert.equal(r2.list.length, B.RIG_V2_LIMITS.shapes - 1);
  assert.equal(r2.list.at(-1).kind, 'outline');
  assert.ok(r2.skipped.some((s) => /at most 4000 shapes/.test(s.why) && /5 more/.test(s.why)), JSON.stringify(r2.skipped));
  assert.ok(r2.skipped.some((s) => /at most 4000 primitives/.test(s.why) && /2 more/.test(s.why)), JSON.stringify(r2.skipped));
  const flashed = B.rigList(v2, B.solveRig(v2), { flash: true });
  assert.equal(flashed.list.length, B.RIG_V2_LIMITS.shapes);
  assert.deepEqual(flashed.list.slice(-2).map((p) => p.kind), ['tint', 'outline']);
});

test('bones v2 caps: a frame\'s whole list is capped, however many generator calls it makes, and the overflow is reported', () => {
  const colours = [{ id: 'skin', default: '#e0a878' }];
  const shapes = Array.from({ length: 64 }, (_, i) => ({ id: 'g' + i, gen: 'x', v: 1, on: 'a' }));
  const rig = { version: 2, size: [32, 32], colours, bones: [{ id: 'a', parent: null, at: [16, 16], angle: 90, length: 8 }], shapes };
  const prim = Array.from({ length: 4000 }, (_, i) => ({ kind: 'rect', at: [i % 30, 0], size: [1, 1], paint: 'skin' }));
  let calls = 0;
  const expand = () => { calls++; return { ok: true, primitives: prim }; };
  const t0 = performance.now();
  const r = B.rigList(rig, B.solveRig(rig), {}, { expand });
  const ms = performance.now() - t0;
  assert.equal(r.list.length, B.RIG_V2_LIMITS.shapes - 1, 'the cap less two, and the outline');
  assert.equal(r.list.at(-1).kind, 'outline');
  assert.ok(calls <= 2, `${calls} expansions after the list was full`);
  assert.ok(r.skipped.some((s) => /at most 4000 primitives/.test(s.why) && /2 more and 63 generator calls/.test(s.why)), JSON.stringify(r.skipped.slice(0, 3)));
  assert.ok(ms < 100, `${ms.toFixed(1)} ms`);
  const g = new Surface(32, 32);
  assert.doesNotThrow(() => B.drawRig(g, rig, {}, { expand }));
  assert.ok(g.data.some(Boolean), 'something is drawn');
});

test('bones v2 caps: a point or shape naming a prototype key as its bone is left out, never thrown on', () => {
  const colours = [{ id: 'skin', default: '#e0a878' }];
  for (const on of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    for (const key of ['on', 'bone']) {
      const rig = { size: [32, 32], colours, bones: [{ id: 'a', parent: null, at: [16, 16], angle: 90, length: 8 }],
        points: [{ id: 'p', [key]: on, at: [0, 0] }, { id: 'q', [key]: 'a', at: [1, 0] }],
        shapes: [{ id: 's', [key]: on, kind: 'ellipse', at: [0, 0], r: [2, 2], paint: 'skin' }] };
      const J = B.solveRig(rig);
      let pts;
      assert.doesNotThrow(() => { pts = B.rigPoints(rig, J); }, `${key} ${on}`);
      assert.deepEqual(Object.keys(pts), ['q'], `${key} ${on}`);
      const r = B.rigList(rig, J);
      assert.ok(r.skipped.some((s) => s.id === 's'), `${key} ${on}: the shape is reported`);
    }
  }
});
