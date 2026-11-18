// Long work for window.loadout that holds no made source: the quality bar on catalogue sprites and on sound
// patches (which are data), and rendering sounds. It runs in a background worker (this file is the worker's
// script) so that a check that takes seconds does not freeze the page; app/api-core.js also calls runJob directly
// where a browser has no module workers. A sprite made on a visit is never loaded here: it has a worker of its
// own (app/sandbox-worker.js).

const list = (v) => (Array.isArray(v) ? v : []);
const messageOf = (e) => String((e && e.message) || e);
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : ArrayBuffer.isView(x) ? undefined : x))));

let soundLibrary = null;        // id -> patch, from generated/sounds.json; read once by whoever runs the jobs

/** One job: { type: 'checkSprite', url | def, soundsUrl, sounds } | { type: 'checkSound', patch } | { type: 'renderSound', patch, ... }. */
export async function runJob(m) {
  const t0 = performance.now();
  if (m.type === 'checkSprite') {
    const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../quality/sprite.js'), import('../catalog/schema.js')]);
    let def = m.def;
    if (!def) {
      // only a file of the site itself is ever loaded here: a sprite made on a visit has a worker of its own
      if (typeof m.url !== 'string' || !/^https?:$/.test(new URL(m.url).protocol) || new URL(m.url).origin !== new URL(import.meta.url).origin) throw new Error('Only a sprite file of this site can be checked here.');
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
