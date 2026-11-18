// Framework additions made with batch R19 (the two RPG battle backdrops), and the two backdrops themselves against
// their specification rows (bundles/specs/kit-rpg-fantasy.md) and the background rules of the style guide (section 7):
//   engine/scenery.js  BATTLE                 the rows of a battle backdrop: where the ground starts, where feet stand
//                      standApart             the standOut for a whole backdrop, by day or under a dark sky
//                      standOutLighter        the standOut of a dark backdrop: lighter until clear of what is behind
//                      roundTree, farHouse    a round tree on its trunk; a cottage small with distance
//                      railFence              a post-and-rail fence along a ground outline
//                      tufts, groundMarks     a tufted grass edge; scuffs and pebbles that leave the feet rows calm
//                      arcade                 the outline of a row of round-headed openings
//                      pillar, wallTorch, wallRing, lightPatch   a pillar, the torch on it, a ring and chain, the wall it lights
//                      pavedFloor             a paved floor seen from the side of a battle screen
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness, rgbToHex, INK } from '../../engine/color.js';
import { renderFrame, defaultParams, cleanParams } from '../../engine/sprite.js';
import { PALETTE } from '../../engine/palettes.js';
import { LAYER, PIVOT, TIMES, standOut, skyLook } from '../../engine/backdrop.js';
import { steps } from '../../engine/fx.js';
import { THEME_PRESETS, PALETTES, applyColour } from '../../engine/theme.js';
import { checkSprite, seamCheck } from '../../quality/sprite.js';
import { validateMeta } from '../../catalog/schema.js';
import { BATTLE, standApart, standOutLighter, roundTree, farHouse, railFence, tufts, groundMarks, arcade, pillar, wallTorch, wallRing, lightPatch, pavedFloor } from '../../engine/scenery.js';
import field from '../../sprites/bg-battle-field.js';
import dungeon from '../../sprites/bg-battle-dungeon.js';

const [W, H] = LAYER;
const HV = PALETTE.hearthvale;
const layer = (fn) => { const g = new Surface(W, H); fn(g); return g; };
const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const hexOf = (v) => rgbToHex(v & 255, (v >>> 8) & 255, (v >>> 16) & 255);
const coloursOf = (g) => new Set([...new Set(g.data)].filter((v) => v).map(hexOf));
const onlyColours = (g, list, name) => { for (const c of coloursOf(g)) assert.ok(list.includes(c), `${name}: draws ${c}, which it was not given`); };
// The same thing drawn `dx` px further right must be the same picture moved round the 320 px loop.
const wrapsRound = (draw, x0, dx, name) => {
  const a = layer((g) => draw(g, x0)), b = layer((g) => draw(g, x0 + dx));
  assert.ok(lit(a) > 0, `${name} draws something`);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(b.get((x + dx) % W, y), a.get(x, y), `${name}: moved ${dx} px, pixel ${x},${y} differs: it does not wrap`);
};
const A = '#a0b0c0', B = '#607080', C = '#405060', D = '#d0c0a0', E = '#805030';

// ---- the rows and the colour helpers ---------------------------------------------------------------------------

test('BATTLE: the ground starts on row 132 and feet stand on row 150 (style guide, section 7)', () => {
  assert.deepEqual({ ...BATTLE }, { ground: 132, feet: 150 });
  assert.ok(Object.isFrozen(BATTLE));
});

test('standApart: the full standOut by day, the gentle one under a dark sky, and a floor it does not sink below', () => {
  const c = '#9ac0a8', sure = ['#c9f2f3'], also = ['#abd5e4'];
  assert.equal(standApart(false)(c, sure, also), standOut(c, sure, { also }));
  assert.equal(standApart(true)(c, sure, also), standOut(c, [], { also: [...sure, ...also], step: 0.05 }));
  assert.equal(standApart()(c), c, 'nothing behind it: unchanged');
  // a dark green against a mid green and a dusk earth: the full rule takes it nearly to the outline colour
  const grass = '#3f6f3a', behind = ['#51833f', '#cbab80'], full = standOut(grass, behind);
  assert.ok(brightness(full) < 0.26, `the full rule gives ${full}`);
  const kept = standApart(false, 0.26)(grass, behind);
  assert.ok(brightness(kept) >= 0.26 && brightness(kept) <= brightness('#51833f') - 0.1 + 1e-9, `with a floor it stays at ${kept}: a plain step under the bank`);
  assert.equal(standApart(false, 0.1)(grass, behind), full, 'a floor below the result changes nothing');
});

test('standOutLighter: lifts a colour until it is a step brighter than what is behind it and differs under every palette', () => {
  assert.equal(standOutLighter('#c0c0d0'), '#c0c0d0', 'nothing behind it: unchanged');
  assert.equal(standOutLighter('#f0f0f8', ['#303040']), '#f0f0f8', 'it stands out already: unchanged');
  const dark = '#2f2a43', wall = standOutLighter('#3a3850', [dark]), column = standOutLighter('#4a4a62', [wall], { also: [dark] });
  assert.ok(brightness(wall) >= brightness(dark) + 0.08 - 1e-9 && brightness(column) >= brightness(wall) + 0.08 - 1e-9, `each a step lighter: ${dark}, ${wall}, ${column}`);
  for (const pal of PALETTES) {
    const [a, b, c] = applyColour(new Uint32Array([dark, wall, column].map(col)), { palette: pal.name });
    assert.ok(a !== b && b !== c, `${pal.name}: the three stay apart`);
  }
  // behind a pale pillar the floor still goes lighter, where backdrop.js standOut would turn it dark
  const pale = '#9a7ad0', floor = standOutLighter('#8a6a5a', [pale]);
  assert.ok(brightness(floor) > brightness(pale), `${floor} is lighter than the pillar ${pale}`);
  assert.ok(brightness(standOut('#8a6a5a', [pale])) < brightness(pale), 'standOut goes darker here');
  assert.ok(brightness(standOutLighter('#3a3850', [], { also: [dark], step: 0.2 })) >= brightness(dark) + 0.2 - 1e-9, 'also: a lead in brightness only');
  assert.equal(standOutLighter('#3a3850', [dark]), wall, 'the same input gives the same colour');
});

// ---- the field's furniture ---------------------------------------------------------------------------------------

test('roundTree: a crown in three tones on a two-tone trunk, standing on its foot, wrapping', () => {
  const tones = { light: A, base: B, dark: C }, wood = { base: D, dark: E };
  const g = layer((s) => roundTree(s, 160, 120, { height: 50, tones, wood, seed: 3 }));
  onlyColours(g, [A, B, C, D, E], 'roundTree');
  assert.deepEqual([...coloursOf(g)].sort(), [A, B, C, D, E].sort(), 'all five tones are used');
  const b = g.bounds();
  assert.ok(b.y1 >= 119 && b.y1 <= 121, `the root is on the foot row (lowest pixel ${b.y1})`);
  assert.ok(b.y0 >= 120 - 56 && b.y0 <= 120 - 44, `about as tall as asked (top ${b.y0})`);
  assert.ok(b.x1 - b.x0 >= 28 && b.x1 - b.x0 <= 46, `a round crown (${b.x1 - b.x0} px wide)`);
  assert.equal(hexOf(g.get(160, 118)), D, 'the trunk is wood at the root');
  const other = layer((s) => roundTree(s, 160, 120, { height: 50, tones, wood, seed: 4 }));
  assert.ok(g.data.some((v, i) => v !== other.data[i]), 'another seed, another crown');
  wrapsRound((s, x) => roundTree(s, x, 120, { height: 50, tones, wood, seed: 3 }), 40, 268, 'roundTree');
});

test('farHouse: wall under a broad roof, a door, a chimney and a lit window when asked, wrapping', () => {
  const tones = { wall: A, roof: B };
  const g = layer((s) => farHouse(s, 100, 90, { width: 14, wall: 5, roof: 6, tones }));
  onlyColours(g, [A, B], 'farHouse');
  const b = g.bounds();
  assert.equal(b.y1, 89, 'it stands on the foot row');
  assert.equal(b.y0, 90 - 5 - 6, 'wall and roof are as high as asked');
  assert.ok(b.x1 - b.x0 + 1 > 14, 'the roof overhangs the walls');
  const withAll = layer((s) => farHouse(s, 100, 90, { width: 14, wall: 5, roof: 6, chimney: true, tones: { ...tones, window: D } }));
  assert.ok(withAll.bounds().y0 < b.y0, 'the chimney stands above the roof');
  let win = 0; for (const v of withAll.data) if (v && hexOf(v) === D) win++;
  assert.equal(win, 4, 'the window is a 2x2 light');
  wrapsRound((s, x) => farHouse(s, x, 90, { width: 14, tones }), 60, 255, 'farHouse');
});

test('railFence: posts on the ground line, rails from post to post, gateways and missing rails, across the join', () => {
  const colours = { wood: A, lit: B, shade: C };
  const ground = (x) => 120 + Math.round(3 * Math.sin((x / W) * Math.PI * 2));
  const g = new Surface(W, H);
  const posts = railFence(g, ground, { posts: 16, height: 10, rails: [2, 6], colours });
  onlyColours(g, [A, B, C], 'railFence');
  assert.equal(posts.length, 16);
  for (const p of posts) { assert.ok(Math.abs(p.foot - ground(p.x)) <= 1, 'a post stands on the ground'); assert.ok(p.foot - p.top >= 10 && p.foot - p.top <= 12); assert.ok(g.get(p.x, p.foot - 4), 'a post is drawn'); }
  for (let x = 0; x < W; x++) { let n = 0; for (let y = 100; y < 130; y++) if (g.get(x, y)) n++; assert.ok(n >= 4, `column ${x} has both rails (${n} px)`); }
  const s = seamCheck(g, g, 'x');
  assert.ok(s.ok, 'the last span runs on across the join');
  // a gateway: span 4 has no rails and loses the post at its far end; a broken rail: one rail fewer in that span
  const open = new Surface(W, H);
  const left = railFence(open, ground, { posts: 16, height: 10, rails: [2, 6], open: [4], broken: [[9, 0]], colours });
  assert.equal(left.length, 15);
  for (let x = 4 * 20 + 14; x < 5 * 20 + 6; x++) for (let y = 100; y < 130; y++) assert.equal(open.get(x, y), 0, `the gateway is open at ${x},${y}`);
  let whole = 0, broke = 0;
  for (let y = 100; y < 130; y++) { if (g.get(9 * 20 + 20, y)) whole++; if (open.get(9 * 20 + 20, y)) broke++; }
  assert.equal(broke, whole / 2, 'the span with a broken rail has one rail, not two');
});

test('tufts: an outline of clumps of blades on a level line that repeats every 320 px', () => {
  const edge = tufts({ base: 132, count: 26, seed: 3, height: 6 });
  let lowest = 0, top = Infinity, bare = 0;
  for (let x = 0; x < W; x++) {
    const y = edge(x + 0.5);
    assert.ok(Math.abs(y - edge(x + 0.5 + W)) < 1e-9 && Math.abs(y - edge(x + 0.5 - W)) < 1e-9, 'it repeats exactly');
    lowest = Math.max(lowest, y); top = Math.min(top, y); if (y === 132) bare++;
  }
  assert.equal(lowest, 132, 'nothing dips below the line');
  assert.ok(top >= 126 && top <= 128, `the tallest blade is about ${6} px (top ${top})`);
  assert.ok(bare > 40 && bare < 260, `clumps with bare line between them (${bare} bare columns)`);
  const onHill = tufts({ base: (x) => 100 + (x % 320 < 160 ? 0 : 5), count: 20, seed: 1 });
  assert.ok(onHill(300.5) > onHill(20.5) - 7 && onHill(300.5) <= 105, 'it stands on another outline too');
});

test('groundMarks: marks 3 px wide or more, none on the rows kept clear, the same ones when more are asked for', () => {
  const colours = { dark: C, stone: A, light: B };
  const draw = (count, o = {}) => layer((g) => groundMarks(g, { top: 140, bottom: 176, count, seed: 6, clear: [145, 153], pebbles: 0.4, colours, ...o }));
  const g = draw(14);
  onlyColours(g, [A, B, C], 'groundMarks');
  const b = g.bounds();
  assert.ok(b.y0 >= 140 && b.y1 < 176, 'inside its band');
  for (let y = 145; y <= 153; y++) for (let x = 0; x < W; x++) assert.equal(g.get(x, y), 0, `row ${y} is clear`);
  for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x <= W; x++) { if (x < W && g.get(x, y)) run++; else { assert.ok(run === 0 || run >= 3 || x - run === 0 || x === W, `a run of ${run} px at ${x - run},${y}`); run = 0; } } }
  const few = draw(7);
  assert.ok(lit(few) < lit(g));
  for (let i = 0; i < few.data.length; i++) if (few.data[i]) assert.notEqual(g.data[i], 0, 'a mark of the smaller count is still there in the bigger one');
  assert.deepEqual([...coloursOf(draw(14, { pebbles: 0 }))], [C], 'no pebbles: scuffs only');
  assert.ok(seamCheck(g, g, 'x').ok);
});

// ---- the dungeon's furniture ---------------------------------------------------------------------------------------

test('arcade: round-headed openings between piers, a pier on the join, repeating every 320 px', () => {
  const f = arcade({ count: 4, width: 52, crown: 40, spring: 66 });
  for (let x = 0; x < W; x += 7) assert.equal(f(x + 0.5), f(x + 0.5 + W));
  assert.equal(f(0.5), 1e6, 'a pier stands on the join');
  assert.equal(f(80), 1e6, 'and between every two openings');
  assert.ok(Math.abs(f(40) - 40) < 0.01, 'the crown is over the middle of an opening');
  assert.ok(f(40 - 25) > 58 && f(40 - 25) <= 66, 'the curve comes down to the spring row at the jamb');
  assert.ok(f(40 - 20) < f(40 - 25) && f(40 - 10) < f(40 - 20), 'and rises to the crown');
  let openings = 0, was = false;
  for (let x = 0; x < W; x++) { const open = f(x + 0.5) < 1e6; if (open && !was) openings++; was = open; }
  assert.equal(openings, 4);
  assert.ok(arcade({ count: 4, width: 52, shift: 40 })(0.5) < 1e6, 'shifted by half a span, an opening is on the join');
  assert.equal(arcade({ count: 4, width: 52, solid: 77 })(80), 77);
});

test('pillar: capital, shaft in three tones lit from the right, foot; joints and collars; wraps on the join', () => {
  const tones = { light: A, base: B, dark: C };
  const g = new Surface(W, H);
  const box = pillar(g, 160, { top: 0, bottom: 121, width: 20, capital: 4, foot: 5, tones });
  onlyColours(g, [A, B, C], 'pillar');
  assert.deepEqual(box, { left: 150, right: 170, top: 6, bottom: 112 });
  const b = g.bounds();
  assert.deepEqual([b.y0, b.y1], [0, 120], 'from the top row to the row above its foot line');
  assert.equal(b.x1 - b.x0 + 1, 20 + 5 * 2, 'the foot is the widest part');
  assert.equal(hexOf(g.get(151, 60)), C, 'shadow down the left');
  assert.equal(hexOf(g.get(168, 60)), A, 'light down the right');
  assert.equal(hexOf(g.get(160, 60)), B);
  const coursed = layer((s) => pillar(s, 160, { top: 0, bottom: 121, width: 20, courses: 12, seed: 2, tones }));
  assert.ok(coursed.data.some((v, i) => v !== g.data[i]), 'courses add joints');
  const other = layer((s) => pillar(s, 160, { top: 0, bottom: 121, width: 20, courses: 12, seed: 5, tones }));
  assert.ok(coursed.data.some((v, i) => v !== other.data[i]), 'another seed leaves other joints out');
  const ringed = layer((s) => pillar(s, 160, { top: 0, bottom: 121, width: 20, collars: [40], tones }));
  assert.ok(ringed.get(149, 6 + 41) && !g.get(149, 6 + 41), 'a collar juts out 1 px');
  wrapsRound((s, x) => pillar(s, x, { top: 0, bottom: 121, width: 20, courses: 12, collars: [30], seed: 1, tones }), 160, 160, 'pillar');
  const onJoin = layer((s) => pillar(s, 0, { top: 0, bottom: 121, width: 20, tones }));
  assert.ok(onJoin.get(2, 60) && onJoin.get(W - 3, 60), 'a pillar on the join shows on both edges');
  assert.ok(seamCheck(onJoin, onJoin, 'x').ok);
});

test('lightPatch: nested flat steps, smaller when the flame dips, kept inside a clip, wrapping', () => {
  const g = layer((s) => lightPatch(s, 160, 60, 24, [A, B]));
  onlyColours(g, [A, B], 'lightPatch');
  const b = g.bounds();
  assert.ok(b.x1 - b.x0 >= 44 && b.x1 - b.x0 <= 52, `about 2 x 24 px across (${b.x1 - b.x0})`);
  assert.equal(hexOf(g.get(160, 60)), B, 'the inner step is at the lamp');
  assert.equal(hexOf(g.get(160 + 20, 60)), A, 'the outer step is round it');
  let inner = 0; for (const v of g.data) if (v && hexOf(v) === B) inner++;
  assert.ok(inner > 100 && inner < lit(g) / 2, 'the inner step is the smaller part');
  const low = layer((s) => lightPatch(s, 160, 60, 24, [A, B], { level: 0 }));
  assert.ok(lit(low) < lit(g) * 0.75 && lit(low) > lit(g) * 0.3, 'at its lowest it is smaller, not gone');
  const clipped = layer((s) => lightPatch(s, 160, 60, 24, [A, B], { clip: (px) => px >= 150 && px < 170 }));
  const cb = clipped.bounds();
  assert.deepEqual([cb.x0, cb.x1], [150, 169]);
  assert.ok(layer((s) => lightPatch(s, 160, 60, 24, [A, B], { squash: 0.5 })).bounds().y1 < b.y1 - 6, 'squash flattens it');
  wrapsRound((s, x) => lightPatch(s, x, 60, 24, [A, B], { seed: 2 }), 30, 280, 'lightPatch');
});

test('wallTorch: an iron cup and a flame above it that ripples and comes back to its first frame', () => {
  const F = steps('#e8662c', { white: false }), iron = { base: C, light: A };
  const at = (t) => layer((s) => wallTorch(s, 160, 70, { t, iron, colours: F }));
  const g = at(0);
  onlyColours(g, [A, C, ...F], 'wallTorch');
  const b = g.bounds();
  assert.ok(b.y0 <= 70 - 8 && b.y0 >= 70 - 16, `the flame stands about 11 px over the cup (top ${b.y0})`);
  assert.ok(b.y1 >= 78 && b.y1 <= 80, 'the stem hangs below it');
  assert.ok(b.x1 - b.x0 <= 14, 'it is small');
  for (let y = 71; y < H; y++) for (let x = 0; x < W; x++) if (g.get(x, y)) assert.ok([A, C].includes(hexOf(g.get(x, y))), 'no flame below the rim');
  for (const c of F) assert.ok(coloursOf(g).has(c), `the flame uses ${c}`);
  const quarter = at(0.25), end = at(1);
  assert.ok(g.data.some((v, i) => v !== quarter.data[i]), 'it moves');
  assert.ok(g.data.every((v, i) => v === end.data[i]), 'whole ripples per loop: t = 1 is t = 0');
  const bare = layer((s) => wallTorch(s, 160, 70, { colours: F }));
  onlyColours(bare, F, 'wallTorch without a cup');
  assert.ok(lit(layer((s) => wallTorch(s, 160, 70, { size: 1.5, colours: F }))) > lit(bare), 'size makes a bigger flame');
  const onJoin = at(0.3), moved = layer((s) => wallTorch(s, 0, 70, { t: 0.3, iron, colours: F }));
  assert.ok(moved.get(0, 72) && moved.get(W - 1, 72) && lit(moved) === lit(onJoin), 'a torch on the join is whole, half on each edge');
});

test('wallRing: a ring and its chain in one colour, longer with more links', () => {
  const g = layer((s) => wallRing(s, 160, 60, { links: 3, colour: C }));
  onlyColours(g, [C], 'wallRing');
  const b = g.bounds();
  assert.deepEqual([b.x0, b.x1], [157, 163]);
  assert.equal(b.y0, 58);
  assert.equal(g.get(160, 64), 0, 'the ring is open in the middle');
  assert.equal(layer((s) => wallRing(s, 160, 60, { links: 5, colour: C })).bounds().y1, b.y1 + 8);
  wrapsRound((s, x) => wallRing(s, x, 60, { colour: C }), 2, 316, 'wallRing');
});

test('pavedFloor: courses of slabs from the back row down, joints of the pattern at each course\'s own scale, no holes, wrapping', () => {
  const colours = { body: A, joint: C, lit: D };
  const courses = [{ h: 6, period: 32 }, { h: 8, period: 40, shift: 9 }, { h: 12, period: 64 }, { h: 22, period: 80, shift: 23 }];
  const g = new Surface(W, H);
  const slabs = pavedFloor(g, { top: 132, courses, joints: [[10, 29], [4, 20]], colours });
  onlyColours(g, [A, C, D], 'pavedFloor');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) assert.equal(g.get(x, y) !== 0, y >= 132, `opaque from row 132 down, clear above (${x},${y})`);
  for (const y of [132, 138, 146, 158]) for (let x = 0; x < W; x++) assert.equal(hexOf(g.get(x, y)), C, `a level joint on row ${y}`);
  // the first course keeps the tileset's own columns, every 32 px; the third doubles them
  for (let x0 = 0; x0 < W; x0 += 32) for (const j of [10, 29]) assert.equal(hexOf(g.get(x0 + j, 135)), C, `an upright joint at ${x0 + j}`);
  for (let x0 = 0; x0 < W; x0 += 64) for (const j of [20, 58]) assert.equal(hexOf(g.get(x0 + j, 150)), C);
  assert.equal(hexOf(g.get(15, 135)), A);
  assert.equal(slabs.length, 2 * (10 + 8 + 5 + 4), 'two slabs to a repeat in every course');
  for (const s of slabs) assert.ok(s.w >= 8 && s.h >= 5, 'a slab has room in it');
  assert.ok(Math.max(...slabs.filter((s) => s.course === 3).map((s) => s.w)) > Math.max(...slabs.filter((s) => s.course === 0).map((s) => s.w)) * 2, 'the front slabs are more than twice as wide as the back ones');
  assert.ok(seamCheck(g, g, 'x').ok);
  // shaded slabs: some, never on the rows kept clear, and never a hole
  const shaded = layer((s) => pavedFloor(s, { top: 132, courses, colours: { ...colours, shade: B }, shaded: 0.4, clear: [146, 154], seed: 3 }));
  let n = 0;
  for (let y = 132; y < H; y++) for (let x = 0; x < W; x++) { const c = hexOf(shaded.get(x, y)); assert.notEqual(shaded.get(x, y), 0); if (c === B) { n++; assert.ok(y < 146 || y >= 158, `a shaded slab on row ${y}, which was to stay clear`); } }
  assert.ok(n > 200, 'some slabs are shaded');
  assert.ok(seamCheck(shaded, shaded, 'x').ok);
  // a floor that ends before the bottom is filled on with the body colour
  const short = layer((s) => pavedFloor(s, { top: 150, courses: [{ h: 10, period: 32 }], colours }));
  assert.equal(hexOf(short.get(5, 175)), A);
});

// ---- the two backdrops ----------------------------------------------------------------------------------------------

const SPEC = [
  { def: field, id: 'bg-battle-field', name: 'Field battle backdrop', themes: ['fantasy', 'forest'], frames: { far: 1, mid: 1, near: 1 },
    controls: ['sky', 'land', 'path', 'time', 'clouds', 'height', 'density', 'haze'], colours: { sky: HV.sky, land: HV.meadow, path: HV.path }, sounds: {} },
  { def: dungeon, id: 'bg-battle-dungeon', name: 'Dungeon battle backdrop', themes: ['fantasy', 'dungeon'], frames: { far: 1, mid: 8, near: 1 },
    controls: ['stone', 'floor', 'glow', 'torches', 'height', 'density', 'haze', 'speed'], colours: { stone: HV.slate, floor: HV.flagstone, glow: HV.fire },
    sounds: { mid: [{ sound: 'fire', preset: 'Torch', frame: 0, volume: 0.35 }] } },
];
function looks(def) {
  const lo = {}, hi = {};
  for (const [k, d] of Object.entries(def.params)) if (d.kind === 'range') { lo[k] = d.min; hi[k] = d.max; }
  const out = [['default', defaultParams(def)], ['all low', cleanParams(def, lo)], ['all high', cleanParams(def, hi)]];
  if (def.params.time) for (const time of TIMES) out.push([time, { ...defaultParams(def), time }], [`${time}, all high`, { ...cleanParams(def, hi), time }], [`${time}, all low`, { ...cleanParams(def, lo), time }]);
  for (const [k, d] of Object.entries(def.params)) if (d.kind === 'color') d.swatches.slice(1).forEach((c, i) => out.push([`${k} swatch ${i + 1}`, { ...defaultParams(def), [k]: c }]));
  return out;
}
const framesOf = (def, clip) => (def.clips[clip].frames > 1 ? [0, 3] : [0]);

for (const spec of SPEC) {
  const { def, id } = spec;

  test(`${id}: frame, layers, controls, sounds and metadata are the specification's`, () => {
    assert.equal(def.id, id);
    assert.equal(def.name, spec.name);
    assert.deepEqual(def.size, [320, 180]);
    assert.deepEqual(def.pivot, PIVOT);
    assert.deepEqual(Object.keys(def.clips), ['far', 'mid', 'near'], 'the farthest layer first');
    for (const [c, n] of Object.entries(spec.frames)) { assert.equal(def.clips[c].frames, n, `${c} frames`); assert.equal(def.clips[c].loop, true); }
    assert.deepEqual(Object.keys(def.params).sort(), [...spec.controls].sort());
    assert.deepEqual(Object.keys(def.parts ?? {}), []);
    assert.deepEqual(def.sounds, spec.sounds);
    for (const [k, c] of Object.entries(spec.colours)) {
      assert.equal(def.params[k].kind, 'color');
      assert.equal(def.params[k].def, c, `${k} default`);
      assert.equal(def.params[k].swatches[0], c, `${k}: the default is the first swatch`);
      assert.ok(def.params[k].swatches.length >= 4 && def.params[k].swatches.length <= 8);
      for (const s of def.params[k].swatches) assert.ok(Object.values(HV).includes(s), `${k}: ${s} is a Hearthvale colour`);
    }
    assert.deepEqual({ type: def.meta.type, role: def.meta.role, view: def.meta.view, themes: def.meta.themes, license: def.meta.license },
      { type: 'background', role: 'environment/background', view: 'side', themes: spec.themes, license: 'draft' });
    assert.equal(def.meta.gameTypes[0], 'turn-based-rpg');
    assert.ok(def.meta.words.length >= 6 && def.meta.words.length <= 14);
    assert.deepEqual(validateMeta(def.meta, 'sprite'), { ok: true, errors: [] });
    for (const speed of ['0.1', '0.4', '0.7']) assert.ok(def.blurb.includes(speed), `the blurb says the scroll speed ${speed}`);
  });

  test(`${id}: passes the quality checker with no errors and no warnings`, () => {
    const r = checkSprite(def, { validateMeta });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.warnings, []);
  });

  test(`${id}: every layer spans the width and joins itself at every setting; far is solid; the ground is opaque from row 132 down`, () => {
    for (const [name, p] of looks(def)) for (const clip of ['far', 'mid', 'near']) for (const f of framesOf(def, clip)) {
      const g = renderFrame(def, clip, f, p), b = g.bounds();
      assert.deepEqual([b.x0, b.x1], [0, W - 1], `${clip} / ${name} spans the width`);
      const s = seamCheck(g, g, 'x');
      assert.ok(s.ok, `${clip} / ${name}: ${s.breaks} gaps (${s.maxBreaks} allowed), step ${s.jump} (${s.maxJump} allowed)`);
      let same = 0;
      for (let y = 0; y < H; y++) if (g.get(0, y) === g.get(W - 1, y)) same++;
      assert.ok(same >= H * 0.8, `${clip} / ${name}: only ${same} of ${H} rows match across the join`);
      if (clip === 'far') assert.ok(g.data.every((v) => (v >>> 24) === 255), `far / ${name} is fully solid`);
      else {
        let open = 0;
        for (const v of g.data) if (!v) open++;
        assert.ok(open > W * H * 0.2, `${clip} / ${name}: at least a fifth is see-through`);
        for (let y = H - 8; y < H; y++) for (let x = 0; x < W; x++) assert.notEqual(g.get(x, y), 0, `${clip} / ${name}: hole in the bottom strip at ${x},${y}`);
      }
      if (clip === 'near') {
        for (let y = BATTLE.ground; y < H; y++) for (let x = 0; x < W; x++) assert.notEqual(g.get(x, y), 0, `near / ${name}: hole in the ground at ${x},${y}`);
        for (let x = 0; x < W; x++) assert.equal(g.get(x, BATTLE.ground - 8), 0, `near / ${name}: something stands above the ground at column ${x}`);
      }
    }
  });

  test(`${id}: the rows round the fighters' feet are calm`, () => {
    for (const [name, p] of looks(def)) {
      const g = renderFrame(def, 'near', 0, p), seen = new Set();
      let changes = 0;
      for (let y = BATTLE.feet - 3; y <= BATTLE.feet + 2; y++) for (let x = 0; x < W; x++) { seen.add(g.get(x, y)); if (g.get(x, y) !== g.get((x + 1) % W, y)) changes++; }
      assert.ok(seen.size <= 2, `near / ${name}: ${seen.size} colours on the feet rows`);
      assert.ok(changes <= 6 * 24, `near / ${name}: ${changes} changes of colour along the feet rows`);
    }
  });

  test(`${id}: stays behind the fighters: at most 8 landscape colours a layer, no pure palette colour, nothing as dark as the outline, no single pixels`, () => {
    const pure = new Set(Object.values(HV));
    for (const [name, p] of looks(def)) for (const clip of ['far', 'mid', 'near']) for (const f of framesOf(def, clip)) {
      const g = renderFrame(def, clip, f, p);
      const area = new Map();
      for (const v of g.data) if (v) area.set(v, (area.get(v) ?? 0) + 1);
      // the sun or moon, stars, lit windows, flames and the wall they light do not count: they cover under 2% of the layer
      const landscape = [...area].filter(([, n]) => n >= W * H * 0.02);
      assert.ok(landscape.length <= 8, `${clip} / ${name}: ${landscape.length} landscape colours`);
      assert.ok(area.size <= 12, `${clip} / ${name}: ${area.size} colours in all`);
      const flame = clip === 'mid' && def === dungeon ? new Set(steps(p.glow, { white: false })) : new Set();
      for (const [v] of area) {
        const c = hexOf(v);
        if (flame.has(c)) continue;                                   // a flame is light: it is not mixed toward the dark
        assert.ok(!pure.has(c), `${clip} / ${name}: ${c} is a pure palette colour (use recede)`);
        assert.ok(brightness(c) > brightness(INK) + 0.04, `${clip} / ${name}: ${c} is as dark as the outline`);
      }
      const at = (x, y) => (y < 0 || y >= H ? -1 : g.data[y * W + ((x + W) % W)]);
      let lone = 0, where = '';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = at(x, y);
        if (v !== at(x - 1, y) && v !== at(x + 1, y) && v !== at(x, y - 1) && v !== at(x, y + 1)) { if (!lone) where = `${x},${y}`; lone++; }
      }
      assert.equal(lone, 0, `${clip} / ${name}: ${lone} single pixels, first at ${where}`);
    }
  });
}

const byArea = (g, skip = new Set()) => { const m = new Map(); for (const v of g.data) if (v && !skip.has(v)) m.set(v, (m.get(v) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([v]) => v); };
const distinctUnderEveryLook = (pairs) => {
  assert.ok(THEME_PRESETS.filter((t) => t.theme.colour.palette).length >= 8, 'the palette looks are there');
  for (const preset of THEME_PRESETS) for (const [name, front, behind] of pairs) {
    const [a, b] = applyColour(new Uint32Array([front, behind]), preset.theme.colour);
    assert.notEqual(a, b, `${preset.name}: ${name} ${hexOf(front)} turns into the ${hexOf(behind)} behind it (both ${hexOf(a)})`);
  }
};

test('bg-battle-field: nothing in mid or near is brighter than the horizon band, by day and at dusk', () => {
  for (const [name, p] of looks(field)) {
    if (p.time === 'night') continue;                 // under a dark sky the moonlit land is lighter than the sky
    const horizon = brightness(skyLook(p.sky, p.time).bands[3]);
    for (const clip of ['mid', 'near']) {
      let bright = 0;
      for (const v of renderFrame(field, clip, 0, p).data) if (v && brightness(hexOf(v)) > horizon + 0.005) bright++;
      assert.ok(bright < W * H * 0.02, `${clip} / ${name}: ${bright} pixels brighter than the horizon band`);
    }
  }
});

test('bg-battle-field: hills, bank, trees, grass and earth stay apart under every whole-bundle look; far to mid steps down about as far as mid to the grass', () => {
  const p = defaultParams(field), [far, mid, near] = ['far', 'mid', 'near'].map((c) => renderFrame(field, c, 0, p));
  const bands = skyLook(p.sky, p.time).bands.map(col);
  // the main tone of the trees: of the two biggest colours of the crowns (their sunlit clumps and their body), the darker
  const crowns = new Surface(W, H); for (let y = 40; y < 100; y++) for (let x = 0; x < W; x++) crowns.data[y * W + x] = mid.get(x, y);
  const hill = byArea(far, new Set(bands))[0], [bank] = byArea(mid), [earth, grass] = byArea(near);
  const crown = byArea(crowns).slice(0, 2).sort((a, b) => brightness(hexOf(a)) - brightness(hexOf(b)))[0];
  distinctUnderEveryLook([['the hills', hill, bands[3]], ['the bank', bank, hill], ['the trees', crown, hill], ['the trees', crown, bands[3]], ['the grass edge', grass, bank], ['the grass edge', grass, earth]]);
  const v = (c) => brightness(hexOf(c));
  assert.ok(v(bands[3]) > v(hill) && v(hill) > v(bank) && v(bank) > v(crown) && v(crown) > v(grass), 'each nearer shape is darker: horizon, hills, bank, trees, grass edge');
  const farToMid = v(hill) - v(bank), midToNear = v(bank) - v(grass);
  assert.ok(farToMid > 0.1 && midToNear > 0.1 && Math.abs(farToMid - midToNear) < 0.1, `the two steps are alike (${farToMid.toFixed(2)} and ${midToNear.toFixed(2)})`);
  assert.ok(v(earth) > v(bank) && v(earth) < v(bands[3]) - 0.08, 'the earth the fighters stand on is the lightest ground, and still under the horizon');
});

test('bg-battle-dungeon: the dark, the wall, the pillars and the floor are four values that stay apart under every look, lighter as they come nearer', () => {
  const p = defaultParams(dungeon), [far, mid, near] = ['far', 'mid', 'near'].map((c) => renderFrame(dungeon, c, 0, p));
  const [wall, dark] = byArea(far), [pillarTone] = byArea(mid), [floor, joint] = byArea(near);
  distinctUnderEveryLook([['the wall', wall, dark], ['the pillars', pillarTone, wall], ['the pillars', pillarTone, dark], ['the floor', floor, pillarTone], ['the joints of the floor', joint, floor]]);
  const v = (c) => brightness(hexOf(c));
  assert.ok(v(dark) < v(wall) && v(wall) < v(pillarTone) && v(pillarTone) < v(floor), 'dark, wall, pillars, floor: each lighter than the last');
  assert.ok(v(dark) > brightness(INK) + 0.04 && v(dark) < 0.22, 'the dark of the passages is black-blue, but not the outline colour');
});

test('bg-battle-dungeon: the torches flicker through 8 different frames and the loop closes; every control of the torches shows', () => {
  const p = defaultParams(dungeon);
  const frames = Array.from({ length: 8 }, (_, f) => renderFrame(dungeon, 'mid', f, p));
  for (let f = 0; f < 8; f++) {
    const next = frames[(f + 1) % 8];
    let diff = 0;
    for (let i = 0; i < next.data.length; i++) if (next.data[i] !== frames[f].data[i]) diff++;
    assert.ok(diff >= 12, `frame ${f} to the next: ${diff} pixels change`);
    assert.ok(diff < 1500, `frame ${f} to the next: ${diff} pixels change, which is a jump and not a flicker`);
  }
  const F = steps(p.glow, { white: false }).map(col);
  const flames = (g) => { let n = 0; for (const v of g.data) if (v === F[0]) n++; return n; };
  assert.ok(flames(frames[0]) > 0);
  // how many flames: the runs of columns that hold flame colour, counted round the loop (a torch may hang on the join)
  const count = (over) => { const g = renderFrame(dungeon, 'mid', 0, { ...p, ...over }); const on = (x) => { for (let y = 0; y < 100; y++) if (g.get((x + W) % W, y) === F[2]) return true; return false; }; let runs = 0; for (let x = 0; x < W; x++) if (on(x) && !on(x - 1)) runs++; return runs; };
  assert.equal(count({}), 2, 'at the default, a torch on every second of four pillars');
  assert.ok(count({ torches: 1 }) === 4 && count({ torches: 0 }) === 1, 'the Torches slider runs from one to all of them');
  assert.equal(count({ density: 1, torches: 1 }), 5);
  assert.equal(dungeon.clips.mid.fps({ ...p, speed: 0.5 }) > dungeon.clips.mid.fps({ ...p, speed: 0 }), true, 'Speed drives the flicker');
});
