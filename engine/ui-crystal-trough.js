// The crystal skin's styles inside the ends of a bar's trough (added with batch K26, bundles/specs/core-sprites-3.md).
// moreSkinMarks (engine/ui-skins-more.js) draws a crystal style's icicles, frost ferns and shards on the face just
// inside a piece's band; a flat bar housing (skinBarHousing of engine/ui-skins.js) has no such face: its band lies
// between two ink lines (the outline and the ring round the trough), so the styles would not show on the empty bar.
// This draws them in the trough instead, in the first and last `zone` columns of the opening only (outside the
// stretched middle), so the empty bar shows its style and a full fill strip, which fits the opening, covers them.
//
//   const o = skinBarHousing(g, 1, 1, 62, 14, 'flat', look);
//   moreSkinMarks(g, body, 'crystal', p.style, { piece: 'housing', ..., skip: [o] });
//   crystalTroughMarks(g, o, p.style, { frame: p.frame, accent: p.accent });
//
//   ice    icicles hanging from the trough's top row (2, up to 4 and 1 px long), their tips white
//   rime   frost creeping in from each end: a diagonal stem from the top and the bottom corner, tipped in `accent`,
//          and a crust of the band's dark facet up the end wall between them
//   shard  three upright crystal shards standing on the trough's bottom row, dark, lit and dark, the tallest tipped white
// Both ends are drawn alike (the right end mirrors the left's positions), in the tones of moreSkinTones('crystal').

import { col } from './color.js';
import { MORE_SKIN_STYLES, moreSkinTones } from './ui-skins-more.js';

/**
 * Draws a crystal style (ice icicles, rime frost, upright shards) inside the two ends of a bar's trough, `zone` columns deep, leaving the middle alone: returns the number of pixels painted.
 * Arguments: g; opening ({ x, y, w, h }: the trough, as skinBarOpening gives it); style (ice, rime or shard); opt { frame, accent, state (normal, hover, pressed, disabled), zone (columns at each end, default 3) }.
 */
export function crystalTroughMarks(g, opening, style, { frame, accent, state = 'normal', zone = 3 } = {}) {
  if (!MORE_SKIN_STYLES.crystal.includes(style)) throw new Error(`crystalTroughMarks: style "${style}" is not one of ${MORE_SKIN_STYLES.crystal.join(', ')}`);
  const T = moreSkinTones('crystal', { frame, accent, style, state });
  const { x, y, w, h } = opening, z = Math.max(1, Math.min(zone, w >> 1));
  if (w < 2 || h < 2) return 0;
  const marks = [];   // [u (column from the end wall), v (row from the top), colour]
  if (style === 'ice') {
    const lens = [2, Math.max(1, Math.min(4, h - 2)), 1];
    for (let u = 0; u < z && u < lens.length; u++) for (let v = 0; v < lens[u]; v++) marks.push([u, v, v === lens[u] - 1 ? T.white : T.facetLight]);
  } else if (style === 'rime') {
    const n = Math.min(z, h >> 1);
    for (let i = 0; i < n; i++) {
      const c = i === n - 1 ? T.accent : T.facetLight;
      marks.push([i, i, c], [i, h - 1 - i, c]);
    }
    for (let v = 1; v < h - 1; v++) if (v >= n || v < h - n) marks.push([0, v, T.facetDark]);
  } else {
    const hts = [Math.max(1, h - 2), Math.max(1, h - 1), Math.max(1, Math.ceil(h / 3))];
    for (let u = 0; u < z && u < hts.length; u++) for (let i = 0; i < hts[u]; i++) {
      const top = i === hts[u] - 1;
      marks.push([u, h - 1 - i, top && u === 1 ? T.white : u === 1 ? T.facetLight : T.facetDark]);
    }
  }
  const seen = new Set();
  let n = 0;
  for (const [u, v, c] of marks) for (const px of [x + u, x + w - 1 - u]) {
    const py = y + v, k = py * g.w + px;
    if (seen.has(k) || px < 0 || py < 0 || px >= g.w || py >= g.h) continue;
    seen.add(k);
    const cc = col(c);
    if (g.data[k] !== cc) { g.data[k] = cc; n++; }
  }
  return n;
}
