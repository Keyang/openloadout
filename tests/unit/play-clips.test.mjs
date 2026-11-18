// Playground: which clip plays for each state, by the names of docs/style-guide.md sections 4 and 5.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickClip, lookupClip, restClip, extraActions, nextInOrder, clipSpeed, STATES } from '../../app/play/clips.js';

const HERO = ['idle', 'walk', 'run', 'jump', 'attack', 'hurt', 'die'];
const MAGE = ['idle', 'walk', 'run', 'jump', 'cast', 'hurt', 'die'];
const BLOB = ['idle', 'hop', 'attack', 'hurt', 'die'];
const BAT = ['idle', 'fly', 'attack', 'hurt'];
// section 5, level "Full": three drawn directions, the fourth mirrored; undirected clips are used for every direction
const FULL = ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side', 'attack_down', 'attack_up', 'attack_side', 'hurt', 'die'];
const WALKER = ['idle_down', 'idle_up', 'idle_side', 'walk_down', 'walk_up', 'walk_side'];
const side = (names, state, facing = 1, view = 'side') => pickClip(names, state, { mode: 'side', facing, view });
const top = (names, state, dir, facing = 1, view = 'top-down') => pickClip(names, state, { mode: 'top', dir, facing, view });
const is = (r, clip, flip = false) => assert.deepEqual(r, { clip, flip, hold: false });

test('side view: each state has the clip of section 4, mirrored when facing left', () => {
  for (const [state, clip] of [['idle', 'idle'], ['walk', 'walk'], ['run', 'run'], ['jump', 'jump'], ['action', 'attack'], ['hurt', 'hurt'], ['die', 'die']]) {
    is(side(HERO, state), clip);
    assert.equal(side(HERO, state, -1).flip, true, state + ' facing left');
  }
  assert.equal(side(MAGE, 'action').clip, 'cast');
  assert.equal(side(['idle', 'walk', 'shoot', 'cast'], 'action').clip, 'shoot', 'attack, then shoot, then cast');
  assert.equal(side(['idle', 'block', 'dodge'], 'block').clip, 'block');
  assert.equal(side(['idle', 'block', 'dodge'], 'dodge').clip, 'dodge');
  assert.equal(side(['idle', 'talk'], 'talk').clip, 'talk');
});

test('side view: things that hop or fly instead of walking, and other fallbacks', () => {
  assert.equal(side(BLOB, 'walk').clip, 'hop');
  assert.equal(side(BLOB, 'run').clip, 'hop');
  assert.equal(side(BLOB, 'jump').clip, 'hop');
  assert.equal(side(BAT, 'walk').clip, 'fly');
  assert.equal(side(['idle', 'walk'], 'run').clip, 'walk');
  assert.equal(side(['idle', 'walk'], 'jump').clip, 'idle');
  assert.equal(side(['idle'], 'walk').clip, 'idle');
  assert.equal(pickClip(['spin'], 'idle', { preview: 'spin' }).clip, 'spin', 'no idle: the preview clip');
  assert.equal(pickClip(['closed', 'open'], 'idle', {}).clip, 'closed', 'no idle and no preview: the first clip');
  for (const state of ['action', 'hurt', 'die', 'block', 'dodge', 'talk', 'collect', 'hit', 'break']) assert.equal(side(['idle', 'walk'], state), null, state + ': nothing to play');
});

test('top-down: three directions are drawn and left is the side clip mirrored (section 5)', () => {
  is(top(FULL, 'walk', 'down'), 'walk_down');
  is(top(FULL, 'walk', 'up'), 'walk_up');
  is(top(FULL, 'walk', 'right'), 'walk_side');
  is(top(FULL, 'walk', 'left'), 'walk_side', true);
  is(top(FULL, 'idle', 'up'), 'idle_up');
  is(top(FULL, 'idle', 'left'), 'idle_side', true);
  is(top(FULL, 'action', 'up'), 'attack_up');
  is(top(FULL, 'action', 'left'), 'attack_side', true);
});

test('top-down: the look-up order is action_direction, action_down, action, idle_down', () => {
  is(top(FULL, 'hurt', 'up', -1), 'hurt');                         // an undirected clip is drawn facing down: used as it is, never mirrored
  is(top(FULL, 'die', 'left', -1), 'die');
  is(top(['idle_down', 'walk_down', 'walk_side'], 'walk', 'up'), 'walk_down');
  is(top(['idle_down', 'walk_down'], 'walk', 'left'), 'walk_down');
  is(top(['idle_down', 'idle_side', 'cast'], 'action', 'left'), 'cast');
  is(top(WALKER, 'run', 'up'), 'walk_up');                         // no run clips: the walk clips
  is(top(['idle_down', 'idle_up'], 'walk', 'up'), 'idle_up');      // no walk at all: idle, the same way
  is(top(['idle_down', 'spin'], 'jump', 'left'), 'idle_down');     // the last resort is idle_down
  assert.equal(top(WALKER, 'action', 'up'), null);
  assert.equal(top(WALKER, 'die', 'up'), null);
});

test('top-down: a sprite with no direction clips uses its plain clips', () => {
  // a blob or a drone looks the same from every side: nothing is mirrored
  is(top(BLOB, 'walk', 'left', -1), 'hop');
  is(top(BLOB, 'idle', 'up', -1), 'idle');
  // a side-view sprite in a top-down scene faces right, so it is mirrored to face left
  is(top(HERO, 'walk', 'left', -1, 'side'), 'walk', true);
  is(top(HERO, 'walk', 'up', -1, 'side'), 'walk', true);
  is(top(HERO, 'walk', 'right', 1, 'side'), 'walk');
});

test('a top-down sprite still does something in a side-view scene', () => {
  is(side(FULL, 'walk', -1, 'top-down'), 'walk_side', true);
  is(side(FULL, 'walk', 1, 'top-down'), 'walk_side');
  is(side(FULL, 'hurt', -1, 'top-down'), 'hurt');
  is(side(['idle_down', 'walk_down'], 'walk', -1, 'top-down'), 'walk_down');
});

test('lookupClip finds one named action, for the extra-move buttons', () => {
  is(lookupClip(['idle_down', 'cast_down', 'cast_side'], 'cast', { mode: 'top', dir: 'left', view: 'top-down' }), 'cast_side', true);
  is(lookupClip(['idle', 'roar'], 'roar', { mode: 'side', facing: -1, view: 'side' }), 'roar', true);
  assert.equal(lookupClip(['idle'], 'roar', {}), null);
});

test('what a thing rests on: idle, else its preview clip, else the clip for its kind', () => {
  assert.equal(restClip(['spin', 'collect'], 'spin'), 'spin');                 // the Coin has no idle
  assert.equal(restClip(['idle', 'collect'], 'collect'), 'idle');
  assert.equal(restClip(['closed', 'open'], 'closed'), 'closed');
  assert.equal(restClip(['fly', 'hit'], 'hit', 'projectile'), 'fly');
  assert.equal(restClip(['burst', 'loop'], 'burst', 'effect'), 'loop');
  assert.equal(restClip(['burst'], 'burst', 'effect'), 'burst');
  assert.equal(restClip(['idle_down', 'walk_down'], 'walk_down'), 'idle_down');
  assert.equal(restClip(['a', 'b'], 'nope'), 'a');
});

test('moves that no key reaches are offered as buttons, one for each action', () => {
  assert.deepEqual(extraActions(HERO, 'side'), []);
  assert.deepEqual(extraActions([...HERO, 'victory', 'cast', 'talk'], 'side'), ['victory', 'cast', 'talk']);
  assert.deepEqual(extraActions([...HERO, 'block', 'dodge'], 'side'), [], 'block and dodge have keys');
  assert.deepEqual(extraActions(FULL, 'top'), []);
  assert.deepEqual(extraActions([...FULL, 'cast_down', 'cast_up', 'cast_side', 'victory'], 'top'), ['cast', 'victory']);
  assert.deepEqual(extraActions(['idle', 'walk', 'attack', 'slam', 'roar', 'hurt', 'die'], 'side'), ['slam', 'roar']);
});

test('a prop steps through its clips in file order and goes round to the first', () => {
  const walk = (names) => { const out = [names[0]]; for (let i = 0; i < names.length; i++) out.push(nextInOrder(names, out.at(-1))); return out; };
  assert.deepEqual(walk(['off', 'pull', 'on']), ['off', 'pull', 'on', 'off']);
  assert.deepEqual(walk(['closed', 'open', 'empty']), ['closed', 'open', 'empty', 'closed']);
  assert.deepEqual(walk(['idle', 'hurt', 'break']), ['idle', 'hurt', 'break', 'idle']);
  assert.equal(nextInOrder(['only'], 'only'), 'only');
});

test('how fast a clip carries a sprite across the ground', () => {
  assert.equal(clipSpeed('walk', {}, {}), 26);
  assert.equal(clipSpeed('walk_side', {}, {}), 26);
  assert.equal(clipSpeed('run', {}, {}), 62);
  assert.equal(clipSpeed('hop', {}, {}), 20);
  assert.equal(clipSpeed('idle', {}, {}), 0);
  assert.equal(clipSpeed('walk', { travel: 40 }, {}), 40);
  assert.ok(clipSpeed('walk', {}, { speed: 1 }) > clipSpeed('walk', {}, { speed: 0 }));
  assert.ok(STATES.action.includes('shoot'));
});
