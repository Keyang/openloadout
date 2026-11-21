// A whole bundle customised at once (acceptance criterion 4: "user can customized the whole bundle").
// For EVERY bundle the catalogue lists (generated/catalog.json, read when the tests are collected, so a new bundle
// gets its own test with no edit here), one visitor:
//   opens the bundle, downloads it as it comes (the first original download),
//   picks a named look                 -> every sprite picture, every sound heard and every track changed,
//   presses "Surprise me" twice        -> two different looks,
//   presses "Start over"               -> the pictures and sounds are the original ones again,
//   adds the whole bundle to the bag with the named look,
//   on the bag page sees that look, changes it for the whole bag and changes it back,
//   sees the same look in the playground,
//   downloads the bag                  -> every sprite sheet, sound and track differs from the original download,
//                                         and the list in the package records the look,
//   presses "Start over" on the bag    -> a fresh download is byte for byte the first original download.
// The named look is chosen from the looks the site has (engine/theme.js): one that changes colours, sound and music.
// Run with: npx playwright test tests/e2e/whole-bundle.spec.mjs
import { test, expect as baseExpect, openRoute, waitForDrawn, canvasStats, setRange, downloadFrom } from '../helpers/test.mjs';
import { ROOT, readCatalogue, readPatches, catalogueOf, recordPlayed, heardAfter, playReady, playState, packageOf, sameBytes } from '../helpers/acceptance.mjs';
import { playerless } from '../helpers/kits.mjs';
import { loadPlans } from '../../tools/lib/assets.mjs';
import { THEME_PRESETS, PALETTES, normalizeTheme, defaultTheme } from '../../engine/theme.js';
import { shelvesOf } from '../../app/shelves.js';

// Many builders share this machine: anything the page is waited for gets 20 seconds, not the usual 5.
const expect = baseExpect.configure({ timeout: 20_000 });
// ... and a press on something that is not there gives up after 30 seconds instead of holding the whole test.
test.use({ actionTimeout: 30_000 });

// Pictures hold still on their first frame, so they can be compared.
test.use({ reducedMotion: 'reduce' });

// ---- the looks used: read from the site's own list of named looks -----------------------------------------
const NAMED = THEME_PRESETS.map((p) => ({ id: p.id, name: p.name, theme: normalizeTheme(p.theme) }));
const PLAIN = defaultTheme();
const differs = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
const hasPalette = (p) => typeof p.theme.colour.palette === 'string';
/** A look that changes all three: a colour set, the pitch of sounds, the speed of music. */
const LOOK = NAMED.find((p) => hasPalette(p) && p.theme.sound.pitch !== 0 && p.theme.music.tempo !== 1)
  ?? NAMED.find((p) => differs(p.theme.colour, PLAIN.colour) && differs(p.theme.sound, PLAIN.sound) && differs(p.theme.music, PLAIN.music));
/** Another look, to change the whole bag to and back. */
const OTHER = LOOK && (NAMED.find((p) => p.id !== LOOK.id && p.id !== 'original' && hasPalette(p)) ?? NAMED.find((p) => p.id !== LOOK.id && differs(p.theme.colour, PLAIN.colour)));
const ORIGINAL = NAMED.find((p) => !differs(p.theme.colour, PLAIN.colour) && !differs(p.theme.sound, PLAIN.sound) && !differs(p.theme.music, PLAIN.music));
// Under the look, at least this much of the playground scene is in the look's own colours (measured 2026-11-19: 0.09 to
// 0.31 over the bundles, the rest being the sky and the ground, held as what they are), and at least this much of it
// is another colour than without the look (measured: 0.99 to 1).
const PLAY_SHARE = 0.05, PLAY_CHANGED = 0.6;
// A kit with no player by design (its plan says view "none": a fixed screen) has a playground that is mostly its dark
// backdrop: measured 2026-11-21 on the falling-block puzzle at 0.041 under the Candy look.
const PLAY_SHARE_PLAYERLESS = 0.03;
const PLAYERLESS = new Set(loadPlans(ROOT).filter(({ plan }) => playerless(plan)).map(({ id }) => id));
const paletteOf = (look) => new Set((PALETTES.find((p) => p.name === look.theme.colour.palette)?.colours ?? []).map((c) => parseInt(c.slice(1), 16)));

const lookButton = (scope, look) => scope.getByRole('button', { name: look.name, exact: true });
const bagCount = (page) => page.locator('header .bag-count');
const lookInAddress = (page) => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] ?? '')));

/** Make the window as tall as the page, so every picture is on screen and drawn (the site only draws what can be seen). */
async function showEverything(page) {
  for (let i = 0; i < 4; i++) {
    const need = await page.evaluate(() => document.documentElement.scrollHeight);
    const have = page.viewportSize();
    if (need <= have.height) break;
    await page.setViewportSize({ width: have.width, height: Math.min(need + 200, 16000) });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
}

// ---- the bundle page ------------------------------------------------------------------------------------

/** Wait until every sprite picture has been drawn with the look the page now shows, and none failed to load. */
async function settled(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector('main.bundle-page');
    if (!main || !main.dataset.look) return false;
    return [...main.querySelectorAll('canvas.bundle-sprite-pic')].every((c) => c.dataset.look === main.dataset.look || c.closest('.broken'));
  }, null, { timeout: 60_000 });
  expect(await page.locator('.bundle-card.broken').evaluateAll((ns) => ns.map((n) => n.textContent)), 'sprites whose picture could not be loaded').toEqual([]);
}
/** Every sprite picture: { id: hash }, and how many pixels each has drawn. */
async function spritePictures(page) {
  await settled(page);
  return page.locator('canvas.bundle-sprite-pic').evaluateAll((cvs) => cvs.map((cv) => {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    let opaque = 0, h = 2166136261;
    for (let i = 0; i < data.length; i++) { if (i % 4 === 3 && data[i]) opaque++; h = Math.imul(h ^ data[i], 16777619); }
    return { id: cv.dataset.id, opaque, hash: (h >>> 0).toString(16) };
  }));
}
/** Press Play on every sound of the bundle, one after the other: { id: hash of what was played }. */
async function soundsHeard(page, bundle, rows) {
  const out = {};
  for (const id of bundle.sounds) {
    const card = page.locator(`.bundle-sound[data-id="${id}"]`);
    const button = card.locator('button.play');
    out[id] = await heardAfter(page, () => button.click(), { timeout: 30_000 });
    if (rows[id]?.tech.loop) await button.click();          // a loop plays until it is stopped
  }
  return out;
}
const trackLines = (page) => page.locator('.bundle-music').evaluateAll((ns) => Object.fromEntries(ns.map((n) => [n.dataset.id, n.querySelector('.bundle-tempo')?.textContent ?? ''])));

// ---- the bag page -----------------------------------------------------------------------------------------

/** The picture of every sprite in the bag, in order: [{ name, hash }]. Waits until every sprite has arrived. */
async function bagPictures(page, count) {
  await expect(page.locator('.bag-item')).toHaveCount(count);
  await expect(page.locator('.bag-item .bag-pic.pending')).toHaveCount(0, { timeout: 60_000 });
  // a row's picture is painted a moment after the row is made (and every row is made again when the look changes)
  await expect.poll(() => page.locator('.bag-item canvas.tile').evaluateAll((cvs) => cvs.every((cv) => cv.getContext('2d').getImageData(0, 0, 1, 1).data[3] === 255)),
    { message: 'every picture in the bag is painted', timeout: 60_000 }).toBe(true);
  return page.locator('.bag-item').evaluateAll((rows) => rows.filter((r) => r.querySelector('.bag-kind')?.textContent === 'Sprite').map((r) => {
    const cv = r.querySelector('canvas.tile');
    if (!cv) return { name: r.querySelector('.bag-name').textContent, hash: null };
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    let h = 2166136261;
    for (let i = 0; i < data.length; i++) h = Math.imul(h ^ data[i], 16777619);
    return { name: r.querySelector('.bag-name').textContent, hash: (h >>> 0).toString(16) };
  }));
}
const hashes = (list) => list.map((p) => p.hash);

// ---- the playground ------------------------------------------------------------------------------------------

/**
 * Open the playground from the bag, hold its scene still at its start, and read it:
 * { hash, share, sample } where share is how much of the scene is painted in colours of `palette` (a Set of 0xRRGGBB),
 * and sample is every 7th pixel's colour (0xRRGGBB), to compare two scenes by; or null when the bag has nothing to draw.
 */
async function playgroundScene(page, palette) {
  await page.getByRole('link', { name: 'Try these in the playground' }).click();
  await playReady(page);
  const stage = page.locator('canvas.play-stage');
  if (!(await stage.count())) return null;
  await page.getByRole('button', { name: 'Mute', exact: true }).click();      // nothing here needs to be heard
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.getByRole('button', { name: 'Reset the scene' }).click();
  let last = null;
  await expect.poll(async () => { const now = (await canvasStats(stage)).hash, same = now === last; last = now; return same; }, { message: 'the paused scene holds still', timeout: 20_000 }).toBe(true);
  const { share, sample } = await stage.evaluate((cv, colours) => {
    const set = new Set(colours);
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    let hit = 0;
    const sample = [];
    for (let i = 0, n = 0; i < data.length; i += 4, n++) {
      const v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      if (set.has(v)) hit++;
      if (n % 7 === 0) sample.push(v);
    }
    return { share: hit / (data.length / 4), sample };
  }, [...palette]);
  const state = await playState(page);
  await page.getByRole('button', { name: 'Unmute', exact: true }).click();
  return { hash: last, share, sample, muted: state.muted };
}

// ---- the packages ---------------------------------------------------------------------------------------------

const isAsset = (name) => /\.(png|wav)$/.test(name);
const withoutKeys = (manifest) => ({ ...manifest, assets: manifest.assets.map(({ key, ...rest }) => rest) });

// ---- the parts of a look, one at a time ------------------------------------------------------------------------------

const isSheet = (name) => name.endsWith('.png');
const isTrack = (name) => /^music\/.+\.wav$/.test(name);
const isEffect = (name) => name.endsWith('.wav') && !isTrack(name);            // sounds/<id>.wav and a sprite's own sounds/
const trackId = (name) => name.replace(/^music\//, '').replace(/(-\d+)?\.wav$/, '');
const control = (page, label) => page.locator('.bundle-look').getByLabel(label, { exact: true });
/**
 * One change to the look, made with the page's own controls, and which files of the download it must change.
 * (sound/theme.js: sound effects are re-pitched and made brighter or duller after they are made; a track takes the
 * pitch through its "key" control and the speed through its "bpm" control, and brightness like any other sound.)
 */
const PARTS = [
  {
    name: 'colours only', address: ['colours'],
    set: async (page) => { await control(page, 'Colour set').selectOption({ label: LOOK.theme.colour.palette }); },
    changes: (name) => isSheet(name),
  },
  {
    name: 'pitch only', address: ['pitch'],
    set: async (page) => { await setRange(control(page, 'Pitch'), 2); },
    changes: (name, patches) => isEffect(name) || (isTrack(name) && !!patches[trackId(name)]?.params.some((d) => d.id === 'key')),
  },
  {
    name: 'brightness only', address: ['bright'],
    set: async (page) => { await setRange(control(page, 'Brightness'), -0.4); },
    changes: (name) => isEffect(name) || isTrack(name),
  },
  {
    name: 'speed only', address: ['speed'],
    set: async (page) => { await setRange(control(page, 'Speed'), 1.2); },
    changes: (name, patches) => isTrack(name) && !!patches[trackId(name)]?.params.some((d) => d.id === 'bpm'),
  },
];

// ---- one test per bundle ------------------------------------------------------------------------------------------

const LISTED = readCatalogue().bundles;

test('the catalogue lists bundles, and the site has a named look that changes colours, sound and music', () => {
  expect(LISTED.length, 'bundles in generated/catalog.json').toBeGreaterThan(0);
  expect(LOOK, 'a named look that changes colours, sound and music').toBeTruthy();
  expect(OTHER, 'a second named look').toBeTruthy();
  expect(ORIGINAL, 'the named look that changes nothing').toBeTruthy();
});

for (const listed of LISTED) {
  test(`${listed.id}: one look restyles the whole bundle, in its previews, the bag, the playground and the download; Start over restores it exactly`, async ({ page }) => {
    const big = listed.sprites.length + listed.sounds.length + listed.music.length;
    test.setTimeout(240_000 + big * 12_000);
    const catalog = readCatalogue();
    const bundle = catalog.bundles.find((b) => b.id === listed.id);
    expect(bundle, `the bundle "${listed.id}" is still in generated/catalog.json`).toBeTruthy();
    const { byId: rows } = catalogueOf(catalog);
    const ids = [...new Set([...bundle.sprites, ...bundle.sounds, ...bundle.music])];
    expect(ids.length, 'the bundle holds something').toBeGreaterThan(0);
    const longDownload = { timeout: 120_000 + big * 6000 };
    await recordPlayed(page);

    // ---------------------------------------------------------------- open it from the list of bundles
    await openRoute(page, '/bundles');
    await page.locator(`a.card.kit[href="#/bundle/${bundle.id}"]`).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(bundle.name);
    await waitForDrawn(page);
    await showEverything(page);
    await expect(page.locator('canvas.bundle-sprite-pic')).toHaveCount(bundle.sprites.length);
    await expect(page.locator('.bundle-sound')).toHaveCount(bundle.sounds.length);
    await expect(page.locator('.bundle-music')).toHaveCount(bundle.music.length);

    const original = { sprites: await spritePictures(page), sounds: await soundsHeard(page, bundle, rows), tracks: await trackLines(page) };
    // the page shows every sprite of the bundle once, grouped under its headings (app/shelves.js), so in shelf order
    expect(original.sprites.map((s) => s.id)).toEqual(shelvesOf(bundle.sprites.map((id) => rows[id])).flatMap((g) => g.rows.map((r) => r.id)));
    expect(original.sprites.map((s) => s.id).sort()).toEqual(bundle.sprites.slice().sort());
    for (const s of original.sprites) expect(s.opaque, `${s.id} is drawn`).toBeGreaterThan(0);

    // ---------------------------------------------------------------- the first original download
    const first = packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download this kit' }).click(), longDownload));
    await expect(page.locator('.bundle-actions .status')).toContainText('Downloaded');
    const assetFiles = first.names.filter(isAsset);
    for (const id of bundle.sprites) expect(first.names, `${id}: its sheet`).toContain(`sprites/${id}/${id}.png`);
    for (const id of bundle.sounds) expect(first.names, `${id}: its sound file`).toContain(`sounds/${id}.wav`);
    for (const id of bundle.music) expect(first.names, `${id}: its music file`).toContain(`music/${id}.wav`);
    expect(first.json('manifest.json').theme, 'the original download has no look').toEqual(PLAIN);

    // ---------------------------------------------------------------- a named look: everything changes
    await lookButton(page, LOOK).click();
    await expect(lookButton(page, LOOK)).toHaveAttribute('aria-pressed', 'true');
    expect((await lookInAddress(page)).look).toBe(LOOK.id);
    const styled = { sprites: await spritePictures(page), sounds: await soundsHeard(page, bundle, rows), tracks: await trackLines(page) };
    const originalHash = Object.fromEntries(original.sprites.map((s) => [s.id, s.hash]));
    styled.sprites.forEach((s) => expect(s.hash, `the picture of ${s.id} changed under ${LOOK.name}`).not.toBe(originalHash[s.id]));
    for (const id of bundle.sounds) expect(styled.sounds[id], `${id} sounds different under ${LOOK.name}`).not.toBe(original.sounds[id]);
    for (const id of bundle.music) expect(styled.tracks[id], `${id} plays differently under ${LOOK.name}`).not.toBe(original.tracks[id]);

    // ---------------------------------------------------------------- "Surprise me" twice: two different looks
    const surprise = page.getByRole('button', { name: 'Surprise me' });
    await surprise.click();
    const one = { seed: (await lookInAddress(page)).surprise, sprites: await spritePictures(page) };
    await expect(lookButton(page, LOOK)).toHaveAttribute('aria-pressed', 'false');
    await surprise.click();
    const two = { seed: (await lookInAddress(page)).surprise, sprites: await spritePictures(page) };
    expect(one.seed ?? '', 'the address carries the number of the surprise').toMatch(/^\d+$/);
    expect(two.seed ?? '', 'the address carries the number of the surprise').toMatch(/^\d+$/);
    expect(two.seed, 'a new look each press').not.toBe(one.seed);
    if (bundle.sprites.length) {
      expect(hashes(two.sprites).join(), 'the second surprise looks different from the first').not.toBe(hashes(one.sprites).join());
      expect(hashes(one.sprites).join(), 'a surprise is not the original').not.toBe(hashes(original.sprites).join());
    }

    // ---------------------------------------------------------------- "Start over": the original, exactly
    await page.locator('.bundle-look').getByRole('button', { name: 'Start over' }).click();
    expect(await spritePictures(page), 'Start over puts every picture back').toEqual(original.sprites);
    expect(await lookInAddress(page), 'the address says nothing about a look').toEqual({});
    expect(await soundsHeard(page, bundle, rows), 'Start over puts every sound back').toEqual(original.sounds);
    expect(await trackLines(page)).toEqual(original.tracks);

    // ---------------------------------------------------------------- the whole bundle into the bag, with the look
    await lookButton(page, LOOK).click();
    await settled(page);
    await expect(bagCount(page)).toHaveText('0');
    await page.getByRole('button', { name: 'Add the whole kit to my bag' }).click();
    await expect(bagCount(page)).toHaveText(String(ids.length));
    await expect(page.locator('.bundle-actions .status')).toContainText('the whole bag has this look');
    await page.locator('.bundle-actions').getByRole('link', { name: 'Go to bag' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your bag');

    // ---------------------------------------------------------------- the bag shows the look, and can change it for everything in it
    const look = page.locator('.bag-look');
    await expect(lookButton(look, LOOK), `the bag shows the ${LOOK.name} look`).toHaveAttribute('aria-pressed', 'true');
    await showEverything(page);
    const inBag = await bagPictures(page, ids.length);
    expect(inBag.map((p) => p.name)).toEqual(bundle.sprites.map((id) => rows[id].name));
    for (const p of inBag) expect(p.hash, `${p.name} has a picture in the bag`).toBeTruthy();
    await lookButton(look, OTHER).click();
    await expect(lookButton(look, OTHER)).toHaveAttribute('aria-pressed', 'true');
    await expect(lookButton(look, LOOK)).toHaveAttribute('aria-pressed', 'false');
    // (the pictures are waited for: a page may repaint them in place a moment after the look is chosen)
    const stillAs = async (then) => (await bagPictures(page, ids.length)).filter((p, i) => p.hash === then[i].hash).map((p) => p.name);
    await expect.poll(() => stillAs(inBag), { message: `sprites whose picture in the bag did not change under ${OTHER.name}`, timeout: 60_000 }).toEqual([]);
    await lookButton(look, LOOK).click();
    await expect(lookButton(look, LOOK)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => bagPictures(page, ids.length), { message: `back to ${LOOK.name}: the same pictures as before`, timeout: 60_000 }).toEqual(inBag);

    // ---------------------------------------------------------------- the playground has the same look
    const palette = paletteOf(LOOK);
    const playedStyled = await playgroundScene(page, palette);
    if (bundle.sprites.length) {
      expect(playedStyled, 'the playground draws a scene').toBeTruthy();
      // A look with a colour set paints the scene in that set, except what must stay what it is: a sky stays a sky, grass
      // stays grass, skin stays skin (Contract 7; tests/e2e/looks.spec.mjs and tests/unit/looks-materials.test.mjs hold
      // that side). So a good part of the scene is in the set's colours, not all of it (the sky and the ground are most
      // of it); further down, without the look none of it is, and most of the scene's pixels are another colour.
      if (palette.size) expect(playedStyled.share, `how much of the playground scene is in the ${LOOK.name} colours`).toBeGreaterThanOrEqual(PLAYERLESS.has(listed.id) ? PLAY_SHARE_PLAYERLESS : PLAY_SHARE);
    }
    await page.getByRole('link', { name: 'Back to your bag' }).click();
    await expect(page.locator('.bag-item')).toHaveCount(ids.length);

    // ---------------------------------------------------------------- the download: every asset restyled, the look on record
    const styledZip = packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), longDownload));
    await expect(page.locator('.bag-export .status')).toContainText('Downloaded');
    expect(styledZip.names.slice().sort(), 'the same files as the original download').toEqual(first.names.slice().sort());
    const unchanged = assetFiles.filter((name) => sameBytes(styledZip.file(name), first.file(name)));
    expect(unchanged, `sprite sheets, sounds and tracks that the ${LOOK.name} look left as they were`).toEqual([]);
    const record = styledZip.json('manifest.json');
    expect(record.theme, 'the package records the look').toMatchObject({ colour: LOOK.theme.colour, sound: LOOK.theme.sound, music: LOOK.theme.music });
    expect(record.assets.map((a) => a.id).sort()).toEqual(ids.slice().sort());
    expect(styledZip.text('read-me.txt')).toContain('look applied');

    // ---------------------------------------------------------------- "Start over" on the bag: the original again, byte for byte
    await look.getByRole('button', { name: 'Start over' }).click();
    await expect(lookButton(look, LOOK)).toHaveAttribute('aria-pressed', 'false');
    await expect(lookButton(look, ORIGINAL)).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => stillAs(inBag), { message: `sprites whose picture in the bag still has the ${LOOK.name} look after Start over`, timeout: 60_000 }).toEqual([]);
    // a reload first, so nothing made earlier in this visit is reused: the bag kept its things and has no look
    await page.reload();
    await expect(page.locator('.bag-item')).toHaveCount(ids.length);
    await expect(lookButton(page.locator('.bag-look'), ORIGINAL)).toHaveAttribute('aria-pressed', 'true');
    const again = packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), longDownload));
    expect(again.names.slice().sort()).toEqual(first.names.slice().sort());
    const different = first.names.filter((name) => name !== 'manifest.json' && !sameBytes(again.file(name), first.file(name)));
    expect(different, 'files that are not byte for byte the first original download').toEqual([]);
    expect(withoutKeys(again.json('manifest.json')), 'the list in the package is the original one').toEqual(withoutKeys(first.json('manifest.json')));

    // ---------------------------------------------------------------- and the playground is back to the original colours
    const playedPlain = await playgroundScene(page, palette);
    if (playedStyled && playedPlain) {
      expect(playedPlain.hash, 'the playground scene looks different without the look').not.toBe(playedStyled.hash);
      // a look that silently left the playground alone would change none of it
      const changed = playedStyled.sample.filter((v, i) => v !== playedPlain.sample[i]).length / playedStyled.sample.length;
      expect(changed, `how much of the playground scene the ${LOOK.name} look recoloured`).toBeGreaterThanOrEqual(PLAY_CHANGED);
      if (palette.size) expect(playedPlain.share, `without the look the scene is not in the ${LOOK.name} colours`).toBeLessThan(playedStyled.share);
    }
  });
}

for (const listed of LISTED) {
  test(`${listed.id}: each part of a look (colours, pitch, brightness, speed) changes the files it should in the download, and no others`, async ({ page }) => {
    const big = listed.sprites.length + listed.sounds.length + listed.music.length;
    test.setTimeout(240_000 + big * 15_000);
    const bundle = readCatalogue().bundles.find((b) => b.id === listed.id);
    expect(bundle, `the bundle "${listed.id}" is still in generated/catalog.json`).toBeTruthy();
    expect(typeof LOOK?.theme.colour.palette, 'a named look with a colour set, to take the colour set from').toBe('string');
    const patches = readPatches();
    const download = async () => packageOf(await downloadFrom(page, () => page.getByRole('button', { name: 'Download this kit' }).click(), { timeout: 120_000 + big * 6000 }));

    await openRoute(page, `/bundle/${bundle.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(bundle.name);
    await expect(page.locator('main.bundle-page')).toHaveAttribute('data-look', 'original');
    // the fine-tuning starts folded (journey J6.1): open it to reach its controls
    await page.locator('.bundle-look summary').click();
    await expect(control(page, 'Colour set')).toBeVisible();
    const first = await download();
    const assets = first.names.filter(isAsset);
    expect(first.json('manifest.json').theme).toEqual(PLAIN);

    for (const part of PARTS) {
      await page.locator('.bundle-look').getByRole('button', { name: 'Start over' }).click();
      expect(await lookInAddress(page)).toEqual({});
      await part.set(page);
      // the address says what the look is: this one thing and nothing else
      await expect.poll(async () => Object.keys(await lookInAddress(page)), { message: `${part.name}: the look differs from the original in this alone` }).toEqual(part.address);
      const zip = await download();
      expect(zip.names.slice().sort(), `${part.name}: the same files as the original download`).toEqual(first.names.slice().sort());
      const should = assets.filter((name) => part.changes(name, patches));
      const did = assets.filter((name) => !sameBytes(zip.file(name), first.file(name)));
      expect(should.filter((name) => !did.includes(name)), `${part.name}: files it should have changed and left as they were`).toEqual([]);
      expect(did.filter((name) => !should.includes(name)), `${part.name}: files it changed and should have left byte for byte as they were`).toEqual([]);
      // the list in the package records exactly this look
      const theme = zip.json('manifest.json').theme;
      const parts = { colours: differs(theme.colour, PLAIN.colour), sound: differs(theme.sound, PLAIN.sound), music: differs(theme.music, PLAIN.music) };
      expect(parts, `${part.name}: what the package says the look changes`).toEqual({ colours: part.address[0] === 'colours', sound: ['pitch', 'bright'].includes(part.address[0]), music: part.address[0] === 'speed' });
    }
  });
}
