// PORT (migration batch C2): the drawing of sprites/hive-mother.js, word for word (its frame function, render() and
// sockets()), on the brood queen rig's copy (engine/gen/ports/c2/brood-queen.js). What the code sprite said besides its
// drawing is in sprites/hive-mother.json; this is what bug.queen@1 (engine/gen/creatures.js) runs on a paint-ref grid.
// Pure; Node and browser.
import { PALETTE } from '../e2/palettes.js';
import * as Q from './brood-queen.js';

const D = PALETTE.derelict;

/** One frame of the hive mother: the rig's pose with the chosen legs, egg sacs, horns and wings. */
const motherFrame = (clip, t, p) => Q.frame(clip, t, p, {
  legs: p.legs, sacs: p.pieces,
  horns: { kind: p.horns, length: p.hornLength }, wings: { kind: p.wings, span: p.wingSpan },
});

/** The hive mother's attach points for one frame (the code sprite's sockets()): head, back, feet, muzzle, spawn1 to spawn3. Arguments: clip, t, p. */
export const sockets = (clip, t, p) => motherFrame(clip, t, p).sockets();

/** The code sprite's render(), word for word. Arguments: g (a paint-ref grid), { clip, t, p }. */
export function render(g, { clip, t, p }) {
  const F = motherFrame(clip, t, p);
  const look = { body: p.body, accent: p.accent, glow: p.glow, bone: D.cream, core: D.cream, dust: D.steel };
  F.draw(g, look);
  F.finish(g, look);
}
