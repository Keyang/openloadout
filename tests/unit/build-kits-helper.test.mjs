// tests/helpers/kits.mjs: the rules tests/e2e/three-bundles.spec.mjs holds the kits to. Checked here on made-up
// catalogues, so the rules themselves are proven for cases the real site does not have today: a fourth kit, a kit
// that is too small, a kit the catalogue does not list, and fewer than three kits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kitsOf, kitProblems, setProblems, sizeProblems, isFullKit, playerless, MIN_KITS } from '../helpers/kits.mjs';
import { KIT_SIZE, SMALL_KIT_SIZE, KIT_SIZE_MOST, kitSize, loadPlans, ROOT } from '../../tools/lib/assets.mjs';

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

// ---- a kit's size read from its plan (helper batch AK0 of bundles/specs/kit-adventure-hearthvale.md; the Gridline kit's GH0) ----

const OWN = { sprites: [50, 60], sounds: [30, 36], music: [4, 6] };
const BAD_SIZES = [
  ['not an object', [50, 60], /"size" must be \{ sprites, sounds, music \}/],
  ['a kind left out', { sprites: [50, 60], sounds: [30, 36] }, /"size\.music" must be \[fewest, most\]/],
  ['a kind it does not know', { ...OWN, icons: [1, 2] }, /"size\.icons" is not a kind/],
  ['one number', { ...OWN, sprites: [50] }, /"size\.sprites" must be \[fewest, most\]/],
  ['three numbers', { ...OWN, sprites: [50, 55, 60] }, /"size\.sprites" must be \[fewest, most\]/],
  ['a plain number', { ...OWN, sounds: 30 }, /"size\.sounds" must be \[fewest, most\]/],
  ['a fraction', { ...OWN, sounds: [30, 36.5] }, /"size\.sounds" must be \[fewest, most\]: two whole numbers/],
  ['a number as text', { ...OWN, music: ['4', '6'] }, /"size\.music" must be \[fewest, most\]: two whole numbers/],
  ['fewest above most', { ...OWN, music: [6, 4] }, /"size\.music" is \[6, 4\]; the fewest cannot be above the most/],
  ['fewest of none', { ...OWN, music: [0, 4] }, /"size\.music" is \[0, 4\]; a kit holds at least 1/],
  ['a negative number', { ...OWN, sprites: [-5, 60] }, /"size\.sprites" is \[-5, 60\]; a kit holds at least 1/],
  ['most above the bound', { ...OWN, sprites: [50, KIT_SIZE_MOST.sprites + 1] }, new RegExp(`"size\\.sprites" is \\[50, ${KIT_SIZE_MOST.sprites + 1}\\]; the most a plan may ask for is ${KIT_SIZE_MOST.sprites}`)],
];

test('kitSize: a plan with no size of its own has the rule that holds today, and each caller keeps its own', () => {
  const plain = { id: 'kit-a', gameType: 'platformer' };
  assert.deepEqual(kitSize(plain), SMALL_KIT_SIZE);
  assert.deepEqual(kitSize(undefined), SMALL_KIT_SIZE);
  assert.deepEqual(kitSize(plain, KIT_SIZE), KIT_SIZE);          // the size note of tools/bundles-from-plans.mjs
  // the two rules themselves are not moved by this helper
  assert.deepEqual(SMALL_KIT_SIZE, { sprites: [12, 50], sounds: [8, 30], music: [1, 4] });
  assert.deepEqual(KIT_SIZE, { sprites: [40, 50], sounds: [20, 20], music: [2, 2] });
});

test('kitSize: a plan that declares a size has that size, whatever its game type, and whichever rule the caller falls back to', () => {
  for (const gameType of ['puzzle', 'top-down-rpg', 'platformer', 'roguelike-action', undefined]) {
    const plan = { id: 'kit-x', gameType, size: OWN };
    assert.deepEqual(kitSize(plan), OWN, String(gameType));
    assert.deepEqual(kitSize(plan, KIT_SIZE), OWN, String(gameType));
  }
  const got = kitSize({ id: 'kit-x', size: OWN });
  got.sprites[1] = 999;                                           // what it returns is a copy: the plan is not changed through it
  assert.deepEqual(OWN.sprites, [50, 60]);
  // the bounds: 1 at the least, KIT_SIZE_MOST at the most, and both ends are allowed
  assert.deepEqual(KIT_SIZE_MOST, { sprites: 200, sounds: 120, music: 16 });
  const widest = { sprites: [1, KIT_SIZE_MOST.sprites], sounds: [1, KIT_SIZE_MOST.sounds], music: [1, KIT_SIZE_MOST.music] };
  assert.deepEqual(kitSize({ id: 'kit-x', size: widest }), widest);
  assert.deepEqual(kitSize({ id: 'kit-x', size: { sprites: [7, 7], sounds: [7, 7], music: [7, 7] } }).music, [7, 7]);
});

test('kitSize: a size that is not two whole numbers per kind, fewest first, inside the bounds, is refused', () => {
  for (const [what, size, message] of BAD_SIZES) {
    assert.throws(() => kitSize({ id: 'kit-x', gameType: 'puzzle', size }), message, what);
    assert.throws(() => kitSize({ id: 'kit-x', gameType: 'puzzle', size }, KIT_SIZE), message, what);
  }
  assert.throws(() => kitSize({ id: 'kit-x', size: null }), /"size" must be/, 'null is a size that says nothing');
});

test('loadPlans: a plan of any game type may carry a size; a bad one throws, naming the plan\'s file', async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-kit-size-'));
  const specs = path.join(root, 'bundles', 'specs');
  fs.mkdirSync(specs, { recursive: true });
  const write = (id, more) => fs.writeFileSync(path.join(specs, `${id}.plan.json`), JSON.stringify({ id, name: id, sprites: [], sounds: [], music: [], ...more }));
  write('kit-puzzle', { gameType: 'puzzle', size: { sprites: [20, 30], sounds: [20, 26], music: [2, 4] } });
  write('kit-rpg', { gameType: 'top-down-rpg', size: OWN });
  write('kit-plain', { gameType: 'platformer' });
  const plans = loadPlans(root);
  assert.deepEqual(plans.map((p) => p.id), ['kit-plain', 'kit-puzzle', 'kit-rpg']);
  assert.deepEqual(plans.map((p) => kitSize(p.plan)), [SMALL_KIT_SIZE, { sprites: [20, 30], sounds: [20, 26], music: [2, 4] }, OWN]);
  for (const [what, size, message] of BAD_SIZES) {
    write('kit-rpg', { gameType: 'top-down-rpg', size });
    assert.throws(() => loadPlans(root), (e) => e.message.startsWith('bundles/specs/kit-rpg.plan.json: ') && message.test(e.message), what);
  }
  write('kit-rpg', { gameType: 'top-down-rpg', size: null });
  assert.throws(() => loadPlans(root), (e) => e.message.startsWith('bundles/specs/kit-rpg.plan.json: "size" must be'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('sizeProblems: without a plan, or with a plan that has no size, it is the rule for any kit; with a plan\'s own size, that size', () => {
  const bundle = (sprites, sounds, music) => ({ id: 'k', sprites: many('s', sprites), sounds: many('n', sounds), music: many('m', music) });
  const big = bundle(56, 34, 6), small = bundle(24, 24, 4);
  const plain = { id: 'k', gameType: 'top-down-rpg' }, own = { ...plain, size: OWN };
  // the rule that holds today, three ways of not giving a size
  for (const plan of [undefined, null, plain]) {
    assert.deepEqual(sizeProblems(small, plan), []);
    assert.deepEqual(sizeProblems(big, plan), ['k holds 56 sprites; a kit holds 12 to 50', 'k holds 34 sounds; a kit holds 8 to 30', 'k holds 6 music tracks; a kit holds 1 to 4']);
  }
  // a plan's own size: what was too big is inside, and what was inside is now too small
  assert.deepEqual(sizeProblems(big, own), []);
  assert.deepEqual(sizeProblems(small, own), ['k holds 24 sprites; its plan says a kit of 50 to 60', 'k holds 24 sounds; its plan says a kit of 30 to 36']);   // 4 tracks are inside 4 to 6
  for (const [field, [lo, hi]] of Object.entries(OWN)) {
    for (const n of [lo, hi]) assert.deepEqual(sizeProblems({ ...big, [field]: many('x', n) }, own), [], `${n} ${field} is inside`);
    for (const n of [lo - 1, hi + 1]) assert.equal(sizeProblems({ ...big, [field]: many('x', n) }, own).length, 1, `${n} ${field} is outside`);
  }
  assert.deepEqual(sizeProblems(bundle(3, 3, 2), { ...plain, size: { sprites: [3, 3], sounds: [3, 3], music: [3, 3] } }), ['k holds 2 music tracks; its plan says a kit of 3']);
  // a plan with a bad size never passes quietly
  assert.throws(() => sizeProblems(big, { ...plain, size: { ...OWN, music: [6, 4] } }), /"size\.music"/);
});

test('kitProblems holds a kit to its own plan\'s size: a big kit that declares its size passes, the same kit without one does not', () => {
  const big = { id: 'kit-d', gameType: 'top-down-rpg', sprites: 56, sounds: 34, music: 6 };
  const without = site([...three, big]);
  assert.deepEqual(allProblems(without), ['kit-d holds 56 sprites; a kit holds 12 to 50', 'kit-d holds 34 sounds; a kit holds 8 to 30', 'kit-d holds 6 music tracks; a kit holds 1 to 4']);
  const withSize = site([...three, big]);
  withSize.plans.find((p) => p.id === 'kit-d').plan.size = OWN;
  assert.deepEqual(allProblems(withSize), []);
  // ... and it does not become one of the three full kits by declaring a size
  assert.equal(isFullKit(withSize.catalog.bundles.find((b) => b.id === 'kit-d')), false);
  const two = site([...three.slice(0, 2), { ...big, id: 'kit-c' }]);
  two.plans.find((p) => p.id === 'kit-c').plan.size = OWN;
  assert.deepEqual(allProblems(two), ['there are 2 full kits (kit-a, kit-b); there must be at least 3', 'the full kits are for 2 kinds of game (platformer, turn-based-rpg); there must be full kits for at least 3 different kinds']);
  // a declared size is a size to keep: one sprite over it is said
  const over = site([...three, { ...big, sprites: 61 }]);
  over.plans.find((p) => p.id === 'kit-d').plan.size = OWN;
  assert.deepEqual(allProblems(over), ['kit-d holds 61 sprites; its plan says a kit of 50 to 60']);
});

test('every plan on disk is inside the size it is held to, and the acceptance test asks with the kit\'s plan', async () => {
  const fs = await import('node:fs');
  const plans = loadPlans(ROOT);
  assert.ok(plans.length >= 5, `${plans.length} plans`);
  const n = (list) => (list ?? []).length;
  for (const { id, file, plan } of plans) {
    assert.deepEqual(kitSize(plan), plan.size ?? SMALL_KIT_SIZE, file);
    assert.deepEqual(sizeProblems({ id, sprites: plan.sprites ?? [], sounds: plan.sounds ?? [], music: plan.music ?? [] }, plan), [], `${file}: ${n(plan.sprites)} sprites, ${n(plan.sounds)} sounds, ${n(plan.music)} tracks`);
  }
  assert.ok(plans.some(({ plan }) => plan.size && sizeProblems({ id: plan.id, sprites: plan.sprites, sounds: plan.sounds, music: plan.music }).length), 'a plan on disk is bigger than a kit may be without a size of its own');
  assert.ok(plans.filter(({ plan }) => !plan.size).length >= 3, 'the three full kits declare no size');
  const spec = fs.readFileSync(new URL('../e2e/three-bundles.spec.mjs', import.meta.url), 'utf8');
  assert.match(spec, /sizeProblems\(bundle, kit\.plan\)/);
  assert.doesNotMatch(spec, /sizeProblems\(bundle\)/);
  assert.match(spec, /kitSize\(kit\.plan\)/, 'its message names the plan\'s size');
});

test('a kit whose plan says view "none" has no player by design; every other kit has one', () => {
  assert.equal(playerless({ view: 'none' }), true);
  for (const view of ['side', 'top-down', 'front']) assert.equal(playerless({ view }), false, view);
  assert.equal(playerless({}), false);
  assert.equal(playerless(undefined), false);
  const gridline = loadPlans(ROOT).find((k) => k.id === 'kit-puzzle-gridline');
  assert.equal(playerless(gridline.plan), true, 'the falling-block puzzle has no player');
  for (const { id, plan } of loadPlans(ROOT).filter((k) => k.id !== 'kit-puzzle-gridline')) assert.equal(playerless(plan), false, `${id} has a player`);
});
