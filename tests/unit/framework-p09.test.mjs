// Framework additions made with batch P09 (platformer props: chest, lever, banner, crate, signpost):
//   engine/surface.js  tilt       a Surface leaned by a small angle with whole-row and whole-column slides
//   engine/surface.js  lean       a Surface leaned by sliding rows only (posts, poles)
//   engine/fx.js       chunks     solid bars thrown up and out that land flat on a floor row
//   engine/fx.js       rays       dashed beams of light fanning from a point
//   engine/marks.js    MARKS, markIn, drawMark    small picture marks (star, skull, leaf, ...)
//   engine/cloth.js    flag       a flag flying from a pole, with folds that travel along the cloth
//   engine/shapes.js   clippedIn  a shape test kept only inside a box (the upper half of a rounded box: a chest lid)
//   engine/surface.js  leanRoom   the steepest lean() a picture can take and keep clear of the frame's sides
// Also pinned here, as the crate uses it: cropped (engine/surface.js, added with batch S14) cuts a layer in two.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface, tilt, lean, leanRoom, cropped, ellipseIn } from '../../engine/surface.js';
import { clippedIn, insetIn } from '../../engine/shapes.js';
import { squircleIn } from '../../engine/solids.js';
import { chunks, rays, steps } from '../../engine/fx.js';
import { MARKS, markIn, drawMark } from '../../engine/marks.js';
import { flag } from '../../engine/cloth.js';
import { ramp, col } from '../../engine/color.js';
import { PI } from '../../engine/motion.js';

const lit = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const same = (a, b) => a.data.every((v, i) => v === b.data[i]);
const ts = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

// ---- tilt ---------------------------------------------------------------------

test('tilt by nothing is a plain copy, and the original is left alone', () => {
  const g = new Surface(32, 32).rect(10, 8, 12, 20, ramp('#a06a3c'));
  const before = Uint32Array.from(g.data);
  const out = tilt(g, 16, 28, 0);
  assert.notEqual(out, g);
  assert.ok(same(out, g));
  tilt(g, 16, 28, 0.2);
  assert.deepEqual(g.data, before);
});

test('tilt keeps every pixel and leans the top the way the angle says', () => {
  const g = new Surface(40, 40).rect(14, 8, 12, 24, '#a06a3c');
  for (const a of [-0.2, -0.08, 0.08, 0.2]) {
    const out = tilt(g, 20, 32, a);
    assert.equal(lit(out), lit(g), `angle ${a}: pixel count`);
    const top = [], foot = [];
    for (let x = 0; x < 40; x++) { if (out.get(x, out.bounds().y0 + 2)) top.push(x); if (out.get(x, 31)) foot.push(x); }
    const mid = (l) => (l[0] + l.at(-1)) / 2;
    assert.ok(Math.sign(mid(top) - mid(foot)) === Math.sign(a), `angle ${a}: the top leans ${a > 0 ? 'right' : 'left'} (top ${mid(top)}, foot ${mid(foot)})`);
    assert.ok(Math.abs(mid(foot) - 19.5) <= 2, `angle ${a}: the foot stays put (${mid(foot)})`);
  }
});

test('tilt moves the far end by about distance x angle', () => {
  const g = new Surface(48, 48).rect(23, 4, 2, 40, '#ffffff');
  const out = tilt(g, 24, 44, 0.1);
  const b = out.bounds();
  assert.ok(b.x1 >= 27 && b.x1 <= 29, `top moved to ${b.x1}`);
});

test('lean slides rows only: the foot row stays, the top moves by height x slope, every row keeps its width', () => {
  const g = new Surface(40, 40).rect(19, 5, 3, 30, '#a06a3c');
  const out = lean(g, 35, 0.1);
  assert.equal(lit(out), lit(g));
  assert.ok(out.get(19, 34) && out.get(21, 34) && !out.get(22, 34), 'the foot row has not moved');
  assert.ok(out.get(22, 5) && out.get(24, 5) && !out.get(21, 5), 'the top row moved 3 px right');
  for (let y = 5; y < 35; y++) { let n = 0; for (let x = 0; x < 40; x++) if (out.get(x, y)) n++; assert.equal(n, 3, `row ${y} is still 3 px wide`); }
  assert.ok(same(lean(g, 35, 0), g));
  const left = lean(g, 35, -0.1);
  assert.ok(left.get(16, 5) && !left.get(19, 5));
});

// ---- chunks -------------------------------------------------------------------

const plank = (g, t, extra = {}) => chunks(g, { t, x: 16, y: 20, count: 6, seed: 3, dist: 12, rise: 10, size: 6, thick: 2, floor: 29, colour: '#a06a3c', ...extra });

test('chunks: same input, same pixels; never empty; stays inside the 1 px border', () => {
  for (const t of ts) {
    const a = new Surface(32, 32), b = new Surface(32, 32);
    plank(a, t); plank(b, t);
    assert.ok(same(a, b), `t=${t} repeatable`);
    assert.ok(lit(a) >= 2, `t=${t}: something is drawn`);
    const bb = a.bounds();
    assert.ok(bb.x0 >= 1 && bb.y0 >= 1 && bb.x1 <= 30 && bb.y1 <= 30, `t=${t}: inside the border (${JSON.stringify(bb)})`);
  }
});

test('chunks fly up and out, then lie on the floor row', () => {
  const at = (t) => { const g = new Surface(32, 32); plank(g, t); return g.bounds(); };
  const start = at(0), high = at(0.3), end = at(1);
  assert.ok(high.y0 < start.y0, `they rise: top ${start.y0} -> ${high.y0}`);
  assert.ok(end.x1 - end.x0 > start.x1 - start.x0, 'they spread sideways');
  assert.equal(end.y1, 29, 'the last frame rests on the floor row');
  assert.ok(end.y0 >= 29 - 3, `and lies flat: nothing higher than 3 px above the floor (top ${end.y0})`);
});

test('chunks: count changes how many, a different seed changes the pattern', () => {
  const few = new Surface(32, 32), many = new Surface(32, 32), other = new Surface(32, 32);
  plank(few, 0.4, { count: 3 }); plank(many, 0.4, { count: 10 }); plank(other, 0.4, { count: 3, seed: 8 });
  assert.ok(lit(many) > lit(few));
  assert.ok(!same(few, other));
});

// ---- rays ---------------------------------------------------------------------

test('rays fan out from a point, hottest near it, and stay in the box', () => {
  const C = steps('#f2c230');
  const g = new Surface(32, 32);
  rays(g, { x: 16, y: 20, count: 5, angle: PI, arc: PI / 2, r0: 2, r1: 14, colours: C });
  assert.ok(lit(g) >= 10);
  const b = g.bounds();
  assert.ok(b.y1 <= 20 && b.y0 >= 1, `upward only: ${JSON.stringify(b)}`);
  assert.ok(b.x0 >= 1 && b.x1 <= 30);
  const boxed = new Surface(32, 32);
  rays(boxed, { x: 16, y: 20, count: 5, angle: PI, arc: PI / 2, r0: 2, r1: 30, colours: C, box: [8, 8, 24, 24] });
  const bb = boxed.bounds();
  assert.ok(bb.x0 >= 8 && bb.y0 >= 8 && bb.x1 < 24 && bb.y1 < 24);
});

test('rays: longer rays light more pixels; the dashes travel with phase and repeat every whole phase', () => {
  const draw = (o) => { const g = new Surface(32, 32); rays(g, { x: 16, y: 28, count: 4, angle: PI, arc: PI / 3, r0: 2, colour: '#4fd8ee', dash: 3, gap: 2, ...o }); return g; };
  assert.ok(lit(draw({ r1: 20 })) > lit(draw({ r1: 8 })));
  assert.ok(!same(draw({ r1: 16, phase: 0 }), draw({ r1: 16, phase: 0.4 })));
  assert.ok(same(draw({ r1: 16, phase: 0.25 }), draw({ r1: 16, phase: 1.25 })));
  assert.equal(lit(draw({ r1: 2 })), 0, 'no length, no rays');
});

// ---- marks --------------------------------------------------------------------

test('every mark draws at 5, 7 and 9 px, inside its box, and no two are the same picture', () => {
  assert.ok(MARKS.length >= 6);
  for (const size of [5, 7, 9]) {
    const seen = new Map();
    for (const name of MARKS) {
      const g = new Surface(15, 15);
      drawMark(g, name, 7, 7, size, '#231b33');
      const b = g.bounds();
      assert.ok(b, `${name} at ${size}px draws`);
      const r = (size - 1) / 2;
      assert.ok(b.x0 >= 7 - r && b.x1 <= 7 + r && b.y0 >= 7 - r && b.y1 <= 7 + r, `${name} at ${size}px stays in its ${size}x${size} box: ${JSON.stringify(b)}`);
      assert.ok(lit(g) >= size - 1, `${name} at ${size}px has ${lit(g)} pixels`);
      const key = Array.from(g.data, (v) => (v ? 1 : 0)).join('');
      for (const [other, k] of seen) {
        let diff = 0;
        for (let i = 0; i < k.length; i++) if (k[i] !== key[i]) diff++;
        assert.ok(diff > 2, `${name} and ${other} differ by only ${diff} pixels at ${size}px`);
      }
      seen.set(name, key);
    }
  }
});

test('markIn: flip mirrors a mark, turn points the arrow, an unknown name throws', () => {
  const draw = (opt) => { const g = new Surface(11, 11); g.fill(0, 0, 11, 11, markIn('arrow', 5, 5, 9, opt), '#ffffff'); return g; };
  const right = draw({}), left = draw({ flip: true }), up = draw({ turn: 3 });
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    assert.equal(!!right.get(x, y), !!left.get(10 - x, y), `mirrored at ${x},${y}`);
    assert.equal(!!right.get(x, y), !!up.get(y, 10 - x), `quarter turn at ${x},${y}`);
  }
  // the point of the arrow is on the right: its right-most column has one pixel
  let tip = 0;
  for (let y = 0; y < 11; y++) if (right.get(right.bounds().x1, y)) tip++;
  assert.equal(tip, 1);
  assert.throws(() => markIn('nonsense', 5, 5, 7), /star/);
});

test('the skull keeps two eye holes at 7 px and 9 px', () => {
  for (const size of [7, 9]) {
    const g = new Surface(15, 15);
    drawMark(g, 'skull', 7, 7, size, '#f0ead8');
    // holes: see-through pixels with the mark on both sides in their row
    let holes = 0;
    for (let y = 0; y < 15; y++) for (let x = 1; x < 14; x++) {
      if (g.get(x, y)) continue;
      let l = false, r = false;
      for (let i = 0; i < x; i++) l = l || !!g.get(i, y);
      for (let i = x + 1; i < 15; i++) r = r || !!g.get(i, y);
      if (l && r) holes++;
    }
    assert.ok(holes >= 2, `${size}px skull has ${holes} hole pixels`);
  }
});

// ---- flag ---------------------------------------------------------------------

const fly = (g, t, extra = {}) => flag(g, { x: 10, y: 6, length: 18, height: 12, t, paint: ramp('#3f6fd1'), ...extra });

test('flag: the hoist column stays on the pole and the loop closes', () => {
  for (const shape of ['banner', 'pennant', 'swallowtail']) {
    const frames = ts.slice(0, 8).map((t) => { const g = new Surface(40, 32); fly(g, t, { shape }); return g; });
    for (const g of frames) {
      assert.ok(g.get(10, 6) && g.get(10, 17), `${shape}: the hoist column runs from y to y + height - 1`);
      assert.ok(!g.get(9, 10), `${shape}: nothing left of the hoist`);
    }
    const wrap = new Surface(40, 32); fly(wrap, 1, { shape });
    assert.ok(same(wrap, frames[0]), `${shape}: t = 1 equals t = 0`);
    assert.ok(!same(frames[0], frames[2]), `${shape}: it moves`);
  }
});

test('flag: the three shapes have different outlines', () => {
  const draw = (shape) => { const g = new Surface(40, 32); fly(g, 0, { shape, amp: 0 }); return g; };
  const b = draw('banner'), p = draw('pennant'), s = draw('swallowtail');
  assert.equal(lit(b), 18 * 12);
  assert.ok(lit(p) < lit(b) * 0.7, 'a pennant tapers');
  assert.ok(lit(s) < lit(b) && lit(s) > lit(p), 'a swallowtail has a notch cut out');
  assert.ok(!s.get(27, 12) && s.get(27, 6) && s.get(27, 17), 'the notch is at the fly end, between two tails');
  assert.ok(p.get(27, 11) || p.get(27, 12), 'the pennant ends in a point at mid height');
});

test('flag: more amp moves the fly end further; marks ride the cloth; it reports where the cloth is', () => {
  const span = (amp) => { let lo = 99, hi = -99; for (const t of ts) { const g = new Surface(40, 40); const f = flag(g, { x: 10, y: 14, length: 18, height: 10, t, amp, paint: ramp('#c9423a') }); lo = Math.min(lo, f.offset(1)); hi = Math.max(hi, f.offset(1)); } return hi - lo; };
  assert.ok(span(3) > span(1));
  const g = new Surface(40, 32);
  const f = fly(g, 0.3, { amp: 3, marks: [{ inside: (px, py) => Math.abs(px - 19) < 2 && Math.abs(py - 12) < 2, paint: '#f2c230' }] });
  const gold = col('#f2c230');
  const ys = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 40; x++) if (g.get(x, y) === gold) ys.push(y);
  assert.ok(ys.length >= 8, `the mark is printed (${ys.length} px)`);
  const [ax, ay] = f.at(0.5, 0.5);
  assert.ok(Math.abs(ax - 19) <= 1 && Math.abs(ay - (12 + f.offset(0.5))) <= 1, `at(0.5, 0.5) is the middle of the waving cloth: ${ax}, ${ay}`);
  assert.ok(g.get(Math.floor(ax), Math.floor(ay)), 'and that pixel is cloth');
});

// ---- clippedIn ------------------------------------------------------------------

test('clippedIn keeps a shape only inside the box: x0 <= px < x1 and y0 <= py < y1', () => {
  const disc = ellipseIn(16, 16, 10, 10);
  const part = clippedIn(disc, 12, 8, 20, 16);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const px = x + 0.5, py = y + 0.5;
    assert.equal(part(px, py), disc(px, py) && x >= 12 && x < 20 && y >= 8 && y < 16, `at ${x},${y}`);
  }
  assert.ok(!part(16.5, 16.5) && part(16.5, 15.5), 'the far edges are left out, the near ones kept');
});

test('clippedIn: a side given as -Infinity or Infinity has no limit, and an empty box keeps nothing', () => {
  const disc = ellipseIn(16, 16, 10, 10);
  const upper = clippedIn(disc, -Infinity, -Infinity, Infinity, 16);
  const g = new Surface(32, 32).fill(0, 0, 32, 32, upper, '#a06a3c');
  const all = new Surface(32, 32).fill(0, 0, 32, 32, disc, '#a06a3c');
  assert.equal(lit(g) * 2, lit(all), 'the upper half of a disc is half of it');
  assert.equal(g.bounds().y1, 15);
  assert.equal(lit(new Surface(32, 32).fill(0, 0, 32, 32, clippedIn(disc, 10, 10, 10, 20), '#a06a3c')), 0);
});

test('clippedIn of a rounded box is a domed lid: flat foot, shoulders that square up with the power, and it nests in insetIn', () => {
  const lid = (power) => clippedIn(squircleIn(16, 19.5, 11, 6, power), -Infinity, 14, Infinity, 20);
  const draw = (t) => new Surface(32, 32).fill(0, 0, 32, 32, t, '#a06a3c');
  const round = draw(lid(2.3)), boxy = draw(lid(7));
  for (const g of [round, boxy]) { const b = g.bounds(); assert.deepEqual([b.y0, b.y1, b.x0, b.x1], [14, 19, 5, 26], 'six rows tall, standing on row 19, full width at the foot'); }
  assert.ok(lit(boxy) > lit(round), 'a higher power fills the shoulders');
  assert.ok(!round.get(6, 14) && boxy.get(7, 14));
  const inner = draw(insetIn(lid(7), 2));
  assert.ok(lit(inner) > 0 && lit(inner) < lit(boxy));
  assert.equal(inner.bounds().y1, 17, 'the inset stops 2 px above the flat foot');
});

// ---- cropped, as a thing that splits in two uses it --------------------------------

test('cropped: the two halves of a layer are apart, lose nothing and gain nothing', () => {
  const whole = new Surface(32, 32).rect(7, 11, 19, 19, ramp('#a06a3c'), { shade: 2, light: 1 });
  const left = cropped(whole, 0, 0, 16, 32), right = cropped(whole, 16, 0, 32, 32);
  assert.equal(lit(left) + lit(right), lit(whole));
  assert.equal(left.bounds().x1, 15);
  assert.equal(right.bounds().x0, 16);
  const back = new Surface(32, 32).blit(left).blit(right);
  assert.ok(same(back, whole), 'put back together they are the layer again');
});

// ---- leanRoom -------------------------------------------------------------------

test('leanRoom: the steepest lean that keeps the picture `margin` px from both sides', () => {
  // a post 3 px wide and 30 px tall in a 40 px frame: columns 19..21, rows 5..34, foot row py = 35
  const post = new Surface(40, 40).rect(19, 5, 3, 30, '#a06a3c');
  const k = leanRoom(post, 35, 2);
  assert.equal(k, Math.min(19 - 2, 40 - 2 - 1 - 21) / (35 - 5), 'the nearer side decides: 16 px of room over 30 px of height');
  for (const dir of [1, -1]) {
    const b = lean(post, 35, dir * k).bounds();
    assert.ok(b.x0 >= 2 && b.x1 <= 37, `leaned ${dir > 0 ? 'right' : 'left'} as far as it goes it still keeps 2 px: ${JSON.stringify(b)}`);
  }
  const over = lean(post, 35, k * 1.3).bounds();
  assert.ok(over.x1 > 37, 'any steeper and it would not');
  assert.ok(leanRoom(post, 35, 6) < k, 'a wider margin leaves less room');
});

test('leanRoom: a wide top leaves less room than a thin one; nothing drawn, or nothing above the foot, is 0', () => {
  const thin = new Surface(32, 48).rect(15, 10, 3, 36, '#a06a3c');
  const sign = new Surface(32, 48).rect(15, 10, 3, 36, '#a06a3c').rect(5, 12, 22, 10, '#a06a3c');
  assert.ok(leanRoom(sign, 46) < leanRoom(thin, 46));
  assert.equal(leanRoom(sign, 46), (5 - 2) / (46 - 10), 'the default margin is 2 px: the outline and the empty border');
  assert.equal(leanRoom(new Surface(32, 48), 46), 0);
  assert.equal(leanRoom(thin, 10), 0);
  const before = Uint32Array.from(sign.data);
  leanRoom(sign, 46);
  assert.deepEqual(sign.data, before, 'the picture is only measured');
});
