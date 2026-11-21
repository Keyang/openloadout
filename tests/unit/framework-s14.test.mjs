// Framework additions made with batch S14 (station props: supply crate, fuel barrel, loot cache, upgrade pedestal):
//   engine/solids.js   squircleIn, ngonPoints      footprints: a round-cornered box, a flat polygon turned about its upright axis
//                      solid, extrude, faceRamps   an upright solid in three-quarter view from the shape of its top face
//                      bandIn, wallFill, stripesIn hoops, labels and hazard stripes on the wall of a solid
//   engine/surface.js  cropped                     a copy of a Surface that keeps only what is inside a box
//   engine/fx.js       lamp, hologram, beam        a status light, a projected shape with a scan line, a column of light
//   engine/marks.js    LABEL_MARKS (cross, bolt)   two more picture marks
// and with its fix round 1:
//   engine/breaking.js hitWobble                   the squash and knock of a prop's 4-frame `hurt` clip
//   engine/fx.js       scorch                      the burn ring and embers an explosion leaves on the floor
//   engine/shapes.js   edgeIn, trimmedIn           the pixels along one side of a shape; a shape with chosen sides taken off
// and with its fix round 2:
//   engine/solids.js   wallWear                    dents, scratches and dirt on the wall of a solid
//                      turningCubeIn               a cube turning about its upright axis, as shape tests
//   engine/fx.js       meridians                   the lines of longitude that sweep across a turning ball of light
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, ellipseIn, rectIn, polyIn, cropped } from '../../engine/surface.js';
import { col, brightness, ramp, tone } from '../../engine/color.js';
import { squircleIn, ngonPoints, solid, faceRamps, stripesIn } from '../../engine/solids.js';
import { steps, scorch } from '../../engine/fx.js';
import { insetIn, edgeIn, trimmedIn } from '../../engine/shapes.js';
import { MARKS, LABEL_MARKS, markIn, drawMark } from '../../engine/marks.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const count = (g, hex) => { const c = col(hex); return g.data.reduce((n, v) => n + (v === c ? 1 : 0), 0); };
const diff = (a, b) => a.data.reduce((n, v, i) => n + (v !== b.data[i] ? 1 : 0), 0);
const at = (g, x, y) => g.data[y * g.w + x];
const BOX = [0, 0, 32, 48];
const HULL = '#6b7896';

// ---- footprints ------------------------------------------------------------------

test('squircleIn: power 2 is the ellipse, a high power fills the corners', () => {
  const e = ellipseIn(16, 16, 8, 5), s2 = squircleIn(16, 16, 8, 5, 2), s8 = squircleIn(16, 16, 8, 5, 8);
  for (let y = 8; y < 24; y++) for (let x = 4; x < 28; x++) assert.equal(s2(x + 0.5, y + 0.5), e(x + 0.5, y + 0.5));
  assert.equal(e(9.5, 12.5), false, 'the ellipse leaves the corner open');
  assert.equal(s8(9.5, 12.5), true, 'the squircle fills it');
  assert.equal(s8(7.5, 16.5), false, 'and never leaves its box');
});

test('ngonPoints: as many corners as sides, a flat side to the camera, squashed and turned', () => {
  const sq = ngonPoints(16, 10, 6, 3, 4);
  assert.equal(sq.length, 4);
  const low = Math.max(...sq.map((p) => p[1]));
  assert.equal(sq.filter((p) => Math.abs(p[1] - low) < 1e-9).length, 2, 'two corners share the front edge');
  for (const [x, y] of sq) assert.ok(Math.abs(((x - 16) / 6) ** 2 + ((y - 10) / 3) ** 2 - 1) < 1e-9, 'corners lie on the squashed circle');
  const turned = ngonPoints(16, 10, 6, 3, 4, Math.PI / 4);
  assert.ok(Math.abs(Math.max(...turned.map((p) => p[1])) - 13) < 1e-9, 'an eighth of a turn puts a corner at the front');
  assert.equal(ngonPoints(0, 0, 5, 5).length, 6, 'six sides by default');
  // a quarter turn of a square is the same square
  const again = ngonPoints(16, 10, 6, 3, 4, Math.PI / 2).map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort();
  assert.deepEqual(again, sq.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort());
});

// ---- the solid ---------------------------------------------------------------------

test('solid: a box is its top face and the wall h px below it', () => {
  const S = solid(rectIn(6, 10, 12, 5), 8, BOX);
  assert.deepEqual(S.box, [6, 10, 18, 23]);
  assert.equal(S.h, 8);
  assert.equal(S.top(6.5, 10.5), true);
  assert.equal(S.wall(6.5, 14.5), false, 'the last row of the top is not wall');
  assert.equal(S.wall(6.5, 15.5), true);
  assert.equal(S.wall(6.5, 22.5), true);
  assert.equal(S.wall(6.5, 23.5), false);
  assert.equal(S.wall(5.5, 16.5), false);
  assert.equal(S.body(10.5, 12.5) && S.body(10.5, 20.5), true);
  assert.equal(S.drop(10.5, 15.5), 0);
  assert.equal(S.drop(10.5, 22.5), 7);
  assert.equal(S.front(10), 14);
  assert.equal(S.back(10), 10);
  assert.equal(S.front(2), null);
  for (let x = 6; x < 18; x++) assert.equal(S.facing(x + 0.5), 0, 'a flat front faces the camera everywhere');
  assert.equal(S.shadeOf(6.5, 18.5), 'dark', 'the left side is in shade');
  assert.equal(S.shadeOf(12.5, 22.5), 'dark', 'and so is the foot');
  assert.equal(S.shadeOf(12.5, 18.5), 'base');
  assert.equal(solid(() => false, 5, BOX).box, null, 'an empty top has no box');
});

test('solid: the wall of a drum turns from the light on the left and to it on the right', () => {
  const S = solid(ellipseIn(16, 12, 9, 3), 20, BOX);
  assert.equal(S.facing(7.5), -1);
  assert.equal(S.facing(16.5), 0);
  assert.equal(S.facing(24.5), 1);
  assert.equal(S.shadeOf(8.5, 20.5), 'dark');
  assert.equal(S.shadeOf(15.5, 20.5), 'base');
  assert.equal(S.shadeOf(23.5, 20.5), 'light');
  assert.ok(S.front(16) > S.front(8), 'the front edge is lowest in the middle');
  // the foot follows the same curve
  assert.equal(S.wall(16.5, S.front(16) + 20 + 0.5), true);
  assert.equal(S.wall(16.5, S.front(16) + 21 + 0.5), false);
  assert.equal(S.wall(8.5, S.front(8) + 21 + 0.5), false);
});

test('faceRamps: the top is lighter than the wall, also for a colour too pale to lighten', () => {
  for (const c of [HULL, '#e2473f', '#434d6d', '#e8ecf2', '#c2c9d6', '#f0ead8']) {
    const R = faceRamps(c);
    assert.ok(brightness(R.top.base) - brightness(R.wall.base) >= 0.1, `${c}: top ${R.top.base} against wall ${R.wall.base}`);
  }
  assert.equal(faceRamps(HULL).wall.base, HULL, 'a mid colour keeps the wall as given');
  assert.equal(faceRamps('#e8ecf2').top.base, '#e8ecf2', 'a pale one keeps the top as given and darkens the wall');
  assert.equal(faceRamps(HULL, '#f2a030').top.base, '#f2a030', 'a top colour is used as it is');
});

test('stripesIn: slanted stripes of whole pixels, half the area by default', () => {
  const tape = stripesIn(rectIn(0, 0, 16, 8), { pitch: 4 });
  let on = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    const v = tape(x + 0.5, y + 0.5);
    if (v) on++;
    if (x + 4 < 16) assert.equal(tape(x + 4.5, y + 0.5), v, 'repeats every pitch');
    if (x > 0 && y + 1 < 8) assert.equal(tape(x - 0.5, y + 1.5), v, 'and leans one pixel per row');
  }
  assert.equal(on, 64);
  assert.equal(tape(20.5, 2.5), false, 'nothing outside the shape');
  const bars = stripesIn(rectIn(0, 0, 16, 8), { pitch: 4, slant: 0 });
  assert.equal(bars(0.5, 0.5), bars(0.5, 7.5), 'slant 0: upright bars');
  assert.notEqual(stripesIn(rectIn(0, 0, 16, 8), { pitch: 4, phase: 2 })(0.5, 0.5), tape(0.5, 0.5), 'phase slides them');
});

// ---- layers (engine/surface.js) ----------------------------------------------------

test('cropped: keeps the pixels inside the box where they were, and leaves the source alone', () => {
  const src = new Surface(16, 16).rect(2, 2, 12, 12, '#6b7896');
  const left = cropped(src, 0, 0, 8, 16), right = cropped(src, 8, 0, 16, 16);
  assert.deepEqual(left.bounds(), { x0: 2, y0: 2, x1: 7, y1: 13 });
  assert.deepEqual(right.bounds(), { x0: 8, y0: 2, x1: 13, y1: 13 });
  assert.equal(lit(left) + lit(right), lit(src), 'the two halves are the whole');
  assert.equal(lit(src), 144);
  assert.equal(lit(cropped(src, -5, -5, 40, 40)), 144, 'a box bigger than the Surface keeps everything');
  assert.equal(lit(cropped(src, 6, 6, 6, 9)), 0, 'an empty box keeps nothing');
  const back = new Surface(16, 16).blit(left, -1, 0).blit(right, 1, 0);
  assert.deepEqual(back.bounds(), { x0: 1, y0: 2, x1: 14, y1: 13 }, 'slid apart by one pixel each');
});

// ---- lights (engine/fx.js) -------------------------------------------------------

test('LABEL_MARKS: cross and bolt draw at 5, 7 and 9 px and stay inside their size', () => {
  assert.deepEqual([...LABEL_MARKS], ['cross', 'bolt']);
  assert.equal(MARKS.includes('cross'), false, 'the first list is unchanged');
  for (const name of LABEL_MARKS) for (const size of [5, 7, 9]) {
    const g = new Surface(21, 21);
    drawMark(g, name, 10, 10, size, '#f2a030');
    const b = g.bounds(), n = (size - 1) / 2;
    assert.ok(lit(g) >= size, `${name} ${size}`);
    assert.ok(b.x0 >= 10 - n && b.x1 <= 10 + n && b.y0 >= 10 - n && b.y1 <= 10 + n, `${name} ${size} stays in its box`);
    assert.equal(b.y0, 10 - n, `${name} ${size} reaches the top`);
    assert.equal(b.y1, 10 + n, `${name} ${size} reaches the bottom`);
  }
  // the cross is the same seen in a mirror and upside down; the bolt is not
  const cross = markIn('cross', 10, 10, 7), bolt = markIn('bolt', 10, 10, 7);
  let same = true, boltSame = true;
  for (let y = 5; y < 16; y++) for (let x = 5; x < 16; x++) {
    if (cross(x + 0.5, y + 0.5) !== cross(20 - x + 0.5, y + 0.5) || cross(x + 0.5, y + 0.5) !== cross(x + 0.5, 20 - y + 0.5)) same = false;
    if (bolt(x + 0.5, y + 0.5) !== bolt(20 - x + 0.5, y + 0.5)) boltSame = false;
  }
  assert.equal(same, true);
  assert.equal(boltSame, false);
});

// ---- fix round 1: the hit wobble (engine/breaking.js) -----------------------------

test('scorch: a broken ring of one colour that stays inside its ellipse and its box, and spreads with t', () => {
  const BURN = '#33384d';
  const draw = (o) => { const g = new Surface(32, 48); scorch(g, { x: 16.5, y: 38, rx: 12, ry: 5, colour: BURN, ...o }); return g; };
  const full = draw({});
  assert.equal(lit(full), count(full, BURN), 'cold: the burn colour and nothing else');
  assert.ok(lit(full) > 40, 'a ring, not a few specks');
  const inEllipse = (x, y, k = 1) => ((x + 0.5 - 16.5) / (12 * k)) ** 2 + ((y + 0.5 - 38) / (5 * k)) ** 2;
  let ringArea = 0;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
    const q = inEllipse(x, y);
    if (q <= 1 && q > 0.45) ringArea++;
    if (at(full, x, y)) assert.ok(q <= 1 && q > 0.45, `(${x}, ${y}) is on the ring, not in the clean middle or outside it`);
  }
  assert.ok(lit(full) < ringArea && lit(full) > ringArea * 0.6, 'broken up, but most of the ring is there');
  // it spreads: more pixels and a wider box as t goes up, never past its full size
  const sizes = [0, 0.25, 0.5, 0.75, 1].map((t) => draw({ t }));
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(lit(sizes[i]) > lit(sizes[i - 1]), `t ${i / 4} has more than t ${(i - 1) / 4}`);
    assert.ok(sizes[i].bounds().x1 >= sizes[i - 1].bounds().x1 && sizes[i].bounds().x0 <= sizes[i - 1].bounds().x0);
  }
  assert.ok(sizes[0].bounds().x1 - sizes[0].bounds().x0 < 16, 'it starts at about half its size');
  assert.equal(diff(sizes[4], full), 0, 't defaults to 1');
  assert.equal(diff(draw({ t: 7 }), full), 0, 't past 1 is 1');
  assert.ok(lit(draw({ t: 0, start: 0.2 })) < lit(sizes[0]), 'start: how small it begins');
  // a box cuts it; the frame's 1 px border is always left empty
  const cut = draw({ box: [4, 30, 16, 40] });
  const b = cut.bounds();
  assert.ok(b.x0 >= 4 && b.x1 < 16 && b.y0 >= 30 && b.y1 < 40);
  const edge = new Surface(16, 16);
  scorch(edge, { x: 8, y: 8, rx: 12, ry: 12, hole: 0, gaps: 0, heat: 1, embers: 12 });
  assert.deepEqual(edge.bounds(), { x0: 1, y0: 1, x1: 14, y1: 14 });
});

test('scorch: seeds differ, hole and gaps shape the ring, and embers show only while it is hot', () => {
  const BURN = '#33384d', C = steps('#f2a030');
  const draw = (o) => { const g = new Surface(32, 48); scorch(g, { x: 16.5, y: 38, rx: 12, ry: 5, colour: BURN, ...o }); return g; };
  const a = draw({});
  assert.ok(diff(a, draw({ seed: 1 })) > 8, 'another seed breaks the ring elsewhere');
  assert.equal(diff(a, draw({ seed: 0 })), 0, 'the same seed is the same picture');
  const whole = draw({ gaps: 0 }), patch = draw({ gaps: 0, hole: 0 });
  assert.ok(lit(whole) > lit(a), 'gaps 0: an unbroken ring');
  assert.ok(lit(patch) > lit(whole), 'hole 0: a filled patch');
  assert.ok(at(patch, 16, 38) !== 0 && at(whole, 16, 38) === 0, 'the middle is clean unless hole is 0');
  // embers: none when cold or when none are asked for; bright above heat 0.5, dull below; they flicker
  const other = (g) => lit(g) - count(g, BURN);
  assert.equal(other(draw({ colours: C, heat: 0, flicker: 2 })), 0);
  assert.equal(other(draw({ colours: C, heat: 1, flicker: 2, embers: 0 })), 0);
  const frames = [0, 1, 2, 3, 4, 5, 6, 7];
  const hot = frames.map((f) => draw({ colours: C, heat: 0.9, flicker: f, embers: 6 }));
  const cool = frames.map((f) => draw({ colours: C, heat: 0.3, flicker: f, embers: 6 }));
  assert.ok(hot.every((g) => other(g) === count(g, C[1])), 'hot embers take the core colour');
  assert.ok(cool.every((g) => other(g) === count(g, C[3])), 'cooling embers take the edge colour');
  assert.ok(hot.reduce((n, g) => n + count(g, C[1]), 0) >= 8, 'embers show');
  assert.ok(hot.some((g) => count(g, C[1]) > 0) && new Set(hot.map((g) => count(g, C[1]))).size > 1, 'and not the same ones on every frame');
  assert.equal(diff(hot[3], draw({ colours: C, heat: 0.9, flicker: 3, embers: 6 })), 0, 'the same frame is the same picture');
  // with no fire colours given the embers are amber, whatever the colour of the burn
  const plain = frames.map((f) => draw({ heat: 1, flicker: f, embers: 6 }));
  assert.ok(plain.reduce((n, g) => n + count(g, C[1]), 0) >= 8);
  assert.ok(plain.every((g) => other(g) === count(g, C[1])));
});

// ---- fix round 1: edges and trimmed shapes (engine/shapes.js) ---------------------

test('edgeIn: the pixels of a shape along one side', () => {
  const box = rectIn(4, 6, 8, 5), drum = ellipseIn(16, 12, 9, 3);
  const cells = (f) => { const out = []; for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) if (f(x + 0.5, y + 0.5)) out.push(`${x},${y}`); return out; };
  assert.deepEqual(cells(edgeIn(box)), cells(rectIn(4, 6, 8, 1)), 'the top row by default');
  assert.deepEqual(cells(edgeIn(box, 0, 1)), cells(rectIn(4, 10, 8, 1)), 'the bottom row');
  assert.deepEqual(cells(edgeIn(box, -1, 0)), cells(rectIn(4, 6, 1, 5)), 'the left column');
  assert.deepEqual(cells(edgeIn(box, 1, 0)), cells(rectIn(11, 6, 1, 5)), 'the right column');
  assert.deepEqual(cells(edgeIn(box, 0, -2)), cells(rectIn(4, 6, 8, 2)), 'a bigger step: two rows');
  // on a round shape: one pixel per column, the lowest of that column
  const low = cells(edgeIn(drum, 0, 1));
  assert.equal(low.length, 18);
  for (const c of low) { const [x, y] = c.split(',').map(Number); assert.equal(drum(x + 0.5, y + 0.5) && !drum(x + 0.5, y + 1.5), true); }
});
