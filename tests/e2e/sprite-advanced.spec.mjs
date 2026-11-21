// Advanced editing on a sprite's own page (build item B18; docs/data-sprites.md section 6 "Advanced mode on a sprite
// page" and section 9 row B18; Contract 15 rule 7; DQ5: it edits a copy). Keyang: "add the rig editing to the sprite as
// advanced editing, similar for drawings".
//   - A library data sprite's page has an Advanced button. It opens the version 2 editor (app/studio/v2-editor.js) inline:
//     its picture where the page's picture was, its tabs (Body, Clips, Look & name, Check) where the simple controls were.
//   - It edits a copy: a studio draft with made.from "library:<id>", whose defaults are the visitor's sliders. The
//     address keeps the page and names the copy, so a reload goes on with the same copy. Back to the simple controls
//     leaves it, and the library sprite is drawn as before: the copy never changes the library sprite or its file.
//   - Painting a stamp's pixel and letting a control set a generator's argument are kept in the copy.
//   - Put in my bag (the item follows later edits) and Download <copy>.json come from the editor's footer.
//   - A sprite made on this visit has no Advanced button (only the library's data sprites do); nothing scrolls sideways
//     at phone width.
// Chromium; the shared test server (http://localhost:5199, playwright.config.mjs).
import { test, expect, openRoute, downloadFrom, hasHorizontalScroll, canvasStats, setRange, showControl } from '../helpers/test.mjs';

/** A sprite page with no studio drafts and an empty bag. */
async function fresh(page, id, query = '') {
  // (the storage is cleared on a page that loads no other sprite, then the page is opened afresh)
  await page.goto('/index.html#/studio', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.removeItem('loadout-studio-v1'); localStorage.removeItem('loadout-bag-v1'); });
  await openRoute(page, `/sprite/${id}${query}`);
}
const advancedBtn = (page) => page.locator('[data-act="advanced"]');
const advMain = (page) => page.locator('main.rx-sprite.is-advanced');
/** Opens Advanced and waits until the copy is drawn on the page's stage. */
async function openAdvanced(page) {
  await advancedBtn(page).click();
  await expect(advMain(page)).toBeVisible();
  await expect.poll(async () => (await canvasStats(page.locator('main.is-advanced .studio-canvas'))).opaque, { timeout: 20_000 }).toBeGreaterThan(0);
}
/** The id of the draft Advanced is editing. */
const copyId = (page) => advMain(page).getAttribute('data-advanced-copy');
/** The copy as saved on this computer (the studio's drafts). */
const saved = async (page) => {
  const id = await copyId(page);
  return page.evaluate((id) => JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts[id].definition, id);
};
const savedSoon = async (page) => { await expect(page.locator('main.is-advanced .studio-panel .rx-foot .saved .saved-text')).toHaveText('Saved on this computer'); return saved(page); };
const tab = (page, name) => page.locator('main.is-advanced [role="tab"]').filter({ hasText: name });
const row = (page, label) => page.locator('.v2-item').filter({ has: page.locator('.v2-itemlabel', { hasText: label }) });
/** What the library sprite draws (window.loadout.render: its own file, through the catalogue), as a data address. */
const libraryPicture = (page, id, clip) => page.evaluate(async ({ id, clip }) => {
  const r = await window.loadout.render(id, { clip, frame: 0 });
  return typeof r === 'string' ? r : r.png ?? r.dataUrl ?? JSON.stringify(r);
}, { id, clip });
const libraryFile = (page, id) => page.evaluate(async (id) => (await fetch(`/sprites/${id}.json`, { cache: 'no-store' })).text(), id);

test('open: the editor on the page, on a copy whose defaults are the visitor\'s sliders; the address keeps it; leave', async ({ page }) => {
  await fresh(page, 'coin');
  // the visitor sets a slider first: the copy starts there
  const size = await showControl(page, 'size');
  await setRange(size.locator('input[type="range"]'), 1);
  await expect(advancedBtn(page)).toBeVisible();
  await expect(advancedBtn(page)).toHaveText(/Advanced/);
  await openAdvanced(page);
  // the editor's tabs, where the simple controls were; the simple controls are hidden; the page keeps its heading
  for (const t of ['Body', 'Clips', 'Look & name', 'Check']) await expect(tab(page, t)).toBeVisible();
  await expect(page.locator('main.is-advanced .rx-head h1')).toHaveText('Coin');
  await expect(page.locator('main.is-advanced .rx-panel:not(.studio-panel)')).toBeHidden();
  await expect(page.locator('main.is-advanced .stage-card:not(.studio-card)')).toBeHidden();
  // the bar says it is a copy and how to get back
  const bar = page.locator('.adv-bar');
  await expect(bar).toContainText('a copy');
  await expect(bar.locator('a[href^="#/studio/"]')).toBeVisible();
  // the copy: a studio draft linked back to the library sprite, the visitor's slider as its default
  const d = await savedSoon(page);
  expect(await copyId(page)).toBe('coin-copy');
  expect(d.id).toBe('coin-copy');
  expect(d.made).toEqual({ in: 'studio', from: 'library:coin' });
  expect(d.controls.find((c) => c.key === 'size').default).toBe(1);
  // the address stays on the sprite's page and names the copy, through the editor's tab changes
  await tab(page, 'Clips').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#\/sprite\/coin\?.*edit=advanced/);
  expect(await page.evaluate(() => location.hash)).toContain('copy=coin-copy');
  // a reload goes on with the same copy (not a second one), on the same tab
  await page.reload();
  await expect(advMain(page)).toBeVisible();
  expect(await copyId(page)).toBe('coin-copy');
  await expect(tab(page, 'Clips')).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts))).toEqual(['coin-copy']);
  // leaving returns to the simple controls; the address forgets Advanced
  await page.locator('[data-act="advanced-leave"]').click();
  await expect(page.locator('main.rx-sprite')).not.toHaveClass(/is-advanced/);
  await expect(page.locator('main.rx-sprite .studio-canvas')).toHaveCount(0);
  await expect(page.locator('.rx-panel [role="tab"][data-tab]').first()).toBeVisible();
  await expect(page.locator('main.rx-sprite .stage-card .stage')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('edit=advanced');
  // opened again, it goes on with the same copy
  await openAdvanced(page);
  expect(await copyId(page)).toBe('coin-copy');
});

test('edit a stamp pixel in the copy; the library sprite and its file stay as they were', async ({ page }) => {
  await fresh(page, 'crate');
  const fileBefore = await libraryFile(page, 'crate');
  const picBefore = await libraryPicture(page, 'crate', 'break');
  await openAdvanced(page);
  await row(page, 'Pixels "crumbs"').locator('.v2-itemname').click();
  const grid = page.locator('main.is-advanced .v2-stampgrid');
  await expect(grid).toBeVisible();
  const cell = Number(await grid.getAttribute('data-cell'));
  const box = await grid.boundingBox();
  const k = box.width / Number(await grid.evaluate((c) => c.width));
  // the third pixel of the row is see-through in the library's crumbs: paint it with ink
  await page.locator('.v2-swatch[data-paint="ink"]').click();
  await page.mouse.click(box.x + 2.5 * cell * k, box.y + 0.5 * cell * k);
  await expect.poll(async () => { const s = (await saved(page)).body.pictures.draw.find((x) => x.id === 'crumbs'); return s.key[s.rows[0][2]]; }).toBe('ink');
  const d = await saved(page);
  expect(d.id).toBe('crate-copy');
  // the library's crate: its file and its picture are as they were, on this page after leaving too
  expect(await libraryFile(page, 'crate')).toBe(fileBefore);
  expect(await libraryPicture(page, 'crate', 'break')).toBe(picBefore);
  await page.locator('[data-act="advanced-leave"]').click();
  await expect(page.locator('main.rx-sprite')).not.toHaveClass(/is-advanced/);
  expect(await libraryPicture(page, 'crate', 'break')).toBe(picBefore);
  const lib = await page.evaluate(async () => {
    const s = await (await import('/app/catalog.js')).loadSprite('crate');
    return s.id;
  });
  expect(lib).toBe('crate');
});

test('bind a generator\'s argument to one of the sprite\'s controls', async ({ page }) => {
  await fresh(page, 'coin');
  await openAdvanced(page);
  await row(page, 'gleam@1').locator('.v2-itemname').click();
  const gen = page.locator('main.is-advanced .v2-item.on .v2-gen[data-gen="gleam@1"]');
  await expect(gen).toBeVisible();
  const bind = gen.locator('select.v2-bind').first();
  await expect(bind).toBeVisible();
  const arg = await bind.evaluate((s) => s.closest('.v2-arg').dataset.arg);
  await bind.selectOption('size');
  await expect.poll(async () => {
    const call = (await saved(page)).body.pictures.draw.find((x) => x.gen === 'gleam');
    return call?.[arg]?.from ?? null;
  }).toBe('size');
  // the argument now shows which control sets it
  await expect(gen.locator(`.v2-arg[data-arg="${arg}"] .v2-bound`)).toBeVisible();
});

test('put the copy in the bag (it follows later edits) and download <copy>.json', async ({ page }) => {
  await fresh(page, 'coin');
  await openAdvanced(page);
  await tab(page, 'Check').click();
  await expect(page.locator('main.is-advanced .adv-status[data-state="ok"]')).toBeVisible();
  await page.locator('main.is-advanced .studio-panel [data-act="to-bag"]').click();
  await expect(page.locator('main.is-advanced .studio-panel .rx-foot .saved small')).toHaveText('In your bag · updates as you work');
  const item = () => page.evaluate(async () => (await import('/app/bag.js')).bag.items().find((i) => i.definition?.data));
  const first = await item();
  expect(first.definition.data.id).toBe('coin-copy');
  expect(first.definition.data.made.from).toBe('library:coin');
  // a later edit reaches the bag item
  await tab(page, 'Look & name').click();
  await page.locator('#v2-name').fill('Lucky coin');
  await page.locator('#v2-name').press('Enter');
  await expect.poll(async () => (await item()).definition.data.name, { timeout: 15_000 }).toBe('Lucky coin');
  // the library's own coin is not in the bag, and is unchanged
  expect(await page.evaluate(async () => (await import('/app/bag.js')).bag.items().filter((i) => i.id === 'coin').length)).toBe(0);
  const d = await savedSoon(page);
  const file = await downloadFrom(page, async () => {
    await page.locator('main.is-advanced .studio-panel [data-act="download"]').click();
    await page.getByRole('menuitem', { name: `File for the library (${d.id}.json)` }).click();
  });
  expect(file.name).toBe('coin-copy.json');
  const back = JSON.parse(file.bytes.toString('utf8'));
  expect(back.version).toBe(2);
  expect(back.id).toBe('coin-copy');
  expect(back.name).toBe('Lucky coin');
  expect(back.made).toEqual({ in: 'studio', from: 'library:coin' });
});

test('New copy starts again from the library sprite at the visitor\'s sliders', async ({ page }) => {
  await fresh(page, 'coin');
  await openAdvanced(page);
  await tab(page, 'Look & name').click();
  await page.locator('#v2-name').fill('First try');
  await page.locator('#v2-name').press('Enter');
  await savedSoon(page);
  await page.locator('[data-act="advanced-new-copy"]').click();
  await expect.poll(() => copyId(page)).toBe('coin-copy-2');
  const d = await savedSoon(page);
  expect(d.name).toBe('Coin (copy)');
  expect(d.made.from).toBe('library:coin');
});

test('a sprite made on this visit has no Advanced button', async ({ page }) => {
  await fresh(page, 'coin');
  const made = await page.evaluate(async () => {
    const def = await (await fetch('/sprites/coin.json')).json();
    def.id = 'coin-made-here';
    def.name = 'Made here';
    return window.loadout.make.sprite(def);
  });
  expect(made.ok).toBe(true);
  // (a made row has no file; here it names one, so only "made on this visit" keeps the button away)
  expect(await page.evaluate(async () => {
    const row = (await import('/app/catalog.js')).assetById('coin-made-here');
    row.src = 'sprites/coin.json';
    return row.madeIn;
  })).toBe('visit');
  await openRoute(page, '/sprite/coin-made-here');
  await expect(page.locator('.rx-panel [role="tab"]').first()).toBeVisible();
  await expect(advancedBtn(page)).toHaveCount(0);
});

test('a sprite whose file is still code (sprites/<id>.js) has no Advanced button', async ({ page }) => {
  // (every library sprite is data now: the catalogue is served naming coin.js, and coin.js hands over the data sprite)
  await page.route('**/generated/catalog.json', async (route) => {
    const res = await route.fetch();
    const cat = await res.json();
    cat.assets.find((a) => a.id === 'coin').src = 'sprites/coin.js';
    await route.fulfill({ response: res, json: cat });
  });
  await page.route('**/sprites/coin.js', (route) => route.fulfill({ contentType: 'text/javascript',
    body: "import { loadDataFile } from '/app/catalog.js';\nexport default await loadDataFile('sprites/coin.json');\n" }));
  await fresh(page, 'coin');
  expect(await page.evaluate(async () => (await import('/app/catalog.js')).assetById('coin').src)).toBe('sprites/coin.js');
  await expect(page.locator('.rx-panel [role="tab"]').first()).toBeVisible();
  await expect(page.locator('main.rx-sprite .stage-card .stage')).toBeVisible();
  await expect(advancedBtn(page)).toHaveCount(0);
  // an address asking for Advanced opens nothing either
  await openRoute(page, '/sprite/coin?edit=advanced');
  await expect(page.locator('.rx-panel [role="tab"]').first()).toBeVisible();
  await expect(page.locator('main.is-advanced')).toHaveCount(0);
});

test('the address cannot open another draft: a version 1 draft, another sprite\'s copy, __proto__ all give this sprite\'s own copy', async ({ page }) => {
  await fresh(page, 'coin');
  // a version 1 studio draft that says it came from the library's coin (the old studio's Hero start said library:knight; that library body is gone, build item R1, so the draft is a Two legs bone rig that says so),
  // newer than anything else, and a version 2 copy of the crate
  const seeded = await page.evaluate(async () => {
    const { createDrafts } = await import('/app/studio/drafts.js');
    const { startFrom } = await import('/app/studio/edit.js');
    const drafts = createDrafts(localStorage);
    const hero = startFrom('two-legs', 'Hero');
    hero.made = { in: 'studio', from: 'library:coin' };
    const crate = await (await fetch('/sprites/coin.json')).json();
    crate.id = 'crate-copy'; crate.name = 'Crate (copy)'; crate.made = { in: 'studio', from: 'library:crate' };
    const a = drafts.put('crate-copy', crate);
    const b = drafts.put('hero', hero);
    return { a: a.ok, b: b.ok, version: drafts.get('hero')?.definition.version };
  });
  expect(seeded).toEqual({ a: true, b: true, version: 1 });
  const heroBefore = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts.hero));
  for (const copy of ['hero', 'crate-copy', '__proto__', 'constructor', '..%2Fx']) {
    await openRoute(page, `/sprite/coin?edit=advanced&copy=${copy}`);
    await expect(advMain(page)).toBeVisible();
    await expect.poll(() => copyId(page), { message: copy }).toBe('coin-copy');
    await expect(page.locator('.adv-copyname')).toHaveText('Coin (copy)');
    await expect(page.locator('main.is-advanced .v2-pane')).not.toContainText('no body the studio knows');
    expect(await page.evaluate(() => location.hash)).toContain('copy=coin-copy');
    await page.locator('[data-act="advanced-leave"]').click();
    await expect(page.locator('main.rx-sprite')).not.toHaveClass(/is-advanced/);
  }
  // pressing Advanced goes on with the coin's own copy too, never the version 1 draft
  await openAdvanced(page);
  expect(await copyId(page)).toBe('coin-copy');
  // the version 1 draft and the crate's copy are as they were; one copy of the coin was made
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts);
  expect(JSON.stringify(after.hero)).toBe(heroBefore);
  expect(Object.keys(after).sort()).toEqual(['coin-copy', 'crate-copy', 'hero']);
  expect(after['crate-copy'].definition.name).toBe('Crate (copy)');
});

test('the editor\'s clip has its own address key: the page\'s clip stays the page\'s', async ({ page }) => {
  await fresh(page, 'coin', '?clip=collect');
  await expect(page.locator('main.rx-sprite [data-clip="collect"]')).toHaveAttribute('aria-pressed', 'true');
  await openAdvanced(page);
  await page.locator('main.is-advanced [data-clip="spin"]:visible').click();
  await expect(page.locator('main.is-advanced [data-clip="spin"]:visible')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('aclip'))).toBe('spin');
  expect(await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('clip'))).toBe('collect');
  // a reload opens the editor on the editor's clip
  await page.reload();
  await expect(advMain(page)).toBeVisible();
  await expect(page.locator('main.is-advanced [data-clip="spin"]:visible')).toHaveAttribute('aria-pressed', 'true');
  // leaving: the page shows Collect, the address names Collect and nothing of the editor's
  await page.locator('[data-act="advanced-leave"]').click();
  await expect(page.locator('main.rx-sprite')).not.toHaveClass(/is-advanced/);
  await expect.poll(() => page.evaluate(() => location.hash)).not.toContain('edit=advanced');
  const q = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1])));
  expect(q.clip).toBe('collect');
  expect(q.aclip).toBeUndefined();
  await page.reload();
  await expect(page.locator('main.rx-sprite [data-clip="collect"]')).toHaveAttribute('aria-pressed', 'true');
});

test('while Advanced is open the page\'s own picture is not drawn; leaving draws it again', async ({ page }) => {
  await fresh(page, 'coin');
  // count what is drawn on the page's own picture (its 2D context is the one the page holds)
  await page.evaluate(() => {
    const ctx = document.querySelector('main.rx-sprite .stage-card .stage').getContext('2d');
    const real = ctx.drawImage;
    window.__pageDraws = 0;
    ctx.drawImage = function (...a) { window.__pageDraws++; return real.apply(this, a); };
  });
  await expect.poll(() => page.evaluate(() => window.__pageDraws)).toBeGreaterThan(0);
  await openAdvanced(page);
  await page.evaluate(() => { window.__pageDraws = 0; });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__pageDraws)).toBe(0);
  await page.locator('[data-act="advanced-leave"]').click();
  await expect(page.locator('main.rx-sprite')).not.toHaveClass(/is-advanced/);
  await expect.poll(() => page.evaluate(() => window.__pageDraws)).toBeGreaterThan(0);
});

test('a character (a bone rig) opens too, on a copy; Undo steps back a change', async ({ page, request }) => {
  // (the library's characters are data in the working tree; a catalogue built before their redraw still names knight.js)
  const cat = await (await request.get('/generated/catalog.json')).json();
  const knight = cat.assets.find((a) => a.id === 'knight');
  test.skip(!knight?.src?.endsWith('.json'), 'the catalogue names knight.js: build the site to open a character');
  await fresh(page, 'knight');
  // a version 1 draft (the old studio's Hero start, made.from library:knight, as a Two legs bone rig now) is there and newer: it is not the copy
  expect(await page.evaluate(async () => {
    const { createDrafts } = await import('/app/studio/drafts.js');
    const { startFrom } = await import('/app/studio/edit.js');
    return createDrafts(localStorage).put('hero', Object.assign(startFrom('two-legs', 'Hero'), { made: { in: 'studio', from: 'library:knight' } })).ok;
  })).toBe(true);
  const heroBefore = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts.hero));
  await openAdvanced(page);
  expect(await copyId(page)).toBe('knight-copy');
  await expect(page.locator('main.is-advanced .v2-pane')).toContainText('Character (bones)');
  const d = await savedSoon(page);
  expect(Object.keys(d.body)).toEqual(['rig']);
  expect(d.made.from).toBe('library:knight');
  // a change to the copy, then Undo
  await tab(page, 'Look & name').click();
  await page.locator('#v2-name').fill('Night knight');
  await page.locator('#v2-name').press('Enter');
  await expect.poll(async () => (await saved(page)).name).toBe('Night knight');
  await expect(page.locator('.adv-copyname')).toHaveText('Night knight');
  await page.locator('main.is-advanced [data-act="undo"]').click();
  await expect.poll(async () => (await saved(page)).name).toBe('Hero (copy)');
  expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('loadout-studio-v1')).drafts.hero))).toBe(heroBefore);
});

test('nothing scrolls sideways at phone width, in every tab, and leaving works there', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await fresh(page, 'coin');
  expect(await hasHorizontalScroll(page)).toBe(false);
  await openAdvanced(page);
  expect(await hasHorizontalScroll(page)).toBe(false);
  await row(page, 'token@1').locator('.v2-itemname').click();
  expect(await hasHorizontalScroll(page)).toBe(false);
  for (const t of ['Clips', 'Look & name', 'Check']) {
    await tab(page, t).click();
    expect(await hasHorizontalScroll(page), t).toBe(false);
  }
  await page.locator('[data-act="advanced-leave"]').click();
  await expect(page.locator('main.rx-sprite')).not.toHaveClass(/is-advanced/);
  expect(await hasHorizontalScroll(page)).toBe(false);
});
