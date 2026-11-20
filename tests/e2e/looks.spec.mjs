// Whole-bundle looks keep a thing what it is (docs/architecture.md, Contract 7), as a visitor meets it:
//   - the "Also change shapes" switch says, right next to it, what it does;
//   - under every named look that has a colour set, a sky on the bundle page is still a sky;
//   - a download made under a look that changes shapes lists the settings every sprite was really drawn with;
//   - adding a bundle to a bag that already has a look of its own asks, and can keep that look;
//   - the bag says which sprites the look changed;
//   - the bag keeps what its look made of each sprite, and draws and downloads that, also after the rule changes;
//   - following the download's own note on how to make a picture again gives the very same picture.
// Bundles, sprites and looks are taken from the catalogue and the site's own list of looks: none is named here.
// Run with: npx playwright test tests/e2e/looks.spec.mjs
import { test, expect as baseExpect, openRoute, waitForDrawn, downloadFrom } from '../helpers/test.mjs';
import { readCatalogue, packageOf } from '../helpers/acceptance.mjs';
import { THEME_PRESETS, normalizeTheme, defaultTheme, spriteMaterials, spriteLook, shapeRecord, isOneColourLook } from '../../engine/theme.js';
import { themeFromQuery } from '../../app/theme-controls.js';
import { librarySprites } from '../helpers/library.mjs';

const expect = baseExpect.configure({ timeout: 20_000 });
test.use({ reducedMotion: 'reduce', actionTimeout: 30_000 });

const CATALOGUE = readCatalogue();
// every library sprite that loads, a code file or a data file (one another builder has half-written is left out, not thrown)
const SPRITES = Object.fromEntries((await librarySprites()).sprites.map((s) => [s.def.id, s.def]));
const size = (b) => b.sprites.length + b.sounds.length + b.music.length;
/** The quickest bundle to download that has a sprite: no music if there is one without, then the fewest things. */
const SMALL = CATALOGUE.bundles.filter((b) => b.sprites.length && b.sprites.every((id) => SPRITES[id])).sort((a, b) => a.music.length - b.music.length || size(a) - size(b))[0];
const NAMED = THEME_PRESETS.filter((p) => JSON.stringify(p.theme.colour) !== JSON.stringify(defaultTheme().colour));
/** Named looks that bring a colour set of several colours: the ones that used to repaint a sky in whatever the set had. */
const SETS = NAMED.filter((p) => typeof p.theme.colour.palette === 'string' && !isOneColourLook(p.theme.colour));

const bagCount = (page) => page.locator('header .bag-count');
const bagTheme = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.theme());
const lookOf = (t) => { const x = normalizeTheme(t); return { colour: x.colour, sound: x.sound, music: x.music }; };
async function settled(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector('main.bundle-page');
    if (!main || !main.dataset.look) return false;
    const cvs = [...main.querySelectorAll('canvas.bundle-sprite-pic')].filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    return cvs.every((c) => c.dataset.look === main.dataset.look || c.closest('.broken'));
  }, null, { timeout: 60_000 });
}
async function openBundle(page, id, query = '') {
  // the kit's scene and its look come first on the page, so the window is made tall: every picture is then on screen and drawn
  await page.setViewportSize({ width: page.viewportSize().width, height: Math.max(page.viewportSize().height, 5600) });
  await openRoute(page, `/bundle/${id}${query}`);
  await settled(page);
}

test('the catalogue has a bundle with a sprite, and the site has named looks with colour sets', () => {
  expect(SMALL, 'a bundle with at least one sprite').toBeTruthy();
  expect(NAMED.length).toBeGreaterThanOrEqual(2);
  expect(SETS.length).toBeGreaterThanOrEqual(1);
});

test('"Also change shapes" says in one sentence, next to the switch, what it does: on a bundle page and in the bag', async ({ page }) => {
  for (const route of [`/bundle/${SMALL.id}`, '/bag']) {
    await openRoute(page, route);
    if (route === '/bag') {          // the bag shows its look controls once it holds something
      await openBundle(page, SMALL.id);
      await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
      await openRoute(page, '/bag');
    }
    const toggle = page.getByRole('switch', { name: 'Also change shapes' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleDescription(/nothing is taken away or swapped/i);
    const hint = page.locator('.look-shapes-hint');
    await expect(hint).toBeVisible();
    const said = (await hint.textContent()).trim();
    expect(said.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length, `one sentence: "${said}"`).toBe(1);
    expect(said.length).toBeLessThan(200);
    expect(said).not.toMatch(/param|seed|theme|variant|toggle|slider/i);
    // next to the option: within a short way under the switch, inside the same block of controls
    const a = await toggle.boundingBox(), b = await hint.boundingBox();
    expect(b.y - (a.y + a.height), 'the sentence sits right under the switch').toBeLessThan(80);
  }
});

test('under every named look with a colour set, a sky on the bundle page is still a sky', async ({ page }) => {
  // a sprite of some bundle that is mostly sky: found from the sprites themselves
  let pick = null;
  for (const b of CATALOGUE.bundles) {
    for (const id of b.sprites) {
      const s = SPRITES[id];
      if (!s) continue;
      const table = spriteMaterials(s, {});
      const sky = [...table.colours].filter(([, e]) => e.material === 'sky').map(([v, e]) => ({ v, n: e.n }));
      if (sky.reduce((sum, c) => sum + c.n, 0) >= table.total * 0.2) { pick = { bundle: b.id, id, colours: sky.map((c) => c.v) }; break; }
    }
    if (pick) break;
  }
  test.skip(!pick, 'no bundle has a sprite that is mostly sky');
  test.setTimeout(180_000);
  await openBundle(page, pick.bundle);
  const canvas = page.locator(`canvas.bundle-sprite-pic[data-id="${pick.id}"]`);
  await canvas.scrollIntoViewIfNeeded();
  await settled(page);
  const read = () => canvas.evaluate((cv) => Array.from(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data));
  const made = await read();
  const isSky = new Set(pick.colours);
  const at = [];
  for (let i = 0; i < made.length; i += 4) if (made[i + 3] && isSky.has((made[i] << 16) | (made[i + 1] << 8) | made[i + 2])) at.push(i);
  expect(at.length, 'sky pixels in the picture as made').toBeGreaterThan(50);
  for (const look of SETS) {
    await page.getByRole('button', { name: look.name, exact: true }).click();
    await expect(canvas).toHaveAttribute('data-look', `look=${look.id}`);
    const now = await read();
    const turned = await page.evaluate(async ({ before, after, places }) => {
      const { oklch, hueTurn } = await import('/engine/materials.js');
      let far = 0, grey = 0, counted = 0;
      for (const i of places) {
        const a = oklch(before[i], before[i + 1], before[i + 2]), b = oklch(after[i], after[i + 1], after[i + 2]);
        if (a.C < 0.05) continue;                 // a cloud has no hue to keep
        counted++;
        if (b.C < a.C * 0.35) grey++; else if (Math.abs(hueTurn(a.h, b.h)) > 45) far++;
      }
      return { far, grey, counted };
    }, { before: made, after: now, places: at });
    expect(turned.counted).toBeGreaterThan(20);
    expect(turned.far, `${look.name}: sky pixels of ${pick.id} whose hue turned more than 45 degrees`).toBe(0);
    expect(turned.grey, `${look.name}: sky pixels of ${pick.id} that lost their colour`).toBe(0);
    expect(now, `${look.name} did change the picture`).not.toEqual(made);
  }
});

test('a download under a look that changes shapes lists the settings each sprite was really drawn with', async ({ page }) => {
  test.setTimeout(240_000);
  const query = { surprise: '7', shapes: '1' };
  const theme = themeFromQuery(query);
  await openBundle(page, SMALL.id, '?surprise=7&shapes=1');
  await expect(page.getByRole('switch', { name: 'Also change shapes' })).toBeChecked();
  const zip = packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download this kit' }).click(), { timeout: 180_000 }));
  const record = zip.json('manifest.json');
  expect(record.theme.shapes).toBe(true);
  expect(typeof record.settingsUsed, 'the list says how to read the settings').toBe('string');
  expect(record.settingsUsed).not.toMatch(/themedParams|applyColour/);
  let changed = 0;
  for (const id of SMALL.sprites) {
    const entry = record.assets.find((a) => a.kind === 'sprite' && a.id === id);
    expect(entry, `${id} is listed`).toBeTruthy();
    const sprite = SPRITES[id], used = spriteLook(sprite, {}, theme);
    expect(Object.keys(entry.settings.params), `${id}: every control is on record`).toEqual(Object.keys(sprite.params));
    expect(entry.settings.params, `${id}: the settings on record are the ones drawn`).toEqual(used.params);
    expect(entry.changedByLook).toEqual(used.changed);
    changed += entry.changedByLook.length;
    // the sheet's own list agrees
    expect(zip.json(entry.animations).params, `${id}: the sheet's list agrees`).toEqual(used.params);
    // nothing was taken off, put on or swapped, and no colour was touched
    for (const key of entry.changedByLook) expect(sprite.params[key].kind === 'range' || sprite.params[key].look === 'vary', `${id}: the look changed "${sprite.params[key].label}"`).toBe(true);
  }
  expect(changed, 'the look did change some settings').toBeGreaterThan(0);

  // the list says how to make the same picture again, and doing just that gives the very same picture: the recorded
  // settings, then each colour held to what it is of (not theme.colour applied alike to every pixel)
  expect(record.settingsUsed).toMatch(/renderThemedFrame/);
  expect(record.settingsUsed).toMatch(/what it is/);
  for (const entry of record.assets.filter((a) => a.kind === 'sprite' && a.sheet)) {
    const sheet = zip.json(entry.animations);
    const [clip, anim] = Object.entries(sheet.animations)[0];
    const png = Buffer.from(zip.file(entry.sheet).data).toString('base64');
    const same = await page.evaluate(async ({ png, id, clip, row, fw, fh, params, theme }) => {
      const { renderThemedFrame } = await import('/engine/theme.js');
      const sprite = await (async () => { const C = await import('/app/catalog.js'); await C.loadCatalog(); return C.loadSprite(id); })();   // a code file or a data file (P1)
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(png), (c) => c.charCodeAt(0))], { type: 'image/png' }));
      const cv = new OffscreenCanvas(fw, fh), g = cv.getContext('2d');
      g.drawImage(bmp, 0, row * fh, fw, fh, 0, 0, fw, fh);
      const got = g.getImageData(0, 0, fw, fh).data;
      const want = renderThemedFrame(sprite, clip, 0, params, { ...theme, shapes: false }).bytes();
      let differ = 0;
      for (let i = 0; i < got.length; i += 4) if (got[i + 3] !== want[i + 3] || (want[i + 3] && (got[i] !== want[i] || got[i + 1] !== want[i + 1] || got[i + 2] !== want[i + 2]))) differ++;
      return differ;
    }, { png, id: entry.id, clip, row: anim.row, fw: sheet.frameWidth, fh: sheet.frameHeight, params: entry.settings.params, theme: record.theme });
    expect(same, `${entry.id}: pixels of the first frame that differ from the picture made again as the list says`).toBe(0);
  }

  // with no look, the list is as it always was: only what the visitor set
  await page.locator('.bundle-look').getByRole('button', { name: 'Start over' }).click();
  await settled(page);
  const plain = packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download this kit' }).click(), { timeout: 180_000 })).json('manifest.json');
  expect(plain.settingsUsed).toBeUndefined();
  for (const a of plain.assets.filter((x) => x.kind === 'sprite')) { expect(a.changedByLook).toBeUndefined(); expect(a.settings.params).toEqual({}); }
});

test('adding a bundle to a bag that has a look of its own never changes the bag\'s look unasked, and offers the look shown', async ({ page }) => {
  // J6.4: no Add/Replace question any more. The bag keeps its look; a look made on the page is offered to the whole bag.
  const [first, second] = NAMED;
  const n = new Set([...SMALL.sprites.map((id) => 's' + id), ...SMALL.sounds.map((id) => 'a' + id), ...SMALL.music.map((id) => 'm' + id)]).size;
  await openBundle(page, SMALL.id);
  await page.getByRole('button', { name: first.name, exact: true }).click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(bagCount(page)).toHaveText(String(n));
  expect(lookOf(await bagTheme(page)), 'an empty bag takes the look shown').toEqual(lookOf(first.theme));

  // another named look on the page: the bag's own look is not lost, and nothing is asked or added twice
  const status = page.locator('.bundle-actions .status');
  const offer = page.getByRole('button', { name: 'Give my whole bag this look' });
  await page.getByRole('button', { name: second.name, exact: true }).click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(page.locator('.bundle-ask')).toHaveCount(0);
  await expect(status).toContainText('already in your bag');
  await expect(bagCount(page)).toHaveText(String(n));      // the kit is in the bag already: nothing is added twice
  expect(lookOf(await bagTheme(page)), 'the bag kept its look').toEqual(lookOf(first.theme));

  // a look made on the page: the bag keeps its look, and the page offers to give the whole bag the look shown
  await page.locator('.bundle-look .look-surprise').click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(status).toContainText('the look your bag already has');
  await expect(bagCount(page)).toHaveText(String(n));
  expect(lookOf(await bagTheme(page)), 'nothing changes the bag\'s look by itself').toEqual(lookOf(first.theme));
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(status).toContainText('Your whole bag now has this look');
  await expect(bagCount(page)).toHaveText(String(n));
  expect(lookOf(await bagTheme(page)), 'the offer gives the bag the look shown').not.toEqual(lookOf(first.theme));

  // the page and the bag now agree, and the kit is in the bag: there is nothing to offer
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(offer).toBeHidden();
  await expect(status).toContainText('already in your bag');
  await expect(bagCount(page)).toHaveText(String(n));
});

test('the bag says which sprites the look changed the shape of, and stops saying so when shapes are left alone', async ({ page }) => {
  test.setTimeout(120_000);
  const theme = themeFromQuery({ surprise: '7', shapes: '1' });
  const changed = SMALL.sprites.filter((id) => spriteLook(SPRITES[id], {}, theme).changed.length);
  test.skip(!changed.length, 'this look changes no sprite of the bundle');
  await openBundle(page, SMALL.id, '?surprise=7&shapes=1');
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await page.locator('.bundle-actions').getByRole('link', { name: 'Go to bag' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your bag');
  await expect(page.locator('.bag-item .bag-pic.pending')).toHaveCount(0, { timeout: 60_000 });
  const rows = page.locator('.bag-item', { hasText: 'shapes changed by the bag\'s look' });
  await expect(rows).toHaveCount(changed.length);
  // the row names what is different, in the controls' own words, not "Standard look"
  await expect(rows.first().locator('.hint').first()).not.toContainText('Standard look');
  await page.locator('.bag-look').getByRole('switch', { name: 'Also change shapes' }).uncheck({ force: true });
  await expect(page.locator('.bag-item', { hasText: 'shapes changed by the bag\'s look' })).toHaveCount(0);
  await waitForDrawn(page);
});

test('the bag keeps what its look made of each sprite, and draws and downloads that, also after the rule behind shapes changes', async ({ page }) => {
  test.setTimeout(240_000);
  const theme = themeFromQuery({ surprise: '7', shapes: '1' });
  // a sprite of the bundle whose slider the look moves (found in the catalogue)
  const pick = SMALL.sprites.map((id) => ({ id, rec: shapeRecord(SPRITES[id], {}, theme) }))
    .map((x) => ({ ...x, key: Object.keys(x.rec).find((k) => SPRITES[x.id].params[k].kind === 'range') })).find((x) => x.key);
  test.skip(!pick, 'the look moves no slider of the bundle');
  await openBundle(page, SMALL.id, '?surprise=7&shapes=1');
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  // recorded when it went in: what the look made of every sprite
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('loadout-bag-v1')));
  for (const id of SMALL.sprites) {
    const it = stored.items.find((i) => i.kind === 'sprite' && i.id === id);
    expect(it.settings.lookParams, `${id}: the bag recorded what the look made of it`).toEqual(shapeRecord(SPRITES[id], {}, theme));
  }
  // a bag kept from an earlier visit, whose rule put the slider somewhere this rule never would: at the end of its range
  const d = SPRITES[pick.id].params[pick.key];
  const earlier = d.max !== pick.rec[pick.key] ? d.max : d.min;
  for (const it of stored.items) if (it.id === pick.id) it.settings.lookParams = { ...it.settings.lookParams, [pick.key]: earlier };
  await page.evaluate((bag) => localStorage.setItem('loadout-bag-v1', JSON.stringify(bag)), stored);
  await openRoute(page, '/bag');
  await page.reload();
  await expect(page.locator('.bag-item .bag-pic.pending')).toHaveCount(0, { timeout: 60_000 });
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('loadout-bag-v1')));
  expect(kept.items.find((i) => i.id === pick.id).settings.lookParams[pick.key], 'opening the bag does not work the record out again').toBe(earlier);
  const zip = packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), { timeout: 180_000 }));
  const entry = zip.json('manifest.json').assets.find((a) => a.kind === 'sprite' && a.id === pick.id);
  expect(entry.settings.params[pick.key], 'the download draws what the bag recorded').toBe(earlier);
  expect(entry.changedByLook).toContain(pick.key);
  expect(entry.settings.lookParams, 'the list gives the settings once, in params').toBeUndefined();
  expect(zip.json(entry.animations).params[pick.key], 'and so does the sheet\'s own list').toBe(earlier);
  // another number behind "Surprise me" is another look: recorded again
  await page.locator('.bag-look').getByRole('button', { name: /Surprise me/ }).first().click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('loadout-bag-v1')))).items.find((i) => i.id === pick.id).settings.lookParams?.[pick.key], { timeout: 30_000 }).not.toBe(earlier);
});
