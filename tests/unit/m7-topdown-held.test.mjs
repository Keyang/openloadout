// The things the nine top-down people of migration batch M7 hold in a turning hand (M7c, after M7b review 3, issue 2).
//
// Version 1 of held:topdown-blades, -blades-off, -guns, -stick and -flower, and version 2 of held:topdown-magic, were
// pixel read-backs of the code rig's drawing; the versions that replaced them are the code's own primitives written in
// the bone's frame, so the renderer draws them at the bone's angle (as held:topdown-polearm@4 does for the halberd and
// pike). They were made by a recorder in tools/bake-topdown-m7.mjs from the code functions in rigs/topdown*.js.
//
// R2 deleted the rigs, the baker and the frozen copies, so what this file held against them is gone: each piece file
// byte for byte against its builder here, and, at every frame of every clip and look, each held node's pixels against the
// code function drawn at the same bone frame (no orphan pixel, no outline gap, the differing share under DIFF_SHARE or
// each stretched bone's ceiling). The piece files are pinned data now; nothing re-draws the old code.
// Held here:
//   - the sprites use the new versions, and the old read-backs are gone with their pins (nothing names them).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../../tools/lib/assets.mjs';

const PIECES = path.join(ROOT, 'pieces');
const read = (f) => fs.readFileSync(path.join(PIECES, f), 'utf8');

/** The versions these replace: never released, named by nothing once the sprites moved on, removed with their pins. */
const REPLACED = ['held:topdown-blades@1', 'held:topdown-blades-off@1', 'held:topdown-guns@1', 'held:topdown-stick@1', 'held:topdown-flower@1', 'held:topdown-magic@2'];

/** Every "use" of a piece version in a JSON text, as "id@v". */
const usesIn = (text) => [...text.matchAll(/"use":\s*"([a-z]+:[a-z0-9-]+)"[^{}\]]*?"v":\s*(\d+)/g)].map((m) => `${m[1]}@${m[2]}`);

test('the sprites hold the new versions, and the replaced read-backs are gone with their pins', () => {
  const want = {
    'rogue-walker': ['held:topdown-blades@2', 'held:topdown-blades-off@2'], 'void-ranger': ['held:topdown-guns@2'], 'shield-trooper': ['held:topdown-guns@2'],
    'farm-kid': ['held:topdown-stick@2', 'held:topdown-flower@2'], 'mage-walker': ['held:topdown-magic@3'],
  };
  for (const [id, refs] of Object.entries(want)) {
    const uses = new Set(usesIn(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8')));
    for (const ref of refs) assert.ok(uses.has(ref), `${id} does not use ${ref}`);
    for (const ref of REPLACED) assert.ok(!uses.has(ref), `${id} still uses ${ref}`);
  }
  const pins = JSON.parse(read('_pins.json')).pins;
  for (const ref of REPLACED) {
    const [id, v] = ref.split('@');
    assert.ok(!fs.existsSync(path.join(PIECES, `${id.replace(':', '-')}.v${v}.json`)), `${ref}: its file is still there`);
    assert.ok(!(ref in pins), `${ref}: still pinned`);
  }
});

