// PORT (migration batch C2): the drawing of sprites/crawler-bug.js, word for word (its frame function, render() and
// sockets()), on the hive bug rig's copy (engine/gen/ports/c2/hive-bug.js). What the code sprite said besides its
// drawing (name, controls, clips, sounds) is in sprites/crawler-bug.json; this is what bug.crawler@1
// (engine/gen/creatures.js) runs on a paint-ref grid, its settings p the generator's arguments and its colours the
// paint refs the data file names. Pure; Node and browser.
import { PALETTE } from '../e2/palettes.js';
import * as B from './hive-bug.js';

const D = PALETTE.derelict;

/** One frame of the crawler: the rig's pose with the chosen length, spikes, horns and tail. */
const crawlerFrame = (clip, t, p) => B.crawler(clip, t, p, {
  length: p.length, spikes: p.spikes,
  horns: { kind: p.horns, length: p.hornLength }, tail: { kind: p.tail, length: p.tailLength },
});

/** The crawler's attach points for one frame (the code sprite's sockets()): head, tail, back, feet. Arguments: clip, t, p. */
export const sockets = (clip, t, p) => crawlerFrame(clip, t, p).sockets();

/** The code sprite's render(), word for word. Arguments: g (a paint-ref grid), { clip, t, p }. */
export function render(g, { clip, t, p }) {
  const F = crawlerFrame(clip, t, p);
  const look = { body: p.body, accent: p.accent, glow: p.glow, bone: D.cream };
  F.draw(g, look);
  F.finish(g, look);
}
