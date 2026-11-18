// Long work for window.loadout that holds no made source: the quality bar on catalogue sprites and on sound
// patches (which are data), and rendering sounds. It runs in a background worker (this file is the worker's
// script) so that a check that takes seconds does not freeze the page; app/api-core.js also calls runJob directly
// where a browser has no module workers. A sprite made on a visit is never loaded here: it has a worker of its
// own (app/sandbox-worker.js), which only draws. Its quality bar runs here, on the frames that worker drew:
// the bar is handed a sprite that draws only supplied frames (suppliedSprite, app/made.js), says which settings it
// looked at and found no frames for, and is run again once those have been drawn and supplied, until it has
// seen everything it asks for. The made source never sees the bar, and the bar never sees the made source.

const list = (v) => (Array.isArray(v) ? v : []);
const messageOf = (e) => String((e && e.message) || e);
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? null : ArrayBuffer.isView(x) ? undefined : x))));

let soundLibrary = null;        // id -> patch, from generated/sounds.json; read once by whoever runs the jobs

// ---- the quality bar on a sprite made on a visit: judged from its frames --------------------------------------
const SITE = new URL('../', import.meta.url).href;
const checks = new Map();       // a check in progress: session -> { sprite (suppliedSprite), sounds }
/** A sprite that draws only supplied frames, from a checked description. imports: the site files its source imports. */
async function suppliedFor(description, styles, imports) {
  const [engine, Y, made] = await Promise.all([import('../engine/sprite.js'), import('../engine/styles.js'), import('./made.js')]);
  // An art style is framework code, defined by a site file the source imports. That file is loaded here (never the
  // source), so the bar knows the style too.
  if (list(styles).some((id) => !Y.styleById(id))) await Promise.all(list(imports).filter((u) => typeof u === 'string' && u.startsWith(SITE)).map((u) => import(u).catch(() => null)));
  const known = list(styles).filter((id) => Y.styleById(id));
  return made.suppliedSprite({ description, engine, styles: known.length ? known : ['pixel'] });
}
const barFor = async (sounds) => {
  const [{ checkSprite }, { validateMeta }] = await Promise.all([import('../quality/sprite.js'), import('../catalog/schema.js')]);
  return (def) => checkSprite(def, { soundIndex: Array.isArray(sounds) ? new Map(sounds) : undefined, validateMeta });
};

/** One job: { type: 'checkSprite', url | def, soundsUrl, sounds } | { type: 'checkMade', ... } | { type: 'checkLook', ... } | { type: 'checkSound', patch } | { type: 'renderSound', patch, ... }. */
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
  if (m.type === 'checkMade') {
    // { session, open: { description, styles, imports, sounds }, add: [{ params, style, clips }] } -> { missing } or { verdict }
    if (m.close) { checks.delete(m.session); return { closed: true }; }
    let c = checks.get(m.session);
    if (!c) {
      if (!m.open) throw new Error('This check was never started, or was given up.');
      c = { sprite: await suppliedFor(m.open.description, m.open.styles, m.open.imports), bar: await barFor(m.open.sounds) };
      checks.set(m.session, c);
    }
    for (const e of list(m.add)) c.sprite.supply(e);
    c.sprite.missing();
    const r = c.bar(c.sprite.def);
    const missing = c.sprite.missing();
    // it looked at settings it had no frames for: what it said this time does not count. They are drawn, and it runs again.
    if (missing.length) return { missing, settings: c.sprite.size(), ms: Math.round(performance.now() - t0) };
    checks.delete(m.session);
    return { verdict: { errors: r.errors, warnings: r.warnings, metrics: plain(r.metrics) }, settings: c.sprite.size(), ms: Math.round(performance.now() - t0) };
  }
  if (m.type === 'checkLook') {
    // One setting, exactly as a download is about to write it: { description, style, imports, clips, sounds }.
    // The bar is run on a sprite with no controls whose frames are these, so every rule about a frame, a clip and
    // a loop (an empty frame, pixels on the frame's edge, the size, the seam) is applied to what will be written.
    const cues = Object.fromEntries(Object.entries(m.description.sounds ?? {}).map(([clip, all]) => [clip, list(all).map(({ when, ...cue }) => cue)]));
    const sprite = await suppliedFor({ ...m.description, params: {}, parts: {}, sounds: cues, socketNames: null }, [m.style ?? 'pixel'], m.imports);
    sprite.supply({ params: {}, style: m.style ?? 'pixel', clips: m.clips });
    const r = (await barFor(m.sounds))(sprite.def);
    return { errors: r.errors, warnings: r.warnings, ms: Math.round(performance.now() - t0) };
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
