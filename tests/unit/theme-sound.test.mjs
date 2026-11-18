// Bundle-level customisation, the sound side (Contract 7): sound/theme.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { applySound, themedSoundParams, shouldResample, soundSettingsFor } from '../../sound/theme.js';
import { renderPatch, defaultParams } from '../../sound/sfx-engine.js';
import { analyze, spectrogram } from '../../sound/analyze.js';
import { defaultTheme } from '../../engine/theme.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../../sounds/${id}.json`, import.meta.url), 'utf8'));
const render = (id, params) => renderPatch(load(id), { params });
const peakOf = (r) => Math.max(...r.channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0)));
const centroid = (r) => analyze(r.samples, r.sampleRate).centroidHz.all;
const sameShape = (a, b) => assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());

/** A stereo render made from a mono one: the left side is the sound, the right a quieter, delayed copy. */
function stereoOf(r) {
  const n = r.samples.length, L = r.samples.slice(), R = new Float32Array(n);
  for (let i = 0; i < n; i++) R[i] = 0.6 * (i >= 300 ? r.samples[i - 300] : 0);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (L[i] + R[i]) * 0.5;
  return { ...r, samples: mono, channels: [L, R] };
}

const battle = load('battle-theme');
const pdef = (patch, id) => patch.params.find((d) => d.id === id);

test('neutral sound settings return identical samples in a new object', () => {
  const r = render('laser-shot');
  for (const s of [defaultTheme().sound, undefined, {}]) {
    const out = applySound(r, s);
    assert.notEqual(out, r);
    sameShape(out, r);
    assert.deepEqual(out.samples, r.samples);
    assert.equal(out.channels.length, 1);
    assert.deepEqual(out.channels[0], r.channels[0]);
    assert.equal(out.sampleRate, r.sampleRate);
    assert.equal(out.duration, r.duration);
  }
  const st = stereoOf(r);
  const out = applySound(st, { pitch: 0, brightness: 0 });
  assert.deepEqual(out.channels[1], st.channels[1]);
});

test('pitch +12 halves a sound effect within one sample; -12 doubles it', () => {
  for (const id of ['laser-shot', 'coin-pickup', 'explosion']) {
    const r = render(id);
    const n = r.samples.length;
    const up = applySound(r, { pitch: 12, brightness: 0 });
    sameShape(up, r);
    assert.ok(Math.abs(up.samples.length - n / 2) <= 1, `${id}: ${n} -> ${up.samples.length}`);
    assert.equal(up.channels[0].length, up.samples.length);
    assert.ok(Math.abs(up.duration - up.samples.length / up.sampleRate) < 1e-9);
    const down = applySound(r, { pitch: -12, brightness: 0 });
    assert.ok(Math.abs(down.samples.length - n * 2) <= 1);
    // Higher pitch really is higher.
    assert.ok(centroid(up) > centroid(r), `${id} pitch up should be brighter`);
  }
});

test('brightness +1 raises and -1 lowers the spectral centroid', () => {
  for (const id of ['explosion', 'whoosh', 'sword-slash', 'coin-pickup']) {
    const r = render(id);
    const c0 = centroid(r);
    const hi = centroid(applySound(r, { pitch: 0, brightness: 1 }));
    const lo = centroid(applySound(r, { pitch: 0, brightness: -1 }));
    assert.ok(hi > c0 * 1.1, `${id}: centroid ${c0.toFixed(0)} -> ${hi.toFixed(0)} with brightness +1`);
    assert.ok(lo < c0 * 0.85, `${id}: centroid ${c0.toFixed(0)} -> ${lo.toFixed(0)} with brightness -1`);
    // Half settings sit in between.
    const half = centroid(applySound(r, { pitch: 0, brightness: 0.5 }));
    assert.ok(half > c0 && half < hi);
  }
});

// Every sound effect in sounds/ (not music), rendered once with its defaults.
const SFX = readdirSync(new URL('../../sounds/', import.meta.url)).filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(new URL(`../../sounds/${f}`, import.meta.url), 'utf8')))
  .filter((p) => p.id && Array.isArray(p.params) && p.category !== 'music');
const SFX_RENDERS = SFX.map((p) => ({ id: p.id, r: renderPatch(p, {}) }));
const rmsOf = (r) => { let s = 0, n = 0; for (const c of r.channels) for (let i = 0; i < c.length; i++) { s += c[i] * c[i]; n++; } return Math.sqrt(s / n); };

test('brightness moves every sound effect the right way, further at the larger amount', () => {
  assert.ok(SFX_RENDERS.length >= 15, `found ${SFX_RENDERS.length} sound effects`);
  for (const { id, r } of SFX_RENDERS) {
    const c = (b) => centroid(applySound(r, { pitch: 0, brightness: b }));
    const c0 = centroid(r), d2 = c(-0.2), d4 = c(-0.4), u2 = c(0.2), u4 = c(0.4);
    const msg = `${id}: -0.4 ${d4.toFixed(0)}, -0.2 ${d2.toFixed(0)}, 0 ${c0.toFixed(0)}, +0.2 ${u2.toFixed(0)}, +0.4 ${u4.toFixed(0)}`;
    assert.ok(d4 < d2 && d2 < c0, `duller: ${msg}`);
    assert.ok(u4 > u2 && u2 > c0, `brighter: ${msg}`);
  }
});

test('brightness keeps loudness: RMS within 3 dB of the original for every sound effect', () => {
  for (const { id, r } of SFX_RENDERS) {
    const r0 = rmsOf(r);
    for (const b of [-1, -0.4, 0.4, 1]) {
      const out = applySound(r, { pitch: 0, brightness: b });
      const db = 20 * Math.log10(rmsOf(out) / r0);
      assert.ok(Math.abs(db) <= 3, `${id} brightness ${b}: RMS moved ${db.toFixed(2)} dB`);
      assert.ok(peakOf(out) <= 1, `${id} brightness ${b}: peak ${peakOf(out)}`);
    }
  }
});

/** Spectral centroid of the part of a sound below `maxHz`. */
function centroidBelow(samples, sr, maxHz) {
  const frames = spectrogram(samples, 1024, 256), hz = sr / 1024, top = Math.min(512, Math.floor(maxHz / hz));
  let num = 0, den = 0;
  for (const f of frames) for (let k = 1; k < top; k++) { const p = f[k] * f[k]; num += p * k * hz; den += p; }
  return num / den;
}

test('pitch +3 semitones raises the centroid of a noisy sound (whoosh)', () => {
  // Whoosh's air layer is noise high-passed at 5 kHz that runs flat to 22 kHz. Pitching up
  // by 2^(3/12) moves it all up 19%, and whatever would land past 22.05 kHz cannot exist, so
  // the whole-band centroid can only be compared fairly over what can survive the shift.
  const r = render('whoosh'), sr = r.sampleRate, ratio = 2 ** (3 / 12);
  const up = applySound(r, { pitch: 3, brightness: 0 });
  const survivable = centroidBelow(r.samples, sr, sr / 2 / ratio);
  const after = centroidBelow(up.samples, sr, sr / 2);
  assert.ok(after > survivable * 1.1, `whoosh centroid ${survivable.toFixed(0)} -> ${after.toFixed(0)}, a true shift gives x${ratio.toFixed(2)}`);
  // The swoosh band itself (below 8 kHz) moves up too.
  const b0 = centroidBelow(r.samples, sr, 8000), b1 = centroidBelow(up.samples, sr, 8000);
  assert.ok(b1 > b0 * 1.1, `below 8 kHz ${b0.toFixed(0)} -> ${b1.toFixed(0)}`);
  // And the top end is not smeared away: straight-line interpolation lost a fifth of the centroid.
  assert.ok(centroid(up) > centroid(r) * 0.88, `whole-band centroid ${centroid(r).toFixed(0)} -> ${centroid(up).toFixed(0)}`);
  const down = applySound(r, { pitch: -3, brightness: 0 });
  assert.ok(centroid(down) < centroid(r), `whoosh centroid ${centroid(r).toFixed(0)} -> ${centroid(down).toFixed(0)} at -3 semitones`);
});

test('no output sample goes past 1, in any setting, mono or stereo', () => {
  const settings = [{ pitch: 12, brightness: 1 }, { pitch: -7, brightness: 1 }, { pitch: 5, brightness: -1 }, { pitch: 0, brightness: 1 }];
  for (const id of ['explosion', 'punch', 'laser-shot', 'metal-hit']) {
    const r = render(id);
    for (const s of settings) for (const src of [r, stereoOf(r)]) {
      const out = applySound(src, s);
      assert.ok(peakOf(out) <= 1, `${id} ${JSON.stringify(s)}: peak ${peakOf(out)}`);
      for (const v of out.samples) assert.ok(Math.abs(v) <= 1 && Number.isFinite(v));
    }
  }
});

test('stereo stays stereo, and the mono mix follows the two sides', () => {
  const st = stereoOf(render('sword-slash'));
  const out = applySound(st, { pitch: 3, brightness: 0.4 });
  assert.equal(out.channels.length, 2);
  const n = out.samples.length;
  assert.equal(out.channels[0].length, n); assert.equal(out.channels[1].length, n);
  let diff = 0;
  for (let i = 0; i < n; i++) {
    assert.ok(Math.abs(out.samples[i] - (out.channels[0][i] + out.channels[1][i]) / 2) < 1e-6);
    diff += Math.abs(out.channels[0][i] - out.channels[1][i]);
  }
  assert.ok(diff > 1, 'the two sides are still different');
});

test('applySound does not change its input', () => {
  const r = render('whoosh');
  const copy = r.samples.slice();
  applySound(r, { pitch: 4, brightness: 0.8 });
  assert.deepEqual(r.samples, copy);
});

test('shouldResample: sound effects yes, music no', () => {
  assert.equal(shouldResample(load('laser-shot')), true);
  assert.equal(shouldResample(load('wind')), true);
  assert.equal(shouldResample(battle), false);
  // soundSettingsFor hands applySound the right settings for each.
  const theme = { ...defaultTheme(), sound: { pitch: 5, brightness: 0.3 } };
  assert.deepEqual(soundSettingsFor(load('laser-shot'), theme), { pitch: 5, brightness: 0.3 });
  assert.deepEqual(soundSettingsFor(battle, theme), { pitch: 0, brightness: 0.3 });
});

test('battle theme: tempo 1.1 raises the bpm control by 10% within its range', () => {
  const base = defaultParams(battle);
  const theme = { ...defaultTheme(), music: { tempo: 1.1, intensity: null } };
  const p = themedSoundParams(battle, base, theme);
  const d = pdef(battle, 'bpm');
  assert.ok(Math.abs(p.bpm - base.bpm * 1.1) < 0.01, `${base.bpm} -> ${p.bpm}`);
  assert.ok(p.bpm >= d.min && p.bpm <= d.max);
  // Past the end of the range it stops at the end.
  const fast = themedSoundParams(battle, { ...base, bpm: 185 }, theme);
  assert.equal(fast.bpm, d.max);
  // Everything else is left as it was.
  for (const k of Object.keys(base)) if (k !== 'bpm') assert.equal(p[k], base[k], k);
});

test('battle theme: intensity is set when the theme gives one', () => {
  const base = defaultParams(battle);
  assert.equal(themedSoundParams(battle, base, { ...defaultTheme(), music: { tempo: 1, intensity: 0.3 } }).intensity, 0.3);
  assert.equal(themedSoundParams(battle, base, { ...defaultTheme(), music: { tempo: 1, intensity: 5 } }).intensity, 1);
  assert.equal(themedSoundParams(battle, base, defaultTheme()).intensity, base.intensity);
});

test('battle theme: pitch moves the key control instead of resampling, staying in range', () => {
  const base = defaultParams(battle);
  const d = pdef(battle, 'key');
  const at = (pitch, key = 0) => themedSoundParams(battle, { ...base, key }, { ...defaultTheme(), sound: { pitch, brightness: 0 } }).key;
  assert.equal(at(3), 3);
  assert.equal(at(-2), -2);
  // Out of range: the same note an octave away, so the tune keeps its key.
  assert.equal(at(7), -5);
  assert.equal(at(12), 0);
  assert.equal(at(-7, 0), 5);
  for (let pitch = -12; pitch <= 12; pitch++) for (let key = d.min; key <= d.max; key++) {
    const k = at(pitch, key);
    assert.ok(k >= d.min && k <= d.max);
    assert.equal(((k - key - pitch) % 12 + 12) % 12, 0, `pitch ${pitch} from key ${key} gave ${k}`);
  }
});

test('values are clamped and snapped to the allowed values (bars, melody instrument)', () => {
  const p = themedSoundParams(battle, { bars: 13, inst: 2.6, space: 4, grit: -1 }, defaultTheme());
  assert.equal(p.bars, 16);
  assert.equal(p.inst, 3);
  assert.equal(p.space, pdef(battle, 'space').max);
  assert.equal(p.grit, 0);
  const q = themedSoundParams(battle, { bars: 400, inst: 9 }, { ...defaultTheme(), music: { tempo: 0.5, intensity: null } });
  assert.equal(q.bars, 32);
  assert.equal(q.inst, 4);
  assert.equal(q.bpm, pdef(battle, 'bpm').min);
  for (const d of battle.params) assert.ok(d.id in p, `${d.id} filled in`);
});

test('sound effects ignore tempo and key; their controls are only cleaned', () => {
  const laser = load('laser-shot');
  const base = defaultParams(laser);
  const t = { ...defaultTheme(), sound: { pitch: 7, brightness: 0 }, music: { tempo: 1.2, intensity: 1 } };
  assert.deepEqual(themedSoundParams(laser, base, t), base);
});

test('shapes on: sound effects pick one of their named styles from the seed', () => {
  const laser = load('laser-shot');
  const base = defaultParams(laser);
  const styles = Object.values(laser.presets);
  const on = (seed) => ({ ...defaultTheme(), seed, shapes: true });
  const seen = new Set();
  for (let seed = 0; seed < 40; seed++) {
    const p = themedSoundParams(laser, base, on(seed));
    assert.deepEqual(p, themedSoundParams(laser, base, on(seed)), 'same seed, same style');
    const match = styles.find((st) => Object.entries(st).every(([k, v]) => Math.abs(p[k] - v) < 1e-9));
    assert.ok(match, `seed ${seed} is not one of the named styles: ${JSON.stringify(p)}`);
    seen.add(styles.indexOf(match));
  }
  assert.ok(seen.size >= 2, 'different seeds reach different styles');
  // Music keeps its own controls with shapes on.
  assert.deepEqual(themedSoundParams(battle, defaultParams(battle), on(4)), defaultParams(battle));
  // A sound with no named styles is just cleaned.
  const plain = { ...laser, presets: undefined };
  assert.deepEqual(themedSoundParams(plain, base, on(4)), base);
});

test('applySound returns only the documented fields: nothing cached on the input (an audio buffer) comes along', () => {
  const r = render('coin-pickup');
  const withCache = { ...r, buffer: { fake: 'audio buffer of the unstyled sound' }, extra: 1 };
  for (const s of [{ pitch: 0, brightness: 0 }, { pitch: -2, brightness: -0.4 }, { pitch: 3 }]) {
    const out = applySound(withCache, s);
    assert.equal('buffer' in out, false);
    assert.equal('extra' in out, false);
    for (const k of Object.keys(out)) assert.ok(['samples', 'channels', 'sampleRate', 'duration', 'rawPeak', 'appliedGain', 'badSamples', 'loop'].includes(k), k);
    assert.equal(out.sampleRate, r.sampleRate);
    assert.equal(out.loop, r.loop);
    assert.equal(out.rawPeak, r.rawPeak);
  }
});

// ---- any spectrum: synthetic sounds that do not depend on which sounds exist --------------------

const SR = 44100;
function synth(kind) {
  const n = Math.round(SR * 0.5), x = new Float32Array(n);
  let seed = 12345;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 31 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.exp(-t * 6) * Math.min(1, i / 64);
    x[i] = kind === 'thump' ? Math.sin(2 * Math.PI * 60 * t) * env : rand() * env;
  }
  if (kind === 'high') {   // high-passed at 3 kHz, four poles: nothing left below 1 kHz to speak of
    for (let pass = 0; pass < 4; pass++) {
      const a = Math.exp((-2 * Math.PI * 3000) / SR);
      let y = 0;
      for (let i = 0; i < n; i++) { y = (1 - a) * x[i] + a * y; x[i] -= y; }
    }
  }
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] *= 0.6 / peak;
  return { samples: x, channels: [x], sampleRate: SR, duration: n / SR, loop: false };
}

for (const kind of ['high', 'thump', 'full']) {
  test(`any spectrum (${kind === 'high' ? 'noise above 3 kHz' : kind === 'thump' ? '60 Hz thump' : 'full-band burst'}): brightness keeps loudness within 3 dB, peak below 1, and moves the centroid in order`, () => {
    const r = synth(kind), r0 = rmsOf(r);
    const cs = [];
    for (const b of [-1, -0.4, 0, 0.4, 1]) {
      const out = b === 0 ? r : applySound(r, { pitch: 0, brightness: b });
      const db = 20 * Math.log10(rmsOf(out) / r0);
      assert.ok(Math.abs(db) <= 3, `${kind} brightness ${b}: RMS moved ${db.toFixed(2)} dB`);
      assert.ok(peakOf(out) < 1, `${kind} brightness ${b}: peak ${peakOf(out)}`);
      cs.push(centroid(out));
    }
    const msg = `${kind}: centroids at -1, -0.4, 0, 0.4, 1: ${cs.map((c) => c.toFixed(0)).join(', ')}`;
    for (let i = 1; i < cs.length; i++) assert.ok(cs[i] > cs[i - 1], msg);
    // "Duller" keeps the sound's own character: high noise stays mostly high.
    if (kind === 'high') assert.ok(cs[0] > 1500, msg);
  });
}

// ---- near-pure tones: a brighter look must sound brighter even with nothing up top to boost ------
// Margins. The spectral centroid tracks perceived brightness; differences of a few percent sit
// near the threshold of hearing a timbre change, so the full setting (+1) must move it by at
// least 20% (clearly audible) and the moderate one (+0.4) by at least 5%. Going duller can only
// take away partials above the lowest one, so the centroid can fall at most to the lowest partial:
// at -1 at least 40% of that headroom must go (a triangle has only ~1.5% of its power above the
// fundamental, so a fixed percentage would ask for the impossible), and -0.4 must sit in between.
// A pure sine has only one partial: nothing can be taken away, so it only has to not get brighter.

function tone(kind) {
  const n = Math.round(SR * 0.6), x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = Math.min(1, t / 0.005) * Math.exp(-t * 4);
    let v;
    if (kind === 'sine') v = Math.sin(2 * Math.PI * 880 * t);
    else if (kind === 'triangle') { const ph = (220 * t) % 1; v = 4 * Math.abs(ph - 0.5) - 1; }
    else v = Math.sin(2 * Math.PI * 1200 * t) + 0.5 * Math.exp(-t * 6) * Math.sin(2 * Math.PI * 3270 * t);   // a bell: two partials
    x[i] = 0.5 * v * env;
  }
  return { samples: x, channels: [x], sampleRate: SR, duration: n / SR, loop: false };
}

for (const kind of ['sine', 'triangle', 'bell']) {
  test(`near-pure tone (${kind === 'sine' ? '880 Hz sine' : kind === 'triangle' ? '220 Hz triangle' : 'two-partial bell'}): brighter is audibly brighter, duller is duller, loudness and peak kept`, () => {
    const r = tone(kind), r0 = rmsOf(r), c0 = centroid(r);
    const c = {};
    for (const b of [-1, -0.4, 0.4, 1]) {
      const out = applySound(r, { pitch: 0, brightness: b });
      const db = 20 * Math.log10(rmsOf(out) / r0);
      assert.ok(Math.abs(db) <= 3, `${kind} brightness ${b}: RMS moved ${db.toFixed(2)} dB`);
      assert.ok(peakOf(out) < 1, `${kind} brightness ${b}: peak ${peakOf(out)}`);
      assert.equal(out.samples.length, r.samples.length, 'brightness never changes the length (pitch untouched)');
      c[b] = centroid(out);
    }
    const msg = `${kind}: centroid ${c0.toFixed(0)}; -1 ${c[-1].toFixed(0)}, -0.4 ${c[-0.4].toFixed(0)}, +0.4 ${c[0.4].toFixed(0)}, +1 ${c[1].toFixed(0)}`;
    assert.ok(c[0.4] >= c0 * 1.05, `+0.4 at least 5% brighter: ${msg}`);
    assert.ok(c[1] >= c0 * 1.2, `+1 at least 20% brighter: ${msg}`);
    assert.ok(c[1] > c[0.4], `+1 brighter than +0.4: ${msg}`);
    if (kind === 'sine') {
      assert.ok(c[-0.4] <= c0 * 1.001 && c[-1] <= c0 * 1.001, `duller is never brighter: ${msg}`);
    } else {
      const f1 = kind === 'triangle' ? 220 : 1200, room = c0 - f1;
      assert.ok(c[-1] - f1 <= 0.6 * room, `-1 takes away at least 40% of the brightness above the lowest partial: ${msg}`);
      assert.ok(c[-0.4] < c0 && c[-0.4] > c[-1], `-0.4 sits between: ${msg}`);
    }
  });
}

test('the added brightness stays below the top of hearing range: no folded-back tones from a high pure tone', () => {
  // A 9 kHz tone: its octave (18 kHz) is fine, but anything made at 3x (27 kHz) would fold back to 17.1 kHz.
  const n = SR / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.4 * Math.sin(2 * Math.PI * 9000 * i / SR) * Math.min(1, i / 200);
  const r = { samples: x, channels: [x], sampleRate: SR, duration: n / SR, loop: false };
  const out = applySound(r, { pitch: 0, brightness: 1 });
  const frames = spectrogram(out.samples, 1024, 256), hz = SR / 1024;
  let main = 0, folded = 0;
  for (const f of frames) for (let k = 1; k < 512; k++) { const p = f[k] * f[k], fr = k * hz; if (Math.abs(fr - 9000) < 300) main += p; else if (fr > 16600 && fr < 17600) folded += p; }
  assert.ok(folded < main * 1e-3, `folded energy ${(10 * Math.log10(folded / main)).toFixed(1)} dB below the tone`);
});

test('a looping near-pure tone still wraps cleanly when brightened', () => {
  const n = 44100, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.4 * Math.sin(2 * Math.PI * 441 * (i / SR));   // 441 whole cycles: a seamless loop
  const r = { samples: x, channels: [x], sampleRate: SR, duration: n / SR, loop: true };
  const out = applySound(r, { pitch: 0, brightness: 1 }).samples;
  let maxStep = 0;
  for (let i = 1; i < out.length; i++) maxStep = Math.max(maxStep, Math.abs(out[i] - out[i - 1]));
  const seam = Math.abs(out[0] - out[out.length - 1]);
  assert.ok(seam <= maxStep * 1.05, `seam jump ${seam.toFixed(4)} vs largest step inside ${maxStep.toFixed(4)}`);
});
