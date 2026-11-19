// Ready-made versions for the pages (app/versions.js): read from generated/versions.json, and made on the spot for an
// asset that file does not know (one made at run time).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadVersions, versionsFor, forgetVersions } from '../../app/versions.js';
import knight from '../../sprites/knight.js';

const file = JSON.parse(fs.readFileSync(new URL('../../generated/versions.json', import.meta.url), 'utf8'));
const fetchFile = async () => ({ ok: true, json: async () => file });

test('versions come from the build\'s file, fetched once', async () => {
  forgetVersions();
  let n = 0;
  const fetcher = async (url) => { n++; assert.match(String(url), /generated\/versions\.json$/); return fetchFile(); };
  const all = await loadVersions({ fetcher });
  await loadVersions({ fetcher });
  assert.equal(n, 1);
  assert.ok(all.knight.length >= 3);
  const list = await versionsFor('sprite', knight, 12, { fetcher });
  assert.deepEqual(list.map((v) => v.name), file.knight.map((v) => v.name));
  assert.equal(typeof list[1].params, 'object');
  assert.deepEqual((await versionsFor('sprite', knight, 3, { fetcher })).map((v) => v.name), file.knight.slice(0, 3).map((v) => v.name), 'fewer are the first of more');
});

test('an asset the file does not know gets versions made now', async () => {
  forgetVersions();
  const made = { ...knight, id: 'made-on-the-page' };
  const list = await versionsFor('sprite', made, 3, { fetcher: fetchFile });
  assert.ok(list.length >= 1 && list.length <= 3);
  for (const v of list) { assert.equal(typeof v.name, 'string'); assert.equal(typeof v.params, 'object'); }
});

test('a sound not in the file gets its styles as versions', async () => {
  forgetVersions();
  const patch = { id: 'made-sound', name: 'Made', category: 'ui', params: [{ id: 'pitch', label: 'Pitch', min: 100, max: 800, default: 400 }], presets: { Deep: { pitch: 150 } }, graph: [] };
  const list = await versionsFor('sound', patch, 12, { fetcher: fetchFile });
  assert.equal(list[0].name, 'Deep');
  assert.equal(list[0].style, 'Deep');
});

test('when the file cannot be read the page still gets versions (made now), not an error', async () => {
  forgetVersions();
  const list = await versionsFor('sprite', knight, 2, { fetcher: async () => { throw new Error('offline'); } });
  assert.ok(Array.isArray(list));
  forgetVersions();
});
