// Migration batch C2's creature generators (engine/gen/creatures.js): bug.crawler, bug.mite, bug.spitter, bug.beetle,
// bug.queen and beast.quadruped, ports of the six bugs and beasts' code drawing on one copy of their rigs and helpers
// (engine/gen/ports/c2/, with E2's engine/gen/ports/e2/ helpers). Each passes the goldens harness; draws the clip being
// drawn (ctx.clip) unless the call names a picture; a frame bigger than the stamp cap comes back as stamps that keep to
// the cap and rects, with exactly the pixels of the port's grid; its points are the old sockets moved to `at`; and the
// shared drawing is one copy (the hive bug rig draws on the top-down creature rig the spitter stands on).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as registry from '../../engine/gen/index.js';
import { stampPixels, SHAPE_CAPS } from '../../engine/gen/args.js';
import { PortSurface, withPaintTable } from '../../engine/gen/port-surface.js';
import { CREATURE_POINTS, gridPrimitives } from '../../engine/gen/creatures.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import * as crawlerBug from '../../engine/gen/ports/c2/crawler-bug.js';
import * as spitterBug from '../../engine/gen/ports/c2/spitter-bug.js';
import * as hiveMother from '../../engine/gen/ports/c2/hive-mother.js';
import * as emberWyrm from '../../engine/gen/ports/c2/ember-wyrm.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PAINTS = { body: 'body', accent: 'accent', lit: 'glow' };
/** The paints a generator takes, from PAINTS. */
const paintsOf = (id) => Object.fromEntries(Object.entries(PAINTS).filter(([k]) => Object.hasOwn(registry.generator(id, 1).args, k)));

// three golden cases each: the defaults at the first clip's first frame; another clip mid-way with other settings; a picture named
const CASES = {
  'bug.crawler': [
    { args: { at: [24, 40] }, ctx: { clip: 'idle_down', frame: 0 } },
    { args: { at: [24, 40], size: 1, legs: 0, length: 'long', spikes: true, horns: 'tusks', hornLength: 1.35, tail: 'stinger', tailLength: 0.65, bounce: 1, stride: 0 }, ctx: { clip: 'walk_side', frame: 3 } },
    { args: { at: [10, 12], picture: 'attack-up', length: 'short', horns: 'none', tail: 'club' }, ctx: { frame: 4 } },
  ],
  'bug.mite': [
    { args: { at: [16, 28] }, ctx: { clip: 'idle', frame: 0 } },
    { args: { at: [16, 28], size: 1, legs: 'eight', shape: 'spiky', eyes: 'many', bounce: 0 }, ctx: { clip: 'walk', frame: 5 } },
    { args: { at: [3, 4], picture: 'die', legs: 'four', shape: 'long', eyes: 'one' }, ctx: { frame: 2 } },
  ],
  'bug.spitter': [
    { args: { at: [24, 42] }, ctx: { clip: 'idle', frame: 0 } },
    { args: { at: [24, 42], size: 1, bulk: 1, shape: 'three-way', horns: 'spines', hornLength: 1.35, bounce: 1 }, ctx: { clip: 'shoot', frame: 4 } },
    { args: { at: [5, 6], picture: 'burrow', shape: 'slit', horns: 'crest', size: 0 }, ctx: { frame: 5 } },
  ],
  'bug.beetle': [
    { args: { at: [24, 42] }, ctx: { clip: 'idle', frame: 0 } },
    { args: { at: [24, 42], size: 1, shell: 1, spikes: 1, legs: 0, eyes: 'glow', horns: 'rhino', hornLength: 1.35, bounce: 0 }, ctx: { clip: 'attack', frame: 3 } },
    { args: { at: [7, 9], picture: 'die', eyes: 'angry', horns: 'none' }, ctx: { frame: 6 } },
  ],
  'bug.queen': [
    { args: { at: [48, 88] }, ctx: { clip: 'idle', frame: 0 } },
    { args: { at: [48, 88], size: 1, bulk: 1, legs: 'eight', pieces: 1, horns: 'antlers', hornLength: 1.35, wings: 'veil', wingSpan: 1.35, bounce: 1 }, ctx: { clip: 'spawn', frame: 4 } },
    { args: { at: [20, 30], picture: 'die', legs: 'four', horns: 'none', wings: 'stubs' }, ctx: { frame: 7 } },
  ],
  'beast.quadruped': [
    { args: { at: [56, 90] }, ctx: { clip: 'idle', frame: 0 } },
    { args: { at: [56, 90], size: 1, length: 1, bulk: 1, spines: 'sails', wings: 'tattered', wingSpan: 1.35, horns: 'ram', hornLength: 1.35, tail: 'club', tailLength: 1.35, bounce: 1 }, ctx: { clip: 'breath', frame: 6 } },
    { args: { at: [30, 40], picture: 'die', spines: 'none', wings: 'none', horns: 'crown', tail: 'flame' }, ctx: { frame: 11 } },
  ],
};
const withPaints = (id, cases) => cases.map((c) => ({ ...c, args: { ...paintsOf(id), ...c.args } }));

for (const [id, cases] of Object.entries(CASES)) {
  test(`${id}@1 passes the goldens harness`, () => {
    checkGeneratorContract(registry, registry.generator(id, 1), { cases: withPaints(id, cases) });
  });
}

test('each is family "creature" and names every clip of its code sprite as a picture, after "clip"', () => {
  const CLIPS = {
    'bug.crawler': ['idle-down', 'walk-down', 'walk-up', 'walk-side', 'attack-down', 'attack-up', 'attack-side', 'hurt', 'die'],
    'bug.mite': ['idle', 'walk', 'attack', 'hurt', 'die'],
    'bug.spitter': ['idle', 'shoot', 'burrow', 'hurt', 'die'],
    'bug.beetle': ['idle', 'walk', 'attack', 'block', 'hurt', 'die'],
    'bug.queen': ['idle', 'attack', 'shoot', 'spawn', 'enrage', 'hurt', 'die'],
    'beast.quadruped': ['idle', 'attack', 'breath', 'buffet', 'hurt', 'die'],
  };
  for (const [id, clips] of Object.entries(CLIPS)) {
    const e = registry.generator(id, 1);
    assert.equal(e.family, 'creature', id);
    assert.deepEqual([...e.args.picture.values], ['clip', ...clips], id);
    assert.equal(e.args.picture.default, 'clip', id);
  }
});

test('picture "clip" draws the clip being drawn; a picture named draws that clip whatever is drawn; an unknown clip draws the first', () => {
  const run = (args, ctx) => registry.runGenerator({ gen: 'bug.crawler', v: 1, at: [24, 40], ...PAINTS, ...args }, ctx).primitives;
  assert.deepEqual(run({}, { clip: 'walk_side', frame: 2 }), run({ picture: 'walk-side' }, { clip: 'die', frame: 2 }));
  assert.notDeepEqual(run({}, { clip: 'walk_side', frame: 2 }), run({}, { clip: 'walk_up', frame: 2 }));
  assert.deepEqual(run({}, { clip: 'not-a-clip', frame: 0 }), run({ picture: 'idle-down' }, { frame: 0 }));
  assert.deepEqual(run({}, {}), run({ picture: 'idle-down' }, { frame: 0 }), 'no ctx: the first clip, frame 0');
});

/** The paint ref of every pixel a primitive list paints (stamps and one-row-or-more rects), keyed "x,y". */
function pixelsOf(prims) {
  const out = new Map();
  for (const p of prims) {
    if (p.kind === 'stamp') p.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.key[ch])); }));
    else if (p.kind === 'rect') for (let j = 0; j < p.size[1]; j++) for (let i = 0; i < p.size[0]; i++) out.set(`${p.at[0] + i},${p.at[1] + j}`, JSON.stringify(p.paint));
    else assert.fail(`a ${p.kind}: a port gives stamps and rects only`);
  }
  return out;
}
/** The paint ref of every pixel a port's own drawing paints on its grid, moved by [dx, dy]. */
function gridOf(port, W, H, clip, t, p, [dx, dy]) {
  return withPaintTable(() => {
    const g = new PortSurface(W, H), out = new Map();
    port.render(g, { clip, t, p });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const r = g.paintAt(x, y); if (r) out.set(`${x + dx},${y + dy}`, JSON.stringify(r)); }
    return out;
  });
}

test('a big frame (the queen 96 x 96, the wyrm 128 x 96) keeps to the stamp cap at its biggest and gives exactly the pixels of its grid', () => {
  const BIG = [
    ['bug.queen', hiveMother, [96, 96], [48, 88], { size: 1, bulk: 1, legs: 'eight', pieces: 1, horns: 'antlers', hornLength: 1.35, wings: 'veil', wingSpan: 1.35, bounce: 1 }, [['spawn', 4, 10], ['shoot', 7, 12], ['enrage', 5, 10]]],
    ['beast.quadruped', emberWyrm, [128, 96], [56, 90], { size: 1, length: 1, bulk: 1, spines: 'sails', wings: 'large', wingSpan: 1.35, horns: 'crown', hornLength: 1.35, tail: 'spade', tailLength: 1.35, bounce: 1 }, [['buffet', 5, 10], ['breath', 8, 12], ['attack', 7, 12]]],
  ];
  for (const [id, port, [W, H], [ox, oy], look, frames] of BIG) {
    for (const [clip, frame, n] of frames) {
      const r = registry.runGenerator({ gen: id, v: 1, at: [ox + 3, oy - 2], ...PAINTS, ...look }, { clip, frame });
      assert.ok(r.ok, `${id} ${clip} ${frame}: ${r.errors.join('; ')}`);
      assert.ok(stampPixels(r.primitives) <= SHAPE_CAPS.stampPixels, `${id} ${clip} ${frame}: ${stampPixels(r.primitives)} stamp pixels`);
      assert.ok(r.primitives.length <= r.cost, `${id}: within its cost`);
      const want = gridOf(port, W, H, clip, frame / (n - 1), { ...look, ...PAINTS, glow: 'glow' }, [3, -2]);
      assert.deepEqual(pixelsOf(r.primitives), want, `${id} ${clip} ${frame}: the same pixels as its grid`);
    }
  }
});

test('a big grid over the stamp cap gives its longest same-paint row runs as rects until its stamps keep to the cap, with exactly its pixels', () => {
  // 128 x 96 painted edge to edge: 12,288 stamp pixels in 16 x 16 tiles, over the 8,192 cap. Every row is one paint for
  // 120 pixels and a two-paint check after, so the runs of the rows come out as rects, top rows first (all as long),
  // until the 16-tile bands they empty bring the stamps under the cap.
  const { prims, want } = withPaintTable(() => {
    const g = new PortSurface(128, 96), want = new Map();
    for (let y = 0; y < 96; y++) for (let x = 0; x < 128; x++) {
      const ref = x < 120 ? (y % 2 ? 'body' : 'accent') : (x + y) % 2 ? 'glow' : 'ink';
      g.dot(x, y, ref); want.set(`${x + 5},${y - 3}`, JSON.stringify(ref));
    }
    return { prims: gridPrimitives(g, [5, -3]), want };
  });
  const rects = prims.filter((p) => p.kind === 'rect');
  assert.ok(rects.length > 0 && rects.length <= 512, `${rects.length} rects`);
  assert.ok(rects.every((r) => r.size[1] === 1 && r.size[0] === 120), 'each a whole row run of one paint');
  assert.ok(stampPixels(prims) <= SHAPE_CAPS.stampPixels, `${stampPixels(prims)} stamp pixels`);
  assert.deepEqual(pixelsOf(prims), want, 'the same pixels as the grid');
  // within the cap: stamps only
  const small = withPaintTable(() => { const g = new PortSurface(128, 96); for (let y = 0; y < 40; y++) for (let x = 0; x < 128; x++) g.dot(x, y, 'body'); return gridPrimitives(g, [0, 0]); });
  assert.ok(small.every((p) => p.kind === 'stamp'), 'no rects when the stamps fit');
});

test('CREATURE_POINTS gives the old sockets at the frame drawn, moved to `at`; the mite had none', () => {
  assert.deepEqual(Object.keys(CREATURE_POINTS).sort(), ['beast.quadruped@1', 'bug.beetle@1', 'bug.crawler@1', 'bug.queen@1', 'bug.spitter@1']);
  const a = { ...registry.generator('bug.crawler', 1).args };
  const args = Object.fromEntries(Object.entries(a).filter(([, t]) => t.default !== undefined).map(([k, t]) => [k, t.default]));
  const pts = CREATURE_POINTS['bug.crawler@1']({ ...args, ...PAINTS, at: [30, 50] }, { clip: 'walk_side', frame: 2 });
  const old = crawlerBug.sockets('walk_side', 2 / 8, { ...args, ...PAINTS, glow: 'glow' });
  assert.deepEqual(Object.keys(pts).sort(), ['back', 'feet', 'head', 'tail']);
  for (const k of Object.keys(old)) assert.deepEqual(pts[k], { x: old[k].x + 6, y: old[k].y + 10, angle: old[k].angle }, k);
  const sp = CREATURE_POINTS['bug.spitter@1']({ ...PAINTS, at: [24, 42], picture: 'shoot', size: 0.5, bulk: 0.5, shape: 'round', horns: 'none', hornLength: 1, bounce: 0.5 }, { frame: 4 });
  assert.deepEqual(Object.keys(sp).sort(), ['head', 'muzzle']);
  assert.deepEqual(sp.muzzle, { ...spitterBug.sockets('shoot', 4 / 7, { size: 0.5, bulk: 0.5, shape: 'round', horns: 'none', hornLength: 1, bounce: 0.5 }).muzzle });
});

test('each port with points has a points motion that moves one node per point to CREATURE_POINTS, turned to its angle', () => {
  const PORTS = { 'bug.crawler': { size: 1, legs: 0, length: 'long', tail: 'stinger', tailLength: 1.35 }, 'bug.spitter': { size: 0, bulk: 1 }, 'bug.beetle': { size: 1, horns: 'rhino', hornLength: 0.65 }, 'bug.queen': { size: 1, bulk: 0 }, 'beast.quadruped': { size: 1, length: 1 } };
  assert.equal(registry.generator('bug.mite.points', 1), null, 'the mite had no points');
  for (const [id, look] of Object.entries(PORTS)) {
    const entry = registry.generator(`${id}.points`, 1), port = registry.generator(id, 1);
    assert.equal(entry?.family, 'motion', id);
    assert.deepEqual(Object.keys(entry.args).sort(), Object.keys(port.args).filter((k) => port.args[k].type !== 'paint').sort(), `${id}: its settings, not its colours`);
    const defaults = Object.fromEntries(Object.entries(entry.args).filter(([, t]) => t.default !== undefined).map(([k, t]) => [k, t.default]));
    const clip = [...port.args.picture.values].find((w) => w !== 'clip').replace(/-(down|up|side)$/, '_$1');
    const a = { ...defaults, ...look, at: [40, 60] }, ctx = { clip, frame: 3 };
    const want = CREATURE_POINTS[`${id}@1`](a, ctx), got = entry.run(a, ctx);
    assert.deepEqual(got.map((m) => m.node), Object.keys(want), id);
    for (const m of got) assert.deepEqual(m, { node: m.node, move: [want[m.node].x, want[m.node].y], turn: -want[m.node].angle * 180 / Math.PI }, `${id} ${m.node}`);
  }
});

test('the shared drawing is copied once: one rig file each in ports/c2, the helpers from E2\'s copies, and no port imports the site\'s rigs or drawing helpers', () => {
  const dir = path.join(ROOT, 'engine', 'gen', 'ports', 'c2');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  assert.deepEqual(files, ['beast.js', 'brood-queen.js', 'colour.js', 'crawler-bug.js', 'crawler.js', 'creature-topdown.js', 'ember-wyrm.js', 'hive-bug.js', 'hive-mother.js', 'hive.js', 'quadruped.js', 'spitter-bug.js', 'swarm-mite.js', 'thorn-beetle.js', 'topdown-clips.js']);
  for (const f of [...files.map((x) => path.join(dir, x)), path.join(ROOT, 'engine', 'gen', 'creatures.js')]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const [, spec] of src.matchAll(/^import [^;]*? from '([^']+)'/gm)) {
      const to = path.resolve(path.dirname(f), spec), rel = path.relative(ROOT, to);
      assert.ok(!rel.startsWith('rigs/') && !rel.startsWith('sprites/'), `${path.relative(ROOT, f)} imports ${rel}`);
      if (rel.startsWith('engine/') && !rel.startsWith('engine/gen/')) assert.equal(rel, 'engine/motion.js', `${path.relative(ROOT, f)} imports ${rel}: only the pure motion maths comes from the site's engine`);
    }
  }
  // the hive bug rig stands on the one top-down creature rig the spitter stands on, and every rig takes E2's helpers
  assert.match(fs.readFileSync(path.join(dir, 'hive-bug.js'), 'utf8'), /from '\.\/creature-topdown\.js'/);
  assert.match(fs.readFileSync(path.join(dir, 'spitter-bug.js'), 'utf8'), /from '\.\/creature-topdown\.js'/);
  // the wyrm's seams come from C1's copy of engine/rock.js, not a second copy
  assert.match(fs.readFileSync(path.join(dir, 'quadruped.js'), 'utf8'), /from '\.\.\/c1\/rock\.js'/);
  for (const f of ['hive-bug.js', 'brood-queen.js', 'quadruped.js']) assert.match(fs.readFileSync(path.join(dir, f), 'utf8'), /from '\.\.\/e2\/creature\.js'/, f);
});
