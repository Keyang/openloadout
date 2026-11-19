// The landing page's live parts: sprites drawn by the real engine, controls that change them, kits that take a look,
// the Hero's ready-made versions, and sounds that play.
import fs from 'node:fs';
import { test, expect, openRoute, canvasStats, canvasGroupStats } from '../helpers/test.mjs';

const read = (file) => JSON.parse(fs.readFileSync(new URL(`../../generated/${file}`, import.meta.url), 'utf8'));
const CATALOG = () => read('catalog.json');

test.beforeEach(async ({ page }) => { await openRoute(page, '/'); });

/** Wait until a canvas has something drawn on it. */
const drawn = (canvas) => expect.poll(async () => (await canvasStats(canvas)).opaque).toBeGreaterThan(20);

test('the line-up is drawn live and Surprise me changes every sprite; Back to the originals undoes it', async ({ page }) => {
  const sprites = page.locator('.lineup canvas.live');
  expect(await sprites.count()).toBeGreaterThanOrEqual(8);
  for (const c of await sprites.all()) if (await c.isVisible()) await drawn(c);
  const shown = async () => { const out = []; for (const c of await sprites.all()) if (await c.isVisible()) out.push(c); return out; };
  const back = page.getByRole('button', { name: 'Back to the originals' });
  await expect(back).toBeHidden();
  // it is moving: the first sprite shows another frame a moment later
  const first = (await shown())[0];
  const a = (await canvasStats(first)).hash;
  await expect.poll(async () => (await canvasStats(first)).hash).not.toBe(a);

  await page.emulateMedia({ reducedMotion: 'reduce' });           // hold still, so a picture only changes when its settings do
  await page.waitForTimeout(200);
  const before = await Promise.all((await shown()).map(async (c) => (await canvasStats(c)).hash));
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await expect(back).toBeVisible();
  await expect.poll(async () => {
    const after = await Promise.all((await shown()).map(async (c) => (await canvasStats(c)).hash));
    return after.filter((h, i) => h !== before[i]).length;
  }).toBeGreaterThanOrEqual(Math.ceil(before.length * 0.8));
  await back.click();
  await expect(back).toBeHidden();
  await expect.poll(async () => Promise.all((await shown()).map(async (c) => (await canvasStats(c)).hash))).toEqual(before);
});

test('with reduced motion the line-up holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoute(page, '/');
  const first = page.locator('.lineup canvas.live').first();
  await drawn(first);
  const a = (await canvasStats(first)).hash;
  await page.waitForTimeout(700);
  expect((await canvasStats(first)).hash).toBe(a);
});

test('step 2 has real controls, and the sprite sheet in step 3 follows them', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const steps = page.locator('#how .step');
  await expect(steps).toHaveCount(3);
  await expect(steps.locator('h3')).toHaveText(['1Pick one', '2Change it', '3Download it']);
  const hero = steps.nth(1).locator('canvas.live');
  const sheet = steps.nth(2).locator('.sheet-frames canvas.live');
  await steps.nth(1).scrollIntoViewIfNeeded();
  await expect(sheet).toHaveCount(8);
  await drawn(hero);
  await drawn(sheet.first());
  const hair = page.getByRole('radiogroup', { name: 'Hair' }).getByRole('radio');
  await expect(hair).toHaveCount(3);
  await expect(hair.first()).toHaveAttribute('aria-checked', 'true');
  const carry = page.getByRole('link', { name: 'Carry on with this Hero' });

  let was = { hero: (await canvasStats(hero)).hash, sheet: (await canvasGroupStats(sheet)).hash };
  const changed = async (what) => {
    await expect.poll(async () => (await canvasStats(hero)).hash, `${what} changes the Hero`).not.toBe(was.hero);
    await expect.poll(async () => (await canvasGroupStats(sheet)).hash, `${what} changes the sheet`).not.toBe(was.sheet);
    was = { hero: (await canvasStats(hero)).hash, sheet: (await canvasGroupStats(sheet)).hash };
  };
  await hair.nth(1).click();
  await expect(hair.nth(1)).toHaveAttribute('aria-checked', 'true');
  await expect(hair.first()).toHaveAttribute('aria-checked', 'false');
  await changed('hair');
  const outfit = page.getByRole('radiogroup', { name: 'Outfit' }).getByRole('radio');
  expect(await outfit.count()).toBeGreaterThanOrEqual(3);
  await outfit.nth(1).click();
  await expect(outfit.nth(1)).toHaveAttribute('aria-checked', 'true');
  await changed('outfit');
  const height = page.getByLabel('Height');
  await height.focus();
  for (let i = 0; i < 30; i++) await height.press('ArrowRight');
  await changed('height');

  // the link carries on with this Hero on its own page, with the same settings
  const href = await carry.getAttribute('href');
  const q = new URLSearchParams(href.split('?')[1]);
  expect(href.startsWith('#/sprite/knight?')).toBe(true);
  expect(q.get('hairStyle')).toBe(await hair.nth(1).getAttribute('data-v'));
  expect(q.get('outfit')).toBe(await outfit.nth(1).getAttribute('data-v'));
  expect(Number(q.get('height'))).toBeCloseTo(0.8, 5);
});

test('the three kits are living scenes with their real facts, and take a look in one click', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const kits = page.locator('#kits .kit');
  await expect(kits).toHaveCount(3);
  const bundles = CATALOG().bundles;
  const looks = page.getByRole('radiogroup', { name: 'Look for all three kits' }).getByRole('radio');
  expect(await looks.count()).toBeGreaterThanOrEqual(4);
  await expect(looks.first()).toHaveText('Original');
  await expect(looks.first()).toHaveAttribute('aria-checked', 'true');

  for (const kit of await kits.all()) {
    await kit.scrollIntoViewIfNeeded();
    const link = kit.getByRole('link', { name: 'See the kit' });
    const id = (await link.getAttribute('href')).replace('#/bundle/', '');
    const b = bundles.find((x) => x.id === id);
    expect(b, id).toBeTruthy();
    await expect(kit.locator('.facts b')).toHaveText([String(b.sprites.length), String(b.sounds.length), String(b.music.length)]);
    await expect(kit.locator('h3')).toHaveText(b.name.replace(/ kit$/, ''));
    const actors = kit.locator('.scene canvas.actor');
    await expect.poll(() => actors.count()).toBeGreaterThanOrEqual(4);
    await drawn(actors.first());
  }

  const kit = kits.first();
  await kit.scrollIntoViewIfNeeded();
  const actors = kit.locator('.scene canvas.actor');
  const before = (await canvasGroupStats(actors)).hash;
  const ground = () => kit.locator('.scene-ground').first().evaluate((n) => n.style.backgroundImage);
  const groundBefore = await ground();
  expect(groundBefore).toContain('data:image/png');
  await looks.filter({ hasText: 'Frost' }).click();
  await expect(looks.filter({ hasText: 'Frost' })).toHaveAttribute('aria-checked', 'true');
  await expect(looks.first()).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await canvasGroupStats(actors)).hash).not.toBe(before);
  expect(await ground()).not.toBe(groundBefore);
  // the way to the kit keeps the look
  for (const link of await kits.getByRole('link', { name: 'See the kit' }).all()) expect(await link.getAttribute('href')).toMatch(/^#\/bundle\/[\w-]+\?look=frost$/);
  await looks.first().click();
  await expect.poll(async () => (await canvasGroupStats(actors)).hash).toBe(before);
  expect(await ground()).toBe(groundBefore);
});

test('a kit\'s link opens its page in the chosen look', async ({ page }) => {
  await page.locator('#kits').scrollIntoViewIfNeeded();
  await page.getByRole('radiogroup', { name: 'Look for all three kits' }).getByRole('radio', { name: 'Night' }).click();
  await page.locator('#kits .kit').first().getByRole('link', { name: 'See the kit' }).click();
  await expect(page).toHaveURL(/#\/bundle\/kit-platformer-fantasy\?look=night$/);
});

test('the Hero comes in twelve ready-made versions, each opening its page with that version applied', async ({ page }) => {
  const versions = read('versions.json').knight.slice(0, 12);
  const tiles = page.locator('#versions a.version');
  await expect(tiles).toHaveCount(versions.length);
  expect(versions.length).toBe(12);
  await expect(tiles.locator('.name')).toHaveText(versions.map((v) => v.name));
  await tiles.first().scrollIntoViewIfNeeded();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const c of await tiles.locator('canvas.live').all()) await drawn(c);
  // twelve different pictures
  const hashes = await Promise.all((await tiles.locator('canvas.live').all()).map(async (c) => (await canvasStats(c)).hash));
  expect(new Set(hashes).size).toBe(12);
  // the link carries the version's settings, exactly
  for (const [i, v] of versions.entries()) {
    const href = await tiles.nth(i).getAttribute('href');
    const q = Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));
    expect(href.split('?')[0]).toBe('#/sprite/knight');
    expect(q, v.name).toEqual(Object.fromEntries(Object.entries(v.params ?? {}).map(([k, x]) => [k, String(x)])));
  }
  // and the page it opens shows them
  const pick = versions.findIndex((v) => v.params && v.params.hairStyle && v.params.outfit);
  await tiles.nth(pick).click();
  await expect(page).toHaveURL(/#\/sprite\/knight\?/);
  await expect(page.locator('#app main')).toBeVisible();
  const settings = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1])));
  expect(settings.hairStyle).toBe(versions[pick].params.hairStyle);
});

test('sounds and music rows play and stop, one at a time', async ({ page }) => {
  const rows = page.locator('#sounds .srow');
  expect(await rows.count()).toBeGreaterThanOrEqual(4);
  const catalog = CATALOG();
  const ids = await rows.evaluateAll((lis) => lis.map((li) => li.dataset.id));
  for (const [i, id] of ids.entries()) {
    const a = catalog.assets.find((x) => x.id === id);
    expect(a && a.kind !== 'sprite', id).toBe(true);
    await expect(rows.nth(i).locator('a.name')).toHaveText(a.name);
    await expect(rows.nth(i).locator('a.name')).toHaveAttribute('href', `#/${a.kind}/${id}`);
  }
  const musicAt = ids.findIndex((id) => catalog.assets.find((x) => x.id === id).kind === 'music');
  const soundAt = ids.findIndex((id) => catalog.assets.find((x) => x.id === id).kind === 'sound');
  const name = (i) => catalog.assets.find((x) => x.id === ids[i]).name;
  await rows.first().scrollIntoViewIfNeeded();

  // music plays until it is stopped
  await rows.nth(musicAt).getByRole('button', { name: `Play ${name(musicAt)}` }).click();
  const stop = rows.nth(musicAt).getByRole('button', { name: `Stop ${name(musicAt)}` });
  await expect(stop).toBeVisible({ timeout: 20_000 });
  // starting a sound stops the music: one thing at a time
  await rows.nth(soundAt).getByRole('button', { name: `Play ${name(soundAt)}` }).click();
  await expect(rows.nth(musicAt).getByRole('button', { name: `Play ${name(musicAt)}` })).toBeVisible();
  // a sound effect ends by itself and the button goes back to Play
  await expect(rows.nth(soundAt).getByRole('button', { name: `Play ${name(soundAt)}` })).toBeVisible({ timeout: 15_000 });
  // and Stop stops
  await rows.nth(musicAt).getByRole('button', { name: `Play ${name(musicAt)}` }).click();
  await expect(stop).toBeVisible({ timeout: 20_000 });
  await stop.click();
  await expect(rows.nth(musicAt).getByRole('button', { name: `Play ${name(musicAt)}` })).toBeVisible();
});

test('sprites off screen are not drawn until they come into view', async ({ page }) => {
  // the Hero's versions are far down the page: their canvases stay empty until scrolled to
  const tile = page.locator('#versions canvas.live').first();
  await expect(tile).toHaveCount(1);
  await page.waitForTimeout(400);
  expect((await canvasStats(tile)).opaque).toBe(0);
  await tile.scrollIntoViewIfNeeded();
  await drawn(tile);
});

test('leaving the page stops what it started', async ({ page }) => {
  const rows = page.locator('#sounds .srow');
  await rows.first().scrollIntoViewIfNeeded();
  await page.getByRole('link', { name: 'Hear the sounds' }).click();
  await expect(page).toHaveURL(/#\/browse\?kind=sound$/);
  await expect(page.locator('main.landing')).toHaveCount(0);
  await page.waitForTimeout(300);            // a frame or two more: nothing left running throws
});

test('step 2 says how many controls the Hero has, in words that read', async ({ page }) => {
  const hero = CATALOG().assets.find((a) => a.id === 'knight');
  await expect(page.locator('#how .step').nth(1).locator('p')).toContainText(`The ${hero.name}'s own page has ${hero.tech.controls} controls, and every change there is kept in your bag by itself.`);
});

test('step 1: each thing to pick is a link to its own page', async ({ page }) => {
  const picks = page.locator('#how .pick a');
  expect(await picks.count()).toBeGreaterThanOrEqual(4);
  const catalog = CATALOG();
  for (const a of await picks.all()) {
    const id = (await a.getAttribute('href')).replace('#/sprite/', '');
    const row = catalog.assets.find((x) => x.id === id && x.kind === 'sprite');
    expect(row, id).toBeTruthy();
    await expect(a).toHaveAccessibleName(row.name);
  }
  await picks.nth(1).scrollIntoViewIfNeeded();
  const href = await picks.nth(1).getAttribute('href');
  await picks.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${href.replace('/', '\\/')}$`));
});

test('step 2: each group of choices is one Tab stop, and the arrow keys move the choice', async ({ page }) => {
  await page.locator('#how .step').nth(1).scrollIntoViewIfNeeded();
  for (const name of ['Hair', 'Outfit']) {
    const radios = page.getByRole('radiogroup', { name }).getByRole('radio');
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
    expect(await radios.evaluateAll((bs) => bs.map((b) => b.tabIndex))).toEqual([0, ...Array((await radios.count()) - 1).fill(-1)]);
    await radios.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(radios.nth(1)).toBeFocused();
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
    await expect(radios.nth(1)).toHaveAttribute('tabindex', '0');
    await expect(radios.first()).toHaveAttribute('tabindex', '-1');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');                     // wraps to the last
    await expect(radios.last()).toBeFocused();
    await expect(radios.last()).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');                     // and round to the first
    await expect(radios.first()).toHaveAttribute('aria-checked', 'true');
  }
  // Tab leaves the group in one step: Hair -> Outfit -> Height
  await page.getByRole('radiogroup', { name: 'Hair' }).getByRole('radio').first().focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radiogroup', { name: 'Outfit' }).getByRole('radio').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Height')).toBeFocused();
});

test('on a phone the outfit swatches are big enough to tap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoute(page, '/');
  const swatch = page.getByRole('radiogroup', { name: 'Outfit' }).getByRole('radio').first();
  await swatch.scrollIntoViewIfNeeded();
  const box = await swatch.boundingBox();
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
});

for (const [width, height] of [[1024, 768], [900, 700]]) {
  test(`at ${width} wide a kit's scene and its words sit side by side, with no empty bands around the scene`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openRoute(page, '/');
    for (const kit of await page.locator('#kits .kit').all()) {
      await kit.scrollIntoViewIfNeeded();
      const tile = await kit.locator('.kit-scene').boundingBox(), scene = await kit.locator('.scene').boundingBox(), body = await kit.locator('.kit-body').boundingBox();
      expect(body.x, 'the words are beside the scene').toBeGreaterThanOrEqual(scene.x + scene.width - 1);
      expect(body.width).toBeGreaterThanOrEqual(260);
      // the scene fills its side, or sits centred on its shelf tile: never a band on one side only
      const [left, right, top, bottom] = [scene.x - tile.x, tile.x + tile.width - scene.x - scene.width, scene.y - tile.y, tile.y + tile.height - scene.y - scene.height].map(Math.round);
      expect(Math.abs(left - right), `left ${left}, right ${right}`).toBeLessThanOrEqual(1);
      expect(Math.abs(top - bottom), `top ${top}, bottom ${bottom}`).toBeLessThanOrEqual(1);
      if (width >= 1004) expect([left, top], 'at this width the scene fills its side').toEqual([0, 0]);
    }
  });
}

test('the Hero is centred in its tile whatever the tile\'s size', async ({ page }) => {
  const tile = page.locator('#versions .hv').first();
  await tile.scrollIntoViewIfNeeded();
  const at = await tile.evaluate((n) => { const c = n.querySelector('canvas'), t = n.getBoundingClientRect(), r = c.getBoundingClientRect(); const k = r.width / c.width; return { dx: r.left + Number(c.style.getPropertyValue('--cx')) * k - (t.left + t.width / 2), dy: r.top + Number(c.style.getPropertyValue('--cy')) * k - (t.top + t.height / 2), k }; });
  expect(Math.abs(at.dx)).toBeLessThanOrEqual(1);
  expect(Math.abs(at.dy)).toBeLessThanOrEqual(1);
  expect(Number.isInteger(at.k)).toBe(true);
});
