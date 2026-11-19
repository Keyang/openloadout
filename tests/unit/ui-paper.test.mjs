import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PAPER_MARK_STYLES, paperMarks } from '../../engine/ui-paper.js';
import { skinCheck, skinBarHousing } from '../../engine/ui-skins.js';

const FACE = '#f0ead8';
const check = (style) => { const g = new Surface(32, 32); skinCheck(g, 16, 16, 20, false, 'paper', { face: FACE }); paperMarks(g, 6, 6, 20, 20, style, { face: FACE }); return g; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };

test('paperMarks lists the paper styles and leaves a sheet as it is', () => {
  assert.deepEqual([...PAPER_MARK_STYLES], ['sheet', 'torn', 'card']);
  const g = new Surface(32, 32); skinCheck(g, 16, 16, 20, false, 'paper', { face: FACE });
  assert.equal(diff(g, check('sheet')), 0);
});

test('torn and card change a 20 px box by 12 px or more and differ from each other', () => {
  const sheet = check('sheet'), torn = check('torn'), card = check('card');
  assert.ok(diff(sheet, torn) >= 12, `torn ${diff(sheet, torn)}`);
  assert.ok(diff(sheet, card) >= 12, `card ${diff(sheet, card)}`);
  assert.ok(diff(torn, card) >= 12);
});

test('paperMarks never draws outside the pixels already drawn in its box', () => {
  for (const style of PAPER_MARK_STYLES) {
    const g = check(style), base = check('sheet');
    for (let i = 0; i < g.data.length; i++) if (g.data[i]) assert.ok(base.data[i], `${style} added a pixel at ${i}`);
  }
});

test('torn bites are edged in ink', () => {
  const g = check('torn'), base = check('sheet');
  let inked = 0;
  for (let i = 0; i < g.data.length; i++) if (g.data[i] !== base.data[i] && g.data[i] === col(INK)) inked++;
  assert.ok(inked >= 4);
});

test('marks stay out of the stretched middle rows and columns given as keep', () => {
  const keep = { x: 8, y: 4, w: 48, h: 8 };
  for (const style of ['torn', 'card']) {
    const a = new Surface(64, 16), b = new Surface(64, 16);
    skinBarHousing(a, 1, 1, 62, 14, 'paper', {}); skinBarHousing(b, 1, 1, 62, 14, 'paper', {});
    paperMarks(b, 1, 1, 62, 14, style, { face: FACE, keep, fold: 3 });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
      if (a.get(x, y) === b.get(x, y)) continue;
      const inCols = x >= keep.x && x < keep.x + keep.w, inRows = y >= keep.y && y < keep.y + keep.h;
      // the card edge runs the whole bottom: it may cross the middle columns, never the middle rows
      assert.ok(!inRows, `${style} changed (${x}, ${y}) in the middle rows`);
      if (style === 'torn') assert.ok(!inCols, `torn changed (${x}, ${y}) in the middle columns`);
    }
  }
});
