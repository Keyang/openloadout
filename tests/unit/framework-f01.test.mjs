// Framework additions of batch F01 (rogue-walker), all in rigs/topdown-sneak.js: the tail of a scarf as cloth (it
// narrows to a forked tip, hangs at rest, streams and whips when the body moves), cloth headgear by name with one
// Size setting (hood, bandana, mask), the rise of a head for frame(), and a rogue's blades (one in each hand).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Surface } from '../../engine/surface.js';
import { col, ramp, tone } from '../../engine/color.js';
import * as T from '../../rigs/topdown.js';
import * as S from '../../rigs/topdown-sneak.js';

const LOOK = { skin: '#f6d3b0', top: '#3f6fd1', bottom: '#2c4a8a', boots: '#9a6a3e', hair: '#5a3a22', hairStyle: 'short' };
const [W, H] = T.SIZE;
const CLOTH = '#c9423a';                                  // a colour nothing else on the test body uses
const tones = (hex) => { const r = ramp(hex); return new Set([r.light, r.base, r.dark, r.deep].map(col)); };
/** The pixels painted in any tone of `hex`: [[x, y], ...]. */
const painted = (g, hex) => { const set = tones(hex), out = []; for (let i = 0; i < g.data.length; i++) if (set.has(g.data[i])) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const same = (a, b) => diff(a, b) === 0;
const BODIES = [{ height: 0, build: 0, head: 0 }, {}, { height: 1, build: 1, head: 1 }];
const FRAMES = [0, 1, 2, 3, 4, 5, 6, 7].map((f) => f / 8);
const ACTIONS = ['idle', 'walk', 'run'];
/** A body in an action facing `direction`: { d, P, J } as a hook gets them. */
function posed(direction, { dims = {}, action = 'idle', t = 0 } = {}) {
  const d = T.dims(dims), P = T.pose(action, direction, t, {}, d);
  return { d, P, J: T.solve(direction, P, d) };
}
/** The scarf alone on an empty frame: { g, line, px }. */
function tail(direction, opt = {}, body = {}) {
  const { d, P, J } = posed(direction, body), g = new Surface(W, H);
  const line = S.scarfTail(g, J, P, d, { colour: CLOTH, ...opt });
  return { g, line, px: painted(g, CLOTH), J, d };
}
/** How many painted pixels lie within `r` of a point. */
const near = (px, [x, y], r) => px.filter(([a, b]) => Math.hypot(a + 0.5 - x, b + 0.5 - y) <= r).length;

// ---- the scarf ------------------------------------------------------------------------------------------

test('scarfTail: narrows from the neck to a tip one or two pixels wide', () => {
  for (const dims of BODIES) for (const dir of T.DIRECTIONS) for (const action of ACTIONS) for (const t of FRAMES) {
    const { line, px } = tail(dir, { kind: 'long', action, t }, { dims, action, t }), where = `${dir} ${action} t=${t}`;
    assert.ok(px.length >= 14, `${where}: a tail is drawn (${px.length})`);
    const widths = line.points.map((q) => q[2] * 2);
    assert.ok(widths[0] >= 3 && widths[0] <= 4, `${where}: three to four pixels wide at the neck (${widths[0]})`);
    for (let i = 1; i < widths.length; i++) assert.ok(widths[i] <= widths[i - 1] + 1e-9, `${where}: it never widens on the way`);
    assert.ok(widths[widths.length - 1] <= 2, `${where}: two pixels wide where it forks`);
    // on the picture: a disc of the same size holds more cloth near the neck than at either end of the fork
    const mid = line.points[2], thick = near(px, mid, 2);
    for (const end of line.fork) {
      const thin = near(px, end, 2);
      assert.ok(thin >= 1, `${where}: the strand reaches its end`);
      assert.ok(thin < thick, `${where}: thinner at the tip (${thin}) than near the neck (${thick})`);
    }
  }
});

test('scarfTail: the end is split into two strands, one a little shorter', () => {
  for (const dir of T.DIRECTIONS) for (const kind of ['short', 'long']) for (const action of ACTIONS) for (const t of FRAMES) {
    const { line } = tail(dir, { kind, action, t }, { action, t }), [a, b] = line.fork, last = line.points[line.points.length - 1];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 2, `${dir} ${kind} ${action}: the two ends are 2 px or more apart`);
    const la = Math.hypot(a[0] - last[0], a[1] - last[1]), lb = Math.hypot(b[0] - last[0], b[1] - last[1]);
    assert.ok(la >= 2 && lb >= 1 && la > lb, `${dir} ${kind} ${action}: strands of ${la.toFixed(1)} and ${lb.toFixed(1)} px`);
  }
  // on the picture, hanging down the back: the row of the longer strand's end holds less cloth than a row near the neck, and there is a notch between the strands
  const { px, line } = tail('up', { kind: 'long', flow: 0, whip: 0 });
  const row = (y) => px.filter(([, b]) => b === y).map(([a]) => a).sort((p, q) => p - q);
  const low = Math.max(...px.map(([, y]) => y));
  assert.ok(row(low).length < row(Math.round(line.root[1]) + 2).length, 'the last row is narrower than a row near the neck');
  const forked = row(low - 1);
  assert.ok(forked.length >= 2 && forked[forked.length - 1] - forked[0] >= forked.length, `a gap between the strands a row above the end (${forked})`);
});

test('scarfTail: at rest it hangs: the tip is lower than the knot by half its length or more, facing down and sideways', () => {
  for (const dims of BODIES) for (const dir of ['down', 'side']) for (const kind of ['short', 'long']) for (const length of [0.65, 1, 1.35]) {
    for (const flow of [0, 0.1, 0.2]) for (const t of FRAMES) {
      const { line, px } = tail(dir, { kind, length, flow, t }, { dims, t }), where = `${dir} ${kind} x${length} flow ${flow} t=${t}`;
      assert.ok(line.tip[1] - line.root[1] >= line.length / 2, `${where}: the tip hangs ${(line.tip[1] - line.root[1]).toFixed(1)} px under the knot, of ${line.length}`);
      assert.ok(Math.max(...px.map(([, y]) => y)) + 1 - line.root[1] >= line.length / 2 - 0.5, `${where}: and so does the cloth on the picture`);
    }
    // the idle action is a hanging one
    assert.ok(S.SCARF_FLY.idle.flow <= 0.2);
    for (const t of FRAMES) { const { line } = tail(dir, { kind, length, action: 'idle', t }, { dims, t }); assert.ok(line.tip[1] - line.root[1] >= line.length / 2, `${dir} ${kind} idle t=${t}`); }
  }
});

test('scarfTail: the tip moves 2 px or more over the idle loop, and further when the body moves', () => {
  const travel = (dir, action, kind = 'long') => {
    const tips = FRAMES.map((t) => { const { line, J } = tail(dir, { kind, action, t }, { action, t }); return [Math.round(line.tip[0] - J.bx), Math.round(line.tip[1] - J.shoulderY)]; });
    let far = 0;
    for (const a of tips) for (const b of tips) far = Math.max(far, Math.hypot(a[0] - b[0], a[1] - b[1]));
    return far;
  };
  for (const dir of T.DIRECTIONS) {
    assert.ok(travel(dir, 'idle') >= 2, `${dir}: the tip of a long tail moves ${travel(dir, 'idle').toFixed(1)} px in idle`);
    assert.ok(travel(dir, 'idle') <= 5, `${dir}: but an idle tail does not thrash (${travel(dir, 'idle').toFixed(1)} px)`);
    assert.ok(travel(dir, 'idle', 'short') >= 1, `${dir}: a short tail moves too`);
    assert.ok(travel(dir, 'run') >= 3, `${dir}: it whips in a run (${travel(dir, 'run').toFixed(1)} px)`);
  }
});

test('scarfTail: it streams behind a moving body: back facing sideways, up the screen past the head facing down', () => {
  for (const dims of BODIES) for (const t of FRAMES) {
    const side = (action) => tail('side', { kind: 'long', action, t }, { dims, action, t }).line;
    const run = side('run'), walk = side('walk'), idle = side('idle');
    assert.ok(run.root[0] - run.tip[0] >= run.length * 0.7, `side run t=${t}: the tip is ${(run.root[0] - run.tip[0]).toFixed(1)} px behind the knot`);
    assert.ok(run.tip[1] - run.root[1] < run.length * 0.3, `side run t=${t}: and nearly level with it`);
    assert.ok(run.root[0] - run.tip[0] > idle.root[0] - idle.tip[0] + 2, `side t=${t}: further back in a run than at rest`);
    assert.ok(walk.tip[1] - walk.root[1] > run.tip[1] - run.root[1], `side t=${t}: a walk lifts it less than a run`);
    const down = tail('down', { kind: 'long', action: 'run', t }, { dims, action: 'run', t }).line;
    assert.ok(down.tip[1] < down.root[1] && down.tip[0] > down.root[0] + down.length * 0.5, `down run t=${t}: up and out past the shoulder`);
  }
  // each action has its own way of flying, and an action the table does not list still flies
  assert.deepEqual(Object.keys(S.SCARF_FLY), ['idle', 'walk', 'run', 'other']);
  assert.ok(S.SCARF_FLY.idle.flow < S.SCARF_FLY.walk.flow && S.SCARF_FLY.walk.flow < S.SCARF_FLY.run.flow);
  const { d, P, J } = posed('side', { action: 'attack', t: 0.5 });
  assert.equal(S.scarfLine(J, P, d, { action: 'attack', t: 0.5 }).flow, S.SCARF_FLY.other.flow);
});

test('scarfTail: a loop closes, and action and t are what move it', () => {
  for (const dir of T.DIRECTIONS) for (const action of ACTIONS) {
    const a = tail(dir, { action, t: 0 }).g, b = tail(dir, { action, t: 1 }).g, c = tail(dir, { action, t: 0.25 }).g;
    assert.ok(same(a, b), `${dir} ${action}: t = 1 is t = 0`);
    assert.ok(diff(a, c) >= 2, `${dir} ${action}: t = 0.25 is another picture`);
  }
  assert.ok(diff(tail('side', { action: 'idle' }).g, tail('side', { action: 'run' }).g) >= 10, 'the action changes it');
  assert.ok(diff(tail('side', { action: 'idle' }).g, tail('side', { action: 'idle', flow: 1 }).g) >= 10, 'flow replaces the action\'s own');
});

test('scarfTail: kinds and Length set how long it is; none, zero and a lying body draw nothing', () => {
  assert.deepEqual({ ...S.SCARF_TAILS }, { short: 6, long: 12 });
  for (const dir of T.DIRECTIONS) {
    const short = tail(dir, { kind: 'short' }), long = tail(dir, { kind: 'long' });
    assert.equal(short.line.length, 6); assert.equal(long.line.length, 12);
    assert.ok(long.px.length >= short.px.length + 8, `${dir}: long has more cloth (${long.px.length} against ${short.px.length})`);
    for (const kind of ['short', 'long']) assert.ok(diff(tail(dir, { kind, length: 0.65 }).g, tail(dir, { kind, length: 1.35 }).g) >= 3, `${dir} ${kind}: Length changes it`);
    for (const opt of [{ kind: 'none' }, { kind: 'long', length: 0 }, { kind: 'cape' }]) { const none = tail(dir, opt); assert.equal(none.line, null); assert.equal(none.px.length, 0); }
  }
  const d = T.dims({}), P = T.pose('die', 'down', 1, {}, d);
  assert.ok(P.lie, 'the last frame of die lies down');
  assert.equal(S.scarfTail(new Surface(W, H), T.solve('down', P, d), P, d, { kind: 'long' }), null);
});

test('scarfTail: never leaves the frame or goes under the ground line, whatever the body, the length and the action', () => {
  for (const dims of BODIES) for (const dir of T.DIRECTIONS) for (const action of [...ACTIONS, 'attack', 'hurt']) for (const length of [0.65, 1.35]) for (const t of FRAMES) {
    const F = T.frameWith(`${action}_${dir}`, t, dims, { carry: 'low', manner: T.dashManner }), g = new Surface(W, H);
    const line = S.scarfTail(g, T.solve(dir, F.P, F.d), F.P, F.d, { colour: CLOTH, kind: 'long', length, action, t });
    const px = painted(g, CLOTH);
    assert.ok(px.length >= 6, `${dir} ${action} t=${t}: drawn`);
    assert.ok(px.every(([x, y]) => x > 1 && x < W - 2 && y > 1 && y < T.GROUND - 1), `${dir} ${action} x${length} t=${t}: inside the frame and over the ground`);
    assert.ok(line.length <= 12 * length + 1e-9 && line.length > 2);
  }
});

test('scarfTail: a dark cloth is painted in its light and base tones, a pale one in its own three', () => {
  const dark = '#5a5f7a', r = ramp(dark), g = new Surface(W, H), { d, P, J } = posed('side', { action: 'run' });
  S.scarfTail(g, J, P, d, { colour: dark, action: 'run' });
  const used = new Set([...g.data].filter(Boolean));
  assert.ok(used.has(col(r.light)), 'the light tone is its main tone');
  assert.ok(!used.has(col(r.dark)) && !used.has(col(r.deep)), 'no tone as dark as the outline');
  const pale = tail('side', { action: 'run' }).g, p = ramp(CLOTH);
  assert.ok([...pale.data].includes(col(p.base)), 'a pale cloth keeps its base tone');
});

test('scarfTail: drawn from the behind hook it is behind the body facing down and sideways, and on the back facing away', () => {
  for (const dir of T.DIRECTIONS) {
    const g = new Surface(W, H), d = T.dims({}), P = T.pose('idle', dir, 0, {}, d);
    T.draw(g, dir, P, d, LOOK, { behind: (g, J, P, d) => S.scarfTail(g, J, P, d, { colour: CLOTH, kind: 'long' }) });
    const seen = painted(g, CLOTH).length, all = tail(dir, { kind: 'long' }).px.length;
    assert.ok(seen >= 10, `${dir}: the tail shows (${seen} px)`);
    if (dir === 'up') assert.ok(seen >= all - 3, `up: it lies on the back, under the point of nothing but a hood (${seen} of ${all})`);
    else assert.ok(seen >= all * 0.6, `${dir}: most of it is clear of the body (${seen} of ${all})`);
  }
});

// ---- cloth headgear -------------------------------------------------------------------------------------

/** A standing body with a head hook: the surface. */
const headed = (dir, head, look = LOOK) => { const g = new Surface(W, H), d = T.dims({}), P = T.pose('idle', dir, 0, {}, d); T.draw(g, dir, P, d, look, { head }); return g; };

test('sizedHood: Size is the hood\'s depth: 0.5 pushed back, 1.8 pulled low, and it changes the face side of the picture', () => {
  const bald = { ...LOOK, hairStyle: 'bald' };
  for (const dir of T.DIRECTIONS) {
    for (const [size, depth] of [[0.5, 0], [1, 2 * 0.5 / 1.3], [1.8, 2], [0.2, 0], [3, 2]]) {
      const a = headed(dir, (g, J, P, d) => S.sizedHood(g, J, P, d, { colour: CLOTH, size }), bald);
      const b = headed(dir, (g, J, P, d) => T.hood(g, J, P, d, { colour: CLOTH, depth }), bald);
      assert.ok(same(a, b), `${dir}: size ${size} is depth ${depth.toFixed(2)}`);
    }
    const small = headed(dir, (g, J, P, d) => S.sizedHood(g, J, P, d, { colour: CLOTH, size: 0.5 }), bald);
    const big = headed(dir, (g, J, P, d) => S.sizedHood(g, J, P, d, { colour: CLOTH, size: 1.8 }), bald);
    if (dir !== 'up') assert.ok(diff(big, small) >= 2, `${dir}: Size changes the opening round the face`);
    if (dir === 'down') assert.ok(painted(big, CLOTH).length > painted(small, CLOTH).length, 'down: a big hood covers more of the brow');
  }
});

test('headCloth: draws the hood, the bandana or the mask by name with the same Size, and nothing for any other name', () => {
  assert.deepEqual([...S.HEAD_CLOTHS], ['hood', 'bandana', 'mask']);
  const direct = { hood: S.sizedHood, bandana: T.bandana, mask: T.mask };
  for (const dir of T.DIRECTIONS) {
    const bare = headed(dir, () => {});
    for (const kind of S.HEAD_CLOTHS) for (const size of [0.5, 1, 1.8]) {
      const a = headed(dir, (g, J, P, d) => S.headCloth(g, J, P, d, { kind, size, colour: CLOTH }));
      const b = headed(dir, (g, J, P, d) => direct[kind](g, J, P, d, { size, colour: CLOTH }));
      assert.ok(same(a, b), `${dir} ${kind} size ${size}`);
      assert.ok(painted(a, CLOTH).length >= 3, `${dir} ${kind}: drawn`);
    }
    for (const kind of ['none', 'helmet', undefined]) assert.ok(same(bare, headed(dir, (g, J, P, d) => S.headCloth(g, J, P, d, { kind, colour: CLOTH }))), `${dir}: ${kind} draws nothing`);
  }
});

test('headRise: the headgear\'s rise when it has one, otherwise the hair\'s', () => {
  assert.equal(S.headRise({ headgear: 'hood', hairStyle: 'spiky' }), T.headgearRise('hood'));
  assert.equal(S.headRise({ headgear: 'helmet', size: 1.8, hairStyle: 'short' }), T.headgearRise('helmet', 1.8));
  for (const headgear of ['bandana', 'mask', 'none', undefined]) {
    assert.equal(S.headRise({ headgear, hairStyle: 'spiky' }), 3, `${headgear}: spiky hair stands 3 px up`);
    for (const hairStyle of ['short', 'long', 'ponytail', 'bald']) assert.equal(S.headRise({ headgear, hairStyle }), 0, `${headgear}, ${hairStyle}`);
  }
  assert.equal(S.headRise(), 0);
});

// ---- blades ---------------------------------------------------------------------------------------------

test('BLADES and bladeSize: what each weapon is on the rig, and its size for frame()', () => {
  assert.deepEqual(Object.keys(S.BLADES), ['daggers', 'short sword', 'claws']);
  assert.deepEqual(S.bladeSize('daggers'), T.smallItemSize('dagger', 1));
  assert.deepEqual(S.bladeSize('claws', 1.35), T.smallItemSize('claws', 1.35));
  assert.deepEqual(S.bladeSize('short sword', 1), T.itemSize('sword', 0.85));
  assert.ok(S.bladeSize('short sword').length < T.itemSize('sword').length, 'a short sword is shorter than the rig\'s sword');
  assert.equal(S.bladeSize('none'), null);
  assert.equal(S.bladeSize(undefined), null);
  assert.ok(S.BLADES.daggers.pair && S.BLADES.claws.pair && !S.BLADES['short sword'].pair);
});

const STEEL = '#c2c9d6', GOLD = '#f2c230';
/** One hand's blade alone on an empty frame, for a body standing with the blade held low. */
function bladeOnly(dir, { kind, scale = 1, ...opt }) {
  const F = T.frameWith(`idle_${dir}`, 0, {}, { item: S.bladeSize(kind, scale), carry: 'low' }), J = T.solve(dir, F.P, F.d), g = new Surface(W, H);
  S.blade(g, J, F.P, F.d, { kind, length: F.item?.length, ...opt });
  return { g, F, J };
}

test('blade: the main hand draws the weapon at the hand socket; the off hand the second of a pair and nothing else', () => {
  for (const dir of T.DIRECTIONS) for (const weapon of Object.keys(S.BLADES)) for (const length of [0.65, 1, 1.35]) {
    const main = bladeOnly(dir, { kind: weapon, scale: length, hand: 'main', metal: STEEL, hilt: GOLD }), held = S.BLADES[weapon];
    const want = new Surface(W, H);
    T.smallItem(want, dir, T.sockets(main.J, main.F.P, main.F.d).hand, { kind: held.kind, length: main.F.item.length, metal: STEEL, hilt: GOLD });
    assert.ok(same(main.g, want), `${dir} ${weapon} x${length}: the main hand is smallItem() at the hand`);
    assert.ok([...main.g.data].filter(Boolean).length >= 4, `${dir} ${weapon}: drawn`);
    const off = bladeOnly(dir, { kind: weapon, scale: length, hand: 'off', metal: STEEL, hilt: GOLD }), n = [...off.g.data].filter(Boolean).length;
    if (!held.pair) { assert.equal(n, 0, `${dir} ${weapon}: one weapon, nothing in the off hand`); continue; }
    const second = new Surface(W, H);
    T.smallItem(second, dir, T.offGrip(off.J, off.F.P), { kind: held.kind, length: off.F.item.length, metal: dir === 'side' ? tone(STEEL, -1) : STEEL, hilt: GOLD });
    assert.ok(same(off.g, second), `${dir} ${weapon}: the off hand is smallItem() at the off grip`);
    assert.ok(n >= 4 && diff(off.g, main.g) >= 4, `${dir} ${weapon}: a second one, somewhere else`);
  }
});

test('blade: facing sideways the far one of a pair is a tone darker; facing down and up both are the same metal', () => {
  const bright = col(ramp(STEEL).base), far = tones(tone(STEEL, -1));
  for (const weapon of ['daggers', 'claws']) {
    const side = bladeOnly('side', { kind: weapon, hand: 'off', metal: STEEL, hilt: GOLD }).g;
    assert.ok(![...side.data].includes(bright), `${weapon}: no bright steel on the far side`);
    assert.ok([...side.data].some((v) => far.has(v)), `${weapon}: the darker tone is there`);
    for (const dir of ['down', 'up']) assert.ok([...bladeOnly(dir, { kind: weapon, hand: 'off', metal: STEEL, hilt: GOLD }).g.data].some((v) => tones(STEEL).has(v)), `${weapon} ${dir}: the same steel`);
  }
});

test('blade: no weapon draws nothing in either hand', () => {
  for (const dir of T.DIRECTIONS) for (const hand of ['main', 'off']) for (const weapon of ['none', undefined, 'sword']) {
    const d = T.dims({}), P = T.pose('idle', dir, 0, {}, d), g = new Surface(W, H);
    S.blade(g, T.solve(dir, P, d), P, d, { kind: weapon, hand });
    assert.equal([...g.data].filter(Boolean).length, 0, `${dir} ${hand} ${weapon}`);
  }
  // with no length given it is the standard size
  const d = T.dims({}), P = T.pose('idle', 'down', 0, {}, d), J = T.solve('down', P, d), a = new Surface(W, H), b = new Surface(W, H);
  S.blade(a, J, P, d, { kind: 'daggers' }); S.blade(b, J, P, d, { kind: 'daggers', length: S.bladeSize('daggers').length });
  assert.ok(same(a, b) && [...a.data].some(Boolean), 'the standard length is the default');
});

// ---- the sprite that uses them --------------------------------------------------------------------------

test('rogue-walker holds no drawing or pose arithmetic of its own (Contract 13)', () => {
  const src = fs.readFileSync(new URL('../../sprites/rogue-walker.js', import.meta.url), 'utf8').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  for (const word of ['Math.', 'lerp', 'clamp', 'TAU', 'g.rect', 'g.fill', 'g.dot', 'g.line', 'g.capsule', 'g.ellipse', 'g.poly', 'g.blob']) assert.ok(!src.includes(word), `sprites/rogue-walker.js still has ${word}`);
  assert.ok(src.includes('S.scarfTail') && src.includes('S.headCloth') && src.includes('S.blade') && src.includes('S.headRise'), 'it asks the rig for its scarf, headgear, blades and rise by name');
});

test('rogue-walker draws through the rig: its default frame is the rig\'s parts and nothing else', async () => {
  const { renderFrame, defaultParams } = await import('../../engine/sprite.js');
  const sprite = (await import('../../sprites/rogue-walker.js')).default, p = defaultParams(sprite);
  for (const clip of ['idle_down', 'walk_up', 'run_side']) for (const frame of [0, 3]) {
    const got = renderFrame(sprite, clip, frame, p), t = frame / 8, HV = { steel: '#c2c9d6', gold: '#f2c230' };
    const F = T.frameWith(clip, t, p, { item: S.bladeSize(p.weapon, p.weaponLength), carry: 'low', rise: S.headRise({ headgear: p.headgear, size: p.headgearSize, hairStyle: p.hairStyle }), manner: T.dashManner });
    const g = new Surface(W, H), blade = (hand) => (g, J, P, d) => S.blade(g, J, P, d, { kind: p.weapon, length: F.item?.length, hand, metal: HV.steel, hilt: HV.gold });
    F.draw(g, { skin: p.skin, top: p.outfit, bottom: tone(p.outfit, -0.6), boots: p.trim, hair: p.hair, hairStyle: 'bald', hatted: true }, {
      behind: (g, J, P, d) => S.scarfTail(g, J, P, d, { kind: p.scarf, length: p.scarfLength, colour: p.trim, action: F.action, t }),
      torso: (g, J, P, d) => { T.belt(g, J, P, d, { colour: tone(p.trim, 0.85), buckle: HV.steel }); T.scarfWrap(g, J, P, d, { colour: p.trim }); },
      head: (g, J, P, d) => S.headCloth(g, J, P, d, { kind: p.headgear, size: p.headgearSize, colour: p.outfit }),
      offhand: blade('off'), item: blade('main'),
    });
    F.finish(g);
    assert.ok(same(got, g), `${clip} frame ${frame}`);
  }
});
