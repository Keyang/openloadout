// The studio page's advice (docs/studio.md sections 4 and 6; Contract 14 rule 7; item S12). The quality bar's findings
// in everyday words, as advice only: nothing here blocks a change, the bag or a download. The pixel-art warnings are
// worked out from the definition and its frames: a shape too thin to draw, stray single pixels and pixels that show for
// one frame only (speckle), the drawing touching the frame's edge, and the fill band (half to three quarters of the
// frame along its longer side). Each says what it is about (a shape, a frame of an animation) so the page can select it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../../app/studio/advice.js';
import * as X from '../../app/studio/edit.js';
import { acceptChange } from '../../app/studio/keep.js';
import { Surface } from '../../engine/surface.js';
import { drawFrame } from '../../app/studio/draw.js';
import { validateDataSprite } from '../../engine/data-sprite.js';

const valid = (d, what) => { const v = validateDataSprite(d); assert.equal(v.ok, true, `${what}: ${v.errors.join('; ')}`); return v.value; };
const start = (id) => valid(X.startFrom(id, 'Test'), id);
/** Draws a frame as the studio does, with one pixel on its own in the top left corner (not on the edge row). */
const lonely = (def, clip, frame) => { const g = drawFrame(def, clip, frame); g.data[2 * g.w + 2] = 0xff2244ff; return g; };
const WORDS = /\b(params?|clip|pivot|metrics|render|threw|seed|preset|toggle|config)\b|`/i;

test('a shape too thin to draw is named, with what to do, and points at its shape', () => {
  const d = start('four-legs');
  assert.deepEqual(A.thinShapes(d), []);
  const limb = d.body.rig.shapes.find((s) => s.kind === 'limb');
  const thin = valid(X.setShape(d, limb.id, {}), 'same');
  thin.body.rig.shapes.find((s) => s.id === limb.id).width = 1;
  const v = valid(thin, 'thin limb');
  const w = A.thinShapes(v);
  assert.equal(w.length, 1);
  assert.equal(w[0].shape, limb.id);
  assert.equal(w[0].bone, limb.bone);
  assert.equal(w[0].kind, 'thin');
  assert.match(w[0].text, /thin/i);
  assert.match(w[0].text, /bigger|thicker/i);
  assert.doesNotMatch(w[0].text, WORDS);
  // a round shape whose narrow side is under a pixel across
  const cap = v.body.rig.shapes.find((s) => s.kind === 'capsule');
  cap.r = [0.6, 0.6];
  assert.ok(A.thinShapes(v).some((x) => x.shape === cap.id));
  // a dot is a detail: one pixel is right for it
  assert.ok(!A.thinShapes(v).some((x) => v.body.rig.shapes.find((s) => s.id === x.shape).kind === 'dot'));
  assert.deepEqual(A.thinShapes({ ...v, body: {} }), [], 'a definition with no bone rig has no shapes of its own');
});

test('stray single pixels: a drawn pixel with nothing drawn beside it', () => {
  const g = new Surface(16, 16);
  for (let y = 4; y < 8; y++) for (let x = 4; x < 8; x++) g.data[y * 16 + x] = 0xff2244ff;
  assert.deepEqual(A.strayPixels(g), []);
  g.data[12 * 16 + 12] = 0xff2244ff;
  g.data[2 * 16 + 9] = 0xff2244ff;
  assert.deepEqual(A.strayPixels(g), [[9, 2], [12, 12]]);
  // touching at a corner is still alone; touching a side is not
  g.data[3 * 16 + 10] = 0xff2244ff;
  assert.deepEqual(A.strayPixels(g).length, 3);
  g.data[2 * 16 + 10] = 0xff2244ff;
  assert.deepEqual(A.strayPixels(g), [[12, 12]]);
});

test('speckle: a few pixels that show on one frame only, with nothing near them on the frames either side', () => {
  const frame = (extra) => { const g = new Surface(16, 16); for (let y = 4; y < 10; y++) for (let x = 4; x < 10; x++) g.data[y * 16 + x] = 0xff2244ff; for (const [x, y] of extra) g.data[y * 16 + x] = 0xff2244ff; return g; };
  const frames = [frame([]), frame([[13, 2], [13, 3]]), frame([]), frame([])];
  const s = A.speckle(frames, { loop: true });
  assert.deepEqual(s.map((x) => x.length), [0, 2, 0, 0]);
  // the body moving by a pixel is not speckle
  const moving = [frame([]), frame([[10, 5], [10, 6]]), frame([[10, 5], [10, 6], [11, 5]]), frame([[10, 5]])];
  assert.deepEqual(A.speckle(moving, { loop: true }).map((x) => x.length), [0, 0, 0, 0]);
  // a one-shot's first and last frames have one neighbour
  assert.deepEqual(A.speckle([frame([[1, 1], [1, 2]]), frame([])], { loop: false }).map((x) => x.length), [2, 0]);
});

test('frame warnings: every frame of an animation looked at; each says which frame', () => {
  const d = start('four-legs');
  assert.deepEqual(A.frameWarnings(d, 'walk').filter((w) => w.kind !== 'speckle'), []);
  // a pixel on its own in every frame (a bone rig inks every shape, so a drawer that adds one stands in for a
  // spark or a glint drawn after the outline)
  const v = d;
  const w = A.frameWarnings(v, 'idle', { draw: lonely });
  const stray = w.filter((x) => x.kind === 'stray');
  assert.equal(stray.length, v.clips.idle.frames, 'one per frame');
  for (const x of stray) {
    assert.equal(x.clip, 'idle');
    assert.ok(Number.isInteger(x.frame));
    assert.match(x.text, /frame \d+/i);
    assert.doesNotMatch(x.text, WORDS);
  }
  // a frame moved off the edge: the drawing touches the frame's edge
  const edge = valid(X.setFrameEdit(d, 'walk', 3, { nudge: [-40, 0] }), 'off the edge');
  assert.ok(A.frameWarnings(edge, 'walk').some((x) => x.kind === 'edge' && x.frame === 3));
  assert.deepEqual(A.frameWarnings(d, 'nope'), []);
});

test('the fill band: half to three quarters of the frame along its longer side', () => {
  const d = start('four-legs');
  const f = A.fillBand(d);
  assert.ok(f.share > 0 && f.share <= 1);
  assert.deepEqual([f.low, f.high], [0.5, 0.75]);
  assert.ok(['small', 'fits', 'big'].includes(f.state));
  assert.equal(f.clip, 'idle');
  // the same body in a frame twice as big is small for it
  const big = valid(X.setFrameSize(d, [96, 96]), 'big frame');
  const fb = A.fillBand(big);
  assert.equal(fb.state, 'small');
  assert.match(fb.text, /smaller frame|frame size/i);
  assert.doesNotMatch(fb.text, WORDS);
  const box = A.bandBox(d);
  assert.equal(box.inner.length, 4);
  assert.ok(box.outer[2] > box.inner[2]);
});

test('the quality bar\'s findings in everyday words, with what they are about', () => {
  const d = start('four-legs');
  const cases = [
    ['walk frame 3 / default: nothing drawn', /nothing is drawn on frame 4 of walk/i, { clip: 'walk', frame: 3 }],
    ['idle frame 0 / all-low: drawing touches the frame edge (clipped), box 0,3..20,40', /edge of the frame on frame 1 of idle/i, { clip: 'idle', frame: 0 }],
    ['walk: lowest pixel is at y=40 but pivot y=42 — feet should rest on the pivot line (set grounded: false for flying things)', /feet.*2 pixels above the anchor/i, { clip: 'walk' }],
    ['smallest look (all sliders low) fills 30% of the frame along its longer side in idle; aim for at least 33%', /every slider low.*30%/i, { clip: 'idle' }],
    ['walk / default: 40 colours in one clip (a creature should use at most 32)', /40 colours.*32/i, { clip: 'walk' }],
    ['walk: loop seam — last→first frame changes 120px vs 30px between other frames', /jumps.*last frame.*first/i, { clip: 'walk' }],
    ['idle: more than half the frames repeat the previous one', /more than half.*same/i, { clip: 'idle' }],
    ['only 3 parameters: give people more to play with', /3 settings/i, {}],
    ['sound "jump" on clip walk: no preset "Huge" (it has: Big leap, Small)', /sound/i, { clip: 'walk' }],
  ];
  for (const [msg, words, about] of cases) {
    const a = A.adviceWords(msg, d);
    assert.match(a.text, words, msg);
    assert.doesNotMatch(a.text, WORDS, `everyday words for: ${msg}`);
    for (const [k, v] of Object.entries(about)) assert.equal(a[k], v, `${msg}: ${k}`);
  }
  // the animation's own name when it has one
  const named = { ...d, clips: { ...d.clips, walk: { ...d.clips.walk, label: 'Scuttle' } } };
  assert.match(A.adviceWords('walk frame 3 / default: nothing drawn', named).text, /Scuttle/);
  // anything else is still said, with the words people do not use taken out
  const odd = A.adviceWords('param "size" does nothing when all-low; fine if that is a deliberate limit for the extreme look', d);
  assert.doesNotMatch(odd.text, WORDS);
  assert.ok(odd.text.length > 10);
});

test('the bar as advice: never blocking, findings sorted asks first', async () => {
  const d = start('blob');
  const r = await A.barAdvice(d, { sounds: null });
  assert.equal(r.ok, true);
  assert.ok(Array.isArray(r.items));
  for (const it of r.items) { assert.ok(['ask', 'tip'].includes(it.level)); assert.doesNotMatch(it.text, WORDS); }
  assert.match(r.note, /advice/i);
  assert.match(r.note, /bag/i);
  // a sprite with findings still goes through every check the page makes
  assert.equal(acceptChange(d).ok, true);
  const h = await A.barAdvice(start('four-legs'), { sounds: null });
  assert.equal(h.ok, true);
  // a definition that cannot be drawn says why, in words
  const bad = await A.barAdvice({ format: 'loadout-sprite' }, { sounds: null });
  assert.equal(bad.ok, false);
  assert.ok(bad.message.length > 5);
});

test('pixel advice for the whole sprite: shapes and frames, every animation', () => {
  const d = start('four-legs');
  const def = JSON.parse(JSON.stringify(d));
  const limb = def.body.rig.shapes.find((s) => s.kind === 'limb');
  limb.width = 1;
  const v = valid(def, 'thin limb');
  const all = A.pixelAdvice(v, { draw: lonely });
  assert.ok(all.some((x) => x.kind === 'thin' && x.shape === limb.id));
  const clips = new Set(all.filter((x) => x.kind === 'stray').map((x) => x.clip));
  assert.deepEqual([...clips].sort(), Object.keys(v.clips).sort());
  // grouped: one line per animation for stray pixels, naming its frames
  const lines = A.groupAdvice(all);
  const strayLines = lines.filter((x) => x.kind === 'stray');
  assert.equal(strayLines.length, Object.keys(v.clips).length);
  assert.ok(strayLines.every((x) => Number.isInteger(x.frame)));
});
