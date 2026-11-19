// Framework addition made with sprite batch K24 (bundles/specs/core-sprites-3.md, ui-word-pop): engine/text-fx.js,
// a glint band running across a line of pixel-font text, and where each character of a line sits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { fontMetrics, fontGlyph, textBody, FONT_STYLES } from '../../engine/pixel-font.js';
import { textSweepIn, glyphSpots } from '../../engine/text-fx.js';

const cells = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) out.push([x, y]); return out; };

test('textSweepIn holds only body pixels of the line, inside a slanted band `width` px wide', () => {
  for (const style of FONT_STYLES) for (const size of [0, 0.5, 1]) {
    const m = fontMetrics(size, style), tb = textBody('LEVEL UP', m), x = 5, base = 20, top = base - tb.rise;
    for (const at of [0, 7, 20]) for (const width of [1, 2, 3]) {
      const g = new Surface(96, 32);
      g.fill(0, 0, 96, 32, textSweepIn('LEVEL UP', m, x, base, at, { width }), '#ffffff');
      const on = cells(g);
      for (const [px, py] of on) {
        assert.ok(tb.body.at(px - x, py - top), `${style} ${size}: (${px}, ${py}) is not a body pixel`);
        const k = px - x + Math.floor((py - top) * 0.5);
        assert.ok(k >= at && k < at + width, `${style} ${size}: (${px}, ${py}) outside the band at ${at}`);
      }
      // within a row the band is exactly `width` columns wherever the body is that wide there
      const rows = new Map();
      for (const [px, py] of on) rows.set(py, (rows.get(py) ?? 0) + 1);
      for (const n of rows.values()) assert.ok(n <= width, `${style} ${size}: ${n} px in one row`);
    }
  }
  const g = new Surface(96, 32), m = fontMetrics(1);
  g.fill(0, 0, 96, 32, textSweepIn('GO!', m, 10, 20, 3), '#ffffff');
  assert.ok(cells(g).length >= 6, 'a 2 px band over a large glyph shows');
});

test('textSweepIn takes rises per character, as drawText does', () => {
  const m = fontMetrics(1), flat = new Surface(96, 32), lifted = new Surface(96, 32);
  flat.fill(0, 0, 96, 32, textSweepIn('AB', m, 4, 20, 2, { width: 3 }), '#ffffff');
  lifted.fill(0, 0, 96, 32, textSweepIn('AB', m, 4, 20, 2, { width: 3, offsets: [2, 0] }), '#ffffff');
  const a = cells(flat), b = cells(lifted);
  assert.ok(a.length > 0 && b.length > 0);
  assert.notDeepEqual(a, b);
  assert.ok(Math.min(...b.map(([, y]) => y)) < Math.min(...a.map(([, y]) => y)), 'the lifted A sits higher');
});

test('glyphSpots gives each character its pen x, width, rise and middle, spaces skipped', () => {
  const m = fontMetrics(1, 'chunky'), text = 'GAME OVER', tb = textBody(text, m), spots = glyphSpots(text, m);
  assert.equal(spots.length, 8);
  let j = 0;
  [...text].forEach((ch, i) => {
    if (ch === ' ') return;
    const s = spots[j++], gl = fontGlyph(ch, m);
    assert.equal(s.ch, ch); assert.equal(s.index, i); assert.equal(s.x, tb.advances[i]);
    assert.equal(s.w, gl.w); assert.equal(s.rise, gl.rise);
    assert.equal(s.cx, s.x + (gl.w - 1) / 2); assert.equal(s.cy, -(gl.rise + 1) / 2);
  });
  assert.deepEqual(glyphSpots(text, m), spots, 'same arguments, same answer');
});
