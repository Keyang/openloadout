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
import { squircleIn, ngonPoints, solid, extrude, faceRamps, bandIn, wallFill, stripesIn, wallWear, turningCubeIn } from '../../engine/solids.js';
import { lamp, hologram, beam, steps, scorch, meridians } from '../../engine/fx.js';
import { hitWobble } from '../../engine/breaking.js';
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

test('extrude: draws the lit top over a shaded wall and hands back the geometry', () => {
  const g = new Surface(32, 48);
  const S = extrude(g, rectIn(6, 10, 12, 5), 8, HULL);
  assert.equal(lit(g), 12 * 13, 'every pixel of the top and the wall, nothing else');
  assert.deepEqual(g.bounds(), { x0: 6, y0: 10, x1: 17, y1: 22 });
  assert.equal(at(g, 10, 12), col(S.ramps.top.base));
  assert.equal(at(g, 10, 10), col(S.ramps.top.light), 'the far edge of the top catches the light');
  assert.equal(at(g, 10, 18), col(HULL));
  assert.equal(at(g, 6, 18), col(ramp(HULL).dark));
  assert.equal(at(g, 10, 22), col(ramp(HULL).dark));
  assert.equal(S.wall(10.5, 18.5), true);
  // a lip: a light rim all round the top
  const lip = new Surface(32, 48);
  extrude(lip, rectIn(6, 10, 12, 5), 8, HULL, { lip: 1 });
  assert.equal(at(lip, 6, 12), col(S.ramps.top.light));
  assert.equal(at(lip, 10, 14), col(S.ramps.top.light));
  assert.equal(at(lip, 10, 12), col(S.ramps.top.base));
  // shade 0: no dark band on a wall that faces the camera
  const flat = new Surface(32, 48);
  extrude(flat, rectIn(6, 10, 12, 5), 8, HULL, { shade: 0 });
  assert.equal(count(flat, ramp(HULL).dark), 0);
});

test('extrude: a drum has three tones of wall and a top face that is lighter than all of them', () => {
  const g = new Surface(32, 48);
  const S = extrude(g, ellipseIn(16, 12, 9, 3), 20, '#e2473f');
  const R = ramp('#e2473f');
  assert.ok(count(g, R.dark) > 20 && count(g, R.base) > 60 && count(g, R.light) > 20);
  assert.equal(at(g, 16, 12), col(S.ramps.top.base));
  assert.ok(brightness(S.ramps.top.base) > brightness(R.base));
  // nothing is drawn outside the solid, and an empty top draws nothing
  for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) assert.equal(at(g, x, y) !== 0, S.body(x + 0.5, y + 0.5));
  const none = new Surface(32, 48);
  assert.equal(extrude(none, () => false, 6, HULL).box, null);
  assert.equal(lit(none), 0);
});

test('extrude: a prism turned an eighth of a turn shows a dark face and a light face', () => {
  const g = new Surface(32, 48);
  const S = extrude(g, polyIn(ngonPoints(16, 14, 8, 4, 4, Math.PI / 4)), 10, HULL);
  assert.equal(S.shadeOf(11.5, 24.5), 'dark');
  assert.equal(S.shadeOf(21.5, 24.5), 'light');
});

// ---- marking a solid -------------------------------------------------------------

test('bandIn: a band follows the curve of a drum, and can be cut to a label', () => {
  const S = solid(ellipseIn(16, 12, 9, 3), 20, BOX);
  const hoop = bandIn(S, 4, 2);
  const rows = (x) => { const out = []; for (let y = 0; y < 48; y++) if (hoop(x + 0.5, y + 0.5)) out.push(y); return out; };
  assert.deepEqual(rows(16), [S.front(16) + 5, S.front(16) + 6]);
  assert.deepEqual(rows(8), [S.front(8) + 5, S.front(8) + 6]);
  assert.ok(rows(16)[0] > rows(8)[0], 'it sags in the middle');
  assert.deepEqual(rows(3), [], 'and stops at the wall');
  const label = bandIn(S, 4, 2, { x0: 13, x1: 19 });
  assert.equal(label(12.5, S.front(12) + 5.5), false);
  assert.equal(label(13.5, S.front(13) + 5.5), true);
  assert.equal(label(19.5, S.front(19) + 5.5), false);
});

test('wallFill: paints only wall pixels, shaded like the wall', () => {
  const g = new Surface(32, 48);
  const S = extrude(g, ellipseIn(16, 12, 9, 3), 20, HULL);
  const before = new Surface(32, 48); before.data.set(g.data);
  const steel = ramp('#c2c9d6');
  wallFill(g, S, bandIn(S, 4, 2), '#c2c9d6');
  assert.ok(diff(g, before) >= 30, 'two rows round an 18 px drum');
  assert.ok(count(g, steel.dark) > 0 && count(g, steel.base) > 0 && count(g, steel.light) > 0);
  // a test that covers everything still leaves the top face alone
  const all = new Surface(32, 48);
  const T = extrude(all, rectIn(6, 10, 12, 5), 8, HULL);
  wallFill(all, T, () => true, '#f2a030', { flat: true });
  assert.equal(count(all, '#f2a030'), 12 * 8);
  assert.equal(at(all, 10, 12), col(T.ramps.top.base));
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

test('lamp: off, dim, lit and flaring are four different pictures', () => {
  const draw = (level) => { const g = new Surface(16, 16); lamp(g, 6, 6, 3, 2, '#5fe0f0', level); return g; };
  const off = draw(0), dim = draw(0.5), on = draw(1), flare = draw(2);
  assert.equal(lit(off), 6);
  assert.equal(lit(on), 6);
  assert.ok(brightness('#5fe0f0') > 0.5);
  assert.equal(count(off, tone('#5fe0f0', -1.9)), 6);
  assert.equal(count(dim, tone('#5fe0f0', -0.9)), 6);
  assert.equal(count(on, '#5fe0f0'), 5);
  assert.equal(at(on, 8, 6), col('#ffffff'), 'a white glint at the top right');
  assert.equal(count(flare, '#ffffff'), 6);
  assert.equal(count(flare, '#5fe0f0'), 10, 'a halo of its colour round the lens, corners left open');
  assert.equal(lit(draw(0.9)), lit(on), 'levels between go to the nearest');
  // it stays inside the 1 px border
  const edge = new Surface(8, 8);
  lamp(edge, 0, 0, 2, 2, '#5fe0f0', 2);
  for (let i = 0; i < 8; i++) assert.equal(at(edge, i, 0) || at(edge, 0, i), 0);
});

test('hologram: two tones, a darker rim of its own colour and a scan line that climbs', () => {
  const XP = '#b48af8';
  const g = new Surface(32, 32);
  const box = hologram(g, ellipseIn(16, 16, 6, 6), XP, { scan: 0 });
  assert.deepEqual(box, [10, 10, 22, 22]);
  assert.ok(count(g, XP) > 20, 'the body');
  assert.ok(count(g, tone(XP, 0.9)) > 8, 'the lighter band towards the light');
  assert.ok(count(g, tone(XP, -1)) > 20, 'the rim');
  assert.ok(count(g, '#ffffff') >= 2, 'the scan line');
  assert.equal(at(g, 16, 21), col('#ffffff'), 'scan 0 is the bottom row');
  const up = new Surface(32, 32);
  hologram(up, ellipseIn(16, 16, 6, 6), XP, { scan: 1 });
  assert.equal(at(up, 16, 10), col('#ffffff'), 'scan 1 is the top row');
  const plain = new Surface(32, 32);
  hologram(plain, [ellipseIn(12, 16, 3, 3), ellipseIn(20, 16, 3, 3)], XP, { rim: false, light: 0 });
  assert.equal(count(plain, '#ffffff'), 0, 'no scan line unless asked for');
  assert.equal(lit(plain), count(plain, XP), 'no rim and one tone when both are switched off');
  // lit: a chosen part takes the lighter tone instead of the band on the lit side
  const top = new Surface(32, 32);
  hologram(top, rectIn(10, 10, 8, 8), XP, { lit: rectIn(10, 10, 8, 3) });
  assert.equal(count(top, tone(XP, 0.9)), 24);
  assert.equal(count(top, XP), 40);
  assert.equal(hologram(new Surface(32, 32), () => false, XP), null);
});

test('beam: a column of light, tallest in the middle, whose dashes travel with the phase', () => {
  const C = steps('#5fe0f0');
  const draw = (o) => { const g = new Surface(32, 32); beam(g, { x: 16, y: 28, w: 6, h: 20, colours: C, ...o }); return g; };
  const a = draw({ phase: 0 });
  const b = a.bounds();
  assert.equal(b.y1, 27, 'it stands on the row above y');
  assert.ok(b.x0 >= 13 && b.x1 <= 18, 'inside its width');
  assert.ok(b.y0 >= 8 && b.y0 <= 10, 'about h px tall');
  const height = (g, x) => { let top = 32; for (let y = 0; y < 32; y++) if (at(g, x, y)) { top = y; break; } return 28 - top; };
  assert.ok(height(a, 15) > height(a, 13), 'the middle reaches higher than the sides');
  assert.ok(at(a, 15, 27) !== 0 && at(a, 15, 26) !== 0 && at(a, 15, 25) !== 0, 'the foot is unbroken');
  assert.ok(diff(a, draw({ phase: 0.5 })) > 6, 'the dashes move');
  assert.equal(diff(a, draw({ phase: 1 })), 0, 'and a whole phase closes the loop');
  const solidBeam = draw({ gap: 0 });
  assert.ok(lit(solidBeam) > lit(a), 'gap 0 is unbroken');
  // never outside the frame's border
  const tall = new Surface(16, 16);
  beam(tall, { x: 8, y: 14, w: 4, h: 40, colour: '#5fe0f0' });
  assert.equal(tall.bounds().y0, 1);
});

// ---- marks (engine/marks.js) ------------------------------------------------------

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

test('hitWobble: squashed and knocked aside on the hit, springs back narrow, at rest on the last frame', () => {
  assert.deepEqual([0, 1, 2, 3].map((f) => hitWobble(f)), [[1, 1], [-1, -1], [1, 0], [0, 0]]);
  assert.deepEqual(hitWobble(3), [0, 0], 'a hurt clip ends on the idle pose');
  for (const f of [-1, 4, 99, 1.5, undefined]) assert.deepEqual(hitWobble(f), [0, 0], `frame ${f} is at rest`);
  // hit from the other side: the same squash, the knock mirrored
  assert.deepEqual([0, 1, 2, 3].map((f) => hitWobble(f, { side: -1 })), [[1, -1], [-1, 1], [1, 0], [0, 0]]);
  for (let f = 0; f < 4; f++) for (const side of [1, -1]) for (const v of hitWobble(f, { side })) assert.ok(Object.is(v, -0) === false && Number.isInteger(v), 'whole pixels, never -0');
  // a caller may change what it gets without changing the next call
  hitWobble(0)[0] = 9;
  assert.deepEqual(hitWobble(0), [1, 1]);
});

// ---- fix round 1: the scorch mark (engine/fx.js) ----------------------------------

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

test('trimmedIn: pixels off chosen sides only; all four sides is insetIn', () => {
  const box = rectIn(4, 6, 8, 5), drum = ellipseIn(16, 12, 9, 3);
  const cells = (f) => { const out = []; for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) if (f(x + 0.5, y + 0.5)) out.push(`${x},${y}`); return out; };
  assert.deepEqual(cells(trimmedIn(box)), cells(box), 'nothing asked for, nothing taken');
  assert.deepEqual(cells(trimmedIn(box, { top: 1 })), cells(rectIn(4, 7, 8, 4)));
  assert.deepEqual(cells(trimmedIn(box, { top: 1, bottom: 1 })), cells(rectIn(4, 7, 8, 3)));
  assert.deepEqual(cells(trimmedIn(box, { left: 2, right: 1 })), cells(rectIn(6, 6, 5, 5)));
  for (const d of [1, 2]) assert.deepEqual(cells(trimmedIn(drum, { left: d, right: d, top: d, bottom: d })), cells(insetIn(drum, d)));
  // a shape, its top edge and the rest of it are one whole
  assert.equal(cells(edgeIn(drum)).length + cells(trimmedIn(drum, { top: 1 })).length, cells(drum).length);
});

// ---- fix round 2: wear on a wall, a turning cube (engine/solids.js), meridians (engine/fx.js) ----

test('wallWear: nothing at 0, marks only on wall pixels, more of them with more wear, the same every time', () => {
  const RED = '#c9423a';
  const make = (amount, opt, top = ellipseIn(16.5, 12, 9.5, 3), h = 22) => {
    const g = new Surface(32, 48), S = extrude(g, top, h, RED), clean = new Surface(32, 48);
    clean.blit(g);
    wallWear(g, S, amount, S.ramps.wall, opt);
    return { g, S, clean };
  };
  const changed = ({ g, clean }) => { const out = []; for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) if (at(g, x, y) !== at(clean, x, y)) out.push([x, y]); return out; };
  assert.equal(changed(make(0)).length, 0, 'amount 0 draws nothing');
  const tops = { drum: ellipseIn(16.5, 12, 9.5, 3), box: rectIn(5, 9, 22, 6), prism: polyIn(ngonPoints(16.5, 12, 9.5, 4, 6)) };
  for (const [name, top] of Object.entries(tops)) for (const seed of [0, 1, 7]) {
    let last = 0;
    for (const amount of [0.2, 0.4, 0.6, 0.8, 1]) {
      const m = make(amount, { seed }, top), px = changed(m);
      for (const [x, y] of px) assert.equal(m.S.wall(x + 0.5, y + 0.5), true, `${name}, seed ${seed}, wear ${amount}: (${x}, ${y}) is not on the wall`);
      const R = m.S.ramps.wall;
      for (const [x, y] of px) assert.ok([col(R.light), col(R.dark)].includes(at(m.g, x, y)), 'marks use the light and dark tones of the wall');
      // never fewer (a dark dent on the dark side of a prism adds only its lit lip, a scratch on its light side nothing)
      assert.ok(px.length >= last, `${name}, seed ${seed}: wear ${amount} gives no fewer marks than the step before (${px.length} after ${last})`);
      if (amount === 0.6 || amount === 1) assert.ok(px.length > last, `${name}, seed ${seed}: wear ${amount} gives more marks than ${amount - 0.2} (${px.length} after ${last})`);
      last = px.length;
    }
  }
  // on a drum, whose wall has all three tones, every step of wear shows
  for (const seed of [0, 1, 7]) {
    const n = [0.2, 0.4, 0.6, 0.8, 1].map((amount) => changed(make(amount, { seed })).length);
    for (let i = 1; i < n.length; i++) assert.ok(n[i] > n[i - 1], `seed ${seed}: ${n}`);
    assert.ok(n[0] > 0);
  }
  // each mark keeps its place: what a little wear drew is still there under a lot of it (dirt comes in above 0.5)
  const few = make(0.35), many = make(0.5);
  for (const [x, y] of changed(few)) assert.equal(at(many.g, x, y), at(few.g, x, y));
  assert.equal(diff(make(0.8).g, make(0.8).g), 0, 'the same picture every time');
  assert.ok(diff(make(1, { seed: 0 }).g, make(1, { seed: 3 }).g) > 0, 'another seed scatters the marks another way');
  assert.ok(changed(make(1, { grime: 0 })).length < changed(make(1)).length, 'grime 0 leaves the foot clean');
  assert.ok(changed(make(1, { spots: 12 })).length > changed(make(1)).length, 'spots: more marks at full wear');
  // mid and half say where the wall's middle is and how far it reaches, when the solid's own box will not do
  assert.equal(diff(make(1, { mid: 16, half: 9 }).g, make(1).g), 0, 'the defaults come from the solid');
  assert.ok(diff(make(1, { mid: 13, half: 5 }).g, make(1).g) > 0);
  // a wall too low to hold a mark, and an empty solid, are left alone without an error
  const low = make(1, { grime: 0 }, ellipseIn(16.5, 12, 9.5, 3), 2);
  for (const [x, y] of changed(low)) assert.equal(low.S.wall(x + 0.5, y + 0.5), true);
  const none = new Surface(32, 48);
  wallWear(none, solid(() => false, 8, BOX), 1, ramp(RED));
  assert.equal(lit(none), 0);
});

test('turningCubeIn: three faces corner-on at t = 0, face-on at t = 0.5, the same picture a whole turn-step later', () => {
  const cells = (f, R) => { const out = []; for (let y = -R - 3; y < R + 3; y++) for (let x = -R - 3; x < R + 3; x++) if (f(x + 0.5, y + 0.5)) out.push(`${x},${y}`); return out; };
  const frontRow = (C, R, x) => { let low = null; for (let y = -R - 3; y < R + 3; y++) if (C.top(x + 0.5, y + 0.5)) low = y; return low; };
  for (const R of [5, 6, 7, 9]) {
    // t and t + 1 (a quarter turn of a cube) give the same picture, and so do t + 3 and t - 2
    for (const t of [0, 0.125, 0.25, 0.5, 0.625, 0.875]) for (const more of [1, 3, -2]) {
      const a = turningCubeIn(R, t), b = turningCubeIn(R, t + more);
      assert.deepEqual(cells(b.body, R), cells(a.body, R), `R ${R}, t ${t} and t ${t + more}: body`);
      assert.deepEqual(cells(b.lit, R), cells(a.lit, R), `R ${R}, t ${t} and t ${t + more}: lit`);
    }
    for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.75]) {
      const C = turningCubeIn(R, t), body = new Set(cells(C.body, R));
      // lit is part of the body; the body is the top face and the wall, which do not overlap
      for (const c of cells(C.lit, R)) assert.ok(body.has(c), `R ${R}, t ${t}: lit pixel ${c} is outside the body`);
      const top = cells(C.top, R), wall = cells(C.wall, R);
      assert.equal(top.length + wall.length, body.size);
      for (const c of top) assert.ok(cells(C.lit, R).includes(c), 'the whole top face is lit');
      // centred on (0, 0) within a pixel or two, and no wider than R to each side
      const xs = [...body].map((c) => +c.split(',')[0]), ys = [...body].map((c) => +c.split(',')[1]);
      assert.ok(Math.min(...xs) >= -R && Math.max(...xs) <= R - 1, `R ${R}, t ${t}: columns ${Math.min(...xs)}..${Math.max(...xs)}`);
      assert.ok(Math.abs(Math.min(...ys) + Math.max(...ys) + 1) <= 3, `R ${R}, t ${t}: rows ${Math.min(...ys)}..${Math.max(...ys)}`);
    }
    // t = 0: a corner to the camera. The top's front edge is a V, lowest in the middle, and the upright edge under
    // that corner is lit: one column of wall, with wall on both sides of it (the two side faces)
    const corner = turningCubeIn(R, 0);
    assert.ok(frontRow(corner, R, 0) > frontRow(corner, R, R - 2) && frontRow(corner, R, -1) > frontRow(corner, R, -R + 1), `R ${R}: the front edge is a V`);
    const edge = cells((px, py) => corner.lit(px, py) && corner.wall(px, py), R).map((c) => c.split(',').map(Number));
    const cols = [...new Set(edge.map((c) => c[0]))];
    assert.equal(cols.length, 1, `R ${R}: one upright edge is lit`);
    assert.ok(cols[0] === 0 || cols[0] === -1, 'and it is in the middle');
    assert.ok(edge.length >= Math.round(R * 0.95) - 1, 'it runs the height of the wall');
    const [ex, ey] = edge[0];
    assert.ok(corner.wall(ex - 2 + 0.5, ey + 0.5) && !corner.lit(ex - 2 + 0.5, ey + 0.5), 'a face to its left');
    assert.ok(corner.wall(ex + 2 + 0.5, ey + 0.5) && !corner.lit(ex + 2 + 0.5, ey + 0.5), 'and a face to its right');
    // t = 0.5: face-on. The front edge runs level, the cube is at its narrowest, and no edge is lit inside the face
    const face = turningCubeIn(R, 0.5);
    const rows = [-2, -1, 0, 1].map((x) => frontRow(face, R, x));
    assert.ok(rows.every((r) => r === rows[0]), `R ${R}: the front edge is level (${rows})`);
    const width = (C) => { const xs = cells(C.body, R).map((c) => +c.split(',')[0]); return Math.max(...xs) - Math.min(...xs) + 1; };
    assert.ok(width(face) < width(corner), 'narrower face-on than corner-on');
    const inner = cells((px, py) => face.lit(px, py) && face.wall(px, py), R).map((c) => +c.split(',')[0]);
    assert.ok(inner.every((x) => Math.abs(x + 0.5) > R * 0.5), 'the only lit edge, if any, is at its side');
  }
  // squash flattens the top face, height makes the wall taller, lift moves the whole cube up
  const rowsOf = (f) => { const ys = cells(f, 8).map((c) => +c.split(',')[1]); return [Math.min(...ys), Math.max(...ys)]; };
  const base = turningCubeIn(6, 0), flat = turningCubeIn(6, 0, { squash: 0.25 }), tall = turningCubeIn(6, 0, { height: 1.5 }), up = turningCubeIn(6, 0, { lift: 0.95 });
  const span = (r) => r[1] - r[0];
  assert.ok(span(rowsOf(flat.top)) < span(rowsOf(base.top)));
  assert.equal(span(rowsOf(tall.wall)) - span(rowsOf(base.wall)), Math.round(6 * 1.5) - Math.round(6 * 0.95));
  assert.deepEqual(rowsOf(up.body), rowsOf(base.body).map((y) => y - 3));
});

test('meridians: lines that stay inside the ball, sweep across it with t, and come round after a whole turn', () => {
  const XP = '#b48af8', LIGHT = col(tone(XP, 0.9)), DARK = col(tone(XP, -0.6));
  const draw = (t, r = 6, opt) => { const g = new Surface(32, 32); meridians(g, 16, 14, r, t, XP, opt); return g; };
  const cellsOf = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (at(g, x, y)) out.push([x, y]); return out; };
  for (const r of [5, 6, 7, 10]) {
    const ball = ellipseIn(16, 14, r, r);
    for (let i = 0; i < 16; i++) {
      const t = i / 16, g = draw(t, r), px = cellsOf(g);
      assert.ok(px.length >= 2 * r - 4, `r ${r}, t ${t}: two lines, though they may share a column`);
      for (const [x, y] of px) {
        // every pixel of a line holds part of the ball: the point of the pixel nearest the ball's middle is inside it
        const nx = Math.min(Math.max(16, x), x + 1), ny = Math.min(Math.max(14, y), y + 1);
        assert.ok(ball(nx, ny), `r ${r}, t ${t}: (${x}, ${y}) is outside the ball`);
        assert.ok(y >= 14 - r + 1 && y <= 14 + r - 2, 'and it keeps off the top and bottom rows');
        // lighter on the right half, the side of the light; darker on the left (a line in the very middle is still dark)
        assert.ok(at(g, x, y) === LIGHT ? x >= 15 : at(g, x, y) === DARK && x <= 16, `r ${r}, t ${t}: the tone at (${x}, ${y})`);
      }
      // clip: only pixels whose centre is inside the ball, which takes nothing away except at the left edge
      const strict = draw(t, r, { clip: true }), kept = cellsOf(strict);
      for (const [x, y] of kept) assert.ok(ball(x + 0.5, y + 0.5), `r ${r}, t ${t}, clip: the centre of (${x}, ${y}) is outside the ball`);
      for (const [x, y] of kept) assert.equal(at(strict, x, y), at(g, x, y));
      for (const [x, y] of px) if (!at(strict, x, y)) assert.ok(x < 16 && !ball(x + 0.5, y + 0.5));
      assert.equal(diff(draw(t + 1, r), g), 0, `r ${r}: t ${t} and t ${t + 1} are the same picture`);
      assert.equal(diff(draw(t + 3, r), g), 0);
    }
    assert.ok(diff(draw(0.125, r), draw(0.375, r)) > 0, 'the lines move with t');
    // a line crosses from the left edge to the right over one turn
    const mid = (t) => { const xs = cellsOf(draw(t, r, { count: 1 })).filter((c) => c[1] === 14).map((c) => c[0]); assert.equal(xs.length, 1); return xs[0]; };
    const path = [0.0625, 0.25, 0.5, 0.75, 0.9375].map(mid);
    for (let i = 1; i < path.length; i++) assert.ok(path[i] > path[i - 1], `r ${r}: the line moves right (${path})`);
    assert.ok(path[0] <= 16 - r + 1 && path.at(-1) >= 16 + r - 2, 'from one edge to the other');
  }
  assert.ok(cellsOf(draw(0.3, 6, { count: 4 })).length > cellsOf(draw(0.3, 6)).length, 'count: more lines');
  assert.equal(count(draw(0.25, 6, { count: 1, dark: -1 }), tone(XP, -1)), 10, 'light and dark set the two tones');
  // it keeps to the box, and to the frame's 1 px border
  const boxed = new Surface(32, 32);
  meridians(boxed, 16, 14, 6, 0.3, XP, { box: [0, 0, 32, 14] });
  assert.ok(cellsOf(boxed).length > 0 && cellsOf(boxed).every((c) => c[1] < 14));
  const edge = new Surface(12, 12);
  meridians(edge, 6, 6, 6, 0, XP);
  assert.ok(cellsOf(edge).length > 0 && cellsOf(edge).every(([x, y]) => x >= 1 && y >= 1 && x < 11 && y < 11));
});
