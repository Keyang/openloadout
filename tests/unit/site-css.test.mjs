// The redesign's style sheets (docs/site-design.md): one shared sheet with the tokens and the components, one sheet per
// page with one owner each, all linked by index.html; Geist for everything, served from the site.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FONTS, fontPlan } from '../../tools/lib/vendor.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, ROOT), 'utf8');
const html = read('index.html');
const base = read('app/css/base.css');
const PAGES = ['landing', 'library', 'asset', 'kits', 'bag', 'play', 'tray', 'studio'];

test('index.html links the fonts, base.css, then every page\'s sheet; the old sheet is gone', () => {
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(links, ['vendor/fonts/fonts.css', 'app/css/base.css', ...PAGES.map((p) => `app/css/${p}.css`)]);
  assert.ok(!fs.existsSync(new URL('app/style.css', ROOT)), 'app/style.css is deleted');
  assert.doesNotMatch(base, /legacy/, 'no layer waits for the old rules');
});

test('every screen the app draws is a rebuilt one (main.v2), so nothing depends on the old rules', () => {
  const files = fs.readdirSync(new URL('app/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    for (const m of read(`app/${f}`).matchAll(/el\('main', \{ class: '([^']*)'/g)) assert.match(m[1], /(^| )v2( |$)/, `app/${f}: <main class="${m[1]}">`);
  }
  assert.match(html, /<main class="v2 home">/, 'the loading line index.html draws');
});

test('every page sheet exists and says which page owns it', () => {
  for (const p of PAGES) {
    const css = read(`app/css/${p}.css`);
    assert.match(css, /^\/\* Loadout: [^\n]*#\//, `${p}.css names its page's address`);
    assert.match(css, /Owned by the builder of that page/);
  }
});

test('base.css has the brief\'s tokens', () => {
  const rootAt = base.indexOf(':root {');
  const root = base.slice(rootAt, base.indexOf('}', rootAt));
  for (const [name, value] of Object.entries({ paper: '#ffffff', ink: '#000000', 'ink-2': '#5c5c5c', shelf: '#f5f5f3', 'shelf-2': '#ececea', line: '#e5e5e2', 'line-2': '#cfcfcb', mark: '#f26b1d', r: '6px' })) {
    assert.match(root, new RegExp(`--${name}:\\s*${value}\\b`), `--${name} is ${value}`);
  }
  for (const [i, px] of [4, 8, 12, 16, 24, 32, 48, 64, 96, 128].entries()) assert.match(root, new RegExp(`--s${i + 1}:\\s*${px}px`), `spacing step ${px}`);
  for (const px of [12, 13, 14, 15, 18, 20, 28, 40, 72]) assert.match(root, new RegExp(`--t${px}:\\s*${px}px`), `type size ${px}`);
});

test('base.css has every component, and the accent is spent only on the change dot', () => {
  for (const sel of ['.btn', '.btn-primary', '.btn-secondary', '.btn-sm', '.btn-lg', '.chip', '.tab', '.seg', '.tile', '.card', '.token', '.dot', '.menu', '.top', '.foot', '.rx-panel', '.ctl', '.vbtn', '.rx-foot', '.saved']) {
    assert.match(base, new RegExp(`(^|[\\s,}])${sel.replace('.', '\\.')}\\s*[{,:]`, 'm'), `${sel} is defined`);
  }
  const uses = [...base.matchAll(/^.*var\(--mark\).*$/gm)].map((m) => m[0].trim());
  assert.equal(uses.length, 1, `--mark is used once, by the dot:\n${uses.join('\n')}`);
  assert.match(uses[0], /^\.dot \{/);
  // the one exception: "Surprise me" is the magic button, in colour on purpose (Keyang, 2026-11-19; app/magic.js). Its rules
  // are all named .btn-magic / magic-*, and nothing else may borrow its gradient.
  const magic = /^(\.btn-magic[^{]*|\.magic-burst[^{]*|@keyframes magic-[\w-]+\s*)\{(?:[^{}]|\{[^{}]*\})*\}\s*$/gm;
  assert.ok([...base.matchAll(magic)].length >= 4, 'the magic button\'s rules are in base.css');
  assert.doesNotMatch(base.replace(/\/\*[\s\S]*?\*\//g, '').replace(magic, ''), /#f26b1d(?![\s\S]*--mark)|box-shadow:\s*\d+px \d+px 0|(?<!mask-image:\s*)linear-gradient\((?!to right, var\(--ink\))/i, 'no second use of the accent, no hard shadows, no decorative gradients (a mask that fades a scrolling row at its edge is not decoration)');
  assert.match(base, /prefers-reduced-motion: reduce/);
  assert.match(base, /:focus-visible \{[^}]*outline/);
});

test('Geist is the site\'s typeface, served from the site; Pixelify Sans is the wordmark alone; Figtree is gone', () => {
  assert.deepEqual(FONTS.map((f) => f.family), ['Geist', 'Pixelify Sans']);
  const plan = fontPlan();
  assert.ok(plan.files.some((f) => f.to === 'fonts/geist-latin-400-normal.woff2'));
  assert.doesNotMatch(plan.css, /Figtree/);
  const fonts = read('vendor/fonts/fonts.css');
  assert.equal(fonts, plan.css, 'vendor/fonts/fonts.css is what the vendor step writes now (run "node tools/lib/vendor.mjs")');
  for (const f of plan.files) assert.ok(fs.existsSync(new URL(`vendor/${f.to}`, ROOT)), `vendor/${f.to} is there`);
  for (const f of ['index.html', 'app/css/base.css', ...PAGES.map((p) => `app/css/${p}.css`)]) assert.doesNotMatch(read(f), /Figtree/i, `${f} does not ask for Figtree`);
  assert.match(base, /--font:\s*'Geist'/);
  const pix = [...base.matchAll(/^.*Pixelify.*$/gm)].map((m) => m[0]);
  assert.equal(pix.length, 1, 'Pixelify Sans is named once, for the wordmark');
  assert.ok(!JSON.parse(read('package.json')).dependencies['@fontsource/figtree']);
});
