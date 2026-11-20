// font.cell@1 (engine/gen/text.js, migration batch M9): one character of a pixel font per frame in a 16 x 20 font-sheet
// cell, the port of the four library font sheets (sprites/font-chunky.js, font-rounded, font-serif, font-slim, frozen in
// tests/fixtures/code-sprites/). The four redraws (sprites/font-<style>.json) name it once per clip, and are held pixel
// for pixel to the code sheets they replace at every setting, clip and frame (tests/helpers/m9-ports.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as registry from '../../engine/gen/index.js';
import { checkGeneratorContract } from '../helpers/gen-harness.mjs';
import { portDifferences } from '../helpers/m9-ports.mjs';

const cell = () => registry.generator('font.cell', 1);

test('font.cell@1 passes the goldens harness', () => {
  checkGeneratorContract(registry, cell(), { cases: [
    { args: { at: [4, 13], style: 'chunky', row: 'upper', paint: 'body' }, ctx: { frame: 0 } },
    { args: { at: [4, 13], style: 'serif', row: 'lower', size: 1, outline: 'rimmed', paint: 'body', edge: 'edge', shadow: true, shine: true }, ctx: { frame: 6 } },
    { args: { at: [0, 0], style: 'slim', row: 'digits', size: 0, outline: 'none', paint: 'body', shadow: true }, ctx: { frame: 7 } },
    { args: { at: [10, 15], style: 'rounded', row: 'marks', size: 0.6, outline: 'ink', paint: 'body', shine: true }, ctx: { frame: 17 } },
  ] });
});

test('font.cell@1 draws nothing past the row\'s last character, and one stamp list a frame', () => {
  const run = (frame) => registry.runGenerator({ gen: 'font.cell', v: 1, at: [4, 13], row: 'digits', paint: 'body' }, { frame });
  assert.equal(run(10).primitives.length, 0);
  assert.ok(run(9).primitives.length >= 1);
  assert.ok(run(9).primitives.every((p) => p.kind === 'stamp'));
});

for (const id of ['font-chunky', 'font-rounded', 'font-serif', 'font-slim']) {
  test(`sprites/${id}.json draws what the code font sheet drew, pixel for pixel`, async () => {
    assert.deepEqual(await portDifferences(id), []);
  });
}
