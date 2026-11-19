// The asset page (docs/site-design.md, section 5): two columns that fill the window, and nothing on the page scrolls
// at 1440x900, 1024x768 and 900x700, whichever tab of the panel is open. On a phone the picture stays pinned at the
// top and the panel scrolls under it. Run on sprites with many controls, one of each kind that is laid out its own
// way (a background, a tileset, an interface piece), a sound and a track.
// Run with: npx playwright test tests/e2e/asset-layout.spec.mjs
import { test, expect, openRoute, openTab, hasHorizontalScroll, downloadButton } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';

const C = catalogueOf(readCatalogue());
const ofType = (type) => C.sprites.find((a) => a.type === type)?.id;
const BUSY = ['knight', 'wizard', 'ember-wyrm'].filter((id) => C.byId[id]?.kind === 'sprite');
const SPRITES = [...new Set([...(BUSY.length ? BUSY : C.sprites.slice().sort((a, b) => b.tech.controls - a.tech.controls).slice(0, 3).map((a) => a.id)), ...['background', 'tileset', 'ui'].map(ofType).filter(Boolean)])];
const SOUND = (C.byId['coin-pickup'] ?? C.sounds[0]).id;
const TRACK = (C.byId['battle-theme'] ?? C.music[0]).id;
const ROUTES = [...SPRITES.map((id) => `/sprite/${id}`), `/sound/${SOUND}`, `/music/${TRACK}`];
const HERO = SPRITES[0];

/** What the window shows: whether the page scrolls, and where the pieces of the two columns are. */
const measure = (page) => page.evaluate(() => {
  const box = (sel) => { const n = document.querySelector(sel); if (!n) return null; const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height, width: r.width }; };
  const pane = document.querySelector('.rx-panel .pane:not([hidden])');
  return {
    page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], win: [innerWidth, innerHeight],
    head: box('.rx-head'), stage: box('.stage-card'), left: box('.rx-stage'), panel: box('.rx-panel'), foot: box('.rx-foot'), download: box('.rx-panel [data-act="download"]'),
    under: [...document.querySelectorAll('.rx-stage > .clips, .rx-stage > .strip, .rx-stage > .sound-under')].map((n) => n.getBoundingClientRect().bottom),
    pane: pane ? { scroll: pane.scrollHeight, client: pane.clientHeight, overflow: getComputedStyle(pane).overflowY } : null,
  };
});
const tabIds = (page) => page.locator('.rx-panel [role="tab"]:not([hidden])').evaluateAll((ts) => ts.map((t) => t.dataset.tab));

for (const [w, h] of [[1440, 900], [1024, 768], [900, 700]]) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const route of ROUTES) {
      test(`${route} fills the window and the page does not scroll, in every tab`, async ({ page }) => {
        await openRoute(page, route);
        await expect(page.locator('main.v2.rx')).toBeVisible();
        const tabs = await tabIds(page);
        expect(tabs.length).toBeGreaterThanOrEqual(2);
        for (const tab of tabs) {
          await openTab(page, tab);
          const m = await measure(page);
          expect(m.page, `${tab}: the page is the size of the window`).toEqual(m.win);
          // two columns, side by side, each to the bottom of the window
          expect(m.left.right).toBeLessThanOrEqual(m.panel.left + 1);
          expect(Math.round(m.left.bottom), `${tab}: the left column ends at the window's edge`).toBe(h);
          expect(Math.round(m.panel.bottom)).toBeLessThanOrEqual(h);
          // left: the name over the picture, the picture a good size, what is under it still in the window
          expect(m.head.bottom).toBeLessThanOrEqual(m.stage.top);
          expect(m.stage.height, `${tab}: the picture has room`).toBeGreaterThanOrEqual(160);
          for (const bottom of m.under) expect(bottom).toBeLessThanOrEqual(h);
          for (const bottom of m.under) expect(bottom).toBeGreaterThanOrEqual(m.stage.bottom);
          // right: the footer and its Download in the window, the open tab above it; a tab that is longer than its
          // room scrolls inside itself, never the page
          expect(m.download.bottom).toBeLessThanOrEqual(h);
          expect(m.foot.top).toBeGreaterThan(m.panel.top + 200);
          if (m.pane.scroll > m.pane.client + 1) expect(m.pane.overflow).toBe('auto');
          // the sprites with the most controls: every tab fits its panel, nothing in it is cut or needs a scroll
          if (BUSY.some((id) => route === `/sprite/${id}`)) expect(m.pane.scroll, `${tab}: the whole tab is in sight`).toBeLessThanOrEqual(m.pane.client + 1);
          expect(m.pane.client, `${tab}: the tab has room for a few controls`).toBeGreaterThanOrEqual(140);
        }
        // the frames under the animations are all inside the left column: none is cut at its edge
        const cut = await page.evaluate(() => { const col = document.querySelector('.rx-stage').getBoundingClientRect(); return [...document.querySelectorAll('.strip .cell')].filter((c) => { const r = c.getBoundingClientRect(); return r.right > col.right - 8 || r.bottom > innerHeight; }).length; });
        expect(cut, 'frame tiles cut at the edge').toBe(0);
        await expect(downloadButton(page)).toBeInViewport({ ratio: 1 });
        expect(await page.evaluate(() => scrollY)).toBe(0);
      });
    }

    test('the version tiles stay readable: every picture at its own size or larger, the same scale on every tile', async ({ page }) => {
      await openRoute(page, `/sprite/${HERO}`);
      const tiles = page.locator('.rx-panel .vstrip .vbtn');
      await expect(tiles).toHaveCount(12);
      const scales = await page.locator('.rx-panel .vstrip .vpic canvas').evaluateAll((cvs) => cvs.map((cv) => ({ k: cv.getBoundingClientRect().width / cv.width, h: cv.getBoundingClientRect().height, tile: cv.parentElement.getBoundingClientRect().height })));
      expect(scales).toHaveLength(12);
      expect(new Set(scales.map((s) => s.k)).size, 'one scale for all twelve').toBe(1);
      expect(Number.isInteger(scales[0].k) && scales[0].k >= 1, `a whole-number scale (${scales[0].k})`).toBe(true);
      for (const s of scales) { expect(s.h).toBeGreaterThanOrEqual(40); expect(s.h).toBeLessThanOrEqual(s.tile); }
      // each tile is wide enough to press and to tell from its neighbour, and its picture fills it: at twice its size
      // the picture would no longer fit
      const widths = await tiles.evaluateAll((bs) => bs.map((b) => b.getBoundingClientRect().width));
      for (const width of widths) expect(width).toBeGreaterThanOrEqual(64);
      const room = await page.locator('.rx-panel .vstrip').evaluate((n) => { const cv = n.querySelector('canvas'), pic = cv.parentElement; return { w: pic.clientWidth - 8, most: parseFloat(getComputedStyle(n).getPropertyValue('--vmax')) - 8, cw: cv.width, ch: cv.height }; });
      expect((scales[0].k + 1) * room.cw > room.w || (scales[0].k + 1) * room.ch > room.most || scales[0].k === 4, 'the largest whole-number scale that fits').toBe(true);
      // a row wider than the panel says so: its last tile in sight is cut at the edge, and two arrows move it
      const strip = page.locator('.rx-panel .vstrip');
      const row = await strip.evaluate((n) => ({ over: n.scrollWidth > n.clientWidth + 1, right: n.getBoundingClientRect().right, tiles: [...n.children].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.right]; }) }));
      const arrows = page.locator('.rx-panel .vnav');
      if (row.over) {
        expect(row.tiles.some(([l, r]) => l < row.right - 16 && r > row.right + 16), 'a tile is cut at the edge').toBe(true);
        await expect(arrows).toBeVisible();
        await expect(arrows.getByRole('button', { name: 'Earlier versions' })).toBeDisabled();
        await arrows.getByRole('button', { name: 'More versions' }).click();
        await expect.poll(() => strip.evaluate((n) => n.scrollLeft)).toBeGreaterThan(100);
        await expect(arrows.getByRole('button', { name: 'Earlier versions' })).toBeEnabled();
        await arrows.getByRole('button', { name: 'More versions' }).click();
        await expect(tiles.last()).toBeInViewport({ ratio: 1 });
        // an ordinary mouse wheel over the row moves it too
        await strip.hover();
        await page.mouse.wheel(0, -2000);
        await expect.poll(() => strip.evaluate((n) => n.scrollLeft)).toBe(0);
      } else await expect(arrows).toBeHidden();
      // the one on screen is named, whatever the window
      await tiles.nth(1).click();
      await expect(tiles.nth(1)).toHaveAttribute('aria-pressed', 'true');
      // (a panel too narrow for the name beside the arrows drops it whole, never half of it)
      const name = page.locator('.rx-panel .block-head .hint-name');
      await expect(name).toContainText(await tiles.nth(1).getAttribute('title'));
      if (await name.isVisible()) expect(await name.evaluate((n) => n.parentElement.scrollWidth <= n.parentElement.clientWidth + 1), 'the name is not cut').toBe(true);
      else expect(w).toBeLessThan(1000);
    });

    test('the footer is tidy: nothing in it wraps, overlaps or is cut off', async ({ page }) => {
      // (the status words may sit on a line of their own above the buttons in a narrow panel, so they can be read:
      // journey J3.2 / J9.2; each piece is still one line, and no two pieces overlap)
      await openRoute(page, `/sprite/${HERO}`);
      const rows = async () => page.locator('.rx-foot > *').evaluateAll((ns) => ns.filter((n) => n.getBoundingClientRect().width > 0).map((n) => { const r = n.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, cut: n.scrollWidth > n.clientWidth + 1 }; }));
      for (const step of ['as it opens', 'after a change']) {
        const boxes = await rows();
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          const apart = b.l >= a.r - 0.5 || a.l >= b.r - 0.5 || b.t >= a.b - 0.5 || a.t >= b.b - 0.5;
          expect(apart, `${step}: no overlap`).toBe(true);
        }
        for (const b of boxes) expect(b.h, `${step}: one line`).toBeLessThanOrEqual(44);
        for (const b of boxes) expect(b.cut, `${step}: nothing cut off`).toBe(false);
        await page.getByRole('button', { name: 'Surprise me' }).click();
        await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
      }
    });
  });
}

test('a tileset or a prop opens plain; a character opens in your bag', async ({ page }) => {
  const pressed = () => page.locator('.stage-tools .seg button[aria-pressed="true"]');
  await openRoute(page, `/sprite/${HERO}`);
  await expect(pressed()).toHaveText('In your bag');
  for (const type of ['tileset', 'prop']) {
    const id = C.sprites.find((a) => a.type === type && !String(a.role).startsWith('interface/'))?.id;
    if (!id) continue;
    await openRoute(page, `/sprite/${id}`);
    await expect(pressed(), id).toHaveText('Plain');
  }
});

test('"More like this" opens from the panel\'s menu over the left column, and closes again', async ({ page }) => {
  await openRoute(page, `/sprite/${HERO}`);
  const sheet = page.locator('.rx-more');
  await expect(sheet).toBeHidden();
  await page.locator('.rx-panel .menu-wrap > button').click();
  await page.getByRole('menuitem', { name: 'More like this' }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('heading', { name: 'More like this' })).toBeVisible();
  await expect.poll(() => sheet.locator('.card').count()).toBeGreaterThanOrEqual(1);
  await expect(sheet.locator(`a[href="#/sprite/${HERO}"]`)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test.describe('a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the picture stays pinned at the top while the panel scrolls under it', async ({ page }) => {
    await openRoute(page, `/sprite/${HERO}`);
    expect(await page.locator('.rx-stage').evaluate((n) => getComputedStyle(n).position)).toBe('sticky');
    for (const tab of await tabIds(page)) {
      await openTab(page, tab);
      // to the very end of the page: the picture is still whole, and under the header's place, not over the controls
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.locator('canvas.stage')).toBeInViewport({ ratio: 0.95 });
      const m = await measure(page);
      expect(m.stage.top).toBeGreaterThanOrEqual(0);
      expect(m.stage.height).toBeLessThan(320);
      expect(m.download.top, `${tab}: the download is under the picture`).toBeGreaterThan(m.left.bottom - 1);
      expect(await hasHorizontalScroll(page)).toBe(false);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await expect(downloadButton(page)).toBeVisible();
  });

  for (const route of [`/sound/${SOUND}`, `/music/${TRACK}`]) {
    test(`${route}: the play button stays pinned, nothing scrolls sideways`, async ({ page }) => {
      await openRoute(page, route);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expect(page.locator('.play-big')).toBeInViewport({ ratio: 1 });
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  }
});
