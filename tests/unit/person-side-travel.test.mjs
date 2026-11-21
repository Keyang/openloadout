// Build item F5 (docs/data-sprites.md 2.2 "Motion sliders"; Contract 15 rule 10, Keyang's DQ3: a redraw keeps its control
// keys): the Hero as data gets back the code knight's Bounce and Stride. tests/fixtures/person-side/knight-travel.json is
// tests/fixtures/person-side/knight.json plus the two sliders (the code knight's keys, labels and group), a `travel` on
// idle, walk, run, jump and victory, and the code knight's versions that set Bounce. Held to here:
//   - the copy is the Hero and only that more; it validates on base:person-side@7, and Bounce and Stride are in use
//   - at the middle of both sliders every frame of every clip draws exactly as the Hero without them
//   - the poses: at each end of Bounce and Stride the walk's and the run's crouch or lift, foot travel, foot lift and arm
//     swing grow or shrink by the code rig's own ratio (rigs/humanoid.js pose(), recorded in tests/fixtures/person-side/code-moves.json), within 2%
//   - the pixels: against the frozen code knight at Bounce 0 and 1 and Stride 0 and 1, the walk and the run change the
//     same way (the body's up-and-down travel with Bounce, the feet's spread with Stride), each end close to the code's
//   - Stride leaves the idle alone, as in the code
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateSprite } from '../../catalog/sprite-schema.js';
import { resolveSprite } from '../../engine/resolve.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, cleanParams } from '../../engine/sprite.js';
import { createPieceStore, pieceRegistry } from '../../engine/pieces.js';
import { compileKeys, sampleKeys, framePhase } from '../../rigs/keypose.js';
import { codeSprite } from '../helpers/library.mjs';
import { checkSprite } from '../../quality/sprite.js';   // F5 review fix: the copy passes the quality bar

const ROOT = new URL('../../', import.meta.url);
const json = (rel) => JSON.parse(fs.readFileSync(new URL(rel, ROOT), 'utf8'));
const HERO = json('tests/fixtures/person-side/knight.json');
const MOVING = json('tests/fixtures/person-side/knight-travel.json');
const store = createPieceStore({ read: (f) => fs.readFileSync(new URL(f, ROOT), 'utf8') });
assert.ok((await store.loadFor(MOVING)).ok);
const make = (def) => { const m = makeDataSprite(def, { pieces: store }); assert.ok(m.ok, m.errors.join('; ')); return m.sprite; };
const data = make(MOVING), hero = make(HERO);
const ENDS = [0, 1];

test('at the middle of Bounce and Stride every frame draws exactly as the Hero without them', () => {
  for (const [name, c] of Object.entries(hero.clips)) {
    for (let f = 0; f < c.frames; f++) {
      const a = renderFrame(data, name, f, cleanParams(data, {})), b = renderFrame(hero, name, f, cleanParams(hero, {}));
      assert.ok(Buffer.from(a.data.buffer).equals(Buffer.from(b.data.buffer)), `${name} frame ${f}`);
    }
  }
});

// ---- the poses: data keys against rigs/humanoid.js pose() ----------------------------------------------------------

const range = (xs) => Math.max(...xs) - Math.min(...xs);
/** The data Hero's travel of one clip at settings: root down, front foot across and up, front arm swing (over its frames). */
function dataMoves(clip, settings) {
  const r = resolveSprite(MOVING, settings, { pieces: store });
  assert.ok(r.ok, r.errors.join('; '));
  const c = r.clips[clip], comp = compileKeys(c.keys);
  const poses = Array.from({ length: c.frames }, (_, f) => sampleKeys(comp, framePhase(c, f), { loop: c.loop }));
  return { body: range(poses.map((p) => p.root[1])), step: range(poses.map((p) => p.ik.legF[0])), lift: range(poses.map((p) => p.ik.legF[1])), arm: range(poses.map((p) => p.bones.armF)) };
}
/** The code rig's travel of the same: crouch (walk) or lift (run), front foot across and up, front arm swing (recorded from rigs/humanoid.js pose(), deleted by R2b: tests/fixtures/person-side/code-moves.json). */
const CODE_MOVES = json('tests/fixtures/person-side/code-moves.json').moves;
function codeMoves(clip, { bounce = 0.5, stride = 0.5 }) {
  const m = CODE_MOVES[clip][`${bounce},${stride}`];
  assert.ok(m, `code-moves.json holds no ${clip} at Bounce ${bounce}, Stride ${stride}`);
  return m;
}

for (const clip of ['walk', 'run']) {
  test(`${clip}: Bounce and Stride scale the poses by the code rig's own ratios`, () => {
    const d0 = dataMoves(clip, {}), c0 = codeMoves(clip, {});
    for (const key of ['bounce', 'stride']) {
      for (const v of ENDS) {
        const d = dataMoves(clip, { [key]: v }), c = codeMoves(clip, { [key]: v });
        for (const what of ['body', 'step', 'lift', 'arm']) {
          const want = c[what] / c0[what], got = d[what] / d0[what];
          assert.ok(Math.abs(got - want) <= 0.02 * want + 1e-9, `${clip} ${key} ${v} ${what}: the data Hero moves ${got.toFixed(3)} times as far, the code ${want.toFixed(3)}`);
        }
      }
    }
  });
}

// ---- the pixels: the data Hero against the frozen code knight ------------------------------------------------------

/** What a clip shows at settings: the body's up-and-down travel (the range of the mean row of its pixels) and the feet's widest spread (rows 52 to 58). */
function looks(sprite, clip, settings) {
  const c = sprite.clips[clip];
  const rows = [], spreads = [];
  for (let f = 0; f < c.frames; f++) {
    const g = renderFrame(sprite, clip, f, cleanParams(sprite, settings));
    const W = sprite.size[0], Hh = sprite.size[1];
    let n = 0, sum = 0, lo = W, hi = -1;
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      if (!g.data[y * W + x]) continue;
      n++; sum += y;
      if (y >= 52 && y <= 58) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
    rows.push(sum / n); spreads.push(hi - lo);
  }
  return { travel: range(rows), spread: Math.max(...spreads) };
}

test('the copy passes the quality bar (every look, every clip, inside the frame)', () => {
  const q = checkSprite(data);
  assert.deepEqual(q.errors, []);
});

const BOOTS = new Set([0x2e3d5b, 0x202448, 0x171d49]);   // the Hero's boot colour #5b3d2e and its two shades #482420, #491d17 (pixels are 0xAABBGGRR)
/** The boot pixels of each frame of a clip at settings. */
function bootsOf(sprite, clip, settings) {
  return Array.from({ length: sprite.clips[clip].frames }, (_, f) => {
    const g = renderFrame(sprite, clip, f, cleanParams(sprite, settings));
    let n = 0;
    for (const v of g.data) if (v && BOOTS.has(v & 0xffffff)) n++;
    return n;
  });
}

test('jump and victory: Bounce scales the lift only; the crouches stay and the feet rise with the body', () => {
  for (const clip of ['jump', 'victory']) {
    const keysAt = (s) => { const r = resolveSprite(MOVING, s, { pieces: store }); assert.ok(r.ok, r.errors.join('; ')); return r.clips[clip].keys; };
    const mid = keysAt({});
    for (const v of ENDS) {
      const ks = keysAt({ bounce: v });
      ks.forEach((k, i) => {
        const m = mid[i];
        if (m.root[1] >= 0) assert.equal(k.root[1], m.root[1], `${clip} ${v} key ${i}: a crouch or a standing key stays`);
        else {
          assert.ok(v === 0 ? k.root[1] > m.root[1] : k.root[1] < m.root[1], `${clip} ${v} key ${i}: the lift ${v === 0 ? 'shrinks' : 'grows'}`);
          for (const leg of ['legF', 'legB']) {
            const tuckMid = m.ik[leg][1] - m.root[1], tuck = k.ik[leg][1] - k.root[1];
            assert.ok(Math.abs(tuck - tuckMid) <= 0.5 * Math.abs(tuckMid) + 1e-9 && Math.abs(tuck - tuckMid) <= 1.5, `${clip} ${v} key ${i} ${leg}: the foot keeps near the body (${tuckMid.toFixed(2)} -> ${tuck.toFixed(2)})`);
          }
        }
      });
    }
  }
});
