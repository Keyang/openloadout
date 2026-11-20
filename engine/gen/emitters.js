// The `emitters` layout (docs/data-sprites.md 2.5c, 3.3 "layout", 4.3; build item B12): how an effect or a projectile
// whose body is `emitters` becomes one frame's draw list. Registered as the layout generator "emitters" (family
// "layout"), so engine/data-sprite.js lays every emitters body out with it (its LAYOUTS rule: the body is the whole
// `body`, { emitters, nodes?, draw? }). In order:
//   1. NODES. The node tree (`nodes`) is laid out with each node's at, turn and scale plus what the clip's keys
//      (`nodes: { id: { turn, move, scale } }`) add; the root key and a frame edit's nudge move the whole picture.
//   2. DRAW. The body's `draw` list (shapes, stamps and generator calls, each on its node with `on`), with hidden items,
//      show, hide and stamp swaps as the pose says, expanded and put on the node frames.
//   3. EMITTERS, in their order, after the draw list (a `z` puts one under it: a projectile's trail). On or off (decided
//      in B6, recorded in 2.5c): an emitter that some clip's keys give an `amount` is off wherever no key gives it an
//      amount above 0; one that no key gives an amount always draws. Its `when` and `clip` decide as for any item, and
//      show, hide and `hidden` as for a shape. Keys (`emit: { id: { amount, at, <keyable argument> } }`, blended like
//      bone keys) move its `at` and set the arguments its generator lists as keyable; the amount reaches the generator
//      only as an `amount` argument it declares, held to 0..1. An emitter with `on` has its `at` put on that node's
//      frame first (and its `on` dropped): behaviours work in frame pixels (engine/gen/fx-burst.js), not turned or
//      scaled with the node.
// Primitives of equal `z` keep this order; `glow` ones are drawn last by engine/draw-list.js. A behaviour's time is the
// clip phase (ctx.t); `begin` and `end` on the behaviour start it later or end it sooner. Called as a plain generator
// (the registry's own checks), it draws nothing.
import { defineGenerator, GEN_LIMITS } from './registry.js';
import { primitives } from './args.js';
import { nodeFrame, placeOn } from '../draw-list.js';
import { amountKeyed, emitterCall } from './emit-keys.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const pairOr0 = (v) => (Array.isArray(v) && fin(v[0]) && fin(v[1]) ? [v[0], v[1]] : [0, 0]);
const num0 = (v, d) => (fin(v) ? v : d);
const own = (o, k) => (isObj(o) && Object.hasOwn(o, k) && isObj(o[k]) ? o[k] : null);

/** Moves a list by whole or part pixels [dx, dy]; primitives are new objects. */
function moveList(list, dx, dy) {
  if (!dx && !dy) return list;
  const F = nodeFrame({ at: [dx, dy] });
  return list.map((p) => placeOn(p, F));
}

/** The calls of the frame's emitters (see 3 in the header): gated by their amount, keyed arguments set, `at` put on the node's frame. */
function emitterCalls(input, frames) {
  const { resolved: R, pose, warn, generators: gen } = input;
  const P = isObj(input.body) ? input.body : {};
  const keyed = amountKeyed(R);
  const calls = [];
  for (const e of input.visible(Array.isArray(P.emitters) ? P.emitters : [])) {
    let call = emitterCall(e, own(pose.emit, e?.id), keyed, gen);
    if (!call) continue;
    if (typeof call.on === 'string') {
      const F = frames.get(call.on);
      if (!F) { warn(`the emitter "${String(call.id)}" is on "${call.on}", which this frame has not got; it is left out`); continue; }
      call = { ...call, at: placeOn({ kind: 'dot', at: pairOr0(call.at) }, F).at };
      delete call.on;
    }
    calls.push(call);
  }
  return calls;
}

/**
 * Refuses a frame whose emitter calls, as its keys set them, cost more than a frame's budget, before any of them runs
 * (3.4 rule 2; the second B12 review: keyed puffs priced small ran for 2.9 s before the summed cost was refused). The
 * validator refuses a key that sets a size argument above what the emitter sets (catalog/sprite-schema.js checkKey,
 * B12b), so a checked definition never comes near this; it is the layout's own guard for one drawn without that check.
 * A fixed small sum: each call's cost is the registry's (checkCall), at most 16 calls.
 */
function checkKeyedCost(calls, gen) {
  if (typeof gen?.checkCall !== 'function') return;
  let total = 0;
  for (const c of calls) {
    const r = gen.checkCall(c, { budget: Infinity });
    total += Number.isFinite(r?.cost) ? r.cost : 0;
  }
  if (total > GEN_LIMITS.primitives) throw new Error(`the emitters cost ${total.toLocaleString('en')} in all as this frame's keys set them, over the frame budget of ${GEN_LIMITS.primitives.toLocaleString('en')}; nothing is drawn`);
}

/** One frame of an emitters body (LAYOUTS in engine/data-sprite.js): (input, ctx) -> { list, palette, frames, offset }. */
function layout(input) {
  const { resolved: R, pose } = input;
  const P = isObj(input.body) ? input.body : {};
  const changes = new Map();
  for (const [id, k] of Object.entries(isObj(pose.nodes) ? pose.nodes : {})) {
    if (!isObj(k)) continue;
    changes.set(id, { move: pairOr0(k.move), turn: num0(k.turn, 0), scale: fin(k.scale) && k.scale > 0 ? k.scale : 1 });
  }
  const root = pairOr0(pose.root), nudge = pairOr0(pose.nudge).map(Math.round);
  const dx = root[0] + nudge[0], dy = root[1] + nudge[1];
  const frames = input.nodeFrames(Array.isArray(P.nodes) ? P.nodes : [], changes);
  let palette = R.palette;
  const groups = [];
  const x = input.expand(input.visible(Array.isArray(P.draw) ? P.draw : []));
  palette = { ...palette, ...x.palette };
  groups.push(input.place(x.primitives, frames));
  const calls = emitterCalls(input, frames);
  checkKeyedCost(calls, input.generators);
  if (calls.length) {
    const y = input.expand(calls);
    palette = { ...palette, ...y.palette };
    groups.push(input.place(y.primitives, frames));
  }
  return { list: moveList(groups.flat(), dx, dy), palette, frames, offset: [dx, dy] };
}

/** The layout generator "emitters"@1 (see the header): engine/data-sprite.js calls run(input, ctx) once per frame drawn. */
export const emitters = defineGenerator({
  id: 'emitters', v: 1, family: 'layout',
  about: 'Lays out an emitters body: its node tree, its draw list and its emitters, on or off and keyed by the clip.',
  args: { draw: primitives({ default: [], about: 'The body\'s draw list; the layout reads the whole body from engine/data-sprite.js' }) },
  cost: () => 0,
  run(input, ctx) {
    if (!isObj(input) || !isObj(input.resolved) || typeof input.expand !== 'function') return [];
    return layout(input, ctx);
  },
});
