// engine/inputs-shoulder.js: shoulderButton with a fixed base, curved trigger, stepped end, light edge and tidy edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Surface } from '../../engine/surface.js';
import { col, tone } from '../../engine/color.js';
import { shoulderButton as plain } from '../../engine/inputs.js';
import { shoulderButton } from '../../engine/inputs-shoulder.js';

const BODY = '#5d6475', GLOW = '#e6c545';
const same = (a, b) => a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);
const rows = (g) => { const out = []; for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) { out.push(y); break; } return out; };
const bottom = (g) => { for (let y = g.h - 1; y >= 0; y--) for (let x = 0; x < g.w; x++) if (g.get(x, y)) return y; return -1; };
const top = (g) => { for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y)) return y; return -1; };

for (const kind of ['bumper', 'trigger']) for (const side of ['left', 'right']) for (const style of ['rounded', 'angled']) for (const down of [false, true]) {
  test(`shoulderButton ${kind} ${side} ${style} ${down ? 'down' : 'up'} without new options draws what inputs.js draws`, () => {
    const a = new Surface(32, 32), b = new Surface(32, 32);
    const [w, h] = kind === 'trigger' ? [14, 22] : [26, 9];
    const o = { kind, side, style, body: BODY, glow: GLOW, down };
    assert.deepEqual(shoulderButton(a, 3, 4, w, h, o), plain(b, 3, 4, w, h, o));
    assert.ok(same(a, b));
  });
}

for (const kind of ['bumper', 'trigger']) {
  test(`shoulderButton ${kind} with base 'fixed': pressing sinks the face 2 px and keeps the bottom edge`, () => {
    const [w, h] = kind === 'trigger' ? [14, 22] : [26, 9];
    const o = { kind, body: BODY, glow: GLOW, base: 'fixed', back: 'curved', end: 'stepped', rim: true, tidy: true, pivot: kind === 'trigger' ? 3 : 0 };
    const up = new Surface(32, 32), dn = new Surface(32, 32);
    const fu = shoulderButton(up, 3, 4, w, h, o), fd = shoulderButton(dn, 3, 4, w, h, { ...o, down: true });
    assert.equal(fd.face.y - fu.face.y, 2);
    assert.equal(bottom(up), bottom(dn));
    if (kind === 'trigger') assert.equal(top(up), top(dn), 'the pivot stays');
    else assert.equal(top(dn) - top(up), 2, 'the face sinks');
    assert.equal(bottom(up), 4 + h - 1, 'fills the box down to its last row');
  });
}

test('shoulderButton rim lights the top row of the face, in a lighter tone of the lit colour', () => {
  const g = new Surface(32, 32);
  const { face } = shoulderButton(g, 3, 4, 26, 9, { body: BODY, glow: GLOW, base: 'fixed', end: 'stepped', rim: true });
  assert.equal(g.get(16, face.y), col(tone(GLOW, 0.85)));
  assert.equal(g.get(16, face.y + 1), col(GLOW));
});

test('shoulderButton stepped end insets the face 3-1-1 from the top and 1-2 to the foot', () => {
  const g = new Surface(32, 32);
  const { face } = shoulderButton(g, 0, 0, 26, 9, { body: BODY, glow: GLOW, base: 'fixed', end: 'stepped' });
  const first = (y) => { for (let x = 0; x < 32; x++) if (g.get(x, y) === col(GLOW)) return x; return -1; };
  assert.equal(face.h, 6);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(first), [3, 1, 1, 0, 1, 2]);
});

test('shoulderButton right is the left mirrored to the pixel', () => {
  const o = { kind: 'trigger', body: BODY, glow: GLOW, base: 'fixed', back: 'curved', rim: true, tidy: true, pivot: 3 };
  const a = new Surface(32, 32), b = new Surface(32, 32);
  shoulderButton(a, 9, 5, 14, 22, o); shoulderButton(b, 9, 5, 14, 22, { ...o, side: 'right' });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 14; x++) assert.equal(a.get(9 + x, y), b.get(9 + 13 - x, y));
});

test('shoulderButton tidy curved trigger: the front never steps back above its tip', () => {
  const g = new Surface(32, 40);
  shoulderButton(g, 0, 0, 16, 25, { kind: 'trigger', body: BODY, glow: GLOW, base: 'fixed', back: 'curved', tidy: true, pivot: 3 });
  const left = []; for (let y = 6; y < 22; y++) { let x = 0; while (x < 32 && !g.get(x, y)) x++; left.push(x); }
  const tip = left.indexOf(Math.min(...left));
  for (let j = 1; j <= tip; j++) assert.ok(left[j] <= left[j - 1], `row ${j}`);
  assert.ok(rows(g).length > 0);
});
