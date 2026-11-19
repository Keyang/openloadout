// Journey J5 (docs/user-journeys.md), second fix wave, builder F: a creator who scrolls down to a lower control still
// sees the change (R1). On one screen (900 x 700; docs/playground-tray-workbench.md section 1) the panel's own picture
// stays pinned at the top of the right column while the controls scroll under it; on a phone (390 x 844) the scene
// itself is pinned at the top of the window while the panel scrolls under it.
// Run with: npx playwright test tests/e2e/journey-F-play.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, canvasStats, hasHorizontalScroll } from '../helpers/test.mjs';
import { ROOT } from '../helpers/catalog.mjs';

const LINK = fs.readFileSync(path.join(ROOT, 'tests/fixtures/journeys/bag-link.txt'), 'utf8').trim();
const side = (page) => page.locator('.play-side');
const panel = (page) => side(page).locator('.rx-panel');

async function openPlay(page) {
  await page.goto('/index.html' + LINK);
  await expect(page.locator('header .bag-count')).toHaveText('3', { timeout: 30_000 });
  await page.goto('/index.html#/play');
  await page.waitForFunction(() => window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
}
const choose = (page, id) => page.evaluate(async (want) => { const { bag } = await import('/app/bag.js'); window.__loadoutPlay.choose(bag.items().find((i) => i.id === want).key); }, id);
/** Where the panel's picture of the item is on screen, and whether all of it is in view. */
const pictureBox = (page) => side(page).locator('.rx-preview-tile').evaluate((n) => {
  const r = n.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), inView: r.top >= -1 && r.bottom <= innerHeight + 1 && r.height > 40 };
});

test('J5.2 R1 900 x 700: scrolled down to the last colour, the item\'s picture stays in view and shows the change', async ({ page }) => {
  // one screen: the panel is in the right column, which scrolls as one; the picture at its top stays pinned
  await page.setViewportSize({ width: 900, height: 700 });
  await openPlay(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await choose(page, 'knight');
  await panel(page).getByRole('tab', { name: /^Colours/ }).click();
  const rows = side(page).locator('[data-pane="colours"] .swatches');
  const last = rows.last();
  // the creator scrolls the column on so the lowest row sits near the bottom of the window
  await side(page).locator('.play-edit-view').evaluate((col) => {
    const row = [...col.querySelectorAll('[data-pane="colours"] .swatches')].at(-1);
    col.scrollBy(0, row.getBoundingClientRect().bottom - innerHeight + 24);
  });
  expect(await page.evaluate(() => window.scrollY), 'the page itself does not scroll').toBe(0);
  const at = await pictureBox(page);
  expect(at.inView, `the picture is in view after scrolling down (${JSON.stringify(at)})`).toBe(true);
  // and it does not cover the row being used
  const rowTop = await last.evaluate((n) => n.getBoundingClientRect().top);
  expect(rowTop).toBeGreaterThan(at.bottom - 1);

  const pic = side(page).locator('.rx-preview-tile canvas').first();
  const before = (await canvasStats(pic)).hash;
  await last.locator('button.swatch:not([aria-pressed="true"])').last().click();
  await expect.poll(async () => (await canvasStats(pic)).hash, { timeout: 1000, intervals: [50] }).not.toBe(before);
  expect((await pictureBox(page)).inView, 'still in view after the pick').toBe(true);
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test('J5.2 R1 390 x 844: scrolled down to the last colour, the scene stays pinned in view and shows the change', async ({ page }) => {
  // on a phone the scene itself is pinned at the top while the panel scrolls under it: the change is seen there
  await page.setViewportSize({ width: 390, height: 844 });
  await openPlay(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  await choose(page, 'knight');
  await panel(page).getByRole('tab', { name: /^Colours/ }).click();
  const last = side(page).locator('[data-pane="colours"] .swatches').last();
  await last.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.play-side [data-pane="colours"] .swatches')].at(-1);
    window.scrollBy(0, row.getBoundingClientRect().bottom - innerHeight + 24);
  });
  const stage = page.locator('canvas.play-stage');
  const box = await stage.evaluate((n) => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  expect(box.top).toBeGreaterThanOrEqual(-1);
  expect(box.bottom).toBeLessThanOrEqual(844);
  // the row being used is not under the pinned scene
  const rowTop = await last.evaluate((n) => n.getBoundingClientRect().top);
  expect(rowTop).toBeGreaterThan(box.bottom);
  const before = (await canvasStats(stage)).hash;
  await last.locator('button.swatch:not([aria-pressed="true"])').last().click();
  await expect.poll(async () => (await canvasStats(stage)).hash, { timeout: 1500, intervals: [50] }).not.toBe(before);
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test('J5.2: at 1440 x 900 the scene stays in view beside the panel (unchanged by the pinned picture)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlay(page);
  await choose(page, 'knight');
  await panel(page).getByRole('tab', { name: /^Colours/ }).click();
  await side(page).locator('[data-pane="colours"] .swatches').last().scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => window.scrollY), 'the page itself does not scroll').toBe(0);
  const stage = await page.locator('canvas.play-stage').evaluate((n) => { const r = n.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  expect(stage).toBe(true);
});
