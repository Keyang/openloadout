// The sound quality bar, A-peak (2026-11-18, final review): no sound may be heard above full scale, at its
// defaults, in any style or at either end of any control. A normalised patch is scaled to 0.89 by the engine, so
// it passes by construction; a patch that says "normalize": false is played as it is made, and is what this catches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSound, heardPeak, THRESHOLDS } from '../../quality/sound.js';
import { renderPatch } from '../../sound/sfx-engine.js';

const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;

/** A planted loud patch: a plain tone, not normalised, whose "level" control and "Hot" style push it past full scale. */
const loud = (over = {}) => ({
  format: 'sfxpatch/0.1', id: 'q-loud', name: 'Loud tone', category: 'ui',
  description: 'Test tone: quiet enough at its settings, too loud at the top of its level and in one style.',
  normalize: false,
  duration: 'length + 0.02',
  params: [
    { id: 'pitch', label: 'Pitch', min: 300, max: 1200, default: 600, scale: 'log' },
    { id: 'length', label: 'Length', min: 0.08, max: 0.3, default: 0.15, scale: 'log' },
    { id: 'level', label: 'Level', min: 0.2, max: 1.6, default: 0.6 },
  ],
  nodes: [
    { id: 'amp', type: 'ad', attack: 0.001, decay: 'length', curve: 3 },
    { id: 'tone', type: 'osc', wave: 'sine', freq: 'pitch' },
  ],
  out: 'tone*amp*level',
  presets: { Soft: { level: 0.4 }, Hot: { level: 1.3 } },
  ...over,
});

test('heardPeak is the level a listener gets: the raw peak when not normalised, the scaled peak when normalised', () => {
  const p = loud();
  const raw = renderPatch(p, { seed: 1, params: { level: 1.6 } });
  assert.ok(raw.rawPeak > 1.4, `the planted control end is loud: ${raw.rawPeak}`);
  assert.equal(heardPeak(raw), raw.rawPeak);
  const norm = renderPatch({ ...p, normalize: undefined }, { seed: 1, params: { level: 1.6 } });
  assert.ok(Math.abs(heardPeak(norm) - 0.89) < 1e-6, `normalised: ${heardPeak(norm)}`);
});

test('the margin under full scale is small and written down', () => {
  assert.ok(THRESHOLDS.peakMax < THRESHOLDS.clipPeak && THRESHOLDS.peakMax >= 0.9, `${THRESHOLDS.peakMax}`);
});

test('a control end above full scale is an error that names the control, the end and the level', () => {
  const r = checkSound(loud({ presets: { Soft: { level: 0.4 } } }));
  const e = r.errors.find((m) => /too loud/.test(m) && /'level'/.test(m));
  assert.ok(e, show(r));
  assert.match(e, /highest/);
  assert.match(e, /1\.\d\d/);
  assert.ok(!r.errors.some((m) => /too loud/.test(m) && /'pitch'|'length'/.test(m)), `only the loud control is named\n${show(r)}`);
  const m = r.metrics.params.find((x) => x.id === 'level');
  assert.ok(m.peakMax > 1.4 && m.flags.includes('too loud at max'), JSON.stringify(m));
});

test('a style above full scale is an error that names the style', () => {
  const r = checkSound(loud());
  const e = r.errors.find((m) => /too loud/.test(m) && m.includes('"Hot"'));
  assert.ok(e, show(r));
  assert.ok(!r.errors.some((m) => m.includes('"Soft"')), show(r));
  assert.ok(r.metrics.styles.find((s) => s.name === 'Hot').flags.includes('peak'));
});

test('a default above full scale is an error', () => {
  const p = loud();
  p.params[2].default = 1.2;
  const r = checkSound(p);
  assert.ok(r.errors.some((m) => /^too loud: at its standard settings/.test(m)), show(r));
});

test('a level between the margin and full scale already fails: the margin is there to keep it off the edge', () => {
  const p = loud({ presets: {} });
  p.params[2] = { id: 'level', label: 'Level', min: 0.2, max: 0.6, default: 0.4 };
  const top = renderPatch({ ...p, out: 'tone*amp*level*1.63' }, { seed: 1, params: { level: 0.6 } }).rawPeak;
  assert.ok(top > THRESHOLDS.peakMax && top < THRESHOLDS.clipPeak, `planted level ${top}`);
  const r = checkSound({ ...p, out: 'tone*amp*level*1.63' });
  assert.ok(r.errors.some((m) => /too loud/.test(m) && /'level'/.test(m)), show(r));
});

test('the same tone normalised passes: the engine scales it under full scale whatever the controls do', () => {
  const p = loud();
  delete p.normalize;
  const r = checkSound(p);
  assert.ok(!r.errors.some((m) => /too loud/.test(m)), show(r));
});
