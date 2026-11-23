// Every track written with the music kit is exactly what its generator writes, byte for byte, and tidying the kit
// (sound/compose.js) never changes a track. The generators are found by looking in tools/compose/.
//
// PINNED below is the fingerprint of each track file. (All but battle-theme were re-composed on purpose on 2026-11-22: ten
// melody instruments and Plays along, with new level-matched gains; with Plays along at None the old five sound the same sample for sample.) When a track is re-composed on purpose, write the new
// fingerprint here in the same change (shasum sounds/<id>.json); when it changes and nobody meant it to, the kit
// has changed what an existing track sounds like, which is a separate task with its own review (Contract 11).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateMeta } from '../../catalog/schema.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha = (file) => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
const PINNED = {
  'battle-theme': '36802491ffbadb1210706224429277c408204563',
  'thornwood-overworld': '46cbe3439e4f19efd2f08e4bda187715b768b397',
  'hearthvale-village': 'f94743b17765ff1b8a6c0ecec27e6fab5c707baf',
  'hearthvale-battle': '5ad940d5b253f82a6abea3b5d3195c22dd1266ae',
  'derelict-run': 'c6efc88a03e9dc22df6ed119dfe64f076c939c6a',
  'derelict-boss': '71f1bb39cb979bc066b779ecdbe8316ec2acb4e8',
  // core music, part 1 (menu themes in six of the twelve bands, docs/music-styles.md)
  'menu-darkambient': 'a090db832fbb5774764d4b604aa366ef745850db',
  'menu-lofi': 'e85f5b0b8bceb334c7043f21d40ab3e0a75ebefe',
  'menu-musicbox': 'ed1bafaef86f76f460122675a56af9abd6469af1',
  'menu-organ': '0eb93bfb720b59d8545f3f80cdb1a7a7badeba60',
  'menu-steelpan': '9c5e78152225e92baa9f7996939fdfd83458d7db',
  'menu-twang': '25bf031ba156567bcb97da8122831b4c3ff63dc8',
  // core music, part 2 (menu themes in six more bands, credits themes in six)
  'menu-chip': 'e163e13e0bb842b60b0e2d40f0bb2f9d2911350f',
  'menu-synthwave': '50386998e9dc13c27e18f37f7d442519c6dbad7f',
  'menu-orchestra': '558bf59bb5364c869744934711c788b3b71694d7',
  'menu-folk': '003653a418ea74449eac406fcc7199ada99f222f',
  'menu-rock': 'e29a15e4f03b93759234c1e5621c24f39b653bc9',
  'menu-marimba': 'c90162dfed5961b9278ef149f5f1531685e11599',
  'credits-musicbox': '18efd31763d02522c780706e49e0cbe6fbefbe10',
  'credits-organ': '5ae336a8d7c40cbc2cc8b68effd8a92cbcae551a',
  'credits-steelpan': '3cdbe6dafbc1d95b12bdf6f3b7498010c2c994e6',
  'credits-lofi': '8d41bfe3f7213bf4a0ef99135b4faafa1eebd63a',
  'credits-twang': '83e7b1b1a7665de6ef77593329481834099addcf',
  'credits-darkambient': '89a2f2051425bc3774a3224484236509219b1048',  'credits-chip': 'ea408f10ea2fd67291be2de8adf54760e39d3903',
  'credits-synthwave': '0135fd0ff98238e62e40d2f06b5a04815a92e7d7',
  'credits-orchestra': 'b49833946d61a1dfa755c11b22a3046f046eb67c',
  'credits-folk': 'e5ee49b8f60d565854752d67d5709274837a0b8c',
  'credits-rock': '61f2d119a641b8463a87c44071b709dc6a4853f5',
  'credits-marimba': '675642cca99b19d2d587a4d0179f0b20bfac9693',
  'gridline-title': 'bfdfcf4c65d3a6fcf4f856c476a2a2eb567bdf9c',
  'gridline-calm': '4c457548917888c9f837425c5ec8988fda2dfcc5',
  'gridline-rush': 'ce3745fede96d227030884c262f68ad2eeaec523',
  'gridline-results': '7f1a4699ef129423463a5e3ee6d31a96e6617ef0',
  'hearthvale-overworld': '61f3dc9ff86ea714a627201ea51bededf1475460',
  'hearthvale-dungeon': '1e9a2aa6f9653ef10ffcd70282f4948e1b45da32',
  'hearthvale-cave': '3bc18651f26a9240dacadde2675ad95bfe87b594',
  'cloudreach-isles': 'ea843a417a081129f77ceac68a4cbf00afdd0f62',
  'cloudreach-gale': '5a6b48f83d1fc5bef870e73f80f87642eed80baf',
};

const generators = fs.readdirSync(path.join(ROOT, 'tools', 'compose')).filter((f) => f.endsWith('.mjs') && /\bexport (?:function|const) build\b/.test(fs.readFileSync(path.join(ROOT, 'tools', 'compose', f), 'utf8'))).sort();

test('every kit track has a generator (the five kit tracks and the core music themes)', () => {
  assert.deepEqual(generators, ['cloudreach_gale.mjs', 'cloudreach_isles.mjs', 'credits_chip.mjs', 'credits_darkambient.mjs', 'credits_folk.mjs', 'credits_lofi.mjs', 'credits_marimba.mjs', 'credits_musicbox.mjs', 'credits_orchestra.mjs', 'credits_organ.mjs', 'credits_rock.mjs', 'credits_steelpan.mjs', 'credits_synthwave.mjs', 'credits_twang.mjs', 'derelict_boss.mjs', 'derelict_run.mjs', 'gridline_calm.mjs', 'gridline_results.mjs', 'gridline_rush.mjs', 'gridline_title.mjs', 'hearthvale_battle.mjs', 'hearthvale_cave.mjs', 'hearthvale_dungeon.mjs', 'hearthvale_overworld.mjs', 'hearthvale_village.mjs', 'menu_chip.mjs', 'menu_darkambient.mjs', 'menu_folk.mjs', 'menu_lofi.mjs', 'menu_marimba.mjs', 'menu_musicbox.mjs', 'menu_orchestra.mjs', 'menu_organ.mjs', 'menu_rock.mjs', 'menu_steelpan.mjs', 'menu_synthwave.mjs', 'menu_twang.mjs', 'thornwood_overworld.mjs']);
});

for (const file of generators) {
  const id = file.replace(/\.mjs$/, '').replace(/_/g, '-');
  test(`${id}: the file in sounds/ is what ${file} writes, byte for byte, with valid metadata`, async () => {
    const { build } = await import(pathToFileURL(path.join(ROOT, 'tools', 'compose', file)).href);
    const patch = build();
    assert.equal(patch.id, id);
    const onDisk = fs.readFileSync(path.join(ROOT, 'sounds', `${id}.json`), 'utf8');
    assert.ok(JSON.stringify(patch, null, 1) + '\n' === onDisk, `sounds/${id}.json is not what tools/compose/${file} writes now: either the kit changed this track (undo that) or the track was edited without its generator`);
    const m = validateMeta(patch.meta, 'music');
    assert.equal(m.ok, true, m.errors.join('; '));
  });
}

test('battle-theme is what its Python generator writes, byte for byte', (t) => {
  // run in a scratch copy of the folder layout: the generator writes ../../sounds/battle-theme.json beside itself
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-battle-'));
  try {
    fs.mkdirSync(path.join(dir, 'tools', 'compose'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'sounds'));
    fs.copyFileSync(path.join(ROOT, 'tools', 'compose', 'battle_theme.py'), path.join(dir, 'tools', 'compose', 'battle_theme.py'));
    const r = spawnSync('python3', [path.join(dir, 'tools', 'compose', 'battle_theme.py')], { encoding: 'utf8' });
    if (r.error) { t.skip(`python3 is not here (${r.error.code}); the fingerprint below still guards the file`); return; }
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.readFileSync(path.join(dir, 'sounds', 'battle-theme.json')).equals(fs.readFileSync(path.join(ROOT, 'sounds', 'battle-theme.json'))), 'sounds/battle-theme.json is not what tools/compose/battle_theme.py writes');
    assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'sounds', 'battle-theme.json'), 'utf8')).meta, 'the generator writes the metadata');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('no track file has changed since it was last composed on purpose', () => {
  for (const [id, want] of Object.entries(PINNED)) {
    assert.equal(sha(path.join(ROOT, 'sounds', `${id}.json`)), want, `sounds/${id}.json has changed. Re-composed on purpose? Write its new fingerprint in PINNED. Otherwise the kit changed an existing track: undo that`);
  }
  const music = fs.readdirSync(path.join(ROOT, 'sounds')).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', f), 'utf8'))).filter((p) => p.category === 'music' && p.loop).map((p) => p.id).sort();
  assert.deepEqual(music.filter((id) => !PINNED[id]), [], 'a music track with no fingerprint: add it to PINNED');
});
