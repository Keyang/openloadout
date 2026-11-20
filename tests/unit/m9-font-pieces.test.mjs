// The four font pieces (docs/data-sprites.md 3.3: "text primitive + font pieces"; migration batch M9, review round 1
// issue 2): pieces/font-chunky|slim|rounded|serif.v1.json hold every glyph of engine/pixel-font.js at its three sizes as
// rows of pixels (glyphs as data), made by tools/bake-fonts.mjs. Each piece is valid, pinned, holds exactly the font's
// characters and the space, and its rows are the font's glyphs pixel for pixel; a data sprite may now name it in a text
// primitive (`"font": "font:serif@1"`), which the schema refused while no font piece existed. The text primitive still
// draws its glyphs from engine/pixel-font.js (engine/draw-list.js, build item B3's); the schema only checks the piece
// exists and reads its glyph list, so the test below that a text primitive draws "the piece's rows" holds because the
// rows are the same. There are three copies of the font (engine/pixel-font.js, the M9 port copy
// engine/gen/ports/pixel-font.js, these pieces): review M9 round 2, issue 5; the last test holds all three together.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FONT_STYLES, FONT_CHARS, fontMetrics, fontGlyph } from '../../engine/pixel-font.js';
import { validatePiece, pieceSummary } from '../../engine/pieces.js';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { renderList } from '../../engine/draw-list.js';
import { readPins } from '../../tools/lib/pieces-index.mjs';
import { fontPiece } from '../../tools/bake-fonts.mjs';

const ROOT = new URL('../../', import.meta.url);
const file = (style) => new URL(`pieces/font-${style}.v1.json`, ROOT);
const read = (style) => JSON.parse(fs.readFileSync(file(style), 'utf8'));
const CHARS = Object.values(FONT_CHARS).join('');
const SIZES = [0, 0.5, 1];

test('there is one valid, pinned font piece per style, with every character of the font and the space', () => {
  const pins = readPins(new URL('.', ROOT).pathname);
  for (const style of FONT_STYLES) {
    const raw = read(style);
    const r = validatePiece(raw, { file: `font-${style}.v1.json` });
    assert.deepEqual(r.errors, [], style);
    const s = pieceSummary(r.piece);
    assert.equal(s.kind, 'font');
    assert.equal(s.glyphs, [...new Set([...CHARS, ' '])].sort().join(''), style);
    assert.ok(pins[`font:${style}@1`], `font:${style}@1 is pinned`);
    assert.ok(fs.statSync(file(style)).size < 128 * 1024, 'within a piece file\'s 128 KB');
  }
});

test('each glyph\'s rows are engine/pixel-font.js fontGlyph at that size, pixel for pixel, and the file is what the baker makes', () => {
  for (const style of FONT_STYLES) {
    const raw = read(style);
    assert.deepEqual(raw, fontPiece(style), `${style}: pieces/ holds what tools/bake-fonts.mjs makes`);
    raw.body.sizes.forEach((sz, k) => {
      const m = fontMetrics(SIZES[k], style);
      assert.deepEqual({ cap: sz.cap, x: sz.x, descent: sz.descent, space: sz.space, track: sz.track }, { cap: m.cap, x: m.x, descent: m.descent, space: m.space, track: m.track });
    });
    for (const ch of CHARS) {
      SIZES.forEach((size, k) => {
        const g = fontGlyph(ch, fontMetrics(size, style)), d = raw.body.glyphs[ch][k];
        assert.equal(d.rise, g.rise, `${style} ${ch} ${k}`);
        assert.equal(d.rows.length, g.h);
        d.rows.forEach((row, y) => {
          assert.equal(row.length, g.w, `${style} ${ch} ${k} row ${y}`);
          for (let x = 0; x < g.w; x++) assert.equal(row[x] === '#', !!g.body.at(x, y), `${style} ${ch} size ${k} at ${x},${y}`);
        });
      });
    }
  }
});

test('a data sprite may name a font piece in a text primitive, and what it draws matches the piece\'s rows (drawn from engine/pixel-font.js)', () => {
  const pieces = { piece: (id, v) => { const st = /^font:([a-z]+)$/.exec(id)?.[1]; return v === 1 && FONT_STYLES.includes(st) ? pieceSummary(validatePiece(read(st)).piece) : null; } };
  const def = (font, text) => ({ format: 'loadout-sprite', version: 2, id: 'text-probe', name: 'Text probe', size: [64, 16], pivot: [32, 15], grounded: false,
    palette: [{ id: 'ink-text', label: 'Text', default: '#f0ead8', material: 'interface' }],
    controls: [{ key: 'ink-text', kind: 'colour', label: 'Text' }],
    body: { pictures: { nodes: [{ id: 'n', parent: null, at: [2, 11] }], draw: [{ id: 'word', kind: 'text', on: 'n', font, text, at: [0, 0], paint: 'ink-text' }] } },
    clips: { idle: { frames: 1, fps: 8 } } });
  for (const style of FONT_STYLES) {
    const r = validateSprite(def(`font:${style}@1`, 'Hi 42!'), { pieces });
    assert.deepEqual(r.errors, [], style);
    assert.ok(validateSprite(def(`font:${style}@1`, 'Hi ~'), { pieces }).errors.some((e) => /does not have/.test(e)), `${style}: a character the font lacks is refused`);
  }
  assert.ok(validateSprite(def('font:gothic@1', 'Hi'), { pieces }).errors.length > 0, 'a font that is not a piece is refused');
  // the text primitive draws exactly the piece's glyph rows, one track apart, on the baseline
  const style = 'serif', P = read(style), k = 1;
  const { g } = renderList(32, 16, [{ kind: 'text', font: `font:${style}@1`, text: 'Hi', at: [2, 11], size: SIZES[k], paint: '#ffffff' }]);
  const want = new Set();
  let x0 = 2;
  for (const ch of 'Hi') {
    const d = P.body.glyphs[ch][k];
    d.rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') want.add(`${x0 + x},${11 - d.rise + y}`); }));
    x0 += d.rows[0].length + P.body.sizes[k].track;
  }
  const got = new Set();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (g.get(x, y)) got.add(`${x},${y}`);
  assert.deepEqual([...got].sort(), [...want].sort());
});

// review M9 round 2, issue 5: the port copy (what font.cell, score.pop, word.pop and the counters draw with) is held to
// engine/pixel-font.js glyph for glyph, so the three copies cannot drift apart unseen
test('the port copy of the font (engine/gen/ports/pixel-font.js) has the same characters, metrics and glyphs as engine/pixel-font.js', async () => {
  const port = await import('../../engine/gen/ports/pixel-font.js');
  assert.deepEqual(port.FONT_STYLES, FONT_STYLES);
  assert.deepEqual(port.FONT_CHARS, FONT_CHARS);
  const rows = (g) => Array.from({ length: g.h }, (_, y) => Array.from({ length: g.w }, (_, x) => (g.body.at(x, y) ? '#' : '.')).join(''));
  for (const style of FONT_STYLES) for (const size of [0, 0.25, 0.5, 0.75, 1]) {
    const m = fontMetrics(size, style), pm = port.fontMetrics(size, style);
    assert.deepEqual(pm, m, `${style} ${size} metrics`);
    for (const ch of CHARS) {
      const a = fontGlyph(ch, m), b = port.fontGlyph(ch, pm);
      assert.deepEqual([b.w, b.h, b.rise], [a.w, a.h, a.rise], `${style} ${size} ${ch}`);
      assert.deepEqual(rows(b), rows(a), `${style} ${size} ${ch}`);
    }
    assert.equal(port.textWidth('SCORE 0123', pm), (await import('../../engine/pixel-font.js')).textWidth('SCORE 0123', m));
  }
});
