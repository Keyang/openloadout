// "Adding an asset is one file", for a DATA sprite (docs/data-sprites.md, build item B9; DQ1: sprites/<id>.json).
//
// A scratch copy of the project gets two new data files and nothing else in sprites/: a coin (generators twinkle@1 and
// mark@1) and a pot that uses a piece (part:test-tuft@1, with the test pieces put in the copy's pieces/). After
// `node tools/build.mjs --root <copy> --dist`, both are in the catalogue with their pictures, found by a word only they
// have, and open on their own pages, drawn from their definitions (fetched, never imported) with the pieces loaded.
// Then the coin goes the whole way, as a code sprite does in tests/e2e/newasset.spec.mjs: changed on its page, saved
// to the bag, drawn on the bag page with those settings, and in the downloaded package with its settings.
// The copy is built and served on its own port, so this never touches the real project.
// Run with: npx playwright test tests/e2e/newasset-data.spec.mjs
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test, expect, waitForDrawn, canvasStats, setRange, downloadFrom, readZip } from '../helpers/test.mjs';
import { ROOT } from '../helpers/catalog.mjs';
import { coinDef, tuftDef, asFile } from '../helpers/data-sprites.mjs';

const COPY = ['index.html', 'app', 'engine', 'rigs', 'sound', 'sprites', 'sounds', 'bundles', 'catalog', 'search', 'quality', 'pieces'];
const COIN = { id: 'zz-data-token', name: 'Quillmoss token', word: 'quillmoss' };
const POT = { id: 'zz-data-pot', name: 'Brindlewort pot', word: 'brindlewort' };

let scratch = null, server = null, BASE = null, CATALOG = null;
const row = (id) => CATALOG.assets.find((a) => a.id === id);
function must(ok, message) { if (!ok) throw new Error(`newasset-data: ${message}`); }
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const named = (def, it) => ({ ...def, id: it.id, name: it.name, meta: { ...def.meta, words: [...def.meta.words.slice(0, -1), it.word] } });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(900_000);
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-newasset-data-'));
  for (const p of COPY) fs.cpSync(path.join(ROOT, p), path.join(scratch, p), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'tools'), path.join(scratch, 'tools'), 'dir');
  for (const f of fs.readdirSync(path.join(ROOT, 'tests', 'fixtures', 'pieces', 'pieces'))) {
    if (f.endsWith('.json') && !f.startsWith('_')) fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'pieces', 'pieces', f), path.join(scratch, 'pieces', f));
  }
  // ---- the only edits: two data files ----------------------------------------------------------------
  fs.writeFileSync(path.join(scratch, 'sprites', `${COIN.id}.json`), asFile(named(coinDef(), COIN)));
  fs.writeFileSync(path.join(scratch, 'sprites', `${POT.id}.json`), asFile(named(tuftDef(), POT)));

  const built = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), '--root', scratch, '--dist', '--skip-quality', '--no-meaning'], { encoding: 'utf8', timeout: 840_000 });
  must(built.status === 0, `the build of the copy failed:\n${built.stdout}${built.stderr}`);
  const dist = path.join(scratch, 'dist');
  CATALOG = JSON.parse(fs.readFileSync(path.join(dist, 'generated', 'catalog.json'), 'utf8'));

  const port = await freePort();
  server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs'), '--port', String(port), '--root', dist], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`newasset-data: the server stopped (${code})`)));
    server.stdout.on('data', (d) => { if (String(d).includes('Loadout is at')) resolve(); });
  });
  BASE = `http://localhost:${port}`;
});

test.afterAll(() => {
  if (server) server.kill();
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

const open = async (page, route) => { await page.goto(`${BASE}/index.html#${route}`, { waitUntil: 'domcontentloaded' }); await waitForDrawn(page); };
const box = (page) => page.getByRole('searchbox', { name: 'Search' });
const results = (page) => page.locator('ul.results > li');
const resultIds = (page) => results(page).evaluateAll((lis) => lis.map((li) => li.dataset.id));
const bagCount = (page) => page.locator('header .bag-count');
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());
const json = (file) => JSON.parse(new TextDecoder().decode(file.data));

test('the build lists both data files as sprites, with their src, rev and pictures, and publishes pieces/', () => {
  for (const it of [COIN, POT]) {
    const r = row(it.id);
    expect(r).toMatchObject({ kind: 'sprite', name: it.name, src: `sprites/${it.id}.json` });
    expect(r.rev).toMatch(/^[0-9a-f]{12}$/);
    expect(r.words).toContain(it.word);
    for (const file of [r.thumb, r.strip]) expect(fs.statSync(path.join(scratch, 'dist', file)).size, file).toBeGreaterThan(60);
  }
  expect(fs.existsSync(path.join(scratch, 'dist', 'pieces', 'part-test-tuft.v1.json'))).toBe(true);
  expect(fs.existsSync(path.join(scratch, 'dist', 'generated', 'pieces.json'))).toBe(true);
});

test('each is found by the word only it has, with its picture', async ({ page }) => {
  await open(page, '/browse');
  for (const it of [COIN, POT]) {
    await box(page).fill(it.word);
    await expect.poll(() => resultIds(page)).toEqual([it.id]);
    const li = page.locator(`ul.results > li[data-id="${it.id}"]`);
    await expect(li).toContainText(it.name);
    await expect.poll(() => li.locator('img.thumb').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
});

test('each opens on its own page and is drawn from its definition, fetched and never imported', async ({ page }) => {
  const asked = [];
  page.on('request', (r) => asked.push(new URL(r.url()).pathname));
  for (const it of [COIN, POT]) {
    await open(page, `/sprite/${it.id}`);
    await expect(page.locator('h1')).toHaveText(it.name);
    await expect.poll(async () => (await canvasStats(page.locator('canvas.stage'))).opaque).toBeGreaterThan(0);
    expect(asked).toContain(`/sprites/${it.id}.json`);
    expect(asked).not.toContain(`/sprites/${it.id}.js`);
  }
  expect(asked).toContain('/pieces/part-test-tuft.v1.json');
  expect(asked).toContain('/pieces/stamp-test-clod.v1.json');
});

test('the coin is changed on its page, saved to the bag, drawn there with its settings, and in the package with them', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });      // bag pictures hold still, so they can be read
  await open(page, `/sprite/${COIN.id}`);
  await expect(page.locator('h1')).toHaveText(COIN.name);
  await expect.poll(async () => (await canvasStats(page.locator('canvas.stage'))).opaque).toBeGreaterThan(0);
  const slider = page.locator('.rx-panel .ctl input[type=range]:visible').first();
  const key = (await slider.getAttribute('id')).replace(/^c-/, '');
  await setRange(slider, 'other');
  const value = Number(await slider.inputValue());
  await expect.poll(() => page.evaluate(() => location.hash)).toContain(`${key}=`);
  await expect(bagCount(page)).toHaveText('1');
  await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
  const inBag = await bagItems(page);
  expect(inBag.map((i) => [i.kind, i.id])).toEqual([['sprite', COIN.id]]);
  expect(inBag[0].settings.params[key]).toBe(value);

  // the bag page draws it with these settings: every colour of its first preview frame, drawn from its definition
  await page.locator('header a.bag-link').click();
  const items = page.locator('.bag-item');
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText(COIN.name);
  await expect(page.locator('.bag-item .gone')).toHaveCount(0);
  const tile = items.nth(0).locator('canvas.tile');
  await expect(tile).toHaveCount(1);
  const picture = () => tile.evaluate(async (cv, { id, params }) => {
    const [C, { renderFrame, cleanParams }] = await Promise.all([import('/app/catalog.js'), import('/engine/sprite.js')]);
    await C.loadCatalog();
    const sprite = await C.loadSprite(id);
    const colours = (bytes) => { const set = new Set(); for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3] === 255) set.add((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]); return set; };
    const want = colours(renderFrame(sprite, sprite.preview, 0, cleanParams(sprite, params)).bytes());
    const have = colours(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
    return { wanted: want.size, missing: [...want].filter((c) => !have.has(c)).length };
  }, { id: COIN.id, params: inBag[0].settings.params });
  await expect.poll(async () => (await picture()).missing).toBe(0);
  expect((await picture()).wanted).toBeGreaterThanOrEqual(3);

  // the package: its sheet, its frames' data and its settings in the manifest
  const { name, bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), { timeout: 120_000 });
  expect(name).toMatch(/\.zip$/);
  const files = readZip(new Uint8Array(bytes));
  const names = files.map((f) => f.name);
  const fileOf = (n) => files.find((f) => f.name === n);
  for (const n of [`sprites/${COIN.id}/${COIN.id}.png`, `sprites/${COIN.id}/${COIN.id}.json`, 'manifest.json']) expect(names, n).toContain(n);
  expect(Buffer.from(fileOf(`sprites/${COIN.id}/${COIN.id}.png`).data.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a');
  const sheet = json(fileOf(`sprites/${COIN.id}/${COIN.id}.json`));
  expect(sheet.sprite).toBe(COIN.id);
  expect(Object.keys(sheet.animations)).toEqual(row(COIN.id).tech.clips.map((c) => c.name));
  const manifest = json(fileOf('manifest.json'));
  expect(manifest.missing).toBeUndefined();
  expect(manifest.assets).toHaveLength(1);
  expect(manifest.assets[0]).toMatchObject({ id: COIN.id, kind: 'sprite', name: COIN.name });
  expect(manifest.assets[0].settings).toEqual(inBag[0].settings);
  expect(manifest.assets[0].settings.params[key]).toBe(value);
});
