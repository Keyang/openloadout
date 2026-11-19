// The studio's drafts on this computer (docs/studio.md section 5, "Autosave"; Contract 14 rule 9; item S9):
// localStorage key loadout-studio-v1 holding { drafts: { <draft>: { definition, savedAt, bagKey? } } }, at most 40
// drafts and 2 MB, everything read back validated before it is drawn, a failed save reported (never swallowed).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrafts, createSaver, draftIdFor, STUDIO_KEY, MAX_DRAFTS, MAX_STORE_BYTES, SAVE_DELAY } from '../../app/studio/drafts.js';
import { studioTemplate } from '../../rigs/studio-templates.js';

function memory() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, map: m };
}
const full = () => ({ getItem: () => null, setItem: () => { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }, removeItem() {} });
const newt = () => ({ ...studioTemplate('four-legs'), id: 'moss-newt', name: 'Moss newt' });

test('the design\'s names and caps', () => {
  assert.equal(STUDIO_KEY, 'loadout-studio-v1');
  assert.equal(MAX_DRAFTS, 40);
  assert.equal(MAX_STORE_BYTES, 2 * 1024 * 1024);
  assert.equal(SAVE_DELAY, 500);
});

test('a draft is put, read back validated, listed and removed', () => {
  const s = memory();
  const d = createDrafts(s, { now: () => 1000 });
  const r = d.put('moss-newt', newt());
  assert.equal(r.ok, true, r.error);
  const raw = JSON.parse(s.getItem(STUDIO_KEY));
  assert.deepEqual(Object.keys(raw.drafts), ['moss-newt']);
  assert.equal(raw.drafts['moss-newt'].savedAt, 1000);
  assert.equal(raw.drafts['moss-newt'].definition.name, 'Moss newt');
  const back = createDrafts(s).get('moss-newt');
  assert.equal(back.definition.name, 'Moss newt');
  assert.equal(back.savedAt, 1000);
  assert.deepEqual(createDrafts(s).list().map((x) => [x.id, x.name]), [['moss-newt', 'Moss newt']]);
  assert.equal(d.remove('moss-newt').ok, true);
  assert.equal(d.get('moss-newt'), null);
  assert.deepEqual(d.list(), []);
});

test('the newest draft is listed first', () => {
  let t = 0;
  const d = createDrafts(memory(), { now: () => ++t });
  d.put('a', { ...newt(), id: 'a', name: 'A' });
  d.put('b', { ...newt(), id: 'b', name: 'B' });
  d.put('a', { ...newt(), id: 'a', name: 'A again' });
  assert.deepEqual(d.list().map((x) => x.id), ['a', 'b']);
});

test('a bag key is kept with the draft', () => {
  const d = createDrafts(memory());
  d.put('a', newt(), { bagKey: 'sprite:moss-newt:1' });
  assert.equal(d.get('a').bagKey, 'sprite:moss-newt:1');
  d.put('a', newt());
  assert.equal(d.get('a').bagKey, 'sprite:moss-newt:1', 'a later save keeps it');
});

test('what is stored is checked before it is drawn: a broken or hostile draft is left out and counted', () => {
  const s = memory();
  const good = newt();
  s.setItem(STUDIO_KEY, JSON.stringify({ drafts: {
    ok: { definition: good, savedAt: 1 },
    bad: { definition: { format: 'loadout-sprite', version: 1, id: 'x' }, savedAt: 2 },
    junk: 'not a draft',
    ['__proto__']: { definition: good, savedAt: 3 },
  } }));
  const d = createDrafts(s);
  assert.deepEqual(d.list().map((x) => x.id), ['ok']);
  assert.equal(d.get('bad'), null);
  assert.equal(d.broken(), 2);
  assert.equal(({}).definition, undefined, 'nothing reached the prototype');
});

// Review S9 issue 1: a store that cannot be read whole is never saved over (app/studio-store.js keeps that promise).
const fiveDrafts = () => {
  const drafts = {};
  for (let i = 0; i < 5; i++) drafts[`d${i}`] = { definition: { ...newt(), id: `d${i}`, name: `D${i}` }, savedAt: i };
  return JSON.stringify({ version: 1, drafts });
};
for (const [what, text] of [
  ['damaged (cut short)', () => fiveDrafts().slice(0, -2)],
  ['not { drafts } (a later version)', () => JSON.stringify({ version: 2, items: { x: 1 } })],
  ['not JSON at all', () => '{not json'],
]) {
  test(`a store that is ${what} is never saved over, and says so`, () => {
    const s = memory();
    const before = text();
    s.setItem(STUDIO_KEY, before);
    const d = createDrafts(s);
    assert.deepEqual(d.list(), []);
    assert.match(d.problem() ?? '', /could not be read/i, 'the page is told');
    const put = d.put('new-one', { ...newt(), id: 'new-one' });
    assert.equal(put.ok, false);
    assert.match(put.error, /not save over|could not be read/i);
    assert.equal(d.remove('d1').ok, false);
    assert.equal(s.getItem(STUDIO_KEY), before, 'what was stored is untouched');
    assert.equal(d.savedText(), before, 'it can be downloaded as it is');
  });
}

test('storage that cannot be read at all is never written, and says so', () => {
  let wrote = false;
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { wrote = true; }, removeItem() {} };
  const d = createDrafts(throwing);
  assert.deepEqual(d.list(), []);
  assert.match(d.problem() ?? '', /could not be read/i);
  assert.equal(d.put('a', newt()).ok, false);
  assert.equal(wrote, false);
});

test('starting afresh clears an unreadable store, and only an unreadable one', () => {
  const s = memory();
  s.setItem(STUDIO_KEY, fiveDrafts());
  const d = createDrafts(s);
  assert.equal(d.startAfresh().ok, false, 'a readable store is never cleared this way');
  assert.equal(d.list().length, 5);
  s.setItem(STUDIO_KEY, fiveDrafts().slice(0, -2));
  assert.equal(d.startAfresh().ok, true);
  assert.equal(d.problem(), null);
  assert.equal(d.put('a', newt()).ok, true);
  assert.deepEqual(d.list().map((x) => x.id), ['a']);
});

test('what the page does not use is carried through every save untouched', () => {
  const s = memory();
  s.setItem(STUDIO_KEY, JSON.stringify({ version: 1, drafts: {
    keep: { definition: newt(), savedAt: 1, later: { field: 7 } },
    'Odd Key': { anything: true },
    damaged: { definition: { format: 'loadout-sprite' }, savedAt: 2 },
  } }));
  const d = createDrafts(s, { now: () => 9 });
  assert.equal(d.put('fresh', { ...newt(), id: 'fresh' }).ok, true);
  assert.equal(d.put('keep', { ...newt(), name: 'Kept' }).ok, true);
  const raw = JSON.parse(s.getItem(STUDIO_KEY)).drafts;
  assert.deepEqual(raw['Odd Key'], { anything: true });
  assert.deepEqual(raw.damaged, { definition: { format: 'loadout-sprite' }, savedAt: 2 });
  assert.deepEqual(raw.keep.later, { field: 7 }, 'a field a later version adds stays');
  assert.equal(raw.keep.definition.name, 'Kept');
  assert.equal(d.list().length, 2);
  assert.equal(d.broken(), 1, 'the damaged one is counted (the odd key is no draft)');
});

test('a failed save waits, is shown, and is written by the next save that works', () => {
  const m = new Map();
  let fail = true;
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { if (fail) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
  const d = createDrafts(s);
  const r = d.put('a', { ...newt(), id: 'a', name: 'Waiting' });
  assert.equal(r.ok, false);
  assert.equal(d.pending(), true);
  assert.equal(d.get('a').definition.name, 'Waiting', 'the page keeps showing it this visit');
  fail = false;
  assert.equal(d.put('b', { ...newt(), id: 'b' }).ok, true);
  assert.equal(d.pending(), false);
  assert.deepEqual(Object.keys(JSON.parse(m.get(STUDIO_KEY)).drafts).sort(), ['a', 'b']);
});

test('a bag key can be forgotten (the bag item was taken out)', () => {
  const d = createDrafts(memory());
  d.put('a', newt(), { bagKey: 'k1' });
  d.put('a', newt(), { bagKey: null });
  assert.equal(d.get('a').bagKey, undefined);
});

test('a failed save is reported in plain words', () => {
  const d = createDrafts(full());
  const r = d.put('a', newt());
  assert.equal(r.ok, false);
  assert.match(r.error, /could not be saved/i);
  assert.match(r.error, /full/i);
  assert.doesNotMatch(r.error, /studio_|console/, 'everyday words, not an agent\'s');
});

test('an invalid definition is refused, not stored', () => {
  const s = memory();
  const r = createDrafts(s).put('a', { format: 'loadout-sprite', version: 1, id: 'Not An Id' });
  assert.equal(r.ok, false);
  assert.equal(s.getItem(STUDIO_KEY), null);
});

test('at most 40 drafts: the 41st is refused with a way out', () => {
  const d = createDrafts(memory());
  for (let i = 0; i < MAX_DRAFTS; i++) assert.equal(d.put(`d${i}`, { ...newt(), id: `d${i}` }).ok, true);
  const r = d.put('one-more', newt());
  assert.equal(r.ok, false);
  assert.match(r.error, /40/);
  assert.equal(d.put('d3', { ...newt(), id: 'd3', name: 'Changed' }).ok, true, 'an existing draft still saves');
});

test('at most 2 MB in all', () => {
  const s = memory();
  // fill the store with other drafts close to the cap by hand, then a save that passes it is refused
  const big = { drafts: {} };
  const one = JSON.stringify({ definition: newt(), savedAt: 1 });
  let n = 0;
  while (JSON.stringify(big).length + one.length < MAX_STORE_BYTES - 2000 && n < 30) big.drafts[`f${n++}`] = { definition: newt(), savedAt: 1 };
  big.drafts.pad = { definition: newt(), savedAt: 1, bagKey: 'x'.repeat(Math.max(0, MAX_STORE_BYTES - JSON.stringify(big).length - 500)) };
  s.setItem(STUDIO_KEY, JSON.stringify(big));
  const r = createDrafts(s).put('new', { ...newt(), blurb: 'y'.repeat(290) });
  assert.equal(r.ok, false);
  assert.match(r.error, /2 MB|space/i);
});

test('draft ids come from the name, lowercase with dashes, and never repeat', () => {
  assert.equal(draftIdFor('Moss newt', []), 'moss-newt');
  assert.equal(draftIdFor('Moss newt', ['moss-newt']), 'moss-newt-2');
  assert.equal(draftIdFor('Moss newt', ['moss-newt', 'moss-newt-2']), 'moss-newt-3');
  assert.equal(draftIdFor('  !!! ', []), 'draft');
  assert.equal(draftIdFor('Ünïcode Bät', []), 'unicode-bat');
  assert.match(draftIdFor('x'.repeat(100), []), /^[a-z][a-z0-9-]{0,39}$/);
});

test('the saver writes 500 ms after the last change, once', () => {
  const timers = [];
  const saved = [];
  const sv = createSaver({ save: (d) => { saved.push(d); return { ok: true }; }, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: (id) => { timers[id - 1].fn = null; } });
  sv.schedule({ n: 1 });
  sv.schedule({ n: 2 });
  assert.equal(timers.at(-1).ms, SAVE_DELAY);
  assert.equal(sv.pending(), true);
  for (const t of timers) t.fn?.();
  assert.deepEqual(saved, [{ n: 2 }]);
  assert.equal(sv.pending(), false);
});

test('flush saves at once (leaving the page), and says what the save said', () => {
  const sv = createSaver({ save: () => ({ ok: false, error: 'full' }), setTimer: () => 1, clearTimer() {} });
  assert.equal(sv.flush(), null, 'nothing waiting');
  sv.schedule({ n: 1 });
  assert.deepEqual(sv.flush(), { ok: false, error: 'full' });
  assert.equal(sv.pending(), false);
});
