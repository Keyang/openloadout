// Route 2 on data (docs/data-sprites.md section 5 and build item B11; Contract 15 rule 6; Keyang's DQ2), without a
// browser. window.loadout.make.sprite(definition) takes a `loadout-sprite` version 2 definition: checked by
// catalog/sprite-schema.js, drawn by engine/data-sprite.js on the page, judged by the quality bar in the background
// worker (app/api-worker.js, which only ever loads framework code). The sandbox that ran made source text in a worker
// of its own (app/sandbox-worker.js, app/made.js, app/api-source.js) is gone, and so is 'blob:' for scripts and
// workers in the content policy. An old bag item or link entry that holds source text is never run: it is listed as
// "made with an older version of Loadout". The browser side is tests/e2e/route2*.spec.mjs and tests/e2e/api.spec.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALLS, madeItemState, OLDER_VERSION, OLDER_LINE } from '../../app/api.js';
import { ACTIONS, LOOK, SETTINGS, LIMITS } from '../../app/api-actions.js';
import { createLoadout } from '../../app/api-core.js';
import { runJob } from '../../app/api-worker.js';
import { createBag, memoryStorage, loadStudioCheck } from '../../app/bag.js';
import { PALETTES } from '../../engine/theme.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { sitePieces } from '../../engine/pieces.js';
import { checkSprite } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { goodData, noWords, deadControl, starData, OLD_SOURCE, GOOD_ID, CHIME_ID } from '../fixtures/api/data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

// ---- the sandbox is gone ------------------------------------------------------------------------------------------

test('the sandbox is gone: its three files, every import of them, and blob: for scripts and workers', () => {
  for (const f of ['app/sandbox-worker.js', 'app/made.js', 'app/api-source.js']) assert.equal(fs.existsSync(path.join(ROOT, f)), false, `${f} is deleted`);
  const code = [...walk('app'), ...walk('catalog'), ...walk('engine'), ...walk('rigs'), ...walk('quality'), ...walk('tools/lib'), 'index.html'].filter((f) => /\.(m?js|html)$/.test(f));
  const importing = code.filter((f) => /(?:from\s*|import\s*\(\s*)['"][^'"]*(?:sandbox-worker|\/made|api-source)\.js['"]/.test(read(f)));
  assert.deepEqual(importing, [], 'nothing imports them');
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(read('index.html'))[1];
  const part = (name) => policy.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `)) ?? '';
  assert.match(part('script-src'), /^script-src 'self'/);
  assert.doesNotMatch(part('script-src'), /blob:/, 'no script is made from memory any more');
  assert.doesNotMatch(part('worker-src'), /blob:/, 'no worker is made from memory any more');
  for (const kept of ["default-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'"]) assert.ok(policy.includes(kept), kept);
});

// ---- the action list ----------------------------------------------------------------------------------------------

test('app/api.js names exactly the calls of the action list', () => {
  assert.deepEqual([...CALLS].sort(), ACTIONS.map((a) => a.call).sort());
});

test('make_sprite takes a version 2 definition, and the descriptions say so', () => {
  const make = ACTIONS.find((a) => a.name === 'make_sprite');
  assert.deepEqual(make.args, ['definition']);
  assert.deepEqual(Object.keys(make.inputSchema.properties), ['definition']);
  assert.deepEqual(make.inputSchema.required, ['definition']);
  assert.deepEqual(make.inputSchema.properties.definition.oneOf.map((s) => s.type), ['object', 'string']);
  assert.match(make.description, /"loadout-sprite"/);
  assert.match(make.description, /version 2/i);
  assert.match(make.description, /generator/i);
  assert.match(make.description, /128 KB/);
  assert.doesNotMatch(make.description, /export default defineSprite|ES module written|worker of its own/);
  assert.match(make.description, /source text \(code\) is no longer taken/);
  // B11b: it says which bag items a make changes, and that any other sprite under the id is refused
  assert.match(make.description, /"made" token/);
  assert.match(make.description, /changes only the bag items of its own token/);
  const check = ACTIONS.find((a) => a.name === 'check');
  assert.match(check.description, /definition/);
  assert.doesNotMatch(check.description, /source text/);
  for (const name of ['bag_link', 'bag_download', 'bag_items']) assert.doesNotMatch(ACTIONS.find((a) => a.name === name).description, /source/, `${name} no longer speaks of source`);
  assert.ok(LIMITS.checkMs >= 10_000 && LIMITS.soundCheckMs >= 10_000 && LIMITS.musicCheckMs >= LIMITS.soundCheckMs);
});

test('a look and an item\'s settings are spelled out: no "any object", and the palette names come from the code', () => {
  assert.equal(LOOK.additionalProperties, false);
  assert.deepEqual(Object.keys(LOOK.properties), ['seed', 'colour', 'sound', 'music', 'shapes']);
  for (const part of ['colour', 'sound', 'music']) assert.equal(LOOK.properties[part].additionalProperties, false, part);
  assert.deepEqual(LOOK.properties.colour.properties.palette.oneOf[0].enum, PALETTES.map((p) => p.name));
  assert.equal(SETTINGS.additionalProperties, false);
  assert.deepEqual(Object.keys(SETTINGS.properties), ['params', 'cues', 'scale', 'artStyle', 'style', 'seed']);
  const using = (schema) => JSON.stringify(ACTIONS.filter((a) => JSON.stringify(a.inputSchema).includes(JSON.stringify(schema))).map((a) => a.name));
  assert.equal(using(LOOK), '["render","bag_set_look"]');
  assert.equal(using(SETTINGS), '["bag_add","bag_update"]');
});

// ---- the fixtures, and the quality bar on data ---------------------------------------------------------------------

test('the fixtures: the good pickup and the star pass the bar, one with no words fails it, a dead slider is refused before drawing', () => {
  for (const d of [goodData(), starData(), starData({ cue: CHIME_ID })]) {
    const r = makeDataSprite(d);
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.deepEqual(checkSprite(r.sprite, { validateMeta }).errors, [], d.id);
  }
  const draft = makeDataSprite(noWords());
  assert.equal(draft.ok, true, 'it can be drawn');
  assert.match(checkSprite(draft.sprite, { validateMeta }).errors.join('\n'), /meta\.words/);
  const dead = makeDataSprite(deadControl());
  assert.equal(dead.ok, false);
  assert.match(dead.errors.join('\n'), /"weight".*nothing uses it/);
});

test('the background worker judges a definition from its data; the jobs of the sandbox are gone', async () => {
  const good = await runJob({ type: 'checkSprite', data: goodData() });
  assert.deepEqual(good.errors, []);
  assert.ok(good.metrics && typeof good.ms === 'number');
  const draft = await runJob({ type: 'checkSprite', data: noWords() });
  assert.match(draft.errors.join('\n'), /meta\.words/);
  await assert.rejects(runJob({ type: 'checkSprite', data: deadControl() }), /"weight"/, 'a definition that cannot be drawn is refused with the validator\'s words');
  await assert.rejects(runJob({ type: 'checkSprite', data: OLD_SOURCE }), /definition/);
  for (const type of ['checkMade', 'checkLook']) await assert.rejects(runJob({ type }), /unknown job/, type);
  const text = read('app/api-worker.js');
  assert.doesNotMatch(text, /suppliedSprite|sandbox|made\.js/);
});

// ---- window.loadout without a page ---------------------------------------------------------------------------------

test('make.sprite refuses source text, a version 1 definition, broken JSON and a definition that cannot be drawn, saying what to hand over', async () => {
  const L = createLoadout({});
  const source = await L.make.sprite(OLD_SOURCE);
  assert.equal(source.ok, false);
  assert.match(source.errors[0], /definition/);
  assert.match(source.errors[0], /"loadout-sprite"/);
  assert.match(source.errors[0], /no longer/);
  const v1 = await L.make.sprite({ ...goodData(), version: 1 });
  assert.equal(v1.ok, false);
  assert.match(v1.errors[0], /version 2/);
  const broken = await L.make.sprite('{ "format": "loadout-sprite", ');
  assert.equal(broken.ok, false);
  assert.match(broken.errors[0], /JSON/);
  const dead = await L.make.sprite(deadControl());
  assert.equal(dead.ok, false);
  assert.equal(dead.id, 'api-test-dead');
  assert.equal(dead.kept, false);
  assert.match(dead.errors.join('\n'), /"weight"/);
  const hostileText = JSON.stringify(goodData()).replace('"name"', '"__proto__": { "polluted": true }, "name"');
  await L.make.sprite(hostileText);
  // the wall drops the key and says so; what is left is the good gem, which passes the check (make.sprite would keep it,
  // but in Node it cannot read the catalogue to see the id is free: the page does that, tests/e2e/route2-data.spec.mjs)
  const hostile = await L.check(hostileText);
  assert.equal(({}).polluted, undefined, 'nothing reached Object.prototype');
  assert.equal(hostile.ok, true, hostile.errors.join('\n'));
  assert.ok(hostile.warnings.some((w) => /Removed 1 key named __proto__/.test(w)), hostile.warnings.join('\n'));
  const big = await L.make.sprite({ ...goodData(), blurb: 'x'.repeat(140 * 1024) });
  assert.equal(big.ok, false);
  assert.match(big.errors.join('\n'), /128 KB/);
});

// review of B11 round 2, issue 4: the plain-data wall comes first. Text over 128 KB or nested over 20 deep is refused
// with the wall's words before anything else reads it: the pieces it names are not loaded (engine/pieces.js loadFor).
test('make.sprite and check refuse oversized or deeply nested text with the wall\'s words, before any piece is loaded', async () => {
  const L = createLoadout({});
  const store = sitePieces(), loadFor = store.loadFor;
  const asked = [];
  store.loadFor = function (d) { asked.push(d); return loadFor.apply(this, arguments); };
  try {
    const good = goodData('api-wall-first');
    const big = JSON.stringify({ ...good, blurb: 'x'.repeat(140 * 1024) });
    const deep = JSON.stringify({ ...good, meta: { ...good.meta, extra: JSON.parse('['.repeat(30) + ']'.repeat(30)) } });
    for (const [text, said] of [[big, /128 KB/], [deep, /nested more than 20 levels/]]) {
      for (const r of [await L.make.sprite(text), await L.check(text)]) {
        assert.equal(r.ok, false);
        assert.match(r.errors.join('\n'), said);
      }
    }
    assert.equal(asked.length, 0, 'no piece was looked up for refused text');
    // (the spy does see a definition that passes the wall)
    const fine = await L.check(JSON.stringify(good));
    assert.equal(fine.ok, true, fine.errors.join('\n'));
    assert.ok(asked.length >= 1);
  } finally { store.loadFor = loadFor; }
});

test('check(definition) gives the quality bar\'s verdict without a page, and keeps nothing', async () => {
  const L = createLoadout({});
  const good = await L.check(goodData());
  assert.equal(good.ok, true, JSON.stringify(good.errors));
  assert.equal(good.id, GOOD_ID);
  assert.equal(good.kind, 'sprite');
  assert.ok(good.metrics);
  const asText = await L.check(JSON.stringify(goodData()));
  assert.equal(asText.ok, true, 'JSON text is taken too');
  const draft = await L.check(noWords());
  assert.equal(draft.ok, false);
  assert.match(draft.errors.join('\n'), /meta\.words/);
  const dead = await L.check(deadControl());
  assert.equal(dead.ok, false);
  assert.match(dead.errors.join('\n'), /"weight"/);
  const source = await L.check(OLD_SOURCE);
  assert.equal(source.ok, false);
  assert.match(source.errors[0], /no longer/);
});

// ---- old bags and links: dropped with a plain message (DQ2) --------------------------------------------------------

test('a bag item made from source text is never drawn: it needs re-making, made with an older version of Loadout', () => {
  assert.match(OLDER_VERSION, /older version of Loadout/);
  assert.match(OLDER_VERSION, /new link|again/);
  const old = madeItemState({ kind: 'sprite', id: 'old-gem', settings: {}, definition: { source: OLD_SOURCE } });
  assert.deepEqual(old, { state: 'needs re-making', name: 'old-gem', reason: OLDER_VERSION, say: OLDER_LINE });
  // the one line the bag page shows on it (DQ2: "made with an older version; ask for a new link")
  assert.match(OLDER_LINE, /made with an older version of Loadout; ask for a new link/);
  assert.equal(madeItemState({ kind: 'sprite', id: GOOD_ID, settings: {}, definition: { data: goodData() } }), null, 'data is drawn by the site, no check off the page');
  assert.equal(madeItemState({ kind: 'sprite', id: 'coin', settings: {} }), null, 'a catalogue item');
});

test('a link that holds source text no longer asks to run anything: peekLink counts it as old', () => {
  const from = createBag(memoryStorage());
  from.add({ kind: 'sprite', id: 'old-gem', settings: {}, definition: { source: OLD_SOURCE } });
  from.add({ kind: 'sprite', id: 'knight', settings: {} });
  const to = createBag(memoryStorage());
  const peek = to.peekLink(from.toLink());
  assert.equal(peek.count, 2);
  assert.equal(peek.old, 1);
  assert.ok(!peek.code, 'nothing in it is a program that would run');
});

test('the bag takes a version 2 definition as data: add, a reload, a link; one that fails the check is refused', async () => {
  await loadStudioCheck();
  const storage = memoryStorage();
  const bag = createBag(storage);
  const key = bag.add({ kind: 'sprite', id: GOOD_ID, settings: { params: { shape: 'square' } }, definition: { data: goodData() } });
  const item = bag.get(key);
  assert.equal(item.id, GOOD_ID);
  assert.equal(item.definition.data.version, 2);
  assert.deepEqual(item.settings.params, { shape: 'square' });
  assert.equal(createBag(storage).get(key).definition.data.id, GOOD_ID, 'kept through a reload');
  const link = bag.toLink();
  assert.match(link, /load=z\./, 'a link with data in it is deflated');
  const to = createBag(memoryStorage());
  assert.equal(await to.fromLinkAsync(link), 1);
  assert.deepEqual(to.items()[0].definition.data, item.definition.data);
  assert.throws(() => bag.add({ kind: 'sprite', id: 'api-test-dead', settings: {}, definition: { data: deadControl() } }), /"weight"/);
});

test('a definition made on a visit is the bag\'s: updateDefinition follows a re-make that passes', async () => {
  await loadStudioCheck();
  const bag = createBag(memoryStorage());
  const a = bag.add({ kind: 'sprite', id: GOOD_ID, settings: {}, definition: { data: goodData() } });
  const better = { ...goodData(), name: 'Better gem' };
  assert.equal(bag.updateDefinition(a, { data: better }), true);
  assert.equal(bag.get(a).definition.data.name, 'Better gem');
  assert.equal(bag.get(a).id, GOOD_ID, 'its id stays');
});
