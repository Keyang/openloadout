// Framework addition made with batch K18 (bundles/specs/core-sprites-2.md, icons-map "badge" style):
// iconBadge in engine/icons-badge.js, a small picture set on a disc of a bigger icon (a map pin's plate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn } from '../../engine/surface.js';
import { INK, col } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { ICON_SIZE, iconFit, iconTidy, iconBold } from '../../engine/icons.js';
import { iconPin, iconFlag, iconSign, iconHome } from '../../engine/icons-more.js';
import { iconBadge } from '../../engine/icons-badge.js';

const T = PALETTE.thornwood;
const ink = col(INK);
const count = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const flag = (u, pen) => iconFlag(u, pen, { cloth: T.crimson, pole: T.wood });

// A pin with a plate and a picture on it, fitted as a sprite draws it; returns the frame and what iconBadge returned.
function badge(draw = flag, { size = 0.5, bold = false } = {}) {
  const g = new Surface(...ICON_SIZE);
  let made;
  iconFit(g, { size, tilt: false, angle: 0, shade: false, shine: true }, (s, pen0) => {
    const pen = bold ? iconBold(pen0) : pen0;
    const { plate } = iconPin(s, pen, { colour: T.crimson, plate: T.cream });
    iconTidy(s).outline(INK);
    made = iconBadge(s, pen, plate, draw);
  });
  return { g, made };
}

test('iconBadge keeps every pixel it draws on the disc, outlined in ink', () => {
  for (const size of [0, 0.5, 1]) for (const draw of [flag, (u, pen) => iconSign(u, pen, { kind: 'close', colour: T.crimson }), (u, pen) => iconHome(u, pen, { wall: T.cream, roof: T.wood, door: T.crimson })]) {
    const g = new Surface(...ICON_SIZE);
    iconPin(g, { pt: (x, y) => [16 + x, 16 + y], at: (f) => (px, py) => f(px - 16, py - 16), k: 1, angle: 0, shade: false, shine: true }, { colour: T.crimson, plate: T.cream });
    const before = g.data.slice(), pen = { pt: (x, y) => [16 + x, 16 + y], at: (f) => (px, py) => f(px - 16, py - 16), k: 1 + size * 0.2, angle: 0, shade: false, shine: true, cx: 16, cy: 16 };
    const disc = { x: 0, y: -3.6, r: 5.2 }, [cx, cy] = pen.pt(disc.x, disc.y), R = disc.r * pen.k, hole = ellipseIn(cx, cy, R, R);
    const { side } = iconBadge(g, pen, disc, draw);
    assert.ok(side >= 5, `the picture is ${side} px`);
    let changed = 0, rim = 0;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (g.data[i] === before[i]) continue;
      changed++;
      assert.ok(hole(x + 0.5, y + 0.5), `pixel ${x}, ${y} is off the disc`);
      if (g.data[i] === ink) rim++;
    }
    assert.ok(changed >= 12 && rim >= 6, `${changed} pixels changed, ${rim} of them ink`);
  }
});

test('iconBadge fills a bigger disc with a bigger picture', () => {
  const pen = { pt: (x, y) => [16 + x, 16 + y], at: (f) => (px, py) => f(px - 16, py - 16), k: 1, angle: 0, shade: false, shine: true };
  const a = iconBadge(new Surface(32, 32), pen, { x: 0, y: 0, r: 5 }, flag).side;
  const b = iconBadge(new Surface(32, 32), pen, { x: 0, y: 0, r: 10 }, flag).side;
  assert.ok(b > a + 4, `${a} then ${b}`);
});

test('iconBadge follows a bold pen and draws the same pixels for the same arguments', () => {
  const plain = badge(), bold = badge(flag, { bold: true }), again = badge();
  assert.deepEqual([...plain.g.data], [...again.g.data]);
  assert.ok(count(bold.g) > count(plain.g));
  assert.ok(plain.made.side > 0);
});

test('iconBadge refuses a missing disc or drawing', () => {
  const pen = { pt: (x, y) => [x, y], at: (f) => f, k: 1 };
  assert.throws(() => iconBadge(new Surface(32, 32), pen, null, flag), /disc/);
  assert.throws(() => iconBadge(new Surface(32, 32), pen, { x: 0, y: 0, r: 4 }, null), /draw/);
});
