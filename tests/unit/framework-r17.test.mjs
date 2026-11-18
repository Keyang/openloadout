// Framework additions made with batch R17 (RPG equipment icons and status marks):
//   engine/icons.js   ICON_SLANT, iconSlant        lean an upright drawing by sliding whole rows (worn things with square details)
//                     iconSword, iconDagger, iconStaff, iconBow                 weapons, standing on their handles
//                     iconShield, iconHelm, iconArmour, iconRing, iconBoot      things worn
//   engine/glyphs.js  GLYPH_TONES, glyphPicture, glyphFlip, glyphOver, drawGlyph   tiny pictures written as rows of characters
//                     PLATE_SHAPES, glyphPlate                                  the round or square plate behind a glyph
//                     STATUS_MARKS, statusMark                                  the ten status marks, regular and bold
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, rectIn } from '../../engine/surface.js';
import { ramp, col, INK } from '../../engine/color.js';
import {
  ICON_SIZE, ICON_DIAGONAL, ICON_LEAN, ICON_SLANT, iconPen, iconFit, iconPaint, iconTidy, iconSlant,
  iconSword, iconDagger, iconStaff, iconBow, iconShield, iconHelm, iconArmour, iconRing, iconBoot,
} from '../../engine/icons.js';
import { GLYPH_TONES, glyphPicture, glyphFlip, glyphOver, drawGlyph, PLATE_SHAPES, glyphPlate, STATUS_MARKS, statusMark } from '../../engine/glyphs.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const shapeDiff = (a, b) => a.data.reduce((n, v, i) => n + (!v !== !b.data[i] ? 1 : 0), 0);
const colours = (g) => { const s = new Set(g.data); s.delete(0); return s; };
const frame = () => new Surface(...ICON_SIZE);
const WHITE = col('#ffffff');
const C = { metal: '#c2c9d6', gold: '#f2c230', wood: '#9a6a3e', leather: '#8e3a4a', gem: '#4fd8ee', cream: '#f0ead8' };

// ---- gear shapes ------------------------------------------------------------------------------

const GEAR = {
  sword: { angle: ICON_DIAGONAL, draw: (g, pen) => iconSword(g, pen, { metal: C.metal, hilt: C.gold, grip: C.leather, gem: C.gem }) },
  staff: { angle: ICON_DIAGONAL, draw: (g, pen) => iconStaff(g, pen, { wood: C.wood, metal: C.metal, orb: C.gem, grip: C.leather }) },
  dagger: { angle: ICON_DIAGONAL, draw: (g, pen) => iconDagger(g, pen, { metal: C.metal, hilt: C.gold, grip: C.leather }) },
  bow: { angle: ICON_DIAGONAL, draw: (g, pen) => iconBow(g, pen, { wood: C.wood, grip: C.leather, tips: C.metal, string: C.cream }) },
  shield: { angle: ICON_LEAN, draw: (g, pen) => iconShield(g, pen, { face: C.wood, rim: C.metal, gem: C.gem }) },
  helm: { slant: ICON_SLANT, draw: (g, pen) => iconHelm(g, pen, { metal: C.metal, horn: C.cream, gem: C.gem }) },
  armour: { slant: ICON_SLANT, draw: (g, pen) => iconArmour(g, pen, { metal: C.metal, belt: C.leather, buckle: C.gold, gem: C.gem }) },
  ring: { angle: ICON_LEAN, draw: (g, pen) => iconRing(g, pen, { metal: C.metal, gem: C.gem }) },
  boots: { slant: ICON_SLANT, draw: (g, pen) => iconBoot(g, pen, { leather: C.leather, sole: C.wood, buckle: C.metal, pair: true }) },
};
const gear = (name, o = {}) => {
  const g = frame(), it = GEAR[name], tilt = o.tilt ?? true;
  const fit = iconFit(g, { ...o, tilt, angle: it.angle ?? 0 }, (s, pen) => { iconSlant(s, it.slant && tilt ? it.slant : 0, (u) => it.draw(u, pen)); iconTidy(s).outline(INK); });
  return Object.assign(g, { fit });
};

test('every gear shape fills its slot at every size and keeps the 1 px border', () => {
  for (const name of Object.keys(GEAR)) for (const tilt of [true, false]) for (const [size, want] of [[0, 20], [0.5, 23], [1, 26]]) {
    const g = gear(name, { size, tilt }), b = g.bounds();
    assert.ok(b, `${name} draws something`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${name} size ${size} tilt ${tilt} stays inside the border`);
    const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    assert.ok(Math.abs(side - want) <= 1, `${name} size ${size} tilt ${tilt}: longer side ${side}, wanted ${want}`);
    assert.ok(colours(g).size <= 16, `${name} uses ${colours(g).size} colours`);
  }
});

test('no two gear shapes share a silhouette, leaning or upright', () => {
  const names = Object.keys(GEAR);
  for (const tilt of [true, false]) for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const d = shapeDiff(gear(names[i], { tilt }), gear(names[j], { tilt }));
    assert.ok(d > 60, `${names[i]} and ${names[j]} (tilt ${tilt}) differ by only ${d} pixels of outline`);
  }
});

test('every gear shape needs its colours and shows them', () => {
  const pen = iconPen({ tilt: false });
  for (const f of [iconSword, iconDagger, iconStaff, iconBow, iconShield, iconHelm, iconArmour, iconRing, iconBoot]) assert.throws(() => f(frame(), pen, {}), /needs/);
  for (const name of Object.keys(GEAR)) assert.ok(colours(gear(name)).has(col(INK)), `${name} is outlined`);
  assert.ok(colours(gear('sword')).has(col(ramp(C.gem).base)), 'the sword shows its jewel');
  assert.ok(colours(gear('bow')).has(col(C.cream)), 'the bow shows its string');
  assert.ok(colours(gear('ring')).has(col(ramp(C.metal).base)), 'the ring shows its metal');
});

test('shine and soft shading change every gear shape', () => {
  for (const name of Object.keys(GEAR)) {
    const full = gear(name), dull = gear(name, { shine: false }), hard = gear(name, { shade: false });
    assert.ok(diff(full, dull) > 2, `${name}: shine changes ${diff(full, dull)} pixels`);
    assert.ok(diff(full, hard) > 2, `${name}: soft shading changes ${diff(full, hard)} pixels`);
    assert.ok(!colours(dull).has(WHITE), `${name} has no white glint without shine`);
  }
});

test('gear options: blade length, horns, a pair of boots, bars on a shield', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const o = { metal: C.metal, hilt: C.gold, grip: C.leather };
  assert.ok(iconSword(frame(), pen, { ...o, long: 10 }).tip[1] > iconSword(frame(), pen, o).tip[1], 'a shorter blade ends lower');
  assert.deepEqual(iconSword(frame(), pen, { ...o, long: 99 }).tip, iconSword(frame(), pen, { ...o, long: 18 }).tip, 'the length is held to 18');
  const wide = (g) => { const b = g.bounds(); return b.x1 - b.x0 + 1; };
  assert.ok(wide(iconHelm(frame(), pen, { metal: C.metal, horn: C.cream })) > wide(iconHelm(frame(), pen, { metal: C.metal })), 'horns widen the helm');
  const b = { leather: C.leather, sole: C.wood, buckle: C.metal };
  assert.ok(wide(iconBoot(frame(), pen, { ...b, pair: true })) > wide(iconBoot(frame(), pen, b)), 'a pair is wider than one boot');
  assert.ok(diff(iconShield(frame(), pen, { face: C.wood, rim: C.metal, bars: true }), iconShield(frame(), pen, { face: C.wood, rim: C.metal })) > 10, 'bars show on the board');
  assert.throws(() => iconRing(frame(), pen, { metal: C.metal, gem: C.gem, cut: 'banana' }), /cut/);
  assert.deepEqual(iconStaff(frame(), pen, { wood: C.wood, metal: C.metal, orb: C.gem }).orb.length, 2);
});

test('iconSlant: slope 0 paints straight on; a slope slides whole rows and keeps every pixel', () => {
  assert.equal(ICON_SLANT, 0.25);
  const pen = iconPen({ tilt: false, span: [1, 1] }), box = (u) => iconPaint(u, pen, rectIn(-4, -10, 8, 20), '#c2c9d6');
  const straight = iconSlant(frame(), 0, box), leaned = iconSlant(frame(), ICON_SLANT, box);
  assert.deepEqual(straight.bounds(), { x0: 12, y0: 6, x1: 19, y1: 25 });
  assert.equal(lit(leaned), lit(straight), 'no pixel is lost or made');
  assert.deepEqual([...colours(leaned)].sort(), [...colours(straight)].sort(), 'no colour is made');
  const row = (g, y) => { let x = 0; while (!g.get(x, y)) x++; return x; };
  assert.ok(row(leaned, 6) > row(straight, 6), 'the top slides right');
  assert.ok(row(leaned, 25) < row(straight, 25), 'the foot slides left');
  assert.equal(row(leaned, 16), row(straight, 16), 'the middle stays');
  for (let y = 6; y <= 25; y++) { let n = 0; for (let x = 0; x < 32; x++) if (leaned.get(x, y)) n++; assert.equal(n, 8, `row ${y} keeps its 8 pixels`); }
});

// ---- glyph pictures ---------------------------------------------------------------------------

test('glyphPicture: one character is one pixel; short rows are padded; unknown characters are refused', () => {
  const p = glyphPicture(['.#', 'o x', '*']);
  assert.equal(p.w, 3); assert.equal(p.h, 3);
  assert.deepEqual([...p.rows], ['.#.', 'o.x', '*..']);
  assert.equal(p.at(1, 0), '#'); assert.equal(p.at(2, 1), 'x'); assert.equal(p.at(-1, 0), '.'); assert.equal(p.at(0, 9), '.');
  assert.throws(() => glyphPicture(['#?']), /is not one of/);
  for (const c of ['.', '#', 'o', 'x', '*', '+', '-', "'", 'i']) assert.ok(c in GLYPH_TONES, `${c} is a tone`);
});

test('glyphFlip mirrors a picture', () => {
  const p = glyphPicture(['#..', 'oo.']);
  assert.deepEqual([...glyphFlip(p, { y: true }).rows], ['oo.', '#..']);
  assert.deepEqual([...glyphFlip(p, { x: true }).rows], ['..#', '.oo']);
  assert.deepEqual([...glyphFlip(p).rows], [...p.rows]);
});

test('glyphOver: the upper picture is whole, and nothing of the lower one touches it', () => {
  const under = glyphPicture(Array(8).fill('++++++++')), over = glyphPicture(['.#.', '###']);
  const both = glyphOver(under, over, 6, 5);
  assert.equal(both.w, 9); assert.equal(both.h, 8);
  for (let y = 0; y < over.h; y++) for (let x = 0; x < over.w; x++) if (over.at(x, y) !== '.') assert.equal(both.at(6 + x, 5 + y), over.at(x, y));
  for (let y = 0; y < both.h; y++) for (let x = 0; x < both.w; x++) {
    if (both.at(x, y) !== '+') continue;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) assert.notEqual(both.at(x + i, y + j), '#', `(${x}, ${y}) of the lower picture touches the upper one`);
  }
  assert.equal(both.at(0, 0), '+', 'far from the upper picture the lower one is untouched');
  const grown = glyphOver(over, over, -2, -1);
  assert.equal(grown.w, 5); assert.equal(grown.h, 3);
});

test('drawGlyph paints each tone, without an outline, and Shine only decides the glints', () => {
  const p = glyphPicture(["#ox*", "+-'i"]), M = ramp('#7a4fc4'), S = ramp('#c2c9d6');
  const g = drawGlyph(new Surface(8, 8), p, 2, 3, { main: '#7a4fc4', second: '#c2c9d6' });
  assert.deepEqual([0, 1, 2, 3].map((i) => g.get(2 + i, 3)), [M.base, M.light, M.dark, '#ffffff'].map(col));
  assert.deepEqual([0, 1, 2, 3].map((i) => g.get(2 + i, 4)), [S.base, S.dark, '#ffffff', INK].map(col));
  assert.equal(lit(g), 8, 'nothing but the picture is drawn');
  const dull = drawGlyph(new Surface(8, 8), p, 2, 3, { main: '#7a4fc4', second: '#c2c9d6', shine: false });
  assert.equal(dull.get(5, 3), col(M.light)); assert.equal(dull.get(4, 4), col(S.light));
  assert.equal(diff(g, dull), 2, 'only the two glints change');
  assert.throws(() => drawGlyph(new Surface(8, 8), p, 0, 0, {}), /main colour/);
});

test('glyphPlate: an outlined plate whose inside box is all face', () => {
  assert.deepEqual([...PLATE_SHAPES], ['round', 'square']);
  for (const shape of PLATE_SHAPES) for (const shine of [true, false]) {
    const g = new Surface(16, 16), F = ramp('#4a609c'), inner = glyphPlate(g, 1, 1, 14, { shape, face: '#4a609c', shine });
    assert.deepEqual(inner, { x: 3, y: 3, w: 10, h: 10 });
    assert.deepEqual(g.bounds(), { x0: 1, y0: 1, x1: 14, y1: 14 });
    for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) assert.notEqual(g.get(x, y), col(INK), `${shape}: (${x}, ${y}) is face`);
    for (let i = 1; i <= 14; i++) for (const [x, y] of [[i, 1], [i, 14], [1, i], [14, i]]) if (g.get(x, y)) assert.equal(g.get(x, y), col(INK), `${shape}: the rim is the outline`);
    assert.equal(colours(g).has(col(F.light)), shine, `${shape}: a lit edge only with shine`);
    assert.ok(!colours(g).has(col(F.dark)), 'a plate face never uses its dark tone');
  }
  const round = glyphPlate(new Surface(16, 16), 1, 1, 14, { face: '#4a609c' }), square = glyphPlate(new Surface(16, 16), 1, 1, 14, { shape: 'square', face: '#4a609c' });
  assert.equal(new Surface(16, 16).get(1, 1), 0);
  const a = new Surface(16, 16), b = new Surface(16, 16);
  glyphPlate(a, 1, 1, 14, { shape: 'round', face: '#4a609c' }); glyphPlate(b, 1, 1, 14, { shape: 'square', face: '#4a609c' });
  assert.equal(a.get(2, 2), 0, 'a round plate has its corners cut'); assert.notEqual(b.get(2, 2), 0);
  assert.deepEqual(round, square);
  assert.throws(() => glyphPlate(new Surface(16, 16), 1, 1, 14, { shape: 'star', face: '#4a609c' }), /shape/);
  assert.throws(() => glyphPlate(new Surface(16, 16), 1, 1, 14, {}), /face/);
});

// ---- status marks -----------------------------------------------------------------------------

const mark = (name, bold, shine = true) => {
  const p = statusMark(name, { bold }), g = new Surface(16, 16);
  drawGlyph(g, p, 1 + ((14 - p.w) >> 1), 1 + ((14 - p.h) >> 1), { main: '#7a4fc4', second: '#c2c9d6', shine });
  return g.outline(INK);
};

test('statusMark: ten marks, each in two weights, none larger than 10x10', () => {
  assert.equal(STATUS_MARKS.length, 10);
  for (const name of STATUS_MARKS) {
    const regular = statusMark(name), bold = statusMark(name, { bold: true });
    for (const p of [regular, bold]) assert.ok(p.w <= 10 && p.h <= 10 && p.w >= 5 && p.h >= 5, `${name} is ${p.w}x${p.h}`);
    const count = (p) => p.rows.join('').replace(/\./g, '').length;
    assert.ok(count(bold) > count(regular) + 4, `${name}: bold has ${count(bold)} pixels, regular ${count(regular)}`);
    assert.ok(/[*']/.test(regular.rows.join('')) && /[*']/.test(bold.rows.join('')), `${name} has a glint for Shine to light`);
  }
  assert.throws(() => statusMark('hiccups'), /no mark/);
});

test('statusMark: with its outline every mark fits the inside of a 14 px plate, round or square', () => {
  for (const name of STATUS_MARKS) for (const bold of [false, true]) {
    const g = mark(name, bold), b = g.bounds();
    assert.ok(b.x0 >= 2 && b.y0 >= 2 && b.x1 <= 13 && b.y1 <= 13, `${name} (bold ${bold}) spans ${JSON.stringify(b)}`);
    for (const shape of PLATE_SHAPES) {
      const plate = new Surface(16, 16);
      glyphPlate(plate, 1, 1, 14, { shape, face: '#4a609c' });
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g.get(x, y)) assert.ok(plate.get(x, y), `${name} (bold ${bold}) pokes out of the ${shape} plate at (${x}, ${y})`);
    }
  }
});

test('statusMark: every mark has its own outline, and up differs from down', () => {
  for (const bold of [false, true]) for (let i = 0; i < STATUS_MARKS.length; i++) for (let j = i + 1; j < STATUS_MARKS.length; j++) {
    const d = shapeDiff(mark(STATUS_MARKS[i], bold), mark(STATUS_MARKS[j], bold));
    assert.ok(d >= 8, `${STATUS_MARKS[i]} and ${STATUS_MARKS[j]} (bold ${bold}) differ by only ${d} pixels of outline`);
  }
});

test('statusMark: the status is in the main colour, the blade, shield and wing in the second', () => {
  const has = (name, chars) => new RegExp(`[${chars}]`).test(statusMark(name).rows.join(''));
  for (const name of ['poison', 'sleep', 'stun', 'burn', 'freeze']) { assert.ok(has(name, '#ox*')); assert.ok(!has(name, "+\\-'"), `${name} is one colour`); }
  for (const name of ['attack-up', 'attack-down', 'defence-up', 'defence-down', 'haste']) { assert.ok(has(name, '#ox*'), `${name} has the main colour`); assert.ok(has(name, "+\\-'"), `${name} has the second colour`); }
  assert.deepEqual([...statusMark('attack-down').rows].map((r) => r.slice(0, 4)), [...statusMark('attack-up').rows].map((r) => r.slice(0, 4)), 'the blade is the same blade');
  assert.ok(diff(mark('poison', false), mark('poison', false, false)) >= 1, 'shine lights the glint');
});
