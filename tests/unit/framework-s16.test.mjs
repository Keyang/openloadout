// Framework additions made with batch S16 (sci-fi upgrade and weapon icons).
//   engine/shapes.js: burstIn, arrowIn, crossIn, hexIn, hoopIn        shape tests signs are made of
//   engine/icons.js:
//     ICON_PLATES, iconPlate     a backing plate (hexagon or disc) behind an icon, and the room it leaves
//     iconBold                   a pen that draws every shape thicker
//     iconOver                   a second colour laid on the first, with an ink line only where they touch
//     ICON_RISE, iconRise        level pictures raised towards the right by sliding whole columns
//     iconBurst, iconShot, iconArrow, iconStreaks, iconHoop, iconWing, iconMagnet, iconCrosshair, iconHeart      flat sign pictures
//     iconPistol, iconShotgun, iconBeamGun, iconLauncher, iconBlades, iconMine                                      sci-fi weapons
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { burstIn, arrowIn, crossIn, hexIn, hoopIn } from '../../engine/shapes.js';
import {
  ICON_SIZE, ICON_LEAN, ICON_RISE, ICON_PLATES, iconPen, iconFit, iconPaint, iconPlate, iconBold, iconOver, iconRise,
  iconBurst, iconShot, iconArrow, iconStreaks, iconHoop, iconWing, iconMagnet, iconCrosshair, iconHeart,
  iconPistol, iconShotgun, iconBeamGun, iconLauncher, iconBlades, iconMine,
} from '../../engine/icons.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const colours = (g) => { const s = new Set(g.data); s.delete(0); return s; };
const frame = () => new Surface(...ICON_SIZE);
const count = (test, w = 40, h = 40) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x + 0.5, y + 0.5)) n++; return n; };
const filled = (test, w = 40, h = 40) => new Surface(w, h).fill(0, 0, w, h, test, '#ffffff');
const BODY = '#5fe0f0', ACCENT = '#f2a030', METAL = '#9aa6c0', GLOW = '#5fe0f0', MARK = '#f2a030';

// ---- shape tests ---------------------------------------------------------------------------

test('burstIn: long and short points alternate, the first long one pointing up', () => {
  const b = burstIn(20, 20, 12, 8);
  assert.ok(b(20, 8.6) && b(31.4, 20) && b(20, 31.4) && b(8.6, 20), 'the four long points reach the full radius');
  const d = 12 * Math.SQRT1_2;
  assert.ok(!b(20 + d - 0.6, 20 - d + 0.6), 'a short point stops short of the full radius');
  assert.ok(b(20 + d * 0.6, 20 - d * 0.6), 'but is there further in');
  assert.ok(b(20.5, 20.5), 'the middle is solid');
  const g = filled(b).bounds();
  assert.equal(g.x1 - g.x0, g.y1 - g.y0, 'as wide as it is tall');
  assert.ok(g.x1 - g.x0 >= 18 && g.x0 === 39 - g.x1 && g.y0 === 39 - g.y1, 'and centred');
  assert.ok(count(burstIn(20, 20, 12, 8, { inner: 0.6 })) > count(b), 'a bigger inner radius makes fatter points');
});

test('arrowIn: a shaft and a wider head ending at the tip', () => {
  const a = arrowIn(4, 20, 34, 20, { shaft: 4, head: 12, long: 8 });
  assert.ok(a(5.5, 20.5) && a(5.5, 18.5) && !a(5.5, 16.5), 'the shaft is 4 wide');
  assert.ok(a(26.5, 15.5) && a(26.5, 24.5) && !a(25.5, 15.5), 'the head starts 8 before the tip and is 12 wide');
  assert.ok(a(33.4, 20), 'it reaches the tip');
  assert.ok(!a(34.5, 20.5) && !a(3.5, 20.5), 'and ends there');
  const up = filled(arrowIn(20, 34, 20, 4, { shaft: 4, head: 12, long: 8 })).bounds();
  assert.deepEqual([up.x0, up.x1, up.y1], [14, 25, 33], 'the same arrow pointing up');
  assert.ok(up.y0 <= 5, 'to within a pixel of its tip');
  const barbed = arrowIn(4, 20, 34, 20, { shaft: 4, head: 12, long: 8, notch: 3 });
  assert.ok(a(27.5, 22.6) && !barbed(27.5, 22.6) && barbed(27.5, 24.5), 'a notch cuts the back of the head into barbs');
});

test('crossIn: a plus sign with arms of even width', () => {
  const g = filled(crossIn(20, 20, 12, 4));
  assert.deepEqual(g.bounds(), { x0: 14, y0: 14, x1: 25, y1: 25 });
  assert.equal(lit(g), 12 * 4 * 2 - 16);
  assert.ok(!g.get(14, 14) && g.get(14, 19) && g.get(19, 14));
});

test('hexIn: a hexagon on its point with clean two-along one-up edges', () => {
  const g = filled(hexIn(20, 20, 24, 26));
  assert.deepEqual(g.bounds(), { x0: 8, y0: 7, x1: 31, y1: 32 });
  const row = (y) => { let n = 0; for (let x = 0; x < 40; x++) if (g.get(x, y)) n++; return n; };
  assert.deepEqual([row(7), row(8), row(9), row(10)], [2, 6, 10, 14], 'each row is two pixels wider on both sides');
  assert.equal(row(13), 24); assert.equal(row(20), 24);
  for (let y = 7; y <= 32; y++) assert.equal(row(y), row(39 - y), `row ${y} mirrors`);
  for (let y = 7; y <= 32; y++) for (let x = 0; x < 20; x++) assert.equal(!!g.get(x, y), !!g.get(39 - x, y), 'left mirrors right');
});

test('hoopIn: a band of even width round an ellipse, open in the middle', () => {
  const h = hoopIn(20, 20, 10, 6, 3);
  assert.ok(h(10.5, 20.5) && h(12.5, 20.5) && !h(13.5, 20.5), 'three wide at the side');
  assert.ok(h(20.5, 14.5) && h(20.5, 16.5) && !h(20.5, 17.5), 'three wide at the top');
  assert.ok(!h(20.5, 20.5), 'the middle is open');
  assert.ok(count(hoopIn(20, 20, 10, 6, 20)) > count(h), 'a band thicker than the hoop fills it');
});

// ---- the plate -----------------------------------------------------------------------------

test('iconPlate: a centred plate with its ink line, sized by the Size slider, leaving room for the icon', () => {
  assert.deepEqual([...ICON_PLATES], ['hex', 'circle']);
  for (const shape of ICON_PLATES) {
    let last = 0;
    for (const size of [0, 0.5, 1]) {
      const g = frame(), plate = iconPlate(g, { shape, size, face: '#434d6d', shine: true });
      const b = g.bounds(), w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
      assert.equal(Math.max(w, h), plate.side, `${shape}: side is the longer side`);
      assert.ok(plate.side >= 26 && plate.side <= 30 && plate.side % 2 === 0, `${shape} ${size}: ${plate.side} px`);
      assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${shape}: keeps the 1 px border`);
      assert.equal(b.x0, 31 - b.x1); assert.equal(b.y0, 31 - b.y1);
      assert.equal(g.get(16, b.y0), col(INK), 'inked');
      assert.ok(plate.room >= 14 && plate.room <= plate.side - 6, `${shape}: room ${plate.room}`);
      assert.ok(plate.side >= last); last = plate.side;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) assert.equal(!!g.get(x, y), !!g.get(31 - x, y), `${shape}: symmetrical`);
    }
    const flat = frame(), shiny = frame();
    iconPlate(flat, { shape, face: '#434d6d', shine: false }); iconPlate(shiny, { shape, face: '#434d6d', shine: true });
    assert.equal(colours(flat).size, 2, 'flat: the face and the ink');
    assert.equal(colours(shiny).size, 3, 'shine adds one lit tone');
    assert.ok(diff(flat, shiny) >= 12);
  }
  assert.throws(() => iconPlate(frame(), { shape: 'square', face: '#434d6d' }), /hex, circle/);
  assert.throws(() => iconPlate(frame(), { shape: 'hex' }), /face/);
});

// ---- the bold pen --------------------------------------------------------------------------

test('iconBold: every shape gains weight, nothing gets thinner', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] }), bold = iconBold(pen);
  const a = frame(), b = frame(), bar = rectIn(-8, -1.2, 16, 2.4);
  iconPaint(a, pen, bar, '#ffffff', { flat: true }); iconPaint(b, bold, bar, '#ffffff', { flat: true });
  for (let i = 0; i < a.data.length; i++) if (a.data[i]) assert.ok(b.data[i], 'the bold shape covers the plain one');
  const ha = a.bounds().y1 - a.bounds().y0 + 1, hb = b.bounds().y1 - b.bounds().y0 + 1;
  assert.ok(hb > ha && hb <= ha + 2, `${ha} -> ${hb} px thick`);
  assert.deepEqual(bold.pt(3, 4), pen.pt(3, 4), 'points are not moved');
  assert.equal(bold.shine, pen.shine);
  assert.ok(lit(iconPaint(frame(), iconBold(pen, 1), bar, '#ffffff', { flat: true })) > lit(b), 'more with a bigger amount');
});

test('iconOver: an ink line where the new shape lies on the old one, and nothing added outside', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] }), g = frame();
  iconPaint(g, pen, rectIn(-8, -3, 10, 6), '#5fe0f0', { flat: true });
  const before = lit(g);
  iconOver(g, pen, rectIn(-2, -6, 10, 12), '#f2a030', { flat: true });
  assert.equal(g.get(13, 16), col(INK), 'a parting line on the old shape, left of the new one');
  assert.equal(g.get(15, 16), col('#f2a030'));
  assert.equal(g.get(24, 16), 0, 'no line outside the picture on the right');
  assert.equal(g.get(18, 9), 0, 'nor above it');
  assert.equal(lit(g), before + 10 * 12 - 4 * 6, 'only the new shape was added');
  const lined = frame();
  iconPaint(lined, pen, rectIn(-8, -3, 10, 6), '#5fe0f0', { flat: true });
  iconOver(lined, pen, rectIn(-2, -6, 10, 12), '#f2a030', { flat: true, rim: '#ffffff' });
  assert.equal(lined.get(13, 16), col('#ffffff'), 'the line takes the rim colour');
});

test('iconRise: whole columns slide up towards the right, and it says where a point went', () => {
  assert.equal(ICON_RISE, 0.25);
  const level = frame(), risen = frame();
  const draw = (s) => s.rect(4, 15, 24, 3, '#ffffff');
  const same = iconRise(level, 0, draw), moved = iconRise(risen, ICON_RISE, draw);
  assert.deepEqual(level.bounds(), { x0: 4, y0: 15, x1: 27, y1: 17 });
  assert.deepEqual(same(20, 16), [20, 16]);
  assert.equal(lit(risen), lit(level), 'every pixel is kept');
  const b = risen.bounds();
  assert.deepEqual([b.x0, b.x1], [4, 27]);
  assert.equal(b.y1 - b.y0 + 1, 3 + 6, 'the right end stands six pixels above the left');
  for (let x = 4; x <= 27; x++) { let n = 0; for (let y = 0; y < 32; y++) if (risen.get(x, y)) n++; assert.equal(n, 3, 'each column keeps its three pixels'); }
  assert.ok(risen.get(27, 12) && !risen.get(27, 15) && risen.get(4, 20));
  const [x, y] = moved(27, 16);
  assert.equal(x, 27); assert.ok(risen.get(x, y) && y === 13, 'a point is carried with its column');
  assert.deepEqual(moved(16, 16), [16, 16], 'the middle stays');
});

// ---- signs and weapons ---------------------------------------------------------------------

const SIGNS = {
  burst: (g, pen) => iconBurst(g, pen, { colour: BODY, core: ACCENT, turn: Math.PI / 4 }),
  shot: (g, pen) => iconShot(g, pen, { from: [-10, 0], to: [10, 0], r: 3, colour: BODY, tail: ACCENT }),
  arrow: (g, pen) => iconArrow(g, pen, { from: [-10, 6], to: [10, -6], colour: BODY, head: ACCENT }),
  streaks: (g, pen) => iconStreaks(g, pen, { lines: [[-11, 2, -5], [-9, 4, 0], [-7, 2, 5]], colour: ACCENT }),
  hoop: (g, pen) => iconHoop(g, pen, { colour: ACCENT }),
  wing: (g, pen) => iconWing(g, pen, { x: 4, y: 4, len: 12, side: -1, colour: ACCENT }),
  magnet: (g, pen) => iconMagnet(g, pen, { colour: BODY, tips: ACCENT }),
  crosshair: (g, pen) => iconCrosshair(g, pen, { colour: BODY, mark: ACCENT }),
  heart: (g, pen) => iconHeart(g, pen, { colour: BODY, plus: ACCENT }),
};
const WEAPONS = {
  pistol: (g, pen) => iconPistol(g, pen, { metal: METAL, glow: GLOW }),
  shotgun: (g, pen) => iconShotgun(g, pen, { metal: METAL, glow: GLOW }),
  beamgun: (g, pen) => iconBeamGun(g, pen, { metal: METAL, glow: GLOW }),
  launcher: (g, pen) => iconLauncher(g, pen, { metal: METAL, glow: GLOW, mark: MARK }),
  blades: (g, pen) => iconBlades(g, pen, { metal: METAL, glow: GLOW }),
  mine: (g, pen) => iconMine(g, pen, { metal: METAL, glow: GLOW, mark: MARK }),
};
const drawn = (make, o = {}) => { const g = frame(); iconFit(g, { size: 0.5, tilt: false, shade: false, shine: true, ...o }, (s, pen) => { make(s, o.bold ? iconBold(pen) : pen); s.outline(INK); }); return g; };

test('every sign and weapon draws, fits the frame at every size and uses few colours', () => {
  for (const [name, make] of Object.entries({ ...SIGNS, ...WEAPONS })) {
    for (const size of [0, 0.5, 1]) for (const tilt of [false, true]) {
      const g = drawn(make, { size, tilt, angle: -ICON_LEAN }), b = g.bounds();
      assert.ok(b, `${name}: draws`);
      assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${name} size ${size} tilt ${tilt}: inside the 1 px border`);
      const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1), want = Math.round(20 + 6 * size);
      assert.ok(Math.abs(side - want) <= 1, `${name} size ${size} tilt ${tilt}: ${side} px, wanted ${want}`);
      assert.ok(colours(g).size <= 10, `${name}: ${colours(g).size} colours`);
    }
    assert.ok(lit(drawn(make)) >= 80, `${name}: a solid picture`);
  }
});

test('signs and weapons differ from one another in outline, not only in colour', () => {
  const all = Object.entries({ ...SIGNS, ...WEAPONS }).filter(([n]) => !['streaks', 'hoop', 'wing', 'shot', 'arrow'].includes(n)).map(([n, make]) => [n, drawn(make)]);
  const shape = (g) => g.data.map((v) => (v ? 1 : 0));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = shape(all[i][1]), b = shape(all[j][1]);
    let d = 0; for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) d++;
    assert.ok(d >= 60, `${all[i][0]} and ${all[j][0]} differ in ${d} pixels of outline`);
  }
});

test('each colour a shape is given shows, and shine adds light', () => {
  const swap = { [BODY]: '#e2473f', [ACCENT]: '#9fe040' };
  for (const [name, make] of Object.entries(SIGNS)) {
    const g = drawn(make), plain = drawn(make, { shine: false });
    assert.ok(diff(g, plain) >= 3, `${name}: shine changes ${diff(g, plain)} pixels`);
    assert.ok(colours(plain).size < colours(g).size || diff(g, plain) > 0, name);
  }
  for (const [name, make] of Object.entries(WEAPONS)) {
    const g = drawn(make), plain = drawn(make, { shine: false });
    assert.ok(diff(g, plain) >= 5, `${name}: shine changes ${diff(g, plain)} pixels`);
    assert.ok(colours(g).has(col(GLOW)) || colours(g).has(col('#ffffff')), `${name}: its light shows`);
  }
  // a second colour that is left out leaves a simpler picture, never an error
  assert.ok(lit(drawn((g, pen) => iconBurst(g, pen, { colour: BODY }))) > 80);
  assert.ok(lit(drawn((g, pen) => iconHeart(g, pen, { colour: BODY }))) > 80);
  assert.ok(lit(drawn((g, pen) => iconCrosshair(g, pen, { colour: BODY }))) > 60);
  assert.ok(lit(drawn((g, pen) => iconShot(g, pen, { from: [-10, 0], to: [10, 0], colour: BODY }))) > 40);
  assert.ok(swap);
});

test('a shape without the colours it needs says which', () => {
  const pen = iconPen();
  assert.throws(() => iconBurst(frame(), pen, {}), /iconBurst/);
  assert.throws(() => iconShot(frame(), pen, { colour: BODY }), /iconShot/);
  assert.throws(() => iconArrow(frame(), pen, { colour: BODY }), /iconArrow/);
  assert.throws(() => iconStreaks(frame(), pen, { colour: BODY }), /iconStreaks/);
  assert.throws(() => iconHoop(frame(), pen, {}), /iconHoop/);
  assert.throws(() => iconHoop(frame(), pen, { colour: BODY, half: 'left' }), /back, front, all/);
  assert.throws(() => iconWing(frame(), pen, {}), /iconWing/);
  assert.throws(() => iconMagnet(frame(), pen, { colour: BODY }), /iconMagnet/);
  assert.throws(() => iconCrosshair(frame(), pen, {}), /iconCrosshair/);
  assert.throws(() => iconHeart(frame(), pen, {}), /iconHeart/);
  for (const [f, name] of [[iconPistol, 'iconPistol'], [iconShotgun, 'iconShotgun'], [iconBeamGun, 'iconBeamGun'], [iconLauncher, 'iconLauncher'], [iconBlades, 'iconBlades'], [iconMine, 'iconMine']]) {
    assert.throws(() => f(frame(), pen, {}), new RegExp(name));
  }
});

test('bold thickens every sign; a hoop comes in two halves; lights are returned as points', () => {
  for (const [name, make] of Object.entries(SIGNS)) {
    const plain = drawn(make), bold = drawn(make, { bold: true });
    assert.ok(diff(plain, bold) >= 6, `${name}: bold changes ${diff(plain, bold)} pixels`);
  }
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const back = iconHoop(frame(), pen, { colour: ACCENT, half: 'back' }), front = iconHoop(frame(), pen, { colour: ACCENT, half: 'front' }), all = iconHoop(frame(), pen, { colour: ACCENT });
  assert.equal(lit(back) + lit(front), lit(all));
  assert.ok(back.bounds().y1 < front.bounds().y0, 'the back half is the upper one');
  const tip = iconBeamGun(frame(), pen, { metal: METAL, glow: GLOW }).tip;
  assert.ok(Array.isArray(tip) && tip[0] > 8, 'the beam gun says where its lit tip goes');
  const lamp = iconMine(frame(), pen, { metal: METAL, glow: GLOW, mark: MARK }).lamp;
  assert.ok(Array.isArray(lamp) && Math.abs(lamp[0]) < 1);
  const core = iconBlades(frame(), pen, { metal: METAL, glow: GLOW }).core;
  assert.deepEqual(core, [0, 0]);
  assert.ok(lit(drawn((g, p) => iconBlades(g, p, { metal: METAL, glow: GLOW, blades: 4 }))) !== lit(drawn((g, p) => iconBlades(g, p, { metal: METAL, glow: GLOW, blades: 3 }))));
});
