// PORT (migration batch C2): the clip names and standard clip table of rigs/topdown.js, copied word for word (the
// three exports engine/gen/ports/c2/creature-topdown.js takes from it; the rest of that rig draws people and is not
// copied). It stays when rigs/topdown.js goes and goes only with the last generator version that draws with it.
// Pure; Node and browser.

/** The three drawn directions, in clip order; the game mirrors `side` (which faces right) for left. */
export const DIRECTIONS = ['down', 'up', 'side'];

/** The frames, frames per second at Speed 0.5, and looping of every standard action (style guide, section 4). */
export const STANDARD = {
  idle: { frames: 8, fps: 7, loop: true },
  walk: { frames: 8, fps: 10, loop: true },
  run: { frames: 8, fps: 14, loop: true },
  attack: { frames: 8, fps: 13, loop: false },
  shoot: { frames: 6, fps: 14, loop: false },
  cast: { frames: 8, fps: 10, loop: false },
  block: { frames: 6, fps: 10, loop: false },
  dodge: { frames: 8, fps: 14, loop: false },
  talk: { frames: 8, fps: 7, loop: true },
  hurt: { frames: 4, fps: 9, loop: false },
  die: { frames: 8, fps: 10, loop: false },
};

/** Splits a clip name into { action, direction }: 'walk_side' gives walk and side; a name with no direction ('hurt') is drawn facing down. */
export function parseClip(name) {
  const m = /^(.+)_(down|up|side)$/.exec(name);
  return m ? { action: m[1], direction: m[2] } : { action: name, direction: 'down' };
}
