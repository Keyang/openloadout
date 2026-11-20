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
//   4. WHOLE STRETCH (follow-up F4). A node's own `scale` (and a key's or a move's `scale`) moves what is on the node and
//      scales its radii and points, but a stamp or a rect keeps its pixel size, written or given back by a generator
//      (gem.cut@2 is one stamp): that is released, and stays. A motion's move may also give its node a `stretch:
//      [sx, sy]`: then everything drawn on the node and on the nodes under it is drawn sx times as wide and sy times as
//      tall about the node's origin, on the screen's axes: points and centres move, radii grow (an ellipse exactly; a
//      ring, arc or capsule by the mean of the two), a rect's size grows, and a stamp is resampled pixel for pixel
//      (each pixel of the new block takes the stamp pixel under its centre, as the code's placedIn sampled a shape;
//      a block wider or taller than 32 is drawn as blocks of at most 32 x 32). Stretches of one node multiply; nested
//      ones compose, each about its own node; each axis is held to 0.01..4. A move's `hide: true` leaves out everything
//      on its node and under it this frame. Emitters are neither stretched nor hidden (an effect works in frame pixels,
//      rule 2). A stretch with no node does nothing. Released motions give no stretch, so nothing they drew changes:
//      node.size@1 (a node's size, one scale or two axes) and pickup.collect.whole@1 (a whole node's squash) give them.
//      THE CAP. The validator prices a frame's stamps before any stretch (8,192 stamp pixels, 4,000 primitives,
//      engine/draw-list.js DRAW_LIST_LIMITS), and a stretch of up to 4 x 4 could make them 16 times that, which the
//      renderer would cut block by block, leaving holes. So when the stretched frame (its emitters counted) would hold
//      more stamp pixels or primitives than that, every stamp a stretch grows keeps its own pixel size this frame (its
//      anchor point still moves with the stretch, as a node's own `scale` moves it), and the frame says so in a
//      warning; a stamp a stretch shrinks, and every other kind, is still drawn stretched. A frame under the cap is
//      drawn exactly as above. (A ring's or arc's `thick` and a line's are not stretched: they stay pixel lines.)
// The motions of a frame are chosen as the built-in layout chooses them (engine/resolve.js sceneItems: `clip`, `when`
// with clip and direction, the read budget). Called as a plain generator (the registry's own checks), it draws nothing.
import { defineGenerator } from './registry.js';
import { primitives } from './args.js';
import { nodeFrame, placeOn, STAMP_ANCHORS, DRAW_LIST_LIMITS } from '../draw-list.js';
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
    const stretch = Array.isArray(m.stretch) && m.stretch.length === 2 && m.stretch.every((v) => fin(v) && v > 0) ? m.stretch.map(axis) : null;
    return { node: typeof m.node === 'string' ? m.node : node, move: pairOr0(m.move), turn: num0(m.turn, 0), scale: fin(m.scale) && m.scale > 0 ? m.scale : 1, args: keyed, stretch, hide: m.hide === true };
  });
}

// ---- rule 4: a node's whole stretch ---------------------------------------------------------------------------------

/** One axis of a stretch held to 0.01..4 (rule 4). */
const axis = (v) => Math.min(4, Math.max(0.01, v));

/**
 * For each node a stretch or hide reaches (its own or an ancestor's): { hide, S: [sx, sy], T: [tx, ty] }, the composed
 * screen map x' = S x + T of every stretch from the node up to the root, each about its node's origin in `frames`.
 */
function wholeMaps(nodes, whole, frames) {
  const parent = new Map();
  for (const n of Array.isArray(nodes) ? nodes : []) if (isObj(n) && typeof n.id === 'string') parent.set(n.id, typeof n.parent === 'string' ? n.parent : null);
  const memo = new Map();
  const of = (id) => {
    if (memo.has(id)) return memo.get(id);
    let hide = false, S = [1, 1], T = [0, 0], any = false;
    const seen = new Set();
    for (let n = id; typeof n === 'string' && !seen.has(n) && seen.size < 64; n = parent.get(n) ?? null) {
      seen.add(n);
      const w = whole.get(n);
      if (!w) continue;
      any = true;
      if (w.hide) hide = true;
      const O = frames.get(n)?.at ?? [0, 0];
      for (const i of [0, 1]) { const s = w.stretch[i]; S[i] *= s; T[i] = s * T[i] + O[i] * (1 - s); }
    }
    // a composed axis over 4 is held to 4 about the innermost node's origin
    const O = frames.get(id)?.at ?? [0, 0];
    for (const i of [0, 1]) if (S[i] > 4 || S[i] < 0.01) { const k = axis(S[i]), at = S[i] * O[i] + T[i]; S[i] = k; T[i] = at - k * O[i]; }
    const out = any ? { hide, S, T, identity: S[0] === 1 && S[1] === 1 && T[0] === 0 && T[1] === 0 } : null;
    memo.set(id, out);
    return out;
  };
  return of;
}

const mapXY = (S, T, p) => [S[0] * p[0] + T[0], S[1] * p[1] + T[1]];
const isPt = (p) => Array.isArray(p) && p.length >= 2 && fin(p[0]) && fin(p[1]);
const meanR = (r, k) => (fin(r) ? r * k : Array.isArray(r) ? r.map((v) => (fin(v) ? v * k : v)) : r);

/** An ellipse's radii and turn (radians, engine/draw-list.js's sense) after the screen map S: the image of an ellipse is an ellipse. */
function stretchEllipse(r, turn, S) {
  const [rx, ry] = fin(r) ? [r, r] : Array.isArray(r) && fin(r[0]) && fin(r[1]) ? r : [NaN, NaN];
  if (!fin(rx) || !fin(ry)) return { r, turnRad: turn };
  if (S[0] === S[1]) return { r: [rx * S[0], ry * S[0]], turnRad: turn };
  const c = Math.cos(turn), s = Math.sin(turn);
  if (Math.abs(s) < 1e-12) return { r: [rx * S[0], ry * S[1]], turnRad: turn };
  // two conjugate half-axes a, b of the stretched ellipse, turned into its own axes
  const a = [S[0] * rx * c, S[1] * rx * s], b = [S[0] * -ry * s, S[1] * ry * c];
  const ab = a[0] * b[0] + a[1] * b[1], aa = a[0] ** 2 + a[1] ** 2, bb = b[0] ** 2 + b[1] ** 2;
  const th = 0.5 * Math.atan2(2 * ab, aa - bb), ct = Math.cos(th), st = Math.sin(th);
  const u = [a[0] * ct + b[0] * st, a[1] * ct + b[1] * st], v = [-a[0] * st + b[0] * ct, -a[1] * st + b[1] * ct];
  return { r: [Math.hypot(u[0], u[1]), Math.hypot(v[0], v[1])], turnRad: Math.atan2(u[1], u[0]) };
}

/** A placed stamp resampled by the screen map S, T (rule 4): blocks of at most 32 x 32, top-left anchored, unmirrored. */
function stretchStamp(p, S, T) {
  const rows = typeof p.variant === 'string' && isObj(p.variants) && Object.hasOwn(p.variants, p.variant) ? p.variants[p.variant] : p.rows;
  if (!isPt(p.at) || !Array.isArray(rows) || !rows.length || !rows.every((r) => typeof r === 'string')) return [p];
  const anchor = p.anchor === undefined ? 'tl' : p.anchor;
  if (!Object.hasOwn(STAMP_ANCHORS, anchor)) return [p];
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  if (w > DRAW_LIST_LIMITS.stampSide || h > DRAW_LIST_LIMITS.stampSide) return [p];
  const flip = p.mirror === true || p.mirror === 'x';
  let [ax, ay] = STAMP_ANCHORS[anchor];
  if (flip) ax = 1 - ax;
  // where engine/draw-list.js puts the stamp's pixels, then the pixels whose centres the map brings over them
  const x0 = Math.round(p.at[0] - ax * w), y0 = Math.round(p.at[1] - ay * h);
  const ch = (c, j) => { const r = rows[j], i = flip ? w - 1 - c : c; const k = i < r.length ? r[i] : '.'; return k === ' ' ? '.' : k; };
  const X0 = Math.floor(S[0] * x0 + T[0]) - 1, X1 = Math.ceil(S[0] * (x0 + w) + T[0]) + 1;
  const Y0 = Math.floor(S[1] * y0 + T[1]) - 1, Y1 = Math.ceil(S[1] * (y0 + h) + T[1]) + 1;
  const col = (px) => { const u = Math.floor((px + 0.5 - T[0]) / S[0] - x0 + 1e-9); return u >= 0 && u < w ? u : -1; };
  const row = (py) => { const v = Math.floor((py + 0.5 - T[1]) / S[1] - y0 + 1e-9); return v >= 0 && v < h ? v : -1; };
  const grid = [];
  let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
  for (let py = Y0; py <= Y1; py++) {
    const j = row(py);
    if (j < 0) continue;
    for (let px = X0; px <= X1; px++) {
      const i = col(px);
      if (i < 0) continue;
      const k = ch(i, j);
      if (k === '.') continue;
      grid.push([px, py, k]);
      gx0 = Math.min(gx0, px); gx1 = Math.max(gx1, px); gy0 = Math.min(gy0, py); gy1 = Math.max(gy1, py);
    }
  }
  if (!grid.length) return [];
  const W = gx1 - gx0 + 1, H = gy1 - gy0 + 1, B = DRAW_LIST_LIMITS.stampSide;
  const cells = Array.from({ length: H }, () => new Array(W).fill('.'));
  for (const [px, py, k] of grid) cells[py - gy0][px - gx0] = k;
  const { rows: _r, variants: _v, variant: _w, mirror: _m, anchor: _a, ...rest } = p;
  const out = [];
  for (let ty = 0; ty < H; ty += B) for (let tx = 0; tx < W; tx += B) {
    const part = cells.slice(ty, ty + B).map((r) => r.slice(tx, tx + B).join(''));
    if (part.every((r) => /^\.*$/.test(r))) continue;
    out.push({ ...rest, kind: 'stamp', at: [gx0 + tx, gy0 + ty], anchor: 'tl', rows: part });
  }
  return out;
}

/** Stamp pixels of a list as engine/draw-list.js counts them against DRAW_LIST_LIMITS.stampPixels: each letter of a drawn stamp's rows that is not '.' or ' '. */
function stampPixels(list) {
  let n = 0;
  for (const p of list) {
    if (!isObj(p) || p.kind !== 'stamp' || p.hidden === true) continue;
    const rows = typeof p.variant === 'string' && isObj(p.variants) && Object.hasOwn(p.variants, p.variant) ? p.variants[p.variant] : p.rows;
    if (!Array.isArray(rows)) continue;
    for (const r of rows) if (typeof r === 'string') for (let i = 0; i < r.length; i++) if (r[i] !== '.' && r[i] !== ' ') n++;
  }
  return n;
}

/**
 * A primitive placed in frame pixels, drawn by the screen map x' = S x + T (rule 4): a list (a stamp may become blocks,
 * or nothing). With `keep` ({ grown }), a stamp the map would grow keeps its pixel size, its point moved (THE CAP).
 */
function stretchPrim(p, S, T, depth = 0, keep = null) {
  if (!isObj(p)) return [p];
  if (p.kind === 'stamp') {
    const out = stretchStamp(p, S, T);
    if (keep && isPt(p.at) && stampPixels(out) > stampPixels([p])) { keep.grown++; return [{ ...p, at: mapXY(S, T, p.at) }]; }
    return out;
  }
  const out = { ...p };
  for (const f of ['at', 'from', 'to']) if (isPt(p[f])) out[f] = mapXY(S, T, p[f]);
  if (Array.isArray(p.points)) out.points = p.points.map((q) => (isPt(q) ? mapXY(S, T, q) : q));
  const mean = Math.sqrt(S[0] * S[1]);
  switch (p.kind) {
    case 'ellipse': {
      const turn = fin(p.turnRad) ? p.turnRad : fin(p.turn) ? p.turn * Math.PI / 180 : 0;
      const e = stretchEllipse(p.r, turn, S);
      out.r = e.r; out.turnRad = e.turnRad; delete out.turn;
      break;
    }
    case 'capsule': case 'limb': case 'ring': case 'arc': out.r = meanR(p.r, mean); break;
    case 'rect': if (isPt(p.size)) out.size = [p.size[0] * S[0], p.size[1] * S[1]]; break;
    case 'dither': case 'bands': if (isObj(p.area)) out.area = depth < 6 ? stretchPrim(p.area, S, T, depth + 1)[0] ?? null : null; break;
    case 'cut': if (isObj(p.shape)) out.shape = depth < 6 ? stretchPrim(p.shape, S, T, depth + 1)[0] ?? null : null; break;
    default: break;
  }
  return [out];
}

/** A primitive placed in frame pixels drawn through the stretch map x' = S x + T, exactly as rule 4 draws it on a stretched node (a list: a stamp may become blocks, or nothing); for tests and tools. */
export function stretchPrimitive(p, S, T) {
  const ok = (v) => Array.isArray(v) && v.length === 2 && v.every(fin);
  if (!ok(S) || !ok(T)) return [p];
  return stretchPrim(p, S.map(axis), T);
}

/** input.place with rule 4: what is on a hidden node is left out, what is on a stretched node drawn stretched (with `keep`, grown stamps keep their size). */
function placeWhole(input, prims, frames, mapOf, keep = null) {
  if (!mapOf) return input.place(prims, frames);
  const out = [];
  for (const p of prims) {
    const M = isObj(p) && typeof p.on === 'string' ? mapOf(p.on) : null;
    if (!M) { out.push(...input.place([p], frames)); continue; }
    if (M.hide) continue;
    for (const q of input.place([p], frames)) out.push(...(M.identity ? [q] : stretchPrim(q, M.S, M.T, 0, keep)));
  }
  return out;
}

/**
 * THE CAP (rule 4): the frame's placed groups, made again with every stamp a stretch grows kept at its own size when the
 * stretched frame (with `emitted`, the emitters' primitives) would hold more stamp pixels or primitives than a frame may;
 * the warning says so. `places` are (keep) => group, as the layout made `groups`.
 */
function underCap(groups, emitted, places, warn) {
  const L = DRAW_LIST_LIMITS, all = [...groups.flat(), ...emitted];
  const px = stampPixels(all), n = all.length;
  if (px <= L.stampPixels && n <= L.primitives) return groups;
  const keep = { grown: 0 };
  const kept = places.map((f) => f(keep));
  if (!keep.grown) return groups;
  const say = (v) => v.toLocaleString('en');
  warn(`a stretch would draw this frame with ${say(px)} stamp pixels${n > L.primitives ? ` and ${say(n)} primitives` : ''}, over the ${say(L.stampPixels)} stamp pixels and ${say(L.primitives)} primitives a frame may hold, so the ${keep.grown === 1 ? 'stamp it grows keeps its' : `${keep.grown} stamps it grows keep their`} own size here: ${keep.grown === 1 ? 'stretch it less, or draw it smaller and stretch it' : 'stretch them less, or draw them smaller and stretch them'} more`);
  return kept;
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
  const byNode = new Map(), whole = new Map();
  for (const call of sceneItems(P.motion ?? [], { clip, direction: null })) {
    for (const m of runMotion(gen, call, ctx, warn)) {
      if (Object.keys(m.args).length) byNode.set(m.node, { ...(byNode.get(m.node) ?? {}), ...m.args });
      if (m.node !== null && (m.stretch || m.hide)) {
        const w = whole.get(m.node) ?? { stretch: [1, 1], hide: false };
        whole.set(m.node, { stretch: m.stretch ? [axis(w.stretch[0] * m.stretch[0]), axis(w.stretch[1] * m.stretch[1])] : w.stretch, hide: w.hide || m.hide });
      }
      if (m.node === null) { dx += m.move[0]; dy += m.move[1]; continue; }
      const ch = change(m.node);
      ch.move = [ch.move[0] + m.move[0], ch.move[1] + m.move[1]];
      ch.turn += m.turn;
      ch.scale *= m.scale;
    }
  }
  const frames = input.nodeFrames(P.nodes, changes);
  const mapOf = whole.size ? wholeMaps(P.nodes, whole, frames) : null;   // rule 4; none: placed as before
  const per = own(P.per, clip) ?? {};
  let palette = R.palette;
  const places = [];      // (keep) => a placed group, so THE CAP (rule 4) can place them again
  const picture = own(P.pictures, clip);
  if (picture) {
    let items = keyedItems(input.visible(picture.draw ?? [], per), byNode, gen);
    const fitted = isObj(P.fit) || hasFit(items);
    if (isObj(P.fit) && !hasFit(items)) items = [{ ...P.fit, ...(fin(picture.angle) ? { turn: picture.angle } : {}), draw: items }];
    const x = input.expand(items);
    palette = { ...palette, ...x.palette };
    places.push((keep) => {
      const placed = placeWhole(input, x.primitives, frames, mapOf, keep);
      return fitted ? placed : moveList(placed, 0, 0, num0(picture.angle, 0), [R.size[0] / 2, R.size[1] / 2]);
    });
  }
  const body = keyedItems(input.visible(withPer(Array.isArray(P.draw) ? P.draw : [], Array.isArray(per.draw) ? per.draw : []), per), byNode, gen);
  const x = input.expand(body);
  palette = { ...palette, ...x.palette };
  places.push((keep) => placeWhole(input, x.primitives, frames, mapOf, keep));
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
  let emitted = [];
  if (emits.length) {
    const y = input.expand(emits);
    palette = { ...palette, ...y.palette };
    emitted = input.place(y.primitives, frames);
  }
  let groups = places.map((f) => f(null));
  if (mapOf) groups = underCap(groups, emitted, places, warn);
  return { list: moveList([...groups.flat(), ...emitted], dx, dy), palette, frames, offset: [dx, dy] };
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
