// Library parts in the studio (build item B20; docs/data-sprites.md section 6). On Look & name of a character that
// extends a base, the parts groups are rows of looks, and "Add from library" offers the part and held pieces that fit
// the base (learnt from where the library's sprites wear them): pick one, see it on the sprite, put it in a new choice,
// and the picture shows it; Undo takes it out. The parts as fields stay under More; nothing scrolls sideways at phone
// width. Seen with cloud-courier (side view) and village-elder (top-down). Served from STUDIO_BASE_URL (default
// http://localhost:5199, the shared test server).
import fs from 'node:fs';
import { test, expect, hasHorizontalScroll, canvasStats } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

const lib = (id) => JSON.parse(fs.readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8'));

/** A library sprite kept as a draft on this computer (under another id), opened on Look & name. */
async function openDraft(page, id, draft) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2')).toBeVisible();
  await page.evaluate(({ k, d }) => {
    localStorage.removeItem('loadout-bag');
    localStorage.setItem('loadout-studio-v1', JSON.stringify({ version: 1, drafts: { [k]: { definition: d, savedAt: Date.now() } } }));
  }, { k: draft, d: { ...lib(id), id: draft } });
  await page.evaluate((h) => { location.hash = h; }, `#/studio/${draft}?mode=look`);
  await expect(page.locator('main.studio-v2[data-body="rig"]')).toBeVisible();
  await expect.poll(async () => (await canvasStats(page.locator('.studio-v2 .studio-canvas'))).opaque, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator('.v2-parts')).toBeVisible();
}
const picture = async (page) => (await canvasStats(page.locator('.studio-v2 .studio-canvas'))).hash;
/** The draft as saved on this computer. */
const saved = (page) => page.evaluate(() => {
  const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]);
  return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition;
});

test('a side-view character: its parts as looks, and a crown from the library as a new choice, then undone', async ({ page }) => {
  await openDraft(page, 'cloud-courier', 'courier-parts');
  // the groups the sprite has, one row per look, each with a picture; the raw fields under More
  const headgear = page.locator('.v2-partgroup[data-control="headgear"]');
  await expect(headgear.locator('.v2-partopt')).toHaveCount(lib('cloud-courier').controls.find((c) => c.key === 'headgear').options.length);
  await expect(headgear.locator('canvas.v2-partthumb').first()).toBeVisible();
  await expect(page.locator('.v2-partmore > summary')).toHaveText('More: the parts as fields');
  await expect(page.locator('.v2-pane h3', { hasText: 'Parts that can be switched off' })).toHaveCount(0);

  // the library: only what fits a side-view person, found by name
  await page.locator('[data-act="parts-add"]').click();
  const rows = page.locator('.v2-partrow');
  await expect(rows.first()).toBeVisible();
  expect(await page.locator('.v2-partrow[data-use*="topdown"]').count()).toBe(0);
  await expect(page.locator('.v2-partrow[data-use="part:hair"] .v2-partbadge')).toHaveText('worn already');
  await page.locator('[data-k="parts-find"]').fill('crown');
  await expect(page.locator('.v2-partrow:visible')).toHaveCount(1);
  await page.locator('.v2-partrow[data-use="part:crown"]').click();
  // the sprite wearing it, before it is added
  await expect(page.locator('.v2-partfig figcaption')).toHaveText(/Crown on headwear/, { timeout: 20_000 });
  expect((await canvasStats(page.locator('.v2-partpreview'))).opaque).toBeGreaterThan(0);

  // a new choice called Crown: added, picked on the picture, kept
  const before = await picture(page);
  await page.locator('[data-k="parts-name"]').fill('Royal');
  await page.locator('[data-act="parts-confirm"]').click();
  await expect(page.locator('.v2-partgroup[data-control="royal"] .v2-partopt')).toHaveCount(2);
  await expect.poll(async () => (await saved(page)).controls.some((c) => c.key === 'royal')).toBe(true);
  const d = await saved(page);
  expect(d.body.rig.shapes.find((s) => s.use === 'part:crown')).toMatchObject({ on: 'headwear', when: { royal: ['crown'] } });
  await expect(page.locator('.v2-partgroup[data-control="royal"] .v2-partopt[data-option="crown"]')).toHaveClass(/\bon\b/);
  await expect.poll(() => picture(page), { timeout: 20_000 }).not.toBe(before);
  // none takes it off the picture
  await page.locator('.v2-partgroup[data-control="royal"] .v2-partopt[data-option="none"] [data-act="part-show"]').click();
  await expect.poll(() => picture(page), { timeout: 20_000 }).toBe(before);

  // Undo takes it out again
  await page.locator('[data-act="undo"]').click();
  await expect(page.locator('.v2-partgroup[data-control="royal"]')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).controls.some((c) => c.key === 'royal')).toBe(false);
  await expect.poll(() => picture(page), { timeout: 20_000 }).toBe(before);
});

test('a top-down character: a look taken out with ×, and a top-down hat added to a choice it has; phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDraft(page, 'village-elder', 'elder-parts');
  // its three parts: what it holds, its beard and its headgear
  await expect(page.locator('.v2-partgroup')).toHaveCount(3);
  const control = 'headgear';
  const first = page.locator(`.v2-partgroup[data-control="${control}"]`);
  const looks = await first.locator('.v2-partopt').count();
  expect(looks).toBe(3);
  // a top-down hat into the headgear choice, as a look of its own
  await page.locator('[data-act="parts-add"]').click();
  await expect(page.locator('.v2-partrow').first()).toBeVisible();
  expect(await page.locator('.v2-partrow:not([data-use*="topdown"])').count()).toBe(0);
  await page.locator('.v2-partrow[data-use="part:topdown-straw-hat"]').click();
  await page.locator('[data-k="parts-target"]').selectOption(control);
  await expect(page.locator('[data-k="parts-name"]')).toHaveCount(0);
  await page.locator('[data-k="parts-option"]').fill('sun hat');
  await page.locator('[data-act="parts-confirm"]').click();
  await expect(first.locator('.v2-partopt')).toHaveCount(looks + 1);
  await expect.poll(async () => (await saved(page)).controls.find((c) => c.key === control).options.map((o) => o.value ?? o)).toContain('sun hat');
  expect(await hasHorizontalScroll(page)).toBe(false);
  // × takes the look out, with its piece
  await first.locator('.v2-partopt[data-option="sun hat"] [data-act="part-remove"]').click();
  await expect(first.locator('.v2-partopt')).toHaveCount(looks);
  await expect.poll(async () => (await saved(page)).body.rig.shapes.some((s) => s.use === 'part:topdown-straw-hat' && JSON.stringify(s.when).includes('sun hat'))).toBe(false);
  expect(await hasHorizontalScroll(page)).toBe(false);
});
