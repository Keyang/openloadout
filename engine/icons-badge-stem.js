// Badge pin with a point of any length (batch K18 fix round 1, bundles/specs/core-sprites-2.md, icons-map
// "badge" style): the big-headed pin of engine/icons-badge.js (iconBadgePin), whose point can be shortened.
// A small badge then gives up point, not head, so the picture set on its plate (iconBadge) keeps reading at
// 1x. With the default tip it draws exactly what iconBadgePin draws. Pure drawing: Node and browser.
//
//   iconFit(g, { size, tilt: false, angle: 0, shade: false, shine }, (s, pen) => {
//     const { plate } = iconBadgeStem(s, pen, { colour: p.body, face: p.face, tip: 9 });
//     iconTidy(s).outline(INK);
//     iconBadge(s, pen, plate, (u, inner) => iconFlag(u, inner, { cloth: p.body, pole: p.accent }));
//   });
//
// Other makers add functions here: APPEND at the end.

import { ellipseIn, polyIn } from './surface.js';
import { iconPaint, iconOver } from './icons.js';

/** Where iconBadgePin's point ends, in local units below the pen's middle: the longest point iconBadgeStem draws by default. */
export const BADGE_STEM_TIP = 11.5;

/**
 * A badge pin (a big round head of a marker colour round a plate of a second colour) on a point of any length, so a small pin can keep its head and shorten its point; the default tip matches iconBadgePin.
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the pin), face (the plate), ring (the pin's ring round the plate in local units, default 1.8), tip (where the point ends, local units below the middle, default BADGE_STEM_TIP; above 6.4, the head's bottom) }. Returns { plate: { x, y, r } } for iconBadge.
 */
export function iconBadgeStem(g, pen, o = {}) {
  const { colour, face, ring = 1.8, tip = BADGE_STEM_TIP } = o;
  if (!colour || !face) throw new Error('iconBadgeStem: needs colour and face colours');
  const head = { x: 0, y: -2.6, r: 9 }, plate = { x: head.x, y: head.y, r: Math.max(2, head.r - ring) };
  if (!(tip > head.y + head.r)) throw new Error(`iconBadgeStem: tip must lie below the head's bottom (${head.y + head.r}), got ${tip}`);
  iconPaint(g, pen, [ellipseIn(head.x, head.y, head.r, head.r), polyIn([[-5.2, 4.2], [5.2, 4.2], [0, tip]])], colour, { soft: 0 });
  iconOver(g, pen, ellipseIn(plate.x, plate.y, plate.r, plate.r), face, { flat: true });
  return { plate };
}
