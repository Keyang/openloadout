// window.loadout, the whole of it (docs/architecture.md, Contract 11; the guide is docs/framework-api.md).
// app/api.js is the small file every visitor loads; it loads this one the first time `loadout` is used.
//
// What this file keeps to:
//   - Every action is async, returns plain data, and never throws: a bad input gives { ok: false, errors: ['...'] }.
//   - A source made on a visit never runs in the page. It is loaded, checked and drawn in a worker of its own
//     (app/sandbox-worker.js, driven through app/made.js), with a time limit on every call. The page holds a
//     stand-in sprite that copies in the pixels the worker sends. Sound patches are data and stay on the page.
//   - Whatever comes from the bag's storage or from a link is not trusted: it goes through the same worker and
//     the same quality bar before it is known to the site, after the page has drawn. What fails is listed in the
//     bag as "needs re-making" and is neither drawn nor exported.
//   - The quality bar on catalogue sprites and on sounds runs in a background worker (app/api-worker.js).
//   - ACTIONS (app/api-actions.js) is the one list of actions; the object is built from it.
import { ACTIONS, LOOK, SETTINGS } from './api-actions.js';
import { LIMITS, fail, rewriteImports, cleanDescription } from './api-source.js';
import { openSandbox, standIn, MadeError } from './made.js';

export { ACTIONS, fail };

// ---- small things ---------------------------------------------------------------------------------------

/** An error whose message is written for the caller and is passed on as it is. */
class Problem extends Error {}

const ID_RE = /^[a-z][a-z0-9-]*$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const say = (v) => (v === null ? 'null' : v === undefined ? 'nothing' : Array.isArray(v) ? 'a list' : typeof v === 'string' ? JSON.stringify(v.length > 40 ? `${v.slice(0, 40)}…` : v) : typeof v === 'function' ? 'a function' : typeof v === 'object' ? 'an object' : `the ${typeof v} ${String(v)}`);
const pause = () => new Promise((r) => setTimeout(r, 0));
const list = (v) => (Array.isArray(v) ? v : []);
/** A copy made only of plain data: no functions, no typed arrays, no numbers JSON cannot hold. */
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : ArrayBuffer.isView(x) ? undefined : x))));
const messageOf = (e) => String((e && e.message) || e);

function base64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * A checker's message for someone who cannot open the project's files: pointers into docs/ and into source files
 * are taken out (what they say is in `await loadout.api`, under modules, and in the guide the site's owner has).
 */
const forAgents = (m) => String(m)
  .replace(/\s*\((?:see\s+)?docs\/[^)]*\)/g, '')
  .replace(/\s*\(or add it to \w+ in catalog\/schema\.js\)/g, '')
  .replace(/\bcatalog\/schema\.js\b/g, 'the metadata rules (`(await loadout.framework).schema`)')
  .replace(/\bdocs\/[\w-]+\.md\b/g, 'the guide');

// ---- long work that holds no made source: app/api-worker.js -----------------------------------------------------

/** run(job, ms) -> Promise of its result, on a background worker when the browser has one, otherwise here after a pause. */
function createWorker(win, workerUrl) {
  let worker = null, next = 1, off = !win || typeof win.Worker !== 'function';
  const jobs = new Map();
  const here_ = async (msg) => { await pause(); return { ...(await (await import('./api-worker.js')).runJob(msg)), onPage: true }; };
  const drop = () => { const waiting = [...jobs.values()]; jobs.clear(); for (const j of waiting) clearTimeout(j.timer); try { worker?.terminate(); } catch { /* gone already */ } worker = null; return waiting; };
  function start() {
    worker = new win.Worker(workerUrl, { type: 'module', name: 'loadout-checks' });
    worker.onmessage = (e) => {
      const j = jobs.get(e.data.job);
      if (!j) return;
      jobs.delete(e.data.job);
      clearTimeout(j.timer);
      if (e.data.error) j.reject(new Problem(e.data.error)); else j.resolve(e.data.result);
    };
    // the worker itself could not start (an old browser, a blocked script): do the waiting jobs here instead
    worker.onerror = (e) => { e.preventDefault?.(); off = true; for (const j of drop()) here_(j.msg).then(j.resolve, j.reject); };
  }
  return function run(msg, ms = LIMITS.musicCheckMs) {
    if (off) return here_(msg);
    if (!worker) { try { start(); } catch { off = true; return here_(msg); } }
    return new Promise((resolve, reject) => {
      const job = next++;
      // over its limit: the worker is stopped, and with it whatever else it was doing; those are told too
      const timer = setTimeout(() => { for (const j of drop()) j.reject(new Problem(`The work took longer than ${Math.round(ms / 1000)} seconds and was stopped. A sound of extreme length or with a very heavy patch does this.`)); }, ms);
      jobs.set(job, { msg, resolve, reject, timer });
      worker.postMessage({ job, ...msg });
    });
  };
}

// ---- window.loadout ---------------------------------------------------------------------------------------------

const FILTER_KEYS = ['kind', 'type', 'role', 'themes', 'gameTypes', 'view', 'bundle', 'runtime'];
const ROUTES = 'Pages: "/" (home), "/browse?kind=sprite", "/sprite/<id>", "/sound/<id>", "/music/<id>", "/bundle/<id>", "/bundles", "/bag", "/play".';
const MAX_PICTURE = 16_000_000;   // pixels in one render
const internals = new WeakMap();
/** What app/api.js needs of a loadout object besides its actions: { restore(), settled(), state(item), pending(id) }. */
export const internalsOf = (loadout) => internals.get(loadout) ?? null;

/**
 * Build the loadout object. env.window: the page (left out in Node, where everything that needs a page answers
 * { ok: false } instead). The page gets one, on window.loadout, when this file is loaded.
 */
export function createLoadout(env = {}) {
  const win = env.window ?? null;
  const doc = win?.document ?? null;
  const site = new URL('../', import.meta.url);                 // the folder index.html is in
  const at = (p) => new URL(p, site).href;
  const work = createWorker(win, at('app/api-worker.js'));

  // everything else the site is made of, loaded when first needed and kept
  const once = (load) => { let p = null; return () => (p ??= load().catch((e) => { p = null; throw e; })); };
  const lib = {
    catalog: once(async () => { const m = await import('./catalog.js'); await m.loadCatalog(); return m; }),
    sounds: once(async () => { const m = await import('./audio.js'); await m.loadSounds(); return m; }),
    audio: once(() => import('./audio.js')),
    bag: once(() => import('./bag.js')),
    browse: once(() => import('./browse.js')),
    bundle: once(() => import('./bundle.js')),
    zip: once(() => import('./zip.js')),
    ui: once(() => import('./ui.js')),
    core: once(() => import('../search/core.js')),
    sprite: once(() => import('../engine/sprite.js')),
    styles: once(() => import('../engine/styles.js')),
    theme: once(() => import('../engine/theme.js')),
    sfx: once(() => import('../sound/sfx-engine.js')),
    wav: once(() => import('../sound/wav.js')),
  };
  const needPage = () => { if (!doc) throw new Problem('This needs the Loadout site open in a browser page; there is no page here.'); };

  // ---- framework and api: loaded on first use ----
  // Until it has arrived each is a promise of itself, so `await loadout.framework` is right at any time,
  // and `loadout.framework.sprite.defineSprite` is right once anything has waited for it.
  const lazy = (load, missing) => {
    let value = null, loading = null;
    return () => {
      if (value) return value;
      if (!loading) {
        loading = load().then((v) => { value = v; return v; }, (e) => { loading = null; throw new Error(`${missing} (${messageOf(e)})`); });
        loading.catch(() => {});        // whoever awaits it hears about it; nobody else needs a console error
      }
      return loading;
    };
  };
  const framework = lazy(async () => Object.freeze({ ...(await import('../generated/framework.js')) }), 'The framework list is missing: generated/framework.js is written by "npm run build"');
  const api = lazy(async () => {
    const r = await fetch(at('generated/api.json'));
    if (!r.ok) throw new Error(`generated/api.json: ${r.status}`);
    return r.json();
  }, 'The description of the framework is missing: generated/api.json is written by "npm run build"');

  // ---- assets made on this visit ----
  // id -> { id, kind: 'sprite' | 'sound' | 'music', row, verdict: { ok, errors, warnings }, and
  //         sprite: source (as given), sandbox (the worker it runs in), def (the stand-in the page draws with);
  //         sound and music: patch }
  const runtime = new Map();
  const runtimeRows = () => [...runtime.values()].map((e) => e.row);
  const letGo = (entry) => { if (entry?.sandbox) entry.sandbox.stop(); };
  /**
   * Keep an asset for the visit: in the registry, in the catalogue module (assetById / loadSprite / loadSound, and with
   * them the pages, the bag, the playground and the export) and, for a sound, in the sound library the pages play from.
   * An earlier one with the same id is replaced, and its worker stopped.
   */
  async function keep(entry) {
    const c = await lib.catalog();
    await watchBag();
    const earlier = runtime.get(entry.id);
    if (earlier && earlier.sandbox !== entry.sandbox) letGo(earlier);
    if (earlier && earlier.kind !== 'sprite') (await lib.audio()).removeSound(entry.id);
    runtime.set(entry.id, entry);
    if (entry.kind !== 'sprite') (await lib.audio()).addSound(entry.patch);
    c.addRuntimeAsset(entry.row, entry.kind === 'sprite' ? entry.def : entry.patch);
    return !!earlier;
  }
  /** What a bag item of this asset carries: { source } or { patch }. null for a catalogue asset. */
  const definitionOf = (kind, id) => { const e = runtime.get(id); return e && e.kind === kind ? (kind === 'sprite' ? { source: e.source } : { patch: e.patch }) : null; };
  const textOf = (kind, definition) => (kind === 'sprite' ? String(definition?.source ?? '') : JSON.stringify(definition?.patch ?? null));
  /** Is this bag item's own definition the one the site knows under its id? Only then is it drawn and exported. */
  const sameDefinition = (item, entry) => !!entry && entry.kind === item.kind && textOf(item.kind, item.definition) === textOf(entry.kind, definitionOf(entry.kind, entry.id));
  // only a few made sprites keep their worker running: the one used longest ago rests, and starts again when it is needed
  const recent = [];
  const touch = (box) => {
    const i = recent.indexOf(box);
    if (i >= 0) recent.splice(i, 1);
    recent.push(box);
    let running = recent.filter((b) => b.alive()).length;
    for (const b of recent) { if (running <= LIMITS.workers) break; if (b !== box && b.alive() && !b.busy()) { b.rest(); running--; } }
  };
  // one make at a time: two for the same id, started together, end as one asset (the later one)
  let turn = Promise.resolve();
  const inTurn = (fn) => { const p = turn.then(() => fn(), () => fn()); turn = p.catch(() => {}); return p; };

  const noAsset = (id) => new Problem(`There is no asset "${id}". loadout.assets.list() names every asset; loadout.assets.search(text) finds one by words.`);
  const idOf = (v, where) => { if (typeof v !== 'string' || !ID_RE.test(v)) throw new Problem(`${where} takes an asset id: lowercase text such as "knight" or "coin-pickup". Got ${say(v)}.`); return v; };
  const optionsOf = (v, where, allowed) => {
    if (v === undefined || v === null) return {};
    if (!isObj(v)) throw new Problem(`${where}: the options must be an object such as { ${allowed[0]}: ... }. Got ${say(v)}.`);
    const extra = Object.keys(v).filter((k) => !allowed.includes(k));
    if (extra.length) throw new Problem(`${where}: no option called ${extra.map((k) => `"${k}"`).join(', ')}. The options are: ${allowed.join(', ')}.`);
    return v;
  };
  const filtersOf = (v, where, extraKeys = []) => {
    const f = optionsOf(v, where, [...FILTER_KEYS, ...extraKeys]);
    const filters = {};
    for (const k of FILTER_KEYS) {
      if (f[k] === undefined || f[k] === null || k === 'runtime') continue;
      const values = Array.isArray(f[k]) ? f[k] : [f[k]];
      if (values.some((x) => typeof x !== 'string')) throw new Problem(`${where}: "${k}" must be text or a list of text, for example { ${k}: ${k === 'kind' ? '"sprite"' : '"..."'} }. Got ${say(f[k])}.`);
      filters[k] = values;
    }
    if (f.runtime !== undefined && f.runtime !== null && typeof f.runtime !== 'boolean') throw new Problem(`${where}: "runtime" must be true or false. Got ${say(f.runtime)}.`);
    return { filters, runtime: f.runtime ?? null, limit: f.limit };
  };
  /** The asset behind an id: { id, kind, row, entry } (entry only for one made on this visit), or null. */
  async function find(id) {
    if (!runtime.has(id)) await restore();          // it may be one the bag is still bringing back
    const entry = runtime.get(id);
    if (entry) return { id, kind: entry.kind, row: entry.row, entry };
    const c = await lib.catalog();
    const row = c.assetById(id);
    return row ? { id, kind: row.kind, row, entry: null } : null;
  }
  const everyRow = async () => { await restore(); return [...(await lib.catalog()).currentCatalog().assets, ...runtimeRows()]; };
  const narrowed = (core, rows, f) => core.filterAssets(rows, f.filters).filter((r) => f.runtime === null || !!r.runtime === f.runtime);
  const patchOf = async (a) => a.entry?.patch ?? (await lib.sounds()).soundById[a.id] ?? null;
  const defOf = async (a) => a.entry?.def ?? (await lib.catalog()).loadSprite(a.id);

  // ---- rows for assets made on this visit: the same fields the build writes (tools/lib/catalog.mjs) ----
  const metaFields = (meta, isSprite) => {
    const m = isObj(meta) ? meta : {};
    return { type: m.type ?? null, role: m.role ?? null, themes: list(m.themes), gameTypes: list(m.gameTypes), view: isSprite ? m.view ?? null : null, words: list(m.words), license: m.license ?? null };
  };
  // a draft (one that fails the quality bar) says so in its row: ok: false and the errors, which its page shows
  const verdictFields = (verdict) => (verdict.ok ? { runtime: true, ok: true } : { runtime: true, ok: false, errors: [...verdict.errors] });
  async function spriteRow(def, verdict) {
    const [S, { stylesOf }] = await Promise.all([lib.sprite(), lib.styles()]);
    const p = S.defaultParams(def);
    const soundIds = [...new Set(Object.values(def.sounds ?? {}).flat().map((c) => c.sound))].sort();
    const clips = Object.entries(def.clips).map(([name, c]) => ({ name, label: c.label, frames: c.frames, loop: c.loop, fps: S.clipFps(def, name, p) }));
    const preview = clips.find((c) => c.name === def.preview) ?? clips[0];
    return {
      id: def.id, kind: 'sprite', name: String(def.name), description: String(def.blurb ?? ''), ...metaFields(def.meta, true), styles: stylesOf(def), bundles: [], src: null,
      tech: { frame: [def.size[0], def.size[1]], pivot: [def.pivot[0], def.pivot[1]], grounded: def.grounded !== false, clips, controls: Object.keys(def.params).length, parts: Object.keys(def.parts ?? {}), sounds: soundIds.length, soundIds },
      thumb: null, strip: null, stripClip: preview.name, stripFrames: preview.frames, stripFps: preview.fps, ...verdictFields(verdict),
    };
  }
  async function soundRow(patch, kind, verdict) {
    const { createVoice } = await lib.sfx();
    const bpm = list(patch.params).find((x) => x.id === 'bpm');
    return {
      id: patch.id, kind, name: String(patch.name ?? patch.id), description: String(patch.description ?? ''), ...metaFields(patch.meta, false), bundles: [], src: null,
      tech: { seconds: Math.round(createVoice(patch).duration * 100) / 100, loop: !!patch.loop, stereo: Array.isArray(patch.out), bpm: bpm ? bpm.default : null, controls: list(patch.params).length, styles: Object.keys(patch.presets ?? {}) },
      thumb: null, strip: null, ...verdictFields(verdict),
    };
  }

  // ---- a made source -> its worker and its stand-in ----
  let bagNow = null, themeNow = null, engineNow = null, stylesNow = null;
  /** The settings the bag holds for a made sprite right now, plain and under the bag's look: what the bag page, the playground and the export will draw. */
  const bagSettings = (def) => {
    if (!bagNow || !themeNow || !engineNow) return [];
    const t = themeNow.normalizeTheme(bagNow.theme());
    return bagNow.items().filter((i) => i.kind === 'sprite' && i.id === def.id).flatMap((i) => {
      const p = engineNow.cleanParams(def, i.settings.params ?? {}), style = stylesNow ? stylesNow.artStyleOf(def, i.settings.artStyle) : undefined;
      return [{ params: p, style }, { params: themeNow.themedParams(def, p, t), style }];
    });
  };
  /**
   * Start a worker for sprite source text, read the source there, and build the page's stand-in for it.
   * Resolves to { sandbox, def }; whoever does not keep the sprite stops the sandbox. No part of the source runs on the page.
   */
  async function openMade(source, where) {
    needPage();
    if (typeof source !== 'string' || !source.trim()) throw new Problem(`${where} takes the sprite's source text: one ES module ending in "export default defineSprite({ ... })". Got ${say(source)}.`);
    if (source.length > LIMITS.sourceChars) throw new Problem(`${where}: the source is ${source.length.toLocaleString('en')} characters long; the most a sprite may be is ${LIMITS.sourceChars.toLocaleString('en')}. Generic drawing code belongs in the framework, not in the sprite.`);
    if (typeof win.Worker !== 'function') throw new Problem('This browser has no background workers, and a sprite made on a visit runs only in one, never in the page. Sprites cannot be made here; sounds can.');
    const rewritten = rewriteImports(source, { base: at('sprites/'), origin: site.origin, within: site.href });
    if (!rewritten.ok) throw Object.assign(new Problem(''), { errors: rewritten.errors });
    [engineNow, themeNow, bagNow, stylesNow] = await Promise.all([lib.sprite(), lib.theme(), lib.bag().then((m) => m.bag), lib.styles()]);
    const box = openSandbox({ env: { Worker: win.Worker, URL: win.URL, Blob: win.Blob }, workerUrl: at('app/sandbox-worker.js'), moduleText: rewritten.source });
    const sandbox = { ...box, frames: (x) => { touch(box); return box.frames(x); } };
    try {
      const { description } = await sandbox.load();
      const clean = cleanDescription(description);
      if (!clean.ok) throw Object.assign(new Problem(''), { errors: clean.errors });
      // Art styles (Contract 12). A style is framework code, registered by the site file that defines it; the source
      // imports that file where it runs, and the page loads the same site files (never the source) so that it knows
      // the style too. A style the page still does not know is left out, and the sprite is drawn in the others.
      let styles = clean.description.styles;
      if (styles.some((id) => !stylesNow.styleById(id))) await Promise.all(rewritten.imports.map((u) => import(u).catch(() => null)));
      styles = styles.filter((id) => stylesNow.styleById(id));
      if (!styles.length) styles = ['pixel'];
      let def;
      try { def = standIn({ description: clean.description, engine: engineNow, sandbox, bagSettings, styles, onProblem: (e) => console.warn(`Loadout: the made sprite "${clean.description.id}" could not be drawn.`, e?.message ?? e) }); } catch (e) { throw new Problem(`The sprite is not put together right: ${messageOf(e)}`); }
      // the first drawing: every clip at its defaults. A render() that never ends is found here, within seconds.
      about.set(def, { description: clean.description, imports: rewritten.imports });
      // what a download is about to write of it is looked at first (app/bundle.js asks through this)
      def.judgeLook = (params, options) => judgeLook(def, params, options);
      await def.prepare(null);
      return { sandbox, def };
    } catch (e) { box.stop(); throw e instanceof MadeError ? new Problem(e.message) : e; }
  }
  const runtimeSounds = () => [...runtime.values()].filter((e) => e.patch).map((e) => e.patch);
  const words = (v) => list(v).filter((x) => typeof x === 'string').slice(0, 200).map(forAgents);
  const verdictOf = (r, more = {}) => {
    const errors = words(r.errors), notes = r.notes ? words(r.notes) : null;
    const warnings = r.onPage ? [...words(r.warnings), 'This browser has no background worker for Loadout, so the check ran on the page itself and the page was busy meanwhile.'] : words(r.warnings);
    return { ok: errors.length === 0, errors, warnings, ...(notes ? { notes } : {}), ...more };
  };
  /** The sounds a made sprite's clips play, for the bar to look up: [[id, patch]], or null when there is no library to look in. */
  async function cuedSounds(def) {
    const cued = [...new Set(Object.values(def.sounds ?? {}).flat().map((c) => c.sound))];
    if (!cued.length) return [];
    const library = await lib.sounds().catch(() => null);
    if (!library) return null;       // the cues are not checked, and the verdict says so
    return cued.map((id) => [id, runtime.get(id)?.patch ?? library.soundById[id]]).filter(([, patch]) => patch);
  }
  // what the bar is handed about a made sprite, kept with its stand-in: { description, imports }
  const about = new WeakMap();
  let checkSession = 0;
  /**
   * The quality bar on a made sprite. It runs in the background worker that never loads the source, on frames:
   * the bar looks at the settings it wants, the ones it had no frames for are drawn by the sprite's own worker
   * (ordinary drawing requests: the source cannot tell them from a page drawing) and kept on the page by settings,
   * and the bar runs again, until it has seen all it asks for. What the page later shows at those settings is
   * those same frames. Resolves to { verdict, metrics }.
   */
  async function judge(sandbox, def, { tips = true } = {}) {
    const info = about.get(def), session = ++checkSession, started = performance.now();
    const sounds = await cuedSounds(def);
    const left = () => LIMITS.checkMs - (performance.now() - started);
    const late = () => new Problem(`The quality bar did not finish within ${LIMITS.checkMs / 1000} seconds. It looks at every clip at many settings: a render() that is very slow, or a sprite with very many controls, does this.`);
    let open = { description: info.description, styles: [...def.styles ?? ['pixel']], imports: info.imports, sounds };
    let add = [def.framesFor(null)].filter(Boolean), settings = add.length, bytes = 0;
    try {
      for (let round = 0; round <= LIMITS.checkRounds; round++) {
        if (left() <= 0) throw late();
        const r = await work({ type: 'checkMade', session, open, add }, Math.max(1000, left()));
        open = null;
        if (r.verdict) {
          const verdict = verdictOf(r.verdict);
          if (sounds === null) verdict.warnings.push('The sounds this sprite plays were not checked: the site\'s sound library could not be read.');
          const metrics = plain({ ...r.verdict.metrics, settingsDrawn: r.settings, rounds: round + 1 });
          // Advice about how the source's own code draws can only come from where it runs. It adds warnings for whoever
          // wrote it; the verdict above was reached from frames and is not touched by it.
          if (tips) {
            const said = await sandbox.advice().catch(() => null);
            for (const w of words(said?.warnings).slice(0, 4)) if (!verdict.warnings.includes(w)) verdict.warnings.push(w.slice(0, 600));
            if (said && (said.outsideCalls === null || Array.isArray(said.outsideCalls))) metrics.outsideCalls = said.outsideCalls === null ? null : said.outsideCalls.filter((x) => typeof x === 'string').slice(0, 20);
          }
          return { verdict, metrics };
        }
        // draw what it asked for; each is every clip at one setting, as any page asks
        add = [];
        for (const want of list(r.missing)) {
          if (left() <= 0) throw late();
          if (++settings > LIMITS.checkSettings) throw new Problem(`The quality bar would have to draw this sprite at more than ${LIMITS.checkSettings} settings. Give it fewer controls, or fewer options.`);
          try { await def.prepare(want.params, { style: want.style }); } catch (e) { throw new Problem(messageOf(e)); }
          const frames = def.framesFor(want.params, want.style);
          if (!frames) throw new Problem('The sprite did not draw the frames the quality bar asked for.');
          bytes += def.size[0] * def.size[1] * 4 * Object.values(frames.clips).reduce((n, c) => n + c.frames.length, 0);
          if (bytes > LIMITS.checkBytes) throw new Problem('The quality bar would have to look at more pixels than a sprite made on a visit may have (its frames are too big, or too many).');
          add.push({ params: frames.params, style: frames.style, clips: frames.clips });
        }
      }
      throw new Problem('The quality bar kept asking for new settings and was stopped. A sprite whose controls change what the bar looks at each time does this.');
    } catch (e) {
      work({ type: 'checkMade', session, close: true }, 5000).catch(() => {});
      throw e instanceof MadeError ? new Problem(e.message) : e;
    }
  }
  /**
   * One setting of a made sprite, about to be written into a download: the same bar looks at exactly these frames
   * (every frame of every clip, as kept on the page), and the download then writes those frames and no others.
   * Resolves to { ok, errors, warnings }; the verdict stays with the frames.
   */
  async function judgeLook(def, params, { style } = {}) {
    try { await def.prepare(params, { style }); } catch (e) { return { ok: false, errors: [messageOf(e)], warnings: [] }; }
    const known = def.lookVerdict(params, style);
    if (known) return known;
    const frames = def.framesFor(params, style), info = about.get(def);
    if (!frames) return { ok: false, errors: ['The sprite did not draw its frames at these settings.'], warnings: [] };
    let verdict;
    try { verdict = verdictOf(await work({ type: 'checkLook', description: info.description, style: frames.style, imports: info.imports, clips: frames.clips, sounds: await cuedSounds(def) }, LIMITS.checkMs)); } catch (e) { return { ok: false, errors: [`It could not be checked (${messageOf(e)}).`], warnings: [] }; }
    def.keepLookVerdict(params, style, verdict);
    return verdict;
  }
  const checkSpriteAt = (url) => work({ type: 'checkSprite', url, soundsUrl: at('generated/sounds.json'), sounds: runtimeSounds() }, 2 * LIMITS.checkMs);

  // ---- drawing ----
  async function renderSprite(a, o) {
    needPage();
    const [S, def, Y] = await Promise.all([lib.sprite(), defOf(a), lib.styles()]);
    const style = styleOf(Y, def, a.id, o.artStyle);
    const clip = o.clip ?? def.preview;
    if (typeof clip !== 'string' || !def.clips[clip]) throw new Problem(`"${a.id}" has no clip ${say(o.clip)}. Its clips are: ${Object.keys(def.clips).join(', ')}.`);
    const count = def.clips[clip].frames;
    if (o.frame !== undefined && o.frame !== null && !(Number.isInteger(o.frame) && o.frame >= 0 && o.frame < count)) throw new Problem(`frame must be a whole number from 0 to ${count - 1} (the clip "${clip}" has ${count} frame${count === 1 ? '' : 's'}); leave it out for the whole clip in one row. Got ${say(o.frame)}.`);
    const scale = o.scale ?? 1;
    if (!(Number.isInteger(scale) && scale >= 1 && scale <= 8)) throw new Problem(`scale must be a whole number from 1 to 8. Got ${say(o.scale)}.`);
    if (o.params !== undefined && o.params !== null && !isObj(o.params)) throw new Problem(`params must be an object of settings by control key, for example { ${Object.keys(def.params)[0] ?? 'size'}: ... }. Got ${say(o.params)}.`);
    if (o.look !== undefined && o.look !== null && !isObj(o.look)) throw new Problem(`look must be an object such as { colour: { hue: 40 } }. Got ${say(o.look)}.`);
    const warnings = Object.keys(o.params ?? {}).filter((k) => !def.params[k]).map((k) => `"${k}" is not one of this sprite's controls and was ignored. Its controls are: ${Object.keys(def.params).join(', ')}.`);
    const p = S.cleanParams(def, o.params ?? {});
    const T = o.look ? await lib.theme() : null;
    // a sprite made on this visit is drawn in its own worker: bring the frames first, then they are copied in below
    if (def.made) { try { await def.prepare(T ? T.themedParams(def, p, T.normalizeTheme(o.look)) : p, { clips: [clip], style }); } catch (e) { throw new Problem(messageOf(e)); } }
    const frames = o.frame === undefined || o.frame === null ? Array.from({ length: count }, (_, f) => f) : [o.frame];
    const [fw, fh] = def.size, W = frames.length * fw * scale, H = fh * scale;
    if (W * H > MAX_PICTURE) throw new Problem(`That picture would be ${W} by ${H} pixels. Ask for one frame, or a smaller scale.`);
    const px = new Uint32Array(W * H);
    let opaque = 0, last = performance.now();
    for (let n = 0; n < frames.length; n++) {
      let g;
      // the picture is the style's own pixels, or its pixel picture of a frame it drew on another kind of surface
      try { g = Y.pixelsOf(T ? T.renderThemedFrame(def, clip, frames[n], p, o.look, { style }) : S.renderFrame(def, clip, frames[n], p, { style }), style); } catch (e) { throw new Problem(`The sprite's render() failed on clip "${clip}", frame ${frames[n]}${style === 'pixel' ? '' : `, in the style "${style}"`}: ${messageOf(e)}`); }
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
        const v = g.data[y * fw + x];
        if (!v) continue;
        opaque++;
        const ox = (n * fw + x) * scale, oy = y * scale;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) px[(oy + sy) * W + ox + sx] = v;
      }
      if (performance.now() - last > 12) { await pause(); last = performance.now(); }       // let the page draw between frames
    }
    const cv = doc.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d').putImageData(new win.ImageData(new Uint8ClampedArray(px.buffer), W, H), 0, 0);
    return { ok: true, id: a.id, kind: 'sprite', artStyle: style, clip, frame: frames.length === 1 && o.frame !== undefined && o.frame !== null ? o.frame : null, frames: frames.length, fps: S.clipFps(def, clip, p), width: W, height: H, scale, opaque, params: plain(p), warnings, png: cv.toDataURL('image/png') };
  }

  /** The style to draw or export a sprite in: the one asked for when the sprite lists it, its first when none is asked for. Anything else is refused, never swapped for another. */
  function styleOf(Y, def, id, asked) {
    const own = Y.stylesOf(def);
    if (asked === undefined || asked === null) return own[0];
    if (typeof asked !== 'string' || !own.includes(asked) || !Y.styleById(asked)) throw new Problem(`"${id}" cannot be drawn in the style ${say(asked)}. Its styles are: ${own.join(', ')}.`);
    return asked;
  }

  async function renderSound(a, o) {
    const patch = await patchOf(a);
    if (!patch) throw noAsset(a.id);
    const styles = Object.keys(patch.presets ?? {});
    if (o.style !== undefined && o.style !== null && !styles.includes(o.style)) throw new Problem(`"${a.id}" has no style ${say(o.style)}. ${styles.length ? `Its styles are: ${styles.join(', ')}.` : 'It has no named styles.'}`);
    if (o.params !== undefined && o.params !== null && !isObj(o.params)) throw new Problem(`params must be an object of settings by control id. Got ${say(o.params)}.`);
    if (o.look !== undefined && o.look !== null && !isObj(o.look)) throw new Problem(`look must be an object such as { sound: { pitch: 2 } }. Got ${say(o.look)}.`);
    const seed = o.seed ?? 1;
    if (!(Number.isInteger(seed) && seed >= 1)) throw new Problem(`seed must be a whole number, 1 or more. Got ${say(o.seed)}.`);
    const format = o.format ?? 'wav';
    if (format !== 'wav' && format !== 'samples') throw new Problem(`format must be "wav" or "samples". Got ${say(o.format)}.`);
    if (o.maxSeconds !== undefined && o.maxSeconds !== null && !(typeof o.maxSeconds === 'number' && o.maxSeconds > 0)) throw new Problem(`maxSeconds must be a number above 0. Got ${say(o.maxSeconds)}.`);
    const ids = list(patch.params).map((d) => d.id);
    const warnings = Object.keys(o.params ?? {}).filter((k) => !ids.includes(k)).map((k) => `"${k}" is not one of this sound's controls and was ignored. Its controls are: ${ids.join(', ')}.`);
    const r = await work({ type: 'renderSound', patch, params: o.params ?? null, style: o.style ?? null, seed, maxSeconds: o.maxSeconds ?? null, look: o.look ?? null });
    const out = { ok: true, id: a.id, kind: a.kind, seconds: Math.round(r.duration * 1000) / 1000, sampleRate: r.sampleRate, channels: r.channels.length, loop: r.loop, peak: Math.round(r.peak * 1000) / 1000, params: r.params, warnings };
    if (format === 'samples') out.samples = r.channels.map((ch) => Array.from(ch, (v) => Math.round(v * 1e4) / 1e4));
    else out.wav = `data:audio/wav;base64,${base64(new Uint8Array((await lib.wav()).encodeWav(r.channels.length === 2 ? r.channels : r.channels[0], r.sampleRate)))}`;
    return out;
  }

  // ---- the actions ----
  const actions = {
    'assets.list': async (filter) => {
      const f = filtersOf(filter, 'loadout.assets.list(filter)');
      const rows = narrowed(await lib.core(), await everyRow(), f);
      return { ok: true, total: rows.length, assets: plain(rows) };
    },

    'assets.get': async (id) => {
      const a = await find(idOf(id, 'loadout.assets.get(id)'));
      if (!a) throw noAsset(id);
      const asset = plain(a.row);
      if (a.kind === 'sprite') {
        const [S, def] = await Promise.all([lib.sprite(), defOf(a)]);
        asset.controls = Object.entries(def.params).map(([key, d]) => plain({ key, kind: d.kind, label: d.label, default: d.def, min: d.min, max: d.max, step: d.step, low: d.lo || undefined, high: d.hi || undefined, options: d.options?.map((o) => o.value), swatches: d.swatches, group: d.group, when: d.when, part: S.partOf(def, key)?.name }));
        asset.clips = Object.entries(def.clips).map(([name, c]) => ({ name, label: c.label, frames: c.frames, loop: c.loop }));
        asset.preview = def.preview;
        asset.styles = (await lib.styles()).stylesOf(def);        // the ways it can be drawn and exported, best first (a catalogue built before styles has no such field)
      } else {
        const patch = await patchOf(a);
        if (!patch) throw noAsset(id);
        asset.controls = list(patch.params).map((d) => plain({ key: d.id, kind: d.options ? 'choice' : 'range', label: d.label, default: d.default, min: d.min, max: d.max, step: d.step, unit: d.unit, options: d.options }));
        asset.styles = Object.keys(patch.presets ?? {});
      }
      if (a.entry) asset.verdict = plain(a.entry.verdict);
      return { ok: true, asset };
    },

    'assets.search': async (text, filters) => {
      if (typeof text !== 'string') throw new Problem(`loadout.assets.search(text, filters) takes the words to look for as text, for example "sword". Got ${say(text)}.`);
      const f = filtersOf(filters, 'loadout.assets.search(text, filters)', ['limit']);
      const limit = f.limit ?? 30;
      if (!(Number.isInteger(limit) && limit >= 1)) throw new Problem(`filters.limit must be a whole number, 1 or more. Got ${say(f.limit)}.`);
      const [c, core, b] = await Promise.all([lib.catalog(), lib.core(), lib.browse()]);
      let rows = (await b.finder.ranked(text)).map((id) => c.assetById(id)).filter(Boolean);
      const mine = runtimeRows();
      // assets made on this visit are not in the search file: match them by their words and put them first
      if (mine.length) rows = [...(text.trim() ? core.createKeywordIndex(mine).search(text, { limit: mine.length }).map((h) => mine.find((r) => r.id === h.id)).filter(Boolean) : mine), ...rows];
      rows = narrowed(core, rows, f);
      return { ok: true, total: rows.length, assets: plain(rows.slice(0, limit)) };
    },

    'assets.similar': async (id, count) => {
      const a = await find(idOf(id, 'loadout.assets.similar(id, count)'));
      if (!a) throw noAsset(id);
      const n = count ?? 6;
      if (!(Number.isInteger(n) && n >= 1 && n <= 50)) throw new Problem(`count must be a whole number from 1 to 50. Got ${say(count)}.`);
      const rows = await everyRow();
      const ids = a.entry ? (await lib.core()).similarByMeta(rows, id, n) : await (await lib.browse()).finder.similar(id, n);
      return { ok: true, id, assets: plain(ids.map((x) => rows.find((r) => r.id === x)).filter((r) => r && r.id !== id).slice(0, n)) };
    },

    'assets.remove': async (id) => {
      idOf(id, 'loadout.assets.remove(id)');
      await restore();
      const entry = runtime.get(id);
      const c = await lib.catalog();
      if (!entry) throw c.assetById(id) ? new Problem(`"${id}" is a catalogue asset. Only assets made on this visit can be removed.`) : noAsset(id);
      const { bag } = await lib.bag();
      const held = bag.items().filter((i) => i.id === id).map((i) => i.key);
      if (held.length) throw new Problem(`"${id}" is in the bag (item ${held.join(', ')}). Take it out first: loadout.bag.remove("${held[0]}").`);
      runtime.delete(id);
      letGo(entry);
      c.removeRuntimeAsset(id);
      if (entry.kind !== 'sprite') (await lib.audio()).removeSound(id);
      return { ok: true, id, kind: entry.kind };
    },

    'make.sprite': (source) => inTurn(async () => {
      const { sandbox, def } = await openMade(source, 'loadout.make.sprite(source)');
      const id = def.id;
      let kept = false;
      try {
        const c = await lib.catalog();
        const taken = c.currentCatalog().assets.find((x) => x.id === id), mine = runtime.get(id);
        if (taken) throw Object.assign(new Problem(`"${id}" is already an asset in the catalogue (a ${taken.kind}): give the new sprite an id of its own.`), { id });
        if (mine && mine.kind !== 'sprite') throw Object.assign(new Problem(`"${id}" is already a ${mine.kind} made on this visit: give the sprite an id of its own.`), { id });
        const { verdict } = await judge(sandbox, def);
        const { bag } = await lib.bag();
        const held = bag.items().filter((i) => i.id === id);
        // the bag exports what it stored: a failing version never takes the place of one that is in the bag
        if (!verdict.ok && held.length) return { id, kind: 'sprite', ...verdict, errors: [...verdict.errors, `"${id}" is in the bag, so this failing version was not kept: the bag keeps the version that passed. Fix the errors and make it again, or take it out of the bag first (loadout.bag.remove("${held[0].key}")).`], kept: false, replaced: false };
        const replaced = await keep({ id, kind: 'sprite', source, sandbox, def, verdict, row: await spriteRow(def, verdict) });
        kept = true;
        // bag items of it follow the newest version that passes
        if (replaced && verdict.ok) bag.redefine(id, { source });
        return { id, kind: 'sprite', ...verdict, kept: true, replaced };
      } catch (e) { throw e instanceof Problem && e.id === undefined ? Object.assign(e, { id }) : e; } finally { if (!kept) sandbox.stop(); }
    }),

    'make.sound': (input) => inTurn(async () => {
      let patch = input;
      if (typeof patch === 'string') { try { patch = JSON.parse(patch); } catch (e) { throw new Problem(`loadout.make.sound(patch): the text is not valid JSON (${messageOf(e)}).`); } }
      if (!isObj(patch)) throw new Problem(`loadout.make.sound(patch) takes a sound patch: an object { format, id, name, category, meta, duration, params, nodes, out } (the guide shows one in full). Got ${say(input)}.`);
      const id = patch.id;
      if (typeof id !== 'string' || !ID_RE.test(id)) throw new Problem(`The patch needs an "id" of lowercase letters, digits and dashes, starting with a letter (it is the asset's name on the site). Got ${say(id)}.`);
      patch = plain(patch);
      const kind = patch.category === 'music' ? 'music' : 'sound';
      const c = await lib.catalog();
      const taken = c.currentCatalog().assets.find((x) => x.id === id), mine = runtime.get(id);
      if (taken) throw Object.assign(new Problem(`"${id}" is already an asset in the catalogue (a ${taken.kind}): give the new sound an id of its own.`), { id });
      if (mine && mine.kind === 'sprite') throw Object.assign(new Problem(`"${id}" is already a sprite made on this visit: give the sound an id of its own.`), { id });
      const r = await work({ type: 'checkSound', patch }, kind === 'music' ? LIMITS.musicCheckMs : LIMITS.soundCheckMs);
      const verdict = verdictOf(r);
      // a patch the engine cannot run at all is not kept: there would be nothing to play
      if (!r.metrics?.valid) return { id, kind, ...verdict, kept: false, replaced: false };
      const { bag } = await lib.bag();
      const held = bag.items().filter((i) => i.id === id);
      if (!verdict.ok && held.length) return { id, kind, ...verdict, errors: [...verdict.errors, `"${id}" is in the bag, so this failing version was not kept: the bag keeps the version that passed. Fix the errors and make it again, or take it out of the bag first (loadout.bag.remove("${held[0].key}")).`], kept: false, replaced: false };
      const replaced = await keep({ id, kind, patch, verdict, row: await soundRow(patch, kind, verdict) });
      if (replaced && verdict.ok) bag.redefine(id, { patch });
      return { id, kind, ...verdict, kept: true, replaced };
    }),

    check: async (what) => {
      if (typeof what === 'string' && ID_RE.test(what)) {
        const a = await find(what);
        if (!a) throw noAsset(what);
        if (a.kind === 'sprite') {
          if (a.entry) { const { verdict, metrics } = await judge(a.entry.sandbox, a.entry.def); return { id: a.id, kind: a.kind, ...verdict, metrics }; }
          const r = await checkSpriteAt(at(a.row.src ?? `sprites/${a.id}.js`));
          return { id: a.id, kind: a.kind, ...verdictOf(r, { metrics: r.metrics }) };
        }
        const patch = await patchOf(a);
        if (!patch) throw noAsset(what);
        const r = await work({ type: 'checkSound', patch }, a.kind === 'music' ? LIMITS.musicCheckMs : LIMITS.soundCheckMs);
        return { id: a.id, kind: a.kind, ...verdictOf(r, { metrics: r.metrics }) };
      }
      if (typeof what === 'string') {
        // source text: read and checked in a worker of its own, which is stopped afterwards; nothing is kept
        const { sandbox, def } = await openMade(what, 'loadout.check(source)');
        try { const { verdict, metrics } = await judge(sandbox, def); return { id: def.id, kind: 'sprite', ...verdict, metrics }; } finally { sandbox.stop(); }
      }
      if (isObj(what) && typeof what.render === 'function') {
        // a definition built in the page by whoever is calling (with loadout.framework): it is their own page code, and its functions cannot be sent to a worker
        await pause();
        const r = await (await import('./api-worker.js')).runJob({ type: 'checkSprite', def: what, soundsUrl: at('generated/sounds.json'), sounds: runtimeSounds() });
        return { id: what.id ?? null, kind: 'sprite', ...verdictOf({ ...r, onPage: false }, { metrics: r.metrics }), warnings: [...words(r.warnings), 'A sprite definition handed over as an object is checked on the page itself, so the page was busy meanwhile. Hand over its source text, or make it first and check its id, to check it in the background.'] };
      }
      if (isObj(what)) {
        const patch = plain(what);
        const r = await work({ type: 'checkSound', patch }, patch.category === 'music' ? LIMITS.musicCheckMs : LIMITS.soundCheckMs);
        return { id: typeof patch.id === 'string' ? patch.id : null, kind: patch.category === 'music' ? 'music' : 'sound', ...verdictOf(r, { metrics: r.metrics }) };
      }
      throw new Problem(`loadout.check(idOrDefinition) takes an asset id ("knight"), a sprite's source text, or a sound patch object. Got ${say(what)}.`);
    },

    render: async (id, options) => {
      const a = await find(idOf(id, 'loadout.render(id, options)'));
      if (!a) throw noAsset(id);
      const sprite = a.kind === 'sprite';
      const o = optionsOf(options, `loadout.render("${id}", options)`, sprite ? ['clip', 'frame', 'scale', 'params', 'look', 'artStyle'] : ['params', 'style', 'seed', 'look', 'format', 'maxSeconds']);
      return sprite ? renderSprite(a, o) : renderSound(a, o);
    },

    'bag.add': async (id, settings) => {
      const a = await find(idOf(id, 'loadout.bag.add(id, settings)'));
      if (!a) throw noAsset(id);
      const { kept, warnings } = await settingsFor(a, settings, 'loadout.bag.add(id, settings)');
      // the quality bar applies to everything that goes in the bag: a draft with errors is refused (warnings do not block)
      if (a.entry && !a.entry.verdict.ok) throw new Problem(`"${id}" does not pass the quality bar yet, so it cannot go in the bag. Fix it and make it again under the same id. Its errors: ${a.entry.verdict.errors.join(' | ')}`);
      const { bag } = await lib.bag();
      // an asset made on this visit goes in with its whole definition, so the bag still has it after a reload
      const key = bag.add({ kind: a.kind, id, settings: kept, ...(a.entry ? { definition: definitionOf(a.kind, id) } : {}) });
      if (!bag.saved()) { bag.remove(key); throw new Problem(NOT_SAVED(`"${id}" was not added`)); }
      return { ok: true, key, count: bag.count(), item: plain(bag.get(key)), warnings };
    },

    'bag.items': async () => {
      await restore();
      const { bag } = await lib.bag();
      return { ok: true, count: bag.count(), items: plain(bag.items()).map((i) => { const st = stateOf(i); return st ? { ...i, state: st.state, ...(st.reason ? { reason: st.reason } : {}) } : i; }), look: plain(bag.theme()) };
    },

    'bag.remove': async (key) => {
      if (typeof key !== 'string' || !key) throw new Problem(`loadout.bag.remove(key) takes an item key such as "i3" (loadout.bag.items() lists them). Got ${say(key)}.`);
      const { bag } = await lib.bag();
      if (!bag.remove(key)) throw new Problem(`There is no bag item with the key "${key}". loadout.bag.items() lists the keys.`);
      return { ok: true, count: bag.count() };
    },

    'bag.update': async (key, settings) => {
      if (typeof key !== 'string' || !key) throw new Problem(`loadout.bag.update(key, settings) takes an item key such as "i3" (loadout.bag.items() lists them). Got ${say(key)}.`);
      const { bag } = await lib.bag();
      const item = bag.get(key);
      if (!item) throw new Problem(`There is no bag item with the key "${key}". loadout.bag.items() lists the keys.`);
      if (!isObj(settings)) throw new Problem(`loadout.bag.update(key, settings) takes the item's new settings as an object such as { params: { ... } }. Got ${say(settings)}.`);
      const a = await find(item.id);
      if (!a || a.kind !== item.kind) throw new Problem(`The bag item "${key}" is "${item.id}", which the site does not know right now${item.definition ? ' (it needs re-making)' : ''}, so its settings cannot be checked.`);
      const { kept, warnings } = await settingsFor(a, settings, 'loadout.bag.update(key, settings)');
      bag.update(key, kept);
      if (!bag.saved()) { bag.update(key, item.settings); throw new Problem(NOT_SAVED('The change was not kept')); }
      return { ok: true, key, item: plain(bag.get(key)), warnings };
    },

    'bag.clear': async () => {
      const { bag } = await lib.bag();
      const removed = bag.count();
      bag.clear();
      return { ok: true, count: bag.count(), removed };
    },

    'bag.link': async () => {
      needPage();
      await restore();
      const mod = await lib.bag(), { bag } = mod;
      if (!bag.count()) throw new Problem('The bag is empty, so there is nothing to link to. Add an asset first: loadout.bag.add("knight").');
      const link = `${win.location.origin}${win.location.pathname}${bag.toLink()}`;
      if (bag.madeCount() && link.length > mod.LINK_LIMIT) throw new Problem(`This bag is too long for a link: it holds ${bag.madeCount()} thing${bag.madeCount() === 1 ? '' : 's'} made on a visit, which travel with their whole source, and the link would be ${link.length.toLocaleString('en')} characters long. The most a link may be is ${mod.LINK_LIMIT.toLocaleString('en')} characters, because chat and mail apps cut longer ones short. Share the download instead (loadout.bag.download()): it holds everything, the sources too.`);
      return { ok: true, link, length: link.length, items: bag.count(), made: bag.madeCount() };
    },

    'bag.setLook': async (look) => {
      if (look !== undefined && look !== null && !isObj(look)) throw new Problem(`loadout.bag.setLook(look) takes a look object such as { colour: { hue: 40 } }, or nothing for the plain look. Got ${say(look)}.`);
      const { bag } = await lib.bag();
      const before = bag.theme();
      bag.setTheme(look ?? {});
      if (!bag.saved()) { bag.setTheme(before); throw new Problem(NOT_SAVED('The look was not changed')); }
      return { ok: true, look: plain(bag.theme()), warnings: strays(look ?? {}, LOOK, 'a look') };
    },

    'bag.download': async (options) => {
      const o = optionsOf(options, 'loadout.bag.download(options)', ['save', 'data']);
      await restore();
      const { bag } = await lib.bag();
      const items = bag.items();
      if (!items.length) throw new Problem('The bag is empty, so there is nothing to download. Add an asset first: loadout.bag.add("knight").');
      needPage();
      // an item made on a visit that is not known to the site (it failed its check on arrival) is left out, and named
      const needsRemaking = items.filter((i) => { const st = stateOf(i); return st && st.state !== 'ready'; }).map((i) => i.id);
      if (needsRemaking.length === items.length) throw new Problem(`Nothing in the bag can be downloaded: ${needsRemaking.map((x) => `"${x}"`).join(', ')} ${needsRemaking.length === 1 ? 'needs' : 'need'} re-making (loadout.bag.items() says why). Make ${needsRemaking.length === 1 ? 'it' : 'them'} again, or take ${needsRemaking.length === 1 ? 'it' : 'them'} out of the bag.`);
      const [bundle, { zip }, ui] = await Promise.all([lib.bundle(), lib.zip(), lib.ui(), lib.sounds()]);
      const files = await bundle.packageFiles({ items, theme: bag.theme(), scale: 1 });
      const blob = zip(files);
      const name = 'loadout-package.zip';
      // what the package itself says it left out: a made sprite whose frames, as set up in the bag, failed the bar when they were about to be written
      let manifest = {};
      try { manifest = JSON.parse(new TextDecoder().decode(files.find((f) => f.name === 'manifest.json').data)); } catch { /* no list to read */ }
      const refused = list(manifest.refused);
      if (!list(manifest.assets).length) throw new Problem(`Nothing in the bag could be downloaded. ${refused.map((r) => `"${r.id}" (item ${r.key}) does not pass the quality bar as it is set up: ${r.reason}`).join(' ')}${needsRemaking.length ? ` Needing re-making: ${needsRemaking.join(', ')}.` : ''}`);
      if (o.save !== false) ui.saveBlob(blob, name);
      const out = { ok: true, name, bytes: blob.size, saved: o.save !== false, files: files.map((f) => f.name), ...(needsRemaking.length ? { needsRemaking } : {}), ...(refused.length ? { refused } : {}) };
      if (o.data === true) out.zip = `data:application/zip;base64,${base64(new Uint8Array(await blob.arrayBuffer()))}`;
      return out;
    },

    go: async (route) => {
      if (typeof route !== 'string') throw new Problem(`loadout.go(route) takes a page of the site as text. ${ROUTES} Got ${say(route)}.`);
      let r = route.trim().replace(/^#/, '');
      if (!r.startsWith('/')) r = `/${r}`;
      const [path, query = ''] = r.split('?');
      const [page = '', id, ...rest] = path.split('/').filter(Boolean);
      if (r.startsWith('//') || /[\s"<>\\]/.test(r) || rest.length || !['', 'browse', 'bundles', 'sprite', 'sound', 'music', 'bundle', 'bag', 'play'].includes(page)) throw new Problem(`"${route}" is not a page of the site. ${ROUTES}`);
      if (['sprite', 'sound', 'bundle'].includes(page) && !id) throw new Problem(`"${route}" needs an id: "/${page}/<id>". ${ROUTES}`);
      if (id && page === 'bundle') {
        if (!(await lib.catalog()).bundleById(id)) throw new Problem(`There is no bundle "${id}". The bundles are: ${(await lib.catalog()).currentCatalog().bundles.map((b) => b.id).join(', ')}.`);
      } else if (id && ['sprite', 'sound', 'music'].includes(page)) {
        const a = await find(id);
        if (!a) throw noAsset(id);
        if ((page === 'sprite') !== (a.kind === 'sprite')) throw new Problem(`"${id}" is a ${a.kind}: its page is "/${a.kind}/${id}".`);
        if (a.kind !== 'sprite') await lib.sounds();          // the sound pages read the sound library
      }
      needPage();
      const hash = `#${path}${query ? `?${query}` : ''}`;
      win.location.hash = hash;
      return { ok: true, route: hash };
    },
  };

  // ---- settings and looks: what was understood, and what was ignored ----
  const NOT_SAVED = (what) => `${what}: the bag could not be saved, because this browser's storage for the site is full. Nothing was changed. Take something out of the bag, or download what is in it (loadout.bag.download()), and try again.`;
  /** Keys in `value` that `schema` does not name, as warnings, at every level the schema spells out. */
  function strays(value, schema, what) {
    const out = [];
    if (!isObj(value) || !isObj(schema?.properties)) return out;
    const known = Object.keys(schema.properties);
    for (const [k, v] of Object.entries(value)) {
      if (!known.includes(k)) out.push(`"${k}" is not part of ${what} and was ignored. ${what[0].toUpperCase()}${what.slice(1)} has: ${known.join(', ')}.`);
      else if (isObj(v)) out.push(...strays(v, schema.properties[k], `${what}'s "${k}"`));
      else { const names = schema.properties[k].oneOf?.[0]?.enum; if (names && v !== null && !names.includes(v)) out.push(`${say(v)} is not one of the choices for "${k}" and was ignored. The choices are: ${names.join(', ')}.`); }
    }
    return out;
  }
  const FOR_KIND = { sprite: ['params', 'cues', 'scale', 'artStyle'], sound: ['params', 'style', 'seed'], music: ['params', 'style'] };
  /** A bag item's settings for this asset, checked: { kept, warnings }. Anything that does not apply is left out and named. */
  async function settingsFor(a, settings, where) {
    if (settings !== undefined && settings !== null && !isObj(settings)) throw new Problem(`${where}: settings must be an object such as { params: { ... } }, or left out. Got ${say(settings)}.`);
    const given = settings ?? {}, allowed = FOR_KIND[a.kind], kept = {}, warnings = [];
    for (const [k, v] of Object.entries(given)) {
      if (allowed.includes(k)) kept[k] = v;
      else warnings.push(k in SETTINGS.properties ? `"${k}" does not apply to a ${a.kind} and was ignored. A ${a.kind}'s settings are: ${allowed.join(', ')}.` : `"${k}" is not a setting and was ignored. A ${a.kind}'s settings are: ${allowed.join(', ')}.`);
    }
    if (kept.params !== undefined && kept.params !== null && !isObj(kept.params)) throw new Problem(`${where}: params must be an object of settings by control key. Got ${say(kept.params)}.`);
    if (a.kind === 'sprite') {
      const [Y, def] = await Promise.all([lib.styles(), defOf(a)]);
      for (const k of Object.keys(kept.params ?? {})) if (!def.params[k]) warnings.push(`"${k}" is not one of this sprite's controls and was ignored. Its controls are: ${Object.keys(def.params).join(', ')}.`);
      // a sprite's art style (Contract 12) must be one it lists; its first is the same as none, so it is not stored
      if (kept.artStyle !== undefined && kept.artStyle !== null) { if (styleOf(Y, def, a.id, kept.artStyle) === Y.stylesOf(def)[0]) delete kept.artStyle; }
    } else {
      const patch = await patchOf(a), ids = list(patch?.params).map((d) => d.id), styles = Object.keys(patch?.presets ?? {});
      for (const k of Object.keys(kept.params ?? {})) if (!ids.includes(k)) warnings.push(`"${k}" is not one of this sound's controls and was ignored. Its controls are: ${ids.join(', ')}.`);
      if (kept.style !== undefined && kept.style !== null && !styles.includes(kept.style)) throw new Problem(`"${a.id}" has no style ${say(kept.style)}. ${styles.length ? `Its styles are: ${styles.join(', ')}.` : 'It has no named styles.'}`);
    }
    return { kept, warnings };
  }

  // ---- what the bag holds from a link or an earlier visit ----
  // A bag item of an asset made on a visit carries its definition. That text came from storage or from a link, so it is
  // not trusted: each one goes through the same worker, the same limits and the same quality bar as a sprite being made,
  // in the background, after the page has drawn. One that passes becomes known to the site. One that fails, or runs
  // over a limit, is remembered as "needs re-making": it stays in the bag, by name, and is neither drawn nor exported.
  const failed = new Map();        // the item's kind, id and definition -> { name, reason }
  const defKey = (item) => `${item.kind}\n${item.id}\n${textOf(item.kind, item.definition)}`;
  let busy = 0, queue = Promise.resolve(), listening = false;
  /** Where a bag item made on a visit stands: { state: 'ready' | 'checking' | 'needs re-making', name?, reason? }; null for a catalogue item. */
  function stateOf(item) {
    if (!item || !item.definition) return null;
    const entry = runtime.get(item.id);
    if (entry && sameDefinition(item, entry)) return entry.verdict.ok ? { state: 'ready', name: entry.row.name } : { state: 'needs re-making', name: entry.row.name, reason: entry.verdict.errors[0] ?? 'It does not pass the quality bar.' };
    const f = failed.get(defKey(item));
    if (f) return { state: 'needs re-making', ...f };
    if (entry) return { state: 'needs re-making', name: entry.row.name, reason: 'Another version of it was made on this visit. Take this one out of the bag and add the new one.' };
    return { state: 'checking' };
  }
  async function adopt() {
    const [{ bag }, c] = await Promise.all([lib.bag(), lib.catalog()]);
    let settled = 0;
    // sounds first: a sprite's check looks up the sounds its clips play
    const waiting = bag.items().filter((i) => i.definition);
    for (const item of [...waiting.filter((i) => i.kind !== 'sprite'), ...waiting.filter((i) => i.kind === 'sprite')]) {
      if (stateOf(item)?.state !== 'checking') continue;
      let name = item.id, sandbox = null, kept = false;
      busy++;
      try {
        if (c.currentCatalog().assets.some((a) => a.id === item.id)) throw new Problem('The catalogue has an asset with this id now.');
        if (item.kind === 'sprite') {
          const made = await openMade(item.definition.source, 'The bag');
          sandbox = made.sandbox;
          name = made.def.name;
          if (made.def.id !== item.id) throw new Problem(`Its source defines "${made.def.id}", not "${item.id}".`);
          const { verdict } = await judge(sandbox, made.def, { tips: false });
          if (!verdict.ok) throw new Problem(verdict.errors[0]);
          await keep({ id: item.id, kind: 'sprite', source: item.definition.source, sandbox, def: made.def, verdict, row: await spriteRow(made.def, verdict) });
          kept = true;
        } else {
          const patch = plain(item.definition.patch);
          if (typeof patch?.name === 'string') name = patch.name.slice(0, 80);
          const kind = patch?.category === 'music' ? 'music' : 'sound';
          if (!isObj(patch) || patch.id !== item.id || kind !== item.kind) throw new Problem(`Its patch does not define the ${item.kind} "${item.id}".`);
          const r = await work({ type: 'checkSound', patch }, kind === 'music' ? LIMITS.musicCheckMs : LIMITS.soundCheckMs);
          const verdict = verdictOf(r);
          if (!verdict.ok || !r.metrics?.valid) throw new Problem(verdict.errors[0] ?? 'The patch cannot be played.');
          await keep({ id: item.id, kind, patch, verdict, row: await soundRow(patch, kind, verdict) });
        }
      } catch (e) {
        const reason = e instanceof Problem ? (e.errors ?? [e.message])[0] : `It could not be checked (${messageOf(e)}).`;
        failed.set(defKey(item), { name: String(name), reason: forAgents(reason) });
      } finally { busy--; if (sandbox && !kept) sandbox.stop(); settled++; }
    }
    // whoever shows the bag (its page, the playground) draws again: an item is back, or is now known to need re-making
    if (settled) bag.touch();
  }
  /** From the first made asset on, the bag is told where definitions are (so every add stores one) and is watched for items that arrive unchecked. */
  async function watchBag() {
    const { bag } = await lib.bag();
    bagNow = bag;
    if (!listening) {
      listening = true;
      bag.setDefinitions(definitionOf);
      bag.onChange(() => { if (bag.items().some((i) => stateOf(i)?.state === 'checking')) restore().catch(() => {}); });
    }
    return bag;
  }
  /** Go through what the bag holds from a link or an earlier visit. Resolves when every such item has been settled. Safe to call again. */
  async function restore() {
    if (!doc) return;
    const bag = await watchBag();
    if (!bag.items().some((i) => stateOf(i)?.state === 'checking')) return queue;
    const go = () => inTurn(adopt);       // in turn with loadout.make, so the two never settle the same id at once
    queue = queue.then(go, go);
    return queue;
  }

  // an action never throws: whatever goes wrong inside comes back as { ok: false, errors }
  const safe = (fn) => async (...args) => {
    try { return await fn(...args); } catch (e) {
      const extra = e && typeof e.id === 'string' ? { id: e.id } : {};
      if (e instanceof Problem) return fail(e.errors ?? e.message, extra);
      if (e instanceof MadeError) return fail(e.message, extra);        // a made sprite's worker ran over a limit, or sent something wrong
      return fail(`Loadout could not finish this: ${messageOf(e)}`, extra);
    }
  };

  // window.loadout.studio (app/api-studio.js): loaded the first time a studio action is called
  const studio = once(async () => (await import('./api-studio.js')).createStudio({ window: win }));
  for (const a of ACTIONS) if (a.call.startsWith('studio.')) actions[a.call] = async (...args) => (await studio())[a.call.slice('studio.'.length)](...args);

  const loadout = {};
  for (const a of ACTIONS) {
    const [group, member] = a.call.split('.');
    if (member) (loadout[group] ??= {})[member] = safe(actions[a.call]); else loadout[group] = safe(actions[a.call]);
  }
  /** Any action by its tool name with one input object, as generated/api.json lists them: loadout.call('render', { id: 'coin', options: { scale: 4 } }). */
  loadout.call = safe(async (name, input) => {
    const a = ACTIONS.find((x) => x.name === name);
    if (!a) throw new Problem(`There is no action called ${say(name)}. The actions are: ${ACTIONS.map((x) => x.name).join(', ')}.`);
    if (input !== undefined && input !== null && !isObj(input)) throw new Problem(`${name} takes one input object${a.args.length ? ` with: ${a.args.join(', ')}` : ''}. Got ${say(input)}.`);
    const extra = Object.keys(input ?? {}).filter((k) => !a.args.includes(k));
    if (extra.length) throw new Problem(`${name} has no input called ${extra.map((k) => `"${k}"`).join(', ')}. ${a.args.length ? `Its inputs are: ${a.args.join(', ')}.` : 'It takes no input.'}`);
    return a.call.split('.').reduce((o, k) => o[k], loadout)(...a.args.map((k) => (input ?? {})[k]));
  });
  Object.defineProperty(loadout, 'framework', { get: framework, enumerable: true });
  Object.defineProperty(loadout, 'api', { get: api, enumerable: true });
  for (const group of ['assets', 'make', 'bag', 'studio']) Object.freeze(loadout[group]);      // not Object.values(loadout): reading framework or api starts their download
  Object.freeze(loadout);
  internals.set(loadout, {
    /** Go through what the bag holds from a link or an earlier visit; resolves when all of it is settled. Never rejects. */
    restore: () => restore().catch((e) => { console.warn('Loadout: what the bag holds from an earlier visit could not be gone through.', e); }),
    state: stateOf,
    /** Is this id a made item the bag holds that has not been settled yet? null when the bag has not been looked at. */
    pending: (id) => (bagNow ? bagNow.items().some((i) => i.id === id && stateOf(i)?.state === 'checking') : null),
    busy: () => busy > 0,
    /** A made sprite's own numbers: how its drawing through the worker went (requests, frames, hits, misses, ms). */
    stats: (id) => runtime.get(id)?.def?.stats?.() ?? null,
  });
  return loadout;
}
