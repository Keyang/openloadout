// The site is static and asks no other site for anything (docs/architecture.md, hard rule 1): pages, code,
// pictures, sounds and typefaces all come from where the site itself is served.
// This test uses Playwright's plain `test` on purpose: nothing is intercepted, so every request is seen.
// Run with: npx playwright test tests/e2e/same-origin.spec.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

const ROOT = new URL('../../', import.meta.url);

test.beforeAll(() => {
  if (!fs.existsSync(new URL('generated/catalog.json', ROOT)) || !fs.existsSync(new URL('vendor/fonts/fonts.css', ROOT))) {
    execFileSync('node', ['tools/build.mjs', '--skip-quality'], { cwd: ROOT, stdio: 'ignore' });
  }
});

const PAGES = [
  ['home', '/', 'ul.results > li'],
  ['results', '/browse?q=coin', 'ul.results > li'],
  ['a sprite page', '/sprite/knight', 'canvas.stage'],
  ['the playground', '/play', 'main'],
];

for (const [name, route, drawn] of PAGES) {
  test(`${name} asks no other site for anything`, async ({ page, baseURL }) => {
    const here = new URL(baseURL).origin;
    const asked = [];
    page.on('request', (r) => asked.push(r.url()));
    await page.goto(`/index.html#${route}`);
    await page.locator(drawn).first().waitFor();
    await page.waitForFunction(() => !/^Loading/.test(document.querySelector('#app main').textContent.trim()));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForLoadState('networkidle');

    const elsewhere = asked.filter((url) => !/^(data|blob|about):/.test(url) && new URL(url).origin !== here);
    expect(elsewhere, 'requests to another origin').toEqual([]);
    expect(asked.length).toBeGreaterThan(3);
    // nothing in the page points elsewhere either (a preconnect or a link that has not fired yet)
    const pointers = await page.evaluate(() => [...document.querySelectorAll('link[href], script[src], img[src], source[src], iframe[src]')]
      .map((n) => n.href || n.src).filter((u) => /^https?:/.test(u) && new URL(u).origin !== location.origin));
    expect(pointers, 'links, scripts and pictures from another origin').toEqual([]);
  });
}

test('the two typefaces are served by the site itself and really load', async ({ page, baseURL }) => {
  const asked = [];
  page.on('request', (r) => asked.push(new URL(r.url()).pathname));
  await page.goto('/index.html#/');
  await page.locator('ul.results > li').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  expect(asked).toContain('/vendor/fonts/fonts.css');
  const fonts = asked.filter((p) => p.startsWith('/vendor/fonts/') && p.endsWith('.woff2'));
  expect(fonts.some((p) => p.includes('figtree-latin'))).toBe(true);
  expect(fonts.some((p) => p.includes('pixelify-sans-latin'))).toBe(true);
  const used = await page.evaluate(() => ({
    body: document.fonts.check('500 16px Figtree'),
    display: document.fonts.check('700 22px "Pixelify Sans"'),
    heading: getComputedStyle(document.querySelector('h1')).fontFamily,
  }));
  expect(used.body).toBe(true);
  expect(used.display).toBe(true);
  expect(used.heading).toContain('Pixelify Sans');
  // only the weights the site uses are shipped: four of Figtree, three of Pixelify Sans
  const shipped = fs.readdirSync(new URL('vendor/fonts/', ROOT)).filter((f) => f.endsWith('.woff2')).sort();
  expect(shipped).toEqual([
    'figtree-latin-400-normal.woff2', 'figtree-latin-500-normal.woff2', 'figtree-latin-600-normal.woff2', 'figtree-latin-700-normal.woff2',
    'pixelify-sans-latin-500-normal.woff2', 'pixelify-sans-latin-600-normal.woff2', 'pixelify-sans-latin-700-normal.woff2',
  ]);
  expect(new URL(baseURL).origin).toBeTruthy();
});
