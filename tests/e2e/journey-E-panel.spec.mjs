// Second fix wave, builder E: a shared bag keeps every version (J9.1, R2, R3), the panel's footer (J3.2, J4.2, J9.2, J12),
// status lines that go when they no longer apply, the one-row version strip, and the bag rows (docs/user-journeys.md).
import fs from 'node:fs';
import { test, expect, openRoute, hasHorizontalScroll, savedState, showControl, openTab } from '../helpers/test.mjs';

const LINK = fs.readFileSync(new URL('../fixtures/journeys/bag-link.txt', import.meta.url), 'utf8').trim();
const MARK = 'rgb(242, 107, 29)';      // the orange change dot (--mark)
const items = (page) => page.locator('.bag-item');
const side = (page) => page.locator('.bag-side');
const row = (page, name) => items(page).filter({ has: page.locator('.bag-name', { hasText: new RegExp(`^${name}$`) }) });
const settle = (page) => page.waitForTimeout(400);

async function openReadyBag(page) {
  await page.goto(`/index.html${LINK}`, { waitUntil: 'domcontentloaded' });
  await expect(items(page)).toHaveCount(3);
  await expect(page.locator('.bag-pic.pending')).toHaveCount(0);
}
/** Each row as the creator reads it: its name, what was changed, how many changes. */
const rowsOf = (page) => items(page).evaluateAll((list) => list.map((li) => ({
  name: li.querySelector('.bag-name')?.textContent,
  said: li.querySelector('.bag-text .hint')?.textContent,
  count: li.querySelector('.bag-changes')?.textContent ?? '',
})));
const dotColour = (loc) => loc.locator('.dot').first().evaluate((d) => getComputedStyle(d).backgroundColor);
const blockStorage = (ctx) => ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });

test('J9.1: a copied bag link opens as the same bag: the same rows, words and counts, and the same panel counts', async ({ browser }) => {
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await a.grantPermissions(['clipboard-read', 'clipboard-write']);
  const src = await a.newPage();
  await openReadyBag(src);
  const before = await rowsOf(src);
  expect(before.find((r) => r.name === 'Coin pickup').count).toMatch(/[2-9] changes/);
  await src.getByRole('button', { name: 'Copy link to this bag' }).click();
  await expect(src.locator('.bag-link-note')).toContainText('Link copied');
  const url = await src.evaluate(() => navigator.clipboard.readText());
  const counts = {};
  for (const name of ['Coin pickup', 'Battle theme']) {
    await row(src, name).locator('.bag-open').click();
    counts[name] = await side(src).locator('.rx-foot .saved small').innerText();
  }
  await a.close();

  const b = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await b.newPage();
  await page.goto(url.replace(/^https?:\/\/[^/]+/, ''), { waitUntil: 'domcontentloaded' });
  await expect(items(page)).toHaveCount(3);
  await expect(page.locator('.bag-pic.pending')).toHaveCount(0);
  expect(await rowsOf(page)).toEqual(before);
  for (const name of ['Coin pickup', 'Battle theme']) {
    await row(page, name).locator('.bag-open').click();
    await expect(side(page).locator('.rx-foot .saved small')).toHaveText(counts[name]);
  }
  // and the stored item is the whole of it: the version's settings, not the plain defaults
  const coin = await page.evaluate(async () => (await import('/app/bag.js')).bag.items().find((i) => i.id === 'coin-pickup').settings);
  expect(coin.style).toBe('Dull token');
  expect(coin.params.pitch).toBe(620);
  await b.close();
});

test('choosing a pixel size alone does not put an unchanged asset in the bag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/sprite/knight');
  await page.locator('.rx-foot .seg button[data-px="2"]').click();
  await settle(page);
  expect(await page.evaluate(async () => (await import('/app/bag.js')).bag.count())).toBe(0);
  await expect(page.locator('.rx-foot .add-btn')).toBeVisible();
  await page.locator('.rx-foot .add-btn').click();
  expect(await page.evaluate(async () => (await import('/app/bag.js')).bag.count())).toBe(1);
});

test('after Start over the footer says 0 changes, with the grey dot, on the asset page and in the bag', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/sprite/knight');
  await showControl(page, 'outfit');
  await page.locator('.rx-panel [data-control="outfit"] .swatch[data-v]').nth(3).click();
  await settle(page);
  expect(await dotColour(savedState(page))).toBe(MARK);
  await page.getByRole('button', { name: 'Start over' }).click();
  await settle(page);
  await expect(savedState(page).locator('small')).toHaveText(/^0 changes/);
  expect(await dotColour(savedState(page))).not.toBe(MARK);

});

test('after Start over in the bag panel the footer says 0 changes, with the grey dot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  expect(await dotColour(savedState(page))).toBe(MARK);
  await side(page).locator('.rx-block').getByRole('button', { name: 'Start over' }).click();
  await expect(savedState(page)).toContainText(/In your bag\s*0 changes/);
  expect(await savedState(page).innerText()).not.toMatch(/no changes/);
  expect(await dotColour(savedState(page))).not.toBe(MARK);
});

test('changes not in the bag yet say how many', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/sprite/knight?hairStyle=spiky&height=0.9');
  await expect(savedState(page)).toContainText('Not in your bag yet');
  await expect(savedState(page).locator('small')).toHaveText('2 changes');
});

for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
  test(`a fresh asset page not in the bag says so in words at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openRoute(page, '/sprite/knight');
    await expect(savedState(page)).toBeVisible();
    await expect(savedState(page)).toContainText('Not in your bag yet');
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}

for (const [w, h] of [[1024, 768], [900, 700]]) {
  test(`the bag panel's pixel size has its label and its size at ${w}x${h}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await openReadyBag(page);
    await row(page, 'Hero').locator('.bag-open').click();
    const size = side(page).locator('.rx-foot .size');
    await expect(size.getByText('Pixel size')).toBeVisible();
    await expect(size.getByText('64 × 64')).toBeVisible();
    await expect(savedState(page).locator('small')).toBeVisible();
    await ctx.close();
  });
}

for (const [w, h] of [[900, 700], [390, 844], [1024, 768], [1440, 900]]) {
  test(`with storage blocked the footer warning and Copy link fit at ${w}x${h}, from the start`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await blockStorage(ctx);
    const page = await ctx.newPage();
    await openRoute(page, '/sprite/knight');
    const foot = page.locator('.rx-panel .rx-foot');
    // before the first change: it says this visit only, and the page is not pushed down by a banner
    await expect(savedState(page)).toContainText(/this visit/i);
    const at = () => page.locator('main.rx').evaluate((n) => n.getBoundingClientRect().top + window.scrollY);
    const top0 = await at();
    await showControl(page, 'outfit');
    await page.locator('.rx-panel [data-control="outfit"] .swatch[data-v]').nth(3).click();
    await settle(page);
    await expect(foot.getByRole('button', { name: 'Copy link' })).toBeVisible();
    expect(await at(), 'the page is not pushed down').toBe(top0);
    expect(await hasHorizontalScroll(page)).toBe(false);
    // nothing in the footer overlaps anything else in it, and nothing goes past the panel's edge
    const boxes = await foot.evaluate((f) => [...f.querySelectorAll(':scope > *, :scope .saved > *')].filter((n) => n.getClientRects().length && n.getBoundingClientRect().width > 0 && !n.classList.contains('menu')).map((n) => { const r = n.getBoundingClientRect(); return { c: n.className || n.tagName, l: r.left, r: r.right, t: r.top, b: r.bottom, top: n.parentElement === f }; }));
    const tops = boxes.filter((x) => x.top);
    for (let i = 0; i < tops.length; i++) for (let j = i + 1; j < tops.length; j++) {
      const A = tops[i], B = tops[j];
      const meet = A.l < B.r - 0.5 && B.l < A.r - 0.5 && A.t < B.b - 0.5 && B.t < A.b - 0.5;
      expect(meet, `${A.c} and ${B.c} overlap`).toBe(false);
    }
    for (const x of boxes) expect(x.r, `${x.c} is inside the window`).toBeLessThanOrEqual(w + 0.5);
    const text = foot.locator('.saved-text');
    expect(await text.evaluate((n) => n.scrollWidth <= n.clientWidth + 1), 'the warning is not cut').toBe(true);
    if (w > 720) {
      for (const tab of ['colours', 'parts', 'shape']) {
        await openTab(page, tab);
        const [sh, ch] = await page.locator(`.rx-panel [data-pane="${tab}"]`).evaluate((n) => [n.scrollHeight, n.clientHeight]);
        expect(sh, `${tab} does not scroll inside itself`).toBeLessThanOrEqual(ch + 1);
      }
    }
    await page.screenshot({ path: `${process.env.SHOTS ?? 'test-results'}/blocked-${w}.png` }).catch(() => {});
    await ctx.close();
  });
}

test('status lines in the bag go when they no longer apply', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  await openReadyBag(page);
  await expect(page.locator('.bag-link-note')).toContainText('Opened a shared bag');
  await page.getByRole('button', { name: 'Copy link to this bag' }).click();
  await expect(page.locator('.bag-link-note')).toContainText('Link copied');
  await row(page, 'Coin pickup').getByRole('button', { name: /^Remove/ }).click();
  await expect(page.locator('.bag-link-note')).toBeHidden();
  for (const name of ['Hero', 'Battle theme']) await row(page, name).getByRole('button', { name: /^Remove/ }).click();
  await expect(page.locator('main')).not.toContainText('Link copied');
  await expect(page.locator('main')).not.toContainText('Opened a shared bag');
  await ctx.close();
});

test('the one-row version strip shows it goes on: end room, its arrows, and no stray full stop in its caption', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  const strip = side(page).locator('.vstrip');
  await expect.poll(() => strip.locator('.vbtn').count()).toBeGreaterThan(6);
  const hint = side(page).locator('.block-head .hint');
  await expect(hint).toContainText('Royal');
  expect(await hint.innerText()).not.toMatch(/Royal\./);
  // the row is wider than its room: the arrows say so, and the last tile ends inside the strip when scrolled to the end
  await expect(side(page).getByRole('button', { name: 'More versions' })).toBeVisible();
  await strip.evaluate((n) => { n.scrollLeft = n.scrollWidth; });
  const [last, box] = await Promise.all([strip.locator('.vbtn').last().boundingBox(), strip.boundingBox()]);
  expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width - 4);
  // a sound's chips too
  await row(page, 'Coin pickup').locator('.bag-open').click();
  const s2 = side(page).locator('.vstrip');
  await expect.poll(() => s2.locator('.vbtn').count()).toBeGreaterThan(2);
  expect(await side(page).locator('.block-head .hint').innerText()).not.toMatch(/\.\s*$/);
  await s2.evaluate((n) => { n.scrollLeft = n.scrollWidth; });
  const [l2, b2] = await Promise.all([s2.locator('.vbtn').last().boundingBox(), s2.boundingBox()]);
  expect(l2.x + l2.width).toBeLessThanOrEqual(b2.x + b2.width - 4);
});

test('after Start over a bag row has no empty line where the count was', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openReadyBag(page);
  await row(page, 'Hero').locator('.bag-open').click();
  await side(page).locator('.rx-block').getByRole('button', { name: 'Start over' }).click();
  await settle(page);
  const facts = row(page, 'Hero').locator('.bag-facts');
  const gap = await facts.evaluate((f) => {
    const kids = [...f.children].filter((k) => k.getBoundingClientRect().height > 0);
    return { kids: kids.length, h: f.getBoundingClientRect().height, child: kids[0]?.getBoundingClientRect().height ?? 0 };
  });
  expect(gap.h).toBeLessThanOrEqual(gap.child + 2);
  // and nothing empty sits between the words and the facts
  const between = await row(page, 'Hero').evaluate((li) => {
    const t = li.querySelector('.bag-text').getBoundingClientRect(), f = li.querySelector('.bag-facts').getBoundingClientRect();
    return f.top - t.bottom;
  });
  expect(between).toBeLessThanOrEqual(10);
});

for (const [w, h] of [[1024, 768], [900, 700]]) {
  test(`the one-row sideways chips rule stays on the asset page; the bag panel's chips wrap at ${w}x${h}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await openReadyBag(page);
    await row(page, 'Hero').locator('.bag-open').click();
    const chips = side(page).locator('.ctl .chips').first();
    await expect(chips).toBeAttached();
    expect(await chips.evaluate((n) => getComputedStyle(n).flexWrap)).toBe('wrap');
    await ctx.close();
  });
}

test('music in the Night look: the page says the look sets Intensity, near that slider', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, '/music/battle-theme');
  const row = page.locator('.rx-panel [data-control="intensity"]');
  await showControl(page, 'intensity');
  await expect(row.locator('.ctl-note')).toBeHidden();
  await openTab(page, 'look');
  await page.locator('.rx-panel .sound-looks .vbtn[data-look="night"]').click();
  await showControl(page, 'intensity');
  await expect(row.locator('.ctl-note')).toBeVisible();
  await expect(row.locator('.ctl-note')).toContainText(/Night look sets/i);
});
