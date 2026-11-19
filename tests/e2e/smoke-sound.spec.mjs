// Sound, music and kit pages. The sounds are picked from the catalogue (generated/catalog.json): there is no other list.
import { test, expect, openRoute, setRange, downloadFrom, readZip, hasHorizontalScroll, downloadButton, showControl } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';

const C = catalogueOf(readCatalogue());
const effects = C.sounds;
// a short sound with styles and at least two sliders (the first-shipped coin pickup while it exists), and one that loops
const rich = (a) => !a.tech.loop && a.tech.styles.length >= 1 && a.tech.controls >= 2;
const oneShot = effects.find((a) => a.id === 'coin-pickup' && rich(a)) ?? effects.find(rich);
const looping = effects.find((a) => a.tech.loop);
// the first-shipped track has the Length and Melody instrument choices the music test looks at
const TRACK = C.byId['battle-theme'] ?? C.music[0];

const play = (page) => page.locator('.stage-tools .tools-left button');
const sliders = (page) => page.locator('.rx-panel .ctl input[type=range]');      // every tab's, whichever is open
const versions = (page) => page.locator('.rx-panel .vstrip .vbtn');
const hashNow = (page) => page.evaluate(() => location.hash);

test.describe('sound page', () => {
  test('two columns: a big play button and the length on the left, the panel with versions and sliders on the right; no waveform', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    await expect(page.locator('main.v2.rx')).toBeVisible();
    await expect(page.locator('h1')).toHaveText(oneShot.name);
    await expect(play(page)).toHaveText('Play');
    await expect(page.locator('.stage-tools .tools-left .hint')).toContainText('seconds long');
    expect(await sliders(page).count()).toBeGreaterThanOrEqual(2);
    // its named styles are its first versions
    const names = await versions(page).locator('.name').allTextContents();
    expect(names.slice(0, oneShot.tech.styles.length)).toEqual(oneShot.tech.styles);
    for (const v of await versions(page).all()) await expect(v).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('main canvas'), 'no waveform picture').toHaveCount(0);
    await expect(page.locator('.rx-panel .saved')).toContainText('Changes save by themselves');
  });

  test('a version and a slider change the link and save themselves; Start over goes back', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    await versions(page).first().click();
    await expect(versions(page).first()).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => hashNow(page)).toContain('style=');
    await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
    await setRange(sliders(page).first(), 'other');
    await expect(versions(page).first()).toHaveAttribute('aria-pressed', 'false');
    const key = await sliders(page).first().evaluate((n) => n.dataset.key);
    await expect.poll(() => hashNow(page)).toContain(`${key}=`);
    // a reload goes on with the same sound, from the bag item it was saved to
    const value = await sliders(page).first().inputValue();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
    expect(Math.abs(Number(await sliders(page).first().inputValue()) - Number(value))).toBeLessThan(0.02);
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect.poll(() => hashNow(page)).not.toContain(`${key}=`);
    await expect(page.locator(`.rx-panel [data-control="${key}"]`)).not.toHaveClass(/is-changed/);
  });

  test('every slider and every style changes the sound', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    const wav = async () => (await downloadFrom(page, () => downloadButton(page).click(), { timeout: 8000, retries: 3 })).bytes;
    const reset = () => page.getByRole('button', { name: 'Start over' }).click();
    const base = await wav();
    const n = await sliders(page).count();
    for (let i = 0; i < n; i++) {
      const label = await sliders(page).nth(i).evaluate((el) => document.querySelector(`label[for="${el.id}"]`).textContent);
      await setRange(sliders(page).nth(i), 'other');
      expect((await wav()).equals(base), `slider "${label}" should change the sound`).toBe(false);
      await reset();
      expect((await wav()).equals(base), 'Start over should give back the first sound').toBe(true);
    }
    for (let i = 0; i < oneShot.tech.styles.length; i++) {
      await versions(page).nth(i).click();
      expect((await wav()).equals(base), `style "${oneShot.tech.styles[i]}" should change the sound`).toBe(false);
    }
    // the length on the left follows the sound
    await expect(page.locator('.stage-tools .tools-left .hint')).toContainText('seconds long');
  });

  test('Play turns into Stop and back', async ({ page }) => {
    test.skip(!looping, 'no looping sound in the library');
    await openRoute(page, `/sound/${looping.id}`);
    await expect(play(page)).toHaveText('Play loop');
    await play(page).click();
    await expect(play(page)).toHaveText('Stop');
    await play(page).click();
    await expect(play(page)).toHaveText('Play loop');
  });

  test('Play on a one-shot sound shows Stop while it plays and returns to Play', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    const btn = play(page);
    await expect(btn).toHaveText('Play');
    // a short sound may be over before a poll looks, so record every text the button shows
    await btn.evaluate((b) => { window.__seen = []; new MutationObserver(() => window.__seen.push(b.textContent)).observe(b, { childList: true, characterData: true, subtree: true }); });
    await btn.click();
    await expect.poll(() => page.evaluate(() => window.__seen)).toContain('Stop');
    await expect(btn).toHaveText('Play', { timeout: 8000 });   // it ends by itself
    // a variation is a change like any other: heard, saved, and in the link
    await page.getByRole('button', { name: 'Play a variation' }).click();
    await expect.poll(() => hashNow(page)).toContain('seed=');
    await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
  });

  test('Download gives a 16-bit PCM .wav', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    const { name, bytes } = await downloadFrom(page, () => downloadButton(page).click());
    expect(name).toBe(`${oneShot.id}.wav`);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
    expect(bytes.readUInt16LE(20)).toBe(1);            // PCM
    expect(bytes.readUInt16LE(22)).toBe(1);            // mono
    expect(bytes.readUInt16LE(34)).toBe(16);           // 16 bit
    expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(44).some((b) => b !== 0)).toBe(true);
    await expect(page.locator('.rx-panel .status')).toContainText('Downloaded');
  });
});

test.describe('music page', () => {
  const route = `/music/${TRACK.id}`;

  test('has no waveform canvas, and Length and Melody instrument choices', async ({ page }) => {
    await openRoute(page, route);
    await expect(page.locator('main.v2.rx .stage-card')).toBeVisible();
    await expect(page.locator('main canvas')).toHaveCount(0);
    await showControl(page, 'bars');
    const length = page.getByRole('group', { name: 'Length' }).getByRole('button');
    expect(await length.count()).toBeGreaterThanOrEqual(2);
    await expect(length.first()).toContainText('seconds');
    await length.nth(1).click();
    await expect(length.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.stage-tools .tools-left .hint')).toContainText(`${parseInt(await length.nth(1).textContent(), 10)} seconds long`);
    await showControl(page, 'inst');
    const inst = page.getByRole('group', { name: 'Melody instrument' }).getByRole('button');
    expect(await inst.count()).toBeGreaterThanOrEqual(2);
    await inst.nth(1).click();
    await expect(inst.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(inst.first()).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => hashNow(page)).toContain('inst=1');
    await expect.poll(() => hashNow(page)).toContain('bars=16');
    expect(await sliders(page).count()).toBeGreaterThanOrEqual(3);
    // a style changes the sliders and keeps the length and the instrument chosen
    await versions(page).first().click();
    await expect(versions(page).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(inst.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => hashNow(page)).toContain('style=');
    await expect.poll(() => hashNow(page)).toContain('bars=16');
    await expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
  });

  test('Play starts and Stop stops', async ({ page }) => {
    await openRoute(page, route);
    await expect(play(page)).toHaveText('Play');
    await play(page).click();
    await expect(play(page)).toHaveText('Stop', { timeout: 30_000 });
    await setRange(sliders(page).first(), 'other');   // change it while it plays
    await expect(play(page)).toHaveText('Stop');
    await play(page).click();
    await expect(play(page)).toHaveText('Play');
  });
});

// Kits became bundles: old kit addresses lead to the bundle pages (their own tests are in bundle.spec.mjs).
// The bundles, and what each one holds, are read from the catalogue.
const BUNDLES = C.catalog.bundles;
const size = (b) => b.sprites.length + b.sounds.length + b.music.length;
// the smallest bundle that has sprites, sounds and music (a download of it stays quick)
const KIT = BUNDLES.filter((b) => b.sprites.length && b.sounds.length && b.music.length).sort((x, y) => size(x) - size(y))[0];

test.describe('kit pages', () => {
  test('every kit lists its sprites and sounds', async ({ page }) => {
    test.setTimeout(30_000 + BUNDLES.length * 15_000);
    await openRoute(page, '/kits');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundles');
    const hrefs = await page.locator('a.card.kit').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.sort()).toEqual(BUNDLES.map((b) => `#/bundle/${b.id}`).sort());
    for (const b of BUNDLES) {
      await openRoute(page, `/bundle/${b.id}`);
      await expect(page.locator('h1')).toHaveText(b.name);
      await expect(page.locator('main.bundle-page')).toBeVisible();
      await expect(page.locator('.bundle-sprite a.bundle-name[href^="#/sprite/"]'), b.id).toHaveCount(b.sprites.length);
      await expect(page.locator('.bundle-sound a[href^="#/sound/"]'), b.id).toHaveCount(b.sounds.length);
      await expect(page.locator('.bundle-music a[href^="#/music/"]'), b.id).toHaveCount(b.music.length);
      await expect(page.getByRole('button', { name: 'Download this kit' })).toBeEnabled();
    }
  });

  test('an old kit address opens the bundle, with its sprites, sounds and music track', async ({ page }) => {
    expect(KIT, 'a bundle with sprites, sounds and music').toBeTruthy();
    await openRoute(page, `/kit/${KIT.id}`);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(`#/bundle/${KIT.id}`);
    await expect(page.locator('main.bundle-page')).toBeVisible();
    await expect(page.locator('.bundle-sprite')).toHaveCount(KIT.sprites.length);
    await expect(page.locator('.bundle-sound a[href^="#/sound/"]')).toHaveCount(KIT.sounds.length);
    await expect(page.locator('.bundle-music a[href^="#/music/"]')).toHaveCount(KIT.music.length);
  });

  test('Download the whole kit gives a zip with a sheet per sprite and sound files', async ({ page }) => {
    test.setTimeout(150_000);
    await openRoute(page, `/kit/${KIT.id}`);
    await expect(page.locator('main.bundle-page')).toBeVisible();
    const ids = await page.locator('.bundle-sprite a.bundle-name').evaluateAll((as) => as.map((a) => a.getAttribute('href').split('/').pop()));
    expect(ids.sort()).toEqual([...KIT.sprites].sort());
    const { name, bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download this kit' }).click(), { timeout: 120_000 });
    expect(name).toMatch(/\.zip$/);
    const names = readZip(new Uint8Array(bytes)).map((f) => f.name);
    for (const id of ids) expect(names, `sheet for ${id}`).toContain(`sprites/${id}/${id}.png`);
    for (const id of KIT.sounds) expect(names, `sound ${id}`).toContain(`sounds/${id}.wav`);
    for (const id of KIT.music) expect(names, `track ${id}`).toContain(`music/${id}.wav`);
    await expect(page.locator('.status').first()).toContainText('Downloaded');
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  for (const [label, route] of [['sound', `/sound/${oneShot.id}`], ['music', `/music/${TRACK.id}`], ['kit', `/kit/${KIT.id}`]]) {
    test(`${label} page has no sideways scroll`, async ({ page }) => {
      await openRoute(page, route);
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  }
});
