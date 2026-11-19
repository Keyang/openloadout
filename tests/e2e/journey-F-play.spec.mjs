// Journey J5 (docs/user-journeys.md), second fix wave, builder F: on a window where the playground's panel sits under
// the scene (900 x 700, 390 x 844), a creator who scrolls down to a lower control still sees the change (R1): the
// item's own picture at the top of the panel stays pinned in view while the controls scroll under it.
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

for (const size of [{ width: 900, height: 700 }, { width: 390, height: 844 }]) {
  test(`J5.2 R1 ${size.width} x ${size.height}: scrolled down to the last colour, the item's picture stays in view and shows the change`, async ({ page }) => {
    await page.setViewportSize(size);
    await openPlay(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await choose(page, 'knight');
    await panel(page).getByRole('tab', { name: /^Colours/ }).click();
    const rows = side(page).locator('[data-pane="colours"] .swatches');
    const last = rows.last();
    await last.scrollIntoViewIfNeeded();
    // the creator scrolls on so the lowest row sits near the bottom of the window
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.play-side [data-pane="colours"] .swatches')].at(-1);
      const r = row.getBoundingClientRect();
      window.scrollBy(0, r.bottom - innerHeight + 24);
    });
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
}

test('J5.2: at 1440 x 900 the scene stays in view beside the panel (unchanged by the pinned picture)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openPlay(page);
  await choose(page, 'knight');
  await panel(page).getByRole('tab', { name: /^Colours/ }).click();
  await side(page).locator('[data-pane="colours"] .swatches').last().scrollIntoViewIfNeeded();
  const stage = await page.locator('canvas.play-stage').evaluate((n) => { const r = n.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  expect(stage).toBe(true);
});
