// Long work for window.loadout: the quality bar on sprites and on sound patches, and rendering sounds. It runs in a
// background worker (this file is the worker's script) so that a check that takes seconds does not freeze the page;
// app/api-core.js also calls runJob directly where a browser has no module workers. Only framework code is ever loaded
// here: a sprite file of the site itself, or a sprite that is data (a `loadout-sprite` definition, docs/data-sprites.md;
// Contract 15), which comes as plain data, is checked by catalog/sprite-schema.js and drawn by engine/data-sprite.js.
// Since build item B11 nothing made on a visit is code, so there is no other worker and no made source to keep away
// from the bar: the bar runs on the data sprite itself, as the build runs it on a library file.

const list = (v) => (Array.isArray(v) ? v : []);
const messageOf = (e) => String((e && e.message) || e);
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : ArrayBuffer.isView(x) ? undefined : x))));

let soundLibrary = null;        // id -> patch, from generated/sounds.json; read once by whoever runs the jobs

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/**
 * A data sprite from a definition (an object or its JSON text): the plain-data wall (catalog/sprite-schema.js), the pieces
 * it names loaded (engine/pieces.js), then engine/data-sprite.js makeDataSprite. Throws an Error with the checker's words.
 */
async function dataSpriteOf(input) {
  const [S, P, D] = await Promise.all([import('../catalog/sprite-schema.js'), import('../engine/pieces.js'), import('../engine/data-sprite.js')]);
  const wall = S.plainSpriteData(input);
  if (!wall.ok) throw new Error(`The sprite definition could not be read: ${wall.errors.slice(0, 6).join(' | ')}`);
  const value = wall.value;
  if (!isObj(value) || value.format !== 'loadout-sprite') throw new Error('That is not a sprite definition: one JSON object { "format": "loadout-sprite", "version": 2, ... }.');
  if (value.version === 2) {
    const got = await P.sitePieces().loadFor(value);
    if (!got.ok) throw new Error(`The pieces the sprite definition names could not be loaded: ${got.errors.slice(0, 6).join(' | ')}`);
  }
  const r = D.makeDataSprite(value);
  if (!r.ok) throw new Error(`The sprite definition does not pass its checks, so it cannot be drawn: ${r.errors.slice(0, 12).join(' | ')}`);
  return r.sprite;
}

/**
 * One job, by its type: { type: 'checkSprite', data | url | def, soundsUrl, sounds } (data: a sprite definition, object or
 * JSON text; url: a sprite file of this site, .js or a data file .json; def: a sprite object, on the page only),
 * { type: 'checkSound', patch } or { type: 'renderSound', patch, params, style, seed, maxSeconds, look }. Resolves to the
 * job's plain result; rejects with an Error whose message is written for the caller.
 */
export async function runJob(m) {
  const t0 = performance.now();
  if (m.type === 'checkSprite') {
    const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../quality/sprite.js'), import('../catalog/schema.js')]);
    let def = m.def;
    // a definition (a sprite made on a visit is data, build item B11): read and drawn by framework code
    if (!def && m.data !== undefined && m.data !== null) def = await dataSpriteOf(m.data);
    else if (!def) {
      // only a file of the site itself is ever loaded here
      if (typeof m.url !== 'string' || !/^https?:$/.test(new URL(m.url).protocol) || new URL(m.url).origin !== new URL(import.meta.url).origin) throw new Error('Only a sprite file of this site can be checked here.');
      // a data file (sprites/<id>.json; docs/data-sprites.md, build item B9c) is fetched and drawn by framework code, never imported
      const data = new URL(m.url).pathname.endsWith('.json');
      try { def = data ? await (await import('./catalog.js')).loadDataFile(m.url) : (await import(m.url)).default; } catch (e) { throw new Error(`The sprite could not be loaded for checking: ${messageOf(e)}`); }
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


if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  // jobs start in the order they arrive (a check is one unbroken stretch of work)
  globalThis.onmessage = async (e) => {
    const { job, ...m } = e.data;
    try {
      const result = await runJob(m);
      globalThis.postMessage({ job, result }, [...new Set(list(result.channels).map((ch) => ch.buffer))]);
    } catch (err) { globalThis.postMessage({ job, error: messageOf(err) }); }
  };
}
