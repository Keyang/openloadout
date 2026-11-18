// The bundle palettes (style guide section 3) and their swatch lists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brightness, INK } from '../../engine/color.js';
import { PALETTE, BUNDLE_PALETTE, palette, paletteName, materials, swatches } from '../../engine/palettes.js';

const HEX = /^#[0-9a-f]{6}$/;

// Read the three palette tables straight out of the style guide, so the code cannot drift from it.
function guidePalettes() {
  const md = readFileSync(new URL('../../docs/style-guide.md', import.meta.url), 'utf8');
  const out = {};
  let cur = null;
  for (const line of md.split('\n')) {
    const h = line.match(/^### Palette "(\w+)" \(`([\w-]+)`\)/);
    if (h) { cur = { name: h[1].toLowerCase(), bundle: h[2], colours: {} }; out[cur.name] = cur; continue; }
    if (line.startsWith('## ')) cur = null;
    const row = cur && line.match(/^\| (\w+) \| `(#[0-9a-fA-F]{6})` \| (.*) \|$/);
    if (row) cur.colours[row[1]] = { hex: row[2].toLowerCase(), use: row[3] };
  }
  return out;
}
const GUIDE = guidePalettes();

test('the style guide has the three palettes', () => {
  assert.deepEqual(Object.keys(GUIDE).sort(), ['derelict', 'hearthvale', 'thornwood']);
  for (const g of Object.values(GUIDE)) assert.ok(Object.keys(g.colours).length >= 20, g.name);
});

test('every palette colour of the style guide is present, exactly, as a valid hex', () => {
  for (const [name, g] of Object.entries(GUIDE)) {
    const P = PALETTE[name];
    assert.ok(P, `PALETTE.${name}`);
    assert.deepEqual(Object.keys(P).sort(), Object.keys(g.colours).sort(), `${name}: same colour names as the guide`);
    for (const [k, { hex }] of Object.entries(g.colours)) {
      assert.match(P[k], HEX, `${name}.${k}`);
      assert.equal(P[k], hex, `${name}.${k}`);
    }
  }
});

test('the four shared colours mean the same in every bundle', () => {
  for (const name of ['thornwood', 'hearthvale', 'derelict']) {
    assert.equal(PALETTE[name].ink, INK);
    assert.equal(PALETTE[name].gold, '#f2c230');
    assert.equal(PALETTE[name].steel, '#c2c9d6');
    assert.equal(PALETTE[name].skin, '#f6d3b0');
  }
});

test('bundle ids and short names reach the same palette', () => {
  assert.deepEqual(BUNDLE_PALETTE, { 'kit-platformer-fantasy': 'thornwood', 'kit-rpg-fantasy': 'hearthvale', 'kit-roguelite-scifi': 'derelict' });
  for (const [name, g] of Object.entries(GUIDE)) {
    assert.equal(PALETTE[g.bundle], PALETTE[name], `PALETTE['${g.bundle}']`);
    assert.equal(palette(g.bundle), PALETTE[name]);
    assert.equal(palette(name), PALETTE[name]);
    assert.equal(paletteName(g.bundle), name);
  }
  assert.equal(PALETTE.platformer, PALETTE.thornwood);
  assert.equal(PALETTE.rpg, PALETTE.hearthvale);
  assert.equal(PALETTE.roguelite, PALETTE.derelict);
  assert.equal(PALETTE.scifi, PALETTE.derelict);
  // aliases do not show up when listing the palettes
  assert.deepEqual(Object.keys(PALETTE).sort(), ['derelict', 'hearthvale', 'thornwood']);
  assert.throws(() => palette('kit-space-opera'), /unknown bundle/);
});

test('palettes cannot be changed by a sprite by accident', () => {
  assert.ok(Object.isFrozen(PALETTE));
  assert.ok(Object.isFrozen(PALETTE.thornwood));
  assert.throws(() => { 'use strict'; PALETTE.thornwood.grass = '#000000'; });
});

const STANDARD = ['skin', 'hair', 'outfit', 'trim', 'metal', 'wood', 'stone', 'body', 'accent', 'glow', 'core', 'edge', 'sky', 'land', 'haze'];

test('every bundle offers the standard colour keys of section 10 as materials', () => {
  for (const name of Object.keys(GUIDE)) {
    const m = materials(name);
    for (const k of STANDARD) assert.ok(m.includes(k), `${name} has material ${k}`);
  }
});

test('swatches: 4 to 8 valid, distinct, not-too-dark colours with palette colours first, for every material', () => {
  for (const [name, g] of Object.entries(GUIDE)) {
    const own = new Set(Object.values(PALETTE[name]));
    for (const mat of materials(name)) {
      for (const key of [name, g.bundle]) {
        const s = swatches(key, mat);
        const where = `${key} ${mat}: ${s.join(' ')}`;
        assert.ok(s.length >= 4 && s.length <= 8, where);
        assert.equal(new Set(s).size, s.length, `${where}: no repeats`);
        for (const c of s) {
          assert.match(c, HEX, where);
          // section 3 rule 5: none darker than 0.18 (the checker warns under 0.14); no section allows a darker swatch
          assert.ok(brightness(c) >= 0.18, `${where}: ${c} too dark (${brightness(c).toFixed(3)})`);
          assert.notEqual(c, INK, where);
        }
        if (name === 'derelict') assert.ok(!s.includes(PALETTE.derelict.void), `${where}: void is background only`);
        // rule 2: the first three or more are palette colours (skin: a palette has only one or two skins)
        const lead = mat === 'skin' ? 1 : 3;
        for (let i = 0; i < lead; i++) assert.ok(own.has(s[i]), `${where}: swatch ${i} is a ${name} colour`);
      }
    }
  }
});

test('swatches put the obvious palette colour first', () => {
  assert.equal(swatches('thornwood', 'metal')[0], PALETTE.thornwood.steel);
  assert.equal(swatches('thornwood', 'wood')[0], PALETTE.thornwood.wood);
  assert.equal(swatches('kit-platformer-fantasy', 'skin')[0], PALETTE.thornwood.skin);
  assert.equal(swatches('kit-rpg-fantasy', 'stone')[0], PALETTE.hearthvale.cobble);
  assert.equal(swatches('kit-roguelite-scifi', 'glow')[0], PALETTE.derelict.cyan);
  assert.equal(swatches('kit-roguelite-scifi', 'core')[0], PALETTE.derelict.cream);
});

test('a palette colour name works as a material: that colour first, then its neighbours', () => {
  const s = swatches('thornwood', 'crimson');
  assert.equal(s[0], PALETTE.thornwood.crimson);
  assert.ok(s.length >= 4 && s.length <= 8);
  assert.equal(swatches('hearthvale', 'roof')[0], PALETTE.hearthvale.roof);
  assert.equal(swatches('derelict', 'acid')[0], PALETTE.derelict.acid);
  assert.equal(swatches('derelict', 'flesh')[0], PALETTE.derelict.flesh);
  // background-only and outline colours are never swatches, even by name
  assert.throws(() => swatches('derelict', 'void'), /background only/);
  assert.throws(() => swatches('thornwood', 'ink'), /outline/);
});

test('lead: a chosen default goes first and the list stays 4 to 8 long', () => {
  const s = swatches('thornwood', 'stone', { lead: 'slate' });
  assert.equal(s[0], PALETTE.thornwood.slate);
  assert.equal(s.filter((c) => c === PALETTE.thornwood.slate).length, 1);
  const t = swatches('hearthvale', 'leaf', { lead: '#3f7f45' });
  assert.equal(t[0], '#3f7f45');
  assert.ok(t.length >= 4 && t.length <= 8);
  assert.throws(() => swatches('thornwood', 'stone', { lead: '#201a20' }), /dark/);
});

test('unknown materials fail loudly and name the choices', () => {
  assert.throws(() => swatches('thornwood', 'plasma-goo'), /thornwood.*materials:/s);
});

test('each call returns a fresh array', () => {
  const a = swatches('thornwood', 'metal');
  a.push('#000000');
  assert.equal(swatches('thornwood', 'metal').includes('#000000'), false);
});

// ---- review round 1 ------------------------------------------------------------
import { HAIR, SKIN, CLOTH, METAL } from '../../engine/sprite.js';
import { NEVER_SWATCH } from '../../engine/palettes.js';

test('a lead darker than brightness 0.18 is refused, like every other swatch', () => {
  assert.ok(brightness('#2a2a2a') >= 0.14 && brightness('#2a2a2a') < 0.18);
  assert.throws(() => swatches('thornwood', 'stone', { lead: '#2a2a2a' }), /dark/);
});

test('too-dark engine colours are dropped from the lists that draw on them', () => {
  const dark = HAIR.filter((c) => brightness(c) < 0.18);
  assert.ok(dark.length > 0, 'the engine HAIR list has a near-outline colour to drop');
  for (const name of ['thornwood', 'hearthvale', 'derelict']) {
    const s = swatches(name, 'hair');
    for (const c of dark) assert.ok(!s.includes(c), `${name} hair drops ${c}`);
    assert.ok(s.some((c) => HAIR.includes(c) && !Object.values(PALETTE[name]).includes(c)), `${name} hair tops up from the engine list`);
  }
  assert.ok(swatches('thornwood', 'outfit').some((c) => CLOTH.includes(c)));
  assert.ok(swatches('thornwood', 'metal').some((c) => METAL.includes(c)));
  assert.ok(swatches('hearthvale', 'skin').slice(1).every((c) => SKIN.includes(c)));
});

test('names are lower case everywhere; any case is accepted by the functions', () => {
  assert.equal(PALETTE.Thornwood, undefined, 'PALETTE keys are lower case only');
  assert.equal(palette('Thornwood'), PALETTE.thornwood);
  assert.equal(palette('KIT-RPG-FANTASY'), PALETTE.hearthvale);
  assert.deepEqual(materials('Derelict'), materials('derelict'));
  assert.deepEqual(swatches('Thornwood', 'Metal'), swatches('thornwood', 'metal'));
  assert.deepEqual(swatches('thornwood', 'Crimson'), swatches('thornwood', 'crimson'));
  assert.equal(swatches('thornwood', 'stone', { lead: 'Slate' })[0], PALETTE.thornwood.slate);
  assert.equal(swatches('thornwood', 'stone', { lead: '#ABCDEF' })[0], '#abcdef');
});

test('NEVER_SWATCH is frozen all the way down', () => {
  assert.ok(Object.isFrozen(NEVER_SWATCH));
  for (const v of Object.values(NEVER_SWATCH)) assert.ok(Object.isFrozen(v));
});

// ---- palettes final (2026-11-18) ------------------------------------------------

test('materials() is exactly the word list of style guide section 3 "What swatches accepts"', () => {
  const every = ['skin', 'hair', 'outfit', 'trim', 'metal', 'wood', 'stone', 'body', 'accent', 'glow', 'core', 'edge', 'sky', 'land', 'haze', 'gem', 'shell', 'grass', 'leaf', 'ground', 'water', 'face', 'frame'];
  const same = ['rock', 'wall', 'cloth', 'fur', 'light', 'energy', 'crystal', 'liquid', 'growth', 'foliage', 'earth', 'dirt', 'floor'];
  const only = { thornwood: [], hearthvale: ['roof'], derelict: ['floor', 'wall', 'flesh'] };
  for (const name of ['thornwood', 'hearthvale', 'derelict']) {
    assert.deepEqual([...materials(name)].sort(), [...new Set([...every, ...same, ...only[name]])].sort(), name);
  }
  // the words the guide gives as the same lists
  assert.deepEqual(swatches('thornwood', 'wall'), swatches('thornwood', 'stone'));
  assert.deepEqual(swatches('thornwood', 'floor'), swatches('thornwood', 'ground'));
  assert.deepEqual(swatches('hearthvale', 'dirt'), swatches('hearthvale', 'ground'));
  assert.notDeepEqual(swatches('derelict', 'wall'), swatches('derelict', 'stone'));
});

test('the guide\'s example calls work, and the named colours added after review are offered where they fit', () => {
  assert.equal(swatches('thornwood', 'stone', { lead: 'cavern' })[0], PALETTE.thornwood.cavern);
  assert.equal(swatches('thornwood', 'shell')[0], PALETTE.thornwood.thorn);
  const has = (pal, mat, colour) => assert.ok(swatches(pal, mat).includes(PALETTE[pal][colour]), `${pal} ${mat} offers ${colour}`);
  has('thornwood', 'stone', 'cavern');
  has('thornwood', 'sky', 'dusk');
  has('hearthvale', 'leaf', 'pine');
  has('hearthvale', 'stone', 'flagstone');
  has('hearthvale', 'metal', 'rust');
  has('derelict', 'flesh', 'membrane');
  has('derelict', 'haze', 'nebula');
  // the player's cloth is the same blue in all three palettes
  assert.equal(PALETTE.thornwood.hero, PALETTE.derelict.signal);
  assert.equal(swatches('derelict', 'trim')[0], PALETTE.derelict.signal);
});
