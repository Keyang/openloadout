// Journeys J1, J2 and J9.3 (docs/user-journeys.md): the fixes for the testers' "Finding" defects.
//   J2.2  the kind is a chosen token too, and "Clear all" (shown from the first choice) lets go of it and of every filter
//   J1.1  the landing's first lines say what Loadout gives, and what is true about using it
//   J1.2  the landing's "Change it" Hero starts as the Hero shown everywhere else (with his helmet)
//   J9.3  a page that is not there offers one way on, in words that match where it goes
// Run with: npx playwright test tests/e2e/journey-D-finding.spec.mjs
import { test, expect, openRoute } from '../helpers/test.mjs';

const tab = (page, word) => page.getByRole('tab', { name: new RegExp(`^${word} \\d+$`) });
const hash = (page) => page.evaluate(() => location.hash);
const clearAll = (page) => page.locator('.lib-filters').getByRole('button', { name: 'Clear all' });
const kindToken = (page) => page.locator('.lib-filters .kind-token');
const filterGroup = (page, name) => page.locator('.lib-filters').getByRole('group', { name, exact: true });

test('J2.2: a kind other than All shows as a token, and Clear all appears for it alone', async ({ page }) => {
  await openRoute(page, '/browse?q=slime');
  await expect(clearAll(page)).toHaveCount(0);
  await expect(kindToken(page)).toHaveCount(0);
  await tab(page, 'Sprites').click();
  await expect(kindToken(page)).toContainText('Sprites');
  await expect(clearAll(page)).toBeVisible();
  // the token's x goes back to every kind
  await kindToken(page).getByRole('button', { name: /^Remove the filter Kind/ }).click();
  await expect(tab(page, 'All')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => hash(page)).toBe('#/browse?q=slime');
  await expect(kindToken(page)).toHaveCount(0);
});

test('J2.2: one filter is enough for Clear all', async ({ page }) => {
  await openRoute(page, '/browse?q=slime');
  await filterGroup(page, 'Kit').locator('[data-menu]').click();
  await filterGroup(page, 'Kit').getByRole('menuitemradio').first().click();
  await expect(page.locator('.lib-filters .token')).toHaveCount(1);
  await expect(clearAll(page)).toBeVisible();
});

test('J2.2: Clear all lets go of the kind tab and every filter, and keeps the search', async ({ page }) => {
  await openRoute(page, '/browse?q=slime');
  await tab(page, 'Sprites').click();
  await filterGroup(page, 'Kit').locator('[data-menu]').click();
  await filterGroup(page, 'Kit').getByRole('menuitemradio').first().click();
  await expect.poll(() => hash(page)).toMatch(/^#\/browse\?q=slime&kind=sprite&bundle=/);
  await clearAll(page).click();
  await expect.poll(() => hash(page)).toBe('#/browse?q=slime');
  await expect(tab(page, 'All')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.lib-filters .token')).toHaveCount(0);
  await expect(kindToken(page)).toHaveCount(0);
  await expect(clearAll(page)).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('slime');
});

test('J2.2: the Kits tab is a kind too: Clear all goes back to All', async ({ page }) => {
  await openRoute(page, '/browse');
  await tab(page, 'Kits').click();
  await expect(kindToken(page)).toContainText('Kits');
  await clearAll(page).click();
  await expect.poll(() => hash(page)).toBe('#/browse');
  await expect(tab(page, 'All')).toHaveAttribute('aria-selected', 'true');
});

test('J1.1: the first lines say what Loadout gives, and that it is free to download, without inventing terms', async ({ page }) => {
  await openRoute(page, '/');
  const first = page.locator('main.landing section.hero');
  const text = (await first.innerText()).toLowerCase();
  expect(text).toContain('free');
  // the licence is not decided yet (every asset says "draft"): the page must not promise use in a published game
  expect(text).not.toMatch(/free to use|royalty|commercial use|any game you sell/);
  expect(text).toMatch(/terms .*not .*(set|decided)/);
});

test('J1.2: the "Change it" Hero starts as the Hero shown everywhere else', async ({ page }) => {
  await openRoute(page, '/');
  const carry = page.locator('#how').getByRole('link', { name: /^Carry on with this / });
  await expect(carry).toHaveAttribute('href', '#/sprite/knight');
  // a change is carried on, and nothing else
  await page.locator('#try-hair [role=radio]').nth(1).click();
  await expect(carry).toHaveAttribute('href', /^#\/sprite\/knight\?hairStyle=[^&]+$/);
});

test('J9.3: a page that is not there offers one way on, to the library, in words that say so', async ({ page }) => {
  await page.goto('about:blank');
  await openRoute(page, '/sprite/nothing');
  const main = page.locator('main');
  await expect(main.locator('h1')).toHaveText('That sprite is not here');
  await expect(main).not.toContainText('front page');
  const link = main.getByRole('link');
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('Browse the library');
  await expect(link).toHaveAttribute('href', '#/browse');
  // no second link under the header that goes to the same place in other words
  await expect(page.locator('header .back-link')).toHaveCount(0);
  await link.click();
  await expect.poll(() => hash(page)).toBe('#/browse');
});

test('J9.3: when the visitor came from somewhere, the way back stays beside the way on', async ({ page }) => {
  await openRoute(page, '/browse?q=slime');
  await page.evaluate(() => { location.hash = '#/sprite/nothing'; });
  await expect(page.locator('main h1')).toHaveText('That sprite is not here');
  await expect(page.locator('header .back-link')).toContainText('Back to results');
  await expect(page.locator('main').getByRole('link', { name: 'Browse the library' })).toHaveCount(1);
});
