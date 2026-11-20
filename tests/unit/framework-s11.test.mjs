// Framework additions made with batch S11 (the station walls and the machines set in them: sprites/tiles-station-walls.js,
// blast-door.js, wall-terminal.js, laser-gate.js), all in engine/bulkhead.js:
//   shadeTo                         a colour taken along its own ramp to a given brightness
//   BULKHEAD_STYLES, drawBulkhead   the front face of a plated metal wall, in bands counted from its foot
//   DOOR_STYLES, doorLeaves         the leaves of a sliding door (split, iris, shutter) at one moment of its opening
//   SCREEN_PICTURES, screenIn       what a small screen shows: text, a graph, a map, a skull, a tick
//   laserBeam                       a level beam of light that can thin, break and go out
//   machineTones, drawCasing        the tones of a metal machine from one colour, and a box of it seen from the south
//   hazardBand                      a dark band with slanted warning stripes
// and one in engine/tiles.js:
//   FACE_PIECES, the decal place 'face'   a fixture on a top-down wall's front face: scattered over face cells only
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, brightness } from '../../engine/color.js';
import { TILE, patternFill, drawBlock, blockClips, decoClips, classifyTiles, pickDecal, layoutTiles, pieceOf, DECAL_CHANCE, FACE_PIECES, textureTone, textureLight } from '../../engine/tiles.js';
import { stripesIn } from '../../engine/solids.js';
import { rectIn } from '../../engine/surface.js';
import { shadeTo, BULKHEAD_STYLES, drawBulkhead, DOOR_STYLES, doorLeaves, SCREEN_PICTURES, screenIn, laserBeam, machineTones, drawCasing, hazardBand } from '../../engine/bulkhead.js';

import { codeSprite } from '../helpers/library.mjs';   // the code, frozen first (tests/helpers/library.mjs): a test about the framework it uses
const TONES = { base: '#6b7896', lit: '#9db2c5', soft: '#7f8fa9', seam: '#424672', skirt: '#575f84', dark: '#2f3059' };
const GLOW = '#2fb3a8', OFF = '#101020';
const at = (g, x, y) => g.data[y * g.w + x];
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const face = (opts) => { const s = new Surface(TILE, TILE); const rows = drawBulkhead(s, { tones: TONES, ...opts }); return { s, rows }; };

// ---- tones -----------------------------------------------------------------------------------

test('shadeTo: reaches the brightness asked for, darker or lighter, and leaves a colour that is already there alone', () => {
  for (const c of ['#434d6d', '#6b7896', '#a87894', '#6660b6']) {
    for (const want of [0.2, 0.35, 0.6]) assert.ok(Math.abs(brightness(shadeTo(c, want)) - want) < 0.02, `${c} to ${want}: ${brightness(shadeTo(c, want)).toFixed(3)}`);
  }
  assert.equal(shadeTo('#6b7896', brightness('#6b7896')), '#6b7896');
  assert.equal(shadeTo('#434d6d', 0.22), shadeTo('#434d6d', 0.22), 'the same every time');
});

// ---- the face of a wall ------------------------------------------------------------------------

test('drawBulkhead: the bands are counted from the foot, so the lower 21 rows of a tall face are the low face', () => {
  for (const style of BULKHEAD_STYLES) {
    const tall = face({ rows: 29, style, light: { on: GLOW }, bolts: 1, grime: 1 }), low = face({ rows: 21, style, light: { on: GLOW }, bolts: 1, grime: 1 });
    for (let y = 1; y < 21; y++) for (let x = 0; x < TILE; x++) assert.equal(at(tall.s, x, y + 8), at(low.s, x, y), `${style}: row ${y}, column ${x}`);
    assert.equal(tall.rows.pipe[0] - low.rows.pipe[0], 8);
    assert.equal(tall.rows.skirt[1], 28); assert.equal(low.rows.skirt[1], 20);
  }
});

test('drawBulkhead: draws nothing below its rows, a lit lip on the first row of the lower face, and a strip of light two rows under it', () => {
  const { s, rows } = face({ rows: 21, light: { on: GLOW } });
  for (let y = 21; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(at(s, x, y), 0, `nothing at ${x},${y}`);
  for (let x = 0; x < TILE; x++) assert.equal(at(s, x, rows.lip), col(TONES.lit));
  assert.equal(rows.strip, rows.lip + 2);
  assert.equal(count(s, GLOW), 24, 'two dashes of twelve px');
  assert.equal(count(face({ rows: 21 }).s, GLOW), 0, 'no light given, no strip');
  assert.equal(count(face({ rows: 21, light: { on: GLOW, off: OFF, dead: 1 } }).s, GLOW), 12, 'one dash is out');
});

test('drawBulkhead: bolts and grime add marks and never move the ones there; the three builds differ', () => {
  const bare = face({ rows: 29 }).s, bolted = face({ rows: 29, bolts: 1 }).s, half = face({ rows: 29, bolts: 0.5 }).s, dirty = face({ rows: 29, grime: 1 }).s, some = face({ rows: 29, grime: 0.4 }).s;
  const differs = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
  assert.ok(differs(bare, bolted) >= 16, 'eight bolts of four px (some pixels keep the wall colour)');
  assert.ok(differs(bare, half) > 0 && differs(bare, half) < differs(bare, bolted));
  for (let i = 0; i < bare.data.length; i++) if (half.data[i] !== bare.data[i]) assert.equal(half.data[i], bolted.data[i], 'a bolt of the half-bolted wall is a bolt of the fully bolted one');
  assert.ok(differs(bare, dirty) > differs(bare, some) && differs(bare, some) > 8);
  const [a, b, c] = BULKHEAD_STYLES.map((style) => face({ rows: 29, style }).s);
  assert.ok(differs(a, b) > 20 && differs(a, c) > 20 && differs(b, c) > 20);
  assert.throws(() => drawBulkhead(new Surface(TILE, TILE), { style: 'bricks', tones: TONES }), /not a wall build/);
});

test('drawBulkhead: as the face of a wall block it repeats across tiles (the last column leads into the first)', () => {
  const paint = patternFill(TONES.base, (s) => drawBulkhead(s, { rows: 29, tones: TONES, light: { on: GLOW }, grime: 1 }));
  const material = { fill: () => TONES.dark, face: { paint, shadow: OFF } };
  const a = new Surface(TILE, TILE), b = new Surface(TILE, TILE);
  drawBlock(a, 'bottom', material); drawBlock(b, 'bottom', material);
  assert.deepEqual([...a.data], [...b.data]);
  for (let x = 0; x < TILE; x++) assert.equal(at(a, x, 29), col('#231b33'), 'the base line');
  assert.equal(at(a, 0, 28), col(TONES.skirt), 'no dirt on the first column'); assert.equal(at(a, 31, 28), col(TONES.skirt), 'nor on the last');
});

// ---- doors -------------------------------------------------------------------------------------

const cover = (leaves, x, y, w, h, pick) => { let n = 0; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) n += leaves.filter((l) => l[pick](i + 0.5, j + 0.5)).length; return n; };

test('doorLeaves: shut, the leaves of every door tile the doorway exactly once', () => {
  for (const style of DOOR_STYLES) {
    const leaves = doorLeaves(style, 8, 14, 48, 32, 0, { teeth: 2 });
    for (let j = 14; j < 46; j++) for (let i = 8; i < 56; i++) assert.equal(leaves.filter((l) => l.rest(i + 0.5, j + 0.5)).length, 1, `${style}: ${i},${j}`);
    assert.equal(cover(leaves, 0, 0, 64, 48, 'seen'), 48 * 32, `${style}: nothing shows outside the doorway`);
    for (const l of leaves) { assert.equal(l.dx, 0); assert.equal(l.dy, 0); }
  }
  assert.deepEqual(doorLeaves('split', 0, 0, 8, 8).map((l) => l.name), ['left', 'right']);
  assert.deepEqual(doorLeaves('iris', 0, 0, 8, 8).map((l) => l.name), ['top', 'bottom', 'left', 'right']);
  assert.deepEqual(doorLeaves('shutter', 0, 0, 8, 8).map((l) => l.name), ['curtain']);
  assert.throws(() => doorLeaves('swing', 0, 0, 8, 8), /not a way a door opens/);
});

test('doorLeaves: opening uncovers more and more; fully open, only the stubs are left, and with no stub nothing', () => {
  for (const style of DOOR_STYLES) {
    let last = Infinity;
    for (const k of [0, 0.25, 0.5, 0.75, 1]) { const n = cover(doorLeaves(style, 8, 14, 48, 32, k), 8, 14, 48, 32, 'seen'); assert.ok(n < last, `${style} at ${k}: ${n} < ${last}`); last = n; }
    assert.ok(last > 0 && last < 48 * 32 * 0.15, `${style}: stubs only (${last})`);
    assert.equal(cover(doorLeaves(style, 8, 14, 48, 32, 1, { stub: 0 }), 8, 14, 48, 32, 'seen'), 0, `${style}: gone with no stub`);
  }
  const [l, r] = doorLeaves('split', 8, 14, 48, 32, 1);
  assert.equal(l.dx, -22); assert.equal(r.dx, 22); assert.equal(l.dy, 0);
  assert.equal(doorLeaves('shutter', 8, 14, 48, 32, 1)[0].dy, -30);
});

test('doorLeaves: teeth make the seam of a split door step from one side of the middle to the other', () => {
  const [l] = doorLeaves('split', 8, 14, 48, 32, 0, { teeth: 2, pitch: 16 });
  assert.equal(l.rest(33.5, 14.5), true, 'the first tooth reaches two px past the middle'); assert.equal(l.rest(34.5, 14.5), false);
  assert.equal(l.rest(29.5, 22.5), true); assert.equal(l.rest(30.5, 22.5), false, 'the next one stops two px short of it');
  const [flat] = doorLeaves('split', 8, 14, 48, 32, 0);
  assert.equal(flat.rest(31.5, 14.5), true); assert.equal(flat.rest(32.5, 22.5), false);
});

// ---- screens ------------------------------------------------------------------------------------

const lit = (kind, phase, w = 16, h = 9) => { const f = screenIn(kind, 4, 3, w, h, phase), out = []; for (let y = 0; y < h + 6; y++) for (let x = 0; x < w + 8; x++) if (f(x + 0.5, y + 0.5)) out.push(`${x},${y}`); return out; };

test('screenIn: every picture lights something and stays inside the screen', () => {
  for (const kind of SCREEN_PICTURES) {
    for (const [w, h] of [[16, 9], [8, 10], [14, 9]]) {
      const on = lit(kind, 0.3, w, h);
      assert.ok(on.length >= 6, `${kind} ${w}x${h}: ${on.length} px`);
      assert.ok(on.length < w * h * 0.8, `${kind}: not a filled box`);
      for (const k of on) { const [x, y] = k.split(',').map(Number); assert.ok(x >= 4 && x < 4 + w && y >= 3 && y < 3 + h, `${kind}: ${k} is outside`); }
    }
  }
  assert.throws(() => screenIn('logo', 0, 0, 8, 8), /not a screen picture/);
});

test('screenIn: text, graph and map move and their loops close; the skull and the tick stand still; all five differ', () => {
  for (const kind of ['text', 'graph', 'map']) {
    assert.notDeepEqual(lit(kind, 0), lit(kind, 0.5), `${kind} moves`);
    assert.deepEqual(lit(kind, 0), lit(kind, 1), `${kind}: the loop closes`);
  }
  for (const kind of ['skull', 'tick']) assert.deepEqual(lit(kind, 0), lit(kind, 0.5));
  const all = SCREEN_PICTURES.map((k) => lit(k, 0).join(' '));
  assert.equal(new Set(all).size, SCREEN_PICTURES.length);
  // the text climbs one row per eighth of the loop
  const rowsOf = (list) => [...new Set(list.map((k) => Number(k.split(',')[1])))];
  assert.notDeepEqual(rowsOf(lit('text', 0)), rowsOf(lit('text', 0.125)));
});

// the lit px of each row of a screen of text, top row first (0 for a row between two lines)
const textRows = (phase, w, h = 9) => { const f = screenIn('text', 0, 0, w, h, phase); return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (f(x + 0.5, y + 0.5) ? '#' : '.')).join('')); };

test('screenIn: the four lines of text differ in length on a screen of any width, the narrowest included', () => {
  for (const w of [8, 10, 14, 16, 24]) {
    const rows = textRows(0, w).filter((r) => r.includes('#'));
    const lengths = rows.slice(0, 4).map((r) => r.lastIndexOf('#') - r.indexOf('#') + 1);
    assert.equal(rows.length >= 4, true, `${w} px: four lines or more in nine rows`);
    assert.ok(new Set(lengths).size >= 3, `${w} px wide: lengths ${lengths.join(', ')}`);
    assert.ok(Math.max(...lengths) <= w - 2 && Math.min(...lengths) >= 2, `${w} px: ${lengths.join(', ')} keep a column free on each side`);
    assert.ok(new Set(rows.slice(0, 4)).size === 4, `${w} px: no two of the four lines are the same`);
  }
  assert.deepEqual(textRows(0, 8).slice(0, 8), ['.##.###.', '........', '.####...', '........', '.##.##..', '........', '.###....', '........']);
  // a line of five px or more is two words; a shorter one is one word, never two dots
  for (const w of [8, 14, 16]) for (const r of textRows(0, w).filter((x) => x.includes('#'))) {
    const words = r.split('.').filter(Boolean);
    assert.ok(words.length <= 2 && words.every((x) => x.length >= 2), `${w} px: "${r}"`);
  }
});

test('screenIn: text scrolls: from one eighth of the loop to the next the lines move up a row, and the top line gives way to the next', () => {
  for (const w of [8, 14, 16]) {
    for (let k = 0; k < 8; k++) {
      const a = textRows(k / 8, w), b = textRows((k + 1) / 8, w);
      assert.notDeepEqual(a, b, `${w} px, step ${k}`);
      assert.deepEqual(b.slice(0, 8), a.slice(1, 9), `${w} px, step ${k}: every row has moved up one`);
    }
    // so two frames apart the picture is not the same picture: other line lengths stand on the same rows
    assert.notDeepEqual(textRows(0, w), textRows(0.25, w));
    assert.deepEqual(textRows(0, w), textRows(1, w), 'the loop closes');
  }
});

// ---- the casing of a machine, and warning paint ----------------------------------------------------------

test('machineTones: six tones from one colour; the recess metal is darker by the drop asked for, never under the floor', () => {
  for (const c of ['#6b7896', '#434d6d', '#a87894', '#2f3059']) {
    const T = machineTones(c);
    assert.deepEqual(Object.keys(T), ['base', 'lit', 'soft', 'seam', 'dark', 'darkLit']);
    assert.equal(T.base, c);
    assert.equal(T.lit, textureLight(c)); assert.equal(T.soft, textureLight(c, c, 0.4)); assert.equal(T.seam, textureTone(c));
    assert.ok(brightness(T.lit) >= brightness(T.soft) && brightness(T.soft) > brightness(c) && brightness(T.seam) < brightness(c), c);
    assert.ok(Math.abs(brightness(T.dark) - Math.max(0.17, brightness(c) - 0.2)) < 0.02, `${c}: ${brightness(T.dark).toFixed(3)}`);
    assert.ok(brightness(T.darkLit) > brightness(T.dark));
    assert.deepEqual(machineTones(c), T, 'the same every time');
  }
  assert.ok(brightness(machineTones('#6b7896', { drop: 0.1 }).dark) > brightness(machineTones('#6b7896').dark));
  assert.ok(Math.abs(brightness(machineTones('#2f3059', { floor: 0.1 }).dark) - 0.1) < 0.02);
});

test('drawCasing: a lit top face over a front that is lit down its right edge and dark down its left; nothing outside the box', () => {
  const T = { base: '#6b7896', lit: '#c0d0e0', soft: '#8fa0b9', seam: '#424672' };
  const g = new Surface(24, 24);
  assert.equal(drawCasing(g, T, 4, 5, 10, 12, 3), g);
  assert.deepEqual(g.bounds(), { x0: 4, y0: 5, x1: 13, y1: 16 });
  for (let x = 4; x < 14; x++) { assert.equal(at(g, x, 5), col(T.lit), 'the far edge of the top face'); assert.equal(at(g, x, 6), col(T.soft)); assert.equal(at(g, x, 7), col(T.soft)); }
  for (let y = 8; y < 17; y++) { assert.equal(at(g, 4, y), col(T.seam)); assert.equal(at(g, 13, y), col(T.soft)); for (let x = 5; x < 13; x++) assert.equal(at(g, x, y), col(T.base)); }
  // top left out: two rows; top 0: a front alone
  const two = drawCasing(new Surface(24, 24), T, 4, 5, 10, 12);
  assert.equal(at(two, 6, 6), col(T.soft)); assert.equal(at(two, 6, 7), col(T.base));
  const none = drawCasing(new Surface(24, 24), T, 4, 5, 10, 12, 0);
  assert.equal(at(none, 6, 5), col(T.base)); assert.equal(at(none, 4, 5), col(T.seam)); assert.equal(at(none, 13, 5), col(T.soft));
  assert.equal(count(none, T.lit), 0);
});

test('hazardBand: a dark band with slanted stripes of the paint, half and half, that fills its box and nothing else', () => {
  const DARK = '#2f3059', PAINT = '#f0a030';
  const g = new Surface(40, 16);
  assert.equal(hazardBand(g, 3, 4, 32, 8, { dark: DARK, paint: PAINT, pitch: 8 }), g);
  assert.deepEqual(g.bounds(), { x0: 3, y0: 4, x1: 34, y1: 11 });
  assert.equal(count(g, PAINT) + count(g, DARK), 32 * 8);
  assert.equal(count(g, PAINT), 16 * 8, 'half of it is stripe');
  // the same picture as the shape test it is made of
  const stripes = stripesIn(rectIn(3, 4, 32, 8), { pitch: 8, slant: 1, duty: 0.5 });
  for (let y = 4; y < 12; y++) for (let x = 3; x < 35; x++) assert.equal(at(g, x, y), col(stripes(x + 0.5, y + 0.5) ? PAINT : DARK), `${x},${y}`);
  // the stripes lean: a row down, they have moved a px; the other slant mirrors that; phase slides them
  const row = (s, y) => Array.from({ length: 32 }, (_, i) => (at(s, 3 + i, y) === col(PAINT) ? '#' : '.')).join('');
  assert.equal(row(g, 5).slice(0, 31), row(g, 4).slice(1));
  const back = hazardBand(new Surface(40, 16), 3, 4, 32, 8, { dark: DARK, paint: PAINT, pitch: 8, slant: -1 });
  assert.equal(row(back, 4).slice(0, 31), row(back, 5).slice(1));
  assert.notEqual(row(hazardBand(new Surface(40, 16), 3, 4, 32, 8, { dark: DARK, paint: PAINT, pitch: 8, phase: 2 }), 4), row(g, 4));
  assert.equal(count(hazardBand(new Surface(40, 16), 3, 4, 32, 8, { dark: DARK, paint: PAINT }), PAINT), 16 * 8, 'pitch 4 by default');
});

// ---- fixtures on a wall's face: the decal place 'face' (engine/tiles.js) -----------------------------------

const WALLS = { 'floor-fill': {}, ...blockClips('wall', { kind: 'wall', narrow: true }), ...decoClips('wall', ['face', { place: 'face', label: 'Sign' }, 'on']), ...decoClips('floor', ['on']) };
const ROOM = [
  'WWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWW',
  'WW....................WW',
  'WW....WWWWWWWWWW......WW',
  'WW....................WW',
  'WW..WWWW......W.......WW',
  'WW..WWWW......W...W...WW',
  'WW..WWWW..............WW',
  'WW....................WW',
  'WWWWWWWWWWWWWWWWWWWWWWWW',
  'WWWWWWWWWWWWWWWWWWWWWWWW',
];

test("the decal place 'face': decoClips keeps it, classifyTiles reads it as an 'on' decal for face cells only, pickDecal keeps the two apart", () => {
  assert.equal(WALLS['wall-deco-a'].place, 'face'); assert.equal(WALLS['wall-deco-b'].label, 'Sign'); assert.equal(WALLS['wall-deco-c'].place, 'on');
  const T = classifyTiles(WALLS), wall = T.blocks.find((b) => b.prefix === 'wall');
  assert.deepEqual(wall.decals, [{ clip: 'wall-deco-a', prefix: 'wall', place: 'on', only: 'face' }, { clip: 'wall-deco-b', prefix: 'wall', place: 'on', only: 'face' }, { clip: 'wall-deco-c', prefix: 'wall', place: 'on' }]);
  assert.deepEqual(T.floors[0].decals, [{ clip: 'floor-deco-a', prefix: 'floor', place: 'on' }], 'other decals are as they were');
  const seen = { on: new Set(), face: new Set() };
  let n = 0;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const f = pickDecal(wall.decals, 'face', x, y), o = pickDecal(wall.decals, 'on', x, y, 1);
    if (f) { n++; seen.face.add(f); }
    seen.on.add(o);
  }
  assert.deepEqual([...seen.face].sort(), ['wall-deco-a', 'wall-deco-b']);
  assert.deepEqual([...seen.on], ['wall-deco-c'], "'on' never picks a face decal");
  assert.equal(DECAL_CHANCE.face, 0.33);
  assert.ok(Math.abs(n / 1600 - DECAL_CHANCE.face) < 0.06, `${n} of 1600`);
  assert.equal(pickDecal([{ clip: 'x-deco-a', place: 'face' }], 'face', 3, 3, 1), 'x-deco-a', 'a list written by hand may say place: face');
  assert.deepEqual([...FACE_PIECES].sort(), ['bottom', 'bottom-l', 'bottom-r', 'col-b', 'single', 'strip-l', 'strip-m', 'strip-r']);
  assert.ok(Object.isFrozen(FACE_PIECES));
});

test("layoutTiles scatters 'face' decals over the cells of a top-down wall that show its face, and nowhere else", () => {
  const L = layoutTiles(ROOM, WALLS, { view: 'top-down', decals: true });
  const pieceAt = (c, r) => { const t = L.tiles.find((x) => x.col === c && x.row === r && pieceOf(x.clip)?.kind === 'block' && pieceOf(x.clip).prefix === 'wall'); return t ? pieceOf(t.clip).piece : null; };
  const placed = L.tiles.filter((t) => /^wall-deco-/.test(t.clip));
  const faces = placed.filter((t) => t.clip !== 'wall-deco-c'), caps = placed.filter((t) => t.clip === 'wall-deco-c');
  assert.ok(faces.length >= 4 && faces.length <= 20, `${faces.length} fixtures on the faces: about one face cell in three`);
  for (const t of faces) assert.ok(FACE_PIECES.includes(pieceAt(t.col, t.row)), `${t.clip} at ${t.col},${t.row} is on ${pieceAt(t.col, t.row)}`);
  const more = layoutTiles(ROOM, WALLS, { view: 'top-down', decals: { face: 0.7 } }).tiles.filter((t) => /^wall-deco-[ab]$/.test(t.clip));
  assert.ok(more.length > faces.length && more.some((t) => t.clip === 'wall-deco-a') && more.some((t) => t.clip === 'wall-deco-b'), 'a higher chance gives more, and both are used');
  for (const t of more) assert.ok(FACE_PIECES.includes(pieceAt(t.col, t.row)), `${t.clip} at ${t.col},${t.row} is on ${pieceAt(t.col, t.row)}`);
  assert.ok(caps.length > 0, "the wall's 'on' decal still goes on its cap");
  for (const t of caps) assert.equal(pieceAt(t.col, t.row), 'fill', `${t.clip} at ${t.col},${t.row}`);
  for (const t of L.tiles.filter((x) => x.clip === 'floor-deco-a')) assert.equal(pieceAt(t.col, t.row), null, 'floor decals stay on the floor');
  // at most one decal to a cell, and the same map every time
  assert.equal(new Set(placed.map((t) => `${t.col},${t.row}`)).size, placed.length);
  assert.deepEqual(layoutTiles(ROOM, WALLS, { view: 'top-down', decals: true }).tiles, L.tiles);
  // a chance of 1 fills every face cell and no other; a chance of 0 none
  const all = layoutTiles(ROOM, WALLS, { view: 'top-down', decals: { face: 1, on: 0, floor: 0 } });
  const onFace = all.tiles.filter((t) => /^wall-deco-/.test(t.clip)).map((t) => `${t.col},${t.row}`).sort();
  const faceCells = [];
  for (let r = 0; r < ROOM.length; r++) for (let c = 0; c < ROOM[0].length; c++) if (FACE_PIECES.includes(pieceAt(c, r))) faceCells.push(`${c},${r}`);
  assert.deepEqual(onFace, faceCells.sort());
  assert.ok(faceCells.length >= 20);
  assert.equal(layoutTiles(ROOM, WALLS, { view: 'top-down', decals: { face: 0 } }).tiles.filter((t) => /^wall-deco-[ab]$/.test(t.clip)).length, 0);
  // not scattered at all without decals: true, and never in side view (a block's underside is no face)
  assert.equal(layoutTiles(ROOM, WALLS, { view: 'top-down' }).tiles.filter((t) => /-deco-/.test(t.clip)).length, 0);
  const side = layoutTiles(['....', '####', '####', '....'], { ...blockClips('wall', { kind: 'wall' }), ...decoClips('wall', ['face']) }, { decals: { face: 1 } });
  assert.equal(side.tiles.filter((t) => /-deco-/.test(t.clip)).length, 0);
});

test("layoutTiles: a 'face' decal written in a map is drawn on a face cell and left out, with a note, on a cell of the cap", () => {
  const rows = ['........', '.WWWWW..', '.WWaWW..', '.WbWWW..', '........', '......a.', '........'];
  const L = layoutTiles(rows, WALLS, { view: 'top-down' });
  const at = (c, r) => L.tiles.filter((t) => t.col === c && t.row === r).map((t) => t.clip);
  assert.deepEqual(at(2, 3), ['floor-fill', 'wall-bottom', 'wall-deco-b'], 'on the bottom row of the wall: its face');
  assert.deepEqual(at(6, 5), ['floor-fill', 'wall-single', 'wall-deco-a'], 'on its own on the floor: a piece of wall with a face under it');
  assert.deepEqual(at(3, 2), ['floor-fill', 'wall-fill'], 'in the middle of the cap: the cap, and no fixture');
  assert.equal(L.cells[2][3].solid, true); assert.equal(L.cells[5][6].solid, true);
  assert.deepEqual(L.notes, ["wall-deco-a at 3,2: it goes on a wall's front face, and this cell of the wall (fill) shows none"]);
  // an 'on' decal of the same wall is drawn wherever it is written, as before
  const on = layoutTiles(['.....', '.WWW.', '.WcW.', '.WWW.', '.....'], WALLS, { view: 'top-down' });
  assert.ok(on.tiles.some((t) => t.clip === 'wall-deco-c' && t.col === 2 && t.row === 2)); assert.deepEqual(on.notes, []);
});

test("the station walls: every fixture is a 'face' decal, and a room built from letters puts them on face cells only", async () => {
  const walls = (await codeSprite('tiles-station-walls')), floor = (await codeSprite('tiles-station-floor'));
  for (const k of ['a', 'b', 'c', 'd']) assert.equal(walls.clips[`wall-deco-${k}`].place, 'face');
  const T = classifyTiles([{ key: 'walls', clips: walls.clips }, { key: 'floor', clips: floor.clips }]);
  const L = layoutTiles(ROOM, T, { view: 'top-down', decals: true });
  const pieceAt = (c, r) => { const t = L.tiles.find((x) => x.col === c && x.row === r && /^wall-/.test(x.clip) && pieceOf(x.clip)?.kind === 'block'); return t ? pieceOf(t.clip).piece : null; };
  const fixtures = L.tiles.filter((t) => /^wall-deco-/.test(t.clip));
  assert.ok(fixtures.length >= 4, `${fixtures.length} fixtures`);
  for (const t of fixtures) assert.ok(FACE_PIECES.includes(pieceAt(t.col, t.row)), `${t.clip} at ${t.col},${t.row} is on ${pieceAt(t.col, t.row)}`);
});

// ---- the beam -------------------------------------------------------------------------------------

const C = ['#ffffff', '#ffb0a0', '#f07060', '#e2473f', '#901030'];
const beam = (o) => { const g = new Surface(48, 16); const n = laserBeam(g, { x0: 4, x1: 43, y: 8, colours: C, ...o }); return { g, n }; };

test('laserBeam: a white core between rows of its colour, with a dark rim from five px up; one px is a pale line', () => {
  const column = (g) => Array.from({ length: 16 }, (_, y) => at(g, 20, y)).filter(Boolean);
  assert.deepEqual(column(beam({ thick: 1 }).g), [col(C[1])]);
  assert.deepEqual(column(beam({ thick: 3 }).g), [C[3], C[0], C[3]].map(col));
  assert.deepEqual(column(beam({ thick: 5 }).g), [C[4], C[3], C[0], C[3], C[4]].map(col));
  assert.deepEqual(column(beam({ thick: 7 }).g), [C[4], C[3], C[1], C[0], C[1], C[3], C[4]].map(col));
  const { g, n } = beam({ thick: 3 });
  assert.equal(n, 40 * 3);
  assert.deepEqual(g.bounds(), { x0: 4, y0: 7, x1: 43, y1: 9 });
});

test('laserBeam: cut breaks it away piece by piece until nothing is left; phase slides the breaks', () => {
  let last = Infinity;
  for (const cut of [0, 0.3, 0.6, 0.9]) { const { n } = beam({ thick: 1, cut }); assert.ok(n <= last, `cut ${cut}`); last = n; }
  assert.ok(beam({ thick: 1, cut: 0.5 }).n > 0 && beam({ thick: 1, cut: 0.5 }).n < 40);
  assert.equal(beam({ thick: 5, cut: 1 }).n, 0);
  assert.equal(count(beam({ thick: 5, cut: 1 }).g, C[0]), 0);
  assert.notDeepEqual([...beam({ thick: 1, cut: 0.5, phase: 0 }).g.data], [...beam({ thick: 1, cut: 0.5, phase: 0.5 }).g.data]);
  assert.deepEqual([...beam({ thick: 1, cut: 0.5, seed: 2 }).g.data], [...beam({ thick: 1, cut: 0.5, seed: 2 }).g.data], 'the same every time');
});
