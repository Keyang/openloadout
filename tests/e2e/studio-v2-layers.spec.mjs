// The studio's layer editor for backgrounds (build item B19c; docs/data-sprites.md section 6, "Background: layer editor").
//   - A layers body opens on the layer editor, not the structured tree: the layers back to front, each with its speed
//     (parallax), wrap, and a show/hide for the preview; All fields still shows every field.
//   - Speed, wrap, order, name, add, copy and remove are kept as data (the saved draft) and undo.
//   - The scrolling preview: Play/Pause, a camera speed slider, hidden layers left out, the wrap seam marked and put in
//     the middle of the view (two copies side by side).
//   - The picked layer's draw list is edited with the pictures editor (B17): pick a thing, its generator's arguments.
//   - The Time and colour controls are tried live on the preview and leave the definition as it was.
//   - The library's bg-forest and bg-starfield open as copies in it; nothing scrolls sideways at phone width.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import { test, expect, hasHorizontalScroll, canvasStats, setRange } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

async function home(page) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('loadout-studio-v1'); localStorage.removeItem('loadout-bag'); });
  await page.goto('/index.html#/studio?new', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2.studio-home')).toBeVisible();
}
const preview = (page) => page.locator('.v2-layers-preview canvas.v2-layers-canvas');
const drawnPreview = async (page) => (await canvasStats(preview(page))).opaque;
/** The layers template, drawn, with its preview drawn and paused (so its pixels hold still). */
async function hills(page) {
  await home(page);
  await page.locator('[data-start="v2-layers"]').click();
  await expect(page.locator('main.studio-v2[data-body="layers"]')).toBeVisible();
  await ready(page);
}
async function ready(page) {
  await expect(page.locator('.v2-layers')).toBeVisible();
  await expect.poll(() => drawnPreview(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await pause(page);
}
async function pause(page) {
  const b = page.locator('[data-act="layers-play"]');
  if ((await b.getAttribute('aria-pressed')) === 'true') await b.click();
  await expect(b).toHaveAttribute('aria-pressed', 'false');
}
const saved = (page) => page.evaluate(() => {
  const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]);
  return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition;
});
const names = async (page) => (await saved(page)).body.layers.map((l) => l.name);
const layerRow = (page, name) => page.locator(`.v2-layer[data-layer="${name}"]`);
const hash = async (page) => (await canvasStats(preview(page))).hash;

test('a background opens on the layer editor: the layers back to front, with speed, wrap and show', async ({ page }) => {
  await hills(page);
  await expect(page.locator('.v2-pane')).not.toContainText('The layers (scroll, order, names)');
  await expect(page.locator('.v2-layer')).toHaveCount(2);
  await expect(page.locator('.v2-layer').nth(0)).toHaveAttribute('data-layer', 'far');
  await expect(page.locator('.v2-layer').nth(1)).toHaveAttribute('data-layer', 'mid');
  await expect(layerRow(page, 'far').getByLabel('Speed of far')).toHaveValue('0.1');
  await expect(layerRow(page, 'mid').getByLabel('mid wraps')).toBeChecked();
  await expect(layerRow(page, 'far').getByLabel('Show far in the preview')).toBeChecked();
  // the picked layer's things, in the pictures editor's rows
  await expect(page.locator('.v2-list[data-list="body.layers.0.draw"]')).toBeVisible();
  // All fields still has every field
  await page.getByRole('tab', { name: 'All fields' }).click();
  await expect(page.locator('.v2-pane')).toContainText('scroll');
});

test('speed, wrap, order, name, add, copy and remove are kept as data, and undo', async ({ page }) => {
  await hills(page);
  await setRange(layerRow(page, 'mid').getByLabel('Speed of mid'), 0.6);
  await expect.poll(async () => (await saved(page)).body.layers[1].scroll).toBe(0.6);
  await expect(layerRow(page, 'mid').locator('.v2-layer-words')).toContainText('Middle');
  await layerRow(page, 'mid').getByLabel('mid wraps').uncheck();
  await expect.poll(async () => (await saved(page)).body.layers[1].wraps).toBe(false);
  await page.getByRole('button', { name: 'Move mid further back' }).click();
  await expect.poll(() => names(page)).toEqual(['mid', 'far']);
  await page.locator('[data-act="undo"]').click();
  await expect.poll(() => names(page)).toEqual(['far', 'mid']);
  // add a layer in front: it draws, and is picked
  await page.locator('[data-act="add-layer"]').click();
  await expect.poll(() => names(page)).toEqual(['far', 'mid', 'near']);
  await expect(page.locator('.v2-list[data-list="body.layers.2.draw"]')).toBeVisible();
  await expect(page.locator('.adv-status.v2-bad, .v2-stagenote.v2-bad')).toHaveCount(0);
  // rename it
  const nameIn = page.getByLabel('Name of the layer near');
  await nameIn.fill('hedge');
  await nameIn.press('Enter');
  await expect.poll(() => names(page)).toEqual(['far', 'mid', 'hedge']);
  await expect(layerRow(page, 'hedge')).toBeVisible();
  // a bad name is refused with a word, nothing changed
  const again = page.getByLabel('Name of the layer hedge');
  await again.fill('Two Words');
  await again.press('Enter');
  await expect(page.locator('.studio-say')).toContainText('one lowercase word');
  expect(await names(page)).toEqual(['far', 'mid', 'hedge']);
  // copy and remove
  await page.getByRole('button', { name: 'Copy the layer mid' }).click();
  await expect.poll(() => names(page)).toEqual(['far', 'mid', 'mid-2', 'hedge']);
  await page.getByRole('button', { name: 'Remove the layer mid-2' }).click();
  await page.getByRole('button', { name: 'Remove the layer hedge' }).click();
  await expect.poll(() => names(page)).toEqual(['far', 'mid']);
  await expect(page.getByRole('tab', { name: /^Check$/ })).toBeVisible();
});

test('the scrolling preview: play and pause, the camera speed, hidden layers, the seam', async ({ page }) => {
  await hills(page);
  const still = await hash(page);
  // playing moves it
  await page.locator('[data-act="layers-play"]').click();
  await expect.poll(() => hash(page), { timeout: 10_000 }).not.toBe(still);
  await pause(page);
  const cam = Number(await preview(page).getAttribute('data-camera'));
  await page.waitForTimeout(300);
  expect(Number(await preview(page).getAttribute('data-camera'))).toBe(cam);
  // the camera speed slider
  const speed = page.getByLabel('Camera speed');
  await setRange(speed, 200);
  await expect(page.locator('.v2-layers-speed-n')).toContainText('200');
  // hide the far layer: the preview changes, the definition does not
  const before = await saved(page);
  const shown = await hash(page);
  await layerRow(page, 'far').getByLabel('Show far in the preview').uncheck();
  await expect.poll(() => hash(page)).not.toBe(shown);
  await expect(preview(page)).toHaveAttribute('data-shown', 'mid');
  expect(await saved(page)).toEqual(before);
  await layerRow(page, 'far').getByLabel('Show far in the preview').check();
  await expect(preview(page)).toHaveAttribute('data-shown', 'far mid');
  // the seam of the picked layer, put in the middle of the view: two copies side by side
  await page.locator('.v2-layer-pick', { hasText: 'mid' }).click();
  await page.locator('[data-act="layers-seam-middle"]').click();
  await expect(preview(page)).toHaveAttribute('data-seams', '160');
  await expect(page.locator('[data-k="layers-seam"]')).toBeChecked();
  const marked = await hash(page);
  await page.locator('[data-k="layers-seam"]').uncheck();
  await expect.poll(() => hash(page)).not.toBe(marked);
  await expect(preview(page)).toHaveAttribute('data-seams', '');
});

test('the picked layer\'s things are edited with the pictures editor', async ({ page }) => {
  await hills(page);
  await page.locator('.v2-layer-pick', { hasText: 'mid' }).click();
  await expect(page.locator('.v2-layer[data-layer="mid"] .v2-layer-pick')).toHaveAttribute('aria-pressed', 'true');
  const list = page.locator('.v2-list[data-list="body.layers.1.draw"]');
  await expect(list).toBeVisible();
  await expect(page.locator('.v2-list[data-list="body.layers.0.draw"]')).toHaveCount(0);
  // the stage on the left shows the picked layer
  await expect(page.locator('.st-under .chip[data-clip="mid"]')).toHaveAttribute('aria-pressed', 'true');
  await list.locator('.v2-item', { hasText: 'ridge@1 "hill"' }).locator('.v2-itemname').click();
  await expect(page.locator('.v2-gen[data-gen="ridge@1"]')).toBeVisible();
  await page.getByRole('button', { name: /Delete treeline@1/ }).click();
  await expect.poll(async () => (await saved(page)).body.layers[1].draw.length).toBe(1);
  await expect(layerRow(page, 'mid')).toContainText('1 thing');
});

test('the Time and colour controls are tried live, leaving the definition as it was', async ({ page }) => {
  await hills(page);
  const before = await saved(page);
  const h0 = await hash(page);
  await setRange(page.locator('.v2-layers-try [data-try-layer="time"]'), 0);
  await expect.poll(() => hash(page)).not.toBe(h0);
  // the stage on the left follows
  await expect(page.locator('.v2-layers-try [data-try-layer="time"]')).toHaveValue('0');
  expect(await saved(page)).toEqual(before);
  await page.locator('[data-act="layers-defaults"]').click();
  await expect.poll(() => hash(page)).toBe(h0);
});

for (const id of ['bg-forest', 'bg-starfield']) {
  test(`the library's ${id} opens as a copy in the layer editor`, async ({ page }) => {
    test.setTimeout(120_000);
    await home(page);
    await page.getByLabel('Find a library sprite').fill(id);
    await page.locator(`[data-library="${id}"]`).click();
    await expect(page.locator('main.studio-v2[data-body="layers"]')).toBeVisible();
    await ready(page);
    await expect(page.locator('.v2-layer')).toHaveCount(3);
    const h0 = await hash(page);
    if (id === 'bg-forest') {
      await page.locator('.v2-layers-try select[data-try-layer="time"]').selectOption('night');
    } else {
      await page.locator('.v2-layers-try input[type="color"][data-try-layer="sky"]').evaluate((i) => { i.value = '#aa2222'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    }
    await expect.poll(() => hash(page), { timeout: 20_000 }).not.toBe(h0);
  });
}

test('nothing scrolls sideways at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await hills(page);
  expect(await hasHorizontalScroll(page)).toBe(false);
  await page.locator('.v2-layer-pick', { hasText: 'mid' }).click();
  await page.locator('.v2-list[data-list="body.layers.1.draw"] .v2-itemname').first().click();
  expect(await hasHorizontalScroll(page)).toBe(false);
  const box = await preview(page).boundingBox();
  expect(box.width).toBeLessThanOrEqual(375);
});
