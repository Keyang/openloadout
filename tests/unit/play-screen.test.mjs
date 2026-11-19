// The playground on one screen (docs/playground-tray-workbench.md, section 1): level.js makes a level the size of the
// picture (makeLevel's `screen` option), and world.js puts every thing on its places and shows a chosen clip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLevel, spreadOrder, UNIT } from '../../app/play/level.js';
import { createWorld, step, showClip, startCount, spawn } from '../../app/play/world.js';
import { makeKind } from '../../app/play/kinds.js';

const FULL_SIDE = { ground: 'g', second: 's', slopes: 'g', thins: ['p'], stacks: ['l', 'v'], pool: 'w', fall: 'f', interiors: [{ floor: 'k', block: 'c', window: 'window', battlement: 'battlement' }] };

test('spreadOrder: every index once, the first ones far apart', () => {
  for (const n of [1, 2, 5, 13, 32]) {
    const order = spreadOrder(n);
    assert.deepEqual([...order].sort((a, b) => a - b), [...Array(n).keys()]);
  }
  const o = spreadOrder(16);
  assert.ok(Math.abs(o[0] - o[1]) >= 4, 'the first two are a long way apart');
});

for (const [cols, rows] of [[8, 6], [11, 9], [16, 11], [21, 18], [12, 13]]) {
  test(`side view, one screen ${cols} x ${rows}: the level is the size asked for, on its ground, with places inside the edges`, () => {
    for (const f of [{}, FULL_SIDE, { ground: 'g', strip: true }]) {
      const L = makeLevel('side', { ...f, screen: { cols, rows } });
      assert.equal(L.cols, cols); assert.equal(L.rows, rows);
      assert.equal(L.width, cols * UNIT);
      assert.equal(L.groundY, (rows - 2) * UNIT, 'the ground is the two bottom rows');
      assert.ok(L.screen);
      assert.ok(L.spots.all.length >= cols - 3, `${L.spots.all.length} places`);
      for (const s of L.spots.all) {
        assert.ok(s.x >= L.inner.x0 && s.x <= L.inner.x1, 'no place in the outermost columns');
        assert.ok(s.y > 0 && s.y <= L.groundY + UNIT, 'a place is on something');
      }
      // nothing solid in the two top rows: nothing hangs from the top of the picture
      for (const r of [0, 1]) assert.ok(L.map[r].every((ch) => ch === '.'), `row ${r} is sky`);
      assert.ok(!L.post && !L.cliff, 'no far end: the whole level is in view');
    }
  });
}

test('side view, one screen: a bag with everything gets the mound, the pool, the waterfall, the ladders and platforms', () => {
  const L = makeLevel('side', { ...FULL_SIDE, screen: { cols: 21, rows: 12 } });
  const text = L.map.map((r) => r.join('')).join('\n');
  for (const ch of ['/', '\\', '~', 'V', '|', '=']) assert.ok(text.includes(ch), `has ${ch}\n${text}`);
  assert.ok(L.wet.size > 0);
  assert.ok(L.thins.length >= 3, 'platforms to jump to');
});

test('side view, one screen: platforms are two rows apart, so each can be jumped to from the one under it', () => {
  const L = makeLevel('side', { screen: { cols: 16, rows: 11 } });
  const rowsWith = [...new Set(L.thins.map((p) => p.r))].sort((a, b) => b - a);
  assert.equal(rowsWith[0], L.rows - 4);
  for (let i = 1; i < rowsWith.length; i++) assert.equal(rowsWith[i - 1] - rowsWith[i], 2);
});

test('top-down, one screen: a walled room the size asked for, every free cell a place', () => {
  const L = makeLevel('top', { grounds: [null, null], holes: [null, null], floors: [null, null], fence: { h: 'a', v: 'b', post: 'c' }, screen: { cols: 16, rows: 11 } });
  assert.equal(L.cols, 16); assert.equal(L.rows, 11);
  assert.ok(L.map[0].every((c) => c === 'W') && L.map.at(-1).every((c) => c === 'W'));
  assert.ok(L.map.every((r) => r[0] === 'W' && r.at(-1) === 'W'));
  assert.ok(L.spots.all.length > 40);
  const small = makeLevel('top', { screen: { cols: 8, rows: 5 } });
  assert.equal(small.rows, 7, 'a room is at least seven rows: walls round a floor');
});

test('the long level is unchanged when no screen is asked for', () => {
  const L = makeLevel('side', {});
  assert.ok(!L.screen && L.post && L.cliff);
  assert.ok(!L.spots.all);
});

// ---- world.js on a one-screen level ---------------------------------------------------------------------

const sprite = (key, role, clips = { idle: { frames: 2, fps: 6, loop: true }, walk: { frames: 4, fps: 8, loop: true }, hurt: { frames: 3, fps: 10, loop: false } }) => makeKind({
  key, id: key, role, size: [24, 24], pivot: [12, 23], clips, rest: 'idle', box: { l: 8, r: 8, t: 20, b: 0 },
});

test('a crowded one-screen scene: every thing has a place inside the picture', () => {
  const L = makeLevel('side', { screen: { cols: 12, rows: 9 } });
  const kinds = [sprite('hero', 'player'), ...Array.from({ length: 30 }, (_, i) => sprite(`k${i}`, i % 3 ? 'prop' : 'creature'))];
  const w = createWorld({ mode: 'side', level: L, kinds, player: 'hero' });
  assert.equal(w.things.length, 30);
  assert.equal(startCount(kinds, 'hero'), 30);
  for (const t of w.things) assert.ok(t.x - 8 >= L.inner.x0 - 0.5 && t.x + 8 <= L.inner.x1 + 0.5, `${t.kind} at ${t.x} is inside the picture`);
  // creatures wander inside the picture too
  for (let i = 0; i < 600; i++) step(w, {}, 1 / 30);
  for (const t of w.things.filter((x) => x.role === 'creature')) assert.ok(t.x >= L.inner.x0 && t.x <= L.inner.x1, `${t.kind} stays in view (${t.x})`);
});

test('start counts: one of each pickup when asked', () => {
  const kinds = [sprite('c', 'pickup'), sprite('g', 'pickup'), sprite('s', 'creature')];
  assert.equal(startCount(kinds), 7);
  assert.equal(startCount(kinds, null, { pickup: 1 }), 3);
  const w = createWorld({ mode: 'side', level: makeLevel('side', { screen: { cols: 12, rows: 9 } }), kinds, start: { pickup: 1 } });
  assert.equal(w.things.filter((t) => t.role === 'pickup').length, 2);
});

test('showClip: the things of a kind play that clip again and again, then go back to their own ways', () => {
  const L = makeLevel('side', { screen: { cols: 12, rows: 9 } });
  const w = createWorld({ mode: 'side', level: L, kinds: [sprite('slime', 'creature')] });
  assert.equal(showClip(w, 'slime', 'nope'), false);
  assert.equal(showClip(w, 'slime', 'hurt'), true);
  const t = w.things[0], x = t.x;
  for (let i = 0; i < 90; i++) step(w, {}, 1 / 30);
  assert.equal(t.anim.clip, 'hurt', 'still the chosen clip after three seconds');
  assert.equal(t.x, x, 'it stays where it is while it shows the clip');
  spawn(w, 'slime');
  step(w, {}, 1 / 30);
  assert.ok(w.things.every((x2) => x2.anim.clip === 'hurt'), 'a new one shows it too');
  showClip(w, 'slime', null);
  assert.equal(t.anim.clip, 'idle');
  for (let i = 0; i < 90; i++) step(w, {}, 1 / 30);
  assert.ok(['idle', 'walk'].includes(t.anim.clip));
});

test('input.play: the player plays one of its clips once, by its name, then stands again', () => {
  const L = makeLevel('side', { screen: { cols: 12, rows: 9 } });
  const w = createWorld({ mode: 'side', level: L, kinds: [sprite('hero', 'player')], player: 'hero' });
  step(w, { play: 'hurt' }, 1 / 30);
  assert.equal(w.player.anim.clip, 'hurt');
  for (let i = 0; i < 30; i++) step(w, {}, 1 / 30);
  assert.equal(w.player.anim.clip, 'idle');
});
