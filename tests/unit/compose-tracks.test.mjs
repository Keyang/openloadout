// Every track written with the music kit is exactly what its generator writes, byte for byte, and tidying the kit
// (sound/compose.js) never changes a track. The generators are found by looking in tools/compose/.
//
// PINNED below is the fingerprint of each track file. When a track is re-composed on purpose, write the new
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
  'thornwood-overworld': '260bca1dec6a4df9d041eb5b8ca2cec0a76aebe5',
  'hearthvale-village': 'd363f1e661b697661e7d9f5f0888f2da4f9ab7d2',
  'hearthvale-battle': 'b95aa7dd53a8ebbe30753cf337c0f492975f6776',
  'derelict-run': '20a37c0f28fa108337315ffe3d5bf846f4b248ea',
  'derelict-boss': '50eef778098eb2d73e6f1a67d18347bf2d437de1',
  // core music, part 1 (menu themes in six of the twelve bands, docs/music-styles.md)
  'menu-darkambient': '0d7bb309d27f80541dfb9b27baa6399d26120674',
  'menu-lofi': '51a0aa6858074bf19cf39afda3b530d4ca344ea5',
  'menu-musicbox': 'bcdd3b002c931d09a938d4465a5baf50f3856f7f',
  'menu-organ': '0697edc6162c7d86ed1255f508c0bdb7e25de164',
  'menu-steelpan': '99978cee655e3b2b29f8341c3f7e00b643a092ff',
  'menu-twang': 'a0caff30aa8f8a8e1bc2b9b5d942be7a77d4b401',
};

const generators = fs.readdirSync(path.join(ROOT, 'tools', 'compose')).filter((f) => f.endsWith('.mjs') && /\bexport (?:function|const) build\b/.test(fs.readFileSync(path.join(ROOT, 'tools', 'compose', f), 'utf8'))).sort();

test('every kit track has a generator (the five kit tracks and the six core menu themes)', () => {
  assert.deepEqual(generators, ['derelict_boss.mjs', 'derelict_run.mjs', 'hearthvale_battle.mjs', 'hearthvale_village.mjs', 'menu_darkambient.mjs', 'menu_lofi.mjs', 'menu_musicbox.mjs', 'menu_organ.mjs', 'menu_steelpan.mjs', 'menu_twang.mjs', 'thornwood_overworld.mjs']);
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
