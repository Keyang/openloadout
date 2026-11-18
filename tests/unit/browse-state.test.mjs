// Finding things (W2-A): the pure helpers behind the results view in app/browse.js.
// The search and filters as address-bar text and back, the style filter that stays, and which results to show.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stateFromQuery, queryFromState, hashFromState, sameState, filtersFor, createStyleMemory, pickResults, resultLine, standInCatalog, STYLE_KEY,
  Q_MAX, shelfTitle, smartDownload, smartNote,
} from '../../app/browse.js';
import { matchesFilters } from '../../search/core.js';

const fakeStorage = (start = {}) => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, map: m };
};

test('an empty address gives an empty search', () => {
  const s = stateFromQuery({});
  assert.deepEqual(s, { q: '', kind: null, type: null, role: null, themes: null, gameTypes: null, view: null, bundle: null });
  assert.equal(queryFromState(s), '');
  assert.equal(hashFromState(s), '#/browse');
});

test('the search and every filter survive a trip through the address bar', () => {
  const state = { q: 'level up', kind: 'sound', type: 'sfx', role: 'items/pickup', themes: 'sci-fi', gameTypes: 'turn-based-rpg', view: 'top-down', bundle: 'dungeon-starter' };
  const text = queryFromState(state);
  assert.equal(text, 'q=level+up&kind=sound&type=sfx&role=items%2Fpickup&theme=sci-fi&game=turn-based-rpg&view=top-down&bundle=dungeon-starter');
  assert.deepEqual(stateFromQuery(text), state);
  assert.deepEqual(stateFromQuery(Object.fromEntries(new URLSearchParams(text))), state);
  assert.equal(hashFromState(state), '#/browse?' + text);
});

test('only what is set is written, always in the same order', () => {
  assert.equal(queryFromState({ ...stateFromQuery({}), view: 'side', q: 'coin' }), 'q=coin&view=side');
  assert.equal(queryFromState({ ...stateFromQuery({}), kind: 'music' }), 'kind=music');
});

test('odd characters in a search are kept as typed', () => {
  const q = 'fire & ice? 100% "boss"';
  assert.equal(stateFromQuery(queryFromState({ ...stateFromQuery({}), q })).q, q);
});

test('values the site does not know are dropped, not passed on', () => {
  const s = stateFromQuery({ kind: 'banana', view: 'sideways', type: '<b>x</b>', role: '../etc', theme: 'Fantasy!', game: 'x y', bundle: 'a/b', q: 'ok' });
  assert.deepEqual(s, { ...stateFromQuery({}), q: 'ok' });
  assert.equal(stateFromQuery({ view: 'none' }).view, null, '"no view" is not a style to pick');
  assert.equal(Q_MAX, 120);
  assert.equal(stateFromQuery({ q: 'x'.repeat(500) }).q.length, Q_MAX, 'the page gives its search box the same limit');
  assert.equal(stateFromQuery({ role: 'characters' }).role, 'characters');
  assert.equal(stateFromQuery({ role: 'characters/player' }).role, 'characters/player');
});

test('sameState compares what matters', () => {
  const a = stateFromQuery('q=coin&kind=sound');
  assert.equal(sameState(a, stateFromQuery('kind=sound&q=coin')), true);
  assert.equal(sameState(a, stateFromQuery('q=coin')), false);
});

test('filters for the search library: a chosen view keeps things that have no view', () => {
  const f = filtersFor(stateFromQuery('kind=sprite&role=world&theme=farm&game=platformer&view=top-down&bundle=farm-kit&type=prop'));
  assert.deepEqual(f, { kind: 'sprite', type: 'prop', role: 'world', themes: 'farm', gameTypes: 'platformer', view: ['top-down', 'none', null], bundle: 'farm-kit' });
  assert.deepEqual(filtersFor(stateFromQuery({})), {});
  const style = filtersFor(stateFromQuery('view=top-down'));
  assert.equal(matchesFilters({ kind: 'sprite', view: 'top-down' }, style), true);
  assert.equal(matchesFilters({ kind: 'sprite', view: 'side' }, style), false, 'a side-view sprite does not match a top-down game');
  assert.equal(matchesFilters({ kind: 'sprite', view: 'none' }, style), true, 'an icon fits any view');
  assert.equal(matchesFilters({ kind: 'sound', view: null }, style), true, 'sounds have no view, so the style filter keeps them');
});

// ---- the style filter that stays ----------------------------------------------------

test('the style filter is remembered and applied where the address does not say', () => {
  const storage = fakeStorage();
  const memory = createStyleMemory(storage);
  assert.deepEqual(memory.get(), { view: null, gameTypes: null });

  // the visitor picks a view: it is stored
  memory.remember({ ...stateFromQuery({}), view: 'top-down' });
  assert.deepEqual(JSON.parse(storage.map.get(STYLE_KEY)), { view: 'top-down', gameTypes: null });

  // a later page with no style in its address gets it
  const later = createStyleMemory(storage).apply(stateFromQuery('q=coin'));
  assert.equal(later.view, 'top-down');
  assert.equal(later.q, 'coin');

  // an address that names a style wins, and becomes the remembered one
  const m2 = createStyleMemory(storage);
  const linked = m2.apply(stateFromQuery('view=side&game=platformer'), { fromAddress: true });
  assert.equal(linked.view, 'side');
  assert.equal(linked.gameTypes, 'platformer');
  assert.deepEqual(createStyleMemory(storage).get(), { view: 'side', gameTypes: 'platformer' });
});

test('removing one style choice forgets only that one', () => {
  const storage = fakeStorage();
  const memory = createStyleMemory(storage);
  memory.remember({ ...stateFromQuery({}), view: 'side', gameTypes: 'platformer' });
  memory.forget('view');
  assert.deepEqual(createStyleMemory(storage).get(), { view: null, gameTypes: 'platformer' });
  memory.forget('gameTypes');
  assert.deepEqual(createStyleMemory(storage).get(), { view: null, gameTypes: null });
});

test('the style memory survives broken or unreadable storage', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  const memory = createStyleMemory(broken);
  assert.deepEqual(memory.get(), { view: null, gameTypes: null });
  memory.remember({ ...stateFromQuery({}), view: 'side' });
  assert.equal(memory.get().view, 'side', 'kept for this visit');
  assert.equal(memory.apply(stateFromQuery({})).view, 'side');

  const junk = createStyleMemory(fakeStorage({ [STYLE_KEY]: '{"view":"upside-down","gameTypes":42}' }));
  assert.deepEqual(junk.get(), { view: null, gameTypes: null });
  assert.deepEqual(createStyleMemory(fakeStorage({ [STYLE_KEY]: 'not json' })).get(), { view: null, gameTypes: null });
});

// ---- which results to show ---------------------------------------------------------------

test('results come in the best-known order, and nothing the words found is dropped', () => {
  // `direct` is what the typed words match, there at once; `ranked` is the better ordering that may follow
  assert.deepEqual(pickResults({ ranked: ['a', 'b', 'c'], direct: ['a', 'b', 'c'] }), ['a', 'b', 'c']);
  assert.deepEqual(pickResults({ ranked: ['b', 'a', 'c'], direct: ['a', 'b', 'c'] }), ['b', 'a', 'c']);
  assert.deepEqual(pickResults({ ranked: ['b'], direct: ['a', 'b'] }), ['b', 'a']);
  assert.deepEqual(pickResults({ ranked: [], direct: ['a', 'b'] }), ['a', 'b']);
});

test('things matched by meaning alone are results too, in their ranked place', () => {
  assert.deepEqual(pickResults({ ranked: ['m1', 'a', 'm2', 'b'], direct: ['a', 'b', 'c'] }), ['m1', 'a', 'm2', 'b', 'c']);
  assert.deepEqual(pickResults({ ranked: ['cat'], direct: [] }), ['cat']);
  assert.deepEqual(pickResults({ ranked: [], direct: [] }), []);
  assert.deepEqual(pickResults({ ranked: ['a', 'a', 'b'], direct: ['b'] }), ['a', 'b'], 'an id is listed once');
});

test('the line above the results says how many there are, in plain words', () => {
  const none = stateFromQuery({});
  assert.equal(resultLine(27, none), '27 results');
  assert.equal(resultLine(1, none), '1 result');
  assert.equal(resultLine(3, { ...none, q: 'money' }), '3 results for "money"');
  assert.equal(resultLine(0, { ...none, q: 'zzz' }), 'Nothing matches "zzz"');
  assert.equal(resultLine(0, { ...none, kind: 'music', view: 'side' }), 'Nothing matches these filters');
  assert.equal(resultLine(0, { ...none, q: '   ' }), 'Nothing here yet');
});

// ---- the stand-in catalogue switch (tests only) --------------------------------------------------

test('a stand-in catalogue is honoured only on a developer machine, and only for a plain path in the project', () => {
  const at = (hostname, search) => standInCatalog({ hostname, search });
  assert.equal(at('localhost', '?catalog=tests/fixtures/browse/catalog.json'), 'tests/fixtures/browse/catalog.json');
  assert.equal(at('127.0.0.1', '?catalog=tests/fixtures/search/catalog.json'), 'tests/fixtures/search/catalog.json');
  assert.equal(at('loadout.example.com', '?catalog=tests/fixtures/browse/catalog.json'), null, 'never on a real site');
  assert.equal(at('localhost.example.com', '?catalog=a.json'), null);
  assert.equal(at('localhost', '?catalog=https://evil.example/x.json'), null);
  assert.equal(at('localhost', '?catalog=//evil.example/x.json'), null);
  assert.equal(at('localhost', '?catalog=../../secret.json'), null);
  assert.equal(at('localhost', '?catalog=a/../../b.json'), null);
  assert.equal(at('localhost', '?catalog=notes.txt'), null);
  assert.equal(at('localhost', ''), null);
  assert.equal(standInCatalog(null), null);
});

// ---- words on the page ----------------------------------------------------------------------------

test('a long search is quoted short, so the line above the results stays readable', () => {
  const none = stateFromQuery({});
  const long = 'supercalifragilisticexpialidocious'.repeat(4);
  const line = resultLine(0, { ...none, q: long });
  assert.equal(line, `Nothing matches "${long.slice(0, 40)}…"`);
  assert.equal(resultLine(2, { ...none, q: long }), `2 results for "${long.slice(0, 40)}…"`);
  assert.equal(resultLine(2, { ...none, q: 'x'.repeat(40) }), `2 results for "${'x'.repeat(40)}"`, 'forty characters still fit');
});

test('the heading above the list only says "Everything" when it is everything', () => {
  const none = stateFromQuery({});
  assert.equal(shelfTitle(none), 'Everything');
  assert.equal(shelfTitle({ ...none, view: 'side' }), 'Everything that fits your game', 'a remembered style hides some assets');
  assert.equal(shelfTitle({ ...none, gameTypes: 'platformer' }), 'Everything that fits your game');
  assert.equal(shelfTitle({ ...none, q: 'coin' }), 'Results');
  assert.equal(shelfTitle({ ...none, kind: 'sound', view: 'side' }), 'Results');
  assert.equal(shelfTitle({ ...none, q: '   ' }), 'Everything');
});

// ---- smarter search: how big the download is, and what the page says about it ------------------------

const manifest = {
  model: 'Some/model', meaning: true, bytes: 40_000_000,
  files: [
    { to: 'sqlite/index.mjs', bytes: 600_000 }, { to: 'sqlite/sqlite3.wasm', bytes: 900_000 },
    { to: 'transformers/transformers.min.js', bytes: 600_000 }, { to: 'ort/ort.mjs', bytes: 20_000 }, { to: 'ort/ort.wasm', bytes: 14_300_000 },
    { to: 'models/Some/model/config.json', bytes: 700 }, { to: 'models/Some/model/onnx/model_quantized.onnx', bytes: 23_000_000 },
  ],
};

test('the size of the smarter-search download comes from the vendor list, without what every visitor already gets', () => {
  const d = smartDownload(manifest, 'vendor/');
  assert.equal(d.bytes, 600_000 + 20_000 + 14_300_000 + 700 + 23_000_000);
  assert.deepEqual(d.files.map((f) => f.url), [
    'vendor/transformers/transformers.min.js', 'vendor/ort/ort.mjs', 'vendor/ort/ort.wasm', 'vendor/models/Some/model/config.json', 'vendor/models/Some/model/onnx/model_quantized.onnx',
  ]);
  // a copy of the site built without the model has nothing to offer
  assert.deepEqual(smartDownload({ model: null, meaning: false, files: manifest.files.slice(0, 2) }, 'vendor/'), { bytes: 0, files: [] });
  assert.deepEqual(smartDownload(null, 'vendor/'), { bytes: 0, files: [] });
  assert.deepEqual(smartDownload({ files: 'nonsense' }, 'vendor/'), { bytes: 0, files: [] });
});

test('the line under the switch: the size before, how much has arrived during, and plain words after', () => {
  const bytes = 37_920_700;
  assert.equal(smartNote({ state: 'off', bytes, got: 0 }), 'Understands descriptions like "something for when the player dies". Downloads about 38 MB once.');
  assert.equal(smartNote({ state: 'off', bytes: 0, got: 0 }), 'Understands descriptions like "something for when the player dies".', 'no number is made up');
  assert.equal(smartNote({ state: 'loading', bytes, got: 0 }), 'Downloading: 0 of 38 MB');
  assert.equal(smartNote({ state: 'loading', bytes, got: 12_400_000 }), 'Downloading: 12 of 38 MB');
  assert.equal(smartNote({ state: 'loading', bytes, got: bytes }), 'Getting smarter search ready…');
  assert.equal(smartNote({ state: 'loading', bytes: 0, got: 0 }), 'Getting smarter search ready…');
  assert.equal(smartNote({ state: 'ready', bytes, got: bytes }), 'On. Describe what you need in your own words.');
  assert.equal(smartNote({ state: 'failed', bytes, got: 3 }), 'Smarter search could not be loaded, so it is switched off. Normal search still works.');
  for (const state of ['off', 'loading', 'ready', 'failed']) assert.doesNotMatch(smartNote({ state, bytes, got: 1 }), /model|index|query|vendor/i);
});
