// Small things that matter to a visitor who is not technical: a way back to their results from any asset
// page, bag rows that say what was changed, one wording for the bag button, a playground Mute that stays
// in the playground, bag pictures that do not blink, and a header that fits a phone.
// Run with: npx playwright test tests/e2e/visitor.spec.mjs
//
// Assets are picked from the catalogue as it is today (the last matching one), and cards are brought on
// screen before they are touched, so nothing here depends on how many assets there are or on their order.
import fs from 'node:fs';
import { test, expect, openRoute, waitForDrawn, hasHorizontalScroll } from '../helpers/test.mjs';

const CATALOG = JSON.parse(fs.readFileSync(new URL('../../generated/catalog.json', import.meta.url), 'utf8'));
const of = (kind) => CATALOG.assets.filter((a) => a.kind === kind);
const word = (a) => a.words.find((w) => /^[a-z]{4,}$/.test(w));
const SPRITE = of('sprite').filter((a) => a.thumb && word(a)).at(-1);
const SOUND = of('sound').filter((a) => a.thumb && word(a)).at(-1);
const TRACK = of('music').at(-1);
const BUNDLE = CATALOG.bundles.find((b) => b.sprites.length && b.sounds.length);

/** Reload once the page has finished fetching: a reload in the middle of a download would show up as failed requests. */
async function reload(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  await page.reload();
}
const box = (page) => page.getByRole('searchbox', { name: 'Search' });
const results = (page) => page.locator('ul.results > li');
const hash = (page) => page.evaluate(() => location.hash);
const back = (page) => page.locator('header a.back-link');
const bagCount = (page) => page.locator('header .bag-count');
const rows = (page) => page.locator('.bag-item');
const addToBag = (page, item) => page.evaluate(async (it) => (await import('/app/bag.js')).bag.add(it), item);
async function place(page, id) {
  const li = page.locator(`ul.results > li[data-id="${id}"]`);
  await expect(li).toHaveCount(1);
  await li.scrollIntoViewIfNeeded();
  await expect(li.locator('.card').first()).toBeVisible();
  return li;
}
const topOf = (page, id) => page.locator(`ul.results > li[data-id="${id}"]`).evaluate((li) => Math.round(li.getBoundingClientRect().top));

// ---- 1. the way back -----------------------------------------------------------------------------

test('an asset page opened from a search has "Back to results", which returns to the same text, filters and place in the list', async ({ page }) => {
  await openRoute(page, '/');
  await box(page).fill(word(SOUND));
  await page.getByRole('group', { name: 'Kind', exact: true }).getByRole('button', { name: /^Sounds \d+$/ }).click();
  await expect.poll(() => hash(page)).toBe(`#/browse?q=${word(SOUND)}&kind=sound`);
  const li = await place(page, SOUND.id);
  const before = { ids: await results(page).evaluateAll((lis) => lis.map((x) => x.dataset.id)), top: await topOf(page, SOUND.id) };
  await li.locator(`a[href="#/sound/${SOUND.id}"]`).click();
  await expect(page.locator('h1')).toHaveText(SOUND.name);

  await expect(back(page)).toBeVisible();
  await expect(back(page)).toContainText('Back to results');
  await expect(back(page)).toHaveAttribute('href', `#/browse?q=${word(SOUND)}&kind=sound`);
  // it is at the top of the page, above the asset's name
  expect((await back(page).boundingBox()).y).toBeLessThan((await page.locator('h1').boundingBox()).y);
  // it survives a reload of the asset page
  await reload(page);
  await waitForDrawn(page);
  await expect(back(page)).toContainText('Back to results');

  await back(page).click();
  await expect.poll(() => hash(page)).toBe(`#/browse?q=${word(SOUND)}&kind=sound`);
  await waitForDrawn(page);
  await expect(box(page)).toHaveValue(word(SOUND));
  await expect(page.getByRole('group', { name: 'Kind', exact: true }).getByRole('button', { name: /^Sounds \d+$/ })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => results(page).evaluateAll((lis) => lis.map((x) => x.dataset.id))).toEqual(before.ids);
  // the card they opened is on screen again: where it was, or as near as the page can scroll (the search began on the
  // front page, whose top is taller than the results page they come back to; the next test checks the exact place)
  const card = page.locator(`ul.results > li[data-id="${SOUND.id}"] .card`).first();
  await expect(card).toBeVisible();
  await expect(card).toBeInViewport();
  const now = await topOf(page, SOUND.id);
  const canScroll = await page.evaluate(() => ({ y: window.scrollY, most: document.documentElement.scrollHeight - innerHeight }));
  expect(Math.abs(now - before.top) <= 4 || canScroll.y === 0 || canScroll.y >= canScroll.most - 1).toBe(true);
});

test('far down a long list: back puts the same card back under the visitor\'s eyes; the browser\'s own Back does too', async ({ page }) => {
  await openRoute(page, '/browse?kind=sprite');
  const li = await place(page, SPRITE.id);                     // the last sprite: as far down as it gets
  const top = await topOf(page, SPRITE.id);
  const scrolled = await page.evaluate(() => window.scrollY);
  await li.locator('a.card').click();
  await expect(page.locator('h1')).toHaveText(SPRITE.name);
  await expect(page.evaluate(() => window.scrollY)).resolves.toBe(0);      // an asset page starts at its top
  await back(page).click();
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sprite');
  await expect.poll(async () => Math.abs((await topOf(page, SPRITE.id)) - top)).toBeLessThanOrEqual(4);
  if (scrolled > 200) expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  // the same with the browser's Back button
  await page.locator(`ul.results > li[data-id="${SPRITE.id}"] a.card`).click();
  await expect(page.locator('h1')).toHaveText(SPRITE.name);
  await page.goBack();
  await expect.poll(() => hash(page)).toBe('#/browse?kind=sprite');
  await expect.poll(async () => Math.abs((await topOf(page, SPRITE.id)) - top)).toBeLessThanOrEqual(4);
});

test('the way back follows where the visitor came from: the front page, the bag, a bundle, or nowhere', async ({ page }) => {
  // from the front page with nothing typed
  await openRoute(page, '/');
  await (await place(page, SPRITE.id)).locator('a.card').click();
  await expect(page.locator('h1')).toHaveText(SPRITE.name);
  await expect(back(page)).toContainText('Back to results');
  await expect(back(page)).toHaveAttribute('href', '#/');
  // from one asset to another (a link on the page): the way back still leads to the list
  const linked = page.locator('main a[href^="#/sound/"], main a[href^="#/music/"], main a[href^="#/sprite/"]').first();
  if (await linked.count()) {
    await linked.click();
    await waitForDrawn(page);
    await expect(back(page)).toHaveAttribute('href', '#/');
  }
  await back(page).click();
  await expect.poll(() => hash(page)).toBe('#/');
  await expect(page.getByRole('heading', { name: 'Start from a kind of game' })).toBeVisible();

  // from the bag's "Change"
  await addToBag(page, { kind: 'sound', id: SOUND.id, settings: {} });
  await openRoute(page, '/bag');
  await rows(page).first().getByRole('link', { name: 'Change' }).click();
  await expect(page.locator('h1')).toHaveText(SOUND.name);
  await expect(back(page)).toContainText('Back to your bag');
  await back(page).click();
  await expect.poll(() => hash(page)).toBe('#/bag');
  await expect(rows(page)).toHaveCount(1);

  // from a bundle
  await openRoute(page, `/bundle/${BUNDLE.id}`);
  await expect(page.locator('main.bundle-page')).toBeVisible();
  const first = page.locator(`main.bundle-page a[href="#/sprite/${BUNDLE.sprites[0]}"]`).first();
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await expect(page.locator('canvas.stage')).toBeVisible();
  await expect(back(page)).toContainText(`Back to ${BUNDLE.name}`);
  await back(page).click();
  await expect.poll(() => hash(page)).toBe(`#/bundle/${BUNDLE.id}`);
  await expect(page.locator('main.bundle-page')).toBeVisible();

  // opened straight from a link: there is nothing to go back to, so the link leads to everything
  await page.goto('about:blank');
  await openRoute(page, `/music/${TRACK.id}`);
  await expect(back(page)).toBeVisible();
  await expect(back(page)).not.toContainText('Back to');
  await expect(back(page)).toContainText('Browse everything');
  await expect(back(page)).toHaveAttribute('href', '#/browse');
  // lists themselves have no such link
  await openRoute(page, '/browse');
  await expect(back(page)).toHaveCount(0);
});

// ---- 2. bag rows say what was changed ------------------------------------------------------------------

test('a bag row says in plain words what was changed, at most three things and how many more', async ({ page }) => {
  await openRoute(page, '/');
  // the Hero: taller, no weapon, a blue cape, and two more changes
  await addToBag(page, { kind: 'sprite', id: 'knight', settings: { params: { height: 1, weapon: 'none', trim: '#3f6fd1', speed: 1, bounce: 0 }, scale: 2 } });
  await addToBag(page, { kind: 'sprite', id: 'knight', settings: { params: { height: 0 } } });
  await addToBag(page, { kind: 'sprite', id: 'knight', settings: {} });
  await addToBag(page, { kind: 'sound', id: 'sword-slash', settings: { params: { pitch: 2200 } } });
  await addToBag(page, { kind: 'sound', id: 'sword-slash', settings: { style: 'Heavy blade', params: { swing: 0.1 } } });
  await addToBag(page, { kind: 'music', id: 'battle-theme', settings: { params: { bars: 32, inst: 1 } } });
  await addToBag(page, { kind: 'music', id: 'battle-theme', settings: {} });
  await openRoute(page, '/bag');
  await expect(rows(page)).toHaveCount(7);
  const note = (i) => rows(page).nth(i).locator('.bag-text .hint');
  await expect(note(0)).toHaveText('Height: taller, no weapon, blue cape and trim and 2 more, pixel size 2×');
  await expect(note(1)).toHaveText('Height: shorter');
  await expect(note(2)).toHaveText('Standard look');
  await expect(note(3)).toHaveText('Standard style, higher blade pitch');
  await expect(note(4)).toHaveText('Heavy blade style, shorter swing time');
  await expect(note(5)).toHaveText('Standard style, flute, length: longer');
  await expect(note(6)).toHaveText('Standard style');
  // the old words that said nothing are gone
  await expect(page.locator('.bag-list')).not.toContainText(/your own (look|changes)/i);
  // the whole list of changes is there for anyone who wants it
  await expect(note(0)).toHaveAttribute('title', /faster/);
});

// ---- 3. one wording for the bag button -------------------------------------------------------------------

test('the bag button reads "Add to my bag" everywhere, and "In your bag" with "Update" once it is there', async ({ page }) => {
  // on a card
  await openRoute(page, '/browse?kind=sound');
  const li = await place(page, SOUND.id);
  const cardBtn = li.locator('.card-add');
  await expect(cardBtn).toHaveText(/Add to my bag/);
  await expect(cardBtn).toHaveAccessibleName(`Add ${SOUND.name} to my bag`);
  await cardBtn.click();
  await expect(bagCount(page)).toHaveText('1');
  await expect(cardBtn).toHaveText(/In your bag/);
  // once it is there the card does not add it again: it leads to the bag
  await cardBtn.click();
  await expect.poll(() => hash(page)).toBe('#/bag');
  await expect(rows(page)).toHaveCount(1);
  await expect(bagCount(page)).toHaveText('1');

  // on each kind of asset page
  for (const asset of [SPRITE, SOUND, TRACK]) {
    await openRoute(page, `/${asset.kind}/${asset.id}`);
    const area = page.locator('.add-to-bag');
    await expect(area.getByRole('button')).toHaveText('Add to my bag');
    const had = Number(await bagCount(page).textContent());
    await area.getByRole('button').click();
    await expect(bagCount(page)).toHaveText(String(had + 1));
    await expect(area).toContainText('In your bag');
    await expect(area.getByRole('button')).toHaveText('Update');
    // Update changes that one, it does not add another
    await area.getByRole('button').click();
    await expect(area).toContainText('Updated');
    await expect(bagCount(page)).toHaveText(String(had + 1));
  }
  // opened from the bag: the same two words
  await openRoute(page, '/bag');
  await rows(page).first().getByRole('link', { name: 'Change' }).click();
  await expect(page.locator('.add-to-bag')).toContainText('In your bag');
  await expect(page.locator('.add-to-bag').getByRole('button')).toHaveText('Update');

  // nowhere on the site says it another way
  for (const route of ['/', '/browse', '/bag', `/bundle/${BUNDLE.id}`, `/sprite/${SPRITE.id}`]) {
    await openRoute(page, route);
    await expect(page.locator('body')).not.toContainText(/Add to bag|Update in bag|Add to your bag/);
  }
  await page.evaluate(async () => (await import('/app/bag.js')).bag.clear());
  await openRoute(page, '/bag');
  await expect(page.locator('main')).toContainText('Add to my bag');
});

// ---- 4. Mute belongs to the playground ---------------------------------------------------------------------

test('the playground\'s Mute does not follow the visitor out of the playground, and is off again when they come back', async ({ page }) => {
  await openRoute(page, '/');
  await addToBag(page, { kind: 'sprite', id: SPRITE.id, settings: {} });
  await addToBag(page, { kind: 'sound', id: SOUND.id, settings: {} });
  const site = () => page.evaluate(async () => ({ on: (await import('/app/audio.js')).soundState.on, kept: localStorage.getItem('sf-sound') }));
  expect((await site()).on).toBe(true);

  await page.locator('header').getByRole('link', { name: 'Play', exact: true }).click();
  const mute = page.locator('.play-mute');
  await expect(mute).toHaveText('Mute');
  await mute.click();
  await expect(mute).toHaveText('Unmute');
  expect((await page.evaluate(() => window.__loadoutPlay.state())).muted).toBe(true);
  expect((await site()).kept, 'nothing about it is remembered').not.toBe('off');

  // a sound page: its previews play
  await page.evaluate((id) => { location.hash = `#/sound/${id}`; }, SOUND.id);
  await expect(page.locator('h1')).toHaveText(SOUND.name);
  expect((await site()).on, 'sound is on outside the playground').toBe(true);
  // a sprite page: its Sound switch is on
  await page.evaluate((id) => { location.hash = `#/sprite/${id}`; }, SPRITE.id);
  await expect(page.locator('canvas.stage')).toBeVisible();
  await expect(page.locator('#sound-on')).toBeChecked();
  // after a reload too
  await reload(page);
  await waitForDrawn(page);
  expect((await site()).on).toBe(true);

  // back in the playground Mute is off again
  await page.evaluate(() => { location.hash = '#/play'; });
  await expect(page.locator('.play-mute')).toHaveText('Mute');
  expect((await page.evaluate(() => window.__loadoutPlay.state())).muted).toBe(false);

  // and the other way round: sound switched off on a sprite page is the visitor's own choice; the playground leaves it as it found it
  await page.evaluate((id) => { location.hash = `#/sprite/${id}`; }, SPRITE.id);
  await expect(page.locator('#sound-on')).toBeChecked();
  await page.locator('#sound-on').evaluate((input) => input.click());
  expect((await site()).on).toBe(false);
  await page.evaluate(() => { location.hash = '#/play'; });
  await expect(page.locator('.play-mute')).toBeVisible();
  await page.locator('.play-mute').click();
  await page.locator('.play-mute').click();
  await page.evaluate((id) => { location.hash = `#/sprite/${id}`; }, SPRITE.id);
  await expect(page.locator('canvas.stage')).toBeVisible();
  await expect(page.locator('#sound-on')).not.toBeChecked();
});

// ---- 5. bag pictures do not blink ---------------------------------------------------------------------------

test('changing the bag\'s look keeps each picture on screen until its new one is ready', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });      // pictures hold still, so only the look change redraws them
  await openRoute(page, '/');
  await addToBag(page, { kind: 'sprite', id: SPRITE.id, settings: {} });
  await addToBag(page, { kind: 'sound', id: SOUND.id, settings: {} });
  await addToBag(page, { kind: 'music', id: TRACK.id, settings: {} });
  await openRoute(page, '/bag');
  await expect(rows(page)).toHaveCount(3);
  // every picture has been drawn once (the sound's waveform takes a moment)
  const drawn = () => page.evaluate(() => [...document.querySelectorAll('.bag-item canvas.tile')].map((cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let filled = 0, ink = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) filled++; if (d[i] === 0x23 && d[i + 1] === 0x1b && d[i + 2] === 0x33) ink++; }
    return { filled, ink };
  }));
  // (a sprite's row has no picture until its own file has loaded, so all three are waited for)
  await expect.poll(async () => { const now = await drawn(); return now.length === 3 && now.every((p) => p.filled > 1000); }).toBe(true);
  await expect.poll(async () => (await drawn())[1].ink).toBeGreaterThan(20);            // the waveform is there

  // change the look, and look at the pictures at once, before the page has had a chance to draw anything new
  const atOnce = await page.evaluate(async () => {
    const { bag } = await import('/app/bag.js');
    const { THEME_PRESETS } = await import('/engine/theme.js');
    const read = () => [...document.querySelectorAll('.bag-item canvas.tile')].map((cv) => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let filled = 0, ink = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) filled++; if (d[i] === 0x23 && d[i + 1] === 0x1b && d[i + 2] === 0x33) ink++; }
      return { filled, ink };
    });
    const looks = [];
    for (const preset of THEME_PRESETS.slice(1, 4)) {
      bag.setTheme(preset.theme);          // the page rebuilds its rows in this same turn
      looks.push(read());
    }
    return looks;
  });
  for (const pictures of atOnce) {
    expect(pictures.length).toBe(3);
    expect(pictures.map((p) => p.filled > 1000), 'no picture is blank right after a look change').toEqual([true, true, true]);
    expect(pictures[1].ink, 'the waveform stays until the new one is ready').toBeGreaterThan(20);
  }
  // and the new look does arrive
  await expect.poll(async () => { const now = await drawn(); return now.length === 3 && now.every((p) => p.filled > 1000); }).toBe(true);
  await expect(rows(page)).toHaveCount(3);
});

// ---- the header on a phone ----------------------------------------------------------------------------------

test.describe('on a phone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 760 } });

  test('the header is one row with a compact menu, and every page is still one tap away', async ({ page }) => {
    for (const route of ['/', '/browse', '/bag', `/sound/${SOUND.id}`]) {
      await openRoute(page, route);
      const tops = await page.evaluate(() => ['a.brand', '.menu-btn', '.bag-link'].map((s) => { const r = document.querySelector('header.top ' + s).getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height), shown: r.width > 0 }; }));
      for (const t of tops) expect(t.shown, `${route}: brand, menu and bag are all shown`).toBe(true);
      const mid = tops.map((t) => t.y + t.h / 2);
      expect(Math.max(...mid) - Math.min(...mid), `${route}: brand, menu and bag sit on one row`).toBeLessThanOrEqual(8);
      expect(await hasHorizontalScroll(page)).toBe(false);
    }
    await openRoute(page, '/');
    const menu = page.getByRole('button', { name: 'Menu' });
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
    const rowHeight = (await page.locator('header.top').boundingBox()).height;
    expect(rowHeight).toBeLessThanOrEqual(64);
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link')).toHaveText(['Sprites', 'Sounds', 'Music', 'Bundles', 'Play']);
    for (const a of await nav.getByRole('link').all()) expect((await a.boundingBox()).height).toBeGreaterThanOrEqual(36);      // big enough for a thumb
    expect(await hasHorizontalScroll(page)).toBe(false);
    // choosing a page goes there and the menu is closed again
    await nav.getByRole('link', { name: 'Sounds' }).click();
    await expect.poll(() => hash(page)).toBe('#/browse?kind=sound');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    // Escape closes it too
    await page.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  });

  test('"Back to results" fits under the header row without pushing the page sideways', async ({ page }) => {
    await openRoute(page, `/browse?q=${word(SOUND)}`);
    await (await place(page, SOUND.id)).locator(`a[href="#/sound/${SOUND.id}"]`).click();
    await expect(page.locator('h1')).toHaveText(SOUND.name);
    await expect(back(page)).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    expect((await back(page).boundingBox()).height).toBeGreaterThanOrEqual(32);      // big enough for a thumb
  });
});

test('on a wide screen the header shows its links and no menu button', async ({ page }) => {
  await openRoute(page, '/');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Sprites', 'Sounds', 'Music', 'Bundles', 'Play']);
  await expect(page.locator('header .menu-btn')).toBeHidden();
});
