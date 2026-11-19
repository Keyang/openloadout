// The Look tab of a sound's and a music track's page (app/sound-look.js): the same named looks as a sprite's, said in
// words of what is heard. A look is a setting like any other: it saves itself to the bag, is marked, travels in the
// link, and the download is made in it.
// Run with: npx playwright test tests/e2e/sound-look.spec.mjs
import { test, expect, openRoute, openTab, downloadFrom, downloadButton, collectErrors } from '../helpers/test.mjs';
import { THEME_PRESETS } from '../../engine/theme.js';

const looks = (page) => page.locator('.rx-panel [data-pane="look"] .looks .vbtn');
const bagNow = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('loadout-bag-v1') ?? 'null'));
const wav = async (page) => Buffer.from((await downloadFrom(page, () => downloadButton(page).click())).bytes).toString('base64');

test('a sound\'s Look tab: every look in words; choosing one saves it, marks it, travels in the link and changes the download', async ({ page }) => {
  const errors = collectErrors(page);
  await openRoute(page, '/sound/coin-pickup');
  const plain = await wav(page);
  await openTab(page, 'look');
  await expect(looks(page)).toHaveCount(THEME_PRESETS.length + 1);
  expect(await looks(page).locator('.name').allTextContents()).toEqual(['Follows the bag', ...THEME_PRESETS.map((p) => p.name)]);
  await expect(looks(page).filter({ hasText: 'Frost' }).locator('.what')).toHaveText('Higher and brighter');
  await expect(looks(page).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rx-panel [data-tab="look"] .dot')).toBeHidden();

  await looks(page).filter({ hasText: 'Frost' }).click();
  await expect(looks(page).filter({ hasText: 'Frost' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.rx-panel .saved')).toContainText(/Saved in your bag\s*1 change/);
  await expect(page.locator('.rx-panel [data-tab="look"] .dot')).toBeVisible();
  await expect.poll(async () => (await bagNow(page))?.items?.[0]?.settings.look).toBe('frost');
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('artlook=frost');
  const frost = await wav(page);
  expect(frost).not.toBe(plain);
  await expect(page.locator('.rx-panel .status')).toContainText('in the Frost look');

  // the link alone, in a browser with an empty bag, opens it in the look
  await page.evaluate(() => localStorage.clear());
  await openRoute(page, '/');
  await openRoute(page, '/sound/coin-pickup?artlook=frost');
  await openTab(page, 'look');
  await expect(looks(page).filter({ hasText: 'Frost' })).toHaveAttribute('aria-pressed', 'true');
  expect(await wav(page)).toBe(frost);

  // "Follows the bag" takes it off again
  await looks(page).first().click();
  await expect(page.locator('.rx-panel [data-tab="look"] .dot')).toBeHidden();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('artlook');
  expect(await wav(page)).toBe(plain);
  errors.expectNone();
});

test('a music track\'s Look tab: the same looks, saved with it, and its length follows the look\'s tempo', async ({ page }) => {
  const errors = collectErrors(page);
  await openRoute(page, '/music/battle-theme');
  await openTab(page, 'look');
  await expect(looks(page)).toHaveCount(THEME_PRESETS.length + 1);
  await expect(looks(page).filter({ hasText: 'Night' }).locator('.what')).toHaveText('Slower, in a lower key, calmer and softer');
  const before = await page.locator('.stage-card .hint').textContent();
  await looks(page).filter({ hasText: 'Night' }).click();
  await expect.poll(async () => (await bagNow(page))?.items?.[0]?.settings.look).toBe('night');
  await expect(page.locator('.rx-panel [data-tab="look"] .dot')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('artlook=night');
  await expect.poll(() => page.locator('.stage-card .hint').textContent()).not.toBe(before);
  await page.getByRole('button', { name: 'Use this look for my whole bag' }).click();
  await expect(page.locator('.rx-panel .status')).toContainText('Everything in your bag now has the Night look');
  errors.expectNone();
});
