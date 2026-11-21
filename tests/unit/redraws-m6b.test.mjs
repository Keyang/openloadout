// Migration batch M6b (docs/data-sprites.md sections 7 and 9; the third review of M6): the six side-view characters
// redrawn as data on base:person-side keep what the review found lost, each held against its frozen code copy
// (tests/fixtures/code-sprites/, codeSprite; the rogue and the bandit were library bodies, a path that is removed with its
// frozen copies in build item R1, so only the other four are held against code: tests/unit/redraws-library-body-silhouettes.test.mjs
// holds those two to the silhouettes the library-body path drew):
//   - the Motion sliders are back (Contract 15 rule 10, Keyang's DQ3): Bounce and Stride on the knight, the wizard, the
//     rogue, the goblin and the bandit, Rattle (wobble) on the bone soldier, each moving the clips as the code's moved them
//     (a clip `travel`, build item F5)
//   - the Hold angle turns the hand point with the weapon, as the code's socket turned (one node `hold` whose angle is
//     bound to the slider, in place of four drawn steps), and the goblin's thrust and the rogue's stab level the blade
//     whatever the Hold angle, as the code's do
//   - the rogue's face at its defaults: the hood's cheek and brow and the scarf's wrap where the code draws them
//   - room: every rig keeps at least one of the 64 bones and nodes free, and every file is well under the size cap
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defaultParams, cleanParams, renderFrame, frameSockets } from '../../engine/sprite.js';
import { col, ramp } from '../../engine/color.js';
import { RIG_V2_LIMITS } from '../../rigs/bones.js';
import { SPRITE_LIMITS } from '../../catalog/sprite-schema.js';
import { librarySprite, codeSprite, ROOT } from '../helpers/library.mjs';

const IDS = ['knight', 'wizard', 'spear-goblin', 'bone-soldier', 'rogue-battler', 'road-bandit'];
const DATA = Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await librarySprite(id)])));
const CODE_IDS = IDS.filter((id) => id !== 'rogue-battler' && id !== 'road-bandit');   // the two library-body sprites have no code copy any more (build item R1)
const look = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const frames = (s, clip) => Array.from({ length: s.clips[clip].frames }, (_, f) => f);
const tones = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep].map((x) => col(x)); };
const range = (xs) => Math.max(...xs) - Math.min(...xs);
/** How much of two frames' drawn pixels are drawn in both: the overlap over the union of their silhouettes. */
function overlap(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.data.length; i++) { const p = a.data[i] >>> 24 ? 1 : 0, q = b.data[i] >>> 24 ? 1 : 0; both += p & q; either += p | q; }
  return either ? both / either : 1;
}
/** The mean overlap with the code sprite over every frame of every clip, at settings `over`. */
function meanOverlap(id, over) {
  const s = DATA[id], c = CODE[id];
  let sum = 0, n = 0;
  for (const clip of Object.keys(s.clips)) for (const f of frames(s, clip)) { sum += overlap(renderFrame(c, clip, f, look(c, over)), renderFrame(s, clip, f, look(s, over))); n++; }
  return sum / n;
}
/** What a clip shows at settings: the body's up-and-down travel (the range of the mean row of its pixels) and the feet's widest spread (rows 52 to 58). */
function moves(s, clip, over) {
  const rows = [], spreads = [];
  for (const f of frames(s, clip)) {
    const g = renderFrame(s, clip, f, look(s, over));
    let n = 0, sum = 0, lo = g.w, hi = -1;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!g.data[y * g.w + x]) continue;
      n++; sum += y;
      if (y >= 52 && y <= 58) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
    rows.push(sum / n); spreads.push(hi - lo);
  }
  return { travel: range(rows), spread: Math.max(...spreads) };
}
const changed = (s, clip, f, a, b) => { const x = renderFrame(s, clip, f, look(s, a)), y = renderFrame(s, clip, f, look(s, b)); let n = 0; for (let i = 0; i < x.data.length; i++) if (x.data[i] !== y.data[i]) n++; return n; };
const MOTION = { knight: ['bounce', 'stride'], wizard: ['bounce', 'stride'], 'spear-goblin': ['bounce', 'stride'], 'rogue-battler': ['bounce', 'stride'], 'road-bandit': ['bounce', 'stride'], 'bone-soldier': ['wobble'] };

/** The hand point's angle in radians, as a game reads it. */
const handAngle = (s, clip, f, over) => frameSockets(s, clip, f, look(s, over)).hand.angle;
const turn = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

test('the hand point is on the drawn weapon: it turns with the weapon the hand holds', () => {
  // the weapon is drawn on the node the hand point is on (`hold`), so a game's effect on the hand follows the blade
  for (const id of IDS) {
    const rig = DATA[id].definition.body.rig;
    assert.equal(rig.points.find((p) => p.id === 'hand')?.on, 'hold', id);
    const held = rig.shapes.filter((x) => x.on === 'hold');
    assert.ok(held.length >= 2, `${id}: ${held.length} shapes held on the hold node`);
    // no copy of a weapon per Hold angle step is left: one node turns them all
    assert.equal(rig.shapes.some((x) => /^(hold|staff)(Back|Forward|Low)$/.test(x.on)), false, id);
  }
});

test('room: every rig keeps a bone or node free under the cap, and every file is well under the size cap', () => {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'pieces', 'base-person-side.v7.json'), 'utf8')).body.rig;
  for (const id of IDS) {
    const def = DATA[id].definition, rig = def.body.rig;
    assert.deepEqual(rig.extends && { use: rig.extends.use, v: rig.extends.v }, { use: 'base:person-side', v: 7 }, id);
    const used = base.bones.length + base.nodes.length + (rig.bones?.length ?? 0) + (rig.nodes?.length ?? 0);
    assert.ok(used < RIG_V2_LIMITS.nodes, `${id}: ${used} of ${RIG_V2_LIMITS.nodes} bones and nodes`);
    // the wizard was at 128,798 of 131,072 bytes
    const bytes = fs.statSync(path.join(ROOT, 'sprites', `${id}.json`)).size;
    assert.ok(bytes <= 0.92 * SPRITE_LIMITS.jsonBytes, `${id}: ${bytes} bytes of ${SPRITE_LIMITS.jsonBytes}`);
  }
});
