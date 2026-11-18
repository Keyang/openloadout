#!/usr/bin/env node
// Writes bundles/<id>.json for each bundle plan in bundles/specs/*.plan.json whose assets all exist.
//
//   node tools/bundles-from-plans.mjs            write the bundle file of every complete plan; list what the others still lack
//   node tools/bundles-from-plans.mjs --check    write nothing; exit 1 if any plan is incomplete
//
// A plan is the art direction's list of what a bundle holds (sprites, sounds, music, each by id). The bundle file is what
// the site reads (docs/architecture.md, Contract 4): it is written only when every listed asset file is present, so the
// build never sees a bundle that names a missing asset.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const idsOf = (list) => list.map((x) => (typeof x === 'string' ? x : x.id));
const BLURBS = {
  'kit-platformer-fantasy': 'Everything for a side-view fantasy platformer: a hero, enemies and a boss, forest, cave, water and castle ground, platforms, traps, pickups, effects, backgrounds, a wooden interface, sounds and two tracks.',
  'kit-rpg-fantasy': 'Everything for a turn-based fantasy role-playing game: a party seen on the map and in battle, villagers, enemies and a dragon, meadow, village, shore and dungeon ground, buildings, portraits, spell effects, battle backgrounds, menus, sounds and two tracks.',
  'kit-roguelite-scifi': 'Everything for a top-down sci-fi action roguelike: a ranger, troopers, bugs, robots and two bosses, station and hive ground, doors and props, pickups, projectiles, effects, a starfield, a tech interface, sounds and two tracks.',
};

let incomplete = 0;
for (const f of fs.readdirSync(path.join(ROOT, 'bundles', 'specs')).filter((n) => n.endsWith('.plan.json')).sort()) {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'bundles', 'specs', f), 'utf8'));
  const sprites = idsOf(plan.sprites), sounds = idsOf(plan.sounds), music = idsOf(plan.music);
  const missing = [
    ...sprites.filter((id) => !fs.existsSync(path.join(ROOT, 'sprites', `${id}.js`))).map((id) => `sprites/${id}.js`),
    ...[...sounds, ...music].filter((id) => !fs.existsSync(path.join(ROOT, 'sounds', `${id}.json`))).map((id) => `sounds/${id}.json`),
  ];
  if (missing.length) {
    incomplete++;
    console.log(`${plan.id}: not written, ${missing.length} asset${missing.length === 1 ? '' : 's'} still to come: ${missing.join(', ')}`);
    continue;
  }
  const bundle = {
    id: plan.id, name: plan.name, gameType: plan.gameType, level: 'kit',
    blurb: BLURBS[plan.id] ?? `${plan.name}: ${sprites.length} sprites, ${sounds.length} sounds and ${music.length} tracks.`,
    sprites, sounds, music, theme: {},
  };
  const out = path.join(ROOT, 'bundles', `${plan.id}.json`);
  if (!check) fs.writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n');
  console.log(`${plan.id}: ${check ? 'complete' : 'written'} (${sprites.length} sprites, ${sounds.length} sounds, ${music.length} tracks)`);
}
if (check && incomplete) process.exit(1);
