// The workbench (docs/playground-tray-workbench.md, section 3): on a sprite's page, "In your bag" shows the sprite
// standing in the creator's own scene (the bag's background and ground, other things from the bag around it, quieter),
// whether or not the sprite is in the bag yet. The frame line shows which frames play a sound, with the sound's name,
// and a click on a mark plays it. The page still never scrolls, for every sprite.
// Run with: npx playwright test tests/e2e/workbench.spec.mjs
import { test, expect, openRoute } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';
import { recordPlayed, heardAfter } from '../helpers/acceptance.mjs';

const C = catalogueOf(readCatalogue());
const BIG = 'kit-platformer-fantasy';
const kit = C.bundle(BIG);
const inKit = new Set(kit.sprites);
const STRANGER = C.sprites.find((a) => a.type === 'character' && a.view === 'side' && !inKit.has(a.id)).id;   // not in the bag

const bagItems = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('loadout-bag-v1')).items ?? []; } catch { return []; } });
async function addKit(page, id) {
  await page.goto(`/index.html#/bundle/${id}`);
  await page.waitForSelector('main.bundle-page .kit-top');
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(page.locator('.bundle-actions .status')).toContainText('Added');
}
const card = (page) => page.locator('.stage-card');
const seg = (page) => page.locator('.stage-tools .seg');
/** The colour of the canvas's pixel at a share of its width and height, as #rrggbb. */
const pixel = (page, fx, fy) => page.locator('canvas.stage').evaluate((cv, [fx, fy]) => { const d = cv.getContext('2d').getImageData(Math.floor(cv.width * fx), Math.floor(cv.height * fy), 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('') + (d[3] ? '' : '/clear'); }, [fx, fy]);

test.describe('In your bag', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the choice is Plain | In your bag; a character opens in your bag', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await expect(seg(page).locator('button')).toHaveText(['Plain', 'In your bag']);
    await expect(seg(page).locator('button[aria-pressed="true"]')).toHaveText('In your bag');
    await expect(card(page)).toHaveAttribute('data-stage', 'bag');
  });

  test('with an empty bag it draws the scene the page always drew', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await expect(card(page)).toHaveAttribute('data-bag-background', '');
    await expect(card(page)).toHaveAttribute('data-bag-others', '');
    expect(await pixel(page, 0.5, 0.02)).toBe('#bfe6f7');      // the meadow's sky
  });

  test('the bag\'s background and other bag sprites stand around a sprite that is not in the bag', async ({ page }) => {
    await addKit(page, BIG);
    const items = await bagItems(page);
    const bg = items.find((i) => C.byId[i.id]?.type === 'background' && C.byId[i.id].view !== 'top').id;
    expect(items.some((i) => i.id === STRANGER)).toBe(false);
    await openRoute(page, `/sprite/${STRANGER}`);
    await seg(page).getByRole('button', { name: 'In your bag' }).click();
    await expect(card(page)).toHaveAttribute('data-bag-background', bg, { timeout: 30_000 });
    const others = (await card(page).getAttribute('data-bag-others')).split(' ').filter(Boolean);
    expect(others.length).toBeGreaterThanOrEqual(1);
    expect(others.length).toBeLessThanOrEqual(6);
    for (const id of others) expect(items.some((i) => i.id === id), `${id} is from the bag`).toBe(true);
    expect(others).not.toContain(STRANGER);
    expect(await pixel(page, 0.5, 0.02)).not.toBe('#bfe6f7');      // not the meadow: the bag's own sky
    // Plain takes it all away again
    await seg(page).getByRole('button', { name: 'Plain' }).click();
    await expect(card(page)).toHaveAttribute('data-stage', 'plain');
    expect(await pixel(page, 0.02, 0.02)).toMatch(/\/clear$/);
  });

  test('a sprite that is in the bag is not shown twice: the others are the rest of the bag', async ({ page }) => {
    await addKit(page, BIG);
    await openRoute(page, '/sprite/knight');
    await expect(card(page)).not.toHaveAttribute('data-bag-background', '', { timeout: 30_000 });
    const others = (await card(page).getAttribute('data-bag-others')).split(' ').filter(Boolean);
    expect(others.length).toBeGreaterThanOrEqual(1);
    expect(others).not.toContain('knight');
  });

  test('a background has no choice; an interface piece keeps its light and dark panels', async ({ page }) => {
    await openRoute(page, '/sprite/bg-forest');
    await expect(seg(page)).toHaveCount(0);
    const ui = C.sprites.find((a) => a.type === 'ui').id;
    await openRoute(page, `/sprite/${ui}`);
    await expect(seg(page).locator('button')).toHaveText(['Light', 'Dark']);
  });
});

test.describe('the frame line shows the sounds', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a mark with the sound\'s name above each frame that plays one; a click plays it', async ({ page }) => {
    await recordPlayed(page);
    await openRoute(page, '/sprite/knight?clip=walk');
    const marks = page.locator('.strip .strip-mark');
    await expect(marks).toHaveCount(2);      // footsteps on frames 1 and 5
    const sounding = await page.locator('.strip .cell.has-sound').evaluateAll((cs) => cs.map((c) => [...c.parentElement.querySelectorAll('.cell')].indexOf(c)));
    expect(sounding).toEqual([0, 4]);
    for (const [i, f] of sounding.entries()) {
      const mark = marks.nth(i);
      await expect(mark).toHaveAttribute('data-frame', String(f));
      await expect(mark).toContainText('Footstep');
      const m = await mark.boundingBox(), c = await page.locator('.strip .cell').nth(f).boundingBox();
      expect(m.y + m.height, 'above its frame').toBeLessThanOrEqual(c.y + 1);
      expect(Math.abs(m.x - c.x), 'starts over its frame').toBeLessThanOrEqual(2);
    }
    await heardAfter(page, () => marks.first().click());
    // another animation, other marks: jump plays two different sounds
    await page.locator('.clips .chip[data-clip="jump"]').click();
    await expect(marks).toHaveCount(2);
    await expect(marks.nth(0)).toHaveAttribute('data-frame', '2');
    await expect(marks.nth(1)).toHaveAttribute('data-frame', '6');
    // a silent animation has no marks, and no empty row above its frames
    await page.locator('.clips .chip[data-clip="idle"]').click();
    await expect(marks).toHaveCount(0);
  });
});

// Every sprite, with a full bag (so the scene, the others and the tray are all there): nothing on the page scrolls.
for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
  test(`${w}x${h}: no sprite page scrolls, with the bag in sight`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: w, height: h });
    await addKit(page, BIG);
    await openRoute(page, '/sprite/knight');
    const bad = [];
    for (const a of C.sprites) {
      await page.evaluate((id) => { const old = document.querySelector('#app main'); if (old) old.dataset.left = '1'; location.hash = `#/sprite/${id}`; }, a.id);
      const opened = await page.waitForFunction(() => { const m = document.querySelector('#app main.rx'); return m && !m.dataset.left && document.querySelector('canvas.stage')?.width > 0; }, null, { timeout: 15_000 }).then(() => true, () => false);
      if (!opened) { bad.push(`${a.id}: did not open`); continue; }
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const m = await page.evaluate(() => {
        const col = document.querySelector('.rx-stage').getBoundingClientRect();
        const outside = [...document.querySelectorAll('.strip .cell, .strip .strip-mark')].filter((n) => { const r = n.getBoundingClientRect(); return r.right > col.right - 8 || r.bottom > innerHeight; }).length;
        return { page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], stage: document.querySelector('.stage-card').getBoundingClientRect().height, outside };
      });
      if (m.page[0] > w || m.page[1] > h || m.stage < 160 || m.outside) bad.push(`${a.id}: ${JSON.stringify(m)}`);
    }
    expect(bad).toEqual([]);
  });
}
