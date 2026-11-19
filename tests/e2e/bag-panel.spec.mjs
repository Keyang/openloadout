// The bag as a list with the editing panel beside it (docs/site-design.md, section 5, "Bag"): each row shows the thing
// as it was changed, how many changes, its pixel size; clicking a row opens the same panel as an asset page beside the
// list, editing that bag item where it is, with no trip to another page.
import { test, expect, openRoute, canvasStats, setRange, hasHorizontalScroll, showControl, savedState } from '../helpers/test.mjs';

const items = (page) => page.locator('.bag-item');
const side = (page) => page.locator('.bag-side');
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());
async function openBag(page, list) {
  await openRoute(page, '/');
  await page.evaluate(async (l) => { const { bag } = await import('/app/bag.js'); bag.clear(); for (const it of l) bag.add(it); }, list);
  await openRoute(page, '/bag');
  await expect(items(page)).toHaveCount(list.length);
  await expect(page.locator('.bag-pic.pending')).toHaveCount(0);
}
const HERO = { kind: 'sprite', id: 'knight', settings: {} };
const AXE = { kind: 'sprite', id: 'knight', settings: { params: { weapon: 'axe', cape: 'tattered' }, scale: 2 } };
const SOUND = { kind: 'sound', id: 'coin-pickup', settings: {} };
const MUSIC = { kind: 'music', id: 'battle-theme', settings: {} };

test('a row says how much was changed and the pixel size; nothing is open until a row is clicked', async ({ page }) => {
  await openBag(page, [HERO, AXE, SOUND]);
  await expect(side(page)).toBeHidden();
  // an unchanged one says so once ("No changes yet"), not twice
  await expect(items(page).nth(0).locator('.bag-changes')).toHaveCount(0);
  await expect(items(page).nth(0).locator('.bag-text .hint')).toHaveText('No changes yet');
  await expect(items(page).nth(0)).not.toContainText('As the original');
  await expect(items(page).nth(0).locator('.bag-size')).toContainText('64 × 64');
  await expect(items(page).nth(1).locator('.bag-changes')).toHaveText('2 changes');
  await expect(items(page).nth(1).locator('.bag-changes')).toHaveClass(/is-changed/);
  await expect(items(page).nth(1).locator('.bag-size')).toContainText('128 × 128');
  await expect(items(page).nth(1).locator('.bag-size')).toContainText('2×');
  await expect(items(page).nth(1).locator('.bag-text .hint')).toContainText(/axe/i);
  await expect(items(page).nth(2).locator('.bag-changes')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toHaveCount(1);      // one Download for everything
});

test('clicking a row opens the panel beside the list; a change there is saved to that item and drawn in its row, without leaving the bag', async ({ page }) => {
  await openBag(page, [HERO, AXE]);
  const [first, second] = await bagItems(page);
  const row = items(page).nth(0);
  const plain = (await canvasStats(row.locator('canvas.tile'))).hash;

  await row.getByRole('button', { name: 'Change Hero' }).click();
  await expect(side(page)).toBeVisible();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Hero');
  await expect(row).toHaveAttribute('aria-current', 'true');
  await expect(page).toHaveURL(/#\/bag$/);
  await expect(savedState(page)).toContainText(/In your bag[\s·]*0 changes/);      // an unchanged item is in the bag, not "Saved" (J4.2)
  // beside the list on a wide window
  const l = await page.locator('.bag-list').boundingBox(), p = await side(page).boundingBox();
  expect(p.x).toBeGreaterThanOrEqual(l.x + l.width);

  await (await showControl(page, 'weapon')).getByRole('button', { name: 'Spear' }).click();
  await expect.poll(async () => (await bagItems(page)).find((i) => i.key === first.key).settings.params.weapon).toBe('spear');
  await expect(row.locator('.bag-changes')).toHaveText('1 change');
  await expect(savedState(page)).toContainText('Saved in your bag');
  await expect(row.locator('.bag-text .hint')).toContainText(/spear/i);
  await expect.poll(async () => (await canvasStats(items(page).nth(0).locator('canvas.tile'))).hash, { message: 'the row shows the spear' }).not.toBe(plain);
  await setRange((await showControl(page, 'height')).locator('input[type=range]'), 'max');
  await expect(items(page).nth(0).locator('.bag-changes')).toHaveText('2 changes');
  await page.locator('.rx-panel').getByRole('group', { name: 'Pixel size' }).getByRole('button', { name: '4×' }).click();
  await expect(items(page).nth(0).locator('.bag-size')).toContainText('256 × 256');
  await expect(page).toHaveURL(/#\/bag$/);
  await expect(side(page)).toBeVisible();

  // the other copy is untouched, and the bag still holds two things
  const now = await bagItems(page);
  expect(now.length).toBe(2);
  expect(now.find((i) => i.key === second.key).settings).toEqual(second.settings);

  // the second row: the panel now edits that item, starting from its settings
  await items(page).nth(1).getByRole('button', { name: 'Change Hero' }).click();
  await expect(items(page).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(items(page).nth(0)).not.toHaveAttribute('aria-current', 'true');
  await expect((await showControl(page, 'weapon')).getByRole('button', { name: 'Axe' })).toHaveAttribute('aria-pressed', 'true');

  // a reload keeps what was changed
  await page.reload();
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(0).locator('.bag-changes')).toHaveText('2 changes');
  expect((await bagItems(page))[0].settings.params.weapon).toBe('spear');
});

test('Start over keeps the item; Remove from bag in the panel takes the row out and closes the panel; Escape and the close button close it', async ({ page }) => {
  await openBag(page, [AXE, SOUND]);
  await items(page).nth(0).getByRole('button', { name: 'Change Hero' }).click();
  await side(page).locator('.rx-block').getByRole('button', { name: 'Start over' }).click();
  await expect(items(page).nth(0).locator('.bag-changes')).toHaveCount(0);
  await expect(items(page)).toHaveCount(2);

  await page.keyboard.press('Escape');
  await expect(side(page)).toBeHidden();
  await expect(items(page).nth(0).getByRole('button', { name: 'Change Hero' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(side(page)).toBeVisible();
  await side(page).getByRole('button', { name: 'Close the panel' }).click();
  await expect(side(page)).toBeHidden();

  await items(page).nth(0).getByRole('button', { name: 'Change Hero' }).click();
  await side(page).getByRole('button', { name: 'More for Hero' }).click();
  await side(page).getByRole('menuitem', { name: 'Remove from bag' }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(side(page)).toBeHidden();
  await expect(page.locator('header .bag-count')).toHaveText('1');
});

test('a sound and a track are changed in the panel too, and can be heard there', async ({ page }) => {
  await openBag(page, [SOUND, MUSIC]);
  const [sound, track] = await bagItems(page);
  await items(page).nth(0).getByRole('button', { name: 'Change Coin pickup' }).click();
  await expect(side(page).getByRole('button', { name: /^Play Coin pickup/ })).toBeVisible();
  await side(page).locator('.rx-panel').getByRole('button', { name: 'Surprise me' }).click();
  await expect.poll(async () => JSON.stringify((await bagItems(page)).find((i) => i.key === sound.key).settings.params)).not.toBe('{}');
  await expect(items(page).nth(0).locator('.bag-changes')).toHaveClass(/is-changed/);

  await items(page).nth(1).getByRole('button', { name: 'Change Battle theme' }).click();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Battle theme');
  const version = side(page).locator('.vbtn').first();
  await version.click();
  await expect(version).toHaveAttribute('aria-pressed', 'true');
  await expect(savedState(page)).toContainText('Saved in your bag');
  expect((await bagItems(page)).find((i) => i.key === track.key)).toBeTruthy();
  expect((await bagItems(page)).length).toBe(2);
});

test('"Open its page" leads to the asset\'s own page with the item\'s settings and its key', async ({ page }) => {
  await openBag(page, [AXE]);
  const [item] = await bagItems(page);
  await expect(items(page).nth(0).locator('.bag-actions a')).toHaveAttribute('href', new RegExp(`^#/sprite/knight\\?.*weapon=axe.*bag=${item.key}`));
});

for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 900, height: 700 }, { width: 390, height: 844 }]) {
  test(`${size.width} x ${size.height}: the list and the open panel fit, with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize(size);
    await openBag(page, [AXE, HERO, SOUND, MUSIC]);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await items(page).nth(0).getByRole('button', { name: 'Change Hero' }).click();
    await expect(side(page).locator('.rx-panel')).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    const p = await side(page).boundingBox();
    expect(p.x + p.width).toBeLessThanOrEqual(size.width + 1);
    if (size.width > 1000) expect(p.y + p.height, 'the whole panel is on the first screen').toBeLessThanOrEqual(size.height + 1);
    await side(page).getByRole('button', { name: 'Close the panel' }).click();
    await expect(side(page)).toBeHidden();
  });
}

// ---- an item's own look (app/bag.js lookOf, themeFor): one thing in the bag can wear a named look whatever the bag's is
test('an item with a look of its own is drawn, edited, shared and downloaded with it; the others follow the bag', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBag(page, [HERO, { kind: 'sprite', id: 'knight', settings: { look: 'frost' } }, { kind: 'sound', id: 'coin-pickup', settings: { look: 'frost' } }, SOUND]);
  const tile = (i) => items(page).nth(i).locator('canvas.tile');
  await expect.poll(async () => (await canvasStats(tile(0))).hash !== (await canvasStats(tile(1))).hash, { message: 'the Frost one is drawn in Frost' }).toBe(true);
  await expect(items(page).nth(1).locator('.bag-text .hint')).toHaveText('Frost look');      // its own look only, not "No changes yet" as well
  await expect(items(page).nth(2).locator('.bag-text .hint')).toHaveText('Frost look');
  await expect(items(page).nth(0).locator('.bag-text .hint')).toHaveText('No changes yet');
  await expect(items(page).nth(0).locator('.bag-text .hint')).not.toContainText('look,');
  const frost = (await canvasStats(tile(1))).hash;

  // the bag takes another look: the one that follows changes, the one with its own look does not
  const plain = (await canvasStats(tile(0))).hash;
  await page.locator('.bag-look').getByRole('button', { name: 'Night', exact: true }).click();
  await expect.poll(async () => (await canvasStats(tile(0))).hash).not.toBe(plain);
  expect((await canvasStats(tile(1))).hash).toBe(frost);

  // a change in the panel keeps the look; the panel's Look tab changes it, and gives it up
  await items(page).nth(1).getByRole('button', { name: 'Change Hero' }).click();
  await (await showControl(page, 'weapon')).getByRole('button', { name: 'Axe' }).click();
  await expect.poll(async () => (await bagItems(page))[1].settings).toMatchObject({ look: 'frost', params: { weapon: 'axe' } });
  await side(page).getByRole('tab', { name: 'Look' }).click();
  const own = side(page).getByRole('group', { name: 'Its own look' });
  await expect(own.getByRole('button', { name: 'Frost' })).toHaveAttribute('aria-pressed', 'true');
  await own.getByRole('button', { name: 'Sunset' }).click();
  await expect.poll(async () => (await bagItems(page))[1].settings.look).toBe('sunset');
  await expect(items(page).nth(1).locator('.bag-text .hint')).toContainText('Sunset look');
  await own.getByRole('button', { name: 'Frost' }).click();
  await expect.poll(async () => (await bagItems(page))[1].settings.look).toBe('frost');

  // the link to the bag carries it
  const link = await page.evaluate(async () => (await import('/app/bag.js')).bag.toLink());
  const got = await page.evaluate(async (l) => { const { createBag, memoryStorage } = await import('/app/bag.js'); const b = createBag(memoryStorage()); b.fromLink(l); return b.items().map((i) => i.settings.look ?? null); }, link);
  expect(got).toEqual([null, 'frost', 'frost', null]);

  // the package: each thing in its look, and the list says so
  const { bytes } = await (await import('../helpers/test.mjs')).downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), { timeout: 100_000 });
  const files = (await import('../helpers/test.mjs')).readZip(new Uint8Array(bytes));
  const manifest = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json').data));
  expect(manifest.assets.map((a) => a.look ?? null)).toEqual([null, 'frost', 'frost', null]);
  expect(manifest.theme.colour.palette, 'the package itself has the bag\'s look').toBe('Night');
  expect(manifest.assets[1].theme.colour.palette).toBe('Frost');
  const data = (name) => Buffer.from(files.find((f) => f.name === name).data);
  expect(data('sprites/knight/knight.png').equals(data('sprites/knight-2/knight.png')), 'the two Heroes are in different looks').toBe(false);
  expect(data('sounds/coin-pickup.wav').equals(data('sounds/coin-pickup-2.wav')), 'and the two sounds').toBe(false);

  // "Follows the bag" gives the look up
  await own.getByRole('button', { name: 'Follows the bag' }).click();
  await expect.poll(async () => 'look' in (await bagItems(page))[1].settings).toBe(false);
});

test('the picture of a row opens the panel too; a small sprite is shown large in its tile, at a whole-number size', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBag(page, [{ kind: 'sprite', id: 'coin', settings: {} }, HERO, SOUND]);
  // the coin is drawn in a 32 x 32 frame and fills less than half of it: in an 80 x 72 tile it is at least three times its own size
  const drawn = await items(page).nth(0).locator('canvas.tile').evaluate((cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, at = (x, y) => (d[(y * cv.width + x) * 4] << 16) | (d[(y * cv.width + x) * 4 + 1] << 8) | d[(y * cv.width + x) * 4 + 2];
    const shelf = at(0, 0);
    let y0 = cv.height, y1 = -1, runs = [];
    for (let y = 0; y < cv.height; y++) { let run = 0, last = -1; for (let x = 0; x < cv.width; x++) { const v = at(x, y); if (v !== shelf) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); } if (v === last) run++; else { if (last !== -1 && last !== shelf) runs.push(run); run = 1; last = v; } } }
    return { h: y1 - y0 + 1, shortest: Math.min(...runs) };
  });
  expect(drawn.h, 'the coin is tall in its tile').toBeGreaterThanOrEqual(48);
  expect(drawn.shortest, 'every pixel of it is a whole number of screen pixels wide').toBeGreaterThanOrEqual(3);

  await items(page).nth(1).locator('.bag-pic').click();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Hero');
  // a sound's Play button beside its picture plays, and does not open anything else
  await items(page).nth(2).getByRole('button', { name: /^Play/ }).click();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Hero');
  await items(page).nth(2).locator('.bag-pic').click();
  await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Coin pickup');
});

for (const size of [{ width: 900, height: 700 }, { width: 390, height: 844 }]) {
  test(`${size.width} x ${size.height}: the panel covers the list, takes the keyboard, and gives it back to the row when closed`, async ({ page }) => {
    await page.setViewportSize(size);
    await openBag(page, [AXE, HERO, SOUND]);
    const open = items(page).nth(1).getByRole('button', { name: 'Change Hero' });
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(side(page)).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('.bag-side').contains(document.activeElement)), 'the keyboard is in the panel').toBe(true);
    // what is behind cannot be reached: Tab stays in the panel all the way round
    expect(await page.evaluate(() => [document.querySelector('.bag-main').inert, document.querySelector('header.top').inert])).toEqual([true, true]);
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => { const a = document.activeElement; return a === document.body || !a ? 'page' : document.querySelector('.bag-side').contains(a) ? 'panel' : 'behind'; });
      expect(where, `Tab number ${i + 1}`).not.toBe('behind');
    }
    await page.keyboard.press('Escape');
    await expect(side(page)).toBeHidden();
    await expect(open).toBeFocused();
    expect(await page.evaluate(() => [document.querySelector('.bag-main').inert, document.querySelector('header.top').inert])).toEqual([false, false]);
    // and with the close button
    await page.keyboard.press('Enter');
    await side(page).getByRole('button', { name: 'Close the panel' }).click();
    await expect(open).toBeFocused();
  });
}

test('beside the list (a wide window) the list stays reachable while the panel is open, and every tab of the panel is in view', async ({ page }) => {
  await openBag(page, [AXE, HERO]);
  await items(page).nth(0).getByRole('button', { name: 'Change Hero' }).click();
  expect(await page.evaluate(() => document.querySelector('.bag-main').inert)).toBe(false);
  const box = await side(page).boundingBox();
  // "Fine-tune" is on a line of its own, above the tabs
  const h = await side(page).locator('.tune-head h2').boundingBox();
  for (const tab of await side(page).getByRole('tab').all()) { const b = await tab.boundingBox(); expect(b.y).toBeGreaterThanOrEqual(h.y + h.height - 1); expect(b.x + b.width, await tab.textContent()).toBeLessThanOrEqual(box.x + box.width); }
});
