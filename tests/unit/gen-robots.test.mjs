// The robot ports of migration batch C3 (engine/gen/robots.js): robot.security-bot@1, robot.vendor-bot@1,
// robot.warden-mech@1 and robot.scout-drone@1, each a code sprite's drawing ported whole onto a paint-ref grid, with the
// drawing they share (the top-down creature rig, engine/warmachine.js, engine/groundbot.js, engine/mech.js,
// engine/breaking.js, engine/rock.js) ported once under engine/gen/ports/c3/.
//
// What is held here, about the framework (the library sprites are held by tests/unit/redraws-c3.test.mjs):
//   - each passes the goldens harness (tests/helpers/gen-harness.mjs): pinned output, determinism, cost, loop closure,
//     every argument at and past its limits;
//   - each draws, through a data sprite that names it once per clip, exactly the pixels its frozen code sprite
//     (tests/fixtures/code-sprites/<id>.js) draws, at every frame of every clip, at the defaults, every option of every
//     choice, every slider at both ends, and body colours off the swatches (a pale one as bright as the steel fittings, a
//     dark one, one between): the colours the code worked out from a colour are colour rules now (ifLight, faceTone,
//     standOut, ramp, tone, mix), and only colours off the swatches show a rule that is wrong;
//   - its points motion (robot.<id>.points@1) moves each point's node to the code sprite's sockets at every frame;
//   - its heaviest call found here runs within its cost (as tests/unit/gen-e2-safety.test.mjs holds E2's ports).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { codeSprite } from '../helpers/library.mjs';
import { dataSprite } from '../../engine/data-sprite.js';
import { renderPixels, cleanParams, defaultParams } from '../../engine/sprite.js';

const dashed = (v) => String(v).replace(/ /g, '-');
const paints = { body: 'body', accent: 'accent', lights: 'glow' };
/** Each port: its generator, the frame's middle (where `at` puts the old frame's origin), and the code sprite's settings as its arguments. */
const PORTS = {
  'security-bot': { gen: 'robot.security-bot', origin: [24, 24],
    args: (p) => ({ size: p.size, bulk: p.bulk, legs: p.legs, shape: p.shape, weapon: p.weapon, weaponLength: p.weaponLength, pack: p.pack, packSize: p.packSize, bounce: p.bounce, ...paints }) },
  'vendor-bot': { gen: 'robot.vendor-bot', origin: [24, 24],
    args: (p) => ({ size: p.size, shape: p.shape, eyes: dashed(p.eyes), arms: p.arms, headgear: p.headgear, headgearSize: p.headgearSize, held: p.held, heldSize: p.heldSize, bob: p.bob, ...paints }) },
  'warden-mech': { gen: 'robot.warden-mech', origin: [48, 48], once: true,
    args: (p) => ({ size: p.size, bulk: p.bulk, legs: p.legs, shape: dashed(p.shape), weapon: dashed(p.weapon), weaponLength: p.weaponLength, pack: dashed(p.pack), packSize: p.packSize, bounce: p.bounce, ...paints }) },
  'scout-drone': { gen: 'robot.scout-drone', origin: [24, 24],
    args: (p) => ({ size: p.size, shape: p.shape, eyes: p.eyes, weapon: p.weapon, weaponLength: p.weaponLength, wings: p.wings, wingSpan: p.wingSpan, bob: p.bob, ...paints }) },
};
/** Body colours off every swatch: as bright as the steel fittings (#c2c9d6), pale, dark, and a saturated one. */
const OFF_SWATCH = ['#c4c8d2', '#e8e2cf', '#1c2230', '#3f7f6a'];

/** A data sprite that draws the port at settings p (literal arguments), one draw item per clip, with p's colours as its palette. */
function portSprite(code, id, p) {
  const P = PORTS[id], clips = code.clips;
  return dataSprite({
    format: 'loadout-sprite', version: 2, id: `${id}-port-test`, name: 'Port test',
    meta: { type: 'creature', role: 'characters/enemy', themes: ['sci-fi'], gameTypes: ['shooter'], view: 'top-down', words: ['robot', 'test', 'port', 'machine', 'enemy', 'metal'], license: 'draft' },
    size: [...code.size], pivot: [...code.pivot], grounded: code.grounded !== false, preview: code.preview, styles: ['pixel'],
    palette: [
      { id: 'body', label: 'Body', default: p.body, material: 'metal' }, { id: 'accent', label: 'Accent', default: p.accent, material: 'paint' }, { id: 'glow', label: 'Lights', default: p.glow, material: 'light' },
    ],
    controls: [],
    body: { pictures: { nodes: [{ id: 'm', parent: null, at: P.origin }],
      // one call a clip (its picture the clip's name, with no underscore: walk_down is walk-down), or one call for every clip
      draw: P.once ? [{ gen: P.gen, v: 1, on: 'm', at: [0, 0], ...P.args(p) }]
        : Object.keys(clips).map((c) => ({ gen: P.gen, v: 1, on: 'm', at: [0, 0], clip: [c], picture: c.replace(/_/g, '-'), ...P.args(p) })) } },
    clips: Object.fromEntries(Object.entries(clips).map(([c, k]) => [c, { frames: k.frames, fps: 10, loop: k.loop !== false }])),
  });
}

/** The settings a port is held at: the defaults, each choice option, each slider at both ends, body colours off the swatches. */
function casesOf(code) {
  const base = cleanParams(code, defaultParams(code)), out = [base];
  for (const [k, d] of Object.entries(code.params)) {
    if (k === 'speed') continue;
    if (d.kind === 'choice') for (const o of d.options) { if (o.value !== base[k]) out.push({ ...base, [k]: o.value }); }
    else if (d.kind === 'toggle') out.push({ ...base, [k]: !base[k] });
    else if (d.kind === 'range') out.push({ ...base, [k]: d.min }, { ...base, [k]: d.max });
  }
  for (const c of OFF_SWATCH) out.push({ ...base, body: c });
  out.push({ ...base, accent: '#d04a8c', glow: '#7fe07f' });
  return out;
}

const generatorOf = (id) => registry.generator(PORTS[id].gen, 1);

for (const id of Object.keys(PORTS)) {
  test(`${PORTS[id].gen}@1 passes the goldens harness`, { timeout: 600_000 }, async () => {
    const code = await codeSprite(id), entry = generatorOf(id);
    assert.ok(entry, `${PORTS[id].gen}@1 is registered`);
    const base = cleanParams(code, defaultParams(code)), clips = Object.keys(code.clips);
    const last = clips.at(-1), mid = clips[Math.floor(clips.length / 2)];
    const at = PORTS[id].origin, pic = (c) => c.replace(/_/g, '-');
    checkGeneratorContract(registry, entry, { cases: [
      { args: { at, picture: pic(clips[0]), ...PORTS[id].args(base) } },
      { args: { at, picture: pic(mid), ...PORTS[id].args({ ...base, size: 1 }) }, ctx: { t: 0.5, loop: code.clips[mid].loop !== false, frames: code.clips[mid].frames, frame: Math.floor(code.clips[mid].frames / 2) } },
      { args: { at: [at[0] + 3, at[1] - 2], picture: pic(last), ...PORTS[id].args({ ...base, size: 0 }) }, ctx: { t: 0.6, loop: false, frames: code.clips[last].frames, frame: 3 } },
    ] });
  });

  test(`${PORTS[id].gen}@1 draws its code sprite pixel for pixel, at every frame and setting tried, and gives its sockets`, { timeout: 900_000 }, async () => {
    const code = await codeSprite(id), motion = registry.generator(`${PORTS[id].gen}.points`, 1);
    assert.ok(motion, `${PORTS[id].gen}.points@1 is registered`);
    const bad = [], badPoints = [];
    let n = 0;
    for (const p of casesOf(code)) {
      const s = portSprite(code, id, p), q = cleanParams(s, {});
      for (const [clip, c] of Object.entries(code.clips)) for (let f = 0; f < c.frames; f++) {
        const a = renderPixels(code, clip, f, p), b = renderPixels(s, clip, f, q);
        n++;
        if (a.w !== b.w || a.h !== b.h || a.data.some((v, i) => v !== b.data[i])) bad.push(`${clip} f${f} ${JSON.stringify(p)}`);
        const t = c.loop === false ? (c.frames > 1 ? f / (c.frames - 1) : 0) : f / c.frames;
        const want = code.sockets(clip, t, p);
        const { body: _pb, accent: _pa, lights: _pl, ...settings } = PORTS[id].args(p);
        // the layout runs a motion through its entry (a motion's moves are not primitives the registry counts)
        const moves = motion.run(Object.freeze({ at: PORTS[id].origin, ...settings }), Object.freeze({ clip, t, frame: f, frames: c.frames, loop: c.loop !== false, size: [...code.size] }));
        const got = Object.fromEntries(moves.map((m) => [m.node, [+m.move[0].toFixed(6), +m.move[1].toFixed(6), +(-m.turn * Math.PI / 180).toFixed(6)]]));
        const exp = Object.fromEntries(Object.entries(want).map(([k, v]) => [k, [+v.x.toFixed(6), +v.y.toFixed(6), +(v.angle ?? 0).toFixed(6)]]));
        if (JSON.stringify(got) !== JSON.stringify(exp)) badPoints.push(`${clip} f${f}`);
      }
    }
    assert.ok(n > 100, `${n} frames compared`);
    assert.deepEqual(bad.slice(0, 6), [], `${id}: ${bad.length} of ${n} frames differ from the code sprite`);
    assert.deepEqual(badPoints.slice(0, 6), [], `${id}: ${badPoints.length} frames' attach points differ from the code sprite's sockets`);
  });
}

// The heaviest call of each port found by trying every picture and option at both ends of its sliders, at every frame
// (the batch's scratchpad c3/heaviest.mjs; a port clamps the frame to its picture's last), with its processor time then; each port declares `units` of about 1.5 times that at
// 0.01 ms a unit. The line is gen-e2-safety's: 0.05 ms a unit and 2 ms.
const HEAVIEST = [
  [{ gen: 'robot.security-bot', v: 1, picture: 'shoot-up', size: 1, bulk: 1, weaponLength: 1.35, packSize: 1.35, bounce: 1 }, 1],   // 1.99 ms
  [{ gen: 'robot.vendor-bot', v: 1, picture: 'talk', size: 1, headgearSize: 1.35, heldSize: 1.35, bob: 1, headgear: 'cap' }, 0],   // 0.47 ms
  [{ gen: 'robot.warden-mech', v: 1, picture: 'shoot', size: 1, bulk: 1, legs: 1, weaponLength: 1.35, packSize: 1.35, bounce: 1, pack: 'missile-pods' }, 9],   // 16.15 ms
  [{ gen: 'robot.scout-drone', v: 1, picture: 'die', size: 1, weaponLength: 1.35, wingSpan: 1.35, bob: 1, shape: 'wedge' }, 2],   // 0.89 ms
];
const cpuMs = (fn) => { const t0 = process.cpuUsage(); fn(); const d = process.cpuUsage(t0); return (d.user + d.system) / 1000; };
const median = (fn, k = 9) => { fn(); fn(); const ms = []; for (let i = 0; i < k; i++) ms.push(cpuMs(fn)); return ms.sort((a, b) => a - b)[k >> 1]; };

test('every robot port has a heaviest call here, and runs it within its cost', () => {
  const ports = registry.generators().filter((e) => e.family === 'robot').map((e) => e.id).sort();
  assert.deepEqual(ports, HEAVIEST.map(([c]) => c.gen).sort());
  const slow = [];
  for (const [base, frame] of HEAVIEST) {
    const entry = registry.generator(base.gen, base.v);
    const call = { at: [100, 100], ...paints, ...base };
    const c = registry.checkCall(call);
    assert.ok(c.ok, `${base.gen}: ${c.errors.join('; ')}`);
    const ctx = { size: [200, 200], frame, frames: 12, t: 0, loop: false, clip: base.picture };
    const r = registry.runGenerator(call, ctx);
    assert.ok(r.ok && r.primitives.length > 0, `${base.gen} draws`);
    const ms = median(() => registry.runGenerator(call, ctx));
    if (ms > 2 + c.cost * 0.05) slow.push(`${base.gen}: ${ms.toFixed(2)} ms for cost ${c.cost}`);
    assert.ok(entry.family === 'robot');
  }
  assert.deepEqual(slow, []);
});
