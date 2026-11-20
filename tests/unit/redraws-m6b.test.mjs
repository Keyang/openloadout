// Migration batch M6b (docs/data-sprites.md sections 7 and 9; the third review of M6): the six side-view characters
// redrawn as data on base:person-side keep what the review found lost, each held against its frozen code copy
// (tests/fixtures/code-sprites/, codeSprite):
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
const CODE = Object.fromEntries(await Promise.all(IDS.map(async (id) => [id, await codeSprite(id)])));
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

test('every Motion slider of the code sprite is a control again, as the code had it, and a clip travel moves by it', () => {
  for (const id of IDS) {
    const def = DATA[id].definition;
    for (const k of MOTION[id]) {
      const d = DATA[id].params[k], c = CODE[id].params[k];
      assert.ok(d, `${id}: ${k} kept`);
      for (const f of ['kind', 'label', 'lo', 'hi', 'def', 'min', 'max', 'step', 'group']) assert.equal(d[f], c[f], `${id} ${k} ${f}`);
      const travelled = Object.values(def.clips).filter((cl) => (cl.travel ?? []).some((e) => e.by?.from === k));
      assert.ok(travelled.length >= (k === 'stride' ? 1 : 2), `${id}: ${k} moves ${travelled.length} clips`);
      // at the slider's middle a travel draws exactly as without it (its table has 1 at the default)
      for (const cl of travelled) for (const e of cl.travel.filter((x) => x.by?.from === k)) assert.ok(e.by.map.some(([a, b]) => a === c.def && b === 1), `${id} ${k}: 1 at the default ${c.def}`);
    }
  }
});

test('at each end of Bounce and Stride the walk, run and idle move as the code sprite\'s do', () => {
  for (const id of IDS.filter((x) => MOTION[x].includes('bounce'))) {
    const s = DATA[id], c = CODE[id];
    for (const clip of ['idle', 'walk', 'run'].filter((x) => s.clips[x])) {
      for (const [key, what, close] of [['bounce', 'travel', 0.7], ['stride', 'spread', 2.01]]) {
        if (clip === 'idle' && key === 'stride') continue;
        const ends = [0, s.params[key].def, 1];
        const cs = ends.map((v) => moves(c, clip, { [key]: v })[what]), ds = ends.map((v) => moves(s, clip, { [key]: v })[what]);
        const at = `${id} ${clip} ${key} ${what}: code ${cs.map((x) => x.toFixed(2)).join(' ')}, data ${ds.map((x) => x.toFixed(2)).join(' ')}`;
        // the same way as the code: less at the low end, more at the high end (the first redraw did not move at all)
        assert.ok(ds[0] < ds[2], at);
        if (cs[0] < cs[1]) assert.ok(ds[0] < ds[1] || ds[0] <= ds[1] + 0.05 && key === 'stride', at);
        // and about as far: each end's change from the middle within `close` of the code's change
        for (const i of [0, 2]) assert.ok(Math.abs((ds[i] - ds[1]) - (cs[i] - cs[1])) <= close, at);
      }
    }
  }
});

test('the hops (jump, victory, the bandit\'s steal) leave the ground higher with Bounce, as the code\'s do', () => {
  const top = (s, clip, over) => Math.min(...frames(s, clip).map((f) => renderFrame(s, clip, f, look(s, over)).bounds().y1));
  for (const [id, clip] of [['knight', 'jump'], ['knight', 'victory'], ['wizard', 'jump'], ['wizard', 'victory'], ['rogue-battler', 'jump'], ['road-bandit', 'steal']]) {
    const s = DATA[id], c = CODE[id];
    // the feet's highest row (the lowest pixel's least y) over the clip: higher at Bounce 1 than at 0, as in the code
    const d0 = top(s, clip, { bounce: 0 }), d1 = top(s, clip, { bounce: 1 }), c0 = top(c, clip, { bounce: 0 }), c1 = top(c, clip, { bounce: 1 });
    assert.ok(d1 < d0, `${id} ${clip}: the lowest pixel rises to ${d0} at Bounce 0 and ${d1} at 1 (code ${c0}, ${c1})`);
    assert.ok(Math.abs((d0 - d1) - (c0 - c1)) <= 1.01, `${id} ${clip}: ${d0 - d1} px more lift, the code ${c0 - c1}`);
  }
});

test('Rattle shakes the skeleton\'s bones as the code\'s Rattle does', () => {
  const s = DATA['bone-soldier'], c = CODE['bone-soldier'];
  for (const clip of ['idle', 'walk', 'block', 'attack', 'hurt']) {
    let d = 0, k = 0;
    for (const f of frames(s, clip)) { d += changed(s, clip, f, { wobble: 0 }, { wobble: 1 }); k += changed(c, clip, f, { wobble: 0 }, { wobble: 1 }); }
    assert.ok(k > 0, `${clip}: the code rattles`);
    assert.ok(d >= 0.25 * k && d >= 12 * frames(s, clip).length / 4, `${clip}: Rattle 0 against 1 changes ${d} pixels over the clip; the code ${k}`);
  }
  // and at the middle it keeps the code's look about as close as the M6 redraw did (0.83 there)
  assert.ok(meanOverlap('bone-soldier', {}) >= 0.8);
});

test('at the ends of every Motion slider each keeps its code sprite\'s silhouette', () => {
  for (const id of IDS) for (const k of MOTION[id]) for (const v of [0, 1]) {
    const o = meanOverlap(id, { [k]: v });
    assert.ok(o >= 0.74, `${id} ${k} ${v}: the silhouettes overlap ${o.toFixed(3)} on average`);
  }
});

/** The hand point's angle in radians, as a game reads it. */
const handAngle = (s, clip, f, over) => frameSockets(s, clip, f, look(s, over)).hand.angle;
const turn = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

test('the hand point turns with the Hold angle as the code\'s socket does, in every clip', () => {
  // review 3, issue 4: at Hold angle 40 the hand point was up to 0.7 radians off the code's on action frames, while the
  // drawn weapon turned (M6's mean over every frame at the low end, 20 and the high end: 0.15 to 0.40 radians). Measured
  // as the turn from Hold angle 0, which leaves aside where the poses differ at 0. Lying down, the code lays the weapon
  // on the ground whatever the Hold angle (rigs/humanoid.js fit), where data turns it into the ground cut
  for (const id of IDS) {
    const s = DATA[id], c = CODE[id], key = s.params.staffAngle ? 'staffAngle' : 'weaponAngle';
    let n = 0, sum = 0, worst = 0, where = '';
    for (const v of [s.params[key].min, 20, s.params[key].max].filter((x) => x <= s.params[key].max)) {
      for (const clip of Object.keys(s.clips)) for (const f of frames(s, clip)) {
        const dd = turn(handAngle(s, clip, f, { [key]: v }), handAngle(s, clip, f, {})), cd = turn(handAngle(c, clip, f, { [key]: v }), handAngle(c, clip, f, {}));
        const off = Math.abs(dd - cd);
        n++; sum += off;
        if (off > worst && clip !== 'die') { worst = off; where = `${clip} ${f} at ${v}: data turns ${dd.toFixed(2)}, code ${cd.toFixed(2)}`; }
      }
    }
    assert.ok(sum / n <= 0.08, `${id}: the hand point turns ${(sum / n).toFixed(3)} radians off the code's on average`);
    assert.ok(worst <= 0.35, `${id}: ${where}`);
  }
});

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

test('the goblin\'s thrust and the rogue\'s stab stay level whatever the Hold angle, as the code\'s do', () => {
  // review 3, issue 3: the goblin jabbed its spear down at the ground at Hold angle 40 and across its mouth at -10
  for (const [id, levelled] of [['spear-goblin', [1, 2, 3, 4, 5, 6]], ['rogue-battler', [2, 3, 4, 5]]]) {
    const s = DATA[id], c = CODE[id];
    for (const v of [-10, 20, 40]) for (const f of frames(s, 'attack')) {
      const d = handAngle(s, 'attack', f, { weaponAngle: v }), k = handAngle(c, 'attack', f, { weaponAngle: v });
      if (levelled.includes(f) || id === 'rogue-battler') assert.ok(Math.abs(turn(d, k)) <= 0.05, `${id} attack ${f} at ${v}: data ${d.toFixed(2)}, code ${k.toFixed(2)}`);
      if (id === 'spear-goblin' && levelled.includes(f)) assert.ok(Math.abs(turn(d, handAngle(s, 'attack', f, {}))) < 1e-6, `${id} attack ${f}: the thrust is level at ${v}`);
    }
  }
  // with every slider at an end the goblin's thrust keeps the code's silhouette (review 3: 0.62 with every slider high);
  // the whole goblin was 0.67 and 0.70 there, 0.68 and 0.70 now: what is left is its collapse at the smallest look
  const all = (s, v) => Object.fromEntries(Object.entries(s.params).filter(([, p]) => p.kind === 'range' && p.group !== 'Motion').map(([k, p]) => [k, v ? p.max : p.min]));
  const s = DATA['spear-goblin'], c = CODE['spear-goblin'];
  for (const v of [0, 1]) {
    const o = frames(s, 'attack').reduce((m, f) => m + overlap(renderFrame(c, 'attack', f, look(c, all(c, v))), renderFrame(s, 'attack', f, look(s, all(s, v)))), 0) / s.clips.attack.frames;
    assert.ok(o >= 0.66, `spear-goblin attack with every slider ${v ? 'high' : 'low'}: overlap ${o.toFixed(3)}`);
    assert.ok(meanOverlap('spear-goblin', all(s, v)) >= 0.68, `spear-goblin with every slider ${v ? 'high' : 'low'}`);
  }
});

test('the rogue at its defaults: the hood frames a face the code\'s size, and the scarf wraps the chin and neck', () => {
  // review 3, issue 5: the data rogue showed a larger face of skin and a brown band at the chin
  const s = DATA['rogue-battler'], c = CODE['rogue-battler'];
  for (const [clip, f] of [['idle', 0], ['idle', 4], ['walk', 0], ['walk', 4], ['run', 2], ['victory', 0]]) {
    const count = (x) => {
      const p = look(x), g = renderFrame(x, clip, f, p), h = frameSockets(x, clip, f, p).head;
      const skin = new Set(tones(p.skin)), scarf = new Set(tones('#94a0b2'));
      let sk = 0, sc = 0;
      for (let i = 0; i < g.data.length; i++) { const px = i % g.w, py = Math.floor(i / g.w); if (Math.abs(px - h.x) > 8 || py < h.y - 2 || py > h.y + 16) continue; if (skin.has(g.data[i])) sk++; if (scarf.has(g.data[i])) sc++; }
      return { sk, sc };
    };
    const a = count(c), b = count(s);
    assert.ok(Math.abs(b.sk - a.sk) <= 5, `${clip} ${f}: ${b.sk} pixels of skin round the face; the code ${a.sk}`);
    assert.ok(b.sc >= a.sc, `${clip} ${f}: ${b.sc} pixels of scarf round the chin and neck; the code ${a.sc}`);
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
