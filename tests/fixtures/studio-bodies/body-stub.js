// A stub library body, for tests only (studio item F2; tests/unit/studio-bodies-stub.test.mjs). It is what a builder
// writes for a new body: ONE module exporting a descriptor made by engine/library-body.js defineLibraryBody(), and one
// line `export * from '../rigs/body-<name>.js';` in engine/library-bodies.js. It is NOT in that list: the test adds the
// line to a copy, which proves that nothing else has to change. A round blob, 32 by 32 (or 48 by 48), that bobs and
// squashes on its keys, with a hat that can be switched off and a head and feet to attach things to.
import { defineLibraryBody, FIGURE_FIELD as F, libraryFrame, applySettings, nudgeSurface } from '../../../engine/library-body.js';
import { blendKeys } from '../../../rigs/keypose.js';
import { ramp, INK } from '../../../engine/color.js';

/** Where the blob stands and how big it is at one frame: the figure at the settings, the blended key, the frame's edits. */
function placeOf(def, o) {
  const at = libraryFrame(def, o);
  if (!at) return null;
  const k = blendKeys(at.clip.keys ?? [], at.t, { loop: at.clip.loop !== false }) ?? {};
  const fig = applySettings(def, o.p, STUB_BODY);
  const [w, h] = def.size, [px, py] = def.pivot;
  const r = Math.max(2, (w / 4) * (fig.look?.size ?? 1)), squash = Math.min(1, Math.max(0, k.squash ?? 0));
  const ry = r * (1 - 0.3 * squash);
  return { at, k, fig, w, h, cx: px, cy: py - ry + (k.bob ?? 0), r, ry };
}

/** The stub body: a blob, two frame sizes, a hat part, three key fields, two poses. */
export const STUB_BODY = defineLibraryBody({
  id: 'creature:stub',
  label: 'Stub blob',
  view: 'side',
  sizes: [[32, 32], [48, 48]],
  pivots: { '32x32': [16, 30] },
  figure: {
    mood: F.word(['calm', 'cross']),
    moves: F.map('clip name', 'pose', ['idle', 'hop']),
    look: { colour: F.colour, eye: F.colour, size: F.number(0.5, 1.5) },
    hat: { colour: F.colour },
  },
  figureHelp: 'tests/fixtures/studio-bodies/body-stub.js describes its fields',
  blocks: ['look'],
  parts: ['hat'],
  partSockets: { hat: 'head' },
  sockets: ['head', 'feet'],
  keyFields: { bob: 'px', squash: 'share', blink: 'flag' },
  poses: ['idle', 'hop'],
  slots: { body: { label: 'Body', material: 'skin', swatches: ['#4f9d57', '#e6c545'] } },
  draw(g, def, o) {
    const s = placeOf(def, o);
    if (!s) return null;
    g.ellipse(s.cx, s.cy, s.r, s.ry, ramp(s.fig.look?.colour ?? '#888888'));
    if (!s.k.blink) g.dot(s.cx + s.r / 2, s.cy - s.ry / 3, s.fig.look?.eye ?? INK);
    if (s.fig.hat) g.rect(s.cx - s.r / 2, s.cy - s.ry - 3, s.r, 3, ramp(s.fig.hat.colour ?? '#c9423a'));
    g.outline(INK);
    if (s.at.flash) g.tint('#ffffff');
    nudgeSurface(g, s.at.nudge);
    return s;
  },
  socketsAt(def, o) {
    const s = placeOf(def, o);
    if (!s) return null;
    const [dx, dy] = s.at.nudge;
    return { head: { x: s.cx + dx, y: s.cy - s.ry + dy, angle: 0 }, feet: { x: def.pivot[0] + dx, y: def.pivot[1] + dy, angle: 0 } };
  },
});
