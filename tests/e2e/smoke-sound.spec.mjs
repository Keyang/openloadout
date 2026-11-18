// Sound, music and kit pages.
import fs from 'node:fs';
import { test, expect, openRoute, setRange, downloadFrom, readZip, hasHorizontalScroll } from '../helpers/test.mjs';

const index = JSON.parse(fs.readFileSync(new URL('../../sounds/index.json', import.meta.url), 'utf8')).patches;
const effects = index.filter((p) => p.category !== 'music');
const oneShot = effects.find((p) => p.id === 'coin-pickup') ?? effects.find((p) => !p.loop);
const looping = effects.find((p) => p.loop);

const play = (page) => page.locator('.stage-tools .tools-left button');

test.describe('sound page', () => {
  test('sliders and style buttons exist', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    expect(await page.locator('.panel input[type=range]').count()).toBeGreaterThanOrEqual(2);
    const styles = page.getByRole('group', { name: 'Style' }).getByRole('button');
    expect(await styles.count()).toBeGreaterThanOrEqual(2);
    await expect(styles.first()).toHaveText('Standard');
    await expect(styles.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('canvas.stage')).toBeVisible();
  });

  test('styles and sliders change the link; Start over goes back', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    const styles = page.getByRole('group', { name: 'Style' }).getByRole('button');
    await styles.nth(1).click();
    await expect(styles.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('style=');
    await setRange(page.locator('.panel input[type=range]').first(), 'other');
    await expect(styles.first()).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(styles.first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('every slider and every style changes the sound', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    const wav = async () => (await downloadFrom(page, () => page.getByRole('button', { name: 'Download sound' }).click(), { timeout: 8000, retries: 3 })).bytes;
    const reset = () => page.getByRole('button', { name: 'Start over' }).click();
    const base = await wav();
    const sliders = page.locator('.panel input[type=range]');
    const n = await sliders.count();
    for (let i = 0; i < n; i++) {
      const label = await sliders.nth(i).evaluate((el) => document.querySelector(`label[for="${el.id}"]`).textContent);
      await setRange(sliders.nth(i), 'other');
      expect((await wav()).equals(base), `slider "${label}" should change the sound`).toBe(false);
      await reset();
      expect((await wav()).equals(base), 'Start over should give back the first sound').toBe(true);
    }
    const styles = page.getByRole('group', { name: 'Style' }).getByRole('button');
    for (let i = 1; i < await styles.count(); i++) {
      await styles.nth(i).click();
      expect((await wav()).equals(base), `style "${await styles.nth(i).textContent()}" should change the sound`).toBe(false);
    }
    // the waveform picture follows the sound too
    await reset();
    const hash = () => page.locator('canvas.stage').evaluate((cv) => cv.toDataURL());
    await expect(play(page)).toHaveText('Play', { timeout: 8000 });
    const h0 = await hash();
    await setRange(sliders.first(), 'other');
    await expect(play(page)).toHaveText('Play', { timeout: 8000 });
    expect(await hash()).not.toBe(h0);
  });

  test('Play turns into Stop and back', async ({ page }) => {
    test.skip(!looping, 'no looping sound in the library');
    await openRoute(page, `/sound/${looping.id}`);
    const play = page.locator('.stage-tools .tools-left button');
    await expect(play).toHaveText('Play loop');
    await play.click();
    await expect(play).toHaveText('Stop');
    await play.click();
    await expect(play).toHaveText('Play loop');
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
    await page.getByRole('button', { name: 'Play a variation' }).click();
  });

  test('Download sound gives a 16-bit PCM .wav', async ({ page }) => {
    await openRoute(page, `/sound/${oneShot.id}`);
    const { name, bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download sound' }).click());
    expect(name).toBe(`${oneShot.id}.wav`);
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('latin1')).toBe('WAVE');
    expect(bytes.readUInt16LE(20)).toBe(1);            // PCM
    expect(bytes.readUInt16LE(22)).toBe(1);            // mono
    expect(bytes.readUInt16LE(34)).toBe(16);           // 16 bit
    expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(44).some((b) => b !== 0)).toBe(true);
  });
});

test.describe('music page', () => {
  const route = '/music/battle-theme';

  test('has no waveform canvas, and Length and Melody instrument choices', async ({ page }) => {
    await openRoute(page, route);
    await expect(page.locator('canvas')).toHaveCount(0);
    const length = page.getByRole('group', { name: 'Length' }).getByRole('button');
    expect(await length.count()).toBeGreaterThanOrEqual(2);
    await expect(length.first()).toContainText('seconds');
    const inst = page.getByRole('group', { name: 'Melody instrument' }).getByRole('button');
    expect(await inst.count()).toBeGreaterThanOrEqual(2);
    await inst.nth(1).click();
    await expect(inst.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(inst.first()).toHaveAttribute('aria-pressed', 'false');
    await length.nth(1).click();
    await expect(length.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('inst=1');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('bars=16');
    expect(await page.locator('.panel input[type=range]').count()).toBeGreaterThanOrEqual(3);
  });

  test('Play starts and Stop stops', async ({ page }) => {
    await openRoute(page, route);
    const play = page.locator('.stage-tools .tools-left button');
    await expect(play).toHaveText('Play');
    await play.click();
    await expect(play).toHaveText('Stop', { timeout: 30_000 });
    await setRange(page.locator('.panel input[type=range]').first(), 'other');   // change it while it plays
    await expect(play).toHaveText('Stop');
    await play.click();
    await expect(play).toHaveText('Play');
  });
});

// Kits became bundles: old kit addresses lead to the bundle pages (their own tests are in bundle.spec.mjs).
test.describe('kit pages', () => {
  test('every kit lists its sprites and sounds', async ({ page }) => {
    await openRoute(page, '/kits');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundles');
    const hrefs = await page.locator('a.card.kit').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const href of hrefs) {
      await openRoute(page, href.replace(/^#/, ''));
      await expect(page.locator('h1')).not.toBeEmpty();
      await expect(page.locator('main.bundle-page')).toBeVisible();
      expect(await page.locator('.bundle-sprite a[href^="#/sprite/"]').count(), href).toBeGreaterThanOrEqual(1);
      expect(await page.locator('.bundle-sound a[href^="#/sound/"]').count(), href).toBeGreaterThanOrEqual(1);
      await expect(page.getByRole('button', { name: 'Download this bundle' })).toBeEnabled();
    }
  });

  test('Dungeon starter lists sprites, sounds and a music track', async ({ page }) => {
    await openRoute(page, '/kit/dungeon-starter');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/bundle/dungeon-starter');
    await expect(page.locator('main.bundle-page')).toBeVisible();
    expect(await page.locator('.bundle-sprite').count()).toBeGreaterThanOrEqual(4);
    expect(await page.locator('.bundle-sound a[href^="#/sound/"]').count()).toBeGreaterThanOrEqual(7);
    expect(await page.locator('.bundle-music a[href^="#/music/"]').count()).toBeGreaterThanOrEqual(1);
  });

  test('Download the whole kit gives a zip with a sheet per sprite and sound files', async ({ page }) => {
    test.setTimeout(150_000);
    await openRoute(page, '/kit/dungeon-starter');
    await expect(page.locator('main.bundle-page')).toBeVisible();
    const ids = await page.locator('.bundle-sprite a.bundle-name').evaluateAll((as) => as.map((a) => a.getAttribute('href').split('/').pop()));
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const { name, bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download this bundle' }).click(), { timeout: 120_000 });
    expect(name).toMatch(/\.zip$/);
    const names = readZip(new Uint8Array(bytes)).map((f) => f.name);
    for (const id of ids) expect(names, `sheet for ${id}`).toContain(`sprites/${id}/${id}.png`);
    expect(names.filter((n) => n.endsWith('.wav')).length).toBeGreaterThanOrEqual(ids.length);
    await expect(page.locator('.status').first()).toContainText('Downloaded');
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  for (const [label, route] of [['sound', `/sound/${oneShot.id}`], ['music', '/music/battle-theme'], ['kit', '/kit/dungeon-starter']]) {
    test(`${label} page has no sideways scroll`, async ({ page }) => {
      await openRoute(page, route);
      expect(await hasHorizontalScroll(page)).toBe(false);
    });
  }
});
