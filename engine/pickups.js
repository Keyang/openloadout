// Pickup helpers: what every collectable shares, so that coins, gems, hearts, keys and cells of
// every kit float, pop and burst the same way (docs/style-guide.md section 4, "Pickup"). The two
// standard clips, where the thing is in each frame of them, the burst of sparkles a collected thing
// leaves, the glints that make it catch the eye, and two things pickups are often made of: a cut gem
// and a corked bottle with liquid in it. Shapes come from shapes.js, sparkles from fx.js.
//
// A pickup is data (sprites/gem.json, sprites/coin.json); the pickup generators and ports in engine/gen/ draw with these
// (engine/gen/props-p5.js calls glint; engine/gen/ports/pickups.js holds copies of the rest). No sprite file imports this module.
// The order a pickup is drawn in, for the code that draws one (pickupClips() gives the clips: idle 8 (loop), collect 8):
//     const at = pickupPose(clip, t, { bob, pop, cy: 17, up: ry + 1 });   // where it is this frame
//     if (at.show) {
//       const gem = drawGem(g, 16, at.y, rx * at.sx, ry * at.sy, body, { cut });
//       glint(g, gem, { x: 16, y: at.y, r: rx, phase: lerp(-1.6, 1.6, t) });             // before the outline: it is on the body
//       if (at.flash) g.tint('#ffffff');
//       g.outline(INK);
//     }
//     if (clip === 'idle') gleam(g, 16 + rx, at.y - ry, t, '#ffffff');                    // after the outline: it is light
//     collectBurst(g, { burst: at.burst, x: 16, y: at.y, r: rx, colour: body, sparkle });
//
// The collect clip, frame by frame (8 frames, t = frame / 7): 0 rest, 1 dip and squash (the sound starts
// here), 2 to 3 stretch and rise, 4 at the top, a little bigger and all white, 5 half size among sparkles,
// 6 sparkles only, 7 three pixels that are always left, whatever the settings.







/**
 * A slanted bright band that slides across a shape: the glint on a coin, a gem or a blade. Draw it before the outline.
 * Arguments: g (the Surface); test (shape test the band is kept inside); o: { x, y (centre of the shape), r (half its size), phase (-1.6 off one side, 0 across the middle, 1.6 off the other), slant (how much it leans, default 0.5; 0 is upright), width (half its width as a share of r, default 0.15), colour (default white) }.
 */
export function glint(g, test, { x, y, r, phase = 0, slant = 0.5, width = 0.15, colour = '#ffffff' }) {
  const band = (px, py) => Math.abs((px - x) / r + (slant * (py - y)) / r - phase) < width && test(px, py);
  g.fill(x - r - 2, y - r - 2, x + r + 2, y + r + 2, band, colour);
}
