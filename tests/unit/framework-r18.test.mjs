// Framework additions made with batch R18 (RPG battle effects: slash, fire, ice, thunder, heal):
//   engine/spells.js  crescent              a crescent cut along an arc, shown in part so it can sweep in and thin away
//                     boltPath, bolt        a lightning path and the bolt drawn along it, with forks
//                     CRYSTAL_SHAPES, crystal   a faceted ice crystal standing on its foot
//                     snowflake             a six-armed flake
//                     MOTE_SHAPES, moteIn, motes   small shaped lights that rise in a column and fade
//                     swirl                 sparks that spiral in to a point (or out of one)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { steps } from '../../engine/fx.js';
import { crescent, boltPath, bolt, CRYSTAL_SHAPES, crystal, snowflake, MOTE_SHAPES, moteIn, motes, swirl } from '../../engine/spells.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const colours = (g) => { const s = new Set(g.data); s.delete(0); return s; };
const inBorder = (g, name) => { const b = g.bounds(); assert.ok(b, `${name} draws something`); assert.ok(b.x0 >= 1 && b.y0 >= 1 && b.x1 <= g.w - 2 && b.y1 <= g.h - 2, `${name} stays inside the 1 px border (${b.x0},${b.y0}..${b.x1},${b.y1})`); return b; };
const C = steps('#7aa0f4', { core: '#f0ead8', white: false });           // [core, middle, edge, rim]
const draw = (w, h, fn) => { const g = new Surface(w, h); fn(g); return g; };

// ---- crescent -------------------------------------------------------------------------------

const cut = (o = {}) => draw(64, 64, (g) => crescent(g, { x0: 48, y0: 12, x1: 16, y1: 52, bulge: 8, width: 7, colours: C, ...o }));

test('crescent: a cut from end to end, nested colours, inside the border', () => {
  const g = cut(), b = inBorder(g, 'crescent');
  assert.ok(b.x1 - b.x0 >= 28 && b.y1 - b.y0 >= 34, 'it spans the two ends');
  assert.deepEqual([...colours(g)].sort(), C.map(col).sort(), 'all four colours are used where it is fat');
  assert.equal(g.get(48, 12) !== 0 || g.get(47, 12) !== 0 || g.get(47, 13) !== 0, true, 'it starts at the first point');
});

test('crescent: from and to show part of the sweep, and the head point follows `to`', () => {
  const whole = cut(), headHalf = cut({ to: 0.5 }), tailGone = cut({ from: 0.5 });
  assert.ok(lit(headHalf) < lit(whole) * 0.75 && lit(tailGone) < lit(whole) * 0.75);
  assert.ok(headHalf.bounds().y1 < 40, 'the first half of a downward cut stays in the upper part');
  assert.ok(tailGone.bounds().y0 > 22, 'with the tail gone only the lower part is left');
  const g = new Surface(64, 64);
  const end = crescent(g, { x0: 48, y0: 12, x1: 16, y1: 52, bulge: 8, width: 7, colours: C });
  assert.ok(Math.abs(end[0] - 16) < 0.01 && Math.abs(end[1] - 52) < 0.01, 'a whole cut ends on the second point');
  const mid = crescent(g, { x0: 48, y0: 12, x1: 16, y1: 52, bulge: 8, width: 7, to: 0.5, colours: C });
  assert.ok(mid[0] > 20 && mid[0] < 46 && mid[1] > 18 && mid[1] < 46, 'half a cut ends about half way');
  assert.equal(lit(cut({ from: 0.6, to: 0.6 })), 0, 'nothing to show draws nothing');
});

test('crescent: the bulge chooses the side it bows to; near zero it is a straight streak', () => {
  // travelling down and to the left, a positive bulge bows to the lower right, a negative one to the upper left
  const centre = (g) => { let sx = 0, sy = 0, n = 0; g.data.forEach((v, i) => { if (v) { sx += i % g.w; sy += Math.floor(i / g.w); n++; } }); return [sx / n, sy / n]; };
  const [ax, ay] = centre(cut({ bulge: 10 })), [bx, by] = centre(cut({ bulge: -10 }));
  assert.ok(ax > bx + 4 && ay > by + 4, `the two bow to opposite sides (${ax.toFixed(1)},${ay.toFixed(1)} against ${bx.toFixed(1)},${by.toFixed(1)})`);
  const flat = cut({ bulge: 0, width: 3 }), b = flat.bounds();
  assert.ok(lit(flat) > 60 && b.x1 - b.x0 >= 28, 'a straight cut still reaches from end to end');
});

test('crescent: jag roughens the edge, one colour draws no rim, and a thin cut is unbroken', () => {
  assert.ok(diff(cut(), cut({ jag: 2 })) > 30, 'saw-teeth change the outline');
  const one = cut({ colours: ['#ffffff'] });
  assert.deepEqual([...colours(one)], [col('#ffffff')]);
  // a hairline: every row between its ends has a pixel
  const thin = cut({ width: 0.4, colours: ['#ffffff'] }), b = thin.bounds();
  for (let y = b.y0; y <= b.y1; y++) { let any = false; for (let x = 0; x < 64; x++) if (thin.get(x, y)) any = true; assert.ok(any, `row ${y} of a hairline cut is drawn`); }
});

// ---- lightning ------------------------------------------------------------------------------

test('boltPath: starts and ends on its two points, the same every time, and mirrors', () => {
  const a = boltPath(32, 2, 30, 89, { kinks: 7, zigzag: 4, sway: 6, seed: 3 });
  assert.equal(a.length, 9);
  assert.deepEqual(a[0], [32, 2]); assert.deepEqual(a.at(-1), [30, 89]);
  assert.deepEqual(a, boltPath(32, 2, 30, 89, { kinks: 7, zigzag: 4, sway: 6, seed: 3 }));
  assert.notDeepEqual(a, boltPath(32, 2, 30, 89, { kinks: 7, zigzag: 4, sway: 6, seed: 4 }));
  for (let i = 1; i < a.length; i++) assert.ok(a[i][1] > a[i - 1][1], 'it keeps going down');
  // corners step to alternate sides of the straight line
  const side = (p) => Math.sign((p[0] - 32) * (89 - 2) - (p[1] - 2) * (30 - 32));
  const z = boltPath(32, 2, 30, 89, { kinks: 7, zigzag: 5, seed: 3 });
  for (let i = 2; i < z.length - 1; i++) assert.equal(side(z[i]), -side(z[i - 1]), `corner ${i} is on the other side from corner ${i - 1}`);
  // the mirrored path is on the other side at every corner
  const m = boltPath(32, 2, 30, 89, { kinks: 7, zigzag: 5, mirror: true, seed: 3 });
  for (let i = 1; i < z.length - 1; i++) assert.equal(side(m[i]), -side(z[i]));
  assert.deepEqual(boltPath(0, 0, 10, 0, { kinks: 0 }), [[0, 0], [10, 0]]);
});

test('bolt: reaches from end to end without a gap, at any width', () => {
  for (const width of [1, 3, 5]) {
    const g = draw(64, 96, (s) => bolt(s, { x0: 36, y0: 2, x1: 32, y1: 89, zigzag: 4, sway: 6, width, colours: ['#ffffff', '#f4e06a', '#c6902f'], box: [1, 1, 63, 90] }));
    const b = inBorder(g, `bolt width ${width}`);
    assert.ok(b.y0 <= 2 && b.y1 === 89, `width ${width}: from the top to the ground row (${b.y0}..${b.y1})`);
    for (let y = 2; y <= 89; y++) { let any = false; for (let x = 0; x < 64; x++) if (g.get(x, y)) any = true; assert.ok(any, `width ${width}: row ${y} is drawn`); }
  }
});

test('bolt: forks, windows, taper and the returned path', () => {
  const base = { x0: 36, y0: 2, x1: 32, y1: 89, zigzag: 4, sway: 6, width: 3, colours: ['#ffffff', '#f4e06a', '#c6902f'], seed: 2 };
  const plain = draw(64, 96, (g) => bolt(g, base)), forked = draw(64, 96, (g) => bolt(g, { ...base, forks: 3, forkLength: 0.35 }));
  assert.ok(lit(forked) > lit(plain) + 40, 'three forks add pixels');
  assert.ok(forked.bounds().x1 - forked.bounds().x0 > plain.bounds().x1 - plain.bounds().x0, 'and reach out to the side');
  const top = draw(64, 96, (g) => bolt(g, { ...base, to: 0.4 }));
  assert.ok(top.bounds().y1 < 45 && lit(top) < lit(plain) * 0.55, 'to: 0.4 shows the upper part only');
  const bit = draw(64, 96, (g) => bolt(g, { ...base, from: 0.7, to: 0.8 }));
  assert.ok(bit.bounds().y0 > 55 && bit.bounds().y1 < 80, 'a window shows one stretch of it');
  assert.ok(lit(draw(64, 96, (g) => bolt(g, { ...base, taper: 1 }))) < lit(plain), 'a tapered bolt is thinner');
  const g = new Surface(64, 96), path = bolt(g, base);
  assert.deepEqual(path, boltPath(36, 2, 32, 89, { kinks: 6, zigzag: 4, sway: 6, seed: 2 }));
  const own = [[10, 5], [20, 30], [12, 60]];
  assert.equal(bolt(g, { ...base, path: own }), own, 'a path given is the path used');
  assert.ok(lit(draw(64, 96, (s) => bolt(s, { ...base, path: own }))) > 100);
  // hottest colour inside, rim outside
  let white = 0, rim = 0; for (let x = 0; x < 64; x++) { if (plain.get(x, 6) === col('#ffffff')) white++; if (plain.get(x, 6) === col('#c6902f')) rim++; }
  assert.ok(white >= 1 && rim === 2, `a row of it: white inside (${white}), one rim pixel on each side (${rim})`);
});

// ---- ice ------------------------------------------------------------------------------------

test('crystal: stands on its foot inside the box, pointing where asked, and returns its tip', () => {
  assert.deepEqual([...CRYSTAL_SHAPES], ['spike', 'prism', 'shard']);
  for (const shape of CRYSTAL_SHAPES) {
    const g = new Surface(64, 64);
    const tip = crystal(g, { x: 32, y: 59, length: 31, width: 9, shape, colours: C, box: [1, 1, 63, 58] });
    const b = inBorder(g, shape);
    assert.equal(b.y1, 57, `${shape}: its lowest pixels are on the row above the floor`);
    assert.ok(b.y0 >= 27 && b.y0 <= 29, `${shape}: 31 px long from a foot on row 59 (top row ${b.y0})`);
    assert.ok(Math.abs(tip[0] - 32) < 1e-9 && Math.abs(tip[1] - 28) < 1e-9);
    assert.deepEqual([...colours(g)].sort(), C.map(col).sort(), `${shape}: highlight, two facets and a rim`);
  }
  const lean = new Surface(64, 64);
  const tip = crystal(lean, { x: 20, y: 59, angle: Math.PI - 0.5, length: 30, width: 8, colours: C });
  assert.ok(tip[0] > 30 && lean.bounds().x1 > 30, 'an angle below PI leans it to the right');
});

test('crystal: the facet on the side of the light is the lighter one, with a highlight line between them', () => {
  const g = draw(64, 64, (s) => crystal(s, { x: 32, y: 60, length: 40, width: 14, shape: 'prism', colours: C, box: [1, 1, 63, 60] }));
  // light comes from the top right: half way up, the right of the body is the lit facet, the left the shaded one
  assert.equal(g.get(36, 48), col(C[1]), 'right of the ridge: the lit facet');
  assert.equal(g.get(27, 48), col(C[2]), 'left of the ridge: the shaded facet');
  let line = 0; for (let x = 26; x < 38; x++) if (g.get(x, 48) === col(C[0])) line++;
  assert.equal(line, 1, 'one pixel of highlight on that row');
  const dull = draw(64, 64, (s) => crystal(s, { x: 32, y: 60, length: 40, width: 14, colours: C, shine: false, box: [1, 1, 63, 60] }));
  assert.ok(![...colours(dull)].includes(col(C[0])), 'shine: false leaves the highlight out');
  const shapes = CRYSTAL_SHAPES.map((shape) => draw(64, 64, (s) => crystal(s, { x: 32, y: 60, length: 40, width: 14, shape, colours: C })));
  assert.ok(diff(shapes[0], shapes[1]) > 60 && diff(shapes[0], shapes[2]) > 40 && diff(shapes[1], shapes[2]) > 60, 'the three shapes differ');
  // too short to be a shape, it is still a pixel
  assert.ok(lit(draw(16, 16, (s) => crystal(s, { x: 8, y: 12, length: 1.2, width: 3, colours: C }))) >= 1);
});

test('snowflake: six arms, the same on both sides, pale arms with a bright line and a dark rim', () => {
  const g = draw(48, 48, (s) => snowflake(s, { x: 24.5, y: 24.5, r: 17, colours: C }));
  const b = inBorder(g, 'snowflake');
  assert.ok(b.y0 <= 8 && b.y1 >= 41, 'the upright arms reach r up and down');
  for (let y = 0; y < 48; y++) for (let x = 0; x < 24; x++) assert.equal(g.get(x, y), g.get(48 - x, y), `mirrored at ${x},${y}`);
  assert.equal(g.get(24, 14), col(C[0]), 'the line down the upright arm');
  assert.equal(g.get(24, 24), col(C[0]), 'the hub');
  assert.ok([...colours(g)].includes(col(C[1])) && [...colours(g)].includes(col(C[3])));
  const bare = draw(48, 48, (s) => snowflake(s, { x: 24.5, y: 24.5, r: 17, twigs: 0, colours: C }));
  assert.ok(lit(bare) < lit(g) - 60, 'twigs add to it');
  assert.ok(diff(g, draw(48, 48, (s) => snowflake(s, { x: 24.5, y: 24.5, r: 17, turn: Math.PI / 6, colours: C }))) > 100, 'turn turns it');
  assert.ok(lit(draw(48, 48, (s) => snowflake(s, { x: 24.5, y: 24.5, r: 0.5, colours: C }))) === 1, 'too small to be a flake, it is a pixel');
});

// ---- motes ----------------------------------------------------------------------------------

test('moteIn: five shapes that differ once they are big enough, and shrink to a plus and a pixel', () => {
  assert.deepEqual([...MOTE_SHAPES], ['dot', 'plus', 'leaf', 'star', 'heart']);
  const one = (shape, S, lean = 1) => draw(16, 16, (g) => g.fill(0, 0, 16, 16, moteIn(shape, 8.5, 8.5, S, lean), '#ffffff'));
  for (const shape of MOTE_SHAPES) {
    assert.equal(lit(one(shape, 1)), 1, `${shape} at 1 px is one pixel`);
    const b = one(shape, 9).bounds();
    assert.ok(b.x1 - b.x0 + 1 >= 7 && b.x1 - b.x0 + 1 <= 11 && b.y1 - b.y0 + 1 >= 7 && b.y1 - b.y0 + 1 <= 11, `${shape} at 9 px is about 9 px across`);
    let last = 0;
    for (const S of [1, 3, 5, 7, 9]) { const n = lit(one(shape, S)); assert.ok(n > last, `${shape}: ${S} px is bigger than the size before`); last = n; }
  }
  for (let i = 0; i < MOTE_SHAPES.length; i++) for (let j = i + 1; j < MOTE_SHAPES.length; j++) {
    assert.ok(diff(one(MOTE_SHAPES[i], 9), one(MOTE_SHAPES[j], 9)) >= 12, `${MOTE_SHAPES[i]} and ${MOTE_SHAPES[j]} differ at 9 px`);
  }
  const plus = one('plus', 9);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { assert.equal(plus.get(x, y), plus.get(16 - x, y)); assert.equal(plus.get(x, y), plus.get(x, 16 - y)); }
  assert.equal(plus.get(4, 4), 0, 'a plus has open corners');
  assert.ok(diff(one('leaf', 9, 1), one('leaf', 9, -1)) > 10, 'a leaf leans either way');
});

const column = (o = {}) => draw(64, 64, (g) => motes(g, { x: 32, y: 53, count: 6, rise: 40, width: 26, size: 9, shape: 'plus', colours: C, seed: 5, box: [1, 1, 63, 58], ...o }));

test('motes, looping: closes, always has something in view, and rises above the start', () => {
  assert.equal(diff(column({ t: 0 }), column({ t: 1 })), 0, 't = 0 and t = 1 are the same picture');
  for (let f = 0; f < 8; f++) {
    const g = column({ t: f / 8 }), b = inBorder(g, `loop frame ${f}`);
    assert.ok(lit(g) >= 20, `frame ${f} has motes in view`);
    assert.ok(b.y1 <= 57, 'nothing below the box');
  }
  assert.ok(diff(column({ t: 0 }), column({ t: 0.25 })) > 30, 'it moves');
  assert.ok(diff(column({ t: 0.3 }), column({ t: 0.3, shape: 'heart' })) > 12, 'the shape shows');
  assert.ok(lit(column({ t: 0.3, count: 10 })) > lit(column({ t: 0.3, count: 4 })), 'more motes, more pixels');
});

test('motes, one-shot: they set off in turn, climb, fade at different heights and leave pixels', () => {
  const at = (t, o = {}) => column({ t, loop: false, stagger: 0.5, ...o });
  const first = at(0);
  assert.ok(lit(first) >= 2, 'frame 0 already has the first mote');
  assert.ok(first.bounds().y0 > 40, 'which starts low');
  assert.ok(lit(at(0.5)) > lit(first) * 3, 'by half way most are out');
  assert.ok(at(0.5).bounds().y0 < 30, 'and the first ones are high');
  const end = at(1);
  inBorder(end, 'the last frame');
  assert.ok(lit(end) >= 2, 'the last frame keeps at least two pixels');
  assert.ok(lit(end) < lit(at(0.5)) / 2, 'most of it has faded by then');
  // the ones that faded ended at different heights
  const rows = new Set(); end.data.forEach((v, i) => { if (v) rows.add(Math.floor(i / 64)); });
  assert.ok(rows.size >= 3, 'what is left is at several heights');
  assert.ok(at(0.5, { rise: 20 }).bounds().y0 > at(0.5, { rise: 44 }).bounds().y0, 'rise sets how high they go');
  for (let f = 0; f <= 9; f++) inBorder(at(f / 9, { rise: 80, size: 11, count: 10 }), `a tall column, frame ${f}`);
});

// ---- swirl ----------------------------------------------------------------------------------

test('swirl: sparks start on the outer ring and end in the middle', () => {
  const at = (t, o = {}) => draw(64, 64, (g) => swirl(g, { t, x: 32, y: 32, count: 8, r0: 16, r1: 1.5, turns: 0.6, size: 3, colours: C, seed: 4, ...o }));
  const far = (g) => { let m = 0; g.data.forEach((v, i) => { if (v) m = Math.max(m, Math.hypot((i % 64) + 0.5 - 32, Math.floor(i / 64) + 0.5 - 32)); }); return m; };
  const start = at(0), end = at(1);
  assert.ok(lit(start) >= 8 && far(start) > 12 && far(start) < 20, `at t = 0 they sit on the ring (${far(start).toFixed(1)})`);
  assert.ok(lit(end) >= 2 && far(end) < 6, `at t = 1 they are in the middle (${far(end).toFixed(1)})`);
  assert.ok(far(at(0.6)) < far(start), 'and they close in on the way');
  assert.ok(diff(at(0.5), at(0.5, { turns: -0.6 })) > 20, 'the other way round is a different picture');
  assert.ok(far(at(1, { r0: 2, r1: 16 })) > 12, 'r1 larger than r0 flings them outward');
  assert.equal(diff(at(0, { loop: true }), at(1, { loop: true })), 0, 'a looping swirl closes');
  for (let f = 0; f <= 5; f++) inBorder(at(f / 5, { r0: 40 }), `a swirl wider than the frame, frame ${f}`);
});

test('everything is repeatable: the same call draws the same pixels', () => {
  const calls = [
    (g) => crescent(g, { x0: 48, y0: 12, x1: 16, y1: 52, bulge: 8, width: 7, jag: 2, colours: C }),
    (g) => bolt(g, { x0: 36, y0: 2, x1: 32, y1: 60, forks: 3, colours: C }),
    (g) => crystal(g, { x: 32, y: 59, length: 31, width: 9, colours: C }),
    (g) => snowflake(g, { x: 32.5, y: 32.5, r: 15, colours: C }),
    (g) => motes(g, { t: 0.4, x: 32, y: 53, colours: C }),
    (g) => swirl(g, { t: 0.4, x: 32, y: 32, colours: C }),
  ];
  for (const fn of calls) assert.equal(diff(draw(64, 64, fn), draw(64, 64, fn)), 0);
  // a single colour instead of a list works everywhere
  for (const fn of [crescent, bolt]) assert.ok(lit(draw(64, 64, (g) => fn(g, { x0: 40, y0: 6, x1: 20, y1: 56, colour: '#f4e06a' }))) > 40);
  for (const fn of [crystal, snowflake]) assert.ok(lit(draw(64, 64, (g) => fn(g, { x: 32.5, y: 40.5, colour: '#7aa0f4' }))) > 20);
  for (const fn of [motes, swirl]) assert.ok(lit(draw(64, 64, (g) => fn(g, { t: 0.3, x: 32, y: 40, colour: '#7fe0a0' }))) > 8);
});
