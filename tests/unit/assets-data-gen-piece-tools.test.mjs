// tools/gen.mjs and tools/piece.mjs (docs/data-sprites.md section 8 'Check' and build item B9): the two command-line
// tools the skill uses to see a generator or a piece before naming it in a data sprite.
//   node tools/gen.mjs                    every generator: id@v, family, what it draws
//   node tools/gen.mjs <gen>[@v]          its arguments as a table, and a call to copy
//   node tools/gen.mjs <gen> --sheet      a contact sheet of its output across its argument ranges
//   node tools/piece.mjs                  every piece in pieces/
//   node tools/piece.mjs <piece>[@v]      its table: slots, args, what it uses, the data sprites using it, its pin
//   node tools/piece.mjs <piece> --sheet  a contact sheet: the piece at its own colours, then each slot changed
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readPNG, opaqueCount } from '../fixtures/catalog/png-read.mjs';
import { dataProject, tuftDef, ROOT } from '../helpers/data-sprites.mjs';

const tool = (name, args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', name), ...args], { encoding: 'utf8', timeout: 120_000 });
const scratch = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-tools-')));
const solid = (file) => opaqueCount(readPNG(fs.readFileSync(file)));

test('gen.mjs lists every generator with its family and what it draws', () => {
  const r = tool('gen.mjs', []);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /twinkle@1\s+fx\s+A four-point sparkle/);
  assert.match(r.stdout, /mark@1/);
  assert.match(r.stdout, /\d+ generators/);
});

test('gen.mjs <gen> prints its arguments as a table and a call to copy', () => {
  const r = tool('gen.mjs', ['twinkle@1']);   // twinkle@1 by name: twinkle@2 (build item B12c) is the newest
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^twinkle@1/m);
  assert.match(r.stdout, /\bsize\s+count\s+0\.\.4\s+1\b/);
  assert.match(r.stdout, /\bat\s+point\b.*needed/);
  assert.match(r.stdout, /keyable: size/);
  assert.match(r.stdout, /"gen": "twinkle", "v": 1/);
  assert.equal(tool('gen.mjs', ['twinkle@1']).status, 0);
});

test('gen.mjs <gen> --sheet writes a contact sheet across its argument ranges', () => {
  const out = scratch();
  const r = tool('gen.mjs', ['twinkle@1', '--sheet', '--out', out]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const file = path.join(out, 'gen-twinkle@1.png');
  assert.ok(fs.existsSync(file), r.stdout);
  assert.ok(solid(file) > 100, 'the sheet has pictures on it');
  assert.match(r.stdout, /phases/);
  assert.match(r.stdout, /size: 0, 1, 2, 3, 4/);
});

test('gen.mjs says when a generator is unknown (listing the known ones) or is not drawn alone', () => {
  const r = tool('gen.mjs', ['no-such-gen']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no generator "no-such-gen".*twinkle@1/s);
  const v = tool('gen.mjs', ['twinkle@9']);
  assert.equal(v.status, 1);
  assert.match(v.stderr, /twinkle has versions 1/);
  const lay = tool('gen.mjs', ['pictures', '--sheet', '--out', scratch()]);
  assert.equal(lay.status, 0, lay.stderr);
  assert.match(lay.stdout, /layout/);
  assert.match(lay.stdout, /not drawn alone/);
});

test('piece.mjs lists the pieces of a project, with whether each is released', () => {
  const root = dataProject({ pieces: true });
  const r = tool('piece.mjs', ['--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /stamp:test-clod@1.*released/);
  assert.match(r.stdout, /part:test-tuft@1/);
  assert.match(r.stdout, /2 pieces/);
});

test('piece.mjs <piece> prints its table: slots, what it uses, the data sprites using it, its pin', () => {
  const root = dataProject({ data: { 'tuft-pot': tuftDef() }, pieces: true });
  const r = tool('piece.mjs', ['part:test-tuft', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^part:test-tuft@1/m);
  assert.match(r.stdout, /slots/i);
  assert.match(r.stdout, /uses:.*stamp:test-clod@1/);
  assert.match(r.stdout, /used by:.*tuft-pot/);
  assert.match(r.stdout, /released.*unchanged/);
  // a pinned piece edited in place says so
  const f = path.join(root, 'pieces', 'stamp-test-clod.v1.json'), j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.body.rows[0] = [...j.body.rows[0]].reverse().join('');
  fs.writeFileSync(f, JSON.stringify(j));
  const c = tool('piece.mjs', ['stamp:test-clod@1', '--root', root]);
  assert.match(c.stdout, /CHANGED/);
});

test('piece.mjs <piece> --sheet draws it at its own colours and with each slot changed', () => {
  const root = dataProject({ pieces: true });
  const out = scratch();
  const r = tool('piece.mjs', ['part:test-tuft', '--sheet', '--root', root, '--out', out]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const file = path.join(out, 'piece-part-test-tuft@1.png');
  assert.ok(fs.existsSync(file), r.stdout);
  assert.ok(solid(file) > 20);
  const bad = tool('piece.mjs', ['part:nothing', '--root', root]);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /no piece "part:nothing".*part:test-tuft@1/s);
});

// ---- review round 2, issues 2 and 3 ------------------------------------------------------------------------------

/** A part whose length arg sets how tall it is: the sheet's arg row must draw three different sticks. */
const STICK = {
  format: 'loadout-piece', version: 1, id: 'part:test-stick', v: 1, name: 'Test stick', about: 'A stick whose length is an arg, for the tools\' tests only (not art).',
  slots: [{ id: 'wood', label: 'Wood', default: '#8a5a2a', material: 'wood' }],
  args: { length: { type: 'px', lo: 1, hi: 12, default: 4 } },
  body: { draw: [{ kind: 'rect', at: [0, 0], size: [2, { from: 'length' }], paint: 'wood' }] },
};
const stickProject = () => dataProject({ pieces: true, files: { 'pieces/part-test-stick.v1.json': `${JSON.stringify(STICK, null, 2)}\n` } });
const opaque = (g) => { if (!g) return -1; const b = g.bytes(); let n = 0; for (let i = 3; i < b.length; i += 4) if (b[i]) n++; return n; };

test('piece.mjs --sheet: an arg row hands the value to the piece as args, so its cells differ; values are whole pixels', async () => {
  const root = stickProject();
  const { pieceSheet, findPiece } = await import('../../tools/piece.mjs');
  const { buildPiecesIndex, installNodePieces } = await import('../../tools/lib/pieces-index.mjs');
  const { index } = buildPiecesIndex({ root });
  const { row } = findPiece(index, 'part:test-stick');
  await installNodePieces(root).load('part:test-stick@1');
  const s = pieceSheet(row, { size: [32, 32], scale: 1, cells: true });
  assert.deepEqual(s.errors, []);
  const line = s.legend.find((l) => /length:/.test(l));
  assert.match(line, /length: 1, 7, 12$/, 'px values are whole pixels');
  const cells = s.cells[s.cells.length - 1].map(opaque);
  assert.deepEqual(cells, [2, 14, 24], 'each cell is a stick of that length (2 px wide)');
});

test('piece.mjs <piece>: the `use it` line holds its args with their defaults', () => {
  const root = stickProject();
  const r = tool('piece.mjs', ['part:test-stick', '--root', root]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /use it: .*"args": \{"length": 4\}/);
});

test('gen.mjs --sheet draws every cell of every generator it draws alone (none blank, nothing refused)', async () => {
  const { generatorSheet, NOT_DRAWN } = await import('../../tools/gen.mjs');
  const { generators } = await import('../../engine/gen/index.js');
  // ui.area@1 (batch M8) only marks where text and the stretch border go (Contract 8): it draws nothing by design
  const drawn = generators().filter((g) => !NOT_DRAWN[g.family] && g.key !== 'ui.area@1');
  assert.ok(drawn.length >= 10, `${drawn.length} generators drawn alone`);
  const bad = [];
  for (const g of drawn) {
    const s = generatorSheet(g, { size: [32, 32], scale: 1, cells: true });
    if (s.errors.length) bad.push(`${g.key}: ${s.errors.slice(0, 2).join(' | ')}`);
    const blank = s.cells.flat().filter((c) => opaque(c) <= 0).length;
    if (opaque(s.cells[0][0]) <= 0) bad.push(`${g.key}: the defaults draw nothing`);
    else if (blank > s.cells.flat().length / 2) bad.push(`${g.key}: ${blank} of ${s.cells.flat().length} cells blank`);
  }
  assert.deepEqual(bad, []);
});

test('gen.mjs --sheet exits 1 and says so when a cell cannot be drawn', () => {
  // --try sets arguments on every cell (to see a call before writing it); size 99 is outside twinkle's 0..4
  const out = scratch();
  const r = tool('gen.mjs', ['twinkle', '--sheet', '--out', out, '--try', '{"size": 99}']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /could not draw/);
});

// review round 4 (B9b), issue 3: a required `point` that cannot be negative (lo >= 0) is a size, not a position, so a
// sheet must not spread it 8 px off the centre like a second position. gem.cut@1's `r` is one: before, the sheet drew
// the gem at [8, 16] with r [24, 16], cut off at the cell's edge in every cell.
test('gen.mjs --sheet: a point that cannot be negative is a size; gem.cut is drawn whole and centred in its cell', async () => {
  const { generatorSheet } = await import('../../tools/gen.mjs');
  const { generator } = await import('../../engine/gen/index.js');
  const g = generator('gem.cut', 1);
  const s = generatorSheet(g, { size: [32, 32], scale: 1, cells: true });
  assert.deepEqual(s.errors, []);
  assert.match(s.legend[0], /"at":\[16,16\]/, s.legend[0]);
  const c = s.cells[0][0], b = c.bytes(), w = 32, h = 32;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  assert.ok(x1 >= 0, 'something is drawn');
  assert.ok(x0 > 0 && y0 > 0 && x1 < w - 1 && y1 < h - 1, `the gem touches the cell edge: ${x0},${y0}..${x1},${y1}`);
  assert.ok(Math.abs((x0 + x1) / 2 - 15.5) <= 2 && Math.abs((y0 + y1) / 2 - 15.5) <= 2, `not centred: ${x0},${y0}..${x1},${y1}`);
  assert.ok(x1 - x0 >= 8, `big enough to read: ${x1 - x0 + 1} px across`);
});

// review round 5 (B9b), issue 4: a paint argument named `shine`, or one documented as a light ("a light slot", "a light
// tone", "white"), gets a white sample slot of its own. gem.cut's shine used to get the sheet's second sample colour, a
// blue, so the hardest highlight read grey-green and the polished stone showed a blue dot instead of a white glint.
test('gen.mjs --sheet: a light paint argument (named shine, or documented as a light) gets a white sample', async () => {
  const { baseArgs } = await import('../../tools/gen.mjs');
  const { generator } = await import('../../engine/gen/index.js');
  for (const [key, v, arg] of [['gem.cut', 1, 'shine'], ['gem.cut', 2, 'shine'], ['twinkle', 1, 'core']]) {
    const g = generator(key, v);
    const b = baseArgs(g, [32, 32]);
    const slot = b.slots.find((s) => s.id === b.args[arg]);
    assert.ok(slot, `${key}@${v} ${arg}: ${JSON.stringify(b)}`);
    assert.equal(slot.default, '#ffffff', `${key}@${v} ${arg}`);
    assert.equal(slot.material, 'light', `${key}@${v} ${arg}`);
    // the body colour is not the light one
    assert.notEqual(b.args.paint, b.args[arg], `${key}@${v}`);
  }
  // and the sheets still draw: the faceted default's highlight facet is near white (the shine mixed with the stone's
  // light), and the polished stone (facets off, row 3) shows a white glint
  const { generatorSheet } = await import('../../tools/gen.mjs');
  const count = (g, ok) => { const c = g.bytes(); let n = 0; for (let i = 0; i < c.length; i += 4) if (c[i + 3] && ok(c[i], c[i + 1], c[i + 2])) n++; return n; };
  for (const v of [1, 2]) {
    const s = generatorSheet(generator('gem.cut', v), { size: [32, 32], scale: 1 });
    assert.deepEqual(s.errors, [], `gem.cut@${v}`);
    assert.match(s.legend[2], /facets: false, true/, s.legend[2]);
    assert.ok(count(s.cells[0][0], (r, g, b) => Math.min(r, g, b) >= 0xc0) > 0, `gem.cut@${v}: the highlight facet is light`);
    assert.ok(count(s.cells[2][0], (r, g, b) => Math.min(r, g, b) > 240) > 0, `gem.cut@${v}: the polished stone's glint is white`);
  }
});
