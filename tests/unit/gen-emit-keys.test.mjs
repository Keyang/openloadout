// The on/off and key rules of emitters in one place (engine/gen/emit-keys.js; docs/data-sprites.md 2.5c "On or off";
// build item B12, after its review found the rules copied three times): what the emitters layout reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { amountKeyed, emitterCall } from '../../engine/gen/emit-keys.js';
import * as registry from '../../engine/gen/index.js';

const R = { clips: { a: { keys: [{ t: 0, emit: { flash: { amount: 1 }, bar: { beat: 1 } } }] }, b: { keys: [{ t: 0, emit: { ring: { amount: 0 } } }] }, c: {} } };
const GLOW = { id: 'flash', gen: 'glow', v: 1, at: [8, 8], r: 3, paints: ['a'] };

test('amountKeyed: the emitters some clip\'s keys give an amount (in any clip), and no others', () => {
  assert.deepEqual([...amountKeyed(R)].sort(), ['flash', 'ring']);
  assert.deepEqual([...amountKeyed({})], []);
  assert.deepEqual([...amountKeyed(null)], []);
});

test('emitterCall: off where a keyed emitter\'s amount is not above 0; one no key gives an amount always draws', () => {
  const keyed = amountKeyed(R);
  assert.equal(emitterCall(GLOW, null, keyed, registry), null, 'keyed, no key here: off');
  assert.equal(emitterCall(GLOW, { amount: 0 }, keyed, registry), null, 'amount 0: off');
  assert.deepEqual(emitterCall(GLOW, { amount: 0.4 }, keyed, registry), GLOW, 'amount above 0: on; glow declares no amount, so none is passed');
  const bar = { id: 'bar', gen: 'shot.bar', v: 1, at: [16, 8], paints: ['a'] };
  assert.deepEqual(emitterCall(bar, null, keyed, registry), bar, 'no key gives it an amount: always on');
});

test('emitterCall: key fields set the call (arrays copied); an amount reaches only a generator that declares it, at most 1', () => {
  const keyed = amountKeyed(R);
  const at = [4, 5];
  const call = emitterCall(GLOW, { amount: 1, r: 6, at }, keyed, registry);
  assert.equal(call.r, 6);
  assert.deepEqual(call.at, [4, 5]);
  assert.notEqual(call.at, at, 'a new array');
  assert.equal('amount' in call, false);
  const fake = { generator: () => ({ args: { amount: {} } }) };
  assert.equal(emitterCall({ id: 'x', gen: 'y', v: 1 }, { amount: 3 }, new Set(['x']), fake).amount, 1);
  assert.equal(emitterCall(null, null, keyed, registry), null);
});

test('emitterCall: an amount from a key or a binding is held to 0..1 at run time (B12b: the cost is charged at amount 1)', () => {
  const fake = { generator: () => ({ args: { amount: {} } }) };
  const none = new Set();
  // from a key: above 1 is 1; a keyed emitter whose amount is not above 0 is off
  assert.equal(emitterCall({ id: 'x', gen: 'y', v: 1 }, { amount: 7 }, new Set(['x']), fake).amount, 1);
  assert.equal(emitterCall({ id: 'x', gen: 'y', v: 1 }, { amount: -2 }, new Set(['x']), fake), null);
  // from the emitter itself (a binding already worked out by the resolver): held to 0..1 too
  assert.equal(emitterCall({ id: 'x', gen: 'y', v: 1, amount: 5 }, null, none, fake).amount, 1);
  assert.equal(emitterCall({ id: 'x', gen: 'y', v: 1, amount: -3 }, null, none, fake).amount, 0);
  assert.equal(emitterCall({ id: 'x', gen: 'y', v: 1, amount: 0.25 }, null, none, fake).amount, 0.25);
  // a key's amount wins over the emitter's own
  assert.equal(emitterCall({ id: 'x', gen: 'y', v: 1, amount: 0.25 }, { amount: 0.5 }, new Set(['x']), fake).amount, 0.5);
});
