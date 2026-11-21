// Small data sprites (loadout-sprite version 2, written as sprites/<id>.json; docs/data-sprites.md, build item B9) and
// scratch projects to load, check and build them in, for the assets-data-*.test.mjs tests. A scratch project holds
// COPIES of the framework folders (so a test may edit a generator or the checker in it) and never touches the real
// sprites/, pieces/ or caches.
//
// The three sprites use only what the site has today: coin names the generators twinkle@1 and mark@1, badge names
// mark@1 only, and tuft-pot names no generator but uses the piece part:test-tuft@1 (which uses stamp:test-clod@1; the
// two test pieces of tests/fixtures/pieces/pieces). Each passes the quality bar.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeSpriteAsFile } from './library.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The framework folders a scratch project copies: what a data sprite is loaded, drawn and checked with. */
export const FRAMEWORK = ['engine', 'rigs', 'catalog', 'quality', 'sound'];
const META = (type, role, view, words) => ({ type, role, view, themes: ['fantasy'], gameTypes: ['platformer'], words, license: 'draft' });

/** A gold coin that bobs, with a star (mark@1) and a sparkle (twinkle@1). */
export function coinDef(id = 'coin') {
  return {
    format: 'loadout-sprite', version: 2, id, name: 'Data coin', blurb: 'A gold coin that bobs and shines, drawn from data.', size: [32, 32], pivot: [16, 30], grounded: false,
    meta: META('pickup', 'items/pickup', 'front', ['coin', 'gold', 'money', 'collect', 'coins', 'treasure', 'pickup']),
    styles: ['pixel'],
    palette: [{ id: 'gold', label: 'Gold', default: '#e8b23a', material: 'metal' }, { id: 'shine', label: 'Shine', default: '#fff4c0', material: 'light' }],
    controls: [
      { key: 'size', kind: 'range', label: 'Size', lo: 'Small', hi: 'Big', default: 0.5 },
      { key: 'sparkle', kind: 'toggle', label: 'Sparkle', default: true },
      { key: 'shine', kind: 'colour', label: 'Sparkle colour', when: { sparkle: [true] } },
      { key: 'speed', standard: 'speed' }],
    body: { pictures: {
      nodes: [{ id: 'coin', parent: null, at: [16, 15] }],
      draw: [
        { id: 'face', kind: 'ellipse', on: 'coin', at: [0, 0], r: [{ from: 'size', map: [[0, 5], [1, 9]] }, { from: 'size', map: [[0, 5], [1, 9]] }], paint: 'gold', shade: 1, light: 1 },
        { gen: 'mark', v: 1, on: 'coin', name: 'star', at: [0, 0], size: 5, paint: 'gold.dark' },
        { kind: 'outline', paint: 'ink' },
        { gen: 'twinkle', v: 1, on: 'coin', at: [3, -4], size: 1, paint: 'shine', core: 'shine', when: { sparkle: [true] } }] } },
    clips: { idle: { frames: 8, fps: 8, keys: [{ t: 0, root: [0, 0] }, { t: 0.5, root: [0, -2] }, { t: 1, root: [0, 0] }] } },
    preview: 'idle',
  };
}

/** A round badge with a mark (mark@1) chosen by a choice. */
export function badgeDef(id = 'badge') {
  return {
    format: 'loadout-sprite', version: 2, id, name: 'Data badge', blurb: 'A round badge with a picture on it, drawn from data.', size: [24, 24], pivot: [12, 22], grounded: false,
    meta: META('icon', 'interface/icon', 'none', ['badge', 'emblem', 'icon', 'mark', 'medal', 'symbol']),
    palette: [{ id: 'plate', label: 'Plate', default: '#3a6ea5', material: 'metal' }, { id: 'sign', label: 'Sign', default: '#f0e6c8', material: 'paint' }],
    controls: [{ key: 'picture', kind: 'choice', label: 'Picture', options: ['star', 'skull'], default: 'star' }],
    body: { pictures: {
      nodes: [{ id: 'plate', parent: null, at: [12, 11] }],
      draw: [
        { id: 'disc', kind: 'ellipse', on: 'plate', at: [0, 0], r: [8, 8], paint: 'plate', shade: 1, light: 1 },
        { gen: 'mark', v: 1, on: 'plate', name: { from: 'picture', pick: { star: 'star', skull: 'skull' } }, at: [0, 0], size: 9, paint: 'sign' },
        { kind: 'outline', paint: 'ink' }] } },
    clips: { idle: { frames: 1, fps: 1 } },
    preview: 'idle',
  };
}

/** A clay pot with a tuft of grass: the piece part:test-tuft@1 on a node (no generator). */
export function tuftDef(id = 'tuft-pot') {
  return {
    format: 'loadout-sprite', version: 2, id, name: 'Tuft pot', blurb: 'A clay pot with a tuft of grass, drawn from data.', size: [16, 16], pivot: [8, 15],
    meta: { ...META('prop', 'world/prop', 'side', ['pot', 'plant', 'grass', 'tuft', 'clay', 'garden']), themes: ['farm'] },
    palette: [{ id: 'clay', label: 'Clay', default: '#b0603a', material: 'earth' }, { id: 'hair', label: 'Grass', default: '#3a6e2a', material: 'plant' }],
    body: { pictures: {
      nodes: [{ id: 'pot', parent: null, at: [8, 10] }, { id: 'top', parent: 'pot', at: [0, -4] }],
      draw: [
        { id: 'body', kind: 'rect', on: 'pot', at: [-4, -3], size: [8, 6], paint: 'clay' },
        { id: 'tuft', kind: 'use', use: 'part:test-tuft', v: 1, on: 'top', paint: { hair: 'hair' } },
        { kind: 'outline', paint: 'ink' }] } },
    clips: { idle: { frames: 1, fps: 1 } },
    preview: 'idle',
  };
}

/** JSON text of a definition as a person would save it: two-space indents and a final line break. */
export const asFile = (def) => `${JSON.stringify(def, null, 2)}\n`;

/**
 * A scratch project: copies of the framework folders, sprites/ sounds/ bundles/ pieces/ (empty unless given), and:
 *   data     { '<id>': definition | text } written as sprites/<id>.json
 *   code     ids of code sprites to copy as sprites/<id>.js from the frozen copy (tests/fixtures/code-sprites/): only for a test that
 *            wants to see the build, the loader or the quality run REFUSE a code file in sprites/ (build item R4a); they load none
 *   sounds   ids of the real project's sounds to copy, or { '<id>': patch }
 *   pieces   true: the two test pieces of tests/fixtures/pieces/pieces (with their pins)
 *   files    { '<relative path>': text } anything else
 * Returns the project's folder (a real path).
 */
export function dataProject({ data = {}, code = [], sounds = [], pieces = false, files = {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'loadout-data-')));
  for (const d of FRAMEWORK) fs.cpSync(path.join(ROOT, d), path.join(root, d), { recursive: true });
  for (const d of ['sprites', 'sounds', 'bundles', 'pieces']) fs.mkdirSync(path.join(root, d), { recursive: true });
  for (const [id, def] of Object.entries(data)) fs.writeFileSync(path.join(root, 'sprites', `${id}.json`), typeof def === 'string' ? def : asFile(def));
  // a code sprite, as codeSprite reads it (tests/helpers/library.mjs), imports put back for sprites/: the project then holds a file the build refuses
  for (const id of code) fs.writeFileSync(path.join(root, 'sprites', `${id}.js`), codeSpriteAsFile(id));
  if (Array.isArray(sounds)) for (const id of sounds) fs.copyFileSync(path.join(ROOT, 'sounds', `${id}.json`), path.join(root, 'sounds', `${id}.json`));
  else for (const [id, patch] of Object.entries(sounds)) fs.writeFileSync(path.join(root, 'sounds', `${id}.json`), JSON.stringify(patch));
  if (pieces) for (const f of fs.readdirSync(path.join(ROOT, 'tests', 'fixtures', 'pieces', 'pieces'))) fs.copyFileSync(path.join(ROOT, 'tests', 'fixtures', 'pieces', 'pieces', f), path.join(root, 'pieces', f));
  for (const [rel, text] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); }
  return root;
}

/** Replaces `from` with `to` in a file of a scratch project; throws when the file does not hold `from`. */
export function editFile(root, rel, from, to) {
  const f = path.join(root, rel), text = fs.readFileSync(f, 'utf8');
  if (!text.includes(from)) throw new Error(`${rel} does not hold ${JSON.stringify(from)}`);
  fs.writeFileSync(f, text.replace(from, to));
}
