// Build item F5 (docs/data-sprites.md 2.2 "Motion sliders"): a clip's `travel`, the list of { tracks, by, about? }
// that scales how far the clip's keys move, checked by catalog/sprite-schema.js like any binding. Held to here:
//   - a travel entry is kept as written (cleaned), and the control its `by` binds is in use (no "nothing uses it")
//   - by: a number or a number binding (map, pick, the slider itself) giving 0 to TRAVEL_LIMITS.most, never more
//   - tracks: 1 to TRAVEL_LIMITS.tracks paths of a numeric key field of the body (rig: root, bones, ik, stretch;
//     pictures and emitters: root, nodes), each id one of the body's (any id on a base the schema cannot see into);
//     never t, ease, show, hide, swap or emit
//   - about: first, mid, least, most or a number; at most TRAVEL_LIMITS.entries entries; a body with no keys refuses it
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { TRAVEL_LIMITS } from '../../rigs/keypose.js';
import { createPieceStore, pieceRegistry } from '../../engine/pieces.js';

const ROOT = new URL('../../', import.meta.url);
const json = (rel) => JSON.parse(fs.readFileSync(new URL(rel, ROOT), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

const MINI = {
  format: 'loadout-sprite', version: 2, id: 'hopper', name: 'Hopper', blurb: 'A small hopping thing.', size: [32, 32], pivot: [16, 30],
  meta: { type: 'creature', role: 'characters/animal', view: 'side', themes: ['forest'], gameTypes: ['platformer'], words: ['hopper', 'frog', 'hop', 'jump', 'animal', 'critter'], license: 'draft' },
  palette: [{ id: 'body', label: 'Body', default: '#4f9d57', material: 'skin' }],
  body: { rig: {
    bones: [{ id: 'root', parent: null, at: [16, 24], angle: 180, length: 6 }, { id: 'leg', parent: 'root', angle: 0, length: 4 }, { id: 'foot', parent: 'leg', angle: 0, length: 3 }, { id: 'tail', parent: 'root', angle: -90, length: 4 }],
    ik: [{ id: 'step', bones: ['leg', 'foot'], bend: 1 }],
    shapes: [{ id: 'torso', kind: 'ellipse', on: 'root', at: [0, -3], r: [5, 4], paint: 'body' }, { id: 'shin', kind: 'limb', bone: 'leg', width: 2, paint: 'body' }] } },
  controls: [{ key: 'bounce', kind: 'range', label: 'Bounce', lo: 'Calm', hi: 'Bouncy', default: 0.5 }, { key: 'look', kind: 'choice', label: 'Look', options: ['calm', 'wild'], default: 'calm' }, { key: 'speed', standard: 'speed' }],
  clips: { idle: { frames: 8, fps: 6, keys: [{ t: 0, root: [0, 0], bones: { tail: -90 }, ik: { step: [1, 3] }, stretch: { leg: 1 } }, { t: 0.5, root: [0, 2], bones: { tail: -80 }, ik: { step: [2, 3] }, stretch: { leg: 1.1 } }],
    travel: [
      { tracks: ['root.1'], about: 'least', by: { from: 'bounce', map: [[0, 0.5], [1, 1.5]] } },
      { tracks: ['bones.tail', 'ik.step', 'stretch.leg', 'root'], about: 'mid', by: { from: 'look', pick: { calm: 1, wild: 2 } } },
    ] } },
};
// MINI with another travel; a control the new travel does not name is left out (else it is refused as unused)
const withTravel = (travel, base = MINI) => {
  const d = clone(base);
  d.clips.idle.travel = travel;
  const said = JSON.stringify(travel ?? null);
  d.controls = d.controls.filter((c) => c.standard || said.includes(`"${c.key}"`));
  return d;
};
const errorsOf = (d, opts) => validateSprite(d, opts).errors.join('\n');

test('a clip\'s travel is kept, and the controls it binds are in use', () => {
  const v = validateSprite(MINI);
  assert.ok(v.ok, v.errors.join('; '));
  assert.ok(!v.warnings.some((w) => /travel/.test(w)), v.warnings.join('; '));
  assert.deepEqual(v.value.clips.idle.travel, MINI.clips.idle.travel);
  // without the travel nothing uses Bounce or Look: the validator refuses them (so travel is what uses them)
  const none = clone(MINI);
  delete none.clips.idle.travel;
  assert.match(errorsOf(none), /Control "bounce": nothing uses it/);
  assert.match(errorsOf(none), /Control "look": nothing uses it/);
});

test('by: a number or a binding to a number from 0 to TRAVEL_LIMITS.most', () => {
  assert.ok(validateSprite(withTravel([{ tracks: ['root.1'], by: 2 }, { tracks: ['root.0'], by: { from: 'bounce' } }, { tracks: ['bones.tail'], by: { from: 'bounce', map: [[0, 0], [1, TRAVEL_LIMITS.most]] } }])).ok);
  const big = withTravel([{ tracks: ['root.1'], by: { from: 'bounce', map: [[0, 0.5], [1, TRAVEL_LIMITS.most + 1]] } }]);
  assert.match(errorsOf(big), /travel 1: by's map gives 4, outside 0 to 3/);
  assert.match(errorsOf(withTravel([{ tracks: ['root.1'], by: -1 }])), /by -1 is outside 0 to 3/);
  assert.match(errorsOf(withTravel([{ tracks: ['root.1'], by: 'lots' }])), /by must be a number/);
  assert.match(errorsOf(withTravel([{ tracks: ['root.1'] }])), /by is missing/);
  assert.match(errorsOf(withTravel([{ tracks: ['root.1'], by: { from: 'nothing', map: [[0, 1], [1, 2]] } }])), /bound to "nothing", which is not one of the sprite's controls/);
  assert.match(errorsOf(withTravel([{ tracks: ['root.1'], by: { from: 'look', pick: { calm: 1 } } }])), /gives no value for "wild"/);
});

test('tracks: numeric key fields of the body and its own ids; never t, ease, show, hide, swap or emit', () => {
  const bad = (tracks, re) => assert.match(errorsOf(withTravel([{ tracks, by: 2 }])), re, JSON.stringify(tracks));
  for (const f of ['t', 'ease', 'show', 'hide', 'swap', 'emit', 'emit.burst.r', 'nodes.lid']) bad([f], /is not a track travel can scale/);
  bad(['bones.wing'], /"wing" is not a bone or node of the body/);
  bad(['stretch.wing'], /"wing" is not a bone or node of the body/);
  bad(['ik.reach'], /"reach" is not an IK chain of the body/);
  bad(['root.2'], /root\.2.*root takes 0 \(across\) or 1 \(down\)/);
  bad(['ik.step.x'], /ik\.step\.x.*0 \(across\) or 1 \(down\)/);
  bad(['bones.tail.0'], /bones\.tail\.0.*goes no deeper/);
  bad(['__proto__'], /is not a track/);
  bad(['bones..tail'], /is not a track/);
  bad([7], /is not a track/);
  bad([], /needs at least 1 tracks/);
  bad(Array.from({ length: TRAVEL_LIMITS.tracks + 1 }, () => 'root.1'), new RegExp(`the most is ${TRAVEL_LIMITS.tracks}`));
  const twice = validateSprite(withTravel([{ tracks: ['root.1', 'root.1'], by: 2 }]));
  assert.ok(twice.ok);
  assert.deepEqual(twice.value.clips.idle.travel[0].tracks, ['root.1']);
  assert.ok(twice.warnings.some((w) => /root\.1.*twice/.test(w)), twice.warnings.join('; '));
});

test('about: first, mid, least, most or a number; unknown fields dropped; at most TRAVEL_LIMITS.entries entries', () => {
  for (const about of ['first', 'mid', 'least', 'most', 0, -3.5]) assert.ok(validateSprite(withTravel([{ tracks: ['root.1'], by: 2, about }])).ok, String(about));
  assert.match(errorsOf(withTravel([{ tracks: ['root.1'], by: 2, about: 'middle' }])), /about must be first, mid, least, most or a number/);
  assert.match(errorsOf(withTravel([{ tracks: ['root.1'], by: 2, about: 1e6 }])), /about must be first, mid, least, most or a number from -720 to 720/);
  const extra = validateSprite(withTravel([{ tracks: ['root.1'], by: 2, how: 'fast' }]));
  assert.ok(extra.ok);
  assert.ok(extra.warnings.some((w) => /travel 1: dropped what this format does not know: how/.test(w)));
  assert.deepEqual(extra.value.clips.idle.travel, [{ tracks: ['root.1'], by: 2 }]);
  assert.match(errorsOf(withTravel(Array.from({ length: TRAVEL_LIMITS.entries + 1 }, () => ({ tracks: ['root.1'], by: 1 })))), new RegExp(`the most is ${TRAVEL_LIMITS.entries}`));
  assert.match(errorsOf(withTravel({ tracks: ['root.1'], by: 2 })), /travel.*must be a list/);
  assert.match(errorsOf(withTravel(['root.1'])), /travel 1: must be \{ tracks, by, about\? \}/);
});

test('a pictures body scales its nodes; a body with no moving keys refuses travel', () => {
  const coin = json('tests/fixtures/v2/pictures/coin.json');
  const range = coin.controls.find((c) => c.kind === 'range' || (c.kind === undefined && !c.standard));
  assert.ok(range, 'the coin has a slider');
  const clip = Object.keys(coin.clips)[0];
  const node = coin.body.pictures.nodes[0].id;
  const c = clone(coin);
  c.clips[clip].travel = [{ tracks: [`nodes.${node}.turn`, `nodes.${node}.move.1`, `nodes.${node}.scale`, 'root'], by: { from: range.key, map: [[range.min ?? 0, 0.5], [range.max ?? 1, 1.5]] } }];
  const v = validateSprite(c);
  assert.ok(v.ok, v.errors.join('; '));
  assert.equal(v.value.clips[clip].travel.length, 1);
  const bad = clone(coin);
  bad.clips[clip].travel = [{ tracks: [`nodes.${node}.spin`, 'nodes.nowhere.turn', 'bones.x', 'ik.y'], by: 2 }];
  const e = errorsOf(bad);
  assert.match(e, /nodes\.\w+\.spin.*turn, move or scale/);
  assert.match(e, /"nowhere" is not a node of the body/);
  assert.match(e, /"bones\.x" is not a track travel can scale.*root, nodes/);
  const ui = json('tests/fixtures/v2/ui-button.json');
  const u = clone(ui);
  const state = Object.keys(u.clips ?? {})[0] ?? 'pressed';
  u.clips = { ...(u.clips ?? {}), [state]: { ...(u.clips?.[state] ?? {}), travel: [{ tracks: ['root'], by: 2 }] } };
  assert.match(errorsOf(u), /travel scales how far a clip's keys move; a panel body has no keys that move/);
});

test('on a base the schema cannot see into, any bone or IK chain id is taken (the Hero on base:person-side)', async () => {
  const hero = json('tests/fixtures/person-side/knight.json');
  const store = createPieceStore({ read: (f) => fs.readFileSync(new URL(f, ROOT), 'utf8') });
  assert.ok((await store.loadFor(hero)).ok);
  const h = clone(hero);
  h.controls.splice(h.controls.length - 1, 0, { key: 'stride', kind: 'range', label: 'Stride', lo: 'Small steps', hi: 'Big steps', default: 0.5, group: 'Motion' });
  h.clips.walk.travel = [{ tracks: ['ik.legF.0', 'ik.legB.0', 'bones.armF'], about: 'mid', by: { from: 'stride', map: [[0, 0.67], [0.5, 1], [1, 1.33]] } }];
  const v = validateSprite(h, { pieces: pieceRegistry(store) });
  assert.ok(v.ok, v.errors.join('; '));
  assert.deepEqual(v.value.clips.walk.travel, h.clips.walk.travel);
  h.clips.walk.travel[0].tracks.push('bones.nowhere-at-all');
  assert.match(errorsOf(h, { pieces: pieceRegistry(store) }), /"nowhere-at-all" is not a bone or node of the body/);
});

// Review fix (F5 round 2): side keeps an entry to one side of its pivot; and a clip written only to give a base's clip
// a travel, on a sprite whose base gives every clip (no extends.clips), is told to say `from` (it replaces the base's
// clip otherwise, and has no frames of its own).
test('side: below or above is kept; anything else is refused', () => {
  const ok = validateSprite(withTravel([{ tracks: ['root.1'], about: 0, side: 'below', by: { from: 'bounce', map: [[0, 0.5], [1, 1.5]] } }]));
  assert.ok(ok.ok, ok.errors.join('; '));
  assert.equal(ok.value.clips.idle.travel[0].side, 'below');
  for (const side of ['under', 1, null, '']) {
    const v = validateSprite(withTravel([{ tracks: ['root.1'], side, by: 2 }]));
    assert.ok(!v.ok && v.errors.some((e) => /side must be below or above/.test(e)), `${JSON.stringify(side)}: ${v.errors.join('; ')}`);
  }
});

test('a clip written only for its travel on a base that gives every clip is told to add from', async () => {
  const hero = json('tests/fixtures/person-side/knight-travel.json');
  const st = createPieceStore({ read: (f) => fs.readFileSync(new URL(f, ROOT), 'utf8') });
  assert.ok((await st.loadFor(hero)).ok);
  const d = clone(hero);
  delete d.body.rig.extends.clips;
  d.clips.hurt = { travel: [{ tracks: ['root.1'], by: { from: 'bounce', map: [[0, 0.5], [0.5, 1], [1, 1.5]] } }] };
  const v = validateSprite(d, { pieces: pieceRegistry(st) });
  assert.ok(!v.ok);
  const e = v.errors.find((x) => /Clip "hurt"/.test(x));
  assert.match(e, /"from": "hurt"/, e);
  d.clips.hurt.from = 'hurt';
  const w = validateSprite(d, { pieces: pieceRegistry(st) });
  assert.ok(w.ok, w.errors.join('; '));
});

// Review fix (F5 round 2), issue 3: a base summary that lists its IK chains (`ik`, which engine/pieces.js
// pieceSummary does not give yet) has them checked like the body's own; without it any id passes here and
// engine/resolve.js warns of a path no key moves.
test('IK chain ids on a base are checked when the base summary lists its chains', async () => {
  const hero = json('tests/fixtures/person-side/knight-travel.json');
  const st = createPieceStore({ read: (f) => fs.readFileSync(new URL(f, ROOT), 'utf8') });
  assert.ok((await st.loadFor(hero)).ok);
  const reg = pieceRegistry(st);
  const withChains = { piece: (id, v) => { const p = reg.piece(id, v); return p && p.kind === 'base' ? { ...p, ik: ['legF', 'legB'] } : p; }, pieces: () => reg.pieces() };
  const typo = clone(hero);
  typo.clips.idle.travel = [...typo.clips.idle.travel, { tracks: ['ik.lefF'], by: 2 }];
  const v = validateSprite(typo, { pieces: withChains });
  assert.ok(!v.ok && v.errors.some((e) => /"ik\.lefF": "lefF" is not an IK chain of the body or its base \(legF, legB\)/.test(e)), v.errors.join('; '));
  assert.ok(validateSprite(hero, { pieces: withChains }).ok, 'the real chains pass');
  assert.ok(validateSprite(typo, { pieces: reg }).ok, 'a summary without chains: any id passes here (the resolver warns)');
});
