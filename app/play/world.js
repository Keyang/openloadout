// Playground: the scene itself. The player walks, jumps, collects and hits; creatures move by
// themselves; pickups, props and effects stand and play their clips. step() moves everything on
// by a short time and returns what happened (sounds to play, things collected or hit).
// Everything here works from plain data (kinds.js), so it runs in Node for the unit tests.
import { pickClip, lookupClip, actionOf, nextInOrder } from './clips.js';
import { createAnim, advance, seek, restOf, cuesAt } from './anim.js';
import { supportAt, surfaceBelow, solidAt, hitsWall } from './level.js';
import { rng } from '../../engine/motion.js';

export const GRAVITY = 900;      // pixels a second, each second
export const JUMP_V = 380;       // take-off speed: about 80 pixels high (two and a half tiles), 0.84 seconds in the air
const MIN_WALK = 24, MIN_RUN = 56, DASH = 120;
const CLIMB = 8;                 // the player walks up anything this low (a slope); higher is a wall
const REACH = 20;                // how far in front of its body the player's action reaches
const WANDER = 40;               // how far a creature strays from where it was put
const RESPAWN = 6;               // seconds before a collected pickup comes back
const START_COUNT = { pickup: 3, creature: 1, npc: 1, prop: 1, effect: 1 };
const SPOT_OF = { pickup: 'pickup', creature: 'mover', npc: 'mover', prop: 'prop', effect: 'prop' };
const DIR_V = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sign = (v) => (v < 0 ? -1 : 1);

/**
 * A scene. kinds: what kinds.js built for each bag item, in bag order. player: the key of the kind
 * the visitor controls, or null. Things of every other kind are put on the level's spots.
 */
export function createWorld({ mode, level, kinds, player = null, seed = 1 }) {
  const byKey = Object.fromEntries(kinds.map((k) => [k.key, k]));
  const world = {
    mode, level, seed, kinds: byKey, order: kinds.map((k) => k.key),
    playerKey: player && byKey[player] ? player : null,
    projectile: kinds.find((k) => k.role === 'projectile')?.key ?? null,
    burst: kinds.find((k) => k.role === 'effect' && k.clips.burst)?.key ?? null,     // plays where a hit lands
    things: [], player: null, collected: 0, collectedBy: {}, time: 0,
  };
  resetWorld(world);
  return world;
}

/** Put everything back where it started. */
export function resetWorld(world) {
  world.things = []; world.collected = 0; world.collectedBy = {}; world.time = 0;
  world.next = 1; world.used = { pickup: 0, prop: 0, mover: 0 };
  world.rand = rng(world.seed);
  world.prev = {};
  world.player = null;
  if (world.playerKey) {
    const p = makeThing(world, world.kinds[world.playerKey], world.level.start.x, world.level.start.y);
    p.role = 'player';
    world.player = p;
    revive(world, p);
  }
  const scene = world.order.map((key) => world.kinds[key]).filter((k) => k.key !== world.playerKey && START_COUNT[k.role]);
  for (let i = 0; i < 3; i++) for (const k of scene) if (i < START_COUNT[k.role]) place(world, k);
}

/** The player at the start, in full health. */
function revive(world, p) {
  const k = world.kinds[p.kind];
  Object.assign(p, {
    x: world.level.start.x, y: world.level.start.y, vx: 0, vy: 0, knock: 0, onGround: true, state: 'idle', busy: null,
    jumped: false, airborne: false, invuln: 0, hp: k.hp, facing: 1, dir: world.mode === 'top' ? 'down' : 'right',
  });
  p.anim = null;
  setAnim(p, pickClip(k.clipNames, 'idle', ctxOf(world, p, k)));
}

function makeThing(world, kind, x, y) {
  return {
    n: world.next++, kind: kind.key, role: kind.role, x, y, vx: 0, vy: 0, lift: kind.lift,
    facing: 1, dir: 'down', onGround: true, state: 'rest', anim: createAnim(kind.rest),
    home: { x, y }, hits: 0, timer: 0, cool: 0, flash: 0, knock: 0,
  };
}

/** Put one more thing of a kind on the next free spot. */
function place(world, kind, at = null) {
  const cat = SPOT_OF[kind.role];
  if (!cat) return null;
  const { level } = world, list = level.spots[cat];
  let spot = at;
  if (!spot) {
    const i = world.used[cat]++, lap = Math.floor(i / list.length);
    spot = { ...list[i % list.length] };
    if (lap) {
      // more things than spots: step sideways from a spot already used
      const x = spot.x + lap * 26;
      if (level.mode === 'top' ? !hitsWall(level, x - 8, spot.y - 8, x + 8, spot.y) : Math.abs(surfaceBelow(level, x, spot.y - 4).y - spot.y) < 1) spot.x = x;
    }
    if (level.mode === 'top') {
      // big things (a house, a tree) take the first spot where they stand clear of the walls, of the player and of
      // what is already there
      const at = (s) => ({ x0: s.x - kind.box.l, x1: s.x + kind.box.r, y0: s.y - kind.lift - kind.box.t, y1: s.y - kind.lift + kind.box.b });
      const fits = (s) => !hitsWall(level, s.x - kind.box.l, s.y - Math.min(kind.box.t, 16), s.x + kind.box.r, s.y)
        && ![...world.things, ...(world.player ? [world.player] : [])].some((t) => overlap(grow(rectOf(world, t), 6), at(s)));
      for (let k = 0; k < list.length && !fits(spot); k++) spot = { ...list[(i + 1 + k) % list.length] };
    }
    if (level.mode === 'side') {
      // wide things (a boss, a house) move along until they stand clear of what is already there
      const span = supportAt(level, spot.x, spot.y);
      const clash = (x) => world.things.some((t) => Math.abs(t.y - spot.y) < 1 && SPOT_OF[t.role] === cat && x - kind.box.l < t.x + world.kinds[t.kind].box.r + 4 && x + kind.box.r > t.x - world.kinds[t.kind].box.l - 4);
      for (let n = 0; n < 40 && clash(spot.x) && spot.x + 8 + kind.box.r < span.x1; n++) spot.x += 8;
    }
  }
  const t = makeThing(world, kind, spot.x, spot.y);
  if (kind.role === 'creature' || kind.role === 'npc') {
    t.state = 'idle'; t.timer = 0.3 + world.rand() * 0.9;
    t.facing = world.rand() < 0.5 ? -1 : 1;
    if (level.mode === 'side') { const s = supportAt(level, t.x, t.y - 4); t.span = { x0: s.x0, x1: s.x1 }; t.y = t.home.y = s.y; }
    setAnim(t, pickClip(kind.clipNames, 'idle', ctxOf(world, t, kind)));
  }
  world.things.push(t);
  return t;
}

/**
 * Add one more of something (the visitor's "add one"). It appears near the player so it can be seen.
 * Returns the new thing, or null for a kind there cannot be more of (the player, tiles, sounds).
 */
export function spawn(world, key) {
  const kind = world.kinds[key];
  if (!kind || key === world.playerKey || !SPOT_OF[kind.role]) return null;
  const p = world.player, { level } = world;
  if (!p) return place(world, kind);
  const n = countOf(world, key);
  if (level.mode === 'top') {
    for (let i = 0; i < 8; i++) {
      const a = ((n + i) % 8) * (Math.PI / 4), x = Math.round(p.x + Math.cos(a) * 52), y = Math.round(p.y + Math.sin(a) * 44);
      if (!hitsWall(level, x - 10, y - 16, x + 10, y)) return place(world, kind, { x, y });
    }
    return place(world, kind);
  }
  const x = clamp(Math.round(p.x + p.facing * (56 + (n % 3) * 24)), 16, level.width - 16);
  return place(world, kind, { x, y: surfaceBelow(level, x, Math.min(p.y, level.groundY) - 40).y });
}

/** Take one away (the newest). False when there is none. */
export function removeOne(world, key) {
  for (let i = world.things.length - 1; i >= 0; i--) {
    if (world.things[i].kind === key && !world.things[i].passing) { world.things.splice(i, 1); return true; }
  }
  return false;
}

/** How many things of a kind are in the scene (projectiles in flight and bursts do not count). */
export const countOf = (world, key) => world.things.filter((t) => t.kind === key && !t.passing).length;

// ---- helpers ---------------------------------------------------------------------------

const ctxOf = (world, t, k) => ({ mode: world.mode, dir: t.dir, facing: t.facing, preview: k.preview, view: k.view });

function setAnim(thing, sel, { restart = false, start = 0, rate = 1 } = {}) {
  const a = thing.anim;
  if (a && !restart && a.clip === sel.clip && a.hold === !!sel.hold) { a.flip = !!sel.flip; a.rate = rate; return; }
  thing.anim = createAnim(sel.clip, { flip: !!sel.flip, hold: !!sel.hold, start, rate });
}

function fire(world, thing, frames, ev) {
  const k = world.kinds[thing.kind];
  for (const cue of cuesAt(k.cues[thing.anim.clip], frames)) ev.push({ type: 'sound', sound: cue.sound, cue, kind: k.key, thing: thing.n, clip: thing.anim.clip });
}

/** Move a thing's clip on and report the sounds on the frames it reached. Returns those frames. */
function tick(world, thing, dt, ev) {
  const frames = advance(thing.anim, world.kinds[thing.kind].clips[thing.anim.clip], dt);
  fire(world, thing, frames, ev);
  return frames;
}

/** True when the clip has played through once (a looping clip: one pass). */
function played(world, thing, passes = 1) {
  const info = world.kinds[thing.kind].clips[thing.anim.clip];
  return info.loop ? thing.anim.time * info.fps >= info.frames * passes : thing.anim.done;
}

/** A thing's body in the scene: { x0, y0, x1, y1 }. */
export function rectOf(world, t) {
  const b = world.kinds[t.kind].box, y = t.y - t.lift;
  return { x0: t.x - b.l, x1: t.x + b.r, y0: y - b.t, y1: y + b.b };
}
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const grow = (r, by) => ({ x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by });

/** Keep a top-down thing out of the walls: try the move one axis at a time. Returns true when it moved at all. */
function walk(level, t, dx, dy, half) {
  let moved = false;
  if (dx && !hitsWall(level, t.x + dx - half, t.y - 6, t.x + dx + half, t.y)) { t.x += dx; moved = true; }
  if (dy && !hitsWall(level, t.x - half, t.y + dy - 6, t.x + half, t.y + dy)) { t.y += dy; moved = true; }
  return moved;
}
const halfOf = (k) => Math.max(2, Math.min(7, k.box.l, k.box.r));

// ---- one step ----------------------------------------------------------------------------

/**
 * Move the scene on by dt seconds.
 * input: held keys { left, right, up, down, jump, action, run, block, dodge }, and clip: an extra move to play once (an action name).
 * Returns events: { type: 'sound', sound, cue, kind, thing, clip } · { type: 'collect', kind, total } ·
 *   { type: 'hit', kind, thing } (the player hurt something) · { type: 'die', kind, thing } · { type: 'hurt' } (something hurt the player).
 */
export function step(world, input = {}, dt = 1 / 60) {
  const ev = [];
  dt = Math.min(Math.max(dt, 0), 0.05);
  world.time += dt;
  const edge = {};
  for (const key of ['jump', 'action', 'block', 'dodge']) { edge[key] = !!input[key] && !world.prev[key]; world.prev[key] = !!input[key]; }
  if (world.player) stepPlayer(world, world.player, input, edge, dt, ev);
  for (const t of [...world.things]) {
    if (t.flash > 0) t.flash = Math.max(0, t.flash - dt);
    if (t.passing === 'burst') { tick(world, t, dt, ev); if (played(world, t)) t.dead = true; }
    else if (t.role === 'creature' || t.role === 'npc') stepMover(world, t, dt, ev);
    else if (t.role === 'pickup') stepPickup(world, t, dt, ev);
    else if (t.role === 'projectile') stepProjectile(world, t, dt, ev);
    else stepProp(world, t, dt, ev);
  }
  world.things = world.things.filter((t) => !t.dead);
  return ev;
}

// ---- the player --------------------------------------------------------------------------

function stepPlayer(world, p, input, edge, dt, ev) {
  const k = world.kinds[p.kind], names = k.clipNames, { level } = world, top = world.mode === 'top';
  p.invuln = Math.max(0, p.invuln - dt);
  if (p.flash > 0) p.flash = Math.max(0, p.flash - dt);

  // out of health: the die clip, a pause on its last frame, then back to the start
  if (p.busy?.type === 'die') {
    p.state = 'die';
    if (p.busy.clip) tick(world, p, dt, ev);
    if (!p.busy.clip || p.anim.done) { p.busy.wait -= dt; if (p.busy.wait <= 0) { revive(world, p); p.invuln = 1.5; } }
    if (!top && !p.onGround) fall(world, p, k, p.x, dt);
    return;
  }

  const held = p.busy?.type === 'block' || (p.busy?.type === 'hurt' && Math.abs(p.knock) > 20);
  let mx = held ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = top && !held ? (input.down ? 1 : 0) - (input.up ? 1 : 0) : 0;
  if (mx) p.facing = mx;
  if (top) {
    const pressed = [];
    if (my) pressed.push(my > 0 ? 'down' : 'up');
    if (mx) pressed.push(mx > 0 ? 'right' : 'left');
    if (pressed.length && !pressed.includes(p.dir)) p.dir = pressed[pressed.length - 1];
  } else p.dir = p.facing < 0 ? 'left' : 'right';
  const ctx = ctxOf(world, p, k);
  const moving = !!(mx || my), running = !!input.run;

  // how fast: the walk or run clip says how far it carries the sprite, so feet do not slide
  const moveSel = pickClip(names, running ? 'run' : 'walk', ctx);
  const natural = Math.max(k.clips[moveSel.clip].speed, MIN_WALK);
  let speed = running ? Math.max(natural, MIN_RUN) : natural;
  const rate = clamp(speed / natural, 1, 1.6);          // no run clip: the walk clip plays faster

  // ---- start an action, a block, a dodge or an extra move
  const begin = (type, sel, more = {}) => { setAnim(p, sel, { restart: true }); p.busy = { type, ...more }; p.airborne = false; };
  if (edge.action && p.busy?.type !== 'action') {
    const sel = pickClip(names, 'action', ctx);
    if (sel) begin('action', sel, { hitFrame: k.clips[sel.clip].hitFrame, hit: false });
    else { p.busy = { type: 'action', timer: 0.3, hit: true }; strike(world, p, ev); }
  } else if (edge.block && !p.busy && pickClip(names, 'block', ctx)) begin('block', pickClip(names, 'block', ctx));
  else if (edge.dodge && !p.busy && pickClip(names, 'dodge', ctx)) begin('dodge', pickClip(names, 'dodge', ctx));
  else if (input.clip && !p.busy) {
    const sel = lookupClip(names, input.clip, ctx);
    if (sel) begin('extra', sel, { passes: 2 });
  }
  if (p.busy?.type === 'dodge') {
    // a dash the way it faces
    speed = Math.max(k.clips[p.anim.clip].speed, DASH);
    [mx, my] = top ? DIR_V[p.dir] : [p.facing, 0];
  }

  // ---- move
  let landed = false;
  const kx = p.knock;
  if (p.knock) { p.knock *= Math.pow(0.02, dt); if (Math.abs(p.knock) < 6) p.knock = 0; }
  if (top) {
    const norm = mx && my ? Math.SQRT1_2 : 1;
    walk(level, p, (mx * speed * norm + kx) * dt, my * speed * norm * dt, halfOf(k));
  } else {
    if (edge.jump && p.onGround && !p.busy) { p.vy = -JUMP_V; p.onGround = false; p.jumped = true; }
    const dx = (mx * speed + kx) * dt;
    let nx = clamp(p.x + dx, k.box.l, level.width - k.box.r);
    if (p.onGround) {
      // a slope is walked up; anything higher than that is a wall
      if (dx && solidAt(level, nx + sign(dx) * halfOf(k), p.y - CLIMB - 1)) nx = p.x;
      const s = surfaceBelow(level, nx, p.y - CLIMB);
      p.x = nx;
      if (s.y <= p.y + CLIMB) p.y = s.y;
      else { p.onGround = false; p.vy = 0; p.jumped = false; }        // walked off an edge
    } else landed = fall(world, p, k, nx, dt);
  }

  // ---- a jump clip that was cut short by the landing plays out its last sounds (the landing step)
  if (landed && p.airborne) fire(world, p, restOf(p.anim, k.clips[p.anim.clip]), ev);
  if (p.onGround) p.airborne = false;

  // ---- animate
  if (p.busy) {
    const b = p.busy;
    if (b.timer !== undefined) { b.timer -= dt; if (b.timer <= 0) p.busy = null; }
    else {
      const frames = tick(world, p, dt, ev);
      if (b.type === 'action' && !b.hit && frames.some((f) => f >= b.hitFrame)) { b.hit = true; strike(world, p, ev); }
      if (!top) {                                       // it can still turn round in the middle of a clip
        const again = lookupClip(names, actionOf(p.anim.clip), ctx);
        if (again && again.clip === p.anim.clip) p.anim.flip = again.flip;
      }
      if (played(world, p, b.passes ?? 1)) { if (b.type === 'action' && !b.hit) strike(world, p, ev); p.busy = null; }
    }
    p.state = b.type;
    if (p.busy) return;
  }
  const state = !top && !p.onGround ? 'jump' : moving ? (running ? 'run' : 'walk') : 'idle';
  p.state = state;
  const sel = pickClip(names, state, ctx);
  const info = k.clips[sel.clip];
  if (state === 'jump' && !info.loop) {
    // a one-shot jump clip follows the jump itself: rising shows its first half, falling its second
    const progress = clamp((JUMP_V + p.vy) / (2 * JUMP_V), 0, 1);
    const f = Math.min(info.frames - 1, Math.floor(progress * info.frames));
    if (p.anim.clip !== sel.clip || !p.airborne) { setAnim(p, sel, { restart: true, start: f }); p.airborne = true; }
    p.anim.flip = sel.flip;
    fire(world, p, seek(p.anim, info, f), ev);
    return;
  }
  setAnim(p, sel, { rate: state === 'run' || state === 'walk' ? rate : 1 });
  tick(world, p, dt, ev);
}

/** Side view, in the air: move sideways to nx unless a wall is there, fall, and land. Returns true on landing. */
function fall(world, p, k, nx, dt) {
  const { level } = world;
  if (nx !== p.x && solidAt(level, nx + sign(nx - p.x) * halfOf(k), p.y - 2)) nx = p.x;
  p.x = nx;
  const before = p.y;
  p.vy += GRAVITY * dt;
  let ny = p.y + p.vy * dt;
  if (p.vy < 0) {
    if (solidAt(level, p.x, ny - k.box.t)) { p.vy = 0; ny = before; }       // bumped its head
    p.y = ny;
    return false;
  }
  const s = surfaceBelow(level, p.x, before);
  if (ny >= s.y) { p.y = s.y; p.vy = 0; p.onGround = true; return true; }
  p.y = ny;
  return false;
}

/**
 * The player's action lands: hurt the enemies in reach; else hit or change the prop in reach;
 * and fire a projectile if the bag has one.
 */
function strike(world, p, ev) {
  const k = world.kinds[p.kind], b = k.box;
  let area;
  if (world.mode === 'top') {
    const [dx, dy] = DIR_V[p.dir];
    if (dx) area = { x0: dx > 0 ? p.x : p.x - b.l - REACH, x1: dx > 0 ? p.x + b.r + REACH : p.x, y0: p.y - b.t - 4, y1: p.y + 6 };
    else area = { x0: p.x - b.l - 6, x1: p.x + b.r + 6, y0: dy > 0 ? p.y - b.t / 2 : p.y - b.t - REACH, y1: dy > 0 ? p.y + REACH + 6 : p.y };
  } else {
    area = { x0: p.facing > 0 ? p.x : p.x - b.l - REACH, x1: p.facing > 0 ? p.x + b.r + REACH : p.x, y0: p.y - b.t - 10, y1: p.y + 4 };
  }
  let any = false;
  for (const t of world.things) {
    if (!world.kinds[t.kind].hittable || t.state === 'hurt' || t.state === 'dying' || t.passing) continue;
    if (overlap(area, rectOf(world, t))) { hurtThing(world, t, p.x, ev); any = true; }
  }
  if (!any) {
    const prop = world.things.find((t) => t.role === 'prop' && !t.passing && overlap(grow(area, 4), rectOf(world, t)));
    if (prop) useProp(world, prop, ev);
  }
  if (world.projectile) shoot(world, p);
}

/** A hit lands on a creature: its hurt clip, or its die clip when it has taken enough. */
function hurtThing(world, t, fromX, ev) {
  const k = world.kinds[t.kind], ctx = ctxOf(world, t, k);
  t.hits++; t.flash = 0.35;
  t.knock = sign(t.x - fromX) * 46;
  burstAt(world, t);
  if (t.hits >= k.hp) {
    t.state = 'dying'; t.knock = 0;
    const sel = pickClip(k.clipNames, 'die', ctx);
    if (sel) { setAnim(t, sel, { restart: true }); t.timer = 1.2; } else { t.timer = 0.5; t.flash = 0.5; }   // no die clip: it blinks out
    ev.push({ type: 'hit', kind: k.key, thing: t.n }, { type: 'die', kind: k.key, thing: t.n });
    return;
  }
  t.state = 'hurt'; t.timer = 0.35;
  const sel = pickClip(k.clipNames, 'hurt', ctx);
  if (sel) setAnim(t, sel, { restart: true });
  ev.push({ type: 'hit', kind: k.key, thing: t.n });
}

/** An effect with a burst clip plays where a hit lands. */
function burstAt(world, target) {
  if (!world.burst) return;
  const kind = world.kinds[world.burst], tk = world.kinds[target.kind];
  const t = makeThing(world, kind, target.x, target.y);
  t.passing = 'burst'; t.state = 'burst';
  t.lift = target.lift + Math.round(tk.box.t / 2) - Math.round((kind.box.t - kind.box.b) / 2);
  t.anim = createAnim('burst');
  world.things.push(t);
}

function hurtPlayer(world, fromX, ev) {
  const p = world.player;
  if (!p || p.invuln > 0 || ['block', 'dodge', 'die'].includes(p.busy?.type)) return;
  const k = world.kinds[p.kind], ctx = ctxOf(world, p, k);
  p.hp--; p.invuln = 1.6; p.flash = 0.4; p.airborne = false;
  ev.push({ type: 'hurt' });
  if (p.hp <= 0) {
    const sel = pickClip(k.clipNames, 'die', ctx);
    if (sel) setAnim(p, sel, { restart: true });
    p.busy = { type: 'die', clip: !!sel, wait: sel ? 1.2 : 0.8 };
    p.knock = 0; p.state = 'die';
    ev.push({ type: 'die', kind: k.key, thing: p.n });
    return;
  }
  p.knock = sign(p.x - fromX) * 90;
  const sel = pickClip(k.clipNames, 'hurt', ctx);
  if (sel) { setAnim(p, sel, { restart: true }); p.busy = { type: 'hurt' }; } else p.busy = { type: 'hurt', timer: 0.3 };
  p.state = 'hurt';
}

/** A projectile leaves the player: from the muzzle or hand of the clip that is playing when the sprite gives one. */
function shoot(world, p) {
  const kind = world.kinds[world.projectile], pk = world.kinds[p.kind];
  const [dx, dy] = world.mode === 'top' ? DIR_V[p.dir] : [p.facing, 0];
  const from = pk.clips[p.anim.clip]?.fire;
  const mirror = p.anim.flip ? -1 : 1;
  const t = makeThing(world, kind, p.x, p.y);
  if (from && world.mode === 'top') { t.x = p.x + from.dx * mirror; t.y = p.y - from.dy + 10; t.lift = 10; }
  else if (from) { t.x = p.x + from.dx * mirror; t.lift = from.dy; }
  else { t.x = p.x + dx * (pk.box.r + 4); t.y = p.y + dy * 8; t.lift = Math.round(pk.box.t * 0.5); }
  t.role = 'projectile'; t.passing = 'shot'; t.state = 'fly';
  t.tall = pk.box.t;                          // it hits anything as tall as whoever fired it, so a small enemy is not missed
  t.vx = dx * 170; t.vy = dy * 170; t.life = 1.2;
  t.facing = dx < 0 ? -1 : 1; t.dir = p.dir;
  t.anim.flip = dx < 0;
  world.things.push(t);
}

// ---- things that move by themselves ----------------------------------------------------------

function stepMover(world, t, dt, ev) {
  const k = world.kinds[t.kind], names = k.clipNames, { level } = world, top = world.mode === 'top';
  const ctx = () => ctxOf(world, t, k);
  const rest = () => { t.state = 'idle'; t.timer = 0.4 + world.rand() * 0.6; setAnim(t, pickClip(names, 'idle', ctx())); };
  t.cool = Math.max(0, t.cool - dt);
  if (t.knock) {
    const dx = t.knock * dt;
    if (top) walk(level, t, dx, 0, halfOf(k));
    else t.x = clamp(t.x + dx, (t.span?.x0 ?? 0) + k.box.l, (t.span?.x1 ?? level.width) - k.box.r);
    t.knock *= Math.pow(0.02, dt);
    if (Math.abs(t.knock) < 6) t.knock = 0;
  }

  if (t.state === 'dying') {
    // the die clip plays, its last frame is held for a moment, then the thing is gone
    const dying = pickClip(names, 'die', ctx());
    if (dying && t.anim.clip === dying.clip) { tick(world, t, dt, ev); if (!t.anim.done) return; }
    t.timer -= dt;
    if (t.timer <= 0) t.dead = true;
    return;
  }
  if (t.state === 'hurt') {
    const hurting = pickClip(names, 'hurt', ctx());
    tick(world, t, dt, ev);
    if (hurting && t.anim.clip === hurting.clip) { if (played(world, t)) rest(); } else { t.timer -= dt; if (t.timer <= 0) rest(); }
    return;
  }
  if (t.state === 'attack') {
    const frames = tick(world, t, dt, ev);
    const p = world.player;
    if (!t.struck && frames.some((f) => f >= t.hitFrame)) {
      t.struck = true;
      if (p && overlap(grow(rectOf(world, t), 12), rectOf(world, p))) hurtPlayer(world, t.x, ev);
    }
    if (played(world, t)) { t.cool = 2.5; rest(); }
    return;
  }

  const p = world.player;
  const close = p && p.busy?.type !== 'die' && overlap(grow(rectOf(world, t), 14), rectOf(world, p));
  const face = () => {
    t.facing = p.x < t.x ? -1 : 1;
    if (top) t.dir = Math.abs(p.x - t.x) >= Math.abs(p.y - t.y) ? (p.x < t.x ? 'left' : 'right') : p.y < t.y ? 'up' : 'down';
  };
  // an enemy that is next to the player attacks it: its attack, or one of its other moves (slam, roar, ...)
  if (k.hostile && close && t.cool <= 0) {
    face();
    const options = [pickClip(names, 'action', ctx()), ...k.moves.map((m) => lookupClip(names, m, ctx()))].filter(Boolean);
    const sel = options.length ? options[Math.floor(world.rand() * options.length)] : null;
    if (sel) { t.state = 'attack'; t.struck = false; t.hitFrame = k.clips[sel.clip].hitFrame; setAnim(t, sel, { restart: true }); tick(world, t, dt, ev); return; }
    if (overlap(rectOf(world, t), rectOf(world, p))) { hurtPlayer(world, t.x, ev); t.cool = 1.5; }   // no attack clip: touching hurts
  }
  // a townsperson talks to the player while it stands close
  if (t.role === 'npc' && close) {
    face();
    const talk = pickClip(names, 'talk', ctx());
    if (talk) { t.state = 'talk'; setAnim(t, talk); tick(world, t, dt, ev); return; }
  }
  if (t.state === 'talk') rest();

  // wander: rest a moment, walk to somewhere near home, rest again
  if (t.state === 'idle') {
    t.timer -= dt;
    if (t.timer <= 0) {
      if (top) {
        const hx = t.home.x - t.x, hy = t.home.y - t.y;
        if (Math.hypot(hx, hy) > WANDER) t.dir = Math.abs(hx) > Math.abs(hy) ? (hx < 0 ? 'left' : 'right') : hy < 0 ? 'up' : 'down';
        else t.dir = ['down', 'up', 'left', 'right'][Math.floor(world.rand() * 4)];
        if (DIR_V[t.dir][0]) t.facing = DIR_V[t.dir][0];
        t.timer = 0.7 + world.rand() * 1.1; t.state = 'move';
      } else {
        const lo = Math.max((t.span?.x0 ?? 0) + k.box.l + 2, t.home.x - WANDER), hi = Math.min((t.span?.x1 ?? level.width) - k.box.r - 2, t.home.x + WANDER);
        if (hi - lo > 8) {
          t.target = t.x < (lo + hi) / 2 ? hi - world.rand() * 10 : lo + world.rand() * 10;
          t.facing = t.target < t.x ? -1 : 1; t.state = 'move';
        } else t.timer = 1;
      }
    }
  }
  if (t.state === 'move') {
    const sel = pickClip(names, 'walk', ctx());
    const v = Math.max(k.clips[sel.clip].speed, MIN_WALK * 0.8);
    if (top) {
      const [dx, dy] = DIR_V[t.dir];
      t.timer -= dt;
      if (!walk(level, t, dx * v * dt, dy * v * dt, halfOf(k)) || t.timer <= 0) { t.state = 'idle'; t.timer = 0.5 + world.rand() * 1.2; }
    } else {
      t.x += t.facing * v * dt;
      if ((t.facing > 0 && t.x >= t.target) || (t.facing < 0 && t.x <= t.target)) { t.x = t.target; t.state = 'idle'; t.timer = 0.6 + world.rand() * 1.2; }
    }
  }
  setAnim(t, pickClip(names, t.state === 'move' ? 'walk' : 'idle', ctx()));
  tick(world, t, dt, ev);
}

// ---- pickups, props, effects, projectiles -------------------------------------------------------

/** Play a resting clip: a loop loops; a one-shot clip plays again after a pause. */
function tickRest(world, t, dt, ev, pause = 1.5) {
  const k = world.kinds[t.kind];
  tick(world, t, dt, ev);
  if (!t.anim.done) return;
  t.timer -= dt;
  if (t.timer <= 0) { t.timer = pause; setAnim(t, { clip: k.rest }, { restart: true }); }
}

function stepPickup(world, t, dt, ev) {
  const k = world.kinds[t.kind], p = world.player;
  if (t.state === 'gone') {
    t.timer -= dt;
    if (t.timer <= 0) { t.state = 'rest'; setAnim(t, { clip: k.rest }, { restart: true }); }
    return;
  }
  if (t.state === 'collected') {
    tick(world, t, dt, ev);
    if (played(world, t)) { t.state = 'gone'; t.timer = RESPAWN; }
    return;
  }
  tickRest(world, t, dt, ev);
  if (p && p.busy?.type !== 'die' && overlap(rectOf(world, p), rectOf(world, t))) {
    world.collected++;
    world.collectedBy[k.key] = (world.collectedBy[k.key] ?? 0) + 1;
    ev.push({ type: 'collect', kind: k.key, thing: t.n, total: world.collected });
    const sel = pickClip(k.clipNames, 'collect');
    if (sel) { t.state = 'collected'; setAnim(t, { clip: sel.clip }, { restart: true }); tick(world, t, 0, ev); }
    else { t.state = 'gone'; t.timer = RESPAWN; }
  }
}

/**
 * A prop or an effect. A looping clip loops. A one-shot clip (a chest opening, a lever being pulled) holds its
 * last frame, which is the picture of the state that follows; when the clip after it in the file is a moving loop
 * (a torch that has caught light, a fire flaring up) it carries on into that loop by itself.
 */
function stepProp(world, t, dt, ev) {
  const k = world.kinds[t.kind];
  if (t.role === 'effect') { tickRest(world, t, dt, ev, 2); return; }
  tick(world, t, dt, ev);
  if (!t.anim.done) return;
  const next = nextInOrder(k.clipNames, t.anim.clip);
  if (next !== t.anim.clip && k.clips[next].loop && k.clips[next].frames > 1) setAnim(t, { clip: next }, { restart: true });
}

/**
 * The player acted next to a prop: it plays its next clip in file order, and after the last goes back to the
 * first (closed, open, empty · off, pull, on · idle, hurt, break).
 */
function useProp(world, t, ev) {
  const k = world.kinds[t.kind];
  t.hits++;
  if (/^(hurt|break)$/.test(nextInOrder(k.clipNames, t.anim.clip))) burstAt(world, t);
  setAnim(t, { clip: nextInOrder(k.clipNames, t.anim.clip) }, { restart: true });
  ev.push({ type: 'use', kind: k.key, thing: t.n, clip: t.anim.clip });
}

function stepProjectile(world, t, dt, ev) {
  const { level } = world, k = world.kinds[t.kind];
  tick(world, t, dt, ev);
  if (t.state === 'hit') { if (played(world, t)) t.dead = true; return; }      // its hit clip plays where it landed
  const land = () => {
    if (!k.clips.hit) { t.dead = true; return; }
    t.state = 'hit'; t.vx = 0; t.vy = 0;
    setAnim(t, { clip: 'hit', flip: t.anim.flip }, { restart: true });
  };
  t.x += t.vx * dt; t.y += t.vy * dt; t.life -= dt;
  if (t.x < 0 || t.x > level.width || t.y < 0 || t.y > level.height || t.life <= 0) { t.dead = true; return; }
  if (level.mode === 'top' ? hitsWall(level, t.x - 2, t.y - 4, t.x + 2, t.y) : solidAt(level, t.x, t.y - t.lift)) { land(); return; }
  const body = rectOf(world, t);
  const r = level.mode === 'top' ? grow(body, 5) : { x0: body.x0, x1: body.x1, y0: t.y - t.tall, y1: t.y + 2 };
  for (const o of world.things) {
    if (o === t || !world.kinds[o.kind].hittable || o.state === 'hurt' || o.state === 'dying' || o.passing) continue;
    if (overlap(r, rectOf(world, o))) { hurtThing(world, o, t.x - t.vx, ev); land(); return; }
  }
}

// ---- what the page reads -------------------------------------------------------------------------

/** The looping sounds that should be running now: one entry for each kind, clip and sound in use. */
export function activeLoops(world) {
  const out = new Map();
  for (const t of world.player ? [world.player, ...world.things] : world.things) {
    if (t.state === 'gone') continue;
    const k = world.kinds[t.kind];
    (k.cues[t.anim.clip] ?? []).forEach((cue, i) => {
      if (cue.loop) out.set(`${k.key}|${t.anim.clip}|${i}`, { id: `${k.key}|${t.anim.clip}|${i}`, kind: k.key, clip: t.anim.clip, sound: cue.sound, cue });
    });
  }
  return [...out.values()];
}

const round = (v) => Math.round(v * 100) / 100;
const view = (world, t) => ({
  n: t.n, kind: t.kind, id: world.kinds[t.kind].id, role: t.role, x: round(t.x), y: round(t.y), lift: t.lift, state: t.state,
  clip: t.anim.clip, frame: t.anim.frame, flip: t.anim.flip, hold: t.anim.hold, facing: t.facing, dir: t.dir, hits: t.hits,
});

/** The scene as plain data (the page shows it to the browser tests). */
export function snapshot(world) {
  const p = world.player;
  return {
    mode: world.mode, time: round(world.time), width: world.level.width, height: world.level.height,
    collected: world.collected, collectedBy: { ...world.collectedBy },
    player: p ? { ...view(world, p), onGround: p.onGround, vy: round(p.vy), hp: p.hp, maxHp: world.kinds[p.kind].hp } : null,
    things: world.things.map((t) => view(world, t)),
  };
}
