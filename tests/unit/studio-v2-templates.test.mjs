// The studio's starting points for version 2 sprites (build item B17): one template per body (rig, tiles, layers,
// panel, emitters, pictures), each valid and drawn by the framework renderer (engine/data-sprite.js) on every frame;
// the drafts' check (app/studio/v2-check.js), which keeps a version 2 draft that has mistakes in it (its errors are
// shown while it is edited) but never one that is not plain data; and a library sprite opened as a copy that draws as
// the library file does.
//   node --test tests/unit/studio-v2-templates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeDataSprite } from '../../engine/data-sprite.js';
import { renderFrame, defaultParams } from '../../engine/sprite.js';
import { nodePieceStore } from '../../tools/lib/pieces-index.mjs';
import { BODY_KINDS, copyOfLibrary, fileOf } from '../../app/studio/v2-model.js';
import { v2Starts, v2Template } from '../../app/studio/v2-templates.js';
import { checkDraft, checkFull, spriteOf } from '../../app/studio/v2-check.js';
import { validateDataSprite } from '../../engine/data-sprite.js';

const pieces = nodePieceStore();
const opaque = (g) => { let n = 0; for (const v of g.data) if (v) n++; return n; };

test('one start per body, in everyday words', () => {
  const s = v2Starts();
  assert.deepEqual(s.map((x) => x.body).sort(), [...BODY_KINDS].sort());
  for (const x of s) {
    assert.match(x.id, /^[a-z][a-z0-9-]*$/);
    assert.ok(x.label && x.blurb, x.id);
  }
});

for (const kind of BODY_KINDS) {
  test(`the ${kind} template is valid and every frame of every clip draws`, async () => {
    const def = v2Template(kind, { name: 'My thing' });
    assert.equal(def.version, 2);
    assert.equal(def.name, 'My thing');
    assert.equal(def.made.in, 'studio');
    assert.match(def.made.from, /^template:/);
    assert.ok(Object.hasOwn(def.body, kind));
    const got = await pieces.loadFor(def);
    assert.equal(got.ok, true, got.errors?.join('; '));
    const v = checkFull(def, { pieces });
    assert.equal(v.ok, true, v.errors.join('\n'));
    const m = makeDataSprite(def, { pieces });
    assert.equal(m.ok, true, m.errors.join('\n'));
    const p = defaultParams(m.sprite);
    let drawn = 0;
    for (const [clip, c] of Object.entries(m.sprite.clips)) {
      for (let f = 0; f < c.frames; f++) drawn += opaque(renderFrame(m.sprite, clip, f, p)) ? 1 : 0;
    }
    assert.ok(drawn > 0, 'something is drawn');
    assert.ok(Object.keys(m.sprite.params).length > 0, 'it has controls people get');
  });
}

test('a template copy is fresh each time (changing one never changes the next)', () => {
  const a = v2Template('pictures');
  a.palette[0].default = '#000000';
  assert.notEqual(v2Template('pictures').palette[0].default, '#000000');
});

test('the drafts\' check: version 1 as before; version 2 behind the plain-data wall, mistakes kept to be shown', () => {
  const v1 = JSON.parse(fs.readFileSync(new URL('../fixtures/studio/newt.json', import.meta.url), 'utf8'));
  assert.deepEqual(checkDraft(v1), validateDataSprite(v1));
  const def = v2Template('pictures');
  const ok = checkDraft(def);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, def);
  const broken = { ...def, palette: [{ id: 'gold', default: 'red' }] };
  const kept = checkDraft(broken);
  assert.equal(kept.ok, true, 'kept: its errors are shown in the studio');
  assert.ok(kept.errors.length > 0, 'and named');
  assert.equal(checkDraft({ ...def, id: 'Not An Id' }).ok, false);
  assert.equal(checkDraft({ ...def, format: 'something' }).ok, false);
  assert.equal(checkDraft({ ...def, big: 'x'.repeat(140 * 1024) }).ok, false, 'past 128 KB');
  const hostile = JSON.parse(JSON.stringify(def));
  Object.defineProperty(hostile, 'name', { get() { throw new Error('ran'); }, enumerable: true });
  assert.equal(checkDraft(hostile).ok, false, 'a getter is not plain data');
});

test('a library sprite opened as a copy draws as the library file does', async () => {
  for (const id of ['coin', 'hit-spark', 'tiles-water', 'bg-gridline', 'ui-bars-candy']) {
    const lib = JSON.parse(fs.readFileSync(new URL(`../../sprites/${id}.json`, import.meta.url), 'utf8'));
    await pieces.loadFor(lib);
    const copy = copyOfLibrary(lib, { taken: [id] });
    const a = spriteOf(lib, { pieces });
    const b = spriteOf(copy, { pieces });
    assert.equal(a.ok && b.ok, true, `${id}: ${[...(a.errors ?? []), ...(b.errors ?? [])].join('; ')}`);
    const clip = Object.keys(a.sprite.clips)[0];
    const ga = renderFrame(a.sprite, clip, 0, defaultParams(a.sprite)), gb = renderFrame(b.sprite, clip, 0, defaultParams(b.sprite));
    assert.deepEqual([...gb.data], [...ga.data], id);
    const f = fileOf(copy);
    assert.equal(f.name, `${copy.id}.json`);
    assert.equal(checkFull(JSON.parse(f.text), { pieces }).ok, true, id);
  }
});
