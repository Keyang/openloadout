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

test('Flat redraws sprites as smooth vector pictures everywhere and is kept on reload', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  await waitForDrawn(page);
  const stage = () => page.evaluate(() => { const c = document.querySelector('canvas.stage'); return { w: c.width, css: parseFloat(c.style.width), smooth: getComputedStyle(c).imageRendering === 'auto' }; });
  const before = await stage();
  expect(before.smooth).toBe(false);      // pixel: crisp pixels, one canvas pixel to a grid pixel
  await page.locator('.top .style-toggle [data-style="flat"]').click();
  await waitForDrawn(page);
  await expect.poll(() => pressed(page)).toEqual(['flat']);
  const flat = await stage();
  expect(flat.smooth).toBe(true);
  expect(flat.w).toBeGreaterThanOrEqual(before.w * 2);      // a vector picture drawn at the size it is shown
  await page.reload();
  await waitForDrawn(page);
  expect(await pressed(page)).toEqual(['flat']);
  // the library: every card picture is a vector picture, none pixelated
  await page.evaluate(() => window.loadout.go('/browse?kind=sprite'));
  await page.waitForSelector('.card-pic');
  const cards = await page.evaluate(() => [...document.querySelectorAll('.card-pic img:not([hidden]), .card-pic canvas:not([hidden])')].slice(0, 12).map((e) => getComputedStyle(e).imageRendering));
  expect(cards.length).toBeGreaterThan(0);
  expect(cards.every((r) => r === 'auto')).toBe(true);
  const got = await page.evaluate(async () => (await window.loadout.render('knight', { artStyle: 'flat', frame: 0 })).width);
  expect(got).toBe(256);
  await page.locator('.top .style-toggle [data-style="pixel"]').click();
  await expect.poll(() => pressed(page)).toEqual(['pixel']);
});
