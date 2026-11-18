// The page's side of a sprite made on a visit (Contract 11, "Safety of run-time assets"), without a browser:
//   cleanDescription   what a made sprite says about itself is read, typed and capped before the page uses it
//   standIn            the sprite the page draws with holds no made code; its render copies in pixels that arrive later
//   LIMITS             the caps, stated once
// The worker itself (app/sandbox-worker.js) needs a browser: tests/e2e/route2-safety.spec.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, cleanDescription } from '../../app/api-source.js';
import { standIn, MadeError } from '../../app/made.js';
import * as engine from '../../engine/sprite.js';
import { CALLS } from '../../app/api.js';
import { ACTIONS, LOOK, SETTINGS } from '../../app/api-actions.js';
import { PALETTES } from '../../engine/theme.js';
import { createBag, memoryStorage } from '../../app/bag.js';

const described = (over = {}) => ({
  id: 'gem', name: 'Gem', kind: 'Item', blurb: 'A gem.', size: [4, 4], pivot: [2, 3], grounded: false, preview: 'idle',
  meta: { type: 'pickup' },
  params: { size: engine.range('Size', 0.5), glint: engine.toggle('Glints', true) },
  parts: {}, sounds: {}, styles: ['pixel'],
  clips: { idle: { frames: 2, loop: true, label: 'Idle' }, pop: { frames: 3, loop: false, label: 'Pop' } },
  socketNames: null, hasSlice: false,
  ...over,
});

test('the limits are stated, and the frame cap is the largest real frame doubled', () => {
  assert.deepEqual([LIMITS.frameWidth, LIMITS.frameHeight], [640, 360]);
  assert.equal(LIMITS.sourceChars, 400_000);
  assert.equal(LIMITS.framesPerClip, 64);
  assert.equal(LIMITS.checkMs, 60_000);
  assert.ok(LIMITS.loadMs <= 10_000 && LIMITS.frameMs <= 500);
  assert.ok(Object.isFrozen(LIMITS));
});

test('cleanDescription passes a plain sprite and keeps only what it checked', () => {
  const r = cleanDescription({ ...described(), extra: 'x', render: 'not kept' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(Object.keys(r.description).sort(), ['blurb', 'clips', 'grounded', 'hasSlice', 'id', 'kind', 'meta', 'name', 'params', 'parts', 'pivot', 'preview', 'size', 'socketNames', 'sounds', 'styles']);
  assert.deepEqual(r.description.clips, { idle: { frames: 2, loop: true, label: 'Idle' }, pop: { frames: 3, loop: false, label: 'Pop' } });
});

test('cleanDescription refuses what is over a cap, or not what it says it is, and says which', () => {
  const bad = (over, re) => { const r = cleanDescription(described(over)); assert.equal(r.ok, false, JSON.stringify(over).slice(0, 60)); assert.match(r.errors.join(' | '), re); };
  bad({ size: [30000, 30000] }, /30000 by 30000.*640 by 360/);
  bad({ size: [641, 10] }, /too big/);
  bad({ size: [0, 4] }, /whole pixels/);
  bad({ size: 'big' }, /size must be/);
  bad({ clips: { idle: { frames: 10000 } } }, /10000 frames.*64/);
  bad({ clips: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`c${i}`, { frames: 1 }])) }, /40 clips.*32/);
  bad({ clips: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`c${i}`, { frames: 60 }])) }, /300 frames in all.*256/);
  bad({ clips: {} }, /at least one clip/);
  bad({ clips: { 'bad name!': { frames: 1 } } }, /clip's name/);
  bad({ id: 'Bad Id' }, /id must be/);
  bad({ id: 'x'.repeat(65) }, /id must be/);
  bad({ name: 7 }, /name/);
  bad({ name: 'n'.repeat(LIMITS.textChars + 1) }, /2,000 characters/);
  bad({ pivot: [1, Infinity] }, /pivot/);
  bad({ params: { a: { kind: 'evil' } } }, /control "a"/);
  bad({ params: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`p${i}`, engine.range('P', 0.5)])) }, /60 controls.*48/);
  bad({ meta: 'x' }, /meta/);
  assert.equal(cleanDescription(null).ok, false);
  assert.equal(cleanDescription('text').ok, false);
  assert.match(cleanDescription({ ...described(), blurb: 'x'.repeat(300_000) }).errors[0], /200,000/);
  const loop = {}; loop.self = loop;
  assert.equal(cleanDescription({ ...described(), meta: loop }).ok, false, 'not plain data');
});

// ---- the stand-in, with a pretend worker ----------------------------------------------------------------------

/** A pretend sandbox: draws frame f of a clip as a 4x4 block of one value that depends on the settings, when told to. */
function pretendSandbox() {
  const calls = [], held = [];
  const draw = ({ clips, params }) => ({
    params,
    clips: Object.fromEntries(clips.map((name) => {
      const n = name === 'idle' ? 2 : 3;
      return [name, { fps: Math.round(8 + 8 * params.size), frames: Array.from({ length: n }, (_, f) => new Uint32Array(16).fill(1000 + Math.round(params.size * 100) * 10 + f + (params.glint ? 0 : 5)).buffer), sockets: null, slice: null }];
    })),
  });
  return {
    calls, held,
    hold: false,
    frames(req) { calls.push(req); if (this.hold) return new Promise((resolve, reject) => held.push({ resolve: () => resolve(draw(req)), reject })); return Promise.resolve(draw(req)); },
    release() { for (const h of held.splice(0)) h.resolve(); },
  };
}
const pixel = (def, clip, frame, p) => engine.renderFrame(def, clip, frame, p).data[0];
const settle = () => new Promise((r) => setTimeout(r, 0));

test('standIn is an ordinary sprite: the engine draws it, and no function in it came from the source', () => {
  const def = standIn({ description: cleanDescription(described()).description, engine, sandbox: pretendSandbox() });
  assert.equal(def.made, true);
  assert.equal(def.id, 'gem');
  assert.deepEqual(engine.defaultParams(def), { size: 0.5, glint: true });
  assert.deepEqual(Object.keys(def.clips), ['idle', 'pop']);
  assert.equal(def.preview, 'idle');
  assert.equal(engine.renderFrame(def, 'idle', 0, engine.defaultParams(def)).w, 4);
});

test('prepare brings the frames of a setting; drawing then copies them in at once', async () => {
  const sandbox = pretendSandbox();
  const def = standIn({ description: cleanDescription(described()).description, engine, sandbox });
  const p = engine.defaultParams(def);
  assert.equal(def.has(p), false);
  await def.prepare(p);
  assert.equal(def.has(p), true);
  assert.equal(sandbox.calls.length, 1, 'one request for the whole sprite at these settings');
  assert.deepEqual(sandbox.calls[0].clips, ['idle', 'pop']);
  assert.equal(sandbox.calls[0].count, 5);
  assert.equal(pixel(def, 'idle', 1, p), 1501);
  assert.equal(pixel(def, 'pop', 2, p), 1502);
  assert.equal(engine.clipFps(def, 'idle', p), 12);
  await def.prepare(p);
  assert.equal(sandbox.calls.length, 1, 'what is here is not asked for again');
  // the engine's own sheet is made from the same frames
  const sheet = engine.renderSheet(def, p);
  assert.equal(sheet.data[0], 1500);
  assert.equal(sheet.meta.animations.pop.frames, 3);
});

test('a setting that is not here yet draws the nearest there is, asks for the right one, and tells listeners when it arrives', async () => {
  const sandbox = pretendSandbox();
  const def = standIn({ description: cleanDescription(described()).description, engine, sandbox });
  const base = engine.defaultParams(def), big = { ...base, size: 1 };
  assert.equal(pixel(def, 'idle', 0, base), 0, 'nothing at all yet: an empty frame, never a wait');
  await settle();
  assert.equal(pixel(def, 'idle', 0, base), 1500);
  const heard = [];
  const stop = def.onFrames((e) => heard.push(e.params.size));
  sandbox.hold = true;
  assert.equal(pixel(def, 'idle', 0, big), 1500, 'the defaults stand in while the big one is drawn');
  assert.equal(pixel(def, 'idle', 0, big), 1500);
  await settle();
  assert.equal(sandbox.held.length, 1, 'asked for once, however often it was drawn meanwhile');
  sandbox.release();
  await settle(); await settle();
  assert.deepEqual(heard, [1]);
  assert.equal(pixel(def, 'idle', 0, big), 2000);
  // a drag: many settings in a row while one request is out. Only the newest is asked for next.
  for (const size of [0.1, 0.2, 0.3, 0.4]) pixel(def, 'idle', 0, { ...base, size });
  await settle();
  sandbox.release();
  await settle(); await settle();
  sandbox.release();
  await settle(); await settle();
  const asked = sandbox.calls.map((c) => c.params.size);
  assert.ok(asked.includes(0.4), 'the newest setting is drawn');
  assert.ok(!asked.includes(0.2) && !asked.includes(0.3), `the ones in between are skipped: ${asked}`);
  assert.equal(pixel(def, 'idle', 0, { ...base, size: 0.3 }), 1400, 'and a skipped one shows the last look drawn, the newest');
  stop();
});

test('whenReady brings the defaults and every setting the bag holds; it never rejects', async () => {
  const sandbox = pretendSandbox();
  const def = standIn({ description: cleanDescription(described()).description, engine, sandbox, bagSettings: () => [{ size: 0.9, glint: false }, { size: 0.9, glint: false }] });
  assert.equal(await def.whenReady(), def);
  assert.equal(sandbox.calls.length, 2, 'the defaults, and the one bag setting once');
  assert.equal(pixel(def, 'idle', 0, { size: 0.9, glint: false }), 1905);
  const broken = standIn({ description: cleanDescription(described()).description, engine, sandbox: { frames: () => Promise.reject(new MadeError('too slow', { limit: true })) }, onProblem: () => {} });
  assert.equal(await broken.whenReady(), broken);
  assert.equal(pixel(broken, 'idle', 0, engine.defaultParams(broken)), 0);
});

test('frames of the wrong size or number are refused, not drawn', async () => {
  const short = { frames: async ({ clips }) => ({ clips: Object.fromEntries(clips.map((c) => [c, { fps: 8, frames: [new Uint32Array(16).buffer] }])) }) };
  const def = standIn({ description: cleanDescription(described()).description, engine, sandbox: short, onProblem: () => {} });
  await assert.rejects(def.prepare(null), /wrong number of frames/);
  const small = { frames: async ({ clips }) => ({ clips: Object.fromEntries(clips.map((c) => [c, { fps: 8, frames: Array.from({ length: c === 'idle' ? 2 : 3 }, () => new Uint32Array(4).buffer) }])) }) };
  const def2 = standIn({ description: cleanDescription(described()).description, engine, sandbox: small, onProblem: () => {} });
  await assert.rejects(def2.prepare(null), /wrong size/);
  assert.equal(pixel(def2, 'idle', 0, engine.defaultParams(def2)), 0);
});

test('a sprite whose description the engine refuses is not made', () => {
  const d = cleanDescription(described({ sounds: { nope: [{ sound: 'x', frame: 0 }] } })).description;
  assert.throws(() => standIn({ description: d, engine, sandbox: pretendSandbox() }), /sounds lists clip "nope"/);
});

// ---- the small file every visitor loads, and the action list ---------------------------------------------------

test('app/api.js names exactly the calls of the action list', () => {
  assert.deepEqual([...CALLS].sort(), ACTIONS.map((a) => a.call).sort());
});

test('a look and an item\'s settings are spelled out: no "any object", and the palette names come from the code', () => {
  assert.equal(LOOK.additionalProperties, false);
  assert.deepEqual(Object.keys(LOOK.properties), ['seed', 'colour', 'sound', 'music', 'shapes']);
  for (const part of ['colour', 'sound', 'music']) assert.equal(LOOK.properties[part].additionalProperties, false, part);
  assert.deepEqual(LOOK.properties.colour.properties.palette.oneOf[0].enum, PALETTES.map((p) => p.name));
  assert.equal(SETTINGS.additionalProperties, false);
  assert.deepEqual(Object.keys(SETTINGS.properties), ['params', 'cues', 'scale', 'artStyle', 'style', 'seed']);
  const using = (schema) => JSON.stringify(ACTIONS.filter((a) => JSON.stringify(a.inputSchema).includes(JSON.stringify(schema))).map((a) => a.name));
  assert.equal(using(LOOK), '["render","bag_set_look"]');
  assert.equal(using(SETTINGS), '["bag_add","bag_update"]');
  for (const name of ['bag_clear', 'bag_update', 'bag_link']) assert.ok(ACTIONS.some((a) => a.name === name), name);
  const make = ACTIONS.find((a) => a.name === 'make_sprite').description;
  assert.match(make, /worker of its own, never in the page/);
  assert.match(make, /640 by 360/);
});

// ---- the bag says when a save failed ---------------------------------------------------------------------------

test('a save the storage refuses is known: saved() is false, and true again once a save goes through', () => {
  const inner = memoryStorage();
  let full = false;
  const storage = { getItem: (k) => inner.getItem(k), setItem: (k, v) => { if (full) throw new DOMException('full', 'QuotaExceededError'); inner.setItem(k, v); }, removeItem: (k) => inner.removeItem(k) };
  const bag = createBag(storage);
  assert.equal(bag.saved(), true);
  const a = bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  assert.equal(bag.saved(), true);
  full = true;
  const b = bag.add({ kind: 'sprite', id: 'coin', settings: {} });
  assert.equal(bag.saved(), false);
  assert.equal(bag.count(), 2, 'it is in the bag for this visit');
  assert.deepEqual(createBag(storage).items().map((i) => i.id), ['knight'], 'and not in storage');
  bag.remove(b);
  assert.equal(bag.saved(), false, 'still refused');
  full = false;
  bag.update(a, { params: { size: 1 } });
  assert.equal(bag.saved(), true);
  assert.deepEqual(createBag(storage).items().map((i) => i.id), ['knight']);
});

test('touch tells listeners to look again without changing or saving anything', () => {
  const storage = memoryStorage();
  const bag = createBag(storage);
  bag.add({ kind: 'sprite', id: 'knight', settings: {} });
  const before = storage.getItem('loadout-bag-v1');
  let told = 0;
  bag.onChange(() => told++);
  bag.touch();
  assert.equal(told, 1);
  assert.equal(storage.getItem('loadout-bag-v1'), before);
});

// ---- art styles (Contract 12): what a made sprite drew on a surface that is not a pixel grid arrives as data --------

test('a made sprite in another art style: the surface data is checked, copied onto the page\'s own surface, and finished there', async () => {
  await import('../fixtures/styles/styles.js');            // two test styles: a finish on pixels, and a surface that records shapes
  const d = cleanDescription(described({ styles: ['pixel', 'silhouette', 'outline-svg'] })).description;
  const drawn = (style) => (style === 'pixel' ? new Uint32Array(16).fill(7).buffer
    : style === 'silhouette' ? { w: 4, h: 4, data: new Uint32Array(16).fill(7), shadow: [-1, 1] }
      : { w: 4, h: 4, shadow: [-1, 1], ops: [{ kind: 'rect', x: 0, y: 0, w: 2, h: 2, c: 4278190335, r1: undefined }], skipped: {} });
  const asked = [];
  const sandbox = { frames: async ({ clips, style }) => { asked.push(style); return { clips: Object.fromEntries(clips.map((c) => [c, { fps: 8, frames: Array.from({ length: c === 'idle' ? 2 : 3 }, () => drawn(style)) }])) }; } };
  const def = standIn({ description: d, engine, sandbox, styles: d.styles, onProblem: () => {} });
  assert.deepEqual(def.styles, ['pixel', 'silhouette', 'outline-svg']);
  const p = engine.defaultParams(def);
  const count = (style) => engine.renderPixels(def, 'idle', 0, p, { style }).data.filter(Boolean).length;
  assert.equal(count('outline-svg'), 0, 'not here yet, and what another style drew never stands in for it');
  for (const style of d.styles) await def.prepare(p, { style });
  assert.deepEqual(asked.slice(-3), ['pixel', 'silhouette', 'outline-svg']);
  assert.equal(count('pixel'), 16);
  assert.equal(count('silhouette'), 16);
  assert.equal(engine.renderPixels(def, 'idle', 0, p, { style: 'silhouette' }).data[0], engine.renderPixels(def, 'idle', 1, p, { style: 'silhouette' }).data[0], 'the style\'s finish ran on the page: one colour');
  assert.notEqual(engine.renderPixels(def, 'idle', 0, p, { style: 'silhouette' }).data[0], 7);
  assert.equal(count('outline-svg'), 4);
  // drawing twice does not wear the kept copy
  engine.renderFrame(def, 'idle', 0, p, { style: 'outline-svg' }).ops.length = 0;
  assert.equal(count('outline-svg'), 4);
  await assert.rejects(def.prepare(p, { style: 'no-such-style' }), /cannot be drawn in the style "no-such-style"/);
});

test('surface data that is not plain drawing data is refused: markup, functions, odd objects, too much', async () => {
  await import('../fixtures/styles/styles.js');
  const d = cleanDescription(described({ styles: ['pixel', 'outline-svg'] })).description;
  const tryWith = async (state) => {
    const sandbox = { frames: async ({ clips, style }) => ({ clips: Object.fromEntries(clips.map((c) => [c, { fps: 8, frames: Array.from({ length: c === 'idle' ? 2 : 3 }, () => (style === 'pixel' ? new Uint32Array(16).buffer : state)) }])) }) };
    const def = standIn({ description: d, engine, sandbox, styles: d.styles, onProblem: () => {} });
    return def.prepare(null, { style: 'outline-svg' });
  };
  await tryWith({ w: 4, h: 4, ops: [{ kind: 'rect', c: 1, note: 'M 0 0 L 4 4 Z #ff0000 rgb(1, 2, 3)' }] });
  for (const bad of [
    { ops: [{ kind: '"><script>alert(1)</script>' }] },
    { ops: [{ kind: 'rect', c: "red' onload='x" }] },
    { ops: [{ ['a"b']: 1 }] },
    { ops: [new Map()] },
    { when: new Date(0) },
    { text: 'x'.repeat(201) },
    { ops: Array.from({ length: 300_000 }, () => 1) },
    { a: { a: { a: { a: { a: { a: { a: { a: { a: { a: 1 } } } } } } } } } },
    'just text', 7, null, [1, 2], new Uint32Array(16).buffer,
  ]) await assert.rejects(tryWith(bad), /not plain drawing data/, JSON.stringify(bad)?.slice(0, 60));
});

test('prepareAround brings what one more click could ask for, and isFor tells an arrival for the settings on screen from the rest', async () => {
  const sandbox = pretendSandbox();
  const def = standIn({ description: cleanDescription(described({ params: { size: engine.range('Size', 0.5), glint: engine.toggle('Glints', true), cut: engine.choice('Cut', 'a', ['a', 'b', 'c']) } })).description, engine, sandbox });
  const p = engine.defaultParams(def);
  const heard = [];
  def.onFrames((e) => heard.push(def.isFor(e, p)));
  await def.prepare(p);
  await def.prepareAround(p);
  assert.deepEqual(sandbox.calls.slice(1).map((c) => [c.params.cut, c.params.glint]), [['a', false], ['b', true], ['c', true]], 'the switch flipped, and each other option; sliders are not guessed at');
  assert.deepEqual(heard, [true, false, false, false]);
  assert.equal(def.has({ ...p, cut: 'c' }), true);
  const before = sandbox.calls.length;
  await def.prepareAround(p);
  assert.equal(sandbox.calls.length, before, 'what is here is not asked for again');
});
