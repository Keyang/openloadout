// The mode signs (engine/gen/icon-modes.js): the eight pictures of a falling-block game's mode-select screen
// (bundles/specs/kit-puzzle-gridline.md, `icons-gridline-modes`). icon.mode@1 is pinned by the goldens harness
// (tests/helpers/gen-harness.mjs); the tests after it hold what the specification asks of the pictures.
// To pin: GEN_GOLDEN_WRITE=1 node --test tests/unit/gen-icon-modes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { MODE_SIGNS, MODE_SIGN_CELLS } from '../../engine/gen/icon-modes.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';

const CASES = [
  { args: { name: 'endless', cell: 'body', paint: 'accent' } },
  { args: { name: 'timed', at: [0, 0], size: 1, bold: true, cell: 'body', paint: 'accent', shine: 'shine' } },
  { args: { name: 'puzzle', at: [16, 16], size: 0, span: [18, 22], cell: 'body', paint: 'accent' } },
  { args: { name: 'daily', at: [48, 32], size: 0.5, span: [18, 22], bold: true, cell: 'body', paint: 'accent', shine: 'shine' } },
  { args: { name: 'practice', at: [16, 16], size: 0.25, cell: 'body', paint: 'accent', shine: 'shine' } },
];

test('icon.mode@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, registry.generator('icon.mode', 1), { cases: CASES });
});

// ---- what the pictures are -------------------------------------------------------------------------------------------

/** A call's output as { "x,y": paint (as text) }, later primitives over earlier ones. */
function pixels(more = {}) {
  const r = registry.runGenerator({ gen: 'icon.mode', v: 1, at: [16, 16], cell: 'body', paint: 'accent', ...more }, { size: [32, 32] });
  assert.ok(r.ok, r.errors.join('; '));
  const out = new Map();
  for (const p of r.primitives) {
    assert.equal(p.kind, 'stamp');
    p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
  }
  return out;
}
const box = (px) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of px.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};
const differ = (a, b) => { let n = 0; for (const k of new Set([...a.keys(), ...b.keys()])) if (a.get(k) !== b.get(k)) n++; return n; };
const SIZES = [0, 0.25, 0.5, 0.75, 1];
const SPANS = [[20, 26], [18, 22]];

test('the eight signs of the specification, each with its cells', () => {
  assert.deepEqual([...MODE_SIGNS], ['endless', 'sprint', 'timed', 'versus', 'calm', 'daily', 'puzzle', 'practice']);
  assert.deepEqual(MODE_SIGNS.map((n) => MODE_SIGN_CELLS[n]), [3, 1, 1, 4, 1, 1, 4, 1]);
});

test('every sign stays in its box, centred, at every size, plain and bold', () => {
  for (const name of MODE_SIGNS) for (const span of SPANS) for (const size of SIZES) for (const bold of [false, true]) {
    const b = box(pixels({ name, span, size, bold }));
    const want = Math.round(span[0] + (span[1] - span[0]) * size), label = `${name} ${span} size ${size}${bold ? ' bold' : ''}`;
    assert.ok(Math.max(b.w, b.h) <= want + 1, `${label}: ${b.w} x ${b.h} is over ${want} + 1`);
    assert.ok(Math.max(b.w, b.h) >= want - 3, `${label}: ${b.w} x ${b.h} is under ${want} - 3`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${label}: touches the frame's border`);
    assert.ok(Math.abs(b.x0 + b.x1 + 1 - 32) <= 1 && Math.abs(b.y0 + b.y1 + 1 - 32) <= 1, `${label}: not centred (${b.x0}..${b.x1}, ${b.y0}..${b.y1})`);
  }
});

test('no two signs are the same silhouette', () => {
  const shapes = MODE_SIGNS.map((name) => new Set(pixels({ name }).keys()));
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    let n = 0;
    for (const k of new Set([...shapes[i], ...shapes[j]])) if (shapes[i].has(k) !== shapes[j].has(k)) n++;
    assert.ok(n >= 40, `${MODE_SIGNS[i]} and ${MODE_SIGNS[j]} differ in only ${n} pixels`);
  }
});

test('the cells are block cells in the cell colour and the marks are the mark colour with an ink line', () => {
  for (const name of MODE_SIGNS) {
    const px = pixels({ name }), paints = new Set(px.values());
    assert.ok(paints.has('"ink"'), `${name}: no ink`);
    assert.ok([...paints].some((p) => p.includes('accent')), `${name}: no mark colour`);
    assert.ok([...paints].some((p) => p.includes('body')), `${name}: no cell colour`);
    assert.ok(![...paints].some((p) => p.includes('shine')), `${name}: a glint with Shine off`);
  }
});

test('Bold changes every sign, and Shine only adds light on the cells', () => {
  for (const name of MODE_SIGNS) for (const span of SPANS) {
    const plain = pixels({ name, span });
    assert.ok(differ(plain, pixels({ name, span, bold: true })) >= 12, `${name} ${span}: Bold changes under 12 pixels`);
    const lit = pixels({ name, span, shine: 'shine' });
    let n = 0;
    for (const [k, v] of lit) {
      if (v === plain.get(k)) continue;
      n++;
      assert.equal(v, '"shine"', `${name}: Shine changed ${k} to ${v}`);
      assert.ok(plain.get(k)?.includes('body'), `${name}: a glint off the cells at ${k}`);
    }
    assert.ok(n >= 1, `${name} ${span}: Shine changes nothing`);
    assert.equal(lit.size, plain.size, `${name}: Shine changed the silhouette`);
  }
});

test('Size makes every sign bigger from Small to Big', () => {
  for (const name of MODE_SIGNS) for (const span of SPANS) {
    const small = box(pixels({ name, span, size: 0 })), big = box(pixels({ name, span, size: 1 }));
    assert.ok(Math.max(big.w, big.h) >= Math.max(small.w, small.h) + 2, `${name} ${span}: ${small.w} x ${small.h} to ${big.w} x ${big.h}`);
  }
});

test('it draws the same on a node at its origin as in frame pixels', () => {
  for (const name of MODE_SIGNS) {
    const a = pixels({ name, at: [16, 16] }), b = pixels({ name, at: [0, 0] });
    assert.equal(a.size, b.size);
    for (const [k, v] of b) { const [x, y] = k.split(',').map(Number); assert.equal(a.get(`${x + 16},${y + 16}`), v); }
  }
});
