// Framework additions of the K17 fix round 2, in engine/icons-swatch.js: icon shapes that keep the chosen
// swatch's hue and stay apart at 1x.
//   lightness, hueRamp, iconHued, iconBoards, iconOreLumps, iconSpade, iconSickle
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK, col, hexToRgb, rgbToHsl } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { ICON_SIZE, ICON_LEAN, ICON_DIAGONAL, iconFit, iconTidy } from '../../engine/icons.js';
import { lightness, hueRamp, iconHued, iconBoards, iconOreLumps, iconSpade, iconSickle } from '../../engine/icons-swatch.js';

const T = PALETTE.thornwood, H = PALETTE.hearthvale;
const hue = (hex) => rgbToHsl(...hexToRgb(hex))[0];
const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)) % 360; return Math.min(d, 360 - d); };
const hex = (v) => '#' + [v & 255, (v >>> 8) & 255, (v >>> 16) & 255].map((n) => n.toString(16).padStart(2, '0')).join('');
function fit(draw, { size = 0.5, tilt = true, angle = ICON_LEAN, shade = true, shine = true } = {}) {
  const g = new Surface(...ICON_SIZE);
  iconFit(g, { size, tilt, angle, shade, shine }, (s, pen) => { draw(s, pen); iconTidy(s).outline(INK); });
  return g;
}
const counts = (g) => { const m = new Map(); for (const v of g.data) if (v) m.set(v, (m.get(v) ?? 0) + 1); return m; };
const WOODS = [T.wood, T.soil, '#a8612a', '#c98a4a', T.cream];

test('lightness runs from 0 for black to 100 for white', () => {
  assert.ok(Math.abs(lightness('#000000')) < 0.01);
  assert.ok(Math.abs(lightness('#ffffff') - 100) < 0.01);
  assert.ok(lightness(T.steel) > lightness(T.stone));
});

test('hueRamp keeps the hue in every shade and runs light to deep', () => {
  for (const c of [...WOODS, T.steel, H.rust, T.gold]) {
    const r = hueRamp(c);
    assert.equal(r.base, c);
    for (const k of ['light', 'mid', 'dark', 'deep']) assert.ok(hueGap(r[k], c) < 6, `${c} ${k} ${r[k]}`);
    assert.ok(lightness(r.light) > lightness(c) && lightness(c) > lightness(r.mid) && lightness(r.mid) > lightness(r.dark) && lightness(r.dark) > lightness(r.deep));
  }
});

test('iconHued keeps a colour that already stands apart, and otherwise keeps its hue while parting from each neighbour', () => {
  assert.equal(iconHued(T.steel, [T.wood, T.crimson]), T.steel);
  const rust = iconHued(H.rust, [T.wood, T.crimson], [12, 20]);
  assert.notEqual(rust, H.rust);
  assert.ok(hueGap(rust, H.rust) < 3, rust);
  assert.ok(Math.abs(lightness(rust) - lightness(T.crimson)) >= 20 - 0.5);
  assert.ok(Math.abs(lightness(rust) - lightness(T.wood)) >= 12 - 0.5);
  // never sinks into the outline ink
  for (const w of WOODS) assert.ok(lightness(iconHued(T.slate, [w, T.crimson])) >= lightness(INK) + 17.5);
});

test('iconBoards: the picked wood is the commonest colour and every wood shade stays in its hue', () => {
  for (const wood of WOODS) for (const tilt of [true, false]) {
    const g = fit((s, pen) => iconBoards(s, pen, { wood }), { tilt, angle: -ICON_LEAN });
    const m = [...counts(g)].sort((a, b) => b[1] - a[1]);
    assert.equal(m[0][0], col(wood), `${wood}: commonest is ${hex(m[0][0])}`);
    for (const [v] of m) if (v !== col(INK)) assert.ok(hueGap(hex(v), wood) <= 20, `${wood} has ${hex(v)}`);
  }
});

test('iconOreLumps: the nugget faces stand 25 points of lightness off the rock round them', () => {
  const g = fit((s, pen) => iconOreLumps(s, pen, { stone: T.stone, metal: T.steel }));
  const face = col(T.steel), { w, h, data } = g;
  let faces = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (data[y * w + x] !== face) continue;
    faces++;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = data[(y + dy) * w + x + dx];
      if (n === col(T.stone)) assert.fail(`a nugget face at ${x},${y} touches the plain rock`);
    }
  }
  assert.ok(faces >= 12);
  const r = hueRamp(T.stone);
  assert.ok(lightness(T.steel) - lightness(r.deep) >= 25);
});

test('iconSpade is mirror-symmetric upright and comes to one point', () => {
  const g = fit((s, pen) => iconSpade(s, pen, { metal: T.steel, wood: T.wood }), { tilt: false, shade: false, shine: false });
  const b = g.bounds(), { w, data } = g, mid = b.x0 + b.x1;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) assert.equal(!!data[y * w + x], !!data[y * w + (mid - x)], `${x},${y}`);
  let top = 0;
  for (let x = b.x0; x <= b.x1; x++) if (data[(b.y0 + 1) * w + x] && data[(b.y0 + 1) * w + x] !== col(INK)) top++;
  assert.ok(top <= 2, 'the blade ends in a point');
});

test('iconSickle shows a long run of wood under the grip and fits the icon sizes', () => {
  for (const [size, want] of [[0, 20], [0.5, 23], [1, 26]]) for (const [tilt, angle] of [[true, ICON_DIAGONAL], [true, ICON_LEAN]]) {
    const g = fit((s, pen) => iconSickle(s, pen, { metal: T.steel, wood: T.wood, grip: T.crimson }), { size, tilt, angle });
    const b = g.bounds();
    assert.equal(Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1), want);
    const wood = counts(g).get(col(T.wood)) ?? 0;
    assert.ok(wood >= 5, `size ${size}: ${wood} px of wood`);
  }
});
