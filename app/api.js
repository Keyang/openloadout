// window.loadout: the framework and the site's high-level actions, for an agent that drives the live page
// (docs/architecture.md, Contract 11; the guide and the generated reference are in docs/framework-api.md).
//
//   const fw = await loadout.framework;                 // every framework module: fw.sprite.defineSprite, fw.fx.ring, ...
//   const api = await loadout.api;                      // generated/api.json: what exists, with descriptions
//   await loadout.assets.search('money', { kind: 'sprite' })
//   await loadout.make.sprite(sourceText)               // -> { id, ok, errors, warnings }: the quality bar's verdict
//   await loadout.render('coin', { clip: 'spin', scale: 4 })   // -> { ok, png: 'data:image/png;base64,...' }
//   await loadout.call('make_sound', { patch })         // the same actions by their tool name (what an MCP server does)
//
// What this file keeps to:
//   - Every action is async, returns plain data, and never throws: a bad input gives { ok: false, errors: ['...'] }.
//   - Nothing is loaded until it is used. This file has no static imports, so the home page pays for this file only;
//     the framework (generated/framework.js) and the list (generated/api.json) arrive on first use.
//   - The quality bar runs in a background worker, so a check that takes seconds does not freeze the page.
//   - ACTIONS below is the one list of actions. The build copies it into generated/api.json; createLoadout() builds
//     the object from the same names, and a unit test fails when the two disagree.
//
// This one file is loaded three ways: by the page (it installs window.loadout), as its own background worker
// (new Worker(import.meta.url): it answers check and render jobs), and by Node (the build and the unit tests read
// ACTIONS, maskSource and rewriteImports; nothing here touches a page until an action is called).
//
// Assets made with loadout.make are kept in a registry here and handed to app/catalog.js (addRuntimeAsset) and
// app/audio.js (addSound), so for the rest of the visit they have pages, go in the bag, play in the playground
// and are exported like catalogue assets. A bag item of one carries its whole definition (app/bag.js); when the
// site starts, restoreRuntime() brings the bag's made assets back from those definitions.

// ---- the actions, as an MCP server lists tools -------------------------------------------------------------
// name: the tool name. call: where it is on window.loadout. args: the properties of the input, in call order,
// so a caller with an input object does loadout.<call>(...args.map((a) => input[a])), or loadout.call(name, input).

const TEXT_OR_LIST = (what) => ({ oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: what });
const FILTERS = {
  kind: TEXT_OR_LIST('sprite, sound or music'),
  type: TEXT_OR_LIST('What it is: character, creature, tileset, prop, pickup, projectile, effect, background, ui, icon; or sfx, ambience, music, jingle'),
  role: TEXT_OR_LIST('What it is for in a game, as a path in the role tree: "characters/player", or "characters" for everything under it'),
  themes: TEXT_OR_LIST('fantasy, sci-fi, dungeon, forest, neutral and so on; a list means any of them'),
  gameTypes: TEXT_OR_LIST('platformer, turn-based-rpg, roguelike-action and so on'),
  view: TEXT_OR_LIST('sprites only: side, top-down, front or none'),
  bundle: TEXT_OR_LIST('A bundle id: only assets in that bundle'),
  runtime: { type: 'boolean', description: 'true: only assets made on this visit with make_sprite or make_sound; false: only catalogue assets' },
};
const ID = (what) => ({ type: 'string', description: what, pattern: '^[a-z][a-z0-9-]*$' });
const LOOK = { type: 'object', description: 'A whole-bundle look (Contract 7): { seed, colour: { hue, saturation, contrast, tint, tintAmount, palette, outline }, sound: { pitch, brightness }, music: { tempo, intensity }, shapes }. Parts left out stay neutral.', additionalProperties: true };

export const ACTIONS = [
  {
    name: 'assets_list', call: 'assets.list', args: ['filter'],
    description: 'List the assets on the site (sprites, sounds, music), with what each is for and its measured facts. Give a filter to narrow the list. Assets made on this visit are included and marked runtime: true.',
    inputSchema: { type: 'object', properties: { filter: { type: 'object', description: 'Leave out for everything.', properties: FILTERS, additionalProperties: false } }, additionalProperties: false },
  },
  {
    name: 'assets_get', call: 'assets.get', args: ['id'],
    description: 'Everything about one asset: its catalogue row plus its controls (the settings render and the bag accept), its clips or styles, and for an asset made on this visit its last quality verdict.',
    inputSchema: { type: 'object', properties: { id: ID('The asset id, for example "knight" or "coin-pickup"') }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'assets_search', call: 'assets.search', args: ['text', 'filters'],
    description: 'Find assets by words, best match first, the way the site\'s search box does. Filters narrow the result; filters.limit caps how many come back (30 unless given).',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to look for: "money", "sword swing", "boss music"' },
        filters: { type: 'object', properties: { ...FILTERS, limit: { type: 'integer', minimum: 1, maximum: 1000, description: 'How many results at most (30 unless given)' } }, additionalProperties: false },
      },
      required: ['text'], additionalProperties: false,
    },
  },
  {
    name: 'assets_similar', call: 'assets.similar', args: ['id', 'count'],
    description: 'The assets most like this one (same role, shared words, same bundle), best first.',
    inputSchema: { type: 'object', properties: { id: ID('The asset to start from'), count: { type: 'integer', minimum: 1, maximum: 50, description: 'How many (6 unless given)' } }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'assets_remove', call: 'assets.remove', args: ['id'],
    description: 'Forget an asset made on this visit with make_sprite or make_sound. Catalogue assets cannot be removed, and an asset that is in the bag has to be taken out of the bag first.',
    inputSchema: { type: 'object', properties: { id: ID('The id of an asset made on this visit') }, required: ['id'], additionalProperties: false },
  },
  {
    name: 'make_sprite', call: 'make.sprite', args: ['source'],
    description: 'Define a new sprite on this visit from source text: one ES module written exactly like a file in sprites/, importing the framework by its usual paths (\'../engine/sprite.js\', \'../engine/fx.js\', \'../rigs/humanoid.js\') and ending in "export default defineSprite({ ... })". The quality bar runs on it and its verdict comes back as { id, ok, errors, warnings }. From then on it behaves like a catalogue asset on this visit: it has a page, can be rendered, put in the bag and exported. One with errors is kept as a draft (it can be rendered and has a page, but cannot go in the bag): fix the source and make it again under the same id, which replaces it. The id must not be one the catalogue already uses.',
    inputSchema: { type: 'object', properties: { source: { type: 'string', minLength: 1, description: 'The module source text' } }, required: ['source'], additionalProperties: false },
  },
  {
    name: 'make_sound', call: 'make.sound', args: ['patch'],
    description: 'Define a new sound effect or music track on this visit from a synthesis patch (the JSON of a file in sounds/; music has "category": "music"). The quality bar runs on it and its verdict comes back as { id, ok, errors, warnings, notes }. From then on it behaves like a catalogue sound on this visit, and a sprite made afterwards can cue it by its id. One with errors is kept as a draft that cannot go in the bag; making the same id again replaces it. A music track takes minutes to check.',
    inputSchema: { type: 'object', properties: { patch: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'string' }], description: 'The patch object, or its JSON text' } }, required: ['patch'], additionalProperties: false },
  },
  {
    name: 'check', call: 'check', args: ['idOrDefinition'],
    description: 'Run the quality bar and return its verdict { ok, errors, warnings, metrics } without keeping anything: for an asset id (catalogue or made on this visit), for sprite source text, or for a sound patch.',
    inputSchema: { type: 'object', properties: { idOrDefinition: { oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }], description: 'An asset id, sprite source text, or a sound patch object' } }, required: ['idOrDefinition'], additionalProperties: false },
  },
  {
    name: 'render', call: 'render', args: ['id', 'options'],
    description: 'Draw or play an asset and return the result as data. A sprite gives a PNG data address of one frame, or of a whole clip in one row when frame is left out, with its size and how many pixels are drawn. A sound or music track gives a WAV data address, or its samples.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID('The asset id (catalogue or made on this visit)'),
        options: {
          type: 'object',
          properties: {
            clip: { type: 'string', description: 'Sprites: which animation (the preview clip unless given)' },
            frame: { type: 'integer', minimum: 0, description: 'Sprites: one frame, counted from 0. Leave out for every frame of the clip in one row' },
            scale: { type: 'integer', minimum: 1, maximum: 8, description: 'Sprites: whole-number pixel size (1 unless given)' },
            params: { type: 'object', additionalProperties: true, description: 'Settings for the asset\'s controls, by key (assets_get lists them). Left-out controls stay at their defaults' },
            look: LOOK,
            style: { type: 'string', description: 'Sounds: one of the sound\'s named styles' },
            seed: { type: 'integer', minimum: 1, description: 'Sounds: which take (1 unless given); another seed is another variation' },
            format: { type: 'string', enum: ['wav', 'samples'], description: 'Sounds: "wav" (a data address, the default) or "samples" (one list of numbers per channel)' },
            maxSeconds: { type: 'number', minimum: 0.05, description: 'Sounds: stop after this long' },
          },
          additionalProperties: false,
        },
      },
      required: ['id'], additionalProperties: false,
    },
  },
  {
    name: 'bag_add', call: 'bag.add', args: ['id', 'settings'],
    description: 'Put an asset in the visitor\'s bag with its settings: a catalogue asset, or one made on this visit that passes the quality bar (warnings do not block; a draft with errors is refused). An asset made on this visit goes in with its whole definition, so it is still in the bag after a reload. Returns the new item\'s key. The same asset may be added more than once with different settings.',
    inputSchema: {
      type: 'object',
      properties: {
        id: ID('The asset id'),
        settings: { type: 'object', additionalProperties: true, description: 'Sprite: { params, cues, scale }. Sound: { params, style, seed }. Music: { params, style }. Leave out for the asset as it comes' },
      },
      required: ['id'], additionalProperties: false,
    },
  },
  {
    name: 'bag_items', call: 'bag.items', args: [],
    description: 'What is in the bag: each item\'s key, kind, id and settings, and the look applied to the whole bag.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'bag_remove', call: 'bag.remove', args: ['key'],
    description: 'Take one item out of the bag by its key (bag_items lists the keys).',
    inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The item key, for example "i3"' } }, required: ['key'], additionalProperties: false },
  },
  {
    name: 'bag_set_look', call: 'bag.setLook', args: ['look'],
    description: 'Set the look applied to everything in the bag when it is downloaded, so the assets match. Leave look out to go back to the plain look.',
    inputSchema: { type: 'object', properties: { look: LOOK }, additionalProperties: false },
  },
  {
    name: 'bag_download', call: 'bag.download', args: ['options'],
    description: 'Build the bag as one zip package (sprite sheets, their JSON, WAV files, a manifest and a guide; for an asset made on this visit also its source) and start the browser download. Returns the file names and the size.',
    inputSchema: {
      type: 'object',
      properties: {
        options: {
          type: 'object',
          properties: {
            save: { type: 'boolean', description: 'false: build the package but do not start a download' },
            data: { type: 'boolean', description: 'true: also return the zip as a data address' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'go', call: 'go', args: ['route'],
    description: 'Open a page of the site: "/" (home), "/browse?kind=sprite", "/sprite/<id>", "/sound/<id>", "/music/<id>", "/bundle/<id>", "/bundles", "/bag", "/play".',
    inputSchema: { type: 'object', properties: { route: { type: 'string', description: 'The part of the address after "#"' } }, required: ['route'], additionalProperties: false },
  },
];

// ---- small things ---------------------------------------------------------------------------------------

const INTERNAL = Symbol('loadout internals');

/** The refusal every action uses: { ok: false, ...extra, errors: [...] }. errors: one message or a list. */
export const fail = (errors, extra = {}) => ({ ok: false, ...extra, errors: [].concat(errors) });

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

// ---- reading source text ------------------------------------------------------------------------------------

const REGEX_AFTER = /^(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

/**
 * Source text with every comment, and the inside of every string, template and regular expression, blanked out
 * (same length, same line breaks), so a pattern run over it only ever matches code.
 * Returns { code, strings }: strings lists the quoted strings as { start, end, value } (positions of the quotes).
 */
export function maskSource(text) {
  const src = String(text), n = src.length, out = src.split(''), strings = [];
  const blank = (a, b) => { for (let k = a; k < b && k < n; k++) if (out[k] !== '\n') out[k] = ' '; };
  const templates = [];           // brace depth at each ${ we are inside
  let depth = 0, prev = '', word = '', i = 0;
  // from just after a ` or the } that ends a ${...}: blank up to the closing ` or the next ${
  const template = (from) => {
    let j = from;
    for (; j < n; j++) {
      if (src[j] === '\\') { j++; continue; }
      if (src[j] === '`') { blank(from, j); prev = 'a'; word = ''; return j + 1; }
      if (src[j] === '$' && src[j + 1] === '{') { blank(from, j); templates.push(depth); prev = '{'; word = ''; return j + 2; }
    }
    blank(from, n);
    return n;
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { let e = src.indexOf('\n', i); if (e < 0) e = n; blank(i, e); i = e; continue; }
    if (c === '/' && d === '*') { let e = src.indexOf('*/', i + 2); e = e < 0 ? n : e + 2; blank(i, e); i = e; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      j = Math.min(j, n);
      strings.push({ start: i, end: Math.min(j + 1, n), value: src.slice(i + 1, j) });
      blank(i + 1, j); i = j + 1; prev = 'a'; word = '';
      continue;
    }
    if (c === '`') { i = template(i + 1); continue; }
    if (c === '}' && templates.length && templates[templates.length - 1] === depth) { templates.pop(); i = template(i + 1); continue; }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || REGEX_AFTER.test(word))) {
      let j = i + 1, inClass = false, closed = false;
      for (; j < n && src[j] !== '\n'; j++) {
        if (src[j] === '\\') { j++; continue; }
        if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        else if (src[j] === '/' && !inClass) { closed = true; break; }
      }
      if (closed) { blank(i + 1, j); i = j + 1; while (i < n && /[a-z]/i.test(src[i])) i++; prev = 'a'; word = ''; continue; }
    }
    if (/[\w$]/.test(c)) { let j = i; while (j < n && /[\w$]/.test(src[j])) j++; word = src.slice(i, j); prev = 'a'; i = j; continue; }
    if (c === '{') depth++; else if (c === '}') depth--;
    if (!/\s/.test(c)) { prev = c; word = ''; }
    i++;
  }
  return { code: out.join(''), strings };
}

/**
 * Sprite source text names the framework by relative paths ('../engine/sprite.js'), which only work for a file
 * in sprites/. This rewrites every import address to a full one, as if the text were sprites/<id>.js, so the text
 * can be loaded as a module from memory. base: the address of sprites/; origin: the site's own origin.
 * An import from anywhere but this site is refused. Returns { ok, source, imports } or { ok: false, errors }.
 * This keeps a sprite's imports to the site's own files; it is not a sandbox (the source still runs in the page).
 */
export function rewriteImports(source, { base, origin } = {}) {
  if (typeof source !== 'string' || !source.trim()) return fail(`The source must be text: one ES module, written like a file in sprites/. Got ${say(source)}.`);
  const { code, strings } = maskSource(source);
  const at = new Map(strings.map((s) => [s.start, s]));
  const lineOf = (pos) => source.slice(0, pos).split('\n').length;
  const errors = [], found = [];
  const take = (pos) => { const s = at.get(pos); if (s) found.push(s); return s; };
  for (const m of code.matchAll(/(?<![.\w$])(?:import|export)\b[^;'"`()=]*?\bfrom\s*(?=['"])/g)) take(m.index + m[0].length);
  for (const m of code.matchAll(/(?<![.\w$])import\s*(?=['"])/g)) take(m.index + m[0].length);
  for (const m of code.matchAll(/(?<![.\w$])import\s*\(\s*/g)) {
    const s = at.get(m.index + m[0].length);
    if (s && /^\s*[),]/.test(code.slice(s.end))) found.push(s);
    else errors.push(`line ${lineOf(m.index)}: import() must name its file as plain text, for example import('../engine/fx.js'), so the address can be checked.`);
  }
  const usual = "a sprite imports this site's own files by path, for example '../engine/sprite.js'";
  const edits = [];
  for (const s of found) {
    const spec = s.value, where = `line ${lineOf(s.start)}: cannot import "${spec}"`;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(spec)?.[1].toLowerCase();
    if (scheme && scheme !== 'http' && scheme !== 'https') { errors.push(`${where}: ${scheme}: addresses are not allowed; ${usual}.`); continue; }
    if (!scheme && !/^(\.{1,2}\/|\/)/.test(spec)) { errors.push(`${where}: it is not a path; ${usual}.`); continue; }
    let url;
    try { url = new URL(spec, base); } catch { errors.push(`${where}: it is not an address; ${usual}.`); continue; }
    if (url.origin !== origin) { errors.push(`${where}: it is on another site (${url.origin}); ${usual}.`); continue; }
    edits.push({ s, href: url.href });
  }
  if (errors.length) return fail(errors);
  edits.sort((a, b) => a.s.start - b.s.start);
  let out = '', last = 0;
  for (const { s, href } of edits) { out += source.slice(last, s.start + 1) + href; last = s.end - 1; }
  return { ok: true, source: out + source.slice(last), imports: edits.map((e) => e.href) };
}

// ---- long work: the quality bar and sound rendering ------------------------------------------------------------
// runJob is what the background worker runs. The page calls it directly only where there is no worker.

let soundLibrary = null;        // id -> patch, from generated/sounds.json; read once by whoever runs the jobs

async function runJob(m) {
  const t0 = performance.now();
  if (m.type === 'checkSprite') {
    const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../quality/sprite.js'), import('../catalog/schema.js')]);
    let def = m.def;
    if (!def) {
      try { def = (await import(m.url)).default; } catch (e) { throw new Error(`The sprite could not be loaded for checking: ${messageOf(e)}`); }
    }
    let soundIndex;
    if (m.soundsUrl) {
      try {
        soundLibrary ??= await fetch(m.soundsUrl).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((f) => new Map(f.patches.map((p) => [p.id, p])));
        soundIndex = new Map(soundLibrary);
        for (const p of list(m.sounds)) soundIndex.set(p.id, p);
      } catch { soundLibrary = null; }
    }
    const r = checkSprite(def, { soundIndex, validateMeta });
    const warnings = soundIndex ? r.warnings : [...r.warnings, 'The sounds this sprite plays were not checked: the sound library (generated/sounds.json) could not be read.'];
    return { errors: r.errors, warnings, metrics: plain(r.metrics), ms: Math.round(performance.now() - t0) };
  }
  if (m.type === 'checkSound') {
    const [{ checkSound }, { validateMeta }] = await Promise.all([import('../quality/sound.js'), import('../catalog/schema.js')]);
    const r = checkSound(m.patch, { validateMeta });
    return { errors: r.errors, warnings: r.warnings, notes: r.notes ?? [], metrics: plain(r.metrics), ms: Math.round(performance.now() - t0) };
  }
  if (m.type === 'renderSound') {
    const { renderPatch, defaultParams } = await import('../sound/sfx-engine.js');
    const patch = m.patch;
    let params = { ...defaultParams(patch), ...((m.style && patch.presets && patch.presets[m.style]) || {}), ...(m.params || {}) };
    for (const d of list(patch.params)) { const v = Number(params[d.id]); params[d.id] = Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.default; }
    const opts = { seed: m.seed ?? 1, maxSeconds: m.maxSeconds || undefined };
    let r;
    if (m.look) {
      const th = await import('../sound/theme.js');
      params = th.themedSoundParams(patch, params, m.look);
      r = th.applySound(renderPatch(patch, { ...opts, params }), th.soundSettingsFor(patch, m.look));
    } else r = renderPatch(patch, { ...opts, params });
    const channels = r.channels && r.channels.length ? r.channels : [r.samples];
    let peak = 0;
    for (const ch of channels) for (let k = 0; k < ch.length; k++) { const a = ch[k] < 0 ? -ch[k] : ch[k]; if (a > peak) peak = a; }
    return { channels, sampleRate: r.sampleRate, duration: channels[0].length / r.sampleRate, loop: !!(r.loop ?? patch.loop), peak, params: plain(params), ms: Math.round(performance.now() - t0) };
  }
  throw new Error(`unknown job "${m.type}"`);
}

const WORK_LIMIT_MS = 10 * 60 * 1000;      // a music track's check takes minutes; nothing takes ten

/** run(job) -> Promise of its result, on a background worker when the browser has one, otherwise here after a pause. */
function createWorker(win, here) {
  let worker = null, next = 1, off = !win || typeof win.Worker !== 'function';
  const jobs = new Map();
  const here_ = async (msg) => { await pause(); return { ...(await runJob(msg)), onPage: true }; };
  const drop = () => { const waiting = [...jobs.values()]; jobs.clear(); for (const j of waiting) clearTimeout(j.timer); try { worker?.terminate(); } catch { /* gone already */ } worker = null; return waiting; };
  function start() {
    worker = new win.Worker(here, { type: 'module', name: 'loadout-checks' });
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
  return function run(msg) {
    if (off) return here_(msg);
    if (!worker) { try { start(); } catch { off = true; return here_(msg); } }
    return new Promise((resolve, reject) => {
      const job = next++;
      const timer = setTimeout(() => { for (const j of drop()) j.reject(new Problem(`The work took longer than ${WORK_LIMIT_MS / 60000} minutes and was stopped. A sprite whose render() never ends, or a sound of extreme length, does this.`)); }, WORK_LIMIT_MS);
      jobs.set(job, { msg, resolve, reject, timer });
      worker.postMessage({ job, ...msg });
    });
  };
}

// ---- window.loadout ---------------------------------------------------------------------------------------------

const FILTER_KEYS = Object.keys(FILTERS);
const ROUTES = 'Pages: "/" (home), "/browse?kind=sprite", "/sprite/<id>", "/sound/<id>", "/music/<id>", "/bundle/<id>", "/bundles", "/bag", "/play".';
const MAX_SOURCE = 400_000;       // characters; the largest sprite file in sprites/ is a tenth of this
const MAX_PICTURE = 16_000_000;   // pixels in one render

/**
 * Build the loadout object. env.window: the page (left out in Node, where everything that needs a page answers
 * { ok: false } instead). The page gets one, on window.loadout, when this file is loaded.
 */
export function createLoadout(env = {}) {
  const win = env.window ?? null;
  const doc = win?.document ?? null;
  const here = import.meta.url;
  const site = new URL('../', here);                 // the folder index.html is in
  const at = (p) => new URL(p, site).href;
  const work = createWorker(win, here);

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
  //         sprite: source (as given), url (the loaded module's address), def;   sound and music: patch }
  const runtime = new Map();
  const runtimeRows = () => [...runtime.values()].map((e) => e.row);
  /**
   * Keep an asset for the visit: in the registry, in the catalogue module (assetById / loadSprite / loadSound, and with
   * them the pages, the bag, the playground and the export) and, for a sound, in the sound library the pages play from.
   * An earlier one with the same id is replaced.
   */
  async function keep(entry) {
    const c = await lib.catalog();
    const earlier = runtime.get(entry.id);
    if (earlier && earlier.url !== entry.url) forget(earlier);
    if (earlier && earlier.kind !== 'sprite') (await lib.audio()).removeSound(entry.id);
    runtime.set(entry.id, entry);
    if (entry.kind !== 'sprite') (await lib.audio()).addSound(entry.patch);
    c.addRuntimeAsset(entry.row, entry.kind === 'sprite' ? entry.def : entry.patch);
    return !!earlier;
  }
  /** What a bag item of this asset carries: { source } or { patch }. null for a catalogue asset. */
  const definitionOf = (kind, id) => { const e = runtime.get(id); return e && e.kind === kind ? (kind === 'sprite' ? { source: e.source } : { patch: e.patch }) : null; };

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
    const entry = runtime.get(id);
    if (entry) return { id, kind: entry.kind, row: entry.row, entry };
    const c = await lib.catalog();
    const row = c.assetById(id);
    return row ? { id, kind: row.kind, row, entry: null } : null;
  }
  const everyRow = async () => [...(await lib.catalog()).currentCatalog().assets, ...runtimeRows()];
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
    const S = await lib.sprite();
    const p = S.defaultParams(def);
    const soundIds = [...new Set(Object.values(def.sounds ?? {}).flat().map((c) => c.sound))].sort();
    const clips = Object.entries(def.clips).map(([name, c]) => ({ name, label: c.label, frames: c.frames, loop: c.loop, fps: S.clipFps(def, name, p) }));
    const preview = clips.find((c) => c.name === def.preview) ?? clips[0];
    return {
      id: def.id, kind: 'sprite', name: String(def.name), description: String(def.blurb ?? ''), ...metaFields(def.meta, true), bundles: [], src: null,
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

  // ---- sprite source -> a loaded module ----
  /** Load sprite source text as a module. Returns { url, def }; the caller revokes url when it is done with it. */
  async function loadSource(source, where) {
    needPage();
    if (typeof source !== 'string' || !source.trim()) throw new Problem(`${where} takes the sprite's source text: one ES module written like a file in sprites/, ending in "export default defineSprite({ ... })". Got ${say(source)}.`);
    if (source.length > MAX_SOURCE) throw new Problem(`${where}: the source is ${source.length} characters long; the most a sprite may be is ${MAX_SOURCE}. Generic drawing code belongs in the framework, not in the sprite.`);
    const rewritten = rewriteImports(source, { base: at('sprites/'), origin: site.origin });
    if (!rewritten.ok) throw Object.assign(new Problem(''), { errors: rewritten.errors });
    const url = win.URL.createObjectURL(new win.Blob([rewritten.source], { type: 'text/javascript' }));
    let def;
    try { def = (await import(url)).default; } catch (e) {
      win.URL.revokeObjectURL(url);
      const kind = e && e.name === 'SyntaxError' ? 'The source is not valid JavaScript' : e && e.name === 'TypeError' && /import|module|fetch/i.test(messageOf(e)) ? 'A file the source imports could not be loaded' : 'The source stopped while it was being loaded';
      throw new Problem(`${kind}: ${messageOf(e)}`);
    }
    if (!isObj(def) || typeof def.render !== 'function' || !isObj(def.clips) || !isObj(def.params) || !def.parts || !def.sounds || !def.preview) {
      win.URL.revokeObjectURL(url);
      throw new Problem('The module\'s default export must be the sprite: end the source with "export default defineSprite({ id, name, size, pivot, params, clips, meta, render(g, { clip, t, p }) { ... } })" (defineSprite is in \'../engine/sprite.js\').');
    }
    return { url, def };
  }
  const forget = (entry) => { if (entry?.url) win?.URL.revokeObjectURL(entry.url); };
  const runtimeSounds = () => [...runtime.values()].filter((e) => e.patch).map((e) => e.patch);
  const verdictOf = (r, more = {}) => {
    const warnings = r.onPage ? [...r.warnings, 'This browser has no background worker for Loadout, so the check ran on the page itself and the page was busy meanwhile.'] : r.warnings;
    return { ok: r.errors.length === 0, errors: r.errors, warnings, ...(r.notes ? { notes: r.notes } : {}), ...more };
  };
  const checkSpriteAt = (url) => work({ type: 'checkSprite', url, soundsUrl: at('generated/sounds.json'), sounds: runtimeSounds() });

  // ---- drawing ----
  async function renderSprite(a, o) {
    needPage();
    const [S, def] = await Promise.all([lib.sprite(), defOf(a)]);
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
    const frames = o.frame === undefined || o.frame === null ? Array.from({ length: count }, (_, f) => f) : [o.frame];
    const [fw, fh] = def.size, W = frames.length * fw * scale, H = fh * scale;
    if (W * H > MAX_PICTURE) throw new Problem(`That picture would be ${W} by ${H} pixels. Ask for one frame, or a smaller scale.`);
    const px = new Uint32Array(W * H);
    let opaque = 0, last = performance.now();
    for (let n = 0; n < frames.length; n++) {
      let g;
      try { g = T ? T.renderThemedFrame(def, clip, frames[n], p, o.look) : S.renderFrame(def, clip, frames[n], p); } catch (e) { throw new Problem(`The sprite's render() failed on clip "${clip}", frame ${frames[n]}: ${messageOf(e)}`); }
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
    return { ok: true, id: a.id, kind: 'sprite', clip, frame: frames.length === 1 && o.frame !== undefined && o.frame !== null ? o.frame : null, frames: frames.length, fps: S.clipFps(def, clip, p), width: W, height: H, scale, opaque, params: plain(p), warnings, png: cv.toDataURL('image/png') };
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
      const entry = runtime.get(idOf(id, 'loadout.assets.remove(id)'));
      const c = await lib.catalog();
      if (!entry) throw c.assetById(id) ? new Problem(`"${id}" is a catalogue asset. Only assets made on this visit can be removed.`) : noAsset(id);
      const { bag } = await lib.bag();
      const held = bag.items().filter((i) => i.id === id).map((i) => i.key);
      if (held.length) throw new Problem(`"${id}" is in the bag (item ${held.join(', ')}). Take it out first: loadout.bag.remove("${held[0]}").`);
      runtime.delete(id);
      forget(entry);
      c.removeRuntimeAsset(id);
      if (entry.kind !== 'sprite') (await lib.audio()).removeSound(id);
      return { ok: true, id, kind: entry.kind };
    },

    'make.sprite': async (source) => {
      const { url, def } = await loadSource(source, 'loadout.make.sprite(source)');
      const id = def.id;
      try {
        const c = await lib.catalog();
        const taken = c.currentCatalog().assets.find((x) => x.id === id), mine = runtime.get(id);
        if (taken) throw Object.assign(new Problem(`"${id}" is already an asset in the catalogue (a ${taken.kind}): give the new sprite an id of its own.`), { id });
        if (mine && mine.kind !== 'sprite') throw Object.assign(new Problem(`"${id}" is already a ${mine.kind} made on this visit: give the sprite an id of its own.`), { id });
        const verdict = verdictOf(await checkSpriteAt(url));
        const replaced = await keep({ id, kind: 'sprite', source, url, def, verdict, row: await spriteRow(def, verdict) });
        // bag items of it follow the newest version that passes
        if (replaced && verdict.ok) (await lib.bag()).bag.redefine(id, { source });
        return { id, kind: 'sprite', ...verdict, kept: true, replaced };
      } catch (e) { if (runtime.get(id)?.url !== url) win.URL.revokeObjectURL(url); throw e; }
    },

    'make.sound': async (input) => {
      let patch = input;
      if (typeof patch === 'string') { try { patch = JSON.parse(patch); } catch (e) { throw new Problem(`loadout.make.sound(patch): the text is not valid JSON (${messageOf(e)}).`); } }
      if (!isObj(patch)) throw new Problem(`loadout.make.sound(patch) takes a sound patch: the object in a sounds/<id>.json file ({ format, id, name, category, meta, duration, params, nodes, out }). Got ${say(input)}.`);
      const id = patch.id;
      if (typeof id !== 'string' || !ID_RE.test(id)) throw new Problem(`The patch needs an "id" of lowercase letters, digits and dashes, starting with a letter (it is the asset's name on the site). Got ${say(id)}.`);
      patch = plain(patch);
      const kind = patch.category === 'music' ? 'music' : 'sound';
      const c = await lib.catalog();
      const taken = c.currentCatalog().assets.find((x) => x.id === id), mine = runtime.get(id);
      if (taken) throw Object.assign(new Problem(`"${id}" is already an asset in the catalogue (a ${taken.kind}): give the new sound an id of its own.`), { id });
      if (mine && mine.kind === 'sprite') throw Object.assign(new Problem(`"${id}" is already a sprite made on this visit: give the sound an id of its own.`), { id });
      const r = await work({ type: 'checkSound', patch });
      const verdict = verdictOf(r);
      // a patch the engine cannot run at all is not kept: there would be nothing to play
      if (!r.metrics?.valid) return { id, kind, ...verdict, kept: false, replaced: false };
      const replaced = await keep({ id, kind, patch, verdict, row: await soundRow(patch, kind, verdict) });
      if (replaced && verdict.ok) (await lib.bag()).bag.redefine(id, { patch });
      return { id, kind, ...verdict, kept: true, replaced };
    },

    check: async (what) => {
      if (typeof what === 'string' && ID_RE.test(what)) {
        const a = await find(what);
        if (!a) throw noAsset(what);
        if (a.kind === 'sprite') {
          const r = await checkSpriteAt(a.entry ? a.entry.url : at(a.row.src ?? `sprites/${a.id}.js`));
          return { id: a.id, kind: a.kind, ...verdictOf(r, { metrics: r.metrics }) };
        }
        const patch = await patchOf(a);
        if (!patch) throw noAsset(what);
        const r = await work({ type: 'checkSound', patch });
        return { id: a.id, kind: a.kind, ...verdictOf(r, { metrics: r.metrics }) };
      }
      if (typeof what === 'string') {
        const { url, def } = await loadSource(what, 'loadout.check(source)');
        try { const r = await checkSpriteAt(url); return { id: def.id, kind: 'sprite', ...verdictOf(r, { metrics: r.metrics }) }; } finally { win.URL.revokeObjectURL(url); }
      }
      if (isObj(what) && typeof what.render === 'function') {
        // a definition made in the page (loadout.framework.sprite.defineSprite): its functions cannot be sent to the worker
        await pause();
        const r = await runJob({ type: 'checkSprite', def: what, soundsUrl: at('generated/sounds.json'), sounds: runtimeSounds() });
        return { id: what.id ?? null, kind: 'sprite', ...verdictOf({ ...r, onPage: false }, { metrics: r.metrics }), warnings: [...r.warnings, 'A sprite definition handed over as an object is checked on the page itself, so the page was busy meanwhile. Hand over its source text, or make it first and check its id, to check it in the background.'] };
      }
      if (isObj(what)) {
        const patch = plain(what);
        const r = await work({ type: 'checkSound', patch });
        return { id: typeof patch.id === 'string' ? patch.id : null, kind: patch.category === 'music' ? 'music' : 'sound', ...verdictOf(r, { metrics: r.metrics }) };
      }
      throw new Problem(`loadout.check(idOrDefinition) takes an asset id ("knight"), a sprite's source text, or a sound patch object. Got ${say(what)}.`);
    },

    render: async (id, options) => {
      const a = await find(idOf(id, 'loadout.render(id, options)'));
      if (!a) throw noAsset(id);
      const sprite = a.kind === 'sprite';
      const o = optionsOf(options, `loadout.render("${id}", options)`, sprite ? ['clip', 'frame', 'scale', 'params', 'look'] : ['params', 'style', 'seed', 'look', 'format', 'maxSeconds']);
      return sprite ? renderSprite(a, o) : renderSound(a, o);
    },

    'bag.add': async (id, settings) => {
      const a = await find(idOf(id, 'loadout.bag.add(id, settings)'));
      if (!a) throw noAsset(id);
      if (settings !== undefined && settings !== null && !isObj(settings)) throw new Problem(`settings must be an object such as { params: { ... } }, or left out. Got ${say(settings)}.`);
      // the quality bar applies to everything that goes in the bag: a draft with errors is refused (warnings do not block)
      if (a.entry && !a.entry.verdict.ok) throw new Problem(`"${id}" does not pass the quality bar yet, so it cannot go in the bag. Fix it and make it again under the same id. Its errors: ${a.entry.verdict.errors.join(' | ')}`);
      const { bag } = await lib.bag();
      // an asset made on this visit goes in with its whole definition, so the bag still has it after a reload
      const key = bag.add({ kind: a.kind, id, settings: settings ?? {}, ...(a.entry ? { definition: definitionOf(a.kind, id) } : {}) });
      return { ok: true, key, count: bag.count(), item: plain(bag.get(key)) };
    },

    'bag.items': async () => {
      const { bag } = await lib.bag();
      return { ok: true, count: bag.count(), items: plain(bag.items()), look: plain(bag.theme()) };
    },

    'bag.remove': async (key) => {
      if (typeof key !== 'string' || !key) throw new Problem(`loadout.bag.remove(key) takes an item key such as "i3" (loadout.bag.items() lists them). Got ${say(key)}.`);
      const { bag } = await lib.bag();
      if (!bag.remove(key)) throw new Problem(`There is no bag item with the key "${key}". loadout.bag.items() lists the keys.`);
      return { ok: true, count: bag.count() };
    },

    'bag.setLook': async (look) => {
      if (look !== undefined && look !== null && !isObj(look)) throw new Problem(`loadout.bag.setLook(look) takes a look object such as { colour: { hue: 40 } }, or nothing for the plain look. Got ${say(look)}.`);
      const { bag } = await lib.bag();
      const known = Object.keys(bag.theme());
      const ignored = Object.keys(look ?? {}).filter((k) => !known.includes(k));
      bag.setTheme(look ?? {});
      return { ok: true, look: plain(bag.theme()), warnings: ignored.map((k) => `"${k}" is not part of a look and was ignored. A look has: ${known.join(', ')}.`) };
    },

    'bag.download': async (options) => {
      const o = optionsOf(options, 'loadout.bag.download(options)', ['save', 'data']);
      const { bag } = await lib.bag();
      const items = bag.items();
      if (!items.length) throw new Problem('The bag is empty, so there is nothing to download. Add an asset first: loadout.bag.add("knight").');
      needPage();
      const [bundle, { zip }, ui] = await Promise.all([lib.bundle(), lib.zip(), lib.ui(), lib.sounds()]);
      const files = await bundle.packageFiles({ items, theme: bag.theme(), scale: 1 });
      const blob = zip(files);
      const name = 'loadout-package.zip';
      if (o.save !== false) ui.saveBlob(blob, name);
      const out = { ok: true, name, bytes: blob.size, saved: o.save !== false, files: files.map((f) => f.name) };
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

  // ---- bringing back what the bag holds ----
  // A bag item of an asset made on a visit carries its definition. When the site starts, and whenever the bag gains
  // items (a shared link, another tab), those assets are made known again, without running the quality bar a second
  // time: they passed it to get into the bag. One whose definition no longer loads is left out and shown as missing.
  const lost = new Set();
  let busy = 0, queue = Promise.resolve(), listening = false;
  async function adopt() {
    const [{ bag }, c] = await Promise.all([lib.bag(), lib.catalog()]);
    for (const item of bag.items()) {
      if (!item.definition || runtime.has(item.id) || lost.has(item.id) || c.currentCatalog().assets.some((a) => a.id === item.id)) continue;
      const verdict = { ok: true, errors: [], warnings: ['Brought back from the bag and not checked again on this visit. loadout.check(id) checks it.'] };
      busy++;
      try {
        if (item.kind === 'sprite') {
          const { url, def } = await loadSource(item.definition.source, 'the bag');
          if (def.id !== item.id) { win.URL.revokeObjectURL(url); throw new Error(`its source defines "${def.id}"`); }
          await keep({ id: def.id, kind: 'sprite', source: item.definition.source, url, def, verdict, row: await spriteRow(def, verdict) });
        } else {
          const patch = item.definition.patch;
          const sound = (await lib.sfx()).validatePatch(patch);
          if (patch.id !== item.id || !sound.ok) throw new Error(sound.errors?.[0] ?? `its patch defines "${patch.id}"`);
          const kind = patch.category === 'music' ? 'music' : 'sound';
          await keep({ id: patch.id, kind, patch, verdict, row: await soundRow(patch, kind, verdict) });
        }
      } catch (e) {
        lost.add(item.id);
        console.warn(`Loadout: "${item.id}" in the bag was made on another visit and could not be brought back.`, e instanceof Problem ? (e.errors ?? [e.message]).join(' ') : e);
      } finally { busy--; }
    }
  }
  /** Make the bag's made assets known again. Resolves when every one has been tried. Safe to call again. */
  async function restore() {
    if (!doc) return;
    const { bag } = await lib.bag();
    if (!listening) {
      listening = true;
      bag.setDefinitions(definitionOf);
      bag.onChange(() => { if (bag.madeCount()) restore(); });
    }
    if (!bag.madeCount()) return;
    queue = queue.then(adopt, adopt);
    await queue;
  }

  // an action never throws: whatever goes wrong inside comes back as { ok: false, errors }
  const safe = (fn) => async (...args) => {
    try { return await fn(...args); } catch (e) {
      const extra = e && typeof e.id === 'string' ? { id: e.id } : {};
      if (e instanceof Problem) return fail(e.errors ?? e.message, extra);
      return fail(`Loadout could not finish this: ${messageOf(e)}`, extra);
    }
  };

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
  Object.defineProperty(loadout, INTERNAL, { value: { restore, restoring: () => busy > 0 } });
  for (const group of ['assets', 'make', 'bag']) Object.freeze(loadout[group]);      // not Object.values(loadout): reading framework or api starts their download
  return Object.freeze(loadout);
}

// ---- where this file is running --------------------------------------------------------------------------------

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  // the background worker: jobs start in the order they arrive (a check is one unbroken stretch of work)
  globalThis.onmessage = async (e) => {
    const { job, ...m } = e.data;
    try {
      const result = await runJob(m);
      globalThis.postMessage({ job, result }, [...new Set(list(result.channels).map((ch) => ch.buffer))]);
    } catch (err) { globalThis.postMessage({ job, error: messageOf(err) }); }
  };
} else if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.loadout) {
  window.loadout = createLoadout({ window });
}

const installed = () => (typeof window !== 'undefined' && window.loadout && window.loadout[INTERNAL]) || null;
/**
 * The site calls this once its catalogue is in, before it draws the first page: assets made on an earlier visit
 * that are in the bag are made known again from the definitions the bag holds. Resolves when that is done.
 */
export const restoreRuntime = () => Promise.resolve(installed()?.restore()).catch((e) => { console.warn('Loadout: what the bag holds from an earlier visit could not be brought back.', e); });
/** True while an asset from the bag is still being brought back (the bag page shows it as loading, not missing). */
export const restoringRuntime = () => !!installed()?.restoring();

