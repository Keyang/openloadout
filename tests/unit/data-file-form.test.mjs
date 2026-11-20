// The library file form of a studio sprite (docs/studio.md 2.4 and section 8, item S7; Contract 14 rule 8):
// sprites/<id>.js is exactly a comment, one import of dataSprite and `export default dataSprite(<JSON>);`.
// tools/lib/data-file.mjs writes that file from a definition and reads it back to its JSON without running it, and
// refuses a file that carries the studio comment but is not exactly that form (so a studio file never holds code).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as DF from '../../tools/lib/data-file.mjs';
import { dataSprite, validateDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { codeSpriteAsFile } from '../helpers/library.mjs';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (rel) => JSON.parse(fs.readFileSync(path.join(REAL, 'tests', 'fixtures', rel), 'utf8'));
const newt = load('studio/newt.json');
const beetle = load('data-sprite/beetle-topdown.json');
const maximal = load('studio/maximal.json');
const written = DF.writeDataFile(newt);
const TEXT = written.text;
const FILE = 'sprites/moss-newt.js';
const refusal = (text, file = FILE, opts) => { try { DF.checkDataFile(text, file, opts); return null; } catch (e) { return e.message; } };

// ---- writing ---------------------------------------------------------------------------------------------------

test('data-file: the writer gives <id>.js of the fixed form: the comment, the import, export default dataSprite(JSON);', () => {
  assert.equal(written.ok, true, written.errors.join('\n'));
  assert.equal(written.name, 'moss-newt.js');
  const lines = TEXT.split('\n');
  assert.equal(lines[0], DF.STUDIO_HEADER);
  assert.match(lines[0], /^\/\/ Made in the Loadout studio\. This file is data/);
  assert.equal(lines[1], "import { dataSprite } from '../engine/data-sprite.js';");
  assert.ok(lines[2].startsWith('export default dataSprite({'), lines[2]);
  assert.ok(TEXT.endsWith('});\n'), 'ends with the closing of the call and one newline');
  const middle = TEXT.slice(TEXT.indexOf('dataSprite({') + 'dataSprite('.length, TEXT.lastIndexOf(');'));
  assert.deepEqual(JSON.parse(middle), validateDataSprite(newt).value, 'the middle is the cleaned definition as JSON');
});

test('data-file: the file is readable: one bone, shape or key per line, not one long line', () => {
  const lines = TEXT.split('\n');
  assert.ok(lines.length > 40, `${lines.length} lines`);
  assert.ok(lines.every((l) => l.length <= 400), 'no very long line');
  assert.ok(lines.some((l) => /^\s+\{"id":"head","parent":"body"/.test(l)), 'a bone sits on its own line');
  assert.ok(TEXT.length < 3 * JSON.stringify(newt).length, 'whitespace stays modest');
});

test('data-file: writing is deterministic and writing the read-back value gives the same text', () => {
  assert.equal(DF.writeDataFile(structuredClone(newt)).text, TEXT);
  const back = DF.readDataFile(TEXT);
  assert.equal(DF.writeDataFile(back.value).text, TEXT);
});

test('data-file: write then read back gives the same JSON (newt, top-down beetle, maximal definition)', () => {
  for (const def of [newt, beetle, maximal]) {
    const w = DF.writeDataFile(def);
    assert.equal(w.ok, true, `${def.id}: ${w.errors.join('; ')}`);
    const r = DF.readDataFile(w.text, { file: `sprites/${w.name}` });
    assert.equal(r.ok, true, `${def.id}: ${r.errors.join('; ')}`);
    assert.deepEqual(r.value, validateDataSprite(def).value, def.id);
    assert.ok(w.text.length <= DF.FILE_CHARS, `${def.id}: ${w.text.length} characters`);
  }
});

test('data-file: the writer refuses a definition that does not validate, and never throws', () => {
  const bad = structuredClone(newt); bad.body.rig.bones[0].parent = 'nowhere';
  const w = DF.writeDataFile(bad);
  assert.equal(w.ok, false);
  assert.equal(w.text, null);
  assert.ok(w.errors.length > 0);
  for (const junk of [null, undefined, 42, 'not json', [], { format: 'loadout-rig' }, () => 1]) {
    const r = DF.writeDataFile(junk);
    assert.equal(r.ok, false, String(junk));
    assert.ok(r.errors.length > 0);
  }
});

test('data-file: the writer passes strict on, so library gaps become errors; without it they are warnings', () => {
  const gap = structuredClone(newt); delete gap.meta.license;
  const easy = DF.writeDataFile(gap);
  assert.equal(easy.ok, true);
  assert.ok(easy.warnings.some((w) => /licen/i.test(w)), easy.warnings.join('\n'));
  const strict = DF.writeDataFile(gap, { strict: true });
  assert.equal(strict.ok, false);
  assert.ok(strict.errors.some((e) => /licen/i.test(e)), strict.errors.join('\n'));
});

// ---- reading ---------------------------------------------------------------------------------------------------

test('data-file: reading never runs the file and never throws', () => {
  globalThis.__dataFileRan = undefined;
  const sneaky = TEXT.replace(/\}\);\n$/, '}, (globalThis.__dataFileRan = 1));\n');
  const r = DF.readDataFile(sneaky);
  assert.equal(r.ok, false);
  assert.equal(globalThis.__dataFileRan, undefined);
  for (const junk of [null, undefined, 42, {}, '', 'export default 1;']) assert.equal(DF.readDataFile(junk).ok, false, String(junk));
});

test('data-file: line endings written on Windows (CRLF) are read the same', () => {
  const r = DF.readDataFile(TEXT.replace(/\n/g, '\r\n'));
  assert.equal(r.ok, true, r.errors.join('; '));
  assert.deepEqual(r.value, DF.readDataFile(TEXT).value);
  const noFinalNewline = DF.readDataFile(TEXT.slice(0, -1));
  assert.equal(noFinalNewline.ok, true, noFinalNewline.errors.join('; '));
});

test('data-file: a file that claims the studio form but is not exactly it is refused, with the reason', () => {
  const cases = {
    'code after the JSON, inside the call': [TEXT.replace(/\}\);\n$/, '}, fetch("https://example.com"));\n'), /not JSON|only JSON/i],
    'code on a line after the call': [`${TEXT}globalThis.x = 1;\n`, /end|after/i],
    'a second call after the first': [TEXT.replace(/\);\n$/, ');\nconsole.log(1);\n'), /only JSON|end|after/i],
    'code before the comment': [`globalThis.x = 1;\n${TEXT}`, /line 1|first line|comment/i],
    'a changed comment': [TEXT.replace('This file is data', 'This file is code'), /line 1|first line|comment/i],
    'another import': [TEXT.replace("from '../engine/data-sprite.js';", "from '../engine/data-sprite.js';\nimport fs from 'node:fs';"), /line 3|third line|export default dataSprite/i],
    'a different module imported': [TEXT.replace('../engine/data-sprite.js', '../engine/evil.js'), /line 2|second line|import/i],
    'a different function called': [TEXT.replace('export default dataSprite(', 'export default makeThing('), /line 3|third line|export default dataSprite/i],
    'a JS comment in the JSON': [TEXT.replace('{\n', '{ /* hi */\n'), /not JSON|only JSON/i],
    'unquoted keys (JavaScript, not JSON)': [TEXT.replace('"format":', 'format:'), /not JSON|only JSON/i],
    'a template string': [TEXT.replace('"Moss newt"', '`Moss ${"newt"}`'), /not JSON|only JSON/i],
    'a list, not an object': [`${DF.STUDIO_HEADER}\n${DF.STUDIO_IMPORT}\nexport default dataSprite([1, 2]);\n`, /object/i],
    'a __proto__ key': [TEXT.replace('"format":', '"__proto__": {"polluted": true}, "format":'), /__proto__/],
    'a constructor key': [TEXT.replace('"format":', '"constructor": 1, "format":'), /constructor/],
  };
  for (const [name, [text, why]] of Object.entries(cases)) {
    const r = DF.readDataFile(text, { file: FILE });
    assert.equal(r.ok, false, name);
    assert.ok(r.errors.some((e) => why.test(e)), `${name}: ${r.errors.join(' | ')}`);
    const m = refusal(text);
    assert.ok(m, `${name}: checkDataFile should refuse it`);
    assert.ok(m.startsWith(`${FILE}:`), `${name}: the message names the file: ${m}`);
    assert.match(m, /studio/i, name);
  }
  assert.equal(({}).polluted, undefined, 'nothing was polluted');
});

test('data-file: a file over the size limit or nested too deep is refused before it is parsed', () => {
  const big = `${DF.STUDIO_HEADER}\n${DF.STUDIO_IMPORT}\nexport default dataSprite({"a": "${'x'.repeat(DF.FILE_CHARS)}"});\n`;
  assert.match(DF.readDataFile(big).errors.join(' '), /too big|most is|KB/i);
  const deep = `${DF.STUDIO_HEADER}\n${DF.STUDIO_IMPORT}\nexport default dataSprite(${'{"a":'.repeat(5000)}1${'}'.repeat(5000)});\n`;
  assert.match(DF.readDataFile(deep).errors.join(' '), /nested|deep/i);
});

test('data-file: the JSON must be a studio definition that passes strict validation in checkDataFile', () => {
  const gap = structuredClone(newt); gap.meta.words = ['newt'];
  const text = DF.writeDataFile(gap).text;
  assert.ok(text, 'the studio writes it (gaps are advice there)');
  const m = refusal(text);
  assert.ok(m && m.startsWith(`${FILE}:`), m);
  assert.match(m, /words/i);
  const bad = TEXT.replace('"format": "loadout-sprite"', '"format": "loadout-rig"');
  assert.notEqual(bad, TEXT);
  assert.ok(refusal(bad));
});

test('data-file: the id inside must match the file name', () => {
  const m = refusal(TEXT, 'sprites/other-newt.js');
  assert.ok(m && m.startsWith('sprites/other-newt.js:'), m);
  assert.match(m, /moss-newt/);
});

test('data-file: a file without the studio comment is not a studio file and is left to the ordinary sprite checks', () => {
  const ordinary = codeSpriteAsFile('coin');      // an ordinary code sprite: the old code coin, frozen (tests/helpers/library.mjs)
  assert.equal(DF.claimsStudioForm(ordinary), false);
  assert.equal(DF.checkDataFile(ordinary, 'sprites/whatever.js'), null);
  assert.equal(DF.claimsStudioForm(TEXT), true);
  assert.equal(DF.claimsStudioForm(`// hand-written\n${TEXT.split('\n').slice(1).join('\n')}`), false);
  assert.equal(DF.claimsStudioForm(`const a = 1; // ${DF.STUDIO_MARK}\n`), true, 'the mark anywhere is a claim');
  const v = DF.checkDataFile(TEXT, FILE);
  assert.equal(v.id, 'moss-newt');
});

// ---- the written file runs as the same sprite ------------------------------------------------------------------

test('data-file: the written file, imported as a module, is the same sprite as dataSprite(definition)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-data-file-'));
  try {
    for (const d of ['engine', 'catalog', 'rigs', 'sound', 'quality']) if (fs.existsSync(path.join(REAL, d))) fs.symlinkSync(path.join(REAL, d), path.join(dir, d));
    fs.mkdirSync(path.join(dir, 'sprites'));
    for (const def of [newt, beetle]) {
      const w = DF.writeDataFile(def);
      const file = path.join(dir, 'sprites', w.name);
      fs.writeFileSync(file, w.text);
      const got = (await import(pathToFileURL(file).href)).default;
      const want = dataSprite(def);
      assert.equal(got.id, want.id);
      assert.deepEqual(Object.keys(got.clips), Object.keys(want.clips));
      const p = defaultParams(want);
      for (const clip of Object.keys(want.clips)) {
        const a = renderFrame(got, clip, 0, p), b = renderFrame(want, clip, 0, p);
        assert.ok(a.w === b.w && a.h === b.h && a.data.every((x, i) => x === b.data[i]), `${def.id} ${clip}`);
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
