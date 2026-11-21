// tools/bundles-from-plans.mjs: a kit is its plan file (bundles/specs/<id>.plan.json) and its assets, and nothing
// else. Everything that is about one kit (its name, its sentence on the site, its palette) is read from the plan,
// so a new kit is new files only. These tests add a fourth kit to a scratch copy and never touch the real folders.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPlans, loadBundles, KIT_SIZE } from '../../tools/lib/assets.mjs';
import { validateBundle } from '../../catalog/schema.js';

const REAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = path.join(REAL, 'tools', 'bundles-from-plans.mjs');
const realPlans = loadPlans(REAL);
const idsOf = (list) => list.map((x) => (typeof x === 'string' ? x : x.id));

/** A scratch project: the real plans and bundle files, the engine (for its palettes), and empty asset files. */
function makeCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-plans-'));
  fs.cpSync(path.join(REAL, 'bundles'), path.join(dir, 'bundles'), { recursive: true });
  fs.cpSync(path.join(REAL, 'engine'), path.join(dir, 'engine'), { recursive: true });
  fs.cpSync(path.join(REAL, 'sound'), path.join(dir, 'sound'), { recursive: true });   // engine/versions.js names sounds in everyday words (sound/words.js)
  fs.cpSync(path.join(REAL, 'rigs'), path.join(dir, 'rigs'), { recursive: true });     // engine/sprite.js reads a `when` with engine/data-rules.js, which imports rigs/ (build item F3)
  fs.mkdirSync(path.join(dir, 'sprites'));
  fs.mkdirSync(path.join(dir, 'sounds'));
  // the tool only asks whether an asset's file is there
  for (const { plan } of realPlans) {
    for (const id of idsOf(plan.sprites)) fs.writeFileSync(path.join(dir, 'sprites', `${id}.json`), '{}');
    for (const id of [...idsOf(plan.sounds), ...idsOf(plan.music)]) fs.writeFileSync(path.join(dir, 'sounds', `${id}.json`), '{}');
  }
  return dir;
}
const run = (root, ...args) => {
  const r = spawnSync(process.execPath, [TOOL, '--root', root, ...args], { encoding: 'utf8', timeout: 60000 });
  return { code: r.status, out: r.stdout + r.stderr };
};
const readBundle = (root, id) => JSON.parse(fs.readFileSync(path.join(root, 'bundles', `${id}.json`), 'utf8'));
/** A fourth kit made from an existing plan: same assets and palette, its own id, name and sentence, and no size of its own unless `change` gives one. */
function fourthPlan(change = {}) {
  const { size: _size, ...base } = realPlans[0].plan;             // the plan it copies may declare a size (kitSize); the fourth kit is an ordinary one
  return { ...base, id: 'kit-fourth-test', name: 'Fourth test kit', blurb: 'A fourth kit, added by a test with no change to any code.', ...change };
}
const writePlan = (root, plan) => fs.writeFileSync(path.join(root, 'bundles', 'specs', `${plan.id}.plan.json`), JSON.stringify(plan, null, 2));

test('there are plans, and every one carries what is about its kit', () => {
  assert.ok(realPlans.length >= 3, `${realPlans.length} kit plans`);
  for (const { id, file, plan } of realPlans) {
    assert.equal(file, `bundles/specs/${id}.plan.json`);
    for (const key of ['name', 'gameType', 'blurb']) assert.ok(typeof plan[key] === 'string' && plan[key].trim(), `${file}: "${key}"`);
    assert.ok(plan.blurb.length >= 40 && /\.$/.test(plan.blurb), `${file}: "blurb" is a sentence for the kit's page`);
    assert.ok(plan.palette?.name, `${file}: names its palette`);
  }
});

test('the tool holds nothing about any one kit: no kit id, name or sentence is written in its code', () => {
  const code = fs.readFileSync(TOOL, 'utf8');
  for (const { id, plan } of realPlans) {
    assert.ok(!code.includes(id), `tools/bundles-from-plans.mjs names ${id}`);
    assert.ok(!code.includes(plan.name), `tools/bundles-from-plans.mjs names "${plan.name}"`);
    assert.ok(!code.includes(plan.blurb.slice(0, 40)), `tools/bundles-from-plans.mjs holds the sentence of ${id}`);
  }
});

test('the bundle files on disk are what the plans say (nothing is lost by moving the sentences into the plans)', () => {
  const root = makeCopy();
  const before = Object.fromEntries(realPlans.map(({ id }) => [id, fs.readFileSync(path.join(root, 'bundles', `${id}.json`), 'utf8')]));
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  for (const { id } of realPlans) {
    assert.match(r.out, new RegExp(`${id}: written`));
    assert.equal(fs.readFileSync(path.join(root, 'bundles', `${id}.json`), 'utf8'), before[id], `bundles/${id}.json`);
  }
});

test('a fourth kit is new files only: its plan (and its assets) and nothing else', () => {
  const root = makeCopy();
  const plan = fourthPlan();
  writePlan(root, plan);
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /kit-fourth-test: written/);
  const b = readBundle(root, plan.id);
  assert.equal(b.name, plan.name);
  assert.equal(b.blurb, plan.blurb, 'the sentence on the site is the one in the plan');
  assert.equal(b.gameType, plan.gameType);
  assert.equal(b.level, 'kit');
  assert.deepEqual(b.sprites, idsOf(plan.sprites));
  assert.deepEqual(b.sounds, idsOf(plan.sounds));
  assert.deepEqual(b.music, idsOf(plan.music));
  // the build takes it: the bundle is valid as the catalogue's rules have it
  const known = { sprite: b.sprites, sound: b.sounds, music: b.music };
  assert.deepEqual(validateBundle(b, known).errors, []);
  assert.equal(loadBundles(root).some((x) => x.id === plan.id), true);
  // --check agrees, and writes nothing
  const stamp = fs.statSync(path.join(root, 'bundles', `${plan.id}.json`)).mtimeMs;
  const c = run(root, '--check');
  assert.equal(c.code, 0, c.out);
  assert.match(c.out, /kit-fourth-test: complete/);
  assert.equal(fs.statSync(path.join(root, 'bundles', `${plan.id}.json`)).mtimeMs, stamp);
});

test('a plan with no sentence for the site is refused, with what to add and where', () => {
  const root = makeCopy();
  const plan = fourthPlan();
  delete plan.blurb;
  writePlan(root, plan);
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /kit-fourth-test: not written/);
  assert.match(r.out, /"blurb"/);
  assert.match(r.out, /bundles\/specs\/kit-fourth-test\.plan\.json/);
  assert.equal(fs.existsSync(path.join(root, 'bundles', 'kit-fourth-test.json')), false);
  // the other kits are still written
  for (const { id } of realPlans) assert.match(r.out, new RegExp(`${id}: written`));
});

test('a plan that brings a palette the engine does not have is refused, with the step that adds it', () => {
  const root = makeCopy();
  writePlan(root, fourthPlan({ palette: { name: 'Zorbleflux', colours: { ink: '#231b33', glow: '#5fe0f0' } } }));
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /kit-fourth-test: not written/);
  assert.match(r.out, /palette "Zorbleflux"/);
  assert.match(r.out, /engine\/palettes\.js/, 'it names the file the palette goes in');
  assert.match(r.out, /palettes-core\.test\.mjs/, 'and the test to run after');
  // ... or to reuse one that exists: it lists them, read from the engine
  for (const { plan } of realPlans) assert.ok(r.out.toLowerCase().includes(plan.palette.name.toLowerCase()), `lists the palette ${plan.palette.name}`);
  assert.equal(fs.existsSync(path.join(root, 'bundles', 'kit-fourth-test.json')), false);
});

test('a plan whose palette colours differ from the engine\'s is refused, naming the colours', () => {
  const root = makeCopy();
  const base = realPlans[0].plan;
  const [first] = Object.keys(base.palette.colours);
  writePlan(root, fourthPlan({ palette: { name: base.palette.name, colours: { ...base.palette.colours, [first]: '#010203' } } }));
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /kit-fourth-test: not written/);
  assert.ok(r.out.includes(first) && r.out.includes('#010203'), r.out);
  assert.match(r.out, /engine\/palettes\.js/);
});

test('a kit that reuses a palette names it and lists no colours', () => {
  const root = makeCopy();
  writePlan(root, fourthPlan({ palette: { name: realPlans[0].plan.palette.name } }));
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /kit-fourth-test: written/);
});

test('assets still to come are listed, the bundle is not written, and --check exits 1', () => {
  const root = makeCopy();
  const plan = fourthPlan();
  plan.sprites = [...plan.sprites, { id: 'not-drawn-yet' }];
  writePlan(root, plan);
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /kit-fourth-test: not written, 1 asset still to come: sprites\/not-drawn-yet\.json/);
  assert.equal(fs.existsSync(path.join(root, 'bundles', 'kit-fourth-test.json')), false);
  assert.equal(run(root, '--check').code, 1);
});

test('a kit outside the size a full kit has is written, with a note that says the size', () => {
  const root = makeCopy();
  const plan = fourthPlan();
  plan.sprites = plan.sprites.slice(0, 5);
  writePlan(root, plan);
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /kit-fourth-test: written/);
  assert.match(r.out, new RegExp(`${KIT_SIZE.sprites[0]} to ${KIT_SIZE.sprites[1]} sprites`), r.out);
  assert.match(r.out, /this plan lists 5/);
});

test('a plan file that is not valid, or is named for another kit, is reported by its file name', () => {
  const root = makeCopy();
  fs.writeFileSync(path.join(root, 'bundles', 'specs', 'kit-broken.plan.json'), '{ "id": "kit-broken", ');
  let r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /bundles\/specs\/kit-broken\.plan\.json/);
  assert.match(r.out, /JSON/);
  assert.doesNotMatch(r.out, /\n\s+at /, 'no stack trace');
  fs.writeFileSync(path.join(root, 'bundles', 'specs', 'kit-broken.plan.json'), JSON.stringify(fourthPlan({ id: 'kit-other' })));
  r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /bundles\/specs\/kit-broken\.plan\.json/);
  assert.match(r.out, /"id" must be "kit-broken"/);
});

test('the size of a full kit is the one the acceptance criterion gives', () => {
  // 40 to 50 sprites, 20 sounds and 2 music tracks (docs/progress.md, goal G1). Written out here on purpose:
  // changing the rule is a decision, not an edit to one constant.
  assert.deepEqual(KIT_SIZE, { sprites: [40, 50], sounds: [20, 20], music: [2, 2] });
});

// ---- a plan's own size (helper batch AK0 of bundles/specs/kit-adventure-hearthvale.md) ----

test('a plan that declares its own size and is inside it is written with no size note', () => {
  const root = makeCopy();
  const plan = fourthPlan({ size: { sprites: [3, 8], sounds: [1, 120], music: [1, 16] } });
  plan.sprites = plan.sprites.slice(0, 5);
  writePlan(root, plan);
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /kit-fourth-test: written \(5 sprites/);
  assert.doesNotMatch(r.out, /kit-fourth-test: note/, r.out);
});

test('a plan outside the size it declares is written, with a note that says its own size', () => {
  const root = makeCopy();
  const plan = fourthPlan({ size: { sprites: [50, 60], sounds: [1, 120], music: [1, 16] } });
  plan.sprites = plan.sprites.slice(0, 5);
  writePlan(root, plan);
  const r = run(root);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /kit-fourth-test: written/);
  assert.match(r.out, /kit-fourth-test: note: this plan says its kit holds 50 to 60 sprites, 1 to 120 sounds, 1 to 16 music tracks \("size" in bundles\/specs\/kit-fourth-test\.plan\.json\); it lists 5 sprites\./, r.out);
  assert.doesNotMatch(r.out, /kit-fourth-test: note: a full kit/);
});

test('a plan whose size is not two whole numbers, fewest first, is not written and is reported by its file name', () => {
  const root = makeCopy();
  writePlan(root, fourthPlan({ size: { sprites: [60, 50], sounds: [30, 36], music: [4, 6] } }));
  const r = run(root);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /bundles\/specs\/kit-fourth-test\.plan\.json: "size\.sprites" is \[60, 50\]/);
  assert.doesNotMatch(r.out, /\n\s+at /, 'no stack trace');
  assert.equal(fs.existsSync(path.join(root, 'bundles', 'kit-fourth-test.json')), false);
});

test('the real plans: no plan that is inside its own size gets a size note', () => {
  const root = makeCopy();
  const r = run(root, '--check');
  for (const { id, plan } of realPlans) {
    if (!plan.size) continue;
    const inside = ['sprites', 'sounds', 'music'].every((k) => plan[k].length >= plan.size[k][0] && plan[k].length <= plan.size[k][1]);
    assert.ok(inside, `${id} is inside the size its plan declares`);
    assert.doesNotMatch(r.out, new RegExp(`${id}: note`), r.out);
  }
});
