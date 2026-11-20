// The side-view person as data (build item B16a; docs/data-sprites.md sections 1.1, 3.3, 7 and 9 row B16): the base
// piece base:person-side baked from rigs/humanoid.js, and the parts people swap on it (hair, headgear, cape, belt,
// held things) as part and held pieces, all written by tools/bake-person-side.mjs. Held to here:
//   - the pieces in pieces/ are exactly what the baker writes, each a valid piece, loadable, and released (pinned);
//     a changed piece is a new version, never a rewritten pinned one
//   - the base has the code rig's standard clips (frames, speed, loop) with one key a frame, and at every frame of
//     every clip (the variants too) its bones put the hips, neck, knees, ankles, elbows, hands and head where the code
//     rig does, and its drawn limbs run between the code's snapped joints
//   - drawn, it is within 2 % of the code rig's pixels at every frame of every clip (row B16's rule), but for die
//     frames 1 to 3, where the code turns the head's pixels part way (a turned bitmap, which data never draws): an
//     accepted exception (the orchestrator, 2026-11-20: they read as the same character), held to 8 %
//   - the base carries its own ground cut, last in its shapes; engine/resolve.js puts a base's operations after the
//     sprite's shapes, so a sprite on it writes no cut and still never draws under the ground, at any frame size (the
//     cut reaches past any frame's edges, a probe filling a 640x360 frame under the ground included; the lay node
//     is parked far off any frame unless the body lies flat, and rises straight up to the strip in a die at other frames)
//   - the Hero (sprites/knight.js) rebuilt from the base and pieces only (tests/fixtures/person-side/knight.json)
//     validates, draws every frame of every clip, passes the quality bar, keeps the code knight's versions and
//     controls, swaps its parts, grows hair and headgear with the head and turns them with it as it falls, never draws
//     under the ground (the base's ground cut, which the resolver puts after the Hero's shapes, so the base and parts
//     paint in z order: the cape behind the body), keeps its cape in every die frame, and stays close to the code
//     sprite beside it
// To look at it: node tools/bake-person-side.mjs --sheet writes out/person-side-knight.png (code, data, difference).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as H from '../../rigs/humanoid.js';
import {
  bakedPieces, basePiece, codePose, codeFrame, frameDiff, STANDARD_CLIPS, VARIANT_CLIPS, BASE_CLIPS, VARIANTS_PUBLISHED,
  D0, trunkOf, heroSheet, releasedAs, GROUND_CUT, SCALES,
} from '../../tools/bake-person-side.mjs';
import { validatePiece, createPieceStore, PIECE_LIMITS } from '../../engine/pieces.js';
import { readPins, pieceHash } from '../../tools/lib/pieces-index.mjs';
import { solveRig } from '../../rigs/bones.js';
import { clipPose } from '../../rigs/keypose.js';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { checkSprite } from '../../quality/sprite.js';
import { codeSprite } from '../helpers/library.mjs';   // the code Hero, its frozen copy once sprites/knight.js is redrawn (T1)
import { SPEED_FPS, resolveSprite } from '../../engine/resolve.js';
import { col, INK } from '../../engine/color.js';
import { DRAW_LIST_OPS } from '../../engine/draw-list.js';

const ROOT = new URL('../../', import.meta.url);
const knight = await codeSprite('knight');
const BAKED = bakedPieces();
const BASE = BAKED[0].value;
/** The base with its variant clips (VARIANT_CLIPS), as a version no file holds. */
const FULL = { ...basePiece({ variants: true }), v: 999 };
const store = (extra = []) => {
  const s = createPieceStore();
  for (const { file, value } of BAKED) s.add(JSON.stringify(value), file.split('/').pop());
  for (const x of extra) s.add(JSON.stringify(x), `${x.id.replace(':', '-')}.v${x.v}.json`);
  return s;
};
const HERO = JSON.parse(fs.readFileSync(new URL('tests/fixtures/person-side/knight.json', ROOT), 'utf8'));
const LOOK = { skin: '#e0a878', top: '#3a6ea5', bottom: '#29466a', boots: '#5b3d2e' };
/** A sprite that is a base and nothing else (no cut of its own: the base carries it), in LOOK's colours; `more` adds its controls. */
const person = (base, more = {}) => ({
  format: 'loadout-sprite', version: 2, id: 'person-test', name: 'Person', blurb: 'The base alone.', size: [64, 64], pivot: [28, 58],
  meta: { type: 'character', role: 'characters/player', view: 'side', themes: ['fantasy'], gameTypes: ['platformer'], words: ['person', 'human', 'hero', 'walk', 'run', 'jump'], license: 'draft' },
  palette: Object.entries(LOOK).map(([id, hex]) => ({ id, label: id, default: hex, material: 'cloth' })),
  body: { rig: { extends: { use: base.id, v: base.v } } },
  ...more,
});
const framesOf = (clips) => Object.entries(clips).flatMap(([clip, c]) => Array.from({ length: c.frames }, (_, f) => [clip, f]));
const hero = () => makeDataSprite(HERO, { pieces: store() });
let memo = null;
/** Every frame of every clip of the base with its variants, beside the code rig's bare body: [{ clip, f, diff, drawn, share }]. */
function shares() {
  if (memo) return memo;
  const r = makeDataSprite(person(FULL), { pieces: store([FULL]) });
  assert.ok(r.ok, r.errors.join('; '));
  const p = defaultParams(r.sprite);
  memo = framesOf(BASE_CLIPS).map(([clip, f]) => ({ clip, f, ...frameDiff(codeFrame(clip, f, LOOK), renderFrame(r.sprite, clip, f, p)) }));
  return memo;
}
const pct = (x) => `${x.clip} ${x.f}: ${(x.share * 100).toFixed(1)} % (${x.diff} of ${x.drawn})`;
/** The frames where rigs/humanoid.js turns the head's pixels part way (die 1 to 3): a turned bitmap, never drawn by data. */
const TURNING = (x) => { const t = codePose(x.clip, x.f).headTurn || 0; return t > 0 && Math.abs(t - Math.PI / 2) > 1e-9; };

test('the pieces in pieces/ are what the baker writes, each valid, loadable and released', () => {
  const pins = readPins(new URL('.', ROOT).pathname);
  for (const { file, value } of BAKED) {
    const text = fs.readFileSync(new URL(file, ROOT), 'utf8');
    assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(value)), `${file}: node tools/bake-person-side.mjs --write`);
    const v = validatePiece(text, { file: file.split('/').pop() });
    assert.ok(v.ok, `${file}: ${v.errors.join('; ')}`);
    assert.deepEqual(v.warnings, [], file);
    assert.equal(pins[`${value.id}@${value.v}`], pieceHash(JSON.parse(text)), `${file}: pinned (released) with this content`);
  }
  const s = store();
  for (const { value } of BAKED) assert.ok(s.get(value.id, value.v), `${value.id} loads`);
});

test('the baker never rewrites a pinned version: a change goes to the next free one', () => {
  const piece = { id: 'part:test-cap', v: 1, name: 'Cap' };
  assert.equal(releasedAs(piece, {}).v, 1, 'nothing pinned: version 1');
  assert.equal(releasedAs(piece, { 'part:test-cap@1': pieceHash({ ...piece, v: 1 }) }).v, 1, 'pinned with this content: unchanged');
  assert.equal(releasedAs(piece, { 'part:test-cap@1': 'another' }).v, 2, 'pinned with other content: the next version');
  assert.equal(releasedAs(piece, { 'part:test-cap@1': 'another', 'part:test-cap@2': 'and another' }).v, 3);
});

test('base: the code rig\'s standard clips, one key a frame, flash as a frame edit; the variants published after them (B4x)', () => {
  const clips = BASE.body.clips;
  const code = H.clipsFor(Object.keys(STANDARD_CLIPS));
  assert.deepEqual(Object.keys(clips), [...Object.keys(code), ...Object.keys(VARIANT_CLIPS)]);
  for (const [name, c] of Object.entries(clips).filter(([n]) => Object.hasOwn(STANDARD_CLIPS, n))) {
    assert.equal(c.frames, code[name].frames, name);
    assert.equal(c.loop, code[name].loop, name);
    // engine/resolve.js plays a clip at fps times lerp(SPEED_FPS[0], SPEED_FPS[1], speed): the middle speed is 0.5
    const middle = SPEED_FPS[0] + (SPEED_FPS[1] - SPEED_FPS[0]) * 0.5;
    assert.ok(Math.abs(c.fps * middle - code[name].fps({})) < 1e-9, `${name}: ${c.fps} fps, played as the code's at the middle speed`);
    assert.equal(c.keys.length, c.frames, name);
  }
  assert.deepEqual(clips.hurt.frameEdits, { 0: { flash: true } });
  assert.deepEqual(clips.die.frameEdits, { 0: { flash: true } });
  assert.equal(clips.idle.frameEdits, undefined);
  // the variants (punch, thrust, the unarmed and bow clips) are baked, fit in a piece and are published since @7 (B4x:
  // a sprite takes the clips its extends.clips lists, and names a variant with from; tests/unit/person-side-variants)
  assert.equal(VARIANTS_PUBLISHED, true);
  assert.deepEqual(Object.keys(FULL.body.clips), [...Object.keys(STANDARD_CLIPS), ...Object.keys(VARIANT_CLIPS)]);
  for (const [name, c] of Object.entries(VARIANT_CLIPS)) {
    assert.ok(H.POSES.includes(c.pose) && STANDARD_CLIPS[c.for], name);
    assert.deepEqual([FULL.body.clips[name].frames, FULL.body.clips[name].loop], [STANDARD_CLIPS[c.for].frames, STANDARD_CLIPS[c.for].loop], name);
  }
  const bytes = Buffer.byteLength(JSON.stringify(FULL));
  assert.ok(bytes < PIECE_LIMITS.jsonBytes, `with the variants: ${bytes} bytes`);
  assert.ok(validatePiece(JSON.stringify(FULL), { file: 'base-person-side.v999.json' }).ok);
});

test('base: at every frame of every clip its bones put every joint where the code rig puts it', () => {
  const rig = FULL.body.rig;
  const near = (a, b, what) => assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01, `${what}: ${a} vs ${b}`);
  const odd = (v) => Math.floor(v) + 0.5;
  for (const [clip, f] of framesOf(BASE_CLIPS)) {
    const P = codePose(clip, f), C = H.solve(P, D0);
    const J = solveRig(rig, clipPose(FULL.body.clips[clip], f)).bones;
    const at = `${clip} ${f}`;
    near(J.stand.end, C.hip, `${at} hips`);
    near(J.spine.end, C.neck, `${at} neck`);
    near(J.thighF.start, C.legF.hip, `${at} front hip`); near(J.shinF.start, C.legF.knee, `${at} front knee`); near(J.shinF.end, C.legF.ankle, `${at} front ankle`);
    near(J.thighB.start, C.legB.hip, `${at} back hip`); near(J.shinB.start, C.legB.knee, `${at} back knee`); near(J.shinB.end, C.legB.ankle, `${at} back ankle`);
    near(J.foreF.start, C.armF.elbow, `${at} front elbow`); near(J.handF.start, C.armF.hand, `${at} front hand`);
    near(J.foreB.start, C.armB.elbow, `${at} back elbow`); near(J.handB.start, C.armB.hand, `${at} back hand`);
    assert.ok(Math.abs(J.handF.angle - P.item) < 1e-3, `${at}: the hand points the way the held thing does`);
    if (!P.headTurn) near(J.skull.start, C.head, `${at} head`);
    // the drawn limbs run between the code's snapped joints (Surface.limb: a 3 px limb's ends on pixel middles, a 2 px
    // one's on pixel corners), so the renderer's half-pixel rounding of a bone's start moves nothing
    for (const [s, L] of [['F', C.legF], ['B', C.legB]]) {
      near(J[`thigh${s}d`].start, L.hip.map(odd), `${at} drawn thigh ${s}, from`); near(J[`thigh${s}d`].end, L.knee.map(odd), `${at} drawn thigh ${s}, to`);
      near(J[`shin${s}d`].start, L.knee.map(Math.round), `${at} drawn shin ${s}, from`); near(J[`shin${s}d`].end, L.ankle.map(Math.round), `${at} drawn shin ${s}, to`);
    }
    for (const [s, A] of [['F', C.armF], ['B', C.armB]]) {
      near(J[`arm${s}d`].start, A.shoulder.map(Math.round), `${at} drawn arm ${s}, from`); near(J[`fore${s}d`].start, A.elbow.map(Math.round), `${at} drawn forearm ${s}, from`);
      near(J[`fore${s}d`].end, A.hand.map(Math.round), `${at} drawn forearm ${s}, to`);
    }
    // the torso's carriers end on the half-pixel grid, where the code's capsule and pelvis are
    const t = trunkOf(C, D0);
    near(J.trunk.end, [J.loin.end[0] + Math.sin(t.trunk.angle) * t.trunk.length, J.loin.end[1] + Math.cos(t.trunk.angle) * t.trunk.length], `${at} torso`);
    near(J.seat.end.map((v) => Math.round(v * 2) / 2), [Math.round(C.hip[0] * 2) / 2, Math.round(C.hip[1]) + 1], `${at} pelvis (where the renderer puts the seat's end)`);
    assert.ok(Math.abs(J.ground.start[1] - H.GROUND) < 0.01, `${at}: the ground node on the ground row`);
  }
});

test('base: within 2 % of the code rig\'s pixels at every frame of every clip, but where the code turns the head part way', () => {
  const all = shares();
  assert.equal(all.length, framesOf(BASE_CLIPS).length);
  assert.deepEqual(all.filter((x) => x.share > 0.02 && !TURNING(x)).map(pct), [], 'over 2 %');
  assert.ok(all[0].share <= 0.02, `at rest: ${pct(all[0])}`);
  // die 1 to 3, AN ACCEPTED EXCEPTION to row B16's 2 % (the orchestrator, 2026-11-20): the code draws the head upright
  // on a layer and turns its pixels part way (rigs/humanoid.js stampTurned, a turned bitmap); data draws no turned
  // bitmaps (rigs/bones.js) and turns the skull's ellipse, whose edge steps differently. They read as the same
  // character. Measured 2026-11-20: 7.1, 6.7 and 6.3 %; held to 8 % so a real change still fails
  const turning = all.filter(TURNING);
  assert.deepEqual(turning.map((x) => `${x.clip} ${x.f}`), ['die 1', 'die 2', 'die 3']);
  for (const x of turning) assert.ok(x.share <= 0.08, pct(x));
  const mean = all.reduce((a, x) => a + x.share, 0) / all.length;
  assert.ok(mean <= 0.01, `mean ${(mean * 100).toFixed(2)} %`);
});

test('the Hero rebuilt from the base and pieces only: valid, every frame drawn, the quality bar passes', () => {
  const r = hero();
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(r.warnings, []);
  const s = r.sprite;
  for (const clip of Object.keys(knight.clips)) assert.equal(s.clips[clip]?.frames, knight.clips[clip].frames, `${clip}: the code Hero's frames`);
  const p = defaultParams(s);
  for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) assert.ok(renderFrame(s, clip, f, p).data.some(Boolean), `${clip} ${f}`);
  assert.deepEqual(s.sounds.attack.map((c) => c.sound), ['sword-slash', 'whoosh']);
  const q = checkSprite(s);
  assert.deepEqual(q.errors, []);
});

test('the Hero keeps the code knight\'s versions by name and its controls\' keys, kinds and ranges', () => {
  // versions: every one, with the code's settings, less Bounce (the base's clips are baked at the middle bounce)
  assert.deepEqual(HERO.versions.map((v) => v.name), knight.versions.map((v) => v.name));
  for (const v of knight.versions) {
    const { bounce, ...rest } = v.params;
    assert.deepEqual(HERO.versions.find((x) => x.name === v.name).params, rest, v.name);
  }
  // controls: every one but the motion sliders (bounce, stride, hold angle, swing: baked at their middles)
  const mine = new Map(HERO.controls.map((c) => [c.key, c]));
  for (const [key, c] of Object.entries(knight.params)) {
    if (key === 'speed') { assert.equal(mine.get(key)?.standard, 'speed'); continue; }
    if (['bounce', 'stride', 'weaponAngle', 'weaponSwing'].includes(key)) { assert.ok(!mine.has(key), key); continue; }
    const m = mine.get(key);
    assert.ok(m, `${key} kept`);
    if (c.kind === 'range') assert.deepEqual([m.min ?? 0, m.max ?? 1, m.default], [c.min, c.max, c.def], `${key}: the code's range and default`);
    if (c.kind === 'choice') assert.deepEqual(m.options, c.options.map((o) => o.value), `${key}: the code's options`);
  }
});

test('the Hero\'s clips are the code knight\'s, no more (its extends.clips, B4x)', () => {
  assert.deepEqual(Object.keys(hero().sprite.clips), Object.keys(knight.clips));
});

test('the Hero with no weapon punches, as the code knight does (a from picked by Weapon, B4x)', () => {
  assert.equal(resolveSprite(HERO, { weapon: 'none' }, { pieces: store() }).clips.attack.from, 'punch');
  assert.equal(resolveSprite(HERO, { weapon: 'sword' }, { pieces: store() }).clips.attack.from, 'attack');
});

test('the Hero swaps its parts: weapon, headgear, hair, cape', () => {
  const s = hero().sprite;
  const p = defaultParams(s);
  const count = (g) => g.data.filter(Boolean).length;
  const at = (over) => renderFrame(s, 'idle', 0, { ...p, ...over });
  const base = count(at({}));
  assert.ok(count(at({ weapon: 'none' })) < base - 8, 'no sword');
  assert.notDeepEqual([...at({ weapon: 'axe' }).data], [...at({}).data], 'an axe');
  assert.notDeepEqual([...at({ weapon: 'spear' }).data], [...at({}).data], 'a spear');
  assert.ok(count(at({ cape: 'none' })) < base - 8, 'no cape');
  assert.notDeepEqual([...at({ cape: 'tattered' }).data], [...at({}).data], 'a torn cape');
  const gold = (g) => g.data.filter((v) => v === col('#e6c545')).length;
  assert.ok(gold(at({ headgear: 'crown', weapon: 'none' })) > 4 && gold(at({ weapon: 'none' })) === 0, 'a gold crown (the sword\'s hilt is gold too)');
  assert.ok(count(at({ headgear: 'none', hairStyle: 'long' })) > count(at({ headgear: 'none' })), 'long hair hangs');
  assert.ok(count(at({ headgear: 'none', hairStyle: 'bald' })) < count(at({ headgear: 'none' })), 'bald');
  assert.notDeepEqual([...at({ headgear: 'none', hairStyle: 'spiky' }).data], [...at({ headgear: 'none' }).data], 'spikes');
});

test('the Hero\'s hair and headgear grow and shrink with the Head slider, as the code knight\'s do', () => {
  const s = hero().sprite;
  // the pixels a part changes over the bald, bare head: its area, any overhang and what it covers
  const area = (sp, head, look) => {
    const set = { ...defaultParams(sp), head, weapon: 'none', cape: 'none' };
    const a = renderFrame(sp, 'idle', 0, { ...set, hairStyle: 'bald', headgear: 'none' }), b = renderFrame(sp, 'idle', 0, { ...set, hairStyle: 'bald', headgear: 'none', ...look });
    let n = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++;
    return n;
  };
  for (const head of [0, 0.55, 1]) {
    for (const look of [{ hairStyle: 'short' }, { hairStyle: 'spiky' }, { headgear: 'helmet' }, { headgear: 'crown' }]) {
      const a = area(knight, head, look), b = area(s, head, look);
      assert.ok(Math.abs(a - b) <= Math.max(6, 0.15 * a), `head ${head}, ${JSON.stringify(look)}: ${b} pixels, the code ${a}`);
    }
  }
});

test('the Hero never draws under the ground row, in any clip, version, choice or slider end', () => {
  const s = hero().sprite;
  const low = (g) => { for (let y = g.h - 1; y >= 0; y--) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) return y; return -1; };
  const settings = [];
  for (const hairStyle of ['short', 'long', 'spiky', 'ponytail', 'bald']) for (const headgear of ['helmet', 'crown', 'none']) for (const cape of ['plain', 'tattered', 'none']) settings.push({ hairStyle, headgear, cape });
  for (const v of HERO.versions) settings.push(v.params);
  const ends = { height: [0, 1], build: [0, 1], head: [0, 1], headgearSize: [0.5, 1.8], weaponLength: [0.65, 1.35], capeLength: [0.3, 1.8] };
  for (const look of [{ hairStyle: 'ponytail', headgear: 'none' }, { hairStyle: 'long', headgear: 'helmet' }]) for (const [k, vs] of Object.entries(ends)) for (const v of vs) settings.push({ ...look, [k]: v });
  const under = [];
  for (const set of settings) for (const [clip, c] of Object.entries(s.clips)) for (let f = 0; f < c.frames; f++) {
    const y = low(renderFrame(s, clip, f, { ...defaultParams(s), ...set }));
    if (y > H.GROUND) under.push(`${clip} ${f} at ${JSON.stringify(set)}: row ${y}`);
  }
  assert.deepEqual(under.slice(0, 10), [], `${under.length} frames under the ground`);
});

test('the Hero beside the code knight: every clip of the code sprite, close in pixels', () => {
  const s = hero().sprite;
  const sheet = heroSheet(s, knight);
  // measured 2026-11-20 (B16a2): idle 9.2, walk 7.7, run 8.6, jump 9.2, attack 14.1, hurt 9.9, block 11.9, victory
  // 11.6 %: the code knight's tunic and helmet shading, the slash trail and the Head default (0.55, where the base's
  // bones are 0.5's). Die 17.2 % (25.6 before the cape hung down while falling and lay on the ground, part:cape-ground):
  // the turning head (die 1 to 3) and the lying cape's outline
  for (const [clip, share] of Object.entries(sheet.shares)) assert.ok(share <= (clip === 'die' ? 0.2 : 0.15), `${clip}: ${(share * 100).toFixed(1)} % of pixels differ`);
  assert.deepEqual(Object.keys(sheet.shares), Object.keys(knight.clips));
});

test('drawing order: the base carries the one ground cut, the Hero none, and resolved the cut is last, so parts paint by z', () => {
  // a cut, outline or tint splits engine/draw-list.js's z order: anything after it paints over everything before it.
  // The base's cut is data in the base (GROUND_CUT, last in its shapes); engine/resolve.js puts a base's operations
  // after the sprite's own shapes, so it applies to the base and the parts alike
  const ops = (shapes) => shapes.filter((x) => DRAW_LIST_OPS.includes(x.kind)).map((x) => x.id);
  for (const [what, b] of [['the base', BASE], ['the base with its variants', FULL]]) {
    assert.deepEqual(ops(b.body.rig.shapes), [GROUND_CUT.id], what);
    assert.deepEqual(b.body.rig.shapes.at(-1), GROUND_CUT, `${what}: GROUND_CUT, last`);
  }
  assert.deepEqual(ops(HERO.body.rig.shapes), [], 'the Hero writes no cut');
  const resolved = resolveSprite(HERO, {}, { pieces: store() });
  assert.ok(resolved.ok, resolved.errors.join('; '));
  assert.deepEqual(ops(resolved.body.rig.shapes), [GROUND_CUT.id]);
  assert.equal(resolved.body.rig.shapes.at(-1).id, GROUND_CUT.id, 'resolved, the base\'s cut comes after the Hero\'s parts');
  // the cape hangs behind the body (z 2, far) as the code knight's does: drawn, it changes no pixel of the body but
  // the outline round it; the same for the sword and the fist that holds it (z 90 over 80)
  const s = hero().sprite;
  const p = defaultParams(s);
  const covered = (clip, f, without, over = {}) => {
    const a = renderFrame(s, clip, f, { ...p, ...over, ...without }), b = renderFrame(s, clip, f, { ...p, ...over });
    let n = 0;
    for (let i = 0; i < a.data.length; i++) if (a.data[i] && a.data[i] !== col(INK) && a.data[i] !== b.data[i]) n++;
    return n;
  };
  for (const clip of ['idle', 'attack', 'walk', 'victory']) for (let f = 0; f < s.clips[clip].frames; f++) {
    assert.equal(covered(clip, f, { cape: 'none' }), 0, `${clip} ${f}: the cape covers the body`);
    assert.equal(covered(clip, f, { cape: 'none' }, { capeLength: 1.8 }), 0, `${clip} ${f}: the longest cape covers the body`);
  }
  // the fist is in front of the sword's guard: every skin pixel of the near hand with nothing held is still there
  const fist = (g) => { const out = []; for (let i = 0; i < g.data.length; i++) if (g.data[i] === col(HERO.palette.find((x) => x.id === 'skin').default)) out.push(i); return out; };
  for (const [clip, f] of [['idle', 0], ['attack', 3], ['block', 2]]) {
    const bare = renderFrame(s, clip, f, { ...p, weapon: 'none' }), held = renderFrame(s, clip, f, p);
    const lost = fist(bare).filter((i) => held.data[i] !== bare.data[i] && Math.abs((i % 64) - 22) > 8);   // away from the face
    assert.deepEqual(lost, [], `${clip} ${f}: the sword drawn over the fist`);
  }
});

test('the Hero\'s hair and headgear turn with the head as it falls and lies down, as the code knight\'s do', () => {
  // the pixels a part changes over the bald, bare head at Head 0.5 (the base's bones), die frames 1 to 7, beside the
  // code knight's: where they are (the middle of them within a pixel) and how many differ (lying down, the code turns
  // its head's layer a quarter, which maps pixels to pixels: within 6 %; falling, die 1 to 3, it turns them part way,
  // a turned bitmap the data's turned shapes approach: within 35 %). Measured 2026-11-20: lying 0 to 5 %, falling 9
  // to 31 %, middles 0 to 0.9 px apart
  const s = hero().sprite;
  const foot = (sp, f, look) => {
    const set = { ...defaultParams(sp), head: 0.5, weapon: 'sword', cape: 'none', hairStyle: 'bald', headgear: 'none' };
    const a = renderFrame(sp, 'die', f, set), b = renderFrame(sp, 'die', f, { ...set, ...look });
    const m = new Set();
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) m.add(i);
    return m;
  };
  const middle = (m) => { let x = 0, y = 0; for (const i of m) { x += i % 64; y += Math.floor(i / 64); } return [x / m.size, y / m.size]; };
  const bad = [];
  for (const look of [{ hairStyle: 'short' }, { hairStyle: 'spiky' }, { hairStyle: 'long' }, { hairStyle: 'ponytail' }, { headgear: 'helmet' }, { headgear: 'crown' }]) {
    for (let f = 1; f < 8; f++) {
      const a = foot(knight, f, look), b = foot(s, f, look);
      const both = new Set([...a, ...b]);
      let x = 0;
      for (const i of both) if (!(a.has(i) && b.has(i))) x++;
      const share = x / both.size, [ca, cb] = [middle(a), middle(b)], far = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
      const lying = codePose('die', f).headTurn === Math.PI / 2;
      if (share > (lying ? 0.06 : 0.35) || far > 1) bad.push(`${JSON.stringify(look)} die ${f}: ${(share * 100).toFixed(0)} % differ, middles ${far.toFixed(2)} px apart`);
    }
  }
  assert.deepEqual(bad, []);
});

test('a sprite on the base that writes no cut stays on the ground in every clip, at every slider end', () => {
  // the bare base (and its variant clips) with the sliders a sprite scales it by (SCALES) at both ends: nothing under
  // the ground row (the outline may touch it, as the code's does)
  const low = (g) => { for (let y = g.h - 1; y >= 0; y--) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) return y; return -1; };
  const controls = Object.entries(SCALES).map(([key, scales]) => ({ key, kind: 'range', label: key, default: 0.5, scales }));
  const r = makeDataSprite(person(FULL, { controls }), { pieces: store([FULL]) });
  assert.ok(r.ok, r.errors.join('; '));
  assert.deepEqual(r.warnings, []);
  const under = [];
  for (const set of [{}, ...Object.keys(SCALES).flatMap((k) => [{ [k]: 0 }, { [k]: 1 }]), Object.fromEntries(Object.keys(SCALES).map((k) => [k, 1]))]) {
    for (const [clip, c] of Object.entries(r.sprite.clips)) for (let f = 0; f < c.frames; f++) {
      const y = low(renderFrame(r.sprite, clip, f, { ...defaultParams(r.sprite), ...set }));
      if (y > H.GROUND) under.push(`${clip} ${f} at ${JSON.stringify(set)}: row ${y}`);
    }
  }
  assert.deepEqual(under.slice(0, 10), [], `${under.length} frames under the ground`);
  // and the Hero, which writes no cut, never does either (its own test above: every look, version and slider end)
  assert.ok(!HERO.body.rig.shapes.some((x) => x.kind === 'cut'));
});

test('the Hero keeps its cape in every die frame, where the code knight has it', () => {
  // the pixels the cape changes (cape on against none) at every die frame, beside the code knight's: the cape hangs
  // straight down from the neck while the body falls (die 1 to 3: the code's drawCape is screen-aligned, its hem held
  // above the ground) and lies along the ground under the body when it is down (die 4 to 7: drawCapeOnGround)
  // Measured 2026-11-20 (B16a2), data / code pixels at the defaults: 64/57 60/60 58/54 22/21 57/55 62/61 51/51 50/50;
  // before, the cape was gone from die 2 on (0 pixels)
  const s = hero().sprite;
  const capePx = (sp, f, over = {}) => {
    const set = { ...defaultParams(sp), ...over };
    const a = renderFrame(sp, 'die', f, { ...set, cape: 'none' }), b = renderFrame(sp, 'die', f, set);
    const m = [];
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) m.push(i);
    return m;
  };
  const middle = (m) => { let x = 0, y = 0; for (const i of m) { x += i % 64; y += Math.floor(i / 64); } return [x / m.length, y / m.length]; };
  const bad = [];
  for (const over of [{}, { cape: 'tattered' }, { capeLength: 1.8 }, { capeLength: 0.3 }]) {
    for (let f = 0; f < s.clips.die.frames; f++) {
      const a = capePx(knight, f, over), b = capePx(s, f, over);
      const [ca, cb] = [middle(a), middle(b)], far = Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
      if (b.length < 0.7 * a.length || b.length > 1.4 * a.length || far > 2) bad.push(`die ${f} ${JSON.stringify(over)}: ${b.length} pixels (the code ${a.length}), middles ${far.toFixed(1)} px apart`);
    }
  }
  assert.deepEqual(bad, []);
});

test('at any frame size the base keeps what it draws on the ground: its cut reaches the frame\'s bottom, a sprite writes none', () => {
  // the schema takes any `size` on a sprite that extends the base; the base's bones keep their frame places (the body
  // in the top-left 64x64, the ground row 58), so a taller or wider frame only adds room under and beside the ground.
  // Its cut must clear all of it, whatever a sprite hangs there (B16a2 round 3: a cut 8 rows deep left the Hero's
  // parts under the ground at 64x72 and taller)
  const low = (g) => { for (let y = g.h - 1; y >= 0; y--) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) return y; return -1; };
  const under = [];
  for (const size of [[64, 72], [64, 96], [96, 96], [160, 120], [640, 360]]) {
    for (const [what, def, st] of [['the Hero', HERO, store()], ['the bare base', person(FULL), store([FULL])]]) {
      const r = makeDataSprite({ ...def, size }, { pieces: st });
      assert.ok(r.ok, `${what} at ${size}: ${r.errors.join('; ')}`);
      const sets = what === 'the Hero' ? [{}, { capeLength: 1.8 }, { cape: 'tattered', capeLength: 0.3 }, { height: 0 }, { height: 1, head: 1 }] : [{}];
      for (const set of sets) for (const [clip, c] of Object.entries(r.sprite.clips)) for (let f = 0; f < c.frames; f++) {
        const y = low(renderFrame(r.sprite, clip, f, { ...defaultParams(r.sprite), ...set }));
        if (y > H.GROUND) under.push(`${what} at ${size}, ${clip} ${f} ${JSON.stringify(set)}: row ${y}`);
      }
    }
  }
  assert.deepEqual(under.slice(0, 10), [], `${under.length} frames under the ground`);
});

test('the lay node is far off any frame but where the body lies flat: with the cut dropped, the cape on the ground shows only in die 4 to 7', () => {
  // the lay node is parked far under the ground (not just off a 64-row frame) in every frame where nothing lies on the
  // ground, so what hangs there never shows, even in the tallest frame and with the base's cut dropped
  const drop = { ...HERO, size: [64, 360], body: { ...HERO.body, rig: { ...HERO.body.rig, extends: { ...HERO.body.rig.extends, drop: ['groundCut'] } } } };
  const bare = structuredClone(drop);
  bare.body.rig.shapes = bare.body.rig.shapes.filter((x) => x.id !== 'capeGround');
  for (const p of Object.values(bare.parts ?? {})) if (Array.isArray(p.shapes)) p.shapes = p.shapes.filter((x) => x !== 'capeGround');
  const [a, b] = [drop, bare].map((d) => makeDataSprite(d, { pieces: store() }));
  assert.ok(a.ok, a.errors.join('; '));
  assert.ok(b.ok, b.errors.join('; '));
  const shows = [];
  for (const [clip, c] of Object.entries(a.sprite.clips)) for (let f = 0; f < c.frames; f++) {
    const lying = clip === 'die' && f >= 4;
    for (const set of [{}, { capeLength: 1.8 }]) {
      const ga = renderFrame(a.sprite, clip, f, { ...defaultParams(a.sprite), ...set }), gb = renderFrame(b.sprite, clip, f, { ...defaultParams(b.sprite), ...set });
      let n = 0;
      for (let i = 0; i < ga.data.length; i++) if (ga.data[i] !== gb.data[i]) n++;
      if (lying ? n === 0 : n > 0) shows.push(`${clip} ${f} ${JSON.stringify(set)}: ${n} pixels of the cape on the ground`);
    }
  }
  assert.deepEqual(shows, []);
});

test('a die played at any number of frames keeps the cape on the ground where the body lies: nothing floats while the body falls', () => {
  // a sprite may play the base's die at its own frame count ({ "from": "die", "frames": N }): the renderer blends the
  // base's keys at the new phases, so between die 3 (the lay node parked) and die 4 (lying on the ground) the lay
  // chain is part way. It must rise straight up from under the ground to where the cape lies, never through the frame
  // (B16a2 round 4: v5's chain swung 201 degrees there and drew the cape as a bar 23 rows up at 10 frames, 96x96).
  // Allowed: the pixels the cape on the ground has at the base's own die 4 to 7 (a column either side), and, with the
  // base's cut dropped, anything under the ground row as well
  const strip = (d) => { const x = structuredClone(d); x.body.rig.shapes = x.body.rig.shapes.filter((s) => s.id !== 'capeGround'); for (const p of Object.values(x.parts ?? {})) if (Array.isArray(p.shapes)) p.shapes = p.shapes.filter((s) => s !== 'capeGround'); return x; };
  const make = (d) => { const r = makeDataSprite(d, { pieces: store() }); assert.ok(r.ok, r.errors.join('; ')); assert.deepEqual(r.warnings, []); return r.sprite; };
  const capeGround = (a, b, clip, f, set) => {
    const ga = renderFrame(a, clip, f, { ...defaultParams(a), ...set }), gb = renderFrame(b, clip, f, { ...defaultParams(b), ...set });
    const m = [];
    for (let i = 0; i < ga.data.length; i++) if (ga.data[i] !== gb.data[i]) m.push([i % ga.w, Math.floor(i / ga.w)]);
    return m;
  };
  const SETS = [{}, { capeLength: 1.8 }, { cape: 'tattered', capeLength: 0.3 }];
  // where it lies at the base's own frames
  const [h0, h1] = [HERO, strip(HERO)].map(make);
  const box = SETS.map((set) => {
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (let f = 4; f < 8; f++) for (const [x, y] of capeGround(h0, h1, 'die', f, set)) { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x); b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y); }
    assert.ok(b.x1 >= b.x0 && b.y1 <= H.GROUND, `${JSON.stringify(set)}: the cape lies on the ground in die 4 to 7`);
    return b;
  });
  const bad = [];
  const cases = [[5, [64, 64]], [10, [96, 96]], [13, [64, 64]], [16, [64, 96]], [24, [64, 64]], [57, [640, 360]]];
  for (const [frames, size] of cases) for (const dropped of [false, true]) {
    const def = structuredClone(HERO);
    def.size = size;
    def.clips.die = { from: 'die', frames };                   // its sounds are on the base's frames
    def.clips.fall = { from: 'die', frames: frames + 3 };   // under another name, too
    if (dropped) def.body.rig.extends.drop = ['groundCut'];
    const [a, b] = [def, strip(def)].map(make);
    SETS.forEach((set, k) => {
      if (size[0] > 96 && k) return;                         // the largest frame at the defaults only (time)
      for (const clip of ['die', 'fall']) for (let f = 0; f < a.clips[clip].frames; f++) {
        const out = capeGround(a, b, clip, f, set).filter(([x, y]) => !(dropped && y > H.GROUND) && !(x >= box[k].x0 - 1 && x <= box[k].x1 + 1 && y >= box[k].y0 && y <= box[k].y1));
        if (out.length) bad.push(`${clip} ${f}/${a.clips[clip].frames} at ${size}${dropped ? ', cut dropped' : ''} ${JSON.stringify(set)}: ${out.length} px off the ground strip, e.g. ${JSON.stringify(out[0])}`);
      }
    });
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} frames`);
});

test('the base\'s cut clears everything under the ground to the edges of the largest frame (640x360)', () => {
  // a probe on the ground node covering all of a 640x360 frame under the ground row (and past its sides): with the
  // base's cut nothing of it shows, in every clip; dropped, it fills the frame under the ground (so the probe reaches)
  const probe = { id: 'probe', kind: 'poly', on: 'ground', points: [[-700, -1], [700, -1], [700, -320], [-700, -320]], paint: 'top', z: 5 };
  const def = { ...person(BASE), size: [640, 360], body: { rig: { extends: { use: BASE.id, v: BASE.v }, shapes: [probe] } } };
  const r = makeDataSprite(def, { pieces: store() });
  assert.ok(r.ok, r.errors.join('; '));
  const low = (g) => { for (let y = g.h - 1; y >= 0; y--) for (let x = 0; x < g.w; x++) if (g.data[y * g.w + x]) return y; return -1; };
  const under = [];
  for (const [clip, c] of Object.entries(r.sprite.clips)) for (let f = 0; f < c.frames; f++) {
    const y = low(renderFrame(r.sprite, clip, f, defaultParams(r.sprite)));
    if (y > H.GROUND) under.push(`${clip} ${f}: row ${y}`);
  }
  assert.deepEqual(under.slice(0, 10), [], `${under.length} frames draw under the ground`);
  const dropped = makeDataSprite({ ...def, body: { rig: { ...def.body.rig, extends: { ...def.body.rig.extends, drop: ['groundCut'] } } } }, { pieces: store() });
  assert.ok(dropped.ok, dropped.errors.join('; '));
  const g = renderFrame(dropped.sprite, 'idle', 0, defaultParams(dropped.sprite));
  for (const [x, y] of [[0, 359], [639, 359], [0, H.GROUND + 1], [639, H.GROUND + 1]]) assert.ok(g.data[y * g.w + x], `the probe reaches (${x}, ${y})`);
});
