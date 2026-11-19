// Studio item F2: library bodies are dispatched through a registry (docs/studio.md 2.3, "Library bodies: one module
// each"; docs/framework-api.md, "Studio definitions: library bodies"). A library body is one module that exports a
// descriptor made by engine/library-body.js defineLibraryBody(); engine/library-bodies.js lists the modules, one
// `export * from` line each; catalog/studio-schema.js and engine/data-sprite.js look a definition's body.library up in
// it and never name a body themselves. The side-view person (rigs/body-humanoid.js) is the first entry and must keep
// every table the schema exported before (FIGURE_SETTINGS, FIGURE_COLOURS, FIGURE_SOCKETS, LIBRARY_PARTS, ...).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as K from '../../engine/library-body.js';
import * as S from '../../catalog/studio-schema.js';
import * as LISTED from '../../engine/library-bodies.js';
import { HUMANOID_BODY } from '../../rigs/body-humanoid.js';
import * as HS from '../../rigs/humanoid-studio.js';
import * as H from '../../rigs/humanoid.js';
import { MOVES } from '../../rigs/humanoid-figure.js';
import { FIGURE_BLOCKS } from '../../engine/data-rules.js';

const LIST_FILE = new URL('../../engine/library-bodies.js', import.meta.url);

/** The smallest descriptor defineLibraryBody takes, with a field or two changed. */
const minimal = (more = {}) => ({
  id: 'mini', label: 'Mini', view: 'none', sizes: [[16, 16]], figure: { look: { colour: K.FIGURE_FIELD.colour } },
  draw() {}, socketsAt: () => ({}), ...more,
});
const throwsWith = (fn, re) => assert.throws(fn, (e) => { assert.match(String(e.message), re); return true; });

test('F2 kit: engine/library-body.js exports the interface, the field kinds and the registry maker', () => {
  for (const f of ['defineLibraryBody', 'libraryBodies', 'isLibraryBody', 'isLibraryBodies', 'settingsOfSpec', 'coloursOfSpec', 'libraryFrame', 'nudgeSurface']) assert.equal(typeof K[f], 'function', f);
  for (const k of ['FIGURE_FIELD', 'KEY_KINDS', 'LIBRARY_BODY_NAME', 'LIBRARY_BODY_INTERFACE']) assert.ok(K[k] !== undefined, k);
  assert.deepEqual([...K.KEY_KINDS], ['px', 'angle', 'share', 'signed', 'count', 'point', 'arm', 'flag', 'word']);
  for (const ok of ['humanoid', 'topdown', 'creature:hive-bug', 'creature:mech-walker']) assert.ok(K.LIBRARY_BODY_NAME.test(ok), ok);
  for (const bad of ['Humanoid', 'creature:', ':x', 'a:b:c', 'x'.repeat(31), 'top down']) assert.ok(!K.LIBRARY_BODY_NAME.test(bad), bad);
});

test('F2 kit: defineLibraryBody fills the defaults, freezes, and derives settings and colours from the figure spec', () => {
  const F = K.FIGURE_FIELD;
  const b = K.defineLibraryBody(minimal({
    figure: { mood: F.word(['calm', 'cross']), look: { colour: F.colour, size: F.number(0.5, 2), shiny: F.flag }, moves: F.map('clip name', 'pose', ['idle']) },
    keyFields: { bob: 'px', mood: { kind: 'word', values: ['calm', 'cross'], none: true }, beat: { kind: 'count', min: 0, max: 3 } },
  }));
  assert.ok(Object.isFrozen(b) && K.isLibraryBody(b));
  assert.deepEqual(b.settings, { mood: { kind: 'word', values: ['calm', 'cross'] }, 'look.size': { kind: 'number', min: 0.5, max: 2 } });
  assert.deepEqual([...b.colours], ['look.colour']);
  assert.deepEqual(b.keyFields.bob, { kind: 'px' });
  assert.deepEqual(b.keyFields.beat, { kind: 'count', min: 0, max: 3 });
  assert.equal(b.keyFields.mood.none, true);
  for (const k of ['parts', 'blocks', 'poses']) assert.deepEqual([...b[k]], [], k);
  assert.deepEqual({ ...b.aliases }, {});
  assert.deepEqual({ ...b.pivots }, {});
  assert.deepEqual(b.socketNames({}), []);
  assert.equal(b.bake, null);
});

test('F2 kit: defineLibraryBody refuses a descriptor that would break the schema or the drawing, naming the field', () => {
  throwsWith(() => K.defineLibraryBody(minimal({ id: 'Bad Name' })), /id/);
  throwsWith(() => K.defineLibraryBody(minimal({ view: 'sideways' })), /view/);
  throwsWith(() => K.defineLibraryBody(minimal({ sizes: [] })), /sizes/);
  throwsWith(() => K.defineLibraryBody(minimal({ sizes: [[200, 64]] })), /sizes/);
  throwsWith(() => K.defineLibraryBody(minimal({ sizes: [[31.5, 32]] })), /sizes/);
  throwsWith(() => K.defineLibraryBody(minimal({ pivots: { '32x32': [1, 1] } })), /pivots/);
  throwsWith(() => K.defineLibraryBody(minimal({ draw: undefined })), /draw/);
  throwsWith(() => K.defineLibraryBody(minimal({ socketsAt: 'hand' })), /socketsAt/);
  throwsWith(() => K.defineLibraryBody(minimal({ figure: { look: { colour: 'paint' } } })), /figure/);
  throwsWith(() => K.defineLibraryBody(minimal({ keyFields: { t: 'share' } })), /keyFields/);
  throwsWith(() => K.defineLibraryBody(minimal({ keyFields: { wobble: 'jelly' } })), /keyFields/);
  throwsWith(() => K.defineLibraryBody(minimal({ aliases: { size: 'look.nothing' } })), /aliases/);
  throwsWith(() => K.defineLibraryBody(minimal({ colours: ['look.nothing'] })), /colours/);
  throwsWith(() => K.defineLibraryBody(minimal({ parts: ['Hat'] })), /parts/);
});

test('F2 kit: libraryBodies takes descriptors, lists of them and module namespaces; a name twice is refused', () => {
  const a = K.defineLibraryBody(minimal({ id: 'a' })), b = K.defineLibraryBody(minimal({ id: 'creature:b' }));
  const r = K.libraryBodies({ A: a, other: 42, LIST: [b] });
  assert.ok(K.isLibraryBodies(r) && Object.isFrozen(r));
  assert.deepEqual([...r.names], ['a', 'creature:b']);
  assert.equal(r.get('creature:b'), b);
  assert.equal(r.get('nope'), null);
  assert.equal(r.get('constructor'), null, 'a name every object has is not a body');
  assert.equal(r.has('a'), true);
  throwsWith(() => K.libraryBodies(a, [K.defineLibraryBody(minimal({ id: 'a', label: 'Another' }))]), /twice/);
  assert.deepEqual([...K.libraryBodies(a, [a]).names], ['a'], 'the same descriptor listed twice is one body');
  assert.equal(K.isLibraryBodies({ names: [], get: () => null }), false, 'only libraryBodies() makes a registry');
});

test('F2 registry: engine/library-bodies.js is one `export * from` line per body module, and every body each module exports is registered', async () => {
  const lines = fs.readFileSync(LIST_FILE, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
  const re = /^export \* from '(\.\.\/rigs\/body-[a-z0-9-]+\.js)';$/;
  for (const l of lines) assert.match(l, re, `engine/library-bodies.js holds comments and \`export * from '../rigs/body-<name>.js';\` lines only; got: ${l}`);
  const reg = S.LIBRARY_REGISTRY;
  let count = 0;
  for (const l of lines) {
    const mod = await import(new URL(re.exec(l)[1], LIST_FILE));
    const own = Object.values(mod).flatMap((v) => (Array.isArray(v) ? v : [v])).filter(K.isLibraryBody);
    assert.ok(own.length > 0, `${l}: the module exports no body made by defineLibraryBody`);
    for (const body of own) { assert.equal(reg.get(body.id), body, `${body.id} is not registered: two modules export the same name?`); count++; }
  }
  assert.equal(reg.names.length, count, 'every registered body comes from a listed module');
  assert.ok(Object.keys(LISTED).length >= 1);
});

test('F2 registry: the schema lists what the registry holds; the side-view person is "humanoid", 64 by 64 at the rig\'s pivot', () => {
  assert.ok(S.LIBRARY_BODIES.includes('humanoid'));
  assert.deepEqual([...S.LIBRARY_BODIES], [...S.LIBRARY_REGISTRY.names]);
  assert.equal(S.libraryBody('humanoid'), HUMANOID_BODY);
  assert.equal(S.libraryBody('nobody'), null);
  assert.equal(HUMANOID_BODY.view, 'side');
  assert.deepEqual(HUMANOID_BODY.sizes.map((s) => [...s]), [H.SIZE]);
  assert.deepEqual([...HUMANOID_BODY.pivots['64x64']], [...H.PIVOT]);
  assert.deepEqual([...S.LIBRARY_SIZE], [64, 64]);
  assert.deepEqual([...S.LIBRARY_PIVOT], [...H.PIVOT]);
});

test('F2 registry: every registered body has frame sizes of the style guide, a known view, and the drawing functions', () => {
  const sizes = new Set(S.FRAME_SIZES.map(([w, h]) => `${w}x${h}`));
  for (const name of S.LIBRARY_REGISTRY.names) {
    const b = S.libraryBody(name);
    assert.ok(S.STUDIO_VIEWS.includes(b.view), `${name}: view`);
    for (const [w, h] of b.sizes) assert.ok(sizes.has(`${w}x${h}`), `${name}: ${w}x${h} is not one of the style guide's frame sizes (FRAME_SIZES)`);
    for (const k of Object.keys(b.pivots)) assert.ok(b.sizes.some(([w, h]) => `${w}x${h}` === k), `${name}: pivot for ${k}, which is not one of its sizes`);
    assert.equal(typeof b.draw, 'function');
    assert.equal(typeof b.socketsAt, 'function');
    for (const p of b.parts) assert.ok(S.ID_PATTERN.test(p), `${name}: part ${p}`);
    for (const s of b.socketNames({})) assert.ok(S.SOCKET_NAMES.includes(s) || /^[a-z][a-zA-Z0-9-]{0,39}$/.test(s), `${name}: socket ${s}`);
  }
});

test('F2 humanoid: the tables the schema exported before are the humanoid body\'s, unchanged', () => {
  const B = HUMANOID_BODY;
  assert.equal(S.FIGURE_SETTINGS, B.settings);
  assert.equal(S.FIGURE_COLOURS, B.colours);
  assert.deepEqual([...S.FIGURE_SOCKETS], ['hand', 'offhand', 'head', 'back', 'feet']);
  assert.deepEqual(B.socketNames({}), ['hand', 'offhand', 'head', 'back', 'feet']);
  assert.deepEqual(B.socketNames({ thrown: {} }), ['hand', 'offhand', 'head', 'back', 'feet', 'muzzle']);
  assert.deepEqual([...S.LIBRARY_PARTS], ['held', 'headgear', 'mask', 'scarf', 'belt', 'coat', 'pack', 'cape']);
  assert.deepEqual([...B.parts], [...S.LIBRARY_PARTS]);
  assert.deepEqual([...S.LIBRARY_BODY_FIELDS], ['height', 'build', 'head']);
  assert.deepEqual({ ...B.aliases }, { height: 'body.height', build: 'body.build', head: 'body.head' });
  assert.deepEqual([...B.blocks], [...FIGURE_BLOCKS]);
  assert.deepEqual(Object.keys(S.FIGURE_SETTINGS).slice(0, 4), ['stance', 'body.height', 'body.build', 'body.head']);
  assert.deepEqual(S.FIGURE_SETTINGS['held.length'], { kind: 'number', min: 0.25, max: 3 });
  assert.ok(S.FIGURE_SETTINGS['headgear.kind'].values.includes('plumed helmet'));
  assert.ok(S.FIGURE_COLOURS.includes('look.top') && S.FIGURE_COLOURS.includes('loot.glint'));
  assert.deepEqual(Object.keys(B.keyFields), [...Object.keys(S.HUMANOID_POSE_FIELDS), ...Object.keys(S.HUMANOID_MOVE_FIELDS)]);
  for (const [f, spec] of Object.entries(B.keyFields)) {
    const own = { ...S.HUMANOID_POSE_FIELDS, ...S.HUMANOID_MOVE_FIELDS }[f];
    assert.equal(spec.kind, own, f);
    if (HS.POSE_FIELDS[f]?.none) assert.equal(spec.none, true, f);
  }
  assert.deepEqual([...B.poses], [...H.POSES, ...MOVES]);
  assert.equal(typeof B.bake, 'function');
});

test('F2 humanoid: bake through the body is the rig\'s bakeClip on the stored figure', () => {
  const def = HS.hero();
  const viaBody = HUMANOID_BODY.bake(def, 'walk', { frames: 8 });
  assert.deepEqual(viaBody, HS.bakeClip(def.body.figure, 'walk', { frames: 8 }));
  assert.equal(viaBody.keys.length, 8);
});
