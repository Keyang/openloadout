// Styles on the live site (docs/architecture.md, Contract 12; task W6-A).
//   - every existing sprite still exports byte for byte what it exported before the style seam;
//   - a sprite with one style shows nothing new;
//   - a sprite with several styles gets a "Style" choice, and the preview, the strip, the link, the bag item
//     and the download all follow it;
//   - a style a sprite does not list is never offered and is refused when asked for.
// The two extra styles and the two sprites that list them are test fixtures (tests/fixtures/styles/), not part of the
// site. Until build item B11 they were made on the page with loadout.make.sprite(source); make.sprite now takes data
// only (docs/data-sprites.md section 5), and a data sprite is drawn in the pixel style alone until a draw-list renderer
// for another style exists (section 2.8, "Styles"). So the test serves the two fixtures as library sprites instead:
// two rows added to generated/catalog.json, built by the site's own catalogue builder (tools/lib/catalog.mjs), and each
// fixture served as sprites/<id>.js. The page, the link, the bag and the download treat them as any library sprite with
// several styles; the API does not (see below).
// A sprite made on the page is data now (make.sprite, build items B11, B11b): the last test makes one and takes it through
// the same seam (its page, render, its bag item, its link, the single download and a bag package next to a fixture in
// another style). A data sprite lists the pixel style only, so the validator refuses one that lists another.
// The two fixtures are code, and the api takes data only (Keyang: the code way is gone): loadout.check and loadout.render refuse
// them with the data-only message, and the test 'the api takes data only' below asserts that. So the fixtures serve the
// page tests only (the page, the style switcher, the catalogue row styles, the bag, the link, the download). What the api says
// about a style a sprite cannot be drawn in is tested on a library data sprite. Multi-style drawing through the api needs a
// second (draw-list) renderer; until then no data sprite lists a style other than pixel.
// Needs a built site. Run with: npx playwright test tests/e2e/styles.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, openRoute, waitForDrawn, canvasGroupStats, downloadFrom, readZip, showControl } from '../helpers/test.mjs';
import { ROOT } from '../helpers/catalog.mjs';
import { goodData } from '../fixtures/api/data.mjs';
import { buildCatalog } from '../../tools/lib/catalog.mjs';
import blobDef from '../fixtures/styles/blob.js';
import sparkleDef from '../fixtures/styles/sparkle.js';

const fixture = (name) => fs.readFileSync(path.join(ROOT, 'tests/fixtures/styles', name), 'utf8')
  // written to sit in tests/fixtures/styles/; served as a file in sprites/
  .replaceAll("'../../../engine/", "'../engine/").replace("'./styles.js'", "'../tests/fixtures/styles/styles.js'");
const SOURCES = { 'style-blob': fixture('blob.js'), 'style-sparkle': fixture('sparkle.js') };
// their catalogue rows, as the build writes them; no thumbnail or strip picture (the pages draw them from the sprite)
const ROWS = buildCatalog({ sprites: [{ id: 'style-blob', file: 'sprites/style-blob.js', def: blobDef }, { id: 'style-sparkle', file: 'sprites/style-sparkle.js', def: sparkleDef }] })
  .assets.map((row) => ({ ...row, thumb: null, strip: null }));
const text = (bytes) => new TextDecoder().decode(bytes);

/**
 * Serve the two fixture sprites as library sprites (see the top), on this page and in its workers, from now on and
 * across reloads. (The quality bar on the fixtures is held by tests/unit/styles-quality.test.mjs.) Call it before the page opens.
 */
async function serveFixtures(page) {
  // The site loads no code sprite any more (app/catalog.js, build item Z1), and a data sprite is drawn in the pixel style alone until a draw-list
  // renderer for another style exists (docs/data-sprites.md 2.8), so the only multi-style sprites are these two code fixtures. The page is served
  // a copy of app/catalog.js that imports a code file for a row that names one: this test's own seam, in the served text only. The product has none.
  await page.context().route(/\/app\/catalog\.js(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    const from = [
      "if (typeof src !== 'string' || !src.endsWith('.json')) return Promise.reject(",
      'const p = loadDataFile(src).then(',
    ];
    let body = await res.text();
    for (const line of from) if (!body.includes(line)) throw new Error(`styles.spec: app/catalog.js no longer has "${line}": update the test's copy of the loader`);
    body = body.replace(from[0], "if (false) return Promise.reject(").replace(from[1], 'const p = (src.endsWith(\'.json\') ? loadDataFile(src) : import(`../sprites/${id}.js`).then((m) => m.default)).then(');
    await route.fulfill({ response: res, body });
  });
  await page.context().route(/\/generated\/catalog\.json(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    const catalog = await res.json();
    catalog.assets = [...catalog.assets.filter((a) => !SOURCES[a.id]), ...ROWS];
    await route.fulfill({ response: res, json: catalog });
  });
  await page.context().route(/\/sprites\/style-(blob|sparkle)\.js(\?.*)?$/, (route) => {
    const id = /\/sprites\/(style-[a-z]+)\.js/.exec(route.request().url())[1];
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: SOURCES[id] });
  });
}
/** What the api does with the two code fixtures: loadout.check and loadout.render refuse both, in the data-only words. */
async function askApiAboutFixtures(page) {
  return page.evaluate(async () => {
    const L = window.loadout, out = {};
    for (const id of ['style-blob', 'style-sparkle']) out[id] = { check: await L.check(id), render: await L.render(id, { frame: 0 }), styled: await L.render(id, { frame: 0, artStyle: 'silhouette' }) };
    return out;
  });
}
// the Style choice is in the editing panel's Look tab (app/panel.js)
const pressed = (page) => page.locator('.style-choice .chip[aria-pressed="true"]');
const lookTab = (page) => page.getByRole('tab', { name: 'Look', exact: true });
const inBag = (page) => expect(page.locator('.rx-panel .saved')).toContainText('Saved in your bag');
const strip = (page) => canvasGroupStats(page.locator('.strip canvas'));
/** How many different colours the frame strip shows. */
const stripColours = (page) => page.locator('.strip canvas').evaluateAll((cvs) => {
  const seen = new Set();
  for (const cv of cvs) {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < data.length; i += 4) if (data[i + 3]) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  return seen.size;
});

// Frozen hashes were dropped here too (2026-11-18): a deliberate change to a rig or helper made them fail. The export is
// compared with what the old renderer makes right now, written through the same browser PNG writer the export uses.
test('existing sprites export exactly what the renderer made before the style seam: the same PNG bytes and the same JSON', async ({ page }) => {
  await openRoute(page, '/');
  const got = await page.evaluate(async () => {
    const [bundle, catalog, audio, S, T, old, info] = await Promise.all([import('/app/bundle.js'), import('/app/catalog.js'), import('/app/audio.js'), import('/engine/sprite.js'), import('/engine/theme.js'), import('/tests/fixtures/styles/legacy-render.mjs'), import('/engine/sheet-info.js')]);
    const cat = await catalog.loadCatalog();
    await audio.loadSounds();
    const dec = new TextDecoder();
    // the export's own PNG writer, as it was before the seam
    const png = async (sheet) => {
      const cv = document.createElement('canvas');
      cv.width = sheet.w; cv.height = sheet.h;
      cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(sheet.data.buffer), sheet.w, sheet.h), 0, 0);
      return new Uint8Array(await (await new Promise((r) => cv.toBlob(r, 'image/png'))).arrayBuffer());
    };
    const same = (p, q) => p.length === q.length && p.every((v, i) => v === q[i]);
    const ids = cat.assets.filter((a) => a.kind === 'sprite').map((a) => a.id);
    const pick = [...new Set(['knight', 'coin', 'slime', 'tiles-forest', 'bg-forest', 'ui-dialogue', 'hero-walker', ...ids.slice(0, 5)])].filter((id) => ids.includes(id));
    const differ = [], compared = [];
    for (const id of pick) {
      let sprite;
      try { sprite = await catalog.loadSprite(id); } catch { continue; }        // a file another builder has half-written
      const look = { colour: { palette: 'Frost' } };
      for (const [name, p, scale, theme] of [['defaults', S.defaultParams(sprite), 1, null], ['random, 2x, Frost look', S.randomParams(sprite, 4242), 2, look]]) {
        let before;
        try { before = old.legacyRenderSheet(sprite, p, { scale }); } catch { continue; }    // it fails with or without the seam
        if (theme) T.applyColour(before.data, theme.colour, T.spriteMaterials(sprite, p));      // a look recolours a sprite knowing what each colour is of (Contract 7)
        const files = await bundle.spriteFiles(sprite, p, bundle.defaultCues(sprite), scale, theme);
        const meta = JSON.parse(dec.decode(files.find((f) => f.name === `${id}.json`).data));
        delete meta.sounds;
        if (!same(files.find((f) => f.name === `${id}.png`).data, await png(before))) differ.push(`${id} (${name}): PNG`);
        // the download says what kind of sheet it is on top of what the renderer wrote (engine/sheet-info.js, added after
        // the seam): the old renderer's JSON gets the same description, so everything the renderer wrote is still compared
        if (JSON.stringify(meta, null, 2) !== JSON.stringify(info.describeSheet(sprite, before.meta, p), null, 2)) differ.push(`${id} (${name}): JSON`);
        if (files.some((f) => /\.svg$/.test(f.name)) || files[0].name !== `${id}.png` || files[1].name !== `${id}.json`) differ.push(`${id} (${name}): file list`);
      }
      compared.push(id);
    }
    return { differ, compared };
  });
  test.info().annotations.push({ type: 'compared', description: got.compared.join(', ') });
  expect(got.compared.length, 'at least six sprites compared').toBeGreaterThanOrEqual(6);
  expect(got.differ).toEqual([]);
});

test('a sprite with one style shows nothing new: no Style choice, no style in its link, its bag item or its files', async ({ page }) => {
  await openRoute(page, '/sprite/coin');
  await expect(page.locator('.style-choice')).toHaveCount(0);
  await expect(lookTab(page)).toHaveCount(1);      // the Look tab holds the whole-set looks; a sprite with one style has no Style choice in it
  await expect(lookTab(page).locator('.dot')).toBeHidden();
  await page.getByRole('button', { name: 'Add to my bag' }).click();
  await inBag(page);
  const item = await page.evaluate(async () => (await window.loadout.bag.items()).items[0]);
  expect(Object.keys(item.settings)).toEqual(['params', 'cues', 'scale']);
  expect(page.url()).not.toContain('artstyle=');
  // asking for its one style by name is fine; any other is refused
  const got = await page.evaluate(async () => [await window.loadout.render('coin', { artStyle: 'pixel' }), await window.loadout.render('coin'), await window.loadout.render('coin', { artStyle: 'flat' })]);
  expect(got[0].ok).toBe(true);
  expect(got[0].png).toBe(got[1].png);
  expect(got[1].artStyle).toBe('pixel');
  expect(got[2]).toMatchObject({ ok: false });
  expect(got[2].errors[0]).toMatch(/"coin" cannot be drawn in the style "flat".*pixel/);
  const file = await downloadFrom(page, () => page.locator('.rx-panel [data-act="download"]').click());
  const files = readZip(file.bytes);
  expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['coin.png', 'coin.json', 'how-to-use.txt']));
  expect('artStyle' in JSON.parse(text(files.find((f) => f.name === 'coin.json').data))).toBe(false);
});

test('the shipped site knows two styles, and says so on window.loadout', async ({ page }) => {
  await openRoute(page, '/');
  const got = await page.evaluate(async () => {
    const api = await window.loadout.api;
    const render = api.actions.find((a) => a.name === 'render'), add = api.actions.find((a) => a.name === 'bag_add');
    return { styles: api.styles, render: render.inputSchema.properties.options.properties.artStyle, add: add.inputSchema.properties.settings.description, coin: (await window.loadout.assets.get('coin')).asset.styles };
  });
  expect(got.styles.map((s) => s.id)).toEqual(['pixel', 'flat']);
  expect(got.styles[0]).toMatchObject({ label: 'Pixel art', exports: ['sheet'] });
  expect(got.styles[1]).toMatchObject({ label: 'Flat', exports: ['sheet'] });
  expect(got.render.description).toMatch(/Sprites: the art style/);
  expect(got.add).toMatch(/artStyle/);
  expect(got.coin).toEqual(['pixel']);
});

test('a sprite with three styles: the Style choice has a tab of its own, in plain words, and the pictures follow it', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  await page.evaluate(() => window.loadout.go('/sprite/style-blob'));
  await waitForDrawn(page);
  const choice = page.locator('.style-choice');
  // its own tab, the last one, with no change dot while the sprite is in its first style
  await expect(page.locator('.rx-panel [role="tab"]').last()).toHaveText('Look');
  await expect(lookTab(page).locator('.dot')).toBeHidden();
  await lookTab(page).click();
  await expect(choice.getByRole('group', { name: 'Style' })).toBeVisible();
  await expect(choice.locator('.chip')).toHaveText(['Pixel art', 'Silhouette', 'Outlined shapes']);
  await expect(pressed(page)).toHaveText('Pixel art');
  await expect(choice.locator('.style-about')).toHaveText('Square pixels on a small grid, with a dark outline and three tones of shading.');
  expect(page.url()).not.toContain('artstyle=');

  const pixel = await strip(page);
  expect(await stripColours(page)).toBeGreaterThan(4);

  await choice.getByRole('button', { name: 'Silhouette' }).click();
  await expect(pressed(page)).toHaveText('Silhouette');
  await expect(choice.locator('.style-about')).toHaveText('Only the outline shape, filled with one dark colour.');
  const flat = await strip(page);
  expect(flat.hash).not.toBe(pixel.hash);
  expect(flat.opaque).toBe(pixel.opaque);                    // the same shape
  expect(await stripColours(page)).toBe(1);                   // in one colour
  await expect.poll(() => page.url()).toContain('artstyle=silhouette');

  await choice.getByRole('button', { name: 'Outlined shapes' }).click();
  const shapes = await strip(page);
  expect(shapes.hash).not.toBe(pixel.hash);
  expect(shapes.hash).not.toBe(flat.hash);
  expect(shapes.opaque).toBeGreaterThan(0);
  await expect.poll(() => page.url()).toContain('artstyle=outline-svg');

  // a control still redraws in the chosen style
  await expect(lookTab(page).locator('.dot')).toBeVisible();      // another style than the first is a change
  await (await showControl(page, 'ears')).getByRole('button', { name: 'Long' }).click();
  expect((await strip(page)).hash).not.toBe(shapes.hash);

  // "Start over" goes back to the sprite's first style
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(pressed(page)).toHaveText('Pixel art');
  expect((await strip(page)).hash).toBe(pixel.hash);
  await expect.poll(() => page.url()).not.toContain('artstyle=');
});

test('the style travels: in the link, in the bag item, through a reload and a shared bag link', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  await page.evaluate(() => window.loadout.go('/sprite/style-blob?artstyle=silhouette&tail=false'));
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Silhouette');
  expect(await stripColours(page)).toBe(1);
  const before = await strip(page);

  await page.getByRole('button', { name: 'Add to my bag' }).click();
  await inBag(page);
  let item = await page.evaluate(async () => (await window.loadout.bag.items()).items[0]);
  expect(item.settings.artStyle).toBe('silhouette');
  expect(item.settings.params.tail).toBe(false);

  // reload: the sprite comes back from the bag, and the page opens in the link's style
  await page.reload();
  await waitForDrawn(page);
  await expect(page.getByRole('heading', { name: 'Style test blob', level: 1 })).toBeVisible();
  await expect(pressed(page)).toHaveText('Silhouette');
  expect((await strip(page)).hash).toBe(before.hash);
  item = await page.evaluate(async () => (await window.loadout.bag.items()).items[0]);
  expect(item.settings.artStyle).toBe('silhouette');

  // opened from the bag ("Change") the page takes the item's style, and a new choice is saved to that item as it is made
  await page.evaluate((key) => window.loadout.go(`/sprite/style-blob?bag=${key}`), item.key);
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Silhouette');
  await lookTab(page).click();
  await page.locator('.style-choice').getByRole('button', { name: 'Outlined shapes' }).click();
  await expect.poll(async () => (await page.evaluate(async () => (await window.loadout.bag.items()).items[0])).settings.artStyle).toBe('outline-svg');
  expect(await page.evaluate(async () => (await window.loadout.bag.items()).items.length)).toBe(1);
  // back to the first style: the item no longer names one
  await page.locator('.style-choice').getByRole('button', { name: 'Pixel art' }).click();
  await expect.poll(async () => 'artStyle' in (await page.evaluate(async () => (await window.loadout.bag.items()).items[0])).settings).toBe(false);

  // the whole bag as a link, read back into an empty bag
  const round = await page.evaluate(async () => {
    const { createBag, memoryStorage, bag } = await import('/app/bag.js');
    const item = bag.items()[0];
    bag.update(item.key, { ...item.settings, artStyle: 'silhouette' });
    const other = createBag(memoryStorage());
    other.fromLink(bag.toLink());
    return other.items()[0].settings;
  });
  expect(round.artStyle).toBe('silhouette');
});

test('the download follows the style: a marked PNG sheet for the finish-only style, SVG files for the shape style', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  await page.evaluate(() => window.loadout.go('/sprite/style-blob'));
  await waitForDrawn(page);
  const get = async () => readZip((await downloadFrom(page, () => page.locator('.rx-panel [data-act="download"]').click())).bytes);
  const json = (files) => JSON.parse(text(files.find((f) => f.name === 'style-blob.json').data));

  const pixel = await get();
  expect(pixel.map((f) => f.name)).toEqual(['style-blob.png', 'style-blob.json', 'how-to-use.txt']);
  expect('artStyle' in json(pixel)).toBe(false);
  await expect(page.locator('.status')).toContainText('the sprite sheet');

  await lookTab(page).click();
  await page.locator('.style-choice').getByRole('button', { name: 'Silhouette' }).click();
  const flat = await get();
  expect(flat.map((f) => f.name)).toEqual(['style-blob.png', 'style-blob.json', 'how-to-use.txt']);
  expect(json(flat).artStyle).toBe('silhouette');
  expect(json(flat).image).toBe('style-blob.png');
  expect(Buffer.from(flat[0].data).equals(Buffer.from(pixel[0].data))).toBe(false);

  await page.locator('.style-choice').getByRole('button', { name: 'Outlined shapes' }).click();
  const shapes = await get();
  const svgs = shapes.filter((f) => f.name.endsWith('.svg'));
  expect(svgs.length).toBe(10);                               // 4 idle frames and 6 hop frames
  expect(svgs.map((f) => f.name)).toEqual(expect.arrayContaining(['frames/idle_0.svg', 'frames/hop_5.svg']));
  expect(shapes.some((f) => f.name.endsWith('.png'))).toBe(false);
  expect(text(svgs[0].data)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 32"/);
  const meta = json(shapes);
  expect(meta.artStyle).toBe('outline-svg');
  expect('image' in meta).toBe(false);
  expect(meta.frames.map((f) => f.file)).toEqual(svgs.map((f) => f.name));
  expect(text(shapes.find((f) => f.name === 'how-to-use.txt').data)).toContain('"Outlined shapes" style');
  await expect(page.locator('.status')).toContainText('10 pictures in the "Outlined shapes" style');
  // the SVG really is a picture: the browser draws it
  const drawn = await page.evaluate(async (svg) => {
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
    return { width: img.naturalWidth, opaque };
  }, text(svgs[0].data));
  expect(drawn.opaque).toBeGreaterThan(200);
});

test('the bag package: each item in its own style, and the manifest says which', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  const built = await page.evaluate(async () => {
    const L = window.loadout;
    const added = [await L.bag.add('style-blob', { artStyle: 'outline-svg', scale: 2 }), await L.bag.add('style-blob', { artStyle: 'silhouette' }), await L.bag.add('style-blob', { artStyle: 'pixel' }), await L.bag.add('coin')];
    const refused = [await L.bag.add('style-sparkle', { artStyle: 'outline-svg' }), await L.bag.add('coin', { artStyle: 'silhouette' }), await L.bag.add('style-blob', { artStyle: 7 })];
    return { added, refused, zip: await L.bag.download({ save: false, data: true }) };
  });
  expect(built.added.map((a) => a.ok)).toEqual([true, true, true, true]);
  expect(built.added.map((a) => a.item.settings.artStyle ?? null)).toEqual(['outline-svg', 'silhouette', null, null]);   // the first style is not stored
  for (const r of built.refused) expect(r.ok).toBe(false);
  expect(built.refused[0].errors[0]).toMatch(/"style-sparkle" cannot be drawn in the style "outline-svg"\. Its styles are: pixel, silhouette\./);
  expect(built.zip.ok, JSON.stringify(built.zip.errors)).toBe(true);
  const files = readZip(Buffer.from(built.zip.zip.split(',')[1], 'base64'));
  const names = files.map((f) => f.name);
  const manifest = JSON.parse(text(files.find((f) => f.name === 'manifest.json').data));
  const [shapes, flat, pixel, coin] = manifest.assets;
  expect(shapes).toMatchObject({ id: 'style-blob', artStyle: 'outline-svg', folder: 'sprites/style-blob/', animations: 'sprites/style-blob/style-blob.json' });
  expect('sheet' in shapes).toBe(false);
  expect(shapes.files.filter((f) => f.endsWith('.svg')).length).toBe(10);
  expect(names).toContain('sprites/style-blob/frames/idle_0.svg');
  expect(text(files.find((f) => f.name === 'sprites/style-blob/frames/idle_0.svg').data)).toContain('width="64" height="64"');   // the item's own size
  expect(flat).toMatchObject({ artStyle: 'silhouette', sheet: 'sprites/style-blob-2/style-blob.png' });
  expect(JSON.parse(text(files.find((f) => f.name === 'sprites/style-blob-2/style-blob.json').data)).artStyle).toBe('silhouette');
  expect('artStyle' in pixel).toBe(false);
  expect(pixel.sheet).toBe('sprites/style-blob-3/style-blob.png');
  expect('artStyle' in coin).toBe(false);
  expect('unsupported' in manifest).toBe(false);

  // an item that names a style its sprite does not list (a hand-made link) is left out and named, never drawn in another style
  const crafted = await page.evaluate(async () => {
    const [{ bag }, { packageFiles }] = await Promise.all([import('/app/bag.js'), import('/app/bundle.js')]);
    bag.clear();
    bag.add({ kind: 'sprite', id: 'style-sparkle', settings: { params: {}, artStyle: 'outline-svg' } });
    bag.add({ kind: 'sprite', id: 'style-sparkle', settings: { params: {}, artStyle: 'silhouette' } });
    const files = await packageFiles({ items: bag.items(), theme: bag.theme(), scale: 1 });
    return { names: files.map((f) => f.name), manifest: JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json').data)) };
  });
  expect(crafted.manifest.unsupported).toEqual([{ id: 'style-sparkle', artStyle: 'outline-svg' }]);
  expect(crafted.manifest.assets.map((a) => a.artStyle)).toEqual(['silhouette']);
  expect(crafted.names.some((n) => n.endsWith('.svg'))).toBe(false);
});

test('a sprite of single pixels lists two styles: the shape style is never offered there, and is refused when asked for', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  await page.evaluate(() => window.loadout.go('/sprite/style-sparkle'));
  await waitForDrawn(page);
  await expect(page.locator('.style-choice .chip')).toHaveText(['Pixel art', 'Silhouette']);
  await expect(page.locator('.style-choice').getByRole('button', { name: 'Outlined shapes' })).toHaveCount(0);
  // a link that names it opens in the sprite's first style instead
  await page.evaluate(() => window.loadout.go('/sprite/style-sparkle?artstyle=outline-svg'));
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Pixel art');

  const got = await page.evaluate(async () => {
    const L = window.loadout;
    return {
      rows: await Promise.all(['style-blob', 'style-sparkle'].map(async (id) => [id, (await L.assets.get(id)).asset.styles])),
      get: (await L.assets.get('style-sparkle')).asset.styles,
    };
  });
  expect(got.rows).toEqual([['style-blob', ['pixel', 'silhouette', 'outline-svg']], ['style-sparkle', ['pixel', 'silhouette']]]);
  expect(got.get).toEqual(['pixel', 'silhouette']);
});

test('the api takes data only: check and render refuse the two code fixtures in the data-only words, never drawing them', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  const got = await askApiAboutFixtures(page);
  for (const id of ['style-blob', 'style-sparkle']) {
    for (const [what, r] of Object.entries(got[id])) {
      expect(r.ok, `${id} ${what}`).toBe(false);
      expect(r.errors[0], `${id} ${what}`).toMatch(new RegExp(`^"${id}" is not a data sprite \\(its catalogue row names "sprites/${id}\\.js"\\)\\. Loadout sprites are data: `));
      expect(r.png, `${id} ${what}`).toBeUndefined();
    }
  }
});

test('a library data sprite lists the pixel style only: another style, or an unknown one, is refused by name and never swapped', async ({ page }) => {
  // This is the api-level form of "a style a sprite cannot be drawn in gives the 'cannot be drawn in the style <name>' message".
  // A data sprite is drawn in the pixel style alone (engine/draw-list.js; other styles come with their renderer), so every
  // library sprite lists ['pixel'], and any other style is refused. Drawing in several styles through the api needs a second
  // renderer; until then the two code fixtures stay for the page tests above only.
  await openRoute(page, '/');
  const got = await page.evaluate(async () => {
    const L = window.loadout;
    return {
      styles: (await L.assets.get('coin')).asset.styles,
      outline: await L.render('coin', { frame: 0, artStyle: 'outline-svg' }),
      flat: await L.render('coin', { frame: 0, artStyle: 'silhouette' }),
      unknown: await L.render('coin', { frame: 0, artStyle: 'watercolour' }),
      notText: await L.render('coin', { frame: 0, artStyle: 7 }),
      pixel: await L.render('coin', { frame: 0, artStyle: 'pixel' }),
      plain: await L.render('coin', { frame: 0 }),
      viaCall: await L.call('render', { id: 'coin', options: { artStyle: 'outline-svg', frame: 0 } }),
    };
  });
  expect(got.styles).toEqual(['pixel']);
  expect(got.outline.ok).toBe(false);
  expect(got.outline.errors[0]).toMatch(/"coin" cannot be drawn in the style "outline-svg"\. Its styles are: pixel\./);
  expect(got.flat.ok).toBe(false);
  expect(got.flat.errors[0]).toMatch(/"coin" cannot be drawn in the style "silhouette"\. Its styles are: pixel\./);
  expect(got.unknown.ok).toBe(false);
  expect(got.unknown.errors[0]).toMatch(/"coin" cannot be drawn in the style "watercolour"\. Its styles are: pixel\./);
  expect(got.notText.ok).toBe(false);
  expect(got.notText.errors[0]).toMatch(/"coin" cannot be drawn in the style the number 7\. Its styles are: pixel\./);
  expect(got.pixel).toMatchObject({ ok: true, artStyle: 'pixel' });
  expect(got.pixel.png).toBe(got.plain.png);
  expect(got.viaCall.ok).toBe(false);
  expect(got.viaCall.errors[0]).toMatch(/"coin" cannot be drawn in the style "outline-svg"/);
});

// (Retired in B11: "a sprite made on the page whose own code reads pixels back gets the warning". make.sprite takes
// data only, and data cannot read pixels back, so the warning has nothing left to catch on the page; the read-back
// tracing itself goes in P4, docs/data-sprites.md section 5.)
test('a sprite with a control called "style" and two art styles: both travel in the link, each under its own name', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  await page.evaluate(() => window.loadout.go('/sprite/style-sparkle?style=cross&artstyle=silhouette'));
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Silhouette');
  await expect(page.locator('[data-control="style"] .chip[aria-pressed="true"]')).toHaveText('Cross');
  expect(await stripColours(page)).toBe(1);
  const cross = await strip(page);
  await (await showControl(page, 'style')).getByRole('button', { name: 'Spiral' }).click();
  expect((await strip(page)).hash).not.toBe(cross.hash);
  await expect.poll(() => page.url()).toContain('style=spiral');
  expect(page.url()).toContain('artstyle=silhouette');
  await inBag(page);      // the change saved itself
  const item = await page.evaluate(async () => (await window.loadout.bag.items()).items[0]);
  expect(item.settings.params.style).toBe('spiral');
  expect(item.settings.artStyle).toBe('silhouette');
});

test('the bag page and the playground draw a bag item in its art style; its "Open its page" link carries it', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  const keys = await page.evaluate(async () => [(await window.loadout.bag.add('style-blob', { artStyle: 'silhouette' })).key, (await window.loadout.bag.add('style-blob')).key]);
  const colours = (locator) => locator.evaluate((cv) => {
    const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), seen = new Set();
    for (let i = 0; i < data.length; i += 4) if (data[i + 3]) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return seen.size;
  });
  await page.evaluate(() => window.loadout.go('/bag'));
  await waitForDrawn(page);
  const row = (key) => page.locator(`.bag-item[data-key="${key}"]`);
  // the tile has a backdrop, so compare the two: the pixel version adds several colours more than the silhouette does
  await expect.poll(async () => (await colours(row(keys[1]).locator('canvas').first())) - (await colours(row(keys[0]).locator('canvas').first()))).toBeGreaterThan(2);
  await expect(row(keys[0])).toContainText('Silhouette');
  await expect(row(keys[1])).not.toContainText('Pixel art');
  expect(await row(keys[0]).getByRole('link', { name: /^Open the page of/ }).getAttribute('href')).toContain('artstyle=silhouette');
  expect(await row(keys[1]).getByRole('link', { name: /^Open the page of/ }).getAttribute('href')).not.toContain('artstyle=');
  // the playground paints each bag item in its own art style
  const painted = await page.evaluate(async () => {
    const [{ createPainter }, { loadSprite }, S] = await Promise.all([import('/app/play/draw.js'), import('/app/catalog.js'), import('/engine/sprite.js')]);
    const sprite = await loadSprite('style-blob'), params = S.defaultParams(sprite);
    const painter = createPainter({ sprites: { a: { sprite, params, artStyle: 'silhouette' }, b: { sprite, params } }, colour: {} });
    const count = (cv) => { const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height), seen = new Set(); for (let i = 0; i < data.length; i += 4) if (data[i + 3]) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]); return seen.size; };
    return [count(painter.frame('a', 'idle', 0)), count(painter.frame('b', 'idle', 0))];
  });
  expect(painted[0]).toBe(1);
  expect(painted[1]).toBeGreaterThan(4);
  await page.evaluate(() => window.loadout.go('/play'));
  await waitForDrawn(page);
});

test('a sprite made on the page as data goes through the style seam in its one style, and a style it cannot be drawn in is refused', async ({ page }) => {
  await serveFixtures(page);
  await openRoute(page, '/');
  const made = await page.evaluate(async ([data, other]) => {
    const L = window.loadout;
    const listed = await L.make.sprite(other);      // a data sprite that lists a style a data sprite cannot be drawn in
    const ok = await L.make.sprite(data);
    const add = [await L.bag.add(data.id), await L.bag.add(data.id, { artStyle: 'silhouette' }), await L.bag.add('style-blob', { artStyle: 'silhouette' })];
    return {
      listed, ok, add,
      styles: (await L.assets.get(data.id)).asset.styles,
      pixel: await L.render(data.id, { frame: 0, artStyle: 'pixel' }), plain: await L.render(data.id, { frame: 0 }), flat: await L.render(data.id, { frame: 0, artStyle: 'silhouette' }),
      zip: await L.bag.download({ save: false, data: true }),
    };
  }, [goodData('style-made'), { ...goodData('style-made-two'), styles: ['pixel', 'silhouette'] }]);
  expect(made.listed.ok).toBe(false);
  expect(made.listed.errors.join('\n')).toMatch(/styles: "silhouette" is not an art style/);
  expect(made.ok).toMatchObject({ ok: true, kept: true });
  expect(made.styles).toEqual(['pixel']);
  expect(made.pixel).toMatchObject({ ok: true, artStyle: 'pixel' });
  expect(made.pixel.png).toBe(made.plain.png);
  expect(made.flat.ok).toBe(false);
  expect(made.flat.errors[0]).toMatch(/"style-made" cannot be drawn in the style "silhouette"\. Its styles are: pixel\./);
  expect(made.add.map((a) => a.ok)).toEqual([true, false, true]);
  expect(Object.keys(made.add[0].item.settings)).toEqual(['params', 'cues', 'scale']);      // no style stored for its one style
  expect(made.add[1].errors[0]).toMatch(/cannot be drawn in the style "silhouette"/);
  // the bag package: the made sprite in pixel art (a PNG sheet, its definition beside it), the fixture in its silhouette
  const files = readZip(Buffer.from(made.zip.zip.split(',')[1], 'base64'));
  const manifest = JSON.parse(text(files.find((f) => f.name === 'manifest.json').data));
  const [mine, blob] = manifest.assets;
  expect(mine).toMatchObject({ id: 'style-made', sheet: 'sprites/style-made/style-made.png' });
  expect('artStyle' in mine).toBe(false);
  expect(blob).toMatchObject({ id: 'style-blob', artStyle: 'silhouette' });
  expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['sprites/style-made/style-made.png', 'sprites/style-made/style-made.json', 'sprites/style-made/style-made.sprite.json']));
  expect('artStyle' in JSON.parse(text(files.find((f) => f.name === 'sprites/style-made/style-made.json').data))).toBe(false);
  // its page: no Style choice, no style in the address; the link of the bag carries no style for it
  await page.evaluate(() => window.loadout.go('/sprite/style-made'));
  await waitForDrawn(page);
  await expect(page.locator('.style-choice')).toHaveCount(0);
  expect(page.url()).not.toContain('artstyle=');
  const link = await page.evaluate(async () => {
    const { bag, createBag, memoryStorage } = await import('/app/bag.js');
    const other = createBag(memoryStorage());
    await other.fromLinkAsync(bag.toLink());
    return other.items().map((i) => [i.id, i.settings.artStyle ?? null]);
  });
  expect(link).toEqual([['style-made', null], ['style-blob', 'silhouette']]);
  // the single download from its page: a pixel sheet, its animation list with no style, and its definition
  const single = readZip((await downloadFrom(page, () => page.locator('.rx-panel [data-act="download"]').click())).bytes);
  expect(single.map((f) => f.name)).toEqual(expect.arrayContaining(['style-made.png', 'style-made.json']));
  expect(single.some((f) => f.name.endsWith('.svg'))).toBe(false);
  expect('artStyle' in JSON.parse(text(single.find((f) => f.name === 'style-made.json').data))).toBe(false);
});
