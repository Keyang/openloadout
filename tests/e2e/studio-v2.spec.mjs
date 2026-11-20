// The studio for every version 2 body (build item B17; docs/data-sprites.md section 6; Contract 15 rule 7, DQ5).
//   - Every body (rig, tiles, layers, panel, emitters, pictures) starts from its template, is drawn by the framework
//     renderer, passes its checks and is kept on this computer as version 2.
//   - The pictures editor: pick a shape and move it, order the list, delete and undo, add a generator from the registry
//     and change an argument through the input its documented type takes; the stamp painter paints pixels with the
//     palette's slots and resizes the stamp.
//   - A change that leaves mistakes is kept and its errors are shown beside what they are about and under Check; the
//     picture, the bag and the file wait until it passes. The quality bar's findings are shown under Check.
//   - Put in my bag (the bag item follows later edits) and Download <id>.json.
//   - A library data sprite opens as a copy; a version 1 draft still opens in the version 1 editor; nothing scrolls
//     sideways at phone width.
// The page is served from STUDIO_BASE_URL (default http://localhost:5199, the shared test server).
import { test, expect, hasHorizontalScroll, downloadFrom, canvasStats } from '../helpers/test.mjs';

const BASE = process.env.STUDIO_BASE_URL || 'http://localhost:5199';
test.use({ baseURL: BASE });

const BODIES = ['pictures', 'rig', 'emitters', 'panel', 'layers', 'tiles'];

/** The studio's first page with "Make a new one" open, storage empty. */
async function home(page) {
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('loadout-studio-v1'); localStorage.removeItem('loadout-bag'); });
  await page.goto('/index.html#/studio?new', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main.v2.studio-home')).toBeVisible();
}
/** A new version 2 draft from a body's template; waits until it has been checked and drawn. */
async function newV2(page, body) {
  await home(page);
  await page.locator(`[data-start="v2-${body}"]`).click();
  await expect(page.locator(`main.studio-v2[data-body="${body}"]`)).toBeVisible();
  await expect(page.locator('.studio-canvas')).toBeVisible();
  await expect.poll(() => drawn(page), { timeout: 20_000 }).toBeGreaterThan(0);
}
const drawn = async (page) => (await canvasStats(page.locator('.studio-v2 .studio-canvas'))).opaque;
const tab = (page, name) => page.getByRole('tab', { name, exact: false }).filter({ hasText: name });
/** The draft as saved on this computer. */
const saved = (page) => page.evaluate(() => {
  const id = decodeURIComponent(location.hash.split('/')[2].split('?')[0]);
  return JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition;
});
const savedSoon = async (page) => { await expect(page.locator('.rx-foot .saved .saved-text')).toHaveText('Saved on this computer'); return saved(page); };
const row = (page, label) => page.locator('.v2-item').filter({ has: page.locator('.v2-itemlabel', { hasText: label }) });

test.describe('every body starts, draws and is kept as version 2', () => {
  for (const body of BODIES) {
    test(body, async ({ page }) => {
      await newV2(page, body);
      await tab(page, 'Check').click();
      await expect(page.locator('.adv-status[data-state="ok"]')).toBeVisible();
      const d = await savedSoon(page);
      expect(d.version).toBe(2);
      expect(Object.keys(d.body)).toContain(body);
      expect(d.made.from).toBe(`template:v2-${body}`);
      // the clips the sprite has (a layout may write them) are under the picture, each frame drawn
      await expect(page.locator('.st-under .timeline .frame').first()).toBeVisible();
    });
  }
});

test('the pictures editor: move, order, delete and undo, and a generator added from the registry', async ({ page }) => {
  await newV2(page, 'pictures');
  // pick the round body and move it one pixel right: its point moves, the picture changes
  const before = (await canvasStats(page.locator('.studio-canvas'))).hash;
  await row(page, 'Round "body"').locator('.v2-itemname').click();
  await expect(row(page, 'Round "body"').locator('.v2-itemedit')).toBeVisible();
  await page.getByRole('button', { name: 'Move right one pixel' }).click();
  await expect.poll(async () => (await saved(page)).body.pictures.draw[0].at).toEqual([1, 0]);
  await expect.poll(async () => (await canvasStats(page.locator('.studio-canvas'))).hash).not.toBe(before);
  // the stamp drawn later (over the outline's place): its row moves down the list
  await page.getByRole('button', { name: /Draw Pixels "facet" on gem later/ }).click();
  await expect.poll(async () => (await saved(page)).body.pictures.draw.map((x) => x.id ?? x.kind)).toEqual(['body', 'outline', 'facet', 'glint']);
  // delete the glint, then undo brings it back
  await page.getByRole('button', { name: /Delete glint@2/ }).click();
  await expect.poll(async () => (await saved(page)).body.pictures.draw.some((x) => x.gen === 'glint')).toBe(false);
  await page.locator('[data-act="undo"]').click();
  await expect.poll(async () => (await saved(page)).body.pictures.draw.some((x) => x.gen === 'glint')).toBe(true);
  // add a generator: picked from the registry's list for a draw list, its arguments from their documented types
  await page.locator('[data-act="add-body.pictures.draw"]').click();
  await page.getByRole('menuitem', { name: 'A generator…' }).click();
  await page.locator('.v2-genpick select').selectOption('star@1');
  await page.locator('[data-act="add-gen"]').click();
  await expect.poll(async () => (await saved(page)).body.pictures.draw.some((x) => x.gen === 'star' && x.v === 1)).toBe(true);
  const gen = page.locator('.v2-item.on .v2-gen[data-gen="star@1"]');
  await expect(gen).toBeVisible();
  await expect(gen.locator('.v2-arg[data-arg]')).not.toHaveCount(0);
  // a number argument is a number box in its range; changing it is kept
  const numberArg = gen.locator('.v2-arg[data-arg] input[type="number"]').first();
  const argName = await numberArg.locator('xpath=ancestor::div[contains(@class,"v2-arg")]').getAttribute('data-arg');
  const max = Number(await numberArg.getAttribute('max'));
  const min = Number(await numberArg.getAttribute('min'));
  const want = Math.max(min, Math.min(max, 3));
  await numberArg.fill(String(want));
  await numberArg.press('Enter');
  await expect.poll(async () => { const s = (await saved(page)).body.pictures.draw.find((x) => x.gen === 'star'); return Array.isArray(s[argName]) ? s[argName][0] : s[argName]; }).toBe(want);
  await tab(page, 'Check').click();
  await expect(page.locator('.adv-status[data-state]')).toHaveAttribute('data-state', /ok|errors/);
});

test('the stamp painter: paint pixels with a palette slot, rub one out, resize within the caps', async ({ page }) => {
  await newV2(page, 'pictures');
  await row(page, 'Pixels "facet"').locator('.v2-itemname').click();
  const grid = page.locator('.v2-stampgrid');
  await expect(grid).toBeVisible();
  const cell = Number(await grid.getAttribute('data-cell'));
  const box = await grid.boundingBox();
  const k = box.width / Number(await grid.evaluate((c) => c.width));
  const at = (x, y) => [box.x + (x + 0.5) * cell * k, box.y + (y + 0.5) * cell * k];
  // paint the top-left pixel with ink
  await page.locator('.v2-swatch[data-paint="ink"]').click();
  await page.mouse.click(...at(0, 0));
  await expect.poll(async () => { const s = (await saved(page)).body.pictures.draw[1]; return s.key[s.rows[0][0]]; }).toBe('ink');
  // rub out the middle pixel of the top row (it was gem.light)
  await page.locator('.v2-swatch[data-paint="see-through"]').click();
  await page.mouse.click(...at(1, 0));
  await expect.poll(async () => (await saved(page)).body.pictures.draw[1].rows[0][1]).toBe('.');
  // the stamp grows to 5 by 4; the new column is see-through
  const width = page.getByLabel('Stamp width');
  await width.fill('5');
  await width.press('Enter');
  await expect.poll(async () => (await saved(page)).body.pictures.draw[1].rows.map((r) => r.length)).toEqual([5, 5, 5]);
  await expect.poll(async () => (await saved(page)).body.pictures.draw[1].rows.every((r) => r[4] === '.')).toBe(true);
  // a width past 32 is held to 32
  await width.fill('99');
  await width.press('Enter');
  await expect.poll(async () => (await saved(page)).body.pictures.draw[1].rows[0].length).toBe(32);
});

test('a change with mistakes is kept, its errors shown beside it and under Check; the bag and the file wait', async ({ page }) => {
  await newV2(page, 'pictures');
  await tab(page, 'Look & name').click();
  await page.locator('[data-act="add-control"]').click();
  await page.getByRole('menuitem', { name: 'A slider' }).click();
  // a control nothing uses is refused by the validator: said on its row, counted on the tab, the stage says so
  const ctl = page.locator('.v2-ctlrow.has-error');
  await expect(ctl).toHaveCount(1);
  await expect(ctl.locator('.v2-errs li')).toContainText('nothing uses it');
  await expect(tab(page, 'Check')).toHaveText(/Check \(1\)/);
  // the controls people get can be tried on the picture (the last change failed, so they are the sprite that drew)
  await expect(page.locator('[data-try="size"]')).toBeVisible();
  // trying a control changes the picture (the last version that drew), not the definition
  const pic = (await canvasStats(page.locator('.studio-canvas'))).hash;
  await page.locator('[data-try="size"]').fill('1');
  await expect.poll(async () => (await canvasStats(page.locator('.studio-canvas'))).hash).not.toBe(pic);
  // after a reload a draft with mistakes has no version that drew: the stage says so
  await expect(page.locator('.v2-stagenote')).toContainText('Not drawn as changed');
  await expect(page.locator('[data-act="to-bag"]')).toBeDisabled();
  // it is kept as it is: a reload opens it with the same error
  const d = await savedSoon(page);
  expect(d.controls.at(-1).kind).toBe('range');
  await page.reload();
  await expect(page.locator('main.studio-v2')).toBeVisible();
  await expect(page.locator('.v2-stagenote')).toContainText('It does not draw yet');
  await tab(page, 'Check').click();
  await expect(page.locator('.v2-all-errs li')).toContainText(['nothing uses it']);
  // removing it makes it pass again
  await tab(page, 'Look & name').click();
  await page.getByRole('button', { name: `Remove the control ${d.controls.at(-1).key}` }).click();
  await tab(page, 'Check').click();
  await expect(page.locator('.adv-status[data-state="ok"]')).toBeVisible();
  await expect(page.locator('[data-act="to-bag"]')).toBeEnabled();
});

test('the quality bar\'s findings are shown under Check', async ({ page }) => {
  await newV2(page, 'pictures');
  await tab(page, 'Check').click();
  await expect(page.locator('[data-advice="passes"], [data-advice="problems"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.v2-findings')).toBeAttached();
});

test('put in the bag (it follows later edits) and download <id>.json', async ({ page }) => {
  await newV2(page, 'emitters');
  await page.locator('[data-act="to-bag"]').click();
  await expect(page.locator('.rx-foot .saved small')).toHaveText('In your bag · updates as you work');
  const item = () => page.evaluate(async () => (await import('/app/bag.js')).bag.items().find((i) => i.definition?.data));
  expect((await item()).definition.data.version).toBe(2);
  await tab(page, 'Look & name').click();
  await page.locator('#v2-name').fill('Zap burst');
  await page.locator('#v2-name').press('Enter');
  await expect.poll(async () => (await item()).definition.data.name, { timeout: 15_000 }).toBe('Zap burst');
  const d = await savedSoon(page);
  const file = await downloadFrom(page, async () => {
    await page.locator('[data-act="download"]').click();
    await page.getByRole('menuitem', { name: `File for the library (${d.id}.json)` }).click();
  });
  expect(file.name).toBe(`${d.id}.json`);
  const back = JSON.parse(file.bytes.toString('utf8'));
  expect(back.version).toBe(2);
  expect(back.name).toBe('Zap burst');
  expect(back.body.emitters.length).toBe(2);
});

test('a library data sprite opens as a copy (DQ5)', async ({ page }) => {
  await home(page);
  await page.getByLabel('Find a library sprite').fill('coin');
  await page.locator('[data-library="coin"]').click();
  await expect(page.locator('main.studio-v2[data-body="pictures"]')).toBeVisible();
  await expect.poll(() => drawn(page), { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(page.locator('.rx-head .blurb')).toContainText("a copy of the library's coin");
  const d = await savedSoon(page);
  expect(d.id).toBe('coin-copy');
  expect(d.made).toEqual({ in: 'studio', from: 'library:coin' });
  // the generator token@1 is edited by its arguments
  await row(page, 'token@1').locator('.v2-itemname').click();
  await expect(page.locator('.v2-gen[data-gen="token@1"]')).toBeVisible();
});

test('a tileset: its fields as a tree, and a decal\'s stamp painted', async ({ page }) => {
  await newV2(page, 'tiles');
  await expect(page.locator('.v2-pane')).toContainText('The tileset');
  await page.getByRole('button', { name: /Paint the pixels of Pixels/ }).first().click();
  await expect(page.locator('.v2-painting .v2-stampgrid')).toBeVisible();
  // a generator inside the tree (the fill's scatter) is edited by its documented arguments
  await expect(page.locator('.v2-gen[data-gen="scatter@1"]')).toBeAttached();
});

test('a version 1 draft still opens in the version 1 editor', async ({ page }) => {
  await home(page);
  await page.locator('[data-start="four-legs"]').click();
  await expect(page.locator('main.v2.rx.studio')).toBeVisible();
  await expect(page.locator('main.studio-v2')).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Move', exact: true })).toBeVisible();
  const d = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts)[0].definition);
  expect(d.version).toBe(1);
});

test('nothing scrolls sideways at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await home(page);
  expect(await hasHorizontalScroll(page)).toBe(false);
  for (const body of ['pictures', 'layers']) {
    await newV2(page, body);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await row(page, body === 'pictures' ? 'Pixels "facet"' : 'ridge@1').first().locator('.v2-itemname').click();
    expect(await hasHorizontalScroll(page)).toBe(false);
    for (const t of ['Look & name', 'Check', 'All fields']) {
      await tab(page, t).click();
      expect(await hasHorizontalScroll(page), `${body}, ${t}`).toBe(false);
    }
  }
});
