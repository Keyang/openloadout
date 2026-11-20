// tools/gen.mjs --sheet --try takes the asset's own paint names (build item B10b, the first fresh-agent test: the sheet
// knew only its slots c1 and c2, so every cell of a call written with the asset's slots came out empty until the maker
// read the error). A paint the sheet does not have becomes a sheet slot of that name with a sample colour, the legend
// says which, and tones (body.light), colour rules and the paints of nested calls work the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generator } from '../../engine/gen/index.js';
import { generatorSheet, sheetPaints } from '../../tools/gen.mjs';

const opaque = (g) => { const b = g.bytes(); let n = 0; for (let i = 3; i < b.length; i += 4) if (b[i]) n++; return n; };

test('a --try call written with the asset\'s own paint names draws every cell, and the legend names the sample colours', () => {
  const entry = generator('gem.cut', 2);
  const s = generatorSheet(entry, { set: { at: [16, 16], r: [6, 5], paint: 'body', shine: 'shine' } });
  assert.deepEqual(s.errors, []);
  for (const row of s.cells) for (const g of row) assert.ok(g && opaque(g) > 20, 'every cell draws the gem');
  const line = s.legend.find((l) => l.startsWith('paints'));
  assert.ok(line, `the legend says which sample colour each of the asset's paints got: ${s.legend.join(' | ')}`);
  assert.match(line, /body #[0-9a-f]{6}/);
  assert.match(line, /shine #ffffff/);
});

test('tones, colour rules and the paints of nested calls are given slots too', () => {
  const entry = generator('glint', 2);
  const gem = { gen: 'gem.cut', v: 2, at: [16, 16], r: [6, 5], paint: 'stone', shine: 'shine' };
  const s = generatorSheet(entry, { set: { at: [16, 16], r: 6, within: [gem], paint: { rule: 'mix', of: 'stone.light', with: 'shine', amount: 0.6 } } });
  assert.deepEqual(s.errors, []);
  const names = sheetPaints(entry, { within: [gem], paint: { rule: 'mix', of: 'stone.light', with: 'shine', amount: 0.6 } });
  assert.deepEqual([...names].sort(), ['shine', 'stone']);
});

test('ink, clear and the sheet\'s own slots are not added again', () => {
  const entry = generator('twinkle', 1);
  assert.deepEqual([...sheetPaints(entry, { paint: 'ink', core: 'c1' }, new Set(['c1']))], []);
});
