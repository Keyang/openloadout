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
  'thornwood-overworld': '84daf11770fe63dc21907aad603fdba084d6848a',
  'hearthvale-village': '560f8c266e0e31830fd25762ea98ae4be6871ac9',
  'hearthvale-battle': '0b9f5aa86e6058fd74c61b070e15384b903c526d',
  'derelict-run': '4ab34bd314209a46b1a41d0b79fd4f4886a31c52',
  'derelict-boss': '3797c788a9da9e71e8c95e03550c113bbb159ca7',
  // core music, part 1 (menu themes in six of the twelve bands, docs/music-styles.md)
  'menu-darkambient': '2f518b32408a7f1e96a955a197a067a0b1102720',
  'menu-lofi': '7eba57eed142adf22e89ed564e5bc89c79e76a65',
  'menu-musicbox': '10310ca18ab718ba2d9442cb0ba123ba3c6afd9d',
  'menu-organ': 'dc525c1680688e3a3fa2352cffe642c0bc27a7f0',
  'menu-steelpan': 'af2b72270b49d9a0e317191a67aa4dbc3e941acb',
  'menu-twang': 'cee61f851c6e5793a4505beb3802063611c7b7c1',
  // core music, part 2 (menu themes in six more bands, credits themes in six)
  'menu-chip': '0d5739fc780152559bc8acada85a4d491b776b01',
  'menu-synthwave': 'a81f051b6e8cc36dd9edf2e765005437523910e3',
  'menu-orchestra': 'ef83b49f196480340c91dbfdfa75adfed0f3a791',
  'menu-folk': '6ac9d0b4f67b4ebfa10d3edd64ad715388c1f695',
  'menu-rock': 'ef84207692ceefeadf35af966fffaaeb52ccdd5f',
  'menu-marimba': '6ee04a394134b65a9269b9a817f7af917c322953',
  'credits-musicbox': 'bb21e07c990632aae077ff5e52ef63cbcfbaccbe',
  'credits-organ': 'b6fb7f11b8a78a0492eebd2e4fa2e6673d16b02b',
  'credits-steelpan': '0ec23ae18b0d6d200d71bac5f955c252f3d6dd9e',
  'credits-lofi': '371f979389229adc84eddd16e10d8fe8402e00bc',
  'credits-twang': '7177a20f36c46f5fdbf365d426e711913b38c364',
  'credits-darkambient': 'cc8e0ef92ccd920e76380539adf9df814bf88878',  'credits-chip': '4b4e8b4cbfe5265d9b407f10cc1593a746ddc02a',
  'credits-synthwave': 'c2058f227597aef4437631bac0ad326d583c48d1',
  'credits-orchestra': 'f1cf58a0602c98f6a418f7885601b9a913f835c9',
  'credits-folk': '7abb12577dae97d85d6205e95ac347353c9474f0',
  'credits-rock': '9763f1a1f5afb63196ca8f856cb48836ac78049d',
  'credits-marimba': '386b8c50b21d9edb1fcaf4e5367172b52a134cde',
  'gridline-title': '572bcfab20ed2d373a699aa3f6b58c58fc4ea02b',
  'gridline-calm': '5fc8a277d928486ba4450327a4ea43be4607fdf6',
  'gridline-rush': '1f9c84674790cf65a2c49473e2b0d105b652a999',
  'gridline-results': '0d27d8dcf336547b665510109eecb95c60942cdd',
  'hearthvale-overworld': 'f8a2f58314efa27afb752c97da877516bd8cf730',
  'hearthvale-dungeon': 'd909bc452f254e5e01f85dd2fa34373b4d28e150',
  'hearthvale-cave': 'f8baebdec0e25a447c12a42b41ac9cb99eae8000',
  'cloudreach-isles': 'b36da6394283f6bb2d7dab2046cc3f4ce51d97d2',
  'cloudreach-gale': '064ee489b888f4de9f605e4d6692a5dfe2e7e498',
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
