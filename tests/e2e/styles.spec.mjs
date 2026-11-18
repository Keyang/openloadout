// Styles on the live site (docs/architecture.md, Contract 12; task W6-A).
//   - every existing sprite still exports byte for byte what it exported before the style seam;
//   - a sprite with one style shows nothing new;
//   - a sprite with several styles gets a "Style" choice, and the preview, the strip, the link, the bag item
//     and the download all follow it;
//   - a style a sprite does not list is never offered and is refused when asked for.
// The two extra styles and the two sprites that list them are test fixtures (tests/fixtures/styles/): they are
// made on the page with loadout.make.sprite, exactly as an agent would, and are not part of the site.
// Needs a built site. Run with: npx playwright test tests/e2e/styles.spec.mjs
import fs from 'node:fs';
import path from 'node:path';
import { test, expect, openRoute, waitForDrawn, canvasGroupStats, downloadFrom, readZip } from '../helpers/test.mjs';
import { ROOT } from '../helpers/catalog.mjs';

const fixture = (name) => fs.readFileSync(path.join(ROOT, 'tests/fixtures/styles', name), 'utf8')
  // written to sit in tests/fixtures/styles/; handed to make.sprite it is read as a file in sprites/
  .replaceAll("'../../../engine/", "'../engine/").replace("'./styles.js'", "'../tests/fixtures/styles/styles.js'");
const BLOB = fixture('blob.js'), SPARKLE = fixture('sparkle.js');
const text = (bytes) => new TextDecoder().decode(bytes);

/** Make the two fixture sprites on this page. Both must pass the quality bar in every style they list. */
async function makeFixtures(page) {
  const made = await page.evaluate(async ([blob, sparkle]) => [await window.loadout.make.sprite(blob), await window.loadout.make.sprite(sparkle)], [BLOB, SPARKLE]);
  for (const m of made) expect(m, JSON.stringify(m.errors)).toMatchObject({ ok: true, kept: true, errors: [] });
  return made;
}
const pressed = (page) => page.locator('.style-choice .pill[aria-pressed="true"]');
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
    const [bundle, catalog, audio, S, T, old] = await Promise.all([import('/app/bundle.js'), import('/app/catalog.js'), import('/app/audio.js'), import('/engine/sprite.js'), import('/engine/theme.js'), import('/tests/fixtures/styles/legacy-render.mjs')]);
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
        if (theme) T.applyColour(before.data, theme.colour);
        const files = await bundle.spriteFiles(sprite, p, bundle.defaultCues(sprite), scale, theme);
        const meta = JSON.parse(dec.decode(files.find((f) => f.name === `${id}.json`).data));
        delete meta.sounds;
        if (!same(files.find((f) => f.name === `${id}.png`).data, await png(before))) differ.push(`${id} (${name}): PNG`);
        if (JSON.stringify(meta, null, 2) !== JSON.stringify(before.meta, null, 2)) differ.push(`${id} (${name}): JSON`);
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
  await expect(page.getByRole('heading', { name: 'Style', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to bag' }).click();
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
  const file = await downloadFrom(page, () => page.getByRole('button', { name: 'Download sprite and sounds' }).click());
  const files = readZip(file.bytes);
  expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['coin.png', 'coin.json', 'how-to-use.txt']));
  expect('artStyle' in JSON.parse(text(files.find((f) => f.name === 'coin.json').data))).toBe(false);
});

test('the shipped site knows one style, and says so on window.loadout', async ({ page }) => {
  await openRoute(page, '/');
  const got = await page.evaluate(async () => {
    const api = await window.loadout.api;
    const render = api.actions.find((a) => a.name === 'render'), add = api.actions.find((a) => a.name === 'bag_add');
    return { styles: api.styles, render: render.inputSchema.properties.options.properties.artStyle, add: add.inputSchema.properties.settings.description, coin: (await window.loadout.assets.get('coin')).asset.styles };
  });
  expect(got.styles.map((s) => s.id)).toEqual(['pixel']);
  expect(got.styles[0]).toMatchObject({ label: 'Pixel art', exports: ['sheet'] });
  expect(got.render.description).toMatch(/Sprites: the art style/);
  expect(got.add).toMatch(/artStyle/);
  expect(got.coin).toEqual(['pixel']);
});

test('a sprite with three styles: the Style choice sits above the controls, in plain words, and the pictures follow it', async ({ page }) => {
  await openRoute(page, '/');
  await makeFixtures(page);
  await page.evaluate(() => window.loadout.go('/sprite/style-blob'));
  await waitForDrawn(page);
  const choice = page.locator('.style-choice');
  await expect(choice.getByRole('heading', { name: 'Style' })).toBeVisible();
  await expect(choice.locator('.pill')).toHaveText(['Pixel art', 'Silhouette', 'Outlined shapes']);
  await expect(pressed(page)).toHaveText('Pixel art');
  await expect(choice.locator('.style-about')).toHaveText('Square pixels on a small grid, with a dark outline and three tones of shading.');
  // above the other controls: it is the first thing in the panel
  expect(await page.locator('.panel > *').first().getAttribute('class')).toContain('style-choice');
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
  await page.locator('[data-control="ears"]').getByRole('button', { name: 'Long' }).click();
  expect((await strip(page)).hash).not.toBe(shapes.hash);

  // "Start over" goes back to the sprite's first style
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(pressed(page)).toHaveText('Pixel art');
  expect((await strip(page)).hash).toBe(pixel.hash);
  await expect.poll(() => page.url()).not.toContain('artstyle=');
});

test('the style travels: in the link, in the bag item, through a reload and a shared bag link', async ({ page }) => {
  await openRoute(page, '/');
  await makeFixtures(page);
  await page.evaluate(() => window.loadout.go('/sprite/style-blob?artstyle=silhouette&tail=false'));
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Silhouette');
  expect(await stripColours(page)).toBe(1);
  const before = await strip(page);

  await page.getByRole('button', { name: 'Add to bag' }).click();
  await expect(page.locator('.add-note')).toContainText('Added to your bag');
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

  // opened from the bag ("Change") the page takes the item's style, and "Update in bag" keeps the new one
  await page.evaluate((key) => window.loadout.go(`/sprite/style-blob?bag=${key}`), item.key);
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Silhouette');
  await page.locator('.style-choice').getByRole('button', { name: 'Outlined shapes' }).click();
  await page.getByRole('button', { name: 'Update in bag' }).click();
  await expect(page.locator('.add-note')).toContainText('Updated in your bag');
  item = await page.evaluate(async () => (await window.loadout.bag.items()).items[0]);
  expect(item.settings.artStyle).toBe('outline-svg');
  // back to the first style: the item no longer names one
  await page.locator('.style-choice').getByRole('button', { name: 'Pixel art' }).click();
  await page.getByRole('button', { name: 'Update in bag' }).click();
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
  await openRoute(page, '/');
  await makeFixtures(page);
  await page.evaluate(() => window.loadout.go('/sprite/style-blob'));
  await waitForDrawn(page);
  const get = async () => readZip((await downloadFrom(page, () => page.getByRole('button', { name: 'Download sprite and sounds' }).click())).bytes);
  const json = (files) => JSON.parse(text(files.find((f) => f.name === 'style-blob.json').data));

  const pixel = await get();
  expect(pixel.map((f) => f.name)).toEqual(['style-blob.png', 'style-blob.json', 'how-to-use.txt']);
  expect('artStyle' in json(pixel)).toBe(false);
  await expect(page.locator('.status')).toContainText('the sprite sheet');

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
  await openRoute(page, '/');
  await makeFixtures(page);
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
  await openRoute(page, '/');
  await makeFixtures(page);
  await page.evaluate(() => window.loadout.go('/sprite/style-sparkle'));
  await waitForDrawn(page);
  await expect(page.locator('.style-choice .pill')).toHaveText(['Pixel art', 'Silhouette']);
  await expect(page.getByRole('button', { name: 'Outlined shapes' })).toHaveCount(0);
  // a link that names it opens in the sprite's first style instead
  await page.evaluate(() => window.loadout.go('/sprite/style-sparkle?artstyle=outline-svg'));
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Pixel art');

  const got = await page.evaluate(async () => {
    const L = window.loadout;
    return {
      rows: (await L.assets.list({ runtime: true })).assets.map((a) => [a.id, a.styles]),
      get: (await L.assets.get('style-sparkle')).asset.styles,
      refused: await L.render('style-sparkle', { artStyle: 'outline-svg' }),
      unknown: await L.render('style-sparkle', { artStyle: 'watercolour' }),
      pixel: await L.render('style-sparkle', { frame: 0 }),
      flat: await L.render('style-sparkle', { frame: 0, artStyle: 'silhouette' }),
      shapes: await L.render('style-blob', { frame: 0, artStyle: 'outline-svg', scale: 2 }),
      themed: await L.render('style-blob', { frame: 0, artStyle: 'outline-svg', scale: 2, look: { colour: { palette: 'Frost' } } }),
      viaCall: await L.call('render', { id: 'style-blob', options: { artStyle: 'silhouette', frame: 0 } }),
    };
  });
  expect(got.rows).toEqual([['style-blob', ['pixel', 'silhouette', 'outline-svg']], ['style-sparkle', ['pixel', 'silhouette']]]);
  expect(got.get).toEqual(['pixel', 'silhouette']);
  expect(got.refused.ok).toBe(false);
  expect(got.refused.errors[0]).toMatch(/"style-sparkle" cannot be drawn in the style "outline-svg"\. Its styles are: pixel, silhouette\./);
  expect(got.unknown.ok).toBe(false);
  expect(got.pixel).toMatchObject({ ok: true, artStyle: 'pixel' });
  expect(got.flat).toMatchObject({ ok: true, artStyle: 'silhouette', opaque: got.pixel.opaque });
  expect(got.flat.png).not.toBe(got.pixel.png);
  expect(got.shapes).toMatchObject({ ok: true, artStyle: 'outline-svg', width: 64, height: 64 });
  expect(got.shapes.opaque).toBeGreaterThan(0);
  expect(got.themed.png).not.toBe(got.shapes.png);
  expect(got.viaCall).toMatchObject({ ok: true, artStyle: 'silhouette' });
});

test('a sprite made on the page whose own code reads pixels back gets the warning, with the line', async ({ page }) => {
  await openRoute(page, '/');
  // the three-style fixture, as a pixel-only sprite with one read-back added just before its outline
  const source = BLOB.replace("id: 'style-blob'", "id: 'style-reader'").replace("styles: ['pixel', 'silhouette', 'outline-svg'],", '').replace('    g.outline(INK);', '    if (g.get(CX, 20)) g.dot(CX, 20, INK);\n    g.outline(INK);');
  expect(source).toContain('g.get(CX, 20)');
  const line = source.split('\n').findIndex((l) => l.includes('g.get(CX, 20)')) + 1;
  const made = await page.evaluate((src) => window.loadout.make.sprite(src), source);
  expect(made, JSON.stringify(made.errors)).toMatchObject({ ok: true, errors: [] });      // a warning does not block
  const warning = made.warnings.find((w) => /draws outside the surface's calls/.test(w));
  expect(warning, made.warnings.join('\n')).toBeTruthy();
  expect(warning).toContain(`(get; first at the sprite's source:${line})`);
  // the clean fixture has none
  const clean = await page.evaluate((src) => window.loadout.make.sprite(src), BLOB);
  expect(clean.warnings.filter((w) => /draws outside/.test(w))).toEqual([]);
});

test('a sprite with a control called "style" and two art styles: both travel in the link, each under its own name', async ({ page }) => {
  await openRoute(page, '/');
  await makeFixtures(page);
  await page.evaluate(() => window.loadout.go('/sprite/style-sparkle?style=cross&artstyle=silhouette'));
  await waitForDrawn(page);
  await expect(pressed(page)).toHaveText('Silhouette');
  await expect(page.locator('[data-control="style"] .pill[aria-pressed="true"]')).toHaveText('Cross');
  expect(await stripColours(page)).toBe(1);
  const cross = await strip(page);
  await page.locator('[data-control="style"]').getByRole('button', { name: 'Spiral' }).click();
  expect((await strip(page)).hash).not.toBe(cross.hash);
  await expect.poll(() => page.url()).toContain('style=spiral');
  expect(page.url()).toContain('artstyle=silhouette');
  await page.getByRole('button', { name: 'Add to bag' }).click();
  const item = await page.evaluate(async () => (await window.loadout.bag.items()).items[0]);
  expect(item.settings.params.style).toBe('spiral');
  expect(item.settings.artStyle).toBe('silhouette');
});

test('the bag page and the playground draw a bag item in its art style; its "Change" link carries it', async ({ page }) => {
  await openRoute(page, '/');
  await makeFixtures(page);
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
  expect(await row(keys[0]).getByRole('link', { name: 'Change' }).getAttribute('href')).toContain('artstyle=silhouette');
  expect(await row(keys[1]).getByRole('link', { name: 'Change' }).getAttribute('href')).not.toContain('artstyle=');
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
