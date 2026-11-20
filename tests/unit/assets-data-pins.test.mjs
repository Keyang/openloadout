// Pieces in the build (build item B9, review round 1, issue 3; Contract 15 rule 5: a released version never changes).
//   piecesProblems(root): what the build's validate step refuses in pieces/: a piece file that is not valid, a pinned
//     (released) version whose content changed, and a pinned version whose file is gone.
//   refreshDataPictures({ root, sprites }): a data sprite's thumbnail and strip are redrawn when a piece it uses changes
//     (tools/lib/thumbs.mjs keys pictures on the sprite's own file and on engine/ and rigs/, not on pieces/).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { piecesProblems } from '../../tools/lib/assets.mjs';
import { dataProject, badgeDef, tuftDef, ROOT } from '../helpers/data-sprites.mjs';

const CLOD = 'pieces/stamp-test-clod.v1.json';
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

/** Changes one colour letter of the clod's rows, keeping it a valid piece. */
function changeClod(root) {
  const f = path.join(root, CLOD), j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const text = JSON.stringify(j);
  // the top pixel moves from the left to the right ("b." -> ".b")
  const rows = j.body.rows;
  assert.ok(Array.isArray(rows) && rows.length, 'the clod is a stamp with rows');
  rows[0] = [...rows[0]].reverse().join('');
  assert.notEqual(JSON.stringify(j), text);
  fs.writeFileSync(f, `${JSON.stringify(j, null, 2)}\n`);
}

test('piecesProblems: none for valid, pinned, unchanged pieces', () => {
  const root = dataProject({ pieces: true });
  assert.deepEqual(piecesProblems(root), []);
  assert.deepEqual(piecesProblems(dataProject({})), [], 'none for an empty pieces/');
});

test('piecesProblems: a pinned version whose content changed is refused, naming it and what to do', () => {
  const root = dataProject({ pieces: true });
  changeClod(root);
  const p = piecesProblems(root);
  assert.equal(p.length, 1, p.join('\n'));      // the changed piece is still valid: only its pin is broken
  assert.match(p[0], /stamp:test-clod@1/);
  assert.match(p[0], /released|pinned/);
  assert.match(p[0], /new version/);
});

test('piecesProblems: a pinned version whose file is gone is refused; an invalid piece file is refused', () => {
  const root = dataProject({ pieces: true });
  fs.rmSync(path.join(root, CLOD));
  assert.ok(piecesProblems(root).some((e) => /stamp:test-clod@1/.test(e) && /gone|deleted|missing/.test(e)));
  const bad = dataProject({ pieces: true, files: { 'pieces/stamp-zz-bad.v1.json': '{ "nope": 1 }' } });
  assert.ok(piecesProblems(bad).some((e) => /stamp-zz-bad\.v1\.json/.test(e)));
});

test('a new, unpinned piece is not a problem for the build (it is pinned when released)', () => {
  const root = dataProject({ pieces: true });
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'pieces', '_pins.json'), 'utf8'));
  pins.pins = {};
  fs.writeFileSync(path.join(root, 'pieces', '_pins.json'), JSON.stringify(pins));
  assert.deepEqual(piecesProblems(root), []);
});

// one build's pictures step, in its own process as the build runs it (a process keeps a piece version it has loaded)
const ASSETS = pathToFileURL(path.join(ROOT, 'tools', 'lib', 'assets.mjs')).href, THUMBS = pathToFileURL(path.join(ROOT, 'tools', 'lib', 'thumbs.mjs')).href;
function picturesStep(root) {
  const code = `import { loadSprites, refreshDataPictures } from ${JSON.stringify(ASSETS)}; import { writeImages } from ${JSON.stringify(THUMBS)};
const root = ${JSON.stringify(root)}; const sprites = await loadSprites(root);
const refreshed = refreshDataPictures({ root, sprites }); const { made } = writeImages({ root, sprites });
console.log(JSON.stringify({ refreshed, made: made.sort() }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('refreshDataPictures: a changed piece redraws the pictures of the data sprites using it, and only theirs', () => {
  const root = dataProject({ data: { badge: badgeDef(), 'tuft-pot': tuftDef() }, pieces: true });
  fs.writeFileSync(path.join(root, 'pieces', '_pins.json'), JSON.stringify({ pins: {} }));          // the test edits a piece in place: unpin it
  assert.deepEqual(picturesStep(root), { refreshed: [], made: ['badge', 'tuft-pot'] }, 'the first build draws both');
  assert.deepEqual(picturesStep(root), { refreshed: [], made: [] }, 'a second build draws nothing');
  const thumb = path.join(root, 'generated', 'thumbs', 'tuft-pot.png');
  const before = sha(thumb);
  changeClod(root);
  assert.deepEqual(picturesStep(root), { refreshed: ['tuft-pot'], made: ['tuft-pot'] }, 'only the sprite using the piece is drawn again');
  assert.notEqual(sha(thumb), before, 'its thumbnail shows the changed piece');
  assert.deepEqual(picturesStep(root), { refreshed: [], made: [] }, 'and the next build leaves it');
});
