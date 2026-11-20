// engine/gen/registry.js: how a named generator is declared, looked up and described (docs/data-sprites.md 3.1, 3.2).
// Throwaway generators go in a registry of their own (createRegistry), never the site's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, genKey, CALL_FIELDS, GEN_LIMITS } from '../../engine/gen/registry.js';
import { px, count, word, paint, point, place } from '../../engine/gen/args.js';

const base = () => ({
  id: 'blip', v: 1, family: 'test', about: 'One pixel at a point.',
  args: { at: point(), paint: paint(), size: count(1, 2, { default: 1 }) },
  cost: () => 1,
  run: (a) => [{ kind: 'dot', at: a.at, size: a.size, paint: a.paint }],
});

test('a declaration is checked and frozen, and found by id and version', () => {
  const r = createRegistry();
  const g = r.defineGenerator(base());
  assert.ok(Object.isFrozen(g));
  assert.ok(Object.isFrozen(g.args));
  assert.equal(g.key, 'blip@1');
  assert.equal(genKey('blip', 1), 'blip@1');
  assert.equal(r.generator('blip', 1), g);
  assert.equal(r.generator('blip', 2), null);
  assert.equal(r.generator('nope', 1), null);
  assert.equal(r.generator('constructor', 1), null);
  assert.equal(r.generator('__proto__', 1), null);
  assert.deepEqual(r.generators().map((x) => x.key), ['blip@1']);
  assert.deepEqual(g.keyable, []);
  assert.equal(g.wraps, false);
});

test('a released version cannot be declared twice; a new version sits beside it', () => {
  const r = createRegistry();
  r.defineGenerator(base());
  assert.throws(() => r.defineGenerator(base()), /blip@1.*already/);
  r.defineGenerator({ ...base(), v: 2, about: 'One pixel at a point, rounded.' });
  assert.deepEqual(r.versionsOf('blip'), [1, 2]);
  assert.deepEqual(r.generators().map((x) => x.key), ['blip@1', 'blip@2']);
  assert.deepEqual(r.versionsOf('nope'), []);
});

test('declarations that break the rules throw at load time', () => {
  const r = createRegistry();
  const bad = (patch, re) => assert.throws(() => r.defineGenerator({ ...base(), ...patch }), re);
  bad({ id: 'Blip' }, /id/);
  bad({ id: 'sky..bands' }, /id/);
  bad({ id: 'x'.repeat(41) }, /id/);
  bad({ v: 0 }, /version/);
  bad({ v: 1.5 }, /version/);
  bad({ family: '' }, /family/);
  bad({ about: '' }, /about/);
  bad({ about: 'x'.repeat(301) }, /about/);
  bad({ args: { at: { type: 'point' } } }, /type/);
  bad({ args: { 'bad name': point() } }, /argument name/);
  for (const f of ['gen', 'v', 'on', 'z', 'when']) bad({ args: { [f]: point() } }, /reserved/);
  bad({ cost: 3 }, /cost/);
  bad({ run: null }, /run/);
  bad({ keyable: ['nope'] }, /keyable/);
  bad({ wraps: 'yes' }, /wraps/);
  bad({ colour: 'red' }, /unknown field/);
  assert.deepEqual(r.generators(), [], 'nothing half-registered');
});

test('an entry\'s cost and run work when called with fewer arguments (catalog/sprite-schema.js calls cost(args))', () => {
  const r = createRegistry();
  r.defineGenerator(base());
  r.defineGenerator({
    id: 'pair', v: 1, family: 'test', about: 'Two of a thing.', args: { thing: place() },
    cost: (a, { costOf }) => 2 * costOf(a.thing),
    run: (a, ctx, { call }) => [0, 4].flatMap((x) => (a.thing.gen ? call({ ...a.thing, at: [x, 0] }, ctx) : [{ ...a.thing, at: [x, 0] }])),
  });
  const g = r.generator('pair', 1);
  assert.equal(g.cost({ thing: { kind: 'dot', paint: 'ink' } }), 2);
  assert.equal(g.cost({ thing: { gen: 'blip', v: 1, paint: 'ink' } }), 2);
  assert.equal(g.run({ thing: { gen: 'blip', v: 1, paint: 'ink' } }).length, 2, 'run with no ctx: defaults');
});

test('the call fields and limits are fixed and documented', () => {
  for (const f of ['gen', 'v', 'id', 'on', 'z', 'when', 'group', 'hidden', 'glow', 'part', 'clip']) assert.ok(CALL_FIELDS.includes(f), f);
  assert.equal(GEN_LIMITS.calls, 64, 'generator calls per frame (section 2.7 caps)');
  assert.equal(GEN_LIMITS.primitives, 4000, 'primitives after expansion per frame');
  assert.ok(GEN_LIMITS.depth >= 2 && GEN_LIMITS.depth <= 8);
});

test('describe() is the plain JSON the build writes to generated/generators.json', () => {
  const r = createRegistry();
  r.defineGenerator({ ...base(), keyable: ['size'], args: { ...base().args, shape: word(['round', 'square'], { default: 'round', about: 'Outline' }), r: px(0, 4, { default: 1 }) } });
  const d = r.describe();
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
  assert.equal(d.version, 1);
  assert.equal(d.generators.length, 1);
  const g = d.generators[0];
  assert.deepEqual(Object.keys(g), ['id', 'v', 'key', 'family', 'about', 'args', 'keyable', 'wraps']);
  assert.deepEqual(g.args.shape, { type: 'word', values: ['round', 'square'], default: 'round', optional: true, binding: true, about: 'Outline' });
  assert.deepEqual(g.args.at, { type: 'point', lo: -640, hi: 640, optional: false, binding: true });
  assert.deepEqual(g.keyable, ['size']);
});

test('the site registry (engine/gen/index.js) lists its first generators, each documented and pinned', async () => {
  const gen = await import('../../engine/gen/index.js');
  const keys = gen.generators().map((g) => g.key);
  for (const k of ['twinkle@1', 'mark@1', 'row@1']) assert.ok(keys.includes(k), k);
  for (const g of gen.generators()) {
    assert.match(g.about, /^[A-Z].*\.$/, `${g.key}: about is one sentence`);
    // A motion may take none: node.hide@1 is placed by its call's own `when` and `clip` (F4).
    if (g.family !== 'motion') assert.ok(Object.keys(g.args).length > 0, `${g.key} takes arguments`);
  }
  const d = gen.describeGenerators();
  assert.equal(d.generators.length, keys.length);
});
