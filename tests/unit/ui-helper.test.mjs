// The interface helper (engine/ui.js): nine-slice panels, button states, bars.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { THEME_PRESETS } from '../../engine/theme.js';
import { PALETTE } from '../../engine/palettes.js';
import { INK, col, brightness, rgbToHsl, tone } from '../../engine/color.js';
import { roundRectIn, digitBody } from '../../engine/ui.js';

const FACE = '#2b3a67', FRAME = '#f0ead8', GOLD = '#f2c230', HEAL = '#7fe0a0';
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const block = (g, x, y, w, h) => { const out = []; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push(g.get(x + i, y + j)); return out; };
const rgb = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
const hexOf = (v) => '#' + rgb(v).map((c) => c.toString(16).padStart(2, '0')).join('');
const colours = (g) => new Set([...g.data].filter(Boolean));

const LOOKS = [];
for (const style of ['plain', 'ornate', 'scroll']) for (const corner of [0, 0.5, 1]) for (const border of [0, 0.5, 1]) for (const shadow of [false, true]) LOOKS.push({ style, corner, border, shadow });
const name = (o) => JSON.stringify(o);

test('roundRectIn cuts the same pixels off all four corners and none when square', () => {
  const sq = new Surface(20, 12).fill(0, 0, 20, 12, roundRectIn(2, 1, 16, 10, 0), '#ffffff');
  assert.equal(count(sq), 160);
  for (const k of [1, 2, 3, 4]) {
    const g = new Surface(20, 12).fill(0, 0, 20, 12, roundRectIn(2, 1, 16, 10, k), '#ffffff');
    assert.ok(count(g) < 160, `k=${k} cuts something`);
    assert.ok(!g.get(2, 1) && !g.get(17, 1) && !g.get(2, 10) && !g.get(17, 10), `k=${k} corners are cut`);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) {
      assert.equal(!!g.get(x, y), !!g.get(19 - x, y), `k=${k} mirrored left-right at ${x},${y}`);
      assert.equal(!!g.get(x, y), !!g.get(x, 11 - y), `k=${k} mirrored top-bottom at ${x},${y}`);
    }
    assert.deepEqual(g.bounds(), { x0: 2, y0: 1, x1: 17, y1: 10 }, `k=${k} still reaches every side`);
  }
});

const BAR = { frame: FRAME, fill: HEAL };
const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

const bodyDiff = (a, b) => { let n = 0; for (let y = 0; y < Math.max(a.h, b.h); y++) for (let x = 0; x < Math.max(a.w, b.w); x++) if (!!a.at(x, y) !== !!b.at(x, y)) n++; return n; };
const DIGIT_LOOKS = [];
for (const style of ['chunky', 'slim', 'rounded']) for (const size of [0, 0.5, 1]) DIGIT_LOOKS.push({ style, size });
