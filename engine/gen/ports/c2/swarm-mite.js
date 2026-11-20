// PORT (migration batch C2): the drawing of sprites/swarm-mite.js, word for word (its frame function and render()),
// on the hive bug rig's copy (engine/gen/ports/c2/hive-bug.js). What the code sprite said besides its drawing is in
// sprites/swarm-mite.json; this is what bug.mite@1 (engine/gen/creatures.js) runs on a paint-ref grid. Pure; Node and
// browser.
import { PALETTE } from '../e2/palettes.js';
import * as B from './hive-bug.js';

const D = PALETTE.derelict;

/** One frame of the mite: the rig's pose with the chosen legs, body and eyes. */
const miteFrame = (clip, t, p) => B.mite(clip, t, p, { legs: p.legs, shape: p.shape, eyes: p.eyes });

/** The code sprite's render(), word for word. Arguments: g (a paint-ref grid), { clip, t, p }. */
export function render(g, { clip, t, p }) {
  const F = miteFrame(clip, t, p);
  const look = { body: p.body, glow: p.glow, bone: D.cream };
  F.draw(g, look);
  F.finish(g, look);
}
