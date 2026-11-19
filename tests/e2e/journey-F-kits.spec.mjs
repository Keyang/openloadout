// Journey J6 and J9.3 (docs/user-journeys.md), second fix wave, builder F, on a kit's page:
//   J6.4  after "Add the whole kit" the kit's card does not grow: the message sits under it, in the room already there
//   J6.4  before a click, the page says how many things adding or trying the kit puts in the bag
//   J9.3  the kit not-found page's words match where its one button goes, and it keeps the way back to results
// Run with: npx playwright test tests/e2e/journey-F-kits.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, openRoute, hasHorizontalScroll } from '../helpers/test.mjs';
import { ROOT, readCatalogue } from '../helpers/catalog.mjs';

const LINK = fs.readFileSync(path.join(ROOT, 'tests/fixtures/journeys/bag-link.txt'), 'utf8').trim();
const bundles = readCatalogue().bundles;
const idsOf = (kit) => [...kit.sprites.map((id) => `sprite:${id}`), ...kit.sounds.map((id) => `sound:${id}`), ...kit.music.map((id) => `music:${id}`)];
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());

async function readyMadeBag(page) {
  await page.goto('/index.html' + LINK);
  await expect(page.locator('header .bag-count')).toHaveText('3', { timeout: 30_000 });
}
async function openKit(page, id) {
  await page.goto(`/index.html#/bundle/${id}`);
  await page.waitForSelector('main.bundle-page .kit-top');
}
const box = (loc) => loc.evaluate((n) => { const r = n.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), height: Math.round(r.height) }; });

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
  test(`J6.4 ${size.width} x ${size.height}: "Add the whole kit" does not make the kit's card taller`, async ({ page }) => {
    await page.setViewportSize(size);
    await readyMadeBag(page);
    await openKit(page, 'dungeon-starter');
    await page.getByRole('button', { name: 'Surprise me' }).first().click();
    const card = page.locator('.kit-top');
    const look = page.locator('.bundle-look');
    const before = await box(card), lookBefore = await box(look);
    await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
    const status = page.locator('.bundle-actions .status');
    await expect(status).toContainText('Added');
    // the offer and the way to the bag are there too
    await expect(page.locator('.bundle-actions').getByRole('link', { name: 'Go to bag' })).toBeVisible();
    const after = await box(card);
    expect(after.height, 'the card keeps its height').toBe(before.height);
    expect(await status.evaluate((n) => !n.closest('.kit-top')), 'the message is not inside the card').toBe(true);
    if (size.width > 720) expect(Math.abs((await box(look)).top - lookBefore.top), 'what is under the card stays put').toBeLessThanOrEqual(2);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}

test('J6.4: before a click, the page says how many things adding or trying a big kit puts in the bag', async ({ page }) => {
  await readyMadeBag(page);
  const kit = bundles.reduce((a, b) => (idsOf(b).length > idsOf(a).length ? b : a));
  const held = new Set((await bagItems(page)).map((i) => `${i.kind}:${i.id}`));
  const missing = new Set(idsOf(kit).filter((k) => !held.has(k))).size;
  expect(missing).toBeGreaterThan(20);
  await openKit(page, kit.id);
  const line = page.locator('.bundle-adds');
  await expect(line).toBeVisible();
  await expect(line).toContainText(`${missing} things`);
  const tryIt = page.getByRole('button', { name: 'Try it in the playground' });
  expect(await tryIt.getAttribute('aria-describedby')).toBe(await line.getAttribute('id'));
  // after adding it all, the line says so
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(line).toContainText('in your bag already');
  await expect(line).not.toContainText(`${missing} things`);
});

test('J9.3: the kit not-found page says where its one button goes', async ({ page }) => {
  await page.goto('about:blank');
  await openRoute(page, '/bundle/nothing');
  const main = page.locator('main');
  await expect(main.locator('h1')).toHaveText('That kit is not here');
  await expect(main).not.toContainText('front page');
  await expect(main).toContainText('Every kit Loadout has is on the kits page.');
  const link = main.getByRole('link');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('See every kit');
  await expect(link).toHaveAttribute('href', '#/bundles');
  await expect(page.locator('header .back-link')).toHaveCount(0);
});

test('J9.3: reached from search results, the kit not-found page keeps "Back to results"', async ({ page }) => {
  await readyMadeBag(page);
  await page.goto('/index.html#/browse?q=coin');
  await page.waitForSelector('main');
  await page.evaluate(() => { location.hash = '#/bundle/nothing'; });
  await expect(page.locator('main h1')).toHaveText('That kit is not here');
  const back = page.locator('header .back-link');
  await expect(back).toContainText('Back to results');
  await expect(back).toHaveAttribute('href', '#/browse?q=coin');
  await back.click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/browse?q=coin');
});
