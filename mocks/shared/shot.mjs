// Take a screenshot of a mock page with the project's own Chromium (Playwright).
// usage: node mocks/shared/shot.mjs <path under the site root, e.g. mocks/1-studio/landing.html> <out.png>
//          [--width 1440] [--height 900] [--full] [--wait 1500] [--click "css selector"]... [--scroll 600] [--dark]
// The site must be served at http://localhost:5178 (it already is). Prints console errors of the page, if any.
import { chromium } from 'playwright';
const a = process.argv.slice(2);
const flag = (n, d) => { const i = a.indexOf(`--${n}`); return i < 0 ? d : a[i + 1]; };
const has = (n) => a.includes(`--${n}`);
const clicks = a.flatMap((x, i) => (x === '--click' ? [a[i + 1]] : []));
const [path, out] = a;
if (!path || !out) { console.error('usage: node mocks/shared/shot.mjs <page path> <out.png> [--width 1440] [--height 900] [--full] [--wait 1500] [--click sel] [--scroll px]'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(flag('width', 1440)), height: Number(flag('height', 900)) }, colorScheme: has('dark') ? 'dark' : 'light' });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('requestfailed', (r) => errors.push(`failed to load ${r.url()}`));
await page.goto(`http://localhost:${flag('port', 5178)}/${path}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(flag('wait', 1500)));
for (const sel of clicks) { await page.click(sel); await page.waitForTimeout(500); }
if (flag('scroll')) { await page.evaluate((y) => window.scrollTo(0, y), Number(flag('scroll'))); await page.waitForTimeout(400); }
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
await page.screenshot({ path: out, fullPage: has('full') });
await browser.close();
console.log(`${out}  (${flag('width', 1440)}x${flag('height', 900)}${has('full') ? ', full page' : ''})`);
if (overflow > 1) console.log(`WARNING: the page is ${overflow}px wider than the window (sideways scrolling)`);
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
