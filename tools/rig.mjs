#!/usr/bin/env node
// What a body rig has, read from its description (rigs/<rig>-describe.js; docs/architecture.md, Contract 13).
//
//   node tools/rig.mjs                      the rigs that describe themselves
//   node tools/rig.mjs <rig>                the rig as tables to read: poses, body, hair, parts with their options,
//                                           held kinds, sockets, manners, and what overlaps
//   node tools/rig.mjs <rig> --sheet        contact sheets, so you see what exists before writing anything:
//                                             out/rig-<rig>-parts.png   every part (one row per kind) on a plain body
//                                             out/rig-<rig>-held.png    every held kind
//                                           each row: the name, then per direction the standard setting, then the
//                                           same with every size and length at its largest
//       --scale 3      bigger pixels (default 2)        --out <dir>    where to write (default out/)
//       --match text   only the rows whose name has the text         --pages 12   also cut the sheet into pages of 12 rows
//
// This file is also the one place that draws from a description alone: drawPose() and drawEntry() take an entry of a
// description, call the function it names with the arguments it lists, and return the picture. The unit tests
// (tests/unit/rig-describe-*.test.mjs) use them to prove a description true, and the sheets are made with them. It
// is a tool, not the renderer of Contract 13: each rig still builds a frame its own way, so there is one small
// adapter per rig below (STAGES), and that is all this file knows about a rig that its description does not say.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Surface } from '../engine/surface.js';
import { INK } from '../engine/color.js';
import { encodePNG } from './png.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUFFIX = '-describe.js';

/** The rigs that describe themselves: every rigs/<id>-describe.js, by id. There is no list. */
export const RIG_IDS = fs.readdirSync(path.join(ROOT, 'rigs')).filter((f) => f.endsWith(SUFFIX)).map((f) => f.slice(0, -SUFFIX.length)).sort((a, b) => ORDER(a) - ORDER(b) || (a < b ? -1 : 1));
function ORDER(id) { const i = ['humanoid', 'topdown', 'kiosk'].indexOf(id); return i < 0 ? 99 : i; }

// ---- loading and reading a description ----------------------------------------------------------------------------

/** Loads a rig's description and the modules it names: { id, rig, mods: { short name: module }, standardClip(name), standardNames() }. */
export async function loadRig(id) {
  if (!RIG_IDS.includes(id)) throw new Error(`no rig "${id}" describes itself (there are: ${RIG_IDS.join(', ')})`);
  const { RIG: rig } = await import(pathToFileURL(path.join(ROOT, 'rigs', `${id}${SUFFIX}`)).href);
  const mods = {};
  for (const [short, file] of Object.entries(rig.modules)) mods[short] = await import(pathToFileURL(path.join(ROOT, file)).href);
  const L = { id, rig, mods };
  const stage = STAGES[id];
  if (!stage) throw new Error(`tools/rig.mjs has no adapter for the rig "${id}": add one to STAGES`);
  // the rig's own clip table, as { frames, fps (at the middle speed, before the Speed slider), loop }
  L.standardClip = (name) => {
    let c = null;
    try { c = stage.clip(L, name); } catch { return null; }
    if (!c) return null;
    const fps = typeof c.fps === 'function' ? c.fps({}) / 1.05 : c.fps;      // the rigs scale by lerp(0.65, 1.45, speed): 1.05 at the middle
    return { frames: c.frames, fps: Math.round(fps * 1000) / 1000, loop: c.loop };
  };
  L.standardNames = () => stage.clipNames(L);
  return L;
}

/** The export a description names: resolve(L, 'topdown.cape'), resolve(L, 'topdown.MANNERS.rock'). undefined when there is none. */
export function resolve(L, name) {
  const [short, ...rest] = String(name).split('.');
  let v = L.mods[short];
  for (const key of rest) v = v?.[key];
  return v;
}

const walk = (v, visit) => {
  if (Array.isArray(v)) { for (const x of v) walk(x, visit); return; }
  if (v !== null && typeof v === 'object') { visit(v); for (const [k, x] of Object.entries(v)) { visit(k); walk(x, visit); } return; }
  visit(v);
};

/** Every export a description names anywhere, as a Set of '<module>.<export>'. */
export function mentioned(rig) {
  const shorts = Object.keys(rig.modules), out = new Set();
  walk(rig, (v) => {
    if (typeof v !== 'string') return;
    const m = /^([A-Za-z]\w*)\.([A-Za-z_$][\w$]*)(?:\.[\w$]+)*$/.exec(v);
    if (m && shorts.includes(m[1])) out.add(`${m[1]}.${m[2]}`);
  });
  return out;
}

/** The entries of one section, with the other ways each can be drawn (`also`): entriesOf(rig, 'parts'). 'body' gives the body, its kinds and its features. */
export function entriesOf(rig, section) {
  const list = section === 'body' ? [rig.body, ...rig.body.kinds, ...(rig.body.features ?? [])] : rig[section] ?? [];
  return list.flatMap((e) => [e, ...(e.also ?? [])]);
}

/** The names a description gives for each exported list it claims: { '<module>.<list>': Set of names }. An entry claims a list with `list`; its names are its `choices`, or its `name`. */
export function namesIn(rig) {
  const out = {};
  walk(rig, (v) => {
    if (v === null || typeof v !== 'object' || !v.list) return;
    for (const list of [].concat(v.list)) for (const name of v.choices ?? [v.name]) (out[list] ??= new Set()).add(name);
  });
  return out;
}

/** The options of an entry that are a choice: [[key, values], ...]. */
export const choicesOf = (e) => Object.entries(e.options ?? {}).filter(([, o]) => o.choices).map(([k, o]) => [k, o.choices]);

/** The phases (0..1) of a pose's frames, as engine/sprite.js gives them to render(). */
export const phasesOf = (pose) => Array.from({ length: pose.frames }, (_, f) => (pose.loop ? f / pose.frames : f / (pose.frames - 1)));

/** How many pixels differ between two pictures of the same size. */
export function diff(a, b) { let n = 0; for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) n++; return n; }

/** The box of a picture that touches the frame's edge (so something was cut off), or null when it is clear of it: the quality bar's rule. */
export function offFrame(g) {
  const b = g.bounds();
  return b && (b.x0 === 0 || b.y0 === 0 || b.x1 === g.w - 1 || b.y1 === g.h - 1) ? b : null;
}

const defaultsOf = (options = {}) => Object.fromEntries(Object.entries(options).filter(([, o]) => o.default !== undefined).map(([k, o]) => [k, o.default]));
const largestOf = (options = {}) => Object.fromEntries(Object.entries(options).filter(([, o]) => 'max' in o && !o.subtle).map(([k, o]) => [k, o.max]));
const merge = (into, from) => { for (const [k, v] of Object.entries(from)) { if (v !== null && typeof v === 'object' && !Array.isArray(v) && into[k] !== null && typeof into[k] === 'object') merge(into[k], v); else into[k] = v; } return into; };
const poseNamed = (rig, name) => rig.poses.find((p) => p.name === name) ?? (() => { throw new Error(`rig ${rig.id}: no pose "${name}"`); })();
const heldNamed = (rig, name) => rig.held.find((h) => h.name === name) ?? (() => { throw new Error(`rig ${rig.id}: no held kind "${name}"`); })();

/**
 * Calls the function an entry names with the arguments it lists. An argument is a name looked up in `ctx` ('g', 'J',
 * 'P', 'd', 'direction', 'at', 'options', 'item', 'name', 't', 'm', 'poseAt', 'length'), { option: key } (that option's
 * value, after `prefix` when it has one), { joint: name, dx, dy } (a point { x, y } at a joint) or { value } (a constant).
 */
function call(L, entry, ctx, fallback) {
  const fn = resolve(L, entry.fn);
  if (typeof fn !== 'function') throw new Error(`${entry.name}: ${entry.fn} is not a function`);
  return fn(...(entry.args ?? fallback).map((a) => (typeof a === 'string' ? ctx[a] : 'option' in a ? (a.prefix ? a.prefix + ctx.options?.[a.option] : ctx.options?.[a.option]) : 'joint' in a ? { x: ctx.J[a.joint][0] + (a.dx ?? 0), y: ctx.J[a.joint][1] + (a.dy ?? 0) } : a.value)));
}
const number = (L, spec, ctx) => (spec ? call(L, { name: 'rise', ...spec }, ctx, []) : 0);

// ---- one adapter per rig: how a posed frame is built ---------------------------------------------------------------
// stage(L, o) -> { P, d, paint(g, hooks, after, finish) -> J, sockets(ask), at(socket, J) }
// o: { direction, pose (an entry), t, body, m, item (a size), carry, rise(d), reach(d), look, set, kind (a body kind), frameOptions, finish }

// a plain body for the sheets: olive, so steel, wood, cloth of any colour and light all stand apart from it
const NEUTRAL = { skin: '#f6d3b0', top: '#7f9a5f', bottom: '#566b46', boots: '#3d4a36', hair: '#5a3a22', hairStyle: 'short' };
const ARGS = {
  topdown: { poses: ['name', 'direction', 't', 'm', 'd'], parts: ['g', 'J', 'P', 'd', 'options'], held: ['g', 'direction', 'at', 'item'] },
  humanoid: { poses: ['name', 't', 'm', 'd'], parts: ['g', 'J', 'P', 'd', 'options'], held: ['g', 'at', 'item'] },
  kiosk: { poses: ['name', 't', 'm'], parts: [], held: [] },
};

const STAGES = {
  topdown: {
    clip: (L, name) => L.mods.topdown.STANDARD[name] ?? null,
    clipNames: (L) => Object.keys(L.mods.topdown.STANDARD),
    stage(L, o) {
      const T = L.mods.topdown, pe = o.pose, kind = o.kind ?? L.rig.body.kinds[0];
      const own = pe.fn !== 'topdown.pose';
      const pose = own ? (action, direction, u, m, d) => call(L, pe, { name: pe.name, direction, t: u, m, d, options: { ...defaultsOf(pe.options), ...o.m } }, ARGS.topdown.poses) : undefined;
      const manners = [...(o.manners ?? []), ...(o.set ? [(P) => { merge(P, o.set); }] : [])];
      const body = { ...kind.via?.body, ...o.body, ...o.m }, tall = kind.via?.tall;
      const opt = { item: o.item ?? null, carry: o.carry, rise: o.rise ? o.rise() : 0, tall };
      const clip = `${pe.name}_${o.direction}`;
      // a pose of its own goes through poseFrame(); a manner through frameWith(), which gives it F.carry; else frame()
      const F = pose ? T.poseFrame(clip, o.t, body, { ...opt, pose, manner: manners }) : manners.length ? T.frameWith(clip, o.t, body, { ...opt, manner: manners }) : T.frame(clip, o.t, body, opt);
      const look = { ...NEUTRAL, ...o.look };
      return {
        F, P: F.P, d: F.d, poseAt: F.poseAt,
        paint(g, hooks = {}, after, finish = {}) { const J = F.draw(g, look, hooks); F.finish(g, finish); after?.(g, J, F.P, F.d); return J; },
        sockets: () => F.sockets(),
        at: (name, J) => (name === 'hand' ? F.hand(J) : name === 'muzzle' ? F.sockets().muzzle : T.sockets(J, F.P, F.d)[name]),
      };
    },
  },
  humanoid: {
    clip: (L, name) => L.mods.humanoid.clipsFor([name])[name],
    clipNames: (L) => L.mods.humanoid.POSES.filter((n) => { try { L.mods.humanoid.clipsFor([n]); return true; } catch { return false; } }),
    stage(L, o) {
      const H = L.mods.humanoid, pe = o.pose, kind = o.kind ?? L.rig.body.kinds[0];
      const d = resolve(L, kind.dims)(o.body ?? {});
      const m = { bounce: 0.5, stride: 0.5, armed: !!o.item, ...o.m };
      const rise = o.rise ? o.rise(d) : 0, reach = o.reach ? o.reach(d) : 0;
      const points = rise || reach ? (J) => [[J.head[0], J.head[1] - d.headR - rise], [J.head[0] - reach, J.head[1]]] : null;
      const poseAt = (u) => {
        const P = call(L, pe, { name: pe.name, t: u, m, d, options: defaultsOf(pe.options) }, ARGS.humanoid.poses);
        if (o.set) merge(P, o.set);
        for (const poser of o.posers ?? []) poser(P, pe.name, u);
        return H.fit(P, d, { item: o.item ?? null, points });
      };
      const P = poseAt(o.t), painter = resolve(L, kind.fn);
      const look = { ...NEUTRAL, ...kind.look, ...o.look };
      return {
        P, d, poseAt,
        paint(g, hooks = {}, after) {
          const J = painter(g, P, d, look, hooks) ?? H.solve(P, d);
          if (P.flash) g.tint('#ffffff');
          g.outline(INK);
          after?.(g, J, P, d);
          return J;
        },
        sockets: (ask) => H.sockets(H.solve(P, d), P, d, ask === 'muzzle' ? { muzzle: o.item?.length ?? 0 } : {}),
        at: (name, J) => H.sockets(J, P, d, name === 'muzzle' ? { muzzle: o.item?.length ?? 0 } : {})[name],
      };
    },
  },
  kiosk: {
    clip: (L, name) => L.mods.kiosk.clips(() => 0.5, [name])[name],
    clipNames: (L) => [...L.mods.kiosk.POSES],
    stage(L, o) {
      const K = L.mods.kiosk, kind = o.kind ?? L.rig.body.kinds[0];
      const F = K.frame(o.pose.name, o.t, { ...o.body, ...o.m }, { shape: kind.name, arms: true, frame: Math.floor(o.t * o.pose.frames + 1e-6), ...o.frameOptions });
      const look = { ...o.look };
      return {
        F, P: F.P, d: F.d,
        paint(g, hooks, after, finish = {}) { const J = F.draw(g, look); if (finish.lights === false) g.outline(INK); else F.finish(g, look); return J; },
        sockets: () => F.sockets(),
        at: (name) => F.sockets()[name],
      };
    },
  },
};

// ---- drawing from a description ------------------------------------------------------------------------------------

/** One frame of a pose on a plain body: drawPose(L, pose entry, { direction, t, body, m }). Returns the Surface. */
export function drawPose(L, pose, { direction = L.rig.directions[0], t = 0, body = {}, m } = {}) {
  const g = new Surface(...L.rig.size);
  STAGES[L.id].stage(L, { direction, pose, t, body, m }).paint(g);
  return g;
}

/** The attach points of one frame of a pose: socketsOf(L, pose entry, { direction, t, ask }). `ask` names a socket that is only given when asked for. */
export function socketsOf(L, pose, { direction = L.rig.directions[0], t = 0, ask } = {}) {
  const item = ask ? { length: 8, back: 1, pad: 1 } : null;
  return STAGES[L.id].stage(L, { direction, pose, t, item }).sockets(ask);
}

/**
 * Draws one entry of a description on a plain body and returns the Surface: a part, a held kind, a hair style, a body
 * kind, an effect, a manner or a stance. section: 'parts' | 'held' | 'hair' | 'body' | 'effects' | 'manners' | 'stances'.
 * o: { direction, options (over the entry's defaults), body (the proportion controls), scale (a held kind's length
 * setting), action (a pose name; default the first pose, or what the entry's shownWith says), t, bare: true for the
 * same frame without the entry (what a test compares with), most: true for every range at its largest }.
 */
export function drawEntry(L, section, e, o = {}) {
  const { rig } = L, stage = STAGES[L.id].stage, args = ARGS[L.id];
  const direction = o.direction ?? rig.directions[0], bare = !!o.bare, sw = e.shownWith ?? {};
  const opts = { ...defaultsOf(e.options), ...e.fixed, ...(o.most ? largestOf(e.options) : {}), ...o.options };
  const g = new Surface(...rig.size);
  const pose = poseNamed(rig, o.action ?? sw.pose ?? rig.poses[0].name), t = o.t ?? sw.t ?? 0;

  // drawn from a definition by one call (rigs/humanoid-figure.js): fn(g, clip, t, definition)
  if (e.via?.def) {
    const def = merge({ look: { skin: NEUTRAL.skin, top: NEUTRAL.top, bottom: NEUTRAL.bottom, boots: NEUTRAL.boots }, hair: { style: NEUTRAL.hairStyle, colour: NEUTRAL.hair } }, sw.def ?? {});
    if (!bare) {
      if (e.via.def === 'stance') def.stance = e.name;
      else if (e.via.def === 'moves') def.moves = { ...def.moves, [e.via.clip]: e.name };
      else def[e.via.def] = { kind: e.name, ...(section === 'held' ? { length: o.scale ?? e.length.default } : {}), ...opts };
    }
    if (o.body) def.body = o.body;
    resolve(L, e.fn)(g, e.via.clip ?? pose.name, t, def);
    return g;
  }

  // what else is held or worn while it is shown
  const held = section === 'held' ? e : sw.held ? heldNamed(rig, sw.held) : null;
  const scale = o.scale ?? (o.most ? held?.length.max : held?.length.default);
  // the size is given to the frame even for the bare picture of a held kind, so both are the same pose and differ only by the thing drawn
  const item = held ? heldSize(L, held, scale) : null;
  const base = {
    direction, pose, t, body: o.body, item, carry: sw.carry ?? held?.carry, look: { ...e.look, ...(section === 'hair' && e.via?.look ? (bare ? e.via.bare : e.via.look) : {}) },
    set: sw.set, manners: sw.manners?.map((n) => resolve(L, n)),
    // a function that poses the body for the entry: fn(P, pose name, t), changing P in place (humanoid.shieldPose)
    posers: sw.posedBy && !bare ? [(P, name, u) => call(L, { name: e.name, ...sw.posedBy }, { P, name, t: u }, ['P', 'name', 't'])] : undefined,
    rise: e.rise && !bare ? () => number(L, e.rise, { options: opts }) : undefined,
    reach: e.reach && !bare ? (d) => number(L, e.reach, { options: opts, d }) : undefined,
  };
  if (section === 'body' && rig.body.kinds.includes(e)) base.kind = e;

  if (L.id === 'kiosk') {
    // a kiosk has no hooks: what it wears and holds are options of its frame
    const frameOptions = { ...sw.frameOptions };
    if (e.via?.option && !bare) frameOptions[e.via.option] = e.via.value === undefined ? { kind: e.name, size: section === 'held' ? scale : opts.size } : e.via.value;
    else if (e.via?.option && bare && e.via.bare !== undefined) frameOptions[e.via.option] = e.via.bare;
    if (section === 'body' && e.option) frameOptions[e.option] = o.options?.[e.option] ?? e.choices[0];
    stage(L, { ...base, frameOptions, look: e.look }).paint(g, null, null, { ...sw.finish, ...(bare ? e.via?.bareFinish : e.via?.finish) });
    return g;
  }

  // a manner is a function (P, F, t) laid over the pose, or one made by calling the function named with `make`
  if (section === 'manners' && !bare) base.manners = [e.make ? resolve(L, e.fn)(...e.make) : resolve(L, e.fn)];

  const st = stage(L, base), hooks = {}, finish = { ...sw.finish, ...(bare ? e.via?.bareFinish : e.via?.finish) };
  let after;
  if (!bare && e.fn && !e.via?.look && !e.via?.finish && section !== 'body' && section !== 'manners') {
    const layers = [].concat(e.layers ?? e.layer).map((l) => (typeof l === 'string' ? { layer: l } : l));
    for (const lay of layers) {
      const run = (gg, J, P, d) => {
        const at = e.at?.fn ? call(L, { name: e.name, ...e.at }, { J, P, d, length: item?.length, options: opts }, []) : e.at?.joint ? { x: J[e.at.joint][0] + (e.at.dx ?? 0), y: J[e.at.joint][1] + (e.at.dy ?? 0) } : e.socket ? st.at(e.socket, J) : undefined;
        const ctx = { g: gg, J, P, d, direction, at, options: { ...opts, ...lay.set }, t, poseAt: st.poseAt, length: item?.length, name: e.name };
        if (section === 'held') ctx.item = { kind: e.kind ?? e.name, length: item.length, ...opts };
        return call(L, e, ctx, section === 'held' ? args.held : args.parts);
      };
      if (lay.layer === 'after') after = run; else hooks[lay.layer] = run;
    }
  }
  // what is held while a part or an effect is shown is drawn too, so the frame is the one a sprite would make
  if (held && section !== 'held' && item) hooks[held.layer] ??= (gg, J, P, d) => call(L, held, { g: gg, J, P, d, direction, at: st.at(held.socket, J), item: { kind: held.kind ?? held.name, length: item.length, ...defaultsOf(held.options) } }, args.held);
  st.paint(g, hooks, after, finish);
  return g;
}

/** The size { length, back, pad, ... } of a held kind at a length setting, from the size function its entry names. */
export function heldSize(L, held, scale = held.length.default) {
  if (!held.size) return { length: scale, back: 0, pad: 1 };
  return resolve(L, held.size)(held.sizeName ?? held.name, scale);
}

// ---- the table -------------------------------------------------------------------------------------------------------

const optionText = (options = {}) => Object.entries(options).map(([k, o]) => ('min' in o ? `${k} ${o.min}..${o.max} (${o.default})` : o.choices ? `${k} ${o.choices.join('|')}` : k)).join(', ');
const layerText = (e) => [].concat(e.layers ?? e.layer ?? []).map((l) => l?.layer ?? l).join('+');

function grid(head, rows) {
  const all = [head, ...rows].map((r) => r.map((c) => String(c ?? '')));
  const w = head.map((_, i) => Math.min(60, Math.max(...all.map((r) => r[i].length))));
  const line = (r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(w[i]))).join('  ').replace(/\s+$/, '');
  return [line(all[0]), line(w.map((n) => '-'.repeat(n))), ...all.slice(1).map(line)];
}

/** A rig's description as text to read: what it is, then a table each for poses, body, hair, parts, held kinds, sockets, manners and stances, and what overlaps. */
export function table(rig) {
  const out = [];
  const short = (s, n = 110) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
  out.push(`${rig.id}: ${rig.name}`, short(rig.about, 300), '');
  out.push(`modules      ${Object.entries(rig.modules).map(([k, f]) => `${k} = ${f}`).join(', ')}`);
  out.push(`view         ${rig.view}; frame ${rig.size.join(' x ')}; pivot ${rig.pivot.join(', ')}; ground row ${rig.ground}; directions: ${rig.directions.join(', ')}`);
  out.push(`layers       ${rig.layers.map((l) => l.name).join(' > ') || '(none: one fixed drawing order)'}`);
  out.push(`counts       ${rig.poses.length} poses, ${rig.parts.length} parts, ${rig.held.length} held kinds, ${rig.hair.length} hair styles, ${rig.body.kinds.length} body kinds, ${rig.sockets.length} sockets, ${rig.effects.length} effects`, '');
  out.push('FRAMES (the ways to build one posed frame)', ...grid(['function', 'what it adds'], rig.frames.map((f) => [f.fn, short(f.what)])), '');
  out.push('POSES', ...grid(['pose', 'frames', 'fps', 'loop', 'directions', 'standard for', 'function', 'options'],
    rig.poses.map((p) => [p.name, p.frames, p.fps, p.loop ? 'loop' : 'once', p.directions.join(' '), p.standardFor.join(', ') || '-', p.fn, optionText(p.options) || '-'])), '');
  if (rig.carries?.length) out.push('CARRIES (how a held thing rests)', ...grid(['carry', 'for'], rig.carries.map((c) => [c.name, short(c.what)])), '');
  if (rig.manners?.length) out.push('MANNERS (a way of moving laid over a pose)', ...grid(['manner', 'acts on', 'function', 'what'], rig.manners.map((m) => [m.name, m.appliesTo.join(', '), m.fn, short(m.what, 90)])), '');
  if (rig.stances?.length) out.push('STANCES (how the body is carried in every clip)', ...grid(['stance', 'function', 'what'], rig.stances.map((m) => [m.name, m.fn, short(m.what, 90)])), '');
  out.push('BODY', `painted by ${rig.body.fn}, measured by ${rig.body.dims}`,
    ...grid(['control', 'range', 'what'], Object.entries(rig.body.controls).map(([k, o]) => [k, `${o.min}..${o.max} (${o.default})`, short(o.what ?? '')])),
    ...grid(['body kind', 'function', 'what'], rig.body.kinds.map((k) => [k.name, k.fn ?? rig.body.fn, short(k.what, 90)])),
    ...(rig.body.features ?? []).map((f) => `${f.name}: ${f.choices.join(', ')}`), '');
  if (rig.hair.length) out.push('HAIR', ...grid(['style', 'shows', 'function', 'what'], rig.hair.map((h) => [h.name, h.directions.join(' ') || '-', h.fn, short(h.what, 90)])), '');
  out.push('PARTS (what it can wear)', ...grid(['part', 'layer', 'socket', 'shows', 'function', 'options'],
    rig.parts.map((p) => [p.name + (p.duplicateOf ? ' *' : ''), layerText(p), p.socket, p.directions.join(' '), p.fn, optionText(p.options) || '-'])), '');
  out.push('HELD (what it can hold)', ...grid(['kind', 'length px', 'setting', 'back', 'pad', 'carry', 'socket', 'shows', 'function', 'clips'],
    rig.held.map((h) => [h.name + (h.sameAs ? ' *' : ''), h.px?.length ?? '-', `${h.length.min}..${h.length.max}`, h.px?.back ?? '-', h.px?.pad ?? '-', h.carry ?? '-', h.socket, h.directions.join(' '), h.fn, (h.clips ?? []).join(' ') || '-'])), '');
  out.push('EFFECTS (light, drawn after the outline)', ...grid(['effect', 'function', 'when'], rig.effects.map((f) => [f.name, f.fn, short(f.what, 100)])), '');
  out.push('SOCKETS', ...grid(['socket', 'what'], rig.sockets.map((s) => [s.name, short(s.what + (s.when ? ` (${s.when})` : ''), 120)])), '');
  const rest = { ...rig.helpers, ...rig.drawingHelpers, ...rig.mannerTools };
  out.push(`OTHER EXPORTS (${Object.keys(rest).length})`, ...grid(['export', 'what it is for'], Object.entries(rest).map(([k, v]) => [k, short(v, 120)])), '');
  out.push(`OVERLAPS to merge (${rig.duplicates.length})`);
  rig.duplicates.forEach((d, i) => out.push(`${String(i + 1).padStart(2)}. ${short(d.what, 200)}`, `    calls: ${short(d.calls.join(', '), 330)}`, `    merge: ${short(d.merge, 300)}`));
  out.push('', `STILL DRAWN IN SPRITE FILES (${rig.inSprites.length})`);
  for (const s of rig.inSprites) out.push(`    sprites/${s.sprite}.js  ${s.functions.join(', ')}: ${short(s.draws, 150)}`);
  out.push('', '* = the same thing exists under another name: see OVERLAPS');
  return out.join('\n');
}

// ---- the contact sheets ------------------------------------------------------------------------------------------------

// a 3 x 5 letter face for the row labels: five rows of three bits per glyph
const GLYPHS = Object.fromEntries(Object.entries({
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011',
  H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101',
  O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100110101010',
  7: '111001010010010', 8: '010101010101010', 9: '010101011001110', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000', '(': '001010010010001',
  ')': '100010010010100', '/': '001001010100100', '=': '000111000111000', '+': '000010111010000', ',': '000000000010100', _: '000000000000111',
}).map(([k, bits]) => [k, bits]));

function sheetRows(L, name, match) {
  const { rig } = L, rows = [];
  for (const e of rig[name]) {
    const kindKey = name === 'parts' ? choicesOf(e).find(([k]) => k === 'kind' || k === 'style') : null;
    const variants = kindKey ? kindKey[1].map((v) => ({ label: `${e.name}: ${v}`, options: { [kindKey[0]]: v } })) : [{ label: e.name, options: {} }];
    const ways = name === 'held' ? [e, ...(e.also ?? []).filter((a) => a.fn).map((a) => ({ ...e, ...a, also: undefined, label: `${a.name} (${a.fn.split('.')[0]})` }))] : [e];
    for (const way of ways) for (const v of variants) {
      const label = way.label ?? v.label;
      if (match && !label.includes(match)) continue;
      const shot = (o) => rig.directions.map((direction) => drawEntry(L, name, way, { direction, options: v.options, ...o }));
      const use = name === 'held' ? (way.clips ?? []).find((c) => !['idle', 'walk', 'run', 'talk'].includes(c)) : null;
      rows.push({ name: e.name, label, cells: shot({}), most: shot({ most: true }), use: use ? rig.directions.map((direction) => (poseNamed(rig, use).directions.includes(direction) ? drawEntry(L, name, way, { direction, action: use, t: 3 / 7 }) : null)) : null, useName: use, shows: way.directions });
    }
  }
  return rows;
}

function compose(L, title, rows, scale, perBlock) {
  const [fw, fh] = L.rig.size, n = L.rig.directions.length, sets = rows.some((r) => r.use) ? 3 : 2;
  const fs2 = Math.max(1, Math.round(scale / 2)) + (scale >= 3 ? 1 : 0), cw = 4 * fs2, labelW = 26 * cw, gap = 6;
  const cellW = fw * scale, cellH = fh * scale, head = 9 * fs2 + 4;
  const blockW = labelW + sets * (n * cellW + gap), blocks = Math.ceil(rows.length / perBlock);
  const W = blocks * blockW + gap, H = head + Math.min(rows.length, perBlock) * cellH + head;
  const out = new Uint8ClampedArray(W * H * 4);
  const px = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const o = (y * W + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; };
  for (let i = 0; i < W * H; i++) { out[i * 4] = 0x2a; out[i * 4 + 1] = 0x2f; out[i * 4 + 2] = 0x3d; out[i * 4 + 3] = 255; }
  const text = (s, x, y, c = [0xf0, 0xea, 0xd8]) => {
    let cx = x;
    for (const ch of String(s).toUpperCase()) {
      const bits = GLYPHS[ch];
      if (bits) for (let i = 0; i < 15; i++) if (bits[i] === '1') for (let a = 0; a < fs2; a++) for (let b = 0; b < fs2; b++) px(cx + (i % 3) * fs2 + a, y + Math.floor(i / 3) * fs2 + b, c);
      cx += cw;
    }
  };
  const BG = [[0x8b, 0x93, 0xa7], [0x7c, 0x84, 0x99]], DIM = [[0x5a, 0x60, 0x70], [0x52, 0x58, 0x68]];
  const cell = (g, x0, y0, k, dim) => {
    const bytes = g ? g.bytes() : null;
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) {
      let c = (dim ? DIM : BG)[k % 2];
      if (bytes) { const i = (Math.floor(y / scale) * fw + Math.floor(x / scale)) * 4; if (bytes[i + 3]) c = [bytes[i], bytes[i + 1], bytes[i + 2]]; }
      px(x0 + x, y0 + y, c);
    }
  };
  rows.forEach((r, i) => {
    const b = Math.floor(i / perBlock), row = i % perBlock, x0 = gap + b * blockW, y0 = head + row * cellH;
    if (row === 0) {
      text(title, x0, 2, [0x5f, 0xe0, 0xf0]);
      ['standard', 'largest', 'in use'].slice(0, sets).forEach((s, k) => { const full = `${s}: ${L.rig.directions.join(' ')}`; text(full.length * cw <= n * cellW ? full : s.slice(0, Math.floor(n * cellW / cw)), x0 + labelW + k * (n * cellW + gap), 2, [0xc2, 0xc9, 0xd6]); });
    }
    // the label, wrapped at 25 letters
    const words = r.label.split(' '), lines = [''];
    for (const w of words) { if ((lines.at(-1) + ' ' + w).trim().length > 25) lines.push(w); else lines[lines.length - 1] = (lines.at(-1) + ' ' + w).trim(); }
    if (r.useName) lines.push(`(in use: ${r.useName})`);
    lines.forEach((l, k) => text(l, x0, y0 + 4 + k * 7 * fs2));
    [r.cells, r.most, r.use].slice(0, sets).forEach((set, k) => { if (set) set.forEach((g, j) => cell(g, x0 + labelW + k * (n * cellW + gap) + j * cellW, y0, i + j + k, !g || !r.shows.includes(L.rig.directions[j]))); });
  });
  return { png: encodePNG(W, H, out), width: W, height: H };
}

/**
 * The contact sheets of a rig: { parts, held }, each { rows: [{ name, label, cells (one Surface per direction), most, use }], png, width, height }.
 * o: { scale (pixels per pixel, default 2), match (only rows whose label has this text), perBlock (rows before the sheet starts a new column, default 14) }.
 * A cell is greyed when the description says the part does not show in that direction.
 */
export function sheets(L, { scale = 2, match = '', perBlock = 14 } = {}) {
  const out = {};
  for (const name of ['parts', 'held']) {
    const rows = sheetRows(L, name, match);
    out[name] = { rows, ...compose(L, `${L.id} ${name}`, rows.length ? rows : [{ label: '(none)', cells: [], most: [], shows: [] }], scale, perBlock) };
  }
  return out;
}

// ---- command line ------------------------------------------------------------------------------------------------------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
  const valued = ['scale', 'out', 'match', 'pages'];
  const id = args.find((a, i) => !a.startsWith('--') && !valued.includes(args[i - 1]?.slice(2)));
  if (!id) {
    console.log(`Rigs that describe themselves: ${RIG_IDS.join(', ')}\n  node tools/rig.mjs <rig>           its poses, parts and held kinds as tables\n  node tools/rig.mjs <rig> --sheet   contact sheets of every part and held kind`);
  } else if (!RIG_IDS.includes(id)) {
    console.error(`No rig "${id}" describes itself. There are: ${RIG_IDS.join(', ')}`);
    process.exit(1);
  } else {
    const L = await loadRig(id);
    if (!args.includes('--sheet')) console.log(table(L.rig));
    else {
      const dir = path.resolve(flag('out', path.join(ROOT, 'out'))), scale = Number(flag('scale', 2)), pages = Number(flag('pages', 0));
      fs.mkdirSync(dir, { recursive: true });
      const made = sheets(L, { scale, match: flag('match', '') });
      for (const [name, s] of Object.entries(made)) {
        const file = path.join(dir, `rig-${id}-${name}.png`);
        fs.writeFileSync(file, s.png);
        console.log(`${file}  ${s.rows.length} rows, ${s.width} x ${s.height}`);
        if (pages > 0) for (let i = 0, n = 1; i < s.rows.length; i += pages, n++) {
          const page = compose(L, `${id} ${name} ${n}`, s.rows.slice(i, i + pages), scale, pages), f = path.join(dir, `rig-${id}-${name}-${n}.png`);
          fs.writeFileSync(f, page.png);
          console.log(`${f}  rows ${i + 1} to ${Math.min(i + pages, s.rows.length)}: ${s.rows.slice(i, i + pages).map((r) => r.label).join(', ')}`);
        }
      }
    }
  }
}
