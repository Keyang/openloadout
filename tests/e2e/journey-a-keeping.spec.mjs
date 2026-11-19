// Keeping changes (docs/user-journeys.md J3, J7, J9.2, J11, J13.2, reloads across pages): builder A's fixes.
import fs from 'node:fs';
import { test, expect, openRoute, waitForDrawn, openTab, showControl, savedState } from '../helpers/test.mjs';

const BAG_LINK = fs.readFileSync(new URL('../fixtures/journeys/bag-link.txt', import.meta.url), 'utf8').trim();
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('loadout-bag-v1') ?? '{"items":[]}'));
const knightOf = async (page) => (await stored(page)).items.find((it) => it.id === 'knight');
const swatch = (page, key, hex) => page.locator(`.rx-panel [data-control="${key}"] .swatch[data-v="${hex}"]`).first();
async function pickColour(page, key, nth) {
  await showControl(page, key);
  const sw = page.locator(`.rx-panel [data-control="${key}"] .swatch[data-v]`).nth(nth);
  const hex = await sw.getAttribute('data-v');
  await sw.click();
  return hex;
}
const settle = (page) => page.waitForTimeout(500);

test('J11: two tabs on the same item keep both changes, and each shows the other\'s', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/sprite/knight');
  const outfit = await pickColour(page, 'outfit', 3);
  await settle(page);
  const b = await context.newPage();
  await b.setViewportSize({ width: 1440, height: 900 });
  await openRoute(b, '/bag');
  await b.locator('.bag-item .bag-open').first().click();
  const hair = await pickColour(b, 'hair', 4);
  await settle(b);
  // tab A follows, without a reload
  await expect(swatch(page, 'hair', hair)).toHaveAttribute('aria-pressed', 'true', { timeout: 2000 }).catch(async () => {
    expect(await page.locator('.rx-panel [data-control="hair"]').getAttribute('class')).toContain('is-changed');
  });
  await showControl(page, 'height');
  const h = page.locator('.rx-panel input[data-key="height"]');
  await h.focus();
  for (let i = 0; i < 5; i++) await h.press('ArrowRight');
  await settle(page);
  const it = await knightOf(page);
  expect(it.settings.params.hair).toBe(hair);
  expect(it.settings.params.outfit).toBe(outfit);
  expect(it.settings.params.height).toBeGreaterThan(0.5);
  // and B's panel follows A's change
  await expect.poll(async () => Number(await b.locator('.rx-panel input[data-key="height"]').inputValue())).toBeGreaterThan(0.5);
  await b.close();
});

test('Open its page from the bag shows the item with its own look, and a change keeps it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/' + BAG_LINK.replace(/^#\//, ''));
  const before = await knightOf(page);
  expect(before.settings.look).toBeTruthy();
  await page.locator('.bag-item', { has: page.locator('[aria-label="Open the page of Hero"], [aria-label^="Open the page of"]') }).first()
    .locator('a.bag-act').click();
  await waitForDrawn(page);
  await openTab(page, 'look');
  await expect(page.locator(`.rx-panel .looks .vbtn[data-look="${before.settings.look}"]`)).toHaveAttribute('aria-pressed', 'true');
  await pickColour(page, 'skin', 2);
  await settle(page);
  expect((await knightOf(page)).settings.look).toBe(before.settings.look);
});

test('browser Back to the asset page shows the item as it is in the bag now', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/sprite/knight');
  await pickColour(page, 'outfit', 3);
  await settle(page);
  await page.locator('header a.bag-link').click();
  await page.locator('.bag-item .bag-open').first().click();
  const hair = await pickColour(page, 'hair', 4);
  await settle(page);
  // (Back may first close the bag's panel; then it returns to the sprite page)
  for (let i = 0; i < 3 && !page.url().includes('#/sprite/'); i++) { await page.goBack(); await page.waitForTimeout(300); }
  expect(page.url()).toContain('#/sprite/knight');
  await waitForDrawn(page);
  await showControl(page, 'hair');
  await expect(swatch(page, 'hair', hair)).toHaveAttribute('aria-pressed', 'true');
  await showControl(page, 'height');
  await page.locator('.rx-panel input[data-key="height"]').focus();
  await page.keyboard.press('ArrowRight');
  await settle(page);
  expect((await knightOf(page)).settings.params.hair).toBe(hair);
});

test('the sound page keeps its version in the address after a slider moves, so a reload matches the bag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/' + BAG_LINK.replace(/^#\//, ''));
  const coin = (await stored(page)).items.find((it) => it.id === 'coin-pickup');
  expect(coin.settings.style).toBeTruthy();
  await openRoute(page, `/sound/coin-pickup?bag=${coin.key}`);
  const slider = page.locator('.rx-panel input[type="range"]').first();
  await showControl(page, await slider.getAttribute('data-key'));
  await slider.focus();
  for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  await page.waitForTimeout(900);
  expect(decodeURIComponent(page.url()).replace(/\+/g, ' ')).toContain(`style=${coin.settings.style}`);
  const count = (await savedState(page).textContent()).match(/(\d+) change/)[1];
  await page.reload();
  await waitForDrawn(page);
  expect(decodeURIComponent(page.url()).replace(/\+/g, ' ')).toContain(`style=${coin.settings.style}`);
  await expect(savedState(page)).toContainText(`${count} change`);
});

test('J13.2: with reduced motion the sprite page does not animate until Play is pressed', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:5199' });
  const page = await context.newPage();
  await openRoute(page, '/sprite/knight');
  const btn = page.locator('.stage-tools .icon-btn');
  await expect(btn).toHaveAttribute('aria-label', 'Play');
  const shot = () => page.locator('canvas.stage').evaluate((c) => c.toDataURL());
  const a = await shot(); await page.waitForTimeout(700); const b = await shot();
  expect(a === b, 'the picture stays still').toBe(true);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-label', 'Pause');
  await context.close();
});

for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
  test(`the footer says it is saved in the bag with the count, and what the pixel size is, at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openRoute(page, '/sprite/knight');
    await pickColour(page, 'outfit', 3);
    await settle(page);
    const saved = savedState(page);
    await expect(saved).toBeVisible();
    await expect(saved.locator('.saved-text')).toHaveText('Saved in your bag');
    await expect(saved.locator('.saved-text')).toBeVisible();
    await expect(saved.locator('small')).toBeVisible();
    await expect(saved.locator('small')).toHaveText('1 change');
    const lbl = page.locator('.rx-foot .size .lbl').first();
    await expect(lbl).toBeVisible();
    await expect(page.locator('.rx-foot .size')).toContainText('Pixel size');
    await expect(page.locator('.rx-foot .size')).toContainText('×');
    await page.locator('.rx-panel [data-act="startover"], .rx-panel button:has-text("Start over")').first().click();
    await settle(page);
    await expect(saved.locator('small')).toBeVisible();
    await expect(saved.locator('small')).toContainText(/0 changes|no changes/);
    // nothing in the footer is cut off or outside the panel
    const over = await page.locator('.rx-foot').evaluate((f) => [...f.querySelectorAll('*')].filter((n) => n.offsetParent && (n.scrollWidth > n.clientWidth + 1) && getComputedStyle(n).overflow !== 'visible').map((n) => n.className));
    expect(over).toEqual([]);
    const box = await page.locator('.rx-foot').boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(w + 1);
  });
}

test('the sound Look tab says what each look does at 1024x768, and the panel does not scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openRoute(page, '/sound/coin-pickup');
  await openTab(page, 'look');
  await expect(page.locator('.sound-looks .vbtn[data-look="frost"] .what')).toBeVisible();
  const pane = page.locator('.rx-panel [data-pane="look"]');
  const [sh, ch] = await pane.evaluate((n) => [n.scrollHeight, n.clientHeight]);
  expect(sh).toBeLessThanOrEqual(ch + 1);
});

test('J9.2 / J1.2: changes that are not in the bag say so plainly, with the way to add them', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/sprite/knight?hairStyle=spiky&height=0.9');
  await expect(savedState(page)).toContainText('Not in your bag yet');
  await expect(page.locator('.rx-foot .add-btn')).toBeVisible();
});

test('J7.4: music in a look plays live, so a slider moved while it plays is heard at once', async ({ page }) => {
  await page.addInitScript(() => {
    window.__sent = [];
    const post = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function (m, ...rest) { if (m && m.type) window.__sent.push({ type: m.type, id: m.id, t: performance.now() }); return post.call(this, m, ...rest); };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/music/battle-theme');
  const play = page.locator('.play-big');
  await play.click();
  await expect(play).toHaveAttribute('title', 'Stop', { timeout: 8000 });
  await openTab(page, 'look');
  const t0 = Date.now();
  await page.locator('.sound-looks .vbtn[data-look="night"]').click();
  await expect(play).toHaveAttribute('title', 'Stop', { timeout: 1500 });
  expect(Date.now() - t0).toBeLessThan(1500);
  const n0 = await page.evaluate(() => window.__sent.filter((m) => m.type === 'param').length);
  // (a smooth slider: Night itself sets the intensity, and the key moves in whole steps)
  const slider = page.locator('.rx-panel input[data-key="bright"]');
  await showControl(page, 'bright');
  await slider.focus();
  for (let i = 0; i < 4; i++) await slider.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__sent.filter((m) => m.type === 'param').length), { timeout: 1000 }).toBeGreaterThan(n0);
  await play.click();
});
