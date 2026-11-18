// Where a sprite made on a visit runs: a worker of its own, and nowhere else (docs/architecture.md, Contract 11,
// "Safety of run-time assets"). The page starts one of these per made sprite (app/made.js), from memory, so the
// worker carries the page's content policy: no script and no connection from anywhere but this site.
//
// The made source is a program someone else may have written. Before it is read, this file takes away everything
// a worker has for reaching the network, the site's storage, other workers and the page, and keeps the one way
// of answering the page to itself. What is left for the source: the framework it imports, and arithmetic.
// What leaves this worker: plain data and pixels, which the page checks again (app/api-source.js, cleanDescription).
//
//   in   { job, t: 'load', url, limits }                 the source, as a module in memory
//   out  { job, result: { description } }                what the sprite says about itself, as data
//   in   { job, t: 'frames', clips: [names], params, style }   every frame of those clips at those settings, in one art style
//   out  { job, result: { clips: { name: { fps, frames, sockets, slice } } } }
//        frames: in the pixel style one ArrayBuffer of pixels per frame; in another style, what the sprite drew on that
//        style's surface, as plain data (the page puts it on a surface of its own and finishes it there)
//   in   { job, t: 'check', sounds: [[id, patch]] | null }   the quality bar (Contract 10); null: the cues are not checked
//   out  { job, result: { errors, warnings, metrics } }
//   out  { job, error: 'message' }                       for any of them
//
// A source can still spoil its own worker (it shares it with this file), so it can lie about its own pictures
// and its own verdict, and about nothing else. It cannot stay: the page stops the worker on a time limit.

// ---- first: keep the way out, then take everything away -------------------------------------------------------
const scope = globalThis;
const post = scope.postMessage.bind(scope);
const listen = scope.addEventListener.bind(scope);
const clock = () => performance.now();

const TAKEN = [
  // the network
  'fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'RTCPeerConnection', 'RTCDataChannel', 'importScripts', 'fetchLater',
  // the site's storage, and other pages and workers of it
  'indexedDB', 'caches', 'cookieStore', 'BroadcastChannel', 'MessageChannel', 'MessagePort', 'Worker', 'SharedWorker', 'ServiceWorkerRegistration', 'Notification', 'navigator', 'location', 'origin',
  // the page: only this file answers it
  'postMessage', 'onmessage', 'onmessageerror', 'close',
  // files and devices
  'FileReader', 'FileReaderSync', 'FileSystemHandle', 'FileSystemFileHandle', 'FileSystemDirectoryHandle', 'showOpenFilePicker', 'FontFace', 'fonts', 'OffscreenCanvas', 'createImageBitmap', 'ImageDecoder', 'VideoDecoder', 'AudioDecoder', 'WebAssembly',
];
for (const name of TAKEN) {
  for (let o = scope; o; o = Object.getPrototypeOf(o)) { try { delete o[name]; } catch { /* not ours to delete: covered below */ } }
  try { Object.defineProperty(scope, name, { value: undefined, writable: false, configurable: false, enumerable: false }); } catch { /* already gone */ }
}

// ---- the jobs --------------------------------------------------------------------------------------------------
let sprite = null;        // what the source's defineSprite returned
let engine = null;        // engine/sprite.js, loaded with the source (it imports it)
let styles = null;        // engine/styles.js

const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : x))));
const messageOf = (e) => String((e && e.message) || e).slice(0, 600);

async function load(m) {
  let def;
  try { def = (await import(m.url)).default; } catch (e) {
    const what = e && e.name === 'SyntaxError' ? 'The source is not valid JavaScript' : 'The source could not be loaded: it stopped while it was being read';
    throw new Error(`${what} (${e && e.name ? `${e.name}: ` : ''}${messageOf(e)}). A sprite's source may only use the framework it imports: there is no page, no network and no storage where it runs.`);
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(def) || typeof def.render !== 'function' || !isObj(def.clips) || !isObj(def.params) || !def.parts || !def.sounds || !def.preview) {
    throw new Error('The module\'s default export must be the sprite: end the source with "export default defineSprite({ id, name, size, pivot, params, clips, meta, render(g, { clip, t, p }) { ... } })", with defineSprite imported from \'../engine/sprite.js\'.');
  }
  const L = m.limits ?? {};
  const [w, h] = Array.isArray(def.size) ? def.size : [];
  // caps that matter before anything is drawn here; the page checks all of them again from the description
  if (!(w >= 1 && h >= 1 && w <= (L.frameWidth ?? 640) && h <= (L.frameHeight ?? 360))) throw new Error(`A frame of ${w} by ${h} pixels is too big: the most a sprite made on a visit may be is ${L.frameWidth ?? 640} by ${L.frameHeight ?? 360} (the largest frame in the catalogue, a backdrop, is 320 by 180).`);
  for (const [name, c] of Object.entries(def.clips)) if (!(c.frames <= (L.framesPerClip ?? 64))) throw new Error(`The clip "${name}" has ${c.frames} frames; the most in one clip is ${L.framesPerClip ?? 64}.`);
  [engine, styles] = await Promise.all([import('../engine/sprite.js'), import('../engine/styles.js')]);
  sprite = def;
  const first = Object.keys(def.clips)[0];
  let socketNames = null;
  if (typeof def.sockets === 'function') socketNames = Object.keys(def.sockets(first, 0, engine.defaultParams(def)) ?? {});
  const description = plain({
    id: def.id, name: def.name, kind: def.kind, blurb: def.blurb, size: def.size, pivot: def.pivot, grounded: def.grounded, preview: def.preview,
    meta: def.meta, params: def.params, parts: def.parts, sounds: def.sounds, styles: def.styles,
    clips: Object.fromEntries(Object.entries(def.clips).map(([name, c]) => [name, { frames: c.frames, loop: c.loop, label: c.label }])),
    socketNames, hasSlice: def.slice !== undefined && def.slice !== null,
  });
  return { description };
}

function frames(m) {
  if (!sprite) throw new Error('No sprite has been loaded here.');
  const p = engine.cleanParams(sprite, m.params ?? {});
  const out = {}, moved = [];
  for (const clip of m.clips) {
    const c = sprite.clips[clip];
    if (!c) throw new Error(`The sprite has no clip "${clip}".`);
    const one = { fps: engine.clipFps(sprite, clip, p), frames: [], sockets: null, slice: null };
    const style = styles.styleFor(sprite, m.style);         // throws for a style the sprite does not list
    for (let f = 0; f < c.frames; f++) {
      // what engine/sprite.js renderFrame does, up to the style's finish: the page finishes the frame itself
      const ctx = { clip, t: c.loop ? f / c.frames : c.frames > 1 ? f / (c.frames - 1) : 0, frame: f, frames: c.frames, loop: c.loop, p, style: style.id };
      let g;
      try { g = style.makeSurface(sprite.size[0], sprite.size[1], ctx); sprite.render(g, ctx); } catch (e) { throw new Error(`The sprite's render() failed on clip "${clip}", frame ${f}${style.id === 'pixel' ? '' : `, in the style "${style.id}"`}: ${messageOf(e)}`); }
      if (style.id === 'pixel') {
        // a copy of exactly the frame's pixels
        const px = new Uint32Array(sprite.size[0] * sprite.size[1]);
        if (g && g.data && g.data.length === px.length) px.set(g.data);
        one.frames.push(px.buffer);
        moved.push(px.buffer);
      } else {
        // what the surface holds, without its functions: plain data the page checks and lays onto a surface of its own
        const state = {};
        for (const k of Object.keys(g ?? {})) if (typeof g[k] !== 'function') state[k] = g[k];
        one.frames.push(state);
      }
    }
    if (typeof sprite.sockets === 'function') one.sockets = Array.from({ length: c.frames }, (_, f) => plain(engine.frameSockets(sprite, clip, f, p)));
    if (sprite.slice !== undefined && sprite.slice !== null) {
      let s = typeof sprite.slice === 'function' ? sprite.slice(clip, p) : sprite.slice[clip];
      if (typeof s === 'function') s = s(p);
      one.slice = plain(s ?? null);
    }
    out[clip] = one;
  }
  return { result: { clips: out, params: plain(p) }, moved };
}

async function check(m) {
  if (!sprite) throw new Error('No sprite has been loaded here.');
  const t0 = clock();
  const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../quality/sprite.js'), import('../catalog/schema.js')]);
  const r = checkSprite(sprite, { soundIndex: Array.isArray(m.sounds) ? new Map(m.sounds) : undefined, validateMeta });
  return { errors: r.errors.map(String), warnings: r.warnings.map(String), metrics: plain(r.metrics), ms: Math.round(clock() - t0) };
}

listen('message', async (e) => {
  const m = e.data ?? {};
  try {
    if (m.t === 'load') post({ job: m.job, result: await load(m) });
    else if (m.t === 'frames') { const { result, moved } = frames(m); post({ job: m.job, result }, moved); }
    else if (m.t === 'check') post({ job: m.job, result: await check(m) });
    else post({ job: m.job, error: `unknown job "${m.t}"` });
  } catch (err) { post({ job: m.job, error: messageOf(err) }); }
});
