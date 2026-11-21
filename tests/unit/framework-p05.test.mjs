// Framework additions made with batch P05 (platformer tilesets: cave rock, water and waterfalls):
//   engine/tiles.js  textureLight  the tone for light marks inside a fill that no whole-bundle look turns into the fill
//   engine/tiles.js  liquidClips   the clip entries of a liquid: its surface and its body, animated
//   engine/tiles.js  pickLiquid    which piece of a liquid goes in a cell: the surface or the body
//   engine/tiles.js  liquidLine    the row of a liquid's surface line at a column
//   engine/tiles.js  drawLiquid    one piece of a liquid, drawn so that it joins its neighbours on every frame
//   engine/tiles.js  lipMarks      a lit lip beside every mark of one colour in a tile pattern
//   engine/surface.js  polyline    a connected line one pixel wide through a list of points (creases, cracks, seams)
//   engine/tiles.js  fillBehind    which version of the fill lies behind an edge piece, so sides and undersides do not all repeat version 0
//   engine/tiles.js  liquidMarks   a liquid's body with marks that move in it (streaks, patches, bubbles, glints), as a fill for one frame
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE, textureTone, textureLight, liquidClips, liquidLine, drawLiquid, patternFill, classifyTiles, fillBehind, liquidMarks, drawBlock, BLOCK_PIECES, NARROW_PIECES, blockJoins } from '../../engine/tiles.js';
import { Surface, polyline } from '../../engine/surface.js';
import { col, brightness, ramp } from '../../engine/color.js';
import { THEME_PRESETS, applyColour } from '../../engine/theme.js';
import { seamCheck } from '../../quality/sprite.js';

const SLATE = '#5d6475', CAVERN = '#3f5068', WATER = '#3f9fd1', STONE = '#8f97a8', MOSS = '#a4c44a', EMBER = '#e08a2c';
const apart = (a, b) => THEME_PRESETS.every((look) => { const to = applyColour(Uint32Array.from([col(a), col(b)]), look.theme.colour); return to[0] !== to[1]; });
const column = (g, x) => Array.from({ length: TILE }, (_, y) => g.get(x, y));
const row = (g, y) => Array.from({ length: TILE }, (_, x) => g.get(x, y));
const firstDrawn = (l) => { const i = l.findIndex((v) => v !== 0); return i < 0 ? l.length : i; };
const FRAMES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];

// ---- textureLight ------------------------------------------------------------------

test('textureLight: lighter than the fill, and no whole-bundle look turns it into the fill', () => {
  for (const c of [SLATE, CAVERN, WATER, STONE, MOSS, EMBER]) {
    const light = textureLight(c);
    assert.match(light, /^#[0-9a-f]{6}$/);
    assert.ok(brightness(light) > brightness(c), `${c}: ${light} is not lighter`);
    assert.ok(apart(c, light), `${c}: ${light} turns into the fill under some look`);
    assert.notEqual(light, textureTone(c), `${c}: the light mark and the dark mark are one colour`);
  }
});

test('textureLight: starts at the light of the ramp, or softer when asked, and is the same every time', () => {
  assert.equal(textureLight(WATER), ramp(WATER).light);                 // the ramp's light survives every look on water
  assert.equal(textureLight(SLATE), textureLight(SLATE));
  for (const c of [SLATE, WATER, STONE]) {
    const soft = textureLight(c, c, 0.5), full = textureLight(c);
    assert.ok(brightness(soft) > brightness(c) && brightness(soft) <= brightness(full), `${c}: soft ${soft}, full ${full}`);
    assert.ok(apart(c, soft), `${c}: the soft tone ${soft} turns into the fill under some look`);
  }
});

test('liquidClips: a surface and a body, animated, with other versions of the body when asked', () => {
  const clips = liquidClips('water');
  assert.deepEqual(Object.keys(clips), ['water-top', 'water-fill']);
  for (const c of Object.values(clips)) { assert.equal(c.frames, 8); assert.equal(c.loop, true); assert.equal(typeof c.label, 'string'); }
  const fps = (p) => 6 * p.speed;
  const three = liquidClips('lava', { fills: 3, frames: 4, fps, label: 'Lava' });
  assert.deepEqual(Object.keys(three), ['lava-top', 'lava-fill', 'lava-fill-b', 'lava-fill-c']);
  for (const c of Object.values(three)) { assert.equal(c.frames, 4); assert.equal(c.fps, fps); assert.ok(c.label.startsWith('Lava: ')); }
  assert.equal(new Set(Object.values(three).map((c) => c.label)).size, 4);
});

test('liquidClips: the classifier reads them as one block with a top and its fills', () => {
  const sets = classifyTiles(liquidClips('water', { fills: 3 }));
  assert.equal(sets.blocks.length, 1);
  assert.equal(sets.blocks[0].pieces.top, 'water-top');
  assert.deepEqual(sets.blocks[0].fills, ['water-fill', 'water-fill-b', 'water-fill-c']);
});

// a pool whose crests travel sideways at an awkward speed, with a foam line and a lighter band under it
const BODY = ['#3f9fd1', '#0f56b0', '#73e9f8'];
const pool = (over = {}) => ({
  level: 6,
  body: (x, y, t, v) => (v && x > 3 && x < 28 && y > 3 && y < 28 && (x + y * 3 + v * 5) % 11 === 0 ? BODY[v] : BODY[0]),
  rise: (u, t) => 2 + 2 * Math.sin((Math.PI * 2 * (u + 3)) / 32 * 3 - Math.PI * 2 * t + 0.4),
  surface: (d) => (d === 0 ? '#f0ead8' : d === 1 ? '#73e9f8' : null),
  ...over,
});
const piece = (name, liquid, t = 0) => drawLiquid(new Surface(TILE, TILE), name, liquid, t);

test('drawLiquid: the body is opaque and is the liquid\'s own colours, version by version', () => {
  const L = pool();
  for (const [name, v] of [['fill', 0], ['fill-b', 1], ['fill-c', 2], ['water-fill-b', 1]]) {
    const g = piece(name, L, 0.25);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) assert.equal(g.get(x, y), col(L.body(x, y, 0.25, v)), `${name} at ${x},${y}`);
  }
});

test('drawLiquid: the surface is see-through above its line, then the surface colours, then the body', () => {
  const L = pool();
  for (const t of FRAMES) {
    const g = piece('top', L, t);
    for (let x = 0; x < TILE; x++) {
      const c = column(g, x), line = liquidLine(L, x, t);
      assert.equal(firstDrawn(c), line, `column ${x}, t ${t}`);
      assert.ok(line >= 2 && line <= 6, `the wave keeps to its 4 px (column ${x}: row ${line})`);
      assert.equal(c[line], col('#f0ead8'));
      assert.equal(c[line + 1], col('#73e9f8'));
      for (let y = line + 2; y < TILE; y++) assert.equal(c[y], col(L.body(x, y, t, 0)), `body at ${x},${y}`);
    }
  }
});

test('drawLiquid: a travelling wave meets itself exactly across a tile boundary on every frame, and sits on its body', () => {
  const L = pool();
  let moved = 0;
  for (const t of FRAMES) {
    const top = piece('water-top', L, t), fill = piece('water-fill', L, t);
    assert.equal(seamCheck(top, top, 'x').breaks, 0, `outline gap at t ${t}`);
    assert.equal(liquidLine(L, 31, t), liquidLine(L, 32, t));
    assert.equal(liquidLine(L, -1, t), liquidLine(L, 0, t));
    assert.deepEqual(row(top, TILE - 1), row(fill, TILE - 1), `the surface piece ends on the body's own row at t ${t}`);
    if (t && liquidLine(L, 8, t) !== liquidLine(L, 8, 0)) moved++;
  }
  assert.ok(moved >= 3, 'the surface moves through the clip');
});

test('drawLiquid: a still liquid with no surface colours is a flat line at its level (default row 6)', () => {
  const g = piece('top', { body: () => '#3f9fd1' });
  for (let x = 0; x < TILE; x++) assert.equal(firstDrawn(column(g, x)), 6);
  const deep = { body: () => '#3f9fd1', level: 12, rise: () => 40 };
  assert.equal(liquidLine({ body: () => '#3f9fd1', level: 12 }, 5), 12);
  assert.equal(liquidLine(deep, 5), 0, 'a rise past the top of the tile stops at row 0');
  assert.equal(liquidLine({ ...deep, rise: () => -40 }, 5), TILE - 1, 'and a trough stops at the last row');
});

const drawn = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) out.push(`${x},${y}`); return out; };

test('polyline: one pixel wide through every point in turn, in the one colour, and nothing else', () => {
  const g = new Surface(12, 12);
  assert.equal(polyline(g, [[2, 2], [6, 2], [6, 5]], '#3c3e57'), g);
  assert.deepEqual(drawn(g), ['2,2', '3,2', '4,2', '5,2', '6,2', '6,3', '6,4', '6,5']);
  for (const at of drawn(g)) { const [x, y] = at.split(',').map(Number); assert.equal(g.get(x, y), col('#3c3e57')); }
});

test('polyline: the same pixels as a line drawn from each point to the next (a kinked crease)', () => {
  const pts = [[0, 10], [1, 10], [7, 13], [12, 8], [19, 1], [19, 0]];
  const a = polyline(new Surface(TILE, TILE), pts, '#3c3e57'), b = new Surface(TILE, TILE);
  for (let i = 1; i < pts.length; i++) b.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], '#3c3e57');
  assert.deepEqual([...a.data], [...b.data]);
  assert.ok(drawn(a).length >= 20);
});

test('polyline: closed joins the last point back to the first; one point is one pixel; no points draw nothing', () => {
  const open = polyline(new Surface(12, 12), [[2, 2], [8, 2], [8, 8]], '#ffffff');
  const shut = polyline(new Surface(12, 12), [[2, 2], [8, 2], [8, 8]], '#ffffff', { closed: true });
  assert.equal(open.get(5, 5), 0);
  assert.equal(shut.get(5, 5), col('#ffffff'), 'the closing side runs back along the diagonal');
  assert.ok(drawn(shut).length > drawn(open).length);
  assert.deepEqual(drawn(polyline(new Surface(8, 8), [[3, 4]], '#ffffff')), ['3,4']);
  assert.deepEqual(drawn(polyline(new Surface(8, 8), [], '#ffffff')), []);
});

// ---- fillBehind (engine/tiles.js) --------------------------------------------------------

test('fillBehind: the top row and the fill itself keep version 0; other pieces get a fixed version the fill has', () => {
  for (const piece of ['top', 'left', 'right', 'fill', 'strip-l', 'strip-m', 'strip-r', 'col-t', 'single']) assert.equal(fillBehind(piece, 3), 0, piece);
  for (const n of [1, 2, 3, 5]) for (const piece of [...BLOCK_PIECES, ...NARROW_PIECES]) {
    const v = fillBehind(piece, n);
    assert.ok(Number.isInteger(v) && v >= 0 && v < n, `${piece} of ${n}: ${v}`);
    assert.equal(v, fillBehind(piece, n), 'the same every time');
    if (n === 1) assert.equal(v, 0);
  }
  const used = new Set(['side-l', 'side-r', 'bottom', 'bottom-l', 'bottom-r', 'inner-tl', 'inner-tr', 'inner-bl', 'inner-br', 'col-m', 'col-b'].map((piece) => fillBehind(piece, 3)));
  assert.deepEqual([...used].sort(), [1, 2], 'with three versions the sides and undersides share out the other two');
  assert.notEqual(fillBehind('side-l', 3), fillBehind('side-r', 3));
  assert.equal(fillBehind('side-l'), fillBehind('side-l', 3), 'three versions when not told');
});

test('fillBehind: takes a whole clip name, and anything that is not an edge piece of a block gets 0', () => {
  assert.equal(fillBehind('rock-side-l', 3), fillBehind('side-l', 3));
  assert.equal(fillBehind('rock-bottom', 3), fillBehind('bottom', 3));
  for (const other of ['rock-thin-m', 'rock-slope-up', 'rock-deco-a', 'rock-fill-b', 'fill-c', 'window', '']) assert.equal(fillBehind(other, 3), 0, other);
});

test('fillBehind: pieces drawn over the version it names still join every neighbour, as long as versions share their edge lines', () => {
  const BASE = '#5d6475', MARK = '#3c3e57';
  // three versions with the same lines on the tile's edges (a crease that leaves at row 10 and column 19) and other marks inside
  const versions = [[8, 8], [14, 20], [22, 12]].map(([x, y]) => patternFill(BASE, (s) => { s.line(0, 10, 3, 10, MARK); s.line(28, 10, 31, 10, MARK); s.line(19, 0, 19, 2, MARK); s.line(19, 29, 19, 31, MARK); s.rect(x, y, 5, 4, MARK); }));
  const material = (piece) => ({ fill: (x, y, t, v) => versions[v || fillBehind(piece, 3)](x, y), top: { depth: 3, paint: () => '#818b98' }, bottom: { depth: 2, paint: () => '#494d60' }, left: { depth: 1, paint: () => '#494d60' }, right: { depth: 1, paint: () => '#818b98' } });
  const draw = (piece) => drawBlock(new Surface(TILE, TILE), piece, material(piece));
  let differs = 0;
  for (const [a, axis, b] of blockJoins({ narrow: true })) {
    const A = draw(a), B = draw(b);
    assert.equal(seamCheck(A, B, axis).breaks, 0, `${a} ${axis} ${b}`);
    // the two lines that touch are the same as with version 0 behind both: the versions differ only inside
    const A0 = drawBlock(new Surface(TILE, TILE), a, material('fill')), B0 = drawBlock(new Surface(TILE, TILE), b, material('fill'));
    if (axis === 'x') { assert.deepEqual(column(A, TILE - 1), column(A0, TILE - 1)); assert.deepEqual(column(B, 0), column(B0, 0)); }
    else { assert.deepEqual(row(A, TILE - 1), row(A0, TILE - 1)); assert.deepEqual(row(B, 0), row(B0, 0)); }
    if ([...A.data].some((v, i) => v !== A0.data[i])) differs++;
  }
  assert.ok(differs > 0, 'some pieces do show another version');
});

// ---- liquidMarks (fix round 2) -------------------------------------------------------

// every pixel of a fill, as one list; and where it differs from the body colour
const pixelsOf = (fill) => { const out = []; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) out.push(fill(x, y)); return out; };
const marked = (fill, base) => { const out = []; for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (fill(x, y) !== col(base)) out.push([x, y]); return out; };
const LIGHT = '#8fd0f0', DARK = '#2a6a96', FOAM = '#f0ead8';
const TONES = { light: LIGHT, dark: DARK };
const KINDS = {
  dash: [['dash', 'light', 6, 13, 7, 0], ['dash', 'dark', 18, 11, 5, 0.7]],
  blob: [['blob', 'light', 9, 14, 5, 0], ['blob', 'light', 22, 23, 4, 0.55]],
  bubble: [['bubble', 'light', 22, 27, 2, 0.1], ['bubble', 'light', 13, 24, 1, 0.6]],
};

test('liquidMarks: each kind of mark draws the same pixels at t = 0 and t = 1 (the loop closes) and moves in between', () => {
  for (const [kind, marks] of Object.entries(KINDS)) for (const stir of [1, 2, 3]) {
    const at = (t) => pixelsOf(liquidMarks(WATER, marks, t, { tones: TONES, stir }));
    assert.deepEqual(at(1), at(0), `${kind}, stir ${stir}: t = 1 is not t = 0`);
    assert.deepEqual(at(2.375), at(0.375), `${kind}, stir ${stir}: not periodic in t`);
    const frames = FRAMES.map((t) => at(t).join());
    assert.ok(new Set(frames).size >= 3, `${kind}, stir ${stir}: only ${new Set(frames).size} different frames in 8`);
    assert.ok(FRAMES.every((t) => marked(liquidMarks(WATER, marks, t, { tones: TONES, stir }), WATER).length > 0 || kind === 'bubble'), `${kind}: a frame with no mark`);
  }
  // glints flash and go out, and come round too
  const glints = [[10, 9, 0, 2], [22, 23, 0.3, 1]];
  const at = (t) => pixelsOf(liquidMarks(WATER, [], t, { glints, glint: FOAM }));
  assert.deepEqual(at(1), at(0));
  assert.ok(new Set(FRAMES.map((t) => at(t).join())).size >= 4);
});

test('liquidMarks: every mark keeps 3 px or more from the tile edges on every frame, wherever it is put', () => {
  // marks put in the corners and against the edges on purpose
  const marks = [
    ['dash', 'light', 0, 0, 7, 0], ['dash', 'dark', 30, 31, 9, 0.4], ['dash', 'dark', 27, 16, 6, 0.8],
    ['blob', 'light', 1, 30, 6, 0.2], ['blob', 'light', 31, 1, 5, 0.7],
    ['bubble', 'light', 0, 31, 2, 0.1], ['bubble', 'light', 31, 30, 3, 0.6],
  ];
  const glints = [[0, 0, 0, 2], [31, 31, 0.5, 2], [1, 30, 0.25, 1]];
  let seen = 0;
  for (const stir of [1, 2, 3]) for (let i = 0; i <= 16; i++) {
    const fill = liquidMarks(WATER, marks, i / 16, { tones: TONES, stir, glints, glint: FOAM });
    for (const [x, y] of marked(fill, WATER)) { seen++; assert.ok(x >= 3 && x <= 28 && y >= 3 && y <= 28, `stir ${stir}, t ${i / 16}: a mark at ${x},${y}`); }
  }
  assert.ok(seen > 500, 'the marks were drawn');
  // a wider margin is kept too
  for (let i = 0; i < 8; i++) for (const [x, y] of marked(liquidMarks(WATER, marks, i / 8, { tones: TONES, stir: 3, glints, margin: 6 }), WATER)) assert.ok(x >= 6 && x <= 25 && y >= 6 && y <= 25, `margin 6: a mark at ${x},${y}`);
});

test('liquidMarks: the body colour everywhere else, tones by name or as a colour, and no marks at all is the plain body', () => {
  assert.ok(pixelsOf(liquidMarks(WATER, [], 0.3)).every((v) => v === col(WATER)));
  assert.ok(pixelsOf(liquidMarks(WATER, undefined, 0.3)).every((v) => v === col(WATER)));
  const fill = liquidMarks(WATER, [['dash', 'light', 6, 13, 7, 0], ['dash', '#123456', 8, 23, 6, 0]], 0, { tones: TONES });
  const colours = new Set(pixelsOf(fill));
  assert.deepEqual([...colours].sort(), [col(WATER), col(LIGHT), col('#123456')].sort());
  assert.throws(() => liquidMarks(WATER, [['dash', 'nosuchtone', 6, 13, 7, 0]], 0, { tones: TONES }), /nosuchtone/);
  assert.throws(() => liquidMarks(WATER, [['swirl', 'light', 6, 13, 7, 0]], 0, { tones: TONES }), /swirl/);
  // the same arguments, the same pixels
  assert.deepEqual(pixelsOf(liquidMarks(WATER, KINDS.blob, 0.4, { tones: TONES, stir: 2 })), pixelsOf(liquidMarks(WATER, KINDS.blob, 0.4, { tones: TONES, stir: 2 })));
});

test('liquidMarks: a dash is one row, `size` px long give or take one, and slides further with more stir', () => {
  const span = (stir) => {
    let lo = 99, hi = -1;
    for (let i = 0; i < 16; i++) {
      const px = marked(liquidMarks(WATER, [['dash', 'light', 12, 13, 7, 0]], i / 16, { tones: TONES, stir }), WATER);
      assert.ok(px.every(([, y]) => y === 13), 'a dash leaves its row');
      assert.ok(px.length >= 6 && px.length <= 8, `a dash of 7 is ${px.length} px long`);
      const xs = px.map(([x]) => x);
      assert.equal(Math.max(...xs) - Math.min(...xs) + 1, px.length, 'a dash has a gap in it');
      lo = Math.min(lo, xs[0]); hi = Math.max(hi, xs[0]);
    }
    return hi - lo;
  };
  assert.equal(span(1), 2);
  assert.equal(span(3), 6);
});

test('liquidMarks: a blob swells and shrinks in place; a bubble rises from its row and is gone once it reaches the top row', () => {
  const sizes = FRAMES.map((t) => marked(liquidMarks(WATER, [['blob', 'light', 15, 15, 6, 0]], t, { tones: TONES, stir: 3 }), WATER).length);
  assert.ok(Math.max(...sizes) > Math.min(...sizes) + 6, `a blob's size over the clip: ${sizes}`);
  for (const t of FRAMES) {
    const px = marked(liquidMarks(WATER, [['blob', 'light', 15, 15, 6, 0]], t, { tones: TONES, stir: 3 }), WATER);
    const mx = px.reduce((s, [x]) => s + x, 0) / px.length, my = px.reduce((s, [, y]) => s + y, 0) / px.length;
    assert.ok(Math.abs(mx - 15) <= 1 && Math.abs(my - 15) <= 1, `a blob wandered to ${mx},${my}`);
  }
  const rows = [];
  for (let i = 0; i < 200; i++) {
    const px = marked(liquidMarks(WATER, [['bubble', 'light', 20, 26, 2, 0]], i / 200, { tones: TONES, top: 8 }), WATER);
    assert.ok(px.length === 0 || px.length === 4, 'a bubble of 2 is 2 by 2, or gone');
    rows.push(px.length ? Math.min(...px.map(([, y]) => y)) : null);
  }
  assert.equal(rows[0], 26);
  const seenRows = rows.filter((r) => r !== null);
  assert.ok(seenRows.every((r, i) => i === 0 || r <= seenRows[i - 1]), 'a bubble sank');
  assert.equal(Math.min(...seenRows), 8, 'a bubble bursts at its top row');
  assert.equal(rows.at(-1), null, 'a burst bubble is gone until the clip comes round');
  assert.ok(rows.indexOf(null) > 150 && rows.slice(rows.indexOf(null)).every((r) => r === null), 'it is there for most of the clip, then stays gone');
});

test('liquidMarks: marks given another `when` are out of step; a glint flashes once a clip in its colour with a white heart', () => {
  const a = FRAMES.map((t) => marked(liquidMarks(WATER, [['dash', 'light', 12, 13, 7, 0]], t, { tones: TONES, stir: 3 }), WATER)[0][0]);
  const b = FRAMES.map((t) => marked(liquidMarks(WATER, [['dash', 'light', 12, 13, 7, 0.5]], t, { tones: TONES, stir: 3 }), WATER)[0][0]);
  assert.notDeepEqual(a, b);
  assert.deepEqual(b.slice(4).concat(b.slice(0, 4)), a);                 // half a clip later, exactly
  const counts = FRAMES.map((t) => marked(liquidMarks(WATER, [], t, { glints: [[16, 16, 0.25, 2]], glint: FOAM }), WATER).length);
  assert.deepEqual(counts, [0, 1, 9, 5, 1, 0, 0, 0]);                    // a pixel, the big flash, a plus, a pixel, then dark
  const flash = liquidMarks(WATER, [], 0.25, { glints: [[16, 16, 0.25, 2]], glint: FOAM });
  assert.equal(flash(16, 16), col('#ffffff'));
  assert.equal(flash(18, 16), col(FOAM));
  assert.equal(flash(16, 14), col(FOAM));
});

test('liquidMarks: as the body of a liquid it is opaque and joins itself on every side on every frame', () => {
  for (const t of FRAMES) {
    const made = [];
    const body = (x, y, tt, v) => (made[v] ??= liquidMarks(WATER, KINDS[['dash', 'blob', 'bubble'][v]], t, { tones: TONES, stir: 3, glints: [[10, 9, 0, 2]], glint: FOAM }))(x, y);
    const tiles = ['fill', 'fill-b', 'fill-c'].map((piece) => drawLiquid(new Surface(TILE, TILE), piece, { body }, t));
    for (const g of tiles) {
      assert.ok(g.data.every((v) => v !== 0), 'a hole in the body');
      for (const line of [row(g, 0), row(g, 31), column(g, 0), column(g, 31)]) assert.ok(line.every((v) => v === col(WATER)), 'a mark on the edge of the tile');
    }
  }
});
