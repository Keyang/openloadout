// The music kit's one convention (sound/compose.js, header): every voice and effect is name(id, { options }),
// its finished sound is <id>O (or <id>L and <id>R), and the old spellings still give the same nodes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVoice } from '../../sound/sfx-engine.js';
import * as K from '../../sound/compose.js';
import * as kit from '../../tools/compose/kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'sound', 'compose.js'), 'utf8');
const HEAD = SRC.split('\nimport ')[0];
const ids = (nodes) => [nodes].flat(Infinity).map((n) => n.id);

// name: [the new spelling, the old spelling (deprecated), what the finished sound is called]
const VOICES = {
  kickDrum: [() => K.kickDrum('k', { trig: 'kT', decay: 0.16 }), () => K.kickDrum('k', 'kT', { decay: 0.16 }), ['kO']],
  snareDrum: [() => K.snareDrum('s', { trig: 'sT', noise: 'nz' }), () => K.snareDrum('s', 'sT', { noise: 'nz' }), ['sO']],
  hatDrum: [() => K.hatDrum('h', { trig: 'hT', noise: 'nz', decay: 0.05 }), () => K.hatDrum('h', 'hT', { noise: 'nz', decay: 0.05 }), ['hO']],
  tomDrum: [() => K.tomDrum('tm', { trig: 'tmT', semis: 'tmS' }), () => K.tomDrum('tm', 'tmT', { semis: 'tmS' }), ['tmO']],
  handDrum: [() => K.handDrum('d', { trig: 'dT', pitch: 'midi(41 + tr)' }), () => K.handDrum('d', 'dT', { pitch: 'midi(41 + tr)' }), ['dO']],
  shaker: [() => K.shaker('k', { trig: 'kT', noise: 'nz' }), () => K.shaker('k', 'kT', { noise: 'nz' }), ['kO']],
  clap: [() => K.clap('cl', { trig: 'cT', freq: 1300 }), () => K.clap('cl', 'cT', { freq: 1300 }), ['clO']],
  sawBass: [() => K.sawBass('b', { trig: 'bT', semis: 'bS', drive: '1.5 + grit*5' }), () => K.sawBass('b', 'bT', { semis: 'bS', drive: '1.5 + grit*5' }), ['bO']],
  roundBass: [() => K.roundBass('b', { trig: 'bT', note: 41, semis: 'bS' }), () => K.roundBass('b', 'bT', { note: 41, semis: 'bS' }), ['bO']],
  acidBass: [() => K.acidBass('b', { trig: 'bT', pitch: 'midi(40 + tr + bS)' }), () => K.acidBass('b', 'bT', { pitch: 'midi(40 + tr + bS)' }), ['bO']],
  brassStab: [() => K.brassStab('st', { trig: 'stT', note: 48 }), () => K.brassStab('st', 'stT', { note: 48 }), ['stL', 'stR']],
  stringPair: [() => K.stringPair('a', { pitch: 'midi(57 + tr + aS)', decay: 0.2 }), () => K.stringPair('a', 'midi(57 + tr + aS)', { decay: 0.2 }), ['aL', 'aR']],
  sawPad: [() => K.sawPad('p', { pitches: ['midi(52 + tr)', 'midi(52 + tr + third)'], trig: 'pT' }), () => K.sawPad('p', ['midi(52 + tr)', 'midi(52 + tr + third)'], { trig: 'pT' }), ['pL', 'pR']],
  pluckedString: [() => K.pluckedString('r1', { trig: 'rG1', pitch: 'midi(53 + round(key) + rS1)', ring: 2 }), () => K.pluckedString('r1', 'rG1', 'midi(53 + round(key) + rS1)', { ring: 2 }), ['r1O']],
  struckBell: [() => K.struckBell('q1', { trig: 'qG1', pitch: 'midi(77 + round(key) + qS1)' }), () => K.struckBell('q1', 'qG1', 'midi(77 + round(key) + qS1)'), ['q1O']],
  subDrop: [() => K.subDrop('d', { trig: 'dT', pitch: 'midi(48 + tr)', fall: 0.45 }), () => K.subDrop('d', 'dT', { from: 'midi(48 + tr)', fall: 0.45 }), ['dO']],
  alarmTone: [() => K.alarmTone('al', { trig: 'alT', semis: 'alS', note: 84, grit: 'grit' }), () => K.alarmTone('al', 'alT', { semis: 'alS', base: 84, grit: 'grit' }), ['alO']],
  tempoEcho: [() => K.tempoEcho('ec', { input: 'lF', steps: 3, tone: '1800 + bright*2500' }), () => K.tempoEcho('ec', 'lF', { steps: 3, tone: '1800 + bright*2500' }), ['ecO']],
  chorus: [() => K.chorus('c', { input: 'lX', depth: '0.8' }), () => K.chorus('c', 'lX', { depth: '0.8' }), ['cL', 'cR']],
  riser: [() => K.riser('rs', { noise: 'nz', low: 500 }), null, ['rsO']],
  doubling: [() => K.doubling('d', { pitch: 'lP' }), null, ['dO']],
};

test('every voice and effect takes (id, { options }) and gives the same nodes as its old spelling', () => {
  for (const [name, [now, old]] of Object.entries(VOICES)) {
    const nodes = now();
    assert.ok(Array.isArray(nodes) && nodes.length > 0, name);
    if (old) assert.deepEqual(nodes, old(), `${name}: the two spellings give different nodes`);
  }
  // defaults are the same in both spellings
  assert.deepEqual(K.kickDrum('k', { trig: 'kT' }), K.kickDrum('k', 'kT'));
  assert.deepEqual(K.stringPair('a', { pitch: '440' }), K.stringPair('a', '440'));
  assert.deepEqual(K.subDrop('d', { trig: 'dT' }), K.subDrop('d', 'dT'));
  assert.deepEqual(K.tempoEcho('e', { input: 'x' }), K.tempoEcho('e', 'x'));
});

test('the finished sound of every voice is <id>O, or <id>L and <id>R for a wide one', () => {
  for (const [name, [now, , out]] of Object.entries(VOICES)) {
    const got = ids(now());
    for (const id of out) assert.ok(got.includes(id), `${name}: no node "${id}" (it makes ${got.join(' ')})`);
    assert.ok(!got.some((id) => /Out$/.test(id)), `${name}: an output is called ...Out`);
  }
});

test('one name per thing: pitch for a note in Hz, note and semis for one that follows the chords, input for an effect', () => {
  const freqOf = (nodes, id) => nodes.find((n) => n.id === id);
  assert.equal(freqOf(K.pluckedString('s', { trig: 'sG', pitch: '330' }), 'sW').freq, '330');
  assert.equal(freqOf(K.struckBell('q', { trig: 'qG', pitch: '880' }), 'qO').freq, '880');
  assert.equal(freqOf(K.stringPair('a', { pitch: '440' }), 'aO1').freq, '(440)');
  assert.match(freqOf(K.subDrop('d', { trig: 'dT', pitch: '110' }), 'dW').freq, /110/);
  assert.match(freqOf(K.alarmTone('al', { trig: 'alT', note: 72 }), 'alHz').expr, /midi\(72 \+ round\(key\)/);
  // a voice with no row to play it, or no pitch, says which option is missing
  for (const f of [() => K.kickDrum('k', {}), () => K.snareDrum('s', {}), () => K.hatDrum('h', {}), () => K.clap('c', {}), () => K.sawBass('b', {}), () => K.shaker('k', {}), () => K.subDrop('d', {})]) {
    assert.throws(f, (e) => e instanceof K.KitError && /trig/.test(e.message));
  }
  assert.throws(() => K.pluckedString('s', { trig: 'sG' }), (e) => e instanceof K.KitError && /pitch/.test(e.message));
  assert.throws(() => K.acidBass('b', { trig: 'bT' }), /pitch/);
  assert.throws(() => K.tempoEcho('e', {}), /input/);
  assert.throws(() => K.chorus('c', {}), /input/);
  assert.throws(() => K.sawPad('p', {}), /pitches/);
  // every building block checks its id the same way
  for (const [name, f] of Object.entries({ clap: () => K.clap('c l', { trig: 'cT' }), tempoEcho: () => K.tempoEcho('1e', { input: 'x' }), acidBass: () => K.acidBass('b-', { trig: 'bT', pitch: '55' }), sawPad: () => K.sawPad('', { pitches: ['440'] }), riser: () => K.riser('r.s'), kickDrum: () => K.kickDrum('k k', { trig: 'kT' }), pluckedString: () => K.pluckedString('s!', { trig: 'sG', pitch: '330' }) })) {
    assert.throws(f, (e) => e instanceof K.KitError && /letters and digits/.test(e.message), name);
  }
});

test('clock: one function swings the 16ths or the 8ths; clockEighths is its old name', () => {
  assert.deepEqual(K.clock({ swing: 'swing*0.6', on: 8 }), K.clockEighths({ swing: 'swing*0.6' }));
  assert.deepEqual(K.clock({ on: 8 }), K.clockEighths());
  assert.deepEqual(K.clock({ swing: 'swing', on: 16 }), K.clock({ swing: 'swing' }));
  assert.deepEqual(ids(K.clock({ on: 8 })), ['c16', 'c16p', 'c8w', 'c8p']);
  assert.throws(() => K.clock({ on: 4 }), (e) => e instanceof K.KitError && /16.*8|8.*16/.test(e.message));
});

test('the old spellings are marked as deprecated where they are documented, and the header states the convention', () => {
  const doc = (name) => { const m = new RegExp(`/\\*\\*\\n((?: \\*[^\\n]*\\n)+?) \\*/\\nexport function ${name}\\(`).exec(SRC); assert.ok(m, `${name} has a doc comment`); return m[1]; };
  for (const [name, [, old]] of Object.entries(VOICES)) {
    const d = doc(name);
    assert.match(d, /Arguments:/, `${name} lists its arguments`);
    if (old) assert.match(d, /Deprecated/, `${name}: the old spelling is not marked as deprecated`);
  }
  assert.match(doc('clockEighths'), /Deprecated/);
  for (const phrase of ['name(id, { options })', '<id>O', '<id>L', '<id>R', 'trig', 'pitch', 'note', 'semis', 'input', 'noise', 'Deprecated']) assert.ok(HEAD.includes(phrase), `the header does not state the convention: "${phrase}"`);
  // the warnings composers needed
  assert.match(HEAD, /exact (whole-number )?multiple/i, 'oscillators at an exact multiple cancel');
  assert.match(HEAD, /doubling\(/);
  assert.match(HEAD, /0\.4/, "the tune's intensity window ends by 0.4");
  for (const house of ['fantasy overworld', 'storybook village', 'battle', 'electronic run', 'electronic boss']) assert.ok(HEAD.toLowerCase().includes(house), `the header does not say which voices suit a ${house}`);
  for (const name of Object.keys(VOICES)) assert.ok(new RegExp(`\\b${name}\\b`).test(HEAD), `the header does not mention ${name}`);
});

test('one copy of each small helper: no per-batch private copies', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/R2[12]\b|S2[12]\b/.test(code.replace(/'[^']*'|`[^`]*`|"[^"]*"/g, '')), 'a helper is still named after a batch');
  const count = (re) => (code.match(re) || []).length;
  assert.equal(count(/letters and digits/g), 2, 'the id check is written once (and once for layer names)');
  assert.equal(count(/=== undefined \|\| \w+ === null \|\| \w+ === ''/g), 1, 'the "give me this option" check is written once');
  assert.equal(count(/typeof \w+ === 'number' \? num\(\w+\) : `\(\$\{\w+\}\)`/g), 1, 'the "number or expression in brackets" helper is written once');
  const names = [...code.matchAll(/^export\s+(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  assert.equal(new Set(names).size, names.length, `an export is declared twice: ${names.filter((n, i) => names.indexOf(n) !== i).join(', ')}`);
});

test('the kit passes every export of the framework module on', () => {
  for (const name of Object.keys(K)) assert.equal(kit[name], K[name], `kit.mjs does not pass ${name} on`);
});

// ---- doubling: an oscillator at an exact multiple of another stays locked to it ---------------------------------------

function levels(nodes, exprs, seconds = 6, sr = 22050) {
  const names = Object.keys(exprs);
  const patch = { format: 'sfxpatch/0.1', id: 'probe', name: 'Probe', duration: seconds, params: [{ id: 'key', label: 'Key', min: -5, max: 6, default: 0 }], nodes: [...nodes, ...names.map((n, i) => ({ id: `zz${i}`, type: 'expr', expr: exprs[n] }))], out: 'zz0' };
  const v = createVoice(patch, { sampleRate: sr }), idx = names.map((_, i) => v.nodeIds.indexOf(`zz${i}`)), sq = names.map(() => 0);
  const n = seconds * sr;
  for (let s = 0; s < n; s++) { v.tick(); idx.forEach((k, j) => { sq[j] += v.nodeValues[k] ** 2; }); }
  return Object.fromEntries(names.map((name, j) => [name, 10 * Math.log10(sq[j] / n)]));
}

test('doubling: a detuned copy adds its full level, where an exact multiple gains or loses some for good', () => {
  const d = K.doubling('d', { pitch: 'lP' });
  assert.deepEqual(ids(d), ['dHz', 'dO']);
  const base = [{ id: 'lP', type: 'expr', expr: '440' }, { id: 'lO', type: 'osc', wave: 'saw', freq: 'lP' }];
  const exact = { id: 'xO', type: 'osc', wave: 'saw', freq: 'lP*2' };
  const m = levels([...base, exact, ...d], { tune: 'lO', exact: 'xO', both: 'lO + xO', copy: 'dO', withCopy: 'lO + dO' });
  const sum = (a, b) => 10 * Math.log10(10 ** (a / 10) + 10 ** (b / 10));
  assert.ok(Math.abs(m.both - sum(m.tune, m.exact)) > 0.5, `locked at exactly twice the pitch the two do not simply add: ${m.both.toFixed(2)} dB against ${sum(m.tune, m.exact).toFixed(2)}`);
  assert.ok(Math.abs(m.withCopy - sum(m.tune, m.copy)) < 0.15, `a few cents apart they add: ${m.withCopy.toFixed(2)} dB against ${sum(m.tune, m.copy).toFixed(2)}`);
  // times, cents and the wave can be chosen; the pitch node can feed any other voice
  const hz = (o) => { const v = createVoice({ format: 'sfxpatch/0.1', id: 'p', name: 'P', duration: 1, nodes: [{ id: 'lP', type: 'expr', expr: '100' }, ...K.doubling('d', { pitch: 'lP', ...o })], out: 'dO' }); v.tick(); return v.nodeValues[v.nodeIds.indexOf('dHz')]; };
  assert.ok(Math.abs(1200 * Math.log2(hz({}) / 200) - 7) < 0.01, 'by default an octave up, 7 cents sharp');
  assert.ok(Math.abs(1200 * Math.log2(hz({ times: 3, cents: -5 }) / 300) + 5) < 0.01);
  assert.equal(K.doubling('d', { pitch: 'lP', wave: 'pulse', width: 0.3 })[1].wave, 'pulse');
  assert.throws(() => K.doubling('d', { pitch: 'lP', cents: 0 }), (e) => e instanceof K.KitError && /cents/.test(e.message));
  assert.throws(() => K.doubling('d', { pitch: 'lP', times: 2.5 }), /times/);
  assert.throws(() => K.doubling('d', {}), /pitch/);
});

const META = { type: 'music', role: 'music/menu', themes: ['neutral'], gameTypes: ['arcade'], words: ['test', 'tune', 'tiny', 'loop', 'menu', 'jolly'], license: 'draft' };
const TUNE = ['C5 _ E5 _ G5 _ _ _ E5 _ _ _ C5 _ _ _', 'F5 _ _ _ A5 _ F5 _ C5 _ _ _ _ _ D5- E5-', 'D5 _ G5 _ B5 _ _ _ G5 _ _ _ D5 _ _ _', 'C5 _ _ _ _ _ _ _ G4 _ _ _ C5 _ _ _'];
const piece = (extra = [], mix = '') => K.assemble({
  id: 'tiny-tune', name: 'Tiny tune', description: 'A four-chord test piece.', meta: META, tempo: [100, 140, 120], defaults: { intensity: 1, bars: 8, inst: 'Flute' },
  nodes: [K.clock(), K.chords('C F | G C', { tonic: 'C' }), K.arrangement({ tune: { section: 3, intensity: [0.3, 0.4] } }),
    K.melody('l', TUNE), K.instruments('l'), ...extra, K.bus({ centre: '0', left: `lF*0.7*gTune${mix}`, right: `lF*0.7*gTune${mix}` })],
  presets: { Calm: { intensity: 0.2 }, Walk: { intensity: 0.6 }, Run: { intensity: 1, bpm: 132 } },
});

test('lint warns about an oscillator at an exact whole multiple of the tune, and only about that', () => {
  assert.deepEqual(K.lint(piece()), [], "the instruments' own octaves are part of their sound");
  const locked = K.lint(piece([{ id: 'dO', type: 'osc', wave: 'saw', freq: 'lP*2' }], ' + dO*0.2'));
  assert.equal(locked.length, 1);
  assert.match(locked[0], /"dO"/);
  assert.match(locked[0], /2 times/);
  assert.match(locked[0], /doubling\(/);
  for (const freq of ['2*lP', '(lP)*2', 'lP * 4 * 0.5', 'lP', '(lP*2)*1.5*2']) assert.equal(K.lint(piece([{ id: 'dO', type: 'osc', freq }], ' + dO*0.2')).length, 1, freq);
  for (const freq of ['lP*2*0.996', 'lP*1.5', 'lP*2*(1 + lVib*0.004)', 'midi(60 + tr)*2', 'lP*0.5']) assert.deepEqual(K.lint(piece([{ id: 'dO', type: 'osc', freq }], ' + dO*0.2')), [], freq);
  assert.deepEqual(K.lint(piece(K.doubling('d', { pitch: 'lP' }), ' + dO*0.2')), []);
  // the voices that take a pitch are caught too, through the oscillators they make
  assert.equal(K.lint(piece(K.stringPair('d', { pitch: 'lP*2', trig: 'lG' }), ' + dL*0.2')).length, 1, 'only the saw at exactly twice the pitch');
});

// ---- measuring quickly ---------------------------------------------------------------------------------------------

test('the quick report plans under a minute of work at real-time speed, and the full one is kept', () => {
  const p = piece();
  const quick = K.reportPlan(p, { quick: true }), full = K.reportPlan(p, {});
  assert.ok(quick.cost <= 60, `quick: ${quick.cost.toFixed(0)} seconds of 44.1 kHz rendering`);
  assert.ok(full.cost >= quick.cost * 5, `full ${full.cost.toFixed(0)} against quick ${quick.cost.toFixed(0)}`);
  for (const plan of [quick, full]) for (const what of ['instruments', 'sections', 'intensity']) assert.ok(plan.renders.some((r) => r.what === what), `${plan === quick ? 'quick' : 'full'}: nothing measures ${what}`);
  // a slow track with layers to measure stays inside the minute too
  const slow = K.assemble({ id: 'slow-tune', name: 'Slow tune', description: 'A slow test piece.', meta: META, tempo: [80, 108, 92], defaults: { bars: 8 }, nodes: [K.clock(), K.chords('C F | G C', { tonic: 'C' }), K.arrangement({}), K.melody('l', TUNE), K.instruments('l'), K.bus({ left: 'lF', right: 'lF' })], presets: { A: {}, B: {}, C: {} } });
  assert.ok(K.reportPlan(slow, { quick: true, layers: { tune: 'lF' } }).cost <= 60);
});

test('measureInstruments together: one pass gives the numbers five passes give', () => {
  const p = piece([{ id: 'lHs', type: 'shaper', in: 'lF*0.55', drive: 2 }, { id: 'lX', type: 'expr', expr: 'lHs/0.7' }]);
  for (const node of ['lF', 'lX']) {
    const each = K.measureInstruments(p, { node, sampleRate: 22050, params: { bpm: 140 } });
    const once = K.measureInstruments(p, { node, sampleRate: 22050, params: { bpm: 140 }, together: true });
    assert.deepEqual(once.map((l) => l.name), each.map((l) => l.name));
    for (let i = 0; i < each.length; i++) for (const k of ['db', 'peak', 'crestDb', 'sub80']) assert.ok(Math.abs(once[i][k] - each[i][k]) < 1e-6, `${node}, ${each[i].name}, ${k}: ${once[i][k]} against ${each[i][k]}`);
  }
  // a node the instrument choice does not reach is measured the old way
  assert.equal(K.measureInstruments(p, { node: 'lVib', sampleRate: 8000, together: true }).length, 5);
});

test('the quick report says what a composer needs, and says it is the quick one', () => {
  const text = K.report(piece(), { quick: true, layers: { tune: 'lF*0.7*gTune' } });
  assert.match(text, /quick/i);
  assert.match(text, /melody instruments/);
  assert.match(text, /spread \d/);
  assert.match(text, /section levels/);
  assert.match(text, /32 bars:(\s+-?\d+\.\d){4}/);
  assert.match(text, /intensity/);
  assert.match(text, /layers/);
  assert.match(text, /tune "l"/);
  assert.match(text, /--full/);
});

test('the command line measures quickly unless asked for everything', () => {
  const said = [], log = (m) => said.push(String(m));
  const r = kit.run(() => piece(), ['--measure'], { log });
  assert.equal(r.action, 'measure');
  assert.equal(r.mode, 'quick');
  assert.match(said.join('\n'), /quick/i);
  assert.equal(kit.run(() => piece(), ['--measure', '--full', '--help'], { log }).action, 'help');
  assert.throws(() => kit.run(() => piece(), ['--full'], { log }), (e) => e instanceof K.KitError && /--measure/.test(e.message));
});
