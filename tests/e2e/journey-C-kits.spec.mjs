// Journey J6 (docs/user-journeys.md, "Restyle a whole kit"): the fixes for the testers' "Playground and kits" defects
// on a kit's page.
//   J6.4  "Add the whole kit to my bag" adds only what is not in the bag yet (one bag item per asset, whatever its
//         settings), in one click, says how many were added and how many were there, and never changes the look of
//         what was already in the bag: the kit's look goes on the added items
//   J6.3  a kit item's tile opens its page wearing the kit's look
//   J6.1  the page has a way back, the fine-tuning starts folded, the scene fills its frame
//   J6.5  the download message names sprites, sounds and music as the page does
// Run with: npx playwright test tests/e2e/journey-C-kits.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, openRoute, downloadFrom, hasHorizontalScroll } from '../helpers/test.mjs';
import { ROOT, readCatalogue } from '../helpers/catalog.mjs';

const KIT = readCatalogue().bundles.find((b) => b.id === 'dungeon-starter');
const KIT_IDS = [...KIT.sprites.map((id) => `sprite:${id}`), ...KIT.sounds.map((id) => `sound:${id}`), ...KIT.music.map((id) => `music:${id}`)];
const LINK = fs.readFileSync(path.join(ROOT, 'tests/fixtures/journeys/bag-link.txt'), 'utf8').trim();

const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());
const bagTheme = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.theme());
const count = (page) => page.locator('header .bag-count');
const status = (page) => page.locator('.bundle-actions .status');

async function readyMadeBag(page) {
  await page.goto('/index.html' + LINK);
  await expect(page.locator('header .bag-count')).toHaveText('3', { timeout: 30_000 });
  await expect.poll(async () => (await bagItems(page)).length).toBe(3);
}
async function openKit(page, search = '') {
  await page.goto(`/index.html#/bundle/${KIT.id}${search}`);
  await page.waitForSelector('main.bundle-page');
}

test('J6.4: with things in the bag, one click adds only the missing kit items, says so, and keeps the bag\'s looks', async ({ page }) => {
  await readyMadeBag(page);
  const before = await bagItems(page);
  const themeBefore = await bagTheme(page);
  const held = new Set(before.map((i) => `${i.kind}:${i.id}`));
  const missing = KIT_IDS.filter((k) => !held.has(k));
  const there = KIT_IDS.length - missing.length;
  expect(there, 'the ready-made bag holds some of the kit').toBeGreaterThan(0);

  await openKit(page);
  await page.getByRole('button', { name: 'Candy', exact: true }).click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  // no second question
  await expect(page.locator('.bundle-ask')).toHaveCount(0);
  await expect(count(page)).toHaveText(String(before.length + missing.length));
  await expect(status(page)).toContainText(`Added ${missing.length}`);
  await expect(status(page)).toContainText(`${there} were already in your bag`);

  const after = await bagItems(page);
  // one bag item per asset
  const keys = after.map((i) => `${i.kind}:${i.id}`);
  expect(new Set(keys).size, 'no asset is in the bag twice').toBe(keys.length);
  // what was there is untouched: its settings and the bag's look
  for (const it of before) expect(after.find((x) => x.key === it.key).settings, `${it.id} is left as it was`).toEqual(it.settings);
  expect(await bagTheme(page), 'the bag keeps its look').toEqual(themeBefore);
  // the added ones wear the kit's look
  for (const it of after.filter((x) => !before.some((b) => b.key === x.key))) expect(it.settings.look, `${it.id} wears Candy`).toBe('candy');

  // again: nothing to add, and the page says so
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(count(page)).toHaveText(String(before.length + missing.length));
  await expect(status(page)).toContainText('already in your bag');
});

test('J6.4: a look made on the page (not a named one) is offered to the whole bag, never forced', async ({ page }) => {
  await readyMadeBag(page);
  const themeBefore = await bagTheme(page);
  await openKit(page);
  await page.locator('.bundle-look .look-surprise').click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(status(page)).toContainText('take the look your bag already has');
  expect(await bagTheme(page), 'nothing changes the bag\'s look by itself').toEqual(themeBefore);
  const offer = page.getByRole('button', { name: 'Give my whole bag this look' });
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(offer).toBeHidden();
  expect(await bagTheme(page)).not.toEqual(themeBefore);
});

test('J6.4: an empty bag takes the whole kit and its look', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear(); });
  await openKit(page);
  await page.getByRole('button', { name: 'Frost', exact: true }).click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(count(page)).toHaveText(String(new Set(KIT_IDS).size));
  await expect(status(page)).toContainText(`Added ${new Set(KIT_IDS).size}`);
  expect((await bagTheme(page)).colour.palette).toBe('Frost');
  for (const it of await bagItems(page)) expect(it.settings.look).toBeUndefined();
});

test('J6.4: "Try it in the playground" adds the missing ones without a question', async ({ page }) => {
  await readyMadeBag(page);
  await openKit(page);
  await page.getByRole('button', { name: 'Try it in the playground' }).click();
  await expect(page).toHaveURL(/#\/play$/);
  expect((await bagItems(page)).length).toBe(new Set(KIT_IDS).size);
});

test('J6.3: a kit item opens its page wearing the kit\'s look', async ({ page }) => {
  await openKit(page);
  const hero = page.locator('.bundle-sprite').first().locator('a.bundle-name');
  await expect(hero).toHaveAttribute('href', `#/sprite/${KIT.sprites[0]}`);
  await page.getByRole('button', { name: 'Candy', exact: true }).click();
  await expect(hero).toHaveAttribute('href', `#/sprite/${KIT.sprites[0]}?artlook=candy`);
  await expect(page.locator('.bundle-sound a.bundle-name').first()).toHaveAttribute('href', /\?artlook=candy$/);
  await hero.click();
  await expect(page).toHaveURL(/artlook=candy/);
  await page.locator('.bundle-look, main').first().waitFor();
  // back on the kit with the Original look: plain links again
  await openKit(page);
  await expect(hero).toHaveAttribute('href', `#/sprite/${KIT.sprites[0]}`);
});

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
  test(`J6.1 ${size.width} x ${size.height}: a way back, fine-tuning folded, the scene fills its frame`, async ({ page }) => {
    await page.setViewportSize(size);
    await openRoute(page, '/');
    await openKit(page);
    const back = page.locator('header .back-link');
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute('href', '#/');
    await expect(back).toContainText('Back to the start');
    expect(await page.locator('.bundle-look details.look-more').evaluate((d) => d.open), 'the fine-tuning starts folded').toBe(false);
    const scene = page.locator('.kit-top .kit-scene');
    await expect.poll(() => scene.getAttribute('data-drawn'), { timeout: 20_000 }).toBeTruthy();
    const gap = await scene.evaluate((n) => { const c = n.querySelector('canvas').getBoundingClientRect(), b = n.getBoundingClientRect(); return Math.max(c.top - b.top, b.bottom - c.bottom); });
    expect(gap, 'no grey band above or below the scene').toBeLessThanOrEqual(3);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}

test('J6.1: opened from the list of kits, the way back leads there', async ({ page }) => {
  await openRoute(page, '/bundles');
  await page.locator(`a[href="#/bundle/${KIT.id}"]`).first().click();
  await expect(page.locator('header .back-link')).toHaveAttribute('href', '#/bundles');
});

test('J6.5: the download message names the sprites, sounds and music of the kit', async ({ page }) => {
  test.setTimeout(240_000);
  await openKit(page);
  await downloadFrom(page, () => page.getByRole('button', { name: 'Download this kit' }).click(), { timeout: 200_000 });
  await expect(status(page)).toContainText('Downloaded', { timeout: 30_000 });
  const text = await status(page).textContent();
  expect(text).toContain(`${KIT.sprites.length} sprite sheets`);
  expect(text).toContain(`${KIT.sounds.length} sounds`);
  expect(text).toContain(`${KIT.music.length} music track`);
  expect(text).not.toMatch(/sound files/);
});
