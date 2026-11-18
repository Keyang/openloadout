// The two contrast rules of the style guide, section 8, over EVERY interface sprite in sprites/
// (no list of ids: a new sprite of type `ui` is picked up by itself):
//   white text keeps 4.5 to 1 on a text area, and the frame or lit edge keeps 3 to 1 against it,
//   as made and under every whole-bundle look, for every face and frame swatch and every style.
// A sprite with a colour control named `face` says where its text goes with `textArea(clip, p)`,
// or marks a clip that never carries text `noText: true` (engine/ui.js, CONTRAST). The checking
// itself is contrastFaults() in the helper; the first half of this file tests that on made-up sprites.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defineSprite, range, choice, color } from '../../engine/sprite.js';
import { contrastFaults, panel9 } from '../../engine/ui.js';
import { Surface } from '../../engine/surface.js';

const made = (over = {}) => defineSprite({
  id: 'fixture-panel', name: 'Fixture', size: [48, 32], pivot: [24, 16],
  meta: { type: 'ui' },
  params: {
    style: choice('Style', 'plain', ['plain', 'scroll']),
    border: range('Border', 0.5),
    face: color('Face', '#3a3350', ['#3a3350', '#2a3580', '#4a2f5a']),
    frame: color('Frame', '#f0ead8', ['#f0ead8', '#fdf277', '#f6d3b0']),
  },
  clips: { panel: { frames: 1, fps: 8 }, arrow: { frames: 1, fps: 8, noText: true } },
  textArea(clip, p) {
    const out = panel9(new Surface(48, 32), 1, 1, 46, 30, { face: p.face, frame: p.frame, style: p.style, border: p.border });
    return { ...out.inner, edge: { x: 24, y: p.style === 'scroll' ? 3 : 2 } };
  },
  render(g, { clip, p }) {
    if (clip === 'arrow') { g.rect(20, 12, 8, 8, '#f2c230'); return; }
    panel9(g, 1, 1, 46, 30, { face: p.face, frame: p.frame, style: p.style, border: p.border });
  },
  ...over,
});

test('a panel with dark faces and pale frames has no faults', () => {
  assert.deepEqual(contrastFaults(made()), []);
});

test('a face too light for white text is a fault, named with its swatch, clip, look and ratio', () => {
  const s = made();
  s.params.face = color('Face', '#3a3350', ['#3a3350', '#c9a06a', '#2a3580']);
  const faults = contrastFaults(s);
  assert.ok(faults.length >= 1);
  assert.ok(faults.every((f) => f.includes('#c9a06a')), faults.join('\n'));
  assert.match(faults[0], /panel.*white text.*4\.5/);
  assert.match(faults[0], /under /);
  assert.ok(!faults.some((f) => f.includes('arrow')), 'a noText clip is never checked');
});

test('a frame that does not stand out from a face is a fault', () => {
  const s = made();
  s.params.frame = color('Frame', '#f0ead8', ['#f0ead8', '#5a5f7a', '#f6d3b0']);
  const faults = contrastFaults(s);
  assert.ok(faults.length >= 1 && faults.every((f) => f.includes('#5a5f7a') && /frame|edge/.test(f) && f.includes('3 to 1')), faults.join('\n'));
});

test('a sprite with a face colour must say where its text goes, clip by clip, or say that a clip has none', () => {
  const silent = made({ textArea: undefined });
  const faults = contrastFaults(silent);
  assert.equal(faults.length, 1);
  assert.match(faults[0], /panel.*textArea.*noText/);
  const partly = made({ textArea: (clip) => (clip === 'panel' ? undefined : { x: 10, y: 10, w: 4, h: 4 }) });
  assert.match(contrastFaults(partly)[0], /panel.*textArea.*noText/);
  // every clip marked: nothing to check
  const plates = made({ textArea: undefined });
  plates.clips.panel.noText = true;
  assert.deepEqual(contrastFaults(plates), []);
});

test('a text area need not be one colour, but every colour in it must take white text; a sprite with no face control is left alone', () => {
  const lined = made({
    render(g, { p }) { panel9(g, 1, 1, 46, 30, { face: p.face, frame: p.frame }); g.rect(10, 16, 28, 1, '#c9a06a'); },
  });
  const faults = contrastFaults(lined);
  assert.ok(faults.length >= 1 && faults[0].includes('#c9a06a'), faults.join('\n'));
  const glyphs = defineSprite({ id: 'fixture-glyphs', name: 'G', size: [16, 16], pivot: [8, 8], meta: { type: 'ui' }, params: { body: color('Body', '#f0ead8', ['#f0ead8', '#f2c230', '#c9423a']) }, clips: { a: { frames: 1, fps: 1 } }, render(g, { p }) { g.rect(4, 4, 8, 8, p.body); } });
  assert.deepEqual(contrastFaults(glyphs), []);
  assert.deepEqual(contrastFaults(defineSprite({ id: 'fixture-hero', name: 'H', size: [16, 16], pivot: [8, 8], meta: { type: 'character' }, params: { face: color('Face', '#f0ead8', ['#f0ead8', '#f2c230', '#c9423a']) }, clips: { a: { frames: 1, fps: 1 } }, render(g) { g.rect(4, 4, 8, 8, '#ffffff'); } })), [], 'only interface sprites are checked');
});

// ---- every interface sprite in sprites/ ------------------------------------------------------

const dir = new URL('../../sprites/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('_')).sort();
let found = 0;
for (const f of files) {
  let sprite;
  try { sprite = (await import(new URL(f, dir).href)).default; } catch { continue; }   // a file that cannot be loaded is the checker's to report
  if (sprite?.meta?.type !== 'ui') continue;
  found++;
  test(`${sprite.id}: text and frame keep their contrast under every whole-bundle look`, () => {
    const faults = contrastFaults(sprite);
    assert.deepEqual(faults.slice(0, 12), [], `${faults.length} fault${faults.length === 1 ? '' : 's'}`);
  });
}
test('the sweep found the interface sprites by itself', () => { assert.ok(found >= 4, `${found} sprites of type ui`); });
