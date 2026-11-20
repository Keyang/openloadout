// A rig's description (rigs/<rig>-describe.js) against the rig's code: what the description says exists, exists, and
// what the code has, the description lists (docs/architecture.md, Contract 13). The drawing half of the proof is in
// rig-describe-draw.test.mjs.
//
// HOW AN ADDITION IS FOUND. Nothing here keeps a list of its own. The tests read the rig's modules as they are:
//   1. every export of every module of the rig must be named somewhere in the description ('<module>.<export>');
//   2. every exported function whose first argument is `g` (it draws) must be the `fn` or `drawnBy` of an entry under
//      body, hair, parts, held or effects, or be listed under drawingHelpers with its reason;
//   3. every exported list of names (an array of strings, or a table keyed by name) must be claimed by entries that
//      give `list`, and the names must be the same on both sides, one for one;
//   4. a choice a drawing function tests for in its own source (kind === 'x', style === 'x') must be among the choices
//      the description gives that option;
//   5. a file rigs/<rig>-<something>.js must be one of the rig's modules.
// So a builder who appends a part, a held kind, a pose or a side module without describing it fails here, and the
// message names the export. What it cannot see: a new choice handled only inside a private function.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { RIG_IDS, ROOT, loadRig, resolve, mentioned, entriesOf, namesIn } from '../../tools/rig.mjs';
import { codeSpriteSource } from '../helpers/library.mjs';

const isList = (v) => (Array.isArray(v) ? v.length > 0 && v.every((x) => typeof x === 'string')
  : v !== null && typeof v === 'object' && Object.keys(v).length > 0 && Object.values(v).every((x) => typeof x === 'function' || (x !== null && typeof x === 'object' && !Array.isArray(x))));
const namesOf = (v) => (Array.isArray(v) ? v : Object.keys(v));
const firstArg = (fn) => { const m = /^[^(]*\(\s*([A-Za-z_$][\w$]*)/.exec(Function.prototype.toString.call(fn)); return m ? m[1] : ''; };
const DRAWN = ['body', 'hair', 'parts', 'held', 'effects'];

test('rig descriptions: there are three, for the humanoid, top-down and kiosk rigs', () => {
  assert.deepEqual([...RIG_IDS].sort(), ['humanoid', 'kiosk', 'topdown']);
});

for (const id of RIG_IDS) {
  const L = await loadRig(id), { rig, mods } = L;
  const main = Object.values(mods)[0];

  test(`${id}: the description is plain data with the sections a program reads`, () => {
    assert.deepEqual(JSON.parse(JSON.stringify(rig)), rig, 'it survives JSON: no functions, no undefined');
    assert.equal(rig.id, id);
    for (const key of ['name', 'about', 'view', 'size', 'pivot', 'ground', 'directions', 'modules', 'frames', 'layers', 'poses', 'body', 'hair', 'parts', 'held', 'effects', 'sockets', 'helpers', 'drawingHelpers', 'duplicates', 'inSprites']) assert.ok(key in rig, `${id}: no "${key}"`);
    for (const section of ['poses', 'parts', 'held', 'hair', 'sockets', 'effects']) {
      const names = rig[section].map((e) => e.name);
      assert.deepEqual(names, [...new Set(names)], `${id}.${section}: each thing is listed once`);
      for (const e of rig[section]) assert.ok(typeof e.what === 'string' && e.what.length >= 6, `${id}.${section}.${e.name}: says what it is`);
    }
  });

  test(`${id}: frame size, pivot, ground line and directions are the rig's own`, () => {
    assert.deepEqual(rig.size, main.SIZE);
    assert.deepEqual(rig.pivot, main.PIVOT);
    assert.equal(rig.ground, main.GROUND);
    if (main.DIRECTIONS) assert.deepEqual(rig.directions, main.DIRECTIONS);
    else assert.equal(rig.directions.length, 1, 'a rig with no direction clips is drawn one way');
  });

  test(`${id}: every module of the rig is listed, and no side module is missing`, () => {
    for (const [short, file] of Object.entries(rig.modules)) assert.ok(fs.existsSync(path.join(ROOT, file)), `${short}: ${file} is not there`);
    const listed = new Set(Object.values(rig.modules));
    const side = fs.readdirSync(path.join(ROOT, 'rigs')).filter((f) => f.startsWith(`${id}-`) && f.endsWith('.js') && !f.endsWith('-describe.js')).map((f) => `rigs/${f}`);
    for (const f of side) assert.ok(listed.has(f), `${f} looks like a side module of the ${id} rig: add it to modules in rigs/${id}-describe.js and describe what it adds`);
  });

  test(`${id}: every name the description gives is a real export`, () => {
    for (const name of mentioned(rig)) assert.notEqual(resolve(L, name), undefined, `${id}: the description names ${name}, which is not exported`);
  });

  test(`${id}: every export of its modules is accounted for`, () => {
    const named = mentioned(rig), missing = [];
    for (const [short, mod] of Object.entries(mods)) for (const key of Object.keys(mod)) if (!named.has(`${short}.${key}`)) missing.push(`${short}.${key}`);
    assert.deepEqual(missing, [], `not in rigs/${id}-describe.js (describe each as a pose, part, held kind, hair style, socket or effect, or list it under helpers): ${missing.join(', ')}`);
  });

  test(`${id}: every exported drawing function is the fn or drawnBy of something drawn`, () => {
    const drawn = new Set(Object.keys(rig.drawingHelpers));
    for (const section of DRAWN) for (const e of entriesOf(rig, section)) for (const k of ['fn', 'drawnBy']) for (const n of [].concat(e[k] ?? [])) drawn.add(n);
    const loose = [];
    for (const [short, mod] of Object.entries(mods)) for (const [key, v] of Object.entries(mod)) if (typeof v === 'function' && firstArg(v) === 'g' && !drawn.has(`${short}.${key}`)) loose.push(`${short}.${key}`);
    assert.deepEqual(loose, [], `these draw (their first argument is g) and are not the fn of any part, held kind, hair style, body or effect: ${loose.join(', ')}`);
    for (const [name, why] of Object.entries(rig.drawingHelpers)) assert.ok(typeof why === 'string' && why.length > 15, `${name}: say why it is a helper and not a part`);
  });

  test(`${id}: every exported list of names is described name for name`, () => {
    const claimed = namesIn(rig);                      // { '<module>.<list>': Set of names }
    for (const [short, mod] of Object.entries(mods)) {
      for (const [key, v] of Object.entries(mod)) {
        if (!isList(v)) continue;
        const list = `${short}.${key}`, want = namesOf(v);
        assert.ok(claimed[list], `${list} is a list of names (${want.join(', ')}) and no entry of the description gives it as its "list"`);
        assert.deepEqual([...claimed[list]].sort(), [...want].sort(), `${list}: the code has ${want.join(', ')}; the description has ${[...claimed[list]].join(', ')}`);
      }
    }
    for (const list of Object.keys(claimed)) assert.ok(isList(resolve(L, list)), `${list} is given as a list and is not one`);
  });

  test(`${id}: a choice a drawing function tests for is a choice the description gives`, () => {
    for (const section of ['parts', 'held', 'hair']) {
      for (const e of rig[section]) {
        const fn = resolve(L, [].concat(e.fn)[0]);
        if (typeof fn !== 'function') continue;
        const src = Function.prototype.toString.call(fn);
        for (const [key, o] of Object.entries(e.options ?? {})) {
          if (!o.choices) continue;
          const tested = [...src.matchAll(new RegExp(`\\b${key}\\s*[!=]==\\s*'([^']+)'`, 'g'))].map((m) => m[1]);
          for (const v of tested) assert.ok(o.choices.includes(v), `${id}.${section}.${e.name}: ${e.fn} tests ${key} === '${v}', which is not among the choices ${o.choices.join(', ')}`);
        }
      }
    }
  });

  test(`${id}: poses carry the frames, speed and looping of the rig's clip table`, () => {
    for (const p of rig.poses) {
      assert.ok(Number.isInteger(p.frames) && p.frames >= 2 && typeof p.fps === 'number' && typeof p.loop === 'boolean', `${p.name}: frames, fps, loop`);
      assert.ok(p.directions.length && p.directions.every((d) => rig.directions.includes(d)), `${p.name}: directions`);
      assert.ok(Array.isArray(p.standardFor), `${p.name}: standardFor (the clips it is the standard pose of; [] when a sprite must ask for it)`);
      const std = L.standardClip(p.clipOf ?? p.name);
      if (p.table) {
        assert.ok(std, `${p.name}: says its numbers are in ${p.table}, which has no "${p.clipOf ?? p.name}"`);
        assert.deepEqual({ frames: p.frames, fps: p.fps, loop: p.loop }, std, `${p.name}: frames, fps, loop`);
      } else assert.equal(L.standardClip(p.name), null, `${p.name}: the rig's table has it; give "table"`);
    }
    // and the other way: every clip of the rig's table is a pose here, or the clip of one
    for (const name of L.standardNames()) assert.ok(rig.poses.some((p) => p.name === name), `${id}: the clip table has "${name}" and the description has no such pose`);
  });

  test(`${id}: option ranges are well formed`, () => {
    for (const section of ['poses', 'parts', 'held', 'hair']) {
      for (const e of rig[section]) {
        for (const [key, o] of Object.entries(e.options ?? {})) {
          const where = `${id}.${section}.${e.name}.${key}`;
          if ('min' in o) assert.ok(o.min < o.max && o.default >= o.min && o.default <= o.max, `${where}: min < max, default inside`);
          else if (o.choices) assert.ok(o.choices.length >= 2 && (o.default === undefined || o.choices.includes(o.default)), `${where}: choices and default`);
          else assert.ok(o.colour === true || o.flag === true || o.data, `${where}: a range (min, max, default), choices, colour, flag or data`);
        }
      }
    }
    for (const [key, o] of Object.entries(rig.body.controls)) assert.ok(o.min < o.max && o.default >= o.min && o.default <= o.max, `${id}.body.${key}`);
  });

  test(`${id}: every part says where it is drawn and what it attaches to`, () => {
    const layers = new Set([...rig.layers.map((l) => l.name), 'after']), sockets = new Set(rig.sockets.map((s) => s.name));
    for (const e of [...rig.parts, ...rig.held]) {
      const at = [].concat(e.layers ?? e.layer).map((l) => l?.layer ?? l);
      assert.ok(at.length && at.every((l) => layers.has(l)), `${id}: ${e.name} is drawn in ${at.join(', ')}; the rig's layers are ${[...layers].join(', ')}`);
      // a part worn on the body itself (a belt, a robe) has no attach point: null
      assert.ok(e.socket === null || sockets.has(e.socket), `${id}: ${e.name} attaches to "${e.socket}", which is not one of the rig's sockets`);
      assert.ok(e.directions.length && e.directions.every((d) => rig.directions.includes(d)), `${id}: ${e.name}: directions`);
    }
  });

  test(`${id}: every held kind's size in pixels is what its size function gives`, () => {
    for (const h of entriesOf(rig, 'held')) {
      if (!h.size || !h.px) continue;
      const size = resolve(L, h.size)(h.sizeName ?? h.name, 1);
      assert.ok(size, `${id}: ${h.size}('${h.name}') gives nothing`);
      for (const key of ['length', 'back', 'pad']) assert.equal(h.px[key], size[key], `${id}: held "${h.name}" ${key}: the description says ${h.px[key]}, ${h.size} says ${size[key]}`);
      assert.equal(resolve(L, h.size)(h.sizeName ?? h.name, 2).length, size.length * 2, `${id}: held "${h.name}": the length setting scales the length`);
    }
    for (const c of rig.carries ?? []) assert.ok(c.what, `${id}: carry ${c.name}`);
  });

  test(`${id}: duplicates and sprite-drawn pieces point at things that exist`, () => {
    for (const dup of rig.duplicates) {
      assert.ok(dup.what && dup.merge && dup.calls.length >= 2, `${id}: duplicate "${dup.what}" names what overlaps, at least two calls, and what to merge into`);
      for (const c of dup.calls) {
        // a sprite's code is read from its frozen copy first (tests/helpers/library.mjs), as inSprites below
        if (c.includes('#')) { const [file, name] = c.split('#'), sprite = /^sprites\/([a-z0-9-]+)\.js$/.exec(file); assert.match((sprite && codeSpriteSource(sprite[1])) ?? fs.readFileSync(path.join(ROOT, file), 'utf8'), new RegExp(`\\b${name}\\b`), `${c} is not there any more`); }
        else assert.notEqual(resolve(L, c), undefined, `${id}: duplicate "${dup.what}" names ${c}, which is not exported`);
      }
    }
    for (const s of rig.inSprites) {
      // the sprite's code, frozen first (tests/helpers/library.mjs): the migration redraws the library's as data files
      const text = codeSpriteSource(s.sprite);
      assert.ok(text !== null, `sprites/${s.sprite}.js is gone and has no frozen copy in tests/fixtures/code-sprites/: freeze it, or take it out of inSprites in rigs/${id}-describe.js`);
      for (const name of s.functions) assert.match(text, new RegExp(`\\b${name}\\b`), `sprites/${s.sprite}.js no longer has ${name}: update inSprites in rigs/${id}-describe.js`);
      assert.ok(s.draws && s.belongs, `${s.sprite}: says what it draws and where that belongs`);
    }
  });
}
