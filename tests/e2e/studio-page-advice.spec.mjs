// The studio page's advice (docs/studio.md sections 4 and 6; Contract 14 rule 7; build plan item S12). The quality bar is
// offered as advice only ("What the library would ask"), worked out in a background worker, in everyday words, and never
// blocks the bag or a download. The pixel-art warnings sit next to what they are about: a shape too thin to draw on its
// row, stray pixels on the frame's thumbnail and under "This frame", the fill band under the frame size and as dashed
// boxes on the picture; every advice line is a button that selects what it is about.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import { test, expect } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

async function newFrom(page, body) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Make a new one' }).click();
  await page.locator(`[data-start="${body}"]`).click();
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
}
const tab = (page, name) => page.getByRole('tab', { name, exact: true });
const draft = (page) => page.evaluate(() => { const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]); return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition; });
const DEV_WORDS = /\b(params?|clip|pivot|metrics|render|threw|seed|preset|toggle|undefined|null|NaN)\b|`/;

test('what the library would ask: on request, in a background worker, in everyday words, never blocking', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newFrom(page, 'blob');
  await tab(page, 'Look & name').click();
  await expect(page.locator('.st-pane')).toContainText('Advice only');
  const check = page.locator('[data-act="advice"]');
  await expect(check).toHaveText('Check it');
  await check.click();
  await expect(page.locator('.adv-status').first()).toContainText(/thing|Nothing to ask/, { timeout: 60_000 });
  await expect(check).toHaveText('Check again');
  const texts = await page.locator('.adv-list .adv-text').allTextContents();
  for (const t of texts) expect(t, t).not.toMatch(DEV_WORDS);
  // the blob is small for its frame: the fill band says so, and its line shows the frame size
  const fill = page.locator('.adv[data-advice="fill"] .adv-btn');
  await expect(fill).toHaveCount(1);
  await fill.click();
  await expect(tab(page, 'Frames')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Frame size')).toBeFocused();
  await expect(page.locator('.st-advice[data-advice="fill"]')).toContainText('half to three quarters');
  // advice only: the bag takes it whatever the advice says
  await page.evaluate(async () => { await window.loadout.bag.clear(); });
  await page.locator('[data-act="to-bag"]').click();
  await expect(page.locator('[data-act="to-bag"]')).toHaveText('In your bag');
  // a change after the advice: it says the advice is for an earlier version
  await tab(page, 'Look & name').click();
  await page.getByLabel('Name', { exact: true }).fill('Puddle');
  await page.getByLabel('Name', { exact: true }).press('Enter');
  await expect(page.locator('.st-pane')).toContainText('You have changed it since');
  expect(errors).toEqual([]);
});

test('a shape too thin to draw is marked on its row, listed at once, and its line selects it', async ({ page }) => {
  await newFrom(page, 'four-legs');
  const d = await draft(page);
  const limb = d.body.rig.shapes.find((s) => s.kind === 'limb' && s.width === 2);
  expect(limb).toBeTruthy();
  await page.locator(`[data-bone="${limb.bone}"]`).click();
  const row = page.locator(`.shape-row[data-shape="${limb.id}"]`);
  await expect(row.locator('.thin-mark')).toHaveCount(0);
  await row.getByRole('button', { name: 'Smaller' }).click();
  await expect(row.locator('.thin-mark')).toBeVisible();
  await expect(row.locator('.thin-mark')).toContainText('Thin');
  await tab(page, 'Look & name').click();
  const item = page.locator('.adv[data-advice="thin"] .adv-btn');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('breaks into stairs');
  // pick another bone first, so the line has to select the right one
  await tab(page, 'Body').click();
  await page.locator('[data-bone="spine"]').click();
  await tab(page, 'Look & name').click();
  await item.click();
  await expect(tab(page, 'Body')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`[data-bone="${limb.bone}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator(`.shape-row[data-shape="${limb.id}"] select`)).toBeFocused();
});

test('the fill band is said under the frame size on Frames, for a body that fits it', async ({ page }) => {
  await newFrom(page, 'four-legs');
  await tab(page, 'Frames').click();
  await expect(page.locator('.st-advice[data-advice="fill"]')).toContainText('inside the half to three quarters');
  await expect(page.locator('.st-advice[data-advice="fill"] .adv-mark')).toHaveCount(0);
});
