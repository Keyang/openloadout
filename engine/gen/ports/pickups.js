// PORT (migration batch M9): a copy of engine/pickups.js with its imports pointed at the port shims, so it draws paint
// refs on engine/gen/port-surface.js grids (engine/gen/ports/colour.js, surface.js). It is the drawing code of the M9
// port generators (engine/gen/ui-inputs.js, ui-hud.js, ui-bubbles.js, text.js), so it is NOT temporary: it stays when
// engine/pickups.js goes (removal items R1 to R4 delete the engine original once its last code caller is gone) and goes
// only with the last generator version that draws with it (review M9 round 2, issue 6). A TRIMMED or HAND CHANGE note
// below says where it differs from its source; never change what a released generator version draws through it.
// Pickup helpers: what every collectable shares, so that coins, gems, hearts, keys and cells of
// every kit float, pop and burst the same way (docs/style-guide.md section 4, "Pickup"). The two
// standard clips, where the thing is in each frame of them, the burst of sparkles a collected thing
// leaves, the glints that make it catch the eye, and two things pickups are often made of: a cut gem
// and a corked bottle with liquid in it. Shapes come from shapes.js, sparkles from fx.js.
//
//   import { pickupClips, pickupPose, collectBurst, glint, gleam, drawGem } from '../engine/pickups.js';
//   clips: pickupClips(),                                              // idle 8 (loop), collect 8
//   render(g, { clip, t, p }) {
//     const at = pickupPose(clip, t, { bob: p.bob, pop: p.pop, cy: 17, up: ry + 1 });   // where it is this frame
//     if (at.show) {
//       const gem = drawGem(g, 16, at.y, rx * at.sx, ry * at.sy, p.body, { cut: p.shape });
//       glint(g, gem, { x: 16, y: at.y, r: rx, phase: lerp(-1.6, 1.6, t) });             // before the outline: it is on the body
//       if (at.flash) g.tint('#ffffff');
//       g.outline(INK);
//     }
//     if (clip === 'idle') gleam(g, 16 + rx, at.y - ry, t, '#ffffff');                    // after the outline: it is light
//     collectBurst(g, { burst: at.burst, x: 16, y: at.y, r: rx, colour: p.body, sparkle: p.sparkle });
//   }
//
// The collect clip, frame by frame (8 frames, t = frame / 7): 0 rest, 1 dip and squash (the sound starts
// here), 2 to 3 stretch and rise, 4 at the top, a little bigger and all white, 5 half size among sparkles,
// 6 sparkles only, 7 three pixels that are always left, whatever the settings.
// TRIMMED (review M9 round 1, issue 3): the declarations and imports no M9 port reaches are left out, so the copy holds
// only what draws; what is kept is word for word as before.

import { ramp, mix } from './colour.js';
import { polyIn } from './surface.js';
import { insetIn, gemIn, gemFacets } from '../../shapes.js';
export function drawGem(g, cx, cy, rx, ry, colour, { cut = 'diamond', facets = true } = {}) {
  const R = ramp(colour), stone = gemIn(cx, cy, rx, ry, cut);
  const box = [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1];
  g.fill(...box, stone, R, { shade: Math.min(rx, ry) >= 6 ? 2 : 1, light: 1 });
  if (!facets) {
    // a polished stone: one bright window towards the light, with a white spot in it
    const wx = cx + 0.24 * rx, wy = cy - 0.3 * ry, keep = insetIn(stone, 1);
    g.fill(...box, gemIn(wx, wy, rx * 0.48, ry * 0.48, cut), R.light, { clip: keep });
    g.fill(...box, gemIn(wx + 0.14 * rx, wy - 0.12 * ry, Math.max(1, rx * 0.2), Math.max(1, ry * 0.2), 'round'), '#ffffff', { clip: keep });
  } else {
    const tones = { 2: mix(R.light, '#ffffff', 0.55), 1: R.light, 0: R.base, [-1]: R.dark };
    for (const f of gemFacets(cx, cy, rx, ry, cut)) g.fill(...box, polyIn(f.pts), tones[f.tone] ?? R.base, { clip: stone });
  }
  return stone;
}

/**
 * Draw a corked glass bottle h pixels tall with liquid in it, centred on (cx, cy); returns { body, inner, wet } as shape tests (the glass, its cavity, the liquid).
 * Arguments: g (the Surface); cx, cy (centre; an odd h needs cy ending in .5); h (height with the cork, whole pixels); o: { shape (one of BOTTLE_SHAPES in shapes.js), glass, liquid, cork (colours), level (0 nearly empty to 1 full), tilt (slope of the liquid's surface, pixels down per pixel to the right), bubbles (how many rise through the liquid), t (loop phase for the bubbles), sx, sy (squash, default 1), shine (false: no highlight on the glass) }. Call g.outline afterwards.
 */