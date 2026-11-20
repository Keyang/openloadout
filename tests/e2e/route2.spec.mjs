// Route 2, end to end, on data (docs/architecture.md, Contract 11 and Contract 15; docs/data-sprites.md section 5,
// build item B11): an agent on the live site makes a new pickup as a `loadout-sprite` version 2 definition and its
// sound as a patch, and from then on they behave like catalogue assets: pages, the bag (through a reload), the
// playground, the download. Every step that makes or changes something is a window.loadout call from a page script,
// which is what an MCP server will do; the test itself only looks, presses keys and reads the zip.
import { test, expect, openRoute, waitForDrawn, downloadFrom, readZip, canvasStats, setRange } from '../helpers/test.mjs';
import { starData, chimePatch, STAR_ID, CHIME_ID } from '../fixtures/api/data.mjs';

const FIRST_TRY = starData({ broken: true }), FIXED = starData(), CUED = starData({ cue: CHIME_ID }), CHIME = chimePatch();
const text = (bytes) => new TextDecoder().decode(bytes);

test('an agent makes a pickup as data and its sound, and they go through the bag, a reload, the playground and the download', async ({ page }) => {
  test.setTimeout(120_000);
  await openRoute(page, '/');

  // 1. look for something close in the catalogue, and at how it is set up
  const near = await page.evaluate(async () => {
    const L = window.loadout;
    const found = await L.assets.search('coin to collect', { kind: 'sprite', limit: 5 });
    return { found, coin: await L.assets.get(found.assets[0].id), taken: await L.assets.get('route2-star') };
  });
  expect(near.found.assets.map((a) => a.id)).toContain('coin');
  expect(near.coin.asset.clips.map((c) => c.name)).toContain('collect');
  expect(near.taken.ok, 'the id is free').toBe(false);

  // 2. the first version has no search words: the quality bar says so, and the draft cannot go in the bag
  const first = await page.evaluate(async (data) => {
    const L = window.loadout;
    const made = await L.make.sprite(data);
    return { made, bag: await L.bag.add(made.id), draft: await L.render(made.id, { frame: 0 }), row: (await L.assets.get(made.id)).asset };
  }, FIRST_TRY);
  expect(first.made).toMatchObject({ id: STAR_ID, ok: false, kept: true });
  expect(first.made.errors.join('\n')).toMatch(/meta\.words/);
  expect(first.bag.ok).toBe(false);
  expect(first.bag.errors[0]).toMatch(/quality bar/);
  expect(first.bag.errors[0]).toMatch(/words/);                    // the refusal carries what to fix
  expect(first.draft.ok, 'a draft can still be looked at').toBe(true);
  expect(first.row).toMatchObject({ runtime: true, ok: false });

  // 3. fixed, under the same id, and handed over as JSON text this time: ok
  const fixed = await page.evaluate((json) => window.loadout.make.sprite(json), JSON.stringify(FIXED));
  expect(fixed).toMatchObject({ id: STAR_ID, ok: true, errors: [], replaced: true });

  // 4. its picture, plain and under a look
  const pics = await page.evaluate(async (id) => {
    const L = window.loadout;
    return { plain: await L.render(id, { clip: 'spin', frame: 0, scale: 4 }), look: await L.render(id, { clip: 'spin', frame: 0, scale: 4, look: { colour: { hue: 140, saturation: 1.2 } } }), strip: await L.render(id, { clip: 'collect' }) };
  }, STAR_ID);
  expect(pics.plain).toMatchObject({ ok: true, width: 128, height: 128 });
  expect(pics.plain.opaque).toBeGreaterThan(60);
  expect(pics.look.ok).toBe(true);
  expect(pics.look.png).not.toBe(pics.plain.png);
  expect(pics.strip).toMatchObject({ ok: true, frames: 8, width: 256 });

  // 5. its sound, then the sprite again with the sound cued on its collect clip
  const sound = await page.evaluate(async ([patch, data]) => {
    const L = window.loadout;
    const chime = await L.make.sound(patch);
    const heard = await L.render(patch.id, { params: { pitch: 1400 } });
    const cued = await L.make.sprite(data);
    return { chime, heard, cued, star: (await L.assets.get(cued.id)).asset };
  }, [CHIME, CUED]);
  expect(sound.chime).toMatchObject({ id: CHIME_ID, kind: 'sound', ok: true, errors: [] });
  expect(sound.heard.ok).toBe(true);
  expect(sound.heard.wav).toMatch(/^data:audio\/wav;base64,UklGR/);
  expect(sound.heard.params.pitch).toBe(1400);
  expect(sound.cued).toMatchObject({ id: STAR_ID, ok: true, errors: [], replaced: true });
  expect(sound.star.tech.soundIds).toEqual([CHIME_ID]);
  // the sound's page names the sprite that plays it
  expect((await page.evaluate((id) => window.loadout.go(`/sound/${id}`), CHIME_ID)).ok).toBe(true);
  await expect(page.getByRole('heading', { name: 'Wish chime', level: 1 })).toBeVisible();
  await expect(page.locator('.related')).toContainText('Wish star');             // "Used by"

  // 6. both into the bag with settings of their own, and a catalogue hero to walk with
  const bagged = await page.evaluate(async ([star, chime]) => {
    const L = window.loadout;
    const metals = (await L.assets.get(star)).asset.controls.find((c) => c.key === 'metal').swatches;
    return {
      star: await L.bag.add(star, { params: { shape: 'octagon', metal: metals[1], size: 0.9 }, scale: 2 }),
      chime: await L.bag.add(chime, { params: { pitch: 1400 } }),
      hero: await L.bag.add('knight'),
      metal: metals[1],
      kept: await L.assets.remove(star),            // in the bag: it cannot be forgotten
    };
  }, [STAR_ID, CHIME_ID]);
  expect(bagged.star).toMatchObject({ ok: true, count: 1 });
  expect(bagged.star.item.id).toBe(STAR_ID);
  expect(bagged.star.item.definition.data).toMatchObject({ format: 'loadout-sprite', version: 2, id: STAR_ID, name: 'Wish star' });
  expect(bagged.star.item.definition.data.clips.collect.sounds).toEqual([expect.objectContaining({ sound: CHIME_ID, frame: 1 })]);
  expect(bagged.star.item.definition.source).toBeUndefined();
  expect(bagged.chime.item.definition.patch.id).toBe(CHIME_ID);
  expect(bagged.hero.item.definition).toBeUndefined();
  expect(bagged.kept.ok).toBe(false);
  expect(bagged.kept.errors[0]).toMatch(/in the bag/);

  // 7. reload the page: the bag still holds them, with their settings, and they are known again
  await page.reload();
  await waitForDrawn(page);
  const after = await page.evaluate(async ([star, chime]) => {
    const L = window.loadout;
    return {
      items: await L.bag.items(), made: await L.assets.list({ runtime: true }),
      star: await L.assets.get(star), picture: await L.render(star, { frame: 0, params: { shape: 'square' } }), sound: await L.render(chime),
      check: await L.check(star),
    };
  }, [STAR_ID, CHIME_ID]);
  expect(after.items.items.map((i) => [i.kind, i.id])).toEqual([['sprite', STAR_ID], ['sound', CHIME_ID], ['sprite', 'knight']]);
  expect(after.items.items[0].settings).toMatchObject({ params: { shape: 'octagon', metal: bagged.metal, size: 0.9 }, scale: 2 });
  expect(after.items.items[1].settings.params).toEqual({ pitch: 1400 });
  expect(after.made.assets.map((a) => a.id).sort()).toEqual([CHIME_ID, STAR_ID].sort());
  expect(after.star.asset).toMatchObject({ name: 'Wish star', runtime: true, ok: true });
  expect(after.picture.ok).toBe(true);
  expect(after.picture.opaque).toBeGreaterThan(20);
  expect(after.sound.ok).toBe(true);
  expect(after.check).toMatchObject({ id: STAR_ID, ok: true, errors: [] });

  // its own page opens, drawn live (there is no built picture of it), and its controls work
  expect(await page.evaluate((id) => window.loadout.go(`#/sprite/${id}`), STAR_ID)).toEqual({ ok: true, route: `#/sprite/${STAR_ID}` });
  await expect(page.getByRole('heading', { name: 'Wish star', level: 1 })).toBeVisible();
  await waitForDrawn(page);
  await page.getByRole('button', { name: 'Pause' }).click();
  const stage = page.locator('canvas.stage');
  const before = await canvasStats(stage);
  expect(before.opaque).toBeGreaterThan(0);
  await setRange(page.getByLabel('Size', { exact: true }), 0.2);
  await expect.poll(async () => (await canvasStats(stage)).hash).not.toBe(before.hash);
  await setRange(page.getByLabel('Size', { exact: true }), 0.9);
  await expect(page.locator('.related')).toContainText('Wish chime');            // "Sounds it uses"
  // a look goes on a data sprite as on any other
  await page.locator('.rx-panel [role="tab"][data-tab="look"]').click();
  const plainLook = await canvasStats(stage);
  await page.locator('.looks .vbtn[data-look="night"]').click();
  await expect.poll(async () => (await canvasStats(stage)).hash).not.toBe(plainLook.hash);
  await page.locator('.looks .vbtn[data-look=""]').click();
  await expect.poll(async () => (await canvasStats(stage)).hash).toBe(plainLook.hash);

  // the bag page shows all three, none of them missing
  await page.evaluate(() => window.loadout.go('/bag'));
  await expect(page.locator('.bag-item')).toHaveCount(3);
  await expect(page.locator('.bag-item .bag-name')).toHaveText(['Wish star', 'Wish chime', 'Hero']);
  await expect(page.locator('.bag-pic.gone')).toHaveCount(0);
  await expect(page.locator('.bag-item.remake')).toHaveCount(0);
  await expect(page.locator('.bag-item').first().locator('canvas').first()).toBeVisible();

  // 8. the playground: the hero walks into the star, it is collected and its chime plays
  await page.evaluate(() => window.loadout.go('/play'));
  await page.waitForFunction(() => document.querySelector('main.play-page') && window.__loadoutPlay && window.__loadoutPlay.ready, null, { timeout: 30_000 });
  await expect(page.locator('.play-collected')).toContainText('0');
  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await page.evaluate(() => window.__loadoutPlay.state())).collected, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.up('Shift');
  const played = await page.evaluate(() => window.__loadoutPlay.state());
  expect(played.heard.filter((h) => h.sound === CHIME_ID).map((h) => [h.by, h.clip])).toContainEqual([STAR_ID, 'collect']);

  // 9. the download: sheet, JSON with the cue, the sound, and the star's own definition
  const file = await downloadFrom(page, () => page.evaluate(() => window.loadout.bag.download()));
  expect(file.name).toBe('loadout-package.zip');
  const zip = Object.fromEntries(readZip(file.bytes).map((f) => [f.name, f.data]));
  const dir = `sprites/${STAR_ID}/`;
  expect(Object.keys(zip)).toEqual(expect.arrayContaining([`${dir}${STAR_ID}.png`, `${dir}${STAR_ID}.json`, `${dir}${STAR_ID}.sprite.json`, `${dir}sounds/${CHIME_ID}.wav`, `sounds/${CHIME_ID}.wav`, `sounds/${CHIME_ID}.source.json`, 'sprites/knight/knight.png', 'manifest.json', 'read-me.txt']));
  expect(Object.keys(zip).filter((n) => n.endsWith('.source.js')), 'no source text anywhere').toEqual([]);
  expect([...zip[`${dir}${STAR_ID}.png`].slice(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  const sheet = JSON.parse(text(zip[`${dir}${STAR_ID}.json`]));
  expect(sheet.frameWidth).toBe(64);                                               // the bag item's pixel size 2
  expect(sheet.params).toMatchObject({ shape: 'octagon', metal: bagged.metal, size: 0.9 });
  expect(sheet.sounds.collect).toEqual([expect.objectContaining({ sound: CHIME_ID, file: `sounds/${CHIME_ID}.wav`, frame: 1 })]);
  const own = JSON.parse(text(zip[`${dir}${STAR_ID}.sprite.json`]));
  expect(own).toMatchObject({ format: 'loadout-sprite', version: 2, id: STAR_ID, name: 'Wish star' });
  expect(JSON.parse(text(zip[`sounds/${CHIME_ID}.source.json`])).id).toBe(CHIME_ID);
  expect(text(zip[`sounds/${CHIME_ID}.wav`]).slice(0, 4)).toBe('RIFF');
  const manifest = JSON.parse(text(zip['manifest.json']));
  const about = Object.fromEntries(manifest.assets.map((a) => [a.id, a]));
  expect(about[STAR_ID]).toMatchObject({ kind: 'sprite', name: 'Wish star', role: 'items/pickup', source: `${dir}${STAR_ID}.sprite.json` });
  expect(about[STAR_ID].madeOnThisVisit).toBeUndefined();
  expect(about[CHIME_ID]).toMatchObject({ kind: 'sound', madeOnThisVisit: true, source: `sounds/${CHIME_ID}.source.json` });
  expect(about.knight.madeOnThisVisit).toBeUndefined();
  expect(about.knight.source).toBeUndefined();
  expect(manifest.missing).toBeUndefined();
  expect(manifest.needsRemaking).toBeUndefined();
});

test('a shared bag link brings a sprite made as data along; nothing in it is a program, so it opens at once', async ({ page, context }) => {
  await openRoute(page, '/');
  const link = await page.evaluate(async ([data, patch]) => {
    const L = window.loadout;
    await L.make.sound(patch);
    await L.make.sprite(data);
    await L.bag.add('route2-star', { params: { shape: 'square' } });
    await L.bag.add('route2-chime');
    return (await L.bag.link()).link;
  }, [CUED, CHIME]);
  const { LINK_LIMIT } = await page.evaluate(() => import('/app/bag.js').then((m) => ({ LINK_LIMIT: m.LINK_LIMIT })));
  expect(link.length, 'a small pickup and its sound fit in a link').toBeLessThan(LINK_LIMIT);

  // someone else opens it: a fresh browser with an empty bag
  const other = await (await context.browser().newContext()).newPage();
  await other.goto(link);
  await expect(other.locator('.bag-offer')).toHaveCount(0);
  await expect(other.locator('.bag-item .bag-name')).toHaveText(['Wish star', 'Wish chime'], { timeout: 30_000 });
  await expect(other.locator('.bag-pic.gone')).toHaveCount(0);
  const there = await other.evaluate(() => window.loadout.bag.items());
  expect(there.items[0].settings.params).toEqual({ shape: 'square' });
  expect(there.items[0].definition.data).toMatchObject({ id: STAR_ID, version: 2 });
  expect(there.items[0].definition.source).toBeUndefined();
  await other.context().close();

  // a bag whose link would be too long says so instead of copying a link that will be cut short
  await page.evaluate(async () => { for (let i = 0; i < 18; i++) await window.loadout.bag.add('route2-star', { params: { size: i / 18 } }); await window.loadout.go('/bag'); });
  await page.getByRole('button', { name: 'Copy link to this bag' }).click();
  await expect(page.locator('.bag-link-note')).toContainText('8,000');
  await expect(page.locator('.bag-link-note')).toContainText(/too long/i);
});

test('assets.remove forgets an asset made on this visit, and nothing else', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([data, patch]) => {
    const L = window.loadout;
    await L.make.sound(patch);
    await L.make.sprite(data);
    return {
      catalogue: await L.assets.remove('coin'), unknown: await L.assets.remove('no-such-thing'), junk: await L.assets.remove(7),
      star: await L.assets.remove('route2-star'), again: await L.assets.remove('route2-star'), chime: await L.assets.remove('route2-chime'),
      left: (await L.assets.list({ runtime: true })).total, get: await L.assets.get('route2-star'), go: await L.go('/sprite/route2-star'), render: await L.render('route2-chime'),
      coin: (await L.assets.get('coin')).ok, byName: await L.call('assets_remove', { id: 'route2-star' }),
    };
  }, [CUED, CHIME]);
  expect(r.catalogue.ok).toBe(false);
  expect(r.catalogue.errors[0]).toMatch(/catalogue asset/);
  expect(r.unknown.ok).toBe(false);
  expect(r.junk.ok).toBe(false);
  expect(r.star).toEqual({ ok: true, id: 'route2-star', kind: 'sprite' });
  expect(r.again.ok).toBe(false);
  expect(r.chime).toEqual({ ok: true, id: 'route2-chime', kind: 'sound' });
  expect(r.left).toBe(0);
  expect(r.get.ok).toBe(false);
  expect(r.go.ok).toBe(false);
  expect(r.render.ok).toBe(false);
  expect(r.coin).toBe(true);
  expect(r.byName.ok).toBe(false);
});

test('a card for an asset with no built picture draws it live, and a draft has no "Add to bag"', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([good, broken, patch]) => {
    const L = window.loadout;
    await L.make.sound(patch);
    await L.make.sprite(good);
    await L.make.sprite(broken);
    const { cardFor } = await import('/app/cards.js');
    const { assetById } = await import('/app/catalog.js');
    const box = document.createElement('ul');
    box.className = 'gallery';
    box.id = 'made-cards';
    for (const id of ['route2-star', 'route2-draft', 'route2-chime']) { const li = document.createElement('li'); li.dataset.id = id; li.append(cardFor(assetById(id)).node); box.append(li); }
    document.querySelector('#app main').append(box);
    return true;
  }, [CUED, starData({ id: 'route2-draft', broken: true }), CHIME]);
  expect(r).toBe(true);
  const card = (id) => page.locator(`#made-cards li[data-id="${id}"]`);
  await expect.poll(async () => (await canvasStats(card('route2-star').locator('canvas').first())).opaque).toBeGreaterThan(20);
  // a sound made on this visit has no built waveform: its card draws one from the sound itself
  await expect(card('route2-chime').locator('.sound-pic canvas.wave')).toHaveCount(1);
  await expect(card('route2-star').locator('img')).toHaveCount(0);
  await expect(card('route2-star').getByRole('button', { name: /Add Wish star to my bag/ })).toBeVisible();
  await expect(card('route2-draft').locator('.card-add')).toHaveCount(0);
  // the card's button stores the definition too, as data
  await card('route2-star').getByRole('button', { name: /Add Wish star to my bag/ }).click();
  const items = await page.evaluate(() => window.loadout.bag.items());
  expect(items.items.map((i) => [i.id, i.definition?.data?.version ?? null, typeof i.definition?.source])).toEqual([['route2-star', 2, 'undefined']]);
  // a draft's own page says what is wrong and offers no "Add to bag"
  await page.evaluate(() => window.loadout.go('/sprite/route2-draft'));
  await expect(page.getByRole('heading', { name: 'Wish star', level: 1 })).toBeVisible();
  await expect(page.locator('.made-here')).toContainText(/quality bar/);
  await expect(page.locator('.made-here')).toContainText(/words/i);
  await expect(page.getByRole('button', { name: 'Add to my bag' })).toHaveCount(0);
});
