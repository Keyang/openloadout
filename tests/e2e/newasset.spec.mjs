// The acceptance check for "adding an asset is one file" (W2-G).
//
// A scratch copy of the project gets ONE new sprite file and ONE new sound patch, and nothing else is edited.
// After `node tools/build.mjs`, both must work everywhere on the site: counted on the home page and listed in the
// library with their pictures, found by a word only they have, open on their own pages, can be changed and added to
// the bag, drawn on the bag page, and inside the downloaded package with their settings in manifest.json.
//
// The copy is built with the build's own --root and --dist options and served on its own port, so this test
// never touches the real project's generated files.
// Run with: npx playwright test tests/e2e/newasset.spec.mjs
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { test, expect, waitForDrawn, canvasStats, setRange, downloadFrom, readZip } from '../helpers/test.mjs';
import { ROOT } from '../helpers/catalog.mjs';

// What the site needs to build and run. `tools` is linked, not copied: the build reads its search and vendor steps from the root it builds.
const COPY = ['index.html', 'app', 'engine', 'rigs', 'sound', 'sprites', 'sounds', 'bundles', 'catalog', 'search', 'quality'];
// Words no real asset has, so a search for one can only find the new asset.
const NEW_SPRITE = { id: 'zz-newasset-sprite', name: 'Quibblefrost token', word: 'quibblefrost' };
const NEW_SOUND = { id: 'zz-newasset-sound', name: 'Zanderwhistle blip', word: 'zanderwhistle' };

let scratch = null, server = null, BASE = null, CATALOG = null, FROM = null;
const row = (id) => CATALOG.assets.find((a) => a.id === id);

function must(ok, message) { if (!ok) throw new Error(`newasset: ${message}`); }
const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

/** The text of a sprite file with a new id and name, and one of its words swapped for a new one. */
function renamedSprite(text, fromId, to) {
  const id = new RegExp(`\\bid:\\s*(['"])${fromId}\\1`);
  must(id.test(text), `sprites/${fromId}.js has no id: '${fromId}' to rename`);
  let out = text.replace(id, `id: '${to.id}'`);
  must(/\bname:\s*(['"]).*?\1/.test(out), `sprites/${fromId}.js has no name: '...'`);
  out = out.replace(/\bname:\s*(['"]).*?\1/, `name: '${to.name}'`);
  let swapped = false;
  out = out.replace(/\bwords:\s*\[([^\]]*)\]/, (all, inner) => {
    const words = inner.split(',').map((w) => w.trim()).filter(Boolean);
    words[words.length - 1] = `'${to.word}'`;
    swapped = true;
    return `words: [${words.join(', ')}]`;
  });
  must(swapped, `sprites/${fromId}.js has no meta words list`);
  return out;
}

test.describe.configure({ mode: 'serial' });     // one worker: the copy is built once

test.beforeAll(async () => {
  test.setTimeout(600_000);
  // which existing assets to copy: a small sprite with sliders, and a short sound with sliders (read from the real files)
  const sprites = fs.readdirSync(path.join(ROOT, 'sprites')).filter((f) => f.endsWith('.js') && !f.startsWith('_')).map((f) => f.slice(0, -3));
  const sounds = fs.readdirSync(path.join(ROOT, 'sounds')).filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.slice(0, -5));
  const spriteId = ['coin', ...sprites].find((id) => sprites.includes(id) && /\bmeta:\s*\{[^}]*\btype:\s*'(pickup|prop|character|creature)'/.test(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.js`), 'utf8')));
  const patchOf = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', `${id}.json`), 'utf8'));
  const soundId = ['coin-pickup', ...sounds].find((id) => { if (!sounds.includes(id)) return false; const p = patchOf(id); return p.category !== 'music' && !p.loop && (p.params ?? []).length >= 1; });
  must(spriteId && soundId, 'the project has no sprite or sound to copy');
  FROM = { sprite: spriteId, sound: soundId };

  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-newasset-'));
  for (const p of COPY) fs.cpSync(path.join(ROOT, p), path.join(scratch, p), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'tools'), path.join(scratch, 'tools'), 'dir');

  // ---- the only two edits: one new sprite file, one new sound file --------------------------------
  fs.writeFileSync(path.join(scratch, 'sprites', `${NEW_SPRITE.id}.js`), renamedSprite(fs.readFileSync(path.join(ROOT, 'sprites', `${spriteId}.js`), 'utf8'), spriteId, NEW_SPRITE));
  const patch = patchOf(soundId);
  patch.id = NEW_SOUND.id;
  patch.name = NEW_SOUND.name;
  patch.meta.words = [...patch.meta.words.slice(0, -1), NEW_SOUND.word];
  fs.writeFileSync(path.join(scratch, 'sounds', `${NEW_SOUND.id}.json`), JSON.stringify(patch, null, 1) + '\n');

  // ---- the build, then the built site on its own port ---------------------------------------------
  const built = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'build.mjs'), '--root', scratch, '--dist', '--skip-quality', '--no-meaning'], { encoding: 'utf8', timeout: 540_000 });
  must(built.status === 0, `the build of the copy failed:\n${built.stdout}${built.stderr}`);
  const dist = path.join(scratch, 'dist');
  CATALOG = JSON.parse(fs.readFileSync(path.join(dist, 'generated', 'catalog.json'), 'utf8'));
  must(fs.existsSync(path.join(dist, 'generated', 'search.sqlite')) && fs.existsSync(path.join(dist, 'vendor', 'sqlite')), 'the copy was built without its search file');

  const port = await freePort();
  server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs'), '--port', String(port), '--root', dist], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`newasset: the server stopped (${code})`)));
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
const place = (page, id) => page.locator(`ul.results > li[data-id="${id}"]`);
// a sprite's card shows the picture the build made of it; a sound's card shows its waveform (the build's picture, or
// one drawn from the sound when it was made on this visit)
const pictureLoaded = (card) => card.locator('img.thumb').evaluate((img) => img.complete && img.naturalWidth > 0);
const waveShown = (card) => card.locator('.sound-pic .wave').evaluate((w) => {
  if (w.tagName === 'IMG') return w.complete && w.naturalWidth > 0;
  const g = w.getContext('2d').getImageData(0, 0, w.width, w.height).data; let n = 0; for (let i = 3; i < g.length; i += 4) if (g[i] > 0) n++; return n > 20;
});
/** The home page lists nothing itself: a search there opens the library. */
async function search(page, words) {
  await box(page).fill(words);
  await box(page).press('Enter');
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/browse\?/);
}
const bagCount = (page) => page.locator('header .bag-count');
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());
const json = (file) => JSON.parse(new TextDecoder().decode(file.data));

test('the build lists both new files in the catalogue, with pictures; the asset folders hold assets only', () => {
  // one row per asset file in the copy, and nothing else in those folders: everything that was there, and the two new ones
  // (a hand-kept list file would show up here as a file without a row)
  const files = (dir, ext) => fs.readdirSync(path.join(scratch, dir)).filter((f) => f.endsWith(ext) && !f.startsWith('_'));
  expect(CATALOG.assets.map((x) => x.id).sort()).toEqual([...files('sprites', '.js').map((f) => f.slice(0, -3)), ...files('sprites', '.json').map((f) => f.slice(0, -5)), ...files('sounds', '.json').map((f) => f.slice(0, -5))].sort());      // a sprite is a code file or a data file
  const s = row(NEW_SPRITE.id), a = row(NEW_SOUND.id), from = row(FROM.sprite);
  expect(s).toMatchObject({ kind: 'sprite', name: NEW_SPRITE.name, src: `sprites/${NEW_SPRITE.id}.js`, type: from.type, role: from.role });
  expect(s.words).toContain(NEW_SPRITE.word);
  expect(s.tech.frame).toEqual(from.tech.frame);
  expect(a).toMatchObject({ kind: 'sound', name: NEW_SOUND.name, src: `sounds/${NEW_SOUND.id}.json` });
  expect(a.words).toContain(NEW_SOUND.word);
  for (const file of [s.thumb, s.strip, a.thumb]) expect(fs.statSync(path.join(scratch, 'dist', file)).size, file).toBeGreaterThan(60);
});

test('both are counted on the home page and listed in the library, each with its picture', async ({ page }) => {
  // the home page's numbers come from the catalogue, so they count the two new ones
  const n = (kind) => CATALOG.assets.filter((x) => x.kind === kind).length;
  await open(page, '/');
  await expect(page.locator('main')).toContainText(`${n('sprite')} sprites, ${n('sound')} sounds`);
  await open(page, '/browse');
  await expect(results(page)).toHaveCount(CATALOG.assets.length);
  for (const [it, href, drawn] of [[NEW_SPRITE, `#/sprite/${NEW_SPRITE.id}`, pictureLoaded], [NEW_SOUND, `#/sound/${NEW_SOUND.id}`, waveShown]]) {
    const li = place(page, it.id);
    await expect(li).toHaveCount(1);
    await li.scrollIntoViewIfNeeded();
    await expect(li.locator(`a[href="${href}"]`)).toBeVisible();
    await expect(li).toContainText(it.name);
    await expect.poll(() => drawn(li)).toBe(true);
  }
  // the filters count them too
  await open(page, '/browse?kind=sprite');
  await expect(results(page)).toHaveCount(CATALOG.assets.filter((x) => x.kind === 'sprite').length);
  expect(await resultIds(page)).toContain(NEW_SPRITE.id);
  await open(page, '/browse?kind=sound');
  expect(await resultIds(page)).toContain(NEW_SOUND.id);
});

test('each is found by the word only it has', async ({ page }) => {
  await open(page, '/');
  await search(page, NEW_SPRITE.word);      // from the home page, into the library; then the library's own box
  for (const it of [NEW_SPRITE, NEW_SOUND]) {
    await box(page).fill(it.word);
    await expect.poll(() => resultIds(page)).toEqual([it.id]);
    await expect(page.locator('.result-line')).toContainText(`for "${it.word}"`);
    await expect(place(page, it.id)).toContainText(it.name);
  }
  // and by its name, typed a little wrong
  await box(page).fill(NEW_SPRITE.name.replace('frost', 'frst'));
  await expect.poll(async () => (await resultIds(page))[0]).toBe(NEW_SPRITE.id);
  // the search file was loaded too, without an error (the shared `test` fails on any console error)
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').some((r) => r.name.endsWith('/generated/search.sqlite')))).toBe(true);
});

test('each opens on its own page, is changed, goes into the bag, is drawn there, and is in the package with its settings', async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });      // bag pictures hold still, so they can be read

  // ---- the sprite: found, opened from its card, changed, added
  await open(page, '/');
  await search(page, NEW_SPRITE.word);
  await place(page, NEW_SPRITE.id).locator(`a[href="#/sprite/${NEW_SPRITE.id}"]`).click();
  await expect(page.locator('h1')).toHaveText(NEW_SPRITE.name);
  await waitForDrawn(page);
  expect((await canvasStats(page.locator('canvas.stage'))).opaque).toBeGreaterThan(0);
  await expect(page.locator('.strip .cell canvas').first()).toBeVisible();
  const spriteSlider = page.locator('.rx-panel .ctl input[type=range]:visible').first();
  const spriteKey = (await spriteSlider.getAttribute('id')).replace(/^c-/, '');
  await setRange(spriteSlider, 'other');
  const spriteValue = Number(await spriteSlider.inputValue());
  await expect.poll(() => page.evaluate(() => location.hash)).toContain(`${spriteKey}=`);
  // the change saved itself to the bag (docs/site-design.md, section 3): there is nothing to press
  await expect(bagCount(page)).toHaveText('1');
  await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');

  // ---- the sound: found, opened from its card, changed, played, added
  await page.locator('a.brand').click();
  await waitForDrawn(page);
  await search(page, NEW_SOUND.word);
  await place(page, NEW_SOUND.id).locator(`a[href="#/sound/${NEW_SOUND.id}"]`).click();
  await expect(page.locator('h1')).toHaveText(NEW_SOUND.name);
  await waitForDrawn(page);
  const soundSlider = page.locator('.rx-panel .ctl input[type=range]:visible').first();
  const soundKey = (await soundSlider.getAttribute('id')).replace(/^c-/, '');
  await setRange(soundSlider, 'other');
  await expect.poll(() => page.evaluate(() => location.hash)).toContain(`${soundKey}=`);
  const playBtn = page.locator('.stage-tools .tools-left button');
  await expect(playBtn).toHaveText('Play', { timeout: 8000 });      // the change played it; it ends by itself
  // the change saved itself to the bag too
  await expect(bagCount(page)).toHaveText('2');
  await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');

  // what went into the bag is what was set on the pages
  const inBag = await bagItems(page);
  expect(inBag.map((i) => [i.kind, i.id])).toEqual([['sprite', NEW_SPRITE.id], ['sound', NEW_SOUND.id]]);
  expect(inBag[0].settings.params[spriteKey]).toBe(spriteValue);
  const patch = JSON.parse(fs.readFileSync(path.join(scratch, 'sounds', `${NEW_SOUND.id}.json`), 'utf8'));
  const control = patch.params.find((d) => d.id === soundKey);
  const soundValue = inBag[1].settings.params[soundKey];
  expect(soundValue).toBeGreaterThanOrEqual(control.min);
  expect(soundValue).toBeLessThanOrEqual(control.max);
  expect(soundValue).not.toBe(control.default);

  // ---- the bag page: the sprite as it was set up, the sound's waveform
  await page.locator('header a.bag-link').click();
  const items = page.locator('.bag-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText(NEW_SPRITE.name);
  await expect(items.nth(0).locator('.bag-text .hint')).not.toHaveText(/Standard look|your own/i);      // the row says what was changed
  await expect(items.nth(1)).toContainText(NEW_SOUND.name);
  await expect(page.locator('.bag-item .gone')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('no longer on the site');
  // the picture holds every colour of the sprite drawn with these settings (its own program, first frame of its preview)
  const tile = items.nth(0).locator('canvas.tile');
  await expect(tile).toHaveCount(1);
  const picture = () => tile.evaluate(async (cv, { id, params }) => {
    const [{ default: sprite }, { renderFrame, cleanParams }] = await Promise.all([import(`/sprites/${id}.js`), import('/engine/sprite.js')]);
    const colours = (bytes) => { const set = new Set(); for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3] === 255) set.add((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]); return set; };
    const want = colours(renderFrame(sprite, sprite.preview, 0, cleanParams(sprite, params)).bytes());
    const have = colours(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data);
    return { wanted: want.size, missing: [...want].filter((c) => !have.has(c)).length };
  }, { id: NEW_SPRITE.id, params: inBag[0].settings.params });
  await expect.poll(async () => (await picture()).missing).toBe(0);
  expect((await picture()).wanted).toBeGreaterThanOrEqual(3);
  // the sound's tile shows a waveform: more ink than a flat line, in more than one height
  const wave = items.nth(1).locator('canvas.tile');
  const inked = () => wave.evaluate((cv) => {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), heights = new Set();
    let ink = 0;
    for (let x = 0; x < cv.width; x++) {
      let h = 0;
      for (let y = 0; y < cv.height; y++) { const i = (y * cv.width + x) * 4; if (data[i] === 0x23 && data[i + 1] === 0x1b && data[i + 2] === 0x33) h++; }
      ink += h; if (h) heights.add(h);
    }
    return { ink, heights: heights.size };
  });
  await expect.poll(async () => (await inked()).ink).toBeGreaterThan(64 * 2);
  expect((await inked()).heights).toBeGreaterThanOrEqual(3);
  await expect(items.nth(1).getByRole('button', { name: `Play ${NEW_SOUND.name}` })).toBeVisible();
  // "Open its page" leads back to the asset's own page with these settings
  await expect(items.nth(0).getByRole('link', { name: /^Open the page of/ })).toHaveAttribute('href', new RegExp(`^#/sprite/${NEW_SPRITE.id}\\?.*${spriteKey}=.*bag=`));

  // ---- the package
  const { name, bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), { timeout: 120_000 });
  expect(name).toMatch(/\.zip$/);
  const files = readZip(new Uint8Array(bytes));
  const names = files.map((f) => f.name);
  const fileOf = (n) => files.find((f) => f.name === n);
  for (const n of [`sprites/${NEW_SPRITE.id}/${NEW_SPRITE.id}.png`, `sprites/${NEW_SPRITE.id}/${NEW_SPRITE.id}.json`, `sprites/${NEW_SPRITE.id}/how-to-use.txt`, `sounds/${NEW_SOUND.id}.wav`, 'manifest.json', 'read-me.txt']) expect(names, n).toContain(n);
  expect(Buffer.from(fileOf(`sprites/${NEW_SPRITE.id}/${NEW_SPRITE.id}.png`).data.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a');
  const sheet = json(fileOf(`sprites/${NEW_SPRITE.id}/${NEW_SPRITE.id}.json`));
  expect(sheet.sprite).toBe(NEW_SPRITE.id);
  expect(Object.keys(sheet.animations)).toEqual(row(NEW_SPRITE.id).tech.clips.map((c) => c.name));
  const wav = fileOf(`sounds/${NEW_SOUND.id}.wav`).data;
  expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');
  expect(wav.length).toBeGreaterThan(1000);

  const manifest = json(fileOf('manifest.json'));
  expect(manifest.missing).toBeUndefined();
  expect(manifest.assets).toHaveLength(2);
  const [ms, ma] = manifest.assets;
  expect(ms).toMatchObject({ id: NEW_SPRITE.id, kind: 'sprite', name: NEW_SPRITE.name, role: row(NEW_SPRITE.id).role, type: row(NEW_SPRITE.id).type });
  expect(ms.files).toContain(`sprites/${NEW_SPRITE.id}/${NEW_SPRITE.id}.png`);
  expect(ms.settings).toEqual(inBag[0].settings);
  expect(ms.settings.params[spriteKey]).toBe(spriteValue);
  expect(ma).toMatchObject({ id: NEW_SOUND.id, kind: 'sound', name: NEW_SOUND.name, role: row(NEW_SOUND.id).role, type: row(NEW_SOUND.id).type });
  expect(ma.files).toEqual([`sounds/${NEW_SOUND.id}.wav`]);
  expect(ma.settings).toEqual(inBag[1].settings);
  expect(ma.settings.params[soundKey]).toBe(soundValue);
  expect(new TextDecoder().decode(fileOf('read-me.txt').data)).toContain(NEW_SPRITE.name);
  await expect(page.locator('.bag-export .status')).toContainText('Downloaded');
});
