// The landing page (#/): it loads clean, says what Loadout is, and every way into the site works.
// Numbers and names come from the catalogue file, never from this file. What the live parts do (the line-up, the
// three steps, the kits' looks, the Hero's versions, the sounds) is in landing.spec.mjs.
import fs from 'node:fs';
import { test, expect, openRoute } from '../helpers/test.mjs';

const CATALOG = () => JSON.parse(fs.readFileSync(new URL('../../generated/catalog.json', import.meta.url), 'utf8'));
const count = (kind) => CATALOG().assets.filter((a) => a.kind === kind).length;

test.beforeEach(async ({ page }) => { await openRoute(page, '/'); });

test('the landing page says what Loadout is and where to go', async ({ page }) => {
  await expect(page).toHaveTitle(/Loadout/);
  const main = page.locator('main.v2.landing');
  await expect(main.locator('h1')).toHaveText('Game art, sound and music you can change.');
  await expect(main.locator('h1')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Library', 'Kits', 'Play']);
  const first = main.locator('section.hero');
  await expect(first.getByRole('link', { name: 'Browse everything' })).toHaveAttribute('href', '#/browse');
  await expect(first.getByRole('link', { name: 'Change the Hero' })).toHaveAttribute('href', '#/sprite/knight');
  await expect(first.locator('.btn-primary')).toHaveCount(1);
  // the footer is on this page, with the ways into the site
  await expect(page.getByRole('navigation', { name: 'Footer' }).getByRole('link')).toHaveText(['Library', 'Kits', 'Play', 'Bag']);
});

test('the numbers are the catalogue\'s', async ({ page }) => {
  const numbers = page.getByRole('region', { name: 'Loadout in numbers' });
  const read = async (label) => Number(await numbers.locator('div > div', { hasText: label }).locator('b').textContent());
  expect(await read(/^\d+sprites?$/)).toBe(count('sprite'));
  expect(await read(/^\d+sounds?$/)).toBe(count('sound'));
  expect(await read(/music tracks?$/)).toBe(count('music'));
  await expect(page.getByRole('searchbox', { name: 'Search the library' })).toHaveAttribute('placeholder', new RegExp(`^Search ${CATALOG().assets.length} things`));
  await expect(page.locator('#how .step').first()).toContainText(`${count('sprite')} sprites, ${count('sound')} sounds and ${count('music')} music track`);
});

test('the search box opens the library with what was typed', async ({ page }) => {
  const box = page.getByRole('searchbox', { name: 'Search the library' });
  await box.fill('coin sound');
  await box.press('Enter');
  await expect(page).toHaveURL(/#\/browse\?q=coin\+sound$/);
  await expect(page.getByRole('navigation', { name: 'Footer' })).toHaveCount(0);          // the footer is on the landing page only
  // Back returns to the landing page
  await page.goBack();
  await expect(page.locator('main.landing h1')).toBeVisible();
  // nothing typed: the whole library
  await page.getByRole('searchbox', { name: 'Search the library' }).press('Enter');
  await expect(page).toHaveURL(/#\/browse$/);
});

test('where it works: Unity and anything that reads PNG and WAV, the Unity package later', async ({ page }) => {
  const works = page.locator('.works');
  await expect(works.locator('dt')).toHaveText(['Unity', 'Any other engine', 'What you download']);
  await expect(works).toContainText('A Unity package is coming later.');
  await expect(works).toContainText('If it reads PNG and WAV, it works.');
});

test('featured assets are real cards that lead to their pages', async ({ page }) => {
  const cards = page.locator('#favourites > *');
  expect(await cards.count()).toBeGreaterThanOrEqual(6);
  const ids = new Set(CATALOG().assets.map((a) => a.id));
  for (const href of await page.locator('#favourites a[href^="#/sprite/"]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')))])) {
    expect(ids.has(href.replace('#/sprite/', '').split('?')[0]), href).toBe(true);
  }
  await expect(page.getByRole('link', { name: `See all ${count('sprite')} sprites` })).toHaveAttribute('href', '#/browse?kind=sprite');
});

for (const [name, width, height] of [['a phone', 390, 844], ['a small laptop', 900, 700], ['a laptop', 1024, 768], ['a desktop', 1440, 900]]) {
  test(`no sideways scroll on ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openRoute(page, '/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test('an old front-page link with a search in it opens the library with that search', async ({ page }) => {
  await openRoute(page, '/?q=coin');
  await expect(page).toHaveURL(/#\/browse\?q=coin$/);
  await expect(page.locator('main.landing')).toHaveCount(0);
});
