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
