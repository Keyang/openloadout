// engine/gen/registry.js: checking a call before anything draws (unknown refused, types, cost budget) and running it
// (pure, deterministic, returns primitives, never throws). docs/data-sprites.md 3.1, 3.2, 3.4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, GEN_LIMITS, CTX_FIELDS } from '../../engine/gen/registry.js';
import { px, count, word, paint, point, place, share } from '../../engine/gen/args.js';

function reg() {
  const r = createRegistry();
  r.defineGenerator({
    id: 'blip', v: 1, family: 'test', about: 'One pixel at a point.',
    args: { at: point(), paint: paint(), size: count(1, 2, { default: 1 }) },
    cost: () => 1,
    run: (a) => [{ kind: 'dot', at: a.at, size: a.size, paint: a.paint }],
  });
  r.defineGenerator({
    id: 'dots', v: 1, family: 'test', about: 'A row of n pixels.', keyable: ['n'],
    args: { at: point(), n: count(0, 3000), paint: paint(), style: word(['a', 'b'], { default: 'a' }) },
    cost: (a) => a.n,
    run: (a) => Array.from({ length: a.n }, (_, i) => ({ kind: 'dot', at: [a.at[0] + i, a.at[1]], paint: a.paint })),
  });
  r.defineGenerator({
    id: 'liar', v: 1, family: 'test', about: 'Returns more than its cost says.',
    args: { at: point() }, cost: () => 1,
    run: (a) => [{ kind: 'dot', at: a.at, paint: 'ink' }, { kind: 'dot', at: a.at, paint: 'ink' }],
  });
  r.defineGenerator({
    id: 'broken', v: 1, family: 'test', about: 'Throws, returns junk or returns a function.',
    args: { how: word(['throw', 'junk', 'fn', 'hex', 'notlist']) }, cost: () => 1,
    run: (a) => {
      if (a.how === 'throw') throw new Error('boom');
      if (a.how === 'junk') return [{ kind: 'blob' }];
      if (a.how === 'fn') return [{ kind: 'dot', at: [0, 0], paint: 'ink', f: () => 1 }];
      if (a.how === 'hex') return [{ kind: 'dot', at: [0, 0], paint: '#ffffff' }];
      return 'nope';
    },
  });
  r.defineGenerator({
    id: 'peek', v: 1, family: 'test', about: 'Tries to change its arguments and context.',
    args: { at: point() }, cost: () => 1,
    run: (a, ctx) => { a.at[0] = 99; ctx.t = 5; return []; },
  });
  r.defineGenerator({
    id: 'spread', v: 1, family: 'test', about: 'Places one thing at each of n points.',
    args: { at: point({ default: [0, 0] }), n: count(1, 64), thing: place() },
    cost: (a, { costOf }) => a.n * costOf(a.thing),
    run: (a, ctx, { call }) => {
      const out = [];
      for (let i = 0; i < a.n; i++) {
        if (Object.hasOwn(a.thing, 'gen')) out.push(...call({ ...a.thing, at: [i, 0] }, ctx));
        else out.push({ ...a.thing, at: [i, 0] });
      }
      return out;
    },
  });
  r.defineGenerator({
    id: 'clock', v: 1, family: 'test', about: 'Moves with the clip phase.',
    args: { amount: share() }, cost: () => 1,
    run: (a, ctx) => [{ kind: 'dot', at: [Math.round(4 * Math.sin(2 * Math.PI * ctx.t) * a.amount), 0], paint: 'ink' }],
  });
  return r;
}

test('checkCall: unknown id, unknown version and unknown arguments are refused', () => {
  const r = reg();
  assert.match(r.checkCall({ gen: 'nope', v: 1 }).errors.join(), /no generator "nope"/);
  assert.match(r.checkCall({ gen: 'blip', v: 3 }).errors.join(), /blip.*version 3.*1/);
  assert.match(r.checkCall({ gen: 'blip' }).errors.join(), /v/);
  assert.match(r.checkCall({ gen: 'blip', v: 1, at: [1, 1], paint: 'gold', colour: 'red' }).errors.join(), /unknown argument "colour"/);
  assert.match(r.checkCall({ gen: 'blip', v: 1, paint: 'gold' }).errors.join(), /at.*missing/);
  assert.match(r.checkCall({ gen: 'blip', v: 1, at: [1, 1], paint: 'gold', size: 3 }).errors.join(), /size/);
  const good = r.checkCall({ gen: 'blip', v: 1, at: [1, 1], paint: 'gold', z: 4, on: 'coin', when: { shine: [true] } });
  assert.deepEqual(good, { ok: true, errors: [], cost: 1 });
});

test('checkCall: bindings allowed for validation; cost is the worst case over them', () => {
  const r = reg();
  const node = { gen: 'dots', v: 1, at: [0, 0], paint: 'gold', n: { from: 'amount', map: [[0, 4], [1, 12]], round: 'px' } };
  assert.deepEqual(r.checkCall(node), { ok: true, errors: [], cost: 12 });
  assert.equal(r.checkCall({ ...node, n: { from: 'style', pick: { few: 2, many: 30 } } }).cost, 30);
  assert.equal(r.checkCall(node, { bindings: false }).ok, false, 'a run needs resolved numbers');
  assert.equal(r.checkCall(node, { controls: ['amount'] }).ok, true);
  assert.equal(r.checkCall(node, { controls: ['size'] }).ok, false);
});

test('checkCall: the summed cost over a budget is refused before anything draws', () => {
  const r = reg();
  const v = r.checkCall({ gen: 'dots', v: 1, at: [0, 0], paint: 'gold', n: 3000 }, { budget: 2000 });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /cost 3000.*2000/);
  assert.equal(v.cost, 3000);
});

test('checkCall: nested places are checked and costed through the registry', () => {
  const r = reg();
  const v = r.checkCall({ gen: 'spread', v: 1, n: 10, thing: { gen: 'dots', v: 1, paint: 'gold', n: 3 } });
  assert.equal(v.ok, true, v.errors.join());
  assert.equal(v.cost, 30);
  assert.match(r.checkCall({ gen: 'spread', v: 1, n: 2, thing: { gen: 'nope', v: 1 } }).errors.join(), /nope/);
  assert.match(r.checkCall({ gen: 'spread', v: 1, n: 2, thing: { gen: 'dots', v: 1, paint: 'gold', n: 9999 } }).errors.join(), /n/);
  let deep = { kind: 'dot', paint: 'ink' };
  const nest = (levels) => { let d = { kind: 'dot', paint: 'ink' }; for (let i = 0; i < levels; i++) d = { gen: 'spread', v: 1, n: 1, thing: d }; return d; };
  assert.equal(r.checkCall(nest(GEN_LIMITS.depth + 1)).ok, true, 'the top call and depth levels below it');
  deep = nest(GEN_LIMITS.depth + 2);
  assert.match(r.checkCall(deep).errors.join(), /deep/);
});

test('runGenerator: defaults filled, call fields carried onto the primitives, ok result', () => {
  const r = reg();
  const out = r.runGenerator({ gen: 'blip', v: 1, at: [3, 4], paint: 'gold', z: 7, on: 'coin', glow: true, group: 'body', part: 'shine', when: { a: ['b'] } });
  assert.deepEqual(out, { ok: true, errors: [], cost: 1, primitives: [{ kind: 'dot', at: [3, 4], size: 1, paint: 'gold', z: 7, on: 'coin', glow: true, group: 'body', part: 'shine' }] });
});

test('runGenerator: never throws; refuses bindings, bad args, junk output and lies about cost', () => {
  const r = reg();
  const no = (node, re) => {
    let v;
    assert.doesNotThrow(() => { v = r.runGenerator(node); });
    assert.equal(v.ok, false, JSON.stringify(node));
    assert.deepEqual(v.primitives, []);
    if (re) assert.match(v.errors.join('\n'), re);
  };
  no({ gen: 'dots', v: 1, at: [0, 0], paint: 'gold', n: { from: 'a', map: [[0, 1], [1, 2]], round: 'px' } }, /binding/);
  no({ gen: 'blip', v: 1, at: [0, 0], paint: '#ff0000' });
  no({ gen: 'liar', v: 1, at: [0, 0] }, /more than its cost/);
  no({ gen: 'broken', v: 1, how: 'throw' }, /boom/);
  no({ gen: 'broken', v: 1, how: 'junk' }, /blob/);
  no({ gen: 'broken', v: 1, how: 'fn' });
  no({ gen: 'broken', v: 1, how: 'hex' });
  no({ gen: 'broken', v: 1, how: 'notlist' }, /list/);
  no(null); no('twinkle'); no([]); no({ gen: 'nope', v: 1 });
  const over = r.runGenerator({ gen: 'dots', v: 1, at: [0, 0], paint: 'gold', n: 3000 }, {}, { budget: 100 });
  assert.equal(over.ok, false);
  assert.match(over.errors.join(), /cost 3000.*100/);
});

test('runGenerator: a generator cannot change its arguments or the context', () => {
  const r = reg();
  const node = { gen: 'peek', v: 1, at: [1, 2] };
  const ctx = { t: 0.25 };
  const v = r.runGenerator(node, ctx);
  assert.equal(v.ok, false, 'writing to frozen arguments fails the call');
  assert.deepEqual(node.at, [1, 2]);
  assert.equal(ctx.t, 0.25);
});

test('runGenerator: the context is checked and filled', () => {
  const r = reg();
  assert.deepEqual([...CTX_FIELDS], ['t', 'frame', 'frames', 'loop', 'size', 'clip', 'direction']);
  assert.equal(r.runGenerator({ gen: 'clock', v: 1, amount: 1 }).ok, true, 'no context: t = 0');
  assert.equal(r.runGenerator({ gen: 'clock', v: 1, amount: 1 }, { t: NaN }).ok, false);
  assert.equal(r.runGenerator({ gen: 'clock', v: 1, amount: 1 }, { t: 0.5, size: [9999, 9999] }).ok, false);
  assert.equal(r.runGenerator({ gen: 'clock', v: 1, amount: 1 }, { t: 0.5, secret: 1 }).ok, false);
  const a = r.runGenerator({ gen: 'clock', v: 1, amount: 1 }, { t: 0.25 }).primitives;
  const b = r.runGenerator({ gen: 'clock', v: 1, amount: 1 }, { t: 0.25 }).primitives;
  assert.deepEqual(a, b, 'deterministic');
  assert.deepEqual(a, [{ kind: 'dot', at: [4, 0], paint: 'ink' }]);
});

test('runGenerator: nested calls run through the registry and count toward depth', () => {
  const r = reg();
  const v = r.runGenerator({ gen: 'spread', v: 1, n: 3, thing: { gen: 'blip', v: 1, paint: 'gold' } });
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(v.primitives.map((p) => p.at), [[0, 0], [1, 0], [2, 0]]);
  const s = r.runGenerator({ gen: 'spread', v: 1, n: 2, thing: { kind: 'stamp', rows: ['a'], key: { a: 'gold' } } });
  assert.deepEqual(s.primitives, [{ kind: 'stamp', rows: ['a'], key: { a: 'gold' }, at: [0, 0] }, { kind: 'stamp', rows: ['a'], key: { a: 'gold' }, at: [1, 0] }]);
});

test('expandList: primitives pass, calls expand in place, budgets hold', () => {
  const r = reg();
  const list = [
    { kind: 'rect', at: [0, 0], size: [2, 2], paint: 'gold' },
    { gen: 'blip', v: 1, at: [5, 5], paint: 'gold', z: 2 },
    { kind: 'outline', paint: 'ink' },
  ];
  const v = r.expandList(list);
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(v.primitives.map((p) => p.kind), ['rect', 'dot', 'outline']);
  assert.equal(v.calls, 1);
  assert.equal(v.cost, 1);
  const many = Array.from({ length: GEN_LIMITS.calls + 1 }, () => ({ gen: 'blip', v: 1, at: [0, 0], paint: 'ink' }));
  assert.match(r.expandList(many).errors.join(), /calls/);
  const big = [{ gen: 'dots', v: 1, at: [0, 0], paint: 'ink', n: 2500 }, { gen: 'dots', v: 1, at: [0, 0], paint: 'ink', n: 2500 }];
  const o = r.expandList(big);
  assert.equal(o.ok, false);
  assert.match(o.errors.join(), /4000/);
  assert.deepEqual(o.primitives, [], 'nothing half-drawn');
  assert.equal(r.expandList([{ kind: 'blob' }]).ok, false);
  assert.equal(r.expandList('nope').ok, false);
});
