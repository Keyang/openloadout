// Framework additions made with batch R16 (RPG icons: consumables and key items), all in engine/icons.js:
//   ICON_SIZE, ICON_PIVOT, ICON_LEAN, ICON_DIAGONAL   the frame, pivot and the two leans of an icon set
//   iconClips     one 1-frame clip per icon
//   iconPen       the placement and style of one icon (lean, scale, soft shading, shine)
//   iconFit       draws an icon scaled to the size the Size slider asks for and centred in its frame
//   iconPaint     shape tests painted through the pen as one body with the icon shading
//   iconLine, iconGlint, iconFlame, iconTidy          creases, glints, a flame with no ink line, pimples off round shapes
//   iconBottle, iconLoaf, iconSprig, iconCandle, iconBomb, iconTent        consumables
//   iconKey, iconScroll, iconLetter, iconGem, iconPouch, iconLantern       story items
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn, rectIn } from '../../engine/surface.js';
import { ramp, col, mix, INK } from '../../engine/color.js';
import { BOTTLE_SHAPES, GEM_CUTS } from '../../engine/shapes.js';
import {
  ICON_SIZE, ICON_PIVOT, ICON_LEAN, ICON_DIAGONAL, iconClips, iconPen, iconFit, iconPaint, iconLine, iconGlint, iconFlame, iconTidy,
  iconBottle, iconLoaf, iconSprig, iconCandle, iconBomb, iconTent, iconKey, iconScroll, iconLetter, iconGem, iconPouch, iconLantern,
} from '../../engine/icons.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const colours = (g) => { const s = new Set(g.data); s.delete(0); return s; };
const frame = () => new Surface(...ICON_SIZE);
const side = (g) => { const b = g.bounds(); return Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); };
const WHITE = col('#ffffff');

// every item shape, with the colours it needs
const SHAPES = {
  bottle: (g, pen) => iconBottle(g, pen, { glass: '#f0ead8', liquid: '#c9423a', cork: '#9a6a3e' }),
  loaf: (g, pen) => iconLoaf(g, pen, { crust: '#e6c96a' }),
  sprig: (g, pen) => iconSprig(g, pen, { leaf: '#4f9d57', stem: '#357a4c' }),
  candle: (g, pen) => iconCandle(g, pen, { wax: '#e6c96a', dish: '#c2c9d6' }),
  bomb: (g, pen) => iconBomb(g, pen, { body: '#5a5f7a', cap: '#c2c9d6', fuse: '#c9a06a' }),
  tent: (g, pen) => iconTent(g, pen, { cloth: '#e6c96a', pole: '#9a6a3e' }),
  key: (g, pen) => iconKey(g, pen, { metal: '#f2c230' }),
  scroll: (g, pen) => iconScroll(g, pen, { paper: '#f0ead8', band: '#4fd8ee' }),
  letter: (g, pen) => iconLetter(g, pen, { paper: '#f0ead8', seal: '#c9423a' }),
  gem: (g, pen) => iconGem(g, pen, { colour: '#4fd8ee' }),
  pouch: (g, pen) => iconPouch(g, pen, { cloth: '#9a6a3e', tie: '#e6c96a', coin: '#f2c230' }),
  lantern: (g, pen) => iconLantern(g, pen, { metal: '#f2c230', glow: '#f0ead8', flame: '#4fd8ee' }),
};
const drawn = (name, o = {}) => { const g = frame(); iconFit(g, o, (s, pen) => { SHAPES[name](s, pen); iconTidy(s).outline(INK); }); return g; };

// ---- layout -------------------------------------------------------------------

test('the frame, the pivot and the two leans', () => {
  assert.deepEqual([...ICON_SIZE], [32, 32]);
  assert.deepEqual([...ICON_PIVOT], [16, 16]);
  assert.ok(Math.abs(Math.tan(ICON_LEAN) - 0.5) < 1e-12, 'ICON_LEAN steps two along and one up');
  assert.ok(Math.abs(Math.tan(ICON_DIAGONAL) - 1) < 1e-12, 'ICON_DIAGONAL steps one and one');
});

test('iconClips: one looping 1-frame clip per icon, in order, with labels where given', () => {
  const clips = iconClips(['potion', ['mana-flask', 'Mana flask'], 'key']);
  assert.deepEqual(Object.keys(clips), ['potion', 'mana-flask', 'key']);
  assert.deepEqual(clips.potion, { frames: 1, fps: 1, loop: true });
  assert.deepEqual(clips['mana-flask'], { frames: 1, fps: 1, loop: true, label: 'Mana flask' });
});

// ---- the pen ---------------------------------------------------------------------

test('iconPen: upright puts (0, 0) at the frame centre and keeps up up', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] });
  assert.deepEqual(pen.pt(0, 0), [16, 16]);
  assert.deepEqual(pen.pt(3, -5), [19, 11]);
  assert.equal(pen.angle, 0);
  assert.equal(pen.at(rectIn(-2, -2, 4, 4))(17, 17), true);
  assert.equal(pen.at(rectIn(-2, -2, 4, 4))(19, 16), false);
});

test('iconPen: leaning turns the top to the right, a negative angle lifts the right end', () => {
  const lean = iconPen({ span: [1, 1] });                             // ICON_LEAN by default
  const [tx, ty] = lean.pt(0, -10);
  assert.ok(tx > 16 && ty < 16, `the top goes up and right (${tx}, ${ty})`);
  assert.ok(Math.abs(Math.hypot(tx - 16, ty - 16) - 10) < 1e-9, 'a turn keeps lengths');
  const flat = iconPen({ angle: -ICON_DIAGONAL, span: [1, 1] });
  const [rx, ry] = flat.pt(10, 0);
  assert.ok(rx > 16 && ry < 16, 'the right end of a lying thing rises');
  assert.ok(Math.abs((rx - 16) + (ry - 16)) < 1e-9, 'on the 45 degree diagonal');
});

test('iconPen: the Size slider scales 0.87 to 1.13, times the icon\'s own scale; at() and pt() agree', () => {
  assert.ok(Math.abs(iconPen({ size: 0 }).k - 0.87) < 1e-12);
  assert.ok(Math.abs(iconPen({ size: 1 }).k - 1.13) < 1e-12);
  assert.ok(Math.abs(iconPen({ size: 0.5, scale: 2 }).k - 2) < 1e-12);
  const pen = iconPen({ size: 0.8, angle: 0.7, scale: 1.2 });
  const inside = pen.at(ellipseIn(4, -3, 0.6, 0.6));
  const [px, py] = pen.pt(4, -3);
  assert.equal(inside(px, py), true, 'the placed test holds where pt() puts its centre');
  assert.equal(inside(...pen.pt(-4, 3)), false);
});

// ---- painting ---------------------------------------------------------------------

test('iconPaint: dark band away from the light; shade adds one softer tone; shine adds the highlight', () => {
  const R = ramp('#c9423a'), ball = ellipseIn(0, 0, 9, 9);
  const paint = (o) => iconPaint(frame(), iconPen({ tilt: false, span: [1, 1], ...o }), ball, R);
  const plain = paint({ shade: false, shine: false }), soft = paint({ shade: true, shine: false }), shiny = paint({ shade: false, shine: true });
  assert.deepEqual([...colours(plain)].sort(), [col(R.base), col(R.dark)].sort());
  assert.equal(plain.get(10, 21), col(R.dark), 'the bottom left edge is dark');
  assert.equal(plain.get(21, 10), col(R.base), 'the top right edge is not');
  assert.ok(colours(soft).has(col(mix(R.base, R.dark, 0.5))), 'shade: a tone half way to dark');
  assert.equal(colours(soft).size, 3);
  assert.ok(diff(plain, soft) > 12, `shade changes ${diff(plain, soft)} pixels`);
  assert.equal(shiny.get(21, 10), col(R.light), 'shine: the top right edge is light');
  assert.ok(diff(plain, shiny) > 12);
  assert.equal(lit(plain), lit(soft), 'the body is the same body');
});

test('iconPaint: flat, minus, clip and rim', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const flat = iconPaint(frame(), pen, rectIn(-6, -6, 12, 12), '#7fe0a0', { flat: true });
  assert.equal(colours(flat).size, 1);
  assert.equal(lit(flat), 144);
  const holed = iconPaint(frame(), pen, rectIn(-6, -6, 12, 12), '#7fe0a0', { flat: true, minus: rectIn(-2, -2, 4, 4) });
  assert.equal(lit(holed), 144 - 16);
  const half = iconPaint(frame(), pen, rectIn(-6, -6, 12, 12), '#7fe0a0', { flat: true, clip: (x, y) => y >= 0 });
  assert.equal(lit(half), 72);
  assert.equal(half.get(16, 15), 0);
  const rimmed = iconPaint(frame(), pen, rectIn(-3, -3, 6, 6), '#7fe0a0', { flat: true, rim: INK });
  assert.equal(rimmed.get(12, 16), col(INK), 'a 1 px line round the body');
  assert.equal(lit(rimmed), 36 + 24);
});

test('iconLine: one pixel wide at every scale; over: true never leaves the body', () => {
  for (const scale of [0.8, 1, 1.4]) {
    const g = iconLine(frame(), iconPen({ tilt: false, scale, span: [1, 1] }), [[-8, 0], [8, 0]], '#ffffff');
    const b = g.bounds();
    assert.equal(b.y1 - b.y0, 0, `scale ${scale}: one row`);
  }
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const g = iconPaint(frame(), pen, rectIn(-4, -4, 8, 8), '#f0ead8', { flat: true });
  iconLine(g, pen, [[-10, 0], [10, 0]], '#231b33', { over: true });
  assert.equal(lit(g), 64, 'nothing added outside the body');
  assert.equal(g.get(14, 16), col('#231b33'));
  iconLine(g, pen, [[-10, 2], [10, 2]], '#231b33');
  assert.ok(lit(g) > 64, 'without over the line goes on');
});

test('iconGlint: white only on painted pixels, and nothing when shine is off', () => {
  const body = (pen) => iconPaint(frame(), pen, ellipseIn(0, 0, 8, 8), '#5a5f7a', { flat: true });
  const on = iconPen({ tilt: false, span: [1, 1] }), off = iconPen({ tilt: false, span: [1, 1], shine: false });
  const g = iconGlint(body(on), on, 2, -3);
  assert.equal([...g.data].filter((v) => v === WHITE).length, 3, 'a stroke of two and a separate pixel');
  assert.equal(lit(g), lit(body(on)));
  assert.equal(diff(iconGlint(body(off), off, 2, -3), body(off)), 0);
  assert.equal(lit(iconGlint(frame(), on, 2, -3)), 0, 'no glint in thin air');
});

test('iconFlame: rises straight up whatever the lean, with a dark rim of its own colour and no ink', () => {
  for (const tilt of [false, true]) {
    const pen = iconPen({ tilt, span: [1, 1] }), g = iconFlame(frame(), pen, 0, 0, { colours: ['#f4e06a', '#e8662c'] });
    const b = g.bounds(), [fx, fy] = pen.pt(0, 0);
    assert.ok(b.y1 <= Math.floor(fy) + 1 && b.y0 < fy - 4, 'it stands on its foot and goes up');
    assert.ok(Math.abs((b.x0 + b.x1 + 1) / 2 - (Math.floor(fx) + 0.5)) <= 0.5, 'centred over the foot: it does not lean');
    assert.ok(!colours(g).has(col(INK)));
    assert.equal(colours(g).size, 3, 'rim, flame, core');
  }
});

test('iconTidy: takes a pimple of one or two pixels off a flat run, leaves points and stems', () => {
  const g = frame().rect(8, 10, 12, 8, '#c9423a');
  g.dot(13, 9, '#c9423a');                                             // one pixel on a run of twelve
  g.dot(10, 18, '#c9423a'); g.dot(11, 18, '#c9423a');                  // two pixels under it
  g.dot(20, 13, '#c9423a');                                            // one on the right side
  iconTidy(g);
  assert.equal(lit(g), 96, 'the three pimples are gone');
  const point = frame().poly([[16, 4], [22, 16], [10, 16]], '#4fd8ee');
  const before = lit(point);
  assert.equal(lit(iconTidy(point)), before, 'the tip of a point stays');
  const stem = frame().rect(8, 16, 12, 6, '#4f9d57').rect(13, 8, 1, 8, '#4f9d57');
  assert.equal(lit(iconTidy(stem)), 72 + 8, 'a stem that goes on stays');
  const knob = frame().rect(8, 16, 12, 6, '#4f9d57').rect(12, 14, 4, 2, '#4f9d57');
  assert.equal(lit(iconTidy(knob)), 72 + 8, 'a knob four wide stays');
});

// ---- fitting ---------------------------------------------------------------------

test('iconFit: the longer side follows the Size slider, 20 to 26 px, tilted or not, and the icon is centred', () => {
  for (const name of Object.keys(SHAPES)) for (const tilt of [true, false]) for (const [size, want] of [[0, 20], [0.5, 23], [1, 26]]) {
    const g = drawn(name, { size, tilt }), b = g.bounds();
    assert.ok(Math.abs(side(g) - want) <= 1, `${name} tilt ${tilt} size ${size}: longer side ${side(g)}, wanted ${want}`);
    assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${name}: inside the 1 px border`);
    const mx = b.x0 + (31 - b.x1), my = b.y0 + (31 - b.y1);
    assert.ok(Math.abs(b.x0 - (31 - b.x1)) <= 1 && Math.abs(b.y0 - (31 - b.y1)) <= 1, `${name}: centred (margins ${b.x0}/${31 - b.x1}, ${b.y0}/${31 - b.y1}; ${mx}, ${my})`);
  }
});

test('iconFit: fill makes one icon smaller than its set; it reports what it did; an empty draw is safe', () => {
  const small = frame(), out = iconFit(small, { fill: 0.85 }, (s, pen) => { SHAPES.bottle(s, pen); s.outline(INK); });
  assert.ok(Math.abs(side(small) - 20) <= 1, `0.85 of 23 is about 20 (got ${side(small)})`);
  assert.equal(out.side, side(small));
  assert.ok(out.scale > 0.5 && out.scale < 1.5 && typeof out.pen.at === 'function');
  const none = frame();
  assert.equal(iconFit(none, {}, () => {}).side, 0);
  assert.equal(lit(none), 0);
});

test('iconFit is repeatable', () => {
  for (const name of Object.keys(SHAPES)) assert.equal(diff(drawn(name), drawn(name)), 0, name);
});

// ---- the item shapes ---------------------------------------------------------------

test('every item shape: draws a real body, changes with tilt, shade and shine, stays within ten colours', () => {
  for (const name of Object.keys(SHAPES)) {
    const base = drawn(name);
    assert.ok(lit(base) > 120, `${name}: ${lit(base)} pixels`);
    assert.ok(colours(base).has(col(INK)), `${name}: outlined`);
    assert.ok(colours(base).size >= 3 && colours(base).size <= 10, `${name}: ${colours(base).size} colours`);
    assert.ok(diff(base, drawn(name, { tilt: false })) > 12, `${name}: tilt shows`);
    assert.ok(diff(base, drawn(name, { shine: false })) > 4, `${name}: shine shows (${diff(base, drawn(name, { shine: false }))})`);
    assert.ok(colours(drawn(name, { shade: false })).size <= colours(base).size, `${name}: shade never removes a colour`);
  }
  const shaded = Object.keys(SHAPES).filter((n) => diff(drawn(n), drawn(n, { shade: false })) > 4);
  assert.ok(shaded.length >= 10, `soft shading shows on ${shaded.length} of ${Object.keys(SHAPES).length} shapes`);
});

test('no two item shapes share a silhouette', () => {
  const names = Object.keys(SHAPES), mask = (g) => g.data.map((v) => (v ? 1 : 0));
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = mask(drawn(names[i])), b = mask(drawn(names[j]));
    const d = a.reduce((n, v, k) => n + (v !== b[k] ? 1 : 0), 0);
    assert.ok(d > 60, `${names[i]} and ${names[j]} differ by ${d} silhouette pixels`);
  }
});

test('iconBottle: every shape of shapes.js, fuller with level, wider with wide, a label band, and what it returns', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const count = (g, hex) => [...g.data].filter((v) => v === col(hex)).length;
  for (const shape of BOTTLE_SHAPES) {
    const low = frame(), high = frame();
    iconBottle(low, pen, { shape, glass: '#f0ead8', liquid: '#3f6fd1', cork: '#9a6a3e', level: 0.3 });
    const made = iconBottle(high, pen, { shape, glass: '#f0ead8', liquid: '#3f6fd1', cork: '#9a6a3e', level: 0.9 });
    assert.ok(count(high, '#3f6fd1') > count(low, '#3f6fd1'), `${shape}: more liquid at a higher level`);
    assert.ok(count(low, '#f0ead8') > count(high, '#f0ead8'), `${shape}: more empty glass at a lower level`);
    assert.ok(count(high, '#9a6a3e') > 0, `${shape}: a cork`);
    assert.ok(made.top < made.surface && made.surface < made.bottom && made.half > 1 && made.label === null);
  }
  const thin = frame(), wide = frame();
  iconBottle(thin, pen, { shape: 'tall', h: 18, glass: '#f0ead8', liquid: '#7fe0a0', cork: '#9a6a3e' });
  const made = iconBottle(wide, pen, { shape: 'tall', h: 18, wide: 1.4, glass: '#f0ead8', liquid: '#7fe0a0', cork: '#9a6a3e', label: '#e6c96a' });
  assert.ok(wide.bounds().x1 - wide.bounds().x0 > thin.bounds().x1 - thin.bounds().x0, 'wide stretches it across');
  assert.equal(wide.bounds().y1 - wide.bounds().y0, thin.bounds().y1 - thin.bounds().y0, 'and not in height');
  assert.ok(count(wide, '#e6c96a') > 12, 'the label band is drawn');
  assert.ok(made.label[1] > made.surface && made.label[3] < made.bottom, 'the band sits in the liquid');
  assert.throws(() => iconBottle(frame(), pen, { shape: 'jug', glass: '#f0ead8', liquid: '#3f6fd1', cork: '#9a6a3e' }), /not one of/);
  assert.throws(() => iconBottle(frame(), pen, { shape: 'round' }), /needs glass/);
});

test('iconLoaf, iconSprig, iconKey, iconPouch, iconScroll: their counts and options', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const px = (fn) => { const g = frame(); fn(g); return g; };
  assert.ok(diff(px((g) => iconLoaf(g, pen, { crust: '#e6c96a', cuts: 0 })), px((g) => iconLoaf(g, pen, { crust: '#e6c96a', cuts: 3 }))) > 12, 'cuts show');
  assert.equal(lit(px((g) => iconLoaf(g, pen, { crust: '#e6c96a', cuts: 0 }))), lit(px((g) => iconLoaf(g, pen, { crust: '#e6c96a', cuts: 4 }))), 'cuts stay on the loaf');
  assert.ok(lit(px((g) => iconSprig(g, pen, { leaf: '#4f9d57', pairs: 3 }))) > lit(px((g) => iconSprig(g, pen, { leaf: '#4f9d57', pairs: 1 }))), 'more pairs, more leaf');
  assert.ok(colours(px((g) => iconSprig(g, pen, { leaf: '#4f9d57', bud: '#c9423a' }))).has(col('#c9423a')), 'a bud at the tip');
  const keys = ['ring', 'heart', 'diamond'].map((bow) => px((g) => iconKey(g, pen, { metal: '#f2c230', bow })));
  assert.ok(diff(keys[0], keys[1]) > 12 && diff(keys[0], keys[2]) > 12 && diff(keys[1], keys[2]) > 12, 'three bows');
  for (const k of keys) assert.equal(k.get(16, 23), 0, 'you can see through the bow');
  assert.ok(lit(px((g) => iconKey(g, pen, { metal: '#f2c230', teeth: 3 }))) > lit(px((g) => iconKey(g, pen, { metal: '#f2c230', teeth: 1 }))), 'more teeth');
  assert.throws(() => iconKey(frame(), pen, { metal: '#f2c230', bow: 'star' }), /not one of/);
  const gold = col('#f2c230');
  const coinsIn = (n) => [...px((g) => iconPouch(g, pen, { cloth: '#9a6a3e', tie: '#e6c96a', coin: '#f2c230', coins: n })).data].filter((v) => v === gold).length;
  assert.equal(coinsIn(0), 0);
  assert.ok(coinsIn(2) > coinsIn(1) && coinsIn(1) > 10, 'coins at its foot');
  assert.ok(lit(px((g) => iconScroll(g, pen, { paper: '#f0ead8', band: '#4fd8ee' }))) > lit(px((g) => iconScroll(g, pen, { paper: '#f0ead8', band: '#4fd8ee', tails: false }))), 'the band has tails');
  for (const fn of [iconLoaf, iconSprig, iconCandle, iconBomb, iconTent, iconKey, iconScroll, iconLetter, iconGem, iconPouch, iconLantern]) assert.throws(() => fn(frame(), pen, {}), /needs/, `${fn.name} says which colours it needs`);
});

test('iconCandle and iconBomb say where their light goes, and it is above the body', () => {
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const c = frame(), { wick } = iconCandle(c, pen, { wax: '#e6c96a', dish: '#c2c9d6' });
  const [wx, wy] = pen.pt(...wick);
  assert.equal(c.get(Math.floor(wx), Math.floor(wy)), 0, 'the wick point is just above the wax');
  assert.ok(c.get(Math.floor(wx), Math.floor(wy) + 2) !== 0, 'and the wax is under it');
  const short = frame(), tall = frame();
  assert.ok(iconCandle(short, pen, { wax: '#e6c96a', dish: '#c2c9d6', tall: 5 }).wick[1] > iconCandle(tall, pen, { wax: '#e6c96a', dish: '#c2c9d6', tall: 12 }).wick[1], 'a taller stub lifts the wick');
  const b = frame(), { fuse } = iconBomb(b, pen, { body: '#5a5f7a', cap: '#c2c9d6', fuse: '#c9a06a' });
  const [fx, fy] = pen.pt(...fuse);
  assert.equal(b.get(Math.floor(fx), Math.floor(fy)), col('#c9a06a'), 'the fuse point is the end of the fuse');
  assert.ok(fy < 8 && fx > 16, 'up and to the right of the ball');
});

test('iconGem: every cut of shapes.js; shine brightens the lit facets, shade softens the dark ones; it can be moved and turned', () => {
  for (const cut of GEM_CUTS) {
    const make = (o) => iconGem(frame(), iconPen({ tilt: false, span: [1, 1], ...o }), { colour: '#4fd8ee', cut, rx: 8, ry: 10 });
    const full = make({}), matte = make({ shine: false }), hard = make({ shade: false });
    assert.ok(lit(full) > 100, `${cut}: a body`);
    assert.equal(lit(full), lit(matte), `${cut}: the same stone`);
    assert.ok(diff(full, matte) > 4, `${cut}: shine shows`);
    assert.ok(diff(full, hard) > 4, `${cut}: shade shows`);
    assert.ok(colours(full).size >= 4 && colours(full).size <= 7, `${cut}: ${colours(full).size} tones`);
  }
  const pen = iconPen({ tilt: false, span: [1, 1] });
  const moved = iconGem(frame(), pen, { colour: '#4fd8ee', x: -6, y: 4, rx: 3, ry: 6, glint: false });
  const b = moved.bounds();
  assert.ok(b.x1 < 16 && b.y0 >= 14, 'x, y, rx, ry place it');
  const upright = iconGem(frame(), pen, { colour: '#4fd8ee', rx: 4, ry: 12 }), turned = iconGem(frame(), pen, { colour: '#4fd8ee', rx: 4, ry: 12, turn: Math.PI / 2 });
  assert.ok(turned.bounds().x1 - turned.bounds().x0 > upright.bounds().x1 - upright.bounds().x0, 'turn lays it down');
  assert.throws(() => iconGem(frame(), pen, { colour: '#4fd8ee', cut: 'pear' }), /not one of/);
});
