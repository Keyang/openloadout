// build --dist writes the home page, already drawn, into dist/index.html (tools/lib/dist-prerender.mjs). This checks the
// rewrite itself (fillIndex), on the real index.html, without a browser: the content policy allows exactly the one inline
// script it adds, a deep link hides the pre-drawn page, the style sheets the landing uses move into the head, the others stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fillIndex } from '../../tools/lib/dist-prerender.mjs';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const page = { app: '<header class="top">H</header><main class="v2 landing" data-prerendered=""><h1>Game art</h1></main><footer class="foot">F</footer>', title: 'Loadout: <yes> & more', used: ['vendor/fonts/fonts.css', 'app/css/base.css', 'app/css/landing.css'] };
const out = fillIndex(html, page);
const head = out.slice(0, out.indexOf('</head>'));

test('the pre-drawn landing replaces the frame, and the app script is still there', () => {
  assert.match(out, /<div id="app"><header class="top">H<\/header><main class="v2 landing" data-prerendered=""><h1>Game art<\/h1><\/main><footer class="foot">F<\/footer><\/div>/);
  assert.doesNotMatch(out, /Loading…<\/p>/, 'the old loading frame is gone');
  assert.match(out, /<script type="module" src="app\/app\.js"><\/script>/);
  assert.match(head, /<title>Loadout: &lt;yes> &amp; more<\/title>/);
});

test('the content policy allows the one inline script by its hash, and nothing else inline', () => {
  const scripts = [...out.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.ok(head.includes(`<script>${scripts[0]}</script>`), 'the inline script is in the head, before the page is drawn');
  const hash = crypto.createHash('sha256').update(scripts[0], 'utf8').digest('base64');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(out)[1];
  assert.match(csp, new RegExp(`script-src 'self' 'sha256-${hash.replace(/[+/=]/g, '\\$&')}' 'wasm-unsafe-eval';`));
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*;\s*worker|script-src[^;]*unsafe-inline/, 'no unsafe-inline for scripts');
});

test('a deep link hides the pre-drawn page and shows the loading line', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(out)[1];
  const classes = new Set();
  for (const hash of ['', '#/', '#/?q=slime', '#/sprite/knight', '#/browse?kind=sound']) {
    classes.clear();
    new Function('location', 'document', script)({ hash }, { documentElement: { classList: { add: (c) => classes.add(c) } } });
    assert.equal(classes.has('deep'), !['', '#/', '#/?q=slime'].includes(hash), hash);
  }
  assert.match(head, /\.deep #app>main\[data-prerendered\]>\*,\.deep #app>footer\{display:none\}/);
  assert.match(head, /\.deep #app>main\[data-prerendered\]::before\{content:'Loading\\2026'/);
});

test('the style sheets the landing uses are in the head, in order; the others stay after the page', () => {
  const at = (href) => out.indexOf(`<link rel="stylesheet" href="${href}">`);
  const appAt = out.indexOf('<div id="app">');
  for (const href of page.used) assert.ok(at(href) > 0 && at(href) < out.indexOf('</head>'), `${href} in the head`);
  assert.ok(at('vendor/fonts/fonts.css') < at('app/css/base.css') && at('app/css/base.css') < at('app/css/landing.css'));
  for (const href of ['app/css/studio.css', 'app/css/play.css']) assert.ok(at(href) > appAt, `${href} stays after the page`);
  assert.equal(out.match(/rel="stylesheet"/g).length, html.match(/rel="stylesheet"/g).length, 'no sheet lost or doubled');
});
