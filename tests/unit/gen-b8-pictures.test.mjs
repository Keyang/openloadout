// The `pictures` layout of build item B8 (engine/gen/pictures.js; docs/data-sprites.md 2.5d), registered as the layout
// generator "pictures" so engine/data-sprite.js lays every pictures body out with it (its LAYOUTS rule). It does what
// the built-in layout of B6 does (nodes, keys, per-clip lists, motions, emitters, icon sets) and three things more:
//   1. a motion may give `args` for a node: values for the keyable arguments of the generators drawn on that node
//      (the coin's spin and glint, its collect scale and squash, the crate's lean), so whole-pixel art turns and
//      shrinks the way its generator draws it instead of being turned as a bitmap;
//   2. an emitter placed `on` a node runs in frame pixels: its `at` is put on the node first, so a burst knows where
//      the frame's edges are (engine/pickups.js collectBurst keeps its sparkles inside them);
//   3. the body's `fit` (icon.fit@1) fits each picture of an icon set: the picture's draw list goes into the fit as
//      its `draw`, the picture's `angle` as its `turn`; a picture that holds an icon.fit call of its own keeps it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dataSprite, dataFrameList } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { generator, runGenerator } from '../../engine/gen/index.js';
import { drawList } from '../../engine/draw-list.js';
import { Surface, ellipseIn } from '../../engine/surface.js';
import { iconFit, iconPaint, iconGlint, iconTidy } from '../../engine/icons.js';
import { INK } from '../../engine/color.js';

const META = (type, role, view, words) => ({ type, role, view, themes: ['fantasy'], gameTypes: ['platformer'], words, license: 'draft' });
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
const solid = (g) => g.data.filter((v) => v >>> 24).length;

const COIN = {
  format: 'loadout-sprite', version: 2, id: 'test-spin', name: 'Spinner', blurb: 'A spinning token.', size: [32, 32], pivot: [16, 30], grounded: false,
  meta: META('pickup', 'items/pickup', 'front', ['coin', 'token', 'spin', 'gold', 'pickup', 'collect']),
  palette: [
    { id: 'metal', label: 'Metal', default: '#f2c230', material: 'metal' },
    { id: 'shine', default: '#ffffff', material: 'light', detail: true },
  ],
  controls: [{ key: 'bob', kind: 'range', label: 'Float', default: 0.5 }],
  body: { pictures: {
    nodes: [{ id: 'coin', parent: null, at: [16, 16] }],
    draw: [
      { id: 'face', gen: 'token', v: 1, on: 'coin', at: [0, 0.5], size: 15, thick: 3, emblem: 'star', metal: 'metal', field: 'metal', gleam: 'shine', inlay: 'metal.dark', shine: 'shine' },
      { kind: 'outline', paint: 'ink' },
      { id: 'spark', gen: 'twinkle', v: 1, on: 'coin', at: [6, -6], size: 1, paint: 'metal.light', core: 'shine' }],
    motion: [{ gen: 'pickup.bob', v: 1, height: { from: 'bob', map: [[0, 0], [1, 2]] } }, { gen: 'pickup.spin', v: 1, node: 'coin', clip: ['spin'] }, { gen: 'pickup.collect', v: 1, node: 'coin', room: 4.9, clip: ['collect'] }],
    emitters: [{ id: 'burst', gen: 'pickup.burst', v: 1, on: 'coin', at: [0, 0], reach: 30, paint: 'metal', bright: 'metal.light', core: 'shine' }] } },
  clips: {
    spin: { frames: 8, fps: 10 },
    collect: { frames: 8, fps: 14, loop: false, keys: [{ t: 0.55, ease: 'linear', emit: { burst: { amount: 0 } } }, { t: 1, emit: { burst: { amount: 1 } } }] },
  },
};

const tokenAt = (spin, sheen, dy = 0) => {
  const r = runGenerator({ gen: 'token', v: 1, at: [16, 16.5 + dy], size: 15, thick: 3, emblem: 'star', spin, sheen, metal: 'metal', field: 'metal', gleam: 'shine', inlay: 'metal.dark', shine: 'shine' });
  assert.ok(r.ok, r.errors.join('; '));
  return r.primitives;
};

test('pictures@1 is the registered layout of a pictures body', () => {
  const g = generator('pictures', 1);
  assert.equal(g.family, 'layout');
  assert.deepEqual(runGenerator({ gen: 'pictures', v: 1 }).primitives, [], 'called as a plain generator it draws nothing');
  const s = dataSprite(COIN);
  assert.deepEqual(dataFrameList(s, 'spin', 0, { ...defaultParams(s), bob: 0 }).warnings, [], 'no "not drawn yet" warning: the motions run');
});

test('a motion\'s args reach the keyable arguments of the generators on its node: the token spins frame by frame', () => {
  const s = dataSprite(COIN);
  const p = { ...defaultParams(s), bob: 0 };
  const seen = new Set();
  for (let f = 0; f < 8; f++) {
    const t = f / 8;
    const got = renderFrame(s, 'spin', f, p);
    const want = new Surface(32, 32);
    drawList(want, [...tokenAt(180 * t, -1.6 + 3.2 * ((t + 0.5) % 1)), { kind: 'outline', paint: 'ink' }, { kind: 'stamp', at: [21, 9], rows: ['.a.', 'aba', '.a.'], key: { a: 'metal.light', b: 'shine' } }], { palette: { metal: '#f2c230', shine: '#ffffff' } });
    assert.ok(same(got, want), `spin frame ${f}`);
    seen.add(got.data.join());
  }
  assert.ok(seen.size >= 5, 'the frames differ as it turns');
  // the sparkle on the same node has no spin argument and is only moved; bob moves everything
  const up = renderFrame(s, 'spin', 2, { ...p, bob: 1 });
  assert.equal(up.bounds().y0, renderFrame(s, 'spin', 2, p).bounds().y0 - 2);
});

test('collect: the motion lifts the node and keys scale and squash; the burst on the node runs in frame pixels', () => {
  const s = dataSprite(COIN);
  const p = { ...defaultParams(s), bob: 0 };
  const sizes = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => renderFrame(s, 'collect', f, p));
  assert.ok(sizes[3].bounds().y0 < sizes[0].bounds().y0, 'it rises');
  const list = (f) => dataFrameList(s, 'collect', f, p).list;
  const sparkles = (f) => list(f).filter((x) => x.kind === 'dot' || (x.kind === 'stamp' && x.rows.length <= 5));
  assert.equal(sparkles(2).length, 1, 'only the sparkle on the coin: no burst before its key turns it on');
  const late = list(6);
  assert.ok(late.some((x) => x.kind === 'dot' || (x.kind === 'stamp' && x.rows.join('').includes('b'))), 'the burst draws');
  // the burst is centred where the coin is this frame (the node moved up by the lift), not at the node's rest point
  const r = runGenerator({ gen: 'pickup.collect', v: 1, room: 4.9 });
  assert.ok(r.ok === false || r.primitives.length === 0, 'a motion is not drawn as primitives');
  for (const f of [5, 6]) for (const x of list(f).filter((q) => q.kind === 'dot')) assert.ok(x.at[1] >= 1 && x.at[1] <= 30, 'kept inside the frame');
  assert.ok(solid(sizes[7]) < 20, 'the coin is gone at the end: only sparkle pixels are left');
});

const ICONS = {
  format: 'loadout-sprite', version: 2, id: 'test-fitted', name: 'Fitted', blurb: 'Two fitted icons.', size: [32, 32], pivot: [16, 16], grounded: false,
  meta: META('icon', 'items/icon', 'none', ['icon', 'egg', 'fish', 'food', 'item', 'symbol']),
  palette: [{ id: 'shell', label: 'Shell', default: '#f0ead8', material: 'paint' }, { id: 'shine', default: '#ffffff', material: 'light', detail: true }],
  controls: [{ key: 'size', kind: 'range', label: 'Size', lo: 'Small', hi: 'Big', default: 0.5 }, { key: 'tilt', kind: 'toggle', label: 'Tilt', default: true }],
  body: { pictures: {
    draw: [{ kind: 'outline', paint: 'ink' }],
    fit: { gen: 'icon.fit', v: 1, size: { from: 'size', map: [[0, 0], [1, 1]] }, tilt: { from: 'tilt', pick: { true: true, false: false } } },
    pictures: {
      round: { label: 'Round', angle: 26.57, draw: [{ gen: 'icon.paint', v: 1, shapes: [{ kind: 'ellipse', at: [0, 0], r: [8, 11], paint: 'shell' }], paint: 'shell', soft: 3 }, { gen: 'icon.glint', v: 1, at: [3, -6], paint: 'shine' }] },
      small: { label: 'Small', draw: [{ gen: 'icon.fit', v: 1, size: 0, fill: 0.6, tilt: false, draw: [{ gen: 'icon.paint', v: 1, shapes: [{ kind: 'ellipse', at: [0, 0], r: [8, 11], paint: 'shell' }], paint: 'shell' }] }] },
    } } },
};

test('the body\'s fit fits each picture to the Size slider; a picture with its own icon.fit keeps it', () => {
  const s = dataSprite(ICONS);
  const p = defaultParams(s);
  const side = (g) => { const b = g.bounds(); return Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); };
  assert.equal(side(renderFrame(s, 'round', 0, { ...p, size: 0 })), 20, 'Small: the longer side 20 px, outline included (engine/icons.js iconFit)');
  assert.equal(side(renderFrame(s, 'round', 0, { ...p, size: 1 })), 26, 'Big: 26 px');
  // the middle as engine/icons.js iconFit finds it for the same shape (its search stops at 22 here, not 23)
  const old = new Surface(32, 32);
  iconFit(old, { size: 0.5, tilt: true, angle: 26.57 * Math.PI / 180 }, (g, pen) => { iconPaint(g, pen, ellipseIn(0, 0, 8, 11), '#f0ead8', { soft: 3 }); iconGlint(g, pen, 3, -6); iconTidy(g).outline(INK); });
  assert.equal(side(renderFrame(s, 'round', 0, p)), side(old));
  assert.deepEqual(renderFrame(s, 'round', 0, p).bounds(), old.bounds(), 'placed where iconFit places it');
  const b = renderFrame(s, 'round', 0, p).bounds();
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - 15.5) <= 0.5 && Math.abs((b.y0 + b.y1) / 2 - 15.5) <= 0.5, 'centred in the frame');
  assert.ok(!same(renderFrame(s, 'round', 0, { ...p, tilt: false }), renderFrame(s, 'round', 0, p)), 'Tilt turns it by the picture\'s angle');
  assert.equal(side(renderFrame(s, 'small', 0, { ...p, size: 1 })), 12, 'its own fit (fill 0.6 of 20) is not fitted again');
  // the glint lands only on painted pixels: no white pixel has an empty pixel on all four sides
  const g = renderFrame(s, 'round', 0, p);
  assert.ok(g.data.some((v) => (v & 0xffffff) === 0xffffff), 'the glint is drawn');
});

// ---- after the B8 review ------------------------------------------------------------------------------------------

test('an emitter on a node runs in frame pixels: the same burst as one written at the node\'s frame point', () => {
  // the node sits in the top-right corner, where the burst keeps its sparkles inside the frame; run at the node's own
  // (0, 0) it would keep them inside the top-left corner instead
  const at = (on) => {
    const d = structuredClone(COIN);
    d.body.pictures.nodes = [{ id: 'coin', parent: null, at: [27, 5] }];
    d.body.pictures.motion = [COIN.body.pictures.motion[0]];
    d.body.pictures.emitters = [on ? { ...COIN.body.pictures.emitters[0], on: 'coin', at: [1, 0] } : { ...COIN.body.pictures.emitters[0], on: undefined, at: [28, 5] }];
    if (!on) delete d.body.pictures.emitters[0].on;
    return dataSprite(d);
  };
  const a = at(true), b = at(false), p = { ...defaultParams(a), bob: 0 };
  let drawn = 0;
  for (const f of [5, 6, 7]) {
    const la = dataFrameList(a, 'collect', f, p).list, lb = dataFrameList(b, 'collect', f, p).list;
    assert.deepEqual(la, lb, `collect frame ${f}`);
    drawn += la.length;
  }
  assert.ok(drawn > 6, 'the burst draws');
  for (const x of dataFrameList(a, 'collect', 6, p).list.filter((q) => q.kind === 'dot')) assert.ok(x.at[0] <= 31 && x.at[1] >= 0, 'inside the frame');
});

test('a motion\'s args reach only the generator they name: a keyable `spin` of another generator is left alone', async () => {
  const { createRegistry, generators } = await import('../../engine/gen/index.js');
  const { point, angle, paint } = await import('../../engine/gen/args.js');
  const reg = createRegistry();
  for (const g of generators()) reg.defineGenerator({ id: g.id, v: g.v, family: g.family, about: g.about, args: g.args, cost: g.cost, run: g.run, keyable: [...g.keyable], wraps: g.wraps });
  reg.defineGenerator({
    id: 'dial', v: 1, family: 'shape', about: 'A test dial: one dot that moves a pixel right every quarter turn.',
    args: { at: point(), spin: angle({ default: 0 }), paint: paint() }, keyable: ['spin'], cost: () => 1,
    run: (a) => [{ kind: 'dot', at: [a.at[0] + Math.round(a.spin / 90), a.at[1]], paint: a.paint }],
  });
  const d = structuredClone(COIN);
  d.body.pictures.draw.push({ id: 'dial', gen: 'dial', v: 1, on: 'coin', at: [-12, -12], paint: 'shine' });
  const s = dataSprite(d, { generators: reg }), p = { ...defaultParams(s), bob: 0 };
  const dial = (f) => dataFrameList(s, 'spin', f, p).list.filter((x) => x.kind === 'dot' && x.paint === 'shine');
  const tokens = new Set();
  for (let f = 0; f < 8; f++) {
    assert.deepEqual(dial(f).map((x) => x.at), [[4, 4]], `spin frame ${f}: the dial is not turned by pickup.spin's "token.spin"`);
    tokens.add(JSON.stringify(dataFrameList(s, 'spin', f, p).list.filter((x) => x.kind === 'stamp')));
  }
  assert.ok(tokens.size >= 5, 'the token still spins');
});

test('motions are chosen as the built-in layout chooses them: a `when` naming a direction does not hold in a pictures body', () => {
  const d = structuredClone(COIN);
  d.body.pictures.motion.push({ gen: 'pickup.bob', v: 1, height: 3, when: { direction: 'side' } });
  const s = dataSprite(d), plain = dataSprite(COIN), p = { ...defaultParams(s), bob: 0 };
  for (const f of [0, 2, 4]) assert.deepEqual(dataFrameList(s, 'spin', f, p).list, dataFrameList(plain, 'spin', f, p).list, `spin frame ${f}`);
  // and a `when` on the clip, as an item's own `clip` list, still chooses
  const c = structuredClone(COIN);
  c.body.pictures.motion.push({ gen: 'pickup.bob', v: 1, height: 3, when: { clip: 'collect' } });
  const sc = dataSprite(c);
  assert.deepEqual(dataFrameList(sc, 'spin', 2, p).list, dataFrameList(plain, 'spin', 2, p).list, 'not in spin');
  assert.notDeepEqual(dataFrameList(sc, 'collect', 2, p).list, dataFrameList(plain, 'collect', 2, p).list, 'in collect');
});

test('a key that sets an argument an emitter cannot take names amount and at once', async () => {
  const { validateSprite } = await import('../../catalog/sprite-schema.js');
  const gen = await import('../../engine/gen/index.js');
  const d = structuredClone(COIN);
  d.clips.collect.keys[0].emit = { burst: { amount: 0, reach: 3 } };
  const r = validateSprite(d, { generators: gen });
  assert.equal(r.ok, false);
  const msg = r.errors.find((e) => /cannot be keyed/.test(e));
  assert.ok(msg, r.errors.join('; '));
  assert.equal((msg.match(/amount/g) ?? []).length, 1, msg);
});
