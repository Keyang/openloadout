// engine/surface.js as migration batch P4's ported helpers see it (the buildings, trees, stall, fire, flag and pool
// props): engine/gen/ports/e2/surface.js (the paint-ref grid under the name Surface, the site's pure shape tests, cropped
// and masked) plus the two copy helpers the P4 props use, despeckle and lean, made on the same paint table
// (PortSurface.blank) so the copy keeps its paints. Pure; Node and browser.
export { Surface, ellipseIn, polyIn, rectIn, capsuleIn, cropped, masked } from '../e2/surface.js';

/** engine/surface.js despeckle on a paint-ref grid: a copy of src without the groups of fewer than `min` touching pixels (default 4). Arguments: src, min. */
export function despeckle(src, min = 4) {
  // HAND CHANGE (P4): `new Surface(src.w, src.h)` is src.blank(), so the copy shares src's paint table
  const out = src.blank(src.w, src.h);
  out.shadow = src.shadow;
  const { w, h, data } = src, seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !data[start]) continue;
    const group = [start];
    seen[start] = 1;
    for (let k = 0; k < group.length; k++) {
      const i = group[k], x = i % w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || seen[j] || !data[j]) continue;
        seen[j] = 1;
        group.push(j);
      }
    }
    if (group.length >= min) for (const i of group) out.data[i] = data[i];
  }
  return out;
}

/** engine/surface.js lean on a paint-ref grid: a copy of src with each row moved sideways by round((py - (y + 0.5)) * slope) whole pixels, so it leans from row py. Arguments: src, py, slope. */
export function lean(src, py, slope) {
  // HAND CHANGE (P4): `new Surface(src.w, src.h)` is src.blank(), so the copy shares src's paint table
  const out = src.blank(src.w, src.h);
  out.shadow = src.shadow;
  for (let y = 0; y < src.h; y++) {
    const dx = Math.round((py - (y + 0.5)) * slope);
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x - dx, y);
      if (c) out.data[y * src.w + x] = c;
    }
  }
  return out;
}
