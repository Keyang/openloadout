// The quality cache key of a data sprite and generators that reach code a definition never names (build item B9,
// review round 1, issue 5). tools/lib/quality-run.mjs reads each generator's code from its family file as text; these
// tests hold it to:
//   - a generator that calls another by an id written in its code (call({ gen: 'twinkle', v: 1 })) is keyed on that
//     generator's code too, followed in turn;
//   - a call whose id is not written plainly (gen: someName) keys the generator on every family file;
//   - a top-level statement that changes a table the generator reads (TABLE.a = 2, written further down the file) is
//     part of its key;
//   - code the generator does not reach is not.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dataSpriteDeps } from '../../tools/lib/quality-run.mjs';
import { dataProject, coinDef, editFile } from '../helpers/data-sprites.mjs';

/** A definition naming only the given generator calls (the key reads the file as written; it is not drawn here). */
function namingDef(id, calls) {
  const d = coinDef(id);
  d.body.pictures.draw = [...calls.map((c) => ({ ...c, on: 'coin' })), { kind: 'outline', paint: 'ink' }];
  return d;
}
const fp = (root, id, ref) => dataSpriteDeps(root, path.join(root, 'sprites', `${id}.json`)).generators[ref];

test('a generator that calls another by a written-in id is keyed on the called generator\'s code', () => {
  const root = dataProject({ data: { glint: namingDef('glint', [{ gen: 'gleam', v: 1, at: [3, 3], paint: 'shine', core: 'shine' }]) } });
  const before = fp(root, 'glint', 'gleam@1');
  assert.ok(before, 'gleam@1 is found');
  // twinkle@1 lives in engine/gen/fx.js; gleam@1 (engine/gen/shine.js) calls it by name
  editFile(root, 'engine/gen/fx.js', 'const s = a.size, x', 'const s = a.size + 0, x');
  assert.notEqual(fp(root, 'glint', 'gleam@1'), before, 'a change to twinkle@1 re-keys gleam@1');
});

test('a call whose generator is not written plainly keys the caller on every family file', () => {
  const zz = [
    "import { defineGenerator } from './registry.js';",
    'const which = \'twinkle\';',
    'export const zzCaller = defineGenerator({',
    "  id: 'zz-caller', v: 1, family: 'fx',",
    "  about: 'Calls a generator whose id is in a variable.',",
    '  args: {},',
    '  cost: () => 1,',
    '  run(a, ctx, { call }) { return call({ gen: which, v: 1, at: [1, 1], paint: \'ink\', core: \'ink\' }, ctx); },',
    '});',
    ''].join('\n');
  const root = dataProject({ data: { zz: namingDef('zz', [{ gen: 'zz-caller', v: 1 }]) }, files: { 'engine/gen/zz-caller.js': zz } });
  const before = fp(root, 'zz', 'zz-caller@1');
  editFile(root, 'engine/gen/mark.js', 'export', '// a comment\nexport');
  assert.notEqual(fp(root, 'zz', 'zz-caller@1'), before, 'any family file changes its key');
});

test('a top-level statement further down that changes a table the generator reads is in its key; unrelated code is not', () => {
  const zz = [
    "import { defineGenerator } from './registry.js';",
    'const TABLE = { a: 1 };',
    'export const zzTable = defineGenerator({',
    "  id: 'zz-table', v: 1, family: 'shape',",
    "  about: 'A dot where a table says.',",
    '  args: {},',
    '  cost: () => 1,',
    "  run() { return [{ kind: 'dot', at: [TABLE.a, 0], paint: 'ink' }]; },",
    '});',
    '',
    '/** Something else in the file. */',
    'export function other() { return 1; }',
    'TABLE.a = 2;',
    '',
    'export function more() { return 2; }',
    ''].join('\n');
  const root = dataProject({ data: { zz: namingDef('zz', [{ gen: 'zz-table', v: 1 }]) }, files: { 'engine/gen/zz-table.js': zz } });
  const before = fp(root, 'zz', 'zz-table@1');
  editFile(root, 'engine/gen/zz-table.js', 'TABLE.a = 2;', 'TABLE.a = 3;');
  const after = fp(root, 'zz', 'zz-table@1');
  assert.notEqual(after, before, 'the statement changing TABLE is part of the key');
  editFile(root, 'engine/gen/zz-table.js', 'return 2;', 'return 5;');
  assert.equal(fp(root, 'zz', 'zz-table@1'), after, 'a function it never reaches is not');
  editFile(root, 'engine/gen/mark.js', 'export', '// a comment\nexport');
  assert.equal(fp(root, 'zz', 'zz-table@1'), after, 'nor another family file');
});

test('a sprite naming twinkle@1 only is not re-keyed by a change to gleam@1, which calls it', () => {
  const root = dataProject({ data: { tw: namingDef('tw', [{ gen: 'twinkle', v: 1, at: [3, 3], size: 1, paint: 'shine', core: 'shine' }]) } });
  const before = fp(root, 'tw', 'twinkle@1');
  editFile(root, 'engine/gen/shine.js', 'const size = d < 0.07', 'const size = d < 0.071');
  assert.equal(fp(root, 'tw', 'twinkle@1'), before);
  assert.ok(fs.existsSync(path.join(root, 'engine', 'gen', 'shine.js')));
});
