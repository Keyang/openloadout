// Finding things (W2-A): the pure helpers behind the results view in app/browse.js.
// The search and filters as address-bar text and back, the style filter that stays, and which results to show.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stateFromQuery, queryFromState, hashFromState, sameState, filtersFor, createStyleMemory, pickResults, resultLine, standInCatalog, STYLE_KEY,
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
  assert.equal(stateFromQuery({ q: 'x'.repeat(500) }).q.length, 120);
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
