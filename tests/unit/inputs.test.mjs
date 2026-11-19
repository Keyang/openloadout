// engine/inputs.js: keyboard keys, a mouse and generic controller parts for "press this" prompts
// (core-sprites-2, helper batch H1b).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col } from '../../engine/color.js';
import { KEY_MARKS, keyCap, keyMark, mouseBody, padButton, padCluster, dpadCross, stickTop, shoulderButton, motionMarks } from '../../engine/inputs.js';

const TOP = '#f0ead8', SIDE = '#3f3a52', GLOW = '#e6c545', BODY = '#6b7280', RING = '#b8b0a0';
const surf = (w = 48, h = 48) => new Surface(w, h);
const px = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) out.push([x, y]); return out; };
const count = (g, hex) => { const v = col(hex); return g.data.reduce((n, p) => n + (p === v ? 1 : 0), 0); };
const inBox = (g, x0, y0, x1, y1) => px(g).every(([x, y]) => x >= x0 && x < x1 && y >= y0 && y < y1);
const inRadius = (g, cx, cy, r) => px(g).every(([x, y]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r + 1e-9);
const bools = [false, true];

test('KEY_MARKS lists the nine key pictures and is frozen', () => {
  assert.deepEqual([...KEY_MARKS], ['none', 'up', 'down', 'left', 'right', 'enter', 'back', 'tab', 'shift']);
  assert.ok(Object.isFrozen(KEY_MARKS));
});

test('(1) every function stays inside the box or radius it was given, for every option', () => {
  for (const corner of [0, 0.5, 1]) for (const depth of [1, 2, 3, 4]) for (const down of bools) for (const [w, h] of [[20, 18], [26, 24], [44, 22], [60, 22]]) {
    const g = surf(70, 40); keyCap(g, 5, 7, w, h, { top: TOP, side: SIDE, corner, depth, down });
    assert.ok(inBox(g, 5, 7, 5 + w, 7 + h), `keyCap ${w}x${h} corner ${corner} depth ${depth} down ${down}`);
  }
  for (const kind of KEY_MARKS) for (const size of [5, 7, 9]) {
    const g = surf(); keyMark(g, kind, 20, 20, size, SIDE);
    const n = Math.floor(size / 2);
    assert.ok(inBox(g, 20 - n, 20 - n, 21 + n, 21 + n), `keyMark ${kind} ${size}`);
  }
  for (const shape of ['oval', 'slim']) for (const h of [16, 19, 22]) for (const button of ['left', 'right', 'middle', 'none']) for (const down of bools) for (const wheel of [-1, 0, 1]) for (const cable of bools) {
    const w = Math.round(h * 0.75), g = surf(32, 40);
    mouseBody(g, 16, 22, { w, h, shape, body: BODY, lit: GLOW, button, down, wheel, cable });
    const x0 = Math.round(16 - w / 2), y0 = Math.round(22 - h / 2);
    assert.ok(inBox(g, x0, y0 - (cable ? 8 : 0), x0 + w, y0 + h), `mouseBody h ${h} ${shape} ${button} down ${down} cable ${cable}`);
  }
  // the tallest mouse and its cable fill at most 30 px
  { const g = surf(32, 40); mouseBody(g, 16, 22, { w: 17, h: 22, cable: true }); const b = g.bounds(); assert.ok(b.y1 - b.y0 + 1 <= 30, `${b.y1 - b.y0 + 1}`); }
  for (const r of [4, 5.5, 10]) for (const depth of [1, 2, 4]) for (const down of bools) for (const lit of [undefined, GLOW]) {
    const g = surf(); padButton(g, 24, 24, r, { body: BODY, lit, depth, down });
    assert.ok(inRadius(g, 24, 24, r), `padButton r ${r} depth ${depth} down ${down}`);
  }
  for (const r of [4, 5, 6]) for (const gap of [0, 1, 2]) for (const lit of ['top', 'right', 'bottom', 'left', 'all', 'none']) for (const down of bools) {
    const g = surf(); padCluster(g, 24, 24, { r, gap, body: BODY, glow: GLOW, lit, depth: 2, down });
    assert.ok(inRadius(g, 24, 24, Math.ceil((2 * r + gap) / Math.SQRT2) + r), `padCluster r ${r} gap ${gap} ${lit}`);
  }
  for (const style of ['cross', 'discs', 'round']) for (const [arm, thick] of [[6, 7], [8, 8], [5, 5]]) for (const lit of [[], ['up'], ['up', 'down', 'left', 'right']]) for (const down of bools) for (const depth of [1, 2, 3]) {
    const g = surf(); dpadCross(g, 24, 24, { arm, thick, style, body: BODY, glow: GLOW, lit, depth, down });
    const E = thick / 2 + arm;
    assert.ok(inBox(g, Math.floor(24 - E), Math.floor(24 - E), Math.ceil(24 + E), Math.ceil(24 + E)), `dpadCross ${style} arm ${arm} thick ${thick} ${lit} down ${down} depth ${depth}`);
  }
  for (const r of [7, 9, 11]) for (const style of ['domed', 'ridged', 'flat']) for (const tilt of [[0, 0], [4, 0], [-3, 3], [0, -9]]) for (const down of bools) {
    const g = surf(); stickTop(g, 24, 24, { r, style, body: BODY, ring: RING, tilt, down });
    assert.ok(inRadius(g, 24, 24, r), `stickTop r ${r} ${style} tilt ${tilt} down ${down}`);
  }
  for (const kind of ['bumper', 'trigger']) for (const side of ['left', 'right']) for (const style of ['rounded', 'angled']) for (const lit of bools) for (const down of bools) for (const [w, h] of [[26, 11], [14, 24], [20, 16]]) {
    const g = surf(); shoulderButton(g, 6, 5, w, h, { kind, side, style, body: BODY, glow: GLOW, lit, down });
    assert.ok(inBox(g, 6, 5, 6 + w, 5 + h), `shoulderButton ${kind} ${side} ${style} ${w}x${h} down ${down}`);
  }
  for (const kind of ['up', 'down', 'left', 'right', 'up-down', 'left-right', 'all', 'spin', 'click']) for (const reach of [8, 12]) for (const size of [2, 3, 4]) for (let k = 0; k < 8; k++) {
    const g = surf(); motionMarks(g, 24, 24, kind, { reach, size, colour: GLOW, t: k / 8 });
    assert.ok(inRadius(g, 24, 24, reach + 1), `motionMarks ${kind} reach ${reach} size ${size} t ${k / 8}`);
    const b = surf(); motionMarks(b, 24, 24, kind, { reach, size, colour: GLOW, t: k / 8, box: [20, 20, 30, 30] });
    assert.ok(inBox(b, 20, 20, 30, 30), `motionMarks ${kind} box`);
  }
});

test('(2) keyCap: down moves the top face by exactly depth, and its text area is one colour inside the top face', () => {
  for (const depth of [1, 2, 3, 4]) for (const corner of [0, 0.5, 1]) {
    const up = surf(), dn = surf();
    const a = keyCap(up, 4, 4, 24, 22, { top: TOP, side: SIDE, corner, depth });
    const b = keyCap(dn, 4, 4, 24, 22, { top: TOP, side: SIDE, corner, depth, down: true });
    assert.equal(b.top.y - a.top.y, depth);
    const topPx = (g) => px(g).filter(([x, y]) => g.get(x, y) === col(TOP));
    assert.deepEqual(topPx(dn), topPx(up).map(([x, y]) => [x, y + depth]), `depth ${depth} corner ${corner}`);
    for (const [g, k] of [[up, a], [dn, b]]) {
      assert.ok(k.text.w >= 1 && k.text.h >= 1);
      assert.ok(k.text.x >= k.top.x && k.text.y >= k.top.y && k.text.x + k.text.w <= k.top.x + k.top.w && k.text.y + k.text.h <= k.top.y + k.top.h);
      for (let y = k.text.y; y < k.text.y + k.text.h; y++) for (let x = k.text.x; x < k.text.x + k.text.w; x++) assert.equal(g.get(x, y), col(TOP), `text (${x}, ${y}) depth ${depth} corner ${corner}`);
    }
  }
});

test('(3) keyMark draws every picture in 5 px or more, and no two pictures are the same', () => {
  for (const size of [5, 7, 9]) {
    const seen = new Map();
    for (const kind of KEY_MARKS.filter((k) => k !== 'none')) {
      const g = surf(); keyMark(g, kind, 20, 20, size, SIDE);
      const n = px(g).length;
      assert.ok(n >= 5, `${kind} ${size}: ${n} px`);
      const key = JSON.stringify(px(g));
      assert.ok(!seen.has(key), `${kind} and ${seen.get(key)} are the same at ${size}`);
      seen.set(key, kind);
    }
  }
  const g = surf(); keyMark(g, 'none', 20, 20, 7, SIDE); assert.equal(px(g).length, 0, 'none draws nothing');
  assert.throws(() => keyMark(surf(), 'A', 20, 20, 7, SIDE), /not one of/);
});

test('(4) padCluster: lighting top and lighting bottom differ only inside those two buttons', () => {
  for (const down of bools) {
    const a = surf(), b = surf();
    const { tops } = padCluster(a, 24, 24, { r: 5, gap: 1, body: BODY, glow: GLOW, lit: 'top', down });
    padCluster(b, 24, 24, { r: 5, gap: 1, body: BODY, glow: GLOW, lit: 'bottom', down });
    const D = Math.ceil(11 / Math.SQRT2);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      if (a.get(x, y) === b.get(x, y)) continue;
      const inTop = Math.hypot(x + 0.5 - 24, y + 0.5 - (24 - D)) <= 5, inBottom = Math.hypot(x + 0.5 - 24, y + 0.5 - (24 + D)) <= 5;
      assert.ok(inTop || inBottom, `(${x}, ${y}) differs outside the two buttons, down ${down}`);
    }
    assert.ok(count(a, GLOW) > 0 && count(a, GLOW) === count(b, GLOW));
    assert.ok(tops.top && tops.right && tops.bottom && tops.left);
  }
});

test('(5) dpadCross: lighting up and lighting down light the same number of pixels', () => {
  for (const style of ['cross', 'discs', 'round']) for (const down of bools) for (const depth of [1, 2, 3]) {
    const a = surf(), b = surf();
    dpadCross(a, 24, 24, { style, body: BODY, glow: GLOW, lit: ['up'], depth, down });
    dpadCross(b, 24, 24, { style, body: BODY, glow: GLOW, lit: ['down'], depth, down });
    assert.ok(count(a, GLOW) > 0, `${style}: nothing lit`);
    assert.equal(count(a, GLOW), count(b, GLOW), `${style} down ${down} depth ${depth}`);
  }
});

test('(6) stickTop: a tilt of [3, 0] moves the cap 3 px and leaves the base ring as it was', () => {
  for (const style of ['domed', 'ridged', 'flat']) for (const r of [9, 11]) {
    const a = surf(), b = surf();
    const ca = stickTop(a, 24, 24, { r, style, body: BODY, ring: RING }).cap;
    const cb = stickTop(b, 24, 24, { r, style, body: BODY, ring: RING, tilt: [3, 0] }).cap;
    assert.equal(cb.cx - ca.cx, 3); assert.equal(cb.cy, ca.cy);
    const ringPx = (g) => px(g).filter(([x, y]) => g.get(x, y) === col(RING));
    assert.ok(ringPx(a).length > 0);
    assert.deepEqual(ringPx(b), ringPx(a), `${style} r ${r}: the ring changed`);
    // the cap's pixels are the same pattern, 3 px on
    const capPx = (g, c) => px(g).filter(([x, y]) => Math.hypot(x + 0.5 - c.cx, y + 0.5 - c.cy) <= c.r).map(([x, y]) => [x - c.cx, y - c.cy, g.get(x, y)]);
    assert.deepEqual(capPx(b, cb), capPx(a, ca), `${style} r ${r}: the cap changed shape`);
  }
});

test('(7) motionMarks draws 6 px or more for every kind, the same at t = 0 and t = 1, and moves', () => {
  for (const kind of ['up', 'down', 'left', 'right', 'up-down', 'left-right', 'all', 'spin', 'click']) {
    const at = (t) => { const g = surf(); motionMarks(g, 24, 24, kind, { reach: 12, size: 3, colour: GLOW, t }); return g; };
    assert.ok(px(at(0)).length >= 6, `${kind}: ${px(at(0)).length} px`);
    assert.deepEqual(at(1).data, at(0).data, kind);
    assert.notDeepEqual(at(0.5).data, at(0).data, `${kind} does not move`);
  }
  assert.throws(() => motionMarks(surf(), 24, 24, 'shake'), /not one of/);
});

test('(8) shoulderButton: the right one is the left one mirrored to the pixel', () => {
  for (const kind of ['bumper', 'trigger']) for (const style of ['rounded', 'angled']) for (const lit of bools) for (const down of bools) for (const [w, h] of [[26, 11], [14, 24]]) {
    const L = surf(), R = surf();
    const fl = shoulderButton(L, 6, 5, w, h, { kind, side: 'left', style, body: BODY, glow: GLOW, lit, down }).face;
    const fr = shoulderButton(R, 6, 5, w, h, { kind, side: 'right', style, body: BODY, glow: GLOW, lit, down }).face;
    assert.ok(px(L).length > 20, `${kind} ${w}x${h}: ${px(L).length} px`);
    for (let y = 0; y < 48; y++) for (let x = 6; x < 6 + w; x++) assert.equal(R.get(6 + w - 1 - (x - 6), y), L.get(x, y), `${kind} ${style} (${x}, ${y})`);
    assert.equal(fr.x, 6 + w - (fl.x - 6) - fl.w); assert.equal(fr.w, fl.w);
  }
  // down moves it 2 px
  const a = surf(), b = surf();
  shoulderButton(a, 6, 5, 26, 11, { body: BODY, glow: GLOW });
  shoulderButton(b, 6, 5, 26, 11, { body: BODY, glow: GLOW, down: true });
  assert.deepEqual(px(b), px(a).map(([x, y]) => [x, y + 2]));
});

test('mouseBody: the chosen button is lit, down lowers it 1 px, and the wheel rolls', () => {
  const at = (o) => { const g = surf(32, 40); const r = mouseBody(g, 16, 22, { body: BODY, lit: GLOW, ...o }); return [g, r]; };
  const [l, rl] = at({ button: 'left' }), [r] = at({ button: 'right' }), [n] = at({ button: 'none' }), [m] = at({ button: 'middle' });
  assert.ok(count(l, GLOW) > 10 && count(l, GLOW) === count(r, GLOW), `${count(l, GLOW)} / ${count(r, GLOW)}`);
  assert.equal(count(n, GLOW), 0);
  assert.ok(count(m, GLOW) > 0);
  const litPx = (g) => px(g).filter(([x, y]) => g.get(x, y) === col(GLOW));
  const [ld] = at({ button: 'left', down: true });
  assert.ok(Math.min(...litPx(ld).map(([, y]) => y)) === Math.min(...litPx(l).map(([, y]) => y)) + 1, 'down: the lit button starts 1 px lower');
  const [wm] = at({ wheel: -1 }), [w0] = at({ wheel: 0 }), [w1] = at({ wheel: 1 });
  assert.notDeepEqual(w0.data, w1.data, 'wheel 0 vs 1');
  assert.notDeepEqual(wm.data, w0.data, 'wheel -1 vs 0');
  assert.notDeepEqual(wm.data, w1.data, 'wheel -1 vs 1');
  assert.ok(rl.buttons.left.w > 0 && rl.buttons.right.w > 0 && rl.buttons.wheel.h === 4);
  // the cable is exactly 8 px tall, above the body
  const [cab] = at({ cable: true }), top = l.bounds().y0;
  const above = px(cab).filter(([, y]) => y < top);
  assert.equal(new Set(above.map(([, y]) => y)).size, 8);
  assert.equal(Math.min(...above.map(([, y]) => y)), top - 8);
});
