// The quality bar and its cache for data sprites (docs/data-sprites.md 4.2 and build item B9). A data sprite's cached
// result is keyed on: its definition, every generator and piece it names (the validator's `uses` list, id@v, with the
// generator's own code and the piece files), the code that draws and checks it (engine/data-sprite.js and what it
// loads, quality/sprite.js, the worker), and the sounds its cues name. Not on the generator families as files, so a
// change to one generator re-checks only the sprites naming it. Each test works in a scratch project with COPIES of the
// framework (tests/helpers/data-sprites.mjs), so it may edit a generator or the checker there.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runQuality, assetFiles, failureReport, UnknownAsset, dataSpriteDeps } from '../../tools/lib/quality-run.mjs';
import { dataProject, coinDef, badgeDef, tuftDef, asFile, editFile } from '../helpers/data-sprites.mjs';

/** Runs the bar over every sprite of the project (no sounds): { checked: ids checked again, failed: ids that fail, results }. */
async function run(root, sprites) {
  const { results } = await runQuality({ root, sprites, sounds: [], workers: 2 });
  for (const r of results) assert.ok(!(r.errors ?? []).some((e) => /checker (crashed|stopped)/.test(e)), `${r.id}: ${r.errors.join('; ')}`);
  return { checked: results.filter((r) => !r.cached).map((r) => r.id).sort(), failed: results.filter((r) => !r.ok).map((r) => r.id).sort(), results };
}
const pick = ({ checked, failed }) => ({ checked, failed });
async function fresh(extra = {}) {
  const root = dataProject({ data: { coin: coinDef(), badge: badgeDef(), 'tuft-pot': tuftDef() }, pieces: true, ...extra });
  assert.deepEqual(pick(await run(root)), { checked: ['badge', 'coin', 'tuft-pot'], failed: [] }, 'the first run checks every data sprite');
  assert.deepEqual(pick(await run(root)), { checked: [], failed: [] }, 'the second run checks nothing');
  return root;
}

test('the bar checks data sprites like code sprites; a second run serves them from the cache', async () => {
  const root = await fresh();
  const { results } = await run(root);
  const coin = results.find((r) => r.id === 'coin');
  assert.equal(coin.kind, 'sprite');
  assert.equal(coin.file, 'sprites/coin.json');
  assert.equal(coin.ok, true);
  assert.equal(coin.cached, true);
  assert.ok(coin.metrics.looks > 0, 'what the bar measured is kept');
});

test('a change to one generator re-checks only the sprites naming it', async () => {
  const root = await fresh();
  // twinkle@1 is named by the coin only
  editFile(root, 'engine/gen/fx.js', 'const s = a.size, x', 'const s = a.size + 0, x');
  assert.deepEqual(pick(await run(root)), { checked: ['coin'], failed: [] });
  assert.deepEqual(pick(await run(root)), { checked: [], failed: [] });
  // mark@1 is named by the coin and the badge, not by the tuft pot
  editFile(root, 'engine/gen/mark.js', 'const inside = markIn(', 'const inside = (0, markIn)(');
  assert.deepEqual(pick(await run(root)), { checked: ['badge', 'coin'], failed: [] });
});

test('a generator that now draws something else fails the sprites naming it at once: no stale pass', async () => {
  const root = await fresh();
  // twinkle@1 now draws its sparkle 13 pixels to the right: off the coin's frame, so the coin's Sparkle does nothing
  editFile(root, 'engine/gen/fx.js', "at: [x - s, y - s], anchor: 'tl'", "at: [x - s + 13, y - s], anchor: 'tl'");
  const r = await run(root);
  assert.deepEqual(r.checked, ['coin']);
  assert.deepEqual(r.failed, ['coin']);
});

test('a new version of a generator re-checks nothing until a definition names it, then only that sprite', async () => {
  const root = await fresh();
  fs.appendFileSync(path.join(root, 'engine', 'gen', 'fx.js'), `
/** twinkle@2: the same sparkle one pixel lower (a test version). */
export const twinkle2 = defineGenerator({ id: 'twinkle', v: 2, family: 'fx', about: twinkle.about, args: twinkle.args, keyable: ['size'], cost: () => 1,
  run: (a) => twinkle.run({ ...a, at: [a.at[0], a.at[1] + 1] }) });
`);
  assert.deepEqual(pick(await run(root)), { checked: [], failed: [] }, 'nothing names twinkle@2 yet');
  const coin = coinDef();
  coin.body.pictures.draw[3].v = 2;
  fs.writeFileSync(path.join(root, 'sprites', 'coin.json'), asFile(coin));
  assert.deepEqual(pick(await run(root)), { checked: ['coin'], failed: [] });
});

test('a change to a piece re-checks only the sprites using it, through pieces that use pieces', async () => {
  const root = await fresh();
  // stamp:test-clod@1 is used by part:test-tuft@1, which the tuft pot uses
  editFile(root, 'pieces/stamp-test-clod.v1.json', '"rows": ["b.", "aa"]', '"rows": ["bb", "aa"]');
  assert.deepEqual(pick(await run(root)), { checked: ['tuft-pot'], failed: [] });
  // a new piece file nobody names re-checks nothing
  fs.copyFileSync(path.join(root, 'pieces', 'stamp-test-clod.v1.json'), path.join(root, 'pieces', 'stamp-test-clod.v2.json'));
  editFile(root, 'pieces/stamp-test-clod.v2.json', '"v": 1', '"v": 2');
  assert.deepEqual(pick(await run(root)), { checked: [], failed: [] });
});

test('a change to its own definition re-checks only that sprite', async () => {
  const root = await fresh();
  editFile(root, 'sprites/badge.json', '"default": "#3a6ea5"', '"default": "#3a6ea6"');
  assert.deepEqual(pick(await run(root)), { checked: ['badge'], failed: [] });
});

test('a change to the code that draws or checks every data sprite re-checks them all; other code none', async () => {
  const root = await fresh();
  fs.appendFileSync(path.join(root, 'quality', 'sprite.js'), '\n// an edit\n');
  assert.deepEqual(pick(await run(root)), { checked: ['badge', 'coin', 'tuft-pot'], failed: [] });
  fs.appendFileSync(path.join(root, 'engine', 'draw-list.js'), '\n// an edit\n');
  assert.deepEqual(pick(await run(root)), { checked: ['badge', 'coin', 'tuft-pot'], failed: [] });
  fs.appendFileSync(path.join(root, 'engine', 'gen', 'registry.js'), '\n// an edit\n');
  assert.deepEqual(pick(await run(root)), { checked: ['badge', 'coin', 'tuft-pot'], failed: [] });
  // engine/backdrop.js draws code sprites' backgrounds; no data sprite loads it
  fs.appendFileSync(path.join(root, 'engine', 'backdrop.js'), '\n// an edit\n');
  assert.deepEqual(pick(await run(root)), { checked: [], failed: [] });
});

test('assetFiles of a data sprite: the renderer and the checker, not the generator families', () => {
  const root = dataProject({ data: { coin: coinDef() } });
  const { files, open } = assetFiles(root, 'sprite', path.join(root, 'sprites', 'coin.json'));
  const rel = files.map((f) => path.relative(root, f));
  for (const f of ['sprites/coin.json', 'engine/data-sprite.js', 'engine/draw-list.js', 'engine/gen/registry.js', 'quality/sprite.js', 'catalog/schema.js', 'catalog/sprite-schema.js']) assert.ok(rel.includes(f), `lists ${f}`);
  for (const f of ['engine/gen/fx.js', 'engine/gen/mark.js', 'engine/gen/index.js', 'engine/backdrop.js']) assert.ok(!rel.includes(f), `does not list ${f}`);
  assert.equal(open, false);
});

test('what the key names is the validator\'s `uses` list (id@v of every generator, colour rule and piece)', async () => {
  const tinted = badgeDef();
  tinted.palette.push({ id: 'rim', derive: { rule: 'tone', of: 'plate', by: -0.5 }, material: 'metal' });
  tinted.body.pictures.draw.splice(2, 0, { kind: 'ring', on: 'plate', at: [0, 0], r: 8, paint: 'rim' });
  const root = dataProject({ data: { coin: coinDef(), 'tuft-pot': tuftDef(), badge: tinted }, pieces: true });
  const { validateSprite } = await import(path.join(root, 'catalog', 'sprite-schema.js'));
  const { sitePieces, pieceRegistry } = await import(path.join(root, 'engine', 'pieces.js'));
  const { nodePieceReader } = await import('../../tools/lib/pieces-index.mjs');
  sitePieces().useReader(nodePieceReader(root));
  for (const id of ['coin', 'tuft-pot', 'badge']) {
    const file = path.join(root, 'sprites', `${id}.json`);
    const def = JSON.parse(fs.readFileSync(file, 'utf8'));
    await sitePieces().loadFor(def);
    const v = validateSprite(def, { pieces: pieceRegistry(sitePieces()) });
    assert.equal(v.ok, true, `${id}: ${v.errors.join('; ')}`);
    assert.deepEqual(dataSpriteDeps(root, file).uses, v.uses, id);
  }
  assert.ok(dataSpriteDeps(root, path.join(root, 'sprites', 'badge.json')).uses.includes('tone@1'));
});

test('a data sprite that cannot be loaded fails the bar with the reason, and the report says what to do', async () => {
  const bad = badgeDef();
  bad.body.pictures.draw[1] = { gen: 'no-such-thing', v: 1, on: 'plate' };
  const root = dataProject({ data: { badge: bad } });
  const r = await run(root);
  assert.deepEqual(r.failed, ['badge']);
  const res = r.results[0];
  assert.equal(res.file, 'sprites/badge.json');
  assert.match(res.errors[0], /^cannot be loaded: .*no-such-thing/);
  const text = failureReport(r.results).join('\n');
  assert.match(text, /sprites\/badge\.json/);
  assert.match(text, /node tools\/check\.mjs badge/);
  assert.match(text, /node tools\/render\.mjs badge/);
  // a failure is cached and still reported; fixing the file checks it again
  assert.deepEqual(pick(await run(root)), { checked: [], failed: ['badge'] });
  fs.writeFileSync(path.join(root, 'sprites', 'badge.json'), asFile(badgeDef()));
  assert.deepEqual(pick(await run(root)), { checked: ['badge'], failed: [] });
});

test('runQuality takes a data sprite by id or by path; an unknown id lists the data sprites among the known ones', async () => {
  const root = dataProject({ data: { coin: coinDef(), badge: badgeDef() } });
  const byId = await run(root, ['badge']);
  assert.deepEqual(byId.results.map((r) => r.file), ['sprites/badge.json']);
  const byPath = await run(root, [path.join(root, 'sprites', 'coin.json')]);
  assert.deepEqual(byPath.results.map((r) => r.file), ['sprites/coin.json']);
  await assert.rejects(runQuality({ root, sprites: ['nothing'], sounds: [] }), (e) => e instanceof UnknownAsset && e.known.includes('coin') && e.known.includes('badge'));
});

test('the sounds a data sprite plays are part of its key: editing one re-checks it, another sound does not', async () => {
  const cue = badgeDef();
  cue.clips.idle.sounds = [{ sound: 'coin-pickup', frame: 0 }];
  const root = dataProject({ data: { badge: cue }, sounds: ['coin-pickup', 'ui-click'] });
  assert.deepEqual(pick(await run(root)), { checked: ['badge'], failed: [] });
  assert.deepEqual(pick(await run(root)), { checked: [], failed: [] });
  fs.appendFileSync(path.join(root, 'sounds', 'ui-click.json'), ' ');
  assert.deepEqual(pick(await run(root)), { checked: [], failed: [] });
  fs.appendFileSync(path.join(root, 'sounds', 'coin-pickup.json'), ' ');
  assert.deepEqual(pick(await run(root)), { checked: ['badge'], failed: [] });
});
