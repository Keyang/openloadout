// engine/gen/registry.js and engine/gen/args.js under hostile or awkward data (docs/data-sprites.md 3.4): call fields
// checked by type, worst-case cost that really is the worst case over every bound setting, costing that cannot hang
// the page, paints in pieces checked, prototype keys and getters refused, primitive caps (section 2.7) held, and an
// entry's bare cost(args) agreeing with checkCall. Written for the B2 review of 2026-11-19.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry, GEN_LIMITS, CALL_FIELDS } from '../../engine/gen/registry.js';
import { px, count, word, paint, paints, point, place, primitives, struct, checkArg, checkPrimitive, FIXED_PAINTS } from '../../engine/gen/args.js';
import * as site from '../../engine/gen/index.js';

function reg() {
  const r = createRegistry();
  r.defineGenerator({
    id: 'blip', v: 1, family: 'test', about: 'One pixel at a point.',
    args: { at: point(), paint: paint() }, cost: () => 1,
    run: (a) => [{ kind: 'dot', at: a.at, paint: a.paint }],
  });
  r.defineGenerator({
    id: 'placer', v: 1, family: 'test', about: 'Count copies of a thing near a point.',
    args: { at: point({ default: [0, 0] }), count: count(1, 64), place: place() },
    cost: (a, { costOf }) => a.count * costOf(a.place),
    run: (a, ctx, { call }) => Array.from({ length: a.count }, (_, i) => i).flatMap((i) => {
      const p = [a.at[0] + i, a.at[1]];
      return Object.hasOwn(a.place, 'gen') ? call({ ...a.place, at: p }, ctx) : [{ ...a.place, at: p }];
    }),
  });
  r.defineGenerator({
    id: 'grid', v: 1, family: 'test', about: 'A by b dots.',
    args: { a: count(1, 64), b: count(1, 64), paint: paint({ default: 'ink' }) },
    cost: (x) => x.a * x.b,
    run: (x) => Array.from({ length: x.a * x.b }, (_, i) => ({ kind: 'dot', at: [i % x.a, Math.floor(i / x.a)], paint: x.paint })),
  });
  r.defineGenerator({
    id: 'spaced', v: 1, family: 'test', about: 'Dots every gap pixels across a 64 px square: fewer as the gap grows.',
    args: { gap: px(0.1, 64) },
    cost: (x) => Math.ceil(64 / x.gap) ** 2,
    run: () => [],
  });
  r.defineGenerator({
    id: 'below', v: 1, family: 'test', about: 'One row of dots for each pixel below a point.',
    args: { at: point() },
    cost: (x) => Math.max(0, Math.ceil(x.at[1])),
    run: () => [],
  });
  r.defineGenerator({
    id: 'nested', v: 1, family: 'test', about: 'Reads a number inside a struct.',
    args: { opts: struct({ n: count(0, 100), tint: paint({ default: 'ink' }) }), paints: paints(4, { default: ['ink'] }) },
    cost: (x) => x.opts.n,
    run: () => [],
  });
  r.defineGenerator({
    id: 'halves', v: 1, family: 'test', about: 'Cost grows with a size in half pixels.',
    args: { size: px(0, 4) },
    cost: (x) => Math.round(x.size * 100),
    run: () => [],
  });
  r.defineGenerator({
    id: 'nothing', v: 1, family: 'test', about: 'Returns nothing and says it costs nothing.',
    args: { at: point({ default: [0, 0] }) }, cost: () => 0, run: () => [],
  });
  r.defineGenerator({
    id: 'bunch', v: 1, family: 'test', about: 'Draws a list of things.',
    args: { items: primitives() },
    cost: (x, { costOf }) => x.items.reduce((s, it) => s + costOf(it), 0),
    run: () => [],
  });
  return r;
}

const pick = (from, values) => ({ from, pick: Object.fromEntries(values.map((v, i) => [`o${i}`, v])) });
const range = (lo, n) => Array.from({ length: n }, (_, i) => lo + i);
const fn = () => 1;

// ---- 1. call fields ----------------------------------------------------------------------------------------------

test('call fields are checked by type: z, group, part, id, on, when, hidden, glow, clip, shade, light, far', () => {
  const r = reg();
  const call = { gen: 'blip', v: 1, at: [8, 8], paint: 'gold' };
  const okCall = (extra, opts) => { const v = r.checkCall({ ...call, ...extra }, opts); assert.equal(v.ok, true, `${JSON.stringify(extra)}: ${v.errors.join('; ')}`); };
  const bad = (extra, re, opts) => {
    let v;
    assert.doesNotThrow(() => { v = r.checkCall({ ...call, ...extra }, opts); });
    assert.equal(v.ok, false, `${Object.keys(extra).join()} should be refused`);
    if (re) assert.match(v.errors.join('\n'), re);
    const run = r.runGenerator({ ...call, ...extra });
    assert.equal(run.ok, false, `run: ${Object.keys(extra).join()} should be refused`);
    assert.deepEqual(run.primitives, []);
  };
  okCall({ z: -100, group: 'body', part: 'shine', id: 'spark', on: 'coin', glow: true, hidden: false, clip: ['spin', 'idle_side'], shade: 2, light: 1, far: true });
  okCall({ when: { shine: [true], style: ['a', 'b'] } });
  okCall({ when: [{ shine: [true] }, { size: [1, 2] }] });
  okCall({ z: { from: 'depth', map: [[0, -4], [1, 4]] }, hidden: { from: 'shine', pick: { true: false, false: true } } });
  bad({ z: 'abc' }, /z/);
  bad({ z: 99999 }, /z/);
  bad({ z: NaN }, /z/);
  bad({ when: fn }, /when/);
  bad({ when: { shine: 'yes' } }, /when/);
  bad({ when: { 'Bad Key': [1] } }, /when/);
  bad({ when: { shine: [{ deep: 1 }] } }, /when/);
  bad({ hidden: { a: 1 } }, /hidden/);
  bad({ group: { evil: 'x'.repeat(1000) } }, /group/);
  bad({ group: 'x'.repeat(41) }, /group/);
  bad({ on: '#ff0000' }, /on/);
  bad({ part: 12 }, /part/);
  bad({ id: 'Bad id!' }, /id/);
  bad({ glow: 'yes' }, /glow/);
  bad({ clip: 'spin' }, /clip/);
  bad({ clip: [] }, /clip/);
  bad({ shade: 9 }, /shade/);
  bad({ light: -1 }, /light/);
  bad({ far: 'x' }, /far/);
  // run mode: every call field resolved
  assert.equal(r.runGenerator({ ...call, z: { from: 'depth', map: [[0, -4], [1, 4]] } }).ok, false, 'a bound z is resolved before a run');
  // controls: a when names known controls
  okCall({ when: { shine: [true] } }, { controls: ['shine'] });
  const unknown = r.checkCall({ ...call, when: { gloss: [true] } }, { controls: ['shine'] });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors.join(), /gloss/);
});

test('the call itself is plain data: functions, prototype keys and getters on any field are refused', () => {
  const r = reg();
  const v = r.checkCall({ gen: 'blip', v: 1, at: [8, 8], paint: 'gold', when: () => 1 });
  assert.equal(v.ok, false);
  const proto = JSON.parse('{"gen":"blip","v":1,"at":[8,8],"paint":"gold","__proto__":{"polluted":1}}');
  assert.match(r.checkCall(proto).errors.join(), /__proto__.*not allowed/);
  const getter = { gen: 'blip', v: 1, at: [8, 8], paint: 'gold' };
  Object.defineProperty(getter, 'z', { get() { throw new Error('ran'); }, enumerable: true });
  assert.match(r.checkCall(getter).errors.join(), /getter/);
});

test('call fields carried onto each primitive are the checked ones: on, z, group, glow, part, shade, light, far', () => {
  const r = reg();
  for (const f of ['shade', 'light', 'far']) assert.ok(CALL_FIELDS.includes(f), f);
  const out = r.runGenerator({ gen: 'blip', v: 1, at: [1, 1], paint: 'gold', on: 'coin', z: 4, group: 'g', glow: true, part: 'p', shade: 2, light: 1, far: true, id: 'x', when: { a: ['b'] }, clip: ['spin'] });
  assert.equal(out.ok, true, out.errors.join());
  assert.deepEqual(out.primitives, [{ kind: 'dot', at: [1, 1], paint: 'gold', on: 'coin', z: 4, group: 'g', glow: true, part: 'p', shade: 2, light: 1, far: true }]);
});

// ---- 2. worst-case cost ---------------------------------------------------------------------------------------------

test('cost: two picks are costed together, so a product over the budget is refused before anything draws', () => {
  const r = reg();
  const v = r.checkCall({ gen: 'grid', v: 1, a: pick('w', range(1, 64)), b: pick('h', range(1, 64)) });
  assert.equal(v.cost, 4096);
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /4096.*4000/);
  const fits = r.checkCall({ gen: 'grid', v: 1, a: pick('w', range(1, 64)), b: pick('h', range(1, 62)) });
  assert.deepEqual(fits, { ok: true, errors: [], cost: 3968 });
});

test('cost: a table is costed at both ends of what it can give, so a cost that falls as the value grows is caught', () => {
  const r = reg();
  const v = r.checkCall({ gen: 'spaced', v: 1, gap: { from: 'gap', map: [[0, 0.1], [1, 64]] } });
  assert.equal(v.cost, 409600);
  assert.equal(v.ok, false);
  // a table whose middle point is its least output
  assert.equal(r.checkCall({ gen: 'spaced', v: 1, gap: { from: 'gap', map: [[0, 16], [0.5, 2], [1, 16]] } }).cost, 1024);
  // every value it gives between its points runs within that cost
  for (const gap of [2, 2.5, 7, 16]) assert.ok(r.runGenerator({ gen: 'spaced', v: 1, gap }).cost <= 1024);
});

test('cost: each coordinate of a point is costed at every option it can take', () => {
  const r = reg();
  assert.equal(r.checkCall({ gen: 'below', v: 1, at: [0, pick('h', [10, 300, 20])] }).cost, 300);
  assert.equal(r.checkCall({ gen: 'below', v: 1, at: [0, { from: 'h', map: [[0, 300], [1, 4]] }] }).cost, 300);
});

test('cost: bindings inside a struct or a paint list are resolved before the cost is asked', () => {
  const r = reg();
  const v = r.checkCall({ gen: 'nested', v: 1, opts: { n: { from: 'n', map: [[0, 1], [1, 90]], round: 'px' } }, paints: [pick('p', ['ink', 'gold'])] });
  assert.deepEqual(v, { ok: true, errors: [], cost: 90 });
});

test('cost: rounding of a table (px, half) is applied before costing', () => {
  const r = reg();
  assert.equal(r.checkCall({ gen: 'halves', v: 1, size: { from: 's', map: [[0, 1.3], [1, 2.2]], round: 'half' } }).cost, 200);
  assert.equal(r.checkCall({ gen: 'halves', v: 1, size: { from: 's', map: [[0, 1.3], [1, 2.2]], round: 'px' } }).cost, 200);
  assert.equal(r.checkCall({ gen: 'halves', v: 1, size: { from: 's', map: [[0, 1.3], [1, 2.2]] } }).cost, 220);
});

test('cost: only the bound arguments the cost reads are combined; too many combinations are refused, not tried', () => {
  const r = reg();
  // the paint pick is not read by the cost: 64 x 62 combinations, not 64 x 62 x 64
  const v = r.checkCall({ gen: 'grid', v: 1, a: pick('w', range(1, 64)), b: pick('h', range(1, 62)), paint: pick('c', range(0, 64).map((i) => `c${i}`)) });
  assert.deepEqual(v, { ok: true, errors: [], cost: 3968 });
  r.defineGenerator({
    id: 'triple', v: 1, family: 'test', about: 'Three numbers added.',
    args: { a: count(0, 64), b: count(0, 64), c: count(0, 64) },
    cost: (x) => x.a + x.b + x.c, run: () => [],
  });
  const t0 = Date.now();
  const many = r.checkCall({ gen: 'triple', v: 1, a: pick('a', range(0, 64)), b: pick('b', range(1, 64)), c: pick('c', range(0, 64)) });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(many.ok, false);
  assert.match(many.errors.join(), /combinations/);
  assert.ok(GEN_LIMITS.costCombos >= 4096);
});

// ---- 3. costing cannot hang the page --------------------------------------------------------------------------------

test('cost: nested placers with many options are costed in time (each nested call is costed once)', () => {
  const r = reg();
  const nest = (levels) => {
    let d = { kind: 'dot', paint: 'ink' };
    for (let i = 0; i < levels; i++) d = { gen: 'placer', v: 1, count: pick('n', range(1, 64)), place: d };
    return d;
  };
  for (const levels of [3, 4, GEN_LIMITS.depth + 1]) {
    const t0 = Date.now();
    const v = r.checkCall(nest(levels));
    const ms = Date.now() - t0;
    assert.ok(ms < 1000, `${levels} levels took ${ms} ms`);
    assert.equal(v.ok, false, 'over the budget');
    assert.equal(v.cost, 64 ** levels);
  }
});

test('cost: a nested call costs at least 1, so calls that return nothing cannot multiply without limit', () => {
  const r = reg();
  const node = { gen: 'placer', v: 1, count: 64, place: { gen: 'placer', v: 1, count: 64, place: { gen: 'nothing', v: 1 } } };
  const v = r.checkCall(node);
  assert.equal(v.cost, 4096);
  assert.equal(v.ok, false);
  const t0 = Date.now();
  assert.equal(r.runGenerator(node).ok, false);
  assert.ok(Date.now() - t0 < 1000);
});

test('cost: the work of costing one call is capped', () => {
  const r = reg();
  r.defineGenerator({
    id: 'pair', v: 1, family: 'test', about: 'a times b, nothing drawn.',
    args: { a: count(1, 64), b: count(1, 64), k: count(0, 999) },
    cost: (x) => (x.a * x.b) % 7, run: () => [],
  });
  // 400 different calls, each 64 x 64 combinations: far more costing than any real sprite needs
  const items = range(0, 400).map((k) => ({ gen: 'pair', v: 1, a: pick('a', range(1, 64)), b: pick('b', range(1, 64)), k }));
  const t0 = Date.now();
  const v = r.checkCall({ gen: 'bunch', v: 1, items });
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, `took ${ms} ms`);
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /too much/);
});

// ---- 4. paints in pieces --------------------------------------------------------------------------------------------

test('a piece placed or used checks its paint map and refuses unknown fields', () => {
  const r = reg();
  const placer = (thing) => r.checkCall({ gen: 'placer', v: 1, count: 2, place: thing });
  assert.equal(placer({ use: 'stamp:clod', v: 1, paint: { a: 'soil.dark' } }).ok, true);
  assert.equal(placer({ use: 'stamp:clod', v: 1, paint: { a: pick('soil', ['soil', 'soil.dark']) } }).ok, true);
  assert.equal(placer({ use: 'held:sword', v: 1, args: { length: { from: 'len', map: [[0, 10], [1, 18]] } } }).ok, true);
  assert.match(placer({ use: 'stamp:clod', v: 1, paint: { a: '#ff0000' } }).errors.join(), /paint/);
  assert.match(placer({ use: 'stamp:clod', v: 1, paint: '#ff0000' }).errors.join(), /paint/);
  assert.match(placer({ use: 'stamp:clod', v: 1, paint: { 'Bad Slot': 'ink' } }).errors.join(), /paint/);
  assert.match(placer({ use: 'stamp:clod', v: 1, anything: { x: 1 } }).errors.join(), /anything/);
  assert.equal(placer({ use: 'stamp:clod', v: 1, args: fn }).ok, false);
  const run = r.runGenerator({ gen: 'placer', v: 1, count: 2, place: { use: 'stamp:clod', v: 1, paint: { a: '#ff0000' }, anything: { x: 1 } } });
  assert.equal(run.ok, false);
  const list = r.expandList([{ kind: 'use', use: 'stamp:clod', v: 1, paint: '#ff0000' }]);
  assert.equal(list.ok, false);
  assert.equal(r.expandList([{ kind: 'use', use: 'stamp:clod', v: 1, at: [3, 3], paint: { a: 'soil.dark' } }]).ok, true);
});

// ---- 5. prototype keys and getters ------------------------------------------------------------------------------------

test('prototype keys are refused by the plain-data guard wherever they sit', () => {
  const guard = /"(__proto__|constructor|prototype)" is not allowed/;
  const parse = (s) => JSON.parse(s);
  assert.match(checkArg(place(), parse('{"use":"stamp:clod","v":1,"__proto__":{"polluted":1}}')).join(), guard);
  assert.match(checkArg(paint(), parse('{"rule":"tone","of":"gold","__proto__":{"x":1}}')).join(), guard);
  assert.match(checkArg(paint(), { rule: 'tone', of: 'gold', constructor: 1 }).join(), guard);
  assert.match(checkArg(struct({ depth: px(0, 1) }), parse('{"depth":0.5,"__proto__":{"x":1}}')).join(), guard);
  assert.match(checkArg(struct({ depth: px(0, 1) }), { depth: 0.5, prototype: 1 }).join(), guard);
  assert.match(checkPrimitive(parse('{"kind":"dot","at":[1,1],"paint":"ink","__proto__":{"x":1}}')).join(), guard);
  assert.match(checkPrimitive({ kind: 'stamp', at: [0, 0], rows: ['a'], key: { a: 'ink', constructor: 'ink' } }).join(), guard);
  const r = reg();
  assert.match(r.checkCall(parse('{"gen":"placer","v":1,"count":2,"place":{"use":"stamp:clod","v":1,"__proto__":{"polluted":1}}}')).errors.join(), guard);
  assert.match(r.checkCall(parse('{"gen":"blip","v":1,"at":[1,1],"paint":{"rule":"tone","__proto__":{"x":1}}}')).errors.join(), guard);
});

test('getters are refused as getters, on any field, without being run', () => {
  const getter = (o, k) => { Object.defineProperty(o, k, { get() { throw new Error('ran'); }, enumerable: true }); return o; };
  assert.match(checkArg(paint(), getter({ rule: 'tone' }, 'of')).join(), /getter/);
  assert.match(checkArg(place(), getter({ kind: 'dot' }, 'paint')).join(), /getter/);
  assert.match(checkArg(struct({ depth: px(0, 1) }), getter({}, 'depth')).join(), /getter/);
  assert.match(checkPrimitive(getter({ kind: 'stamp', at: [0, 0], key: { a: 'ink' } }, 'rows')).join(), /getter/);
  assert.match(checkArg(point(), getter([0, 0], '1')).join(), /getter/);
});

// ---- 6. paints: section 2.6 -------------------------------------------------------------------------------------------

test('the fixed paints are the ones section 2.6 lists (ink, clear); twinkle@1 names its core', () => {
  assert.deepEqual([...FIXED_PAINTS], ['ink', 'clear']);
  const tw = site.generator('twinkle', 1);
  assert.equal(tw.args.core.optional, false, 'core is a palette slot the sprite names (white is not a fixed paint)');
  assert.equal(site.runGenerator({ gen: 'twinkle', v: 1, at: [4, 4], size: 1, paint: 'gold' }).ok, false);
  assert.equal(site.runGenerator({ gen: 'twinkle', v: 1, at: [4, 4], size: 1, paint: 'gold', core: 'shine' }).ok, true);
});

// ---- 7. primitive caps (section 2.7) -----------------------------------------------------------------------------------

test('primitives: fields are checked by kind, unknown fields refused, caps held', () => {
  const bad = (p, re) => { const e = checkPrimitive(p); assert.ok(e.length > 0, `${JSON.stringify(p).slice(0, 80)} should be refused`); if (re) assert.match(e.join('\n'), re); };
  const good = (p) => assert.deepEqual(checkPrimitive(p), [], JSON.stringify(p).slice(0, 80));
  good({ kind: 'ellipse', at: [0, 0], r: [3, 2], turn: 30, paint: 'gold', shade: 1, light: 1 });
  good({ kind: 'ellipse', at: [0, 0], r: 3, paint: 'gold' });
  good({ kind: 'poly', points: [[0, 0], [4, 0], [2, 3]], paint: 'gold' });
  good({ kind: 'text', at: [2, 10], text: 'SCORE 100!', font: 'font:chunky@1', cap: 7, align: 'centre', paint: 'ink', outline: 'none' });
  good({ kind: 'arc', at: [8, 8], r: 4, a0: 0, a1: 180, thick: 2, paint: 'gold' });
  good({ kind: 'line', from: [0, 0], to: [4, 4], thick: 1, paint: 'ink' });
  good({ kind: 'limb', from: [0, 0], to: [0, 6], width: 3, paint: 'skin', bone: 'armF' });
  good({ kind: 'capsule', from: [0, 0], to: [0, 6], r: [2, 1], paint: 'skin' });
  good({ kind: 'dither', area: { kind: 'rect', at: [0, 0], size: [8, 8] }, pattern: 'bayer4', amount: 0.5, paint: 'sky.dark' });
  good({ kind: 'bands', area: { kind: 'ellipse', at: [8, 8], r: 6 }, dir: 'out', stops: ['sun.light', 'sun'], edges: 'dither' });
  good({ kind: 'cut', shape: { kind: 'ellipse', at: [4, 4], r: 2 }, from: 'body' });
  good({ kind: 'outline', paint: 'ink', only: 'body', sides: 'all' });
  good({ kind: 'tint', paint: 'flash', when: { hurt: [true] } });
  good({ kind: 'stamp', at: [0, 0], rows: ['ab'], key: { a: 'ink', b: 'eye' }, mirror: true, variants: { blink: ['aa'] }, variant: 'blink' });
  bad({ kind: 'ellipse', at: [0, 0], r: 1e9 }, /r/);
  bad({ kind: 'ellipse', at: [0, 0], r: [3] }, /r/);
  bad({ kind: 'text', at: [0, 0], text: 'x'.repeat(5000) }, /40/);
  bad({ kind: 'text', at: [0, 0], text: 'tab\there' }, /text/);
  bad({ kind: 'text', at: [0, 0], text: 'x', cap: 6 }, /cap/);
  bad({ kind: 'poly', points: 'nope' }, /points/);
  bad({ kind: 'poly', points: [[0, 0], [1, 1]] }, /points/);
  bad({ kind: 'poly', points: range(0, 65).map((i) => [i, i % 2]) }, /64/);
  bad({ kind: 'rect', at: [0, 0], size: [1e6, 2] }, /size/);
  bad({ kind: 'dot', at: [0, 0], size: 3 }, /size/);
  bad({ kind: 'line', from: [0, 0], to: [1, 1], thick: 1e6 }, /thick/);
  bad({ kind: 'limb', from: [0, 0], to: [1, 1], width: 0.5 }, /width/);
  bad({ kind: 'arc', at: [0, 0], r: 3, a0: 0, a1: 1e9 }, /a1/);
  bad({ kind: 'dot', at: [0, 0], paint: 'ink', colour: 'red' }, /colour/);
  bad({ kind: 'dither', area: { kind: 'rect', at: [0, 0], size: [8, 8] }, pattern: 'swirl' }, /pattern/);
  bad({ kind: 'dither', area: { kind: 'text', at: [0, 0], text: 'x' } }, /area/);
  bad({ kind: 'bands', area: { kind: 'rect', at: [0, 0], size: [8, 8] }, stops: ['#ffffff'] }, /stops/);
  bad({ kind: 'cut', shape: 'circle' }, /shape/);
  bad({ kind: 'outline', sides: 'inner' }, /sides/);
  bad({ kind: 'stamp', at: [0, 0], rows: ['a'], key: { a: 'ink' }, mirror: 'y' }, /mirror/);
  bad({ kind: 'dot', at: [0, 0], z: 101 }, /z/);
  bad({ kind: 'dot', at: [0, 0], group: { a: 1 } }, /group/);
  bad({ kind: 'dot', at: [0, 0], glow: 1 }, /glow/);
});

test('a list holds at most 8,192 stamp pixels and 4,000 primitives; a generator\'s output too', () => {
  const r = reg();
  const big = { kind: 'stamp', at: [0, 0], rows: Array(32).fill('a'.repeat(32)), key: { a: 'ink' } };
  assert.equal(r.expandList(Array(8).fill(big)).ok, true, '8 x 1,024 pixels fit');
  const over = r.expandList(Array(9).fill(big));
  assert.equal(over.ok, false);
  assert.match(over.errors.join(), /8192|8,192/);
  r.defineGenerator({
    id: 'stamps', v: 1, family: 'test', about: 'n big stamps.', args: { n: count(1, 20) }, cost: (x) => x.n,
    run: (x) => Array(x.n).fill(big),
  });
  assert.equal(r.runGenerator({ gen: 'stamps', v: 1, n: 8 }).ok, true);
  assert.match(r.runGenerator({ gen: 'stamps', v: 1, n: 9 }).errors.join(), /stamp pixels/);
});

// ---- 9. an entry's bare cost agrees with checkCall --------------------------------------------------------------------

test('entry.cost(args) called bare costs the worst case over bindings, as checkCall does, and NaN when the args are wrong', () => {
  const r = reg();
  const grid = r.generator('grid', 1);
  assert.equal(grid.cost({ a: pick('w', [2, 8]), b: 3 }), 24);
  assert.equal(grid.cost({ a: 4, b: 3 }), 12);
  assert.ok(Number.isNaN(grid.cost({ a: 4 })), 'b missing');
  assert.ok(Number.isNaN(grid.cost({ a: 4, b: 3, c: 1 })), 'unknown argument');
  const placer = r.generator('placer', 1);
  assert.equal(placer.cost({ count: { from: 'n', map: [[0, 1], [1, 5]], round: 'px' }, place: { gen: 'placer', v: 1, count: 4, place: { kind: 'dot', paint: 'ink' } } }), 20);
  const row = site.generator('row', 1);
  const node = { from: [0, 0], to: [10, 0], count: { from: 'n', map: [[0, 2], [1, 9]], round: 'px' }, place: { kind: 'dot', paint: 'ink' } };
  assert.equal(row.cost(node), site.checkCall({ gen: 'row', v: 1, ...node }).cost);
  assert.equal(row.cost(node), 9);
});
