// Migration batch M6b (docs/data-sprites.md sections 7 and 9): the thicket imp, the seventh side-view character of M6,
// redrawn as data (sprites/thicket-imp.json, a rig of its own in a 48x48 frame: the imp floats and is posed on the
// humanoid rig's imp, rigs/humanoid.js impDims and drawImp, which base:person-side does not draw). Held against its frozen
// code copy (tests/fixtures/code-sprites/thicket-imp.js) at its defaults and at the ends of what it shows:
//   - the silhouette frame by frame, every clip
//   - Flap (how far the wings beat) and Float (how far it bobs) move it as the code's do (clip travel, build item F5)
//   - wings, horns, tail and eyes swap as the code's do; with no wings it rides a puff of glow
//   - the hex grows between its two raised hands; beaten, it turns to glow and leaves leaves behind
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, cleanParams, renderFrame, frameSockets } from '../../engine/sprite.js';
import { col, ramp } from '../../engine/color.js';
import { librarySprite, codeSprite } from '../helpers/library.mjs';

const DATA = await librarySprite('thicket-imp');
const CODE = await codeSprite('thicket-imp');
const look = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const frames = (s, clip) => Array.from({ length: s.clips[clip].frames }, (_, f) => f);
const tones = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep].map((x) => col(x)); };
function overlap(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.data.length; i++) { const p = a.data[i] >>> 24 ? 1 : 0, q = b.data[i] >>> 24 ? 1 : 0; both += p & q; either += p | q; }
  return either ? both / either : 1;
}
const changed = (s, clip, f, a, b) => { const x = renderFrame(s, clip, f, look(s, a)), y = renderFrame(s, clip, f, look(s, b)); let n = 0; for (let i = 0; i < x.data.length; i++) if (x.data[i] !== y.data[i]) n++; return n; };
const range = (xs) => Math.max(...xs) - Math.min(...xs);

test('the imp is a data file with the code imp\'s clips, frame and anchor', () => {
  assert.ok(DATA.definition, 'a data file');
  assert.deepEqual(Object.keys(DATA.clips), Object.keys(CODE.clips));
  assert.deepEqual([...DATA.size], [48, 48]);
  assert.deepEqual([...DATA.pivot], [...CODE.pivot]);
  assert.equal(!!DATA.grounded, false);
});

test('it keeps the code imp\'s silhouette frame by frame at its defaults, and with each wing, horn and tail', () => {
  for (const over of [{}, { wings: 'bat' }, { wings: 'moth' }, { wings: 'none' }, { horns: 'curled', tail: 'leafy' }, { horns: 'twig', tail: 'thin' }, { size: 1, belly: 1, ears: 1 }, { size: 0, belly: 0, ears: 0 }]) {
    let sum = 0, n = 0, low = 1, where = '';
    for (const clip of Object.keys(DATA.clips)) for (const f of frames(DATA, clip)) {
      const o = overlap(renderFrame(CODE, clip, f, look(CODE, over)), renderFrame(DATA, clip, f, look(DATA, over)));
      sum += o; n++;
      if (o < low) { low = o; where = `${clip} ${f}`; }
    }
    const want = Object.keys(over).length ? 0.66 : 0.74;
    assert.ok(sum / n >= want, `${JSON.stringify(over)}: the silhouettes overlap ${(sum / n).toFixed(3)} on average`);
    // die 5 to 7 are a few puffs and leaves in both: compared only on the body's frames
    assert.ok(low >= 0.3 || /^die [5-7]$/.test(where), `${JSON.stringify(over)}: ${where} overlaps the code's only ${low.toFixed(2)}`);
  }
});

test('Flap beats the wings wider and Float bobs it further, as the code\'s do', () => {
  // the wings' share of the picture that moves from frame to frame, and the body's bob (the mean row of its pixels)
  const wingTravel = (s, over) => { let n = 0; for (const f of frames(s, 'fly')) n += changed(s, 'fly', f, { ...over }, { ...over, wings: 'none' }); return n; };
  const bob = (s, over) => range(frames(s, 'idle').map((f) => { const g = renderFrame(s, 'idle', f, look(s, over)); let k = 0, sum = 0; for (let i = 0; i < g.data.length; i++) if (g.data[i] >>> 24) { k++; sum += Math.floor(i / g.w); } return sum / k; }));
  for (const [key, measure] of [['flap', null], ['bob', bob]]) {
    for (const s of [CODE, DATA]) {
      // every frame of the fly differs between the ends of the slider
      const diffs = frames(s, 'fly').map((f) => changed(s, 'fly', f, { [key]: 0 }, { [key]: 1 }));
      assert.ok(diffs.filter((d) => d > 0).length >= 6, `${s.definition ? 'data' : 'code'} ${key}: fly frames changed ${diffs.join(' ')}`);
    }
    if (measure) {
      const c = [0, 0.5, 1].map((v) => measure(CODE, { [key]: v })), d = [0, 0.5, 1].map((v) => measure(DATA, { [key]: v }));
      assert.ok(d[0] < d[1] && d[1] < d[2], `data ${key}: ${d.map((x) => x.toFixed(2))}`);
      for (const i of [0, 2]) assert.ok(Math.abs((d[i] - d[1]) - (c[i] - c[1])) <= 0.6, `${key} ${i}: data ${d.map((x) => x.toFixed(2))}, code ${c.map((x) => x.toFixed(2))}`);
    }
  }
  // the wings: how far the near wing's tip swings over the fly, wider with Flap as in the code
  const swing = (s, v) => range(frames(s, 'fly').map((f) => { const g = renderFrame(s, 'fly', f, look(s, { flap: v })), h = renderFrame(s, 'fly', f, look(s, { flap: v, wings: 'none' })); let top = 99; for (let i = 0; i < g.data.length; i++) if (g.data[i] !== h.data[i]) top = Math.min(top, Math.floor(i / g.w)); return top; }));
  assert.ok(swing(DATA, 1) > swing(DATA, 0), `data wing swing ${swing(DATA, 0)} to ${swing(DATA, 1)} (code ${swing(CODE, 0)} to ${swing(CODE, 1)})`);
});

test('wings, horns, tail and eyes each change the picture as much as the code\'s', () => {
  for (const [a, b] of [[{ wings: 'leaf' }, { wings: 'none' }], [{ wings: 'bat' }, { wings: 'moth' }], [{ horns: 'nubs' }, { horns: 'none' }], [{ horns: 'curled' }, { horns: 'twig' }], [{ tail: 'thin' }, { tail: 'none' }], [{ tail: 'leafy' }, { tail: 'thin' }], [{ eyes: 'wide' }, { eyes: 'angry' }], [{ wingSpan: 0.65 }, { wingSpan: 1.35 }], [{ ears: 0 }, { ears: 1 }]]) {
    const c = changed(CODE, 'idle', 0, a, b), d = changed(DATA, 'idle', 0, a, b);
    assert.ok(d >= 0.5 * c && d >= 6, `${JSON.stringify(a)} vs ${JSON.stringify(b)}: ${d} pixels; the code ${c}`);
  }
});

test('the hex grows between the two raised hands, and beaten it turns to glow and leaves leaves', () => {
  const p = look(DATA), glow = new Set(tones(p.glow));
  const lit = (clip, f) => { const g = renderFrame(DATA, clip, f, p); let n = 0; for (const v of g.data) if (glow.has(v)) n++; return n; };
  // cast: the glow between the hands grows from frame 1 to frame 4
  const ball = [1, 2, 3, 4].map((f) => lit('cast', f));
  assert.ok(ball[3] > ball[0] + 6, `cast: glow ${ball.join(' ')}`);
  const s = frameSockets(DATA, 'cast', 3, p);
  assert.ok(s.hand.y < s.head.y + 8 && s.offhand.y < s.head.y + 8, 'cast 3: both hands up');
  // die: on frame 4 it is all glow; on 6 and 7 only the leaves are left, low in the frame
  assert.ok(lit('die', 4) > 60, `die 4: ${lit('die', 4)} pixels of glow`);
  for (const f of [6, 7]) {
    const g = renderFrame(DATA, 'die', f, p), b = g.bounds();
    assert.ok(b && b.y1 - b.y0 < 20, `die ${f}: what is left spans ${b ? b.y1 - b.y0 + 1 : 0} rows`);
    const body = new Set(tones(p.body)); let leaf = 0; for (const v of g.data) if (body.has(v)) leaf++;
    assert.ok(leaf >= 4, `die ${f}: ${leaf} pixels of leaf`);
  }
});

test('with no wings it rides a puff of glow under its feet, as the code\'s does', () => {
  const p = look(DATA, { wings: 'none' }), glow = new Set(tones(p.glow));
  for (const f of [0, 3, 6]) {
    const g = renderFrame(DATA, 'idle', f, p), feet = frameSockets(DATA, 'idle', f, p).feet;
    let under = 0;
    for (let i = 0; i < g.data.length; i++) if (glow.has(g.data[i]) && Math.floor(i / g.w) >= feet.y - 6) under++;
    assert.ok(under >= 3, `idle ${f}: ${under} pixels of glow under the feet`);
  }
});

test('its attach points are the code imp\'s: back for the wings, head, tail, both hands', () => {
  const p = look(DATA), q = look(CODE);
  for (const clip of ['idle', 'fly', 'cast']) for (const f of frames(DATA, clip)) {
    const a = frameSockets(DATA, clip, f, p), b = frameSockets(CODE, clip, f, q);
    for (const k of ['back', 'head', 'tail', 'hand', 'offhand']) {
      assert.ok(a[k], `${clip} ${f}: ${k}`);
      assert.ok(Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y) <= 2, `${clip} ${f} ${k}: data ${a[k].x.toFixed(1)},${a[k].y.toFixed(1)}, code ${b[k].x.toFixed(1)},${b[k].y.toFixed(1)}`);
    }
  }
});
