// The home page written into dist/index.html (build --dist only): the visitor sees the whole landing at once, as plain
// HTML and pictures, while the scripts load; then app/app.js draws the live page over it in place.
//
// How: dist/ is served on a local port and the landing (#/) opened in a headless browser, with "reduce motion" on so every
// live sprite rests on its first frame. Once every sprite has drawn, each canvas's picture is kept on it as a background
// image (data:), and the page's #app is written into index.html. app/home-live.js shows that picture on the live
// canvas that replaces it (matched by data-ph) until the canvas draws its first frame, so nothing blinks.
//
// Also in index.html: the style sheets the landing uses move into the head (the pre-drawn page needs them before it shows),
// and one small inline script in the head, allowed by its hash in the content policy, hides the landing and shows the
// "Loading" line when the address is another page (#/sprite/..., #/browse ...), so a deep link never shows the landing first.
//
//   await prerenderHome(distDir)   // -> { bytes, canvases }, or throws
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.sqlite': 'application/octet-stream', '.onnx': 'application/octet-stream' };

function serve(dir) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dir, p.endsWith('/') ? `${p}index.html` : p);
    if (!f.startsWith(dir + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

// The inline script, in the head so it runs before any of the page is drawn: another page's address (#/sprite/..., #/browse)
// marks the page "deep", and the style below hides the pre-drawn landing and shows the "Loading" line in its place, as
// index.html has it. app/app.js then draws that page as usual.
const DEEP = "if(location.hash.replace(/^#\\/?/,'').split('?')[0])document.documentElement.classList.add('deep')";
const DEEP_STYLE = ".deep #app>main[data-prerendered]>*,.deep #app>footer{display:none}"
  + ".deep #app>main[data-prerendered]{max-width:1184px;margin:0 auto;padding:48px 32px 96px;box-sizing:border-box}"
  + ".deep #app>main[data-prerendered]::before{content:'Loading\\2026';display:block;font-size:18px;line-height:1.5;color:#5c5c5c}";

const APP = /<div id="app">[\s\S]*?<\/main><\/div>/;
const LINK = /^[ \t]*<link rel="stylesheet" href="([^"]+)"[^>]*>[ \t]*\r?\n/gm;

/**
 * index.html with the pre-drawn landing in it. html: index.html as written; page: { app (the landing's #app, as HTML),
 * title, used (the addresses of the style sheets it uses) }. The sheets it uses go into the head, in their order (the
 * pre-drawn page needs them before it shows); the others stay after the page, where they hold up nothing above them.
 */
export function fillIndex(html, page) {
  if (!APP.test(html)) throw new Error('index.html has no <div id="app"> frame to fill');
  const head = [...html.matchAll(LINK)].filter((m) => page.used.includes(m[1])).map((m) => m[0].trim());
  let out = html.replace(LINK, (line, href) => (page.used.includes(href) ? '' : line));
  const hash = crypto.createHash('sha256').update(DEEP, 'utf8').digest('base64');
  out = out.replace("script-src 'self'", `script-src 'self' 'sha256-${hash}'`);
  out = out.replace('</style>', `  ${DEEP_STYLE}\n  </style>\n  <script>${DEEP}</script>`);
  out = out.replace('</head>', `  ${head.join('\n  ')}\n</head>`);
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${page.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`);
  return out.replace(APP, () => `<div id="app">${page.app}</div>`);
}

/** Pre-draw the landing into dist/index.html (see the top of this file). Arguments: dist (the dist/ folder). */
export async function prerenderHome(distDir) {
  const dist = fs.realpathSync(distDir);
  const index = path.join(dist, 'index.html');
  const html = fs.readFileSync(index, 'utf8');
  if (!APP.test(html)) throw new Error('index.html has no <div id="app"> frame to fill');
  const { chromium } = await import('@playwright/test');
  const server = await serve(dist);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/#/`, { waitUntil: 'load' });
    await page.waitForSelector('main.landing', { timeout: 60000 });
    // walk down the page so every lazy part (the live sprites draw only on screen, the kits' scenes are built near it) is drawn
    for (let y = 0, end = 1; y < end; y += 500) {
      await page.evaluate((to) => window.scrollTo(0, to), y);
      await page.waitForTimeout(120);
      end = await page.evaluate(() => document.documentElement.scrollHeight);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => {
      const live = [...document.querySelectorAll('#app canvas.live')];
      return document.querySelector('#versions .version') && document.querySelector('.demo-tools button')
        && live.length && live.every((c) => c.live && c.live.def && c.live.shown >= 0);
    }, null, { timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new Error(`the landing had errors: ${errors.slice(0, 3).join('; ')}`);
    const got = await page.evaluate(() => {
      // the kits' scenes are far down and the heaviest pictures: left empty here, the live page builds them as they come near
      for (const s of document.querySelectorAll('#app .scene')) s.replaceChildren();
      let canvases = 0;
      for (const c of document.querySelectorAll('#app canvas')) {
        const g = c.getContext('2d');
        if (!c.width || !c.height || !g) continue;
        const px = g.getImageData(0, 0, c.width, c.height).data;
        if (!px.some((v, i) => i % 4 === 3 && v)) continue;              // nothing drawn: left as it is
        c.style.backgroundImage = `url(${c.toDataURL()})`;
        c.style.backgroundSize = '100% 100%';
        canvases++;
      }
      // every picture waits until it is near the screen: when a deep link hides this page, none is fetched
      for (const img of document.querySelectorAll('#app img')) img.setAttribute('loading', 'lazy');
      document.querySelector('.demo-cursor')?.setAttribute('hidden', '');
      document.querySelector('#app > main').setAttribute('data-prerendered', '');
      // the style sheets the landing uses (a rule of theirs matches something on it), by their address in index.html
      const root = document.getElementById('app');
      const matches = (rules) => [...rules].some((r) => {
        if (r.constructor.name === 'CSSFontFaceRule') return true;            // the site's typefaces: the page's letters
        if (r.cssRules && !r.selectorText) return matches(r.cssRules);         // @media, @supports ...
        if (!r.selectorText) return false;
        try { return !!root.querySelector(r.selectorText.replace(/::?[a-z-]+(\([^)]*\))?/g, '') || '*'); } catch { return false; }
      });
      const used = [...document.styleSheets].filter((s) => s.href && matches(s.cssRules)).map((s) => new URL(s.href).pathname.slice(1));
      return { app: root.innerHTML, title: document.title, canvases, used };
    });
    const out = fillIndex(html, got);
    fs.writeFileSync(index, out);
    return { bytes: Buffer.byteLength(out), canvases: got.canvases };
  } finally {
    await browser.close();
    server.close();
  }
}
