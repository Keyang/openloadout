// Sprite page: preview, animation buttons, the editing panel's sliders, Surprise me / Start over, link, sounds, download, phone width.
import { test, expect, openRoute, canvasStats, canvasGroupStats, setRange, downloadFrom, readZip, hasHorizontalScroll, waitForDrawn, openTab, downloadButton } from '../helpers/test.mjs';
import { readCatalogue, catalogueOf } from '../helpers/catalog.mjs';

// The sprites come from the catalogue (generated/catalog.json): there is no other list.
const C = catalogueOf(readCatalogue());
// The full set of checks below runs on sprites with several animations and sliders. The seven that shipped first are
// that regression net, while they exist; a catalogue without them gets the first few characters and creatures instead.
const FIRST = ['knight', 'wizard', 'wolf', 'slime', 'bat', 'coin', 'campfire'].filter((id) => C.byId[id]?.kind === 'sprite');
const SPRITES = FIRST.length ? FIRST : C.sprites.filter((a) => ['character', 'creature'].includes(a.type)).slice(0, 4).map((a) => a.id);
// The two checks every kind of sprite must pass (its sounds are listed; its download is whole) also run on one sprite
// of each type the catalogue holds, so a new kind of asset (a tileset, a background, an interface piece) is covered when it is added.
const ONE_OF_EACH = [...new Set(C.sprites.map((a) => a.type))].map((type) => C.sprites.find((a) => a.type === type).id);
const EVERY_KIND = [...new Set([...SPRITES, ...ONE_OF_EACH])];
/** A sprite's own program, loaded from its file. */
const spriteProgram = async (id) => (await import(`../../sprites/${id}.js`)).default;

const stage = (page) => page.locator('canvas.stage');
const strip = (page) => page.locator('.strip .cell canvas');
const clipButtons = (page) => page.getByRole('group', { name: 'Animation' }).getByRole('button');
/** Freeze the animation so the preview can be compared. */
async function pause(page) {
  const b = page.locator('.stage-tools .icon-btn');
  if ((await b.getAttribute('aria-label')) === 'Pause') await b.click();
  await expect(b).toHaveAttribute('aria-label', 'Play');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
// the sprite's own shape sliders (the panel's first tab)
const lookSliders = (page) => page.locator('.rx-panel [data-pane="shape"] .ctl input[type=range]');
const cueRows = (page) => page.locator('.cues li.cue');

for (const id of SPRITES) {
  test.describe(`sprite ${id}`, () => {
    test.beforeEach(async ({ page }) => { await openRoute(page, `/sprite/${id}`); });

    test('preview has drawn pixels and the strip shows the sprite', async ({ page }) => {
      const s = await canvasStats(stage(page));
      expect(s.opaque).toBeGreaterThan(0);
      const st = await canvasGroupStats(strip(page));
      expect(st.count).toBeGreaterThan(0);
      expect(st.opaque).toBeGreaterThan(20);
    });

    test('each animation button changes the frame strip', async ({ page }) => {
      const buttons = clipButtons(page);
      const n = await buttons.count();
      expect(n).toBeGreaterThanOrEqual(2);
      const seen = new Set();
      for (let i = 0; i < n; i++) {
        await buttons.nth(i).click();
        await expect(buttons.nth(i)).toHaveAttribute('aria-pressed', 'true');
        const st = await canvasGroupStats(strip(page));
        expect(st.opaque, `animation ${i} is empty`).toBeGreaterThan(0);
        seen.add(st.hash);
      }
      expect(seen.size, 'animations should look different from each other').toBe(n);
    });

    test('every slider changes something', async ({ page }) => {
      const sliders = page.locator('.rx-panel .ctl input[type=range]');      // every tab's, whichever is open
      const n = await sliders.count();
      expect(n).toBeGreaterThan(3);
      const clips = clipButtons(page);
      const nc = await clips.count();
      // frame-strip hash of every animation, in order
      const hashes = async () => {
        const out = [];
        for (let k = 0; k < nc; k++) { await clips.nth(k).click(); out.push((await canvasGroupStats(strip(page))).hash); }
        return out;
      };
      const base = await hashes();
      for (let i = 0; i < n; i++) {
        const { key, group } = await sliders.nth(i).evaluate((el) => ({ key: el.id.replace(/^c-/, ''), group: el.closest('[data-pane]').dataset.pane }));
        await setRange(sliders.nth(i), 'other');
        const after = await hashes();
        const pixels = after.some((h, k) => h !== base[k]);
        if (!pixels) {
          // Some Motion sliders (Speed) change timing, not pixels: what they change is the animation's frames per second,
          // which is saved in the address bar. A Look slider must always change the picture.
          expect(group, `slider "${key}" changed no pixels in any animation`).toBe('motion');
        }
        await expect.poll(() => page.evaluate(() => location.hash), `slider "${key}" should be saved in the link`).toContain(`${key}=`);
        await page.getByRole('button', { name: 'Start over' }).click();
      }
    });

    test('Surprise me changes the preview and Start over restores it', async ({ page }) => {
      await pause(page);
      const before = await canvasStats(stage(page));
      const beforeStrip = await canvasGroupStats(strip(page));
      await page.getByRole('button', { name: 'Surprise me' }).click();
      await expect.poll(async () => (await canvasGroupStats(strip(page))).hash).not.toBe(beforeStrip.hash);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect((await canvasStats(stage(page))).hash).not.toBe(before.hash);
      await page.getByRole('button', { name: 'Start over' }).click();
      await expect.poll(async () => (await canvasGroupStats(strip(page))).hash).toBe(beforeStrip.hash);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      expect((await canvasStats(stage(page))).hash).toBe(before.hash);
    });

    test('the address bar keeps the settings and a reload restores the same picture', async ({ page }) => {
      const clips = clipButtons(page);
      const other = await clips.evaluateAll((bs) => bs.findIndex((b) => b.getAttribute('aria-pressed') !== 'true'));   // not the starting animation
      await clips.nth(other).click();
      await page.evaluate(() => { window.__saves = 0; const f = history.replaceState.bind(history); history.replaceState = (...a) => { window.__saves++; return f(...a); }; });
      await setRange(lookSliders(page).first(), 'other');
      await expect.poll(() => page.evaluate(() => window.__saves)).toBeGreaterThan(0);   // the slider's own delayed save has landed
      const beforeSurprise = await page.evaluate(() => location.hash);
      const stripBefore = (await canvasGroupStats(strip(page))).hash;
      await page.getByRole('button', { name: 'Surprise me' }).click();
      await expect.poll(async () => (await canvasGroupStats(strip(page))).hash).not.toBe(stripBefore);
      await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(beforeSurprise);   // the save for Surprise me
      const mine = await canvasGroupStats(strip(page));
      const hash = await page.evaluate(() => location.hash);
      expect(hash).toContain('clip=');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForDrawn(page);
      await page.waitForSelector('.strip .cell canvas');
      expect(await page.evaluate(() => location.hash)).toBe(hash);
      expect(await canvasGroupStats(strip(page))).toEqual(mine);
      await expect(clips.nth(other)).toHaveAttribute('aria-pressed', 'true');
    });
  });
}

test.describe('sprite sounds', () => {
  test('the sounds section lists the default sounds of the animation, and adding and removing updates it', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await openTab(page, 'sounds');
    await expect(page.locator('.cues h2')).toHaveText('Sounds for Walk');
    const n0 = await cueRows(page).count();
    expect(n0).toBeGreaterThanOrEqual(1);                // footsteps
    for (const row of await cueRows(page).all()) await expect(row.getByRole('combobox', { name: 'Sound' })).toHaveValue(/footstep/);

    await page.getByRole('button', { name: 'Add a sound' }).click();
    await expect(cueRows(page)).toHaveCount(n0 + 1);
    await cueRows(page).nth(n0).getByRole('button', { name: 'Remove' }).click();
    await expect(cueRows(page)).toHaveCount(n0);
    for (let i = 0; i < n0; i++) await cueRows(page).nth(0).getByRole('button', { name: 'Remove' }).click();
    await expect(cueRows(page)).toHaveCount(0);
    await expect(page.locator('.cues .hint').first()).toContainText('silent');

    // the choice is kept in the link
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('sfx=');
    // another animation has its own list
    await page.getByRole('group', { name: 'Animation' }).getByRole('button', { name: 'Attack' }).click();
    await expect(page.locator('.cues h2')).toHaveText('Sounds for Attack');
    expect(await cueRows(page).count()).toBeGreaterThanOrEqual(1);
    // Start over brings the first list back
    await page.getByRole('group', { name: 'Animation' }).getByRole('button', { name: 'Walk' }).click();
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(cueRows(page)).toHaveCount(n0);
  });

  for (const id of EVERY_KIND) {
    test(`${id}: the number of listed sounds matches the sounds the sprite ships with`, async ({ page }) => {
      const sprite = await spriteProgram(id);
      await openRoute(page, `/sprite/${id}`);
      const clips = Object.keys(sprite.clips);
      for (const clip of clips) {
        await page.getByRole('group', { name: 'Animation' }).locator(`[data-clip="${clip}"]`).click();
        await expect(page.locator('.cues h2')).toHaveText(`Sounds for ${sprite.clips[clip].label}`);
        await expect(cueRows(page), `${id}/${clip}`).toHaveCount((sprite.sounds[clip] ?? []).length);
      }
    });
  }
});

test.describe('sprite download', () => {
  for (const id of EVERY_KIND) {
    test(`${id}: Download gives a zip with the PNG, JSON, a WAV and the guide`, async ({ page }) => {
      const sprite = await spriteProgram(id);
      await openRoute(page, `/sprite/${id}`);
      const { name, bytes } = await downloadFrom(page, () => downloadButton(page).click());
      expect(name).toBe(`${id}-sprite-and-sounds.zip`);
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('PK\x03\x04');
      const files = readZip(new Uint8Array(bytes));
      const names = files.map((f) => f.name);
      expect(names).toContain(`${id}.png`);
      expect(names).toContain(`${id}.json`);
      expect(names).toContain('how-to-use.txt');
      if (Object.values(sprite.sounds).flat().length) expect(names.filter((n) => /^sounds\/.+\.wav$/.test(n)).length).toBeGreaterThanOrEqual(1);
      const png = files.find((f) => f.name === `${id}.png`).data;
      expect(Buffer.from(png.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a');
      const meta = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === `${id}.json`).data));
      expect(meta.sprite).toBe(id);
      expect(Object.keys(meta.animations)).toEqual(Object.keys(sprite.clips));
      await expect(page.locator('.status')).toContainText('Downloaded');
    });
  }
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('home has no sideways scroll', async ({ page }) => {
    await openRoute(page, '/');
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
  test('a sprite page has no sideways scroll', async ({ page }) => {
    await openRoute(page, '/sprite/knight');
    await page.waitForSelector('canvas.stage');
    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(downloadButton(page)).toBeVisible();
  });
});
