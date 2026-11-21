// Journey J4 (change an item from inside the bag), with J8.1, J9.1, J10 and J13.1 for the bag (docs/user-journeys.md).
// Starts from the ready-made bag: the Hero (Royal version, Night look), Coin pickup and Battle theme, all changed.
import fs from 'node:fs';
import { test, expect, canvasStats, hasHorizontalScroll, showControl, savedState } from '../helpers/test.mjs';

const LINK = fs.readFileSync(new URL('../fixtures/journeys/bag-link.txt', import.meta.url), 'utf8').trim();
const items = (page) => page.locator('.bag-item');
const side = (page) => page.locator('.bag-side');
const preview = (page) => side(page).locator('.rx-preview');
const row = (page, name) => items(page).filter({ has: page.locator('.bag-name', { hasText: new RegExp(`^${name}$`) }) });
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());

async function openReadyBag(page) {
  await page.goto(`/index.html${LINK}`, { waitUntil: 'domcontentloaded' });
  await expect(items(page)).toHaveCount(3);
  await expect(page.locator('.bag-pic.pending')).toHaveCount(0);
}
const inView = (box, vw, vh) => box && box.y >= 0 && box.x >= 0 && box.y + box.height <= vh + 0.5 && box.x + box.width <= vw + 0.5;

for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
  test(`J4.2 at ${w}x${h}: the panel shows the item's own live picture, in view with the control being changed, and every change shows on it`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await openReadyBag(page);
    await row(page, 'Hero').locator('.bag-open').click();
    const pic = preview(page).locator('canvas');
    await expect(pic).toBeVisible();
    const box = await pic.boundingBox();
    expect(box.height, 'at least 160 px tall').toBeGreaterThanOrEqual(160);
    expect(inView(box, w, h), 'the picture is in view').toBe(true);
    // crisp: drawn at a whole-number scale, pixelated
    const fit = await pic.evaluate((cv) => ({ k: cv.getBoundingClientRect().height / cv.height, kw: cv.getBoundingClientRect().width / cv.width, r: getComputedStyle(cv).imageRendering }));
    expect(Math.abs(fit.k - Math.round(fit.k))).toBeLessThan(0.02);
    expect(Math.abs(fit.kw - fit.k)).toBeLessThan(0.02);
    expect(fit.r).toMatch(/pixelated|crisp-edges/);

    // a colour: the picture changes within a second, and the control is in view beside it
    const before = (await canvasStats(pic)).hash;
    const hair = await showControl(page, 'hair');
    const red = hair.getByRole('button', { name: 'Red' }).first();
    expect(inView(await red.boundingBox(), w, h), 'the colour control is in view').toBe(true);
    expect(inView(await pic.boundingBox(), w, h), 'and so is the picture').toBe(true);
    await red.click();
    await expect.poll(async () => (await canvasStats(pic)).hash, { timeout: 1000 }).not.toBe(before);

    // a look: the same
    const mid = (await canvasStats(pic)).hash;
    await page.locator('.rx-panel [role=tab][data-tab="look"]').click();
    const frost = side(page).getByRole('group', { name: 'Its own look' }).getByRole('button', { name: 'Frost' });
    expect(inView(await frost.boundingBox(), w, h), 'the look is in view').toBe(true);
    await frost.click();
    await expect.poll(async () => (await canvasStats(pic)).hash, { timeout: 1000 }).not.toBe(mid);
    await expect(row(page, 'Hero').locator('.hint')).toContainText('Frost look');
    expect(await hasHorizontalScroll(page)).toBe(false);
    await ctx.close();
  });
}

test('J4.2: the panel does not scroll inside itself at 1440x900 (Parts) or at 1024x768 (every tab)', async ({ browser }) => {
  for (const [w, h, tabs] of [[1440, 900, ['parts', 'colours', 'shape', 'motion', 'look']], [1024, 768, ['shape', 'parts', 'colours', 'motion', 'sounds', 'look']]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await openReadyBag(page);
    await row(page, 'Hero').locator('.bag-open').click();
    for (const id of tabs) {
      const tab = page.locator(`.rx-panel [role=tab][data-tab="${id}"]`);
      if (!(await tab.isVisible())) continue;
      await tab.click();
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => { const p = [...document.querySelectorAll('.bag-side .pane')].find((x) => !x.hidden); return { sh: p.scrollHeight, ch: p.clientHeight }; });
      expect(m.sh, `${w}x${h} ${id}: the pane fits`).toBeLessThanOrEqual(m.ch + 1);
    }
    await ctx.close();
  }
});

test('J4.5: a sound has a Play button on its picture in the panel, and plays from there', async ({ page }) => {
  await openReadyBag(page);
  await row(page, 'Coin pickup').locator('.bag-open').click();
  const play = preview(page).getByRole('button', { name: /^Play Coin pickup/ });
  await expect(play).toBeVisible();
  await play.click();
  await row(page, 'Battle theme').locator('.bag-open').click();
  await expect(preview(page).getByRole('button', { name: /^(Play|Stop) Battle theme/ })).toBeVisible();
});

test('J10: on a phone the picture stays pinned at the top while the controls scroll under it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  const pic = preview(page).locator('canvas');
  await expect(pic).toBeVisible();
  const top = (await pic.boundingBox()).y;
  await side(page).evaluate((s) => { s.scrollTop = 600; });
  await page.waitForTimeout(100);
  const after = await pic.boundingBox();
  expect(Math.abs(after.y - top)).toBeLessThan(2);
  expect(after.height).toBeGreaterThanOrEqual(120);
  expect(await hasHorizontalScroll(page)).toBe(false);
  await ctx.close();
});

test('J4.7: "Open its page" carries the item\'s own look and its settings', async ({ page }) => {
  await openReadyBag(page);
  const href = await row(page, 'Hero').getByRole('link', { name: 'Open the page of Hero' }).getAttribute('href');
  expect(href).toContain('artlook=night');
  expect(href).toMatch(/bag=i\d+/);
  await row(page, 'Hero').locator('.bag-open').click();
  await expect(side(page).getByRole('link', { name: 'Open its page' })).toHaveAttribute('href', /artlook=night/);
});

test('J4.9: with a panel open, Back closes it and stays on the bag; a second Back leaves', async ({ page }) => {
  await page.goto('/index.html#/browse', { waitUntil: 'domcontentloaded' });
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  await expect(side(page)).toBeVisible();
  await page.goBack();
  await expect(side(page)).toBeHidden();
  await expect(page).toHaveURL(/#\/bag$/);
  await expect(items(page)).toHaveCount(3);
  await page.goBack();
  await expect(page).toHaveURL(/#\/browse/);
});

test('J4.9: closing the panel by hand does not leave an extra step for Back', async ({ page }) => {
  await page.goto('/index.html#/browse', { waitUntil: 'domcontentloaded' });
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  await row(page, 'Coin pickup').locator('.bag-open').click();
  await side(page).getByRole('button', { name: 'Close the panel' }).click();
  await expect(side(page)).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/#\/browse/);
});

test('J4.2: clicking anywhere on a row opens its panel, and the list does not jump', async ({ browser }) => {
  for (const [w, h] of [[1440, 900], [900, 700]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await openReadyBag(page);
    const r = row(page, 'Coin pickup');
    const b = await r.boundingBox();
    expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y).matches('li.bag-item'), [b.x + b.width * 0.6, b.y + 4])).toBe(true);
    await page.mouse.click(b.x + b.width * 0.6, b.y + 4);      // the row's own space, not its words or buttons
    await expect(side(page)).toBeVisible();
    await expect(side(page).locator('.rx-panel')).toHaveAttribute('aria-label', 'Change Coin pickup');
    if (w > 1000) {
      const a = await r.boundingBox();
      expect(Math.abs(a.y - b.y), 'the clicked row stays where it was').toBeLessThan(24);
    }
    await ctx.close();
  }
});

test('J4.3: colours are named in words, with no colour codes in view', async ({ page }) => {
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  const hair = await showControl(page, 'hair');
  await expect(hair).toContainText('Yellow');
  expect(await hair.innerText()).not.toMatch(/#[0-9a-f]{6}/i);
});

test('J4.2: the footer says the count of changes at every width; an item with none does not say "Saved"', async ({ browser }) => {
  for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await openReadyBag(page);
    await row(page, 'Hero').locator('.bag-open').click();
    await expect(savedState(page)).toBeVisible();
    expect(await savedState(page).innerText()).toMatch(/Saved in your bag[\s·]*8 changes/);
    await side(page).locator('.rx-block').getByRole('button', { name: 'Start over' }).click();
    await expect(savedState(page)).toContainText(/In your bag[\s·]*0 changes/);
    expect(await savedState(page).innerText()).not.toMatch(/Saved/);
    await ctx.close();
  }
});

test('J12 in the bag: when the browser will not keep the bag, the panel footer has a visible Copy link button', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  const page = await ctx.newPage();
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  await expect(side(page).locator('.rx-foot').getByRole('button', { name: 'Copy link' })).toBeVisible();
  await ctx.close();
});

test('J13.1: the versions are one tab stop with arrow keys inside; focus shows when the panel opens', async ({ page }) => {
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').focus();
  await page.keyboard.press('Enter');
  await expect(side(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return !!a.closest('.bag-side') && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0; }), { message: 'focus is in the panel and visible' }).toBe(true);
  // only one version tile is a tab stop
  await expect.poll(() => side(page).locator('.vstrip .vbtn').count()).toBeGreaterThan(1);
  await expect.poll(() => side(page).locator('.vstrip .vbtn').evaluateAll((l) => l.filter((b) => b.tabIndex >= 0).length)).toBe(1);
  await side(page).locator('.vstrip .vbtn[tabindex="0"]').focus();
  const first = await page.evaluate(() => document.activeElement.title);
  await page.keyboard.press('ArrowRight');
  const next = await page.evaluate(() => document.activeElement.title);
  expect(next).not.toBe(first);
  expect(await page.evaluate(() => document.activeElement.classList.contains('vbtn'))).toBe(true);
});

test('J4 words: an unchanged row does not say "Standard look" or "Standard style"; the empty bag has room under its sentence', async ({ page }) => {
  await page.goto('/index.html#/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear(); bag.add({ kind: 'sprite', id: 'knight', settings: {} }); bag.add({ kind: 'sound', id: 'coin-pickup', settings: {} }); });
  await page.goto('/index.html#/bag');
  await expect(items(page)).toHaveCount(2);
  await expect(page.locator('.bag-list')).not.toContainText('Standard');
  await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); bag.clear(); });
  const btn = page.getByRole('link', { name: 'Browse the catalogue' });
  await expect(btn).toBeVisible();
  // (the empty bag is drawn again after the list goes: the gap is measured until both are there, then it has to be 16 px or more)
  const lede = page.locator('.bag-head .lede');
  const gap = async () => { const l = await lede.boundingBox(), n = await btn.boundingBox(); return l && n ? n.y - (l.y + l.height) : -1; };
  await expect.poll(gap).toBeGreaterThanOrEqual(16);
});

test('J8.1: the download message names sprites, sounds and music in words that match the bag', async ({ page }) => {
  await openReadyBag(page);
  const status = page.locator('.bag-export .status');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect(status).toContainText('Downloaded', { timeout: 60_000 });
  const text = await status.innerText();
  expect(text).toMatch(/1 sprite sheet/);
  expect(text).toMatch(/1 sound\b/);
  expect(text).toMatch(/1 music track/);
});

test('J4.6 and J4.3: changes made in the panel are still there after a reload', async ({ page }) => {
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  await (await showControl(page, 'hair')).getByRole('button', { name: 'Red' }).first().click();
  await expect.poll(async () => (await bagItems(page)).find((i) => i.id === 'knight').settings.params.hair).toBe('#c9423a');
  await page.reload();
  await expect(items(page)).toHaveCount(3);
  // (the Hero's hair colour is a general colour control of the data sprite whose `when` names the hair style: app/changes.js reads it as the hair's)
  await expect(row(page, 'Hero').locator('.hint')).toContainText(/red hair/i);
});
