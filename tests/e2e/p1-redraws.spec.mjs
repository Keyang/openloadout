// P1, the first real redraws (docs/data-sprites.md section 7 and "First useful slice"): coin, crate and icons-food are
// library data sprites (sprites/<id>.json) and their code files are gone. What visitors kept from before the redraw
// still opens: a sprite page link with old settings, a bag link made before, and a bag stored in the browser before.
// Each is drawn from its data file, with those settings, and the bag downloads all three.
//
// "Opens with the settings" is checked on what the page resolved, never on what it was handed: every saved value is
// what the sprite's own cleanParams gives back, what the panel's controls show (the pressed option or swatch, the
// switch, the slider), and the frames on the page are exactly renderFrame(sprite, clip, f, cleanParams(saved)). A
// redraw that renames or drops an option without a `was` map fails here.
// The migration batches copy this spec as their "old links still open" proof: change OLD.
// Run with: npx playwright test tests/e2e/p1-redraws.spec.mjs (the site's shared server, http://localhost:5199)
import { test, expect, openRoute, downloadFrom, readZip } from '../helpers/test.mjs';

const items = (page) => page.locator('.bag-item');

// settings people saved before the redraw, as links and bags held them: ids and settings only (none is a default)
const OLD = [
  { id: 'coin', params: { shape: 'octagon', emblem: 'hole', rim: false, size: 0.8, metal: '#c9ced9' }, clip: 'collect' },
  { id: 'crate', params: { style: 'barrel', mark: 'skull', bands: false, wood: '#5a3a22' }, clip: 'break' },
  { id: 'icons-food', params: { tilt: false, shine: false, body: '#a4c44a', bowl: '#7a4f33' }, clip: 'soup' },
];
const query = (o) => new URLSearchParams({ ...Object.fromEntries(Object.entries(o.params).map(([k, v]) => [k, String(v)])), clip: o.clip }).toString();
const b64url = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const OLD_LINK = `/bag?load=${b64url(JSON.stringify({ v: 1, i: OLD.map((o) => ['s', o.id, { params: o.params, cues: null, scale: 1 }]) }))}`;
const OLD_STORE = JSON.stringify({
  version: 1,
  items: OLD.map((o, i) => ({ key: `i${i + 1}`, kind: 'sprite', id: o.id, settings: { params: o.params, cues: null, scale: 1 }, addedAt: 1763500000000 })),
  theme: { seed: 0, colour: { hue: 0, saturation: 1, contrast: 1, tint: null, tintAmount: 0, palette: null, outline: null }, sound: { pitch: 0, brightness: 0 }, music: { tempo: 1, intensity: null }, shapes: false },
  next: 4,
});

/** What the sprite itself makes of the saved values (cleanParams, in the page): { key: value } for the saved keys. */
const resolvedIn = (page, o) => page.evaluate(async ({ id, params }) => {
  const [{ loadSprite }, { cleanParams }] = await Promise.all([import('/app/catalog.js'), import('/engine/sprite.js')]);
  const p = cleanParams(await loadSprite(id), params);
  return Object.fromEntries(Object.keys(params).map((k) => [k, p[k]]));
}, { id: o.id, params: o.params });

/** What the panel's controls show for the saved keys: the pressed option or swatch, the switch, the slider. */
const shownIn = (page, keys) => page.evaluate((keys) => Object.fromEntries(keys.map((k) => {
  const row = document.querySelector(`.rx-panel [data-control="${k}"]`);
  if (!row) return [k, '(no control)'];
  const slider = row.querySelector('input[type="range"]');
  if (slider) return [k, Number(slider.value)];
  const box = row.querySelector('input[type="checkbox"]');
  if (box) return [k, box.checked];
  const on = [...row.querySelectorAll('button[data-v][aria-pressed="true"]')].map((b) => b.dataset.v);
  return [k, on.length === 1 ? on[0] : `(pressed: ${on.join(', ') || 'none'})`];
})), keys);

/** For each frame of the clip shown: does the page's frame strip hold exactly renderFrame(sprite, clip, f, cleanParams(saved))? */
const framesMatch = (page, o) => page.evaluate(async ({ id, clip, params }) => {
  const [{ loadSprite }, { cleanParams, renderFrame }] = await Promise.all([import('/app/catalog.js'), import('/engine/sprite.js')]);
  const s = await loadSprite(id), p = cleanParams(s, params);
  const cells = [...document.querySelectorAll('.strip .cell canvas')];
  const pixels = (cv) => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const out = [];
  for (let f = 0; f < s.clips[clip].frames; f++) {
    const g = renderFrame(s, clip, f, p);
    const want = document.createElement('canvas');
    want.width = g.w; want.height = g.h;
    want.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
    const a = pixels(want), b = cells[f] ? pixels(cells[f]) : null;
    out.push(!!b && a.length === b.length && a.some((v, i) => i % 4 === 3 && v > 0) && a.every((v, i) => v === b[i]));
  }
  return { cells: cells.length, frames: out };
}, { id: o.id, clip: o.clip, params: o.params });

/** The page open on o's sprite resolved every saved value, shows it in the panel and draws with it. */
async function expectOpenedWith(page, o) {
  await expect(page.getByRole('group', { name: 'Animation' }).locator(`[data-clip="${o.clip}"]`)).toHaveAttribute('aria-pressed', 'true');
  expect(await resolvedIn(page, o), `${o.id}: the sprite keeps every saved value`).toEqual(o.params);
  await expect.poll(() => shownIn(page, Object.keys(o.params)), { message: `${o.id}: the panel shows every saved value` }).toEqual(o.params);
  const drawn = await framesMatch(page, o);
  expect(drawn.frames, `${o.id} ${o.clip}: each frame on the page is the sprite drawn with the saved settings`).toEqual(drawn.frames.map(() => true));
  expect(drawn.cells).toBe(drawn.frames.length);
}

for (const o of OLD) {
  test(`${o.id}: a sprite page link with settings saved before the redraw opens them, drawn from sprites/${o.id}.json`, async ({ page }) => {
    const files = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/sprites/')) files.push(u.pathname); });
    await openRoute(page, `/sprite/${o.id}?${query(o)}`);
    await expectOpenedWith(page, o);
    expect(files).toContain(`/sprites/${o.id}.json`);
    expect(files).not.toContain(`/sprites/${o.id}.js`);
  });
}

test('a bag link made before the redraw opens the three with their settings, drawn', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await openRoute(page, OLD_LINK);
  // an empty bag opens a link of library items at once (app/bag-page.js)
  await expect(page.locator('.bag-link-note')).toContainText('Opened a shared bag with 3 items');
  await expect(items(page)).toHaveCount(3);
  // each item's own page link is made from what the sprite resolved (app/bag-page.js changeLink: cleanParams, defaults
  // left out), so a value the sprite dropped is missing from it
  // (a row has its link once its sprite has loaded)
  await expect(items(page).locator('a.bag-act')).toHaveCount(3, { timeout: 20_000 });
  const links = await items(page).locator('a.bag-act').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const [i, o] of OLD.entries()) {
    const q = new URLSearchParams(links[i].split('?')[1] ?? '');
    expect(links[i], o.id).toMatch(new RegExp(`^#/sprite/${o.id}\\?`));
    expect(Object.fromEntries(Object.keys(o.params).map((k) => [k, q.get(k)])), `${o.id}: its page link keeps every saved value`)
      .toEqual(Object.fromEntries(Object.entries(o.params).map(([k, v]) => [k, String(v)])));
  }
  // and each opens from the bag on its page with those values, drawn with them
  for (const [i, o] of OLD.entries()) {
    await openRoute(page, `${links[i].slice(1)}&clip=${o.clip}`);
    await expectOpenedWith(page, o);
  }
  await ctx.close();
});

test('a bag stored in the browser before the redraw opens and downloads all three, drawn with their settings', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  await ctx.addInitScript((text) => { if (!sessionStorage.getItem('p1-seeded')) { localStorage.setItem('loadout-bag-v1', text); sessionStorage.setItem('p1-seeded', '1'); } }, OLD_STORE);
  const page = await ctx.newPage();
  await openRoute(page, '/bag');
  await expect(items(page)).toHaveCount(3);
  const { bytes } = await downloadFrom(page, () => page.getByRole('button', { name: 'Download', exact: true }).click(), { timeout: 120_000 });
  const files = readZip(new Uint8Array(bytes));
  const names = files.map((f) => f.name);
  const manifest = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json').data));
  expect(manifest.assets.map((a) => a.id)).toEqual(OLD.map((o) => o.id));
  expect(manifest.refused ?? []).toEqual([]);
  for (const o of OLD) {
    expect(names, o.id).toContain(`sprites/${o.id}/${o.id}.png`);
    const sheet = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === `sprites/${o.id}/${o.id}.json`).data));
    // the sheet says the settings it was drawn with (engine/sprite.js renderSheet meta.params): the resolved ones
    expect(Object.fromEntries(Object.keys(o.params).map((k) => [k, sheet.params?.[k]])), `${o.id}: drawn with every saved value`).toEqual(o.params);
    const anim = sheet.animations[o.clip];
    expect(anim, o.id).toBeTruthy();
    // and the picture is that: the clip's row of the PNG is renderFrame(sprite, clip, f, cleanParams(saved)), frame by frame
    const png = files.find((f) => f.name === `sprites/${o.id}/${o.id}.png`).data;
    const same = await page.evaluate(async ({ id, clip, params, row, fw, fh, png }) => {
      const [{ loadSprite }, { cleanParams, renderFrame }] = await Promise.all([import('/app/catalog.js'), import('/engine/sprite.js')]);
      const s = await loadSprite(id), p = cleanParams(s, params);
      const img = await createImageBitmap(new Blob([new Uint8Array(png)], { type: 'image/png' }));
      const sheetCv = document.createElement('canvas');
      sheetCv.width = img.width; sheetCv.height = img.height;
      const sc = sheetCv.getContext('2d');
      sc.drawImage(img, 0, 0);
      const out = [];
      for (let f = 0; f < s.clips[clip].frames; f++) {
        const g = renderFrame(s, clip, f, p);
        const want = document.createElement('canvas');
        want.width = g.w; want.height = g.h;
        want.getContext('2d').putImageData(new ImageData(g.bytes(), g.w, g.h), 0, 0);
        const a = want.getContext('2d').getImageData(0, 0, g.w, g.h).data, b = sc.getImageData(f * fw, row * fh, fw, fh).data;
        out.push(g.w === fw && g.h === fh && a.every((v, i) => v === b[i]));
      }
      return out;
    }, { id: o.id, clip: o.clip, params: o.params, row: anim.row, fw: sheet.frameWidth, fh: sheet.frameHeight, png: [...png] });
    expect(same, `${o.id} ${o.clip}: the downloaded frames are the sprite drawn with the saved settings`).toEqual(same.map(() => true));
  }
  await ctx.close();
});
