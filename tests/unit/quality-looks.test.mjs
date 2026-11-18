// The sprite quality bar, S-survives-looks: a sprite still reads under every whole-bundle
// look (THEME_PRESETS in engine/theme.js). Measured as the share of edges that are left:
// neighbouring pixels that differed before the look and still differ after it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSprite, THRESHOLDS } from '../../quality/sprite.js';
import { THEME_PRESETS } from '../../engine/theme.js';
import * as F from '../fixtures/quality/sprites.mjs';
import * as L from '../fixtures/quality/looks.mjs';

const LOOKS = /shapes merge/;
const show = (r) => `errors:\n  ${r.errors.join('\n  ')}\nwarnings:\n  ${r.warnings.join('\n  ')}`;
const looksWarnings = (r) => r.warnings.filter((m) => LOOKS.test(m));

test('the threshold is a named constant', () => {
  assert.equal(THRESHOLDS.lookEdgesWarn, 0.65);
});

test('two materials that differ only in hue: a warning, not an error, that names the clip and the look', () => {
  const r = checkSprite(L.hueOnly());
  const w = looksWarnings(r);
  assert.equal(w.length, 1, show(r));
  assert.ok(!r.errors.some((m) => LOOKS.test(m)), show(r));
  assert.match(w[0], /^closed: /, 'names the clip');
  assert.match(w[0], /"Mono" look/, 'names the look');
  assert.match(w[0], /Handheld/, 'lists the other looks that merge it');
  assert.ok(!/Original|Vivid|Sunset/.test(w[0]), `only the looks that merge it are named: ${w[0]}`);
});

test('the warning says what merged and how to fix it in plain words', () => {
  const [w] = looksWarnings(checkSprite(L.hueOnly()));
  assert.ok(w.includes(L.RED) && w.includes(L.GREEN), `names the two colours that merged: ${w}`);
  assert.match(w, /both turn into #[0-9a-f]{6}/);
  assert.match(w, /39% of the edges/, 'the share of edges left: 88 of 228');
  assert.match(w, /at least 65%/);
  assert.match(w, /2 colours become 1/);
  assert.match(w, /lightness, not only in hue/);
});

test('the measure: edges left = (outline + edges inside that still differ) / (outline + edges inside)', () => {
  const r = checkSprite(L.hueOnly());
  const { outline, inside } = L.STRIPES;
  assert.equal(r.metrics.themes.lowest, Math.round((outline / (outline + inside)) * 1000) / 1000);
  assert.equal(r.metrics.themes.clip, 'closed');
  assert.equal(r.metrics.themes.look, 'mono');
  // every preset that changes a colour is tested; "Original" changes nothing
  assert.equal(r.metrics.themes.tested, THEME_PRESETS.length - 1);
  assert.ok(r.metrics.themes.ms >= 0);
});

test('two materials that differ in lightness do not warn', () => {
  const r = checkSprite(L.lightnessApart());
  assert.deepEqual(looksWarnings(r), [], show(r));
  assert.equal(r.metrics.themes.lowest, 1);
});

test('a sprite with a single colour does not crash and does not warn', () => {
  for (const fx of [L.oneColour, L.flatFill]) {
    const r = checkSprite(fx());
    assert.deepEqual(looksWarnings(r), [], show(r));
    assert.ok(!r.errors.some((m) => /threw|crash/.test(m)), show(r));
    assert.equal(r.metrics.themes.lowest, 1);
  }
});

test('a layer that fills its frame: a ridge like the sky behind it warns, a clearly darker one does not', () => {
  const r = checkSprite(L.ridgeLikeSky());
  const w = looksWarnings(r);
  assert.equal(w.length, 1, show(r));
  assert.match(w[0], /^far: /);
  assert.match(w[0], /0% of the edges/, 'nothing but that one edge: it is all gone');
  assert.ok(w[0].includes(L.SKY) && w[0].includes(L.RIDGE), w[0]);
  assert.equal(r.metrics.themes.lowest, 0);
  assert.deepEqual(looksWarnings(checkSprite(L.ridgeDarker())), []);
});

test('one message per cause: the same merged materials in two clips are reported once', () => {
  const r = checkSprite(L.hueOnlyTwoClips());
  const w = looksWarnings(r);
  assert.equal(w.length, 1, show(r));
  assert.match(w[0], /^closed: /);
  assert.match(w[0], /\(and 1 more\)$/);
});

test('a fault seen in several clips names the clip where it is worst', () => {
  const r = checkSprite(L.hueOnlyWorseSecond());
  const w = looksWarnings(r);
  assert.equal(w.length, 1, show(r));
  assert.match(w[0], /^open: /);
  assert.match(w[0], /39% of the edges/);
  assert.match(w[0], /\(and 1 more\)$/);
  assert.deepEqual({ clip: r.metrics.themes.clip, lowest: r.metrics.themes.lowest }, { clip: 'open', lowest: 0.386 });
});

test('the check is deterministic', () => {
  const strip = (r) => ({ errors: r.errors, warnings: r.warnings, themes: { ...r.metrics.themes, ms: 0 } });
  for (const fx of [L.hueOnly, L.ridgeLikeSky, F.good]) assert.deepEqual(strip(checkSprite(fx())), strip(checkSprite(fx())));
});

test('the good fixtures of the other checks do not warn', () => {
  for (const fx of [F.good, F.backgroundGood]) {
    const r = checkSprite(fx());
    assert.deepEqual(looksWarnings(r), [], show(r));
  }
});
