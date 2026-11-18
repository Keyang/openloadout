// The page's side of a sprite made on a visit (docs/architecture.md, Contract 11, "Safety of run-time assets").
// The made source runs only in a worker of its own (app/sandbox-worker.js). This file is what the page holds instead:
//
//   openSandbox(...)   the worker for one made source: start it, ask it things with a time limit, stop it.
//                      A call that runs over its limit stops the worker; the next call starts a fresh one.
//   standIn(...)       a sprite definition the page can use like any other (defineSprite made it, so every page,
//                      the bag, the playground and the exporter take it as they take a catalogue sprite), whose
//                      render() copies in pixels the worker drew. It holds no code from the made source.
//
// How frames reach the page. The worker draws whole clips at one set of settings and sends the pixels; the stand-in
// keeps them by settings. Drawing is still an ordinary call that returns at once:
//   - pixels for these settings are here: they are copied in. That is the usual case after prepare().
//   - they are not here yet: the nearest picture there is goes in instead (the last settings drawn, else the
//     defaults), the right one is asked for, and onFrames() listeners hear when it arrives so they can draw again.
// Code that draws once and keeps the result (an export, a strip of frames, the playground's painter) first waits for
// prepare(settings), or for whenReady(), which prepares the defaults and every setting the bag holds for it.
import { LIMITS } from './api-source.js';

/** An error whose message is written for whoever made the sprite. limit: true when a time limit ended the work. */
export class MadeError extends Error {
  constructor(message, { limit = false } = {}) { super(message); this.limit = limit; }
}

const seconds = (ms) => `${Math.round(ms / 1000)} seconds`;

/**
 * The worker for one made source. env: { Worker, URL, Blob } from the page; workerUrl: the address of
 * app/sandbox-worker.js; moduleText: the source with its imports already made into full addresses.
 * Returns { load(), frames({ clips, params }), check(sounds), stop(), alive() }. Every call resolves with data or
 * rejects with a MadeError; one call runs at a time, in the order asked.
 */
export function openSandbox({ env, workerUrl, moduleText, limits = LIMITS }) {
  const { Worker, URL, Blob } = env;
  const sourceUrl = URL.createObjectURL(new Blob([moduleText], { type: 'text/javascript' }));
  // started from memory, so the worker carries the page's content policy (a worker started from a file would carry none)
  const bootUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(workerUrl)};\n`], { type: 'text/javascript' }));
  let worker = null, loaded = null, next = 1, current = null, closed = false, strikes = 0;
  const waiting = [];

  function end(error) {
    if (worker) { try { worker.terminate(); } catch { /* gone already */ } }
    worker = null; loaded = null;
    if (current) { clearTimeout(current.timer); const c = current; current = null; c.reject(error); }
  }
  function start() {
    worker = new Worker(bootUrl, { type: 'module', name: 'loadout-made-sprite' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (!current || !m || m.job !== current.job) return;          // not an answer to what was asked: ignored
      clearTimeout(current.timer);
      const c = current; current = null;
      if (typeof m.error === 'string') c.reject(new MadeError(m.error)); else c.resolve(m.result);
      pump();
    };
    worker.onerror = (e) => { e.preventDefault?.(); end(new MadeError('The worker a made sprite runs in could not start in this browser.')); pump(); };
  }
  function pump() {
    if (current || !waiting.length) return;
    if (closed) { for (const w of waiting.splice(0)) w.reject(new MadeError('This sprite has been stopped.')); return; }
    const w = waiting.shift();
    if (!worker) { try { start(); } catch { w.reject(new MadeError('The worker a made sprite runs in could not start in this browser.')); return pump(); } }
    const job = next++;
    current = { job, resolve: w.resolve, reject: w.reject };
    current.timer = setTimeout(() => {
      // over its limit: the worker is stopped where it stands. The next call starts a fresh one.
      strikes++;
      end(new MadeError(w.late, { limit: true }));
      pump();
    }, w.ms);
    worker.postMessage({ job, ...w.message });
  }
  const ask = (message, ms, late) => new Promise((resolve, reject) => { waiting.push({ message, ms, late, resolve, reject }); pump(); });

  /** The source is read once per worker; after a stop, the next call reads it again in a fresh worker. */
  function load() {
    if (!loaded || !worker) {
      loaded = ask({ t: 'load', url: sourceUrl, limits: { frameWidth: limits.frameWidth, frameHeight: limits.frameHeight, framesPerClip: limits.framesPerClip } }, limits.loadMs,
        `The source did not finish loading within ${seconds(limits.loadMs)} and was stopped. Code at the top of a sprite file runs once when it is read: it must not loop or wait.`);
      loaded.catch(() => { loaded = null; });
    }
    return loaded;
  }
  const ready = async () => { if (strikes >= 3) throw new MadeError('This sprite was stopped three times for taking too long, and is not started again on this visit.', { limit: true }); await load(); };

  return {
    load,
    /** Every frame of these clips at these settings: { clips: { name: { fps, frames: [ArrayBuffer], sockets, slice } }, params }. count: how many frames that is. */
    async frames({ clips, params, count, style }) {
      await ready();
      const ms = Math.min(limits.checkMs, Math.max(limits.drawFloorMs, count * limits.frameMs));
      return ask({ t: 'frames', clips, params, style }, ms, `Drawing ${count} frame${count === 1 ? '' : 's'} took too long (over ${seconds(ms)}) and the sprite was stopped. Its render() must finish in well under ${limits.frameMs} ms a frame.`);
    },
    /** The quality bar. sounds: [[id, patch]] for the sounds its clips play. */
    async check(sounds) {
      await ready();
      return ask({ t: 'check', sounds }, limits.checkMs, `The quality bar did not finish within ${seconds(limits.checkMs)} and the sprite was stopped. It draws every clip at many settings: a render() that loops or is very slow at some setting does this.`);
    },
    /** Stop the worker and let go of the source. Nothing can be asked afterwards. */
    stop() { closed = true; end(new MadeError('This sprite has been stopped.')); pump(); URL.revokeObjectURL(sourceUrl); URL.revokeObjectURL(bootUrl); },
    /** Stop the worker to save memory; the next call starts it again. */
    rest() { if (!current && !waiting.length) end(null); },
    alive: () => !!worker,
    busy: () => !!current || waiting.length > 0,
  };
}

const BAD = Symbol('not plain drawing data');
const SAFE_TEXT = /^[\w #.,:;()%+\-/=]*$/;
/**
 * What a made sprite drew on a surface that is not a pixel grid, read as plain drawing data: numbers, true and false,
 * short text with nothing in it that could close a tag or a quote, lists, typed arrays and plain objects of those.
 * Anything else (and anything too big or too deep) is BAD: the exporters that turn this into files never meet it.
 */
function cleanState(v, budget, depth) {
  if (--budget.left < 0 || depth > 8) return BAD;
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length <= 200 && SAFE_TEXT.test(v) ? v : BAD;
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) { budget.left -= v.length >> 4; return budget.left < 0 ? BAD : v.slice(); }
  if (Array.isArray(v)) { const out = []; for (const x of v) { const c = cleanState(x, budget, depth + 1); if (c === BAD) return BAD; out.push(c); } return out; }
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const [k, x] of Object.entries(v)) { if (!SAFE_TEXT.test(k) || k === '__proto__') return BAD; const c = cleanState(x, budget, depth + 1); if (c === BAD) return BAD; out[k] = c; }
    return out;
  }
  return BAD;
}

/**
 * A sprite definition for the page, built from what a made sprite said about itself and drawn from the pixels
 * its worker sends. description: from cleanDescription(); engine: app's engine/sprite.js; sandbox: openSandbox();
 * bagSettings(def): the settings the bag holds for it right now, as a list of params (whenReady prepares them).
 * Throws what defineSprite throws when the description is not a valid sprite.
 * The result is an ordinary sprite plus: made (true), prepare(params, { clips, style }), prepareAround(params, { style }),
 * whenReady(), onFrames(fn), isFor(event, params, style), has(params, clip, style), stats().
 */
export function standIn({ description: d, engine, sandbox, bagSettings = () => [], styles = ['pixel'], limits = LIMITS, onProblem = () => {} }) {
  const { defineSprite, cleanParams, defaultParams } = engine;
  const [fw, fh] = d.size, area = fw * fh;
  const names = Object.keys(d.clips);
  const controls = Object.keys(d.params);
  // settings and art style together name what was drawn; the first style (the usual one) needs no name
  const first = styles[0] ?? 'pixel';
  const keyOf = (p, style = first) => (style === first ? '' : `${style}|`) + JSON.stringify(controls.map((k) => p[k]));
  // pixels by settings: key -> { clips: { name: { fps, frames: [Uint32Array], sockets, slice } }, bytes }; a Map keeps the order of use
  const cache = new Map();
  const asked = new Map();        // key + clip -> the request that will bring it
  const latest = {};              // style and clip -> the key most recently drawn for real
  const listeners = new Set();
  const stats = { requests: 0, frames: 0, hits: 0, misses: 0, ms: 0, bytes: 0 };
  let baseKey = null, wanted = null, pumping = false, def = null;

  const got = (key, clip) => { const e = cache.get(key); if (!e || !e.clips[clip]) return null; cache.delete(key); cache.set(key, e); return e.clips[clip]; };
  const peek = (key, clip) => cache.get(key)?.clips[clip] ?? null;
  // the nearest thing there is while the right one is on its way: the last settings drawn, else the defaults
  // (in the same art style: what one style drew cannot stand in for another)
  const nearest = (clip, style = first) => peek(latest[`${style}|${clip}`], clip) ?? (style === first ? peek(baseKey, clip) : null);

  function store(key, clips, style) {
    let e = cache.get(key);
    if (!e) { e = { clips: {}, bytes: 0 }; cache.set(key, e); }
    for (const [name, c] of Object.entries(clips)) {
      if (!d.clips[name] || !Array.isArray(c?.frames) || c.frames.length !== d.clips[name].frames) throw new MadeError(`The sprite sent the wrong number of frames for the clip "${name}".`);
      let size = 0;
      const frames = c.frames.map((b) => {
        if (style === 'pixel') { if (!(b instanceof ArrayBuffer) || b.byteLength !== area * 4) throw new MadeError(`The sprite sent a frame of the wrong size for the clip "${name}".`); size += area * 4; return new Uint32Array(b); }
        // another art style: what the sprite drew on that style's surface, as data. Read, capped and copied here.
        const budget = { left: limits.surfaceItems };
        const state = cleanState(b, budget, 0);
        if (state === BAD || state === null || typeof state !== 'object' || Array.isArray(state) || ArrayBuffer.isView(state)) throw new MadeError(`The sprite sent something that is not plain drawing data for the clip "${name}" in the style "${style}".`);
        size += (limits.surfaceItems - budget.left) * 16;
        return state;
      });
      const fps = Number.isFinite(c.fps) ? Math.max(1, Math.min(120, Math.round(c.fps))) : 10;
      if (!e.clips[name]) { e.bytes += size; stats.bytes += size; }
      e.clips[name] = { fps, frames, sockets: Array.isArray(c.sockets) ? c.sockets : null, slice: c.slice ?? null };
      latest[`${style}|${name}`] = key;
      stats.frames += frames.length;
    }
    // room for the newest: the settings used longest ago go first, the defaults never
    for (const [k, old] of cache) { if (stats.bytes <= limits.cacheBytes) break; if (k === key || k === baseKey) continue; cache.delete(k); stats.bytes -= old.bytes; }
  }

  /** Bring the frames of these clips at these settings (in this art style), unless they are here or already asked for. */
  function fetchClips(p, clips, style = first) {
    if (!styles.includes(style)) return Promise.reject(new MadeError(`This sprite cannot be drawn in the style "${style}". Its styles are: ${styles.join(', ')}.`));
    const key = keyOf(p, style);
    const need = clips.filter((c) => !peek(key, c) && !asked.has(`${key}|${c}`));
    const pending = clips.map((c) => asked.get(`${key}|${c}`)).filter(Boolean);
    if (need.length) {
      const t0 = performance.now();
      const count = need.reduce((n, c) => n + d.clips[c].frames, 0);
      stats.requests++;
      const job = sandbox.frames({ clips: need, params: p, count, style }).then((r) => {
        store(key, r?.clips ?? {}, style);
        stats.ms += performance.now() - t0;
        for (const fn of [...listeners]) { try { fn({ key, params: p, clips: need, style }); } catch (e) { console.error('made sprite listener:', e); } }
      }).finally(() => { for (const c of need) asked.delete(`${key}|${c}`); });
      job.catch((e) => onProblem(e));
      for (const c of need) asked.set(`${key}|${c}`, job);
      pending.push(job);
    }
    return Promise.all(pending);
  }
  // drawing code that found nothing asks here; only the newest settings are sent, one request at a time
  function want(p, clip, style) {
    const key = keyOf(p, style);
    if (asked.has(`${key}|${clip}`)) return;
    if (!wanted || wanted.key !== key) wanted = { key, p: { ...p }, style, clips: new Set() };
    wanted.clips.add(clip);
    if (pumping) return;
    pumping = true;
    (async () => { while (wanted) { const w = wanted; wanted = null; try { await fetchClips(w.p, [...w.clips], w.style); } catch { /* reported through onProblem */ } } pumping = false; })();
  }
  /** The clip's frames for these settings if they are here; otherwise ask for them and return the nearest there is (or null). */
  function clipFor(clip, p, style = first) {
    if (!styles.includes(style)) return null;
    const hit = got(keyOf(p, style), clip);
    if (hit) { stats.hits++; return hit; }
    stats.misses++;
    want(p, clip, style);
    return nearest(clip, style);
  }
  const frameAt = (c, t) => Math.max(0, Math.min(c.frames - 1, Math.round(c.loop ? t * c.frames : t * (c.frames - 1))));

  const raw = {
    id: d.id, name: d.name, size: d.size, pivot: d.pivot, params: d.params, parts: d.parts, sounds: d.sounds,
    ...(d.kind ? { kind: d.kind } : {}), ...(d.blurb ? { blurb: d.blurb } : {}), ...(d.preview ? { preview: d.preview } : {}),
    ...(d.meta ? { meta: d.meta } : {}), ...(d.grounded === false ? { grounded: false } : {}),
    clips: Object.fromEntries(names.map((name) => [name, { frames: d.clips[name].frames, loop: d.clips[name].loop, ...(d.clips[name].label ? { label: d.clips[name].label } : {}), fps: (p) => (peek(keyOf(p), name) ?? nearest(name))?.fps ?? 10 }])),
    /** Copies in the pixels the sprite's worker drew for this clip, frame and settings. */
    render(g, ctx) {
      const style = ctx.style ?? first;
      const c = clipFor(ctx.clip, ctx.p, style);
      const drawn = c && c.frames[ctx.frame];
      if (!drawn || !g) return;
      if (style === 'pixel') { if (g.data && g.data.length === drawn.length) g.data.set(drawn); return; }
      // another art style: lay a fresh copy of what was drawn onto this surface (the style then finishes it, here on the page)
      for (const [k, v] of Object.entries(drawn)) { try { g[k] = structuredClone(v); } catch { /* a read-only part of the surface stays as it is */ } }
    },
  };
  if (styles.length > 1 || first !== 'pixel') raw.styles = [...styles];
  if (d.socketNames) {
    const blank = Object.fromEntries(d.socketNames.map((n) => [n, { x: d.pivot[0], y: d.pivot[1], angle: 0 }]));
    raw.sockets = (clip, t, p) => { const c = d.clips[clip] && clipFor(clip, p ?? defaultParams(def)); return (c && c.sockets && c.sockets[frameAt(d.clips[clip], t)]) || blank; };
  }
  if (d.hasSlice) raw.slice = (clip, p) => (d.clips[clip] ? clipFor(clip, p)?.slice : null) ?? undefined;
  def = defineSprite(raw);
  baseKey = keyOf(defaultParams(def));
  const settingOf = (x) => (x && x.params ? x : { params: x, style: first });       // a setting is params, or { params, style }

  /** Bring every frame of these settings (all clips unless some are named). Resolves when they are here. */
  def.prepare = (params, { clips = names, style = first } = {}) => fetchClips(cleanParams(def, params ?? {}), clips.filter((c) => d.clips[c]), style ?? first);
  /** The defaults and every setting the bag holds for this sprite (each params, or { params, style }), ready to draw. Never rejects: a sprite that cannot be drawn stays blank. */
  def.whenReady = () => Promise.allSettled([defaultParams(def), ...bagSettings(def)].map(settingOf).map((x) => def.prepare(x.params, { style: x.style }))).then(() => def);
  /** Call fn({ key, params, clips }) each time frames arrive. Returns a function that stops it. */
  def.onFrames = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  /**
   * For a page with controls: bring, quietly and one at a time, what one more click could ask for from these
   * settings: each option of every choice, every switch flipped, and each other art style. A click then draws at once.
   * What is on screen always goes first, and a newer call ends an older one.
   */
  let round = 0;
  def.prepareAround = async (params, { style = first } = {}) => {
    const mine = ++round;
    const p = cleanParams(def, params ?? {});
    const next = styles.filter((s) => s !== (style ?? first)).map((s) => [p, s]);
    for (const [k, c] of Object.entries(d.params)) {
      if (c.kind === 'choice') for (const o of c.options ?? []) { if (o.value !== p[k]) next.push([{ ...p, [k]: o.value }, style ?? first]); }
      else if (c.kind === 'toggle') next.push([{ ...p, [k]: !p[k] }, style ?? first]);
    }
    for (const [q, s] of next.slice(0, 48)) {
      while (mine === round && (pumping || wanted)) await new Promise((r) => setTimeout(r, 4));
      if (mine !== round) return;
      try { await fetchClips(q, names, s); } catch { return; }
    }
  };
  /** Is this onFrames event the arrival of exactly these settings in this style? */
  def.isFor = (event, params, style = first) => !!event && event.key === keyOf(cleanParams(def, params ?? {}), style ?? first);
  def.has = (params, clip, style = first) => !!peek(keyOf(cleanParams(def, params ?? {}), style), clip ?? names[0]);
  def.stats = () => ({ ...stats, settings: cache.size });
  def.made = true;
  return def;
}
