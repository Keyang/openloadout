// tests/helpers/kits.mjs: the rules tests/e2e/three-bundles.spec.mjs holds the kits to. Checked here on made-up
// catalogues, so the rules themselves are proven for cases the real site does not have today: a fourth kit, a kit
// that is too small, a kit the catalogue does not list, and fewer than three kits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kitsOf, kitProblems, setProblems, sizeProblems, isFullKit, MIN_KITS } from '../helpers/kits.mjs';
import { KIT_SIZE, SMALL_KIT_SIZE, loadPlans, ROOT } from '../../tools/lib/assets.mjs';

const many = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

/** A made-up site: kits [{ id, gameType, sprites: n, sounds: n, music: n }] become plans, bundles and assets. */
function site(kits) {
  const assets = [], bundles = [], plans = [];
  for (const k of kits) {
    const sprites = many(`${k.id}-sprite`, k.sprites ?? KIT_SIZE.sprites[0]), sounds = many(`${k.id}-sound`, k.sounds ?? KIT_SIZE.sounds[0]), music = many(`${k.id}-track`, k.music ?? KIT_SIZE.music[0]);
    for (const [kind, list] of [['sprite', sprites], ['sound', sounds], ['music', music]]) for (const id of list) assets.push({ id, kind, bundles: [k.id] });
    bundles.push({ id: k.id, name: k.id, gameType: k.gameType, level: 'kit', blurb: 'x', sprites, sounds, music, theme: {} });
    plans.push({ id: k.id, file: `bundles/specs/${k.id}.plan.json`, plan: { id: k.id, gameType: k.gameType, sprites: sprites.map((id) => ({ id })), sounds: sounds.map((id) => ({ id })), music: music.map((id) => ({ id })) } });
  }
  // a small starter bundle with no plan: level "kit" like the real ones, and not a kit under these rules
  bundles.push({ id: 'starter', name: 'Starter', gameType: 'any', level: 'kit', blurb: 'x', sprites: [], sounds: [], music: [], theme: {} });
  return { catalog: { version: 1, assets, bundles }, plans };
}
const three = [{ id: 'kit-a', gameType: 'platformer' }, { id: 'kit-b', gameType: 'turn-based-rpg' }, { id: 'kit-c', gameType: 'roguelike-action' }];
const allProblems = ({ catalog, plans }) => { const kits = kitsOf(catalog, plans); return [...setProblems(kits), ...kits.flatMap((k) => kitProblems(k, catalog))]; };

test('three full kits for three kinds of game: nothing wrong', () => {
  const s = site(three);
  assert.deepEqual(kitsOf(s.catalog, s.plans).map((k) => k.id), ['kit-a', 'kit-b', 'kit-c']);
  assert.deepEqual(allProblems(s), []);
});

test('a fourth kit is one more kit to check, not a failure', () => {
  const s = site([...three, { id: 'kit-d', gameType: 'platformer' }]);     // a second platformer kit is fine: there are still three kinds
  assert.equal(kitsOf(s.catalog, s.plans).length, 4);
  assert.deepEqual(allProblems(s), []);
});

test('every kit is held to the size any kit may have, the fourth one too', () => {
  const s = site([...three, { id: 'kit-d', gameType: 'shooter', sprites: 5, sounds: 2, music: 6 }]);
  const problems = allProblems(s);
  assert.equal(problems.length, 3, problems.join('\n'));
  assert.match(problems[0], /kit-d holds 5 sprites; a kit holds 12 to 50/);
  assert.match(problems[1], /kit-d holds 2 sounds; a kit holds 8 to 30/);
  assert.match(problems[2], /kit-d holds 6 music tracks; a kit holds 1 to 4/);
  const base = { id: 'k', sprites: many('s', SMALL_KIT_SIZE.sprites[0]), sounds: many('n', SMALL_KIT_SIZE.sounds[0]), music: many('m', SMALL_KIT_SIZE.music[0]) };
  for (const [field, [lo, hi]] of Object.entries(SMALL_KIT_SIZE)) {
    for (const n of [lo, hi]) assert.deepEqual(sizeProblems({ ...base, [field]: many('x', n) }), [], `${n} ${field} is inside`);
    for (const n of [lo - 1, hi + 1]) assert.equal(sizeProblems({ ...base, [field]: many('x', n) }).length, 1, `${n} ${field} is outside`);
  }
});

test('a small kit is allowed beside three full kits, and does not count as one of them', () => {
  const small = { id: 'kit-d', gameType: 'puzzle', sprites: 24, sounds: 24, music: 4 };
  const s = site([...three, small]);
  assert.deepEqual(allProblems(s), []);
  assert.equal(isFullKit(s.catalog.bundles.find((b) => b.id === 'kit-d')), false);
  for (const [field, [lo, hi]] of Object.entries(KIT_SIZE)) {
    const full = { id: 'k', sprites: many('s', KIT_SIZE.sprites[0]), sounds: many('n', KIT_SIZE.sounds[0]), music: many('m', KIT_SIZE.music[0]) };
    assert.equal(isFullKit({ ...full, [field]: many('x', hi) }), true);
    assert.equal(isFullKit({ ...full, [field]: many('x', lo - 1) }), false);
  }
  const text = allProblems(site([...three.slice(0, 2), { ...small, id: 'kit-c' }])).join('\n');
  assert.match(text, /there are 2 full kits \(kit-a, kit-b\); there must be at least 3/);
});

test('fewer than three kits, or fewer than three kinds of game, is said', () => {
  assert.match(allProblems(site(three.slice(0, 2))).join('\n'), new RegExp(`there are 2 full kits .*at least ${MIN_KITS}`));
  const same = allProblems(site([{ id: 'kit-a', gameType: 'platformer' }, { id: 'kit-b', gameType: 'platformer' }, { id: 'kit-c', gameType: 'shooter' }]));
  assert.equal(same.length, 1);
  assert.match(same[0], /2 kinds of game \(platformer, shooter\)/);
});

test('a kit with a plan that the catalogue does not list says how to get it there', () => {
  const s = site(three);
  s.catalog.bundles = s.catalog.bundles.filter((b) => b.id !== 'kit-b');
  const problems = allProblems(s);
  assert.match(problems.join('\n'), /"kit-b" has a plan .* the catalogue does not list it/);
  assert.match(problems.join('\n'), /bundles-from-plans\.mjs/);
});

test('a kit that is not what its plan says, or lists an asset the catalogue lacks, is said', () => {
  const s = site(three);
  const b = s.catalog.bundles.find((x) => x.id === 'kit-a');
  b.sprites = [...b.sprites.slice(1), 'stray'];
  b.gameType = 'shooter';
  const text = allProblems(s).join('\n');
  assert.match(text, /kit-a: its sprites in the catalogue are not the ones its plan lists \(not in the catalogue: kit-a-sprite-0\) \(not in the plan: stray\)/);
  assert.match(text, /kit-a lists the sprite "stray", which the catalogue does not have/);
  assert.match(text, /kit-a is for "shooter" in the catalogue but its plan says "platformer"/);
});

test('no kit is named in the helper or in the test that uses it', async () => {
  const fs = await import('node:fs');
  for (const file of ['tests/helpers/kits.mjs', 'tests/e2e/three-bundles.spec.mjs']) {
    const text = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    for (const { id, plan } of loadPlans(ROOT)) {
      assert.ok(!text.includes(id), `${file} names ${id}`);
      assert.ok(!text.includes(plan.name), `${file} names "${plan.name}"`);
    }
  }
});
