// window.loadout.studio (docs/studio.md section 7, build-plan item S11; docs/architecture.md, Contract 14 rule 10):
// the studio's drafts as plain data in and out, for an agent that builds a sprite the way a person does in the studio.
// Everything here runs in Node: storage, the catalogue, the sound list and the bag are handed in.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import fs from 'node:fs';
import * as A from '../../app/api-studio.js';
import { ACTIONS } from '../../app/api-actions.js';
import { studioTemplate, studioTemplates } from '../../rigs/studio-templates.js';
import { makeDataSprite, validateDataSprite } from '../../engine/data-sprite.js';
import { renderFrame } from '../../engine/sprite.js';
import { bakeClips, bake as bakeKeys, heroFigure } from '../../rigs/humanoid-studio.js';
import { readDataFile } from '../../tools/lib/data-file.mjs';

const { createStudio, STUDIO_KEY, STUDIO_API_LIMITS } = A;

// ---- helpers ---------------------------------------------------------------------------------------------------

/** Storage in memory, like localStorage; `refuse` makes every write throw, as a full browser storage does. */
function store({ refuse = false, text = null } = {}) {
  const m = new Map();
  if (text !== null) m.set(STUDIO_KEY, text);
  return {
    map: m,
    writes: 0,
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (this.refuse) throw new Error('QuotaExceededError'); this.writes++; m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    refuse,
  };
}
const known = { catalogIds: ['knight', 'wolf', 'slime', 'four-legs'], soundIds: ['footstep-grass', 'footstep-gravel', 'whoosh', 'punch', 'monster-fade', 'jump', 'land-thud', 'sword-slash', 'metal-hit', 'bite', 'body-fall', 'enemy-squish', 'footstep-mud'] };
let clock = 1000;
/** A studio over its own storage; `.storage` is that storage, for the test to look at. */
const studioWith = (o = {}) => { const storage = o.storage ?? store(); return { ...createStudio({ kept: true, now: () => ++clock, known: async () => known, ...o, storage }), storage }; };
const stored = (s) => JSON.parse(s.getItem(STUDIO_KEY));

/** Decode a PNG data address written with filter 0 on every row: { w, h, rgba }. */
function decodePng(url) {
  assert.match(url, /^data:image\/png;base64,/);
  const b = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'PNG signature');
  let o = 8, w = 0, h = 0;
  const idat = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), body = b.subarray(o + 8, o + 8 + len);
    assert.equal(b.readUInt32BE(o + 8 + len), zlib.crc32(b.subarray(o + 4, o + 8 + len)) >>> 0, `${type}: CRC`);
    if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); assert.deepEqual([...body.subarray(8)], [8, 6, 0, 0, 0]); }
    if (type === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, (w * 4 + 1) * h);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) { assert.equal(raw[y * (w * 4 + 1)], 0); raw.copy(rgba, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)); }
  return { w, h, rgba };
}
const opaqueOf = ({ rgba }) => { let n = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) n++; return n; };
const plainData = (v) => assert.doesNotThrow(() => assert.deepEqual(JSON.parse(JSON.stringify(v)), v), 'plain data');

// ---- the action list ---------------------------------------------------------------------------------------------

const NAMES = ['studio_starts', 'studio_create', 'studio_list', 'studio_get', 'studio_set', 'studio_validate', 'studio_bake', 'studio_render', 'studio_advice', 'studio_to_bag', 'studio_file', 'studio_remove'];

test('api-studio: every studio member of Contract 14 is an action in generated/api.json, described for an agent', () => {
  const studio = ACTIONS.filter((a) => a.call.startsWith('studio.'));
  assert.deepEqual(studio.map((a) => a.name).sort(), [...NAMES].sort());
  const s = createStudio({ storage: store() });
  for (const a of studio) {
    assert.equal(typeof s[a.call.slice('studio.'.length)], 'function', `${a.call} is a function of createStudio()`);
    assert.ok(a.description.length >= 60, `${a.name}: a description an agent can choose by`);
  }
  assert.deepEqual(Object.keys(s).sort(), studio.map((a) => a.call.slice(7)).sort(), 'and nothing else');
  // the limits an agent runs into are in the descriptions, from the code
  const all = studio.map((a) => a.description).join(' ');
  const mb = (n) => `${n / (1024 * 1024)} MB`;
  for (const n of [String(STUDIO_API_LIMITS.drafts), String(STUDIO_API_LIMITS.scale), `${STUDIO_API_LIMITS.definitionBytes / 1024} KB`, mb(STUDIO_API_LIMITS.storeChars), STUDIO_API_LIMITS.pixels.toLocaleString('en')]) {
    assert.ok(all.includes(n), `the description says ${n}`);
  }
});

// ---- starts and create -------------------------------------------------------------------------------------------

test('api-studio: starts lists the templates and the Hero, as plain data', async () => {
  const r = await studioWith().starts();
  assert.equal(r.ok, true);
  plainData(r.starts);
  const froms = r.starts.map((x) => x.from);
  for (const t of studioTemplates()) assert.ok(froms.includes(`template:${t.id}`), t.id);
  assert.ok(froms.includes('library:knight'), 'the Hero, a library sprite with a preset');
  const four = r.starts.find((x) => x.from === 'template:four-legs');
  assert.deepEqual({ label: four.label, view: four.view, size: four.size, body: four.body }, { label: 'Four legs', view: 'side', size: [64, 48], body: 'bone rig' });
  assert.ok(four.clips.includes('walk'));
  assert.equal(r.starts.find((x) => x.from === 'library:knight').body, 'library body');
});

test('api-studio: create makes a draft from a template, saved under loadout-studio-v1', async () => {
  const s = studioWith();
  const r = await s.create({ from: 'template:four-legs', name: 'Moss beast' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.draft, 'moss-beast');
  assert.equal(r.definition.id, 'moss-beast');
  assert.equal(r.definition.name, 'Moss beast');
  assert.deepEqual(r.definition.made, { in: 'studio', from: 'template:four-legs' });
  assert.equal(r.saved, true);
  plainData(r);
  const raw = stored(s.storage);
  assert.deepEqual(Object.keys(raw.drafts), ['moss-beast']);
  assert.deepEqual(raw.drafts['moss-beast'].definition, r.definition);
  assert.equal(typeof raw.drafts['moss-beast'].savedAt, 'number');
  // the two call forms, and the bare template id
  const b = await s.create('four-legs', 'Moss beast');
  assert.equal(b.ok, true);
  assert.equal(b.draft, 'moss-beast-2', 'a second draft of the same name gets its own key');
  const c = await s.create({ from: 'four-legs' });
  assert.equal(c.ok, true);
  assert.equal(c.definition.name, 'Four legs');
  assert.notEqual(c.draft, 'four-legs', 'not an id the library already uses');
});

test('api-studio: create refuses what it cannot start from, saying what can be', async () => {
  const s = studioWith();
  for (const [args, re] of [
    [[{ from: 'template:dragon' }], /four-legs/],
    [[{}], /from/],
    [['library:wolf'], /library:knight/],
    [[{ from: 'blob', name: 42 }], /name/],
    [[{ from: 'blob', name: 'x'.repeat(61) }], /60/],
    [[{ from: 'blob', name: '!!!' }], /letter/],
    [[{ from: { toString() { return 'blob'; } } }], /from/],
  ]) {
    const r = await s.create(...args);
    assert.equal(r.ok, false, JSON.stringify(args));
    assert.match(r.errors.join(' '), re);
  }
  assert.equal(s.storage.getItem(STUDIO_KEY), null, 'nothing saved');
});

test('api-studio: create from the Hero gives a library body with every clip baked', async () => {
  const r = await studioWith().create('library:knight', 'Sir Test');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.definition.body.library, 'humanoid');
  assert.ok(r.definition.clips.walk.keys.length >= 8);
  assert.deepEqual(r.definition.made, { in: 'studio', from: 'library:knight' });
});

// ---- list, get, set, remove --------------------------------------------------------------------------------------

test('api-studio: list, get, set and remove go through storage', async () => {
  const s = studioWith();
  await s.create('blob', 'Goo');
  await s.create('flyer', 'Bat thing');
  const l = await s.list();
  assert.equal(l.ok, true);
  assert.deepEqual(l.drafts.map((d) => d.draft).sort(), ['bat-thing', 'goo']);
  for (const d of l.drafts) { assert.equal(d.state, 'ready'); assert.equal(typeof d.savedAt, 'number'); assert.equal(d.definition, undefined, 'list is short: get gives the definition'); }
  assert.equal(l.kept, true);

  const g = await s.get('goo');
  assert.equal(g.ok, true);
  const def = structuredClone(g.definition);
  def.name = 'Green goo';
  def.clips.idle.fps = 6;
  def.unknownField = 'dropped';
  const r = await s.set('goo', def);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.saved, true);
  assert.equal(r.definition.unknownField, undefined, 'the cleaned copy is what is kept');
  assert.ok(r.warnings.some((w) => /unknownField/.test(w)));
  const again = await s.get('goo');
  assert.equal(again.definition.name, 'Green goo');
  assert.equal(again.definition.clips.idle.fps, 6);
  // JSON text is taken too
  assert.equal((await s.set('goo', JSON.stringify(def))).ok, true);

  const bad = structuredClone(def);
  bad.body.rig.shapes[0].bone = 'nope';
  const b = await s.set('goo', bad);
  assert.equal(b.ok, false);
  assert.match(b.errors.join(' '), /"nope"/);
  assert.equal((await s.get('goo')).definition.body.rig.shapes[0].bone, def.body.rig.shapes[0].bone, 'a refused set changes nothing');

  assert.equal((await s.set('nobody', def)).ok, false);
  assert.match((await s.get('nobody')).errors[0], /goo|bat-thing/, 'names the drafts there are');

  const rm = await s.remove('goo');
  assert.equal(rm.ok, true);
  assert.deepEqual((await s.list()).drafts.map((d) => d.draft), ['bat-thing']);
  assert.equal((await s.remove('goo')).ok, false);
});

test('api-studio: set refuses an id the library already uses, and sounds that do not exist', async () => {
  const s = studioWith();
  const { definition } = await s.create('blob', 'Goo');
  const r = await s.set('goo', { ...definition, id: 'slime' });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /slime/);
  const d = structuredClone(definition);
  d.clips.idle.sounds = [{ sound: 'no-such-sound', frame: 0 }];
  assert.equal((await s.set('goo', d)).ok, false);
});

test('api-studio: hostile definitions are refused quickly and store nothing', async () => {
  const s = studioWith();
  const { definition } = await s.create('blob', 'Goo');
  const before = s.storage.getItem(STUDIO_KEY);
  const cyc = structuredClone(definition); cyc.meta.self = cyc;
  const getter = structuredClone(definition); Object.defineProperty(getter, 'name', { enumerable: true, get() { throw new Error('boom'); } });
  const proto = JSON.parse(JSON.stringify(definition).replace('"name":', '"__proto__":{"polluted":1},"name":'));
  const t0 = performance.now();
  for (const evil of [cyc, getter, 'x'.repeat(10 * 1024 * 1024), '{"format":"loadout-sprite"' + ',"a":1'.repeat(200_000) + '}', [definition], 42, null, () => definition, new Proxy({}, { ownKeys() { throw new Error('trap'); } })]) {
    const r = await s.set('goo', evil);
    assert.equal(r.ok, false);
    assert.ok(r.errors.every((e) => typeof e === 'string' && e.length > 10));
  }
  assert.ok(performance.now() - t0 < 3000, 'quickly');
  const p = await s.set('goo', proto);
  assert.equal(({}).polluted, undefined, 'no prototype was touched');
  if (p.ok) assert.equal(Object.hasOwn(p.definition, '__proto__'), false);
  if (!p.ok) assert.equal(s.storage.getItem(STUDIO_KEY), before);
  assert.equal(s.storage.writes <= 2, true);
});

test('api-studio: everything read back from storage is validated first', async () => {
  const s = studioWith();
  await s.create('blob', 'Goo');
  await s.create('crawler', 'Beetle');
  const raw = stored(s.storage);
  raw.drafts.goo.definition.body.rig.shapes[0].bone = 'gone';           // changed behind the studio's back
  raw.drafts['<img src=x>'] = { definition: {}, savedAt: 1 };           // a key that is not a draft name
  raw.drafts.beetle.definition.meta.words = ['ok'];
  s.storage.setItem(STUDIO_KEY, JSON.stringify(raw));
  const l = await s.list();
  assert.equal(l.ok, true);
  const goo = l.drafts.find((d) => d.draft === 'goo');
  assert.equal(goo.state, 'damaged');
  assert.ok(goo.errors.length);
  assert.ok(!l.drafts.some((d) => d.draft.includes('<')), 'a bad key is not listed');
  assert.ok(l.problems.some((p) => /not a draft name/.test(p)));
  const g = await s.get('goo');
  assert.equal(g.ok, false);
  assert.match(g.errors.join(' '), /gone/);
  assert.equal((await s.render('goo')).ok, false, 'a damaged draft is not drawn');
  assert.equal((await s.get('beetle')).ok, true);
  // a damaged draft is kept as it was (a later validator may read it) until it is removed or set again
  await s.create('blob', 'Another');
  assert.equal(stored(s.storage).drafts.goo.definition.body.rig.shapes[0].bone, 'gone');
  assert.equal((await s.remove('goo')).ok, true);

  for (const junk of ['not json', '[]', '{"drafts": 5}', 'null', 'x'.repeat(STUDIO_API_LIMITS.storeChars + 10)]) {
    const t = studioWith({ storage: store({ text: junk }) });
    const r = await t.list();
    assert.equal(r.ok, true, junk.slice(0, 20));
    assert.deepEqual(r.drafts, []);
    assert.ok(Array.isArray(r.problems));
  }
  // an entry that is not an object is listed as damaged, under its name, so it can be removed
  const text = studioWith({ storage: store({ text: JSON.stringify({ drafts: { a: 'text' } }) }) });
  assert.deepEqual((await text.list()).drafts.map((d) => [d.draft, d.state]), [['a', 'damaged']]);
  const big = studioWith({ storage: store({ text: 'x'.repeat(STUDIO_API_LIMITS.storeChars + 10) }) });
  assert.match((await big.list()).problems.join(' '), /too big|MB/);
});

// ---- a store the studio cannot read whole is never saved over (it would lose the drafts in it) ------------------

/** Three drafts saved, then the stored text replaced by `damage(text)`; returns { s, storage, before }. */
async function damagedStore(damage) {
  const s = studioWith();
  for (const n of ['T 0', 'T 1', 'T 2']) assert.equal((await s.create('blank', n)).ok, true);
  const before = damage(s.storage.getItem(STUDIO_KEY));
  s.storage.map.set(STUDIO_KEY, before);
  return { s, storage: s.storage, before };
}

test('api-studio: a store that is not JSON any more is reported, and every change is refused, so nothing is lost', async () => {
  const { s, storage, before } = await damagedStore((t) => t.slice(0, -1));      // the last character cut off
  const l = await s.list();
  assert.equal(l.ok, true);
  assert.match(l.problems.join(' '), /not JSON/);
  const writes = storage.writes;
  for (const r of [await s.create('blank', 'New one'), await s.set('t-0', studioTemplate('blank')), await s.remove('t-0')]) {
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.match(r.errors[0], /could not be read whole|not saved over|would lose/i);
    assert.match(r.errors.join(' '), /loadout-studio-v1/, 'says how to start afresh');
  }
  assert.equal(storage.writes, writes, 'nothing written');
  assert.equal(storage.getItem(STUDIO_KEY), before, 'the damaged store is as it was, to be mended or read by hand');
});

test('api-studio: a store whose shape is wrong, or that cannot be read at all, is not saved over either', async () => {
  for (const text of ['[]', '{"drafts": 5}', '"text"', JSON.stringify({ version: 1 })]) {
    const st = store({ text });
    const s = studioWith({ storage: st });
    const r = await s.create('blank', 'New one');
    assert.equal(r.ok, false, text);
    assert.equal(st.getItem(STUDIO_KEY), text, text);
  }
  // getItem throws (site data blocked after the page opened): reported, and nothing is written
  const st = store();
  st.getItem = () => { throw new Error('SecurityError'); };
  const s = studioWith({ storage: st });
  assert.match((await s.list()).problems.join(' '), /could not be read/);
  const r = await s.create('blank', 'New one');
  assert.equal(r.ok, false);
  assert.equal(st.writes, 0);
});

test('api-studio: entries the studio cannot use are carried through every save untouched', async () => {
  const { s, storage } = await damagedStore((t) => {
    const raw = JSON.parse(t);
    raw.drafts.other = 'text';                                    // not an object
    raw.drafts['<b>Not a name</b>'] = { definition: 1 };          // a key that is not a draft name
    raw.drafts['t-1'].extra = { note: 'kept' };                   // a field the studio does not know
    return JSON.stringify(raw);
  });
  const l = await s.list();
  assert.equal(l.drafts.find((d) => d.draft === 'other').state, 'damaged');
  assert.ok(l.problems.some((p) => /not a draft name/.test(p)));
  assert.equal((await s.create('blank', 'New one')).ok, true);
  assert.equal((await s.set('t-0', (await s.get('t-0')).definition)).ok, true);
  let raw = stored(storage);
  assert.equal(raw.drafts.other, 'text');
  assert.deepEqual(raw.drafts['<b>Not a name</b>'], { definition: 1 });
  assert.deepEqual(raw.drafts['t-1'].extra, { note: 'kept' });
  assert.deepEqual(Object.keys(raw.drafts).sort(), ['<b>Not a name</b>', 'new-one', 'other', 't-0', 't-1', 't-2']);
  // the damaged one can be removed by its name
  assert.equal((await s.remove('other')).ok, true);
  raw = stored(storage);
  assert.equal(Object.hasOwn(raw.drafts, 'other'), false);
  assert.equal(Object.hasOwn(raw.drafts, '<b>Not a name</b>'), true);
});

test('api-studio: more than 40 stored drafts are all listed and kept; no new one is made until some are removed', async () => {
  const s = studioWith();
  const { definition } = await s.create('blank', 'Seed');
  const raw = stored(s.storage);
  for (let i = 0; i < STUDIO_API_LIMITS.drafts + 4; i++) raw.drafts[`extra-${i}`] = { definition: { ...definition, id: `extra-${i}` }, savedAt: i };
  s.storage.map.set(STUDIO_KEY, JSON.stringify(raw));
  const l = await s.list();
  assert.equal(l.drafts.length, STUDIO_API_LIMITS.drafts + 5, 'every draft is listed');
  assert.ok(l.problems.some((p) => /40/.test(p)));
  const made = await s.create('blank', 'One more');
  assert.equal(made.ok, false);
  assert.match(made.errors[0], /40/);
  assert.equal((await s.get('extra-43')).ok, true, 'the 44th is there to get');
  assert.equal((await s.set('extra-43', { ...definition, id: 'extra-43', name: 'Changed' })).ok, true);
  assert.equal((await s.remove('extra-0')).ok, true);
  assert.equal(Object.keys(stored(s.storage).drafts).length, STUDIO_API_LIMITS.drafts + 4, 'one removed, none lost');
  assert.equal(stored(s.storage).drafts['extra-43'].definition.name, 'Changed');
});

test('api-studio: a store over the size cap is read, and only removing drafts is allowed until it fits', async () => {
  const limits = { storeChars: 20_000 };
  const s = studioWith({ limits });
  await s.create('four-legs', 'One');
  await s.create('four-legs', 'Two');
  const raw = stored(s.storage);
  raw.drafts.three = { ...raw.drafts.one, definition: { ...raw.drafts.one.definition, id: 'three' } };      // another tab saved past the cap
  const text = JSON.stringify(raw);
  assert.ok(text.length > limits.storeChars);
  s.storage.map.set(STUDIO_KEY, text);
  const l = await s.list();
  assert.deepEqual(l.drafts.map((d) => d.draft).sort(), ['one', 'three', 'two']);
  assert.match(l.problems.join(' '), /KB|MB/);
  assert.equal((await s.get('three')).ok, true);
  const c = await s.create('blank', 'Four');
  assert.equal(c.ok, false);
  assert.match(c.errors[0], /room|KB|MB/);
  assert.equal(s.storage.getItem(STUDIO_KEY), text, 'refused changes write nothing');
  assert.equal((await s.remove('three')).ok, true, 'removing makes room');
  assert.deepEqual(Object.keys(stored(s.storage).drafts).sort(), ['one', 'two']);
  // past what the studio will read at all: refused, untouched
  const huge = '{"version":1,"drafts":{"a":"' + 'x'.repeat(STUDIO_API_LIMITS.storeChars * 4) + '"}}';
  const t = studioWith({ storage: store({ text: huge }) });
  assert.match((await t.list()).problems.join(' '), /too big/);
  assert.equal((await t.create('blank', 'New')).ok, false);
  assert.equal(t.storage.getItem(STUDIO_KEY), huge);
});

test('api-studio: while a failed save waits, changes another tab saves are seen and kept', async () => {
  const st = store();
  const s = studioWith({ storage: st });
  await s.create('blob', 'Goo');
  st.refuse = true;
  assert.equal((await s.create('blob', 'Mine')).saved, false);
  // another tab (the studio page) saves a draft of its own and changes goo, straight to storage
  const raw = stored(st);
  raw.drafts.theirs = { ...raw.drafts.goo, definition: { ...raw.drafts.goo.definition, id: 'theirs' } };
  raw.drafts.goo = { ...raw.drafts.goo, definition: { ...raw.drafts.goo.definition, name: 'Their goo' } };
  st.map.set(STUDIO_KEY, JSON.stringify(raw));
  const l = await s.list();
  assert.deepEqual(l.drafts.map((d) => d.draft).sort(), ['goo', 'mine', 'theirs'], 'theirs is seen, mine still waits');
  assert.equal((await s.get('goo')).definition.name, 'Their goo');
  st.refuse = false;
  assert.equal((await s.create('blob', 'Later')).saved, true);
  const after = stored(st);
  assert.deepEqual(Object.keys(after.drafts).sort(), ['goo', 'later', 'mine', 'theirs']);
  assert.equal(after.drafts.goo.definition.name, 'Their goo', 'not overwritten by an old copy');
});

test('api-studio: two studios over one storage (an agent and the page) do not overwrite each other', async () => {
  const st = store();
  const a = studioWith({ storage: st }), b = studioWith({ storage: st });
  await a.create('blob', 'From a');
  await b.create('blob', 'From b');
  const def = (await a.get('from-a')).definition;
  assert.equal((await a.set('from-a', { ...def, name: 'A again' })).ok, true);
  assert.deepEqual(Object.keys(stored(st).drafts).sort(), ['from-a', 'from-b']);
  assert.equal((await b.remove('from-b')).ok, true);
  assert.equal(stored(st).drafts['from-a'].definition.name, 'A again');
});

// ---- limits and failed saves -------------------------------------------------------------------------------------

test('api-studio: at most 40 drafts and 2 MB in all', async () => {
  const s = studioWith();
  for (let i = 0; i < STUDIO_API_LIMITS.drafts; i++) assert.equal((await s.create('blank', `Thing ${i}`)).ok, true);
  const r = await s.create('blank', 'One too many');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /40/);
  assert.match(r.errors[0], /remove/i);
  // the size of the whole store is capped too (a smaller cap here, so the test is quick)
  const t = studioWith({ limits: { storeChars: 20_000 } });
  assert.equal((await t.create('four-legs', 'One')).ok, true);
  assert.equal((await t.create('four-legs', 'Two')).ok, true);
  const third = await t.create('four-legs', 'Three');
  assert.equal(third.ok, false);
  assert.match(third.errors[0], /space|room|KB|MB/);
});

test('api-studio: a failed save is reported, never swallowed, and the draft lives on for this visit', async () => {
  const st = store();
  const s = studioWith({ storage: st });
  await s.create('blob', 'Goo');
  st.refuse = true;
  const r = await s.create('blob', 'Goo two');
  assert.equal(r.ok, true);
  assert.equal(r.saved, false);
  assert.ok(r.warnings.some((w) => /could not be saved/i.test(w) && /studio_file|file/i.test(w)), JSON.stringify(r.warnings));
  assert.equal((await s.get('goo-two')).ok, true, 'still there on this visit');
  const l = await s.list();
  assert.equal(l.saved, false);
  st.refuse = false;
  const ok = await s.create('blob', 'Goo three');
  assert.equal(ok.saved, true);
  assert.deepEqual(Object.keys(stored(st).drafts).sort(), ['goo', 'goo-three', 'goo-two'], 'what waited is saved with the next change');
});

test('api-studio: without browser storage the drafts live in memory and every answer says so', async () => {
  const s = createStudio({});
  const r = await s.create('blob', 'Goo');
  assert.equal(r.ok, true);
  assert.equal(r.saved, false);
  assert.ok(r.warnings.some((w) => /Not kept after this tab closes/.test(w)));
  assert.equal((await s.list()).kept, false);
  assert.deepEqual(A.studioStorage(undefined).kept, false);
  assert.deepEqual(A.studioStorage({ get localStorage() { throw new Error('blocked'); } }).kept, false);
});

// ---- validate ----------------------------------------------------------------------------------------------------

test('api-studio: validate is the validator alone and stores nothing', async () => {
  const s = studioWith();
  const v = await s.validate({ ...studioTemplate('four-legs'), id: 'new-beast' });
  assert.equal(v.ok, true);
  assert.equal(v.value.format, 'loadout-sprite');
  const id = await s.validate({ ...studioTemplate('blob'), id: 'knight' });
  assert.equal(id.ok, false, 'the library id is taken');
  for (const junk of [undefined, null, 1, '', '{', [], {}]) {
    const r = await s.validate(junk);
    assert.equal(r.ok, false);
    assert.ok(r.errors.length);
  }
  assert.equal(s.storage.getItem(STUDIO_KEY), null);
});

// ---- bake --------------------------------------------------------------------------------------------------------

test('api-studio: bake turns a library pose into keys for a clip', async () => {
  const s = studioWith();
  const { draft, definition } = await s.create('library:knight', 'Sir Test');
  const r = await s.bake(draft, 'walk', 'run');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const want = validateDataSprite({ ...definition, clips: { ...definition.clips, walk: bakeClips(definition.body.figure, { walk: { ...definition.clips.walk, from: 'run' } }).walk } }).value.clips.walk;
  assert.deepEqual(r.clip, want);
  assert.deepEqual((await s.get(draft)).definition.clips.walk, want);
  // a new clip: frames and loop from the pose
  const w = await s.bake(draft, 'wave', 'idle');
  assert.equal(w.ok, true, JSON.stringify(w.errors));
  assert.equal(w.clip.from, 'idle');
  assert.equal(w.clip.frames, bakeKeys(heroFigure(), 'wave', { from: 'idle', between: false }).length);
  assert.equal(w.clip.loop, true);
  // from left out: the clip's own from
  assert.equal((await s.bake(draft, 'attack')).ok, true);
  for (const [args, re] of [[[draft, 'walk', 'moonwalk'], /idle/], [[draft, 'Bad Name', 'idle'], /clip/], [[draft, 'newclip'], /from/], [['nobody', 'walk', 'run'], /draft/]]) {
    const x = await s.bake(...args);
    assert.equal(x.ok, false, JSON.stringify(args));
    assert.match(x.errors.join(' '), re);
  }
  const bone = await s.create('four-legs', 'Beast');
  const b = await s.bake(bone.draft, 'walk', 'walk');
  assert.equal(b.ok, false);
  assert.match(b.errors[0], /library bod/);
});

// ---- render ------------------------------------------------------------------------------------------------------

test('api-studio: render gives a PNG of one frame or a whole clip, the sprite\'s own pixels', async () => {
  const s = studioWith();
  const { draft, definition } = await s.create('four-legs', 'Beast');
  const strip = await s.render(draft, { clip: 'walk' });
  assert.equal(strip.ok, true, JSON.stringify(strip.errors));
  plainData(strip);
  const n = definition.clips.walk.frames;
  assert.deepEqual([strip.width, strip.height, strip.frames, strip.scale, strip.clip, strip.frame], [64 * n, 48, n, 1, 'walk', null]);
  const img = decodePng(strip.png);
  assert.deepEqual([img.w, img.h], [64 * n, 48]);
  assert.equal(opaqueOf(img), strip.opaque);
  assert.ok(strip.opaque > 100);
  // the pixels are the sprite's: frame 3 of the strip is renderFrame of dataSprite at the same settings
  const sprite = makeDataSprite(definition).sprite;
  const g = renderFrame(sprite, 'walk', 3, {});
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) {
    const v = g.data[y * 64 + x], i = (y * img.w + 3 * 64 + x) * 4;
    assert.equal(img.rgba[i + 3] ? (img.rgba[i] | (img.rgba[i + 1] << 8) | (img.rgba[i + 2] << 16) | (img.rgba[i + 3] << 24)) >>> 0 : 0, v, `pixel ${x},${y}`);
  }
  // one frame, enlarged; settings; the skeleton drawn over it
  const one = await s.render(draft, { clip: 'idle', frame: 0, scale: 4 });
  assert.deepEqual([one.width, one.height, one.frame], [256, 192, 0]);
  const red = await s.render(draft, { clip: 'idle', frame: 0, scale: 4, params: { fur: '#c9423a', nothing: 1 } });
  assert.notEqual(red.png, one.png);
  assert.ok(red.warnings.some((w) => /nothing/.test(w)));
  const bones = await s.render(draft, { clip: 'idle', frame: 0, scale: 4, bones: true });
  assert.notEqual(bones.png, one.png);
  assert.ok(bones.opaque >= one.opaque);
  // a definition not kept as a draft draws too, and is not stored
  const loose = await s.render(studioTemplate('blob'), { frame: 0 });
  assert.equal(loose.ok, true);
  assert.equal(loose.clip, studioTemplate('blob').preview);
  assert.deepEqual(Object.keys(stored(s.storage).drafts), ['beast']);
  // deterministic
  assert.equal((await s.render(draft, { clip: 'walk' })).png, strip.png);
});

test('api-studio: render refuses what it cannot draw, saying what it can', async () => {
  const s = studioWith();
  const { draft } = await s.create('four-legs', 'Beast');
  for (const [o, re] of [
    [{ clip: 'fly' }, /idle.*walk|walk.*idle/],
    [{ clip: 'walk', frame: 99 }, /0 to 7/],
    [{ clip: 'walk', frame: 1.5 }, /whole/],
    [{ scale: 9 }, /1 to 8/],
    [{ scale: 0 }, /1 to 8/],
    [{ params: 'red' }, /params/],
    [{ bones: 'yes' }, /bones/],
    ['walk', /options/],
  ]) {
    const r = await s.render(draft, o);
    assert.equal(r.ok, false, JSON.stringify(o));
    assert.match(r.errors.join(' '), re, JSON.stringify(o));
  }
  // too many pixels in one picture: refused before anything is drawn
  const t = studioWith({ limits: { pixels: 10_000 } });
  await t.create('four-legs', 'Beast');
  const big = await t.render('beast', { clip: 'walk', scale: 2 });
  assert.equal(big.ok, false);
  assert.match(big.errors[0], /pixels/);
});

test('api-studio: render draws a library body (the Hero) too', async () => {
  const s = studioWith();
  const { draft } = await s.create('library:knight', 'Sir Test');
  const r = await s.render(draft, { clip: 'attack', frame: 3, scale: 2 });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual([r.width, r.height], [128, 128]);
  assert.ok(r.opaque > 400);
  const b = await s.render(draft, { clip: 'idle', frame: 0, bones: true });
  assert.equal(b.ok, true);
  assert.ok(b.warnings.some((w) => /bone/.test(w)), 'the skeleton is drawn for bone rigs only, and it says so');
});

// ---- advice and file ---------------------------------------------------------------------------------------------

test('api-studio: advice gives the quality bar\'s findings, as advice', async () => {
  const s = studioWith();
  const { draft } = await s.create('four-legs', 'Beast');
  const r = await s.advice(draft);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  plainData(r);
  assert.equal(typeof r.passes, 'boolean');
  assert.ok(Array.isArray(r.problems) && Array.isArray(r.suggestions));
  assert.equal(typeof r.metrics, 'object');
  const d = (await s.get(draft)).definition;
  d.body.rig.shapes = d.body.rig.shapes.map((x) => ({ ...x, hidden: true }));     // nothing drawn at all
  const empty = await s.advice(d);
  assert.equal(empty.ok, true, 'advice is never a refusal');
  assert.equal(empty.passes, false);
  assert.ok(empty.problems.length > 0);
  assert.equal((await s.advice('nobody')).ok, false);
});

test('api-studio: file gives the library file, which reads back to the draft', async () => {
  const s = studioWith();
  const { draft, definition } = await s.create('four-legs', 'Moss beast');
  const r = await s.file(draft);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.name, 'moss-beast.js');
  const back = readDataFile(r.text, { file: `sprites/${r.name}` });
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.deepEqual(back.value, definition);
  assert.equal(typeof r.library.ok, 'boolean', 'whether the library would take it as it is (strict)');
  assert.ok(Array.isArray(r.library.errors));
  assert.equal((await s.file(studioTemplate('blob'))).name, 'blob.js', 'a definition works too');
  assert.equal((await s.file('nobody')).ok, false);
});

// ---- the bag -----------------------------------------------------------------------------------------------------

test('api-studio: toBag says "not yet" while the bag cannot hold a studio sprite', async () => {
  const bagModule = await import('../../app/bag.js');
  const canHold = bagModule.cleanDefinition('sprite', { data: studioTemplate('blob') })?.data !== undefined;
  const s = studioWith({ bag: async () => bagModule });
  const { draft } = await s.create('blob', 'Goo');
  const r = await s.toBag(draft);
  if (canHold) { assert.equal(r.ok, true); return; }       // S8 has landed: the next test covers the way in
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /not yet/i);
  assert.match(r.errors[0], /studio_file|file/);
  assert.equal((await studioWith().toBag('nobody')).ok, false);
});

test('api-studio: toBag puts a draft in a bag that holds studio sprites, and later sets follow it', async () => {
  const items = [];
  const fake = {
    cleanDefinition: (kind, d) => (kind === 'sprite' && d && typeof d.data === 'object' ? { data: d.data } : null),
    bag: {
      add(raw) { const key = `i${items.length + 1}`; items.push({ key, ...raw }); return key; },
      items: () => items.map((x) => ({ ...x })),
      updateDefinition(key, definition) { const it = items.find((x) => x.key === key); if (!it) throw new Error('gone'); it.definition = definition; },
    },
  };
  const s = studioWith({ bag: async () => fake });
  const { draft, definition } = await s.create('blob', 'Goo');
  const r = await s.toBag(draft);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.key, 'i1');
  assert.deepEqual(items[0], { key: 'i1', kind: 'sprite', id: 'goo', settings: {}, definition: { data: definition }, draft: 'goo' });  // the bag item names its draft, so it follows edits (S8)
  assert.equal(stored(s.storage).drafts.goo.bagKey, 'i1');
  const changed = { ...definition, name: 'Green goo' };
  const set = await s.set(draft, changed);
  assert.equal(set.ok, true);
  assert.equal(set.bag, 'updated');
  assert.equal(items[0].definition.data.name, 'Green goo');
  // put in again: the same item, not a second one
  assert.equal((await s.toBag(draft)).key, 'i1');
  assert.equal(items.length, 1);
  // the item was taken out of the bag: a set says so and forgets the link; toBag adds it anew
  items.length = 0;
  const after = await s.set(draft, definition);
  assert.equal(after.ok, true);
  assert.equal(after.bag, 'not in the bag');
  assert.equal(stored(s.storage).drafts.goo.bagKey, undefined);
});

// ---- PNG ---------------------------------------------------------------------------------------------------------

test('api-studio: encodePng writes a PNG any decoder reads, with or without CompressionStream', async () => {
  const rgba = new Uint8Array(3 * 2 * 4).map((_, i) => (i * 37) & 255);
  for (const stream of [true, false]) {
    const url = await A.encodePng(3, 2, rgba, { stream });
    const img = decodePng(url);
    assert.deepEqual([img.w, img.h], [3, 2]);
    assert.deepEqual([...img.rgba], [...rgba]);
  }
  // a large picture without CompressionStream still decodes (stored deflate blocks of at most 65,535 bytes)
  const big = new Uint8Array(300 * 100 * 4).fill(200);
  assert.deepEqual(decodePng(await A.encodePng(300, 100, big, { stream: false })).rgba.length, big.length);
});

// ---- module rules ------------------------------------------------------------------------------------------------

test('api-studio: the module runs in the browser and in Node, and every export says what it is for', () => {
  const src = fs.readFileSync(new URL('../../app/api-studio.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]node:|import\(['"]node:/.test(src), 'no Node-only imports');
  const lines = src.split('\n');
  lines.forEach((l, i) => {
    if (/^export /.test(l)) assert.ok(/\*\/\s*$|^\s*\/\//.test(lines[i - 1] ?? ''), `line ${i + 1}: ${l.slice(0, 60)} has a comment directly above it`);
  });
});
