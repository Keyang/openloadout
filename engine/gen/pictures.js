// The `pictures` layout (docs/data-sprites.md 2.5d, 3.3 "layout"; build item B8): how a body of pictures (props,
// pickups, icons, projectiles) becomes one frame's draw list. Registered as the layout generator "pictures" (family
// "layout"), so engine/data-sprite.js lays every pictures body out with it (its LAYOUTS rule; the built-in layout there
// stays as the fallback). It does what that built-in does, in the same order and with the same choices:
//   - the node tree laid out with each node's at, turn and scale, plus what the clip's keys (`nodes`) and the motions
//     add; a motion with no node, the root key and a frame edit's nudge move the whole picture;
//   - per-clip lists (`per`) go in just before the body's first outline; hidden items, show, hide and stamp swaps as
//     the pose says; an icon set's picture is drawn first, then the shared list;
//   - an emitter that some clip's keys give an `amount` draws only while it is above 0; keys move its `at` and set
//     its keyable arguments.
// And three things more:
//   1. MOTION ARGS. A motion may return `args` with a node move ([{ node, move, args: { "token.spin": 90 } }]): each
//      value is named "<generator id>.<argument>" and goes only to the calls of that generator drawn on that node
//      (`on`; with no node, the calls with no `on`), and only when the generator lists the argument as keyable; a name
//      without a generator is ignored. So a coin's token spins and shrinks the way token@1 draws it, a crate's
//      container leans the way container@1 leans it (whole-pixel art is never turned as a bitmap), and a later
//      generator with a keyable `spin` of its own never picks up a motion meant for a token.
//   2. EMITTERS ON NODES run in frame pixels: an emitter with `on` has its `at` put on the node's frame first (and its
//      `on` dropped), so it knows where the frame's edges are (pickup.burst@1 keeps its sparkles inside them).
//      Effects are not turned or scaled with the node.
//   3. ICON FIT. The body's `fit` (icon.fit@1) fits each picture of an icon set: the picture's draw list becomes the
//      fit's `draw` and the picture's `angle` its `turn`; the picture is then not turned again. A picture whose list
//      holds an icon.fit call of its own keeps that call as written.
// The motions of a frame are chosen as the built-in layout chooses them (engine/resolve.js sceneItems: `clip`, `when`
// with clip and direction, the read budget). Called as a plain generator (the registry's own checks), it draws nothing.
import { defineGenerator } from './registry.js';
import { primitives } from './args.js';
import { nodeFrame, placeOn } from '../draw-list.js';
import { sceneItems } from '../resolve.js';
import { amountKeyed, emitterCall } from './emit-keys.js';
import { checkKeyedCost } from './emitters.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const pairOr0 = (v) => (Array.isArray(v) && fin(v[0]) && fin(v[1]) ? [v[0], v[1]] : [0, 0]);
const num0 = (v, d) => (fin(v) ? v : d);
const own = (o, k) => (isObj(o) && Object.hasOwn(o, k) && isObj(o[k]) ? o[k] : null);
const plain = (v) => JSON.parse(JSON.stringify(v));
const deepFreeze = (o) => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };

/** Runs one motion (engine/data-sprite.js runMotion, plus `args`): the registry's entry of family "motion", its arguments checked; returns its node moves. */
function runMotion(gen, call, ctx, warn) {
  const entry = typeof gen?.generator === 'function' ? gen.generator(call.gen, call.v) : null;
  if (!entry || entry.family !== 'motion' || typeof entry.run !== 'function') { warn(`the motion ${call.gen}@${call.v} is not in the generator registry, so it is left out`); return []; }
  const node = typeof call.node === 'string' ? call.node : null;
  const args = {};
  for (const [name, type] of Object.entries(entry.args ?? {})) {
    if (Object.hasOwn(call, name)) args[name] = call[name];
    else if (isObj(type) && type.default !== undefined) args[name] = type.default;
  }
  if (typeof gen.checkCall === 'function') {
    const r = gen.checkCall({ gen: call.gen, v: call.v, ...args });
    if (!r.ok) { warn(`the motion ${call.gen}@${call.v}: ${r.errors.slice(0, 3).join('; ')}`); return []; }
  }
  let out;
  try { out = entry.run(deepFreeze(plain(args)), ctx); } catch (e) { warn(`the motion ${call.gen}@${call.v} failed: ${String(e?.message ?? e).slice(0, 120)}`); return []; }
  if (!Array.isArray(out)) return [];
  return out.slice(0, 16).filter(isObj).map((m) => {
    const keyed = {};
    if (isObj(m.args)) for (const [k, v] of Object.entries(m.args).slice(0, 16)) if (fin(v) || typeof v === 'boolean') keyed[k] = v;
    return { node: typeof m.node === 'string' ? m.node : node, move: pairOr0(m.move), turn: num0(m.turn, 0), scale: fin(m.scale) && m.scale > 0 ? m.scale : 1, args: keyed };
  });
}

/** Whether a motion's value v may replace w, what an emitter sets: numbers not above it (a size argument is lowered, never raised); anything else only when equal. */
const notAbove = (v, w) => (fin(v) && fin(w) ? v <= w : v === w);

/**
 * The items with the motions' args ("<generator id>.<argument>") put into the keyable arguments of the calls of that
 * generator on their node (MOTION ARGS above). For emitters (held): a size argument (the registry's SIZE_KEYS for the
 * generator, every keyable argument when it has none, as catalog/sprite-schema.js prices them) is only lowered from
 * what the emitter sets (or its default), never raised, so a motion cannot raise what the validator charged (B12c).
 */
function keyedItems(items, byNode, gen, held = false) {
  if (!byNode.size) return items;
  return items.map((item) => {
    if (!isObj(item) || typeof item.gen !== 'string') return item;
    const vals = byNode.get(typeof item.on === 'string' ? item.on : null);
    if (!vals) return item;
    const entry = typeof gen?.generator === 'function' ? gen.generator(item.gen, item.v) : null;
    const keyable = Array.isArray(entry?.keyable) ? entry.keyable : [];
    const table = held ? gen?.SIZE_KEYS?.[`${item.gen}@${item.v}`] : null;
    const sized = !held ? [] : Array.isArray(table) ? table : keyable;
    let out = item;
    for (const [name, v] of Object.entries(vals)) {
      const dot = name.lastIndexOf('.');
      if (dot <= 0 || name.slice(0, dot) !== item.gen) continue;
      const k = name.slice(dot + 1);
      if (!keyable.includes(k)) continue;
      if (sized.includes(k)) {
        const set = Object.hasOwn(item, k) ? item[k] : entry?.args?.[k]?.default;
        if (!notAbove(v, set)) continue;
      }
      if (out === item) out = { ...item };
      out[k] = v;
    }
    return out;
  });
}

/** Moves a list by [dx, dy] (and turns it by `turn` degrees round `about`); primitives are new objects. */
function moveList(list, dx, dy, turn = 0, about = [0, 0]) {
  if (!dx && !dy && !turn) return list;
  const there = nodeFrame({ at: [about[0] + dx, about[1] + dy], turn }), back = nodeFrame({ at: [-about[0], -about[1]] });
  return list.map((p) => (turn ? placeOn(placeOn(p, back), there) : placeOn(p, nodeFrame({ at: [dx, dy] }))));
}

/** The draw list with per-clip items put in just before its first outline (at the end when it has none). */
function withPer(draw, per) {
  if (!per.length) return draw;
  const at = draw.findIndex((p) => isObj(p) && p.kind === 'outline');
  return at < 0 ? [...draw, ...per] : [...draw.slice(0, at), ...per, ...draw.slice(at)];
}

const hasFit = (list) => list.some((x) => isObj(x) && x.gen === 'icon.fit');

/** One frame of a pictures body (LAYOUTS in engine/data-sprite.js): (input, ctx) -> { list, palette, frames, offset }. */
function layout(input, ctx) {
  const { resolved: R, pose, warn, generators: gen } = input;
  const P = isObj(input.body) ? input.body : {};
  const { clip } = ctx;
  const changes = new Map();
  const change = (id) => { if (!changes.has(id)) changes.set(id, { move: [0, 0], turn: 0, scale: 1 }); return changes.get(id); };
  for (const [id, k] of Object.entries(isObj(pose.nodes) ? pose.nodes : {})) {
    if (!isObj(k)) continue;
    const ch = change(id), m = pairOr0(k.move);
    ch.move = [ch.move[0] + m[0], ch.move[1] + m[1]];
    ch.turn += num0(k.turn, 0);
    ch.scale *= fin(k.scale) && k.scale > 0 ? k.scale : 1;
  }
  const root = pairOr0(pose.root), nudge = pairOr0(pose.nudge).map(Math.round);
  let dx = root[0] + nudge[0], dy = root[1] + nudge[1];
  const byNode = new Map();
  for (const call of sceneItems(P.motion ?? [], { clip, direction: null })) {
    for (const m of runMotion(gen, call, ctx, warn)) {
      if (Object.keys(m.args).length) byNode.set(m.node, { ...(byNode.get(m.node) ?? {}), ...m.args });
      if (m.node === null) { dx += m.move[0]; dy += m.move[1]; continue; }
      const ch = change(m.node);
      ch.move = [ch.move[0] + m.move[0], ch.move[1] + m.move[1]];
      ch.turn += m.turn;
      ch.scale *= m.scale;
    }
  }
  const frames = input.nodeFrames(P.nodes, changes);
  const per = own(P.per, clip) ?? {};
  let palette = R.palette;
  const groups = [];
  const picture = own(P.pictures, clip);
  if (picture) {
    let items = keyedItems(input.visible(picture.draw ?? [], per), byNode, gen);
    const fitted = isObj(P.fit) || hasFit(items);
    if (isObj(P.fit) && !hasFit(items)) items = [{ ...P.fit, ...(fin(picture.angle) ? { turn: picture.angle } : {}), draw: items }];
    const x = input.expand(items);
    palette = { ...palette, ...x.palette };
    const placed = input.place(x.primitives, frames);
    groups.push(fitted ? placed : moveList(placed, 0, 0, num0(picture.angle, 0), [R.size[0] / 2, R.size[1] / 2]));
  }
  const body = keyedItems(input.visible(withPer(Array.isArray(P.draw) ? P.draw : [], Array.isArray(per.draw) ? per.draw : []), per), byNode, gen);
  const x = input.expand(body);
  palette = { ...palette, ...x.palette };
  groups.push(input.place(x.primitives, frames));
  // emitters (engine/gen/emit-keys.js, the rules the emitters layout reads): one that some clip's keys give an amount
  // draws only while it is above 0 here, its amount held to 0..1; a motion lowers its size arguments, never raises
  // them; one on a node runs in frame pixels; the frame's keyed calls are refused if over its budget before any runs
  const keyed = amountKeyed(R);
  const emits = [];
  for (const e of Array.isArray(P.emitters) ? P.emitters : []) {
    let call = emitterCall(e, own(pose.emit, e?.id), keyed, gen);
    if (!call) continue;
    [call] = keyedItems([call], byNode, gen, true);
    if (typeof call.on === 'string') {
      const F = frames.get(call.on);
      if (!F) { warn(`the emitter "${String(call.id)}" is on "${call.on}", which this frame has not got; it is left out`); continue; }
      call = { ...call, at: placeOn({ kind: 'dot', at: pairOr0(call.at) }, F).at };
      delete call.on;
    }
    emits.push(call);
  }
  checkKeyedCost(emits, gen);
  if (emits.length) {
    const y = input.expand(emits);
    palette = { ...palette, ...y.palette };
    groups.push(input.place(y.primitives, frames));
  }
  return { list: moveList(groups.flat(), dx, dy), palette, frames, offset: [dx, dy] };
}

/** The layout generator "pictures"@1 (see the header): engine/data-sprite.js calls run(input, ctx) once per frame drawn. */
export const pictures = defineGenerator({
  id: 'pictures', v: 1, family: 'layout',
  about: 'Lays out a pictures body: its node tree, draw list, per-clip lists, motions, emitters and icon sets.',
  args: { draw: primitives({ default: [], about: 'The body\'s draw list; the layout reads the whole body from engine/data-sprite.js' }) },
  cost: () => 0,
  run(input, ctx) {
    if (!isObj(input) || !isObj(input.resolved) || typeof input.expand !== 'function') return [];
    return layout(input, ctx);
  },
});
