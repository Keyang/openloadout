// Icon badges (batch K18, bundles/specs/core-sprites-2.md, icons-map "badge" style): a small picture set
// on a disc of a bigger icon, such as the plate in a map pin's head (iconPin of engine/icons-more.js), a
// medal or a coin face. The picture is any icon shape, drawn with a pen of its own centred on the disc and
// scaled to fit inside it, and outlined with its own ink line so it stays apart from the disc it lies on.
// iconBadgePin is a pin whose head is mostly plate, for pictures that must read at 1x.
// It works with the pen of engine/icons.js and leaves engine/icons.js and engine/icons-more.js as they are.
// Pure drawing: Node and browser.
//
//   iconFit(g, { size: p.size, tilt: false, angle: 0, shade: false, shine: p.shine }, (s, pen) => {
//     const { plate } = iconBadgePin(s, pen, { colour: p.body, face: p.face });  // or iconPin(..., { plate })
//     iconTidy(s).outline(INK);                                                  // the pin's own line first
//     iconBadge(s, pen, plate, (u, inner) => iconFlag(u, inner, { cloth: p.body, pole: p.accent }));
//   });
//
// Other makers add functions here: APPEND at the end.

import { Surface, ellipseIn, polyIn } from './surface.js';
import { INK } from './color.js';
import { iconPen, iconBold, iconTidy, iconPaint, iconOver } from './icons.js';

/**
 * A small picture set on a disc of an icon (a map pin's plate, a medal's face), drawn with its own pen centred on the disc and scaled so its longer side fills a share of it, outlined in ink and never outside the disc.
 * Arguments: g: the Surface; pen: the icon's pen (a bold pen makes the picture bold too); disc { x, y, r } in the pen's local units (iconPin returns it as `plate`);
 * draw(surface, pen): paints the picture's bodies, written like any icon shape about 23 units along its longer side; options { fill (share of the disc's diameter, default 0.86), margin (px kept clear inside the disc's edge, default 1), ink (default the ink colour) }.
 * Returns { pen (the picture's pen), side (its longer side in px, ink included) }.
 */
export function iconBadge(g, pen, disc, draw, o = {}) {
  const { fill = 0.86, margin = 1, ink = INK } = o;
  if (!disc || !(disc.r > 0)) throw new Error('iconBadge: needs a disc { x, y, r } with r above 0');
  if (typeof draw !== 'function') throw new Error('iconBadge: needs a draw(surface, pen) function');
  const [cx, cy] = pen.pt(disc.x, disc.y), R = Math.max(1, disc.r * pen.k - margin), hole = ellipseIn(cx, cy, R, R);
  // the picture's pen: upright, its middle on the disc's middle, scaled so 23 units fill the share asked for
  const make = (scale) => {
    const p = iconPen({ tilt: false, angle: 0, shade: pen.shade, shine: pen.shine, cx, cy, scale, span: [1, 1] });
    return pen.bold ? iconBold(p, pen.bold) : p;
  };
  const want = 2 * R * fill;
  let scale = want / 23, best = null;
  for (let pass = 0; pass < 8; pass++) {
    const s = new Surface(g.w, g.h);
    s.shadow = g.shadow;
    const inner = make(scale);
    draw(s, inner);
    iconTidy(s).outline(ink);
    const b = s.bounds();
    if (!b) return { pen: inner, side: 0 };
    const side = Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
    // every drawn pixel must lie on the disc; the biggest picture that does is kept
    let inside = true;
    for (let y = b.y0; y <= b.y1 && inside; y++) for (let x = b.x0; x <= b.x1; x++) if (s.data[y * s.w + x] && !hole(x + 0.5, y + 0.5)) { inside = false; break; }
    if (inside && (!best || side > best.side)) best = { s, side, pen: inner };
    if (inside && side >= want - 0.5) break;
    scale *= inside ? Math.min(1.25, (want + 0.5) / side) : 0.88;
  }
  if (!best) {
    // nothing fitted: the smallest try, cut to the disc, so the badge is never empty
    const s = new Surface(g.w, g.h), inner = make(scale);
    s.shadow = g.shadow;
    draw(s, inner);
    iconTidy(s).outline(ink);
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (!hole(x + 0.5, y + 0.5)) s.data[y * s.w + x] = 0;
    const b = s.bounds();
    best = { s, side: b ? Math.max(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) : 0, pen: inner };
  }
  for (let i = 0; i < g.data.length; i++) if (best.s.data[i]) g.data[i] = best.s.data[i];
  return { pen: best.pen, side: best.side };
}

/**
 * A badge pin standing on its point: a big round head of a marker colour round a plate of a second colour, on a short point, so a picture set on the plate with iconBadge still reads at 1x (iconPin's plate is about half as wide).
 * Arguments: g: the Surface; pen: from iconPen; options { colour (the pin), face (the plate), ring (width of the pin's ring round the plate in local units, default 1.8) }.
 * Returns { plate: { x, y, r } }: the plate's centre and radius in local units, for iconBadge.
 */
export function iconBadgePin(g, pen, o = {}) {
  const { colour, face, ring = 1.8 } = o;
  if (!colour || !face) throw new Error('iconBadgePin: needs colour and face colours');
  const head = { x: 0, y: -2.6, r: 9 }, plate = { x: head.x, y: head.y, r: Math.max(2, head.r - ring) };
  iconPaint(g, pen, [ellipseIn(head.x, head.y, head.r, head.r), polyIn([[-5.2, 4.2], [5.2, 4.2], [0, 11.5]])], colour, { soft: 0 });
  iconOver(g, pen, ellipseIn(plate.x, plate.y, plate.r, plate.r), face, { flat: true });
  return { plate };
}
