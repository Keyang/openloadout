// Studio item F2: where a data sprite came from, said honestly. A sprite made in the studio says
// made: { in: "studio", from: "new" | "template:<id>" | "library:<id>" } and its library file starts "Made in the Loadout
// studio". A library sprite converted from its code file to data (the rig sprites, Q3) was not made in the studio: it says
// made: { in: "library", from: "code:<id>" } and its file starts with the library header (LIBRARY_HEADER). Both are the
// same fixed form (one comment, one import, export default dataSprite(<JSON>);) and the build refuses either with code
// in it. catalog/data-file.js and tools/lib/data-file.mjs stay the same code.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as DF from '../../catalog/data-file.js';
import * as TF from '../../tools/lib/data-file.mjs';
import { validateStudioSprite } from '../../catalog/studio-schema.js';

const newt = () => JSON.parse(fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8'));
const conv = () => ({ ...newt(), made: { in: 'library', from: 'code:moss-newt' } });

test('F2 made: "library" with "code:<id>" passes; each provenance keeps its own sources', () => {
  assert.deepEqual(validateStudioSprite(conv()).value.made, { in: 'library', from: 'code:moss-newt' });
  assert.deepEqual(validateStudioSprite({ ...newt(), made: { in: 'library', from: 'new' } }).value.made, { in: 'library', from: 'new' });
  for (const [made, why] of [
    [{ in: 'studio', from: 'code:newt' }, /code:/],
    [{ in: 'library', from: 'template:four-legs' }, /library/],
    [{ in: 'library', from: 'library:knight' }, /library/],
    [{ in: 'workshop', from: 'new' }, /"studio".*"library"/],
  ]) {
    const r = validateStudioSprite({ ...newt(), made });
    assert.equal(r.ok, false, JSON.stringify(made));
    assert.match(r.errors.join('\n'), why);
  }
});

test('F2 made: two headers, each true; the writer picks the one the definition\'s made says', () => {
  assert.equal(DF.STUDIO_HEADER, `// ${DF.STUDIO_MARK}. This file is data: open it in the studio (#/studio, "Open a file") to change it.`);
  assert.ok(DF.LIBRARY_HEADER.startsWith(`// ${DF.LIBRARY_MARK}.`));
  assert.ok(!DF.LIBRARY_HEADER.includes(DF.STUDIO_MARK), 'a converted file does not say it was made in the studio');
  assert.equal(DF.headerFor({ made: { in: 'library' } }), DF.LIBRARY_HEADER);
  assert.equal(DF.headerFor({ made: { in: 'studio' } }), DF.STUDIO_HEADER);
  assert.equal(DF.headerFor({}), DF.STUDIO_HEADER);
  const w = DF.writeDataFile(conv());
  assert.equal(w.ok, true, w.errors.join('\n'));
  assert.equal(w.text.split('\n')[0], DF.LIBRARY_HEADER);
  const s = DF.writeDataFile(newt());
  assert.equal(s.text.split('\n')[0], DF.STUDIO_HEADER);
  assert.equal(DF.claimsStudioForm(w.text), true, 'the library header claims the fixed form too');
  assert.equal(DF.readDataFile(w.text, { file: 'sprites/moss-newt.js' }).ok, true);
});

test('F2 made: a header that says otherwise than made is refused; so is code under either header', () => {
  const w = DF.writeDataFile(conv()).text;
  const lied = w.replace(DF.LIBRARY_HEADER, DF.STUDIO_HEADER);
  const r = DF.readDataFile(lied);
  assert.equal(r.ok, false);
  assert.match(r.errors.join('\n'), /made/);
  const s = DF.writeDataFile(newt()).text;
  assert.equal(DF.readDataFile(s.replace(DF.STUDIO_HEADER, DF.LIBRARY_HEADER)).ok, false);
  const code = w.replace('"format"', '"format": (() => 1)(), "x"');
  assert.throws(() => DF.checkDataFile(code, 'sprites/moss-newt.js'), /not only JSON|never code/);
  const extra = `${w}console.log(1);\n`;
  assert.throws(() => DF.checkDataFile(extra, 'sprites/moss-newt.js'), /sprites\/moss-newt\.js/);
});

test('F2 made: the build\'s reader is the same code, and has the same headers', () => {
  for (const k of ['STUDIO_MARK', 'STUDIO_HEADER', 'LIBRARY_MARK', 'LIBRARY_HEADER', 'STUDIO_IMPORT', 'STUDIO_CALL', 'FILE_CHARS']) assert.equal(DF[k], TF[k], k);
  const w = TF.writeDataFile(conv());
  assert.equal(w.text, DF.writeDataFile(conv()).text);
});

test('F2 made: the two converted rig sprites say they were converted, not made in the studio', () => {
  for (const id of ['rogue-battler', 'road-bandit']) {
    const text = fs.readFileSync(new URL(`../../sprites/${id}.js`, import.meta.url), 'utf8');
    assert.equal(text.split('\n')[0], DF.LIBRARY_HEADER, id);
    const r = DF.readDataFile(text, { file: `sprites/${id}.js` });
    assert.equal(r.ok, true, r.errors.join('\n'));
    assert.deepEqual(r.value.made, { in: 'library', from: `code:${id}` });
  }
});
