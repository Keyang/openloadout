// Framework additions made with batch H3 (bundles/specs/core-sprites-2.md, "New helpers", H3): 34 icon
// shapes for the food, material, tool, settings, currency and map-marker icon sets, in engine/icons-more.js.
//   iconFood (an adapter for drawFruit / drawMeal of food.js), iconFish, iconEgg, iconRoot, iconMushroom, iconBowl,
//   iconLog, iconPlank, iconOre, iconIngot, iconCloth, iconCoil, iconHide, iconTool, iconCan, iconRod,
//   iconCog, iconSpeaker, iconNote, iconScreen, iconPad, iconGlobe, iconTray, iconSign, iconHome,
//   iconCoins, iconBill, iconToken, iconTicket, iconBolt, iconPin, iconFlag, iconAwning, iconChest
//
// The spec's tests: (1) through iconFit at Size 0, 0.5 and 1 the longer side is 20, 23 and 26 px (plus or minus 1),
// tilted and upright, and nothing touches the frame's outer row or column; (2) at least two body colours besides ink;
// (3) within each icon set of K17 and K18 every pair of silhouettes differs by 15% or more of the larger one;
// (4) every option changes 12 or more pixels; (5) same arguments, same pixels. (6), the pixel fingerprint of every
// existing sprite, is the skill's before / after comparison: this module is new, and engine/icons.js is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { INK, col } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { starIn, skullIn } from '../../engine/shapes.js';
import { chevronIn } from '../../engine/gadgets.js';
import * as icons from '../../engine/icons.js';
import { ICON_SIZE, ICON_LEAN, ICON_DIAGONAL, iconFit, iconPaint, iconGem, iconHeart, iconTidy } from '../../engine/icons.js';
import * as more from '../../engine/icons-more.js';
import {
  ROOT_KINDS, TOOL_KINDS, SIGN_KINDS,
  iconFood, iconFish, iconEgg, iconRoot, iconMushroom, iconBowl,
  iconLog, iconPlank, iconOre, iconIngot, iconCloth, iconCoil, iconHide, iconTool, iconCan, iconRod,
  iconCog, iconSpeaker, iconNote, iconScreen, iconPad, iconGlobe, iconTray, iconSign, iconHome,
  iconCoins, iconBill, iconToken, iconTicket, iconBolt, iconPin, iconFlag, iconAwning, iconChest,
} from '../../engine/icons-more.js';

const T = PALETTE.thornwood, H = PALETTE.hearthvale;
const frame = () => new Surface(...ICON_SIZE);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const ink = col(INK);

// Draw one icon the way a sprite does: fitted, outlined once inside iconFit.
function fit(draw, { size = 0.5, tilt = true, angle = ICON_LEAN, shade = true, shine = true } = {}) {
  const g = frame();
  iconFit(g, { size, tilt, angle, shade, shine }, (s, pen) => { draw(s, pen); iconTidy(s).outline(INK); });
  return g;
}

// Every new shape with the options a sprite gives it, and for test (4) another value for every option.
const CASES = {
  iconFood: { fn: iconFood, o: { kind: 'apple', colour: T.crimson, stalk: T.soil, leaf: T.leaf }, vary: { kind: 'cheese', colour: T.moss, leaf: T.grass } },
  // drawFruit's stalk is 7 to 9 px below Size 1: its colour is measured at Size 1, where it is 12
  'iconFood (stalk, Size 1)': { fn: iconFood, o: { kind: 'apple', colour: T.crimson, stalk: T.soil, leaf: T.leaf }, vary: { stalk: T.wood }, size: 1 },
  'iconFood (drumstick)': { fn: iconFood, o: { kind: 'drumstick', colour: T.wood, bone: T.cream }, vary: { bone: T.steel, colour: T.ember } },
  iconFish: { fn: iconFish, o: { body: T.water, belly: T.cream, fin: T.hero }, vary: { body: T.slate, belly: T.gold, fin: T.crimson }, angle: -ICON_LEAN },
  iconEgg: { fn: iconEgg, o: { shell: T.cream, speckle: T.wood }, vary: { shell: T.sky, speckle: null } },
  iconRoot: { fn: iconRoot, o: { kind: 'carrot', root: T.ember, leaf: T.leaf }, vary: { kind: 'turnip', root: T.crimson, leaf: T.moss } },
  iconMushroom: { fn: iconMushroom, o: { cap: T.soil, stem: T.cream }, vary: { cap: T.wood, stem: T.steel } },
  iconBowl: { fn: iconBowl, o: { bowl: T.wood, soup: T.ember, herb: T.leaf }, vary: { bowl: T.steel, soup: T.crimson, herb: T.moss }, angle: 0 },
  iconLog: { fn: iconLog, o: { bark: T.soil, wood: T.wood }, vary: { bark: T.slate, wood: T.cream }, angle: -ICON_LEAN },
  iconPlank: { fn: iconPlank, o: { wood: T.wood, count: 3 }, vary: { wood: T.cream, count: 1 }, angle: -ICON_LEAN },
  'iconPlank (2)': { fn: iconPlank, o: { wood: T.wood, count: 2 }, vary: { count: 3 }, angle: -ICON_LEAN },
  iconOre: { fn: iconOre, o: { stone: T.stone, fleck: T.steel, flecks: 3 }, vary: { stone: T.slate, fleck: T.gold, flecks: 0 } },
  iconIngot: { fn: iconIngot, o: { metal: T.steel, stack: 2 }, vary: { metal: T.gold, stack: 1 }, angle: -ICON_LEAN },
  iconCloth: { fn: iconCloth, o: { cloth: T.hero, core: T.wood }, vary: { cloth: T.ember, core: T.cream } },
  iconCoil: { fn: iconCoil, o: { rope: H.wheat }, vary: { rope: T.wood } },
  iconHide: { fn: iconHide, o: { hide: T.wood }, vary: { hide: T.cream } },
  iconTool: { fn: iconTool, o: { kind: 'axe', metal: T.steel, wood: T.wood, grip: T.crimson }, vary: { kind: 'hoe', metal: T.gold, wood: T.soil, grip: null }, angle: ICON_DIAGONAL },
  iconCan: { fn: iconCan, o: { metal: T.steel, water: T.water, band: T.crimson }, vary: { metal: T.gold, water: null, band: null } },
  iconRod: { fn: iconRod, o: { wood: T.wood, line: T.cream, metal: T.steel }, vary: { wood: T.soil, line: T.crimson, metal: T.gold }, angle: ICON_DIAGONAL },
  iconCog: { fn: iconCog, o: { colour: T.cream, hub: T.crimson, teeth: 8 }, vary: { colour: T.gold, hub: T.moss, teeth: 6 }, angle: 0 },
  'iconCog (10)': { fn: iconCog, o: { colour: T.cream, hub: T.crimson, teeth: 10 }, vary: { teeth: 6 }, angle: 0 },
  iconSpeaker: { fn: iconSpeaker, o: { colour: T.cream, waves: 2 }, vary: { colour: T.gold, waves: 0, cross: T.crimson }, angle: 0 },
  iconNote: { fn: iconNote, o: { colour: T.cream }, vary: { colour: T.gold, double: true }, angle: 0 },
  iconScreen: { fn: iconScreen, o: { colour: T.cream, corners: true }, vary: { colour: T.gold, corners: false }, angle: 0 },
  iconPad: { fn: iconPad, o: { colour: T.cream, mark: T.crimson }, vary: { colour: T.gold, mark: T.moss }, angle: 0 },
  iconGlobe: { fn: iconGlobe, o: { colour: T.cream, lines: 2 }, vary: { colour: T.gold, lines: 1 }, angle: 0 },
  'iconGlobe (3)': { fn: iconGlobe, o: { colour: T.cream, lines: 3 }, vary: { lines: 2 }, angle: 0 },
  iconTray: { fn: iconTray, o: { colour: T.cream, arrow: 'in', mark: T.crimson }, vary: { colour: T.gold, arrow: 'out', mark: T.moss }, angle: 0 },
  iconSign: { fn: iconSign, o: { kind: 'pause', colour: T.cream }, vary: { colour: T.gold }, angle: 0 },
  iconHome: { fn: iconHome, o: { wall: T.cream, roof: T.crimson, door: T.wood }, vary: { wall: T.steel, roof: T.hero, door: T.slate }, angle: 0 },
  iconCoins: { fn: iconCoins, o: { metal: T.gold, count: 3 }, vary: { metal: T.steel, count: 1 } },
  'iconCoins (4)': { fn: iconCoins, o: { metal: T.gold, count: 4 }, vary: { count: 2 } },
  iconBill: { fn: iconBill, o: { paper: T.goblin, mark: T.moss }, vary: { paper: T.cream, mark: T.thorn }, angle: -ICON_LEAN },
  iconToken: { fn: iconToken, o: { metal: T.gold, face: T.magic }, vary: { metal: T.steel, face: T.crimson } },
  iconTicket: { fn: iconTicket, o: { paper: T.goblin, stub: T.cream }, vary: { paper: T.sky, stub: T.ember }, angle: -ICON_LEAN },
  iconBolt: { fn: iconBolt, o: { colour: T.magic }, vary: { colour: T.gold } },
  iconPin: { fn: iconPin, o: { colour: T.crimson, head: 'drop' }, vary: { colour: T.hero, head: 'round', plate: T.cream }, angle: 0 },
  iconFlag: { fn: iconFlag, o: { cloth: T.crimson, pole: T.wood }, vary: { cloth: T.hero, pole: T.slate }, angle: 0 },
  iconAwning: { fn: iconAwning, o: { cloth: T.crimson, stripe: T.cream, wall: T.wood }, vary: { cloth: T.hero, stripe: T.gold, wall: T.slate }, angle: 0 },
  iconChest: { fn: iconChest, o: { wood: T.wood, metal: T.steel }, vary: { wood: T.soil, metal: T.gold, open: true }, angle: 0 },
};
const drawOf = (c, o = c.o) => (s, pen) => c.fn(s, pen, o);

test('the module adds 34 shapes, all new names', () => {
  const fns = Object.keys(more).filter((k) => typeof more[k] === 'function');
  assert.equal(fns.length, 34);
  for (const k of Object.keys(more)) assert.ok(!(k in icons), `${k} is already in engine/icons.js`);
  for (const k of fns) assert.ok(Object.values(CASES).some((c) => c.fn === more[k]), `${k} is tested`);
  assert.deepEqual([...ROOT_KINDS], ['carrot', 'turnip']);
  assert.deepEqual([...TOOL_KINDS], ['axe', 'pickaxe', 'shovel', 'hoe', 'hammer', 'sickle']);
  assert.deepEqual([...SIGN_KINDS], ['play', 'pause', 'stop', 'close', 'tick', 'plus', 'minus', 'back', 'next']);
});

test('(1) fitted at Size 0, 0.5 and 1 the longer side is 20, 23 and 26 px, clear of the frame edge, tilted and upright', () => {
  const extra = [...TOOL_KINDS.map((kind) => ({ ...CASES.iconTool, o: { ...CASES.iconTool.o, kind } })), ...SIGN_KINDS.map((kind) => ({ ...CASES.iconSign, o: { kind, colour: T.cream } })),
    ...['berries', 'cheese', 'bread', 'pie'].map((kind) => ({ ...CASES.iconFood, o: { ...CASES.iconFood.o, kind } }))];
  for (const [name, c] of [...Object.entries(CASES), ...extra.map((c) => [`${c.fn.name} ${c.o.kind}`, c])]) {
    for (const tilt of [true, false]) for (const [size, want] of [[0, 20], [0.5, 23], [1, 26]]) {
      const b = fit(drawOf(c), { size, tilt, angle: c.angle ?? ICON_LEAN }).bounds();
      const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
      assert.ok(Math.abs(side - want) <= 1, `${name} size ${size} tilt ${tilt}: ${side} px, want ${want}`);
      assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= 30 && b.y1 <= 30, `${name} size ${size} tilt ${tilt}: touches the frame edge`);
    }
  }
});

test('(2) every shape draws at least two body colours besides ink', () => {
  for (const [name, c] of Object.entries(CASES)) {
    const s = new Set(fit(drawOf(c), { angle: c.angle ?? ICON_LEAN }).data);
    s.delete(0); s.delete(ink);
    assert.ok(s.size >= 2, `${name}: ${s.size} body colours`);
  }
});

// The icon sets of K17 and K18, each picture as its sprite draws it (lean, existing shapes for the gem, star, heart, skull and arrow).
const P = { tilt: true }, UP = { tilt: false };
const skull = (s, pen) => { const k = skullIn(0, 0, 18, 18); iconPaint(s, pen, k.bone, T.cream, { soft: 0, minus: k.gaps }); iconPaint(s, pen, k.sockets, T.crimson, { flat: true }); };
const SETS = {
  'icons-food': {
    apple: [(s, pen) => iconFood(s, pen, { kind: 'apple', colour: T.crimson, leaf: T.leaf }), P],
    drumstick: [(s, pen) => iconFood(s, pen, { kind: 'drumstick', colour: T.wood, bone: T.cream }), P],
    cheese: [(s, pen) => iconFood(s, pen, { kind: 'cheese', colour: T.gold }), P],
    fish: [(s, pen) => iconFish(s, pen, { body: T.water, belly: T.cream, fin: T.water }), { tilt: true, angle: -ICON_LEAN }],
    egg: [(s, pen) => iconEgg(s, pen, { shell: T.cream }), P],
    carrot: [(s, pen) => iconRoot(s, pen, { kind: 'carrot', root: T.ember, leaf: T.leaf }), P],
    mushroom: [(s, pen) => iconMushroom(s, pen, { cap: T.soil, stem: T.cream }), P],
    soup: [(s, pen) => iconBowl(s, pen, { bowl: T.wood, soup: T.ember, herb: T.leaf }), UP],
  },
  'icons-materials': {
    log: [(s, pen) => iconLog(s, pen, { bark: T.soil, wood: T.wood }), { tilt: true, angle: -ICON_LEAN }],
    plank: [(s, pen) => iconPlank(s, pen, { wood: T.wood, count: 3 }), { tilt: true, angle: -ICON_LEAN }],
    stone: [(s, pen) => iconOre(s, pen, { stone: T.stone, flecks: 0 }), P],
    ore: [(s, pen) => iconOre(s, pen, { stone: T.stone, fleck: T.steel, flecks: 3 }), P],
    ingot: [(s, pen) => iconIngot(s, pen, { metal: T.steel, stack: 2 }), { tilt: true, angle: -ICON_LEAN }],
    cloth: [(s, pen) => iconCloth(s, pen, { cloth: T.hero, core: T.wood }), P],
    rope: [(s, pen) => iconCoil(s, pen, { rope: H.wheat }), P],
    hide: [(s, pen) => iconHide(s, pen, { hide: T.hero }), P],
  },
  'icons-tools': {
    ...Object.fromEntries(TOOL_KINDS.map((kind) => [kind, [(s, pen) => iconTool(s, pen, { kind, metal: T.steel, wood: T.wood, grip: T.crimson }), { tilt: true, angle: ICON_DIAGONAL }]])),
    'watering-can': [(s, pen) => iconCan(s, pen, { metal: T.steel, water: T.water, band: T.crimson }), P],
    'fishing-rod': [(s, pen) => iconRod(s, pen, { wood: T.wood, line: T.cream, metal: T.steel }), { tilt: true, angle: ICON_DIAGONAL }],
  },
  'icons-system': {
    settings: [(s, pen) => iconCog(s, pen, { colour: T.cream, hub: T.crimson }), UP],
    sound: [(s, pen) => iconSpeaker(s, pen, { colour: T.cream, waves: 2 }), UP],
    mute: [(s, pen) => iconSpeaker(s, pen, { colour: T.cream, waves: 0, cross: T.crimson }), UP],
    music: [(s, pen) => iconNote(s, pen, { colour: T.cream }), UP],
    display: [(s, pen) => iconScreen(s, pen, { colour: T.cream, corners: true }), UP],
    controls: [(s, pen) => iconPad(s, pen, { colour: T.cream, mark: T.crimson }), UP],
    language: [(s, pen) => iconGlobe(s, pen, { colour: T.cream, lines: 2 }), UP],
    save: [(s, pen) => iconTray(s, pen, { colour: T.cream, arrow: 'in', mark: T.crimson }), UP],
    pause: [(s, pen) => iconSign(s, pen, { kind: 'pause', colour: T.cream }), UP],
    home: [(s, pen) => iconHome(s, pen, { wall: T.cream, roof: T.cream, door: T.crimson }), UP],
  },
  'icons-currency': {
    coins: [(s, pen) => iconCoins(s, pen, { metal: T.gold, count: 3 }), P],
    gem: [(s, pen) => iconGem(s, pen, { colour: T.magic, cut: 'diamond', rx: 10, ry: 11 }), P],
    banknote: [(s, pen) => iconBill(s, pen, { paper: T.goblin, mark: T.moss }), { tilt: true, angle: -ICON_LEAN }],
    token: [(s, pen) => iconToken(s, pen, { metal: T.gold, face: T.magic }), P],
    ticket: [(s, pen) => iconTicket(s, pen, { paper: T.goblin, stub: T.cream }), { tilt: true, angle: -ICON_LEAN }],
    star: [(s, pen) => iconPaint(s, pen, starIn(0, 0, 11.5, 5), T.gold, { soft: 0 }), UP],
    lives: [(s, pen) => iconHeart(s, pen, { colour: T.crimson }), P],
    energy: [(s, pen) => iconBolt(s, pen, { colour: T.magic }), P],
  },
  'icons-map': {
    pin: [(s, pen) => iconPin(s, pen, { colour: T.crimson }), UP],
    flag: [(s, pen) => iconFlag(s, pen, { cloth: T.crimson, pole: T.wood }), UP],
    dig: [(s, pen) => iconSign(s, pen, { kind: 'close', colour: T.crimson }), UP],
    town: [(s, pen) => iconHome(s, pen, { wall: T.cream, roof: T.wood, door: T.crimson }), UP],
    shop: [(s, pen) => iconAwning(s, pen, { cloth: T.crimson, stripe: T.cream, wall: T.wood }), UP],
    treasure: [(s, pen) => iconChest(s, pen, { wood: T.wood, metal: T.steel }), UP],
    danger: [skull, UP],
    here: [(s, pen) => iconPaint(s, pen, chevronIn(0, 0, 22, 14, 6, { up: false }), T.crimson, { soft: 0 }), UP],
  },
};

test('(3) within each icon set every pair of silhouettes differs by 15% or more of the larger one', () => {
  const bad = [];
  for (const [set, list] of Object.entries(SETS)) {
    const masks = Object.entries(list).map(([name, [draw, o]]) => [name, fit(draw, { angle: ICON_LEAN, ...o }).data.map((v) => (v ? 1 : 0))]);
    for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) {
      const [a, A] = masks[i], [b, B] = masks[j];
      const n = A.reduce((s, v, k) => s + (v !== B[k] ? 1 : 0), 0), big = Math.max(A.reduce((s, v) => s + v, 0), B.reduce((s, v) => s + v, 0));
      if (n < 0.15 * big) bad.push(`${set}: ${a} and ${b} differ by ${n} of ${big} px (${Math.round((100 * n) / big)}%)`);
    }
  }
  assert.deepEqual(bad, []);
});

test('(4) every option changes 12 or more pixels', () => {
  const bad = [];
  for (const [name, c] of Object.entries(CASES)) {
    const look = { angle: c.angle ?? ICON_LEAN, size: c.size ?? 0.5 }, base = fit(drawOf(c), look);
    for (const [k, v] of Object.entries(c.vary)) {
      const n = diff(base, fit(drawOf(c, { ...c.o, [k]: v }), look));
      if (n < 12) bad.push(`${name}: ${k} ${JSON.stringify(c.o[k] ?? null)} -> ${JSON.stringify(v)} changes ${n} px`);
    }
  }
  assert.deepEqual(bad, []);
  // the named pairs: every tool from every other, every sign from every other, speaker waves 0 and 2, ore flecks 0 and 3
  for (const set of [TOOL_KINDS.map((kind) => (s, pen) => iconTool(s, pen, { kind, metal: T.steel, wood: T.wood })), SIGN_KINDS.map((kind) => (s, pen) => iconSign(s, pen, { kind, colour: T.cream }))]) {
    const gs = set.map((d) => fit(d, { tilt: false }));
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) assert.ok(diff(gs[i], gs[j]) >= 12, `kinds ${i} and ${j} differ by ${diff(gs[i], gs[j])} px`);
  }
  assert.ok(diff(fit((s, pen) => iconSpeaker(s, pen, { colour: T.cream, waves: 0 }), UP), fit((s, pen) => iconSpeaker(s, pen, { colour: T.cream, waves: 2 }), UP)) >= 12);
  assert.ok(diff(fit((s, pen) => iconOre(s, pen, { stone: T.stone, fleck: T.gold, flecks: 0 })), fit((s, pen) => iconOre(s, pen, { stone: T.stone, fleck: T.gold, flecks: 3 }))) >= 12);
});

test('(5) same arguments, same pixels', () => {
  for (const [name, c] of Object.entries(CASES)) {
    const a = fit(drawOf(c), { angle: c.angle ?? ICON_LEAN }), b = fit(drawOf(c), { angle: c.angle ?? ICON_LEAN });
    assert.equal(diff(a, b), 0, name);
    assert.ok(lit(a) > 100, `${name} draws something`);
  }
});

test('shapes say what is wrong with their arguments', () => {
  const pen = icons.iconPen();
  assert.throws(() => iconFood(frame(), pen, { kind: 'donut', colour: T.gold }), /kind/);
  assert.throws(() => iconRoot(frame(), pen, { kind: 'potato', root: T.wood, leaf: T.leaf }), /kind/);
  assert.throws(() => iconTool(frame(), pen, { kind: 'saw', metal: T.steel, wood: T.wood }), /kind/);
  assert.throws(() => iconSign(frame(), pen, { kind: 'heart', colour: T.cream }), /kind/);
  assert.throws(() => iconTray(frame(), pen, { colour: T.cream, arrow: 'up' }), /arrow/);
  assert.throws(() => iconPin(frame(), pen, { colour: T.cream, head: 'square' }), /head/);
  for (const [name, c] of Object.entries(CASES)) assert.throws(() => c.fn(frame(), pen, {}), Error, `${name} with no colours`);
});

test('shapes return the points a sprite puts things on', () => {
  const pen = icons.iconPen();
  const bowl = iconBowl(frame(), pen, CASES.iconBowl.o);
  assert.ok(Array.isArray(bowl.steam) && bowl.steam[1] < 0, 'the steam rises from above the soup');
  for (const kind of TOOL_KINDS) { const t = iconTool(frame(), pen, { kind, metal: T.steel, wood: T.wood }); assert.ok(t.tip[1] < 0, `${kind}: its tip is at the top`); }
  const g = frame(), pin = iconPin(g, icons.iconPen({ tilt: false }), { colour: T.crimson, plate: T.cream });
  assert.ok(pin.plate.r >= 3 && pin.plate.y < 0, 'the plate sits in the head');
  const [px, py] = icons.iconPen({ tilt: false }).pt(pin.plate.x, pin.plate.y);
  assert.equal(g.get(Math.floor(px), Math.floor(py)), col(T.cream), 'and is painted in its colour');
  const food = iconFood(frame(), pen, CASES.iconFood.o);
  assert.ok(food.body && Array.isArray(food.glint), 'iconFood passes on what drawFruit returns');
});
