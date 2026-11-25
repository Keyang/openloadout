// "Surprise me" looks like magic wherever it is (app/magic.js): its own colourful button with a star, and a burst of
// sparkles on each press that clears itself away. A visitor who asked for less motion gets the button, no sparkles.
import { test, expect, openRoute } from '../helpers/test.mjs';

const PLACES = [
  ['an asset page', '/sprite/knight'],
  ['a kit page', '/bundle/dungeon-starter'],
  ['the front page', '/'],
];

for (const [where, route] of PLACES) {
  test(`Surprise me on ${where} is the magic button, and sparkles on a press`, async ({ page }) => {
    await openRoute(page, route);
    const btn = page.getByRole('button', { name: 'Surprise me', exact: true }).first();
    await expect(btn).toBeVisible();
    await expect(btn).toHaveClass(/btn-magic/);
    await expect(btn).not.toHaveClass(/btn-secondary/);
    await expect(btn.locator('svg.magic-star')).toHaveCount(1);
    expect(await btn.evaluate((b) => getComputedStyle(b).backgroundImage)).toContain('linear-gradient');
    await btn.click();
    await expect(page.locator('.magic-burst > span')).toHaveCount(12);
    await expect(page.locator('.magic-burst')).toHaveCount(0, { timeout: 3000 });     // the sparkles clear themselves away
  });
}

test('with less motion asked for, Surprise me still works but throws no sparkles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/sprite/knight');
  const before = await page.evaluate(() => location.hash);
  await page.getByRole('button', { name: 'Surprise me', exact: true }).click();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(before);
  await expect(page.locator('.magic-burst')).toHaveCount(0);
});

test('a bag row\'s Surprise me is the magic button too, and sparkles on a press', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear(); bag.add({ kind: 'sprite', id: 'knight', settings: { params: {}, cues: null, scale: 1 } }); });
  await openRoute(page, '/bag');
  const btn = page.locator('.bag-item').first().getByRole('button', { name: /^Surprise me: / });
  await expect(btn).toHaveClass(/btn-magic/);
  await btn.click();
  await expect(page.locator('.magic-burst > span')).toHaveCount(12);
});
