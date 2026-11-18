// Home page: loads clean, shows every kind of card, search and kind filters work.
import { test, expect, openRoute } from '../helpers/test.mjs';

const shelf = (page) => page.locator('ul.gallery:not(.kits) > li');
const spriteCards = (page) => page.locator('a.card[href^="#/sprite/"]');
const soundCards = (page) => page.locator('.card.sound a[href^="#/sound/"]');
const musicCards = (page) => page.locator('.card.sound a[href^="#/music/"]');
const kitCards = (page) => page.locator('a.card.kit');

test.beforeEach(async ({ page }) => { await openRoute(page, '/'); });

test('home loads and shows sprites, sounds, music and kits', async ({ page }) => {
  await expect(page.locator('h1')).toBeVisible();
  expect(await spriteCards(page).count()).toBeGreaterThanOrEqual(7);
  expect(await soundCards(page).count()).toBeGreaterThanOrEqual(10);
  expect(await musicCards(page).count()).toBeGreaterThanOrEqual(1);
  expect(await kitCards(page).count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveCount(4);
});

test('the search box narrows the cards and says so when nothing matches', async ({ page }) => {
  const all = await shelf(page).count();
  const search = page.getByRole('searchbox', { name: 'Search' });
  await search.fill('wolf');
  await expect.poll(() => shelf(page).count()).toBeLessThan(all);
  expect(await shelf(page).count()).toBeGreaterThanOrEqual(1);
  await expect(spriteCards(page).filter({ hasText: 'Wolf' })).toHaveCount(1);
  await search.fill('zzzqqq-nothing');
  await expect(shelf(page)).toHaveCount(0);
  await expect(page.locator('.empty')).toBeVisible();
  await search.fill('');
  await expect(shelf(page)).toHaveCount(all);
  await expect(page.locator('.empty')).toBeHidden();
});

test('kind filter buttons narrow the shelf and All brings everything back', async ({ page }) => {
  const all = await shelf(page).count();
  const kinds = page.getByRole('group', { name: 'Kind' }).getByRole('button');
  expect(await kinds.count()).toBeGreaterThan(3);
  await expect(kinds.filter({ hasText: /^All$/ })).toHaveAttribute('aria-pressed', 'true');

  await kinds.filter({ hasText: /^Music$/ }).click();
  await expect(kinds.filter({ hasText: /^Music$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => shelf(page).count()).toBeLessThan(all);
  expect(await musicCards(page).count()).toBe(await shelf(page).count());

  await kinds.filter({ hasText: /^Character$/ }).click();
  await expect.poll(async () => await spriteCards(page).count()).toBe(await shelf(page).count());
  expect(await shelf(page).count()).toBeGreaterThanOrEqual(1);

  // every button leaves at least one card
  const n = await kinds.count();
  for (let i = 0; i < n; i++) {
    await kinds.nth(i).click();
    await expect(kinds.nth(i)).toHaveAttribute('aria-pressed', 'true');
    expect(await shelf(page).count(), `kind button ${i}`).toBeGreaterThanOrEqual(1);
  }
  await kinds.filter({ hasText: /^All$/ }).click();
  await expect(shelf(page)).toHaveCount(all);
});

test('the browse pages show one type each', async ({ page }) => {
  await openRoute(page, '/sprites');
  expect(await spriteCards(page).count()).toBeGreaterThanOrEqual(7);
  expect(await soundCards(page).count()).toBe(0);
  await openRoute(page, '/sounds');
  expect(await soundCards(page).count()).toBeGreaterThanOrEqual(10);
  expect(await spriteCards(page).count()).toBe(0);
  await openRoute(page, '/music');
  expect(await musicCards(page).count()).toBeGreaterThanOrEqual(1);
});
