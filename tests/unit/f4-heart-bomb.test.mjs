// Follow-up F4: the heart and the bomb pickup redrawn on node.size@1, node.hide@1 and pickup.collect.whole@1
// (engine/gen/motion.js, engine/gen/pictures.js rule 4), after migration batch M1's third review:
//   - the heart draws its size in the code's even steps and does not drift: at every Size from 0 to 1 in steps of 0.01
//     its idle box is the code heart's (tests/fixtures/f4/heart-sizes.json, recorded from sprites/heart.js before it was
//     deleted), exactly without wings and within a pixel with them; the crystal heart stays centred;
//   - both squash on collect: frame 1 lower (and wider) than frame 0, frame 2 taller (and thinner), as the code's
//     pickupPose drew them, whatever the shape;
//   - the bomb never touches the frame's edge, over shape x Size x Fuse x Pop height x Float x Lit x Sparkle x every
//     frame, and at the strongest float over Fuse in steps of 0.05 (the M1 review's size 1, fuse 0, float 1 case).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, librarySprite } from '../helpers/library.mjs';
import { readBoxes, imageBox, boxShift } from '../helpers/redraw-boxes.mjs';
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';

const heart = await librarySprite('heart'), bomb = await librarySprite('bomb-pickup');
const draw = (s, clip, frame, set) => renderPixels(s, clip, frame, cleanParams(s, { ...defaultParams(s), ...set }));
const boxOf = (s, clip, frame, set) => imageBox(draw(s, clip, frame, set));
const dims = (b) => ({ w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });
const calls = (x, out = []) => {
  if (Array.isArray(x)) for (const v of x) calls(v, out);
  else if (x && typeof x === 'object') { if (typeof x.gen === 'string') out.push(`${x.gen}@${x.v}`); for (const v of Object.values(x)) calls(v, out); }
  return out;
};

test('both collect with pickup.collect.whole@1, the heart sizes its shapes with node.size@1', () => {
  for (const id of ['heart', 'bomb-pickup']) {
    const def = JSON.parse(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'));
    const used = new Set(calls(def.body));
    assert.ok(used.has('pickup.collect.whole@1'), `${id}: pickup.collect.whole@1`);
    assert.ok(!used.has('pickup.collect@1'), `${id}: no pickup.collect@1 (it squashes only token@1 calls)`);
    if (id === 'heart') assert.ok(used.has('node.size@1') && used.has('node.hide@1'), 'heart: node.size@1 and node.hide@1');
  }
});

test('the heart draws the code heart\'s box at every Size, in its even steps, for every shape', () => {
  const rec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'f4', 'heart-sizes.json'), 'utf8'));
  for (const [key, text] of Object.entries(rec.boxes)) {
    const shape = key.replace('-winged', ''), wings = key.endsWith('-winged');
    const old = readBoxes(text);
    assert.equal(old.length, 101, key);
    const off = [];
    old.forEach((o, i) => {
      const d = boxShift(o, boxOf(heart, 'idle', 0, { shape, wings, size: i / 100, sparkle: false }));
      if (d > (wings ? 1 : 0)) off.push(`size ${i / 100}: ${d} px`);
    });
    assert.deepEqual(off.slice(0, 6), [], `${key}: ${off.length} sizes off the code heart's box`);
  }
});

test('the crystal heart stays centred at every Size, with wings and without', () => {
  for (const wings of [false, true]) for (let i = 0; i <= 100; i++) {
    const b = boxOf(heart, 'idle', 0, { shape: 'crystal', wings, size: i / 100, sparkle: false });
    assert.equal(b.x0 + b.x1, 31, `size ${i / 100}: centred on x 16 (${b.x0}..${b.x1})`);
  }
});

/** Frame 1 lower (h) than frame 0 and frame 2 taller; `wide`: also wider on frame 1 and thinner on frame 2; null: the width is not looked at (wings). */
function squashes(s, set, wide, say) {
  const f0 = dims(boxOf(s, 'collect', 0, set)), f1 = dims(boxOf(s, 'collect', 1, set)), f2 = dims(boxOf(s, 'collect', 2, set));
  if (wide === null) {
    assert.ok(f1.h < f0.h && f2.h > f0.h, `${say}: frame 1 ${JSON.stringify(f1)} lower and frame 2 ${JSON.stringify(f2)} taller than frame 0 ${JSON.stringify(f0)}`);
    return;
  }
  assert.ok(f1.h < f0.h && f1.w >= f0.w, `${say}: frame 1 ${JSON.stringify(f1)} is lower and no narrower than frame 0 ${JSON.stringify(f0)}`);
  assert.ok(f2.h > f0.h && f2.w <= f0.w, `${say}: frame 2 ${JSON.stringify(f2)} is taller and no wider than frame 0`);
  if (wide) {
    assert.ok(f1.w > f0.w, `${say}: frame 1 is wider than frame 0 (${f1.w} against ${f0.w})`);
    assert.ok(f2.w < f0.w, `${say}: frame 2 is thinner than frame 0 (${f2.w} against ${f0.w})`);
  }
}

// with wings the box is the wings' span, which the code never widened (sx held to 1) and a squash makes a little narrower
test('the heart squashes on collect frame 1 and stretches on frame 2, every shape', () => {
  for (const shape of ['classic', 'round', 'pixel', 'crystal']) for (const size of [0, 0.5, 1]) for (const wings of [false, true]) {
    squashes(heart, { shape, size, wings, sparkle: false }, wings ? null : true, `${shape} size ${size}${wings ? ' winged' : ''}`);
  }
});

test('the bomb squashes on collect frame 1 and stretches on frame 2, every shape', () => {
  for (const shape of ['round', 'stick', 'bundle']) for (const size of [0, 0.5, 1]) for (const fuse of [0, 0.5, 1]) {
    squashes(bomb, { shape, size, fuse, lit: false, sparkle: false }, shape !== 'stick', `${shape} size ${size} fuse ${fuse}`);
  }
});

const touches = (s, clip, frame, set) => { const b = boxOf(s, clip, frame, set); return !!b && (b.x0 <= 0 || b.y0 <= 0 || b.x1 >= 31 || b.y1 >= 31); };

test('the bomb never touches the frame\'s edge: shape x Size x Fuse x Pop height x Float x Lit x Sparkle x every frame', () => {
  const bad = [];
  for (const shape of ['round', 'stick', 'bundle']) for (const size of [0, 0.25, 0.5, 0.75, 1]) for (const fuse of [0, 0.25, 0.5, 0.75, 1])
    for (const lit of [true, false]) for (const sparkle of [true, false]) {
      for (const bob of [0, 1]) for (let f = 0; f < 8; f++) if (touches(bomb, 'idle', f, { shape, size, fuse, lit, sparkle, bob })) bad.push(`idle f${f} ${shape} size ${size} fuse ${fuse} float ${bob}`);
      for (const pop of [0, 1]) for (let f = 0; f < 8; f++) if (touches(bomb, 'collect', f, { shape, size, fuse, lit, sparkle, pop })) bad.push(`collect f${f} ${shape} size ${size} fuse ${fuse} pop ${pop}`);
    }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} frames touch the edge`);
});

test('the bomb never touches the frame\'s bottom at the strongest float, at any fuse (the M1 review\'s case)', () => {
  const bad = [];
  for (const shape of ['round', 'stick', 'bundle']) for (let j = 0; j <= 20; j++) for (let i = 0; i <= 10; i++) {
    const set = { shape, size: i / 10, fuse: j / 20, bob: 1, lit: false, sparkle: false };
    for (const f of [2, 6]) if (touches(bomb, 'idle', f, set)) bad.push(`${shape} size ${i / 10} fuse ${j / 20} f${f}`);
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} frames touch the edge`);
});
