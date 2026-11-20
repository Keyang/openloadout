// PORT (migration batch P4): the drawing of the code sprite sprites/checkpoint-banner.js (its constants, helpers and render), word for
// word, with its imports pointed at the port shims (engine/gen/ports/colour.js) and at the ported engine helpers
// (engine/gen/ports/p4/, engine/gen/ports/e2/), so it draws paint refs on an engine/gen/port-surface.js grid. It is the
// drawing of the generator flag.checkpoint@1 (engine/gen/world-p4.js), which sprites/checkpoint-banner.json names; it goes only with the last
// version that draws with it. Its settings (p) are that generator's arguments; its colours are the paint refs the data
// file names. A HAND CHANGE note says where it differs from its source (the frozen copy
// tests/fixtures/code-sprites/checkpoint-banner.js); never change what a released generator version draws through it.
// Checkpoint banner: a flag on a pole. `down` is the flag hanging limp and dull at the foot of
// the pole; `raise` runs it up the pole, where it snaps open with a white flash; `up` is the
// flag flying, in folds that travel along the cloth (engine/cloth.js). The emblem is printed on
// the flat cloth and rides the folds.
import { lerp, keys } from '../../../motion.js';
import { ramp, tone, mix, INK } from '../colour.js';   // HAND CHANGE (P4): brightness has no paint-ref form (emblem)
import { colourOf } from '../../pixels.js';
import { rectIn } from './surface.js';
import { PALETTE, swatches } from '../e2/palettes.js';
import { flag } from './cloth.js';
import { markIn } from '../e2/marks.js';
import { twinkle } from '../e2/fx.js';

const P = PALETTE.thornwood;
const W = 32, H = 64, GROUND = 61;        // the lowest body row; its outline lands on the pivot row
const POLE = 8, HOIST = 10;               // the pole's left column; the column the cloth starts in
const CLOTH = { banner: [17, 14], pennant: [19, 14], swallowtail: [18, 14] };   // length and height of each cut

function layout(p) {
  const tall = Math.round(lerp(36, 56, p.height)), top = GROUND + 1 - tall;   // the top of the finial, or of the bare pole
  const [len, fh] = CLOTH[p.shape];
  const poleTop = top + (p.finial ? 4 : 0);
  return { top, poleTop, len, fh, upY: poleTop + 2, downY: GROUND - 6 - fh };
}

// The pole on its stone foot, with or without the ball on top.
function pole(g, p, L) {
  const wood = ramp(p.wood), stone = ramp(P.stone);
  g.rect(POLE, L.poleTop, 2, GROUND - 3 - L.poleTop, wood, { shade: 0 });
  g.rect(POLE, L.poleTop, 1, GROUND - 3 - L.poleTop, wood.dark);              // its shaded side; the lit side meets the cloth
  g.blob([rectIn(POLE - 3, GROUND - 2, 8, 3), rectIn(POLE - 2, GROUND - 4, 6, 2)], stone, { shade: 1, light: 1 });
  if (p.finial) g.ellipse(POLE + 1, L.top + 2.5, 2.5, 2.5, ramp(P.gold), { light: 1 });
}

// The emblem as a print on the flat cloth, in a colour that shows on this cloth.
function emblem(p, L, y) {
  if (p.emblem === 'none') return [];
  // HAND CHANGE (P4): the code read both colours' brightness and, when they were within 0.2, toned the emblem 1.3 steps
  // away from the cloth; brightness has no paint-ref form, so this is the `apart` colour rule (engine/data-rules.js):
  // the same colour while it is 0.2 or more from the cloth, else toned away from it in steps of 0.15 until it is.
  const c = { rule: 'apart', of: colourOf(p.emblemColour), from: [[colourOf(p.cloth), 0.2]], least: 0.2 };
  const cx = HOIST + (p.shape === 'pennant' ? 5 : p.shape === 'swallowtail' ? 6 : 8);
  // HAND CHANGE (P4): the rule is an object, which flag() would read as a ramp, so it goes in as one flat ramp (what flag() made of the code's colour)
  return [{ inside: markIn(p.emblem, cx, y + (L.fh >> 1), 7), paint: { light: c, base: c, dark: c } }];
}

// The flag hanging limp against the pole, its top at row y: a drape with one drooping corner.
function limp(g, p, L, y, bright) {
  const c = mix(mix(p.cloth, P.slate, 0.5), p.cloth, bright), cloth = ramp(c), h = L.fh + 1;
  g.poly([[HOIST, y], [HOIST + 6, y + 1], [HOIST + 7, y + h - 5], [HOIST + 4, y + h + 2], [HOIST, y + h - 1]], cloth, { shade: 1, light: 1 });
  g.rect(HOIST + 2, y + 3, 1, h - 5, cloth.dark).rect(HOIST + 4, y + 5, 1, h - 6, cloth.dark);   // the folds it hangs in
  g.rect(HOIST, y + 2, 2, 1, cloth.dark).rect(HOIST, y + h - 4, 2, 1, cloth.dark);                // where it is tied to the pole
}

/** The old sprite's render: draws one frame of clip `clip` at phase t (frame `frame`) with settings p on the grid g. */
export function render(g, { clip, t, frame, p }) {
  const L = layout(p);
  const amp = lerp(1.2, 3.4, p.sway);
  const fly = (phase, len, paint, marks) => flag(g, { x: HOIST, y: L.upY, length: len, height: L.fh, shape: p.shape, t: phase, amp, paint, marks });

  pole(g, p, L);
  if (clip === 'down') { limp(g, p, L, L.downY, 0); g.outline(INK); return; }
  if (clip === 'up') { fly(t, L.len, ramp(p.cloth), emblem(p, L, L.upY)); g.outline(INK); return; }

  // raise: frames 0 to 4 it runs up the pole, 5 it snaps open white, 6 it settles, 7 is the first frame of `up`
  if (frame <= 4) {
    const k = keys(frame / 4, [[0, 0], [0.25, 0.12], [1, 1]]);
    limp(g, p, L, Math.round(lerp(L.downY, L.upY, k)), frame >= 3 ? 1 : 0);   // dull at the foot, its own colour once it is up in the light
    g.outline(INK);
    return;
  }
  const snap = frame === 5;
  const f = fly((frame - 7) / 8, Math.min(L.len + (snap ? 1 : 0), W - 2 - HOIST), snap ? '#ffffff' : ramp(p.cloth), snap ? [] : emblem(p, L, L.upY));
  g.outline(INK);
  if (frame === 7) return;
  // the flash: sparkles round the cloth as it cracks open
  const lit = tone(p.cloth, 1.2);
  const [ex, ey] = f.at(1, 0.5);
  twinkle(g, Math.min(ex + 2, W - 4), ey, snap ? 2 : 1, lit);
  twinkle(g, HOIST + 6, L.upY - 5 + (snap ? 0 : -1), snap ? 1 : 0, lit);
  twinkle(g, HOIST + 9, L.upY + L.fh + 5 + (snap ? 0 : 1), snap ? 1 : 0, lit);
}
