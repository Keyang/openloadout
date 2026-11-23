// The twelve music styles ("bands" in code: sound/bands.js) and their voices (sound/voices.js), as designed in
// docs/music-styles.md, section 6. Everything is checked by measurement: nobody here can listen, so a person must
// still listen to each band's probe before a band is used for a track that ships.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice, renderPatch, validatePatch } from '../../sound/sfx-engine.js';
import { fft, fingerprint, fingerprintDistance } from '../../sound/analyze.js';
import * as analyze from '../../sound/analyze.js';
import * as compose from '../../sound/compose.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ---- taken before bands.js is loaded: what the kit's shared values and instruments() look like untouched -------------
const SHARED = ['INSTRUMENTS', 'DEFAULT_GAINS', 'INSTRUMENT_RANGES', 'LENGTHS', 'KEY_RANGE'];
const sharedBefore = Object.fromEntries(SHARED.map((k) => [k, structuredClone(compose[k])]));
const instrumentsBefore = JSON.stringify(compose.instruments('l', { gains: [1, 0.8, 1, 1, 1.5] }));
const kitNamesBefore = [...Object.keys(compose), 'writePatch', 'run', 'main'];
const voicesMod = await import('../../sound/voices.js');
const bandsMod = await import('../../sound/bands.js');
const kit = await import('../../tools/compose/kit.mjs');
const { BANDS, band, bandProbe } = bandsMod;
const V = voicesMod;
const { KitError, clock, chords, assemble, lint, melody, bus, matchGains } = compose;

// building a probe validates it, which takes a few seconds: each band's probe at its startGains is built once
const built = new Map();
const probe = (name) => { if (!built.has(name)) built.set(name, bandProbe(name)); return structuredClone(built.get(name)); };
const NAMES = ['chip', 'synthwave', 'orchestra', 'folk', 'musicbox', 'organ', 'twang', 'steelpan', 'lofi', 'darkambient', 'rock', 'marimba'];
const VOICES_SRC = fs.readFileSync(path.join(ROOT, 'sound', 'voices.js'), 'utf8');
const BANDS_SRC = fs.readFileSync(path.join(ROOT, 'sound', 'bands.js'), 'utf8');
const declared = (src) => [...src.matchAll(/^export\s+(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);

// ---- the drums, by whether they have a pitch (section 6) --------------------------------------------------------------
const PITCHED = ['kickDrum', 'tomDrum', 'handDrum', 'chipKick', 'timpani', 'dustyKick', 'heartbeat', 'metalHit', 'clave', 'cowbell', 'woodblock', 'logDrum'];
const UNPITCHED = ['snareDrum', 'hatDrum', 'clap', 'shaker', 'chipSnare', 'chipHat', 'gatedSnare', 'cymbalSwell', 'tambourine', 'mechanism', 'brushSnare', 'ride', 'rimClick', 'dustySnare', 'dustyHat', 'crackle', 'crash', 'guiro'];
const NEW_DRUMS = ['chipKick', 'chipSnare', 'chipHat', 'gatedSnare', 'timpani', 'cymbalSwell', 'tambourine', 'mechanism', 'brushSnare', 'ride', 'rimClick', 'clave', 'cowbell', 'dustyKick', 'dustySnare', 'dustyHat', 'crackle', 'heartbeat', 'metalHit', 'crash', 'woodblock', 'guiro', 'logDrum'];
const EXISTING_DRUMS_USED = ['kickDrum', 'snareDrum', 'hatDrum', 'tomDrum', 'clap', 'shaker', 'handDrum'];
const drumFn = (name) => V[name] || compose[name];
// compose.js's tomDrum and handDrum take the home note from the caller: here the home note is C
const drumCall = (name, id) => (name === 'handDrum' ? compose.handDrum(id, { trig: 'g', pitch: 'midi(48 + tr)' }) : name === 'tomDrum' ? compose.tomDrum(id, { trig: 'g', note: 48 }) : drumFn(name)(id, { trig: 'g' }));

// ---- every voice of voices.js, by kind: how to call it ------------------------------------------------------------------
const MELODIC = ['chipLead', 'sawLead', 'brassSection', 'tine', 'drawbarOrgan', 'twangGuitar', 'steelPan', 'electricPiano', 'glass', 'driveLead', 'marimba'];
const BASSES = ['triBass', 'lowStrings', 'lowTine', 'pedalBass', 'uprightBass', 'bassPan', 'warmBass', 'subDrone', 'rockBass', 'bassBar'];
const CHORDS = { chipArp: (id) => [{ id: 'aD', type: 'seq', trig: 'c16', loop: true, steps: '0' }, ...V.chipArp(id, { trig: 'g', pick: 'aD' })], stringSection: (id) => V.stringSection(id, { trig: 'g' }), strum: (id) => V.strum(id, { trig: 'g' }), mutedStrum: (id) => V.mutedStrum(id, { trig: 'g' }), powerChord: (id) => V.powerChord(id, { trig: 'g' }), drone: (id) => V.drone(id, { trig: 'g' }), wind: (id) => V.wind(id, { trig: 'g' }) };
const EFFECTS = {
  rotary: (id) => [{ id: 'src', type: 'expr', expr: 'sin(t*440*tau)*0.8' }, ...V.rotary(id, { input: 'src' })],
  spring: (id) => [{ id: 'src', type: 'expr', expr: 'sin(t*440*tau)*0.8' }, ...V.spring(id, { input: 'src' })],
  tape: (id) => [{ id: 'src', type: 'expr', expr: 'sin(t*440*tau)*0.8' }, ...V.tape(id, { left: 'src', right: 'src' })],
};
const BEDS = ['crackle', 'drone', 'wind', 'subDrone'];
const callVoice = (name, id, pitch = 'midi(57 + round(key))') => {
  if (MELODIC.includes(name)) return V[name](id, { trig: 'g', pitch });
  if (CHORDS[name]) return CHORDS[name](id);
  if (EFFECTS[name]) return EFFECTS[name](id);
  return drumCall(name, id);
};

// ---- playing one voice ----------------------------------------------------------------------------------------------------
const SR = 44100, BPM = 140, HIT = (4 * 60) / BPM / 4;   // the one hit is on the 5th 16th: 0.43 s in
function voicePatch(nodes, { chord = 'C', tonic = 'C', out } = {}) {
  const ids = nodes.map((n) => n.id);
  const o = out || (ids.includes('vO') ? 'vO' : ids.includes('vL') ? '(vL + vR)*0.5' : null);
  return {
    format: 'sfxpatch/0.1', id: 'probe', name: 'Probe', duration: 6,
    params: [{ id: 'bpm', label: 'Speed', min: 40, max: 200, default: BPM }, { id: 'key', label: 'Pitch', min: -5, max: 6, default: 0 }, { id: 'bright', label: 'Brightness', min: 0, max: 1, default: 0.6 }],
    nodes: [...clock(), ...chords(chord, { tonic }), { id: 'g', type: 'pattern', trig: 'c16', steps: `....X${'.'.repeat(507)}` }, ...nodes, { id: 'zzOut', type: 'expr', expr: o }],
    out: 'zzOut',
  };
}
function play(nodes, { chord, tonic, key = 0, seconds = 4, seed = 1, out } = {}) {
  const v = createVoice(voicePatch(nodes, { chord, tonic, out }), { sampleRate: SR, seed, params: { key } });
  const y = new Float64Array(Math.round(seconds * SR));
  for (let i = 0; i < y.length; i++) y[i] = v.tick();
  return y;
}
const at = (s) => Math.round(s * SR);
const maxAbs = (y, a = 0, b = y.length) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(y[i])); return m; };

/** The lowest partial of a stretch of sound, in Hz: the lowest spectral peak within 24 dB of the strongest, refined between bins. */
function lowestPartial(y, a, b, { floorDb = -24, exact = true } = {}) {
  const n = b - a, N = 1 << 17, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = y[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const mag = new Float64Array(N / 2);
  let top = 0;
  const k0 = Math.ceil((20 * N) / SR);
  for (let k = 0; k < N / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); if (k >= k0 && mag[k] > top) top = mag[k]; }
  const floor = top * 10 ** (floorDb / 20);
  // a partial is also the strongest thing near it: a side lobe of a stronger peak close by is not a partial
  const near = (k) => { let m = 0; for (let j = Math.floor(k / 1.3); j <= Math.min(N / 2 - 1, Math.ceil(k * 1.3)); j++) m = Math.max(m, mag[j]); return m; };
  for (let k = k0 + 1; k < N / 2 - 1; k++) {
    if (mag[k] >= floor && mag[k] >= mag[k - 1] && mag[k] >= mag[k + 1] && mag[k] >= 0.3 * near(k)) {
      const l = Math.log(mag[k - 1] + 1e-30), c = Math.log(mag[k]), r = Math.log(mag[k + 1] + 1e-30), d = (l - r) / (2 * (l - 2 * c + r) || 1);
      // a decaying partial next to a stronger one is pulled off by the other's skirt: refine in the time domain (not
      // for a chord, whose other notes are not multiples of the lowest one and would pull the refinement instead)
      const f = ((k + d) * SR) / N;
      return exact ? refine(y, a, b, refine(y, a, b, f)) : f;
    }
  }
  return NaN;
}
/**
 * A frequency made exact: the sound is turned down by f (multiplied by e^(-i 2 pi f t)) and averaged over two periods,
 * which removes every other partial (they land on multiples of f/2), and the phase that is left turns at the error.
 */
function refine(y, a, b, f) {
  const L = Math.round((2 * SR) / f), n = b - a;
  if (!(f > 0) || n < 3 * L) return f;
  const cr = new Float64Array(n + 1), ci = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const ph = (2 * Math.PI * f * i) / SR; cr[i + 1] = cr[i] + y[a + i] * Math.cos(ph); ci[i + 1] = ci[i] - y[a + i] * Math.sin(ph); }
  let sw = 0, st = 0, sp = 0, stt = 0, stp = 0, prev = null, unwrap = 0;
  for (let i = L; i <= n; i += Math.max(1, L >> 2)) {
    const re = cr[i] - cr[i - L], im = ci[i] - ci[i - L], w = Math.hypot(re, im);
    let p = Math.atan2(im, re);
    if (prev !== null) { while (p + unwrap - prev > Math.PI) unwrap -= 2 * Math.PI; while (p + unwrap - prev < -Math.PI) unwrap += 2 * Math.PI; }
    p += unwrap; prev = p;
    sw += w; st += w * i; sp += w * p; stt += w * i * i; stp += w * i * p;
  }
  const slope = (sw * stp - st * sp) / (sw * stt - st * st);   // radians per sample
  return Number.isFinite(slope) ? f + (slope * SR) / (2 * Math.PI) : f;
}
const midiOf = (hz) => 69 + 12 * Math.log2(hz / 440);
const centsFrom = (x, pcs) => Math.min(...pcs.map((p) => { const d = (((x - p) % 12) + 12) % 12; return Math.min(d, 12 - d) * 100; }));
/** The largest normalized autocorrelation over lags of 1 to 20 ms (a pitch from 50 Hz to 1 kHz). */
function pitchiness(y, a, b) {
  let r0 = 0; for (let i = a; i < b; i++) r0 += y[i] * y[i];
  let best = 0;
  for (let lag = Math.round(SR / 1000); lag <= Math.round(SR / 50); lag++) { let s = 0; for (let i = a; i + lag < b; i++) s += y[i] * y[i + lag]; best = Math.max(best, s / r0); }
  return best;
}

// ---- the registry ---------------------------------------------------------------------------------------------------------

test('the registry: twelve bands, each with every field, and a clear refusal for any other name', () => {
  assert.deepEqual(Object.keys(BANDS), NAMES);
  const FIELDS = ['name', 'label', 'tempo', 'checkTempo', 'defaults', 'room', 'range', 'roles', 'drums', 'bass', 'chords', 'lead', 'colour', 'finish', 'matchNode', 'startGains', 'mix', 'tags', 'words'];
  for (const name of NAMES) {
    const B = band(name);
    for (const f of FIELDS) assert.ok(f in B, `${name}: no ${f}`);
    const [lo, hi, typ] = B.tempo;
    assert.ok(lo >= 64 && lo < hi && typ >= lo && typ <= hi, `${name}: tempo ${B.tempo}`);
    assert.ok((32 * 240) / lo <= compose.MAX_SECONDS, `${name}: 32 bars at ${lo} bpm last too long`);
    assert.deepEqual(Object.keys(B.defaults).sort(), ['bright', 'inst', 'space']);
    assert.ok(compose.INSTRUMENTS.includes(B.defaults.inst), `${name}: default inst ${B.defaults.inst}`);
    assert.deepEqual(Object.keys(B.room).sort(), ['damp', 'size']);
    assert.equal(B.startGains.length, 5);
    assert.deepEqual(Object.keys(B.mix).sort(), ['bass', 'chords', 'drums', 'lead']);
    assert.ok(B.range[0] < B.range[1]);
    assert.ok(B.matchNode === 'lF' || B.colour, `${name}: matchNode ${B.matchNode} without a colour chain`);
    assert.equal(typeof B.drums, 'function'); assert.equal(typeof B.bass, 'function'); assert.equal(typeof B.chords, 'function'); assert.equal(typeof B.lead, 'function');
    assert.throws(() => B.checkTempo([lo - 1, hi, typ]), KitError);
    assert.deepEqual(B.checkTempo([lo, hi, typ]), [lo, hi, typ]);
  }
  assert.throws(() => band('nope'), (e) => e instanceof KitError && NAMES.every((n) => e.message.includes(n)));
  // a role the band has not got is refused by name
  assert.throws(() => band('musicbox').drums({ kick: 'kT' }), (e) => e instanceof KitError && /musicbox has no kick/.test(e.message) && /mechanism/.test(e.message));
  // only lofi has a finish
  assert.deepEqual(NAMES.filter((n) => band(n).finish), ['lofi']);
});

test('the probe of every band builds, validates and passes lint with nothing to say', () => {
  for (const name of NAMES) {
    const { patch, parts } = probe(name);
    assert.equal(validatePatch(patch).ok, true, name);
    assert.deepEqual(lint(patch), [], name);
    assert.deepEqual(Object.keys(patch.presets), ['calm', 'busy', 'full']);
    assert.deepEqual(Object.values(patch.presets).map((p) => p.intensity), [0.3, 0.7, 1]);
    assert.deepEqual(Object.keys(parts), ['drums', 'bass', 'chords', 'lead']);
    assert.ok(patch.tags.includes(name === 'musicbox' ? 'music box' : name === 'steelpan' ? 'steel pan' : name === 'darkambient' ? 'dark ambient' : name), `${name}: its name is in the tags`);
  }
});

const BANNED = ['acoustic', 'authentic', 'orchestral', 'real', 'live', 'vocal', 'vocals', 'choir', 'voice', 'voices'];
// instrument makers, consoles, products and model numbers: none may name or stand for a band
const BRANDS = ['yamaha', 'roland', 'korg', 'moog', 'fender', 'gibson', 'hammond', 'leslie', 'rhodes', 'wurlitzer', 'steinway', 'casio', 'akai', 'linn', 'linndrum', 'mellotron', 'zildjian', 'ludwig', 'nintendo', 'nes', 'famicom', 'gameboy', 'game boy', 'sega', 'atari', 'commodore', 'c64', 'sid', 'amiga', 'tr-808', '808', 'tr-909', '909', 'tb-303', '303', 'dx7', 'juno', 'jupiter', 'prophet', 'minimoog', 'stratocaster', 'telecaster', 'les paul'];
test('fair names: no band promises real instruments, voices or a brand', () => {
  for (const name of NAMES) {
    const B = band(name);
    for (const text of [B.label, ...B.tags, ...B.words]) {
      for (const w of [...BANNED, ...BRANDS]) {
        const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[-]/g, '\\-')}($|[^a-z0-9])`, 'i');
        assert.ok(!re.test(text), `${name}: "${text}" uses "${w}"`);
      }
    }
  }
});

// ---- every voice by itself -------------------------------------------------------------------------------------------------

const ALL_VOICES = declared(VOICES_SRC);
test('every voice of voices.js is covered by the tests below, and the drum lists are exactly the drums the bands use', () => {
  const covered = new Set([...MELODIC, ...BASSES, ...Object.keys(CHORDS), ...Object.keys(EFFECTS), ...NEW_DRUMS]);
  assert.deepEqual(ALL_VOICES.filter((n) => !covered.has(n)), [], 'a voice no test plays');
  assert.deepEqual(PITCHED.filter((n) => UNPITCHED.includes(n)), [], 'a drum in both lists');
  assert.deepEqual([...PITCHED, ...UNPITCHED].sort(), [...NEW_DRUMS, ...EXISTING_DRUMS_USED].sort());
  assert.equal(ALL_VOICES.length, 54);
});

test('every voice: silent before its row, sounding after it, finite, peak 0.5 to 1.5, DC under 2% of RMS, one-shot drums gone 2 s later', () => {
  for (const name of ALL_VOICES) {
    if (EFFECTS[name]) continue;
    const pitch = name === 'tine' || name === 'glass' ? 'midi(76)' : 'midi(64)';
    const y = play(callVoice(name, 'v', pitch), { seconds: 3 });
    assert.ok(y.every(Number.isFinite), `${name}: NaN or infinity`);
    assert.ok(maxAbs(y, 0, at(HIT) - 1) < 1e-6, `${name}: sounds before its row plays (${maxAbs(y, 0, at(HIT) - 1)})`);
    const peak = maxAbs(y, at(HIT));
    assert.ok(peak >= 0.5 && peak <= 1.5, `${name}: peak ${peak.toFixed(2)}, not about 1`);
    // DC over a second and a half of sound: over a shorter stretch a low note that starts at phase 0 reads as DC
    let sum = 0, sq = 0; const a = at(HIT), b = at(HIT + 1.5);
    for (let i = a; i < b; i++) { sum += y[i]; sq += y[i] * y[i]; }
    const rms = Math.sqrt(sq / (b - a));
    assert.ok(Math.abs(sum / (b - a)) < 0.02 * rms, `${name}: DC ${(100 * Math.abs(sum / (b - a)) / rms).toFixed(1)}% of RMS`);
    if (NEW_DRUMS.includes(name) && !BEDS.includes(name)) assert.ok(maxAbs(y, at(HIT + 2)) < 1e-3, `${name}: still ${maxAbs(y, at(HIT + 2)).toExponential(1)} two seconds after the hit`);
  }
  // effects: finite, and about as loud as what goes in
  for (const name of Object.keys(EFFECTS)) {
    const nodes = EFFECTS[name]('v'), ids = nodes.map((n) => n.id);
    const y = play(nodes, { seconds: 1, out: ids.includes('vO') ? 'vO' : '(vL + vR)*0.5' });
    assert.ok(y.every(Number.isFinite), name);
    const peak = maxAbs(y, at(0.5));
    assert.ok(peak >= 0.4 && peak <= 1.5, `${name}: peak ${peak.toFixed(2)} for an input of 0.8`);
  }
});

test('pitched voices land on pitch: melody voices within 15 cents at A3 and A4, and moved by exactly the Key control', () => {
  for (const name of MELODIC) {
    for (const [note, key] of [[57, 0], [69, 0], [57, 3]]) {
      const y = play(V[name]('v', { trig: 'g', pitch: `midi(${note} + round(key))` }), { key, seconds: 1.2 });
      const f = name === 'chipLead' ? lowestPartial(y, at(HIT + 0.005), at(HIT + 0.07)) : lowestPartial(y, at(HIT + 0.06), at(HIT + 0.5));   // chipLead: its notes are short
      const cents = 100 * (midiOf(f) - (note + key));
      assert.ok(Math.abs(cents) < 15, `${name} at MIDI ${note} with Key ${key}: ${f.toFixed(2)} Hz, ${cents.toFixed(1)} cents off`);
    }
  }
});

const UNDER = { C: [0, 4, 7], Am: [9, 0, 4] };
test('pitched drums and basses sound a tone of the chord under them, and move with the chord and the Key control', () => {
  const late = { chipKick: 0.07, dustyKick: 0.07, kickDrum: 0.08, heartbeat: 0.05, timpani: 0.1, tomDrum: 0.09, handDrum: 0.06 };
  for (const name of [...PITCHED, ...BASSES]) {
    const isBass = BASSES.includes(name);
    const nodes = isBass ? V[name]('v', { trig: 'g', note: 48 }) : drumCall(name, 'v');   // a bass an octave up: more cycles in a short note to measure
    for (const chord of ['C', 'Am']) for (const key of [0, 3]) {
      const y = play(nodes, { chord, key, seconds: isBass ? 2 : 1 });
      const from = HIT + (late[name] ?? (name === 'subDrone' ? 0.5 : isBass ? 0.06 : 0.003)), to = from + (name === 'woodblock' ? 0.05 : name === 'clave' ? 0.12 : 0.3);
      const f = lowestPartial(y, at(from), at(to));
      const tones = (isBass ? [UNDER[chord][0]] : UNDER[chord]).map((t) => t + key);
      const off = centsFrom(midiOf(f), tones);
      assert.ok(off < 15, `${name} under ${chord} with Key ${key}: ${f.toFixed(1)} Hz is ${off.toFixed(0)} cents from ${isBass ? 'the root' : 'every chord tone'}`);
    }
  }
});

test('every band plays in the track\'s key: its bass on the root, its chord voice and pitched drums on chord tones', () => {
  // in D, not C: a voice that took its note for the home note would land a tone off here
  for (const name of NAMES) {
    const B = band(name);
    const base = [{ id: 'nz', type: 'noise' }, { id: 'pK', type: 'seq', trig: 'c16', loop: true, steps: '0' }, { id: 'bF', type: 'seq', trig: 'c16', loop: true, steps: '7' }, { id: 'gT', type: 'expr', expr: 'g' }];
    const parts = [
      ['bass', [...base, ...B.bass('v', { trig: 'g', noise: 'nz' })], 'vO', true],
      // bass(id, { semis }) is honoured by every band: a row of 7 puts the bass on the fifth (A in D)
      ['bass on the fifth', [...base, ...B.bass('v', { trig: 'g', semis: 'bF', noise: 'nz' })], 'vO', 'fifth'],
      ['chords', [...base, ...B.chords('p', { trig: 'g', ...(B.takesPick ? { pick: 'pK' } : {}), noise: 'nz' })], name === 'darkambient' ? '(pdL + pdR)*0.5' : null, false],
      ...B.pitchedRoles.map((r) => [r, [...base, ...B.drums({ [r]: 'gT', noise: 'nz' })], 'gO', false]),
    ];
    for (const [part, nodes, out0, isBass] of parts) {
      const out = out0 || `(${nodes.at(-1).id === 'pR' || nodes.some((n) => n.id === 'pR') ? '(pL + pR)*0.5' : 'pO'})`;
      for (const key of [0, 3]) {
        const y = play(nodes, { chord: 'D', tonic: 'D', key, seconds: 1.6, out: out.replace(/^\((.*)\)$/, '$1') });
        const from = HIT + (name === 'darkambient' && isBass ? 0.6 : isBass ? 0.06 : part === 'chords' ? 0.01 : part === 'woodblock' || part === 'clave' ? 0.003 : part === 'timpani' ? 0.1 : 0.065);   // a drum: after its fall onto its note
        const f = lowestPartial(y, at(from), at(from + (part === 'woodblock' ? 0.05 : part === 'clave' ? 0.12 : 0.4)), { exact: part !== 'chords' });
        const tones = (isBass === 'fifth' ? [9] : isBass ? [2] : [2, 6, 9]).map((t) => t + key), off = centsFrom(midiOf(f), tones);
        // a chord voice is an ensemble tuned apart on purpose (pairs 10 cents either side, a chorus): 30 cents for it
        assert.ok(off < (part === 'chords' ? 30 : 15), `${name} ${part} in D with Key ${key}: ${f.toFixed(1)} Hz is ${off.toFixed(0)} cents from ${isBass === 'fifth' ? 'the fifth' : isBass ? 'the root' : 'every chord tone'}`);
      }
    }
  }
});

test('unpitched drums have no pitch: no stable repeat between 1 and 20 ms, where a pitched drum has one', () => {
  for (const name of UNPITCHED) {
    const y = play(drumCall(name, 'v'), { seconds: 1.2 });
    const p = pitchiness(y, at(HIT), at(HIT + 0.25));
    assert.ok(p < 0.35, `${name}: repeats itself (autocorrelation ${p.toFixed(2)}), so it has a pitch that can clash with a chord`);
  }
  for (const name of ['kickDrum', 'timpani', 'logDrum']) assert.ok(pitchiness(play(drumCall(name, 'v'), { seconds: 1 }), at(HIT + 0.1), at(HIT + 0.3)) > 0.6, `${name}: the measure finds a pitched drum's pitch`);
});

// ---- the convention ---------------------------------------------------------------------------------------------------------

test('the convention: name(id, { options }), one name per option, <id>O or <id>L and <id>R, a documented export, a clear refusal', () => {
  const FORBIDDEN = ['row', 'gate', 'hz', 'frequency', 'in', 'source', 'src', 'base', 'from', 'root', 'signal', 'pitches2'];
  for (const name of ALL_VOICES) {
    const m = new RegExp(`export function ${name}\\(id, \\{ ([^}]*) \\} = \\{\\}\\)`).exec(VOICES_SRC);
    assert.ok(m, `${name} is not name(id, { options })`);
    const opts = m[1].split(',').map((x) => x.trim().split(/\s*=/)[0]).filter(Boolean);
    for (const o of opts) assert.ok(!FORBIDDEN.includes(o), `${name}: option "${o}" has another name in the convention`);
    const doc = new RegExp(`/\\*\\*\\n((?: \\*[^\\n]*\\n)+?) \\*/\\nexport function ${name}\\(`).exec(VOICES_SRC);
    assert.ok(doc, `${name}: no doc comment directly above it`);
    assert.match(doc[1], /Arguments:/, `${name}: the doc comment lists no arguments`);
    assert.match(doc[1], /Returns/, `${name}: the doc comment says nothing about what it returns`);
    const ids = callVoice(name, 'v').map((n) => n.id);
    assert.ok(ids.includes('vO') || (ids.includes('vL') && ids.includes('vR')), `${name}: no vO, nor vL and vR (it makes ${ids.join(' ')})`);
    assert.ok(!ids.some((id) => /Out$/.test(id)), name);
    assert.equal(new Set(ids).size, ids.length, `${name}: a node id twice`);
    assert.throws(() => V[name]('v v', { trig: 'g', pitch: '440', input: 'x', left: 'x', right: 'x', pick: 'aD' }), (e) => e instanceof KitError && /letters and digits/.test(e.message), name);
    if (!EFFECTS[name]) assert.throws(() => V[name]('v', {}), (e) => e instanceof KitError && (name === 'chipArp' ? /pick/ : /trig/).test(e.message), `${name}: with nothing given, says what to give`);
  }
  for (const name of MELODIC) assert.throws(() => V[name]('v', { trig: 'g' }), (e) => e instanceof KitError && /pitch/.test(e.message), name);
  assert.throws(() => V.rotary('r', {}), /input/);
  assert.throws(() => V.spring('s', {}), /input/);
  assert.throws(() => V.tape('t', { left: 'mL' }), /right/);
  // the voices file says which band each voice was written for, and every voice is named there
  const head = VOICES_SRC.split('\nimport ')[0];
  for (const name of ALL_VOICES) assert.ok(new RegExp(`\\b${name}\\b`).test(head), `the header of voices.js does not list ${name}`);
});

test('no name clashes: voices.js and bands.js add names only, and the kit passes on every one, the same object', () => {
  const composeNames = Object.keys(compose), kitOwn = ['writePatch', 'run', 'main'], analyzeNames = Object.keys(analyze);
  const voicesOwn = declared(VOICES_SRC), bandsOwn = declared(BANDS_SRC);
  assert.deepEqual(voicesOwn.sort(), Object.keys(voicesMod).sort(), 'voices.js exports exactly what it declares');
  for (const n of voicesOwn) {
    assert.ok(!composeNames.includes(n) && !kitOwn.includes(n) && !analyzeNames.includes(n), `voices.js: "${n}" is already a name of compose.js, kit.mjs or analyze.js`);
    assert.ok(!bandsOwn.includes(n), `"${n}" is in both voices.js and bands.js`);
  }
  for (const n of bandsOwn) assert.ok(!composeNames.includes(n) && !kitOwn.includes(n) && !analyzeNames.includes(n), `bands.js: "${n}" is already a name of compose.js, kit.mjs or analyze.js`);
  // a name dropped by an ambiguous `export *`, or shadowed, raises no error: it is just missing or different
  for (const n of kitNamesBefore) assert.ok(n in kit, `kit.mjs no longer exports ${n}`);
  for (const n of composeNames) assert.equal(kit[n], compose[n], `kit.${n} is not compose.${n}`);
  for (const n of [...voicesOwn, ...bandsOwn]) assert.equal(kit[n], bandsMod[n] ?? voicesMod[n], `kit.mjs does not pass ${n} on`);
  for (const n of voicesOwn) assert.equal(bandsMod[n], voicesMod[n], `bands.js does not pass ${n} on`);
  // and kit.mjs gained exactly one line, at its end
  const KIT = fs.readFileSync(path.join(ROOT, 'tools', 'compose', 'kit.mjs'), 'utf8').trimEnd().split('\n');
  assert.equal(KIT[KIT.length - 1], "export * from '../../sound/bands.js';");
});

test('no shared state touched: the kit\'s shared values and instruments() are what they were before bands.js loaded', () => {
  for (const k of SHARED) assert.deepEqual(compose[k], sharedBefore[k], k);
  assert.equal(JSON.stringify(compose.instruments('l', { gains: [1, 0.8, 1, 1, 1.5] })), instrumentsBefore);
  for (const name of NAMES) probe(name);
  for (const k of SHARED) assert.deepEqual(compose[k], sharedBefore[k], `${k}, after building every probe`);
  // a band only reads the ten instruments: every probe offers the same ten, in the same order
  for (const name of NAMES) assert.deepEqual(probe(name).patch.params.find((p) => p.id === 'inst').options, sharedBefore.INSTRUMENTS);
});

test('ranges: a line its lead cannot play is refused at build time, with the note to write instead', () => {
  for (const name of NAMES) {
    const B = band(name);
    const tooLow = `C${Math.floor(B.range[0] / 12) - 1} _ _ _ _ _ _ _ _ _ _ _ _ _ _ _`;
    assert.throws(() => melody('e', [tooLow], { voice: B.range }), (e) => e instanceof KitError && /too low/.test(e.message) && /write [A-G]#?\d or higher/.test(e.message), name);
  }
});

test('room and finish: B.room goes straight into bus(), and the lo-fi finish is two nodes a channel and an out pair', () => {
  for (const name of NAMES) assert.ok(bus({ left: '0', right: '0', ...band(name).room }).some((n) => n.type === 'reverb'), name);
  const fin = band('lofi').finish({ left: 'mL', right: 'mR' });
  assert.equal(fin.nodes.length, 4);
  assert.deepEqual(fin.out, ['tpL', 'tpR']);
  assert.deepEqual(probe('lofi').patch.out, ['tpL', 'tpR']);
});

test('chord voices: extra notes only where the voice takes them, and the bands that play one note at a time ask for the tones', () => {
  assert.ok(band('lofi').chords('p', { trig: 'pG', extra: 'pE' }).some((n) => String(n.freq).includes('pE')));
  assert.throws(() => band('rock').chords('p', { trig: 'pG', extra: 'pE' }), (e) => e instanceof KitError && /lofi/.test(e.message));
  for (const name of ['chip', 'musicbox', 'steelpan', 'marimba']) assert.throws(() => band(name).chords('p', { trig: 'pG' }), (e) => e instanceof KitError && /pick/.test(e.message), name);
  // pick: a chord-tone number, one name and one meaning (section 2, rule 4); refused where the chord voice plays whole chords
  assert.deepEqual(NAMES.filter((n) => band(n).takesPick), ['chip', 'musicbox', 'steelpan', 'marimba']);
  for (const name of NAMES.filter((n) => !band(n).takesPick)) assert.throws(() => band(name).chords('p', { trig: 'pG', pick: 'pK' }), (e) => e instanceof KitError && /pick/.test(e.message) && /marimba/.test(e.message), name);
  // semis is a count of semitones everywhere it is taken: no chord voice takes it, so every band refuses it rather than misread or drop it
  for (const name of NAMES) assert.throws(() => band(name).chords('p', { trig: 'pG', semis: 'pK', ...(band(name).takesPick ? { pick: 'pK' } : {}) }), (e) => e instanceof KitError && /semis/.test(e.message) && /pick/.test(e.message), name);
  assert.throws(() => V.chipArp('a', { semis: 'aD' }), (e) => e instanceof KitError && /semis/.test(e.message) && /pick/.test(e.message));
  // the pick reaches the notes: chip's arpeggio and the one-note-at-a-time bands read the given row
  for (const name of ['chip', 'musicbox', 'steelpan', 'marimba']) assert.ok(JSON.stringify(band(name).chords('p', { trig: 'pG', pick: 'zPk' })).includes('zPk'), name);
  // dip: refused where the chord voice would ignore it, like extra
  assert.deepEqual(NAMES.filter((n) => band(n).takesDip), ['synthwave', 'orchestra', 'folk', 'organ', 'steelpan', 'darkambient', 'marimba']);
  for (const name of ['folk', 'steelpan', 'marimba', 'organ']) assert.ok(band(name).takesDip, `${name}: section 7 promises a dip on its chord voice`);
  for (const name of NAMES.filter((n) => !band(n).takesDip)) assert.throws(() => band(name).chords('p', { trig: 'pG', ...(band(name).takesPick ? { pick: 'pK' } : {}), dip: 'zDip' }), (e) => e instanceof KitError && /dip/.test(e.message) && /steelpan/.test(e.message), name);
  const kit1 = band('folk').drums({ hand: 'dT', shaker: 'kT', tambourine: 'tT', noise: 'nz' });
  assert.deepEqual(kit1.out, { hand: 'dO', shaker: 'kO', tambourine: 'tO' });
  assert.equal(kit1.duck, 'dA');
});

test('dip reaches the output: every band that takes it sounds its chords at dip 0 and is silent at dip 1', () => {
  for (const name of NAMES.filter((n) => band(n).takesDip)) {
    const B = band(name), pk = B.takesPick ? { pick: 'pK' } : {};
    const nodes = (d) => [{ id: 'nz', type: 'noise' }, { id: 'pK', type: 'seq', trig: 'c16', loop: true, steps: '0' }, { id: 'zDip', type: 'expr', expr: d }, ...B.chords('p', { trig: 'g', ...pk, dip: 'zDip', noise: 'nz' })];
    const outOf = (n) => { const ch = n.out; return ch[0] === ch[1] ? ch[0] : `(${ch[0]} + ${ch[1]})*0.5`; };
    const open = nodes('0'), shut = nodes('1');
    // structurally: a node on the path to the output names the dip
    assert.ok(open.some((n) => JSON.stringify(n).includes('zDip') && n.id !== 'zDip'), `${name}: the dip expression is in no node`);
    const loud = maxAbs(play(open, { seconds: 2, out: outOf(B.chords('p', { trig: 'g', ...pk, noise: 'nz' })) }), at(HIT), at(2));
    const quiet = maxAbs(play(shut, { seconds: 2, out: outOf(B.chords('p', { trig: 'g', ...pk, noise: 'nz' })) }), at(HIT), at(2));
    assert.ok(loud > 0.05, `${name}: the chord voice is silent at dip 0 (peak ${loud})`);
    assert.ok(quiet < loud * 1e-3, `${name}: a full dip leaves the chord voice at ${quiet.toFixed(4)} of ${loud.toFixed(4)}: the dip does not reach its output`);
  }
});

test('vel reaches the lead: every band\'s lead plays quieter at vel 0.25 than at vel 1, or refuses vel with a KitError', () => {
  // band().lead takes { trig, pitch, vel } on every band (docs/music-styles.md section 4.1): a vel that is passed on
  // and silently dropped (folk's pluckedString has none of its own) is the failure this catches
  for (const name of NAMES) {
    const B = band(name);
    const lead = (vel) => B.lead('v', { trig: 'g', pitch: 'midi(67)', noise: 'nz', vel });
    let soft;
    try { soft = lead('0.25'); } catch (e) { assert.ok(e instanceof KitError && /vel/.test(e.message), `${name}: lead with vel threw ${e}`); continue; }
    const level = (nodes) => { const y = play([{ id: 'nz', type: 'noise' }, ...nodes], { seconds: 1.5, out: 'vO' }); let s = 0; for (let i = at(HIT); i < y.length; i++) s += y[i] * y[i]; return Math.sqrt(s / (y.length - at(HIT))); };
    const full = level(lead('1')), quiet = level(soft), db = 20 * Math.log10(quiet / full);
    assert.ok(full > 0.01, `${name}: the lead is silent at vel 1 (RMS ${full})`);
    // 12 dB for a linear voice; the driven leads compress it (twang about 9.6, rock about 3.2 on 2026-11-19); 0 when vel is dropped
    assert.ok(db <= -2, `${name}: the lead is ${db.toFixed(2)} dB at vel 0.25 against vel 1: vel does not reach its output`);
    // null (no loudness node) and the default (the row's mark, X here) both play as loud as vel 1
    for (const v of [null, undefined]) assert.ok(Math.abs(level(lead(v)) / full - 1) <= 0.01, `${name}: vel ${v} and vel 1 differ`);
  }
});

// ---- the slow ones: levels, distinctness, cost ---------------------------------------------------------------------------------

test('the ten melody instruments still level on every band, the six that play along sit 4 dB under the tune, and each band\'s startGains are close to what is measured', () => {
  for (const name of NAMES) {
    const B = band(name);
    assert.equal(B.startGains.length, 16, `${name}: ten instruments, then six that play along`);
    const m = matchGains((g) => bandProbe(name, g).patch, { node: B.matchNode, start: B.startGains, together: true, bars: 4 });
    const dbs = m.after.map((l) => l.db), spread = Math.max(...dbs) - Math.min(...dbs);
    assert.ok(spread <= 1, `${name}: after matching the ten are ${spread.toFixed(2)} dB apart`);
    for (const l of m.along.after) assert.ok(Math.abs(l.db - m.along.target) <= 1, `${name}: ${l.name} plays along ${(l.db - m.along.target).toFixed(2)} dB from where it is aimed`);
    m.gains.forEach((g, i) => assert.ok(Math.abs(20 * Math.log10(g / B.startGains[i])) <= 1.5, `${name}: startGains[${i}] ${B.startGains[i]} is more than 1.5 dB from the ${g} measured now`));
  }
});

// Both distinctness tests play every band at one tempo, so that a band cannot pass on its tempo alone: in a scratch copy
// where marimba was steelpan in all but its tempo, the probes at their own typical tempos still passed, and at one
// common tempo the same copy is 0.00 dB from steelpan on every part. 100 bpm is inside eight of the twelve tempo ranges;
// the probe's Speed control is widened to reach it for the other four (this test only, never a track).
const COMMON_BPM = 100, COMMON_INST = 0;   // inst 0: "Synth lead", the tune on the same instrument for every band
const FP_SR = 16000, FP_SECS = 4;
/** Asserts that every pair of `names` is further apart than either band is from itself with seed 2, by at least `margin` dB. */
function assertApart(what, fp, names, margin, show = () => '') {
  const self = Object.fromEntries(names.map((n) => [n, fingerprintDistance(fp[n][0], fp[n][1])]));
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const [a, b] = [names[i], names[j]], d = fingerprintDistance(fp[a][0], fp[b][0]);
    assert.ok(d >= Math.max(self[a], self[b]) + margin, `${what}: ${a} and ${b} are ${d.toFixed(2)} dB apart, ${a} ${self[a].toFixed(2)} and ${b} ${self[b].toFixed(2)} from themselves${show(a, b)}`);
  }
}

// Margins from the measurement of 2026-11-19 (16 kHz, 4 s, every probe at 100 bpm with inst "Synth lead", seeds 1
// and 2): the smallest gap between two bands beyond either band's own seed-to-seed distance was drums 8.62
// (chip/twang), bass 7.23 (orchestra/rock), chords 5.63 (orchestra/darkambient), lead 6.73 (orchestra/rock) and mix
// 3.85 dB (synthwave/orchestra). Each margin here is about half of that. Re-measured the same day after darkambient's
// heartbeat row went from two hits a bar to every beat: the same five smallest gaps (darkambient's own closest, drums
// 13.49 to chip, was 14.91 to orchestra).
const MARGIN = { drums: 4, bass: 3.5, chords: 2.5, lead: 3, mix: 2 };
const EXCUSED = { drums: ['musicbox'] };   // its only drum is the quiet mechanism click
test('the bands differ, part by part: at one tempo and one inst, every pair further apart than either is from itself with another seed', () => {
  const fp = {}, oct = {};
  const octaves = (s) => { const out = Array(8).fill(0); const fr = analyze.spectrogram(s, 1024, 512); for (const f of fr) for (let k = 1; k < 512; k++) { const hz = (k * FP_SR) / 1024, b = Math.min(7, Math.max(0, Math.floor(Math.log2(hz / 62.5)))); out[b] += f[k] * f[k]; } const t = out.reduce((a, b) => a + b, 0) || 1; return out.map((x) => x / t); };
  for (const name of NAMES) {
    const { patch, parts } = probe(name);
    const params = patch.params.map((p) => (p.id === 'bpm' ? { ...p, min: Math.min(p.min, COMMON_BPM), max: Math.max(p.max, COMMON_BPM) } : p));
    fp[name] = {}; oct[name] = {};
    for (const [part, expr] of Object.entries({ ...parts, mix: null })) {
      fp[name][part] = [1, 2].map((seed) => {
        // the part by itself: an expr node for it, and the patch's out pointed at that node
        const p = { ...patch, params, loop: false, wrap: false, nodes: expr ? [...patch.nodes, { id: 'zzPart', type: 'expr', expr }] : patch.nodes, out: expr ? 'zzPart' : patch.out };
        const r = renderPatch(p, { sampleRate: FP_SR, seed, maxSeconds: FP_SECS, params: { intensity: 1, bpm: COMMON_BPM, inst: COMMON_INST } });
        if (seed === 1) oct[name][part] = octaves(r.samples);
        return fingerprint(r.samples, FP_SR, FP_SECS);
      });
    }
  }
  for (const part of Object.keys(MARGIN)) {
    const names = NAMES.filter((n) => !(EXCUSED[part] || []).includes(n)), show = (n) => oct[n][part].map((x) => x.toFixed(2)).join(' ');
    assertApart(part, Object.fromEntries(names.map((n) => [n, fp[n][part]])), names, MARGIN[part], (a, b) => ` (octave shares ${show(a)} / ${show(b)})`);
  }
});

// Each band's own voices, with its rows taken away: bass, lead and chord voice (and the whole kit, every role at its
// kit level) all played from one row of four beats, in C, at 100 bpm; the lead on G4 (inside every band's range), the
// bands whose chords go one note at a time on the same chord-tone picks. What is left to tell two bands apart is the
// sound of the voice, which section 3 asks to differ from every other band's: in a scratch copy with rock's bass set
// to synthwave's, the probe test above still passed (rhythm alone kept the two basses 6.57 dB apart) while here the
// pair is 0.00 dB apart. Margins from the measurement of 2026-11-19 (16 kHz, 4 s, seeds 1 and 2): the smallest gap
// beyond self was drums 3.32 (organ/twang), bass 5.28 (folk/lofi), chords 4.45 (synthwave/orchestra) and lead 5.03
// (synthwave/rock). Each margin here is about half of that.
const VOICE_MARGIN = { drums: 1.5, bass: 2.5, chords: 2, lead: 2.5 };
const VOICE_ROW = 'X...X...X...X...';
const VOICE_PICKS = '0 _ _ _ 1 _ _ _ 2 _ _ _ 1 _ _ _';
function bandVoicePatch(nodes, out) {
  return {
    format: 'sfxpatch/0.1', id: 'band-voice', name: 'Band voice', duration: FP_SECS + 1,
    params: [{ id: 'bpm', label: 'Speed', min: 40, max: 200, default: COMMON_BPM }, { id: 'key', label: 'Pitch', min: -5, max: 6, default: 0 }, { id: 'bright', label: 'Brightness', min: 0, max: 1, default: 0.6 }, { id: 'space', label: 'Room', min: 0, max: 1, default: 0.2 }, { id: 'intensity', label: 'Intensity', min: 0, max: 1, default: 1 }],
    nodes: [...clock(), ...chords('C', { tonic: 'C' }), { id: 'nz', type: 'noise' }, compose.drumRow('g', VOICE_ROW), compose.noteRow('pK', VOICE_PICKS), ...nodes, { id: 'zzOut', type: 'expr', expr: out }],
    out: 'zzOut',
  };
}
function bandVoices(name) {
  const B = band(name), letters = 'abcdefhijkmnqrsuvwyz';
  const chordNodes = B.chords('v', { trig: 'g', noise: 'nz', ...(B.probeRows.chords[1] ? { pick: 'pK' } : {}) });
  const kitRows = Object.fromEntries(B.roles.map((r, i) => [r, `${letters[i]}T`]));
  const kit = B.drums({ ...kitRows, noise: 'nz' });
  return {
    drums: [[...B.roles.map((r) => ({ id: kitRows[r], type: 'expr', expr: 'g' })), ...kit], B.roles.map((r) => `${kit.out[r]}*${B.kitLevels[r]}`).join(' + ')],
    bass: [B.bass('v', { trig: 'g', noise: 'nz' }), 'vO'],
    chords: [chordNodes, `(${chordNodes.out[0]} + ${chordNodes.out[1]})*0.5`],
    lead: [B.lead('v', { trig: 'g', pitch: 'midi(67)', noise: 'nz' }), 'vO'],
  };
}
test('the bands\' voices differ by sound alone: each band\'s bass, lead, chord voice and kit on one row, pitch and tempo', () => {
  const fp = {};
  for (const name of NAMES) {
    fp[name] = {};
    for (const [part, [nodes, out]] of Object.entries(bandVoices(name))) {
      const patch = bandVoicePatch(nodes, out);
      assert.equal(validatePatch(patch).ok, true, `${name} ${part}`);
      fp[name][part] = [1, 2].map((seed) => fingerprint(renderPatch(patch, { sampleRate: FP_SR, seed, maxSeconds: FP_SECS }).samples, FP_SR, FP_SECS));
    }
  }
  for (const part of Object.keys(VOICE_MARGIN)) {
    const names = NAMES.filter((n) => !(EXCUSED[part] || []).includes(n));
    assertApart(`${part} voice`, Object.fromEntries(names.map((n) => [n, fp[n][part]])), names, VOICE_MARGIN[part]);
  }
});

test('mix: at full intensity the tune leads what plays beside it in 300 to 1200 Hz by at least 3 dB, on every band', () => {
  for (const name of NAMES) {
    const B = band(name), { patch, parts } = probe(name);
    const m = compose.measureLayers(patch, { tune: `${B.matchNode}*0.42*gTune`, backing: `${parts.chords} + ${parts.lead}` }, { sampleRate: 16000, bars: 4, band: [300, 1200] });
    assert.ok(m.tune.db - m.backing.db >= 3, `${name}: the tune is ${(m.tune.db - m.backing.db).toFixed(1)} dB over the chords and the lead`);
  }
});

const TRACKS = ['thornwood-overworld', 'battle-theme', 'hearthvale-village', 'hearthvale-battle', 'derelict-run', 'derelict-boss'];
test('node budget: at most 200 nodes (the ten instruments and Plays along are 71 of them), one reverb of its own at most, and no slower to render than the slowest existing track', () => {
  // speed is per sample, so the first 1.5 s (rendered twice over, as a looped track is) stands for 8 bars. The tracks
  // and the probes take turns, three rounds, and each keeps its fastest render: a busy machine slows them all alike
  const patches = [...TRACKS.map((id) => [id, JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', `${id}.json`), 'utf8'))]), ...NAMES.map((n) => [n, probe(n).patch])];
  const best = {};
  for (let round = 0; round < 3; round++) for (const [id, patch] of patches) {
    const t0 = performance.now(), r = renderPatch(patch, { maxSeconds: 1.5 });
    best[id] = Math.max(best[id] || 0, (r.duration * 2) / ((performance.now() - t0) / 1000));
  }
  const slowest = Math.min(...TRACKS.map((id) => best[id]));
  const ownReverbs = {};
  for (const name of NAMES) {
    const { patch } = probe(name);
    assert.ok(patch.nodes.length <= 200, `${name}: ${patch.nodes.length} nodes`);
    ownReverbs[name] = patch.nodes.filter((n) => n.type === 'reverb' && n.id !== 'rv').length;
    assert.ok(ownReverbs[name] <= 1, `${name}: ${ownReverbs[name]} reverbs of its own`);
    assert.ok(best[name] >= slowest, `${name}: renders at ${best[name].toFixed(2)} times real time, slower than the slowest track (${slowest.toFixed(2)}; ${TRACKS.map((id) => `${id} ${best[id].toFixed(2)}`).join(', ')})`);
  }
  assert.deepEqual(Object.keys(ownReverbs).filter((n) => ownReverbs[n]), ['synthwave']);
});
