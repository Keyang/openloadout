// What the sheet JSON says about stretchable pieces (docs/architecture.md, Contract 8):
// border (Unity order), rect, opening and tile, per clip and per frame, in sheet pixels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, renderSheet, renderFrame, defaultParams, cleanParams, range, clipStretch } from '../../engine/sprite.js';
import { col, INK } from '../../engine/color.js';
import coin from '../../sprites/coin.js';
import slime from '../../sprites/slime.js';
import dialogue from '../../sprites/ui-dialogue.js';
import menu from '../../sprites/ui-battle-menu.js';
import bars from '../../sprites/ui-bars-rpg.js';
import digits from '../../sprites/ui-damage-digits.js';

const NEW = ['border', 'rect', 'opening', 'tile'];
const params = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const sheet = (s, over = {}, scale = 1) => renderSheet(s, params(s, over), { scale });
const anim = (s, clip, over, scale) => sheet(s, over, scale).meta.animations[clip];
const strip = (meta) => {
  const m = JSON.parse(JSON.stringify(meta));
  for (const a of Object.values(m.animations)) for (const k of NEW) delete a[k];
  for (const f of m.frames) for (const k of NEW) delete f[k];
  return m;
};

function looks(s) {
  const out = [];
  const styles = s.params.style ? s.params.style.options.map((o) => o.value) : [undefined];
  for (const style of styles) for (const v of [0, 0.5, 1]) for (const on of [false, true]) {
    const o = {};
    if (style) o.style = style;
    for (const [k, d] of Object.entries(s.params)) { if (d.kind === 'range') o[k] = d.min + (d.max - d.min) * v; if (d.kind === 'toggle') o[k] = on; }
    out.push(o);
  }
  return out;
}

test('a sprite with no slice exports exactly what it did before: no new keys anywhere', () => {
  for (const s of [coin, slime]) for (const scale of [1, 2]) {
    const { meta } = renderSheet(s, defaultParams(s), { scale });
    assert.deepEqual(Object.keys(meta), ['app', 'version', 'sprite', 'name', 'image', 'frameWidth', 'frameHeight', 'scale', 'pivot', 'facing', 'params', 'parts', 'animations', 'frames'], s.id);
    for (const [name, a] of Object.entries(meta.animations)) assert.deepEqual(Object.keys(a), ['row', 'frames', 'fps', 'loop'], `${s.id} ${name}`);
    for (const f of meta.frames) assert.deepEqual(Object.keys(f), ['name', 'animation', 'x', 'y', 'w', 'h', 'duration'], `${s.id} ${f.name}`);
    const text = JSON.stringify(meta);
    for (const k of NEW) assert.ok(!text.includes(`"${k}"`), `${s.id}: no "${k}"`);
    assert.equal(clipStretch(s, Object.keys(s.clips)[0], defaultParams(s)), null);
  }
});

test('the stretch fields are purely additive: take them away and the sheet is byte for byte the one without a slice', () => {
  for (const s of [coin, slime]) for (const scale of [1, 3]) {
    const plain = renderSheet(s, defaultParams(s), { scale });
    const first = Object.keys(s.clips)[0];
    const sliced = Object.create(s);
    sliced.slice = { [first]: { left: 3, top: 4, right: 5, bottom: 6, rect: { x: 1, y: 2, w: 10, h: 12 }, opening: { x: 2, y: 3, w: 4, h: 5 }, tile: { x: 4, w: 3 } } };
    const out = renderSheet(sliced, defaultParams(s), { scale });
    assert.ok(out.meta.animations[first].border, 'the slice shows up');
    assert.equal(JSON.stringify(strip(out.meta), null, 2), JSON.stringify(plain.meta, null, 2), `${s.id} x${scale}: JSON`);
    assert.deepEqual(out.data, plain.data, `${s.id} x${scale}: pixels`);
  }
});

const fixture = (slice) => defineSprite({
  id: 'fixture', name: 'Fixture', size: [32, 16], pivot: [16, 8],
  params: { wide: range('Wide', 0.5) },
  clips: { a: { frames: 2, fps: 8 }, b: { frames: 1, fps: 8 }, c: { frames: 1, fps: 8 } },
  slice,
  render(g) { g.rect(1, 1, 30, 14, '#ffffff'); },
});

test('slice becomes border in Unity order, with rect, opening and tile, on the clip and on each of its frames, in sheet pixels', () => {
  const s = fixture({
    a: { left: 3, top: 4, right: 5, bottom: 6 },
    b: (p) => ({ rect: { x: 2, y: 3, w: 20, h: 10 }, left: 1, top: 2, right: 3, bottom: 4, opening: { x: 4, y: 5, w: Math.round(10 * p.wide), h: 2 } }),
  });
  for (const scale of [1, 4]) {
    const { meta } = renderSheet(s, { wide: 1 }, { scale });
    const k = scale;
    assert.deepEqual(meta.animations.a, { row: 0, frames: 2, fps: 8, loop: true, border: { left: 3 * k, bottom: 6 * k, right: 5 * k, top: 4 * k } });
    assert.deepEqual(Object.keys(meta.animations.a.border), ['left', 'bottom', 'right', 'top'], "Unity's order");
    assert.deepEqual(meta.animations.b.rect, { x: 2 * k, y: 3 * k, w: 20 * k, h: 10 * k });
    assert.deepEqual(meta.animations.b.border, { left: k, bottom: 4 * k, right: 3 * k, top: 2 * k });
    assert.deepEqual(meta.animations.b.opening, { x: 4 * k, y: 5 * k, w: 10 * k, h: 2 * k });
    assert.deepEqual(Object.keys(meta.animations.c), ['row', 'frames', 'fps', 'loop'], 'a clip with no slice gets nothing');
    for (const f of meta.frames) {
      const a = meta.animations[f.animation];
      for (const key of NEW) assert.deepEqual(f[key], a[key], `${f.name} ${key}`);
    }
  }
  // the opening follows the settings
  assert.equal(renderSheet(s, { wide: 0.5 }).meta.animations.b.opening.w, 5);
});

test('slice may also be one function of the clip and the settings; a tile pitch needs no border', () => {
  const s = fixture((clip, p) => (clip === 'a' ? { tile: { x: 6, w: 4 + Math.round(p.wide) }, opening: { x: 3, y: 4, w: 20, h: 6 } } : undefined));
  const { meta } = renderSheet(s, { wide: 1 }, { scale: 2 });
  assert.deepEqual(meta.animations.a, { row: 0, frames: 2, fps: 8, loop: true, opening: { x: 6, y: 8, w: 40, h: 12 }, tile: { x: 12, w: 10 } });
  assert.equal(meta.animations.a.border, undefined);
  assert.deepEqual(Object.keys(meta.animations.b), ['row', 'frames', 'fps', 'loop']);
  assert.deepEqual(clipStretch(s, 'a', { wide: 0 }), { opening: { x: 3, y: 4, w: 20, h: 6 }, tile: { x: 6, w: 4 } });
  assert.throws(() => renderSheet(fixture({ a: { left: 20, right: 20, top: 1, bottom: 1 } }), { wide: 0 }), /slice.*a.*leaves nothing/);
  assert.throws(() => renderSheet(fixture({ nope: { left: 1, right: 1, top: 1, bottom: 1 } }), { wide: 0 }), /slice.*nope/);
});

// ---- the four interface sprites -------------------------------------------------

// Stretch a frame the way a game engine does from the exported numbers, and check nothing smears:
// inside `rect` (or the frame), between the borders, every row and column repeats and the middle is flat.
function assertStretches(g, a, what, { flatMiddle = true } = {}) {
  const r = a.rect ?? { x: 0, y: 0, w: g.w, h: g.h }, b = a.border;
  assert.ok(b, `${what}: has a border`);
  assert.ok(b.left + b.right < r.w && b.top + b.bottom <= r.h, `${what}: something is left to stretch`);
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x + b.left; x < r.x + r.w - b.right; x++) assert.equal(g.get(x, y), g.get(r.x + b.left, y), `${what}: row ${y} repeats at x=${x}`);
  for (let x = r.x; x < r.x + r.w; x++) for (let y = r.y + b.top; y < r.y + r.h - b.bottom; y++) assert.equal(g.get(x, y), g.get(x, r.y + b.top), `${what}: column ${x} repeats at y=${y}`);
  if (flatMiddle && b.top + b.bottom < r.h) {
    const mid = new Set();
    for (let y = r.y + b.top; y < r.y + r.h - b.bottom; y++) for (let x = r.x + b.left; x < r.x + r.w - b.right; x++) mid.add(g.get(x, y));
    assert.equal(mid.size, 1, `${what}: the middle is one flat colour`);
  }
  // nothing of the piece lies outside its rect
  const box = g.bounds();
  assert.ok(box.x0 >= r.x && box.y0 >= r.y && box.x1 < r.x + r.w && box.y1 < r.y + r.h, `${what}: drawn inside its rect`);
}

test('panels: an 8 px border from the frame edge, in every look', () => {
  const eight = { left: 8, bottom: 8, right: 8, top: 8 };
  assert.deepEqual(anim(dialogue, 'box').border, eight);
  assert.deepEqual(anim(menu, 'panel').border, eight);
  assert.equal(anim(dialogue, 'box').rect, undefined, 'a piece that fills its frame has no rect');
  assert.deepEqual(anim(dialogue, 'box', {}, 3).border, { left: 24, bottom: 24, right: 24, top: 24 });
  for (const look of looks(dialogue)) assertStretches(renderFrame(dialogue, 'box', 0, params(dialogue, look)), anim(dialogue, 'box', look), `box ${JSON.stringify(look)}`);
  for (const look of looks(menu)) assertStretches(renderFrame(menu, 'panel', 0, params(menu, look)), anim(menu, 'panel', look), `panel ${JSON.stringify(look)}`);
});

test('the choice box stretches without smearing its highlighted row', () => {
  const a = anim(dialogue, 'choice');
  assert.ok(a.border.top > 8, 'the top border holds the highlighted row');
  assert.equal(a.border.bottom, 8);
  for (const look of looks(dialogue)) assertStretches(renderFrame(dialogue, 'choice', 0, params(dialogue, look)), anim(dialogue, 'choice', look), `choice ${JSON.stringify(look)}`);
});

test('the name tag and the highlight row export their rect, so they can be made as small as their borders', () => {
  const tag = anim(dialogue, 'name-tag'), row = anim(menu, 'row');
  assert.deepEqual(tag.rect, { x: 20, y: 14, w: 56, h: 20 });
  assert.deepEqual(tag.border, { left: 7, bottom: 7, right: 7, top: 7 });
  assert.ok(row.rect && row.rect.w >= 60 && row.rect.h >= 12);
  assert.ok(row.border.left + row.border.right <= 12 && row.border.top + row.border.bottom <= 12, 'a row can be as small as 12x12');
  for (const look of looks(dialogue)) assertStretches(renderFrame(dialogue, 'name-tag', 0, params(dialogue, look)), anim(dialogue, 'name-tag', look), `name-tag ${JSON.stringify(look)}`);
  for (const look of looks(menu)) assertStretches(renderFrame(menu, 'row', 0, params(menu, look)), anim(menu, 'row', look), `row ${JSON.stringify(look)}`);
  const big = anim(dialogue, 'name-tag', {}, 2);
  assert.deepEqual(big.rect, { x: 40, y: 28, w: 112, h: 40 });
});

test('glyph clips have nothing to stretch, and no slice points are exported as sockets', () => {
  for (const [s, clips] of [[dialogue, ['next']], [menu, ['cursor', 'turn-marker']], [digits, ['digit-0', 'crit', 'miss']]]) {
    const { meta } = sheet(s);
    for (const c of clips) assert.deepEqual(Object.keys(meta.animations[c]), ['row', 'frames', 'fps', 'loop'], `${s.id} ${c}`);
    assert.ok(!JSON.stringify(meta).includes('slice-'), `${s.id}: no slice sockets`);
  }
  assert.equal(sheet(dialogue).meta.frames[0].sockets, undefined, 'the dialogue box has no sockets at all');
});

test('the cursor exports its point as a `tip` socket on every frame', () => {
  const { meta } = sheet(menu, {}, 1);
  for (let f = 0; f < 8; f++) {
    const fr = meta.frames.find((x) => x.name === `cursor_${f}`);
    assert.deepEqual(Object.keys(fr.sockets), ['tip']);
    const g = renderFrame(menu, 'cursor', f, params(menu)), b = g.bounds();
    // the point: the one pixel of the arrow that is furthest right
    const rows = [];
    for (let y = 0; y < g.h; y++) if (g.get(b.x1, y)) rows.push(y);
    assert.equal(rows.length, 1, `frame ${f}: the arrow ends in a point`);
    assert.deepEqual(fr.sockets.tip, { x: b.x1 + 0.5, y: rows[0] + 0.5, angle: 1.571 }, `frame ${f}`);
    assert.ok(b.x1 - b.x0 + 1 > 15 && b.y1 - b.y0 + 1 >= 9, `frame ${f}: larger than 15x10 (${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1})`);
  }
  const big = sheet(menu, {}, 3).meta.frames.find((x) => x.name === 'cursor_0'), small = meta.frames.find((x) => x.name === 'cursor_0');
  assert.equal(big.sockets.tip.x, small.sockets.tip.x * 3);
  for (const fr of meta.frames.filter((x) => x.animation !== 'cursor')) assert.deepEqual(fr.sockets, {}, fr.name);
});

// the trough as the pixels show it: the box of everything inside the housing that is not ink and not frame-coloured
function troughOf(g, frameHex) {
  const r = (v) => v & 255, gg = (v) => (v >>> 8) & 255, b = (v) => (v >>> 16) & 255;
  const lum = (v) => (r(v) * 0.299 + gg(v) * 0.587 + b(v) * 0.114) / 255;
  const frameLum = lum(col(frameHex));
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const v = g.get(x, y);
    if (!v || v === col(INK) || lum(v) > frameLum * 0.55) continue;         // empty, ink, or one of the frame's tones
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

test('bars: the exported opening is the trough the housing really has, and every fill strip fills exactly that', () => {
  const seen = new Set();
  for (const look of looks(bars)) {
    const p = params(bars, look), { meta } = renderSheet(bars, p);
    const o = meta.animations.frame.opening;
    assert.deepEqual(troughOf(renderFrame(bars, 'frame', 0, p), p.frame), o, `housing ${JSON.stringify(look)}`);
    for (const c of ['fill', 'fill-b', 'fill-c', 'flash']) {
      assert.deepEqual(meta.animations[c].opening, o, `${c} opening`);
      const b = renderFrame(bars, c, 0, p).bounds();
      assert.deepEqual({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }, o, `${c} pixels ${JSON.stringify(look)}`);
    }
    seen.add(`${o.x},${o.w}`);
  }
  assert.ok(seen.size >= 5, `the opening moves with border and style (${[...seen].join(' ')})`);
  assert.deepEqual(anim(bars, 'fill', {}, 2).opening, Object.fromEntries(Object.entries(anim(bars, 'fill').opening).map(([k, v]) => [k, v * 2])));
});

test('bars: solid and ornate housings and fills share one border and stretch sideways with it', () => {
  for (const look of looks(bars).filter((l) => l.style !== 'segmented')) {
    const p = params(bars, look), { meta } = renderSheet(bars, p);
    const b = meta.animations.frame.border;
    assert.ok(b && b.left === b.right && b.left <= 16, JSON.stringify(b));
    for (const c of ['frame', 'fill', 'fill-b', 'fill-c', 'flash']) {
      assert.deepEqual(meta.animations[c].border, b, `${c} has the housing's border`);
      assert.equal(meta.animations[c].tile, undefined);
      const g = renderFrame(bars, c, 0, p);
      for (let y = 0; y < g.h; y++) for (let x = b.left; x < g.w - b.right; x++) assert.equal(g.get(x, y), g.get(b.left, y), `${c} row ${y} repeats at x=${x} ${JSON.stringify(look)}`);
    }
  }
});

test('bars: a segmented bar exports a tile pitch instead of a border, and really repeats at that pitch', () => {
  for (const look of looks(bars).filter((l) => l.style === 'segmented')) {
    const p = params(bars, look), { meta } = renderSheet(bars, p);
    const o = meta.animations.frame.opening;
    for (const c of ['frame', 'fill', 'fill-b', 'fill-c', 'flash']) {
      const a = meta.animations[c];
      assert.equal(a.border, undefined, `${c}: no border (stretching would smear the compartments)`);
      assert.ok(a.tile && a.tile.w >= 6 && a.tile.w <= 16, `${c}: tile ${JSON.stringify(a.tile)}`);
      assert.equal((o.w + 1) % a.tile.w, 0, 'a whole number of compartments');
      assert.ok(a.tile.x >= o.x && a.tile.x + 2 * a.tile.w <= o.x + o.w, 'the tile lies inside the opening with a neighbour to its right');
      const g = renderFrame(bars, c, 0, p);
      // the tile's columns equal the next compartment's, over the whole height of the frame
      for (let y = 0; y < g.h; y++) for (let x = a.tile.x; x < a.tile.x + a.tile.w; x++) assert.equal(g.get(x, y), g.get(x + a.tile.w, y), `${c} column ${x} repeats ${JSON.stringify(look)}`);
    }
  }
});
