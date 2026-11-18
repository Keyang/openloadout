// catalog/schema.js: allowed values, role tree, validateMeta, validateBundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../catalog/schema.js';

const goodSprite = () => ({
  type: 'character', role: 'characters/player', themes: ['fantasy'], gameTypes: ['platformer'], view: 'side',
  words: ['knight', 'hero', 'sword', 'fight', 'warrior', 'armor'], license: 'draft',
});
const goodSound = () => ({
  type: 'sfx', role: 'items/pickup', themes: ['neutral'], gameTypes: ['platformer', 'arcade'],
  words: ['coin', 'gold', 'money', 'collect', 'pickup', 'level up'], license: 'draft',
});
const goodMusic = () => ({
  type: 'music', role: 'music/battle', themes: ['fantasy'], gameTypes: ['turn-based-rpg', 'roguelike-action'],
  words: ['battle', 'fight', 'boss', 'combat', 'loop', 'epic'], license: 'draft',
});

/** expects validateMeta to fail with one message that mentions every fragment */
function rejects(meta, kind, ...fragments) {
  const r = S.validateMeta(meta, kind);
  assert.equal(r.ok, false, `expected an error for ${JSON.stringify(meta)}`);
  assert.ok(r.errors.length >= 1);
  const text = r.errors.join('\n');
  for (const f of fragments) assert.ok(text.includes(f), `error text should mention "${f}", got:\n${text}`);
}

test('exports the lists the site builds filters from', () => {
  for (const k of ['KINDS', 'SPRITE_TYPES', 'SOUND_TYPES', 'MUSIC_TYPES', 'THEMES', 'GAME_TYPES', 'VIEWS', 'LICENSES', 'SPRITE_ROLES', 'SOUND_ROLES', 'ROLE_TOPS']) {
    assert.ok(Array.isArray(S[k]) && S[k].length > 0, `${k} should be a non-empty array`);
  }
  assert.deepEqual(S.KINDS, ['sprite', 'sound', 'music']);
  assert.ok(S.SPRITE_ROLES.includes('characters/player'));
  assert.ok(S.SPRITE_ROLES.includes('interface/icon'));
  assert.ok(!S.SPRITE_ROLES.includes('actions/swing'), 'actions/ has no sprite roles');
  assert.ok(S.SOUND_ROLES.includes('actions/swing'));
  assert.ok(S.SOUND_ROLES.includes('music/battle'));
  assert.deepEqual(S.ROLE_TOPS, ['characters', 'actions', 'items', 'world', 'effects', 'environment', 'interface', 'music']);
  assert.ok(S.THEMES.includes('sci-fi') && S.THEMES.includes('neutral'));
  assert.ok(S.GAME_TYPES.includes('platformer') && S.GAME_TYPES.includes('top-down-rpg'));
  // the three bundle game types chosen by research; the ambiguous "rpg" is gone
  for (const g of ['platformer', 'turn-based-rpg', 'roguelike-action']) assert.ok(S.GAME_TYPES.includes(g), g);
  assert.ok(!S.GAME_TYPES.includes('rpg'), 'rpg was replaced by turn-based-rpg');
  assert.equal(S.WORDS_MIN, 6);
  assert.equal(S.WORDS_MAX, 14);
});

test('every listed value has an everyday label', () => {
  for (const t of S.THEMES) assert.equal(typeof S.labelFor('themes', t), 'string');
  for (const t of S.GAME_TYPES) assert.equal(typeof S.labelFor('gameTypes', t), 'string');
  for (const t of [...S.SPRITE_TYPES, ...S.SOUND_TYPES]) assert.equal(typeof S.labelFor('type', t), 'string');
  for (const r of [...S.SPRITE_ROLES, ...S.SOUND_ROLES]) assert.equal(typeof S.labelFor('role', r), 'string');
  assert.equal(S.labelFor('gameTypes', 'top-down-rpg'), 'Top-down RPG');
  assert.equal(S.labelFor('gameTypes', 'turn-based-rpg'), 'Turn-based RPG');
  assert.equal(S.labelFor('gameTypes', 'roguelike-action'), 'Action roguelike');
  assert.equal(S.labelFor('role', 'characters'), 'Characters');
});

test('rolesFor and typesFor give the allowed values per kind', () => {
  assert.deepEqual(S.rolesFor('sprite'), S.SPRITE_ROLES);
  assert.deepEqual(S.rolesFor('sound'), S.SOUND_ROLES);
  assert.ok(S.rolesFor('music').every((r) => r.startsWith('music/')));
  assert.deepEqual(S.typesFor('sprite'), S.SPRITE_TYPES);
  assert.deepEqual(S.typesFor('music'), S.MUSIC_TYPES);
});

test('accepts good metadata for each kind', () => {
  assert.deepEqual(S.validateMeta(goodSprite(), 'sprite'), { ok: true, errors: [] });
  assert.deepEqual(S.validateMeta(goodSound(), 'sound'), { ok: true, errors: [] });
  assert.deepEqual(S.validateMeta(goodMusic(), 'music'), { ok: true, errors: [] });
  assert.equal(S.validateMeta({ ...goodSprite(), view: 'none' }, 'sprite').ok, true);
  assert.equal(S.validateMeta({ ...goodSound(), type: 'jingle', role: 'interface/reward' }, 'sound').ok, true);
});

test('rejects a missing meta or an unknown kind', () => {
  rejects(undefined, 'sprite', 'meta', 'missing', 'type', 'role', 'words');
  rejects(null, 'sound', 'meta', 'missing');
  rejects(['x'], 'sound', 'meta', 'object');
  rejects(goodSprite(), 'picture', 'kind', 'sprite, sound, music');
});

test('rejects missing and unknown fields', () => {
  const m = goodSprite(); delete m.role;
  rejects(m, 'sprite', 'meta.role', 'missing', 'characters/player');
  const s = goodSound(); delete s.license;
  rejects(s, 'sound', 'meta.license', 'missing', 'draft');
  rejects({ ...goodSprite(), colour: 'red' }, 'sprite', 'meta.colour', 'not a known field', 'words');
  rejects({ ...goodSound(), frames: 8 }, 'sound', 'meta.frames', 'derived by the build');
});

test('rejects a type that does not fit the kind', () => {
  rejects({ ...goodSprite(), type: 'hero' }, 'sprite', 'meta.type', '"hero"', 'character', 'creature');
  rejects({ ...goodSprite(), type: 'sfx' }, 'sprite', 'meta.type', '"sfx"', 'character');
  rejects({ ...goodSound(), type: 'character' }, 'sound', 'meta.type', 'sfx', 'ambience');
  rejects({ ...goodMusic(), type: 'sfx' }, 'music', 'meta.type', 'music', 'jingle');
});

test('rejects a role outside the role tree or from the wrong column', () => {
  rejects({ ...goodSprite(), role: 'characters/hero' }, 'sprite', 'meta.role', '"characters/hero"', 'characters/player', 'characters/enemy');
  rejects({ ...goodSprite(), role: 'heroes/player' }, 'sprite', 'meta.role', '"heroes/player"');
  rejects({ ...goodSprite(), role: 'actions/swing' }, 'sprite', 'meta.role', 'actions/swing', 'sounds only');
  rejects({ ...goodSound(), role: 'world/tile' }, 'sound', 'meta.role', 'world/tile', 'sprites only');
  rejects({ ...goodMusic(), role: 'actions/hit' }, 'music', 'meta.role', 'music/');
  rejects({ ...goodSprite(), role: 'characters' }, 'sprite', 'meta.role', 'characters/player');
});

test('rejects bad themes and game types', () => {
  rejects({ ...goodSprite(), themes: [] }, 'sprite', 'meta.themes', 'at least one');
  rejects({ ...goodSprite(), themes: 'fantasy' }, 'sprite', 'meta.themes', 'list');
  rejects({ ...goodSprite(), themes: ['steampunk'] }, 'sprite', 'meta.themes', '"steampunk"', 'fantasy', 'add it to THEME_LABELS');
  rejects({ ...goodSprite(), themes: ['fantasy', 'fantasy'] }, 'sprite', 'meta.themes', 'twice');
  rejects({ ...goodSprite(), gameTypes: [] }, 'sprite', 'meta.gameTypes', 'at least one');
  rejects({ ...goodSound(), gameTypes: ['moba'] }, 'sound', 'meta.gameTypes', '"moba"', 'platformer', 'add it to GAME_TYPE_LABELS');
  rejects({ ...goodSound(), gameTypes: ['rpg'] }, 'sound', 'meta.gameTypes', '"rpg"', 'turn-based-rpg');
});

test('view is required for sprites and not allowed for audio', () => {
  const m = goodSprite(); delete m.view;
  rejects(m, 'sprite', 'meta.view', 'missing', 'side', 'top-down');
  rejects({ ...goodSprite(), view: 'isometric' }, 'sprite', 'meta.view', '"isometric"', 'side');
  rejects({ ...goodSound(), view: 'side' }, 'sound', 'meta.view', 'sprites only');
});

test('words: 6 to 14 lowercase words or short phrases, no repeats', () => {
  rejects({ ...goodSprite(), words: ['a', 'b', 'c'] }, 'sprite', 'meta.words', '3', 'at least 6');
  rejects({ ...goodSprite(), words: Array.from({ length: 15 }, (_, i) => `w${i}`) }, 'sprite', 'meta.words', '15', 'at most 14');
  rejects({ ...goodSprite(), words: ['Knight', 'hero', 'sword', 'fight', 'warrior', 'armor'] }, 'sprite', 'meta.words', '"Knight"', 'lowercase');
  rejects({ ...goodSprite(), words: ['knight', 'knight', 'sword', 'fight', 'warrior', 'armor'] }, 'sprite', 'meta.words', '"knight"', 'twice');
  rejects({ ...goodSprite(), words: ['knight', '', 'sword', 'fight', 'warrior', 'armor'] }, 'sprite', 'meta.words', 'empty');
  rejects({ ...goodSprite(), words: 'knight hero' }, 'sprite', 'meta.words', 'list');
  assert.equal(S.validateMeta({ ...goodSound(), words: ['1-up', 'level up', 'extra life', 'bonus', 'boost', 'sci-fi'] }, 'sound').ok, true);
});

test('rejects an unknown license', () => {
  rejects({ ...goodSprite(), license: 'mit' }, 'sprite', 'meta.license', '"mit"', 'draft');
});

test('reports every problem at once', () => {
  const r = S.validateMeta({ type: 'x', role: 'y', themes: [], gameTypes: [], view: 'q', words: [], license: 'z' }, 'sprite');
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 7, r.errors.join('\n'));
});

// ---- bundles --------------------------------------------------------------

const known = { sprite: ['knight', 'coin'], sound: ['coin-pickup', 'jump'], music: ['battle-theme'] };
const goodBundle = () => ({
  id: 'tiny-platformer', name: 'Tiny platformer', gameType: 'platformer', blurb: 'A hero and a coin.',
  sprites: ['knight', 'coin'], sounds: ['coin-pickup', 'jump'], music: ['battle-theme'], theme: {},
});
function bundleRejects(b, ids, ...fragments) {
  const r = S.validateBundle(b, ids);
  assert.equal(r.ok, false, `expected an error for ${JSON.stringify(b)}`);
  const text = r.errors.join('\n');
  for (const f of fragments) assert.ok(text.includes(f), `error text should mention "${f}", got:\n${text}`);
}

test('accepts a good bundle', () => {
  assert.deepEqual(S.validateBundle(goodBundle(), known), { ok: true, errors: [] });
  assert.equal(S.validateBundle({ ...goodBundle(), gameType: 'any', level: 'object' }, known).ok, true);
  // a flat list of ids is accepted too (no per-kind check then)
  assert.equal(S.validateBundle(goodBundle(), ['knight', 'coin', 'coin-pickup', 'jump', 'battle-theme']).ok, true);
  assert.equal(S.validateBundle(goodBundle(), new Set(['knight', 'coin', 'coin-pickup', 'jump', 'battle-theme'])).ok, true);
});

test('rejects bad bundles with messages that say what to fix', () => {
  bundleRejects({ ...goodBundle(), id: 'Tiny Platformer' }, known, 'id', 'lowercase');
  const noName = goodBundle(); delete noName.name;
  bundleRejects(noName, known, 'name', 'missing');
  bundleRejects({ ...goodBundle(), gameType: 'moba' }, known, 'gameType', '"moba"', 'platformer');
  bundleRejects({ ...goodBundle(), sprites: ['knight', 'dragon'] }, known, 'sprites', '"dragon"', 'no sprite');
  bundleRejects({ ...goodBundle(), sprites: ['knight', 'jump'] }, known, 'sprites', '"jump"', 'is a sound');
  bundleRejects({ ...goodBundle(), sounds: ['battle-theme'] }, known, 'sounds', '"battle-theme"', 'music');
  bundleRejects({ ...goodBundle(), music: ['jump'] }, known, 'music', '"jump"', 'sound');
  bundleRejects({ ...goodBundle(), sounds: ['jump', 'jump'] }, known, 'sounds', '"jump"', 'twice');
  bundleRejects({ ...goodBundle(), sprites: 'knight' }, known, 'sprites', 'list');
  bundleRejects({ ...goodBundle(), sprites: [], sounds: [], music: [] }, known, 'empty');
  bundleRejects({ ...goodBundle(), theme: 'dark' }, known, 'theme', 'object');
  bundleRejects({ ...goodBundle(), theme: { glow: 1 } }, known, 'theme.glow', 'seed', 'colour');
  bundleRejects({ ...goodBundle(), level: 'mega' }, known, 'level', '"mega"', 'kit');
  bundleRejects({ ...goodBundle(), extra: 1 }, known, 'extra', 'not a known field');
  bundleRejects({ ...goodBundle(), sprites: ['dragon'] }, ['knight'], '"dragon"');
});
