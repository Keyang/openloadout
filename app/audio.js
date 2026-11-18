// Sound side of the site: loads the sound library, renders sounds with the
// synthesis engine, plays them through Web Audio and draws their waveforms.
import { renderPatch, defaultParams, createVoice } from '../sound/sfx-engine.js';
import { encodeWav } from '../sound/wav.js';
import { createPlayer } from '../sound/player.js';
import { store } from './ui.js';

export const sounds = [];      // sound effects
export const music = [];       // music loops (same patch format, category "music")
export const soundById = {};   // both, by id
export const isMusic = (patch) => patch.category === 'music';

export async function loadSounds() {
  const index = await (await fetch('sounds/index.json')).json();
  const list = await Promise.all(index.patches.map((e) => fetch('sounds/' + e.file).then((r) => r.json())));
  for (const patch of list) { (isMusic(patch) ? music : sounds).push(patch); soundById[patch.id] = patch; }
  sounds.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

// ---- parameters ------------------------------------------------------------

/** A parameter that is a set of choices, not a slider: named options, or a few evenly spaced values. */
export const isChoice = (d) => !!(d.options || d.step);
export const choicesOf = (d) => (d.options ? d.options.map((name, i) => ({ value: i, label: name }))
  : Array.from({ length: Math.round((d.max - d.min) / d.step) + 1 }, (_, i) => ({ value: d.min + i * d.step, label: `${d.min + i * d.step}${d.unit ? ' ' + d.unit : ''}` })));
const snap = (d, v) => (d.options ? Math.round(v) : d.step ? d.min + Math.round((v - d.min) / d.step) * d.step : v);
export const toValue = (d, u) => { const v = d.scale === 'log' ? d.min * Math.pow(d.max / d.min, u) : d.min + (d.max - d.min) * u; return snap(d, Number(v.toPrecision(4))); };
export const toUnit = (d, v) => (d.scale === 'log' ? Math.log(v / d.min) / Math.log(d.max / d.min) : (v - d.min) / (d.max - d.min));

/** Full parameter set: the sound's defaults, then a named style, then hand changes. */
export function soundParams(patch, preset, overrides) {
  const p = { ...defaultParams(patch), ...((preset && patch.presets && patch.presets[preset]) || {}), ...(overrides || {}) };
  for (const d of patch.params) p[d.id] = Math.min(d.max, Math.max(d.min, snap(d, Number(p[d.id]))));
  return p;
}

/** How long one pass of a sound is, in seconds, without rendering it. */
export const lengthOf = (patch, params) => createVoice(patch, { params }).duration;

export function randomSoundParams(patch) {
  const p = {};
  for (const d of patch.params) p[d.id] = toValue(d, Math.random());
  return p;
}

// ---- rendering -------------------------------------------------------------

const cache = new Map();
const keyOf = (patch, params, seed) => patch.id + '|' + seed + '|' + patch.params.map((d) => params[d.id]).join(',');
const remember = (key, r) => { if (cache.size > 240) cache.delete(cache.keys().next().value); cache.set(key, r); return r; };

/** Render (and remember) a sound. Returns { samples (mono mix), channels, sampleRate, duration, loop }. */
export function rendered(patch, params, seed = 1) {
  const key = keyOf(patch, params, seed);
  return cache.get(key) ?? remember(key, renderPatch(patch, { params, seed }));
}

// Music takes seconds to render, so it is built on a background thread.
let worker = null, jobId = 0;
const jobs = new Map();
/** Like rendered(), but off the main thread. Returns a promise. */
export function renderAsync(patch, params, seed = 1) {
  const key = keyOf(patch, params, seed);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (jobs.has(key)) return jobs.get(key).promise;
  if (!worker) {
    worker = new Worker(new URL('../sound/render-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const job = [...jobs.values()].find((j) => j.id === e.data.id);
      if (!job) return;
      jobs.delete(job.key);
      if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(remember(job.key, e.data.r));
    };
    worker.onerror = (e) => { for (const j of [...jobs.values()]) { jobs.delete(j.key); j.reject(new Error(e.message || 'the background renderer stopped')); } worker = null; };
  }
  const job = { id: ++jobId, key };
  job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
  jobs.set(key, job);
  worker.postMessage({ id: job.id, patch, params, seed });
  return job.promise;
}

export const wavBytes = (r) => new Uint8Array(encodeWav(r.channels && r.channels.length === 2 ? r.channels : r.samples, r.sampleRate));

// ---- playback --------------------------------------------------------------

let ctx = null, master = null;
export const soundState = { on: store.get('sound') !== 'off' };
export function setSoundOn(on) { soundState.on = on; store.set('sound', on ? 'on' : 'off'); if (!on) stopAll(); }

function context() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// Browsers only allow audio after a click or key press. Nothing plays before the first one;
// pages that want to start a loop as soon as audio is allowed listen for 'sf-audio-ready'.
let gesture = false;
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => {
  if (ctx && ctx.state === 'suspended') ctx.resume();
  if (!gesture) { gesture = true; window.dispatchEvent(new Event('sf-audio-ready')); }
}, { capture: true });

const live = new Set();
export function stopAll() { for (const h of [...live]) h.stop(); }

/** Play a rendered sound. Returns { stop(), startedAt, duration } or null when sound is off. */
export function playRendered(r, { loop = false, volume = 1, force = false, onended } = {}) {
  if (!force && (!soundState.on || !gesture)) return null;
  gesture = true;
  const c = context();
  if (!r.buffer) {
    const chans = r.channels ?? [r.samples];
    r.buffer = c.createBuffer(chans.length, chans[0].length, r.sampleRate);
    chans.forEach((ch, i) => r.buffer.copyToChannel(ch, i));
  }
  const src = c.createBufferSource(), gain = c.createGain();
  src.buffer = r.buffer; src.loop = loop;
  gain.gain.value = volume;
  src.connect(gain); gain.connect(master);
  const handle = {
    startedAt: c.currentTime, duration: r.duration, loop,
    now: () => c.currentTime,
    stop() { src.onended = null; live.delete(handle); try { src.stop(); } catch { /* already stopped */ } },
  };
  src.onended = () => { live.delete(handle); if (onended) onended(); };
  live.add(handle);
  src.start();
  return handle;
}

/**
 * Play a patch live, so its sliders can change while it plays (music).
 * Returns a promise of { set(id, value), stop() }. Only call from a click.
 */
let livePlayer = null;
export async function playLive(patch, params) {
  const c = context();
  gesture = true;
  if (!livePlayer) livePlayer = createPlayer({ context: c, destination: master, volume: 1 });
  const voice = await livePlayer.live(patch, params);
  const handle = { set: (id, v) => voice.set(id, v), stop() { live.delete(handle); voice.stop(); } };
  live.add(handle);
  return handle;
}

// ---- waveform pictures -----------------------------------------------------

/** Peak level in each of n slices of a sound, 0..1. */
export function peaks(samples, n) {
  const out = new Float32Array(n), step = samples.length / n;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = Math.floor(i * step), e = Math.min(samples.length, Math.floor((i + 1) * step) + 1); j < e; j++) { const a = Math.abs(samples[j]); if (a > m) m = a; }
    out[i] = m;
  }
  return out;
}

/** Blocky mirrored waveform, in whole pixels, centred on row cy. */
export function drawWave(g, samples, x, cy, w, h, colour, played = -1, playedColour = colour) {
  const pk = peaks(samples, w);
  for (let i = 0; i < w; i++) {
    const half = Math.max(1, Math.round(pk[i] * h / 2));
    g.fillStyle = i <= played ? playedColour : colour;
    g.fillRect(x + i, cy - half, 1, half * 2);
  }
}

// Card thumbnails render one sound at a time so the page stays responsive.
const queue = [];
let pumping = false;
export function whenRendered(patch, fn) {
  queue.push([patch, fn]);
  if (pumping) return;
  pumping = true;
  const pump = () => {
    const job = queue.shift();
    if (!job) { pumping = false; return; }
    try { job[1](rendered(job[0], soundParams(job[0]))); } catch (e) { console.error(`sound ${job[0].id}:`, e); }
    setTimeout(pump, 0);
  };
  setTimeout(pump, 0);
}
