// First paint on a slow connection (final review, fault 5: the page stayed blank for 8.5 s). index.html carries the page
// frame and a "Loading" line, so something shows as soon as the style sheet arrives, and it asks for the files every
// page needs at once instead of one layer of imports after another.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = new URL('../../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', ROOT), 'utf8');
const app = html.slice(html.indexOf('<div id="app"'), html.indexOf('</div>', html.lastIndexOf('</main>')) + 6);

/** Every file app/app.js loads before it runs: its static imports, and theirs. */
function staticGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(new URL(file, ROOT), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of text.matchAll(/^\s*(?:import|export)\s+(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
      walk(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])));
    }
  };
  walk(entry);
  return seen;
}

test('the page frame and a loading line are in the HTML itself, before any script runs', () => {
  assert.match(app, /<header class="top"/, 'the header is drawn by the HTML');
  assert.match(app, /class="brand"[^>]*>Loadout</);
  assert.match(app, /<main[^>]*>[\s\S]*Loading/, 'a "Loading" line in main, the same words the app shows while it waits');
  for (const word of ['Sprites', 'Sounds', 'Music', 'Bundles', 'Play', 'Bag']) assert.match(app, new RegExp(`>${word}\\b`), `the header names ${word}`);
});

test('the catalogue is asked for at once, alongside the scripts, at low priority so the frame and style sheets come first', () => {
  assert.match(html, /<link rel="preload" href="generated\/catalog\.json" as="fetch" crossorigin fetchpriority="low">/);
});

test('the frame needs no style sheet to show: its own small style is in the head, the style sheets come after it', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  assert.match(head, /<style>[\s\S]*\.top\s*\{[\s\S]*\.home\s*\{[\s\S]*<\/style>/, 'an inline style for the header and the loading line');
  assert.doesNotMatch(head, /rel="stylesheet"/, 'a style sheet in the head would hold up the frame');
  const frameAt = html.indexOf('<div id="app"'), cssAt = html.indexOf('href="app/style.css"'), fontsAt = html.indexOf('href="vendor/fonts/fonts.css"'), scriptAt = html.indexOf('src="app/app.js"');
  assert.ok(frameAt > 0 && frameAt < cssAt && frameAt < fontsAt, 'the frame comes before the style sheets');
  assert.ok(cssAt < scriptAt, 'the script comes after the style sheets, so the site never draws unstyled');
});

test('the frame letters are the system\'s, so no font is fetched before the style sheet', () => {
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.doesNotMatch(style, /Figtree|Pixelify/);
});

test('the inline frame style uses the site\'s own colours (kept in step with app/style.css)', () => {
  const css = fs.readFileSync(new URL('app/style.css', ROOT), 'utf8');
  const root = Object.fromEntries([...css.slice(0, css.indexOf('}')).matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2].toLowerCase()]));
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).toLowerCase();
  for (const name of ['ink', 'paper', 'soft']) assert.ok(style.includes(root[name]), `--${name} ${root[name]} is used in the frame`);
});
