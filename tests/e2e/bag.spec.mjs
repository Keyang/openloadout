// The bag and the package download (features BAG-1, BAG-2; architecture.md Contracts 6, 7, 8).
import fs from 'node:fs';
import { test, expect, openRoute, setRange, downloadFrom, readZip, canvasStats, hasHorizontalScroll } from '../helpers/test.mjs';
import { defaultTheme } from '../../engine/theme.js';

const patch = (id) => JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'));
const SOUND = patch('coin-pickup');
const MUSIC = patch('battle-theme');

const count = (page) => page.locator('header .bag-count');
const items = (page) => page.locator('.bag-item');
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());
const addInPage = (page, item) => page.evaluate(async (it) => (await import('/app/bag.js')).bag.add(it), item);
const setTheme = (page, theme) => page.evaluate(async (t) => (await import('/app/bag.js')).bag.setTheme(t), theme);
const download = async (page) => {
  const { name, bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), { timeout: 120_000 });
  return { name, files: readZip(new Uint8Array(bytes)) };
};
const fileOf = (files, name) => files.find((f) => f.name === name);
const json = (f) => JSON.parse(new TextDecoder().decode(f.data));
const bagButton = (page) => page.locator('.add-to-bag button');
/** Wait until the page has rewritten its address after an edit, then reload. */
const reloadAfterEdit = async (page) => { await page.waitForTimeout(500); await page.reload(); await page.waitForFunction(() => document.querySelector('.add-to-bag')); };

test('add a changed sound and a music track from their pages; the bag lists them and keeps them', async ({ page }) => {
  test.setTimeout(90_000);
  await openRoute(page, `/sound/${SOUND.id}`);
  await expect(count(page)).toHaveText('0');
  const slider = page.locator('.panel input[type=range]').first();
  await setRange(slider, 'other');
  const changedValue = Number(await slider.inputValue());
  await page.getByRole('button', { name: 'Add to my bag' }).click();
  await expect(count(page)).toHaveText('1');
  await expect(page.locator('.add-to-bag')).toContainText('Added');
  await expect(page.getByRole('link', { name: 'Go to bag' })).toHaveAttribute('href', '#/bag');

  await openRoute(page, `/music/${MUSIC.id}`);
  const musicSlider = page.locator('.panel input[type=range]').first();
  await setRange(musicSlider, 'other');
  const musicValue = Number(await musicSlider.inputValue());
  await page.getByRole('button', { name: 'Add to my bag' }).click();
  await expect(count(page)).toHaveText('2');

  await page.getByRole('link', { name: 'Go to bag' }).click();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0)).toContainText(SOUND.name);
  await expect(items(page).nth(0)).toContainText('Sound');
  await expect(items(page).nth(1)).toContainText(MUSIC.name);
  await expect(items(page).nth(1)).toContainText('Music');
  for (let i = 0; i < 2; i++) await expect(items(page).nth(i).getByRole('button', { name: /^Play/ })).toHaveText('Play');

  await page.reload();
  await expect(items(page)).toHaveCount(2);
  await expect(count(page)).toHaveText('2');

  // Change opens the sound page in update mode, with the slider where it was left
  const before = await bagItems(page);
  await items(page).nth(0).getByRole('link', { name: 'Change' }).click();
  await expect(page).toHaveURL(new RegExp(`#/sound/${SOUND.id}\\?.*bag=`));
  await expect(bagButton(page)).toHaveText('Update');
  await expect(page.getByRole('button', { name: 'Add to my bag' })).toHaveCount(0);
  expect(Math.abs(Number(await page.locator('.panel input[type=range]').first().inputValue()) - changedValue)).toBeLessThan(0.02);
  await setRange(page.locator('.panel input[type=range]').nth(1), 'other');
  // the page rewrites its address as you edit; after a reload it must still update the same item
  await reloadAfterEdit(page);
  await expect(page).toHaveURL(/bag=/);
  await expect(bagButton(page)).toHaveText('Update');
  await setRange(page.locator('.panel input[type=range]').nth(1), 'other');
  await page.getByRole('button', { name: 'Update' }).click();
  await expect(page.locator('.add-to-bag')).toContainText('Updated');
  await expect(count(page)).toHaveText('2');
  const after = await bagItems(page);
  expect(after.length).toBe(2);
  expect(after[0].key).toBe(before[0].key);
  expect(after[0].settings.params).not.toEqual(before[0].settings.params);

  // Change on the music item: its page opens in update mode with the slider where it was left
  await openRoute(page, '/bag');
  await items(page).nth(1).getByRole('link', { name: 'Change' }).click();
  await expect(page).toHaveURL(new RegExp(`#/music/${MUSIC.id}\\?.*bag=`));
  await expect(bagButton(page)).toHaveText('Update');
  expect(Math.abs(Number(await page.locator('.panel input[type=range]').first().inputValue()) - musicValue)).toBeLessThan(0.02);
  await setRange(page.locator('.panel input[type=range]').nth(1), 'other');
  await reloadAfterEdit(page);
  await expect(bagButton(page)).toHaveText('Update');
  await setRange(page.locator('.panel input[type=range]').nth(1), 'other');
  await bagButton(page).click();
  await expect(page.locator('.add-to-bag')).toContainText('Updated');
  await expect(count(page)).toHaveText('2');
  const afterMusic = await bagItems(page);
  expect(afterMusic[1].key).toBe(before[1].key);
  expect(afterMusic[1].settings.params).not.toEqual(before[1].settings.params);

  // Add another copy, then Remove; each says what it did next to the row
  await openRoute(page, '/bag');
  await items(page).nth(1).getByRole('button', { name: 'Add another copy' }).click();
  await expect(items(page)).toHaveCount(3);
  await expect(count(page)).toHaveText('3');
  await expect(items(page).nth(2).locator('.row-note')).toHaveText(`Added another copy of ${MUSIC.name}.`);
  await items(page).nth(2).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.bag-list > li').nth(2)).toContainText(`Removed ${MUSIC.name}.`);
  await items(page).nth(1).getByRole('button', { name: 'Remove' }).click();
  await expect(page.locator('.bag-list > li').nth(1)).toContainText(`Removed ${MUSIC.name}.`);
  await expect(items(page)).toHaveCount(1);
  await expect(count(page)).toHaveText('1');
  await expect(items(page).first()).toContainText(SOUND.name);
});

test('the export offers a zip; the Unity package cannot be chosen yet', async ({ page }) => {
  await openRoute(page, '/');
  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: null, seed: 1 } });
  await openRoute(page, '/bag');
  const zipChoice = page.getByRole('radio', { name: 'Zip package' });
  const unity = page.getByRole('radio', { name: 'Unity package (coming later)' });
  await expect(zipChoice).toBeChecked();
  await expect(unity).toBeDisabled();
  await unity.click({ force: true });
  await expect(zipChoice).toBeChecked();
  await expect(unity).not.toBeChecked();
});

test('Download gives one zip with a manifest, the sound, the music and a guide', async ({ page }) => {
  test.setTimeout(150_000);
  await openRoute(page, '/');
  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: { [SOUND.params[0].id]: SOUND.params[0].max }, style: null, seed: 1 } });
  await addInPage(page, { kind: 'music', id: MUSIC.id, settings: { params: { bars: 4 }, style: null } });
  await openRoute(page, '/bag');
  const { name, files } = await download(page);
  expect(name).toMatch(/\.zip$/);
  const names = files.map((f) => f.name);
  expect(names).toContain('manifest.json');
  expect(names).toContain(`sounds/${SOUND.id}.wav`);
  expect(names).toContain(`music/${MUSIC.id}.wav`);
  expect(names).toContain('read-me.txt');
  const wav = fileOf(files, `sounds/${SOUND.id}.wav`).data;
  expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF');

  const manifest = json(fileOf(files, 'manifest.json'));
  expect(manifest.assets).toHaveLength(2);
  const [s, m] = manifest.assets;
  expect(s).toMatchObject({ id: SOUND.id, kind: 'sound', name: SOUND.name, role: SOUND.meta.role, type: SOUND.meta.type });
  expect(s.files).toContain(`sounds/${SOUND.id}.wav`);
  expect(s.settings.params[SOUND.params[0].id]).toBe(SOUND.params[0].max);
  expect(m).toMatchObject({ id: MUSIC.id, kind: 'music', name: MUSIC.name, role: MUSIC.meta.role, type: MUSIC.meta.type });
  expect(m.files).toContain(`music/${MUSIC.id}.wav`);
  expect(manifest.theme).toEqual(defaultTheme());
  const guide = new TextDecoder().decode(fileOf(files, 'read-me.txt').data);
  expect(guide).toContain('manifest.json');
  await expect(page.locator('.bag-export .status')).toContainText('Downloaded');
});

test('the bag theme changes the exported sound', async ({ page }) => {
  test.setTimeout(90_000);
  await openRoute(page, '/');
  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: null, seed: 1 } });
  await openRoute(page, '/bag');
  const neutral = fileOf((await download(page)).files, `sounds/${SOUND.id}.wav`).data;
  await expect(page.locator('.bag-export .status')).toContainText('Downloaded');
  await setTheme(page, { sound: { pitch: 4, brightness: 0.5 } });
  const themed = (await download(page)).files;
  const wav = fileOf(themed, `sounds/${SOUND.id}.wav`).data;
  expect(Buffer.from(wav).equals(Buffer.from(neutral))).toBe(false);
  expect(json(fileOf(themed, 'manifest.json')).theme.sound.pitch).toBe(4);
});

test('a sprite in the bag is drawn on the bag page and its sheet is in the zip', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });   // pictures hold still, so they can be compared
  await openRoute(page, '/');
  await addInPage(page, { kind: 'sprite', id: 'coin', settings: { params: {}, cues: null, scale: 2 } });
  await addInPage(page, { kind: 'sprite', id: 'coin', settings: { params: {}, cues: null, scale: 1 } });
  await openRoute(page, '/bag');
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).first()).toContainText('Coin');
  const pic = items(page).first().locator('canvas');
  await expect.poll(async () => (await canvasStats(pic)).opaque).toBeGreaterThan(0);
  await expect(items(page).first().getByRole('link', { name: 'Change' })).toHaveAttribute('href', /#\/sprite\/coin\?.*bag=/);

  const neutral = (await download(page)).files;

  // the theme recolours the picture and the exported sheet
  const plain = (await canvasStats(pic)).hash;
  await setTheme(page, { colour: { palette: 'Toxic' } });
  await expect.poll(async () => (await canvasStats(items(page).first().locator('canvas'))).hash).not.toBe(plain);

  const { files } = await download(page);
  const sheet = (fs) => Buffer.from(fileOf(fs, 'sprites/coin/coin.png').data);
  expect(sheet(files).equals(sheet(neutral))).toBe(false);
  expect(json(fileOf(files, 'sprites/coin/coin.json')).frameWidth).toBe(json(fileOf(neutral, 'sprites/coin/coin.json')).frameWidth);
  const names = files.map((f) => f.name);
  expect(names).toContain('sprites/coin/coin.png');
  expect(names).toContain('sprites/coin/coin.json');
  expect(names).toContain('sprites/coin-2/coin.png');
  const manifest = json(fileOf(files, 'manifest.json'));
  expect(manifest.assets[0]).toMatchObject({ id: 'coin', kind: 'sprite', role: 'items/pickup', type: 'pickup' });
  expect(manifest.assets[0].files).toContain('sprites/coin/coin.png');
  expect(json(fileOf(files, 'sprites/coin/coin.json')).frameWidth).toBe(2 * json(fileOf(files, 'sprites/coin-2/coin.json')).frameWidth);
});

test('an empty bag explains how to fill it; Empty the bag asks first', async ({ page }) => {
  await openRoute(page, '/bag');
  await expect(page.locator('main')).toContainText('Add to my bag');
  await expect(page.getByRole('link', { name: 'Browse the catalogue' })).toHaveAttribute('href', '#/');
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(0);

  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: null, seed: 1 } });
  await addInPage(page, { kind: 'sound', id: 'jump', settings: { params: {}, style: null, seed: 1 } });
  await expect(items(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Empty the bag' }).click();
  await expect(items(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Keep them' }).click();
  await expect(items(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Empty the bag' }).click();
  await page.getByRole('button', { name: 'Yes, empty it' }).click();
  await expect(items(page)).toHaveCount(0);
  await expect(count(page)).toHaveText('0');
});

test('a bag link opens the same bag in another browser', async ({ page, browser }) => {
  await openRoute(page, '/');
  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: 'Gem', seed: 3 } });
  await addInPage(page, { kind: 'music', id: MUSIC.id, settings: { params: { bpm: 140 }, style: null } });
  const link = await page.evaluate(async () => (await import('/app/bag.js')).bag.toLink());
  await openRoute(page, '/bag');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy link to this bag' }).click();
  await expect(page.locator('.bag-link-note')).toContainText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(page.url()).origin}/index.html${link}`);

  const other = await browser.newPage();
  await other.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await other.goto(`${new URL(page.url()).origin}/index.html${link}`);
  await expect(other.locator('.bag-item')).toHaveCount(2);
  const got = await other.evaluate(async () => (await import('/app/bag.js')).bag.items().map((i) => [i.id, i.settings]));
  expect(got).toEqual([[SOUND.id, { params: {}, style: 'Gem', seed: 3 }], [MUSIC.id, { params: { bpm: 140 }, style: null }]]);
  await other.close();
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('the bag page has no sideways scroll', async ({ page }) => {
    await openRoute(page, '/');
    await addInPage(page, { kind: 'sprite', id: 'knight', settings: { params: {}, cues: null, scale: 1 } });
    await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: null, seed: 1 } });
    await openRoute(page, '/bag');
    await expect(items(page)).toHaveCount(2);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
});

test('add the Hero with a changed slider and part from its page; Change reopens it in update mode', async ({ page }) => {
  test.setTimeout(90_000);
  await openRoute(page, '/sprite/knight');
  await setRange(page.locator('#c-height'), 'max');
  await page.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: 'Axe' }).click();
  await setRange(page.locator('#c-weaponLength'), 'max');
  await page.getByRole('group', { name: 'Pixel size' }).getByRole('button', { name: '2×' }).click();
  await page.getByRole('button', { name: 'Add to my bag' }).click();
  await expect(count(page)).toHaveText('1');
  const [item] = await bagItems(page);
  expect(item).toMatchObject({ kind: 'sprite', id: 'knight', settings: { scale: 2, params: { height: 1, weapon: 'axe', weaponLength: 1.35 } } });
  expect(item.settings.cues.attack.find((c) => c.sound === 'sword-slash').when).toEqual({ weapon: ['sword', 'axe', 'spear'] });

  await openRoute(page, '/bag');
  await expect(items(page).first()).toContainText('Height: taller, axe weapon, weapon length: longer, pixel size 2×');      // what was changed, in plain words
  await items(page).first().getByRole('link', { name: 'Change' }).click();
  await expect(page).toHaveURL(/#\/sprite\/knight\?.*bag=/);
  await expect(bagButton(page)).toHaveText('Update');
  await expect(page.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#c-height')).toHaveValue('1');
  await expect(page.locator('#c-weaponLength')).toHaveValue('1.35');
  await expect(page.getByRole('group', { name: 'Pixel size' }).getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: 'Spear' }).click();
  await reloadAfterEdit(page);
  await expect(bagButton(page)).toHaveText('Update');
  await expect(page.getByRole('group', { name: 'Weapon' }).getByRole('button', { name: 'Spear' })).toHaveAttribute('aria-pressed', 'true');
  await bagButton(page).click();
  await expect(page.locator('.add-to-bag')).toContainText('Updated');
  await expect(count(page)).toHaveText('1');
  const [after] = await bagItems(page);
  expect(after.key).toBe(item.key);
  expect(after.settings.params.weapon).toBe('spear');
  expect(after.settings.scale).toBe(2);
});

test('sounds that need a weapon are left out of the package when the Hero has none', async ({ page }) => {
  test.setTimeout(90_000);
  await openRoute(page, '/');
  await addInPage(page, { kind: 'sprite', id: 'knight', settings: { params: { weapon: 'none' }, cues: null, scale: 1 } });
  await addInPage(page, { kind: 'sprite', id: 'knight', settings: { params: { weapon: 'sword' }, cues: null, scale: 1 } });
  await openRoute(page, '/bag');
  const { files } = await download(page);
  const names = files.map((f) => f.name);
  const attack = (folder) => json(fileOf(files, `sprites/${folder}/knight.json`)).sounds.attack.map((c) => c.sound);
  expect(names).not.toContain('sprites/knight/sounds/sword-slash.wav');
  expect(names).toContain('sprites/knight/sounds/whoosh.wav');
  expect(attack('knight')).toEqual(['whoosh']);
  expect(names).toContain('sprites/knight-2/sounds/sword-slash.wav');
  expect(names).not.toContain('sprites/knight-2/sounds/whoosh.wav');
  expect(attack('knight-2')).toEqual(['sword-slash']);
});

test('an item whose kind does not match its asset is treated as missing', async ({ page }) => {
  await openRoute(page, '/');
  await addInPage(page, { kind: 'music', id: 'jump', settings: { params: {}, style: null } });
  await openRoute(page, '/bag');
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toContainText('no longer on the site');
  await expect(items(page).first().getByRole('link', { name: 'Change' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeDisabled();
  await expect(page.locator('.bag-export')).toContainText('Nothing in your bag can be downloaded');

  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: null, seed: 1 } });
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
  const { files } = await download(page);
  const names = files.map((f) => f.name);
  expect(names).not.toContain('music/jump.wav');
  expect(names).toContain(`sounds/${SOUND.id}.wav`);
  const manifest = json(fileOf(files, 'manifest.json'));
  expect(manifest.assets.map((a) => a.id)).toEqual([SOUND.id]);
  expect(manifest.missing).toEqual(['jump']);
});

test('a shared link is checked before it is offered', async ({ page }) => {
  await openRoute(page, '/');
  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: null, seed: 1 } });
  const link = await page.evaluate(async () => {
    const { createBag, memoryStorage } = await import('/app/bag.js');
    const other = createBag(memoryStorage());
    other.add({ kind: 'sound', id: 'jump', settings: {} });
    other.add({ kind: 'music', id: 'battle-theme', settings: {} });
    return other.toLink();
  });
  await openRoute(page, '/bag?load=bm90IGpzb24');
  await expect(page.locator('.bag-link-note')).toContainText('damaged');
  await expect(page.getByRole('button', { name: 'Add them to my bag' })).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);

  await openRoute(page, link.slice(1));
  await expect(page.locator('.bag-offer')).toContainText('2 items');
  await page.getByRole('button', { name: 'Add them to my bag' }).click();
  await expect(items(page)).toHaveCount(3);
  await expect(count(page)).toHaveText('3');
});

test('the Play button sits beside the picture, not on it', async ({ page }) => {
  await openRoute(page, '/');
  await addInPage(page, { kind: 'music', id: MUSIC.id, settings: { params: {}, style: null } });
  await addInPage(page, { kind: 'sound', id: SOUND.id, settings: { params: {}, style: null, seed: 1 } });
  await openRoute(page, '/bag');
  for (let i = 0; i < 2; i++) {
    const tile = await items(page).nth(i).locator('canvas').boundingBox();
    const btn = await items(page).nth(i).getByRole('button', { name: /^Play/ }).boundingBox();
    const overlap = !(btn.x >= tile.x + tile.width || btn.x + btn.width <= tile.x || btn.y >= tile.y + tile.height || btn.y + btn.height <= tile.y);
    expect(overlap, `row ${i + 1}`).toBe(false);
  }
});
