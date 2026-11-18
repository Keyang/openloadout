// The changes the bundle specifications ask of the five reused sprites (kit-platformer-fantasy, batch P00):
// knight: die, block, victory, and a landing thud; wizard: die, victory, talk; slime, bat, wolf: die.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultParams, cleanParams, renderFrame, renderSheet, frameSockets, clipFps, partList, cueInEffect } from '../../engine/sprite.js';
import { col, ramp, farRamp } from '../../engine/color.js';
import * as H from '../../rigs/humanoid.js';
import knight from '../../sprites/knight.js';
import wizard from '../../sprites/wizard.js';
import slime from '../../sprites/slime.js';
import bat from '../../sprites/bat.js';
import wolf from '../../sprites/wolf.js';

const SPRITES = { knight, wizard, slime, bat, wolf };
const look = (s, over = {}) => cleanParams(s, { ...defaultParams(s), ...over });
const frames = (s, clip) => Array.from({ length: s.clips[clip].frames }, (_, f) => f);
const diff = (a, b) => { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; };
const opaque = (g) => g.data.reduce((n, v) => n + (v ? 1 : 0), 0);
const box = (g) => { const b = g.bounds(); return b && { ...b, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 }; };
const sound = (id) => JSON.parse(fs.readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'));

/** The checker's tested settings: default, all sliders low, all high, each option of each choice, each on/off flipped. */
function testedLooks(s) {
  const d = defaultParams(s), out = [['default', d]];
  const ends = (which) => Object.fromEntries(Object.entries(s.params).filter(([, c]) => c.kind === 'range').map(([k, c]) => [k, c[which]]));
  out.push(['all low', { ...d, ...ends('min') }], ['all high', { ...d, ...ends('max') }]);
  for (const [k, c] of Object.entries(s.params)) {
    if (c.kind === 'choice') for (const o of c.options) if (o.value !== c.def) out.push([`${k}=${o.value}`, { ...d, [k]: o.value }]);
    if (c.kind === 'toggle') out.push([`${k}=${!c.def}`, { ...d, [k]: !c.def }]);
  }
  // every choice at once, on the biggest and the smallest body
  for (const [k, c] of Object.entries(s.params)) if (c.kind === 'choice') for (const o of c.options) {
    out.push([`all high, ${k}=${o.value}`, { ...d, ...ends('max'), [k]: o.value }], [`all low, ${k}=${o.value}`, { ...d, ...ends('min'), [k]: o.value }]);
  }
  return out;
}

function clipHashes(s, p, clips) {
  const out = {};
  for (const clip of clips) {
    let h = 2166136261;
    for (const f of frames(s, clip)) for (const v of renderFrame(s, clip, f, p).data) { h = Math.imul(h ^ (v & 0xffff), 16777619); h = Math.imul(h ^ (v >>> 16), 16777619); }
    out[clip] = (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

// ---- what was there before is untouched -------------------------------------------------------

// Recorded on 2026-11-18 from the sprites as they were before this change (one hash per clip over all its frames).
const LOOKS = {
  knight: { default: {}, tall: { height: 1, build: 1, head: 1 }, spear: { weapon: 'spear', headgear: 'crown', cape: 'tattered', hairStyle: 'long' }, bare: { weapon: 'none', headgear: 'none', cape: 'none', height: 0, build: 0, head: 0 } },
  wizard: { default: {}, tall: { height: 1, build: 1, head: 1 }, hood: { hat: 'hood', beard: 'none', staff: 'crook' }, small: { height: 0, build: 0, head: 0, hat: 'wide', beard: 'short', staff: 'crystal' } },
  slime: { default: {}, big: { size: 1, shape: 1, topping: 'crown', eyes: 'one' }, small: { size: 0, shape: 0, topping: 'horns', shine: false } },
  bat: { default: {}, big: { size: 1, span: 1, ears: 1, wing: 'round', eyes: 'one' }, small: { size: 0, span: 0, ears: 0, wing: 'sharp', fangs: false } },
  wolf: { default: {}, big: { size: 1, legs: 1, snout: 1, fluff: 1, tail: 'curled', markings: 'mask', ears: 'tall' }, small: { size: 0, legs: 0, snout: 0, fluff: 0, tail: 'brush', markings: 'plain', ears: 'floppy' } },
};
const BEFORE = {
  'knight default': { idle: '64393393', walk: 'f7129018', run: '573fc90f', jump: 'f091cb3f', attack: '7ba7388c', hurt: '2c9e259f' },
  'knight tall': { idle: '7c9900d3', walk: '74fdedb3', run: '59e473bc', jump: '3e48263b', attack: '91087212', hurt: '9250057b' },
  'knight spear': { idle: 'a0e0aade', walk: '9d675f96', run: '15d5f73b', jump: 'd783eff9', attack: 'bf81d0ac', hurt: '08924831' },
  'knight bare': { idle: '41451655', walk: '52f3db72', run: 'f77d66f9', jump: 'dcea080e', attack: 'da26d58f', hurt: 'a64f006a' },
  'wizard default': { idle: '62caf596', walk: '9a882e74', run: '47a03e43', jump: 'b59d6947', cast: '418da5d5', hurt: '426887cc' },
  'wizard tall': { idle: 'c31d188e', walk: 'ece6d761', run: 'd23842f6', jump: '44b4f949', cast: 'f04b79ee', hurt: '2fc1289f' },
  'wizard hood': { idle: 'd901a544', walk: 'f4bb8a16', run: '8a4f2d64', jump: '029b09d7', cast: '0ed57d35', hurt: '26f4d1ce' },
  'wizard small': { idle: 'a4c2b390', walk: '0511b312', run: '443ee4da', jump: 'c96fa298', cast: '286608a0', hurt: '91a0569b' },
  'slime default': { idle: '2446b81d', hop: '70406a7b', attack: 'd6404981', hurt: '6fcf6b05' },
  'slime big': { idle: 'fa9bde3d', hop: '18408929', attack: '5e7133d9', hurt: 'e34282c5' },
  'slime small': { idle: '3c5b6395', hop: '16a0f9bf', attack: '4226a161', hurt: 'd868af3e' },
  'bat default': { idle: '0b168dd5', fly: 'fee57c54', attack: '90d6a8b5', hurt: '6aa3b0c6' },
  'bat big': { idle: '923376e1', fly: 'b6c7e4e3', attack: 'c0f1d7ec', hurt: 'a8323ff7' },
  'bat small': { idle: '2c1d2998', fly: 'a9188fc1', attack: 'aa1b88de', hurt: '7c5a86cb' },
  'wolf default': { idle: 'c712e414', walk: 'ec75ada8', run: 'e0ead629', attack: 'f3fefd3b', hurt: 'b1ce39dd' },
  'wolf big': { idle: 'f1fc382f', walk: 'a6cab6d0', run: '53ed62a9', attack: '6426f230', hurt: 'cd5b08d9' },
  'wolf small': { idle: '13420505', walk: '5307101a', run: 'a9db7f22', attack: '3580e843', hurt: '85b8a8c9' },
};

test("the Hero's default idle, walk and run frames are pixel-identical to before", () => {
  const got = clipHashes(knight, defaultParams(knight), ['idle', 'walk', 'run']);
  assert.deepEqual(got, { idle: '64393393', walk: 'f7129018', run: '573fc90f' });
});

test('every clip the five sprites had before draws exactly what it drew before, in several looks', () => {
  for (const [id, s] of Object.entries(SPRITES)) for (const [name, over] of Object.entries(LOOKS[id])) {
    const want = BEFORE[`${id} ${name}`];
    assert.deepEqual(clipHashes(s, look(s, over), Object.keys(want)), want, `${id}, ${name} look`);
  }
});

test('the old clips keep their order, frame counts and loop settings; the new ones come after', () => {
  const had = { knight: ['idle', 'walk', 'run', 'jump', 'attack', 'hurt'], wizard: ['idle', 'walk', 'run', 'jump', 'cast', 'hurt'], slime: ['idle', 'hop', 'attack', 'hurt'], bat: ['idle', 'fly', 'attack', 'hurt'], wolf: ['idle', 'walk', 'run', 'attack', 'hurt'] };
  for (const [id, s] of Object.entries(SPRITES)) {
    const names = Object.keys(s.clips);
    assert.deepEqual(names.slice(0, had[id].length), had[id], id);
    assert.equal(names[0], 'idle', `${id}: the checker measures the first clip`);
    for (const c of had[id]) assert.equal(s.clips[c].frames, c === 'hurt' ? 4 : 8, `${id} ${c}`);
  }
  assert.equal(knight.preview, 'walk');
  assert.equal(wizard.preview, 'cast');
});

// ---- the clips the specification asks for ----------------------------------------------------

const ASKED = {
  knight: { die: [8, false, 10], block: [6, false, 10], victory: [8, true, 8] },
  wizard: { die: [8, false, 10], victory: [8, true, 8], talk: [8, true, 7] },
  slime: { die: [8, false, 10] },
  bat: { die: [8, false, 10] },
  wolf: { die: [8, false, 10] },
};

test('each sprite has the clips asked for, with the frame counts, loop setting and speed of the style guide', () => {
  for (const [id, s] of Object.entries(SPRITES)) for (const [clip, [n, loop, fps]] of Object.entries(ASKED[id])) {
    const c = s.clips[clip];
    assert.ok(c, `${id} has no ${clip}`);
    assert.equal(c.frames, n, `${id} ${clip} frames`);
    assert.equal(c.loop, loop, `${id} ${clip} loop`);
    // the table's number is the base; at the middle speed the engine plays base * 1.05, rounded
    assert.ok(Math.abs(c.fps(defaultParams(s)) - fps * 1.05) < 1e-6, `${id} ${clip} fps at the default speed: ${c.fps(defaultParams(s))}`);
    assert.equal(clipFps(s, clip, defaultParams(s)), Math.round(fps * 1.05), `${id} ${clip} whole frames per second`);
    assert.ok(clipFps(s, clip, look(s, { speed: 1 })) > clipFps(s, clip, look(s, { speed: 0 })), `${id} ${clip}: Speed does not change it`);
  }
});

test('the new clips stay inside the frame and never draw an empty frame, at every tested setting', () => {
  for (const [id, s] of Object.entries(SPRITES)) for (const [what, p] of testedLooks(s)) for (const clip of Object.keys(ASKED[id])) for (const f of frames(s, clip)) {
    const b = renderFrame(s, clip, f, p).bounds();
    assert.ok(b, `${id}, ${what}: ${clip} frame ${f} is empty`);
    assert.ok(b.x0 > 0 && b.y0 > 0 && b.x1 < s.size[0] - 1 && b.y1 < s.size[1] - 1, `${id}, ${what}: ${clip} frame ${f} touches the frame edge (box ${b.x0},${b.y0}..${b.x1},${b.y1})`);
    if (s.grounded !== false) assert.ok(b.y1 <= s.pivot[1], `${id}, ${what}: ${clip} frame ${f} goes below the ground line (row ${b.y1})`);
  }
});

test('the new clips are animations: no frame repeats the one before, and the loops close', () => {
  for (const [id, s] of Object.entries(SPRITES)) for (const clip of Object.keys(ASKED[id])) {
    const p = defaultParams(s), n = s.clips[clip].frames;
    const step = (f) => diff(renderFrame(s, clip, f, p), renderFrame(s, clip, (f + n - 1) % n, p));
    for (const f of frames(s, clip).slice(s.clips[clip].loop ? 0 : 1)) assert.ok(step(f) > 0, `${id} ${clip} frame ${f} repeats the frame before`);
    if (s.clips[clip].loop) {
      const steps = frames(s, clip).map(step), mean = steps.slice(1).reduce((a, b) => a + b, 0) / (n - 1);
      assert.ok(steps[0] <= 2.5 * mean + 8, `${id} ${clip}: the jump from the last frame to the first (${steps[0]} px) is bigger than the other steps (${mean.toFixed(0)} px)`);
    }
  }
});

test('die: frame 0 is the recoil tinted white, in all five', () => {
  const white = col('#ffffff'), ink = col('#231b33');
  for (const [id, s] of Object.entries(SPRITES)) {
    const g = renderFrame(s, 'die', 0, defaultParams(s));
    let whites = 0, other = 0;
    for (const v of g.data) { if (v === white) whites++; else if (v && v !== ink) other++; }
    assert.ok(whites > 40, `${id}: die frame 0 has ${whites} white pixels`);
    assert.ok(other <= whites * 0.15, `${id}: die frame 0 has ${other} coloured pixels: it is not tinted white`);
    for (const f of frames(s, 'die').slice(2)) {
      let w = 0, n = 0;
      for (const v of renderFrame(s, 'die', f, defaultParams(s)).data) { if (v === white) w++; if (v) n++; }
      assert.ok(w < n * 0.5, `${id}: die frame ${f} is still white`);
    }
  }
});

test('die: the last frame is never empty; what is left is low and on the ground', () => {
  for (const [id, s] of Object.entries(SPRITES)) for (const [what, p] of testedLooks(s)) {
    const last = renderFrame(s, 'die', s.clips.die.frames - 1, p);
    assert.ok(opaque(last) >= 3, `${id}, ${what}: only ${opaque(last)} pixels are left`);
    const idle = box(renderFrame(s, 'idle', 0, p)), b = box(last);
    if (id === 'bat') {
      // a flyer drops: what is left is well below where it hovered
      assert.ok((b.y0 + b.y1) / 2 > (idle.y0 + idle.y1) / 2 + 6, `bat, ${what}: the remains are at ${(b.y0 + b.y1) / 2}, it hovered at ${(idle.y0 + idle.y1) / 2}`);
      continue;
    }
    assert.equal(b.y1, s.pivot[1], `${id}, ${what}: the remains should rest on the ground line`);
    assert.ok(b.h <= idle.h * 0.66, `${id}, ${what}: the remains are ${b.h} px tall, standing it is ${idle.h}`);
  }
});

test('die: the Hero and the Wizard end lying down, the wolf on its side, the slime as a puddle', () => {
  for (const s of [knight, wizard]) {
    const p = defaultParams(s), b = box(renderFrame(s, 'die', 7, p));
    assert.ok(b.w > b.h * 1.6, `${s.id}: the body left is ${b.w} wide and ${b.h} tall`);
    assert.ok(opaque(renderFrame(s, 'die', 7, p)) > 250, `${s.id}: a whole body is left`);
    const k = frameSockets(s, 'die', 7, p);
    assert.ok(k.head.y > s.pivot[1] - 16, `${s.id}: the head is down (${k.head.y.toFixed(1)})`);
  }
  const w = box(renderFrame(wolf, 'die', 7, defaultParams(wolf))), wi = box(renderFrame(wolf, 'idle', 0, defaultParams(wolf)));
  assert.ok(w.h <= wi.h * 0.6 && w.w > w.h * 2, `wolf: left ${w.w}x${w.h}, standing ${wi.w}x${wi.h}`);
  assert.ok(opaque(renderFrame(wolf, 'die', 7, defaultParams(wolf))) > 250, 'wolf: a whole body is left');
  const sl = box(renderFrame(slime, 'die', 7, defaultParams(slime))), si = box(renderFrame(slime, 'idle', 0, defaultParams(slime)));
  assert.ok(sl.h <= 6 && sl.w >= si.w, `slime: the puddle is ${sl.w}x${sl.h}; the slime was ${si.w}x${si.h}`);
});

test('die: each one is the fall the specification describes', () => {
  // slime: flattens (wider and lower before it bursts), then droplets fly (separate specks away from the body)
  const sp = defaultParams(slime);
  const s0 = box(renderFrame(slime, 'idle', 0, sp)), s2 = box(renderFrame(slime, 'die', 2, sp));
  assert.ok(s2.h < s0.h * 0.75 && s2.w > s0.w, `slime frame 2 is ${s2.w}x${s2.h}, at rest ${s0.w}x${s0.h}: not flattened`);
  const spread = Math.max(...frames(slime, 'die').map((f) => box(renderFrame(slime, 'die', f, sp)).w));
  assert.ok(spread > s0.w + 8, `slime: droplets reach ${spread} px across; the body is ${s0.w}`);
  // bat: the wings fold (narrower), it drops (lower each frame), then it pops (a burst wider than the folded body)
  const bp = defaultParams(bat);
  const b = frames(bat, 'die').map((f) => box(renderFrame(bat, 'die', f, bp)));
  const open = box(renderFrame(bat, 'idle', 0, bp));
  assert.ok(Math.min(b[2].w, b[3].w) < open.w * 0.7, `bat: folded it is ${Math.min(b[2].w, b[3].w)} px wide, gliding ${open.w}`);
  const mid = (x) => (x.y0 + x.y1) / 2;
  assert.ok(mid(b[4]) > mid(b[1]) + 6, `bat: it drops ${(mid(b[4]) - mid(b[1])).toFixed(1)} px between frames 1 and 4`);
  for (let f = 2; f <= 4; f++) assert.ok(mid(b[f]) > mid(b[f - 1]), `bat: not falling between frames ${f - 1} and ${f}`);
  // wolf: stumbles (the head and chest go down first, legs still under it), then lies down (flat by frame 5)
  const wp = defaultParams(wolf);
  const w = frames(wolf, 'die').map((f) => box(renderFrame(wolf, 'die', f, wp)));
  assert.ok(w[2].h > w[5].h + 3, `wolf: frame 2 is ${w[2].h} px tall and frame 5 ${w[5].h}: it should still be on its legs at 2`);
  for (let f = 2; f <= 5; f++) assert.ok(w[f].y0 >= w[f - 1].y0, `wolf: its top rises between frames ${f - 1} and ${f}`);
  assert.ok(w[5].h <= w[7].h + 2, 'wolf: it is down by frame 5');
});

test('Hero: block raises the guard, victory raises the weapon and hops, and both begin on the idle picture', () => {
  for (const over of [{}, { weapon: 'axe' }, { weapon: 'none', headgear: 'none' }, { height: 1, build: 1, head: 1, weapon: 'spear' }]) {
    const p = look(knight, over), idle0 = renderFrame(knight, 'idle', 0, p);
    assert.equal(diff(renderFrame(knight, 'block', 0, p), idle0), 0, `block frame 0, ${JSON.stringify(over)}`);
    assert.equal(diff(renderFrame(knight, 'block', 5, p), idle0), 0, `block frame 5, ${JSON.stringify(over)}`);
    assert.equal(diff(renderFrame(knight, 'victory', 0, p), idle0), 0, `victory frame 0, ${JSON.stringify(over)}`);
    const rest = frameSockets(knight, 'idle', 0, p).hand;
    for (const f of [1, 2, 3, 4]) assert.ok(frameSockets(knight, 'block', f, p).hand.y < rest.y - 3, `block frame ${f}: guard not up, ${JSON.stringify(over)}`);
    const v = frames(knight, 'victory').map((f) => frameSockets(knight, 'victory', f, p));
    assert.ok(v[0].hand.y - Math.min(...v.map((x) => x.hand.y)) > 8, `victory: the hand rises only ${(v[0].hand.y - Math.min(...v.map((x) => x.hand.y))).toFixed(1)} px, ${JSON.stringify(over)}`);
    const tops = frames(knight, 'victory').map((f) => renderFrame(knight, 'victory', f, p).bounds().y0);
    assert.ok(tops[0] - Math.min(...tops) >= 3, `victory: the picture does not grow upward, ${JSON.stringify(over)}`);
    assert.ok(Math.max(...v.map((x) => H.GROUND - x.feet.y)) >= 2, `victory: no hop, ${JSON.stringify(over)}`);
  }
});

test('Wizard: talk and victory begin on the idle picture; in talk the staff stays planted and the free hand gestures', () => {
  for (const over of [{}, { hat: 'hood', beard: 'none' }, { height: 1, build: 1, head: 1 }, { height: 0, staff: 'crook' }]) {
    const p = look(wizard, over), idle0 = renderFrame(wizard, 'idle', 0, p);
    assert.equal(diff(renderFrame(wizard, 'talk', 0, p), idle0), 0, `talk frame 0, ${JSON.stringify(over)}`);
    assert.equal(diff(renderFrame(wizard, 'victory', 0, p), idle0), 0, `victory frame 0, ${JSON.stringify(over)}`);
    const t = frames(wizard, 'talk').map((f) => frameSockets(wizard, 'talk', f, p));
    const span = (get) => Math.max(...t.map(get)) - Math.min(...t.map(get));
    assert.ok(span((x) => x.hand.x) < 2 && span((x) => x.hand.y) < 2.5, `talk: the staff hand wanders, ${JSON.stringify(over)}`);
    assert.ok(Math.hypot(span((x) => x.offhand.x), span((x) => x.offhand.y)) > 4, `talk: the free hand does not gesture, ${JSON.stringify(over)}`);
    // the face changes on frames 2 and 6
    const face = (f) => { const g = renderFrame(wizard, 'talk', f, p); const h = frameSockets(wizard, 'talk', f, p).head; return [g, h]; };
    for (const f of [2, 6]) assert.ok(diff(face(f)[0], renderFrame(wizard, 'talk', f - 1, p)) > 4, `talk frame ${f} barely differs from frame ${f - 1}, ${JSON.stringify(over)}`);
    const v = frames(wizard, 'victory').map((f) => frameSockets(wizard, 'victory', f, p));
    assert.ok(v[0].hand.y - Math.min(...v.map((x) => x.hand.y)) >= 5, `victory: the staff is raised only ${(v[0].hand.y - Math.min(...v.map((x) => x.hand.y))).toFixed(1)} px, ${JSON.stringify(over)}`);
  }
});

// ---- what the review asked for: things a planted bug must not get past ---------------------------

const hexOf = (v) => '#' + [v & 255, (v >> 8) & 255, (v >> 16) & 255].map((x) => x.toString(16).padStart(2, '0')).join('');
const pixelsOf = (g, hexes) => { const want = new Set(hexes.map((h) => col(h))); const out = []; for (let i = 0; i < g.data.length; i++) if (want.has(g.data[i])) out.push([i % g.w, Math.floor(i / g.w)]); return out; };
const tones = (hex) => { const r = ramp(hex); return [r.light, r.base, r.dark, r.deep]; };

test('Hero: in block the weapon is drawn upright in front of the body', () => {
  for (const weapon of ['sword', 'spear']) for (const over of [{}, { height: 1, build: 1, head: 1 }, { height: 0, build: 0, head: 0 }]) {
    const p = look(knight, { ...over, weapon, headgear: 'none', metal: '#c98a4a' });       // a metal no other part of this look uses
    for (const f of [1, 2, 3, 4]) {
      const s = frameSockets(knight, 'block', f, p);
      assert.ok(Math.abs(s.hand.angle - Math.PI) < 0.25, `${weapon} frame ${f}: held at ${s.hand.angle.toFixed(2)}`);
      // the blade, and for the spear its shaft; not the belt buckle down at the hip
      const blade = pixelsOf(renderFrame(knight, 'block', f, p), [...tones(p.metal), ...(weapon === 'spear' ? ['#8a5a34'] : [])]).filter(([, y]) => y <= s.hand.y + (weapon === 'spear' ? 3 : 1));
      const xs = blade.map((q) => q[0]), ys = blade.map((q) => q[1]);
      const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
      assert.ok(h >= 8 && h >= w * 2, `${weapon} frame ${f}, ${JSON.stringify(over)}: the metal is drawn ${w} wide and ${h} tall`);
      assert.ok(Math.min(...ys) < s.hand.y - 6, `${weapon} frame ${f}: the point is not above the hand`);
      assert.ok(Math.min(...xs) > s.head.x, `${weapon} frame ${f}: the weapon is not in front of the head`);
    }
  }
});

test('Hero: the cape ends lying on the ground under the body, as long as the cape is', () => {
  const onRows = (over) => {
    const p = look(knight, { headgear: 'none', trim: '#e6c545', ...over });                // a trim colour nothing else in this look uses
    return pixelsOf(renderFrame(knight, 'die', 7, p), tones(p.trim)).filter(([, y]) => y >= H.GROUND - 2 && y < H.GROUND);
  };
  // the belt is the same colour and crosses those rows: what is there with no cape is not cape
  const belt = new Set(onRows({ cape: 'none' }).map(([x, y]) => `${x},${y}`));
  const cape = (over) => onRows(over).filter(([x, y]) => !belt.has(`${x},${y}`));
  const span = (pts) => (pts.length ? Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0])) + 1 : 0);
  for (const kind of ['plain', 'tattered']) {
    const onGround = cape({ cape: kind });
    assert.ok(onGround.length >= 16 && span(onGround) >= 12, `${kind}: ${onGround.length} cape pixels along the ground, ${span(onGround)} px long`);
    assert.ok(onGround.every(([, y]) => y >= H.GROUND - 2), `${kind}: the cape is not on the ground rows`);
  }
  assert.ok(belt.size <= 4, `with no cape there are ${belt.size} trim pixels on the ground rows`);
  assert.ok(span(cape({ cape: 'plain', capeLength: 1.5 })) > span(cape({ cape: 'plain', capeLength: 0.4 })) + 4, 'a longer cape does not lie longer');
  assert.notDeepEqual(cape({ cape: 'plain' }), cape({ cape: 'tattered' }), 'a tattered cape lies the same as a plain one');
  // standing, there is none of it down there
  assert.equal(pixelsOf(renderFrame(knight, 'idle', 0, look(knight, { headgear: 'none', trim: '#e6c545' })), tones('#e6c545')).filter(([, y]) => y >= H.GROUND - 2).length, 0);
});

test('lying down, the Hero and the Wizard face up and what they wear on the head lies back with it', () => {
  // Hero: the helmet's plume, on top of the head when he stands, is behind the head (to the left) when he lies
  const kp = look(knight, { cape: 'none', trim: '#e6c545' });
  const plume = (clip, f) => { const g = renderFrame(knight, clip, f, kp), pts = pixelsOf(g, tones(kp.trim)).filter(([, y]) => y < H.GROUND - 2); const hd = frameSockets(knight, clip, f, kp).head; return [pts.reduce((a, q) => a + q[0], 0) / pts.length - hd.x, pts.reduce((a, q) => a + q[1], 0) / pts.length - hd.y, pts.length]; };
  const up = plume('idle', 0), down = plume('die', 7);
  assert.ok(up[2] >= 4 && down[2] >= 4, 'no plume');
  // the head socket is the top of the head: the plume stays by it, and the socket itself has moved from above to behind
  assert.ok(Math.hypot(up[0], up[1]) < 6 && Math.hypot(down[0], down[1]) < 6, `the plume is ${Math.hypot(down[0], down[1]).toFixed(1)} px from the top of the lying head`);
  const kd = H.dims(kp), dieHead = frameSockets(knight, 'die', 7, kp).head, back = frameSockets(knight, 'die', 7, kp).back;
  assert.ok(dieHead.x < back.x - kd.headR && dieHead.y > H.GROUND - 2 * kd.headR - 3, `the top of the head is at ${dieHead.x.toFixed(1)},${dieHead.y.toFixed(1)}`);
  // Wizard: the hat points along the ground behind him: lying, the hat is wider than it is tall and nothing stands above head height
  for (const hat of ['pointed', 'crooked', 'wide', 'hood']) for (const over of [{}, { height: 1, build: 1, head: 1 }, { height: 0, build: 0, head: 0 }]) {
    const p = look(wizard, { ...over, hat }), d = H.dims(p);
    const b = box(renderFrame(wizard, 'die', 7, p));
    assert.ok(b.h <= 2 * d.headR + 8, `wizard, ${hat}, ${JSON.stringify(over)}: lying he is ${b.h} px tall; a hat still stands on his head`);      // a wide brim stands on edge
    const stand = box(renderFrame(wizard, 'idle', 0, p));
    assert.ok(b.w >= stand.h * 0.8, `wizard, ${hat}, ${JSON.stringify(over)}: lying he is ${b.w} px long, standing ${stand.h} tall`);
  }
});

test('Wizard: the light of the staff goes out when he is down', () => {
  for (const staff of ['orb', 'crystal', 'crook']) {
    const p = look(wizard, { staff });
    const lit = (clip, f) => pixelsOf(renderFrame(wizard, clip, f, p), ['#ffffff', ramp(p.magic).light]).length;
    assert.ok(lit('idle', 0) >= 6, `${staff}: the staff is not lit when he stands`);
    assert.ok(lit('die', 1) >= 6, `${staff}: still lit as he staggers`);
    assert.equal(lit('die', 7), 0, `${staff}: ${lit('die', 7)} lit pixels are left at the end`);
    assert.ok(lit('die', 6) < lit('die', 1), `${staff}: it does not fade`);
  }
});

test('Wizard: in talk the free hand is shown in front of the staff', () => {
  for (const over of [{}, { height: 1, build: 1, head: 1 }, { height: 0, build: 0, head: 0 }, { hat: 'hood', beard: 'none' }]) {
    const p = look(wizard, over), skin = [ramp(p.skin).base, farRamp(p.skin).base];
    // on the first beat (frame 2) the free hand is out past the staff hand, and it is drawn: skin where the offhand socket is
    const s = frameSockets(wizard, 'talk', 2, p), g = renderFrame(wizard, 'talk', 2, p);
    assert.ok(s.offhand.x > s.hand.x + 1, `${JSON.stringify(over)}: the free hand is at ${s.offhand.x.toFixed(1)}, the staff hand at ${s.hand.x.toFixed(1)}`);
    const near = pixelsOf(g, skin).filter(([x, y]) => Math.abs(x + 0.5 - s.offhand.x) <= 1.5 && Math.abs(y + 0.5 - s.offhand.y) <= 1.5);
    assert.ok(near.length >= 2, `${JSON.stringify(over)}: no hand is drawn at the free hand's place (${near.length} px)`);
    // at rest it is where it always was
    assert.equal(diff(renderFrame(wizard, 'talk', 0, p), renderFrame(wizard, 'idle', 0, p)), 0);
  }
});

test('wolf: lying, the body is a body and not a rug: its back is well off the ground', () => {
  for (const over of [{}, { size: 1, legs: 1 }, { size: 0, legs: 0 }]) {
    const p = look(wolf, over), b = box(renderFrame(wolf, 'die', 7, p)), stand = box(renderFrame(wolf, 'idle', 0, p));
    assert.ok(b.h >= Math.max(9, stand.h * 0.34), `${JSON.stringify(over)}: lying it is ${b.h} px tall, standing ${stand.h}`);
    assert.ok(b.h <= stand.h * 0.66);
  }
});

// ---- parts and attach points ------------------------------------------------------------------

test('the new clips export the same attach points as the old ones, inside the frame', () => {
  for (const s of [knight, wizard]) {
    const m = renderSheet(s, defaultParams(s)).meta;
    for (const clip of Object.keys(ASKED[s.id])) assert.deepEqual(m.animations[clip] && [m.animations[clip].frames, m.animations[clip].loop], [ASKED[s.id][clip][0], ASKED[s.id][clip][1]], `${s.id} ${clip}`);
    for (const f of m.frames) {
      assert.deepEqual(Object.keys(f.sockets), ['hand', 'offhand', 'head', 'back', 'feet'], f.name);
      for (const k of Object.values(f.sockets)) assert.ok(k.x > 0 && k.x < 64 && k.y > 0 && k.y <= 64 && Number.isFinite(k.angle), `${s.id} ${f.name} ${JSON.stringify(k)}`);
    }
  }
});

test('Hero and Wizard: each has a held part and a worn part, every part on a socket', () => {
  for (const s of [knight, wizard]) {
    const parts = partList(s);
    assert.ok(parts.some((p) => p.socket === 'hand'), `${s.id}: nothing held`);
    assert.ok(parts.some((p) => p.socket === 'head' || p.socket === 'back'), `${s.id}: nothing worn`);
    for (const p of parts) assert.ok(['hand', 'offhand', 'head', 'back', 'feet'].includes(p.socket), `${s.id} part ${p.name} socket ${p.socket}`);
  }
  assert.deepEqual(partList(wizard).map((p) => [p.name, p.socket]), [['weapon', 'hand'], ['headgear', 'head'], ['beard', 'head']]);
});

test('a part taken off leaves nothing behind in the new clips either', () => {
  for (const clip of ['die', 'block', 'victory']) for (const f of frames(knight, clip)) {
    const bare = look(knight, { weapon: 'none' });
    for (const key of ['weaponLength', 'weaponAngle', 'weaponSwing']) {
      const d = knight.params[key];
      assert.equal(diff(renderFrame(knight, clip, f, { ...bare, [key]: d.min }), renderFrame(knight, clip, f, { ...bare, [key]: d.max })), 0, `${clip} frame ${f}: ${key} with no weapon`);
    }
    const noCape = look(knight, { cape: 'none' });
    assert.equal(diff(renderFrame(knight, clip, f, { ...noCape, capeLength: 0.3 }), renderFrame(knight, clip, f, { ...noCape, capeLength: 1.8 })), 0, `${clip} frame ${f}: cape length with no cape`);
  }
});

// ---- sounds -----------------------------------------------------------------------------------

test('every cue names a sound that exists and one of its styles', () => {
  for (const [id, s] of Object.entries(SPRITES)) for (const [clip, list] of Object.entries(s.sounds)) for (const c of list) {
    assert.ok(fs.existsSync(new URL(`../../sounds/${c.sound}.json`, import.meta.url)), `${id} ${clip}: no sound "${c.sound}"`);
    const patch = sound(c.sound);
    if (c.preset) assert.ok(patch.presets && patch.presets[c.preset], `${id} ${clip}: "${c.sound}" has no style "${c.preset}"`);
    assert.ok(!patch.loop || s.clips[clip].loop, `${id} ${clip}: a looping sound on a one-shot clip`);
  }
});

test('the sound pairings the specification lists', () => {
  const cue = (s, clip, frame) => (s.sounds[clip] ?? []).filter((c) => c.frame === frame).map((c) => [c.sound, c.preset]);
  // Hero: the landing thud replaces the footstep on jump frame 6
  assert.deepEqual(cue(knight, 'jump', 6), [['land-thud', 'Armoured']]);
  assert.deepEqual(cue(knight, 'jump', 2), [['jump', 'Big leap']]);
  assert.ok(!knight.sounds.jump.some((c) => c.sound === 'footstep-gravel'));
  // the three creatures' deaths
  assert.deepEqual(cue(slime, 'die', 0), [['enemy-squish', 'Squish']]);
  assert.deepEqual(cue(bat, 'die', 0), [['enemy-squish', 'Pop']]);
  assert.deepEqual(cue(wolf, 'die', 0), [['punch', 'Heavy body blow']]);
});

test('every action clip has a sound on the style guide frame at the style guide volume; idle, victory and talk are silent', () => {
  for (const [id, s] of Object.entries(SPRITES)) {
    const die = s.sounds.die ?? [];
    assert.ok(die.some((c) => c.frame === 0 && c.volume === 1), `${id}: die has no sound on frame 0 at volume 1`);
    for (const c of die) assert.ok(c.frame === 0 || c.frame === 5, `${id}: die sound on frame ${c.frame}`);
    for (const clip of ['idle', 'victory', 'talk']) assert.equal((s.sounds[clip] ?? []).length, 0, `${id} ${clip} should be silent`);
    // nothing that was cued before was dropped
    for (const clip of Object.keys(s.clips)) if (!['idle', 'victory', 'talk'].includes(clip)) assert.ok((s.sounds[clip] ?? []).length >= 1, `${id} ${clip} has no sound`);
  }
  // the Hero's block: one sound on frame 1 whatever is held: metal when there is a weapon, a dull blow on bare arms
  assert.deepEqual(knight.sounds.block.map((c) => [c.frame, c.volume]), [[1, 0.7], [1, 0.7]]);
  for (const weapon of ['sword', 'axe', 'spear', 'none']) {
    const playing = knight.sounds.block.filter((c) => cueInEffect(knight, c, look(knight, { weapon })));
    assert.equal(playing.length, 1, `block with weapon=${weapon} plays ${playing.length} sounds`);
    assert.equal(playing[0].sound === 'metal-hit', weapon !== 'none', `block with weapon=${weapon} plays ${playing[0].sound}`);
  }
  // a body that falls its own height thuds when it lands: the Hero, the Wizard and the wolf, on frame 5
  for (const s of [knight, wizard, wolf]) assert.deepEqual((s.sounds.die ?? []).filter((c) => c.frame === 5).map((c) => [c.sound, c.volume]), [['land-thud', 1]], `${s.id} die frame 5`);
  for (const s of [slime, bat]) assert.equal(s.sounds.die.length, 1, `${s.id}: a small body makes one sound`);
  // every sound of the Wizard, and the Hero's outside attack and block, plays at every setting
  for (const s of [knight, wizard]) for (const [clip, list] of Object.entries(s.sounds)) if (clip !== 'attack' && clip !== 'block') for (const c of list) assert.equal(cueInEffect(s, c, defaultParams(s)), true, `${s.id} ${clip}`);
});

test('meta is kept as it was', () => {
  assert.deepEqual(knight.meta, { type: 'character', role: 'characters/player', themes: ['fantasy', 'dungeon'], gameTypes: ['platformer', 'turn-based-rpg'], view: 'side', words: ['knight', 'hero', 'warrior', 'adventurer', 'player', 'paladin', 'soldier', 'sword', 'armor', 'fighter', 'attack', 'walk', 'run', 'jump'], license: 'draft' });
  assert.deepEqual([wizard.meta.role, slime.meta.role, bat.meta.role, wolf.meta.role], ['characters/player', 'characters/enemy', 'characters/enemy', 'characters/enemy']);
  assert.deepEqual(wizard.meta.words, ['wizard', 'mage', 'sorcerer', 'magician', 'witch', 'spellcaster', 'necromancer', 'staff', 'magic', 'spell', 'cast', 'robe', 'hero']);
  assert.deepEqual(slime.meta.words, ['slime', 'blob', 'goo', 'jelly', 'ooze', 'gel', 'enemy', 'monster', 'bounce', 'hop', 'squish', 'jump']);
  assert.deepEqual(bat.meta.words, ['bat', 'vampire', 'imp', 'moth', 'flyer', 'flying', 'fly', 'flap', 'wings', 'cave', 'enemy', 'monster', 'swoop']);
  assert.deepEqual(wolf.meta.words, ['wolf', 'fox', 'husky', 'dog', 'beast', 'animal', 'enemy', 'monster', 'hunter', 'predator', 'run', 'bite', 'pounce']);
  assert.deepEqual([knight.name, wizard.name, slime.name, bat.name, wolf.name], ['Hero', 'Wizard', 'Slime', 'Bat', 'Wolf']);
});
