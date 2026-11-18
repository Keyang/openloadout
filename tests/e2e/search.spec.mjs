// Search in the browser (FIND-2, FIND-8, FIND-9): search/client.js against an index built from the
// stand-in catalogue, through its three levels. Run with: npx playwright test tests/e2e/search.spec.mjs
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSearchIndex } from '../../tools/lib/search-index.mjs';
import { createEmbedder } from '../../tools/lib/embed.mjs';
import { vendorAll } from '../../tools/lib/vendor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(ROOT, 'tests', 'fixtures', 'search');
const PAGE = '/tests/fixtures/search/index.html';
const catalog = JSON.parse(fs.readFileSync(path.join(FIX, 'catalog.json'), 'utf8'));
const byId = new Map(catalog.assets.map((a) => [a.id, a]));
const JUNK = ['"', '*', '(', '😀', '日本', '%_', '"" ()', ' - '];

test.describe.configure({ mode: 'serial' });     // one worker: the index and vendor/ are built once

test.beforeAll(async () => {
  test.setTimeout(300_000);                        // the first run downloads the model (about 24 MB)
  await vendorAll();
  const embedder = await createEmbedder();
  await buildSearchIndex({ assets: catalog.assets, outFile: path.join(FIX, 'generated', 'search.sqlite'), embed: embedder.embed });
  await buildSearchIndex({ assets: catalog.assets, outFile: path.join(FIX, 'generated', 'keywords-only.sqlite') });
});

async function open(page, query = '') {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(PAGE + query);
  await page.waitForFunction(() => window.ready === true);
  return { requests, errors };
}
const ids = (page, q, opts = {}) => page.evaluate(async ([q, opts]) => (await window.search.search(q, opts)).map((r) => r.id), [q, opts]);
const status = (page) => page.evaluate(() => window.search.status);
const modelRequests = (requests) => requests.filter((u) => u.includes('/vendor/transformers/') || u.includes('/vendor/models/') || u.includes('/vendor/ort/') || u.includes('embed-worker'));

test('basic level: answers at once from the catalogue alone', async ({ page }) => {
  const { requests, errors } = await open(page, '?db=none');
  expect(await page.evaluate(() => window.search.level)).toBe('basic');
  expect(await page.evaluate(() => window.first[0].id)).toBe('wizard');
  expect((await ids(page, 'treasure chest'))[0]).toBe('chest');
  expect(await ids(page, 'chop', { limit: 5 })).toContain('axe-chop');
  expect((await ids(page, 'wizzard'))[0]).toBe('wizard');                       // typo
  expect(await ids(page, 'skel', { limit: 5 })).toContain('skeleton');          // while typing

  const sounds = await ids(page, 'door', { filters: { kind: 'sound' }, limit: 10 });
  expect(sounds.length).toBeGreaterThan(0);
  for (const id of sounds) expect(byId.get(id).kind).toBe('sound');
  expect(sounds.slice(0, 5)).toContain('door-open');
  const boss = await ids(page, '', { filters: { role: 'music/boss' } });
  expect(boss.sort()).toEqual(['music-boss', 'music-final-boss', 'music-mothership']);
  const bundle = await ids(page, 'pickup', { filters: { bundle: 'space-shooter', themes: ['space', 'sci-fi'] }, limit: 20 });
  expect(bundle.length).toBeGreaterThanOrEqual(3);
  expect(bundle).toEqual(expect.arrayContaining(['ammo-box', 'energy-cell', 'shield-orb']));
  expect(bundle).not.toContain('coin');                                        // a pickup, but not in that bundle
  for (const id of bundle) {
    expect(byId.get(id).bundles).toContain('space-shooter');
    expect(byId.get(id).themes.some((t) => t === 'space' || t === 'sci-fi')).toBe(true);
  }
  // filter names that are not filters are ignored rather than breaking the search
  expect((await ids(page, 'wizard', { filters: { constructor: 'x', hasOwnProperty: 'y' } }))[0]).toBe('wizard');
  expect((await page.evaluate(() => window.search.counts({ constructor: 'x' }))).total).toBe(catalog.assets.length);

  const counts = await page.evaluate(() => window.search.counts({ kind: 'sprite' }));
  expect(counts.total).toBe(catalog.assets.filter((a) => a.kind === 'sprite').length);
  expect(counts.type.character).toBe(catalog.assets.filter((a) => a.type === 'character').length);
  expect(counts.kind.sound).toBe(catalog.assets.filter((a) => a.kind === 'sound').length);
  expect(counts.themes.farm).toBeGreaterThan(0);

  const near = await page.evaluate(() => window.search.similar('footstep-snow', 6));
  expect(near).toHaveLength(6);
  expect(near.filter((id) => id.startsWith('footstep-')).length).toBeGreaterThanOrEqual(4);

  expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(false);
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(false);   // nothing to switch on without an index file
  expect(requests.some((u) => u.includes('/vendor/') || u.endsWith('.sqlite'))).toBe(false);
  expect(errors).toEqual([]);
});

test('input with no searchable words finds nothing; only an empty search lists assets', async ({ page }) => {
  await open(page);
  for (const level of ['basic', 'keywords']) {
    if (level === 'keywords') expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(true);
    for (const junk of JUNK) {
      expect(await ids(page, junk), `"${junk}" at ${level}`).toEqual([]);
      expect(await ids(page, junk, { filters: { kind: 'sound' } }), `"${junk}" with filters at ${level}`).toEqual([]);
    }
    expect(await ids(page, 'xxxxxxxxxxxx')).toEqual([]);
    expect(await ids(page, 'a OR b')).toEqual([]);
    expect((await ids(page, '', { limit: 30 })).length).toBe(30);
    expect((await ids(page, '   ', { filters: { kind: 'music' }, limit: 100 })).length).toBe(catalog.assets.filter((a) => a.kind === 'music').length);
  }
  // a very long search is cut short instead of slowing the page down
  const long = await page.evaluate(async () => { const t = performance.now(); const rows = await window.search.search('wizard ' + 'qqqq '.repeat(50000)); return { ms: performance.now() - t, first: rows[0].id }; });
  expect(long.first).toBe('wizard');
  expect(long.ms).toBeLessThan(300);
});

test('a missing index file leaves the basic level working', async ({ page }) => {
  await open(page, '?db=missing');
  expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(false);
  const s = await status(page);
  expect(s.level).toBe('basic');
  expect(s.keywords).toBe('failed');
  expect((await ids(page, 'hero knight'))[0]).toBe('knight');
  expect(await page.evaluate(() => window.search.whenLevel('meaning'))).toBe(false);
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(false);
});

test('keywords level: arrives when SQLite and the index file have loaded, and does no model work', async ({ page }) => {
  const { requests, errors } = await open(page);
  // the search made before anything had loaded was answered straight away
  expect(await page.evaluate(() => window.firstLevel)).toBe('basic');
  expect(await page.evaluate(() => window.first[0].id)).toBe('wizard');

  expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(true);
  expect(await page.evaluate(() => window.search.level)).toBe('keywords');
  expect(await page.evaluate(() => window.levels)).toEqual(['keywords']);
  const s = await status(page);
  expect(s.keywords).toBe('ready');
  expect(s.meaning).toBe('off');                                              // off unless asked for
  expect(s.timings.indexBytes).toBe(fs.statSync(path.join(FIX, 'generated', 'search.sqlite')).size);

  expect((await ids(page, 'hero knight'))[0]).toBe('knight');
  expect(await ids(page, 'money', { limit: 5 })).toContain('coin');
  expect(await ids(page, 'level up', { limit: 5 })).toContain('jingle-level-up');
  expect(await ids(page, 'swaggering', { limit: 3 })).toContain('pirate');     // a word found only in a description
  expect((await ids(page, 'explotion', { limit: 5 })).some((id) => id.includes('explosion'))).toBe(true);
  expect(await ids(page, 'kitty', { limit: 5 })).not.toContain('cat');           // keywords cannot know this one

  const fx = await ids(page, 'fire', { filters: { type: 'effect' }, limit: 10 });
  expect(fx).toContain('fx-fire-burst');
  for (const id of fx) expect(byId.get(id).type).toBe('effect');
  const world = await ids(page, 'open', { filters: { kind: 'sound', role: 'world' }, limit: 10 });
  expect(world.length).toBeGreaterThan(0);
  for (const id of world) { expect(byId.get(id).kind).toBe('sound'); expect(byId.get(id).role.startsWith('world/')).toBe(true); }
  const farm = await ids(page, 'character', { filters: { view: 'top-down', gameTypes: 'farming-sim' }, limit: 5 });
  expect(farm).toContain('farmer');
  expect((await ids(page, '', { filters: { kind: 'music' }, limit: 100 })).length).toBe(catalog.assets.filter((a) => a.kind === 'music').length);

  // similar assets come from the lists stored in the index file: shared words and role first
  const near = await page.evaluate(() => window.search.similar('coin', 6));
  expect(near).toHaveLength(6);
  expect(near).not.toContain('coin');
  expect(near.slice(0, 3)).toContain('coin-pickup');
  expect((await page.evaluate(() => window.search.counts({ kind: 'sound', role: 'world' }))).total).toBe(
    catalog.assets.filter((a) => a.kind === 'sound' && a.role.startsWith('world/')).length);

  // with meaning off there is no model work at all: no worker, no model file, however much is searched
  expect(await page.evaluate(() => window.search.whenLevel('meaning'))).toBe(false);
  expect(await page.evaluate(() => window.search.warm())).toBe(false);
  await page.waitForTimeout(300);
  expect(requests.some((u) => u.includes('/vendor/sqlite/sqlite3.wasm'))).toBe(true);
  expect(modelRequests(requests)).toEqual([]);
  expect(page.workers()).toHaveLength(0);
  expect((await status(page)).timings.modelQueries).toBe(0);
  expect(errors).toEqual([]);
});

test('an index file without vectors stops at the keywords level', async ({ page }) => {
  await open(page, '?db=keywords-only&meaning=eager');
  expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(true);
  expect(await page.evaluate(() => window.search.whenLevel('meaning'))).toBe(false);
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(false);
  expect(await page.evaluate(() => window.search.level)).toBe('keywords');
  expect((await status(page)).meaning).toBe('unavailable');
  expect((await ids(page, 'dragon'))[0]).toBe('dragon');
  expect((await page.evaluate(() => window.search.similar('footstep-snow', 6))).length).toBe(6);
  expect(page.workers()).toHaveLength(0);
});

test('a model that fails to load leaves the keywords level working, and can be tried again', async ({ page }) => {
  await page.route('**/vendor/transformers/**', (route) => route.abort());
  await open(page, '?meaning=eager');
  expect(await page.evaluate(() => window.search.whenLevel('meaning'))).toBe(false);
  const s = await status(page);
  expect(s.level).toBe('keywords');
  expect(s.meaning).toBe('failed');
  expect((await ids(page, 'hero knight'))[0]).toBe('knight');
  await expect.poll(() => page.workers().length).toBe(0);
  await page.unroute('**/vendor/transformers/**');
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(true);
  expect(await page.evaluate(() => window.search.level)).toBe('meaning');
});

test('close() while things are loading stops them: no database, no worker, no later level', async ({ page }) => {
  const { errors } = await open(page, '?meaning=eager&close=now');
  await page.waitForTimeout(1500);                                             // long enough for both levels to have arrived
  const s = await status(page);
  expect(s.level).toBe('basic');
  expect(s.keywords).toBe('closed');
  expect(s.meaning).toBe('off');
  expect(await page.evaluate(() => window.levels)).toEqual([]);
  expect(page.workers()).toHaveLength(0);
  expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(false);
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(false);
  expect(page.workers()).toHaveLength(0);
  expect((await ids(page, 'hero knight'))[0]).toBe('knight');                  // the catalogue still answers
  expect(errors).toEqual([]);

  // closing after everything has loaded stops the worker too
  await open(page, '?meaning=eager');
  expect(await page.evaluate(() => window.search.whenLevel('meaning'))).toBe(true);
  expect(page.workers()).toHaveLength(1);
  await page.evaluate(() => window.search.close());
  await expect.poll(() => page.workers().length).toBe(0);
  expect((await status(page)).level).toBe('basic');
  expect((await ids(page, 'hero knight'))[0]).toBe('knight');
});

test('meaning level: off until switched on, then loads in a worker from this site only', async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const { requests, errors } = await open(page);
  expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(true);
  expect(await ids(page, 'kitty', { limit: 5 })).not.toContain('cat');
  expect(modelRequests(requests)).toEqual([]);
  expect(page.workers()).toHaveLength(0);

  // the visitor switches it on
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(true);
  expect(await page.evaluate(() => window.search.level)).toBe('meaning');
  expect(await page.evaluate(() => window.levels)).toEqual(['keywords', 'meaning']);
  const s = await status(page);
  expect(s.device).toBe('wasm');                                              // one thread on the processor: what GitHub Pages allows
  expect(s.model).toBe('Snowflake/snowflake-arctic-embed-xs');
  expect(page.workers()).toHaveLength(1);

  // searches by meaning, which keywords alone miss
  expect(await ids(page, 'kitty', { limit: 5 })).toContain('cat');
  expect(await ids(page, 'weapon swoosh when attacking', { limit: 5 })).toContain('sword-swing');
  expect(await ids(page, 'big lizard that breathes fire', { limit: 5 })).toContain('dragon');
  // exact names and typos are still right, and filters still hold
  expect((await ids(page, 'hero knight'))[0]).toBe('knight');
  expect((await ids(page, 'wizzard'))[0]).toBe('wizard');
  const music = await ids(page, 'something tense for sneaking around', { filters: { kind: 'music' }, limit: 10 });
  expect(music.slice(0, 5)).toContain('music-stealth');
  for (const id of music) expect(byId.get(id).kind).toBe('music');

  // nonsense finds nothing, and results are not padded out with unrelated assets
  expect(await ids(page, 'xxxxxxxxxxxx')).toEqual([]);
  expect(await ids(page, 'a OR b')).toEqual([]);
  expect(await ids(page, 'qwrtp zxcvb asdfghjkl')).toEqual([]);
  for (const junk of JUNK) expect(await ids(page, junk), `"${junk}"`).toEqual([]);
  const money = await ids(page, 'money', { limit: 30 });
  expect(money.slice(0, 5)).toContain('coin');
  expect(money.length).toBeLessThan(20);                                       // only what is similar enough, not the whole limit
  expect(money).not.toContain('wolf');

  const timings = (await status(page)).timings;
  console.log(`search levels in the browser: keywords after ${timings.keywordsMs} ms, model after ${timings.meaningMs} ms on ${s.device}, last query read in ${timings.lastQueryMs.toFixed(1)} ms`);
  expect(requests.some((u) => u.includes('/vendor/models/') && u.endsWith('.onnx'))).toBe(true);
  expect(requests.some((u) => u.includes('asyncify'))).toBe(false);          // the larger WebGPU runtime is not fetched
  for (const u of requests) expect(u.startsWith(baseURL) || u.startsWith('blob:') || u.startsWith('data:'), `request left the site: ${u}`).toBe(true);

  // and off again: the worker goes, searches are keyword searches, and it can come back
  await page.evaluate(() => window.search.disableMeaning());
  expect((await status(page)).level).toBe('keywords');
  expect((await status(page)).meaning).toBe('off');
  expect(await page.evaluate(() => window.levels)).toEqual(['keywords', 'meaning', 'keywords']);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(await ids(page, 'kitty', { limit: 5 })).not.toContain('cat');
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(true);
  expect(await ids(page, 'kitty', { limit: 5 })).toContain('cat');
  expect(errors).toEqual([]);
});

test('meaning: "on-search" loads the model at the first search, which is still answered at once', async ({ page }) => {
  const { requests } = await open(page, '?meaning=on-search');
  expect(await page.evaluate(() => window.search.whenLevel('keywords'))).toBe(true);
  const before = await page.evaluate(async () => {
    const t = performance.now();
    const rows = await window.search.search('hero knight');
    return { ms: performance.now() - t, first: rows[0].id, level: window.search.level };
  });
  expect(before.first).toBe('knight');
  expect(before.level).toBe('keywords');
  expect(before.ms).toBeLessThan(500);
  expect(await page.evaluate(() => window.search.whenLevel('meaning'))).toBe(true);
  expect(requests.some((u) => u.includes('/vendor/models/'))).toBe(true);
  expect(await ids(page, 'kitty', { limit: 5 })).toContain('cat');
});

test('while someone types, the model reads only the newest search', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(true);
  const r = await page.evaluate(async () => {
    const s = window.search;
    const before = s.status.timings.modelQueries;
    const typed = ['s', 'sm', 'sma', 'smal', 'small', 'small f', 'small fu', 'small fur', 'small furr', 'small furry', 'small furry p', 'small furry pet that purrs'];
    const results = await Promise.all(typed.map((q) => s.search(q, { limit: 5 })));
    return { read: s.status.timings.modelQueries - before, lengths: results.map((x) => Array.isArray(x)), last: results.at(-1).map((x) => x.id) };
  });
  expect(r.lengths.every(Boolean)).toBe(true);                                 // every search was answered
  expect(r.read).toBeLessThanOrEqual(2);                                       // the one in progress and the newest; the rest were dropped
  expect(r.read).toBeGreaterThanOrEqual(1);
  expect(r.last).toContain('cat');                                             // the newest one got the model's answer
});

test('a model worker that breaks after loading drops search back to keywords without making anyone wait', async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(true);
  expect(await ids(page, 'kitty', { limit: 5 })).toContain('cat');
  await page.workers()[0].evaluate(() => { setTimeout(() => { throw new Error('the model worker broke'); }, 0); });
  await expect.poll(async () => (await status(page)).level).toBe('keywords');
  const s = await status(page);
  expect(s.meaning).toBe('failed');
  expect(s.error).toContain('meaning');
  expect(await page.evaluate(() => window.levels)).toEqual(['keywords', 'meaning', 'keywords']);
  await expect.poll(() => page.workers().length).toBe(0);
  const after = await page.evaluate(async () => { const t = performance.now(); const rows = await window.search.search('hero knight'); return { ms: performance.now() - t, first: rows[0].id }; });
  expect(after.first).toBe('knight');
  expect(after.ms).toBeLessThan(300);                                          // not the 1.2 s wait for a model that is gone
  expect(await page.evaluate(() => window.search.enableMeaning())).toBe(true); // and it can be switched back on
});
