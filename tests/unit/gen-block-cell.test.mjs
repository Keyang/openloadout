// The block family (engine/gen/block.js): the cell of a falling-block puzzle and its landing preview, as the Gridline
// kit draws them (bundles/specs/kit-puzzle-gridline.md, "GH1": the look blockCell and ghostCell drew, now generators).
// block.cell@1 and block.ghost@1 are pinned by the goldens harness (tests/helpers/gen-harness.mjs); the tests after it
// hold what the specification asks of a cell. To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-block-cell.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { BLOCK_STYLES, BLOCK_SYMBOLS } from '../../engine/gen/block.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const CASES = {
  'block.cell@1': [
    { args: { at: [0, 0], paint: 'body' } },
    { args: { at: [8, 8], size: 16, style: 'gem', edge: 3, symbol: 'ring', paint: 'body', shine: 'shine' } },
    { args: { at: [-8, -8], size: 16, style: 'glass', edge: 1, symbol: 'triangle', paint: 'body.light', shine: 'shine' } },
    { args: { at: [3, 5], size: 10, style: 'pillow', symbol: 'cross', paint: 'body', shine: 'shine', ink: 'body.deep' } },
    { args: { at: [0, 0], size: 32, style: 'frame', edge: 3, symbol: 'diamond', paint: { rule: 'mix', of: 'body', with: 'shine', amount: 0.5 } } },
  ],
  'block.ghost@1': [
    { args: { at: [0, 0], paint: 'glow' } },
    { args: { at: [-8, -8], size: 16, style: 'dash', paint: 'glow' } },
    { args: { at: [4, 2], size: 9, paint: 'glow.light', ink: 'clear' } },
  ],
};

for (const [key, cases] of Object.entries(CASES)) {
  const [id, v] = key.split('@');
  test(`${key} passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, Number(v)), { cases });
  });
}

// ---- what a cell is ------------------------------------------------------------------------------------------------

/** A call's stamps as { "x,y": paint (as text) }. */
function pixels(call) {
  const r = registry.runGenerator(call, { size: [32, 32] });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
  }
  return out;
}
const cell = (more = {}) => pixels({ gen: 'block.cell', v: 1, at: [0, 0], paint: 'body', ...more });
const differ = (a, b) => { let n = 0; for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) n++; return n; };

test('the styles and symbols are the specification\'s', () => {
  assert.deepEqual([...BLOCK_STYLES], ['bevel', 'gem', 'glass', 'pillow', 'frame']);
  assert.deepEqual([...BLOCK_SYMBOLS], ['disc', 'ring', 'plus', 'diamond', 'bar', 'triangle', 'square', 'cross']);
});

test('a cell fills its square: ink on all four sides, nothing outside', () => {
  for (const style of BLOCK_STYLES) for (const edge of [1, 2, 3]) for (const size of [8, 10, 16]) {
    const px = cell({ style, edge, size });
    assert.equal(px.size, size * size, `${style} edge ${edge} size ${size}: every pixel of the square is painted`);
    for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 0 && y >= 0 && x < size && y < size, `${style}: (${k}) is outside the square`); }
    for (let i = 0; i < size; i++) for (const k of [`${i},0`, `${i},${size - 1}`, `0,${i}`, `${size - 1},${i}`]) assert.equal(px.get(k), '"ink"', `${style} edge ${edge} size ${size}: (${k}) is the ink line`);
  }
});

test('every style differs from every other by 12 or more pixels at 16 px, at every edge', () => {
  for (const edge of [1, 2, 3]) for (const a of BLOCK_STYLES) for (const b of BLOCK_STYLES) {
    if (a >= b) continue;
    assert.ok(differ(cell({ style: a, edge }), cell({ style: b, edge })) >= 12, `${a} and ${b} at edge ${edge}`);
  }
});

test('the edge changes every style by 12 or more pixels between its ends', () => {
  for (const style of BLOCK_STYLES) assert.ok(differ(cell({ style, edge: 1 }), cell({ style, edge: 3 })) >= 12, style);
});

test('the default bevel is the reviewed cell: light on the top and right, dark on the bottom and left', () => {
  const px = cell();
  const rows = [];
  const ch = { '"ink"': 'a', '"body.light"': 'b', '"body.dark"': 'c', '"body"': 'd' };
  for (let y = 0; y < 16; y++) { let r = ''; for (let x = 0; x < 16; x++) r += ch[px.get(`${x},${y}`)] ?? '?'; rows.push(r); }
  assert.deepEqual(rows, [
    'aaaaaaaaaaaaaaaa', 'abbbbbbbbbbbbbba', 'acbbbbbbbbbbbbba', 'accddddddddddbba', 'accddddddddddbba', 'accddddddddddbba', 'accddddddddddbba', 'accddddddddddbba',
    'accddddddddddbba', 'accddddddddddbba', 'accddddddddddbba', 'accddddddddddbba', 'accddddddddddbba', 'acccccccccccccba', 'acccccccccccccca', 'aaaaaaaaaaaaaaaa']);
});

test('shine adds a 5 px L in the top-right corner, in every style', () => {
  for (const style of BLOCK_STYLES) {
    const plain = cell({ style }), lit = cell({ style, shine: 'shine' });
    const white = [...lit.entries()].filter(([, v]) => v === '"shine"').map(([k]) => k);
    assert.equal(white.length, 5, `${style}: five pixels of shine`);
    assert.equal(differ(plain, lit), 5, `${style}: only the L changes`);
    for (const k of white) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 10 && y <= 5, `${style}: (${k}) is in the top-right corner`); }
  }
});

test('every symbol differs from every other by 6 or more pixels, and from none by 12 or more', () => {
  for (const style of BLOCK_STYLES) {
    const none = cell({ style });
    for (const a of BLOCK_SYMBOLS) {
      assert.ok(differ(none, cell({ style, symbol: a })) >= 12, `${style}: ${a} against no symbol`);
      for (const b of BLOCK_SYMBOLS) if (a < b) assert.ok(differ(cell({ style, symbol: a }), cell({ style, symbol: b })) >= 6, `${style}: ${a} and ${b}`);
    }
  }
});

test('a symbol stays inside the ink line at every size', () => {
  for (const size of [6, 8, 10, 16, 32]) for (const symbol of BLOCK_SYMBOLS) {
    const px = cell({ size, symbol });
    assert.equal(px.size, size * size);
    for (let i = 0; i < size; i++) assert.equal(px.get(`${i},0`), '"ink"');
  }
});

test('the landing preview leaves its middle empty: an ink line, a line of light, nothing else', () => {
  const px = pixels({ gen: 'block.ghost', v: 1, at: [0, 0], paint: 'glow' });
  assert.equal(px.size, 60 + 52);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) assert.equal(px.get(`${x},${y}`), undefined);
  assert.equal(px.get('0,0'), '"ink"'); assert.equal(px.get('1,1'), '"glow"'); assert.equal(px.get('14,7'), '"glow"');
  const dash = pixels({ gen: 'block.ghost', v: 1, at: [0, 0], style: 'dash', paint: 'glow' });
  const lit = [...dash.values()].filter((v) => v === '"glow"').length;
  assert.ok(lit >= 20 && lit <= 32, `a dashed line is about half lit; got ${lit} of 52`);
});

test('on glass a symbol is the colour\'s deepest dark, never the rim\'s tone, and the streak stays 1 px clear of it', () => {
  const rim = cell({ style: 'glass' }).get('2,8');                                  // the pale rim, at edge 2
  // the streak: the pixels of the rim's tone on the face (inside the rim)
  const streak = (px, edge) => [...px.entries()].filter(([k, v]) => { const [x, y] = k.split(',').map(Number); return v === rim && Math.min(x, y) >= 1 + edge && Math.max(x, y) <= 14 - edge; }).map(([k]) => k.split(',').map(Number));
  for (const edge of [1, 2, 3]) {
    assert.ok(streak(cell({ style: 'glass', edge }), edge).length >= 4, `edge ${edge}: a plain glass cell keeps its streak`);
    for (const symbol of BLOCK_SYMBOLS) {
      const marked = cell({ style: 'glass', edge, symbol });
      const dark = [...marked.values()].filter((v) => /"deep".*"by":-1/.test(v)).length;
      assert.equal(dark, differ(cell(), cell({ symbol })), `edge ${edge} ${symbol}: the whole symbol, in the deepest dark`);
      for (const [x, y] of streak(marked, edge)) assert.ok(x < 4 || x > 11 || y < 4 || y > 11, `edge ${edge} ${symbol}: streak pixel (${x},${y}) touches the symbol's box`);
    }
  }
});
