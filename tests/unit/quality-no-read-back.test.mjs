// Build item R4b: the quality bar no longer traces drawing code for read-backs. A data sprite cannot read pixels back (it names
// shapes, stamps and framework generators, docs/data-sprites.md), and the build refuses code sprites (R4a), so the bar's old
// stand-in surface, its stack tracing and the "draws outside the surface's calls" warning had nothing left to catch.
// These tests hold that it stays gone and that what the bar does for a data sprite is untouched: it still draws and checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { dataSprite } from '../../engine/data-sprite.js';
import { defineSprite, range } from '../../engine/sprite.js';
import { coinDef, badgeDef } from '../helpers/data-sprites.mjs';

const source = fs.readFileSync(new URL('../../quality/sprite.js', import.meta.url), 'utf8');
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;

test('quality/sprite.js holds no read-back tracing: no stand-in surface, no stack walking, no outsideCalls', () => {
  for (const word of ['standIn', 'directPixelUse', 'callerOf', 'outsideCalls', 'outsideMs', 'captureStackTrace', 'prepareStackTrace', 'draws outside', 'stylesDeclared']) {
    assert.ok(!source.includes(word), `quality/sprite.js still says "${word}"`);
  }
});

test('a data sprite is checked as before: drawn, no errors, and no read-back metric or warning', () => {
  for (const make of [coinDef, badgeDef]) {
    const r = checkSprite(dataSprite(make()), { validateMeta });
    assert.deepEqual(r.errors, [], show(r));
    assert.ok(r.metrics.renders > 10 &&r.metrics.looks > 0, `${make.name}: drawn ${r.metrics.renders} times in ${r.metrics.looks} looks`);
    assert.ok(!('outsideCalls' in r.metrics) && !('outsideMs' in r.metrics), `${make.name}: ${Object.keys(r.metrics).join(', ')}`);
    assert.ok(!r.warnings.some((m) => /draws outside/.test(m)), show(r));
  }
});

test('the bar does not look at how a definition draws: reading the surface back is not warned about', () => {
  const def = defineSprite({
    id: 'no-trace', name: 'No trace', kind: 'Item', size: [32, 32], pivot: [16, 28],
    params: { size: range('Size', 0.5, { lo: 'Small', hi: 'Big' }) },
    clips: { idle: { frames: 2, fps: 4 } },
    render(g, { p }) { g.ellipse(16, 16, 6 + Math.round(p.size * 4), 6, '#d9534f'); if (g.get(16, 16)) g.dot(16, 16, '#ffffff'); },
  });
  const r = checkSprite(def, {});
  assert.ok(!r.warnings.some((m) => /draws outside/.test(m)), show(r));
  assert.ok(!('outsideCalls' in r.metrics));
});
