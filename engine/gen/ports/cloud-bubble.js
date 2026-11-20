// PORT (migration batch M9): a copy of engine/cloud-bubble.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/cloud-bubble.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// A thought cloud with round lobes and a trail of separate puffs (added with batch K23, bundles/specs/core-sprites-3.md).
// thoughtBubble (engine/bubbles.js) draws the cloud style's edge bumps as circles that end in a 1 px tip (star points at
// 1x) and its trail as three puffs that touch each other and the cloud (one stick at 1x). thoughtCloud draws the same
// bubble, by the same rules (1 px ink, the band, a flat face; everything not flat in the corner zones; the 2 px drop
// shadow down and to the left), with every lobe's top row at least 3 px wide and the puffs spaced so that each puff,
// its shadow included, is its own island: at least 1 px of background between neighbours and between the trail and
// the cloud. cloudPieces takes it apart for an opening clip; cloudSparkles marks a dream cloud's top corners.
//
//   const t = thoughtCloud(g, 1, 1, 94, 46, { style: 'cloud', trail: 'down-left', face, frame, shadow: true });
//   textArea: (clip, p) => ({ ...t.inner, text: INK, edge: t.edge })        // slice: plus the frame's 1 px
//   const k = cloudPieces(96, 48, 1, 1, 94, 46, opt);                      // k.cloud, k.cloudBox, k.puffs (smallest first)
//   if (style === 'dream') cloudSparkles(g, t.body, accent, box);
// TRIMMED (review M9 round 1, issue 3): the declarations and imports no M9 port reaches are left out, so the copy holds
// only what draws; what is kept is word for word as before.
/** The thought cloud styles: cloud (two round lobes per corner), puff (one big lobe per corner), dream (as cloud; its sparkles are cloudSparkles). No arguments: a frozen list. */
export const CLOUD_STYLES = Object.freeze(['cloud', 'puff', 'dream']);
/** The directions a thought cloud's trail of puffs can run, each in a corner zone: down-left, down-right, up-left, up-right. No arguments: a frozen list. */
export const CLOUD_TRAILS = Object.freeze(['down-left', 'down-right', 'up-left', 'up-right']);

export function cloudSparkles(g, body, accent, box) {
  const B = body, R = B.x + B.w - 1;
  for (const [cx, cy] of [[B.x - 3, B.y - 2], [R + 2, B.y - 2]]) for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const px = cx + dx, py = cy + dy;
    if (px >= box.x && py >= box.y && px < box.x + box.w && py < box.y + box.h && !g.get(px, py)) g.dot(px, py, accent);
  }
}
