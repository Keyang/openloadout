// How long a layer of the five library backgrounds takes to draw (docs/data-sprites.md 4.2: one 320x180 layer in 10 ms;
// migration batch M10b). Each layer's quickest of seven warm renders of its first frame at the defaults is held to
// CEILING ms, scaled by how much slower the machine is right now than when the ceilings were measured (the frozen code
// sprite of the same layer, timed beside it, against CODE_MS), so a busy machine does not fail a sound layer. R3
// (2026-11-21): engine/scenery.js and engine/space.js went, and with them the frozen code copies of bg-battle-field,
// bg-battle-dungeon and bg-starfield; those three are scaled by the frozen code bg-forest far layer instead, timed beside
// the layer against its CODE_MS (bg-forest imports only engine/backdrop.js, which stays).
//
// The four layers over the 10 ms target (bg-forest far, mid and near, bg-battle-field far) were 15 to 28 ms before
// M10b. What is left of their time is mostly outside the backdrop modules: the registry checking and copying every
// primitive a call inside tidy@1 returns, again for tidy's own output (engine/gen/registry.js runAt), and the renderer
// testing every pixel of a stair polygon one at a time (engine/draw-list.js has a scanner for rects, ellipses and
// capsules, not for polygons).
import test from 'node:test';
import assert from 'node:assert/strict';
import { librarySprite, codeSprite, codeSpriteFile } from '../helpers/library.mjs';
const hasCodeCopy = (id) => codeSpriteFile(id) !== null;
import { renderFrame, defaultParams } from '../../engine/sprite.js';

const TARGET = 10;
// [the data layer's ceiling in ms, the code layer's time when the ceilings were measured]
const LAYERS = {
  'bg-forest': { far: [12, 2.7], mid: [13, 3.2], near: [12.5, 6.9] },
  'bg-starfield': { far: [TARGET, 1.6], mid: [TARGET, 0.4], near: [TARGET, 0.7] },
  'bg-castle': { far: [TARGET, 2.6], mid: [TARGET, 1.9], near: [TARGET, 1.6] },
  'bg-battle-field': { far: [13, 3.6], mid: [TARGET, 2.7], near: [TARGET, 2.2] },
  'bg-battle-dungeon': { far: [TARGET, 2.0], mid: [TARGET, 2.2], near: [TARGET, 0.6] },
};

/** The quickest of seven warm renders of each sprite's layer (its first frame at the defaults), taken by turns so a busy spell slows both, in ms: [code, data]. */
function quickest(code, data, clip, codeClip = clip) {
  const pc = defaultParams(code), pd = defaultParams(data), best = [Infinity, Infinity];
  renderFrame(code, codeClip, 0, pc); renderFrame(data, clip, 0, pd);
  for (let i = 0; i < 7; i++) {
    let t0 = performance.now(); renderFrame(code, codeClip, 0, pc); best[0] = Math.min(best[0], performance.now() - t0);
    t0 = performance.now(); renderFrame(data, clip, 0, pd); best[1] = Math.min(best[1], performance.now() - t0);
  }
  return best;
}

for (const [id, layers] of Object.entries(LAYERS)) {
  test(`${id}: each layer draws within its time (the target ${TARGET} ms a 320x180 layer)`, async () => {
    const data = await librarySprite(id), gone = !hasCodeCopy(id);
    const code = await codeSprite(gone ? 'bg-forest' : id);                          // the layer's own code copy, or the yardstick one
    for (const [clip, [ceiling, ownMs]] of Object.entries(layers)) {
      const yardstick = gone ? 'far' : clip, codeMs = gone ? LAYERS['bg-forest'].far[1] : ownMs;
      // up to three tries: the suite runs files side by side, and one busy spell should not fail a sound layer
      let ms = Infinity, slow = 1;
      for (let attempt = 0; attempt < 3 && !(ms <= ceiling * slow * 1.15); attempt++) {
        const [c, d] = quickest(code, data, clip, yardstick);
        slow = Math.max(1, c / codeMs);
        ms = d;
      }
      if (process.env.SPEED) console.log(`${id} ${clip}: ${ms.toFixed(1)} ms (ceiling ${ceiling}, machine ${slow.toFixed(2)}x)`);
      assert.ok(ms <= ceiling * slow * 1.15, `${id} ${clip}: ${ms.toFixed(1)} ms, over ${ceiling} ms (machine ${slow.toFixed(2)} times slower than when measured)`);
    }
  });
}
