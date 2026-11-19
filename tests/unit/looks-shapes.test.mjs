// "Also change shapes" (Contract 7): a look must never remove or swap what makes a sprite recognisable.
// themedParams in engine/theme.js moves sliders inside the safe middle of their range and picks among the options a
// sprite marks as variants; it never takes a part off, never swaps one for another kind, never flips a switch and
// never touches a colour. Checked on every sprite in sprites/ (the folder is scanned) and on small sprites made here.
// Run with: node --test tests/unit/looks-shapes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { defineSprite, color, range, choice, toggle, defaultParams, cleanParams, renderFrame, partList } from '../../engine/sprite.js';
import { themedParams, spriteLook, renderThemedFrame, applyColour, spriteMaterials, defaultTheme, normalizeTheme, randomTheme, THEME_PRESETS, SHAPES } from '../../engine/theme.js';
import { loadSprites } from '../../tools/lib/assets.mjs';

const sprites = (await loadSprites()).map((s) => s.def);
const SEEDS = Array.from({ length: 40 }, (_, i) => i);
const shaped = (s, seed, base = defaultParams(s)) => themedParams(s, base, { ...defaultTheme(), seed, shapes: true });
const noneOf = (part) => (part.none === undefined ? [] : Array.isArray(part.none) ? part.none : [part.none]);

const SWATCHES = ['#c9423a', '#3f6fd1', '#4f9d57'];
const thing = (params) => defineSprite({
  id: 'shape-thing', name: 'Shape thing', size: [16, 16], pivot: [8, 15],
  params, clips: { idle: { frames: 1, fps: 1 } },
  render(g, { p }) { g.rect(2, 2, 6 + Math.round((p.size ?? 0.5) * 6), 10, p.body ?? '#c9423a'); },
});

test('the limits are named constants', () => {
  assert.ok(SHAPES.spread > 0 && SHAPES.spread <= 0.3, 'a slider moves a part of its travel, not all of it');
  assert.ok(SHAPES.edge >= 0.15 && SHAPES.edge < 0.5, 'the safe middle leaves out a real part of each end');
  assert.ok(SHAPES.vary > 0 && SHAPES.flip > 0);
});

test('without shapes the settings come back untouched', () => {
  for (const s of sprites.slice(0, 20)) {
    const base = defaultParams(s);
    assert.equal(themedParams(s, base, { ...defaultTheme(), seed: 7 }), base);
  }
});

test('every sprite, 40 seeds: no colour changes, no switch flips, nothing is taken off, put on or swapped', () => {
  for (const s of sprites) {
    const base = defaultParams(s), parts = partList(s);
    for (const seed of SEEDS) {
      const p = shaped(s, seed);
      assert.deepEqual(p, cleanParams(s, p), `${s.id} seed ${seed}: not valid settings`);
      for (const [k, d] of Object.entries(s.params)) {
        const part = parts.find((x) => x.selector === k);
        if (d.kind === 'color') assert.equal(p[k], base[k], `${s.id} seed ${seed}: the colour "${d.label}" changed`);
        if (d.look === 'keep') assert.equal(p[k], base[k], `${s.id} seed ${seed}: "${d.label}" is marked look: 'keep' and changed`);
        if ((d.kind === 'choice' || d.kind === 'toggle') && d.look !== 'vary') assert.equal(p[k], base[k], `${s.id} seed ${seed}: "${d.label}" went from ${base[k]} to ${p[k]}; a choice or a switch changes only when the sprite marks it look: 'vary'`);
        if (part) {
          // what it holds or wears: never off, never on, and only another variant when the sprite says its options are variants
          assert.equal(noneOf(part).includes(p[k]) || p[k] === false, noneOf(part).includes(base[k]) || base[k] === false, `${s.id} seed ${seed}: part "${part.name}" was taken off or put on`);
        }
        if (d.kind === 'choice') assert.ok(!['none', 'off'].includes(p[k]) || p[k] === base[k], `${s.id} seed ${seed}: "${d.label}" was switched to ${p[k]}`);
      }
    }
  }
});

test('every sprite, 40 seeds: sliders stay in the safe middle of their range, and never go further out than where they were', () => {
  let moved = 0, sliders = 0;
  for (const s of sprites) {
    const base = defaultParams(s);
    for (const seed of SEEDS) {
      const p = shaped(s, seed);
      for (const [k, d] of Object.entries(s.params)) {
        if (d.kind !== 'range') continue;
        const span = d.max - d.min, lo = Math.min(base[k], d.min + SHAPES.edge * span), hi = Math.max(base[k], d.max - SHAPES.edge * span);
        assert.ok(p[k] >= lo - 1e-6 && p[k] <= hi + 1e-6, `${s.id} seed ${seed}: "${d.label}" went to ${p[k]}, outside ${lo}..${hi} (range ${d.min}..${d.max}, was ${base[k]})`);
        assert.ok(Math.abs(p[k] - base[k]) <= SHAPES.spread * span + (d.step ?? 0) + 1e-6, `${s.id} seed ${seed}: "${d.label}" moved ${Math.abs(p[k] - base[k])}, more than ${SHAPES.spread} of its travel`);
        sliders++;
        if (p[k] !== base[k]) moved++;
      }
    }
  }
  assert.ok(!sliders || moved > sliders * 0.5, `shapes still changes things: ${moved} of ${sliders} slider settings moved`);
});

test('a slider already outside the safe middle may come in, never go further out', () => {
  const s = thing({ size: range('Size', 0.5), body: color('Body', SWATCHES[0], SWATCHES) });
  for (const start of [0, 0.05, 0.95, 1]) for (const seed of SEEDS) {
    const p = shaped(s, seed, cleanParams(s, { size: start }));
    if (start < 0.5) assert.ok(p.size >= start - 1e-9 && p.size <= 1 - SHAPES.edge + 1e-9, `from ${start}, seed ${seed}: ${p.size}`);
    else assert.ok(p.size <= start + 1e-9 && p.size >= SHAPES.edge - 1e-9, `from ${start}, seed ${seed}: ${p.size}`);
  }
});

test('a stepped slider lands on its steps and stays inside the safe middle', () => {
  const s = thing({ teeth: range('Teeth', 8, { min: 6, max: 12, step: 1 }), body: color('Body', SWATCHES[0], SWATCHES) });
  const seen = new Set(SEEDS.map((seed) => shaped(s, seed).teeth));
  for (const v of seen) assert.ok(Number.isInteger(v) && v >= 6 + SHAPES.edge * 6 - 1e-9 && v <= 12 - SHAPES.edge * 6 + 1e-9, `teeth ${v}`);
  assert.ok(seen.size > 1, 'it does move');
});

test("a slider marked look: 'keep' never moves; an unmarked one beside it does", () => {
  const s = thing({ size: range('Size', 0.5, { look: 'keep' }), reach: range('Reach', 0.5), body: color('Body', SWATCHES[0], SWATCHES) });
  assert.equal(s.params.size.look, 'keep');
  const got = SEEDS.map((seed) => shaped(s, seed));
  assert.ok(got.every((p) => p.size === 0.5));
  assert.ok(got.some((p) => p.reach !== 0.5));
});

test("a choice is left alone unless marked look: 'vary'; marked, it picks among its options but never \"none\"", () => {
  const s = thing({
    kind: choice('Kind', 'saw', ['saw', 'ring', 'none']),
    eyes: choice('Eyes', 'round', ['round', 'narrow', 'wide', 'none'], { look: 'vary' }),
    glow: toggle('Glow', true),
    shine: toggle('Shine', true, { look: 'vary' }),
    body: color('Body', SWATCHES[0], SWATCHES),
  });
  const got = SEEDS.map((seed) => shaped(s, seed));
  assert.ok(got.every((p) => p.kind === 'saw'), 'an unmarked choice never changes');
  assert.ok(got.every((p) => p.glow === true), 'an unmarked switch never flips');
  const eyes = new Set(got.map((p) => p.eyes));
  assert.ok(eyes.size >= 2, 'a choice marked as variants does vary');
  assert.ok(!eyes.has('none'), 'and is never switched to "none"');
  assert.ok(got.some((p) => p.shine === false), 'a switch marked as a variant may flip');
  // at "none" already, it stays there: a look does not put something on either
  assert.ok(SEEDS.every((seed) => shaped(s, seed, cleanParams(s, { eyes: 'none' })).eyes === 'none'));
});

test('what a sprite holds or wears is never taken off, put on, or (unless marked as variants) swapped', () => {
  const held = (mark) => defineSprite({
    id: 'shape-holder', name: 'Shape holder', size: [16, 16], pivot: [8, 15],
    params: {
      weapon: choice('Weapon', 'sword', ['sword', 'axe', 'spear', 'none'], mark),
      weaponLength: range('Length', 1, { min: 0.65, max: 1.35 }),
      hat: toggle('Hat', true, mark),
      body: color('Body', SWATCHES[0], SWATCHES),
    },
    parts: { weapon: { params: ['weapon', 'weaponLength'], none: 'none' }, hat: { params: ['hat'] } },
    clips: { idle: { frames: 1, fps: 1 } },
    render(g, { p }) { g.rect(2, 2, 8, 10, p.body); if (p.weapon !== 'none') g.rect(11, 2, 2, Math.round(8 * p.weaponLength), '#c2c9d6'); if (p.hat) g.rect(2, 0, 8, 2, '#3a3350'); },
  });
  const plain = held({});
  for (const seed of SEEDS) {
    const p = shaped(plain, seed);
    assert.equal(p.weapon, 'sword', `seed ${seed}: the weapon became ${p.weapon}`);
    assert.equal(p.hat, true, `seed ${seed}: the hat was taken off`);
  }
  assert.ok(SEEDS.some((seed) => shaped(plain, seed).weaponLength !== 1), 'the part\'s own slider still moves');
  for (const seed of SEEDS) assert.equal(shaped(plain, seed, cleanParams(plain, { weapon: 'none' })).weapon, 'none', 'a look does not hand it a weapon');
  // marked as variants: another weapon, never none; a part's switch never flips even when marked
  const marked = held({ look: 'vary' });
  const weapons = new Set(SEEDS.map((seed) => shaped(marked, seed).weapon));
  assert.ok(weapons.size >= 2 && !weapons.has('none'), [...weapons].join(', '));
  assert.ok(SEEDS.every((seed) => shaped(marked, seed).hat === true), 'a switch that puts a part on or off never flips');
});

test("look takes 'keep' or 'vary' only, and 'vary' is not for colours", () => {
  assert.throws(() => thing({ size: range('Size', 0.5, { look: 'maybe' }) }), /look is "maybe".*'keep'.*'vary'/s);
  assert.throws(() => thing({ body: color('Body', SWATCHES[0], SWATCHES, { look: 'vary' }) }), /look: 'vary' is for shapes/);
});

test('same seed, same settings; different seeds differ; adding a control does not reshuffle the others', () => {
  const a = thing({ size: range('Size', 0.5), reach: range('Reach', 0.5), body: color('Body', SWATCHES[0], SWATCHES) });
  const b = thing({ size: range('Size', 0.5), reach: range('Reach', 0.5), body: color('Body', SWATCHES[0], SWATCHES), extra: range('Extra', 0.5) });
  assert.deepEqual(shaped(a, 5), shaped(a, 5));
  assert.notDeepEqual(shaped(a, 5), shaped(a, 6));
  assert.equal(shaped(b, 5).size, shaped(a, 5).size);
  assert.equal(shaped(b, 5).reach, shaped(a, 5).reach);
});

// ---- the record: the settings actually used ------------------------------------------------------------------------

test('spriteLook records the settings a look actually drew with, and which of them it changed', () => {
  for (const s of sprites.slice(0, 30)) {
    const base = defaultParams(s);
    const plain = spriteLook(s, {}, normalizeTheme(THEME_PRESETS.find((p) => p.theme.colour.palette).theme));
    assert.deepEqual(plain.params, base, `${s.id}: a look without shapes draws with the settings as they are`);
    assert.deepEqual(plain.changed, []);
    const theme = normalizeTheme(randomTheme(7, { shapes: true }));
    const look = spriteLook(s, {}, theme);
    assert.deepEqual(look.params, themedParams(s, base, theme));
    assert.deepEqual(Object.keys(look.params), Object.keys(s.params), `${s.id}: every control is on record, not only the changed ones`);
    assert.deepEqual(look.changed, Object.keys(s.params).filter((k) => look.params[k] !== base[k]));
  }
});

test('the same picture can be made again from the record alone: the recorded settings, then the look\'s colours', () => {
  const theme = normalizeTheme(randomTheme(7, { shapes: true }));
  for (const s of sprites.slice(0, 30)) {
    const record = JSON.parse(JSON.stringify({ params: spriteLook(s, {}, theme).params, colour: theme.colour }));   // as a file would hold it
    const clip = s.preview, f = Math.floor(s.clips[clip].frames / 2);
    const again = renderFrame(s, clip, f, record.params);
    applyColour(again.data, record.colour, spriteMaterials(s, record.params));
    assert.deepEqual(again.data, renderThemedFrame(s, clip, f, {}, theme).data, s.id);
    // and with no look at all on top of the recorded settings, the shapes are already the ones that were drawn
    assert.deepEqual(renderFrame(s, clip, f, record.params).bounds(), renderThemedFrame(s, clip, f, {}, { ...theme, colour: defaultTheme().colour }).bounds(), s.id);
  }
});
