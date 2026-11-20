// A data sprite loaded by the site or the tools (app/catalog.js loadSprite, tools/lib/assets.mjs) draws any frame number
// it is asked for, as a code sprite does (build item B9, review round 1, issue 1). The sprite page's clock can ask for
// frame -1 (a requestAnimationFrame time earlier than the start) and a loop can ask for frame `frames`; a generator
// is handed the clip phase, which must lie in 0..1, so the loaders bring the frame into the clip first: a looping clip
// wraps round (frame -1 is its last frame, frame `frames` its first), a clip that plays once holds its first and last.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderFrame, defaultParams, frameSockets } from '../../engine/sprite.js';
import { loadDataSprite } from '../../tools/lib/assets.mjs';
import { dataProject, coinDef } from '../helpers/data-sprites.mjs';

/** The coin with its clip played once instead of looped. */
function onceDef() {
  const d = coinDef('coin-once');
  d.clips.idle.loop = false;
  return d;
}
const project = dataProject({ data: { coin: coinDef(), 'coin-once': onceDef() } });
const pixels = (s, frame) => Buffer.from(renderFrame(s, 'idle', frame, defaultParams(s)).bytes()).toString('base64');
const same = (s, a, b) => assert.equal(pixels(s, a), pixels(s, b), `frame ${a} is drawn as frame ${b}`);

test('a looping data clip wraps round: frame -1 is its last frame, frame `frames` its first, as a code sprite does', async () => {
  const s = await loadDataSprite(project, 'sprites/coin.json');
  const n = s.clips.idle.frames;
  assert.equal(n, 8);
  same(s, -1, n - 1);
  same(s, n, 0);
  same(s, n + 3, 3);
  same(s, -n - 2, n - 2);
  assert.notEqual(pixels(s, 0), pixels(s, 4), 'the frames of the clip still differ');
});

test('a data clip that plays once holds its first frame before it and its last after it', async () => {
  const s = await loadDataSprite(project, 'sprites/coin-once.json');
  const n = s.clips.idle.frames;
  same(s, -1, 0);
  same(s, n, n - 1);
  same(s, 100, n - 1);
});

test('frames inside the clip are drawn exactly as engine/data-sprite.js draws them', async () => {
  const { dataSprite } = await import(pathToFileURL(path.join(project, 'engine', 'data-sprite.js')).href);
  const bare = dataSprite(coinDef());
  const s = await loadDataSprite(project, 'sprites/coin.json');
  for (let f = 0; f < 8; f++) assert.equal(pixels(s, f), pixels(bare, f), `frame ${f}`);
});

test('the browser loader (app/catalog.js loadSprite) draws frames -1 and `frames` of a data sprite', async () => {
  const CATALOG = { version: 1, assets: [{ id: 'coin', kind: 'sprite', name: 'coin', bundles: [], src: 'sprites/coin.json', tech: { soundIds: [] } }], bundles: [] };
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u === 'generated/catalog.json') return { ok: true, status: 200, json: async () => CATALOG };
    const f = path.join(project, u);
    if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => null, text: async () => '' };
    const text = fs.readFileSync(f, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  try {
    const m = await import(`../../app/catalog.js?frames=1`);
    await m.loadCatalog();
    const s = await m.loadSprite('coin');
    same(s, -1, 7);
    same(s, 8, 0);
  } finally { globalThis.fetch = real; }
});

/** The coin with an attach point on its bobbing node, so its sockets move over the clip. */
function pointDef(id = 'coin-point') {
  const d = coinDef(id);
  d.points = [{ id: 'top', on: 'coin', at: [0, -9] }];
  return d;
}
const points = dataProject({ data: { 'coin-point': pointDef() } });

test('attach points of a data sprite are asked at a phase inside the clip: frame -1 gives the last frame\'s, `frames` the first\'s', async () => {
  const s = await loadDataSprite(points, 'sprites/coin-point.json');
  const p = defaultParams(s), at = (f) => frameSockets(s, 'idle', f, p);
  assert.ok(at(0)?.top, 'the coin has an attach point');
  assert.notDeepEqual(at(0), at(4), 'it moves with the bob (so a wrong phase would show)');
  assert.deepEqual(at(-1), at(7));
  assert.deepEqual(at(8), at(0));
  assert.deepEqual(at(-10), at(6));
  assert.deepEqual(s.sockets('idle', -0.125, p), s.sockets('idle', 0.875, p), 'a phase below 0 wraps round');
  assert.deepEqual(s.sockets('idle', 1.25, p), s.sockets('idle', 0.25, p), 'a phase above 1 wraps round');
});

test('a studio sprite registered through app/catalog.js addStudioSprite draws frames -1 and `frames` too', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === 'generated/catalog.json') return { ok: true, status: 200, json: async () => ({ version: 1, assets: [], bundles: [] }) };
    return { ok: false, status: 404, json: async () => null, text: async () => '' };
  };
  try {
    const m = await import('../../app/catalog.js?studio-frames=1');
    await m.loadCatalog();
    const r = await m.addStudioSprite(pointDef('zz-studio-coin'));
    assert.equal(r.ok, true, (r.errors ?? []).join('; '));
    const s = await m.loadSprite('zz-studio-coin');
    same(s, -1, 7);
    same(s, 8, 0);
    const p = defaultParams(s);
    assert.deepEqual(frameSockets(s, 'idle', -1, p), frameSockets(s, 'idle', 7, p));
    assert.equal(m.spriteNow('zz-studio-coin'), s, 'what spriteNow gives is the same wrapped sprite');
  } finally { globalThis.fetch = real; }
});
