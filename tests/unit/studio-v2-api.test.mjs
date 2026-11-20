// window.loadout.studio for version 2 sprites (build item B17; docs/studio.md section 7, Contract 14 rule 10): an agent
// starts any body from its template or a library data sprite as a copy (DQ5), changes it with set, draws it with
// render (the sprite's own clips, written by its layout or by hand), gets advice, and downloads <id>.json; version 1
// drafts keep working beside them. Node: storage, the library and its file reader are handed in.
//   node --test tests/unit/studio-v2-api.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createStudio, STUDIO_KEY } from '../../app/api-studio.js';
import { BODY_KINDS } from '../../app/studio/v2-model.js';

function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
const known = { catalogIds: ['coin', 'knight'] };          // no sound list: the sounds are not checked here
const libraryText = async (id) => (fs.existsSync(new URL(`../../sprites/${id}.json`, import.meta.url)) ? fs.readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8') : null);
let clock = 5000;
const studio = () => { const storage = store(); return { s: createStudio({ storage, kept: true, now: () => ++clock, known: async () => known, libraryText }), storage }; };

test('starts lists a template for every version 2 body beside the version 1 ones', async () => {
  const { s } = studio();
  const r = await s.starts();
  assert.equal(r.ok, true);
  const v2 = r.starts.filter((x) => x.from.startsWith('template:v2-'));
  assert.equal(v2.length, BODY_KINDS.length);
  assert.ok(r.starts.some((x) => x.from === 'template:four-legs'), 'version 1 templates are still there');
});

test('every body: create, render, set, file', async () => {
  for (const kind of BODY_KINDS) {
    const { s } = studio();
    const c = await s.create({ from: `template:v2-${kind}`, name: `My ${kind}` });
    assert.equal(c.ok, true, `${kind}: ${c.errors?.join('; ')}`);
    assert.equal(c.definition.version, 2);
    assert.deepEqual(c.definition.made, { in: 'studio', from: `template:v2-${kind}` });
    const r = await s.render(c.draft, { scale: 1 });
    assert.equal(r.ok, true, `${kind}: ${r.errors?.join('; ')}`);
    assert.match(r.png, /^data:image\/png;base64,/);
    assert.ok(r.opaque > 0, kind);
    const g = await s.get(c.draft);
    const d = g.definition;
    d.name = 'Changed';
    const set = await s.set(c.draft, d);
    assert.equal(set.ok, true, `${kind}: ${set.errors?.join('; ')}`);
    assert.equal((await s.get(c.draft)).definition.name, 'Changed');
    const f = await s.file(c.draft);
    assert.equal(f.ok, true);
    assert.equal(f.name, `${c.definition.id}.json`);
    assert.equal(JSON.parse(f.text).version, 2);
  }
});

test('a layout\'s clips are drawn: a tileset\'s clip names come from its groups', async () => {
  const { s } = studio();
  const c = await s.create({ from: 'template:v2-tiles', name: 'Ground' });
  const r = await s.render(c.draft, { clip: 'nope' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /grass-/);
});

test('a library data sprite starts as a copy (DQ5)', async () => {
  const { s } = studio();
  const c = await s.create({ from: 'library:coin' });
  assert.equal(c.ok, true, c.errors?.join('; '));
  assert.equal(c.definition.id, 'coin-copy');
  assert.equal(c.definition.name, 'Coin (copy)');
  assert.deepEqual(c.definition.made, { in: 'studio', from: 'library:coin' });
  const r = await s.render(c.draft, { clip: 'spin', frame: 0, scale: 2 });
  assert.equal(r.ok, true, r.errors?.join('; '));
  const none = await s.create({ from: 'library:not-a-sprite' });
  assert.equal(none.ok, false);
});

test('a broken version 2 definition is refused by set with the validator\'s words, the draft unchanged', async () => {
  const { s } = studio();
  const c = await s.create({ from: 'template:v2-pictures' });
  const bad = { ...c.definition, palette: [{ id: 'gem', default: 'red' }] };
  const r = await s.set(c.draft, bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /default must be a colour/.test(e)), r.errors.join('; '));
  assert.equal((await s.get(c.draft)).definition.palette[0].default, '#3fbf9b');
  const v = await s.validate(bad);
  assert.equal(v.ok, false);
});

test('a version 2 draft saved with mistakes (as the studio page keeps one) is listed as damaged, never drawn', async () => {
  const { s, storage } = studio();
  const c = await s.create({ from: 'template:v2-pictures' });
  const all = JSON.parse(storage.getItem(STUDIO_KEY));
  all.drafts[c.draft].definition.palette[0].default = 'red';
  storage.setItem(STUDIO_KEY, JSON.stringify(all));
  const l = await s.list();
  assert.equal(l.drafts.find((d) => d.draft === c.draft).state, 'damaged');
  assert.equal((await s.render(c.draft)).ok, false);
});

test('version 1 drafts work as before beside version 2 ones', async () => {
  const { s } = studio();
  const a = await s.create({ from: 'template:four-legs', name: 'Moss beast' });
  const b = await s.create({ from: 'template:v2-emitters', name: 'Zap' });
  assert.equal(a.ok && b.ok, true);
  assert.equal(a.definition.version, 1);
  const l = await s.list();
  assert.deepEqual(l.drafts.map((d) => d.state), ['ready', 'ready']);
  const f = await s.file(a.draft);
  assert.equal(f.name, `${a.definition.id}.js`);
  assert.equal((await s.render(a.draft, { clip: 'walk', frame: 0 })).ok, true);
});
