// window.loadout (docs/architecture.md, Contract 11; docs/framework-api.md), driven the way an agent would:
// from a page script that uses nothing but window.loadout. Needs a built site (generated/api.json and
// generated/framework.js are written by "node tools/build.mjs").
import { test, expect, openRoute, downloadFrom, readZip } from '../helpers/test.mjs';
import { goodData, GOOD_ID, noWords, deadControl, OLD_SOURCE, GOOD_SOUND } from '../fixtures/api/data.mjs';

const GOOD = goodData();

const loaded = (page) => page.evaluate(() => performance.getEntriesByType('resource').map((r) => new URL(r.name).pathname));
/** Decode a PNG data address in the page and count its pixels that are not see-through. */
const pngStats = (page, png) => page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, cv.width, cv.height);
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) opaque++;
  return { width: img.width, height: img.height, opaque };
}, png);

test('window.loadout has the Contract 11 members, and the home page does not pay for the framework', async ({ page }) => {
  await openRoute(page, '/');
  const shape = await page.evaluate(() => ({
    top: Object.keys(window.loadout).sort(),
    assets: Object.keys(window.loadout.assets).sort(),
    make: Object.keys(window.loadout.make).sort(),
    bag: Object.keys(window.loadout.bag).sort(),
    studio: Object.keys(window.loadout.studio).sort(),
  }));
  expect(shape.top).toEqual(['api', 'assets', 'bag', 'call', 'check', 'framework', 'go', 'make', 'render', 'studio']);
  expect(shape.studio).toEqual(['advice', 'create', 'file', 'get', 'list', 'remove', 'render', 'set', 'starts', 'toBag', 'validate']);
  expect(shape.assets).toEqual(['get', 'list', 'remove', 'search', 'similar']);
  expect(shape.make).toEqual(['sound', 'sprite']);
  expect(shape.bag).toEqual(['add', 'clear', 'download', 'items', 'link', 'remove', 'setLook', 'update']);

  // nothing of the framework's own has been asked for yet
  // (the rigs are not in this list: the home page draws a live line-up of the kits' sprites, whose programs use them)
  const before = await loaded(page);
  for (const f of ['/app/api-core.js', '/app/api-actions.js', '/generated/framework.js', '/generated/api.json', '/quality/sprite.js', '/quality/sound.js']) expect(before, `${f} should load on first use`).not.toContain(f);

  // first use: the description, then the framework itself, built from the same list
  const got = await page.evaluate(async () => {
    const api = await window.loadout.api;
    const fw = await window.loadout.framework;
    // api.json and framework.js are written by the same build, so they name the same modules. What each module
    // exports is the live code, which other people change between builds: that api.json lists exactly the real
    // exports is the unit test's job (tests/unit/api-generator.test.mjs), with the code and the list read together.
    const missing = api.modules.filter((m) => !fw[m.name] || typeof fw[m.name] !== 'object').map((m) => m.name);
    return {
      modules: api.modules.map((m) => m.name), frameworkKeys: Object.keys(fw), missing,
      actions: api.actions.map((a) => a.name),
      direct: typeof window.loadout.framework.sprite.defineSprite,      // after the first await it is there without waiting
      sameAgain: (await window.loadout.framework) === fw && (await window.loadout.api) === api,
    };
  });
  expect(got.modules.length).toBeGreaterThanOrEqual(15);
  expect(got.frameworkKeys.sort()).toEqual([...got.modules].sort());
  expect(got.missing, 'every module in api.json is on loadout.framework').toEqual([]);
  expect(got.actions).toEqual(expect.arrayContaining(['assets_list', 'assets_search', 'make_sprite', 'make_sound', 'check', 'render', 'bag_add', 'go']));
  expect(got.direct).toBe('function');
  expect(got.sameAgain).toBe(true);
  expect(await loaded(page)).toContain('/generated/framework.js');
});

test('(a) list, get, search and similar', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async () => {
    const L = window.loadout;
    return {
      all: await L.assets.list(),
      sprites: await L.assets.list({ kind: 'sprite' }),
      audio: await L.assets.list({ kind: ['sound', 'music'] }),
      coin: await L.assets.get('coin'),
      blip: await L.assets.get('coin-pickup'),
      search: await L.assets.search('coin'),
      narrowed: await L.assets.search('money', { kind: 'sound', limit: 3 }),
      similar: await L.assets.similar('coin', 3),
      byName: await L.call('assets_get', { id: 'coin' }),
    };
  });
  expect(r.all.ok).toBe(true);
  expect(r.all.total).toBeGreaterThan(10);
  expect(r.all.assets.length).toBe(r.all.total);
  expect(r.sprites.assets.length).toBeGreaterThan(3);
  expect(r.sprites.assets.every((a) => a.kind === 'sprite')).toBe(true);
  expect(r.sprites.assets.map((a) => a.id)).toContain('coin');
  expect(r.audio.assets.every((a) => a.kind !== 'sprite')).toBe(true);
  expect(r.sprites.total + r.audio.total).toBe(r.all.total);
  expect(r.coin.ok).toBe(true);
  expect(r.coin.asset.id).toBe('coin');
  expect(r.coin.asset.controls.map((c) => c.key)).toEqual(expect.arrayContaining(['size', 'metal']));
  expect(r.coin.asset.clips.map((c) => c.name)).toContain('spin');
  expect(r.blip.asset.controls.length).toBeGreaterThan(0);
  expect(r.search.ok).toBe(true);
  expect(r.search.assets.slice(0, 3).map((a) => a.id)).toContain('coin');
  expect(r.narrowed.assets.length).toBeLessThanOrEqual(3);
  expect(r.narrowed.assets.length).toBeGreaterThan(0);
  expect(r.narrowed.assets.every((a) => a.kind === 'sound')).toBe(true);
  expect(r.similar.ok).toBe(true);
  expect(r.similar.assets.length).toBeGreaterThan(0);
  expect(r.similar.assets.length).toBeLessThanOrEqual(3);
  expect(r.similar.assets.map((a) => a.id)).not.toContain('coin');
  expect(r.byName).toEqual(r.coin);
});

test('(b) a framework function called directly draws pixels', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async () => {
    const { surface, fx, color, sprite, palettes } = await window.loadout.framework;
    const g = new surface.Surface(32, 32);
    g.ellipse(16, 16, 6, 6, color.ramp(palettes.PALETTE.thornwood.gold));
    const body = g.data.filter(Boolean).length;
    fx.ring(g, { t: 0.3, x: 16, y: 16, r0: 8, r1: 14, colours: fx.steps('#e8742a') });
    const withRing = g.data.filter(Boolean).length;
    return { body, withRing, colours: new Set(g.data).size, define: typeof sprite.defineSprite, bounds: g.bounds() };
  });
  expect(r.body).toBeGreaterThan(50);
  expect(r.withRing).toBeGreaterThan(r.body);
  expect(r.colours).toBeGreaterThan(3);
  expect(r.define).toBe('function');
  expect(r.bounds.x1).toBeGreaterThan(r.bounds.x0);
});

test('check takes a sound patch or a sprite definition made in the page, and keeps nothing', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async (patch) => {
    const L = window.loadout;
    const { sprite, color } = await L.framework;
    const def = sprite.defineSprite({
      id: 'api-test-inline', name: 'Inline', size: [16, 16], pivot: [8, 14],
      params: { size: sprite.range('Size', 0.5) },
      clips: { idle: { frames: 2, fps: 4 } },
      render(g, { p }) { g.ellipse(8, 8, 3 + p.size * 3, 3 + p.size * 3, color.ramp('#c9423a')); g.outline(color.INK); },
    });
    return { patch: await L.check(patch), def: await L.check(def), kept: (await L.assets.list({ runtime: true })).total };
  }, GOOD_SOUND);
  expect(r.patch).toMatchObject({ id: GOOD_SOUND.id, kind: 'sound', ok: true, errors: [] });
  expect(r.patch.metrics.valid).toBe(true);
  expect(r.def.kind).toBe('sprite');
  expect(r.def.ok).toBe(false);                                    // no metadata, for one
  expect(r.def.errors.join('\n')).toMatch(/meta/i);
  expect(r.def.warnings.join('\n')).toMatch(/on the page itself/);
  expect(r.kept).toBe(0);
});

test('with no background workers the quality bar runs on the page and says so: a sound and a sprite made as data are both made', async ({ page }) => {
  await page.addInitScript(() => { delete window.Worker; });
  await openRoute(page, '/');
  const r = await page.evaluate(async ([data, patch]) => {
    const L = window.loadout;
    return { sprite: await L.make.sprite(data), sound: await L.make.sound(patch), wav: await L.render(patch.id), png: await L.render(data.id, { frame: 0 }), listed: (await L.assets.list({ runtime: true })).assets.map((a) => a.id).sort() };
  }, [GOOD, GOOD_SOUND]);
  expect(r.sprite).toMatchObject({ id: GOOD_ID, ok: true, kept: true });
  expect(r.sprite.warnings.join('\n')).toMatch(/on the page itself/);
  expect(r.png.ok).toBe(true);
  expect(r.listed).toEqual([GOOD_ID, GOOD_SOUND.id].sort());
  expect(r.sound.ok).toBe(true);
  expect(r.sound.warnings.join('\n')).toMatch(/on the page itself/);
  expect(r.wav.ok).toBe(true);
  expect(r.wav.wav).toMatch(/^data:audio\/wav;base64,UklGR/);
});

test('(c) make.sprite with a valid definition passes the bar, and render gives its picture', async ({ page }) => {
  await openRoute(page, '/');
  const made = await page.evaluate((data) => window.loadout.make.sprite(data), GOOD);
  expect(made).toMatchObject({ id: GOOD_ID, kind: 'sprite', ok: true, errors: [], kept: true, replaced: false });
  expect(Array.isArray(made.warnings)).toBe(true);

  const strip = await page.evaluate((id) => window.loadout.render(id, { scale: 2 }), GOOD_ID);
  expect(strip).toMatchObject({ ok: true, id: GOOD_ID, kind: 'sprite', clip: 'spin', frame: null, frames: 8, width: 8 * 32 * 2, height: 64, scale: 2 });
  expect(strip.png).toMatch(/^data:image\/png;base64,/);
  expect(strip.opaque).toBeGreaterThan(8 * 30);
  const seen = await pngStats(page, strip.png);
  expect(seen).toEqual({ width: 512, height: 64, opaque: strip.opaque * 4 });

  // one frame, with a setting and with a look: each a different picture
  const r = await page.evaluate(async (id) => {
    const L = window.loadout;
    return {
      plain: await L.render(id, { frame: 0 }),
      round: await L.render(id, { frame: 0, params: { shape: 'square', nonsense: 1 } }),
      look: await L.render(id, { frame: 0, look: { colour: { hue: 120 } } }),
      listed: await L.assets.list({ runtime: true }),
      found: await L.assets.search('jewel'),
      got: await L.assets.get(id),
      similar: await L.assets.similar(id, 3),
      check: await L.check(id),
    };
  }, GOOD_ID);
  expect(r.plain).toMatchObject({ ok: true, frame: 0, frames: 1, width: 32, height: 32 });
  expect(r.round.ok).toBe(true);
  expect(r.round.png).not.toBe(r.plain.png);
  expect(r.round.params.shape).toBe('square');
  expect(r.round.warnings.join(' ')).toMatch(/nonsense/);
  expect(r.look.png).not.toBe(r.plain.png);
  expect(r.listed.assets.map((a) => a.id)).toEqual([GOOD_ID]);
  expect(r.listed.assets[0]).toMatchObject({ kind: 'sprite', runtime: true, ok: true, type: 'pickup', role: 'items/pickup' });
  expect(r.found.assets[0].id).toBe(GOOD_ID);
  expect(r.got.asset.controls.map((c) => c.key)).toEqual(['metal', 'inlay', 'size', 'thickness', 'shape', 'emblem', 'rim', 'sparkle', 'bob', 'pop', 'speed']);
  expect(r.got.asset.verdict.ok).toBe(true);
  expect(r.similar.ok).toBe(true);
  expect(r.similar.assets.map((a) => a.id)).toContain('coin');          // the other pickup
  expect(r.check).toMatchObject({ id: GOOD_ID, kind: 'sprite', ok: true, errors: [] });
  expect(r.check.metrics).toBeTruthy();

  // the same id again replaces it; an id the catalogue uses is refused and names the clash
  const again = await page.evaluate((data) => window.loadout.make.sprite(data), GOOD);
  expect(again).toMatchObject({ id: GOOD_ID, ok: true, replaced: true });
  const clash = await page.evaluate((data) => window.loadout.make.sprite(data), goodData('coin'));
  expect(clash.ok).toBe(false);
  expect(clash.id).toBe('coin');
  expect(clash.errors[0]).toMatch(/already an asset in the catalogue/);
  // and the catalogue's coin is still the catalogue's coin
  const coin = await page.evaluate(() => window.loadout.render('coin', { clip: 'spin', frame: 0 }));
  expect(coin.ok).toBe(true);
  expect(coin.opaque).toBeGreaterThan(20);
});

test('(d) a sprite with a fault comes back ok: false with the checker\'s message', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([draft, dead]) => {
    const L = window.loadout;
    return { draft: await L.make.sprite(draft), dead: await L.make.sprite(dead), dry: await L.check(dead), dryDraft: await L.check(draft), listed: await L.assets.list({ runtime: true }) };
  }, [noWords(), deadControl()]);
  // the quality bar fails it: kept as a draft, marked not ok, so it can be drawn while it is fixed
  expect(r.draft).toMatchObject({ id: 'api-test-nowords', ok: false, kept: true });
  expect(r.draft.errors.join('\n')).toMatch(/meta\.words/);
  // the validator refuses it: nothing can be drawn, so nothing is kept
  expect(r.dead).toMatchObject({ id: 'api-test-dead', ok: false, kept: false });
  expect(r.dead.errors.join('\n')).toMatch(/"weight"/);
  // check(definition) gives the same verdicts without keeping anything
  expect(r.dry.ok).toBe(false);
  expect(r.dry.errors).toEqual(r.dead.errors);
  expect(r.dryDraft.errors).toEqual(r.draft.errors);
  expect(r.listed.assets.map((a) => [a.id, a.ok])).toEqual([['api-test-nowords', false]]);
  const drawn = await page.evaluate(() => window.loadout.render('api-test-nowords', { frame: 3 }));
  expect(drawn.ok).toBe(true);
  expect(drawn.opaque).toBeGreaterThan(0);
});

test('(e) make.sound with a small patch passes the bar and renders audio', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async (patch) => {
    const L = window.loadout;
    const made = await L.make.sound(patch);
    return {
      made,
      wav: await L.render(patch.id),
      samples: await L.render(patch.id, { format: 'samples', seed: 2 }),
      fromText: await L.make.sound(JSON.stringify({ ...patch, id: 'api-test-blip-two' })),
      listed: await L.assets.list({ runtime: true, kind: 'sound' }),
      catalogue: await L.render('coin-pickup'),
      clash: await L.make.sound({ ...patch, id: 'coin-pickup' }),
      broken: await L.make.sound({ ...patch, id: 'api-test-broken', nodes: 'none' }),
    };
  }, GOOD_SOUND);
  expect(r.made).toMatchObject({ id: GOOD_SOUND.id, kind: 'sound', ok: true, errors: [], kept: true });
  expect(r.wav).toMatchObject({ ok: true, id: GOOD_SOUND.id, kind: 'sound', sampleRate: 44100 });
  expect(r.wav.wav).toMatch(/^data:audio\/wav;base64,UklGR/);          // "RIFF"
  expect(r.wav.seconds).toBeGreaterThan(0.02);
  expect(r.wav.peak).toBeGreaterThan(0.1);
  expect(r.samples.ok).toBe(true);
  expect(r.samples.samples.length).toBe(r.samples.channels);
  expect(r.samples.samples[0].length).toBe(Math.round(r.samples.seconds * 44100));
  expect(r.samples.samples[0].some((v) => Math.abs(v) > 0.05)).toBe(true);
  expect(r.fromText.ok).toBe(true);
  expect(r.listed.assets.map((a) => a.id).sort()).toEqual(['api-test-blip', 'api-test-blip-two']);
  expect(r.catalogue.ok).toBe(true);
  expect(r.catalogue.wav.length).toBeGreaterThan(1000);
  expect(r.clash.ok).toBe(false);
  expect(r.clash.errors[0]).toMatch(/already an asset in the catalogue/);
  expect(r.broken.ok).toBe(false);
  expect(r.broken.kept).toBe(false);
  expect(r.broken.errors.length).toBeGreaterThan(0);
});

test('(f) junk never throws: every action answers { ok: false, errors }', async ({ page }) => {
  const asked = [];
  page.on('request', (q) => asked.push(q.url()));
  await openRoute(page, '/');
  const r = await page.evaluate(async ([source, broken, plain]) => {
    const L = window.loadout;
    const out = { threw: [], bad: [] };
    const junk = [undefined, null, 42, '', 'no such thing!', {}, [], true, () => 1];
    const calls = { 'assets.get': L.assets.get, 'assets.similar': L.assets.similar, 'assets.remove': L.assets.remove, 'make.sprite': L.make.sprite, 'make.sound': L.make.sound, check: L.check, render: L.render, 'bag.add': L.bag.add, 'bag.remove': L.bag.remove, go: L.go, call: L.call };
    for (const [name, fn] of Object.entries(calls)) {
      for (const j of junk) {
        if (name === 'go' && j === '') continue;                              // '' is the home page
        try {
          const res = await fn(j, j);
          if (!(res && res.ok === false && Array.isArray(res.errors) && res.errors.length && res.errors.every((e) => typeof e === 'string' && e.length > 10))) out.bad.push(`${name}(${String(j)}) -> ${JSON.stringify(res)}`);
        } catch (e) { out.threw.push(`${name}(${String(j)}): ${e}`); }
      }
    }
    // junk filters and options
    for (const [name, run] of Object.entries({
      'list(42)': () => L.assets.list(42), 'list({ colour })': () => L.assets.list({ colour: 'red' }), 'list({ kind: 7 })': () => L.assets.list({ kind: 7 }),
      'search(7)': () => L.assets.search(7), 'search(x, 7)': () => L.assets.search('coin', 7), 'search limit': () => L.assets.search('coin', { limit: -1 }),
      'render clip': () => L.render('coin', { clip: 'fly' }), 'render frame': () => L.render('coin', { frame: 99 }), 'render scale': () => L.render('coin', { scale: 0.5 }), 'render option': () => L.render('coin', { zoom: 2 }),
      'render style': () => L.render('coin-pickup', { style: 'No such style' }), 'render unknown': () => L.render('no-such-asset'),
      'setLook(7)': () => L.bag.setLook(7), 'download(7)': () => L.bag.download(7), 'download empty': () => L.bag.download(),
      'go off site': () => L.go('https://example.com/'), 'go //': () => L.go('//example.com'), 'go nowhere': () => L.go('/nowhere'), 'go missing': () => L.go('/sprite/no-such-sprite'), 'go wrong kind': () => L.go('/sound/coin'),
      'call unknown': () => L.call('explode', {}), 'call extra': () => L.call('assets_get', { id: 'coin', loud: true }), 'call junk input': () => L.call('assets_get', 7),
    })) {
      try {
        const res = await run();
        if (!(res && res.ok === false && res.errors.length && res.errors.every((e) => typeof e === 'string' && e.length > 10))) out.bad.push(`${name} -> ${JSON.stringify(res)}`);
        else out[name] = res.errors[0];
      } catch (e) { out.threw.push(`${name}: ${e}`); }
    }
    out.source = await L.make.sprite(source);
    out.broken = await L.make.sprite(broken);
    out.plain = await L.make.sprite(plain);
    out.checkBroken = await L.check(broken);
    out.kept = (await L.assets.list({ runtime: true })).total;
    out.hash = location.hash;
    return out;
  }, [OLD_SOURCE, '{ "format": "loadout-sprite", ', { id: 'api-test-plain', name: 'Plain' }]);
  expect(r.threw).toEqual([]);
  expect(r.bad).toEqual([]);
  // the messages say what to do next
  expect(r['render clip']).toMatch(/spin/);                       // names the clips there are
  expect(r['render frame']).toMatch(/0 to \d+/);
  expect(r['render option']).toMatch(/clip, frame, scale, params, look/);
  expect(r['render unknown']).toMatch(/assets\.list|assets\.search/);
  expect(r['list({ colour })']).toMatch(/kind, type, role/);
  expect(r['go wrong kind']).toMatch(/\/sprite\/coin/);
  expect(r['call unknown']).toMatch(/make_sprite/);
  expect(r['download empty']).toMatch(/empty/);
  expect(r.source.ok).toBe(false);
  expect(r.source.errors[0]).toMatch(/no longer.*"loadout-sprite"/);
  expect(r.broken.ok).toBe(false);
  expect(r.broken.errors[0]).toMatch(/JSON/);
  expect(r.checkBroken.ok).toBe(false);
  expect(r.plain.ok).toBe(false);
  expect(r.plain.errors.join('\n')).toMatch(/format/);
  expect(r.kept, 'nothing junk was kept').toBe(0);
  expect(r.hash, 'no junk route was opened').toMatch(/^#?\/?$/);
  expect(asked.filter((u) => /example\.com/.test(u)), 'nothing was fetched from another site').toEqual([]);
});

test('the bag: add, list, look, remove, and the package', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async ([data, faulty]) => {
    const L = window.loadout;
    const first = await L.bag.add('coin', { params: { size: 1 }, scale: 2 });
    const second = await L.bag.add('coin-pickup');
    const items = await L.bag.items();
    const look = await L.bag.setLook({ colour: { hue: 30 }, mood: 'sunny' });
    const built = await L.bag.download({ save: false, data: true });
    await L.make.sprite(data);
    const mine = await L.bag.add('api-test-gem', { params: { shape: 'square' } });
    const draft = await L.make.sprite(faulty);
    const refused = await L.bag.add(draft.id);
    const removed = await L.bag.remove(second.key);
    const twice = await L.bag.remove(second.key);
    return { first, second, items, look, built, mine, refused, removed, twice, after: await L.bag.items(), header: document.querySelector('header .bag-count')?.textContent };
  }, [GOOD, noWords()]);
  expect(r.first).toMatchObject({ ok: true, count: 1 });
  expect(r.first.item).toMatchObject({ kind: 'sprite', id: 'coin', settings: { params: { size: 1 }, scale: 2 } });
  expect(r.second).toMatchObject({ ok: true, count: 2 });
  expect(r.items.items.map((i) => [i.kind, i.id])).toEqual([['sprite', 'coin'], ['sound', 'coin-pickup']]);
  expect(r.look.ok).toBe(true);
  expect(r.look.look.colour.hue).toBe(30);
  expect(r.look.warnings.join(' ')).toMatch(/mood/);
  expect(r.built).toMatchObject({ ok: true, name: 'loadout-package.zip', saved: false });
  expect(r.built.files).toEqual(expect.arrayContaining(['sprites/coin/coin.png', 'sprites/coin/coin.json', 'sounds/coin-pickup.wav', 'manifest.json']));
  expect(r.built.zip).toMatch(/^data:application\/zip;base64,UEsD/);       // "PK"
  // an asset made on this visit goes in with its whole definition; a draft that fails the quality bar is refused
  expect(r.mine).toMatchObject({ ok: true, count: 3 });
  expect(r.mine.item).toMatchObject({ kind: 'sprite', id: GOOD_ID, settings: { params: { shape: 'square' } }, definition: { data: { format: 'loadout-sprite', version: 2, id: GOOD_ID } } });
  expect(r.refused.ok).toBe(false);
  expect(r.refused.errors[0]).toMatch(/quality bar/);
  expect(r.refused.errors[0]).toMatch(/words/);
  expect(r.removed).toEqual({ ok: true, count: 2 });
  expect(r.twice.ok).toBe(false);
  expect(r.after.count).toBe(2);
  expect(r.header, 'the page header follows the bag').toBe('2');

  // download() starts the browser download of the same package
  const file = await downloadFrom(page, () => page.evaluate(() => window.loadout.bag.download()));
  expect(file.name).toBe('loadout-package.zip');
  expect(readZip(file.bytes).map((f) => f.name)).toEqual(expect.arrayContaining(['sprites/coin/coin.png', `sprites/${GOOD_ID}/${GOOD_ID}.png`, `sprites/${GOOD_ID}/${GOOD_ID}.sprite.json`, 'manifest.json']));
});

test('go opens a page of the site', async ({ page }) => {
  await openRoute(page, '/');
  const r = await page.evaluate(() => window.loadout.go('/sprite/coin'));
  expect(r).toEqual({ ok: true, route: '#/sprite/coin' });
  await expect(page.getByRole('heading', { name: 'Coin', level: 1 })).toBeVisible();
  const b = await page.evaluate(() => window.loadout.go('#/browse?kind=sound'));
  expect(b).toEqual({ ok: true, route: '#/browse?kind=sound' });
  await expect(page).toHaveURL(/#\/browse\?kind=sound$/);
});

test('the quality bar on a big sprite does not freeze the page', async ({ page }, info) => {
  await openRoute(page, '/');
  const r = await page.evaluate(async () => {
    // a timer that should tick every 10 ms: the longest wait between two ticks is how long the page was stuck
    let last = performance.now(), worst = 0;
    const tick = setInterval(() => { const now = performance.now(); worst = Math.max(worst, now - last); last = now; }, 10);
    const t0 = performance.now();
    const verdict = await window.loadout.check('knight');
    const ms = performance.now() - t0;
    const t1 = performance.now();
    const backdrop = await window.loadout.check('bg-forest');          // 320x180 frames: the most pixels of any sprite
    const backdropMs = Math.round(performance.now() - t1);
    worst = Math.max(worst, performance.now() - last);
    clearInterval(tick);
    return { ok: verdict.ok, errors: [...verdict.errors, ...backdrop.errors], onPage: verdict.warnings.some((w) => /on the page itself/.test(w)), ms: Math.round(ms), backdropMs, worst: Math.round(worst) };
  });
  info.annotations.push({ type: 'measured', description: `check('knight') ${r.ms} ms, check('bg-forest') ${r.backdropMs} ms; longest stall of the page ${r.worst} ms` });
  console.log(`  loadout.check('knight') ${r.ms} ms, loadout.check('bg-forest') ${r.backdropMs} ms; longest stall of the page during both: ${r.worst} ms`);
  expect(r.errors).toEqual([]);
  expect(r.onPage, 'the check ran in the background worker').toBe(false);
  expect(r.ms).toBeGreaterThan(100);                     // it is real work...
  expect(r.worst).toBeLessThan(Math.max(250, r.ms / 4));  // ...and the page kept ticking through it
});
