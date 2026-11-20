// The wall in front of a data file (Contract 15 rule 6; build item B9, review round 1, issue 6): the tools
// (tools/lib/assets.mjs) and the site (app/catalog.js) read a sprites/<id>.json through catalog/sprite-schema.js
// parseSpriteJson, so a file over 128 KB, nested too deep, or carrying __proto__ / constructor / prototype keys is
// refused, naming the file, before anything else runs on it: no piece is looked up for it and nothing is drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadSprites, loadDataSprite } from '../../tools/lib/assets.mjs';
import { dataProject, badgeDef, tuftDef, asFile } from '../helpers/data-sprites.mjs';

const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });

/** The tuft pot (it names a piece, which this project has not got) padded with a long blurb to `kb` KB of text. */
function bigTuft(kb) {
  const d = tuftDef();
  d.blurb = `A clay pot. ${'x'.repeat(kb * 1024)}`;
  return asFile(d);
}

test('a data file over 128 KB is refused before it is read as JSON or a piece is looked up', async () => {
  const root = dataProject({ data: { 'tuft-pot': bigTuft(130) } });
  // the piece it names is missing: had anything run on it, that would be the error
  await rejects(loadSprites(root), /^sprites\/tuft-pot\.json: .*128 KB/);
  await rejects(loadDataSprite(root, 'sprites/tuft-pot.json'), /^sprites\/tuft-pot\.json: .*128 KB/);
});

test('a data file nested too deep is refused, naming the file', async () => {
  let deep = '0';
  for (let i = 0; i < 5000; i++) deep = `[${deep}]`;
  const text = asFile(badgeDef()).replace('"preview": "idle"', `"preview": "idle", "deep": ${deep}`);
  await rejects(loadSprites(dataProject({ data: { badge: text } })), /^sprites\/badge\.json: .*nested/);
});

test('__proto__, constructor and prototype keys in a library data file are refused, naming the file, and pollute nothing', async () => {
  const text = asFile(badgeDef()).replace('"preview": "idle"', '"preview": "idle", "__proto__": { "polluted": true }');
  await rejects(loadSprites(dataProject({ data: { badge: text } })), /^sprites\/badge\.json: .*__proto__/);
  assert.equal(({}).polluted, undefined);
});

test('a file that is not JSON still says so, naming the file', async () => {
  await rejects(loadSprites(dataProject({ data: { bad: '{ "format": ' } })), /^sprites\/bad\.json: not valid JSON/);
});

test('the browser loader refuses a data file over 128 KB before loading any piece for it', async () => {
  const project = dataProject({ data: { 'tuft-pot': bigTuft(130) } });
  const CATALOG = { version: 1, assets: [{ id: 'tuft-pot', kind: 'sprite', name: 'tuft-pot', bundles: [], src: 'sprites/tuft-pot.json', tech: { soundIds: [] } }], bundles: [] };
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    asked.push(u);
    if (u === 'generated/catalog.json') return { ok: true, status: 200, json: async () => CATALOG };
    const f = path.join(project, u);
    if (!fs.existsSync(f)) return { ok: false, status: 404, json: async () => null, text: async () => '' };
    const text = fs.readFileSync(f, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text };
  };
  try {
    const m = await import(`../../app/catalog.js?safety=1`);
    await m.loadCatalog();
    await rejects(m.loadSprite('tuft-pot'), /^sprites\/tuft-pot\.json: .*128 KB/);
    assert.deepEqual(asked.filter((u) => u.startsWith('pieces/') || u.includes('pieces.json')), [], 'no piece was asked for');
  } finally { globalThis.fetch = real; }
});
