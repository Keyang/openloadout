// Build item R1 (docs/data-sprites.md section 5): a saved version 1 draft that used a library body (a code rig with a
// data layer, removed) is kept, never drawn, and said so in plain words instead of being counted as damaged: the drafts
// store (app/studio/drafts.js) lists it apart (gone), the first page and the address of the draft show the note
// (tests/e2e/studio-page-gone.spec.mjs), and nothing in it is changed. Seeds: tests/fixtures/studio/waving-hero.json
// (the Hero preset's draft) and f1-rogue.json (a converted rig sprite's), beside an ordinary draft.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDrafts, STUDIO_KEY, LIBRARY_BODY_GONE } from '../../app/studio/drafts.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

const fixture = (n) => JSON.parse(fs.readFileSync(new URL(`../fixtures/studio/${n}.json`, import.meta.url), 'utf8'));
function memory(drafts) {
  const m = new Map();
  if (drafts) m.set(STUDIO_KEY, JSON.stringify({ version: 1, drafts }));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, map: m };
}
const seeded = () => memory({
  'sir-wave': { definition: fixture('waving-hero'), savedAt: 5 },
  'rogue-copy': { definition: { ...fixture('f1-rogue'), made: { in: 'studio', from: 'library:rogue-battler' } }, savedAt: 7 },
  'moss-newt': { definition: { ...studioTemplate('four-legs'), id: 'moss-newt', name: 'Moss newt' }, savedAt: 9 },
  'broken-one': { definition: { format: 'loadout-sprite', version: 1 }, savedAt: 11 },
});

test('the note says what happened and what to do, in everyday words', () => {
  assert.equal(LIBRARY_BODY_GONE, 'This sprite used a library body, which is gone: open the library sprite and edit a copy.');
});

test('a draft with a library body is listed by gone(), newest first, with its name and the library sprite it began as', () => {
  const g = createDrafts(seeded()).gone();
  assert.deepEqual(g.map((x) => x.id), ['rogue-copy', 'sir-wave']);
  assert.deepEqual(g.map((x) => x.name), [fixture('f1-rogue').name, 'Waving hero']);
  assert.deepEqual(g.map((x) => x.from), ['rogue-battler', 'knight'], 'made.from "library:<id>" says which library sprite to open (the Hero preset said library:knight)');
  assert.deepEqual(g[1].definition, fixture('waving-hero'), 'what is saved is given back as it is');
  assert.deepEqual(createDrafts(seeded()).gone('sir-wave').id, 'sir-wave');
  assert.equal(createDrafts(seeded()).gone('moss-newt'), null, 'an ordinary draft is not one');
  assert.equal(createDrafts(seeded()).gone('nobody'), null);
  assert.equal(createDrafts(seeded()).gone('__proto__'), null);
});

test('it is not drawn or opened, and not counted as damage; a draft that is damaged still is', () => {
  const d = createDrafts(seeded());
  assert.deepEqual(d.list().map((x) => x.id), ['moss-newt'], 'only the ordinary draft is listed to open');
  assert.equal(d.get('sir-wave'), null, 'the editor never gets it');
  assert.equal(d.broken(), 1, 'one damaged draft; the two library-body drafts are not damage');
});

test('it is kept as it was: nothing the store does changes it, and a new draft saved beside it leaves it alone', () => {
  const s = seeded();
  const d = createDrafts(s, { now: () => 100 });
  const before = JSON.stringify(JSON.parse(s.getItem(STUDIO_KEY)).drafts['sir-wave']);
  assert.equal(d.put('another', { ...studioTemplate('blob'), id: 'another', name: 'Another' }).ok, true);
  assert.equal(JSON.stringify(JSON.parse(s.getItem(STUDIO_KEY)).drafts['sir-wave']), before);
  // saving a definition that still names a library body is refused with the note's own reason
  const r = d.put('again', fixture('waving-hero'));
  assert.equal(r.ok, false);
  assert.match(r.error, /library body, which is gone/);
  // removing it is the person's choice
  assert.equal(d.remove('sir-wave').ok, true);
  assert.equal(d.gone('sir-wave'), null);
});

test('a hostile entry is never trusted: no getter, no prototype name, no other shape reads as a library body', () => {
  const s = memory({ 'hostile': { definition: { body: { library: 'humanoid' }, name: 'x'.repeat(500), made: { from: 'library:../../etc' } }, savedAt: Infinity }, 'not-an-object': 'x', 'null-body': { definition: { body: null } } });
  const g = createDrafts(s).gone();
  assert.deepEqual(g.map((x) => x.id), ['hostile']);
  assert.equal(g[0].name.length, 60, 'a name is cut');
  assert.equal(g[0].from, null, 'a library id that is not a plain id is not followed');
  assert.equal(g[0].savedAt, 0);
});
