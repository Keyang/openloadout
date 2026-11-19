// engine/gen/args.js: the argument types a named generator declares (docs/data-sprites.md section 3.1), the
// bindings every number argument also takes (section 2.6), paint refs, and the shape-list (primitive) check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARG_TYPES, px, share, count, angle, seed, word, flag, paint, paints, profile, point, shape, place, primitives, struct,
  checkArg, describeArg, typeSamples, isArgType, isBinding, isPaintRef, FIXED_PAINTS, TONES,
  PRIMITIVE_KINDS, STAMP_ANCHORS, checkPrimitive, MAX_COORD,
} from '../../engine/gen/args.js';

const ok = (type, value, opts) => assert.deepEqual(checkArg(type, value, opts), [], `${JSON.stringify(value)} should pass ${type.type}`);
const bad = (type, value, opts, re) => {
  const errs = checkArg(type, value, opts);
  assert.ok(errs.length > 0, `${JSON.stringify(value)} should fail ${type.type}`);
  for (const e of errs) assert.equal(typeof e, 'string');
  if (re) assert.match(errs.join('\n'), re);
};

test('the type list is the one section 3.1 names, plus struct (a small object of typed fields: a ridge\'s litEdge)', () => {
  assert.deepEqual([...ARG_TYPES].sort(), ['angle', 'count', 'flag', 'paint', 'paints', 'place', 'point', 'primitives', 'profile', 'px', 'seed', 'shape', 'share', 'struct', 'word'].sort());
  for (const t of [px(0, 4), share(), count(1, 3), angle(), seed(), word(['a', 'b']), flag(), paint(), paints(2), profile(), point(), shape(), place(), primitives(), struct({ depth: share() })]) {
    assert.ok(isArgType(t), t.type);
    assert.ok(Object.isFrozen(t), `${t.type} is frozen`);
    assert.ok(ARG_TYPES.includes(t.type));
  }
  assert.equal(isArgType({ type: 'px' }), false, 'a look-alike object is not a type');
});

test('constructors refuse nonsense declarations', () => {
  assert.throws(() => px(4, 0), /lo/);
  assert.throws(() => px(0, Infinity));
  assert.throws(() => count(-1, 3));
  assert.throws(() => count(1.5, 3));
  assert.throws(() => word([]));
  assert.throws(() => word(['a', 'a']));
  assert.throws(() => word(['Bad word']));
  assert.throws(() => paints(0));
  assert.throws(() => px(0, 4, { default: 9 }), /default/);
  assert.throws(() => word(['a', 'b'], { default: 'c' }), /default/);
  assert.throws(() => px(0, 4, { colour: 1 }), /unknown option/);
});

test('px, share, angle: finite numbers in range; NaN, Infinity, strings and out of range refused', () => {
  const t = px(-2, 6);
  for (const v of [-2, 0, 2.5, 6]) ok(t, v);
  for (const v of [-2.01, 6.01, NaN, Infinity, -Infinity, '3', null, undefined, true, [3], {}]) bad(t, v);
  bad(t, 99, {}, /above 6/);
  ok(share(), 0); ok(share(), 1); ok(share(), 0.5); bad(share(), 1.2); bad(share(), -0.1);
  ok(angle(), -720); ok(angle(), 90); ok(angle(), 720); bad(angle(), 721);
});

test('count and seed: whole numbers only', () => {
  const c = count(1, 12);
  ok(c, 1); ok(c, 12); bad(c, 0); bad(c, 13); bad(c, 2.5, {}, /whole/);
  ok(seed(), 0); ok(seed(), 9999); bad(seed(), 10000); bad(seed(), -1); bad(seed(), 1.5);
});

test('word and flag', () => {
  const w = word(['star', 'skull']);
  ok(w, 'star'); bad(w, 'heart', {}, /star, skull/); bad(w, 1); bad(w, 'constructor'); bad(w, '__proto__');
  ok(flag(), true); ok(flag(), false); bad(flag(), 1); bad(flag(), 'true');
});

test('paint refs: a slot, a slot tone, ink, clear, or a colour rule; never a hex', () => {
  assert.deepEqual([...FIXED_PAINTS], ['ink', 'clear'], 'section 2.6: white is a palette slot a sprite declares, not a fixed paint');
  assert.deepEqual([...TONES], ['light', 'base', 'dark', 'deep', 'far']);
  for (const v of ['gold', 'gold.light', 'gold.deep', 'skinTone.far', 'ink', 'clear', 'shine']) { assert.ok(isPaintRef(v), v); ok(paint(), v); }
  for (const v of ['#ffffff', 'Gold', 'gold.shiny', 'gold.light.dark', '', 'a'.repeat(41), 7, null]) bad(paint(), v);
  ok(paint(), { rule: 'tone', of: 'gold', by: -0.5 });
  bad(paint(), { rule: 'Bad rule!' });
  bad(paint(), { of: 'gold' }, {}, /rule/);
  ok(paint(), { rule: 'tone', of: 'gold' }, { colourRules: ['tone', 'mix'] });
  bad(paint(), { rule: 'glow' }, { colourRules: ['tone', 'mix'] }, /glow/);
  let deep = 'gold';
  for (let i = 0; i < 8; i++) deep = { rule: 'tone', of: deep, by: 0.1 };
  bad(paint(), deep, {}, /deep/);
});

test('paints(n): a list of 1..n paints, hottest first', () => {
  const t = paints(3);
  ok(t, ['spark.light']); ok(t, ['a', 'b', 'c']);
  bad(t, []); bad(t, ['a', 'b', 'c', 'd'], {}, /at most 3/); bad(t, 'a'); bad(t, ['#fff']);
});

test('struct: a small object of typed fields, unknown fields refused, optional fields may be left out', () => {
  const t = struct({ depth: share(), paint: paint(), wide: flag({ default: false }) });
  ok(t, { depth: 0.75, paint: 'rock.light' });
  ok(t, { depth: { from: 'haze', map: [[0, 0], [1, 1]] }, paint: 'rock.light', wide: true });
  bad(t, { depth: 0.5 }, {}, /paint.*missing/);
  bad(t, { depth: 0.5, paint: 'rock', glow: 1 }, {}, /glow/);
  bad(t, { depth: 2, paint: 'rock' }, {}, /depth/);
  bad(t, 'rock');
  bad(t, { from: 'a', pick: { x: { depth: 1, paint: 'rock' } } }, {}, /binding/);
  assert.throws(() => struct({}), /field/);
  assert.throws(() => struct({ inner: struct({ a: share() }) }), /struct/);
  assert.throws(() => struct({ 'bad name': share() }), /name/);
});

test('point and profile', () => {
  ok(point({ lo: 0, hi: 360 }), [0, 360]); bad(point({ lo: 0, hi: 360 }), [-1, 4], {}, /below 0/);
  assert.throws(() => point({ lo: 0, hi: 9999 }), /640/);
  ok(point(), [0, 0]); ok(point(), [-MAX_COORD, MAX_COORD]); ok(point(), [1.5, 2.25]);
  for (const v of [[0], [0, 0, 0], [NaN, 0], [MAX_COORD + 1, 0], '1,2', { x: 1, y: 2 }]) bad(point(), v);
  ok(profile(), 'dips'); ok(profile(), [0, 0.3, 1, 2]);
  bad(profile(), []); bad(profile(), new Array(65).fill(0)); bad(profile(), [0, NaN]); bad(profile(), 'Not a name');
});

test('number bindings: a table from one control, ascending, every output in range', () => {
  const t = px(0, 8);
  const b = { from: 'size', map: [[0, 2], [1, 8]] };
  assert.ok(isBinding(b));
  ok(t, b); ok(t, { ...b, round: 'px' }); ok(t, { ...b, round: 'half' }); ok(t, { ...b, round: 'none' });
  bad(t, b, { bindings: false }, /binding/);
  bad(t, { from: 'size', map: [[0, 2], [1, 9]] }, {}, /above 8/);
  bad(t, { from: 'size', map: [[0, 2]] }, {}, /2 points/);
  bad(t, { from: 'size', map: [[1, 2], [0, 3]] }, {}, /ascending/);
  bad(t, { from: 'size', map: [[0, 2], [0, 3]] }, {}, /ascending/);
  bad(t, { from: 'size', map: [[0, 2], [1, 3]], round: 'up' });
  bad(t, { from: 'size', map: [[0, 2], [1, 3]], expr: 'x*2' }, {}, /expr/);
  bad(t, { from: 'Size Bar', map: [[0, 2], [1, 3]] });
  bad(t, { from: 'size', map: new Array(33).fill(0).map((_, i) => [i, 1]) });
  ok(t, b, { controls: ['size'] });
  bad(t, b, { controls: ['speed'] }, /size/);
  // whole-number types need round: px
  bad(count(0, 9), { from: 'amount', map: [[0, 1], [1, 9]] }, {}, /round/);
  ok(count(0, 9), { from: 'amount', map: [[0, 1], [1, 9]], round: 'px' });
  bad(count(0, 9), { from: 'amount', map: [[0, 1.5], [1, 9]], round: 'px' }, {}, /whole/);
  // point coordinates take bindings one by one
  ok(point(), [{ from: 'size', map: [[0, 2], [1, 8]] }, 4]);
});

test('pick bindings: a choice or toggle picks a value the type takes', () => {
  ok(word(['crop', 'fall']), { from: 'hair', pick: { short: 'crop', long: 'fall' } });
  bad(word(['crop', 'fall']), { from: 'hair', pick: { short: 'crop', long: 'bun' } }, {}, /bun/);
  ok(flag(), { from: 'shine', pick: { true: true, false: false } });
  ok(paint(), { from: 'style', pick: { dark: 'ink', light: 'white' } });
  ok(px(0, 4), { from: 'style', pick: { thin: 1, thick: 3 } });
  bad(px(0, 4), { from: 'style', pick: {} }, {}, /empty/);
  bad(px(0, 4), { from: 'style', pick: { thin: { from: 'size', map: [[0, 1], [1, 2]] } } }, {}, /binding/);
});

test('hostile values are refused, never thrown on', () => {
  const getter = {}; Object.defineProperty(getter, 'from', { get() { throw new Error('ran'); }, enumerable: true });
  const proto = JSON.parse('{"__proto__": {"x": 1}, "from": "size", "map": [[0,1],[1,2]]}');
  const cyclic = []; cyclic.push(cyclic);
  for (const type of [px(0, 4), word(['a']), paint(), point(), shape(), place(), primitives(), paints(2), profile()]) {
    for (const v of [getter, proto, cyclic, () => 1, Symbol('s'), 10n]) {
      assert.doesNotThrow(() => checkArg(type, v));
      assert.ok(checkArg(type, v).length > 0, `${type.type} refuses ${typeof v}`);
    }
  }
});

test('describeArg is plain JSON with the type, its range and its default', () => {
  const d = describeArg(px(0, 8, { default: 2, about: 'Arm length' }));
  assert.deepEqual(d, { type: 'px', lo: 0, hi: 8, default: 2, optional: true, binding: true, about: 'Arm length' });
  assert.deepEqual(describeArg(word(['a', 'b'])), { type: 'word', values: ['a', 'b'], optional: false, binding: true });
  assert.deepEqual(describeArg(point({ lo: 0, hi: 360 })), { type: 'point', lo: 0, hi: 360, optional: false, binding: true });
  assert.deepEqual(describeArg(struct({ depth: share(), paint: paint({ default: 'ink' }) }, { default: { depth: 0.5 } })),
    { type: 'struct', args: { depth: { type: 'share', lo: 0, hi: 1, optional: false, binding: true }, paint: { type: 'paint', default: 'ink', optional: true, binding: true } }, default: { depth: 0.5 }, optional: true, binding: false });
  assert.deepEqual(describeArg(paints(3)), { type: 'paints', n: 3, optional: false, binding: true });
  for (const t of [share(), count(1, 3), angle(), seed(), flag(), paint(), point(), shape(), place(), primitives(), profile()]) {
    const j = describeArg(t);
    assert.deepEqual(JSON.parse(JSON.stringify(j)), j, `${t.type} describes as JSON`);
  }
});

test('typeSamples gives values at the limits that pass and values just outside that fail', () => {
  for (const t of [px(-3, 5), share(), count(2, 7), angle(), seed(), word(['x', 'y']), flag(), paint(), paints(2), profile(), point(), point({ lo: 0, hi: 360 }), struct({ depth: share(), paint: paint() })]) {
    const { valid, invalid } = typeSamples(t);
    assert.ok(valid.length >= 2 && invalid.length >= 2, t.type);
    for (const v of valid) ok(t, v);
    for (const v of invalid) bad(t, v);
  }
});

test('primitives: the shape-list type', () => {
  for (const k of ['limb', 'capsule', 'ellipse', 'poly', 'dot', 'rect', 'line', 'arc', 'ring', 'stamp', 'dither', 'bands', 'text', 'use', 'outline', 'tint', 'cut']) assert.ok(PRIMITIVE_KINDS.includes(k), k);
  assert.ok(!PRIMITIVE_KINDS.includes('gen'));
  assert.deepEqual(checkPrimitive({ kind: 'dot', at: [3, 4], paint: 'gold' }), []);
  assert.deepEqual(checkPrimitive({ kind: 'rect', at: [0, 0], size: [4, 2], paint: 'gold.dark', z: 3 }), []);
  assert.deepEqual(checkPrimitive({ kind: 'stamp', at: [2, 2], anchor: 'tl', rows: ['.a.', 'aba', '.a.'], key: { a: 'gold', b: 'white' } }), []);
  assert.deepEqual(checkPrimitive({ kind: 'outline', paint: 'ink' }), []);
  assert.ok(checkPrimitive({ kind: 'blob' }).length > 0, 'unknown kind');
  assert.ok(checkPrimitive({ kind: 'dot' }).length > 0, 'dot needs at');
  assert.ok(checkPrimitive({ kind: 'dot', at: [1, 2], paint: '#fff' }).length > 0, 'hex paint');
  assert.ok(checkPrimitive({ kind: 'stamp', at: [0, 0], rows: ['ab', 'a'], key: { a: 'x', b: 'y' } }).length > 0, 'ragged rows');
  assert.ok(checkPrimitive({ kind: 'stamp', at: [0, 0], rows: ['ac'], key: { a: 'x' } }).length > 0, 'char without a key');
  assert.ok(checkPrimitive({ kind: 'stamp', at: [0, 0], rows: ['a'.repeat(33)], key: { a: 'x' } }).length > 0, 'over 32 wide');
  assert.ok(checkPrimitive({ kind: 'stamp', at: [0, 0], rows: ['a'], key: { a: 'x' }, anchor: 'middle' }).length > 0, 'bad anchor');
  assert.ok(checkPrimitive({ kind: 'dot', at: [1, 2], draw: () => 1 }).length > 0, 'a function');
  assert.ok(checkPrimitive({ gen: 'twinkle', v: 1 }).length > 0, 'a call is not a primitive');
  assert.deepEqual([...STAMP_ANCHORS], ['tl', 'tc', 'tr', 'cl', 'c', 'cr', 'bl', 'bc', 'br']);
});

test('shape, place and primitives arguments', () => {
  ok(shape(), { kind: 'ellipse', at: [0, 0], r: [3, 2], paint: 'gold' });
  bad(shape(), { kind: 'ellipse', at: [0, 0], r: [3, 2], paint: '#000' });
  ok(place(), { kind: 'stamp', rows: ['a'], key: { a: 'metal.dark' } }, {}, 'a place need not say where: the generator places it');
  ok(place(), { use: 'stamp:clod', v: 1, paint: { a: 'soil.dark' } });
  ok(place(), { gen: 'twinkle', v: 1, size: 1, paint: 'gold' });
  bad(place(), { use: 'Bad piece', v: 1 });
  bad(place(), { use: 'stamp:clod' }, {}, /v/);
  bad(place(), { gen: 'twinkle' }, {}, /v/);
  bad(place(), 'twinkle');
  ok(primitives(), [{ kind: 'dot', at: [1, 1], paint: 'gold' }, { kind: 'outline', paint: 'ink' }]);
  bad(primitives(), new Array(401).fill({ kind: 'outline', paint: 'ink' }), {}, /400/);
  // a nested call is handed to the caller's check (the registry passes one)
  const seen = [];
  const errs = checkArg(place(), { gen: 'twinkle', v: 1, size: 9 }, { checkCall: (node, path) => { seen.push(node.gen); return [`${path}: size too big`]; } });
  assert.deepEqual(seen, ['twinkle']);
  assert.match(errs[0], /size too big/);
});
