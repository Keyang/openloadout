// The Look tab and the Sounds tab of a sprite's page.
// Look: the whole-set looks (engine/theme.js THEME_PRESETS) on this one sprite. The page shows the look, its own
// download and its link carry it; the bag keeps one look for everything, so the tab says it is a preview there and
// offers to use the look for the whole bag.
// Sounds: for the animation that is playing, which sound, on which frame, play it, change it.
// Run with: npx playwright test tests/e2e/asset-look.spec.mjs
import { test, expect, openRoute, openTab, canvasGroupStats, downloadFrom, readZip, waitForDrawn, downloadButton } from '../helpers/test.mjs';
import { THEME_PRESETS } from '../../engine/theme.js';

const strip = (page) => page.locator('.strip .cell canvas');
const stripHash = async (page) => (await canvasGroupStats(strip(page))).hash;
const looks = (page) => page.locator('.rx-panel [data-pane="look"] .looks .vbtn');
const bagNow = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('loadout-bag-v1') ?? 'null'));
const sheetOf = async (page) => {
  const { bytes } = await downloadFrom(page, () => downloadButton(page).click());
  return Buffer.from(readZip(new Uint8Array(bytes)).find((f) => f.name === 'knight.png').data).toString('base64');
};

test('the Look tab offers "Follows the bag" and every named look, each on a picture of this sprite', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  await openTab(page, 'look');
  await expect(looks(page)).toHaveCount(THEME_PRESETS.length + 1);
  expect(await looks(page).locator('.name').allTextContents()).toEqual(['Follows the bag', ...THEME_PRESETS.map((p) => p.name)]);
  await expect(looks(page).first()).toHaveAttribute('aria-pressed', 'true');
  // a picture on every tile, and the looks do not all look alike
  const pictures = await looks(page).locator('canvas').evaluateAll((cvs) => cvs.map((cv) => cv.toDataURL()));
  expect(pictures).toHaveLength(THEME_PRESETS.length + 1);
  expect(new Set(pictures).size).toBeGreaterThanOrEqual(THEME_PRESETS.length - 1);
  // the same words as the Look tab beside the bag's list
  await expect(page.locator('.look-note')).toHaveText('A look for this one thing. It keeps it whatever look the rest of your bag takes.');
  await expect(page.locator('.rx-panel [data-tab="look"] .dot')).toBeHidden();
});

test('a look is a setting like any other: it recolours the sprite, saves itself to the bag with the change dot, and travels in the link', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  await openTab(page, 'look');
  const plain = await stripHash(page);
  await looks(page).filter({ hasText: 'Night' }).click();
  await expect(looks(page).filter({ hasText: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => stripHash(page)).not.toBe(plain);
  const night = await stripHash(page);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('artlook=night');
  // saved, counted, marked
  await expect(page.locator('.rx-panel .saved')).toContainText(/Saved in your bag\s*1 change/);
  await expect(page.locator('.rx-panel [data-tab="look"] .dot')).toBeVisible();
  await expect.poll(async () => (await bagNow(page)).items[0].settings.look).toBe('night');

  // a reload goes on with it; so does the link alone, in a browser with an empty bag
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForDrawn(page);
  await expect.poll(() => stripHash(page)).toBe(night);
  await openTab(page, 'look');
  await expect(looks(page).filter({ hasText: 'Night' })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => localStorage.clear());
  await openRoute(page, '/');
  await openRoute(page, '/sprite/knight?artlook=night');
  await expect.poll(() => stripHash(page)).toBe(night);

  // "Follows the bag" takes it off again; Start over does too
  await openTab(page, 'look');
  await looks(page).first().click();
  await expect.poll(() => stripHash(page)).toBe(plain);
  await expect(page.locator('.rx-panel [data-tab="look"] .dot')).toBeHidden();
  await expect.poll(async () => (await bagNow(page))?.items?.[0]?.settings.look ?? null).toBeNull();
  await looks(page).filter({ hasText: 'Frost' }).click();
  await expect.poll(() => stripHash(page)).not.toBe(plain);
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect.poll(() => stripHash(page)).toBe(plain);
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('artlook');
});

test('Download from the page makes the files in the look; "Use this look for my whole bag" gives it to the bag', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  const plain = await sheetOf(page);
  await openTab(page, 'look');
  await looks(page).filter({ hasText: 'Frost' }).click();
  const frost = await sheetOf(page);
  expect(frost).not.toBe(plain);
  await expect(page.locator('.rx-panel .status')).toContainText('in the Frost look');

  await page.getByRole('button', { name: 'Use this look for my whole bag' }).click();
  await expect(page.locator('.rx-panel .status')).toContainText('Everything in your bag now has the Frost look');
  expect((await bagNow(page)).theme.colour.palette).toBe('Frost');
  // "Original" holds it as it was made: the download is the plain sheet again
  await looks(page).filter({ hasText: 'Original' }).click();
  expect(await sheetOf(page)).toBe(plain);
});

test('Sounds: each sound of the animation says its frame on a row of squares, and pressing a square moves it there', async ({ page }) => {
  await openRoute(page, '/sprite/knight');
  await openTab(page, 'sounds');
  await expect(page.locator('.cues h2')).toHaveText('Sounds for Walk');
  const first = page.locator('.cues li.cue').first();
  const ruler = first.getByRole('group', { name: 'The frame it plays on' });
  await expect(ruler.getByRole('button')).toHaveCount(8);
  const before = Number(await ruler.locator('button[aria-pressed="true"]').getAttribute('data-frame'));
  await expect(first.locator('.ruler-word')).toHaveText(`Frame ${before + 1} of 8`);
  await expect(page.locator('.strip .cell').nth(before)).toHaveClass(/has-sound/);
  // which sound, its style, play, and the three things to do with it
  await expect(first.getByRole('combobox', { name: 'Sound' })).toHaveValue(/footstep/);
  await expect(first.getByRole('combobox', { name: 'Style' })).toBeVisible();
  await expect(first.getByRole('button', { name: /^Play / })).toBeVisible();
  for (const name of ['Adjust', 'Duplicate', 'Remove']) await expect(first.getByRole('button', { name })).toBeVisible();

  const to = before === 2 ? 3 : 2;
  await ruler.getByRole('button', { name: `Move to frame ${to + 1}`, exact: true }).click();
  await expect(ruler.locator('button[aria-pressed="true"]')).toHaveAttribute('data-frame', String(to));
  await expect(first.locator('.ruler-word')).toHaveText(`Frame ${to + 1} of 8`);
  await expect(page.locator('.strip .cell').nth(to)).toHaveClass(/has-sound/);
  // the change saved itself, like any other
  await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
  await expect(page.locator('.rx-panel [data-tab="sounds"] .dot')).toBeVisible();
  await expect.poll(async () => (await bagNow(page)).items[0].settings.cues.walk[0].frame).toBe(to);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('sfx=');

  // Adjust opens the sound's own sliders under its row
  await first.getByRole('button', { name: 'Adjust' }).click();
  await expect(page.locator('.cues li.cue').first().getByRole('slider', { name: 'Volume' })).toBeVisible();
});
