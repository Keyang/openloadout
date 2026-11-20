// Migration batch M6b (docs/data-sprites.md section 9, the M6 row; the third review of M6, issues 4 and 6): the two
// framework seams the side-view redraws ran into, held here so later character batches cannot fall into them again.
//   - room: rigs/bones.js draws at most RIG_V2_LIMITS.nodes (64) bones and nodes. A sprite on a base adds its own to the
//     base's 59, so the validator counts both and refuses a sprite past the cap (it used to count only the sprite's own,
//     and the renderer then dropped the extras without a word); the renderer reports any it leaves out in `skipped`
//   - a held thing's angle: a node's `angle` may be a binding to a number (a Hold angle slider turns the node the weapon
//     is drawn on, continuously, as the code's holdAngle did), where the M6 redraws drew each weapon four times, one copy
//     per step of a fixed turn. A bone's angle stays a plain number (keys pose bones; a bound bone would fight them)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { createPieceStore, pieceRegistry } from '../../engine/pieces.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, cleanParams, frameSockets } from '../../engine/sprite.js';
import { rigList, solveRig, RIG_V2_LIMITS } from '../../rigs/bones.js';

const ROOT = new URL('../../', import.meta.url);
const store = createPieceStore({ read: (f) => fs.readFileSync(new URL(f, ROOT), 'utf8') });
/** A person on base:person-side@7 holding a stick on node `hold` under the near hand; `more` changes the rig. */
const person = (more = {}) => ({
  format: 'loadout-sprite', version: 2, id: 'hold-test', name: 'Holder', blurb: 'A person holding a stick.', size: [64, 64], pivot: [28, 58],
  meta: { type: 'character', role: 'characters/player', view: 'side', themes: ['fantasy'], gameTypes: ['platformer'], words: ['person', 'stick', 'hold', 'test', 'walk', 'idle'], license: 'draft' },
  palette: [{ id: 'skin', label: 'Skin', default: '#e0a878', material: 'skin' }, { id: 'top', label: 'Top', default: '#3a6ea5', material: 'cloth' },
    { id: 'bottom', label: 'Bottom', default: '#29466a', material: 'cloth' }, { id: 'boots', label: 'Boots', default: '#5b3d2e', material: 'cloth' },
    { id: 'wood', label: 'Stick', default: '#8a5a34', material: 'wood' }],
  controls: [{ key: 'weaponAngle', kind: 'range', label: 'Hold angle', lo: 'Upright', hi: 'Forward', min: -10, max: 40, step: 1, default: 0 }, { key: 'speed', standard: 'speed' }],
  body: { rig: {
    extends: { use: 'base:person-side', v: 7, clips: ['idle', 'walk'] },
    nodes: [{ id: 'hold', parent: 'handF', angle: { from: 'weaponAngle', map: [[-10, 10], [40, -40]] } }],
    points: [{ id: 'hand', on: 'hold', at: [0, 0] }],
    shapes: [{ id: 'stick', kind: 'line', on: 'hold', from: [0, 0], to: [14, 0], thick: 2, paint: 'wood', z: 90 }],
    ...more } },
});
assert.ok((await store.loadFor(person())).ok);
const check = (def) => validateSprite(def, { pieces: pieceRegistry(store) });

test('a node\'s angle may be bound to a slider; the sprite validates and the node turns with it', () => {
  const v = check(person());
  assert.deepEqual(v.errors, []);
  const m = makeDataSprite(person(), { pieces: store });
  assert.ok(m.ok, m.errors.join('; '));
  const s = m.sprite;
  const angleAt = (wa) => frameSockets(s, 'idle', 0, cleanParams(s, { weaponAngle: wa })).hand.angle;
  // forward is a smaller rig angle: 40 degrees forward turns the hand point 40 degrees, as the code's holdAngle did
  assert.ok(Math.abs(angleAt(40) - angleAt(0) + 40 * Math.PI / 180) < 1e-6, `${angleAt(40)} vs ${angleAt(0)}`);
  assert.ok(Math.abs(angleAt(-10) - angleAt(0) - 10 * Math.PI / 180) < 1e-6);
  const px = (wa) => Array.from(renderFrame(s, 'idle', 0, cleanParams(s, { weaponAngle: wa })).data);
  assert.notDeepEqual(px(0), px(40), 'the stick turns');
});

test('a bone\'s angle is still a plain number, and a node\'s binding is checked as any binding', () => {
  const boneBound = person({ bones: [{ id: 'pole', parent: 'handF', angle: { from: 'weaponAngle', map: [[-10, 10], [40, -40]] }, length: 4 }] });
  assert.ok(check(boneBound).errors.some((e) => /Bone "pole".*angle/.test(e)), check(boneBound).errors.join('; '));
  const unknown = person({ nodes: [{ id: 'hold', parent: 'handF', angle: { from: 'nope', map: [[0, 0], [1, 1]] } }] });
  assert.ok(check(unknown).errors.some((e) => /Node "hold".*nope/.test(e)), check(unknown).errors.join('; '));
  const tooFar = person({ nodes: [{ id: 'hold', parent: 'handF', angle: { from: 'weaponAngle', map: [[-10, 10], [40, -4000]] } }] });
  assert.ok(check(tooFar).errors.some((e) => /Node "hold"/.test(e)), check(tooFar).errors.join('; '));
});

test('the validator counts the base\'s bones and nodes with the sprite\'s own and refuses a rig past the cap', () => {
  const base = JSON.parse(fs.readFileSync(new URL('pieces/base-person-side.v7.json', ROOT), 'utf8')).body.rig;
  const inBase = base.bones.length + base.nodes.length;
  assert.equal(inBase, 59);
  const room = RIG_V2_LIMITS.nodes - inBase;
  const withNodes = (n) => person({ nodes: [person().body.rig.nodes[0], ...Array.from({ length: n - 1 }, (_, i) => ({ id: `extra${i}`, parent: 'handF', angle: 0 }))] });
  assert.deepEqual(check(withNodes(room)).errors, [], 'up to the cap is fine');
  const over = check(withNodes(room + 1)).errors;
  assert.ok(over.some((e) => new RegExp(`${RIG_V2_LIMITS.nodes + 1} bones and nodes.*base.*${RIG_V2_LIMITS.nodes}`).test(e)), over.join('; '));
});

test('the renderer reports the bones and nodes it leaves out past the cap, never drops them in silence', () => {
  const nodes = Array.from({ length: RIG_V2_LIMITS.nodes + 3 }, (_, i) => ({ id: `n${i}`, parent: i ? `n${i - 1}` : null, ...(i ? {} : { at: [32, 32] }), angle: 0 }));
  const rig = { version: 2, size: [64, 64], bones: [{ id: 'root', parent: null, at: [32, 32], angle: 0, length: 4 }], nodes,
    shapes: [{ id: 'last', kind: 'dot', on: `n${nodes.length - 1}`, at: [0, 0], paint: 'ink' }] };
  const r = rigList(rig, solveRig(rig));
  assert.ok(r.skipped.some((s) => /bones and nodes/.test(s.why) && /4/.test(s.why)), JSON.stringify(r.skipped));
  // a rig within the cap reports nothing of the kind
  const small = { ...rig, nodes: nodes.slice(0, 10), shapes: [] };
  assert.equal(rigList(small, solveRig(small)).skipped.some((s) => /bones and nodes/.test(s.why)), false);
});
