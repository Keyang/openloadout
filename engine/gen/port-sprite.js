// Port generators for whole interface pictures (migration batch M9). Not a family module and registers nothing itself:
// the family modules (engine/gen/ui-inputs.js ...) call portGenerator once per picture they port.
//
// A port generator draws one library picture exactly as its code sprite did: the old drawing runs on an
// engine/gen/port-surface.js grid the size of the old frame, in the old frame's pixels, with paint refs where it had
// colours (the paint arguments), and the grid comes back as stamps moved so the old frame's `origin` is at `at`. Its
// arguments are the old sprite's settings, typed (a slider a share or a px range, a choice a word, a toggle a flag, a
// colour a paint), plus `at` and `picture`: which of the old clips it draws (a data file names it once per clip, with
// that clip's `clip` list; not `state`, which the panel layout fills with a button's state). The frame within the clip is ctx.frame, and the phase the old code read is worked out from
// it as engine/sprite.js renderFrame worked it out (frame / frames in a loop, frame / (frames - 1) in a one-shot), so a
// loop always closes. Pure: no randomness, no clock, no site Surface; Node and browser.
import { defineGenerator } from './registry.js';
import { point, word } from './args.js';
import { PortSurface, withPaintTable, portTiles, shiftTo } from './port-surface.js';
import { workCost } from './pixels.js';

/** The phase engine/sprite.js renderFrame gives a frame: frame / frames in a loop, frame / (frames - 1) in a one-shot (0 for one frame). Arguments: frame, frames, loop. */
export function portPhase(frame, frames, loop) {
  const f = Number.isInteger(frame) && frame >= 0 ? frame : 0, n = Number.isInteger(frames) && frames > 0 ? frames : 1;
  if (loop === false) return n > 1 ? Math.min(1, f / (n - 1)) : 0;
  return (f % n) / n;
}

const MEASURES = {};
/** How many measures each port generator keeps, by its arguments (the panel layout asks on every frame). */
const MEASURE_KEPT = 64;

/** The slice and text area (Contract 8) and attach points (Contract 3) of every port generator that has them, so far: "<id>@<v>" -> (args, ctx) -> { slice?, textArea?, points? } in the call's pixels (engine/gen/port-measures.js freezes the whole set for the panel layout). No arguments. */
export function portMeasures() { return { ...MEASURES }; }

/**
 * Declares and registers a port generator: { id, v, family, about, size [W, H] (the old frame), origin [x, y] (the old
 * frame's point that `at` names), states (the old clips, first the default, each { frames, loop }), args (the old
 * settings as argument types), work (shape tests a pixel, for the cost; default 64), draw(g, { clip, frame, frames, t,
 * loop, p }) (the old drawing on a PortSurface, p the arguments), measure(clip, p) (optional: the old slice and text
 * area of a clip in the old frame's pixels, { slice?, textArea? }), points(clip, p, t) (optional: the old sprite's
 * attach points in that clip at phase t, { id: { x, y, angle } } in the old frame's pixels, angle in radians: the old
 * sockets(); review M9 round 2, issue 2), units (optional: the measured work of its heaviest call, in cost units of about
 * 0.01 ms: tests/unit/gen-m9-safety.test.mjs holds every port's heaviest call to its cost) }.
 * Returns the frozen registry entry.
 */
export function portGenerator({ id, v = 1, family, about, size, origin, states, args, work = 64, units = 0, draw, measure, points }) {
  const [W, H] = size, names = Object.keys(states);
  const entry = defineGenerator({
    id, v, family, about,
    args: {
      at: point({ about: `Where the middle of its ${W} x ${H} picture goes (the old frame's point ${origin[0]}, ${origin[1]})` }),
      picture: word(names, { default: names[0], about: 'Which of its pictures it draws: the clip of the same name' }),
      ...args,
    },
    cost: () => portTiles(W, H) + Math.max(workCost(W * H * work), units),   // units: review M9 round 1, issue 5
    run(a, ctx) {
      const st = states[a.picture], frames = st.frames, loop = st.loop !== false;
      const frame = Number.isInteger(ctx.frame) ? Math.max(0, Math.min(frames - 1, ctx.frame)) : 0;
      return withPaintTable(() => {
        const g = new PortSurface(W, H);
        draw(g, { clip: a.picture, frame, frames, loop, t: portPhase(frame, frames, loop), p: a });
        return g.stamps(shiftTo(a.at, origin[0], origin[1]));
      });
    },
  });
  if (measure || points) {
    // the panel layout measures its piece on every frame; a measure is a pure function of the arguments (and, for the
    // points, the frame), so the last MEASURE_KEPT are kept (a copy is handed out each time: nothing a caller does to
    // it reaches the next caller)
    const kept = new Map();
    MEASURES[`${id}@${v}`] = (a, ctx = {}) => {
      const st = states[a.picture] ?? states[names[0]], frames = st.frames, loop = st.loop !== false;
      const frame = Number.isInteger(ctx?.frame) ? Math.max(0, Math.min(frames - 1, ctx.frame)) : 0;
      let key;
      try { key = JSON.stringify(a) + (points ? `|${frame}` : ''); } catch { key = null; }
      let m = key === null ? undefined : kept.get(key);
      if (m === undefined) {
        m = JSON.stringify(withPaintTable(() => {
          const shift = shiftTo(a.at, origin[0], origin[1]);
          const out = measure ? moveMeasure(measure(a.picture, a) ?? {}, shift) : {};
          const pts = points ? movePoints(points(a.picture, a, portPhase(frame, frames, loop)), shift) : null;
          return pts && Object.keys(pts).length ? { ...out, points: pts } : out;
        }));
        if (key !== null) { if (kept.size >= MEASURE_KEPT) kept.delete(kept.keys().next().value); kept.set(key, m); }
      }
      return JSON.parse(m);
    };
  }
  return entry;
}

/**
 * A measure { slice?, textArea? } (a text area one box or a list) moved by [dx, dy]; a slice's own rect moves, its
 * borders do not. A text area's `text` (the paint the old code said text is printed in) becomes its `colour`, the field
 * a data text area names it by. Arguments: m, [dx, dy].
 */
export function moveMeasure(m, [dx, dy]) {
  const box = (b) => {
    if (!(b && Number.isFinite(b.x))) return b;
    const { text, ...rest } = b;
    return { ...rest, x: b.x + dx, y: b.y + dy, ...(b.edge ? { edge: { ...b.edge, x: b.edge.x + dx, y: b.edge.y + dy } } : {}), ...(text !== undefined ? { colour: text } : {}) };
  };
  const out = {};
  if (m.slice) out.slice = m.slice.rect ? { ...m.slice, rect: box(m.slice.rect) } : { ...m.slice };
  if (m.textArea) out.textArea = Array.isArray(m.textArea) ? m.textArea.map(box) : box(m.textArea);
  return out;
}

/** Attach points { id: { x, y, angle } } moved by [dx, dy] (angles kept); anything that is not such a point is dropped. Arguments: pts, [dx, dy]. */
export function movePoints(pts, [dx, dy]) {
  const out = {};
  if (!pts || typeof pts !== 'object') return out;
  for (const [k, q] of Object.entries(pts)) {
    if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    out[k] = { x: q.x + dx, y: q.y + dy, angle: Number.isFinite(q.angle) ? q.angle : 0 };
  }
  return out;
}
