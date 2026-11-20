// Every generator draws the same thing on a node as in frame pixels (build item B10b, the first fresh-agent test): a
// call `on` a node is in the node's own coordinates, so a thing centred on its node has negative coordinates, and a
// generator that kept only the pixels at 0 and up drew a node-centred gem as its lower-right quarter. For every
// registered generator that draws (not a layout or a motion), the sheet's sample call (tools/gen.mjs baseArgs) is drawn
// twice in a 32 x 32 frame: once in frame pixels round (16, 16), once on a node at (16, 16) with every position moved
// by (-16, -16); the two must give the same pixels at four clip phases.
//
// A released version that fails keeps its output (Contract 15: a released version never changes) and must name the
// version that fixes it in ORIGIN_FIXED (engine/gen/index.js); the newest version of every id must pass, except the
// FRAME_GENERATORS, which work in frame pixels by design (the pictures layout puts an emitter on its node's frame
// first; icon.fit lays out the whole frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import { generators, generatorVersions, ORIGIN_FIXED, FRAME_GENERATORS } from '../../engine/gen/index.js';
import { baseArgs, NOT_DRAWN } from '../../tools/gen.mjs';
import { sheetCell, cellFrames } from '../../tools/lib/data-sheet.mjs';

const D = 16;
const SIZE = [32, 32];
const pair = (v) => Array.isArray(v) && v.length === 2 && v.every((c) => typeof c === 'number');
const move = (p, d) => [p[0] + d, p[1] + d];

/** A primitive (or a nested call, with its positions moved the same way) moved by d pixels each way. */
function movePrim(p, d) {
  if (!p || typeof p !== 'object') return p;
  if (p.gen !== undefined) return moveArgs(p, d, null);
  const q = { ...p };
  for (const k of ['at', 'from', 'to']) if (pair(q[k])) q[k] = move(q[k], d);
  if (Array.isArray(q.points)) q.points = q.points.map((pt) => (pair(pt) ? move(pt, d) : pt));
  if (q.area && typeof q.area === 'object') q.area = movePrim(q.area, d);
  if (q.shape && typeof q.shape === 'object') q.shape = movePrim(q.shape, d);
  return q;
}

/** A call's arguments with every position moved by d: points that are places (not sizes), shapes, paths, primitive lists; an icon generator moves only its pen's centre. */
function moveArgs(args, d, entry) {
  const out = { ...args };
  const types = entry?.args ?? null;
  if ((types && Object.hasOwn(types, 'centre')) || (!types && pair(args.centre))) {
    out.centre = move(args.centre ?? [16, 16], d);
    return out;
  }
  for (const [k, v] of Object.entries(args)) {
    const t = types?.[k];
    const kind = t?.type;
    if (kind === 'point' && Number.isFinite(t.lo) && t.lo >= 0) continue;            // a size
    if ((kind === 'point' || (!types && (k === 'at' || k === 'from' || k === 'to'))) && pair(v)) out[k] = move(v, d);
    else if ((kind === 'primitives' || (!types && Array.isArray(v) && v.some((x) => x && typeof x === 'object' && x.kind))) && Array.isArray(v)) out[k] = v.map((p) => movePrim(p, d));
    else if (kind === 'shape') out[k] = movePrim(v, d);
    else if (kind === 'profile' && Array.isArray(v)) out[k] = v.map((c) => c + d);
  }
  return out;
}

/** The frames of a call drawn in frame pixels and the same call on a node at (16, 16): [{ frame, node }] as byte arrays. */
function bothWays(entry, args, slots) {
  const call = { gen: entry.id, v: entry.v };
  const framed = sheetCell({ size: SIZE, slots, draw: [{ ...call, ...args }], frames: 4 });
  const onNode = sheetCell({ size: SIZE, slots, nodes: [{ id: 'n', parent: null, at: [D, D] }], draw: [{ ...call, ...moveArgs(args, -D, entry), on: 'n' }], frames: 4 });
  assert.ok(framed.ok, `${entry.key} in frame pixels: ${framed.errors.join('; ')}`);
  assert.ok(onNode.ok, `${entry.key} on a node: ${onNode.errors.join('; ')}`);
  const a = cellFrames(framed, 4), b = cellFrames(onNode, 4);
  return a.map((g, i) => ({ frame: Buffer.from(g.bytes()), node: Buffer.from(b[i].bytes()) }));
}

const lit = (buf) => { let n = 0; for (let i = 3; i < buf.length; i += 4) if (buf[i]) n++; return n; };

/** Does the generator version draw the same on a node as in frame pixels? { same, detail }. */
function sameOnNode(entry) {
  const { args, slots } = baseArgs(entry, SIZE);
  if (Object.hasOwn(entry.args, 'centre') && args.centre === undefined) args.centre = [16, 16];
  // a position left at its default (container@1's foot) is written out, so the node's copy can be moved
  for (const [k, t] of Object.entries(entry.args)) if (t.type === 'point' && args[k] === undefined && pair(t.default) && !(Number.isFinite(t.lo) && t.lo >= 0)) args[k] = [...t.default];
  const frames = bothWays(entry, args, slots);
  const bad = frames.findIndex((f) => !f.frame.equals(f.node));
  if (bad < 0) {
    assert.ok(frames.some((f) => lit(f.frame) > 0), `${entry.key}: the sample draws nothing, so the test proves nothing`);
    return { same: true, detail: '' };
  }
  return { same: false, detail: `phase ${bad / 4}: ${lit(frames[bad].frame)} pixels in frame pixels, ${lit(frames[bad].node)} on the node` };
}

const drawn = () => generators().filter((g) => !NOT_DRAWN[g.family]);
const newest = (id) => { const vs = generatorVersions(id); return vs[vs.length - 1]; };

test('the newest version of every drawing generator draws the same on a node centred at the origin as in frame pixels', () => {
  const wrong = [];
  for (const g of drawn()) {
    if (g.v !== newest(g.id) || Object.hasOwn(FRAME_GENERATORS, g.key)) continue;
    const r = sameOnNode(g);
    if (!r.same) wrong.push(`${g.key} (${r.detail})`);
  }
  assert.deepEqual(wrong, [], `these draw differently on a node (fix each by a new version):\n${wrong.join('\n')}`);
});

test('an older version that draws differently on a node names the version that fixes it (ORIGIN_FIXED), and that version exists', () => {
  for (const g of drawn()) {
    if (g.v === newest(g.id) || Object.hasOwn(FRAME_GENERATORS, g.key)) continue;
    const r = sameOnNode(g);
    if (r.same) assert.ok(!Object.hasOwn(ORIGIN_FIXED, g.key), `${g.key} draws the same on a node: take it out of ORIGIN_FIXED`);
    else {
      assert.ok(Object.hasOwn(ORIGIN_FIXED, g.key), `${g.key} draws differently on a node (${r.detail}) and ORIGIN_FIXED does not name its fix`);
      assert.ok(generatorVersions(g.id).includes(ORIGIN_FIXED[g.key]), `${g.key}: ORIGIN_FIXED names v${ORIGIN_FIXED[g.key]}, which is not registered`);
    }
  }
  for (const [key, v] of Object.entries(ORIGIN_FIXED)) {
    const [id, old] = key.split('@');
    assert.ok(generatorVersions(id).includes(Number(old)), `ORIGIN_FIXED names ${key}, which is not registered`);
    assert.ok(v > Number(old), `${key}: its fix must be a later version`);
  }
});

test('the old versions in ORIGIN_FIXED really do lose what lies left of or above the node (the fault the test guards)', () => {
  for (const key of Object.keys(ORIGIN_FIXED)) {
    const [id, v] = key.split('@');
    const g = generators().find((x) => x.id === id && x.v === Number(v));
    assert.equal(sameOnNode(g).same, false, `${key} is listed as broken on a node but draws the same`);
  }
});

test('FRAME_GENERATORS name registered versions, each with the reason it works in frame pixels', () => {
  for (const [key, why] of Object.entries(FRAME_GENERATORS)) {
    const [id, v] = key.split('@');
    assert.ok(generatorVersions(id).includes(Number(v)), `FRAME_GENERATORS names ${key}, which is not registered`);
    assert.ok(typeof why === 'string' && why.length > 10, `${key}: say why it works in frame pixels`);
  }
});
