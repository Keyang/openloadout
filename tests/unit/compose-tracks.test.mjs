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
  'thornwood-overworld': 'bde5eda15ccf6261b4c88b97bacb202869cfb6ad',
  'hearthvale-village': '9a9d1103a183e3af78796609b118690493d6264c',
  'hearthvale-battle': 'f16871540dc4405bef7a5643d6247a075026ca3d',
  'derelict-run': 'cbe78b273ebc082357f9d43a41675cf23d64583b',
  'derelict-boss': 'f52f2bb5b82f4f2d4de016ee14795a18e6c93175',
  // core music, part 1 (menu themes in six of the twelve bands, docs/music-styles.md)
  'menu-darkambient': '160671d5e8a8530694cb3566d44ce79b7fd88ca0',
  'menu-lofi': '366822705205fe1361bc1cf08452ffaaefee7136',
  'menu-musicbox': 'cf897c0061b04be9020626e8b018928ede6c616e',
  'menu-organ': '3cf099b0f91b8c1a2c1ed41685e680c46697d25f',
  'menu-steelpan': 'b2bec79519ed5d4c5893181900e8d45c3c39d51c',
  'menu-twang': '096431987c45d74a669b6da2b106908b1303401c',
  // core music, part 2 (menu themes in six more bands, credits themes in six)
  'menu-chip': 'dbf8efd6050f2cc3392667a25713f568a27bee04',
  'menu-synthwave': '8698da78b213ebb1ff1a10d55bb5067efd64380c',
  'menu-orchestra': '1963001099dbba5a4d76147784f4b60253e3a755',
  'menu-folk': '2ae57f058734856d2a041458c43fe60a08f24c33',
  'menu-rock': '73208c64cf4b93fc92eccb089c19a59dac7d0079',
  'menu-marimba': '45f6a65f790b50a496632fca06501ac64c6f07e3',
  'credits-musicbox': '284b17c558864ec82c9f4859c4a8ec44764f5579',
  'credits-organ': 'da475a814fea49e34daf4c0feecedeb79173a5d9',
  'credits-steelpan': '7c1603e690f991304acf993b0a8e5c06bd1b435e',
  'credits-lofi': '736b70c1c5a4ca15e89199f2030f2aac4e5a7dfb',
  'credits-twang': '95004b287ce3cf124e44befb11ff20a1185f18d8',
  'credits-darkambient': '05cf03592536154f60a6575866f2debe67b930be',  'credits-chip': 'a71466bef3e93a99ed1e4ca0291f4b04db986a37',
  'credits-synthwave': 'ac1642f399d16395296558fbf015e29029932ba1',
  'credits-orchestra': 'b12c00955454fc3543493f2e814ce1b96aa8ed45',
  'credits-folk': '2a769b517af14fee6ae9e961338bbee5375c0bb5',
  'credits-rock': '9c13088d5cfa1a8c1ce6c2a0511319faa46d2c0f',
  'credits-marimba': '4ef38145d3cf7648e854eb6695ee9d485532354f',
  'gridline-title': 'eea53115a18da860667073019c88ed0bfdff656e',
  'gridline-calm': '57832e134b0d3b42e7ef64433edcd9ec2d8923d9',
  'gridline-rush': 'bfec3c2b8ba913a42e20074f01b3fb511f1b0664',
  'gridline-results': 'f94064aa4651c3d98246113006a4d132e9aef1af',
  'hearthvale-overworld': '46d085c63efeb107aaff18794d1ae1cfa2e194cb',
  'hearthvale-dungeon': 'baf964960ece2b00af55b39238979f9c67b80afc',
  'hearthvale-cave': '81a09e94a94fd13a4cfa5a1fceb8a1838790b646',
};

const generators = fs.readdirSync(path.join(ROOT, 'tools', 'compose')).filter((f) => f.endsWith('.mjs') && /\bexport (?:function|const) build\b/.test(fs.readFileSync(path.join(ROOT, 'tools', 'compose', f), 'utf8'))).sort();

test('every kit track has a generator (the five kit tracks and the core music themes)', () => {
  assert.deepEqual(generators, ['credits_chip.mjs', 'credits_darkambient.mjs', 'credits_folk.mjs', 'credits_lofi.mjs', 'credits_marimba.mjs', 'credits_musicbox.mjs', 'credits_orchestra.mjs', 'credits_organ.mjs', 'credits_rock.mjs', 'credits_steelpan.mjs', 'credits_synthwave.mjs', 'credits_twang.mjs', 'derelict_boss.mjs', 'derelict_run.mjs', 'gridline_calm.mjs', 'gridline_results.mjs', 'gridline_rush.mjs', 'gridline_title.mjs', 'hearthvale_battle.mjs', 'hearthvale_cave.mjs', 'hearthvale_dungeon.mjs', 'hearthvale_overworld.mjs', 'hearthvale_village.mjs', 'menu_chip.mjs', 'menu_darkambient.mjs', 'menu_folk.mjs', 'menu_lofi.mjs', 'menu_marimba.mjs', 'menu_musicbox.mjs', 'menu_orchestra.mjs', 'menu_organ.mjs', 'menu_rock.mjs', 'menu_steelpan.mjs', 'menu_synthwave.mjs', 'menu_twang.mjs', 'thornwood_overworld.mjs']);
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
