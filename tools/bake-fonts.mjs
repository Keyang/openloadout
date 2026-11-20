#!/usr/bin/env node
// Bakes the four font pieces (migration batch M9, review round 1 issue 2; docs/data-sprites.md 3.3 "text primitive + font
// pieces"): pieces/font-<style>.v1.json for each engine/pixel-font.js style (chunky, slim, rounded, serif), every glyph of
// the font at its three sizes as rows of pixels, so the font is data a text primitive names ("font": "font:serif@1").
//
//   node tools/bake-fonts.mjs            say whether each piece file is what the font gives (exit 1 if not)
//   node tools/bake-fonts.mjs --write    write the files that are missing (a released piece is never rewritten)
//
// A piece's body: { sizes: [{ cap, x, descent, space, track }, x3: the small, middle and big size, as fontMetrics at a
// size of 0, 0.5 and 1], glyphs: { "<character>": [{ rise, rows }, x3] } }: rows of '#' (body) and '.' (clear), the
// glyph's left edge the pen point, `rise` its rows above the baseline. The space has no rows: its width is the size's
// `space`. Temporary like tools/bake-rig.mjs: it goes with engine/pixel-font.js (docs/data-sprites.md section 5).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FONT_STYLES, FONT_CHARS, fontMetrics, fontGlyph } from '../engine/pixel-font.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = Object.freeze({ chunky: 'Chunky', slim: 'Slim', rounded: 'Rounded', serif: 'Serif' });
const SIZES = Object.freeze([0, 0.5, 1]);

/** The font piece of one style, as plain data (what pieces/font-<style>.v1.json holds). Arguments: style (one of FONT_STYLES). */
export function fontPiece(style) {
  const metrics = SIZES.map((s) => fontMetrics(s, style));
  const glyphs = { ' ': metrics.map(() => ({ rise: 0, rows: [] })) };
  for (const ch of Object.values(FONT_CHARS).join('')) {
    glyphs[ch] = metrics.map((m) => {
      const g = fontGlyph(ch, m);
      const rows = [];
      for (let y = 0; y < g.h; y++) { let r = ''; for (let x = 0; x < g.w; x++) r += g.body.at(x, y) ? '#' : '.'; rows.push(r); }
      return { rise: g.rise, rows };
    });
  }
  return {
    format: 'loadout-piece', version: 1, id: `font:${style}`, v: 1, name: NAMES[style] ?? style,
    about: `The ${style} pixel font: every capital, small letter, digit and mark at its small (5 px), middle (7) and big (9) capital height, as rows of pixels.`,
    slots: [], made: { from: 'engine/pixel-font.js', by: 'tools/bake-fonts.mjs' },
    body: { sizes: metrics.map((m) => ({ cap: m.cap, x: m.x, descent: m.descent, space: m.space, track: m.track })), glyphs },
  };
}

/** The file a style's piece lives in. Arguments: style, root (the project; default this one). */
export const fontPieceFile = (style, root = ROOT) => path.join(root, 'pieces', `font-${style}.v1.json`);

// the file as written: one glyph a line, so a review can read it
function text(piece) {
  const { body, ...head } = piece;
  const lines = Object.entries(body.glyphs).map(([ch, v]) => `    ${JSON.stringify(ch)}: ${JSON.stringify(v)}`);
  const top = JSON.stringify(head, null, 2).replace(/\n}$/, '');
  return `${top},\n  "body": {\n    "sizes": ${JSON.stringify(body.sizes)},\n    "glyphs": {\n${lines.map((l) => `  ${l}`).join(',\n')}\n    }\n  }\n}\n`;
}

const main = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (main) {
  const write = process.argv.includes('--write');
  let bad = 0;
  for (const style of FONT_STYLES) {
    const f = fontPieceFile(style), want = fontPiece(style);
    if (!fs.existsSync(f)) {
      if (write) { fs.writeFileSync(f, text(want)); console.log(`wrote ${path.relative(ROOT, f)}`); } else { console.log(`missing ${path.relative(ROOT, f)}`); bad++; }
      continue;
    }
    const same = JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8'))) === JSON.stringify(want);
    console.log(`${same ? 'ok' : 'DIFFERS'} ${path.relative(ROOT, f)}`);
    if (!same) bad++;
  }
  process.exitCode = bad ? 1 : 0;
}
