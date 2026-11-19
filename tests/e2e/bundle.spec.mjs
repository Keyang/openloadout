// A whole bundle restyled at once (W2-D2; features EDIT-6, BAG-6; architecture.md Contracts 4, 6, 7, 8).
// The bundle page at #/bundle/<id>: one set of look controls, every sprite, sound and track under them.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, expect, openRoute, waitForDrawn, setRange, downloadFrom, readZip, canvasStats, hasHorizontalScroll } from '../helpers/test.mjs';

const ROOT = new URL('../../', import.meta.url);
const CATALOG = new URL('generated/catalog.json', ROOT);
const BUNDLE_ID = 'dungeon-starter';
let BUNDLE = null, ASSETS = null;

test.beforeAll(() => {
  if (!fs.existsSync(CATALOG)) execFileSync('node', ['tools/build.mjs', '--skip-quality'], { cwd: ROOT, stdio: 'ignore' });
  const c = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  BUNDLE = c.bundles.find((b) => b.id === BUNDLE_ID);
  ASSETS = Object.fromEntries(c.assets.map((a) => [a.id, a]));
});

// Previews hold still on their first frame, so pixels can be compared.
test.use({ reducedMotion: 'reduce' });

const allIds = () => [...BUNDLE.sprites, ...BUNDLE.sounds, ...BUNDLE.music];
const pics = (page) => page.locator('canvas.bundle-sprite-pic');
const count = (page) => page.locator('header .bag-count');
// the site's content policy allows no eval in the page, so the bag is reached by named calls, not by code sent as text
const bagItems = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.items());
const bagTheme = (page) => page.evaluate(async () => (await import('/app/bag.js')).bag.theme());
const presetTheme = (page, id) => page.evaluate(async (pid) => (await import('/engine/theme.js')).THEME_PRESETS.find((p) => p.id === pid).theme, id);

/** Wait until every sprite preview has been drawn with the page's current look. */
async function settled(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector('main.bundle-page');
    if (!main || !main.dataset.look) return false;
    // only pictures on screen are drawn (big bundles): wait for those
    const cvs = [...main.querySelectorAll('canvas.bundle-sprite-pic')].filter((c) => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
    return cvs.every((c) => c.dataset.look === main.dataset.look);
  }, null, { timeout: 30_000 });
}

/** Per sprite: drawn pixels and a hash. */
async function spriteStats(page) {
  await settled(page);
  return pics(page).evaluateAll((cvs) => cvs.map((cv) => {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    let opaque = 0, h = 2166136261;
    for (let i = 0; i < data.length; i++) { if (i % 4 === 3 && data[i]) opaque++; h = Math.imul(h ^ data[i], 16777619); }
    return { id: cv.dataset.id, opaque, hash: (h >>> 0).toString(16) };
  }));
}

async function openBundle(page, query = '') {
  // the kit's scene and its look come first on the page, so the window is made tall: every picture is then on screen and drawn
  await page.setViewportSize({ width: page.viewportSize().width, height: Math.max(page.viewportSize().height, 5600) });
  await openRoute(page, `/bundle/${BUNDLE_ID}${query}`);
  await settled(page);
}

const hashQuery = (page) => { const h = new URL(page.url()).hash; const i = h.indexOf('?'); return i < 0 ? '' : h.slice(i + 1); };

test('the page shows the bundle, its controls, and every sprite, sound and track in it', async ({ page }) => {
  await openBundle(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BUNDLE.name);
  await expect(page.locator('main')).toContainText(BUNDLE.blurb);
  for (const name of ['Surprise me', 'Start over', 'Add the whole kit to my bag', 'Download this kit', 'Try it in the playground']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  for (const label of ['Colour shift', 'Colourfulness', 'Contrast', 'Pitch', 'Brightness', 'Speed', 'Intensity', 'Colour set']) {
    await expect(page.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('switch', { name: 'Also change shapes' })).toBeVisible();
  const stats = await spriteStats(page);
  expect(stats.map((s) => s.id)).toEqual(BUNDLE.sprites);
  for (const s of stats) expect(s.opaque, `${s.id} has drawn pixels`).toBeGreaterThan(20);
  await expect(page.locator('.bundle-sound')).toHaveCount(BUNDLE.sounds.length);
  await expect(page.locator('.bundle-music')).toHaveCount(BUNDLE.music.length);
  // each asset links to its own page
  await expect(page.locator(`a[href="#/sprite/${BUNDLE.sprites[0]}"]`).first()).toBeVisible();
  await expect(page.locator(`a[href="#/sound/${BUNDLE.sounds[0]}"]`).first()).toBeVisible();
  await expect(page.locator(`a[href="#/music/${BUNDLE.music[0]}"]`).first()).toBeVisible();
});

test('a named look changes every sprite preview; Surprise me changes them again, twice gives two looks; Start over restores them exactly', async ({ page }) => {
  await openBundle(page);
  const original = await spriteStats(page);

  await page.getByRole('button', { name: 'Frost', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Frost', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const frost = await spriteStats(page);
  frost.forEach((s, i) => expect(s.hash, `${s.id} changed under Frost`).not.toBe(original[i].hash));
  expect(hashQuery(page)).toBe('look=frost');

  await page.getByRole('button', { name: 'Surprise me' }).click();
  const s1 = await spriteStats(page);
  const seed1 = new URLSearchParams(hashQuery(page)).get('surprise');
  expect(seed1).toMatch(/^\d+$/);
  s1.forEach((s, i) => expect(s.hash, `${s.id} changed under Surprise me`).not.toBe(original[i].hash));
  await expect(page.getByRole('button', { name: 'Frost', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Surprise me' }).click();
  const s2 = await spriteStats(page);
  const seed2 = new URLSearchParams(hashQuery(page)).get('surprise');
  expect(seed2).not.toBe(seed1);
  expect(s2.map((s) => s.hash).join()).not.toBe(s1.map((s) => s.hash).join());

  await page.getByRole('button', { name: 'Start over' }).click();
  const back = await spriteStats(page);
  expect(back).toEqual(original);
  expect(hashQuery(page)).toBe('');
});

test('the address bar keeps the look, so a reload or a copied link shows the same thing', async ({ page }) => {
  await openBundle(page);
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  await setRange(page.getByLabel('Colour shift', { exact: true }), 40);
  await setRange(page.getByLabel('Pitch', { exact: true }), 5);
  const before = await spriteStats(page);
  const query = hashQuery(page);
  expect(query).toContain('pitch=5');
  await page.reload();
  await waitForDrawn(page);
  const after = await spriteStats(page);
  expect(after).toEqual(before);
  await expect(page.getByLabel('Pitch', { exact: true })).toHaveValue('5');
  await expect(page.getByLabel('Colour shift', { exact: true })).toHaveValue('40');
  expect(hashQuery(page)).toBe(query);

  // Also change shapes: kept in the link too
  await page.getByRole('switch', { name: 'Also change shapes' }).check();
  const shaped = await spriteStats(page);
  expect(shaped.map((s) => s.hash).join()).not.toBe(after.map((s) => s.hash).join());
  expect(hashQuery(page)).toContain('shapes=1');
  await page.reload();
  await waitForDrawn(page);
  expect(await spriteStats(page)).toEqual(shaped);
  await expect(page.getByRole('switch', { name: 'Also change shapes' })).toBeChecked();
});

/** Record a hash of every audio buffer the page starts playing (window.__played). */
async function recordPlayed(page) {
  await page.addInitScript(() => {
    window.__played = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      const b = this.buffer;
      let h = 2166136261;
      if (b) for (let c = 0; c < b.numberOfChannels; c++) {
        const d = b.getChannelData(c);
        h = Math.imul(h ^ d.length, 16777619);
        for (let i = 0; i < d.length; i += 3) h = Math.imul(h ^ Math.round(d[i] * 32767), 16777619);
      }
      window.__played.push((h >>> 0).toString(16));
      return start.apply(this, args);
    };
  });
}
const played = (page) => page.evaluate(() => window.__played.slice());

test('a sound plays with the look applied: changing the look changes what is heard', async ({ page }) => {
  await recordPlayed(page);
  await openBundle(page);
  const card = page.locator('.bundle-sound').first();
  const play = async () => {
    const n = (await played(page)).length;
    await card.getByRole('button', { name: /^Play/ }).click();
    await expect.poll(async () => (await played(page)).length).toBe(n + 1);
    return (await played(page))[n];
  };
  const original = await play();
  await page.getByRole('button', { name: 'Night', exact: true }).click();
  const night = await play();
  await page.getByRole('button', { name: 'Frost', exact: true }).click();
  const frost = await play();
  expect(night).not.toBe(original);
  expect(frost).not.toBe(night);
  expect(frost).not.toBe(original);
  await page.getByRole('button', { name: 'Start over' }).click();
  expect(await play()).toBe(original);
  await expect(card).toHaveAttribute('data-played', '4');
});

test('music starts and stops; with a brightness change it plays the same rendered, styled loop the download holds', async ({ page }) => {
  test.setTimeout(90_000);
  await recordPlayed(page);
  await openBundle(page, '?look=night');   // Night: duller sound
  const music = page.locator('.bundle-music').first();
  await expect(music).toContainText(/beats a minute/);
  await music.getByRole('button', { name: /^Play/ }).click();
  await expect(music.getByRole('button', { name: /^Stop/ })).toBeVisible({ timeout: 30_000 });
  await expect(music.getByRole('button', { name: /^Stop/ })).toHaveText('Stop', { timeout: 60_000 });
  expect((await played(page)).length).toBe(1);   // the rendered loop, not the live player
  await music.getByRole('button', { name: /^Stop/ }).click();
  await expect(music.getByRole('button', { name: /^Play/ })).toBeVisible();
});

test('bag page: with a brightness change, music plays the rendered, styled loop the download holds', async ({ page }) => {
  test.setTimeout(120_000);
  await recordPlayed(page);
  await openRoute(page, '/');
  const id = BUNDLE.music[0];
  await page.evaluate(async (mid) => { const { bag } = await import('/app/bag.js'); bag.add({ kind: 'music', id: mid, settings: {} }); bag.setTheme({ sound: { brightness: -0.4 }, music: { tempo: 0.92 } }); }, id);
  await openRoute(page, '/bag');
  const row = page.locator('.bag-item').first();
  await row.getByRole('button', { name: /^Play/ }).click();
  await expect(row.getByRole('button', { name: /^Stop/ })).toHaveText('Stop', { timeout: 90_000 });
  const heard = await played(page);
  expect(heard.length).toBe(1);
  // the same loop the download would hold: rendered with the look's speed, then made duller
  const want = await page.evaluate(async (mid) => {
    const { soundById, soundParams, renderAsync } = await import('/app/audio.js');
    const { themedSoundParams, applySound, soundSettingsFor } = await import('/sound/theme.js');
    const { bag } = await import('/app/bag.js');
    const patch = soundById[mid], t = bag.theme();
    const r = applySound(await renderAsync(patch, themedSoundParams(patch, soundParams(patch), t)), soundSettingsFor(patch, t));
    let h = 2166136261;
    for (const d of r.channels) { h = Math.imul(h ^ d.length, 16777619); for (let i = 0; i < d.length; i += 3) h = Math.imul(h ^ Math.round(d[i] * 32767), 16777619); }
    return (h >>> 0).toString(16);
  }, id);
  expect(heard[0]).toBe(want);
  await row.getByRole('button', { name: /^Stop/ }).click();
  await expect(row.getByRole('button', { name: /^Play/ })).toBeVisible();
});

test('every sprite is drawn whole, at the largest whole-number size that fits its tile, with or without shapes', async ({ page }) => {
  for (const id of [BUNDLE_ID, 'wizard-camp']) {
    await page.setViewportSize({ width: 1280, height: 3200 });      // every picture on screen, so every one is drawn
    await openRoute(page, `/bundle/${id}`);
    await settled(page);
    for (const shapes of [false, true]) {
      if (shapes) { await page.getByRole('switch', { name: 'Also change shapes' }).check(); await settled(page); }
      const sizes = await pics(page).evaluateAll((cvs) => cvs.map((c) => ({ id: c.dataset.id, w: c.width, h: c.height, cssW: c.getBoundingClientRect().width, cssH: c.getBoundingClientRect().height, tileH: c.parentElement.getBoundingClientRect().height })));
      for (const s of sizes) {
        const [fw, fh] = ASSETS[s.id].tech.frame;
        expect([s.w, s.h], `${s.id} whole frame`).toEqual([fw, fh]);
        const k = s.cssW / fw;
        expect(Number.isInteger(k), `${s.id} whole-number scale`).toBe(true);
        expect(s.cssH).toBe(fh * k);
        expect(s.cssH, `${s.id} fits its tile`).toBeLessThanOrEqual(s.tileH);
        expect(fh * (k + 1), `${s.id} is as big as fits`).toBeGreaterThan(s.tileH - 4);
        if (Math.max(fw, fh) === 64) expect(k).toBe(2);
      }
    }
  }
});

test('"Add the whole bundle to my bag" adds every asset once with this look, and asks before mixing with what is there', async ({ page }) => {
  await openBundle(page);
  await expect(count(page)).toHaveText('0');
  await page.getByRole('button', { name: 'Frost', exact: true }).click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  const n = allIds().length;
  await expect(count(page)).toHaveText(String(n));
  const items = await bagItems(page);
  expect(items.map((i) => i.id).sort()).toEqual(allIds().sort());
  expect(items.filter((i) => i.kind === 'sprite').map((i) => i.id)).toEqual(BUNDLE.sprites);
  expect(await bagTheme(page)).toEqual(await presetTheme(page, 'frost'));

  // the bag is no longer empty: the page asks
  await page.getByRole('button', { name: 'Toxic', exact: true }).click();
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(page.locator('.bundle-ask')).toContainText('already');
  await page.getByRole('button', { name: 'Replace what is in my bag' }).click();
  await expect(count(page)).toHaveText(String(n));
  expect(await bagTheme(page)).toEqual(await presetTheme(page, 'toxic'));
  // the kit is in the bag already, with this look: adding it again adds nothing and asks nothing
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(page.locator('.bundle-ask')).toBeHidden();
  await expect(page.locator('.bundle-actions .status')).toContainText('already in your bag');
  await expect(count(page)).toHaveText(String(n));
  await expect(page.getByRole('link', { name: 'Go to bag' })).toBeVisible();
  // one thing taken out, another changed by the visitor: only the missing one is added, the changed one is left as it is
  const [gone, kept] = await page.evaluate(async () => { const { bag } = await import('/app/bag.js'); const it = bag.items(); bag.remove(it[0].key); const s = it.find((i) => i.kind === 'sprite' && i.key !== it[0].key); bag.update(s.key, { ...s.settings, scale: 2 }); return [it[0].id, s.id]; });
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await page.getByRole('button', { name: 'Add to what is in my bag' }).click();
  const now = await bagItems(page);
  expect(now.filter((i) => i.id === gone).length, 'the missing one is back, once').toBe(1);
  expect(now.filter((i) => i.id === kept).map((i) => i.settings.scale).sort(), 'the changed one stays, and the kit\'s own is added beside it').toEqual([1, 2]);
  expect(now.length).toBe(n + 1);
});

test('"Try it in the playground" with the kit already in the bag goes straight there and adds nothing', async ({ page }) => {
  await openBundle(page);
  const n = allIds().length;
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await expect(count(page)).toHaveText(String(n));
  await page.getByRole('button', { name: 'Night', exact: true }).click();      // another look on the page makes no difference to that
  await page.getByRole('button', { name: 'Try it in the playground' }).click();
  await expect(page).toHaveURL(/#\/play$/);
  await page.waitForFunction(() => window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 60_000 });
  await expect(count(page)).toHaveText(String(n));
  expect((await bagItems(page)).length).toBe(n);
});

test('the bag page has the same controls, and its pictures follow the look', async ({ page }) => {
  await openBundle(page);
  await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
  await openRoute(page, '/bag');
  const tile = page.locator('.bag-item').first().locator('canvas.tile');
  const before = await canvasStats(tile);
  await page.getByRole('button', { name: 'Handheld', exact: true }).click();
  await expect.poll(async () => (await bagTheme(page)).colour.palette).toBe('Pocket');
  await expect.poll(async () => (await canvasStats(page.locator('.bag-item').first().locator('canvas.tile'))).hash).not.toBe(before.hash);
  await expect(page.getByRole('button', { name: 'Handheld', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await waitForDrawn(page);
  await expect(page.getByRole('button', { name: 'Handheld', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('"Download this bundle" gives a zip with the look applied and every asset listed', async ({ page }) => {
  test.setTimeout(240_000);
  const dl = async () => {
    const { name, bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download this kit' }).click(), { timeout: 120_000 });
    return { name, files: readZip(new Uint8Array(bytes)) };
  };
  await openBundle(page);
  const plain = await dl();
  expect(plain.name).toBe(`${BUNDLE_ID}.zip`);
  await page.getByRole('button', { name: 'Spooky', exact: true }).click();
  const spooky = await dl();
  const sheet = (z, id) => z.files.find((f) => f.name === `sprites/${id}/${id}.png`);
  for (const id of BUNDLE.sprites) {
    expect(sheet(plain, id), `${id} sheet`).toBeTruthy();
    expect(Buffer.from(sheet(spooky, id).data).equals(Buffer.from(sheet(plain, id).data)), `${id} sheet differs`).toBe(false);
  }
  const file = (z, name) => z.files.find((f) => f.name === name);
  for (const name of [...BUNDLE.sounds.map((id) => `sounds/${id}.wav`), ...BUNDLE.music.map((id) => `music/${id}.wav`)]) {
    expect(file(plain, name), name).toBeTruthy();
    expect(Buffer.from(file(spooky, name).data).equals(Buffer.from(file(plain, name).data)), `${name} differs under Spooky`).toBe(false);
  }
  const manifest = JSON.parse(new TextDecoder().decode(spooky.files.find((f) => f.name === 'manifest.json').data));
  expect(manifest.assets.map((a) => a.id).sort()).toEqual(allIds().sort());
  expect(manifest.theme.colour.outline).toBe('#0a0612');
  await expect(page.locator('.bundle-actions .status')).toContainText('Downloaded');
});

test('phone width: no sideways scroll, controls and previews still there', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openBundle(page);
  expect(await hasHorizontalScroll(page)).toBe(false);
  await expect(page.getByRole('button', { name: 'Surprise me' })).toBeVisible();
  await page.getByRole('button', { name: 'Surprise me' }).click();
  await settled(page);
  expect(await hasHorizontalScroll(page)).toBe(false);
});

test('an unknown bundle says so', async ({ page }) => {
  await openRoute(page, '/bundle/no-such-bundle');
  await expect(page.locator('main')).toContainText('That kit is not here');
});

test('50 sprites: a look change stays smooth', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 7000 });   // all 50 on screen at once: the worst case
  await page.route('**/generated/catalog.json', async (route) => {
    const res = await route.fetch();
    const c = await res.json();
    const sprites = c.assets.filter((a) => a.kind === 'sprite').map((a) => a.id);
    c.bundles.push({ id: 'fifty', name: 'Fifty sprites', gameType: 'any', level: 'kit', blurb: 'A test bundle.', sprites: Array.from({ length: 50 }, (_, i) => sprites[i % sprites.length]), sounds: [], music: [], theme: {} });
    await route.fulfill({ response: res, json: c });
  });
  await openRoute(page, '/bundle/fifty');
  await settled(page);
  expect(await pics(page).count()).toBe(50);
  const times = { colour: [], shapes: [] };
  for (const name of ['Frost', 'Candy', 'Night', 'Vivid', 'Spooky', 'Golden', 'Mono', 'Original']) {
    await page.getByRole('button', { name, exact: true }).click();
    await settled(page);
    times.colour.push(Number(await page.locator('main.bundle-page').getAttribute('data-look-ms')));
  }
  await page.getByRole('switch', { name: 'Also change shapes' }).check();
  await settled(page);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Surprise me' }).click();
    await settled(page);
    times.shapes.push(Number(await page.locator('main.bundle-page').getAttribute('data-look-ms')));
  }
  const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  console.log(`50 sprites, ms per look change: colours ${times.colour.map((t) => t.toFixed(1)).join(' ')} (median ${median(times.colour).toFixed(1)}); with shapes ${times.shapes.map((t) => t.toFixed(1)).join(' ')} (median ${median(times.shapes).toFixed(1)})`);
  expect(median(times.colour)).toBeLessThan(100);
});
