// engine/bubbles.js (batch H5a, bundles/specs/core-sprites-3.md): speech and thought bubbles, name plates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, INK } from '../../engine/color.js';
import { PALETTE } from '../../engine/palettes.js';
import { contrastFaults } from '../../engine/ui.js';
import { defineSprite, choice, color, range, toggle } from '../../engine/sprite.js';
import { skinSwatches } from '../../engine/ui-skins.js';
import {
  SPEECH_STYLES, THOUGHT_STYLES, TAIL_DIRS, TRAIL_DIRS, PLATE_STYLES,
  speechBubble, bubbleTail, thoughtBubble, bubbleGrow, namePlate, plateNotch,
} from '../../engine/bubbles.js';

const P = PALETTE.thornwood, H = PALETTE.hearthvale, D = PALETTE.derelict;
const PAPER = { face: P.cream, frame: P.cavern, accent: P.thorn };
const PLATE = { face: P.cavern, frame: P.cream, accent: P.gold };

const only = (g, r, colour) => {
  const want = col(colour), seen = new Set();
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) seen.add(g.get(x, y));
  return seen.size === 1 && seen.has(want);
};
const draw = (fn, w, h, ...args) => { const g = new Surface(w, h); const out = fn(g, 1, 1, w - 2, h - 2, ...args); return { g, out }; };
const column = (g, x) => { let k = ''; for (let y = 0; y < g.h; y++) k += g.get(x, y) + ','; return k; };
const row = (g, y) => { let k = ''; for (let x = 0; x < g.w; x++) k += g.get(x, y) + ','; return k; };
const same = (a, b) => a.w === b.w && a.h === b.h && a.data.every((v, i) => v === b.data[i]);
// The picture with its middle columns (between the slice) cut down to one: what nine-slicing would repeat.
function squeezeCols(g, left, right) {
  const keep = [];
  for (let x = 0; x < g.w; x++) if (x <= left || x >= g.w - right) keep.push(x);
  return keep.map((x) => column(g, x)).join('|');
}
function squeezeRows(g, top, bottom) {
  const keep = [];
  for (let y = 0; y < g.h; y++) if (y <= top || y >= g.h - bottom) keep.push(y);
  return keep.map((y) => row(g, y)).join('|');
}
// The middle columns and rows (between the slice, measured from the frame) are each identical.
function middleSame(g, s, { rows = true } = {}) {
  const L = s.left + 1, R = g.w - 1 - s.right - 1;
  for (let x = L; x <= R; x++) if (column(g, x) !== column(g, L)) return `column ${x} differs from ${L}`;
  if (rows) {
    const T = s.top + 1, B = g.h - 1 - s.bottom - 1;
    for (let y = T; y <= B; y++) if (row(g, y) !== row(g, T)) return `row ${y} differs from ${T}`;
  }
  return '';
}

test('the lists are frozen and as specified', () => {
  assert.deepEqual([...SPEECH_STYLES], ['round', 'box', 'shout']);
  assert.deepEqual([...THOUGHT_STYLES], ['cloud', 'puff', 'dream']);
  assert.deepEqual([...TAIL_DIRS], ['down-left', 'down-right', 'up-left', 'up-right', 'left', 'right']);
  assert.deepEqual([...TRAIL_DIRS], ['down-left', 'down-right', 'up-left', 'up-right', 'down']);
  assert.deepEqual([...PLATE_STYLES], ['plain', 'ribbon', 'pointed']);
  for (const l of [SPEECH_STYLES, THOUGHT_STYLES, TAIL_DIRS, TRAIL_DIRS, PLATE_STYLES]) assert.ok(Object.isFrozen(l));
  assert.throws(() => speechBubble(new Surface(96, 48), 1, 1, 94, 46, { ...PAPER, style: 'comic' }), /round, box, shout/);
  assert.throws(() => speechBubble(new Surface(96, 48), 1, 1, 94, 46, { ...PAPER, tail: 'down' }), /down-left/);
  assert.throws(() => thoughtBubble(new Surface(96, 48), 1, 1, 94, 46, { ...PAPER, trail: 'left' }), /down-left/);
  assert.throws(() => namePlate(new Surface(64, 16), 1, 1, 62, 14, { ...PLATE, style: 'scroll' }), /plain, ribbon, pointed/);
});

test('(1) every text area holds only the face colour', () => {
  for (const style of SPEECH_STYLES) for (const tail of [...TAIL_DIRS, 'none']) for (const border of [0, 1]) for (const corner of [0, 1]) for (const shadow of [false, true]) {
    const { g, out } = draw(speechBubble, 96, 48, { ...PAPER, style, tail, border, corner, shadow });
    assert.ok(out.inner.w > 0 && out.inner.h > 0, `${style} ${tail}`);
    assert.ok(only(g, out.inner, PAPER.face), `speech ${style} ${tail} border ${border} corner ${corner} shadow ${shadow}`);
  }
  for (const style of THOUGHT_STYLES) for (const trail of [...TRAIL_DIRS, 'none']) for (const shadow of [false, true]) for (const border of [0, 1]) {
    const { g, out } = draw(thoughtBubble, 96, 48, { ...PAPER, style, trail, shadow, border });
    assert.ok(out.inner.w > 0 && out.inner.h > 0, `${style} ${trail}`);
    assert.ok(only(g, out.inner, PAPER.face), `thought ${style} ${trail} shadow ${shadow} border ${border}`);
  }
  for (const style of PLATE_STYLES) for (const badge of [false, true]) for (const lit of [false, true]) for (const shadow of [false, true]) for (const border of [0, 1]) {
    const { g, out } = draw(namePlate, 64, 16, { ...PLATE, style, badge, lit, shadow, border });
    assert.ok(out.text.w > 0 && out.text.h > 0);
    assert.ok(only(g, out.text, PLATE.face), `plate ${style} badge ${badge} lit ${lit} shadow ${shadow} border ${border}`);
    if (badge) assert.ok(out.badgeText && out.badgeText.w >= 3 && only(g, out.badgeText, PLATE.face), `badge ${style}`);
    else assert.equal(out.badgeText, null);
  }
});

test('(2) stretching: the middle columns and rows repeat unchanged', () => {
  const speech = [];
  for (const style of SPEECH_STYLES) for (const tail of [...TAIL_DIRS, 'none']) for (const shadow of [false, true]) speech.push({ ...PAPER, style, tail, shadow, border: 0.5, corner: 0.5 });
  for (const opt of speech) {
    const a = draw(speechBubble, 96, 48, opt), wide = draw(speechBubble, 160, 48, opt), tall = draw(speechBubble, 96, 80, opt);
    const s = a.out.slice;
    for (const v of [a, wide, tall]) assert.equal(middleSame(v.g, v.out.slice), '', `speech ${opt.style} ${opt.tail} shadow ${opt.shadow} at ${v.g.w}x${v.g.h}`);
    assert.deepEqual(wide.out.slice, s); assert.deepEqual(tall.out.slice, s);
    assert.equal(squeezeCols(wide.g, s.left, s.right), squeezeCols(a.g, s.left, s.right), `speech ${opt.style} ${opt.tail} wide`);
    assert.equal(squeezeRows(tall.g, s.top, s.bottom), squeezeRows(a.g, s.top, s.bottom), `speech ${opt.style} ${opt.tail} tall`);
  }
  for (const style of THOUGHT_STYLES) for (const trail of [...TRAIL_DIRS, 'none']) for (const shadow of [false, true]) {
    const opt = { ...PAPER, style, trail, shadow };
    const a = draw(thoughtBubble, 96, 48, opt), wide = draw(thoughtBubble, 160, 48, opt), tall = draw(thoughtBubble, 96, 80, opt);
    if (trail === 'down') {
      // the one exception: a trail in the middle columns, for a small balloon that is never stretched
      assert.equal(a.out.slice, null);
      const T = a.out.inner.y, B = a.out.inner.y + a.out.inner.h - 1;
      for (let y = T; y <= B; y++) assert.equal(row(a.g, y), row(a.g, T), `thought down row ${y}`);
      continue;
    }
    const s = a.out.slice;
    for (const v of [a, wide, tall]) assert.equal(middleSame(v.g, v.out.slice), '', `thought ${style} ${trail} shadow ${shadow} at ${v.g.w}x${v.g.h}`);
    assert.equal(squeezeCols(wide.g, s.left, s.right), squeezeCols(a.g, s.left, s.right), `thought ${style} ${trail} wide`);
    assert.equal(squeezeRows(tall.g, s.top, s.bottom), squeezeRows(a.g, s.top, s.bottom), `thought ${style} ${trail} tall`);
  }
  for (const style of PLATE_STYLES) for (const badge of [false, true]) for (const lit of [false, true]) for (const shadow of [false, true]) {
    const opt = { ...PLATE, style, badge, lit, shadow };
    const a = draw(namePlate, 64, 16, opt), wide = draw(namePlate, 112, 16, opt);
    const s = a.out.slice;
    for (const v of [a, wide]) assert.equal(middleSame(v.g, v.out.slice, { rows: false }), '', `plate ${style} badge ${badge} lit ${lit} at ${v.g.w}`);
    assert.equal(squeezeCols(wide.g, s.left, s.right), squeezeCols(a.g, s.left, s.right), `plate ${style} badge ${badge} lit ${lit} wide`);
  }
});

test('(3) the tip is the outermost pixel in its direction, inside the frame; six tails, six pictures', () => {
  const pics = new Set();
  for (const tail of TAIL_DIRS) for (const shadow of [false, true]) {
    const { g, out } = draw(speechBubble, 96, 48, { ...PAPER, tail, shadow });
    const { x, y } = out.tip;
    assert.ok(x >= 1 && y >= 1 && x <= 94 && y <= 46, `${tail}: tip ${x},${y} inside the 1 px border`);
    assert.ok(g.get(x, y), `${tail}: the tip is drawn`);
    const b = new Surface(96, 48); speechBubble(b, 1, 1, 94, 46, { ...PAPER, tail, shadow: false });
    const bb = b.bounds();
    if (!shadow) {
      if (tail.startsWith('down')) assert.equal(y, bb.y1, tail);
      if (tail.startsWith('up')) assert.equal(y, bb.y0, tail);
      if (tail === 'left') assert.equal(x, bb.x0, tail);
      if (tail === 'right') assert.equal(x, bb.x1, tail);
      pics.add([...g.data].join(','));
    } else {
      // with shadow the body and tail sit in the box less the shadow (2 px off the left and bottom); the tip is the
      // outermost pixel of that unshadowed tail, and the shadow lies 2 px beyond it, down and to the left
      const u = new Surface(96, 48), uo = speechBubble(u, 3, 1, 92, 44, { ...PAPER, tail, shadow: false });
      const ub = u.bounds();
      assert.deepEqual(out.tip, uo.tip, `${tail}: the same tip as the unshadowed tail`);
      if (tail.startsWith('down')) assert.equal(y, ub.y1, `${tail} shadow`);
      if (tail.startsWith('up')) assert.equal(y, ub.y0, `${tail} shadow`);
      if (tail === 'left') assert.equal(x, ub.x0, `${tail} shadow`);
      if (tail === 'right') assert.equal(x, ub.x1, `${tail} shadow`);
    }
    const nb = g.bounds();
    assert.ok(nb.x0 >= 1 && nb.y0 >= 1 && nb.x1 <= 94 && nb.y1 <= 46, `${tail} shadow ${shadow}: nothing on the frame border`);
  }
  assert.equal(pics.size, 6);
  for (const trail of TRAIL_DIRS) {
    const { g, out } = draw(thoughtBubble, 96, 48, { ...PAPER, trail });
    assert.ok(g.get(out.tip.x, out.tip.y), `${trail}: the smallest puff's centre is drawn`);
    assert.equal(g.get(out.tip.x, out.tip.y), col(PAPER.face));
    const nb = g.bounds();
    assert.ok(nb.x0 >= 1 && nb.y0 >= 1 && nb.x1 <= 94 && nb.y1 <= 46, `${trail}: inside the frame`);
  }
});

test('small balloons (emote-bubbles sizes, border 0): inner and slice never negative; tight inner is the whole face', () => {
  const nonNeg = (r, what) => { for (const k of ['w', 'h']) assert.ok(r[k] >= 0, `${what}: inner.${k} ${r[k]}`); };
  for (let w = 22; w <= 28; w++) for (let h = 20; h <= 24; h++) {
    for (const style of SPEECH_STYLES) for (const shadow of [false, true]) for (const tight of [false, true]) {
      const g = new Surface(32, 32), out = speechBubble(g, 3, 2, w, h, { ...PAPER, style, tail: 'none', border: 0, shadow, tight });
      const what = `speech ${style} ${w}x${h} shadow ${shadow} tight ${tight}`;
      nonNeg(out.inner, what);
      for (const v of Object.values(out.slice)) assert.ok(v >= 0, `${what}: slice ${JSON.stringify(out.slice)}`);
      if (tight) {
        assert.ok(out.inner.w > 0 && out.inner.h > 0, what);
        assert.ok(only(g, out.inner, PAPER.face), what);
      }
    }
    for (const style of THOUGHT_STYLES) for (const trail of ['down', 'none']) for (const tight of [false, true]) {
      const g = new Surface(32, 32), out = thoughtBubble(g, 3, 2, w, h, { ...PAPER, style, trail, border: 0, tight });
      const what = `thought ${style} ${trail} ${w}x${h} tight ${tight}`;
      nonNeg(out.inner, what);
      if (out.slice) for (const v of Object.values(out.slice)) assert.ok(v >= 0, what);
      if (tight) {
        assert.ok(out.inner.w > 0 && out.inner.h > 0, what);
        assert.ok(only(g, out.inner, PAPER.face), what);
      }
    }
  }
  // the K24 Fit: a 25x22 round balloon at border 0 has a 21x18 tight inner (the balloon less 2 px each side), 18x16 at
  // 22x20 and 24x20 at 28x24
  for (const [w, h, iw, ih] of [[25, 22, 21, 18], [22, 20, 18, 16], [28, 24, 24, 20]]) {
    const g = new Surface(32, 32), out = speechBubble(g, 3, 2, w, h, { ...PAPER, tail: 'none', border: 0, tight: true });
    assert.deepEqual(out.inner, { x: 5, y: 4, w: iw, h: ih }, `${w}x${h}`);
  }
  // the K24 default cloud with its 'down' trail on 32x32: the cloud given 25x22 (rows 2 to 23), and given the room down
  // to row 30; a positive tight inner, the trail drawn, nothing below row 30 or on the frame's border
  for (const h of [22, 29]) {
    const g = new Surface(32, 32), out = thoughtBubble(g, 3, 2, 25, h, { ...PAPER, trail: 'down', border: 0, tight: true });
    assert.ok(out.inner.w >= 15 && out.inner.h >= 9, `cloud 25x${h}: inner ${JSON.stringify(out.inner)}`);
    assert.ok(only(g, out.inner, PAPER.face));
    const nb = g.bounds();
    assert.ok(nb.y1 <= 30 && nb.x0 >= 1 && nb.y0 >= 1 && nb.x1 <= 30, `cloud 25x${h}: ${JSON.stringify(nb)}`);
    assert.ok(g.get(out.tip.x, out.tip.y) === col(PAPER.face) && out.tip.y > out.body.y + out.body.h, 'the trail below the body');
    assert.ok(out.tip.y - (out.body.y + out.body.h) <= 6, 'the down trail is compact');
  }
});

test('(4) bubbleGrow opens from a 2x2 at the tip to the rectangle, never shrinking', () => {
  const rect = { x: 3, y: 2, w: 88, h: 36 };
  for (const tip of [{ x: 4, y: 45 }, { x: 90, y: 45 }, { x: 5, y: 1 }, { x: 0, y: 30 }, { x: 94, y: 30 }]) {
    const a = bubbleGrow(rect, tip, 0);
    assert.equal(a.w, 2); assert.equal(a.h, 2);
    assert.ok(tip.x >= a.x && tip.x < a.x + 2 && tip.y >= a.y && tip.y < a.y + 2, JSON.stringify({ tip, a }));
    assert.deepEqual(bubbleGrow(rect, tip, 1), rect);
    let prev = a;
    for (let i = 1; i <= 8; i++) {
      const r = bubbleGrow(rect, tip, i / 8);
      assert.ok(r.w >= prev.w && r.h >= prev.h, `step ${i}`);
      for (const v of [r.x, r.y, r.w, r.h]) assert.ok(Number.isInteger(v));
      prev = r;
    }
  }
});

test('(5) bubbleTail and plateNotch join a bubble or plate with no ink across the join', () => {
  for (const dir of ['down', 'down-left', 'down-right']) {
    const g = new Surface(96, 56);
    const out = speechBubble(g, 1, 1, 94, 46, { ...PAPER, tail: 'none', border: 0 });
    const band = out.body.y + out.body.h - 2, cx = 48;
    const t = bubbleTail(g, cx, band, { dir, ...PAPER });
    for (const y of [band - 1, band, band + 1]) assert.notEqual(g.get(cx, y), col(INK), `${dir}: row ${y}`);
    assert.equal(g.get(cx, band), col(PAPER.face)); assert.equal(g.get(cx, band + 1), col(PAPER.face));
    assert.ok(t.tip.y >= band + 4 && g.get(t.tip.x, t.tip.y), dir);
    assert.ok(t.rect.y === band && t.rect.h >= 5);
  }
  const lefts = ['down', 'down-left', 'down-right'].map((dir) => bubbleTail(new Surface(32, 32), 16, 10, { dir, ...PAPER }).tip.x);
  assert.ok(lefts[1] < lefts[0] && lefts[2] > lefts[0]);
  const g = new Surface(64, 24);
  const plate = namePlate(g, 1, 1, 62, 14, { ...PLATE, border: 0 });
  const band = plate.body.y + plate.body.h - 2;
  const n = plateNotch(g, 32, band, { ...PLATE });
  assert.notEqual(g.get(32, band + 1), col(INK));
  assert.ok(n.tip.y > band + 1 && g.get(n.tip.x, n.tip.y));
});

test('(6) fixture sprites with the bubble and plate lists have no contrast faults', () => {
  const BUB = skinSwatches('paper', { face: [P.cream, H.wheat, P.skin, P.steel, P.goblin], frame: [P.cavern, P.soil, D.plate, H.bandit] });
  const PL = skinSwatches('flat', { face: [P.cavern, P.soil, D.plate, H.bandit], frame: [P.cream, P.sky, P.goblin, P.steel, P.skin], accent: [P.gold, P.crimson, P.magic, P.moss, P.ember] });
  assert.deepEqual([BUB.failing, BUB.dropped, PL.failing, PL.dropped], [[], [], [], []]);
  const bubble = defineSprite({
    id: 'fixture-bubble', name: 'Fixture bubble', kind: 'Item', meta: { type: 'ui', role: 'interface/panel', view: 'none' },
    size: [96, 48], pivot: [48, 24], grounded: false,
    params: {
      style: choice('Style', 'round', [...SPEECH_STYLES]),
      shadow: toggle('Shadow', true),
      border: range('Border', 0.5, { lo: 'Thin', hi: 'Thick' }),
      face: color('Bubble', P.cream, BUB.face), frame: color('Line', P.cavern, BUB.frame),
    },
    clips: { bubble: { frames: 1, fps: 8, loop: true }, thought: { frames: 1, fps: 8, loop: true } },
    textArea(clip, p) {
      const out = clip === 'bubble' ? speechBubble(new Surface(96, 48), 1, 1, 94, 46, p) : thoughtBubble(new Surface(96, 48), 1, 1, 94, 46, { ...p, style: 'cloud' });
      return { ...out.inner, text: INK, edge: out.edge };
    },
    render(g, { clip, p }) { if (clip === 'bubble') speechBubble(g, 1, 1, 94, 46, p); else thoughtBubble(g, 1, 1, 94, 46, { ...p, style: 'cloud' }); },
  });
  assert.deepEqual(contrastFaults(bubble), []);
  const plate = defineSprite({
    id: 'fixture-plate', name: 'Fixture plate', kind: 'Item', meta: { type: 'ui', role: 'interface/panel', view: 'none' },
    size: [64, 16], pivot: [32, 15], grounded: false,
    params: {
      style: choice('Style', 'plain', [...PLATE_STYLES]),
      face: color('Plate', P.cavern, PL.face), frame: color('Band', P.cream, PL.frame), accent: color('Badge', P.gold, PL.accent),
    },
    clips: { plate: { frames: 1, fps: 8, loop: true }, 'plate-badge': { frames: 1, fps: 8, loop: true }, 'plate-lit': { frames: 1, fps: 8, loop: true } },
    textArea(clip, p) {
      const out = namePlate(new Surface(64, 16), 1, 1, 62, 14, { ...p, badge: clip === 'plate-badge', lit: clip === 'plate-lit', shadow: true });
      return clip === 'plate-badge' ? [{ ...out.text, edge: out.edge }, { ...out.badgeText, edge: out.edge }] : { ...out.text, edge: out.edge };
    },
    render(g, { clip, p }) { namePlate(g, 1, 1, 62, 14, { ...p, badge: clip === 'plate-badge', lit: clip === 'plate-lit', shadow: true }); },
  });
  assert.deepEqual(contrastFaults(plate), []);
});

test('(7) same arguments, same pixels', () => {
  const twice = (fn) => { const a = new Surface(96, 48), b = new Surface(96, 48); fn(a); fn(b); return same(a, b); };
  assert.ok(twice((g) => speechBubble(g, 1, 1, 94, 46, { ...PAPER, style: 'shout', tail: 'up-right', shadow: true })));
  assert.ok(twice((g) => thoughtBubble(g, 1, 1, 94, 46, { ...PAPER, style: 'dream', trail: 'down-right', shadow: true })));
  assert.ok(twice((g) => namePlate(g, 1, 1, 62, 14, { ...PLATE, style: 'ribbon', badge: true, lit: true })));
  assert.ok(twice((g) => bubbleTail(g, 40, 20, { dir: 'down-left', ...PAPER })));
  assert.ok(twice((g) => plateNotch(g, 40, 20, PLATE)));
});

test('styles and options show: each style differs from the others', () => {
  const pic = (fn, opt, w = 96, h = 48) => { const g = new Surface(w, h); fn(g, 1, 1, w - 2, h - 2, opt); return g; };
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
  for (const list of [[speechBubble, SPEECH_STYLES], [thoughtBubble, THOUGHT_STYLES]]) {
    const [fn, styles] = list, pics = styles.map((style) => pic(fn, { ...PAPER, style }));
    // dream is cloud plus a 2 px sparkle beside each top corner (the specification): 4 px apart; every other pair 12 or more
    for (let i = 0; i < pics.length; i++) for (let j = i + 1; j < pics.length; j++) assert.ok(diff(pics[i], pics[j]) >= (styles[i] === 'cloud' && styles[j] === 'dream' ? 4 : 12), `${styles[i]} vs ${styles[j]}`);
  }
  const plates = PLATE_STYLES.map((style) => pic(namePlate, { ...PLATE, style }, 64, 16));
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(diff(plates[i], plates[j]) >= 8, `${PLATE_STYLES[i]} vs ${PLATE_STYLES[j]}`);
  assert.ok(diff(pic(namePlate, { ...PLATE, lit: true }, 64, 16), pic(namePlate, PLATE, 64, 16)) >= 12, 'lit');
  assert.ok(diff(pic(speechBubble, { ...PAPER, shadow: true }), pic(speechBubble, PAPER)) >= 12, 'shadow');
  const dream = pic(thoughtBubble, { ...PAPER, style: 'dream' });
  let sparkles = 0; for (const v of dream.data) if (v === col(PAPER.accent)) sparkles++;
  assert.ok(sparkles >= 4, `dream sparkles ${sparkles}`);
});
