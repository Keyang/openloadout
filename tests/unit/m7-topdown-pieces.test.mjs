// The piece versions migration batch M7b made, rebuilt from the repo alone (M7b review 2, issue 3: a piece made by a
// script in a session's scratch folder could not be made again). Each is rebuilt here from what it was made from and
// compared with the file, byte for byte:
//   held:topdown-polearm@4  rigs/topdown.js townItem's halberd and pike as shapes in the reachF bone's frame, lengths
//                           bound to the length argument (polearm() says how): drawn at the bone's angle, so the blade
//                           and spike stay crisp as the pole tilts (M7b review 3, issue 4). @1 to @3 were pixel
//                           read-backs taken with the pole pointing down and turned with the bone; never released and
//                           named by nothing, they were removed with their pins;
//   part:topdown-belt@2     part:topdown-belt@1 with its colour as given (key c: belt), not its shadow tone.
// held:topdown-magic@2 (a pixel read-back, rebuilt here until M7c) was replaced by held:topdown-magic@3, made in
// tests/unit/m7-topdown-held.test.mjs with the other held things drawn at the bone's angle, and removed with its pin.
// Also held: every piece version M7 made is named by something (docs/data-sprites.md 3.1: an old version stays only
// until no asset names it; M7 review 3 and M7b review 3, issue 2: 0.9 MB of never-released versions nothing named), and
// no top-down pin is left without its file.
// M7_PIECES=write node --test tests/unit/m7-topdown-pieces.test.mjs writes a missing file of these (never over one).
// pieceText is tools/bake-topdown.mjs's: if it changes how it writes, this rebuild and the baker's part ways.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/lib/assets.mjs';
import { PIECE_LIMITS } from '../../engine/pieces.js';

const PIECES = path.join(ROOT, 'pieces');
const read = (f) => fs.readFileSync(path.join(PIECES, f), 'utf8');
const r5 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const ITEM_Z = { down: 1, side: 5, up: -59 };

/** A piece as the bakers write it (tools/bake-topdown.mjs pieceText): nested to depth 4, one entry a line. */
function pieceText(p) {
  const lines = (x, ind, depth) => {
    if (depth >= 4 || x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((v) => v === null || typeof v !== 'object'))) return JSON.stringify(x);
    const pad = ' '.repeat(ind + 1);
    if (Array.isArray(x)) return `[\n${x.map((v) => pad + lines(v, ind + 1, depth + 1)).join(',\n')} ]`;
    return `{\n${Object.entries(x).map(([k, v]) => `${pad}${JSON.stringify(k)}: ${lines(v, ind + 1, depth + 1)}`).join(',\n')} }`;
  };
  return `${lines(p, 0, 0)}\n`;
}
/** A u coordinate (along the pole) that is the length plus d: a binding of the piece's length argument (from 15 to 27). */
const alongL = (d) => ({ from: 'length', map: [[15, r5(15 + d)], [27, r5(27 + d)]] });
/**
 * held:topdown-polearm@4, as its file should read: rigs/topdown.js townItem's halberd and pike written as shapes in the
 * reachF bone's frame ([u along the pole from the hand, v across], v = the pole's direction turned a quarter, as the
 * read-back of @1 to @3 had it), lengths bound to the length argument, so the renderer draws them at the bone's angle
 * as the code does (M7b review 3, issue 4: @3's pixels, read with the pole pointing down and turned with the bone,
 * drew a lumpy head 2 px wider than the code's). Per direction (the blade faces away from the body: the lead side is +v
 * facing down, -v otherwise; z as ITEM_Z):
 *   halberd  the shaft from 11 px behind the hand to the tip; the blade, a disc r 3.4 whose centre stands 1.2 px to the
 *            lead side of the point 5.5 px below the tip, kept where it lies more than 0.4 px to that side (a poly of 21
 *            points on its arc), lit; the hook, 2.2 px to the other side, metal.dark; the spike, a capsule r 1.4 to 0.5
 *            over the last 3.5 px;
 *   pike     the shaft; a leaf head, a capsule r 1.9 to 0.5 over the last 4.5 px, lit; its socket, a dot 6 px below the tip.
 */
function polearm() {
  const slots = [{ id: 'metal', label: 'Metal', default: '#c2c9d6', material: 'metal' }, { id: 'wood', label: 'Shaft', default: '#9a6a3e', material: 'wood' }];
  const items = [];
  for (const dir of ['down', 'side', 'up']) {
    const s = dir === 'down' ? 1 : -1, z = ITEM_Z[dir], when = (kind) => ({ direction: [dir], kind: [kind] });
    const R = 3.4, lim = Math.asin(-0.8 / R), N = 20, blade = [];
    for (let i = 0; i <= N; i++) { const a = lim + ((Math.PI - 2 * lim) * i) / N; blade.push([alongL(-5.5 + R * Math.cos(a)), r5(1.2 * s + s * R * Math.sin(a))]); }
    items.push({ id: `halberd-shaft-${dir}`, kind: 'line', from: [-11, 0], to: [alongL(0), 0], paint: 'wood', z, when: when('halberd') });
    items.push({ id: `halberd-blade-${dir}`, kind: 'poly', points: blade, paint: 'metal', light: 1, z: z + 0.1, when: when('halberd') });
    items.push({ id: `halberd-hook-${dir}`, kind: 'line', from: [alongL(-5.5), 0], to: [alongL(-5.5), r5(-2.2 * s)], paint: 'metal.dark', z: z + 0.2, when: when('halberd') });
    items.push({ id: `halberd-spike-${dir}`, kind: 'capsule', from: [alongL(-3.5), 0], to: [alongL(0), 0], r: [1.4, 0.5], paint: 'metal', z: z + 0.3, when: when('halberd') });
    items.push({ id: `pike-shaft-${dir}`, kind: 'line', from: [-11, 0], to: [alongL(0), 0], paint: 'wood', z, when: when('pike') });
    items.push({ id: `pike-head-${dir}`, kind: 'capsule', from: [alongL(-4.5), 0], to: [alongL(0), 0], r: [1.9, 0.5], paint: 'metal', light: 1, z: z + 0.1, when: when('pike') });
    items.push({ id: `pike-socket-${dir}`, kind: 'dot', at: [alongL(-6), 0], paint: 'metal.dark', z: z + 0.2, when: when('pike') });
  }
  return {
    format: 'loadout-piece', version: 1, id: 'held:topdown-polearm', v: 4, name: 'Halberd or pike',
    about: 'A halberd or a long pike carried upright, as shapes along the reachF bone of a top-down base (use z 60), drawn at the bone angle as rigs/topdown.js townItem draws them.',
    slots, args: { length: { type: 'px', lo: 15, hi: 27, default: 24 }, kind: { type: 'word', options: ['halberd', 'pike'], default: 'halberd' } },
    made: { by: 'tests/unit/m7-topdown-pieces.test.mjs polearm(): rigs/topdown.js townItem halberd and pike as shapes in the reachF frame (migration batch M7b; M7_PIECES=write)', from: 'rigs/topdown.js' },
    body: { draw: items },
  };
}
/** part:topdown-belt@2, as its file should read. */
function belt() {
  const p = JSON.parse(read('part-topdown-belt.v1.json'));
  p.v = 2;
  p.about = 'A belt round the waist in exactly the colour it is given (map it to a band tone to stand clear of the cloth), on the waist node.';
  p.made = { by: 'part:topdown-belt@1 with its colour as given, not its shadow tone (migration batch M7b)', from: 'rigs/topdown.js' };
  for (const x of p.body.draw) x.key = { c: 'belt' };
  return p;
}
const MADE = { 'held-topdown-polearm.v4.json': polearm, 'part-topdown-belt.v2.json': belt };

if (process.env.M7_PIECES === 'write') for (const [f, make] of Object.entries(MADE)) if (!fs.existsSync(path.join(PIECES, f))) fs.writeFileSync(path.join(PIECES, f), pieceText(make()));

for (const [f, make] of Object.entries(MADE)) {
  test(`pieces/${f} is what its rebuild here writes, byte for byte, and its made.by says so`, () => {
    const text = pieceText(make());
    assert.equal(read(f), text, `${f}: differs from its rebuild`);
    assert.ok(text.length <= PIECE_LIMITS.jsonBytes, `${f}: ${text.length} bytes, over ${PIECE_LIMITS.jsonBytes}`);
  });
}

test('town-guard uses held:topdown-polearm@4 for both pole weapons', () => {
  const uses = (t) => [...t.matchAll(/"use":\s*"held:topdown-polearm",\s*"v":\s*(\d+)/g)].map((m) => +m[1]);
  assert.deepEqual(uses(fs.readFileSync(path.join(ROOT, 'sprites', 'town-guard.json'), 'utf8')), [4, 4]);
});

/** Every "use" of a piece version in a JSON text, as "id@v". */
const usesIn = (text) => [...text.matchAll(/"use":\s*"([a-z]+:[a-z0-9-]+)"[^{}\]]*?"v":\s*(\d+)/g)].map((m) => `${m[1]}@${m[2]}`);
function jsonFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsonFiles(f)); else if (e.name.endsWith('.json')) out.push(f);
  }
  return out;
}

test('every piece version migration batch M7 made is named by a sprite, a bundle, a fixture or another piece (docs/data-sprites.md 3.1: none is kept that nothing uses)', () => {
  const named = new Set();
  for (const dir of ['sprites', 'bundles', path.join('tests', 'fixtures'), 'pieces']) for (const f of jsonFiles(path.join(ROOT, dir))) for (const u of usesIn(fs.readFileSync(f, 'utf8'))) named.add(u);
  const m7 = fs.readdirSync(PIECES).filter((f) => /^[a-z]+-.+\.v\d+\.json$/.test(f)).map((f) => JSON.parse(read(f)))
    .filter((p) => /bake-topdown-m7|m7-topdown|batch M7/.test(p.made?.by ?? ''));
  assert.ok(m7.length > 40, `found ${m7.length} M7 pieces`);
  const unused = m7.map((p) => `${p.id}@${p.v}`).filter((ref) => !named.has(ref) && !KEPT[ref]).sort();
  assert.deepEqual(unused, [], 'M7 piece versions nothing names');
  for (const ref of Object.keys(KEPT)) assert.ok(!named.has(ref), `${ref} is named again: take it out of KEPT`);
});

/**
 * M7 versions nothing names that are kept all the same, and why: pinned before they were replaced, and a pin is never
 * removed by hand (pieces/_pins.json; M7c review issue 6b).
 */
const KEPT = Object.freeze({
  'base:person-topdown-trooper@2': 'replaced by @3 (M7c review issue 3: the baton raised), which holds every clip of it byte for byte',
});

test('base:person-topdown-trooper@3 is tools/bake-topdown-m7.mjs trooperV3: version 2 byte for byte, its idle and walk again under picked names, and the baton clips', async () => {
  const { trooperV3 } = await import('../../tools/bake-topdown-m7.mjs');
  assert.equal(read('base-person-topdown-trooper.v3.json'), pieceText(await trooperV3()));
  const v2 = JSON.parse(read('base-person-topdown-trooper.v2.json')), v3 = JSON.parse(read('base-person-topdown-trooper.v3.json'));
  assert.deepEqual(v3.body.rig, v2.body.rig);
  for (const c of Object.keys(v2.body.clips)) assert.deepEqual(v3.body.clips[c], v2.body.clips[c], c);
  assert.deepEqual(Object.keys(v3.body.clips).filter((c) => !v2.body.clips[c]), ['idle-gun-down', 'idle-gun-up', 'idle-gun-side', 'walk-gun-down', 'walk-gun-up', 'walk-gun-side', 'idle-baton-down', 'idle-baton-up', 'idle-baton-side', 'walk-baton-down', 'walk-baton-up', 'walk-baton-side', 'block-baton', 'hurt-baton', 'die-baton']);
  // idle-gun-* and walk-gun-* are idle_* and walk_* again, under names a setting may pick
  for (const c of ['idle', 'walk']) for (const d of ['down', 'up', 'side']) assert.deepEqual({ ...v3.body.clips[`${c}-gun-${d}`], label: null }, { ...v2.body.clips[`${c}_${d}`], label: null }, `${c}-gun-${d}`);
});

test('no pin names an M7 top-down version that is not on disk (the unreleased ones nothing used were removed with their pins before release)', () => {
  const pins = JSON.parse(read('_pins.json')).pins;
  const onDisk = new Set(fs.readdirSync(PIECES).filter((f) => /\.v\d+\.json$/.test(f)).map((f) => { const p = JSON.parse(read(f)); return `${p.id}@${p.v}`; }));
  const gone = Object.keys(pins).filter((ref) => /topdown/.test(ref) && !onDisk.has(ref));
  assert.deepEqual(gone, []);
});
