// The projectile redraws of migration batch E3 (review of E3 round 2, issues 3, 5 and 6).
//   - Each of the eight data files is written by project code, never by hand: tools/projectiles/<id>.mjs gives the
//     definition and tools/projectiles/write.mjs writes it; the file on disk must be exactly what its writer gives.
//     (blaster-bolt, the ninth, is the hand-written fixture of build item B12 and is not written here.)
//   - Each is held to the code it redraws by pixel counts recorded from that code (tools/projectiles/counts.mjs,
//     tests/fixtures/redraw-counts/projectiles.json), per case and clip: no stray pixels beyond the code's, no pixel
//     left uninked where the code inked everything, ink and moss per frame near the code's. So deleting the boulder's
//     moss, drawing its dust over its pieces, or drawing the acid's drips after its outline fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../helpers/library.mjs';
import { PROJECTILE_IDS } from '../../tools/projectiles/lib.mjs';
import { writtenText } from '../../tools/projectiles/write.mjs';
import { countsOf, COUNTS_FILE } from '../../tools/projectiles/counts.mjs';
import { loadDataSprite } from '../../tools/lib/assets.mjs';

const REC = JSON.parse(fs.readFileSync(COUNTS_FILE, 'utf8'));
const F = Object.fromEntries(REC.fields.map((f, i) => [f, i]));
const sum = (rows, f) => rows.reduce((a, r) => a + r[F[f]], 0);
// what a redraw draws beyond the code today, where it is more than the general slack: these may only go down
// (arrow's hit, micro-rocket without smoke, plasma-orb's and the spark pellet's light: round-1 approximations)
const EXCESS = {
  'arrow defaults hit': { stray: 3, uninked: 20 }, 'arrow style=needle hit': { stray: 7, uninked: 29 }, 'arrow style=barbed hit': { uninked: 17 },
  'arrow style=blunt hit': { stray: 4, uninked: 23 }, 'arrow trail=false hit': { stray: 3, uninked: 20 }, 'arrow low hit': { stray: 3, uninked: 20 },
  'arrow high hit': { stray: 3, uninked: 20 }, 'micro-rocket smoke=false fly': { uninked: 88 }, 'plasma-orb style=ring fly': { uninked: 480 },
  'plasma-orb style=spiky fly': { uninked: 408 }, 'plasma-orb low fly': { uninked: 256 }, 'scatter-pellet shape=spark fly': { uninked: 118 },
  'scatter-pellet low fly': { uninked: 56 },
};

test('the eight writers are the projectiles in the record, and nothing else', () => {
  assert.deepEqual([...PROJECTILE_IDS].sort(), ['acid-glob', 'arrow', 'boulder-chunk', 'fireball', 'micro-rocket', 'orbit-blade', 'plasma-orb', 'scatter-pellet']);
  assert.deepEqual(Object.keys(REC.sprites).sort(), [...PROJECTILE_IDS].sort());
  const dir = path.join(ROOT, 'tools', 'projectiles');
  for (const id of PROJECTILE_IDS) assert.ok(fs.existsSync(path.join(dir, `${id}.mjs`)), `tools/projectiles/${id}.mjs`);
  for (const f of fs.readdirSync(dir).filter((x) => /\.m?js$/.test(x) && x !== 'counts.mjs')) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\s*(\/\/|\*|\/\*\*).*$/gm, '');
    assert.doesNotMatch(src, /tests\/|fixtures/, `tools/projectiles/${f} reads a test file`);
  }
});

for (const id of PROJECTILE_IDS) {
  test(`sprites/${id}.json is exactly what tools/projectiles/${id}.mjs writes, within the 128 KB cap`, async () => {
    const text = await writtenText(id);
    assert.equal(fs.readFileSync(path.join(ROOT, 'sprites', `${id}.json`), 'utf8'), text, `sprites/${id}.json differs from its writer: change tools/projectiles/${id}.mjs and run node tools/projectiles/write.mjs ${id}`);
    assert.ok(Buffer.byteLength(text) <= 128 * 1024, `${Buffer.byteLength(text)} bytes`);
  });

  test(`${id}: stray, uninked, ink and moss pixels against the code's, every case`, async () => {
    const s = await loadDataSprite(ROOT, path.join(ROOT, 'sprites', `${id}.json`)), now = countsOf(s, id), rec = REC.sprites[id];
    assert.deepEqual(Object.keys(now).sort(), Object.keys(rec).sort(), 'the cases are the record\'s (re-record with tools/projectiles/counts.mjs when the controls change)');
    const bad = [];
    for (const [cs, clips] of Object.entries(now)) for (const [clip, rows] of Object.entries(clips)) {
      const old = rec[cs][clip], key = `${id} ${cs} ${clip}`, ex = EXCESS[key] ?? {};
      assert.equal(rows.length, old.length, `${key}: frames`);
      if (sum(rows, 'stray') > Math.max(sum(old, 'stray') + 2, ex.stray ?? 0)) bad.push(`${key}: ${sum(rows, 'stray')} stray pixels, the code ${sum(old, 'stray')}`);
      // where the code inked every pixel at the edge, so must the redraw; elsewhere at most 15% more than the code
      const u = sum(rows, 'uninked'), uo = sum(old, 'uninked');
      if (uo === 0 ? u > 0 : u > Math.max(Math.ceil(uo * 1.15) + 4, ex.uninked ?? 0)) bad.push(`${key}: ${u} uninked edge pixels, the code ${uo}`);
      rows.forEach((r, f) => {
        const ink = r[F.ink], io = old[f][F.ink], m = r[F.moss], mo = old[f][F.moss];
        if (ink < io * 0.8 - 4) bad.push(`${key} frame ${f}: ${ink} ink pixels, the code ${io}`);
        // (not hit frame 0: the whole rock under the flash, where the code's Wear notches, which the redraw does not cut, take moss away)
        if (id === 'boulder-chunk' && !(clip === 'hit' && f === 0) && (m < mo * 0.75 - 3 || m > mo * 1.3 + 3)) bad.push(`${key} frame ${f}: ${m} moss pixels, the code ${mo}`);
      });
    }
    assert.deepEqual(bad, []);
  });
}
