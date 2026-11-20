// PORT (migration batch C2): the drawing of sprites/ember-wyrm.js, word for word (its frame function, render() and
// sockets()), on the four-legged rig's copy (engine/gen/ports/c2/quadruped.js). What the code sprite said besides its
// drawing is in sprites/ember-wyrm.json; this is what beast.quadruped@1 (engine/gen/creatures.js) runs on a paint-ref
// grid. Pure; Node and browser.
import { PALETTE } from '../e2/palettes.js';
import * as Q from './quadruped.js';

const P = PALETTE.hearthvale;

/** One frame of the wyrm: the rig's pose with the chosen neck, spines, wings, horns and tail. */
const wyrmFrame = (clip, t, p) => Q.frame(clip, t, p, {
  neck: p.length, spines: p.spines,
  wings: { kind: p.wings, span: p.wingSpan }, horns: { kind: p.horns, length: p.hornLength }, tail: { kind: p.tail, length: p.tailLength },
});

/** The wyrm's attach points for one frame (the code sprite's sockets()): head, back, tail, feet, muzzle. Arguments: clip, t, p. */
export const sockets = (clip, t, p) => wyrmFrame(clip, t, p).sockets();

/** The code sprite's render(), word for word. Arguments: g (a paint-ref grid), { clip, t, p }. */
export function render(g, { clip, t, p }) {
  const F = wyrmFrame(clip, t, p);
  const look = { body: p.body, accent: p.accent, glow: p.glow, bone: P.cream, core: P.thunder, smoke: P.cobble };
  F.draw(g, look);
  F.finish(g, look);
}
