// Build item F5 (docs/data-sprites.md 2.2 "Motion sliders"; Contract 15 rule 10): a redraw keeps its control keys, so
// a data sprite's Bounce, Stride or Wobble must change how far a clip moves. rigs/keypose.js travelKeys scales how far
// chosen tracks of a clip's keys move from a pivot (the track's first key, the middle or either end of its travel, or a
// number), before the keys are blended. Held to here:
//   - a track named by its path ("root.1", "ik.legF.0") or a group by a shorter path ("ik.legF", "bones") is scaled
//     about its pivot; every other track, t, ease, show, hide, swap and emit are untouched
//   - a factor of exactly 1 gives the keys back value for value (a sprite at its middle draws as before)
//   - the factor is held to 0..TRAVEL_LIMITS.most; non-finite factors and pivots do nothing; entries apply in order
//   - limit(path) clamps what comes out; bad data (prototype names, too many entries, junk) is skipped, never thrown
//   - pure: the keys given are not changed, the same input gives the same output
import test from 'node:test';
import assert from 'node:assert/strict';
import { travelKeys, travelMisses, TRAVEL_LIMITS, TRAVEL_ABOUT, TRAVEL_SIDES, compileKeys, sampleKeys } from '../../rigs/keypose.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

// a walk-like clip: the root bobs 0..1, the feet swing about -0.6 and lift from -1, an arm swings about -176
const WALK = [
  { t: 0, root: [0, 1], ik: { legF: [3.9, -1], legB: [-3.9, -1] }, bones: { armF: -190, spine: -3 }, stretch: { seat: 1.1 }, show: ['footF'], hide: ['toeF'], swap: { eye: null } },
  { t: 0.25, root: [0, 0], ik: { legF: [-0.6, -1], legB: [0.6, -3] }, bones: { armF: -176 }, ease: 'linear' },
  { t: 0.5, root: [0, 1], ik: { legF: [-5.1, -1], legB: [5.1, -1] }, bones: { armF: -162 } },
  { t: 0.75, root: [0, 0], ik: { legF: [-0.6, -3], legB: [0.6, -1] }, bones: { armF: -176 } },
];

test('the limits and pivots are named', () => {
  assert.deepEqual([...TRAVEL_ABOUT], ['first', 'mid', 'least', 'most']);
  assert.ok(Object.isFrozen(TRAVEL_LIMITS));
  assert.equal(TRAVEL_LIMITS.most, 3);
  for (const k of ['entries', 'tracks', 'segments', 'most']) assert.ok(Number.isInteger(TRAVEL_LIMITS[k]) && TRAVEL_LIMITS[k] > 0, k);
});

test('one track scaled about its first key; nothing else moves', () => {
  const out = travelKeys(WALK, [{ tracks: ['root.1'], by: 2 }]);
  assert.deepEqual(out.map((k) => k.root), [[0, 1], [0, -1], [0, 1], [0, -1]]);   // about the first key (1): 1 + (0 - 1) * 2
  for (let i = 0; i < WALK.length; i++) {
    const a = { ...out[i] }, b = { ...WALK[i] };
    delete a.root; delete b.root;
    assert.deepEqual(a, b, `key ${i}: only root moves`);
    assert.equal(out[i].root[0], WALK[i].root[0]);
  }
});

test('each pivot: least, most, mid, a number', () => {
  const at = (about, by) => travelKeys(WALK, [{ tracks: ['root.1'], by, about }]).map((k) => k.root[1]);
  assert.deepEqual(at('least', 0.5), [0.5, 0, 0.5, 0]);       // a crouch about standing (0): halved
  assert.deepEqual(at('most', 0.5), [1, 0.5, 1, 0.5]);        // about the lowest point
  assert.deepEqual(at('mid', 0), [0.5, 0.5, 0.5, 0.5]);       // flattened to the middle of its travel
  assert.deepEqual(at(0, 1.5), [1.5, 0, 1.5, 0]);             // about a number
  const swing = travelKeys(WALK, [{ tracks: ['bones.armF'], by: 1.5, about: 'mid' }]).map((k) => k.bones.armF);
  assert.deepEqual(swing, [-197, -176, -155, -176]);         // the arm swings 1.5 times as far about -176
});

test('a group by a shorter path: every track under it, each about its own pivot', () => {
  const out = travelKeys(WALK, [{ tracks: ['ik'], by: 2, about: 'mid' }]);
  // legF.0 travels -5.1..3.9 (mid -0.6), legF.1 -3..-1 (mid -2): each about its own middle
  near(out[0].ik.legF[0], -0.6 + (3.9 + 0.6) * 2);
  near(out[2].ik.legF[0], -0.6 + (-5.1 + 0.6) * 2);
  near(out[0].ik.legF[1], -2 + (-1 + 2) * 2);
  near(out[1].ik.legB[1], -2 + (-3 + 2) * 2);
  const legs = travelKeys(WALK, [{ tracks: ['ik.legF.0', 'ik.legB.0'], by: 0.5, about: 'mid' }]);
  assert.deepEqual(legs.map((k) => k.ik.legF[1]), WALK.map((k) => k.ik.legF[1]), 'the y of each foot is not named');
  const all = travelKeys(WALK, [{ tracks: ['bones'], by: 0 }]);
  assert.deepEqual(all.map((k) => k.bones.armF), [-190, -190, -190, -190]);
  assert.equal(all[0].bones.spine, -3);
});

test('a factor of exactly 1 gives the keys back value for value; the input is never changed', () => {
  const before = JSON.stringify(WALK);
  const same = travelKeys(WALK, [{ tracks: ['root', 'ik', 'bones', 'stretch'], by: 1, about: 'mid' }]);
  assert.deepEqual(same, WALK);
  assert.notEqual(same, WALK);
  travelKeys(WALK, [{ tracks: ['root', 'ik', 'bones'], by: 2.5, about: 'mid' }]);
  assert.equal(JSON.stringify(WALK), before, 'the keys given are not changed');
  assert.deepEqual(travelKeys(WALK, []), WALK);
  assert.deepEqual(travelKeys(WALK, undefined), WALK);
});

test('t, ease, show, hide, swap and emit never move, even when named', () => {
  const ks = [{ t: 0, emit: { burst: { amount: 1, r: 4 } }, swap: { eye: 'blink' } }, { t: 0.5, emit: { burst: { amount: 0, r: 2 } } }];
  assert.deepEqual(travelKeys(ks, [{ tracks: ['t', 'ease', 'show', 'hide', 'swap', 'emit', 'emit.burst.r'], by: 3 }]), ks);
  const w = travelKeys(WALK, [{ tracks: ['show', 'hide'], by: 0 }]);
  assert.deepEqual(w, WALK);
});

test('the factor is held to 0..most; junk factors, pivots and tracks do nothing', () => {
  const big = travelKeys(WALK, [{ tracks: ['root.1'], by: 50, about: 'least' }]).map((k) => k.root[1]);
  assert.deepEqual(big, [TRAVEL_LIMITS.most, 0, TRAVEL_LIMITS.most, 0]);
  const neg = travelKeys(WALK, [{ tracks: ['root.1'], by: -2, about: 'least' }]).map((k) => k.root[1]);
  assert.deepEqual(neg, [0, 0, 0, 0]);
  for (const by of [NaN, Infinity, '2', null, { from: 'bounce' }]) assert.deepEqual(travelKeys(WALK, [{ tracks: ['root.1'], by }]), WALK, String(by));
  for (const about of ['middle', NaN, Infinity, {}, '__proto__']) assert.deepEqual(travelKeys(WALK, [{ tracks: ['root.1'], by: 2, about }]), WALK, String(about));
  for (const tracks of [[], ['__proto__'], ['root.__proto__'], ['constructor.1'], [''], ['root..1'], 'root', [7], ['a.b.c.d.e.f']]) {
    assert.deepEqual(travelKeys(WALK, [{ tracks, by: 2 }]), WALK, JSON.stringify(tracks));
  }
  assert.deepEqual(travelKeys(WALK, [{ tracks: ['tail'], by: 2 }]), WALK, 'a track no key has: nothing');
  assert.deepEqual(travelKeys('junk', [{ tracks: ['root'], by: 2 }]), []);
  assert.deepEqual(travelKeys([null, 3, { t: 0, root: [0, 2] }], [{ tracks: ['root.1'], by: 2, about: 0 }]), [null, 3, { t: 0, root: [0, 4] }]);
});

test('entries apply in order, each on what the one before left; at most TRAVEL_LIMITS.entries of them', () => {
  const two = travelKeys(WALK, [{ tracks: ['root.1'], by: 2, about: 'least' }, { tracks: ['root.1'], by: 0.25, about: 'least' }]);
  assert.deepEqual(two.map((k) => k.root[1]), [0.5, 0, 0.5, 0]);
  const many = Array.from({ length: TRAVEL_LIMITS.entries + 4 }, () => ({ tracks: ['root.1'], by: 2, about: 'least' }));
  const out = travelKeys(WALK, many);
  assert.equal(out[0].root[1], 2 ** TRAVEL_LIMITS.entries);   // only the first entries count (each factor is capped; what comes out is held by limit, below)
  const tracks = Array.from({ length: TRAVEL_LIMITS.tracks + 3 }, (_, i) => (i === TRAVEL_LIMITS.tracks + 2 ? 'root.1' : `bones.b${i}`));
  assert.deepEqual(travelKeys(WALK, [{ tracks, by: 2 }]), WALK, 'tracks past the cap are not read');
});

test('limit(path) clamps what comes out; a limit that throws or gives junk is ignored', () => {
  const lim = (p) => (p[0] === 'root' ? [-0.5, 1.5] : null);
  const out = travelKeys(WALK, [{ tracks: ['root.1', 'bones.armF'], by: 3, about: 'least' }], { limit: lim });
  assert.deepEqual(out.map((k) => k.root[1]), [1.5, 0, 1.5, 0]);
  assert.equal(out[0].bones.armF, -190 + (-190 + 190) * 3);
  near(out[2].bones.armF, -190 + (-162 + 190) * 3);
  const bad = travelKeys(WALK, [{ tracks: ['root.1'], by: 2, about: 'least' }], { limit: () => { throw new Error('no'); } });
  assert.deepEqual(bad.map((k) => k.root[1]), [2, 0, 2, 0]);
  const junk = travelKeys(WALK, [{ tracks: ['root.1'], by: 2, about: 'least' }], { limit: () => ['a', NaN] });
  assert.deepEqual(junk.map((k) => k.root[1]), [2, 0, 2, 0]);
});

test('the first key is the earliest by t, not by place in the list; deterministic; the blender takes the result', () => {
  const shuffled = [WALK[2], WALK[0], WALK[3], WALK[1]];
  const a = travelKeys(shuffled, [{ tracks: ['bones.armF'], by: 2 }]);
  assert.deepEqual(a.map((k) => k.bones.armF), [-190 + 28 * 2, -190, -190 + 14 * 2, -190 + 14 * 2]);
  assert.deepEqual(travelKeys(shuffled, [{ tracks: ['bones.armF'], by: 2 }]), a);
  const pose = sampleKeys(compileKeys(travelKeys(WALK, [{ tracks: ['root.1'], by: 0.5, about: 'least' }])), 0.5);
  near(pose.root[1], 0.5);
  assert.deepEqual(pose.show, ['footF']);
});

// Review fix (F5 round 2): a jump's root track holds the crouch (down, positive) and the lift (up, negative) on one
// track. The code rig's Bounce scales only the lift, and a base's baked limbs break when a planted leg straightens,
// so an entry may say `side`: only the values below (less than) or above (more than) the pivot move.
test('side: below or above moves only the values on that side of the pivot', () => {
  const JUMP = [{ t: 0, root: [0, 0] }, { t: 0.2, root: [0, 3] }, { t: 0.5, root: [0, -6] }, { t: 0.8, root: [0, 2] }, { t: 1, root: [0, 0] }];
  const at = (e) => travelKeys(JUMP, [{ tracks: ['root.1'], about: 0, ...e }]).map((k) => k.root[1]);
  assert.deepEqual(at({ by: 0.5, side: 'below' }), [0, 3, -3, 2, 0], 'the lift halves, the crouches stay');
  assert.deepEqual(at({ by: 2, side: 'above' }), [0, 6, -6, 4, 0], 'the crouches double, the lift stays');
  assert.deepEqual(at({ by: 0.5 }), [0, 1.5, -3, 1, 0], 'no side: both');
  assert.deepEqual(at({ by: 2, side: 'below', about: 'mid' }), [0, 3, -10.5, 2, 0], 'about the middle (-1.5): only -6 is below it');
  for (const side of ['under', 1, null, {}, '__proto__']) assert.deepEqual(travelKeys(JUMP, [{ tracks: ['root.1'], by: 2, about: 0, side }]), JUMP, String(side));
  assert.deepEqual([...TRAVEL_SIDES], ['below', 'above']);
});

// Review fix (F5 round 2): on a base the schema cannot see the base's IK chains, so a mistyped "ik.lefF" passed and
// scaled nothing. travelMisses names each track path that no key of the clip moves, whatever the factor (a slider at
// its middle still hears of a typo); engine/resolve.js turns them into warnings.
test('travelMisses names the paths no key moves, at any factor; nothing for good paths', () => {
  assert.deepEqual(travelMisses(WALK, [{ tracks: ['ik.lefF', 'ik.legF', 'root.1', 'bones.armFF', 'bones'], by: 1 }]), ['ik.lefF', 'bones.armFF']);
  assert.deepEqual(travelMisses(WALK, [{ tracks: ['root.1'], by: 2 }, { tracks: ['tail.0'], by: { from: 'x' } }]), ['tail.0']);
  assert.deepEqual(travelMisses(WALK, [{ tracks: ['ik.legF.2', 'root.2'], by: 0.5 }]), ['ik.legF.2', 'root.2']);
  assert.deepEqual(travelMisses(WALK, [{ tracks: ['show', 't'], by: 2 }]), ['show', 't'], 'fixed fields never move');
  assert.deepEqual(travelMisses(WALK, [{ tracks: ['ik.lefF', 'ik.lefF'], by: 2 }]), ['ik.lefF'], 'each named once');
  assert.deepEqual(travelMisses([], [{ tracks: ['root.1'], by: 2 }]), ['root.1']);
  for (const junk of [undefined, null, 'x', [null, 3, { tracks: 'root' }, { tracks: [7, '__proto__'] }]]) assert.deepEqual(travelMisses(WALK, junk), [], String(junk));
});
