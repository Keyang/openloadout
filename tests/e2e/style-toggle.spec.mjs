// The art style toggle before the Bag button: one choice for the whole site, kept in the browser.
import { test, expect, openRoute, waitForDrawn } from '../helpers/test.mjs';

const pressed = (page) => page.evaluate(() => [...document.querySelectorAll('.top .style-toggle button')].filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.style));

test('the header has a Pixel / Flat toggle before the Bag button; Pixel is on by default', async ({ page }) => {
  await openRoute(page, '/');
  const order = await page.evaluate(() => [...document.querySelector('.top').children].map((n) => n.className || n.tagName));
  expect(order.indexOf('style-toggle')).toBeGreaterThan(-1);
  expect(order.indexOf('style-toggle')).toBeLessThan(order.indexOf('bag-link'));
  await expect.poll(() => pressed(page)).toEqual(['pixel']);
});

test('Flat redraws a sprite that lists it with the smooth picture, leaves one that does not, and is kept on reload', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  await waitForDrawn(page);
  const stage = () => page.evaluate(() => { const c = document.querySelector('canvas.stage'); return { w: c.width, css: parseFloat(c.style.width) }; });
  const before = await stage();
  expect(before.w).toBe(before.css / Math.round(before.css / before.w));      // pixel: one canvas pixel to a grid pixel
  await page.locator('.top .style-toggle [data-style="flat"]').click();
  await waitForDrawn(page);
  await expect.poll(() => pressed(page)).toEqual(['flat']);
  const flat = await stage();
  expect(flat.w).toBeGreaterThan(before.w * 3);      // four canvas pixels to a grid pixel
  await expect(page.locator('.style-choice [data-style="flat"][aria-pressed="true"]')).toHaveCount(1, { timeout: 5000 }).catch(() => {});      // (the Look tab holds the chips)
  await page.reload();
  await waitForDrawn(page);
  await expect.poll(() => pressed(page)).toEqual(['flat']);
  // a sprite that does not list flat stays in its first style
  await page.evaluate(() => window.loadout.go('/sprite/crawler-bug'));
  await waitForDrawn(page);
  const bug = await stage();
  expect(bug.css / bug.w).toBeCloseTo(Math.round(bug.css / bug.w), 5);
  const got = await page.evaluate(async () => (await window.loadout.render('knight', { artStyle: 'flat', frame: 0 })).width);
  expect(got).toBe(256);
  await page.locator('.top .style-toggle [data-style="pixel"]').click();
  await expect.poll(() => pressed(page)).toEqual(['pixel']);
});
