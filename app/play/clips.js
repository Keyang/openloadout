// Playground: which clip plays. Clips are chosen by name, and the names are the ones
// docs/style-guide.md fixes (sections 4 and 5). A sprite works in the playground when it uses them.
//
// THE NAMES THE PLAYGROUND UNDERSTANDS
//
//   Characters and creatures
//     idle                    standing still (a thing with no idle rests on its preview clip)
//     walk · run              moving; Shift runs. A thing that hops or flies instead: hop · fly
//     jump                    side view only. One-shot: it is spread over the jump (rising = first half, falling = second)
//     attack · shoot · cast   the action key (X): the first of these the sprite has. The hit lands on the frame of the
//                             clip's first sound (or the middle frame). A projectile in the bag leaves from the sprite's
//                             `muzzle` socket, else `hand`
//     block                   the C key: nothing can hurt the player while it plays
//     dodge                   the V key: a quick dash, and nothing can hurt the player while it plays
//     hurt                    when hit (frame 0 is the white recoil)
//     die                     an enemy hit enough times plays it, holds its last frame, then is removed; the player plays
//                             it when its health runs out, then starts again
//     talk                    a townsperson plays it while the player stands next to it
//     victory, and any other one-verb clip (slam, roar, ...)
//                             the player: one button each under the scene. An enemy: used as other attacks
//
//   Top-down direction clips (section 5): <action>_down, <action>_up, <action>_side (faces right; mirrored for left).
//     Looked up in this order: <action>_<direction>, <action>_down, <action>, idle_down.
//     A clip with no direction in a top-down sprite is drawn facing down and is used as it is for every direction.
//
//   Pickups       idle (or the preview clip) · collect
//   Props         rest on idle (else the preview clip). Each time the player uses the action next to one it plays
//                 the next clip in file order, and after the last goes back to the first (closed, open, empty ·
//                 off, pull, on · idle, hurt, break). A one-shot clip holds its last frame; when the clip after
//                 it is a moving loop (a torch that has caught light) it carries on into it by itself
//   Projectiles   fly · hit (on impact)
//   Effects       loop (plays all the time) · burst (plays where the player's hit lands, and by itself with a pause)
//   Interface     normal · hover · pressed (shown under the pointer) · frame + fill (a bar: filled to the player's health)
//                 <name>-full · <name>-empty (glyphs: one for each point of health) · any other clips: all shown
//
// Pure JavaScript: no DOM.

/** The clip names tried for each state, best first (section 4 names only). */
export const STATES = {
  idle: ['idle'],
  walk: ['walk', 'hop', 'fly', 'run'],
  run: ['run', 'walk', 'hop', 'fly'],
  jump: ['jump', 'hop', 'fly'],
  action: ['attack', 'shoot', 'cast'],
  block: ['block'],
  dodge: ['dodge'],
  hurt: ['hurt'],
  die: ['die'],
  talk: ['talk'],
  collect: ['collect'],
  hit: ['hit'],
  break: ['break'],
};
export const DIRS = ['down', 'up', 'left', 'right'];
const DIRECTED = /_(down|up|side)$/;
/** States the player reaches with a key or by what happens to it; every other action gets a button. */
const PLAYER_STATES = ['idle', 'walk', 'run', 'jump', 'action', 'block', 'dodge', 'hurt', 'die'];

/**
 * The clip for one named action.
 *   mode 'top': dir down | up | left | right. Order: action_direction (left = action_side mirrored), action_down, action.
 *   mode 'side': facing 1 or -1. Order: action, action_side, action_down.
 *   view: the sprite's own view. A plain clip of a side-view sprite faces right and is mirrored to face left;
 *     a plain clip of a top-down sprite faces the camera and is never mirrored.
 * Returns { clip, flip, hold: false } or null.
 */
export function lookupClip(names, action, { mode = 'side', dir = 'right', facing = 1, view = null } = {}) {
  const found = (clip, flip) => ({ clip, flip: !!flip, hold: false });
  const topDownSprite = view === 'top-down' || (view !== 'side' && names.some((n) => DIRECTED.test(n)));
  const plainFlip = !topDownSprite && facing < 0;
  if (mode === 'top') {
    const suffix = dir === 'left' || dir === 'right' ? 'side' : dir;
    if (names.includes(`${action}_${suffix}`)) return found(`${action}_${suffix}`, dir === 'left');
    if (names.includes(`${action}_down`)) return found(`${action}_down`, false);
    if (names.includes(action)) return found(action, plainFlip);
    return null;
  }
  if (names.includes(action)) return found(action, plainFlip);
  if (names.includes(`${action}_side`)) return found(`${action}_side`, facing < 0);
  if (names.includes(`${action}_down`)) return found(`${action}_down`, false);
  return null;
}

/**
 * The clip for a state (a key of STATES). idle, walk, run and jump always return a clip (they fall back to idle,
 * then idle_down, then the preview clip, then the first clip); the other states return null when the sprite has
 * nothing for them.
 */
export function pickClip(names, state, ctx = {}) {
  for (const action of STATES[state] ?? []) {
    const r = lookupClip(names, action, ctx);
    if (r) return r;
  }
  if (!['idle', 'walk', 'run', 'jump'].includes(state)) return null;
  const idle = lookupClip(names, 'idle', ctx);
  if (idle) return idle;
  if (names.includes('idle_down')) return { clip: 'idle_down', flip: false, hold: false };
  return { clip: names.includes(ctx.preview) ? ctx.preview : names[0], flip: false, hold: false };
}

/**
 * The clip a thing rests on: idle (idle_down for a top-down sprite), else its preview clip
 * (`stripClip` in its catalogue row), else the first clip. A projectile rests on fly, an effect on loop, then burst.
 */
export function restClip(names, preview, role = null) {
  const first = (...wanted) => wanted.find((n) => names.includes(n));
  if (role === 'projectile') return first('fly', 'idle', preview) ?? names[0];
  if (role === 'effect') return first('loop', 'burst', 'idle', preview) ?? names[0];
  return first('idle', 'idle_down', preview) ?? names[0];
}

/** The action of a clip name: walk_side -> walk. */
export const actionOf = (name) => name.replace(DIRECTED, '');

/** Actions of the player that no key reaches (victory, talk, a second attack, a boss move): one button each. */
export function extraActions(names, mode = 'side') {
  const used = new Set();
  for (const state of PLAYER_STATES) {
    for (const dir of DIRS) for (const facing of [1, -1]) {
      const r = pickClip(names, state, { mode, dir, facing });
      if (r && STATES[state].includes(actionOf(r.clip))) used.add(actionOf(r.clip));
    }
  }
  const out = [];
  for (const n of names) { const a = actionOf(n); if (!used.has(a) && !out.includes(a)) out.push(a); }
  return out;
}

/** The clip a prop plays after `current` when the player uses the action next to it: the next in file order, round to the first. */
export function nextInOrder(names, current) {
  return names[(names.indexOf(current) + 1) % names.length];
}

/**
 * How fast a clip carries its sprite across the ground, in pixels a second, so feet do not slide.
 * A clip may say so itself (`travel`); otherwise it is read from the clip's name. The sprite's own
 * Speed control (0..1), when it has one, scales it the same way it scales the clip's frame rate.
 */
export function clipSpeed(name, info = {}, params = {}) {
  const k = typeof params.speed === 'number' ? 0.65 + 0.8 * params.speed : 1;
  if (info.travel !== undefined) return (typeof info.travel === 'function' ? info.travel(params) : info.travel) * k;
  const action = actionOf(name);
  if (action === 'run' || action === 'dodge') return 62 * k;
  if (action === 'walk') return 26 * k;
  if (action === 'hop' || action === 'fly') return 20 * k;
  return 0;
}
